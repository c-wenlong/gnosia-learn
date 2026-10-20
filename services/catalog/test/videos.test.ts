import { createHash } from "node:crypto";
import { access, link, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
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
  isAgentModel,
  studioAgentPreference,
  video,
} from "@gnosia/schema";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { runImportCommand } from "../src/commands/index-command";
import { JobError, runClaim, runEnqueue, runFinish, runShow, type BriefDocument } from "../src/commands/job";
import { BlobIntegrityError } from "@gnosia/blob";
import { runPreferenceGet, runPreferenceSet } from "../src/commands/preference";
import { openBlobStore } from "../src/content/blob";
import { auditBlobs } from "../src/content/blob-audit";
import { lockEntity } from "../src/content/revisions";
import { addTopic, archiveTopic, renameTopic } from "../src/content/topics";
import { ContentWriteError, writeContents } from "../src/content/write";
import { connect, type CatalogDatabase } from "../src/db";
import {
  checkoutVideo,
  listVideos,
  putVideo,
  refusal,
  showVideo,
  sourceHash,
  VideoError,
  videoAssetIds,
  type PutVideoInput,
} from "../src/content/videos";
import { LOCAL_LEARNER_ID, ownerScope } from "@gnosia/schema";
import { manimkcStandIn, seedWithManimkc } from "./manimkc-standin";
import { migratedScratchDatabase, probe, type Scratch } from "./scratch-database";

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

/** Every message down an error's `cause` chain: drizzle wraps the driver's error as `Failed query: ...`. */
function causeText(error: unknown): string {
  const parts: string[] = [];
  for (let at: unknown = error; at instanceof Error; at = (at as Error & { cause?: unknown }).cause) parts.push(at.message);
  return parts.join(" | ");
}

interface HeldLock {
  /** The holder's backend, which `waitForBlocked` leaves out of its count. */
  pid: number;
  /** Commit the holder's transaction, and wait for it. */
  release: () => Promise<void>;
  /** Release (if nothing has) and close the holder's connection. Safe in a `finally`. */
  close: () => Promise<void>;
}

/**
 * Take a lock on a connection of its own and keep it until `release`,
 * resolving only once the lock is held. A race test starts its contenders
 * after this, so they queue behind the holder. Starting them while the
 * holder's transaction is still connecting lets a contender take the lock
 * first under load: it then commits before the other has even looked up the
 * idempotency key, and the test proves nothing about the race.
 */
async function holdLock(url: string, take: (tx: CatalogDatabase) => Promise<unknown>): Promise<HeldLock> {
  const holder = connect({ url, copyOk: true });
  let release!: () => void;
  const released = new Promise<void>((resolve) => (release = resolve));
  let holding!: (pid: number) => void;
  const held = new Promise<number>((resolve) => (holding = resolve));
  const done = holder.db.transaction(async (tx) => {
    const { rows } = await tx.execute<{ pid: number }>(sql`select pg_backend_pid() as pid`);
    await take(tx);
    holding(Number(rows[0]!.pid));
    await released;
  });
  try {
    const pid = await Promise.race([
      held,
      done.then(() => Promise.reject(new Error("the holder's transaction ended before it held its lock"))),
    ]);
    return {
      pid,
      release: async () => {
        release();
        await done;
      },
      // The pool cannot end while the transaction holds its client, so a test
      // that throws before releasing would otherwise hang until its timeout.
      close: async () => {
        release();
        await done.catch(() => undefined);
        await holder.close();
      },
    };
  } catch (error) {
    await holder.close();
    throw error;
  }
}

/**
 * Wait until `count` client sessions on the database, other than the lock's
 * holder, are blocked on a lock. Only the contenders a test started can be:
 * the holder holds, and nothing else runs against a scratch database.
 */
async function waitForBlocked(db: Scratch["db"], name: string, count: number, holder: HeldLock): Promise<void> {
  for (let i = 0; i < 400; i += 1) {
    const { rows } = await db.execute<{ n: string }>(
      sql`select count(*) as n from pg_stat_activity
          where datname = ${name} and backend_type = 'client backend' and pid <> ${holder.pid} and wait_event_type = 'Lock'`,
    );
    const blocked = Number(rows[0]?.n);
    if (blocked > count) throw new Error(`${blocked} sessions blocked, expected ${count}`);
    if (blocked === count) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`fewer than ${count} sessions ever blocked`);
}

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
    home: process.env["GNOSIA_HOME"],
  };
  let serial = 0;

  beforeAll(async () => {
    scratch = await migratedScratchDatabase();
    work = await mkdtemp(path.join(tmpdir(), "catalog-videos-"));
    tree = path.join(work, "tree");
    await seedWithManimkc(tree);
    const manimkc = path.join(work, "manimkc");
    await manimkcStandIn(manimkc, Buffer.from("a manimkc render"));
    process.env["DATABASE_URL"] = scratch.url;
    process.env["MANIMKC_ROOT"] = manimkc;
    process.env["GNOSIA_HOME"] = path.join(work, "home");
    await runImportCommand({ dir: tree });
    await scratch.db.insert(learner).values({ id: "other" }).onConflictDoNothing();
  }, 120_000);

  afterAll(async () => {
    for (const [key, value] of [
      ["DATABASE_URL", saved.url],
      ["MANIMKC_ROOT", saved.manimkc],
      ["GNOSIA_HOME", saved.home],
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
  async function candidate(slug: string, options: { narrated?: boolean; render?: string; scene?: string; source?: Record<string, string> } = {}) {
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
    const source: Record<string, string> = options.source ?? {
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
      // The suites' ffmpeg stand-in (vitest.setup.ts), as the command passes
      // `findFfmpeg()`'s: the put makes the video's PDF with it.
      ffmpeg: process.env.FFMPEG_PATH as string,
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
    ).rejects.toSatisfy((error) => causeText(error).includes("video is written only through the content write seam"));
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

  it("lands a revideokc video with its TypeScript and narration as the source, and checks it back out (D79)", async () => {
    const slug = "cache-in-depth";
    const files = {
      "source/scene.tsx": "export default defineTopic(function* () {});\n",
      "source/narration.json": '[{"scene":"CD1_Why","title":"Why","lines":["A line."]}]\n',
      "source/parts.ts": "export const depth = 3;\n",
      "source/topic.yml": `topic: ${TOPIC}\n`,
    };
    const { job: queued } = await jobReady(slug, briefOf(slug, { tool: "revideokc" }));
    const result = await put({ slug, dir: await candidate(slug, { source: files }), jobId: queued.id, base: null });
    expect(result).toMatchObject({ ok: true, slug, jobState: "accepted" });
    const [row] = await scratch.db.select().from(video).where(eq(video.slug, slug));
    expect(Object.keys((row?.source as { files: object }).files).sort()).toEqual(["narration.json", "parts.ts", "scene.tsx", "topic.yml"]);
    expect((row?.source as { brief: { tool?: string } }).brief.tool).toBe("revideokc");
    const out = path.join(work, "checkout-revideokc");
    const checked = await checkoutVideo(scratch.db, LOCAL, slug, out);
    expect(checked.files.map((f) => f.name).sort()).toEqual(["narration.json", "parts.ts", "scene.tsx", "topic.yml"]);
    expect(await readFile(path.join(out, "scene.tsx"), "utf8")).toBe(files["source/scene.tsx"]);
  });

  it("lands a remotionkc video with its composition and narration as the source, and refuses one without its composition (phase 3)", async () => {
    const slug = "chart-from-data";
    const files = {
      "source/composition.tsx": "export default defineTopic({ component: Video });\n",
      "source/narration.json": '[{"scene":"CF1_Why","title":"Why","lines":["A line."]}]\n',
      "source/series.ts": "export const SERIES = [1, 2, 3];\n",
      "source/topic.yml": `topic: ${TOPIC}\n`,
    };
    const { job: queued } = await jobReady(slug, briefOf(slug, { tool: "remotionkc" }));
    const result = await put({ slug, dir: await candidate(slug, { source: files }), jobId: queued.id, base: null });
    expect(result).toMatchObject({ ok: true, slug, jobState: "accepted" });
    const [row] = await scratch.db.select().from(video).where(eq(video.slug, slug));
    expect(Object.keys((row?.source as { files: object }).files).sort()).toEqual(["composition.tsx", "narration.json", "series.ts", "topic.yml"]);
    expect((row?.source as { brief: { tool?: string } }).brief.tool).toBe("remotionkc");
    const out = path.join(work, "checkout-remotionkc");
    const checked = await checkoutVideo(scratch.db, LOCAL, slug, out);
    expect(checked.files.map((f) => f.name).sort()).toEqual(["composition.tsx", "narration.json", "series.ts", "topic.yml"]);

    const sceneOnly = "scene-for-remotionkc";
    const { job: other } = await jobReady(sceneOnly, briefOf(sceneOnly, { tool: "remotionkc" }));
    const revideokcShaped = { "source/scene.tsx": "export default 1;\n", "source/narration.json": "[]\n", "source/topic.yml": `topic: ${TOPIC}\n` };
    await expect(put({ slug: sceneOnly, dir: await candidate(sceneOnly, { source: revideokcShaped }), jobId: other.id, base: null })).rejects.toMatchObject({
      message: expect.stringMatching(/needs topic\.yml and composition\.tsx and narration\.json for a remotionkc video/),
    });
  });

  it("holds each tool's source to its own files: a revideokc video needs its scene and narration, a manimkc one a .py", async () => {
    const revideokc = "no-scene-tsx";
    const { job: one } = await jobReady(revideokc, briefOf(revideokc, { tool: "revideokc" }));
    const pythonOnly = { "source/x.py": "class S1(VoiceScene): pass\n", "source/topic.yml": `topic: ${TOPIC}\n` };
    await expect(put({ slug: revideokc, dir: await candidate(revideokc, { source: pythonOnly }), jobId: one.id, base: null })).rejects.toMatchObject({
      message: expect.stringMatching(/needs topic\.yml and scene\.tsx and narration\.json for a revideokc video/),
    });
    const manimkc = "tsx-for-manimkc";
    const { job: two } = await jobReady(manimkc);
    const tsxOnly = { "source/scene.tsx": "export default 1;\n", "source/topic.yml": `topic: ${TOPIC}\n` };
    await expect(put({ slug: manimkc, dir: await candidate(manimkc, { source: tsxOnly }), jobId: two.id, base: null })).rejects.toMatchObject({
      message: expect.stringMatching(/at least one scene file \(\.py\) for a manimkc video/),
    });
    const unknown = "blender-video";
    const { job: three } = await jobReady(unknown, briefOf(unknown, { tool: "blender" }));
    await expect(put({ slug: unknown, dir: await candidate(unknown), jobId: three.id, base: null })).rejects.toMatchObject({
      message: expect.stringMatching(/video tool "blender"/),
    });
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
        [ids.poster, "poster", "gnosia"],
        [ids.pdf, "pdf", "gnosia"],
        [ids.video, "video", "gnosia"],
        [ids.captions, "captions", "gnosia"],
        [ids.chapters, "chapters", "gnosia"],
        [ids.transcript, "transcript", "gnosia"],
      ].sort(),
    );
    expect(rows.find((r) => r.id === ids.video)?.path).toBe(`videos/${slug}.mp4`);
    for (const row of rows) {
      const [blob] = await scratch.db.select().from(blobObject).where(eq(blobObject.key, row.blobKey ?? ""));
      expect(blob?.state).toBe("present");
      expect(await openBlobStore().stat(row.blobKey ?? "")).not.toBeNull();
    }
    const derived = await scratch.db.select().from(assetDerivation).where(eq(assetDerivation.sourceAssetId, ids.video));
    expect(derived.map((d) => d.assetId).sort()).toEqual([ids.poster, ids.pdf, ids.captions, ids.chapters, ids.transcript].sort());
    const outputs = await scratch.db.select().from(assetJob).where(eq(assetJob.jobId, queued.id));
    expect(outputs).toHaveLength(6);

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
    expect(revisions.map((r) => r.entityType).sort()).toEqual(["asset", "asset", "asset", "asset", "asset", "asset", "video"]);

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

  it("keeps a retry accepted when today's ffmpeg cannot rebuild the landed PDF", async () => {
    // The retry compares against the recorded outputs, not today's ability
    // to rebuild the optional PDF: the landing holds it, and the retry
    // answers with it.
    const slug = "retry-pdf-swing";
    const { job: queued } = await jobReady(slug);
    const dir = await candidate(slug);
    const landed = await put({ slug, dir, jobId: queued.id, base: null });
    expect(landed.assets.map((a) => a.id)).toContain(`pdf:video:${slug}`);

    const noFfmpeg = await put({ slug, dir, jobId: queued.id, base: null, ffmpeg: null });
    expect(noFfmpeg).toMatchObject({ retry: true, changed: false });
    const landedPdf = landed.assets.find((a) => a.id === `pdf:video:${slug}`);
    expect(noFfmpeg.assets.find((a) => a.id === `pdf:video:${slug}`)?.sha256).toBe(landedPdf?.sha256);
  });

  it("keeps a retry accepted when it can now make a PDF the landing predates", async () => {
    // And the reverse swing: ffmpeg absent for the landing, present for the
    // retry. The landing does not grow — the note says why the made PDF is
    // not attached, and a later put adds it.
    const slug = "retry-pdf-gain";
    const { job: queued } = await jobReady(slug);
    const dir = await candidate(slug);
    const landed = await put({ slug, dir, jobId: queued.id, base: null, ffmpeg: null });
    expect(landed.assets.map((a) => a.id)).not.toContain(`pdf:video:${slug}`);

    const again = await put({ slug, dir, jobId: queued.id, base: null });
    expect(again).toMatchObject({ retry: true, changed: false });
    expect(again.assets.map((a) => a.id)).not.toContain(`pdf:video:${slug}`);
    expect(again.notes.some((n) => n.includes("landing predates"))).toBe(true);
  });

  it("drops the earlier cut's PDF when a new put cannot make one", async () => {
    // A new cut without a new PDF: the earlier cut's document is deleted in
    // the same transaction rather than served for video bytes it is not of.
    const slug = "pdf-gone";
    const { job: first } = await jobReady(slug);
    const landed = await put({ slug, dir: await candidate(slug), jobId: first.id, base: null });
    expect(landed.assets.map((a) => a.id)).toContain(`pdf:video:${slug}`);

    const { job: change } = await jobReady(slug, briefOf(slug, { mode: "change" }), { parentJob: first.id });
    const dir = await candidate(slug, { render: "a new cut" });
    const result = await put({ slug, dir, jobId: change.id, base: landed.revision, ffmpeg: null });
    expect(result).toMatchObject({ jobState: "accepted" });
    expect(result.assets.map((a) => a.id)).not.toContain(`pdf:video:${slug}`);
    expect(result.notes.some((n) => n.startsWith("no PDF:"))).toBe(true);
    expect(result.notes.some((n) => n.includes(`pdf:video:${slug} deleted`))).toBe(true);
    expect((await scratch.db.select().from(asset).where(eq(asset.id, `pdf:video:${slug}`))).length).toBe(0);
  });

  it("lands the video when the owner's cap refuses only its PDF", async () => {
    // The PDF is optional: a cap that refuses its bytes is a note and a
    // doctor-listed gap, never a failed put for the video it accompanies.
    const slug = "cap-skips-pdf";
    const { job: first } = await jobReady(slug);
    const dir = await candidate(slug);
    const landed = await put({ slug, dir, jobId: first.id, base: null, ffmpeg: null });
    expect(landed.assets.map((a) => a.id)).not.toContain(`pdf:video:${slug}`);

    const { job: second } = await jobReady(slug, briefOf(slug, { mode: "change" }), { parentJob: first.id });
    // Every required blob is the same content-addressed bytes — already
    // stored, so the cap never sees them — and the PDF is the only new
    // object this put would store.
    const saved = process.env["GNOSIA_OWNER_UPLOADS_PER_DAY"];
    process.env["GNOSIA_OWNER_UPLOADS_PER_DAY"] = "0";
    try {
      const result = await put({ slug, dir, jobId: second.id, base: landed.revision });
      expect(result).toMatchObject({ jobState: "accepted" });
      expect(result.assets.map((a) => a.id)).not.toContain(`pdf:video:${slug}`);
      expect(result.notes.some((n) => n.startsWith("no PDF:"))).toBe(true);
      expect((await scratch.db.select().from(asset).where(eq(asset.id, `pdf:video:${slug}`))).length).toBe(0);
      // No half-written outputs either: the job records the five it landed.
      expect((await scratch.db.select().from(assetJob).where(eq(assetJob.jobId, second.id)))).toHaveLength(5);
    } finally {
      if (saved === undefined) delete process.env["GNOSIA_OWNER_UPLOADS_PER_DAY"];
      else process.env["GNOSIA_OWNER_UPLOADS_PER_DAY"] = saved;
    }
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

  it("refuses a cut the gate left no poster for, so an accepted video always has one", async () => {
    // Every path that writes a video leaves a poster behind (2026-10-05):
    // the studio's gate cuts it, and the accept stores it with the video or
    // stores nothing.
    const slug = "posterless-cut";
    const { job: queued } = await jobReady(slug);
    const dir = await candidate(slug);
    await rm(path.join(dir, "poster.jpg"));
    const copies = JSON.parse(await readFile(path.join(dir, "copies.json"), "utf8")) as { files: Record<string, unknown> };
    delete copies.files["poster.jpg"];
    await writeFile(path.join(dir, "copies.json"), JSON.stringify(copies));
    await expect(put({ slug, dir, jobId: queued.id })).rejects.toThrow(/records no copy named poster\.jpg/);
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
    // A conflict on a later file writes none of the earlier ones.
    const partial = path.join(work, "checkout-partial");
    await mkdir(partial, { recursive: true });
    await writeFile(path.join(partial, "topic.yml"), "topic: somebody-elses\n");
    await expect(checkoutVideo(scratch.db, LOCAL, "attention-weights", partial)).rejects.toMatchObject({ code: "dirty-checkout" });
    await expect(access(path.join(partial, "attention-weights.py"))).rejects.toThrow();
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

  it("holds every source file to a record in copies.json, both ways", async () => {
    const slug = "source-held";
    const { job: queued } = await jobReady(slug);
    // A scene file the gate never recorded.
    const unrecorded = await candidate(slug);
    await writeFile(path.join(unrecorded, "source", "extra.py"), "print('not checked')\n");
    await expect(put({ slug, dir: unrecorded, jobId: queued.id })).rejects.toMatchObject({
      code: "mismatch",
      message: expect.stringMatching(/records no copy named source\/extra\.py/),
    });
    // A recorded scene file that is gone.
    const missing = await candidate(slug);
    await rm(path.join(missing, "source", `${slug}.py`));
    await writeFile(path.join(missing, "source", "other.py"), "x = 1\n");
    const copies = JSON.parse(await readFile(path.join(missing, "copies.json"), "utf8"));
    copies.files["source/other.py"] = { sha256: sha("x = 1\n"), bytes: 6 };
    await writeFile(path.join(missing, "copies.json"), JSON.stringify(copies));
    await expect(put({ slug, dir: missing, jobId: queued.id })).rejects.toMatchObject({
      code: "mismatch",
      message: expect.stringMatching(new RegExp(`records source/${slug}\\.py, which is not in`)),
    });
    expect(await jobState(queued.id)).toBe("awaiting_review");
  });

  it("refuses a hard link as a copy", async () => {
    const slug = "hard-linked";
    const { job: queued } = await jobReady(slug);
    const dir = await candidate(slug);
    await link(path.join(dir, "poster.jpg"), path.join(work, `poster-link-${slug}.jpg`));
    await expect(put({ slug, dir, jobId: queued.id })).rejects.toThrow(/has 2 links/);
    expect(await jobState(queued.id)).toBe("awaiting_review");
  });

  it("gives a retry that raced the first put the landed Accept, not stale-base", async () => {
    const slug = "raced-accept";
    const { job: queued } = await jobReady(slug);
    const dir = await candidate(slug);
    const a = connect({ url: scratch.url, copyOk: true });
    const b = connect({ url: scratch.url, copyOk: true });
    // Hold the video's lock, so both puts pass every check outside the
    // transaction and then queue on the locks inside it: the first behind the
    // holder, the second behind the first, which is the order they land in.
    const holder = await holdLock(scratch.url, (tx) => lockEntity(tx, "video", slug));
    try {
      const args = { slug, dir, jobId: queued.id, base: null, reason: "r", author: "local", authorKind: "person" as const, ownerId: "local" };
      const first = putVideo(a.db, openBlobStore(), args);
      await waitForBlocked(scratch.db, scratch.name, 1, holder);
      const second = putVideo(b.db, openBlobStore(), args);
      await waitForBlocked(scratch.db, scratch.name, 2, holder);
      await holder.release();
      const results = await Promise.all([first, second]);
      expect(results.map((r) => r.retry)).toEqual([false, true]);
      expect(results[0].revision).toBe(results[1].revision);
      expect(await jobState(queued.id)).toBe("accepted");
    } finally {
      await holder.close();
      await Promise.all([a.close(), b.close()]);
    }
  });

  it("writes nothing when the accept in its transaction is refused", async () => {
    const slug = "accept-refused";
    const { job: queued } = await jobReady(slug);
    const dir = await candidate(slug);
    await scratch.db.execute(sql.raw(`
      create function refuse_accept() returns trigger language plpgsql as $$
      begin raise exception 'accept refused for the test'; end $$;
      create trigger refuse_accept before update on job for each row
        when (new.id = '${queued.id}' and new.state = 'accepted') execute function refuse_accept();`));
    try {
      const before = await revisionCount();
      await expect(put({ slug, dir, jobId: queued.id, base: null })).rejects.toSatisfy((error) =>
        causeText(error).includes("accept refused for the test"),
      );
      expect(await jobState(queued.id)).toBe("awaiting_review");
      expect(await revisionCount()).toBe(before);
      expect((await scratch.db.select().from(video).where(eq(video.slug, slug))).length).toBe(0);
      expect(
        (await scratch.db.select().from(asset).where(sql`starts_with(${asset.id}, ${`video:${slug}`}) or ${asset.id} = ${`poster:video:${slug}`}`)).length,
      ).toBe(0);
      expect((await scratch.db.select().from(assetJob).where(eq(assetJob.jobId, queued.id))).length).toBe(0);
      expect((await scratch.db.select().from(contentRevision).where(eq(contentRevision.jobId, queued.id))).length).toBe(0);
    } finally {
      await scratch.db.execute(sql.raw(`drop trigger refuse_accept on job; drop function refuse_accept();`));
    }
    expect((await put({ slug, dir, jobId: queued.id, base: null })).jobState).toBe("accepted");
  });

  it("refuses --discard-parent for a parent it cannot discard, and changes nothing", async () => {
    const change = (slug: string, key: string, parent: string) =>
      runEnqueue({
        brief: { kind: "video", topic: TOPIC, target: `videos/${slug}.mp4`, idempotencyKey: key, parentJob: parent },
        discardParent: parent,
      });
    // Another owner's parent reads as a missing one.
    await scratch.db.insert(job).values({
      id: "other-owners-parent",
      kind: "video",
      state: "awaiting_review",
      topicSlug: TOPIC,
      targetPath: "videos/their-change.mp4",
      idempotencyKey: "other-owners-parent",
      requestedAt: new Date(Date.now() - 60_000),
      startedAt: new Date(),
      runner: "test",
      ownerId: "other",
    });
    await expect(change("their-change", "dp-1", "other-owners-parent")).rejects.toThrow(/no job "other-owners-parent" to revise/);
    expect(await jobState("other-owners-parent")).toBe("awaiting_review");

    // An accepted parent holds no lease, and there is nothing to discard.
    const { job: accepted } = await jobReady("accepted-parent");
    await put({ slug: "accepted-parent", dir: await candidate("accepted-parent"), jobId: accepted.id, base: null });
    await expect(change("accepted-parent", "dp-2", accepted.id)).rejects.toThrow(/is accepted, not awaiting_review/);

    // A running parent is still running.
    const running = await runEnqueue({
      brief: { id: "running-parent", kind: "video", topic: TOPIC, target: "videos/running-parent.mp4", idempotencyKey: "running-parent" },
    });
    await runClaim({ jobId: running.job.id, runner: "test" });
    await expect(change("running-parent", "dp-3", running.job.id)).rejects.toThrow(/is running, not awaiting_review.*once it has finished/);
    expect(await jobState(running.job.id)).toBe("running");

    // A parent for another slug.
    const { job: elsewhere } = await jobReady("elsewhere-parent");
    await expect(change("not-its-slug", "dp-4", elsewhere.id)).rejects.toThrow(/a change keeps its video's slug/);
    expect(await jobState(elsewhere.id)).toBe("awaiting_review");
  });

  it("returns the winner's child to a concurrent second --discard-parent submit", async () => {
    const slug = "double-change";
    const { job: parent } = await jobReady(slug);
    // Both submits look the key up, find nothing and queue on the parent's
    // row lock, the first behind the holder and the second behind the first.
    const holder = await holdLock(scratch.url, (tx) => tx.execute(sql`select id from job where id = ${parent.id} for update`));
    try {
      const submit = () =>
        runEnqueue({
          brief: { kind: "video", topic: TOPIC, target: `videos/${slug}.mp4`, idempotencyKey: "double-change-1", parentJob: parent.id },
          discardParent: parent.id,
        });
      const first = submit();
      await waitForBlocked(scratch.db, scratch.name, 1, holder);
      const second = submit();
      await waitForBlocked(scratch.db, scratch.name, 2, holder);
      await holder.release();
      const results = await Promise.all([first, second]);
      expect(results.map((r) => r.created)).toEqual([true, false]);
      expect(results[0].job.id).toBe(results[1].job.id);
      expect(await jobState(parent.id)).toBe("discarded");
    } finally {
      await holder.close();
    }
  });

  it("keeps the refusal for a different concurrent --discard-parent request under the same key", async () => {
    const slug = "different-change";
    const { job: parent } = await jobReady(slug);
    // As above: both past the key lookup and queued on the parent's row lock,
    // in a known order. A submit that looked the key up after the winner
    // committed would be handed the winner's job, the idempotent answer for a
    // key already taken, and the refusal under test would never be reached.
    const holder = await holdLock(scratch.url, (tx) => tx.execute(sql`select id from job where id = ${parent.id} for update`));
    try {
      const submit = (idea: string) =>
        runEnqueue({
          brief: {
            kind: "video",
            topic: TOPIC,
            target: `videos/${slug}.mp4`,
            idempotencyKey: "different-change-1",
            parentJob: parent.id,
            brief: briefOf(slug, { mode: "change", idea }),
          },
          discardParent: parent.id,
        });
      const first = submit("First change.");
      await waitForBlocked(scratch.db, scratch.name, 1, holder);
      const second = submit("Second change.");
      await waitForBlocked(scratch.db, scratch.name, 2, holder);
      await holder.release();
      const [landed, refused] = await Promise.allSettled([first, second]);
      expect(landed?.status === "fulfilled" && landed.value.created).toBe(true);
      expect(refused?.status).toBe("rejected");
      expect(String((refused as PromiseRejectedResult).reason)).toMatch(/is discarded, not awaiting_review/);
      expect(await jobState(parent.id)).toBe("discarded");
    } finally {
      await holder.close();
    }
  });

  it("refuses a video row naming another owner's blob, at the seam", async () => {
    await expect(
      writeContents(scratch.db, [
        {
          type: "video",
          id: "foreign-cut",
          base: null,
          owner: LOCAL_LEARNER_ID,
          author: "local",
          authorKind: "person",
          reason: "test",
          next: {
            row: {
              slug: "foreign-cut",
              topicSlug: TOPIC,
              source: { files: {}, brief: {} },
              sourceHash: sha("s"),
              mp4BlobKey: `other/${sha("theirs")}.mp4`,
              renderedSourceHash: sha("s"),
            },
          },
        },
      ]),
    ).rejects.toSatisfy((error) => error instanceof ContentWriteError && /not under "local\/"/.test(error.message));
  });

  it("scopes the list's poster to what the owner may read", async () => {
    const key = `other/${sha("their poster")}.jpg`;
    await scratch.db.insert(blobObject).values({
      key,
      ownerId: "other",
      sha256: sha("their poster"),
      bytes: 12,
      mime: "image/jpeg",
      provider: "fs",
      state: "present",
      confirmedAt: new Date(),
    });
    // An owner move done for the poster and not its video: the id still
    // pairs them. The import cut the render's poster (2026-10-05), so the
    // move is made on that row and undone after.
    const id = "poster:manimkc:out/demo/one/one.mp4";
    const [own] = await scratch.db.select().from(asset).where(eq(asset.id, id));
    expect(own?.ownerId).toBe("local");
    await scratch.db
      .update(asset)
      .set({ ownerId: "other", blobKey: key, contentHash: sha("their poster"), bytes: 12 })
      .where(eq(asset.id, id));
    try {
      const render = (await listVideos(scratch.db, LOCAL)).find((v) => v.assetId === "manimkc:out/demo/one/one.mp4");
      expect(render?.poster).toBeNull();
    } finally {
      await scratch.db
        .update(asset)
        .set({ ownerId: own!.ownerId, blobKey: own!.blobKey, contentHash: own!.contentHash, bytes: own!.bytes })
        .where(eq(asset.id, id));
    }
  });

  it("counts a studio video's cut as referenced in the blob audit", async () => {
    const ids = videoAssetIds("attention-weights");
    const [row] = await scratch.db.select().from(video).where(eq(video.slug, "attention-weights"));
    const [poster] = await scratch.db.select().from(asset).where(eq(asset.id, ids.poster));
    // Leave the row the only thing naming the cut.
    await scratch.db.update(asset).set({ blobKey: poster?.blobKey }).where(eq(asset.id, ids.video));
    try {
      const audit = await auditBlobs(scratch.db, openBlobStore());
      expect(audit.findings.filter((f) => f.key === row?.mp4BlobKey)).toEqual([]);
    } finally {
      await scratch.db.update(asset).set({ blobKey: row?.mp4BlobKey }).where(eq(asset.id, ids.video));
    }
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
  it("sets a studio agent preference: round-trips, idempotent, owner-scoped, refuses a bad value", async () => {
    const opus = JSON.stringify({ model: "opus", effort: "high" });
    const first = await runPreferenceSet({ key: "studioDiagramAgent", value: opus });
    expect(first).toMatchObject({ ok: true, verb: "set", owner: LOCAL_LEARNER_ID, key: "studioDiagramAgent", changed: true });
    expect(first.value).toEqual({ model: "opus", effort: "high" });
    const got = await runPreferenceGet({ key: "studioDiagramAgent" });
    expect(got.value).toEqual({ model: "opus", effort: "high" });
    expect(got.updatedAt).toBe(first.updatedAt);

    // An identical set writes nothing, whatever the key order.
    const again = await runPreferenceSet({ key: "studioDiagramAgent", value: JSON.stringify({ effort: "high", model: "opus" }) });
    expect(again.changed).toBe(false);
    expect(again.updatedAt).toBe(first.updatedAt);

    // A different value updates the one row.
    const next = await runPreferenceSet({ key: "studioDiagramAgent", value: JSON.stringify({ model: "default", effort: "default" }) });
    expect(next.changed).toBe(true);
    expect((await runPreferenceGet({ key: "studioDiagramAgent" })).value).toEqual({ model: "default", effort: "default" });

    // Another owner's set leaves the first owner's value alone.
    await runPreferenceSet({ key: "studioDiagramAgent", value: JSON.stringify({ model: "sonnet", effort: "low" }), owner: "other" });
    expect((await runPreferenceGet({ key: "studioDiagramAgent", owner: "other" })).value).toEqual({ model: "sonnet", effort: "low" });
    expect((await runPreferenceGet({ key: "studioDiagramAgent" })).value).toEqual({ model: "default", effort: "default" });

    // Nothing that reads back differently is stored.
    const before = await runPreferenceGet({ key: "studioDiagramAgent" });
    const refused: [string | undefined, RegExp][] = [
      [JSON.stringify({ model: "opus", effort: "ultra" }), /effort must be/],
      [JSON.stringify({ model: "opus", effort: "high", extra: 1 }), /other than model and effort: extra/],
      [JSON.stringify({ model: "--flag", effort: "high" }), /model must be/],
      [JSON.stringify({ model: "Sonnet", effort: "high" }), /model must be/],
      [JSON.stringify({ model: "claude_sonnet", effort: "high" }), /model must be/],
      [JSON.stringify({ model: "opus" }), /effort must be/],
      [JSON.stringify(["opus"]), /must be a JSON object/],
      ["7", /must be a JSON object/],
      ["not json", /not valid JSON/],
      [undefined, /needs --value/],
    ];
    for (const [value, message] of refused) {
      await expect(runPreferenceSet({ key: "studioDiagramAgent", value })).rejects.toThrow(message);
    }
    expect(await runPreferenceGet({ key: "studioDiagramAgent" })).toEqual(before);

    await expect(runPreferenceSet({ key: "theme", value: opus })).rejects.toThrow(/preference set answers studioVideoAgent and studioDiagramAgent only/);
    await expect(runPreferenceSet({ key: undefined, value: opus })).rejects.toThrow(/answers studioVideoAgent/);
    await expect(runPreferenceSet({ key: "studioVideoAgent", value: opus, owner: "nobody" })).rejects.toThrow(/no learner "nobody"/);
    expect((await runPreferenceGet({ key: "studioVideoAgent", owner: "nobody" })).value).toBeNull();
  });
  it("restamps a video's source on topic rename, and names it when the topic is archived", async () => {
    const by = { author: "local", authorKind: "person" as const, reason: "test" };
    await addTopic(scratch.db, { slug: "video-rename-from", title: "Rename me", domain: "agentic-ai" }, by);
    const slug = "renamed-subject";
    const brief = briefOf(slug, { topic: "video-rename-from", concepts: [] });
    serial += 1;
    const id = `video-job-${serial}`;
    await runEnqueue({ brief: { id, kind: "video", topic: "video-rename-from", target: `videos/${slug}.mp4`, idempotencyKey: id, brief } });
    await runClaim({ jobId: id, runner: "test" });
    await runFinish({ jobId: id, state: "awaiting_review" });
    const dir = await candidate(slug);
    const yml = "topic: video-rename-from  # the vocabulary slug\n";
    await writeFile(path.join(dir, "source", "topic.yml"), yml);
    const copies = JSON.parse(await readFile(path.join(dir, "copies.json"), "utf8"));
    copies.files["source/topic.yml"] = { sha256: sha(yml), bytes: Buffer.byteLength(yml) };
    await writeFile(path.join(dir, "copies.json"), JSON.stringify(copies));
    await put({ slug, dir, jobId: id, base: null });

    await renameTopic(scratch.db, { from: "video-rename-from", to: "video-rename-to" }, by);
    const [row] = await scratch.db.select().from(video).where(eq(video.slug, slug));
    const source = row?.source as { files: Record<string, string>; brief: { topic: string } };
    expect(row?.topicSlug).toBe("video-rename-to");
    expect(source.brief.topic).toBe("video-rename-to");
    expect(source.files["topic.yml"]).toBe("topic: video-rename-to  # the vocabulary slug\n");
    expect(row?.sourceHash).toBe(sourceHash(source as never));
    expect(row?.renderedSourceHash).toBe(row?.sourceHash);
    const [latest] = await scratch.db
      .select()
      .from(contentRevision)
      .where(sql`${contentRevision.entityType} = 'video' and ${contentRevision.entityId} = ${slug}`)
      .orderBy(sql`${contentRevision.seq} desc`)
      .limit(1);
    expect(latest?.op).toBe("rename");

    // Archive is refused while a studio video is filed under the topic. It
    // needs topics owned by the database, so the row says so for this check.
    const [had] = (await scratch.db.execute<{ source: string }>(sql`select source from content_source where type = 'topics'`)).rows;
    await scratch.db.execute(sql`
      insert into content_source (type, source, flipped_at) values ('topics', 'db', now())
      on conflict (type) do update set source = 'db', flipped_at = now()`);
    try {
      await expect(archiveTopic(scratch.db, "video-rename-to", by)).rejects.toThrow(/studio videos filed under it: renamed-subject/);
    } finally {
      if (had === undefined) await scratch.db.execute(sql`delete from content_source where type = 'topics'`);
      else await scratch.db.execute(sql`update content_source set source = ${had.source} where type = 'topics'`);
    }
  });
});

describe("a put's refusals", () => {
  it("each carry a code the studio can branch on", () => {
    const code = (error: unknown) => (refusal(error) as VideoError).code;
    expect(code(new JobError("job x is discarded"))).toBe("job");
    expect(code(new BlobIntegrityError("did not read back"))).toBe("blob");
    expect(code(new ContentWriteError("stale-base", "moved"))).toBe("stale-base");
    expect(code(new ContentWriteError("foreign-owner", "theirs"))).toBe("unresolved");
    expect(code(new ContentWriteError("invalid", "bad"))).toBe("invalid");
    const other = new Error("connection lost");
    expect(refusal(other)).toBe(other);
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
    // One rule for set and read (#207 review): what a set would refuse, a
    // read never keeps, so "Sonnet" can never be saved and then run as default.
    for (const model of ["Sonnet", "claude_sonnet", "claude-[1m]-5", "opus[1m][x]", "a".repeat(81)]) {
      expect(studioAgentPreference({ model, effort: "high" }).model, model).toBe("default");
      expect(isAgentModel(model), model).toBe(false);
    }
    expect(isAgentModel("sonnet")).toBe(true);
  });
});
