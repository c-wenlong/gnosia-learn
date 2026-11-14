import { BlobError } from "@hermes/blob";
import { asset, assetDerivation, blobObject, learner, LOCAL_LEARNER_ID, ownerScope } from "@hermes/schema";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { ContentUnavailableError } from "../src/server/content-source";
import type { AssetSeams } from "../src/server/deps";
import { pdfSource, posterSource, resolveAsset, servedAssets } from "../src/server/asset-files";
import { migratedScratchDatabase, probe, type Scratch } from "../../../services/catalog/test/scratch-database";
import { ASSETS, seedAssets, seedContent } from "../../../services/catalog/test/state-fixture";
import { storedBlob } from "../../../services/catalog/test/stored-blob";

/**
 * The asset resolvers every file route and page check goes through, against
 * a real scratch catalog with the blob store and the content seam stood in:
 * another owner's asset answers as if it were not there, a stored object is
 * checked against the store, a note is served from its row, and a poster or
 * PDF is found by what it is.
 */

const reachable = await probe();
const OTHER = "owner-b";
// A second video, with a stored poster and a stored PDF derived from it. The
// fixture's own video keeps neither, so the miss paths stay tested on it.
const FILED = { video: "fx:filed-video", poster: "fx:filed-poster", pdf: "fx:filed-pdf" };

describe.skipIf(!reachable.ok)("asset resolvers", () => {
  let scratch: Scratch;
  const stat = vi.fn<(key: string) => Promise<{ bytes: number } | null>>(async () => ({ bytes: 1024 }));
  const concept = vi.fn<(slug: string) => Promise<{ markdown: string } | null>>(async () => ({ markdown: "# Pinned\n\nThe body." }));
  const resolution = vi.fn(async () => ({ concepts: { kind: "db" }, sessions: { kind: "db" }, diagrams: { kind: "db" } }));

  function seams(owner = LOCAL_LEARNER_ID): AssetSeams {
    return {
      scope: ownerScope(owner),
      blobStore: { stat },
      source: { concept, resolution, sessionLog: async () => null, diagram: async () => null },
    } as unknown as AssetSeams;
  }

  beforeAll(async () => {
    scratch = await migratedScratchDatabase();
    await scratch.db.insert(learner).values([{ id: LOCAL_LEARNER_ID }, { id: OTHER }]).onConflictDoNothing();
    await seedContent(scratch.db);
    await seedAssets(scratch.db);
    // The diagram is another owner's.
    await scratch.pool.query(`update asset set owner_id = '${OTHER}' where id = '${ASSETS.diagram}'`);
    // Its object is that owner's too: a blob is scoped by owner as the row is.
    const sha = "b".repeat(64);
    await scratch.db.insert(blobObject).values({
      key: `${OTHER}/${sha}.svg`,
      ownerId: OTHER,
      sha256: sha,
      bytes: 10,
      mime: "image/svg+xml",
      provider: "fs",
      state: "present",
      confirmedAt: new Date(),
    });
    await scratch.pool.query(`update asset set blob_key = '${OTHER}/${sha}.svg' where id = '${ASSETS.diagram}'`);
    await scratch.pool.query(`insert into asset_concept (asset_id, concept_slug) values ('${ASSETS.pinned}', 'alpha') on conflict do nothing`);
    await scratch.db.insert(asset).values([
      { id: FILED.video, kind: "video", path: "out/fixtures/filed.mp4", sourceRepo: "manimkc", blobKey: await storedBlob(scratch.db, FILED.video, "mp4") },
      { id: FILED.poster, kind: "poster", path: "out/fixtures/filed.jpg", sourceRepo: "manimkc", blobKey: await storedBlob(scratch.db, FILED.poster, "jpg") },
      { id: FILED.pdf, kind: "pdf", path: "out/fixtures/filed.pdf", sourceRepo: "manimkc", blobKey: await storedBlob(scratch.db, FILED.pdf, "pdf") },
    ]);
    await scratch.db.insert(assetDerivation).values([
      { assetId: FILED.poster, sourceAssetId: FILED.video },
      { assetId: FILED.pdf, sourceAssetId: FILED.video },
    ]);
  }, 60_000);

  afterAll(async () => {
    await scratch?.drop();
  });

  beforeEach(() => {
    stat.mockReset().mockResolvedValue({ bytes: 1024 });
    concept.mockClear();
    resolution.mockClear();
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.mocked(console.warn).mockRestore();
  });

  it("answers another owner's asset as not in the catalog, the same as an id nobody has", async () => {
    for (const id of [ASSETS.diagram, "fx:nobody"]) {
      expect(await resolveAsset(seams(), scratch.db, id)).toMatchObject({ ok: false, code: "not-in-catalog" });
    }
    expect(stat).not.toHaveBeenCalled();
    expect(await resolveAsset(seams(OTHER), scratch.db, ASSETS.diagram)).toMatchObject({ ok: true, source: "blob", contentType: "image/svg+xml" });
  });

  it("serves a stored object at the size the store reports, named after the asset", async () => {
    stat.mockResolvedValue({ bytes: 4321 });
    expect(await resolveAsset(seams(), scratch.db, ASSETS.video)).toMatchObject({
      ok: true,
      source: "blob",
      bytes: 4321,
      contentType: "video/mp4",
      filename: "alpha.mp4",
      title: "Alpha, animated",
    });
  });

  it("says not uploaded when the store lost the object, and blob store unavailable when it will not answer", async () => {
    stat.mockResolvedValue(null);
    expect(await resolveAsset(seams(), scratch.db, ASSETS.video)).toMatchObject({ ok: false, code: "not-uploaded" });
    stat.mockRejectedValue(new BlobError("EIO", "the disk is gone"));
    const down = await resolveAsset(seams(), scratch.db, ASSETS.video);
    expect(down).toMatchObject({ ok: false, status: 503, code: "blob-store-unavailable" });
    expect(JSON.stringify(down)).not.toContain("the disk is gone");
  });

  it("serves a note from its row, and says which flip is missing when the type is still on files", async () => {
    const note = await resolveAsset(seams(), scratch.db, ASSETS.pinned);
    expect(note).toMatchObject({ ok: true, source: "row", contentType: "text/markdown; charset=utf-8", filename: "pinned.md" });
    expect(concept).toHaveBeenCalledWith("alpha");
    concept.mockRejectedValueOnce(new ContentUnavailableError("not-flipped", "concepts", "Run `npm run catalog -- flip concepts`."));
    expect(await resolveAsset(seams(), scratch.db, ASSETS.pinned)).toMatchObject({ ok: false, status: 503, code: "not-flipped" });
  });

  it("lets a catalog read that fails for any other reason propagate, rather than calling it the store's", async () => {
    const down = new Error("catalog down");
    concept.mockRejectedValueOnce(down);
    await expect(resolveAsset(seams(), scratch.db, ASSETS.pinned)).rejects.toBe(down);
  });

  it("has no file for a link", async () => {
    expect(await resolveAsset(seams(), scratch.db, ASSETS.link)).toMatchObject({ ok: false, code: "no-file" });
  });

  it("lists as served the present blobs and the row kinds the database owns, and only the owner's", async () => {
    const rows = [
      { id: ASSETS.video, kind: "video" },
      { id: ASSETS.diagram, kind: "diagram_svg" },
      { id: ASSETS.pinned, kind: "note" },
      { id: ASSETS.link, kind: "link" },
    ];
    expect([...(await servedAssets(seams(), scratch.db, rows))].sort()).toEqual([ASSETS.pinned, ASSETS.video].sort());
    resolution.mockResolvedValueOnce({ concepts: { kind: "files" }, sessions: { kind: "db" }, diagrams: { kind: "db" } });
    expect([...(await servedAssets(seams(), scratch.db, rows))]).toEqual([ASSETS.video]);
    resolution.mockRejectedValueOnce(new Error("catalog down"));
    expect([...(await servedAssets(seams(), scratch.db, rows))]).toEqual([ASSETS.video]);
  });

  it("serves a video's stored poster and stored PDF from the blob store, by what each is", async () => {
    const posterKey = await storedBlob(scratch.db, FILED.poster, "jpg");
    const pdfKey = await storedBlob(scratch.db, FILED.pdf, "pdf");
    stat.mockResolvedValue({ bytes: 77 });
    expect(await posterSource(seams(), scratch.db, FILED.video)).toMatchObject({
      ok: true,
      source: "blob",
      key: posterKey,
      bytes: 77,
      contentType: "image/jpeg",
    });
    expect(await pdfSource(seams(), scratch.db, FILED.video)).toMatchObject({
      ok: true,
      source: "blob",
      key: pdfKey,
      bytes: 77,
      contentType: "application/pdf",
    });
    expect(stat.mock.calls).toEqual([[posterKey], [pdfKey]]);
  });

  it("finds a poster or a PDF only for a video, and says how to make one that is missing", async () => {
    for (const source of [posterSource, pdfSource]) {
      expect(await source(seams(), scratch.db, ASSETS.video)).toMatchObject({ ok: false, code: "not-uploaded" });
      expect(await source(seams(), scratch.db, ASSETS.pinned)).toMatchObject({ ok: false, code: "not-a-video" });
      expect(await source(seams(), scratch.db, ASSETS.diagram)).toMatchObject({ ok: false, code: "not-in-catalog" });
    }
  });
});
