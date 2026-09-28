import { createHash } from "node:crypto";
import path from "node:path";

import {
  asset,
  assetConcept,
  blobObject,
  assetTopic,
  collection,
  collectionItem,
  collectionTag,
  COMMONS_OWNER,
  concept,
  conceptCurriculumItem,
  conceptPrerequisite,
  curriculumItem,
  curriculumItemTopic,
  indexRun,
  LOCAL_LEARNER_ID,
  manimkcTopic,
  mastery,
  assetJob,
  job,
  session,
  sessionLogEntry,
  tag,
  topic,
  topicRelation,
} from "@self-learn/schema";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { conceptsIndexer } from "../src/index/concepts";
import { coursesIndexer } from "../src/index/courses";
import { IndexError } from "../src/index/errors";
import { manimkcIndexer } from "../src/index/manimkc";
import type { SourceRows } from "../src/index/source";
import { sessionsIndexer } from "../src/index/sessions";
import { tagsIndexer } from "../src/index/tags";
import { topicsIndexer } from "../src/index/topics";
import { runIndex } from "../src/index/run";
import { writeSource } from "../src/index/writer";
import { applyMigrations } from "../src/migrations";
import { ensureLearner } from "../src/state";
import { makeFixture, note, tagsYaml, topicsYaml, type Fixture } from "./fixture-tree";
import { createScratchDatabase, probe, type Scratch } from "./scratch-database";

/**
 * `catalog import` is one owner's (phase 4 of docs/CONTENT-MIGRATION.md, D23,
 * D24). Ids are global, so a tree's rows share tables, and keys, with rows
 * another owner holds. The phase 4 review measured three ways an import by
 * `local` damaged a second owner, `other`, and the commons:
 *
 * 1. Before the flip, the concepts source re-stamped `other`'s concept as
 *    `local` and replaced its body, and pruned the commons' concept and
 *    `other`'s note asset.
 * 2. With courses on files, the courses source archived `other`'s course and
 *    cleared the link rows under it, and under `local`'s modules.
 * 3. After the flip, the manimkc prune deleted `other`'s video.
 *
 * Each is pinned here, against the writer the import runs, with the real
 * indexers' ownership (`owns`, `assetPrefix`). Plus the rules that make them
 * hold: a tree row on another owner's id, under another owner's parent, or
 * pointing at an entity the owner cannot read is refused by id; a prune that
 * would cascade into another owner's rows is refused by id; and the commons is
 * readable, so a link to it is fine.
 */

const reachable = await probe();
const OTHER = "other";

describe.skipIf(!reachable.ok)("an import touches only its owner's rows", () => {
  let scratch: Scratch;
  const db = () => scratch.db;

  beforeAll(async () => {
    scratch = await createScratchDatabase();
    await applyMigrations(scratch.db);
    await ensureLearner(scratch.db, LOCAL_LEARNER_ID);
    await ensureLearner(scratch.db, OTHER);
    await ensureLearner(scratch.db, COMMONS_OWNER);
  }, 60_000);

  afterAll(async () => {
    await scratch?.drop();
  });

  beforeEach(async () => {
    // The seam's guard is not armed on a scratch database that never flipped,
    // so plain deletes reset it. Revisions are append-only and stay, which
    // nothing here reads.
    for (const table of [
      mastery,
      conceptCurriculumItem,
      curriculumItemTopic,
      collectionItem,
      collectionTag,
      curriculumItem,
      collection,
      assetConcept,
      assetTopic,
      asset,
      conceptPrerequisite,
      concept,
      manimkcTopic,
      topicRelation,
      tag,
      topic,
      indexRun,
      blobObject,
    ]) {
      await scratch.db.delete(table);
    }
    await scratch.db.insert(topic).values([
      { slug: "mine", title: "Mine", domain: "one" },
      { slug: "shared", title: "Shared", domain: "one", ownerId: COMMONS_OWNER },
      { slug: "theirs", title: "Theirs", domain: "one", ownerId: OTHER },
    ]);
  });

  const note = (slug: string, topicSlug = "mine") => ({
    slug,
    title: slug,
    topicSlug,
    path: `learn/concepts/x/${slug}.md`,
    body: `# ${slug}\n`,
  });
  const noteAsset = (slug: string) => ({
    id: `note:learn/concepts/x/${slug}.md`,
    kind: "note" as const,
    path: `learn/concepts/x/${slug}.md`,
    sourceRepo: "self-learn" as const,
  });
  const concepts = (rows: SourceRows) => writeSource(db(), conceptsIndexer, rows, [], "learn/concepts");
  const refusal = (promise: Promise<unknown>) => promise.then(() => null, (e: unknown) => e);
  const conceptRow = async (slug: string) => (await db().select().from(concept).where(eq(concept.slug, slug)))[0];

  describe("case 1: the concepts source before the flip", () => {
    beforeEach(async () => {
      await db().insert(concept).values([
        note("a"),
        { ...note("theirs-note", "theirs"), ownerId: OTHER, body: "their private body\n" },
        { ...note("clash"), ownerId: OTHER, body: "their clash body\n" },
        { ...note("everyone", "shared"), ownerId: COMMONS_OWNER, body: "the commons' body\n" },
      ]);
      await db().insert(asset).values([
        noteAsset("a"),
        { ...noteAsset("theirs-note"), ownerId: OTHER },
        { ...noteAsset("everyone"), ownerId: COMMONS_OWNER },
      ]);
      await db().insert(assetConcept).values([
        { assetId: noteAsset("theirs-note").id, conceptSlug: "theirs-note" },
        { assetId: noteAsset("everyone").id, conceptSlug: "everyone" },
      ]);
    });

    it("refuses a note whose slug another owner holds, naming it, and rewrites nothing", async () => {
      const error = await refusal(concepts({ concept: [note("a"), note("clash")], asset: [noteAsset("a")] }));
      expect(error).toBeInstanceOf(IndexError);
      expect(String((error as Error).message)).toContain("concept clash is other's");
      const clash = await conceptRow("clash");
      expect(clash).toMatchObject({ ownerId: OTHER, body: "their clash body\n" });
    });

    it("prunes only the owner's notes: another owner's and the commons' stay, bodies, assets and links", async () => {
      const write = await concepts({ concept: [note("b")], asset: [noteAsset("b")] });
      expect(write.deletedKeys.sort()).toEqual(["asset note:learn/concepts/x/a.md", "concept a"]);
      expect(await conceptRow("theirs-note")).toMatchObject({ ownerId: OTHER, body: "their private body\n" });
      expect(await conceptRow("everyone")).toMatchObject({ ownerId: COMMONS_OWNER, body: "the commons' body\n" });
      const assets = (await db().select({ id: asset.id, owner: asset.ownerId }).from(asset)).sort((x, y) =>
        x.id < y.id ? -1 : 1,
      );
      expect(assets).toEqual([
        { id: noteAsset("b").id, owner: LOCAL_LEARNER_ID },
        { id: noteAsset("everyone").id, owner: COMMONS_OWNER },
        { id: noteAsset("theirs-note").id, owner: OTHER },
      ]);
      expect((await db().select().from(assetConcept)).map((l) => l.conceptSlug).sort()).toEqual(["everyone", "theirs-note"]);
    });

    it("stamps every row it writes with its owner", async () => {
      await concepts({ concept: [note("a"), note("b")], asset: [noteAsset("a"), noteAsset("b")] });
      expect((await conceptRow("b"))?.ownerId).toBe(LOCAL_LEARNER_ID);
    });

    it("links to the commons, and refuses a prerequisite another owner holds", async () => {
      await concepts({
        concept: [note("a")],
        conceptPrerequisite: [{ conceptSlug: "a", prerequisiteSlug: "everyone", kind: "requires", position: 1 }],
      });
      expect(await db().select().from(conceptPrerequisite)).toHaveLength(1);
      const error = await refusal(
        concepts({
          concept: [note("a")],
          conceptPrerequisite: [{ conceptSlug: "a", prerequisiteSlug: "theirs-note", kind: "requires", position: 1 }],
        }),
      );
      expect(String((error as Error).message)).toContain(
        "concept_prerequisite from a to concept theirs-note, which is other's",
      );
    });

    it("keeps another owner's prerequisite under the owner's concept for doctor, rather than deleting it", async () => {
      // The mixed state D24 says no writer makes: a link under the owner's
      // concept to one it cannot read. Left for `catalog doctor`.
      await db().insert(conceptPrerequisite).values({ conceptSlug: "a", prerequisiteSlug: "theirs-note", kind: "requires" });
      await concepts({ concept: [note("a")], asset: [noteAsset("a")] });
      expect(await db().select().from(conceptPrerequisite)).toEqual([
        expect.objectContaining({ conceptSlug: "a", prerequisiteSlug: "theirs-note" }),
      ]);
    });

    it("refuses to prune a concept another learner has studied or linked to, naming them", async () => {
      await db().insert(concept).values(note("studied"));
      await db().insert(mastery).values({ learnerId: OTHER, conceptSlug: "studied", pL: 0.5, observations: 1, correct: 1 });
      await db().insert(conceptPrerequisite).values({ conceptSlug: "theirs-note", prerequisiteSlug: "a", kind: "requires" });
      const error = await refusal(concepts({ concept: [note("b")], asset: [noteAsset("a")] }));
      const message = String((error as Error).message);
      expect(message).toContain("concept_prerequisite from theirs-note to a");
      expect(message).toContain("mastery of studied for learner other");
      expect(await conceptRow("a")).toBeDefined();
      expect(await conceptRow("studied")).toBeDefined();
    });
  });

  describe("case 2: the courses source with courses on files", () => {
    beforeEach(async () => {
      await db().insert(tag).values([
        { id: "t-mine", label: "Mine", description: "mine" },
        { id: "t-theirs", label: "Theirs", description: "theirs", ownerId: OTHER },
      ]);
      await db().insert(concept).values([note("a"), { ...note("theirs-note", "theirs"), ownerId: OTHER }]);
      await db().insert(collection).values([
        { id: "c1", kind: "course", slug: "c1", title: "Mine" },
        { id: "c1-m1", kind: "module", slug: "m1", title: "Mine", parentId: "c1" },
        { id: "zq", kind: "course", slug: "zq", title: "Theirs", ownerId: OTHER },
        { id: "zq-m1", kind: "module", slug: "m1", title: "Theirs", parentId: "zq", ownerId: OTHER },
      ]);
      await db().insert(curriculumItem).values([
        { id: "c1-m1-t1", collectionId: "c1-m1", position: 0, title: "Mine" },
        { id: "zq-m1-t1", collectionId: "zq-m1", position: 0, title: "Theirs", ownerId: OTHER },
        // Grafted into the owner's module: the row is still theirs.
        { id: "zq-in-c1", collectionId: "c1-m1", position: 99, title: "Theirs, in mine", ownerId: OTHER },
      ]);
      await db().insert(asset).values({
        id: "link:zq-r1",
        kind: "link",
        url: "https://example.com/zq",
        sourceRepo: "self-learn",
        ownerId: OTHER,
      });
      await db().insert(collectionTag).values([
        { collectionId: "c1", tagId: "t-mine", position: 0 },
        { collectionId: "c1", tagId: "t-theirs", position: 1 },
        { collectionId: "zq", tagId: "t-theirs", position: 0 },
      ]);
      await db().insert(collectionItem).values([
        { collectionId: "c1-m1", position: 0, topicSlug: "mine", topicPosition: 1000 },
        { collectionId: "c1-m1", position: 99, assetId: "link:zq-r1" },
        { collectionId: "zq-m1", position: 0, topicSlug: "theirs", topicPosition: 1000 },
        { collectionId: "zq-m1", position: 1, assetId: "link:zq-r1" },
      ]);
      await db().insert(curriculumItemTopic).values([
        { curriculumItemId: "zq-m1-t1", topicSlug: "theirs" },
        { curriculumItemId: "zq-in-c1", topicSlug: "mine" },
      ]);
      await db().insert(conceptCurriculumItem).values([
        { conceptSlug: "theirs-note", curriculumItemId: "zq-m1-t1", position: 1 },
        { conceptSlug: "theirs-note", curriculumItemId: "c1-m1-t1", position: 99 },
        { conceptSlug: "a", curriculumItemId: "c1-m1-t1", position: 1 },
      ]);
    });

    /** The owner's course as its file says it now: the same, minus concept a on its item. */
    const tree = (): SourceRows => ({
      collection: [
        { id: "c1", kind: "course", slug: "c1", title: "Mine" },
        { id: "c1-m1", kind: "module", slug: "m1", title: "Mine", parentId: "c1" },
      ],
      curriculumItem: [{ id: "c1-m1-t1", collectionId: "c1-m1", position: 0, title: "Mine" }],
      collectionTag: [{ collectionId: "c1", tagId: "t-mine", position: 0 }],
      collectionItem: [{ collectionId: "c1-m1", position: 0, topicSlug: "mine", topicPosition: 1000 }],
    });
    const courses = (rows: SourceRows) =>
      writeSource(db(), coursesIndexer, rows, [], "content/courses", { tagLinksRewritten: true });

    it("archives nothing another owner holds and clears none of their links", async () => {
      const before = {
        tags: await db().select().from(collectionTag).where(eq(collectionTag.collectionId, "zq")),
        items: await db().select().from(collectionItem).where(eq(collectionItem.collectionId, "zq-m1")),
        topics: await db().select().from(curriculumItemTopic),
      };
      const write = await courses(tree());
      expect(write.archivedKeys).toEqual([]);
      const archived = await db().select({ id: collection.id }).from(collection).where(sql`${collection.archivedAt} is not null`);
      expect(archived).toEqual([]);
      const items = await db().select({ id: curriculumItem.id, archivedAt: curriculumItem.archivedAt }).from(curriculumItem);
      expect(items.every((i) => i.archivedAt === null)).toBe(true);
      expect(await db().select().from(collectionTag).where(eq(collectionTag.collectionId, "zq"))).toEqual(before.tags);
      expect(await db().select().from(collectionItem).where(eq(collectionItem.collectionId, "zq-m1"))).toEqual(before.items);
      expect(await db().select().from(curriculumItemTopic)).toEqual(before.topics);
    });

    it("replaces the owner's own links, and leaves the ones reaching another owner for doctor", async () => {
      await courses(tree());
      // The owner's item dropped concept a: gone. Their concept on the
      // owner's item, and their concept on their item, stay.
      const links = (await db().select().from(conceptCurriculumItem)).map((l) => `${l.conceptSlug}@${l.curriculumItemId}`).sort();
      expect(links).toEqual(["theirs-note@c1-m1-t1", "theirs-note@zq-m1-t1"]);
      // Their tag on the owner's course, and their link in the owner's module:
      // out of the owner's reach, so kept.
      const c1Tags = (await db().select().from(collectionTag).where(eq(collectionTag.collectionId, "c1"))).map((t) => t.tagId).sort();
      expect(c1Tags).toEqual(["t-mine", "t-theirs"]);
      const c1Items = await db().select().from(collectionItem).where(eq(collectionItem.collectionId, "c1-m1"));
      expect(c1Items.map((i) => i.assetId ?? i.topicSlug).sort()).toEqual(["link:zq-r1", "mine"]);
    });

    it("refuses a course file that names another owner's tag or concept, by id", async () => {
      const rows = tree();
      rows.collectionTag = [...(rows.collectionTag ?? []), { collectionId: "c1", tagId: "t-theirs", position: 1 }];
      const error = await refusal(courses(rows));
      expect(String((error as Error).message)).toContain("collection_tag");
      rows.collectionTag = [{ collectionId: "c1", tagId: "t-mine", position: 0 }];
      rows.conceptCurriculumItem = [{ conceptSlug: "theirs-note", curriculumItemId: "c1-m1-t1", position: 1 }];
      const second = String(((await refusal(courses(rows))) as Error).message);
      expect(second).toContain("concept_curriculum_item from c1-m1-t1 to concept theirs-note, which is other's");
    });

    it("refuses a course id another owner holds", async () => {
      const rows = tree();
      rows.collection = [...(rows.collection ?? []), { id: "zq", kind: "course", slug: "zq", title: "Mine now" }];
      const error = await refusal(courses(rows));
      expect(String((error as Error).message)).toContain("collection zq is other's");
      expect((await db().select().from(collection).where(eq(collection.id, "zq")))[0]?.title).toBe("Theirs");
    });

    it("refuses to prune the owner's tag while another owner's course wears it", async () => {
      await db().insert(collectionTag).values({ collectionId: "zq", tagId: "t-mine", position: 5 });
      const error = await refusal(writeSource(db(), tagsIndexer, { tag: [] }, [], "content/tags.yaml", { tagLinksRewritten: true }));
      expect(String((error as Error).message)).toContain("collection_tag from zq to t-mine");
      expect(await db().select().from(tag).where(eq(tag.id, "t-mine"))).toHaveLength(1);
    });
  });

  describe("case 3: the manimkc source after the flip", () => {
    /**
     * A video row as the contract (0013) has it: its blob named, under its
     * owner's prefix. `insert` also writes the blob row the key needs.
     */
    const video = (id: string, owner = LOCAL_LEARNER_ID) => {
      const sha256 = createHash("sha256").update(id).digest("hex");
      return {
        id: `manimkc:out/${id}.mp4`,
        kind: "video" as const,
        path: `out/${id}.mp4`,
        sourceRepo: "manimkc" as const,
        contentHash: sha256,
        bytes: id.length,
        blobKey: `${owner}/${sha256}.mp4`,
        ownerId: owner,
      };
    };
    const insert = async (rows: ReturnType<typeof video>[]) => {
      await db()
        .insert(blobObject)
        .values(
          rows.map((row) => ({
            key: row.blobKey,
            ownerId: row.ownerId,
            sha256: row.contentHash,
            bytes: row.bytes,
            mime: "video/mp4",
            provider: "fs",
            state: "present",
            confirmedAt: new Date(),
          })),
        )
        .onConflictDoNothing();
      await db().insert(asset).values(rows);
    };
    /** What the indexer hands over: no owner, which the writer stamps. */
    const produced = (row: ReturnType<typeof video>) => ({ ...row, ownerId: undefined });

    it("prunes the owner's stale videos and never another owner's", async () => {
      await insert([video("gone"), video("kept"), video("zq_other", OTHER), video("everyone", COMMONS_OWNER)]);
      const write = await writeSource(db(), manimkcIndexer, { asset: [produced(video("kept"))] }, [], "manimkc");
      expect(write.deletedKeys).toEqual(["asset manimkc:out/gone.mp4"]);
      const left = (await db().select({ id: asset.id }).from(asset)).map((a) => a.id).sort();
      expect(left).toEqual(["manimkc:out/everyone.mp4", "manimkc:out/kept.mp4", "manimkc:out/zq_other.mp4"]);
    });

    it("refuses a render whose path another owner's video holds", async () => {
      await insert([video("zq_other", OTHER)]);
      const mine = video("zq_other");
      await db()
        .insert(blobObject)
        .values({ key: mine.blobKey, ownerId: LOCAL_LEARNER_ID, sha256: mine.contentHash, bytes: mine.bytes, mime: "video/mp4", provider: "fs", state: "present", confirmedAt: new Date() })
        .onConflictDoNothing();
      const error = await refusal(writeSource(db(), manimkcIndexer, { asset: [produced(mine)] }, [], "manimkc"));
      expect(String((error as Error).message)).toContain("asset manimkc:out/zq_other.mp4 is other's");
      const [row] = await db().select().from(asset).where(eq(asset.id, mine.id));
      expect(row?.ownerId).toBe(OTHER);
      expect(row?.blobKey?.startsWith(`${OTHER}/`)).toBe(true);
    });

    it("refuses to prune the owner's video while another owner's job record of it exists", async () => {
      await insert([video("gone")]);
      await db().insert(job).values({
        id: "zq-job",
        kind: "diagram",
        state: "accepted",
        topicSlug: "theirs",
        targetPath: "learn/assets/zq.tldr",
        idempotencyKey: "zq-job",
        ownerId: OTHER,
      });
      await db().insert(assetJob).values({
        assetId: video("gone").id,
        jobId: "zq-job",
        contentHash: "0".repeat(64),
        bytes: 1,
        ownerId: OTHER,
      });
      const error = await refusal(writeSource(db(), manimkcIndexer, { asset: [] }, [], "manimkc"));
      expect(String((error as Error).message)).toContain("asset_job of manimkc:out/gone.mp4 (job zq-job, other's)");
      expect(await db().select().from(assetJob)).toHaveLength(1);
      await db().delete(assetJob);
      await db().delete(job).where(eq(job.id, "zq-job"));
    });

    it("refuses a row an indexer stamped with a blob key under another owner's prefix", async () => {
      const row = { ...produced(video("kept")), blobKey: `${OTHER}/${"a".repeat(64)}.mp4` };
      const error = await refusal(writeSource(db(), manimkcIndexer, { asset: [row] }, [], "manimkc"));
      expect(String((error as Error).message)).toContain(`naming blob ${OTHER}/`);
    });
  });

  describe("the sessions source", () => {
    const log = (id: string, markdown: string) => ({
      id,
      path: `learn/sessions/${id}.md`,
      markdown,
      title: null,
      goal: null,
      date: null,
    });
    const sessions = (logs: ReturnType<typeof log>[]) =>
      writeSource(db(), sessionsIndexer, {}, [], "learn/sessions", { logs });

    beforeEach(async () => {
      await db().execute(sql`delete from session where id in ('zq-other-session', 'mine-session')`).catch(() => {});
      await db().insert(session).values({ id: "zq-other-session", kind: "tutor", learnerId: OTHER, state: "closed" }).onConflictDoNothing();
      const [entry] = await db().select().from(sessionLogEntry).where(eq(sessionLogEntry.sessionId, "zq-other-session"));
      if (entry === undefined) {
        await db().insert(sessionLogEntry).values({ sessionId: "zq-other-session", seq: 1, markdown: "# theirs\n" });
      }
    });

    it("does not call another learner's log gone because the owner's tree lacks it", async () => {
      const write = await sessions([log("mine-session", "# mine\n")]);
      expect(write.written["session_log_entry"]).toBe(1);
      const [mine] = await db().select().from(session).where(eq(session.id, "mine-session"));
      expect(mine?.learnerId).toBe(LOCAL_LEARNER_ID);
    });

    it("refuses a file whose id is another learner's session, rather than appending to their log", async () => {
      const error = await refusal(sessions([log("zq-other-session", "# theirs\nand more from the owner\n")]));
      expect(String((error as Error).message)).toContain(`session "zq-other-session" is other's`);
      const entries = await db().select().from(sessionLogEntry).where(eq(sessionLogEntry.sessionId, "zq-other-session"));
      expect(entries.map((e) => e.markdown)).toEqual(["# theirs\n"]);
    });
  });

  describe("the topics source", () => {
    const topics = (rows: SourceRows) => writeSource(db(), topicsIndexer, rows, [], "content/topics.yaml");

    it("prunes only the owner's topics, and keeps another owner's relation and manimkc path", async () => {
      await db().insert(topic).values({ slug: "old", title: "Old", domain: "one" });
      await db().insert(topicRelation).values([
        { fromSlug: "theirs", toSlug: "mine", kind: "precedes", position: 1, ownerId: OTHER },
        // The mixed state: under the owner's topic, stamped with another owner.
        { fromSlug: "mine", toSlug: "shared", kind: "precedes", position: 9, ownerId: OTHER },
      ]);
      await db().insert(manimkcTopic).values({ path: "out/zq", topicSlug: "theirs", ownerId: OTHER, position: 0 });
      const write = await topics({ topic: [{ slug: "mine", title: "Mine", domain: "one" }] });
      expect(write.deletedKeys).toEqual(["topic old"]);
      const slugs = (await db().select({ slug: topic.slug }).from(topic)).map((t) => t.slug).sort();
      expect(slugs).toEqual(["mine", "shared", "theirs"]);
      expect(await db().select().from(topicRelation)).toHaveLength(2);
      expect(await db().select().from(manimkcTopic)).toHaveLength(1);
    });

    it("refuses a relation the mixed state already holds, and a manimkc path another owner has, by key", async () => {
      await db().insert(topicRelation).values({ fromSlug: "mine", toSlug: "shared", kind: "precedes", position: 9, ownerId: OTHER });
      await db().insert(manimkcTopic).values({ path: "out/zq", topicSlug: "theirs", ownerId: OTHER, position: 0 });
      const error = await refusal(
        topics({
          topic: [{ slug: "mine", title: "Mine", domain: "one" }],
          topicRelation: [{ fromSlug: "mine", toSlug: "shared", kind: "precedes", position: 1 }],
          manimkcTopic: [{ path: "out/zq", topicSlug: "mine", position: 0 }],
        }),
      );
      const message = String((error as Error).message);
      expect(message).toContain("topic_relation (mine, shared, precedes)");
      expect(message).toContain("manimkc_topic (out/zq)");
    });

    it("refuses to drop a topic another owner's rows are filed under, naming them", async () => {
      await db().insert(topic).values({ slug: "old", title: "Old", domain: "one" });
      await db().insert(asset).values({ id: "link:zq-r1", kind: "link", url: "https://e.com", sourceRepo: "self-learn", ownerId: OTHER });
      await db().insert(assetTopic).values({ assetId: "link:zq-r1", topicSlug: "old" });
      await db().insert(manimkcTopic).values({ path: "out/zq-old", topicSlug: "old", ownerId: OTHER, position: 0 });
      const error = await refusal(topics({ topic: [{ slug: "mine", title: "Mine", domain: "one" }] }));
      const message = String((error as Error).message);
      expect(message).toContain("asset_topic from link:zq-r1 to old");
      expect(message).toContain("manimkc_topic under old, stamped other");
      expect(await db().select().from(topic).where(eq(topic.slug, "old"))).toHaveLength(1);
      expect(await db().select().from(assetTopic)).toHaveLength(1);
    });
  });
});

describe.skipIf(!reachable.ok)("a whole import, through runIndex", () => {
  let scratch: Scratch;
  let fixture: Fixture;

  beforeAll(async () => {
    scratch = await createScratchDatabase();
    await applyMigrations(scratch.db);
    await ensureLearner(scratch.db, LOCAL_LEARNER_ID);
    await ensureLearner(scratch.db, OTHER);
    await ensureLearner(scratch.db, COMMONS_OWNER);
    fixture = await makeFixture();
  }, 60_000);

  afterAll(async () => {
    await fixture?.cleanup();
    await scratch?.drop();
  });

  it("resolves a log's link to a commons concept after the concepts source ran, and not one another owner holds", async () => {
    // The commons' topic and concept, and another owner's, already in the
    // database; the owner's tree has its own topic, note and a session log
    // linking all three. Once the concepts source has run, the lookup is what
    // it produced plus the rest of what the owner may read.
    await scratch.db.insert(topic).values([
      { slug: "shared", title: "Shared", domain: "commons", ownerId: COMMONS_OWNER },
      { slug: "theirs", title: "Theirs", domain: "tenant", ownerId: OTHER },
    ]);
    await scratch.db.insert(concept).values([
      { slug: "everyone", title: "Everyone", topicSlug: "shared", path: "learn/concepts/c/everyone.md", body: "x\n", ownerId: COMMONS_OWNER },
      { slug: "theirs-note", title: "Theirs", topicSlug: "theirs", path: "learn/concepts/t/theirs-note.md", body: "x\n", ownerId: OTHER },
    ]);
    await fixture.write("content/topics.yaml", topicsYaml([{ slug: "alpha", concepts: ["alpha"], courses: ["xx1000-m1"] }]));
    await fixture.write("content/tags.yaml", tagsYaml(["testing"]));
    await fixture.write(
      "content/courses/xx1000.yaml",
      [
        "id: xx1000", "slug: xx1000", "code: XX1000", "title: A test course", "credits: 4", "order: 1",
        "inferred: false", "tags: [testing]", "modules:", "  - id: xx1000-m1", "    slug: m1",
        "    title: Module one", "    order: 1", "    topic: alpha", "    topics:", "      - id: xx1000-m1-t1",
        "        title: First item", "        concepts: [alpha]", "        subtopics: []", "    resources: []",
        "capstone: Build something", "",
      ].join("\n"),
    );
    await fixture.write("learn/concepts/fixtures/alpha.md", note({ id: "alpha", title: "Alpha", summary: "The first one." }));
    await fixture.write(
      "learn/sessions/2026-01-01-links.md",
      "---\ntitle: Links\ndate: 2026-01-01T00:00:00.000Z\ngoal: alpha\ntype: learning-session\n---\n\n# Links\n\n[[everyone]] and [[theirs-note]].\n",
    );
    await runIndex(scratch.db, { repoRoot: fixture.root, only: ["topics"], manimkcRoot: path.join(fixture.root, "none") });
    const linked = await scratch.db
      .select({ slug: assetConcept.conceptSlug })
      .from(assetConcept)
      .where(eq(assetConcept.assetId, "session:learn/sessions/2026-01-01-links.md"));
    expect(linked.map((l) => l.slug).sort()).toEqual(["alpha", "everyone"]);
    const [theirs] = await scratch.db.select().from(concept).where(eq(concept.slug, "theirs-note"));
    expect(theirs?.ownerId).toBe(OTHER);
  });
});
