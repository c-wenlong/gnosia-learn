import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { fsStore } from "@self-learn/blob";
import {
  asset,
  COMMONS_OWNER,
  concept,
  conceptPrerequisite,
  contentRevision,
  curriculumItem,
  diagram,
  LOCAL_LEARNER_ID,
  ownerScope,
  progress,
  review,
  session,
  sessionLogEntry,
  topic,
} from "@self-learn/schema";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { checkoutDiagram, checkoutState, listDiagrams, readDiagramDocument } from "../src/content/diagrams";
import { noteText, readNoteRows } from "../src/content/note-rows";
import { cliScope, scopedRead } from "../src/content/scope";
import { connect } from "../src/db";
import { listLogIds } from "../src/content/session-logs";
import { applyMigrations } from "../src/migrations";
import {
  dueReviews,
  ensureLearner,
  importLegacyState,
  readProgress,
  resetCourse,
  setNote,
  setProgress,
  StateError,
  upsertRecap,
} from "../src/state";
import { createScratchDatabase, probe, type Scratch } from "./scratch-database";
import { ITEMS, seedContent, TOPIC_SLUG } from "./state-fixture";

/**
 * The read leaks the phase 4 review found, one case each (the fixes in
 * docs/CONTENT-MIGRATION.md, "Phase 4 review fixes, slice 1").
 *
 * The fixture is the owner, `local`, with a second owner `other` holding one
 * of each thing the review reached through a door that forgot to ask whose it
 * was: a concept the owner's note names as a prerequisite, a diagram, a
 * curriculum item, a session log, and a review card on the owner's concept.
 * The commons holds a diagram both may read.
 */

const reachable = await probe();

const OTHER = "other";
const LOCAL = ownerScope(LOCAL_LEARNER_ID);
const THEIRS = ownerScope(OTHER);

describe.skipIf(!reachable.ok)("reads that crossed owners", () => {
  let scratch: Scratch;
  let work: string;

  beforeAll(async () => {
    scratch = await createScratchDatabase();
    const db = scratch.db;
    await applyMigrations(db);
    await seedContent(db);
    await db.update(concept).set({ body: "A note.\n" });
    await ensureLearner(db, LOCAL_LEARNER_ID);
    await ensureLearner(db, OTHER);
    await ensureLearner(db, COMMONS_OWNER);
    await db.insert(topic).values({ slug: "other-topic", title: "Other's topic", domain: "other", ownerId: OTHER });
    await db.insert(concept).values({
      slug: "other-concept",
      title: "Other's concept",
      topicSlug: "other-topic",
      path: "learn/concepts/other/other-concept.md",
      body: "Other's note.\n",
      ownerId: OTHER,
    });
    // The owner's note names the other owner's concept, and the other way round.
    await db.insert(conceptPrerequisite).values([
      { conceptSlug: "alpha", prerequisiteSlug: "other-concept", kind: "requires", position: 5 },
      { conceptSlug: "beta", prerequisiteSlug: "other-concept", kind: "assumes", position: 6 },
      { conceptSlug: "other-concept", prerequisiteSlug: "alpha", kind: "requires", position: 1 },
    ]);
    await db.insert(diagram).values([
      { slug: "other-diagram", ownerId: OTHER, topicSlug: "other-topic", document: { records: [] }, documentHash: "a".repeat(64) },
      { slug: "shared-diagram", ownerId: COMMONS_OWNER, topicSlug: TOPIC_SLUG, document: { records: [] }, documentHash: "b".repeat(64) },
      { slug: "local-diagram", topicSlug: TOPIC_SLUG, document: { records: [] }, documentHash: "c".repeat(64) },
    ]);
    await db.insert(contentRevision).values({
      ownerId: OTHER,
      entityType: "diagram",
      entityId: "other-diagram",
      seq: 1,
      op: "create",
      snapshot: {},
      snapshotHash: "d".repeat(64),
      authorKind: "person",
      author: OTHER,
      reason: "theirs",
    });
    await db.insert(curriculumItem).values({ id: "other-item", collectionId: "fx-m1", position: 99, title: "Other's item", ownerId: OTHER });
    await db.insert(session).values([
      { id: "other-session", kind: "tutor", learnerId: OTHER, state: "closed" },
      { id: "local-session", kind: "tutor", learnerId: LOCAL_LEARNER_ID, state: "closed" },
    ]);
    await db.insert(sessionLogEntry).values([
      { sessionId: "other-session", seq: 1, markdown: "# theirs\n" },
      { sessionId: "local-session", seq: 1, markdown: "# mine\n" },
    ]);
    const due = new Date(Date.now() - 86_400_000);
    await db.insert(review).values([
      { learnerId: OTHER, conceptSlug: "alpha", repetitions: 0, ease: 2.5, intervalDays: 1, lapses: 0, due, leech: false },
      { learnerId: OTHER, conceptSlug: "other-concept", repetitions: 0, ease: 2.5, intervalDays: 1, lapses: 0, due, leech: false },
      { learnerId: LOCAL_LEARNER_ID, conceptSlug: "alpha", repetitions: 0, ease: 2.5, intervalDays: 1, lapses: 0, due, leech: false },
    ]);
    work = await mkdtemp(path.join(tmpdir(), "scope-reads-"));
  }, 120_000);

  afterAll(async () => {
    await scratch?.drop();
    if (work !== undefined) await rm(work, { recursive: true, force: true });
  });

  it("leaves a prerequisite the reader cannot open out of a rendered note, and keeps every edge unscoped", async () => {
    const [alpha] = await readNoteRows(scratch.db, ["alpha"], LOCAL.readable);
    expect(alpha?.requires).toEqual([]);
    const [beta] = await readNoteRows(scratch.db, ["beta"], LOCAL.readable);
    expect(beta?.requires).toEqual(["alpha"]);
    expect(beta?.assumes).toEqual([]);
    expect((await noteText(scratch.db, "alpha", LOCAL.readable))?.text).not.toContain("other-concept");
    // The other owner's own note loses the owner's concept the same way.
    const [theirs] = await readNoteRows(scratch.db, ["other-concept"], THEIRS.readable);
    expect(theirs?.requires).toEqual([]);
    // The export reads every owner and every edge.
    const [whole] = await readNoteRows(scratch.db, ["alpha"]);
    expect(whole?.requires).toEqual(["other-concept"]);
  });

  it("lists, reads and checks out only the diagrams the owner may read", async () => {
    expect((await listDiagrams(scratch.db, LOCAL)).map((d) => d.slug)).toEqual(["local-diagram", "shared-diagram"]);
    expect((await listDiagrams(scratch.db, THEIRS)).map((d) => d.slug)).toEqual(["other-diagram", "shared-diagram"]);
    expect(await listDiagrams(scratch.db, LOCAL, "other-diagram")).toEqual([]);
    expect(await readDiagramDocument(scratch.db, "other-diagram", LOCAL.readable)).toBeNull();
    expect(await readDiagramDocument(scratch.db, "other-diagram", THEIRS.readable)).not.toBeNull();
    // Asked with no owners, a writer's "is this slug taken" still sees it.
    expect(await readDiagramDocument(scratch.db, "other-diagram")).not.toBeNull();

    // A checkout of another owner's slug is a slug with no diagram: no file,
    // no revision number, nothing of the document.
    const store = fsStore(path.join(work, "blobs"));
    const state = await checkoutState(scratch.db, "other-diagram", work, LOCAL);
    expect(state.latest).toBeNull();
    const out = await checkoutDiagram(scratch.db, store, "other-diagram", work, LOCAL);
    expect(out).toMatchObject({ exists: false, revision: null });
    expect(await stat(path.join(work, "other-diagram.tldr")).catch(() => null)).toBeNull();
    expect((await checkoutState(scratch.db, "other-diagram", work, THEIRS)).latest).not.toBeNull();

    // A clean checkout of that slug already on disk (from before owners were
    // scoped) is left exactly as it is, not cleared as if the diagram were gone.
    const kept = path.join(work, "kept");
    await mkdir(kept, { recursive: true });
    await writeFile(path.join(kept, "other-diagram.tldr"), "{}");
    await writeFile(path.join(kept, "other-diagram.svg"), "<svg/>");
    const record = { slug: "other-diagram", revision: 1, documentHash: null, fileHash: null, svgHash: null, checkedOutAt: "" };
    await writeFile(path.join(kept, "other-diagram.checkout.json"), JSON.stringify(record));
    const left = await checkoutDiagram(scratch.db, store, "other-diagram", kept, LOCAL);
    expect(left).toMatchObject({ exists: false, written: false });
    expect(await readFile(path.join(kept, "other-diagram.tldr"), "utf8")).toBe("{}");
    expect(await readFile(path.join(kept, "other-diagram.svg"), "utf8")).toBe("<svg/>");
    expect(JSON.parse(await readFile(path.join(kept, "other-diagram.checkout.json"), "utf8"))).toEqual(record);
  });

  it("refuses a learner's tick, note and recap on an item they cannot read, as on a missing one", async () => {
    const missing = setProgress(scratch.db, "no-such-item", true, { learnerId: LOCAL_LEARNER_ID });
    await expect(missing).rejects.toBeInstanceOf(StateError);
    const sentence = await missing.catch((error: Error) => error.message.replace("no-such-item", "X"));
    const foreign = setProgress(scratch.db, "other-item", true, { learnerId: LOCAL_LEARNER_ID });
    await expect(foreign).rejects.toBeInstanceOf(StateError);
    expect(await foreign.catch((error: Error) => error.message.replace("other-item", "X"))).toBe(sentence);
    await expect(setNote(scratch.db, "other-item", "mine", LOCAL_LEARNER_ID)).rejects.toBeInstanceOf(StateError);
    await expect(
      upsertRecap(scratch.db, "other-item", { summary: "x", keyPoints: [], questions: [], source: "manual" } as never, {
        learnerId: LOCAL_LEARNER_ID,
      }),
    ).rejects.toBeInstanceOf(StateError);
    expect(await scratch.db.select().from(progress).where(eq(progress.curriculumItemId, "other-item"))).toEqual([]);

    // The owner of the item ticks it, and the owner ticks their own.
    await setProgress(scratch.db, "other-item", true, { learnerId: OTHER });
    await setProgress(scratch.db, ITEMS[0], true, { learnerId: LOCAL_LEARNER_ID });
    expect((await readProgress(scratch.db, LOCAL_LEARNER_ID)).map((p) => p.curriculumItemId)).toEqual([ITEMS[0]]);

    // The legacy import reports another owner's item as unknown and stores nothing for it.
    const imported = await importLegacyState(
      scratch.db,
      { completed: { "other-item": true, [ITEMS[1]]: true } } as never,
      LOCAL_LEARNER_ID,
    );
    expect(imported.unknownItems).toEqual(["other-item"]);
    expect((await readProgress(scratch.db, LOCAL_LEARNER_ID)).map((p) => p.curriculumItemId).sort()).toEqual([...ITEMS]);

    // A reset names both, and clears only what the learner may read: its own two rows.
    expect((await resetCourse(scratch.db, [...ITEMS, "other-item"], LOCAL_LEARNER_ID)).cleared).toBe(2);
    expect((await readProgress(scratch.db, OTHER)).map((p) => p.curriculumItemId)).toEqual(["other-item"]);
  });

  it("lists no due card on a concept the learner cannot read", async () => {
    expect((await dueReviews(scratch.db, { learnerId: OTHER })).map((c) => c.conceptId)).toEqual(["other-concept"]);
    expect((await dueReviews(scratch.db, { learnerId: LOCAL_LEARNER_ID })).map((c) => c.conceptId)).toEqual(["alpha"]);
  });

  it("lists one learner's session logs, or every log for the export", async () => {
    expect(await listLogIds(scratch.db, LOCAL_LEARNER_ID)).toEqual(["local-session"]);
    expect(await listLogIds(scratch.db)).toEqual(["local-session", "other-session"]);
  });

  it("throws a query's own undefined column rather than reading every owner", async () => {
    // The failing query names `owner_id`, and drizzle's error message is the
    // whole SQL, which is what used to be read as "this database predates
    // owner_id" and answered unscoped. A fresh pool, so the answer comes from
    // asking the catalog rather than from an earlier read's cached one.
    const fresh = connect({ url: scratch.url });
    try {
      const typo = scopedRead(fresh.db, LOCAL.readable, async (owners) => {
        if (owners === undefined) return "every owner";
        await fresh.db.execute(sql`select nonexistent_column from asset where owner_id in (${LOCAL_LEARNER_ID})`);
        return "scoped";
      });
      await expect(typo).rejects.toThrow(/nonexistent_column/);
    } finally {
      await fresh.close();
    }
    // And the read itself still scopes.
    const ids = await scopedRead(scratch.db, LOCAL.readable, async (owners) =>
      (await scratch.db.select({ id: asset.id }).from(asset).where(sql`owner_id in (${sql.join((owners ?? []).map((o) => sql`${o}`), sql`, `)})`)).map((r) => r.id),
    );
    expect(ids).toEqual([]);
    expect(cliScope()).toEqual(LOCAL);
  });
});
