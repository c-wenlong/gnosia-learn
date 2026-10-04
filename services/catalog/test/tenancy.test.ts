import {
  asset,
  assetConcept,
  assetDerivation,
  assetTopic,
  blobObject,
  collection,
  collectionItem,
  collectionTag,
  COMMONS_OWNER,
  concept,
  conceptCurriculumItem,
  conceptPrerequisite,
  curriculumItem,
  curriculumItemTopic,
  diagram,
  learner,
  manimkcTopic,
  LOCAL_LEARNER_ID,
  type OwnerScope,
  ownerScope,
  review,
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
import {
  assetBlobs,
  assetCounts,
  assetDerivations,
  assetsByIds,
  assetsForCollection,
  assetsForConcept,
  assetsForTopic,
  conceptsForAssets,
  derivationSources,
  reviewQueue,
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
import { migratedScratchDatabase, probe, type Scratch } from "./scratch-database";
import { ASSETS, CONCEPTS, DECK_ID, ITEMS, OTHER_TOPIC_SLUG, seedAssets, seedContent, TOPIC_SLUG } from "./state-fixture";

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
const B_VIDEO = "fx:b-video";
const B_COURSE_LINK = "link:b-r1";
const B_POSTER = "fx:b-poster";
const LOCAL_VIA_B = "fx:via-b";
/** B's rows naming the owner's bytes: the mixed state a write before the seam's key check could leave. */
const B_ON_LOCAL_BYTES = "fx:b-on-local-bytes";
const B_POSTER_ON_LOCAL_BYTES = "fx:b-poster-on-local-bytes";
const B_SESSION = "b-session";

const NOW = new Date("2026-09-28T12:00:00Z");

/** Plain data out of whatever a reader returns (Maps, Dates), so two reads compare by value. */
function plain(value: unknown): unknown {
  return JSON.parse(
    JSON.stringify(value, (_key, v: unknown) =>
      v instanceof Map ? Object.fromEntries([...v.entries()].sort(([a], [b]) => (String(a) < String(b) ? -1 : 1))) : v,
    ),
  );
}

/**
 * Everything a page reads for one owner, whole: every field of every row, so
 * a leak into a row the owner already reads (another owner's item grafted
 * into the owner's module, their tag on the owner's course, their link on the
 * owner's concept) changes the value even when no new id appears. `ids` names
 * the assets to ask the id-taking queries about: every asset in the database,
 * both owners' included.
 */
async function view(db: Scratch["db"], scope: OwnerScope, ids: string[]) {
  const source = dbSource(db, scope);
  return plain({
    topics: await source.topics(),
    tags: await source.tags(),
    courses: await source.courses(),
    kb: await readKnowledgeBase(db, scope.owner),
    summaries: await conceptSummaries(db, scope),
    graph: (await readConceptGraph(db, scope)).nodes,
    assets: await listAssets(db, {}, scope),
    counts: await assetCounts(db, scope),
    onTopic: await assetsForTopic(db, TOPIC_SLUG, scope),
    onTheirTopic: await assetsForTopic(db, B_TOPIC, scope),
    onConcept: Object.fromEntries(
      await Promise.all([...CONCEPTS, B_CONCEPT].map(async (slug) => [slug, await assetsForConcept(db, slug, scope)] as const)),
    ),
    inCollection: Object.fromEntries(
      await Promise.all(["fx", "fx-m1", DECK_ID, "b-course-m1", "b-module-in-fx"].map(async (id) => [id, await assetsForCollection(db, id, scope)] as const)),
    ),
    byIds: await assetsByIds(db, ids, scope),
    conceptsOf: await conceptsForAssets(db, ids, scope),
    sources: await derivationSources(db, ids, scope),
    blobs: await assetBlobs(db, ids, scope),
    withPoster: [...(await videosWithStoredPoster(db, ids, scope))].sort(),
    posters: Object.fromEntries(
      (await Promise.all(ids.map(async (id) => [id, await posterBlob(db, id, scope)] as const))).filter(([, blob]) => blob !== null),
    ),
    queue: await reviewQueue(db, { now: NOW, learnerId: scope.owner }),
    // A focus naming a concept the reader cannot read is dropped like a
    // missing one, even with a card of the reader's on it.
    focused: await reviewQueue(db, { now: NOW, learnerId: scope.owner, focus: B_CONCEPT }),
  });
}

/** `view` without the commons' topic and concept, which `local` gains by design. */
function withoutCommons(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value), (_key, v: unknown) => {
    if (Array.isArray(v)) {
      return v.filter((item) => !JSON.stringify(item ?? null).includes('"shared-'));
    }
    if (v !== null && typeof v === "object") {
      return Object.fromEntries(Object.entries(v).filter(([k]) => !k.startsWith("shared-")));
    }
    return v;
  });
}

describe.skipIf(!reachable.ok)("content scoped by owner", () => {
  let scratch: Scratch;
  let before: unknown;
  let ids: string[];

  beforeAll(async () => {
    scratch = await migratedScratchDatabase();
    const db = scratch.db;
    await seedContent(db);
    await seedAssets(db);
    // The fixture's concepts carry no body; a reader refuses a row without one.
    await db.update(concept).set({ body: "A note.\n" });
    await db.insert(tag).values({ id: "local-tag", label: "Local", description: "the owner's" });
    await db.insert(collectionTag).values({ collectionId: "fx", tagId: "local-tag", position: 0 });
    await db.insert(asset).values({ id: LOCAL_VIA_B, kind: "note", path: "learn/concepts/fixtures/via-b.md", sourceRepo: "self-learn" });
    // One due card of the owner's, so the queue has something to compare.
    await ensureLearner(db, LOCAL_LEARNER_ID);
    await db.insert(review).values({ learnerId: LOCAL_LEARNER_ID, conceptSlug: "alpha", due: new Date("2026-09-27T00:00:00Z") });

    // Asked about every asset id there will be, B's included: an id-taking
    // query answers a missing id and an unreadable one the same way.
    ids = [...Object.values(ASSETS), LOCAL_VIA_B, B_ASSET, B_VIDEO, B_COURSE_LINK, B_POSTER, B_ON_LOCAL_BYTES, B_POSTER_ON_LOCAL_BYTES].sort();
    before = await view(db, LOCAL, ids);

    await ensureLearner(db, B);
    await ensureLearner(db, COMMONS_OWNER);
    await db.insert(topic).values([
      { slug: B_TOPIC, title: "B's topic", domain: "tenant", ownerId: B },
      { slug: SHARED_TOPIC, title: "Shared topic", domain: "commons", ownerId: COMMONS_OWNER },
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
    // B's link, and B's video with its blob, both filed under the owner's
    // topic and on the owner's concept: the topic and the concept are shared
    // by id, and the assets are still B's.
    const bKey = `${B}/${"e".repeat(64)}.mp4`;
    const bPosterKey = `${B}/${"f".repeat(64)}.jpg`;
    await db.insert(blobObject).values([
      { key: bKey, ownerId: B, sha256: "e".repeat(64), bytes: 1, mime: "video/mp4", provider: "fs", state: "present", confirmedAt: new Date() },
      { key: bPosterKey, ownerId: B, sha256: "f".repeat(64), bytes: 1, mime: "image/jpeg", provider: "fs", state: "present", confirmedAt: new Date() },
    ]);
    await db.insert(asset).values([
      { id: B_ASSET, kind: "link", url: "https://example.com/b", title: "B's link", sourceRepo: "self-learn", ownerId: B },
      { id: B_VIDEO, kind: "video", path: "out/tenant/b.mp4", sourceRepo: "manimkc", blobKey: bKey, ownerId: B },
      { id: B_COURSE_LINK, kind: "link", url: "https://example.com/b-r1", title: "B's course link", sourceRepo: "self-learn", ownerId: B },
      // B's poster of the owner's video: the owner must not be served it.
      { id: B_POSTER, kind: "poster", sourceRepo: "self-learn", blobKey: bPosterKey, ownerId: B },
    ]);
    await db.insert(assetDerivation).values({ assetId: B_POSTER, sourceAssetId: ASSETS.video });
    const [localVideo] = await db.select({ key: asset.blobKey }).from(asset).where(eq(asset.id, ASSETS.video));
    const [localDiagram] = await db.select({ key: asset.blobKey }).from(asset).where(eq(asset.id, ASSETS.diagram));
    await db.insert(asset).values([
      { id: B_ON_LOCAL_BYTES, kind: "video", path: "out/tenant/on-local.mp4", sourceRepo: "manimkc", blobKey: localVideo?.key ?? null, ownerId: B },
      { id: B_POSTER_ON_LOCAL_BYTES, kind: "poster", sourceRepo: "self-learn", blobKey: localDiagram?.key ?? null, ownerId: B },
    ]);
    await db.insert(assetDerivation).values({ assetId: B_POSTER_ON_LOCAL_BYTES, sourceAssetId: ASSETS.video });
    await db.insert(assetTopic).values([
      { assetId: B_ASSET, topicSlug: TOPIC_SLUG },
      { assetId: B_VIDEO, topicSlug: TOPIC_SLUG },
    ]);
    await db.insert(assetConcept).values([
      { assetId: B_ASSET, conceptSlug: "alpha" },
      { assetId: B_VIDEO, conceptSlug: "alpha" },
      // The owner's video on B's concept.
      { assetId: ASSETS.video, conceptSlug: B_CONCEPT },
    ]);
    // And under B's topic.
    await db.insert(assetTopic).values({ assetId: ASSETS.video, topicSlug: B_TOPIC });
    await db.insert(assetDerivation).values({ assetId: ASSETS.transcript, sourceAssetId: B_VIDEO });
    await db.insert(diagram).values({
      slug: "b-diagram",
      ownerId: B,
      topicSlug: B_TOPIC,
      document: { records: [] },
      documentHash: "0".repeat(64),
    });
    await db.insert(session).values({ id: B_SESSION, kind: "tutor", learnerId: B, state: "closed" });
    await db.insert(sessionLogEntry).values({ sessionId: B_SESSION, seq: 1, markdown: "# B's session\n" });

    // B's course has children of its own, so the subtree filter is exercised
    // from B's side too; and B's rows are grafted into the owner's course:
    // an item in the owner's module, B's concept on the owner's item, B's link
    // in the owner's module and deck, B's tag on the owner's course.
    await db.insert(collection).values([
      { id: "b-course", kind: "course", slug: "b-course", title: "B's course", ownerId: B },
      { id: "b-course-m1", kind: "module", slug: "m1", title: "B's module", parentId: "b-course", ownerId: B },
    ]);
    await db.insert(curriculumItem).values([
      { id: "b-item", collectionId: "b-course-m1", position: 0, title: "B's item", ownerId: B },
      { id: "b-item-in-fx", collectionId: "fx-m1", position: 50, title: "B's item in the owner's module", ownerId: B },
      // And the other way: the owner's item in B's module.
      { id: "fx-item-in-b", collectionId: "b-course-m1", position: 50, title: "The owner's item in B's module" },
    ]);
    // B's module in the owner's course, filed under the owner's topic; B's
    // concept filed under the owner's topic; B's relation from and manimkc
    // path on the owner's topic.
    await db.insert(collection).values({ id: "b-module-in-fx", kind: "module", slug: "b-m", title: "B's module in the owner's course", parentId: "fx", position: 9, ownerId: B });
    await db.insert(collectionItem).values([
      { collectionId: "b-module-in-fx", position: 0, topicSlug: TOPIC_SLUG, topicPosition: 9000 },
      { collectionId: "fx-m1", position: 60, assetId: B_COURSE_LINK },
    ]);
    await db.insert(concept).values({
      slug: "b-concept-in-fx",
      title: "B's concept under the owner's topic",
      topicSlug: TOPIC_SLUG,
      path: "learn/concepts/tenant/b-concept-in-fx.md",
      body: "B's.\n",
      ownerId: B,
    });
    await db.insert(topicRelation).values({ fromSlug: TOPIC_SLUG, toSlug: OTHER_TOPIC_SLUG, kind: "precedes", position: 5, ownerId: B });
    // The owner's note, reachable only through B's topic and B's concept,
    // which the owner's deck lists: nothing reaches the owner through them.
    await db.insert(assetTopic).values({ assetId: LOCAL_VIA_B, topicSlug: B_TOPIC });
    await db.insert(assetConcept).values({ assetId: LOCAL_VIA_B, conceptSlug: B_CONCEPT });
    await db.insert(collectionItem).values({ collectionId: DECK_ID, position: 52, topicSlug: B_TOPIC });
    await db.insert(manimkcTopic).values({ path: "out/b-on-fx", topicSlug: TOPIC_SLUG, position: 0, ownerId: B });
    await db.insert(collectionItem).values([
      { collectionId: "b-course-m1", position: 0, topicSlug: B_TOPIC, topicPosition: 1000 },
      { collectionId: "fx-m1", position: 50, assetId: B_ASSET },
      { collectionId: DECK_ID, position: 50, assetId: B_ASSET },
      { collectionId: DECK_ID, position: 51, conceptSlug: B_CONCEPT },
    ]);
    await db.insert(collectionTag).values([
      { collectionId: "b-course", tagId: "b-tag", position: 0 },
      { collectionId: "fx", tagId: "b-tag", position: 1 },
    ]);
    await db.insert(curriculumItemTopic).values([
      { curriculumItemId: "b-item", topicSlug: B_TOPIC },
      { curriculumItemId: ITEMS[0], topicSlug: B_TOPIC },
    ]);
    await db.insert(conceptCurriculumItem).values([
      { conceptSlug: B_CONCEPT, curriculumItemId: "b-item", position: 0 },
      { conceptSlug: B_CONCEPT, curriculumItemId: ITEMS[0], position: 50 },
    ]);
    // A due card of the owner's on B's concept: the queue drops it.
    await db.insert(review).values({ learnerId: LOCAL_LEARNER_ID, conceptSlug: B_CONCEPT, due: new Date("2026-09-26T00:00:00Z") });
    await db.insert(review).values({ learnerId: B, conceptSlug: B_CONCEPT, due: new Date("2026-09-26T00:00:00Z") });

    expect((await db.select({ id: asset.id }).from(asset)).map((a) => a.id).sort()).toEqual(ids);
  }, 120_000);

  afterAll(async () => {
    await scratch?.drop();
  });

  it("gives the owner, field for field, what it read before a second owner existed, and the commons", async () => {
    const after = withoutCommons(await view(scratch.db, LOCAL, ids)) as { kb: { stats: Record<string, number> } };
    // The one count the commons' concept moves, which carries no slug to filter by.
    after.kb.stats["total"] = (after.kb.stats["total"] ?? 0) - 1;
    after.kb.stats["untouched"] = (after.kb.stats["untouched"] ?? 0) - 1;
    expect(after).toEqual(before);
    // The commons is there, and nothing of B's reached any of it.
    // Less the two keys `view` itself asks about, whose values must be empty.
    const whole = JSON.stringify(await view(scratch.db, LOCAL, ids))
      .replace(`"${B_CONCEPT}":[]`, "")
      .replace(`"b-course-m1":[]`, "")
      .replace(`"b-module-in-fx":[]`, "");
    expect(whole).toContain(SHARED_TOPIC);
    expect(whole).toContain(SHARED_CONCEPT);
    expect(whole).not.toMatch(/b-topic|b-concept|b-tag|b-course|b-item|fx:b-|B's|tenant-b/);
  });

  it("gives the second owner its own rows and the commons, and none of the owner's", async () => {
    const tenant = (await view(scratch.db, TENANT, ids)) as Record<string, unknown>;
    const text = JSON.stringify(tenant);
    // None of the owner's rows, by id or by title. (`alpha` appears only as
    // the key `view` asked about; its value is B's own links.)
    expect(text).not.toMatch(/fixture-topic|fx:video|fx:diagram|fx:transcript|fx:link|fx:pinned|fx:Beta|fx:alpha|local-tag|Fixture|fx-item-in-b|fx-m1-t|Alpha|"local\//);
    // A module's items are its `topics` in the course shape.
    const courses = tenant["courses"] as { id: string; modules: { topics: { id: string }[] }[] }[];
    expect(courses.map((c) => c.id)).toEqual(["b-course"]);
    expect(courses[0]?.modules.flatMap((m) => m.topics.map((i) => i.id))).toEqual(["b-item"]);
    expect((tenant["tags"] as { id: string }[]).map((t) => t.id)).toEqual(["b-tag"]);
    expect((tenant["topics"] as { slug: string }[]).map((t) => t.slug)).toEqual([B_TOPIC, SHARED_TOPIC]);
    expect((tenant["assets"] as { id: string }[]).map((a) => a.id).sort()).toEqual([B_ASSET, B_POSTER, B_COURSE_LINK, B_VIDEO, B_ON_LOCAL_BYTES, B_POSTER_ON_LOCAL_BYTES].sort());
    // Its rows naming the owner's bytes are its own, but the bytes are not: none is served.
    expect(Object.keys(tenant["blobs"] as object)).not.toContain(B_ON_LOCAL_BYTES);
    expect(Object.keys(tenant["blobs"] as object).sort()).toEqual([B_POSTER, B_VIDEO].sort());
    // B can open its poster, but it is not served as the poster of a video B cannot open.
    expect(tenant["posters"]).toEqual({});
    expect((tenant["queue"] as { items: { conceptId: string }[] }).items.map((i) => i.conceptId)).toEqual([B_CONCEPT]);
    expect(tenant["sources"]).toEqual({});
  });

  it("drops a relation whose far end the reader cannot see", async () => {
    await scratch.db.insert(topicRelation).values([
      { fromSlug: B_TOPIC, toSlug: TOPIC_SLUG, kind: "precedes", position: 1, ownerId: B },
      { fromSlug: B_TOPIC, toSlug: SHARED_TOPIC, kind: "precedes", position: 2, ownerId: B },
    ]);
    const [entry] = (await dbSource(scratch.db, TENANT).topics()).filter((t) => t.slug === B_TOPIC);
    expect(entry?.relations).toEqual([{ kind: "precedes", to: SHARED_TOPIC }]);
    await scratch.db.delete(topicRelation).where(eq(topicRelation.fromSlug, B_TOPIC));
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
    scratch = await migratedScratchDatabase();
    const db = scratch.db;
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
    // The owner's course, whose one module is filed under B's topic.
    await db.insert(collection).values([
      { id: "lc", kind: "course", slug: "lc", title: "The owner's course" },
      { id: "lc-m1", kind: "module", slug: "m1", title: "Module", parentId: "lc" },
    ]);
    await db.insert(collectionItem).values({ collectionId: "lc-m1", topicSlug: B_TOPIC, position: 0 });
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

  it("serves no blob a row names under another owner's prefix", async () => {
    // A row written before the seam checked the key's prefix: the owner's
    // asset naming B's video bytes. The key is whose store and quota the
    // bytes are in (D5), so the owner is not served them.
    await scratch.db.insert(asset).values({
      id: "fx:borrowed",
      kind: "video",
      path: "out/fixtures/borrowed.mp4",
      sourceRepo: "manimkc",
      blobKey: key(B, "a", "mp4"),
    });
    expect(await assetBlobs(scratch.db, ["fx:borrowed"], LOCAL)).toEqual(new Map());
    // A row moved to the commons keeps its `local/` key until the upload
    // re-keys it (D23): still served to the owner whose bytes they are, and
    // to nobody who cannot read that owner.
    await ensureLearner(scratch.db, COMMONS_OWNER);
    await scratch.db.update(asset).set({ ownerId: COMMONS_OWNER }).where(eq(asset.id, POSTER));
    expect((await assetBlobs(scratch.db, [POSTER], LOCAL)).get(POSTER)?.key).toBe(key("local", "b", "jpg"));
    expect(await assetBlobs(scratch.db, [POSTER], TENANT)).toEqual(new Map());
    await scratch.db.update(asset).set({ ownerId: LOCAL_LEARNER_ID }).where(eq(asset.id, POSTER));
    expect((await assetBlobs(scratch.db, [VIDEO], TENANT)).get(VIDEO)?.key).toBe(key(B, "a", "mp4"));
    await scratch.db.delete(asset).where(eq(asset.id, "fx:borrowed"));
  });

  it("serves no poster for a video the reader cannot open, even a poster it owns", async () => {
    expect(await posterBlob(scratch.db, VIDEO, LOCAL)).toBeNull();
    expect(await videosWithStoredPoster(scratch.db, [VIDEO], LOCAL)).toEqual(new Set());
    expect(await assetDerivations(scratch.db, VIDEO, LOCAL)).toEqual({ sources: [], derived: [] });
    // B can open the video but not the owner's poster of it.
    expect(await posterBlob(scratch.db, VIDEO, TENANT)).toBeNull();
    expect((await assetDerivations(scratch.db, VIDEO, TENANT)).derived).toEqual([]);
  });

  it("names no module topic another owner holds", async () => {
    const course = (await dbSource(scratch.db, LOCAL).courses()).find((c) => c.id === "lc");
    expect(course?.modules.map((m) => m.topic)).toEqual([""]);
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
    scratch = await migratedScratchDatabase();
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

  it("creates the commons learner on its first write, and stamps its links too", async () => {
    const commons = () => scratch.db.select().from(learner).where(eq(learner.id, COMMONS_OWNER));
    expect(await commons()).toHaveLength(0);
    await writeContent(scratch.db, topicWrite("commons-first", COMMONS_OWNER));
    expect(await commons()).toHaveLength(1);
    // A relation to another commons topic: the commons reads only the
    // commons, so that is the far end a commons link may name.
    await writeContent(scratch.db, {
      ...topicWrite("for-everyone", COMMONS_OWNER),
      next: {
        row: { slug: "for-everyone", title: "For everyone", domain: "testing" },
        links: { topic_relation: [{ toSlug: "commons-first", kind: "precedes", position: 1 }] },
      },
    });
    expect(await ownerOf("for-everyone")).toBe(COMMONS_OWNER);
    const relations = await scratch.db
      .select({ owner: topicRelation.ownerId })
      .from(topicRelation)
      .where(eq(topicRelation.fromSlug, "for-everyone"));
    expect(relations).toEqual([{ owner: COMMONS_OWNER }]);
  });

  it("refuses a link that names a different owner from the write", async () => {
    await expect(
      writeContent(scratch.db, {
        ...topicWrite("linked-wrong", LOCAL_LEARNER_ID),
        next: {
          row: { slug: "linked-wrong", title: "Linked wrong", domain: "testing" },
          links: { topic_relation: [{ toSlug: TOPIC_SLUG, kind: "precedes", position: 1, ownerId: B }] },
        },
      }),
    ).rejects.toMatchObject({ code: "invalid" });
    expect(await ownerOf("linked-wrong")).toBeUndefined();
  });
  it("refuses a row naming a blob under another owner's prefix, and lets through a key the row already had", async () => {
    const key = (owner: string) => `${owner}/${"c".repeat(64)}.svg`;
    for (const owner of [LOCAL_LEARNER_ID, B]) {
      await scratch.db
        .insert(blobObject)
        .values({ key: key(owner), ownerId: owner, sha256: "c".repeat(64), bytes: 1, mime: "image/svg+xml", provider: "fs", state: "present", confirmedAt: new Date() })
        .onConflictDoNothing();
    }
    const assetWrite = (blobKey: string, base: number | null) => ({
      type: "asset" as const,
      id: "fx:seam-svg",
      next: { row: { id: "fx:seam-svg", kind: "diagram_svg", path: "learn/assets/seam.svg", sourceRepo: "self-learn", blobKey } },
      base,
      owner: LOCAL_LEARNER_ID,
      author: "a person",
      authorKind: "person" as const,
      reason: "blob key prefix",
    });
    await expect(writeContent(scratch.db, assetWrite(key(B), null))).rejects.toMatchObject({ code: "invalid" });
    const first = await writeContent(scratch.db, assetWrite(key(LOCAL_LEARNER_ID), null));
    // A row that already names a key keeps it through a write that does not
    // touch it, whoever's prefix it is: D23's move leaves `local/` keys under
    // commons rows until the upload re-keys them.
    await scratch.db.update(asset).set({ ownerId: COMMONS_OWNER }).where(eq(asset.id, "fx:seam-svg"));
    const kept = await writeContent(scratch.db, { ...assetWrite(key(LOCAL_LEARNER_ID), first.revisionId), owner: COMMONS_OWNER });
    expect(kept.id).toBe("fx:seam-svg");
    await expect(
      writeContent(scratch.db, { ...assetWrite(key(B), kept.revisionId), owner: COMMONS_OWNER }),
    ).rejects.toMatchObject({ code: "invalid" });
  });
});
