import {
  asset,
  assetConcept,
  assetJob,
  collection,
  collectionItem,
  COMMONS_OWNER,
  concept,
  draft,
  job,
  LOCAL_LEARNER_ID,
  ownerScope,
  session,
  topic,
} from "@self-learn/schema";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { assetParents, ensureLearner, listAssets } from "../src/state";
import { migratedScratchDatabase, probe, type Scratch } from "./scratch-database";
import { ASSETS, seedAssets, seedContent, TOPIC_SLUG } from "./state-fixture";

/**
 * `assetParents`: the course and module, the concepts, the studio
 * conversation and the tutor session behind each asset, in one statement for
 * a page of rows (L3 of docs/proposals/library-by-type-and-day.md), scoped to
 * the reader at both ends.
 */

const reachable = await probe();

const OTHER = "other";
const LOCAL = ownerScope(LOCAL_LEARNER_ID);
const THEIRS = ownerScope(OTHER);
const LOG = "fx:log";
const THEIR_ASSET = "other:note";
const HASH = "a".repeat(64);

describe.skipIf(!reachable.ok)("asset parents", () => {
  let scratch: Scratch;

  beforeAll(async () => {
    scratch = await migratedScratchDatabase();
    const db = scratch.db;
    await seedContent(db);
    await seedAssets(db);
    await ensureLearner(db, LOCAL_LEARNER_ID);
    await ensureLearner(db, OTHER);
    await ensureLearner(db, COMMONS_OWNER);

    // The fixture course gets a code, and a second course lists the link by
    // id in its week 3: the link then has a module listing (`item`) and a
    // topic match (`topic`, through fx-m1).
    await db.update(collection).set({ metadata: { code: "FX1" } }).where(eq(collection.id, "fx"));
    await db.insert(collection).values([
      { id: "fx2", kind: "course", slug: "fx2", title: "Second course", position: 1, metadata: { code: "FX0" } },
      { id: "fx2-m3", kind: "module", slug: "m3", title: "Week 3: Things", parentId: "fx2", position: 3 },
      { id: "fx2-m4", kind: "module", slug: "m4", title: "Week 4: Gone", parentId: "fx2", position: 4, archivedAt: new Date() },
      // Another owner's course listing the owner's link: never named to the owner.
      { id: "theirs", kind: "course", slug: "theirs", title: "Their course", position: 0, ownerId: OTHER, metadata: { code: "AAA" } },
      { id: "theirs-m1", kind: "module", slug: "m1", title: "Theirs", parentId: "theirs", position: 1, ownerId: OTHER },
    ]);
    await db.insert(collectionItem).values([
      { collectionId: "fx2-m3", position: 0, assetId: ASSETS.link },
      // An archived module is no place.
      { collectionId: "fx2-m4", position: 0, assetId: ASSETS.video },
      { collectionId: "theirs-m1", position: 0, assetId: ASSETS.link },
    ]);

    // Another owner's concept on the owner's video, and another owner's asset.
    await db.insert(topic).values({ slug: "other-topic", title: "Other's topic", domain: "other", ownerId: OTHER });
    await db.insert(concept).values({
      slug: "other-concept",
      title: "Other's concept",
      topicSlug: "other-topic",
      path: "learn/concepts/other/other-concept.md",
      ownerId: OTHER,
    });
    await db.insert(asset).values([
      { id: LOG, kind: "session", path: "learn/sessions/fx.md", title: "Fixture log", sourceRepo: "self-learn" },
      { id: THEIR_ASSET, kind: "note", path: "learn/concepts/other/x.md", sourceRepo: "self-learn", ownerId: OTHER },
    ]);
    await db.insert(assetConcept).values([
      { assetId: ASSETS.video, conceptSlug: "other-concept" },
      { assetId: THEIR_ASSET, conceptSlug: "other-concept" },
    ]);

    // The diagram was drawn by a studio job from a conversation, twice; the
    // later write names the conversation first. A job with no draft names none.
    // Each conversation carries the owner's name for it, when they gave one,
    // and when it was last written to.
    await db.insert(draft).values([
      {
        id: "draft-old",
        title: "First try",
        plannerSessionId: "p1",
        transcriptPath: "drafts/old/t.jsonl",
        updatedAt: new Date("2026-10-04T09:30:00Z"),
      },
      {
        id: "draft-new",
        title: "Alpha, again",
        name: "Alpha picture",
        plannerSessionId: "p2",
        transcriptPath: "drafts/new/t.jsonl",
        updatedAt: new Date("2026-10-03T08:00:00Z"),
      },
      { id: "draft-theirs", title: "Their talk", plannerSessionId: "p3", transcriptPath: "drafts/t/t.jsonl", ownerId: OTHER },
    ]);
    const jobRow = (id: string, draftId: string | null, ownerId = LOCAL_LEARNER_ID) => ({
      id,
      kind: "diagram",
      topicSlug: TOPIC_SLUG,
      targetPath: `learn/assets/${id}.tldr`,
      idempotencyKey: id,
      draftId,
      ownerId,
    });
    await db.insert(job).values([
      jobRow("job-old", "draft-old"),
      jobRow("job-new", "draft-new"),
      jobRow("job-bare", null),
      jobRow("job-theirs", "draft-theirs", OTHER),
    ]);
    await db.insert(assetJob).values([
      { assetId: ASSETS.diagram, jobId: "job-old", contentHash: HASH, bytes: 1, writtenAt: new Date("2026-10-01T00:00:00Z") },
      { assetId: ASSETS.diagram, jobId: "job-new", contentHash: HASH, bytes: 1, writtenAt: new Date("2026-10-03T00:00:00Z") },
      { assetId: ASSETS.diagram, jobId: "job-theirs", contentHash: HASH, bytes: 1, ownerId: OTHER },
      { assetId: ASSETS.video, jobId: "job-bare", contentHash: HASH, bytes: 1 },
    ]);

    await db.insert(session).values([
      { id: "2026-10-04-alpha", kind: "tutor", learnerId: LOCAL_LEARNER_ID, title: "Alpha, taught", logAssetId: LOG },
      { id: "2026-10-04-theirs", kind: "tutor", learnerId: OTHER, title: "Their session", logAssetId: LOG },
    ]);
  }, 120_000);

  afterAll(async () => {
    await scratch?.drop();
  });

  it("names every parent of a page of rows, each list in a stable order", async () => {
    const ids = [ASSETS.video, ASSETS.diagram, ASSETS.link, ASSETS.orphan, LOG, ASSETS.link];
    expect(await assetParents(scratch.db, ids, LOCAL)).toEqual({
      [ASSETS.video]: {
        // Through its topic only: the archived week 4 is no place.
        places: [
          { course: "fx", code: "FX1", courseTitle: "Fixture course", module: "m1", moduleTitle: "Fixture module", position: 0, via: "topic" },
        ],
        concepts: ["alpha"],
        // A job with no conversation names none.
        conversations: [],
        sessions: [],
      },
      [ASSETS.diagram]: {
        places: [
          { course: "fx", code: "FX1", courseTitle: "Fixture course", module: "m1", moduleTitle: "Fixture module", position: 0, via: "topic" },
        ],
        concepts: ["alpha", "beta"],
        conversations: [
          // By the asset's write, not the conversation's: draft-old was
          // written to later, but its job wrote this diagram first.
          { id: "draft-new", title: "Alpha, again", name: "Alpha picture", updatedAt: "2026-10-03T08:00:00.000Z" },
          { id: "draft-old", title: "First try", name: null, updatedAt: "2026-10-04T09:30:00.000Z" },
        ],
        sessions: [],
      },
      [ASSETS.link]: {
        // The module listing first, then the topic match.
        places: [
          { course: "fx2", code: "FX0", courseTitle: "Second course", module: "m3", moduleTitle: "Week 3: Things", position: 3, via: "item" },
          { course: "fx", code: "FX1", courseTitle: "Fixture course", module: "m1", moduleTitle: "Fixture module", position: 0, via: "topic" },
        ],
        concepts: [],
        conversations: [],
        sessions: [],
      },
      [LOG]: {
        places: [],
        concepts: [],
        conversations: [],
        sessions: [{ id: "2026-10-04-alpha", title: "Alpha, taught" }],
      },
    });
  });

  it("names nothing another owner holds, and nothing of an asset the reader cannot read", async () => {
    const mine = await assetParents(scratch.db, [ASSETS.link, ASSETS.video, THEIR_ASSET, LOG], LOCAL);
    expect(mine[THEIR_ASSET]).toBeUndefined();
    expect(mine[ASSETS.link]?.places.map((p) => p.course)).not.toContain("theirs");
    expect(mine[ASSETS.video]?.concepts).not.toContain("other-concept");
    expect(mine[LOG]?.sessions.map((s) => s.id)).toEqual(["2026-10-04-alpha"]);

    // The other owner sees their own asset and its concept, and none of the owner's assets.
    expect(await assetParents(scratch.db, [ASSETS.link, THEIR_ASSET], THEIRS)).toEqual({
      [THEIR_ASSET]: { places: [], concepts: ["other-concept"], conversations: [], sessions: [] },
    });
  });

  it("asks nothing for an empty page", async () => {
    expect(await assetParents(scratch.db, [], LOCAL)).toEqual({});
  });

  it("lists each row's created and updated instants", async () => {
    const [row] = await listAssets(scratch.db, { ids: [ASSETS.video] }, LOCAL);
    expect(row?.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(row?.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    await scratch.db.update(asset).set({ updatedAt: new Date("2030-01-02T03:04:05Z") }).where(eq(asset.id, ASSETS.video));
    const [moved] = await listAssets(scratch.db, { ids: [ASSETS.video] }, LOCAL);
    expect(moved?.updatedAt).toBe("2030-01-02T03:04:05.000Z");
    expect(moved?.createdAt).toBe(row?.createdAt);
  });
});
