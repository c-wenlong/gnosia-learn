import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { fsStore, type BlobStore } from "@self-learn/blob";

import {
  asset,
  assetJob,
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

import {
  briefCandidate,
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
import { putDiagram } from "../src/content/diagrams";
import { applyMigrations, migrationStatus } from "../src/migrations";
import { endSession, ensureSession } from "../src/state/sessions";
import { makeFixture, topicsYaml, type Fixture } from "./fixture-tree";
import { partialMigrations } from "./partial-migrations";
import { createScratchDatabase, markImported, probe, type Scratch, sqlMessage, sqlstate } from "./scratch-database";

/**
 * The studio schema, the job lifecycle, and accept over what
 * `catalog diagram put --job` landed.
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
      .values({ slug: "dot-product", title: "The dot product", topicSlug: "alpha", path: "learn/concepts/dot-product.md" });
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
    it("queues a job and derives the candidate path from its id and target", async () => {
      const result = await enqueue({ target: "learn/assets/queued.tldr" });
      expect(result.created).toBe(true);
      expect(result.job.state).toBe("queued");
      // The job's own workspace, relative to the runner's STUDIO_HOME: nothing
      // under learn/ and no machine path in the row.
      expect(result.job.candidatePath).toBe(`jobs/${result.job.id}/candidate/queued.tldr`);
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

    it("refuses any candidate but the job's own workspace path", async () => {
      const own = "jobs/job-1/candidate/x.tldr";
      expect(briefCandidate(own, "job-1", "learn/assets/x.tldr")).toBe(own);
      // The old convention is refused by name, so a stale brief says what moved.
      expect(() =>
        briefCandidate("learn/assets/.candidates/x.tldr", "job-1", "learn/assets/x.tldr"),
      ).toThrow(/not this job's candidate.*jobs\/job-1\/candidate\/x\.tldr/);
      // Another job's workspace, the target itself, and the SVG are all refused.
      expect(() => briefCandidate("jobs/job-2/candidate/x.tldr", "job-1", "learn/assets/x.tldr")).toThrow(
        /not this job's candidate/,
      );
      expect(() => briefCandidate("learn/assets/x.tldr", "job-1", "learn/assets/x.tldr")).toThrow(
        /not this job's candidate/,
      );
      expect(() => briefCandidate("jobs/job-1/candidate/x.svg", "job-1", "learn/assets/x.tldr")).toThrow(
        /not this job's candidate/,
      );
      // Absolute, even when it ends in the right place: the catalog cannot tell
      // a runner's STUDIO_HOME from any other directory.
      expect(() =>
        briefCandidate("/Users/someone/.studio/jobs/job-1/candidate/x.tldr", "job-1", "learn/assets/x.tldr"),
      ).toThrow(/absolute/);
      await expect(
        enqueue({ target: "learn/assets/bad-candidate.tldr", candidate: "../escape.tldr" }),
      ).rejects.toThrow(/not this job's candidate/);
    });

    it("accepts a brief that names its own candidate", async () => {
      const result = await enqueue({
        id: "named-job",
        target: "learn/assets/named.tldr",
        candidate: "jobs/named-job/candidate/named.tldr",
      });
      expect(result.job.candidatePath).toBe("jobs/named-job/candidate/named.tldr");
    });

    it("refuses an id that is not one path segment, since it names the job's workspace", async () => {
      for (const id of ["../escape", "a/b", ".hidden", "x".repeat(65)]) {
        await expect(enqueue({ id, target: "learn/assets/odd-id.tldr" })).rejects.toThrow(/is not a job id/);
      }
    });

    it("refuses a target outside learn/assets, or one that is not a .tldr", () => {
      expect(() => briefTarget("learn/assets/deep/x.tldr")).toThrow(/directly inside/);
      expect(() => briefTarget("../outside.tldr")).toThrow(/repo-relative/);
      expect(() => briefTarget("learn/assets/x.svg")).toThrow(/not a \.tldr/);
      expect(candidateFor("job-1", "learn/assets/x.tldr")).toBe("jobs/job-1/candidate/x.tldr");
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

    it("refuses a candidate override on finish that leaves the job's workspace", async () => {
      const queued = await enqueue({ target: "learn/assets/finish-candidate.tldr" });
      await runClaim({ jobId: queued.job.id });
      await expect(
        runFinish({
          jobId: queued.job.id,
          state: "awaiting_review",
          candidatePath: "learn/assets/finish-candidate.tldr",
        }),
      ).rejects.toThrow(/not this job's candidate/);
      const finished = await runFinish({
        jobId: queued.job.id,
        state: "awaiting_review",
        candidatePath: `jobs/${queued.job.id}/candidate/finish-candidate.tldr`,
      });
      expect(finished.job.candidatePath).toBe(`jobs/${queued.job.id}/candidate/finish-candidate.tldr`);
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
    // The head moves with every migration and this assertion is about the
    // backfill in 0006 having *run*, not about it being the last thing in the
    // folder. Pinning the name made every later migration fail a test about
    // something else; pinning 0006's presence says what was meant.
    expect(status.applied).toContain("0006_studio_jobs");
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

/**
 * Accept over what `catalog diagram put --job` landed, on a database of its
 * own: every put leaves `content_revision` rows naming the job, and that table
 * is append-only with a restricting foreign key to `job`, so these jobs cannot
 * be cleared between tests the way the suite above clears its own.
 */
describe.skipIf(!reachable.ok)("accept over a landed diagram", () => {
  let scratch: Scratch;
  let previousUrl: string | undefined;
  let fixture: Fixture;
  let blobs: string;
  let store: BlobStore;

  beforeAll(async () => {
    scratch = await createScratchDatabase();
    await applyMigrations(scratch.db);
    previousUrl = process.env["DATABASE_URL"];
    process.env["DATABASE_URL"] = scratch.url;
    blobs = await mkdtemp(path.join(tmpdir(), "catalog-studio-blobs-"));
    store = fsStore(blobs);
    fixture = await makeFixture();
    await fixture.write("content/topics.yaml", topicsYaml([{ slug: "alpha", concepts: ["dot-product"] }, { slug: "beta" }]));
    await mkdir(path.join(fixture.root, "learn", "assets"), { recursive: true });
    await scratch.db.insert(learner).values({ id: LOCAL_LEARNER_ID }).onConflictDoNothing();
    await scratch.db.insert(topic).values([
      { slug: "alpha", title: "Alpha", domain: "foundations" },
      { slug: "beta", title: "Beta", domain: "foundations" },
    ]);
    await scratch.db
      .insert(concept)
      .values({ slug: "dot-product", title: "The dot product", path: "learn/concepts/dot-product.md", topicSlug: "alpha" });
    // The files still own diagrams here, so Accept's put writes them through
    // (D17) under the tree this database imported diagrams from.
    await markImported(scratch.db, "diagrams", fixture.root);
  }, 60_000);

  afterAll(async () => {
    if (previousUrl === undefined) delete process.env["DATABASE_URL"];
    else process.env["DATABASE_URL"] = previousUrl;
    await fixture?.cleanup();
    await scratch?.drop();
    if (blobs !== undefined) await rm(blobs, { recursive: true, force: true });
  });

  const enqueue = (target: string) =>
    runEnqueue({
      brief: { kind: "diagram", topic: "alpha", target, idempotencyKey: `key-${Math.random().toString(36).slice(2)}` },
      repoRoot: fixture.root,
    });

  /**
   * A job in `awaiting_review` whose target is `learn/assets/<stem>.tldr`,
   * and the landing an accept makes for it: `catalog diagram put --job`,
   * which writes the diagram, its asset rows and the job's `asset_job` rows.
   */
  async function readyJob(stem: string) {
    const queued = await enqueue(`learn/assets/${stem}.tldr`);
    await runClaim({ jobId: queued.job.id });
    await runFinish({ jobId: queued.job.id, state: "awaiting_review" });
    return queued.job.id;
  }

  async function land(jobId: string, stem: string, meta: Record<string, unknown>, svg?: string) {
    // The candidate sits in the job's workspace, as the runner leaves it, not
    // under learn/assets/: the put is what writes that.
    await fixture.write(`workspace/${stem}.tldr`, tldr(meta));
    if (svg !== undefined) await fixture.write(`workspace/${stem}.svg`, svg);
    return putDiagram(scratch.db, store, {
      slug: stem,
      tldr: path.join(fixture.root, `workspace/${stem}.tldr`),
      svg: svg === undefined ? null : path.join(fixture.root, `workspace/${stem}.svg`),
      jobId,
      reason: `accept ${jobId}`,
      author: LOCAL_LEARNER_ID,
      authorKind: "person",
    });
  }

  describe("accept", () => {
    it("moves the job once its outputs landed, and lists them", async () => {
      const jobId = await readyJob("accepted");
      await land(jobId, "accepted", { topic: "alpha", concepts: ["dot-product"] }, "<svg></svg>");

      const accepted = await runAccept({ jobId });
      expect(accepted.to).toBe("accepted");
      expect(accepted.outputs.map((o) => o.path)).toEqual([
        "learn/assets/accepted.svg",
        "learn/assets/accepted.tldr",
      ]);
      expect(accepted.job.reviewedAt).not.toBeNull();

      const shown = await runShow(jobId);
      expect(shown.outputs.every((o) => o.current === true)).toBe(true);
      expect(shown.next).toEqual([]);
    });

    it("refuses to accept a job with nothing to point at, and says how to land it", async () => {
      const jobId = await readyJob("empty-accept");
      await expect(runAccept({ jobId })).rejects.toThrow(/has no output to accept.*diagram put --slug empty-accept/s);
      const rows = await scratch.db.select().from(job).where(eq(job.id, jobId));
      expect(rows[0]!.state).toBe("awaiting_review");
    });

    it("lands nothing and leaves the job in awaiting_review when the output will not resolve", async () => {
      const jobId = await readyJob("rollback");
      await expect(land(jobId, "rollback", { title: "no topic here" })).rejects.toThrow(/names no topic/);
      await expect(land(jobId, "rollback", { topic: "beta" })).rejects.toThrow(/enqueued under "alpha"/);
      const rows = await scratch.db.select().from(job).where(eq(job.id, jobId));
      expect(rows[0]!.state).toBe("awaiting_review");
      expect(await scratch.db.select().from(assetJob).where(eq(assetJob.jobId, jobId))).toHaveLength(0);
    });

    it("never rewrites an accepted job's provenance: a changed put under its name is refused", async () => {
      const jobId = await readyJob("snapshot");
      await land(jobId, "snapshot", { topic: "alpha" });
      const accepted = await runAccept({ jobId });
      const landed = accepted.outputs[0]!.contentHash;

      await expect(land(jobId, "snapshot", { topic: "alpha", title: "edited afterwards" })).rejects.toThrow(
        /is accepted/,
      );
      const [row] = await scratch.db.select().from(assetJob).where(eq(assetJob.jobId, jobId));
      expect(row!.contentHash).toBe(landed);
      expect((await runShow(jobId)).outputs[0]!.current).toBe(true);
    });

    it("updates the claim while the job is still awaiting review", async () => {
      const jobId = await readyJob("provisional");
      await land(jobId, "provisional", { topic: "alpha" });
      const [first] = await scratch.db.select().from(assetJob).where(eq(assetJob.jobId, jobId));
      await land(jobId, "provisional", { topic: "alpha", title: "re-rendered before the verdict" });
      const [second] = await scratch.db.select().from(assetJob).where(eq(assetJob.jobId, jobId));
      expect(second!.contentHash).not.toBe(first!.contentHash);
    });

    it("notices when the diagram stopped holding what the job wrote", async () => {
      const jobId = await readyJob("edited");
      await land(jobId, "edited", { topic: "alpha" });
      await runAccept({ jobId });

      await fixture.write("learn/assets/edited.tldr", tldr({ topic: "alpha", title: "someone committed from the mirror" }));
      await putDiagram(scratch.db, store, {
        slug: "edited",
        tldr: path.join(fixture.root, "learn/assets/edited.tldr"),
        svg: null,
        reason: "an edit on the canvas",
        author: LOCAL_LEARNER_ID,
        authorKind: "person",
      });
      const shown = await runShow(jobId);
      expect(shown.outputs[0]!.current).toBe(false);
    });
  });

  describe("what cannot be deleted", () => {
    it("refuses to delete a job that produced something", async () => {
      const jobId = await readyJob("attributed");
      await land(jobId, "attributed", { topic: "alpha" });
      await runAccept({ jobId });
      const error = await scratch.db
        .delete(job)
        .where(eq(job.id, jobId))
        .catch((e: unknown) => e);
      expect(sqlstate(error)).toBe("23503");
      expect(sqlMessage(error)).toContain("asset_job_job_id_job_id_fk");
    });

    it("takes the provenance with the asset, because that row is derived", async () => {
      const jobId = await readyJob("pruned");
      await land(jobId, "pruned", { topic: "alpha" });
      await runAccept({ jobId });
      await scratch.db.delete(asset).where(eq(asset.id, "diagram:learn/assets/pruned.tldr"));
      expect(await scratch.db.select().from(assetJob).where(eq(assetJob.jobId, jobId))).toHaveLength(0);
    });
  });
});
