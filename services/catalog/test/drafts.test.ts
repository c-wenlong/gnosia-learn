import { mkdir } from "node:fs/promises";
import path from "node:path";

import { draft, job, learner, LOCAL_LEARNER_ID, topic } from "@self-learn/schema";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { draftRow, runDraftList, runDraftShow, runDraftUpsert, type DraftDocument } from "../src/commands/draft";
import { runEnqueue, runShow } from "../src/commands/job";
import { applyMigrations } from "../src/migrations";
import { makeFixture, type Fixture } from "./fixture-tree";
import { createScratchDatabase, probe, type Scratch, sqlstate } from "./scratch-database";

/**
 * `catalog draft` and `job.draft_id` (docs/STUDIO-CHAT-FIRST.md, phase 1).
 *
 * The draft verbs are the mirror of the runner's `draft.json`, one owner's
 * at a time: another owner's draft is "no draft" to every verb, and an id
 * another owner holds is refused without naming them.
 */

const reachable = await probe();
const OTHER = "owner-b";

describe.skipIf(!reachable.ok)("catalog draft", () => {
  let scratch: Scratch;
  let previousUrl: string | undefined;
  let fixture: Fixture;

  beforeAll(async () => {
    scratch = await createScratchDatabase();
    await applyMigrations(scratch.db);
    previousUrl = process.env["DATABASE_URL"];
    process.env["DATABASE_URL"] = scratch.url;
    fixture = await makeFixture();
    await mkdir(path.join(fixture.root, "learn", "assets"), { recursive: true });
    await scratch.db.insert(learner).values([{ id: LOCAL_LEARNER_ID }, { id: OTHER }]).onConflictDoNothing();
    await scratch.db.insert(topic).values({ slug: "alpha", title: "Alpha", domain: "foundations" });
  }, 60_000);

  afterAll(async () => {
    if (previousUrl === undefined) delete process.env["DATABASE_URL"];
    else process.env["DATABASE_URL"] = previousUrl;
    await fixture?.cleanup();
    await scratch?.drop();
  });

  beforeEach(async () => {
    await scratch.db.delete(job);
    await scratch.db.delete(draft);
  });

  const doc = (id: string, overrides: Partial<DraftDocument> = {}): DraftDocument => ({
    id,
    state: "open",
    kind: "diagram",
    plannerSessionId: "11111111-2222-4333-8444-555555555555",
    transcriptPath: `drafts/${id}/transcript.ndjson`,
    turns: 0,
    ...overrides,
  });

  it("records a draft, then updates it in place", async () => {
    const first = await runDraftUpsert(doc("d-one"));
    expect(first.created).toBe(true);
    expect(first.draft).toMatchObject({ id: "d-one", state: "open", kind: "diagram", turns: 0, jobId: null });

    const brief = { title: "Tunnels", topic: "alpha", slug: "tunnels" };
    const second = await runDraftUpsert(
      doc("d-one", { state: "briefed", title: "Tunnels", brief, briefAt: new Date().toISOString(), turns: 2, costUsd: 0.07, costSource: "result" }),
    );
    expect(second.created).toBe(false);
    expect(second.draft).toMatchObject({ state: "briefed", turns: 2, costUsd: 0.07, costSource: "result", title: "Tunnels" });
    const shown = await runDraftShow("d-one");
    expect(shown.brief).toEqual(brief);
    expect(await scratch.db.select().from(draft)).toHaveLength(1);
  });

  it("refuses a transcript anywhere but the draft's own, a cost with no figure, and a pending topic with no brief", () => {
    expect(() => draftRow(doc("d-two", { transcriptPath: "drafts/other/transcript.ndjson" }))).toThrow(/not this draft's transcript/);
    expect(() => draftRow(doc("d-two", { costSource: "result" }))).toThrow(/costUsd/);
    expect(() => draftRow(doc("d-two", { pendingTopic: { slug: "new-topic" } }))).toThrow(/pendingTopic/);
    expect(() => draftRow(doc("d-two", { state: "thinking" }))).toThrow(/unknown state/);
    expect(() => draftRow(doc("../escape"))).toThrow(/not a draft id/);
  });

  it("keeps each owner's drafts to that owner, and names nobody when it refuses", async () => {
    await runDraftUpsert(doc("d-theirs", { title: "Theirs" }), OTHER);
    await runDraftUpsert(doc("d-mine", { title: "Mine" }));

    await expect(runDraftShow("d-theirs")).rejects.toThrow(/no draft "d-theirs"/);
    const upsert = runDraftUpsert(doc("d-theirs", { title: "Taken over" }));
    await expect(upsert).rejects.toThrow(/already taken by another draft/);
    await expect(upsert).rejects.not.toThrow(new RegExp(OTHER));
    const [row] = await scratch.db.select().from(draft).where(eq(draft.id, "d-theirs"));
    expect(row?.title).toBe("Theirs");
    expect(row?.ownerId).toBe(OTHER);

    const mine = await runDraftList();
    expect(mine.drafts.map((d) => d.id)).toEqual(["d-mine"]);
    const theirs = await runDraftList({ owner: OTHER });
    expect(theirs.drafts.map((d) => d.id)).toEqual(["d-theirs"]);
    expect((await runDraftList({ state: "briefed" })).total).toBe(0);
  });

  it("links a job to its draft, reports the newest as the draft's job, and survives the draft going", async () => {
    await runDraftUpsert(doc("d-draws", { state: "briefed", brief: { slug: "one" } }));
    const first = await runEnqueue({
      brief: { kind: "diagram", topic: "alpha", target: "learn/assets/one.tldr", idempotencyKey: "k-1", draft: "d-draws" },
      repoRoot: fixture.root,
    });
    expect(first.job.draft).toBe("d-draws");
    expect((await runShow(first.job.id)).job.draft).toBe("d-draws");
    // A second job from the same conversation, later: the newest is the draft's.
    await scratch.db.update(job).set({ state: "failed", finishedAt: new Date(), startedAt: new Date() }).where(eq(job.id, first.job.id));
    const second = await runEnqueue({
      brief: { kind: "diagram", topic: "alpha", target: "learn/assets/one.tldr", idempotencyKey: "k-2", draft: "d-draws" },
      repoRoot: fixture.root,
    });
    const shown = await runDraftShow("d-draws");
    expect(shown.jobs).toEqual([second.job.id, first.job.id]);
    expect(shown.draft.jobId).toBe(second.job.id);
    expect((await runDraftList()).drafts[0]?.jobId).toBe(second.job.id);

    // ON DELETE SET NULL: pruning a conversation never takes a job with it.
    await scratch.db.delete(draft).where(eq(draft.id, "d-draws"));
    const [kept] = await scratch.db.select().from(job).where(eq(job.id, second.job.id));
    expect(kept?.draftId).toBeNull();
  });

  it("refuses a job naming a draft that is missing or another owner's", async () => {
    await runDraftUpsert(doc("d-theirs"), OTHER);
    for (const name of ["d-missing", "d-theirs"]) {
      await expect(
        runEnqueue({
          brief: { kind: "diagram", topic: "alpha", target: "learn/assets/two.tldr", idempotencyKey: `k-${name}`, draft: name },
          repoRoot: fixture.root,
        }),
      ).rejects.toThrow(new RegExp(`no draft "${name}"`));
    }
    expect(await scratch.db.select().from(job)).toHaveLength(0);
  });

  it("holds the paired checks in the table itself", async () => {
    const insert = (values: Partial<typeof draft.$inferInsert>) =>
      scratch.db.insert(draft).values({
        id: "d-raw",
        plannerSessionId: "s",
        transcriptPath: "drafts/d-raw/transcript.ndjson",
        ...values,
      });
    for (const bad of [{ state: "thinking" }, { costSource: "result" }, { pendingTopic: { slug: "x" } }, { turns: -1 }, { errorKind: "gate" }]) {
      const error = await insert(bad).catch((caught: unknown) => caught);
      expect(sqlstate(error), JSON.stringify(bad)).toBe("23514");
    }
  });
});
