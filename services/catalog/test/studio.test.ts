import { mkdir, rm } from "node:fs/promises";
import path from "node:path";

import {
  asset,
  assetConcept,
  assetJob,
  assetTopic,
  concept,
  event,
  job,
  JOB_TRANSITIONS,
  learner,
  LOCAL_LEARNER_ID,
  session,
  SESSION_TRANSITIONS,
  topic,
} from "@self-learn/schema";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { assertOutputPath, claimablePaths, runAssertOutput } from "../src/commands/assert-output";
import {
  briefTarget,
  candidateFor,
  runAccept,
  runClaim,
  runDiscard,
  runEnqueue,
  runFinish,
  runList,
  runShow,
  type BriefDocument,
} from "../src/commands/job";
import { runStatus } from "../src/commands/status";
import { applyMigrations, migrationStatus } from "../src/migrations";
import { endSession, ensureSession } from "../src/state/sessions";
import { makeFixture, topicsYaml, type Fixture } from "./fixture-tree";
import { partialMigrations } from "./partial-migrations";
import { createScratchDatabase, probe, type Scratch, sqlMessage, sqlstate } from "./scratch-database";

/**
 * The studio schema, the job lifecycle and the single-file write path.
 *
 * Everything here needs a real Postgres, because everything here is a
 * constraint: a partial unique index, four `RESTRICT`s, and a set of
 * conditional updates whose whole job is to lose a race. No fake enforces any
 * of that, so on a machine with no database the suite names its reason and
 * skips rather than passing hollowly.
 */

const reachable = await probe();

/** A `.tldr` carrying whatever `meta.tldrawkc` the case needs, or none. */
function tldr(meta?: Record<string, unknown>): string {
  return JSON.stringify({
    tldrawFileFormatVersion: 1,
    schema: { schemaVersion: 2, sequences: {} },
    records: [
      { id: "shape:one", typeName: "shape", type: "geo", meta: {} },
      {
        id: "document:document",
        typeName: "document",
        gridSize: 10,
        name: "",
        meta: meta === undefined ? {} : { tldrawkc: { kc: 1, ...meta } },
      },
    ],
  });
}

describe.skipIf(!reachable.ok)("the studio schema", () => {
  let scratch: Scratch;
  let previousUrl: string | undefined;
  let fixture: Fixture;

  beforeAll(async () => {
    scratch = await createScratchDatabase();
    await applyMigrations(scratch.db);
    // The commands connect through DATABASE_URL, the same path the CLI takes.
    previousUrl = process.env["DATABASE_URL"];
    process.env["DATABASE_URL"] = scratch.url;

    fixture = await makeFixture();
    await fixture.write(
      "content/topics.yaml",
      topicsYaml([
        { slug: "alpha", concepts: ["dot-product"] },
        { slug: "beta", concepts: [] },
      ]),
    );
    await mkdir(path.join(fixture.root, "learn", "assets"), { recursive: true });

    await scratch.db.insert(learner).values({ id: LOCAL_LEARNER_ID }).onConflictDoNothing();
    await scratch.db.insert(topic).values([
      { slug: "alpha", title: "Alpha", domain: "foundations" },
      { slug: "beta", title: "Beta", domain: "foundations" },
    ]);
    await scratch.db
      .insert(concept)
      .values({ slug: "dot-product", title: "The dot product", path: "learn/concepts/dot-product.md" });
  }, 60_000);

  afterAll(async () => {
    if (previousUrl === undefined) delete process.env["DATABASE_URL"];
    else process.env["DATABASE_URL"] = previousUrl;
    await fixture?.cleanup();
    await scratch?.drop();
  });

  /** Every job row, so one test's lease cannot leak into the next. */
  beforeEach(async () => {
    await scratch.db.delete(assetJob);
    await scratch.db.delete(job);
  });

  const brief = (overrides: Partial<BriefDocument> = {}): BriefDocument => ({
    kind: "diagram",
    topic: "alpha",
    target: "learn/assets/one.tldr",
    idempotencyKey: `key-${Math.random().toString(36).slice(2)}`,
    ...overrides,
  });

  const enqueue = (overrides: Partial<BriefDocument> = {}) =>
    runEnqueue({ brief: brief(overrides), repoRoot: fixture.root });

  describe("the tables land", () => {
    it("counts the studio tables apart from state and content", async () => {
      const status = await runStatus();
      expect(status.migrations.pending).toEqual([]);
      expect(status.rows).toHaveProperty("session");
      expect(status.rows).toHaveProperty("job");
      expect(status.rows).toHaveProperty("asset_job");
      // The three studio tables are not in the state total. A render failure is
      // not something a learner did.
      expect(status.totals.studio).toBe(
        status.rows["session"]! + status.rows["job"]! + status.rows["asset_job"]!,
      );
      expect(status.totals.state).toBe(
        status.rows["learner"]! +
          status.rows["event"]! +
          status.rows["mastery"]! +
          status.rows["review"]! +
          status.rows["progress"]! +
          status.rows["recap"]! +
          status.rows["preference"]!,
      );
    });
  });

  describe("enqueue", () => {
    it("queues a job and derives the candidate path from the target", async () => {
      const result = await enqueue({ target: "learn/assets/queued.tldr" });
      expect(result.created).toBe(true);
      expect(result.job.state).toBe("queued");
      expect(result.job.candidatePath).toBe("learn/assets/.candidates/queued.tldr");
      expect(result.job.attempt).toBe(0);
    });

    it("returns the existing job for a repeated idempotency key", async () => {
      const document = brief({ target: "learn/assets/retried.tldr" });
      const first = await runEnqueue({ brief: document, repoRoot: fixture.root });
      const second = await runEnqueue({ brief: document, repoRoot: fixture.root });
      expect(second.created).toBe(false);
      expect(second.job.id).toBe(first.job.id);
      const rows = await scratch.db.select().from(job);
      expect(rows).toHaveLength(1);
    });

    it("refuses a second job on a path an active one holds, and names the holder", async () => {
      const first = await enqueue({ target: "learn/assets/leased.tldr" });
      await expect(enqueue({ target: "learn/assets/leased.tldr" })).rejects.toThrow(first.job.id);
    });

    it("lets the path go once the holder reaches a terminal state", async () => {
      const first = await enqueue({ target: "learn/assets/released.tldr" });
      await runClaim({ jobId: first.job.id });
      await runFinish({ jobId: first.job.id, state: "failed", errorKind: "gate" });
      await expect(enqueue({ target: "learn/assets/released.tldr" })).resolves.toMatchObject({
        created: true,
      });
    });

    it("keeps holding the path while a candidate is awaiting review", async () => {
      const first = await enqueue({ target: "learn/assets/held.tldr" });
      await runClaim({ jobId: first.job.id });
      await runFinish({ jobId: first.job.id, state: "awaiting_review" });
      await expect(enqueue({ target: "learn/assets/held.tldr" })).rejects.toThrow(
        /already held by job/,
      );
    });

    it("refuses a topic slug the vocabulary does not have, before anything runs", async () => {
      await expect(enqueue({ topic: "not-a-topic" })).rejects.toThrow(/no topic "not-a-topic"/);
      expect(await scratch.db.select().from(job)).toHaveLength(0);
    });

    it("refuses a session that does not exist", async () => {
      await expect(enqueue({ session: "never-started" })).rejects.toThrow(/no session/);
    });

    it("refuses a brief with no idempotency key", async () => {
      await expect(
        runEnqueue({
          brief: { kind: "diagram", topic: "alpha", target: "learn/assets/x.tldr" },
          repoRoot: fixture.root,
        }),
      ).rejects.toThrow(/idempotencyKey/);
    });

    it("records the target's hash when there is already a file there", async () => {
      await fixture.write("learn/assets/existing.tldr", tldr({ topic: "alpha" }));
      const result = await enqueue({ target: "learn/assets/existing.tldr" });
      expect(result.job.targetHashBefore).toMatch(/^[0-9a-f]{64}$/);
    });

    it("refuses a target outside learn/assets, or one that is not a .tldr", () => {
      expect(() => briefTarget("learn/assets/deep/x.tldr")).toThrow(/directly inside/);
      expect(() => briefTarget("../outside.tldr")).toThrow(/repo-relative/);
      expect(() => briefTarget("learn/assets/x.svg")).toThrow(/not a \.tldr/);
      expect(candidateFor("learn/assets/x.tldr")).toBe("learn/assets/.candidates/x.tldr");
    });
  });

  describe("claim", () => {
    it("claims the oldest queued job and stamps the attempt", async () => {
      const first = await enqueue({ target: "learn/assets/first.tldr" });
      await enqueue({ target: "learn/assets/second.tldr" });
      const claimed = await runClaim({ runner: "test" });
      expect(claimed.claimed).toBe(true);
      expect(claimed.job?.id).toBe(first.job.id);
      expect(claimed.job?.state).toBe("running");
      expect(claimed.job?.attempt).toBe(1);
      expect(claimed.job?.runner).toBe("test");
    });

    it("cannot claim the same job twice", async () => {
      const queued = await enqueue();
      await runClaim({ jobId: queued.job.id });
      await expect(runClaim({ jobId: queued.job.id })).rejects.toThrow(
        /running → running is not a transition/,
      );
    });

    it("says so rather than failing when nothing is queued", async () => {
      const claimed = await runClaim({});
      expect(claimed).toMatchObject({ claimed: false, job: null });
    });
  });

  describe("the job state machine", () => {
    it("refuses every transition the table does not allow", async () => {
      const queued = await enqueue();
      // queued cannot go straight to awaiting_review.
      await expect(
        runFinish({ jobId: queued.job.id, state: "awaiting_review" }),
      ).rejects.toThrow(/queued → awaiting_review is not a transition/);
      // nor straight to accepted.
      await expect(runAccept({ jobId: queued.job.id })).rejects.toThrow(
        /queued → accepted is not a transition/,
      );

      await runClaim({ jobId: queued.job.id });
      // running cannot be accepted: the gate has not run.
      await expect(runAccept({ jobId: queued.job.id })).rejects.toThrow(
        /running → accepted is not a transition/,
      );

      await runFinish({ jobId: queued.job.id, state: "awaiting_review" });
      await runDiscard({ jobId: queued.job.id });
      // discarded is terminal.
      await expect(runAccept({ jobId: queued.job.id })).rejects.toThrow(/discarded is terminal/);
      await expect(
        runFinish({ jobId: queued.job.id, state: "interrupted" }),
      ).rejects.toThrow(/discarded is terminal/);
    });

    it("keeps a queued job out of interrupted, because nothing was in flight", () => {
      expect(JOB_TRANSITIONS.queued).not.toContain("interrupted");
      // awaiting_review is the opposite case: the candidate outlives the
      // process that wrote it, so a restart has to decide about it.
      expect(JOB_TRANSITIONS.awaiting_review).toContain("interrupted");
    });

    it("will not let a runner accept or discard its own work", async () => {
      const queued = await enqueue();
      await runClaim({ jobId: queued.job.id });
      await runFinish({ jobId: queued.job.id, state: "awaiting_review" });
      await expect(runFinish({ jobId: queued.job.id, state: "accepted" })).rejects.toThrow(
        /person's verdict/,
      );
    });

    it("refuses a transition on a job that does not exist", async () => {
      await expect(runAccept({ jobId: "ghost" })).rejects.toThrow(/no job "ghost"/);
    });

    it("records the cost and the exit code a failed run reports", async () => {
      const queued = await enqueue();
      await runClaim({ jobId: queued.job.id });
      const finished = await runFinish({
        jobId: queued.job.id,
        state: "failed",
        exitCode: 3,
        turns: 12,
        costUsd: 0.42,
        errorKind: "gate",
        error: "three lints remained",
      });
      expect(finished.job).toMatchObject({
        state: "failed",
        exitCode: 3,
        turns: 12,
        costUsd: 0.42,
        errorKind: "gate",
      });
      expect(finished.job.finishedAt).not.toBeNull();
    });
  });

  describe("assert-output", () => {
    /** A job in `awaiting_review` whose target is `learn/assets/<stem>.tldr`. */
    async function readyJob(stem: string, overrides: Partial<BriefDocument> = {}) {
      const queued = await enqueue({ target: `learn/assets/${stem}.tldr`, ...overrides });
      await runClaim({ jobId: queued.job.id });
      await runFinish({ jobId: queued.job.id, state: "awaiting_review" });
      return queued.job.id;
    }

    it("writes the asset, its links and the provenance row in one go", async () => {
      await fixture.write(
        "learn/assets/good.tldr",
        tldr({ topic: "alpha", concepts: ["dot-product"], title: "Good" }),
      );
      const jobId = await readyJob("good");
      const result = await runAssertOutput({
        jobId,
        path: "learn/assets/good.tldr",
        repoRoot: fixture.root,
      });

      expect(result).toMatchObject({
        assetId: "diagram:learn/assets/good.tldr",
        kind: "diagram_source",
        topic: "alpha",
        concepts: ["dot-product"],
        title: "Good",
        firstAssert: true,
      });
      const rows = await scratch.db
        .select()
        .from(assetJob)
        .where(eq(assetJob.jobId, jobId));
      expect(rows).toHaveLength(1);
      expect(rows[0]!.contentHash).toBe(result.contentHash);
    });

    it("is idempotent: a second assert adds no rows", async () => {
      await fixture.write(
        "learn/assets/twice.tldr",
        tldr({ topic: "alpha", concepts: ["dot-product"] }),
      );
      const jobId = await readyJob("twice");
      const options = { jobId, path: "learn/assets/twice.tldr", repoRoot: fixture.root };
      const first = await runAssertOutput(options);
      const second = await runAssertOutput(options);
      expect(first.firstAssert).toBe(true);
      expect(second.firstAssert).toBe(false);

      const id = "diagram:learn/assets/twice.tldr";
      expect(await scratch.db.select().from(assetJob).where(eq(assetJob.assetId, id))).toHaveLength(1);
      expect(
        await scratch.db.select().from(assetTopic).where(eq(assetTopic.assetId, id)),
      ).toHaveLength(1);
      expect(
        await scratch.db.select().from(assetConcept).where(eq(assetConcept.assetId, id)),
      ).toHaveLength(1);
    });

    it("refuses a .tldr with no topic, by name", async () => {
      await fixture.write("learn/assets/bare.tldr", tldr({ title: "Untitled" }));
      const jobId = await readyJob("bare");
      await expect(
        runAssertOutput({ jobId, path: "learn/assets/bare.tldr", repoRoot: fixture.root }),
      ).rejects.toThrow(/learn\/assets\/bare\.tldr names no topic/);
    });

    it("refuses a topic that is not in the vocabulary, by name", async () => {
      await fixture.write("learn/assets/stray.tldr", tldr({ topic: "not-in-the-file" }));
      const jobId = await readyJob("stray");
      await expect(
        runAssertOutput({ jobId, path: "learn/assets/stray.tldr", repoRoot: fixture.root }),
      ).rejects.toThrow(/names topic "not-in-the-file"/);
    });

    it("refuses a file stamped with a topic other than the job's", async () => {
      await fixture.write("learn/assets/drifted.tldr", tldr({ topic: "beta" }));
      const jobId = await readyJob("drifted");
      await expect(
        runAssertOutput({ jobId, path: "learn/assets/drifted.tldr", repoRoot: fixture.root }),
      ).rejects.toThrow(/was enqueued under "alpha"/);
    });

    it("refuses a file the job does not target", async () => {
      await fixture.write("learn/assets/mine.tldr", tldr({ topic: "alpha" }));
      await fixture.write("learn/assets/theirs.tldr", tldr({ topic: "alpha" }));
      const jobId = await readyJob("mine");
      await expect(
        runAssertOutput({ jobId, path: "learn/assets/theirs.tldr", repoRoot: fixture.root }),
      ).rejects.toThrow(/cannot claim learn\/assets\/theirs\.tldr/);
    });

    it("refuses an SVG whose .tldr is not in the catalog yet", async () => {
      await fixture.write("learn/assets/pair.tldr", tldr({ topic: "alpha" }));
      await fixture.write("learn/assets/pair.svg", "<svg></svg>");
      const jobId = await readyJob("pair");
      await expect(
        runAssertOutput({ jobId, path: "learn/assets/pair.svg", repoRoot: fixture.root }),
      ).rejects.toThrow(/Assert the \.tldr first/);
    });

    it("links an SVG to the .tldr it came from, and shares its subject", async () => {
      await fixture.write(
        "learn/assets/exported.tldr",
        tldr({ topic: "alpha", concepts: ["dot-product"] }),
      );
      await fixture.write("learn/assets/exported.svg", "<svg></svg>");
      const jobId = await readyJob("exported");
      await runAssertOutput({
        jobId,
        path: "learn/assets/exported.tldr",
        repoRoot: fixture.root,
      });
      const svg = await runAssertOutput({
        jobId,
        path: "learn/assets/exported.svg",
        repoRoot: fixture.root,
      });
      expect(svg).toMatchObject({
        kind: "diagram_svg",
        topic: "alpha",
        concepts: ["dot-product"],
        derivedFrom: "diagram:learn/assets/exported.tldr",
      });
    });

    it("refuses a missing file, an absolute path and a path outside learn/assets", async () => {
      const jobId = await readyJob("absent");
      await expect(
        runAssertOutput({ jobId, path: "learn/assets/absent.tldr", repoRoot: fixture.root }),
      ).rejects.toThrow(/does not exist/);
      expect(() => assertOutputPath("/etc/passwd")).toThrow(/absolute/);
      expect(() => assertOutputPath("learn/notes/x.tldr")).toThrow(/directly inside/);
      expect(() => assertOutputPath("learn/assets/x.png")).toThrow(/neither a \.tldr nor a \.svg/);
      expect(claimablePaths("learn/assets/x.tldr")).toEqual([
        "learn/assets/x.tldr",
        "learn/assets/x.svg",
      ]);
    });
  });

  describe("accept", () => {
    it("records what landed and moves the job in one transaction", async () => {
      await fixture.write(
        "learn/assets/accepted.tldr",
        tldr({ topic: "alpha", concepts: ["dot-product"] }),
      );
      await fixture.write("learn/assets/accepted.svg", "<svg></svg>");
      const queued = await enqueue({ target: "learn/assets/accepted.tldr" });
      await runClaim({ jobId: queued.job.id });
      await runFinish({ jobId: queued.job.id, state: "awaiting_review" });

      const accepted = await runAccept({
        jobId: queued.job.id,
        paths: ["learn/assets/accepted.tldr", "learn/assets/accepted.svg"],
        repoRoot: fixture.root,
      });
      expect(accepted.to).toBe("accepted");
      expect(accepted.outputs).toHaveLength(2);
      expect(accepted.job.reviewedAt).not.toBeNull();

      const shown = await runShow(queued.job.id, fixture.root);
      expect(shown.outputs.map((o) => o.path)).toEqual([
        "learn/assets/accepted.svg",
        "learn/assets/accepted.tldr",
      ]);
      expect(shown.outputs.every((o) => o.current === true)).toBe(true);
      expect(shown.next).toEqual([]);
    });

    it("leaves the job in awaiting_review when an output will not resolve", async () => {
      await fixture.write("learn/assets/rollback.tldr", tldr({ title: "no topic here" }));
      const queued = await enqueue({ target: "learn/assets/rollback.tldr" });
      await runClaim({ jobId: queued.job.id });
      await runFinish({ jobId: queued.job.id, state: "awaiting_review" });

      await expect(
        runAccept({
          jobId: queued.job.id,
          paths: ["learn/assets/rollback.tldr"],
          repoRoot: fixture.root,
        }),
      ).rejects.toThrow(/names no topic/);

      const rows = await scratch.db.select().from(job).where(eq(job.id, queued.job.id));
      expect(rows[0]!.state).toBe("awaiting_review");
      expect(
        await scratch.db.select().from(assetJob).where(eq(assetJob.jobId, queued.job.id)),
      ).toHaveLength(0);
    });

    it("notices when the bytes on disk stopped matching what the job wrote", async () => {
      await fixture.write("learn/assets/edited.tldr", tldr({ topic: "alpha" }));
      const queued = await enqueue({ target: "learn/assets/edited.tldr" });
      await runClaim({ jobId: queued.job.id });
      await runFinish({ jobId: queued.job.id, state: "awaiting_review" });
      await runAccept({
        jobId: queued.job.id,
        paths: ["learn/assets/edited.tldr"],
        repoRoot: fixture.root,
      });

      await fixture.write(
        "learn/assets/edited.tldr",
        tldr({ topic: "alpha", title: "someone opened the mirror" }),
      );
      const shown = await runShow(queued.job.id, fixture.root);
      expect(shown.outputs[0]!.current).toBe(false);
    });
  });

  describe("ls", () => {
    it("filters by state and bounds what it returns", async () => {
      const a = await enqueue({ target: "learn/assets/a.tldr" });
      await enqueue({ target: "learn/assets/b.tldr" });
      await runClaim({ jobId: a.job.id });

      const running = await runList({ state: "running" });
      expect(running.jobs.map((j) => j.id)).toEqual([a.job.id]);
      expect(running.total).toBe(1);

      const limited = await runList({ limit: 1 });
      expect(limited.jobs).toHaveLength(1);
      expect(limited.total).toBe(2);

      await expect(runList({ state: "nonsense" })).rejects.toThrow(/unknown job state/);
    });
  });

  describe("what cannot be deleted", () => {
    it("refuses to delete a session an event points at", async () => {
      await ensureSession(scratch.db, { id: "with-events" });
      await scratch.db.insert(event).values({
        learnerId: LOCAL_LEARNER_ID,
        type: "session-start",
        sessionId: "with-events",
        payload: {},
      });
      const error = await scratch.db
        .delete(session)
        .where(eq(session.id, "with-events"))
        .catch((e: unknown) => e);
      expect(sqlstate(error)).toBe("23503");
      expect(sqlMessage(error)).toContain("event_session_id_session_id_fk");
    });

    it("refuses to delete a session a job ran under", async () => {
      await ensureSession(scratch.db, { id: "with-a-job", kind: "studio" });
      const queued = await enqueue({ target: "learn/assets/owned.tldr" });
      await runClaim({ jobId: queued.job.id, sessionId: "with-a-job" });
      const error = await scratch.db
        .delete(session)
        .where(eq(session.id, "with-a-job"))
        .catch((e: unknown) => e);
      expect(sqlstate(error)).toBe("23503");
      expect(sqlMessage(error)).toContain("job_session_id_session_id_fk");
    });

    it("refuses to delete a job that produced something", async () => {
      await fixture.write("learn/assets/attributed.tldr", tldr({ topic: "alpha" }));
      const queued = await enqueue({ target: "learn/assets/attributed.tldr" });
      await runClaim({ jobId: queued.job.id });
      await runFinish({ jobId: queued.job.id, state: "awaiting_review" });
      await runAccept({
        jobId: queued.job.id,
        paths: ["learn/assets/attributed.tldr"],
        repoRoot: fixture.root,
      });
      const error = await scratch.db
        .delete(job)
        .where(eq(job.id, queued.job.id))
        .catch((e: unknown) => e);
      expect(sqlstate(error)).toBe("23503");
      expect(sqlMessage(error)).toContain("asset_job_job_id_job_id_fk");
    });

    it("takes the provenance with the asset, because that row is derived", async () => {
      await fixture.write("learn/assets/pruned.tldr", tldr({ topic: "alpha" }));
      const queued = await enqueue({ target: "learn/assets/pruned.tldr" });
      await runClaim({ jobId: queued.job.id });
      await runFinish({ jobId: queued.job.id, state: "awaiting_review" });
      await runAccept({
        jobId: queued.job.id,
        paths: ["learn/assets/pruned.tldr"],
        repoRoot: fixture.root,
      });
      await scratch.db.delete(asset).where(eq(asset.id, "diagram:learn/assets/pruned.tldr"));
      expect(
        await scratch.db.select().from(assetJob).where(eq(assetJob.jobId, queued.job.id)),
      ).toHaveLength(0);
    });
  });

  describe("the session lifecycle", () => {
    it("creates a session on first reference and never reopens a closed one", async () => {
      await ensureSession(scratch.db, { id: "lifecycle", title: "first" });
      await ensureSession(scratch.db, { id: "lifecycle", title: "second" });
      const rows = await scratch.db.select().from(session).where(eq(session.id, "lifecycle"));
      expect(rows).toHaveLength(1);
      expect(rows[0]!.title).toBe("first");

      const closed = await endSession(scratch.db, "lifecycle", "closed");
      expect(closed).toMatchObject({ moved: true, from: "running" });
      // A replayed close moves nothing rather than moving `ended_at` to now.
      const again = await endSession(scratch.db, "lifecycle", "closed");
      expect(again.moved).toBe(false);
      expect(SESSION_TRANSITIONS.closed).toEqual([]);
    });

    it("refuses a running session that claims to have ended", async () => {
      const error = await scratch.db
        .insert(session)
        .values({
          id: "impossible",
          kind: "tutor",
          learnerId: LOCAL_LEARNER_ID,
          state: "running",
          endedAt: new Date(),
        })
        .catch((e: unknown) => e);
      expect(sqlstate(error)).toBe("23514");
      expect(sqlMessage(error)).toContain("session_ended_at_check");
    });

    it("refuses a kind or a state outside the vocabulary", async () => {
      const kind = await scratch.db
        .insert(session)
        .values({ id: "odd-kind", kind: "robot", learnerId: LOCAL_LEARNER_ID })
        .catch((e: unknown) => e);
      expect(sqlMessage(kind)).toContain("session_kind_check");

      const state = await scratch.db
        .insert(session)
        .values({ id: "odd-state", kind: "tutor", learnerId: LOCAL_LEARNER_ID, state: "vibing" })
        .catch((e: unknown) => e);
      expect(sqlMessage(state)).toContain("session_state_check");
    });
  });
});

/**
 * The backfill, against a database that already has a log.
 *
 * This is the case the migration exists for and the one a fresh database can
 * never show: `event.session_id` was free text for six migrations, the rows
 * holding those values are in an append-only table, and the foreign key cannot
 * land until every one of them resolves.
 */
describe.skipIf(!reachable.ok)("migration 0006's backfill", () => {
  let scratch: Scratch;
  let folder: string;

  beforeAll(async () => {
    scratch = await createScratchDatabase();
    // Stop at 0005, which is where `event.session_id` is still free text.
    folder = await partialMigrations(6);
    await applyMigrations(scratch.db, { folder });

    await scratch.db.insert(learner).values({ id: LOCAL_LEARNER_ID }).onConflictDoNothing();
    const at = (iso: string) => new Date(iso);
    await scratch.db.insert(event).values([
      {
        at: at("2026-08-19T10:00:00Z"),
        learnerId: LOCAL_LEARNER_ID,
        type: "session-start",
        sessionId: "closed-one",
        payload: {},
      },
      {
        at: at("2026-08-19T11:00:00Z"),
        learnerId: LOCAL_LEARNER_ID,
        type: "session-close",
        sessionId: "closed-one",
        payload: {},
      },
      {
        at: at("2026-08-20T09:00:00Z"),
        learnerId: LOCAL_LEARNER_ID,
        type: "session-start",
        sessionId: "never-closed",
        payload: {},
      },
      // An event with no session at all, which must produce no row.
      {
        at: at("2026-08-20T09:30:00Z"),
        learnerId: LOCAL_LEARNER_ID,
        type: "observation",
        sessionId: null,
        payload: { correct: true },
      },
    ]);

    await applyMigrations(scratch.db);
  }, 60_000);

  afterAll(async () => {
    await scratch?.drop();
    await rm(folder, { recursive: true, force: true });
  });

  it("applies cleanly and leaves nothing pending", async () => {
    const status = await migrationStatus(scratch.db);
    expect(status.pending).toEqual([]);
    expect(status.head).toBe("0006_studio_jobs");
  });

  it("makes one tutor session per distinct session id, and none for the nulls", async () => {
    const rows = await scratch.db.select().from(session).orderBy(session.id);
    expect(rows.map((r) => r.id)).toEqual(["closed-one", "never-closed"]);
    expect(rows.every((r) => r.kind === "tutor")).toBe(true);
    expect(rows.every((r) => r.learnerId === LOCAL_LEARNER_ID)).toBe(true);
  });

  it("reads a session-close as closed and its absence as interrupted", async () => {
    const [closed] = await scratch.db.select().from(session).where(eq(session.id, "closed-one"));
    expect(closed!.state).toBe("closed");
    expect(closed!.startedAt.toISOString()).toBe("2026-08-19T10:00:00.000Z");
    expect(closed!.endedAt?.toISOString()).toBe("2026-08-19T11:00:00.000Z");

    const [open] = await scratch.db.select().from(session).where(eq(session.id, "never-closed"));
    // Interrupted with no `ended_at`: nothing in the log says when it stopped,
    // and inventing an instant would be worse than saying nothing.
    expect(open!.state).toBe("interrupted");
    expect(open!.endedAt).toBeNull();
  });

  it("leaves the foreign key holding afterwards", async () => {
    const error = await scratch.db
      .insert(event)
      .values({
        learnerId: LOCAL_LEARNER_ID,
        type: "observation",
        sessionId: "a-session-nobody-opened",
        payload: {},
      })
      .catch((e: unknown) => e);
    expect(sqlstate(error)).toBe("23503");
  });
});

/**
 * The same migration against a database whose `event` table is empty, which is
 * every fresh clone and every CI run. The backfill has to be a no-op there
 * rather than an error.
 */
describe.skipIf(!reachable.ok)("migration 0006 on an empty log", () => {
  let scratch: Scratch;
  let folder: string;

  beforeAll(async () => {
    scratch = await createScratchDatabase();
    folder = await partialMigrations(6);
    await applyMigrations(scratch.db, { folder });
    await applyMigrations(scratch.db);
  }, 60_000);

  afterAll(async () => {
    await scratch?.drop();
    await rm(folder, { recursive: true, force: true });
  });

  it("applies with no sessions to make", async () => {
    const { rows } = await scratch.db.execute<{ n: number }>(
      sql`select count(*)::int as n from "session"`,
    );
    expect(rows[0]?.n).toBe(0);
    expect((await migrationStatus(scratch.db)).pending).toEqual([]);
  });
});

describe.runIf(!reachable.ok)("the studio schema (skipped)", () => {
  it.skip(`needs Postgres — ${reachable.reason}`, () => {});
});
