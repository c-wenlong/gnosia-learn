import {
  asset,
  assetDerivation,
  assetJob,
  COMMONS_OWNER,
  draft,
  job,
  LOCAL_LEARNER_ID,
  ownerScope,
} from "@self-learn/schema";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { assetParents, conversationMade, ensureLearner, madeName } from "../src/state";
import { migratedScratchDatabase, probe, type Scratch } from "./scratch-database";
import { ASSETS, seedAssets, seedContent, TOPIC_SLUG } from "./state-fixture";
import { storedBlob } from "./stored-blob";

/**
 * `conversationMade`: what a studio conversation's jobs wrote, the reverse
 * of `assetParents`' conversation branch (D89 of docs/STUDIO-CHAT-FIRST.md):
 * deliverables only, one row per asset at its latest write, newest first,
 * with whether a picture is stored, and scoped at every hop.
 */

const reachable = await probe();

const OTHER = "other";
const LOCAL = ownerScope(LOCAL_LEARNER_ID);
const THEIRS = ownerScope(OTHER);
const HASH = "a".repeat(64);
const POSTER = "fx:poster";
const BARE_VIDEO = "video:bare-video";
const THEIR_VIDEO = "video:their-video";

describe.skipIf(!reachable.ok)("conversation made", () => {
  let scratch: Scratch;

  beforeAll(async () => {
    scratch = await migratedScratchDatabase();
    const db = scratch.db;
    await seedContent(db);
    await seedAssets(db);
    await ensureLearner(db, LOCAL_LEARNER_ID);
    await ensureLearner(db, OTHER);
    await ensureLearner(db, COMMONS_OWNER);

    // The fixture video has a stored poster; a second video has none, and
    // another owner's video is written by a job in the owner's conversation.
    await db.insert(asset).values([
      { id: POSTER, kind: "poster", path: "out/fixtures/alpha/alpha.jpg", sourceRepo: "manimkc", blobKey: await storedBlob(db, POSTER, "jpg") },
      { id: BARE_VIDEO, kind: "video", path: "out/bare-video.mp4", title: null, sourceRepo: "remotionkc", blobKey: await storedBlob(db, BARE_VIDEO, "mp4") },
      { id: THEIR_VIDEO, kind: "video", path: "out/their-video.mp4", title: "Theirs", sourceRepo: "remotionkc", ownerId: OTHER, blobKey: await theirBlob(db) },
    ]);
    await db.insert(assetDerivation).values({ assetId: POSTER, sourceAssetId: ASSETS.video });

    await db.insert(draft).values([
      { id: "draft-mine", title: "Alpha", plannerSessionId: "p1", transcriptPath: "drafts/mine/t.jsonl" },
      { id: "draft-empty", title: "Nothing yet", plannerSessionId: "p2", transcriptPath: "drafts/empty/t.jsonl" },
      { id: "draft-theirs", title: "Their talk", plannerSessionId: "p3", transcriptPath: "drafts/t/t.jsonl", ownerId: OTHER },
    ]);
    const jobRow = (id: string, draftId: string | null, kind: string, ownerId = LOCAL_LEARNER_ID) => ({
      id,
      kind,
      topicSlug: TOPIC_SLUG,
      targetPath: `learn/assets/${id}.tldr`,
      idempotencyKey: id,
      draftId,
      ownerId,
    });
    await db.insert(job).values([
      jobRow("job-draw", "draft-mine", "diagram"),
      jobRow("job-redraw", "draft-mine", "diagram"),
      jobRow("job-video", "draft-mine", "video"),
      jobRow("job-bare", "draft-mine", "video"),
      jobRow("job-elsewhere", null, "diagram"),
      jobRow("job-theirs", "draft-theirs", "diagram", OTHER),
    ]);
    await db.insert(assetJob).values([
      // The diagram drawn, then redrawn in the same conversation: one card, at the later write.
      { assetId: ASSETS.diagram, jobId: "job-draw", contentHash: HASH, bytes: 1, writtenAt: new Date("2026-10-01T00:00:00Z") },
      { assetId: ASSETS.diagram, jobId: "job-redraw", contentHash: HASH, bytes: 1, writtenAt: new Date("2026-10-03T00:00:00Z") },
      // The video and a sidecar, which is the Library's companion and no card.
      { assetId: ASSETS.video, jobId: "job-video", contentHash: HASH, bytes: 1, writtenAt: new Date("2026-10-02T00:00:00Z") },
      { assetId: ASSETS.transcript, jobId: "job-video", contentHash: HASH, bytes: 1, writtenAt: new Date("2026-10-02T00:00:00Z") },
      { assetId: BARE_VIDEO, jobId: "job-bare", contentHash: HASH, bytes: 1, writtenAt: new Date("2026-09-30T00:00:00Z") },
      // Another owner's asset, written by a job in the owner's conversation: never the owner's to see.
      { assetId: THEIR_VIDEO, jobId: "job-bare", contentHash: HASH, bytes: 1, ownerId: OTHER, writtenAt: new Date("2026-10-04T00:00:00Z") },
      { assetId: ASSETS.diagram, jobId: "job-elsewhere", contentHash: HASH, bytes: 1, writtenAt: new Date("2026-10-05T00:00:00Z") },
      { assetId: THEIR_VIDEO, jobId: "job-theirs", contentHash: HASH, bytes: 1, ownerId: OTHER },
    ]);
  }, 120_000);

  afterAll(async () => {
    await scratch?.drop();
  });

  it("answers with the deliverables, one per asset at its latest write, newest first", async () => {
    expect(await conversationMade(scratch.db, "draft-mine", LOCAL)).toEqual([
      {
        id: ASSETS.diagram,
        kind: "diagram_svg",
        title: "Alpha, drawn",
        name: "alpha",
        jobId: "job-redraw",
        madeAt: "2026-10-03T00:00:00.000Z",
        thumbnail: true,
      },
      {
        id: ASSETS.video,
        kind: "video",
        title: "Alpha, animated",
        // Not a `video:<slug>` id, so no slug for Change.
        name: null,
        jobId: "job-video",
        madeAt: "2026-10-02T00:00:00.000Z",
        thumbnail: true,
      },
      {
        id: BARE_VIDEO,
        kind: "video",
        title: null,
        name: "bare-video",
        jobId: "job-bare",
        madeAt: "2026-09-30T00:00:00.000Z",
        // No poster was stored for it.
        thumbnail: false,
      },
    ]);
  });

  it("answers with nothing for a conversation that made nothing, or that does not exist", async () => {
    expect(await conversationMade(scratch.db, "draft-empty", LOCAL)).toEqual([]);
    expect(await conversationMade(scratch.db, "no-such-draft", LOCAL)).toEqual([]);
  });

  it("never names another owner's conversation or asset", async () => {
    expect(await conversationMade(scratch.db, "draft-theirs", LOCAL)).toEqual([]);
    // And the other owner reads their own, and none of the owner's.
    const theirs = await conversationMade(scratch.db, "draft-theirs", THEIRS);
    expect(theirs.map((made) => made.id)).toEqual([THEIR_VIDEO]);
    expect(await conversationMade(scratch.db, "draft-mine", THEIRS)).toEqual([]);
  });

  it("gives an asset two conversations wrote to the one that wrote it last, as assetParents does", async () => {
    const db = scratch.db;
    const LATER = "diagram:learn/assets/extended.svg";
    const TIED = "diagram:learn/assets/tied.svg";
    const HIDDEN = "diagram:learn/assets/hidden-later.svg";
    await db.insert(asset).values(
      await Promise.all(
        [LATER, TIED, HIDDEN].map(async (id) => ({
          id,
          kind: "diagram_svg",
          path: id.slice("diagram:".length),
          sourceRepo: "self-learn",
          blobKey: await storedBlob(db, id, "svg"),
        })),
      ),
    );
    await db.insert(draft).values([
      { id: "draft-a", title: "Accepted here", plannerSessionId: "pa", transcriptPath: "drafts/a/t.jsonl" },
      { id: "draft-b", title: "Extended here", plannerSessionId: "pb", transcriptPath: "drafts/b/t.jsonl" },
      { id: "draft-their-b", title: "Theirs, later", plannerSessionId: "pc", transcriptPath: "drafts/c/t.jsonl", ownerId: OTHER },
    ]);
    const jobRow = (id: string, draftId: string, ownerId = LOCAL_LEARNER_ID) => ({
      id,
      kind: "diagram",
      topicSlug: TOPIC_SLUG,
      targetPath: `learn/assets/${id}.tldr`,
      idempotencyKey: id,
      draftId,
      ownerId,
    });
    await db.insert(job).values([jobRow("job-a", "draft-a"), jobRow("job-b", "draft-b"), jobRow("job-their-b", "draft-their-b", OTHER)]);
    const at = (iso: string) => new Date(iso);
    await db.insert(assetJob).values([
      // Accepted in A, extended in B a day later: B's.
      { assetId: LATER, jobId: "job-a", contentHash: HASH, bytes: 1, writtenAt: at("2026-10-01T00:00:00Z") },
      { assetId: LATER, jobId: "job-b", contentHash: HASH, bytes: 1, writtenAt: at("2026-10-02T00:00:00Z") },
      // Written by both at one instant: the smaller draft id's, A.
      { assetId: TIED, jobId: "job-a", contentHash: HASH, bytes: 1, writtenAt: at("2026-10-01T00:00:00Z") },
      { assetId: TIED, jobId: "job-b", contentHash: HASH, bytes: 1, writtenAt: at("2026-10-01T00:00:00Z") },
      // A later write by another owner's conversation the owner cannot read: still A's to them.
      { assetId: HIDDEN, jobId: "job-a", contentHash: HASH, bytes: 1, writtenAt: at("2026-10-01T00:00:00Z") },
      { assetId: HIDDEN, jobId: "job-their-b", contentHash: HASH, bytes: 1, ownerId: OTHER, writtenAt: at("2026-10-03T00:00:00Z") },
    ]);

    const ids = async (draftId: string) => (await conversationMade(db, draftId, LOCAL)).map((made) => made.id);
    expect((await ids("draft-a")).sort()).toEqual([HIDDEN, TIED].sort());
    expect(await ids("draft-b")).toEqual([LATER]);
    // B's card is its own write, not A's.
    expect((await conversationMade(db, "draft-b", LOCAL))[0]).toMatchObject({ jobId: "job-b", madeAt: "2026-10-02T00:00:00.000Z" });

    // The other direction agrees: each asset's latest conversation is the one listing it.
    const parents = await assetParents(db, [LATER, TIED, HIDDEN], LOCAL);
    expect(parents[LATER]?.conversations[0]?.id).toBe("draft-b");
    expect(parents[TIED]?.conversations[0]?.id).toBe("draft-a");
    expect(parents[HIDDEN]?.conversations.map((c) => c.id)).toEqual(["draft-a"]);
  });

  it("takes a diagram's slug from its SVG's path and a video's from its id", () => {
    expect(madeName("diagram:learn/assets/tcp-vs-udp.svg", "diagram_svg", "learn/assets/tcp-vs-udp.svg")).toBe("tcp-vs-udp");
    expect(madeName("diagram:x", "diagram_svg", null)).toBeNull();
    expect(madeName("video:dengue-infection-phases", "video", "out/x.mp4")).toBe("dengue-infection-phases");
    expect(madeName("manimkc:algorithms/x/video", "video", null)).toBeNull();
  });
});

/** A present blob in the other owner's store, for their video. */
async function theirBlob(db: Scratch["db"]): Promise<string> {
  const { createHash } = await import("node:crypto");
  const { blobObject } = await import("@self-learn/schema");
  const sha256 = createHash("sha256").update("their-video").digest("hex");
  const key = `${OTHER}/${sha256}.mp4`;
  await db.insert(blobObject).values({
    key,
    ownerId: OTHER,
    sha256,
    bytes: 1,
    mime: "video/mp4",
    provider: "fs",
    state: "present",
    confirmedAt: new Date(),
  });
  return key;
}
