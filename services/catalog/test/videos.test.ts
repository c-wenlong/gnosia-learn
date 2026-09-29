import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  asset,
  assetDerivation,
  assetJob,
  blobObject,
  contentRevision,
  job,
  learner,
  preference,
  studioAgentPreference,
  video,
} from "@self-learn/schema";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { runImportCommand } from "../src/commands/index-command";
import { runClaim, runEnqueue, runFinish, runShow, type BriefDocument } from "../src/commands/job";
import { runPreferenceGet } from "../src/commands/preference";
import { openBlobStore } from "../src/content/blob";
import {
  checkoutVideo,
  listVideos,
  putVideo,
  showVideo,
  sourceHash,
  VideoError,
  videoAssetIds,
  type PutVideoInput,
} from "../src/content/videos";
import { applyMigrations } from "../src/migrations";
import { LOCAL_LEARNER_ID, ownerScope } from "@self-learn/schema";
import { manimkcStandIn, seedWithManimkc } from "./manimkc-standin";
import { createScratchDatabase, probe, type Scratch } from "./scratch-database";

/**
 * Studio videos in the catalog (docs/STUDIO-VIDEOS.md, phase 1's catalog
 * half): the migration's kinds and table, `catalog video put --job` landing a
 * video and accepting its job in one transaction, its retry, its refusals, the
 * one-transaction discard and enqueue of a change (D52), the preference the
 * runner reads (D53), and a studio video surviving `catalog import --only
 * manimkc`, which prunes every `manimkc:` asset its report does not list.
 *
 * The database is the seed imported with a manimkc stand-in, so the topics,
 * concepts and a manimkc render are real rows. Everything on disk is under the
 * OS temp directory.
 */

const reachable = await probe();
const LOCAL = ownerScope(LOCAL_LEARNER_ID);
const TOPIC = "agent-tool-use-and-reasoning-loops";
const CONCEPT = "react-loop";

const sha = (bytes: string | Buffer) => createHash("sha256").update(bytes).digest("hex");

function briefOf(slug: string, over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    title: `How ${slug} works`,
    topic: TOPIC,
    slug,
    mode: "new",
    idea: "One idea.",
    audience: "familiar",
    targetSeconds: 60,
    voice: "af_heart",
    scenes: [{ name: "why", beats: [{ say: "A line.", show: "A picture.", labels: [] }] }],
    concepts: [CONCEPT],
    ...over,
  };
}

describe.skipIf(!reachable.ok)("studio videos in the catalog", () => {
  let scratch: Scratch;
  let work: string;
  let tree: string;
  const saved = {
    url: process.env["DATABASE_URL"],
    manimkc: process.env["MANIMKC_ROOT"],
    home: process.env["SELF_LEARN_HOME"],
  };
  let serial = 0;

  beforeAll(async () => {
    scratch = await createScratchDatabase();
    await applyMigrations(scratch.db);
    work = await mkdtemp(path.join(tmpdir(), "catalog-videos-"));
    tree = path.join(work, "tree");
    await seedWithManimkc(tree);
    const manimkc = path.join(work, "manimkc");
    await manimkcStandIn(manimkc, Buffer.from("a manimkc render"));
    process.env["DATABASE_URL"] = scratch.url;
    process.env["MANIMKC_ROOT"] = manimkc;
    process.env["SELF_LEARN_HOME"] = path.join(work, "home");
    await runImportCommand({ dir: tree });
    await scratch.db.insert(learner).values({ id: "other" }).onConflictDoNothing();
  }, 120_000);

  afterAll(async () => {
    for (const [key, value] of [
      ["DATABASE_URL", saved.url],
      ["MANIMKC_ROOT", saved.manimkc],
      ["SELF_LEARN_HOME", saved.home],
    ] as const) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    await scratch?.drop();
    if (work !== undefined) await rm(work, { recursive: true, force: true });
  });

  /** A video job for `slug`, claimed and finished, so it is awaiting review. */
  async function jobReady(slug: string, brief = briefOf(slug), extra: Partial<BriefDocument> = {}, discardParent?: string) {
    serial += 1;
    const id = `video-job-${serial}`;
    const enqueued = await runEnqueue({
      brief: { id, kind: "video", topic: TOPIC, target: `videos/${slug}.mp4`, idempotencyKey: id, brief, ...extra },
      ...(discardParent === undefined ? {} : { discardParent }),
    });
    await runClaim({ jobId: id, runner: "test" });
    await runFinish({ jobId: id, state: "awaiting_review" });
    return enqueued;
  }

  /** A candidate directory as the gate leaves it: the copies, `copies.json`, and `source/`. */
  async function candidate(slug: string, options: { narrated?: boolean; render?: string; scene?: string } = {}) {
    serial += 1;
    const dir = path.join(work, `candidate-${serial}`);
    await mkdir(path.join(dir, "source"), { recursive: true });
    const files: Record<string, string> = {
      [`${slug}.mp4`]: options.render ?? `the cut of ${slug}`,
      "poster.jpg": `a poster of ${options.render ?? slug}`,
    };
    if (options.narrated !== false) {
      files[`${slug}.transcript.json`] = JSON.stringify({ segments: [{ text: "A line." }] });
      files[`${slug}.chapters.json`] = JSON.stringify([{ title: "Why", start: 0 }]);
      files[`${slug}.vtt`] = "WEBVTT\n\n00:00.000 --> 00:02.000\nA line.\n";
    }
    const source: Record<string, string> = {
      [`source/${slug}.py`]: options.scene ?? `class S1_Why(VoiceScene):\n    pass\n`,
      "source/topic.yml": `topic: ${TOPIC}\n`,
    };
    const copies: Record<string, { sha256: string; bytes: number }> = {};
    for (const [name, body] of Object.entries({ ...files, ...source })) {
      await writeFile(path.join(dir, name), body);
      copies[name] = { sha256: sha(body), bytes: Buffer.byteLength(body) };
    }
    // Written by the runner beside the source; the catalog stores the job's brief, not this.
    await writeFile(path.join(dir, "source", "brief.json"), "{}");
    await writeFile(path.join(dir, "copies.json"), JSON.stringify({ files: copies, durationSeconds: 58.4 }));
    return dir;
  }

  const put = (over: Partial<PutVideoInput> & { slug: string; dir: string; jobId: string }) =>
    putVideo(scratch.db, openBlobStore(), {
      reason: "accepted in the studio",
      author: LOCAL_LEARNER_ID,
      authorKind: "person",
      ownerId: LOCAL_LEARNER_ID,
      ...over,
    });

  const jobState = async (id: string) => (await scratch.db.select().from(job).where(eq(job.id, id)))[0]?.state;
  const revisionCount = async () =>
    Number((await scratch.db.execute<{ n: string }>(sql`select count(*) as n from content_revision`)).rows[0]?.n);

  it("migrates: the video kinds, the table, and its guards armed", async () => {
    const { rows } = await scratch.db.execute<{ trigger: string; enabled: string }>(sql`
      select t.tgname as trigger, t.tgenabled as enabled from pg_trigger t
      join pg_class c on c.oid = t.tgrelid where c.relname = 'video' and not t.tgisinternal order by 1`);
    expect(rows).toEqual([
      { trigger: "video_copy_guard", enabled: "O" },
      { trigger: "video_write_guard", enabled: "O" },
    ]);
    // Outside the seam, the table refuses a write.
    await expect(
      scratch.db.execute(
        sql`insert into video (slug, topic_slug, source, source_hash) values ('by-hand', ${TOPIC}, '{}', ${sha("x")})`,
      ),
    ).rejects.toThrow();
    await expect(
      scratch.db.execute(sql`insert into draft (id, kind, planner_session_id, transcript_path) values ('d-video', 'video', 's', 't')`),
    ).resolves.toBeDefined();
  });

  it("enqueues a video job on videos/<slug>.mp4, holding the brief to its columns", async () => {
    const done = await runEnqueue({
      brief: { kind: "video", topic: TOPIC, target: "videos/lease-one.mp4", idempotencyKey: "lease-one", brief: briefOf("lease-one") },
    });
    expect(done.job.candidatePath).toBe(`jobs/${done.job.id}/candidate/lease-one.mp4`);
    expect(done.discarded).toBeNull();
    await expect(
      runEnqueue({ brief: { kind: "video", topic: TOPIC, target: "learn/assets/x.tldr", idempotencyKey: "bad-target" } }),
    ).rejects.toThrow(/not a video target/);
    await expect(
      runEnqueue({
        brief: { kind: "video", topic: TOPIC, target: "videos/other-slug.mp4", idempotencyKey: "bad-slug", brief: briefOf("lease-one") },
      }),
    ).rejects.toThrow(/slug "lease-one" is not the target's/);
    // One job per slug at a time (V8).
    await expect(
      runEnqueue({ brief: { kind: "video", topic: TOPIC, target: "videos/lease-one.mp4", idempotencyKey: "lease-two" } }),
    ).rejects.toThrow(/already held by job/);
  });

  it("lands a narrated video and accepts its job in one transaction", async () => {
    const slug = "attention-weights";
    const { job: queued } = await jobReady(slug);
    const dir = await candidate(slug);
    const result = await put({ slug, dir, jobId: queued.id, base: null });

    expect(result).toMatchObject({ ok: true, slug, topic: TOPIC, concepts: [CONCEPT], narrated: true, retry: false, changed: true });
    expect(result.jobState).toBe("accepted");
    expect(await jobState(queued.id)).toBe("accepted");

    const ids = videoAssetIds(slug);
    const rows = await scratch.db.select().from(asset).where(sql`${asset.id} in (${sql.join(Object.values(ids).map((i) => sql`${i}`), sql`, `)})`);
    expect(rows.map((r) => [r.id, r.kind, r.sourceRepo]).sort()).toEqual(
      [
        [ids.poster, "poster", "self-learn"],
        [ids.video, "video", "self-learn"],
        [ids.captions, "captions", "self-learn"],
        [ids.chapters, "chapters", "self-learn"],
        [ids.transcript, "transcript", "self-learn"],
      ].sort(),
    );
    expect(rows.find((r) => r.id === ids.video)?.path).toBe(`videos/${slug}.mp4`);
    for (const row of rows) {
      const [blob] = await scratch.db.select().from(blobObject).where(eq(blobObject.key, row.blobKey ?? ""));
      expect(blob?.state).toBe("present");
      expect(await openBlobStore().stat(row.blobKey ?? "")).not.toBeNull();
    }
    const derived = await scratch.db.select().from(assetDerivation).where(eq(assetDerivation.sourceAssetId, ids.video));
    expect(derived.map((d) => d.assetId).sort()).toEqual([ids.poster, ids.captions, ids.chapters, ids.transcript].sort());
    const outputs = await scratch.db.select().from(assetJob).where(eq(assetJob.jobId, queued.id));
    expect(outputs).toHaveLength(5);

    const [row] = await scratch.db.select().from(video).where(eq(video.slug, slug));
    expect(row?.mp4BlobKey).toBe(rows.find((r) => r.id === ids.video)?.blobKey);
    expect(row?.renderedSourceHash).toBe(row?.sourceHash);
    expect(row?.durationSeconds).toBe(58.4);
    // The source is the scene files and the job's brief; the brief.json beside them is not stored.
    expect(Object.keys((row?.source as { files: object }).files).sort()).toEqual([`${slug}.py`, "topic.yml"]);
    expect((row?.source as { brief: { title: string } }).brief.title).toBe(`How ${slug} works`);
    expect(row?.sourceHash).toBe(result.sourceHash);
    expect(sourceHash(row?.source as never)).toBe(row?.sourceHash);

    const revisions = await scratch.db.select().from(contentRevision).where(eq(contentRevision.jobId, queued.id));
    expect(revisions.map((r) => r.entityType).sort()).toEqual(["asset", "asset", "asset", "asset", "asset", "video"]);

    // `job show` names what the accept landed.
    const shown = await runShow(queued.id);
    expect(shown.outputs.map((o) => o.assetId).sort()).toEqual(Object.values(ids).sort());
    expect(shown.outputs.every((o) => o.current)).toBe(true);
  });

  it("returns what landed for a repeated put, and writes nothing", async () => {
    const slug = "retried-accept";
    const { job: queued } = await jobReady(slug);
    const dir = await candidate(slug);
    const first = await put({ slug, dir, jobId: queued.id, base: null });
    const before = await revisionCount();
    const again = await put({ slug, dir, jobId: queued.id, base: null });
    expect(again).toMatchObject({ retry: true, changed: false, revision: first.revision, sourceHash: first.sourceHash });
    expect(again.assets.map((a) => a.key)).toEqual(first.assets.map((a) => a.key));
    expect(await revisionCount()).toBe(before);

    // Anything else under the accepted job is refused by name.
    const other = await candidate(slug, { render: "a different cut" });
    await expect(put({ slug, dir: other, jobId: queued.id })).rejects.toThrow(/is accepted, and what it landed is not this/);
    expect(await revisionCount()).toBe(before);
  });

  it("refuses another owner's job, and a job for another slug", async () => {
    const slug = "not-yours";
    await scratch.db.insert(job).values({
      id: "other-owners-job",
      kind: "video",
      state: "awaiting_review",
      topicSlug: TOPIC,
      targetPath: `videos/${slug}.mp4`,
      idempotencyKey: "other-owners-job",
      brief: briefOf(slug),
      requestedAt: new Date(Date.now() - 60_000),
      startedAt: new Date(),
      runner: "test",
      ownerId: "other",
    });
    const dir = await candidate(slug);
    await expect(put({ slug, dir, jobId: "other-owners-job" })).rejects.toThrow(/no job "other-owners-job"/);
    expect(await jobState("other-owners-job")).toBe("awaiting_review");

    const { job: mine } = await jobReady("mine-only");
    await expect(put({ slug, dir, jobId: mine.id })).rejects.toThrow(/targets videos\/mine-only\.mp4/);
    expect((await scratch.db.select().from(video).where(eq(video.slug, slug))).length).toBe(0);
  });

  it("stores nothing when a file is not the gate's copy, or is a link", async () => {
    const slug = "tampered-cut";
    const { job: queued } = await jobReady(slug);
    const dir = await candidate(slug);
    await writeFile(path.join(dir, `${slug}.mp4`), "rewritten after the gate");
    await expect(put({ slug, dir, jobId: queued.id })).rejects.toMatchObject({ code: "mismatch" });

    const linked = await candidate(slug);
    await rm(path.join(linked, "poster.jpg"));
    await symlink(path.join(tree, "content", "topics.yaml"), path.join(linked, "poster.jpg"));
    await expect(put({ slug, dir: linked, jobId: queued.id })).rejects.toThrow(/not a regular file/);

    expect(await jobState(queued.id)).toBe("awaiting_review");
    expect((await scratch.db.select().from(video).where(eq(video.slug, slug))).length).toBe(0);
  });

  it("rolls the rows and the accept back together when the write is refused", async () => {
    const slug = "stale-base";
    const { job: queued } = await jobReady(slug);
    const dir = await candidate(slug);
    const before = await revisionCount();
    // A base the video never had: the seam refuses, and the accept goes with it.
    const refused = put({ slug, dir, jobId: queued.id, base: 1 });
    await expect(refused).rejects.toBeInstanceOf(VideoError);
    await expect(refused).rejects.toMatchObject({ code: "stale-base" });
    expect(await jobState(queued.id)).toBe("awaiting_review");
    expect(await revisionCount()).toBe(before);
    expect((await scratch.db.select().from(asset).where(eq(asset.id, videoAssetIds(slug).video))).length).toBe(0);
    expect((await scratch.db.select().from(assetJob).where(eq(assetJob.jobId, queued.id))).length).toBe(0);
    // The retry with the right base lands.
    expect((await put({ slug, dir, jobId: queued.id, base: null })).jobState).toBe("accepted");
  });

  it("discards a video in review and enqueues its change in one transaction (D52)", async () => {
    const slug = "changed-in-review";
    const { job: parent } = await jobReady(slug);

    // Without the flag, the parent holds the slug.
    await expect(
      runEnqueue({
        brief: { kind: "video", topic: TOPIC, target: `videos/${slug}.mp4`, idempotencyKey: "change-1", parentJob: parent.id },
      }),
    ).rejects.toThrow(/already held by job/);
    // A refused insert leaves the parent in review.
    await expect(
      runEnqueue({
        brief: {
          kind: "video",
          topic: "no-such-topic",
          target: `videos/${slug}.mp4`,
          idempotencyKey: "change-2",
          parentJob: parent.id,
        },
        discardParent: parent.id,
      }),
    ).rejects.toThrow(/no topic "no-such-topic"/);
    expect(await jobState(parent.id)).toBe("awaiting_review");
    // The flag must name the brief's parent.
    await expect(
      runEnqueue({
        brief: { kind: "video", topic: TOPIC, target: `videos/${slug}.mp4`, idempotencyKey: "change-3", parentJob: parent.id },
        discardParent: "some-other-job",
      }),
    ).rejects.toThrow(/must be the brief's "parentJob"/);

    const child = await runEnqueue({
      brief: {
        kind: "video",
        topic: TOPIC,
        target: `videos/${slug}.mp4`,
        idempotencyKey: "change-4",
        parentJob: parent.id,
        brief: briefOf(slug, { mode: "change" }),
      },
      discardParent: parent.id,
    });
    expect(child.discarded).toEqual({ id: parent.id, from: "awaiting_review", to: "discarded" });
    expect(child.job.state).toBe("queued");
    expect(await jobState(parent.id)).toBe("discarded");

    // A retry of the same submit is the job already made, and discards nothing again.
    const retry = await runEnqueue({
      brief: { kind: "video", topic: TOPIC, target: `videos/${slug}.mp4`, idempotencyKey: "change-4", parentJob: parent.id },
      discardParent: parent.id,
    });
    expect(retry).toMatchObject({ created: false, discarded: null });
    expect(retry.job.id).toBe(child.job.id);
  });

  it("changes an accepted video, silent now, dropping the old sidecars", async () => {
    const slug = "goes-silent";
    const { job: first } = await jobReady(slug);
    const landed = await put({ slug, dir: await candidate(slug), jobId: first.id, base: null });

    const { job: change } = await jobReady(slug, briefOf(slug, { mode: "change", voice: "none" }), { parentJob: first.id });
    const dir = await candidate(slug, { narrated: false, scene: "class S1_Why(Scene):\n    pass\n" });
    const result = await put({ slug, dir, jobId: change.id, base: landed.revision });
    expect(result).toMatchObject({ narrated: false, changed: true, jobState: "accepted" });
    const ids = videoAssetIds(slug);
    const left = await scratch.db.select({ id: asset.id }).from(asset).where(sql`starts_with(${asset.id}, ${`video:${slug}`})`);
    expect(left.map((r) => r.id)).toEqual([ids.video]);
    expect(result.notes.some((n) => n.includes("transcript.json deleted"))).toBe(true);
    // A put whose base moved is refused: another write landed since.
    const { job: late } = await jobReady(slug, briefOf(slug, { mode: "change" }), { parentJob: change.id });
    await expect(put({ slug, dir: await candidate(slug), jobId: late.id, base: landed.revision })).rejects.toMatchObject({
      code: "stale-base",
    });
  });

  it("shows, lists and checks out the owner's videos only", async () => {
    const shown = await showVideo(scratch.db, LOCAL, "attention-weights");
    expect(shown).toMatchObject({ origin: "studio", slug: "attention-weights", topic: TOPIC, narrated: true, concepts: [CONCEPT] });
    expect(shown?.files.map((f) => f.name)).toEqual(["attention-weights.py", "topic.yml"]);
    expect(shown?.poster?.assetId).toBe("poster:video:attention-weights");
    expect(await showVideo(scratch.db, ownerScope("other"), "attention-weights")).toBeNull();

    const listed = await listVideos(scratch.db, LOCAL);
    expect(listed.filter((v) => v.origin === "studio").map((v) => v.slug)).toContain("attention-weights");
    expect(listed.filter((v) => v.origin === "manimkc").map((v) => v.assetId)).toEqual(["manimkc:out/demo/one/one.mp4"]);
    expect((await listVideos(scratch.db, ownerScope("other"))).filter((v) => v.origin === "studio")).toEqual([]);

    const dir = path.join(work, "checkout");
    const out = await checkoutVideo(scratch.db, LOCAL, "attention-weights", dir);
    expect(out).toMatchObject({ exists: true, written: true, sourceHash: shown?.sourceHash });
    expect(await readFile(path.join(dir, "topic.yml"), "utf8")).toBe(`topic: ${TOPIC}\n`);
    expect((await checkoutVideo(scratch.db, LOCAL, "attention-weights", dir)).written).toBe(false);
    await writeFile(path.join(dir, "attention-weights.py"), "# an edit");
    await expect(checkoutVideo(scratch.db, LOCAL, "attention-weights", dir)).rejects.toMatchObject({ code: "dirty-checkout" });
    expect((await checkoutVideo(scratch.db, LOCAL, "attention-weights", dir, { force: true })).written).toBe(true);

    const theirs = await checkoutVideo(scratch.db, ownerScope("other"), "attention-weights", path.join(work, "theirs"));
    expect(theirs).toMatchObject({ exists: false, written: false, files: [] });
  });

  it("survives `catalog import --only manimkc`, which prunes only manimkc: assets", async () => {
    const before = await scratch.db.select({ id: asset.id }).from(asset).where(sql`starts_with(${asset.id}, 'video:')`);
    expect(before.length).toBeGreaterThan(0);
    await runImportCommand({ dir: tree, only: ["manimkc"] });
    const after = await scratch.db.select({ id: asset.id }).from(asset).where(sql`starts_with(${asset.id}, 'video:')`);
    expect(after.map((r) => r.id).sort()).toEqual(before.map((r) => r.id).sort());
    expect((await scratch.db.select().from(asset).where(eq(asset.id, "poster:video:attention-weights"))).length).toBe(1);
  });

  it("reads the studio agent preferences, the owner's own only", async () => {
    expect(await runPreferenceGet({ key: "studioVideoAgent" })).toMatchObject({ key: "studioVideoAgent", value: null, updatedAt: null });
    await scratch.db.insert(preference).values([
      { learnerId: LOCAL_LEARNER_ID, key: "studioVideoAgent", value: { model: "opus", effort: "high" } },
      { learnerId: "other", key: "studioDiagramAgent", value: { model: "sonnet", effort: "low" } },
    ]);
    const mine = await runPreferenceGet({ key: "studioVideoAgent" });
    expect(mine.value).toEqual({ model: "opus", effort: "high" });
    expect(studioAgentPreference(mine.value)).toEqual({ model: "opus", effort: "high" });
    expect((await runPreferenceGet({ key: "studioDiagramAgent" })).value).toBeNull();
    expect((await runPreferenceGet({ key: "studioDiagramAgent", owner: "other" })).value).toEqual({ model: "sonnet", effort: "low" });
    await expect(runPreferenceGet({ key: "theme" })).rejects.toThrow(/answers studioVideoAgent and studioDiagramAgent only/);
  });
});

describe("studioAgentPreference", () => {
  it("keeps what the CLI takes and reads anything else as the default", () => {
    expect(studioAgentPreference(null)).toEqual({ model: "default", effort: "default" });
    expect(studioAgentPreference({ model: "claude-fable-5-1[1m]", effort: "xhigh" })).toEqual({
      model: "claude-fable-5-1[1m]",
      effort: "xhigh",
    });
    expect(studioAgentPreference({ model: "--dangerously-skip-permissions", effort: "extreme" })).toEqual({
      model: "default",
      effort: "default",
    });
  });
});
