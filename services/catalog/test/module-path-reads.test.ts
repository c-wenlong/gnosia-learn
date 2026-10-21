import { asset, assetConcept, COMMONS_OWNER, concept, LOCAL_LEARNER_ID, ownerScope, topic } from "@gnosia/schema";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { assetsForConcepts, conceptCheckCounts, ensureLearner } from "../src/state";
import { migratedScratchDatabase, probe, type Scratch } from "./scratch-database";
import { storedBlob } from "./stored-blob";
import { ASSETS, seedAssets, seedContent, TOPIC_SLUG } from "./state-fixture";

/**
 * The two reads the module path needs beyond what the course page already
 * asked (phase 3 of docs/proposals/module-learning-path.md): the assets
 * linked to each of a module's concepts, in one round trip, and how many
 * checks each concept's note holds. Both owner-scoped, as every read the web
 * app reaches is.
 */

const reachable = await probe();

const OTHER = "other";
const LOCAL = ownerScope(LOCAL_LEARNER_ID);
const THEIRS = ownerScope(OTHER);

const CHECK = (q: string) => ["```check", `q: ${q}`, "a: yes", "```", ""].join("\n");

describe.skipIf(!reachable.ok)("module path reads", () => {
  let scratch: Scratch;

  beforeAll(async () => {
    scratch = await migratedScratchDatabase();
    const db = scratch.db;
    await seedContent(db);
    await seedAssets(db);
    await ensureLearner(db, LOCAL_LEARNER_ID);
    await ensureLearner(db, OTHER);
    await ensureLearner(db, COMMONS_OWNER);
    await db.update(concept).set({ body: `Alpha.\n\n${CHECK("one?")}\n${CHECK("two?")}` }).where(eq(concept.slug, "alpha"));
    // A block with no question is not a check.
    await db.update(concept).set({ body: "Beta.\n\n```check\na: an answer to nothing\n```\n" }).where(eq(concept.slug, "beta"));
    await db.insert(topic).values({ slug: "other-topic", title: "Other's topic", domain: "other", ownerId: OTHER });
    await db.insert(concept).values({
      slug: "other-concept",
      title: "Other's concept",
      topicSlug: "other-topic",
      path: "learn/concepts/other/other-concept.md",
      body: CHECK("theirs?"),
      ownerId: OTHER,
    });
    // Another owner's video, linked to the owner's concept, and the owner's
    // video linked to another owner's concept: neither may cross.
    await db.insert(asset).values([
      {
        id: "other:video",
        kind: "video",
        path: "out/other.mp4",
        sourceRepo: "manimkc",
        ownerId: OTHER,
        blobKey: await storedBlob(db, "other:video", "mp4"),
      },
    ]);
    await db.insert(assetConcept).values([
      { assetId: "other:video", conceptSlug: "alpha" },
      { assetId: ASSETS.video, conceptSlug: "other-concept" },
    ]);
  }, 120_000);

  afterAll(async () => {
    await scratch?.drop();
  });

  it("answers the assets of many concepts at once, by kind then id, each concept's own", async () => {
    const out = await assetsForConcepts(scratch.db, ["alpha", "beta", "gamma", "alpha"], LOCAL);
    expect(Object.fromEntries(Object.entries(out).map(([slug, rows]) => [slug, rows.map((r) => r.id)]))).toEqual({
      alpha: [ASSETS.diagram, ASSETS.video],
      beta: [ASSETS.diagram],
    });
    expect(await assetsForConcepts(scratch.db, [], LOCAL)).toEqual({});
  });

  it("keeps another owner's asset off the owner's concept, and the owner's off another's", async () => {
    const mine = await assetsForConcepts(scratch.db, ["alpha", "other-concept"], LOCAL);
    expect(mine["alpha"]?.map((r) => r.id)).not.toContain("other:video");
    expect(mine["other-concept"]).toBeUndefined();
    const theirs = await assetsForConcepts(scratch.db, ["alpha", "other-concept"], THEIRS);
    // The other owner cannot read `alpha`, nor the owner's video.
    expect(theirs).toEqual({});
  });

  it("counts the checks in each note, a block with no question not among them", async () => {
    expect(await conceptCheckCounts(scratch.db, ["alpha", "beta", "gamma"], LOCAL)).toEqual({ alpha: 2, beta: 0, gamma: 0 });
    expect(await conceptCheckCounts(scratch.db, [], LOCAL)).toEqual({});
  });

  it("counts with the parser it is given, so the page and the session read a note the same way", async () => {
    const seen: string[] = [];
    const counted = await conceptCheckCounts(scratch.db, ["alpha"], LOCAL, (body) => {
      seen.push(body);
      return [1, 2, 3, 4, 5];
    });
    expect(counted).toEqual({ alpha: 5 });
    expect(seen).toHaveLength(1);
  });

  it("counts nothing in a note the reader cannot read", async () => {
    expect(await conceptCheckCounts(scratch.db, ["other-concept"], LOCAL)).toEqual({});
    expect(await conceptCheckCounts(scratch.db, ["other-concept", "alpha"], THEIRS)).toEqual({ "other-concept": 1 });
    expect(TOPIC_SLUG).toBe("fixture-topic");
  });
});
