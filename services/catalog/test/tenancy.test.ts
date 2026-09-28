import {
  asset,
  assetDerivation,
  assetTopic,
  blobObject,
  collection,
  COMMONS_OWNER,
  concept,
  conceptPrerequisite,
  diagram,
  learner,
  LOCAL_LEARNER_ID,
  type OwnerScope,
  ownerScope,
  session,
  sessionLogEntry,
  tag,
  topic,
  topicRelation,
} from "@self-learn/schema";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { dbSource } from "../src/content/source";
import { ContentWriteError, writeContent } from "../src/content/write";
import { applyMigrations } from "../src/migrations";
import {
  assetCounts,
  assetDerivations,
  assetsByIds,
  assetsForTopic,
  conceptSummaries,
  conceptsForAsset,
  ensureLearner,
  gradeReview,
  listAssets,
  notePaths,
  posterBlob,
  readConceptGraph,
  readKnowledgeBase,
  recordObservation,
  StateError,
  topicTitles,
  videosWithStoredPoster,
} from "../src/state";
import { createScratchDatabase, probe, type Scratch } from "./scratch-database";
import { ASSETS, seedAssets, seedContent, TOPIC_SLUG } from "./state-fixture";

/**
 * App-level scoping by owner (phase 4 of docs/CONTENT-MIGRATION.md).
 *
 * Ids are global and every content row carries `owner_id`, so what keeps one
 * owner's notes off another's pages is the filter every read applies:
 * `owner_id in (owner, commons)`. The fixture is the one owner there is
 * today, `local`; a second owner, `tenant-b`, gets one of everything, and the
 * commons gets a topic and a concept. The bar, in order:
 *
 * 1. `local` reads exactly what it read before `tenant-b` existed, plus the
 *    commons: behaviour-preserving for today's single owner.
 * 2. `tenant-b` reads its own rows and the commons, and none of `local`'s.
 * 3. A link from a readable row to another owner's row does not carry the
 *    other row through: a prerequisite, a poster, a derivation, and evidence
 *    recorded against a concept by slug.
 * 4. The write seam stamps the owner, refuses to take another owner's row
 *    over, and creates the commons learner on its first write.
 */

const reachable = await probe();

const B = "tenant-b";
const LOCAL = ownerScope(LOCAL_LEARNER_ID);
const TENANT = ownerScope(B);

const B_TOPIC = "b-topic";
const B_CONCEPT = "b-concept";
const SHARED_TOPIC = "shared-topic";
const SHARED_CONCEPT = "shared-concept";
const B_ASSET = "fx:b-link";
const B_SESSION = "b-session";

/** Everything a page reads for one owner, as ids, so two reads can be compared. */
async function view(db: Scratch["db"], scope: OwnerScope) {
  const source = dbSource(db, scope);
  const kb = await readKnowledgeBase(db, scope.owner);
  return {
    topics: (await source.topics()).map((t) => t.slug).sort(),
    tags: (await source.tags()).map((t) => t.id).sort(),
    courses: (await source.courses()).map((c) => c.id).sort(),
    kb: kb.concepts.map((c) => c.id).sort(),
    summaries: (await conceptSummaries(db, scope)).map((c) => c.conceptId),
    graph: [...(await readConceptGraph(db, scope)).nodes.keys()].sort(),
    assets: (await listAssets(db, {}, scope)).map((a) => a.id),
    counts: await assetCounts(db, scope),
    onTopic: (await assetsForTopic(db, TOPIC_SLUG, scope)).map((a) => a.id),
  };
}

describe.skipIf(!reachable.ok)("content scoped by owner", () => {
  let scratch: Scratch;
  let before: Awaited<ReturnType<typeof view>>;

  beforeAll(async () => {
    scratch = await createScratchDatabase();
    const db = scratch.db;
    await applyMigrations(db);
    await seedContent(db);
    await seedAssets(db);
    // The fixture's concepts carry no body; a reader refuses a row without one.
    await db.update(concept).set({ body: "A note.\n" });
    await db.insert(tag).values({ id: "local-tag", label: "Local", description: "the owner's" });

    before = await view(db, LOCAL);

    await ensureLearner(db, B);
    await ensureLearner(db, COMMONS_OWNER);
    await db.insert(topic).values([
      { slug: B_TOPIC, title: "B's topic", domain: "tenant", ownerId: B },
      { slug: SHARED_TOPIC, title: "Shared topic", domain: "commons", ownerId: COMMONS_OWNER },
    ]);
    await db.insert(topicRelation).values([
      // To a topic B cannot see: dropped from B's entry, not left dangling.
      { fromSlug: B_TOPIC, toSlug: TOPIC_SLUG, kind: "precedes", position: 1, ownerId: B },
      { fromSlug: B_TOPIC, toSlug: SHARED_TOPIC, kind: "precedes", position: 2, ownerId: B },
    ]);
    await db.insert(concept).values([
      {
        slug: B_CONCEPT,
        title: "B's concept",
        topicSlug: B_TOPIC,
        path: "learn/concepts/tenant/b-concept.md",
        body: "B's own note.\n",
        ownerId: B,
      },
      {
        slug: SHARED_CONCEPT,
        title: "Shared concept",
        topicSlug: SHARED_TOPIC,
        path: "learn/concepts/commons/shared-concept.md",
        body: "Everyone's note.\n",
        ownerId: COMMONS_OWNER,
      },
    ]);
    await db.insert(tag).values({ id: "b-tag", label: "B", description: "tenant b's", ownerId: B });
    await db.insert(collection).values({ id: "b-course", kind: "course", slug: "b-course", title: "B's course", ownerId: B });
    // B's link, filed under the owner's own topic: the topic is shared by id,
    // and the asset is still B's.
    await db.insert(asset).values({
      id: B_ASSET,
      kind: "link",
      url: "https://example.com/b",
      title: "B's link",
      sourceRepo: "self-learn",
      ownerId: B,
    });
    await db.insert(assetTopic).values({ assetId: B_ASSET, topicSlug: TOPIC_SLUG });
    await db.insert(diagram).values({
      slug: "b-diagram",
      ownerId: B,
      topicSlug: B_TOPIC,
      document: { records: [] },
      documentHash: "0".repeat(64),
    });
    await db.insert(session).values({ id: B_SESSION, kind: "tutor", learnerId: B, state: "closed" });
    await db.insert(sessionLogEntry).values({ sessionId: B_SESSION, seq: 1, markdown: "# B's session\n" });
  }, 120_000);

  afterAll(async () => {
    await scratch?.drop();
  });

  it("gives the owner what it read before a second owner existed, and the commons", async () => {
    const after = await view(scratch.db, LOCAL);
    expect(after.topics).toEqual([...before.topics, SHARED_TOPIC].sort());
    expect(after.kb).toEqual([...before.kb, SHARED_CONCEPT].sort());
    expect(after.graph).toEqual([...before.graph, SHARED_CONCEPT].sort());
    expect(after.summaries).toEqual([...before.summaries, SHARED_CONCEPT].sort());
    // Nothing of B's reached any of them, including B's link filed under the
    // owner's own topic.
    expect(after.tags).toEqual(before.tags);
    expect(after.courses).toEqual(before.courses);
    expect(after.assets).toEqual(before.assets);
    expect(after.counts).toEqual(before.counts);
    expect(after.onTopic).toEqual(before.onTopic);
    expect(JSON.stringify(after)).not.toMatch(/b-topic|b-concept|b-tag|b-course|fx:b-link/);
  });

  it("gives the second owner its own rows and the commons, and none of the owner's", async () => {
    const tenant = await view(scratch.db, TENANT);
    expect(tenant.topics).toEqual([B_TOPIC, SHARED_TOPIC]);
    expect(tenant.kb).toEqual([B_CONCEPT, SHARED_CONCEPT]);
    expect(tenant.graph).toEqual([B_CONCEPT, SHARED_CONCEPT]);
    expect(tenant.tags).toEqual(["b-tag"]);
    expect(tenant.courses).toEqual(["b-course"]);
    expect(tenant.assets).toEqual([B_ASSET]);
    expect(tenant.onTopic).toEqual([B_ASSET]);
  });

  it("drops a relation whose far end the reader cannot see", async () => {
    const [entry] = (await dbSource(scratch.db, TENANT).topics()).filter((t) => t.slug === B_TOPIC);
    expect(entry?.relations).toEqual([{ kind: "precedes", to: SHARED_TOPIC }]);
  });

  it("finds a note, a diagram and a session log only for the owner that holds it", async () => {
    const mine = dbSource(scratch.db, LOCAL);
    const theirs = dbSource(scratch.db, TENANT);
    expect(await mine.concept(B_CONCEPT)).toBeNull();
    expect((await theirs.concept(B_CONCEPT))?.markdown).toContain("B's own note.");
    expect(await theirs.concept("alpha")).toBeNull();
    expect((await mine.concept("alpha"))?.markdown).toContain("A note.");
    // The commons' note reads for both.
    expect((await mine.concept(SHARED_CONCEPT))?.markdown).toContain("Everyone's note.");
    expect((await theirs.concept(SHARED_CONCEPT))?.markdown).toContain("Everyone's note.");

    expect(await mine.diagram("b-diagram")).toBeNull();
    expect((await theirs.diagram("b-diagram"))?.slug).toBe("b-diagram");

    expect(await mine.sessionLog(B_SESSION)).toBeNull();
    expect((await theirs.sessionLog(B_SESSION))?.markdown).toBe("# B's session\n");
  });

  it("answers another owner's asset, topic and note path as absent", async () => {
    expect(await assetsByIds(scratch.db, [B_ASSET, ASSETS.link], LOCAL)).toHaveLength(1);
    expect((await assetsByIds(scratch.db, [B_ASSET, ASSETS.link], TENANT)).map((a) => a.id)).toEqual([B_ASSET]);
    expect(await conceptsForAsset(scratch.db, ASSETS.diagram, TENANT)).toEqual([]);
    expect(await topicTitles(scratch.db, [B_TOPIC, SHARED_TOPIC], LOCAL)).toEqual({ [SHARED_TOPIC]: "Shared topic" });
    expect(Object.keys(await notePaths(scratch.db, [B_CONCEPT, "alpha"], LOCAL))).toEqual(["alpha"]);
  });
});

describe.skipIf(!reachable.ok)("links that reach another owner's rows", () => {
  let scratch: Scratch;
  const VIDEO = "manimkc:out/tenant/b.mp4";
  const POSTER = "poster:out/tenant/b.jpg";
  const key = (owner: string, digit: string, ext: string) => `${owner}/${digit.repeat(64)}.${ext}`;

  beforeAll(async () => {
    scratch = await createScratchDatabase();
    const db = scratch.db;
    await applyMigrations(db);
    await seedContent(db);
    await ensureLearner(db, B);
    await db.insert(topic).values({ slug: B_TOPIC, title: "B's topic", domain: "tenant", ownerId: B });
    await db.insert(concept).values({
      slug: B_CONCEPT,
      title: "B's concept",
      topicSlug: B_TOPIC,
      path: "learn/concepts/tenant/b-concept.md",
      ownerId: B,
    });
    // The owner's concept names B's as a prerequisite: ids are global, so
    // nothing in the schema stops it.
    await db.insert(conceptPrerequisite).values({ conceptSlug: "alpha", prerequisiteSlug: B_CONCEPT, kind: "requires" });
    // B's video, and a poster of it the owner holds.
    await db.insert(blobObject).values([
      { key: key(B, "a", "mp4"), ownerId: B, sha256: "a".repeat(64), bytes: 1, mime: "video/mp4", provider: "fs", state: "present", confirmedAt: new Date() },
      { key: key("local", "b", "jpg"), sha256: "b".repeat(64), bytes: 1, mime: "image/jpeg", provider: "fs", state: "present", confirmedAt: new Date() },
    ]);
    await db.insert(asset).values([
      { id: VIDEO, kind: "video", path: "out/tenant/b.mp4", sourceRepo: "manimkc", blobKey: key(B, "a", "mp4"), ownerId: B },
      { id: POSTER, kind: "poster", sourceRepo: "self-learn", blobKey: key("local", "b", "jpg") },
    ]);
    await db.insert(assetDerivation).values({ assetId: POSTER, sourceAssetId: VIDEO });
    // The owner's poster, filed under B's topic as well as nothing else.
    await db.insert(assetTopic).values({ assetId: POSTER, topicSlug: B_TOPIC });
  }, 120_000);

  afterAll(async () => {
    await scratch?.drop();
  });

  it("leaves another owner's concept out of a readable concept's prerequisites", async () => {
    const mine = await readKnowledgeBase(scratch.db, LOCAL_LEARNER_ID);
    expect(mine.concepts.find((c) => c.id === "alpha")?.requires).toEqual([]);
    expect(JSON.stringify(mine)).not.toContain(B_CONCEPT);
    const theirs = await readKnowledgeBase(scratch.db, B);
    expect(theirs.concepts.map((c) => c.id)).toEqual([B_CONCEPT]);
    expect(theirs.edges).toEqual([]);
  });

  it("serves no poster for a video the reader cannot open, even a poster it owns", async () => {
    expect(await posterBlob(scratch.db, VIDEO, LOCAL)).toBeNull();
    expect(await videosWithStoredPoster(scratch.db, [VIDEO], LOCAL)).toEqual(new Set());
    expect(await assetDerivations(scratch.db, VIDEO, LOCAL)).toEqual({ sources: [], derived: [] });
    // B can open the video but not the owner's poster of it.
    expect(await posterBlob(scratch.db, VIDEO, TENANT)).toBeNull();
    expect((await assetDerivations(scratch.db, VIDEO, TENANT)).derived).toEqual([]);
  });

  it("shows no chip for another owner's topic on the owner's own asset", async () => {
    const [poster] = await listAssets(scratch.db, { ids: [POSTER] }, LOCAL);
    expect(poster?.topics).toEqual([]);
  });

  it("refuses evidence about another owner's concept as if it did not exist", async () => {
    const graph = await readConceptGraph(scratch.db, LOCAL);
    const observe = recordObservation(scratch.db, { conceptId: B_CONCEPT, correct: true, graph, learnerId: LOCAL_LEARNER_ID });
    await expect(observe).rejects.toBeInstanceOf(StateError);
    await expect(observe).rejects.toThrow(`no concept in the catalog for "${B_CONCEPT}"`);
    await expect(
      gradeReview(scratch.db, { conceptId: B_CONCEPT, grade: 4, learnerId: LOCAL_LEARNER_ID }),
    ).rejects.toBeInstanceOf(StateError);
    // The owner of the concept records evidence as before.
    const theirs = await readConceptGraph(scratch.db, TENANT);
    await expect(
      recordObservation(scratch.db, { conceptId: B_CONCEPT, correct: true, graph: theirs, learnerId: B }),
    ).resolves.toMatchObject({ concept: B_CONCEPT });
  });
});

describe.skipIf(!reachable.ok)("the write seam and the owner", () => {
  let scratch: Scratch;

  beforeAll(async () => {
    scratch = await createScratchDatabase();
    await applyMigrations(scratch.db);
    await seedContent(scratch.db);
    await ensureLearner(scratch.db, B);
  }, 120_000);

  afterAll(async () => {
    await scratch?.drop();
  });

  const topicWrite = (slug: string, owner: string, extra: Record<string, unknown> = {}) => ({
    type: "topic" as const,
    id: slug,
    next: { row: { slug, title: `Topic ${slug}`, domain: "testing", ...extra } },
    base: null,
    owner,
    author: "a person",
    authorKind: "person" as const,
    reason: `write ${slug} as ${owner}`,
  });

  async function ownerOf(slug: string): Promise<string | undefined> {
    const [row] = await scratch.db.select({ owner: topic.ownerId }).from(topic).where(eq(topic.slug, slug));
    return row?.owner;
  }

  it("stamps the owner it is given", async () => {
    await writeContent(scratch.db, topicWrite("b-made", B));
    expect(await ownerOf("b-made")).toBe(B);
  });

  it("refuses to take over a row another owner holds, and writes nothing", async () => {
    const error = await writeContent(scratch.db, topicWrite(TOPIC_SLUG, B)).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ContentWriteError);
    expect((error as ContentWriteError).code).toBe("foreign-owner");
    expect(await ownerOf(TOPIC_SLUG)).toBe(LOCAL_LEARNER_ID);
    const [row] = await scratch.db.select({ title: topic.title }).from(topic).where(eq(topic.slug, TOPIC_SLUG));
    expect(row?.title).toBe("Fixture topic");
  });

  it("still lets the owner write its own row", async () => {
    await writeContent(scratch.db, topicWrite(TOPIC_SLUG, LOCAL_LEARNER_ID));
    expect(await ownerOf(TOPIC_SLUG)).toBe(LOCAL_LEARNER_ID);
  });

  it("refuses a row that names a different owner from the write", async () => {
    await expect(writeContent(scratch.db, topicWrite("mismatch", LOCAL_LEARNER_ID, { ownerId: B }))).rejects.toMatchObject({
      code: "invalid",
    });
    expect(await ownerOf("mismatch")).toBeUndefined();
  });

  it("refuses a write with no owner", async () => {
    await expect(writeContent(scratch.db, topicWrite("nobody", " "))).rejects.toMatchObject({ code: "empty-owner" });
  });

  it("creates the commons learner on its first write", async () => {
    const commons = () => scratch.db.select().from(learner).where(eq(learner.id, COMMONS_OWNER));
    expect(await commons()).toHaveLength(0);
    await writeContent(scratch.db, topicWrite("for-everyone", COMMONS_OWNER));
    expect(await commons()).toHaveLength(1);
    expect(await ownerOf("for-everyone")).toBe(COMMONS_OWNER);
  });
});
