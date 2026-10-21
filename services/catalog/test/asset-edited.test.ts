import { asset, assetName, contentRevision, learner, LOCAL_LEARNER_ID, ownerScope } from "@gnosia/schema";
import type { AuthorKind } from "@gnosia/schema";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { writeContent } from "../src/content/write";
import { listAssets, writeAssetName } from "../src/state";
import { migratedScratchDatabase, probe, type Scratch } from "./scratch-database";
import { storedBlob } from "./stored-blob";

/**
 * `editedAt` on `listAssets`: when a person last changed an asset, if a
 * person's write is the last change it has had, else null (the Library's
 * "edited 2 Oct", L2 of docs/proposals/library-by-type-and-day.md, the
 * owner's call of 2026-10-05).
 *
 * Held here, through the real write seam so the snapshots have the shape the
 * catalog writes: an asset with no history has none; a person's write counts
 * and an import after it cancels it; a person-run write that only stored
 * bytes (`blob_key`) or rehooked a poster is not a change at all; a poster
 * never counts; a rename counts, and an import after it cancels it too; and
 * another owner's asset is still not listed.
 */

const reachable = await probe();
const OTHER = "owner-b";
// Revisions are append-only and outlive the rows, so every test writes
// assets of its own: a fresh id, with no history from the test before.
let run = 0;
let NOTE = "";

function note(title: string, blobKey: string | null = null) {
  return {
    id: NOTE,
    kind: "note",
    path: NOTE.slice("note:".length),
    url: null,
    title,
    sourceRepo: "gnosia",
    blobKey,
    ownerId: LOCAL_LEARNER_ID,
  };
}

describe.skipIf(!reachable.ok)("listAssets editedAt", () => {
  let scratch: Scratch;
  const bases = new Map<string, number>();

  /** One seam write of an asset, from its latest revision. */
  async function write(row: Record<string, unknown> & { id: string }, authorKind: AuthorKind, links?: Record<string, Record<string, unknown>[]>) {
    const result = await writeContent(scratch.db, {
      type: "asset",
      id: row.id,
      next: links === undefined ? { row } : { row, links },
      base: bases.get(row.id) ?? null,
      owner: LOCAL_LEARNER_ID,
      author: authorKind === "import" ? "import:test" : LOCAL_LEARNER_ID,
      authorKind,
      reason: `test ${authorKind} write`,
    });
    expect(result.changed).toBe(true);
    bases.set(row.id, result.revisionId);
    const [revision] = await scratch.db
      .select({ at: contentRevision.createdAt })
      .from(contentRevision)
      .where(eq(contentRevision.id, result.revisionId));
    return revision!.at.toISOString();
  }

  async function editedAt(id: string, reader = LOCAL_LEARNER_ID): Promise<string | null | undefined> {
    const rows = await listAssets(scratch.db, { ids: [id] }, ownerScope(reader));
    return rows[0]?.editedAt;
  }

  beforeAll(async () => {
    scratch = await migratedScratchDatabase();
    await scratch.db.insert(learner).values([{ id: LOCAL_LEARNER_ID }, { id: OTHER }]).onConflictDoNothing();
  }, 60_000);

  afterAll(async () => {
    await scratch?.drop();
  });

  beforeEach(async () => {
    run += 1;
    NOTE = `note:learn/concepts/os/tlb-${run}.md`;
    bases.clear();
    await scratch.db.delete(assetName);
    await scratch.db.delete(asset);
  });

  it("is null for an asset with no history", async () => {
    await scratch.db.insert(asset).values(note("The TLB"));
    expect(await editedAt(NOTE)).toBeNull();
  });

  it("is the time of a person's last write, and null once an import writes after it", async () => {
    const made = await write(note("The TLB"), "person");
    expect(await editedAt(NOTE)).toBe(made);
    const revised = await write(note("The TLB, revised"), "person");
    expect(await editedAt(NOTE)).toBe(revised);
    await write(note("The TLB, as the files say"), "import");
    expect(await editedAt(NOTE)).toBeNull();
  });

  it("skips a person-run write that only stored the bytes", async () => {
    const revised = await write(note("The TLB"), "person");
    const key = await storedBlob(scratch.db, "tlb");
    await write(note("The TLB", key), "person");
    expect(await editedAt(NOTE)).toBe(revised);

    // Behind an import, the same storage write does not bring a label back.
    await write(note("The TLB, as the files say", key), "import");
    await write(note("The TLB, as the files say", null), "person");
    expect(await editedAt(NOTE)).toBeNull();
  });

  it("never counts a poster, which only an upload or an accept writes", async () => {
    const video = `manimkc:out/os/paging-${run}.mp4`;
    const poster = `poster:${video}`;
    const videoKey = await storedBlob(scratch.db, "paging", "mp4");
    await write(
      { id: video, kind: "video", path: video.slice("manimkc:".length), url: null, title: "Paging", sourceRepo: "manimkc", blobKey: videoKey, ownerId: LOCAL_LEARNER_ID },
      "import",
    );
    const first = await storedBlob(scratch.db, "frame one", "jpg");
    const second = await storedBlob(scratch.db, "frame two", "jpg");
    const row = (blobKey: string, title: string) => ({
      id: poster,
      kind: "poster",
      path: null,
      url: null,
      title,
      sourceRepo: "gnosia",
      blobKey,
      ownerId: LOCAL_LEARNER_ID,
    });
    await write(row(first, "Paging (poster)"), "person", { asset_derivation: [{ sourceAssetId: video }] });
    await write(row(second, "Paging, recut (poster)"), "person", { asset_derivation: [{ sourceAssetId: video }] });
    expect(await editedAt(poster)).toBeNull();
  });

  it("counts the reader's rename, and an import after it cancels it", async () => {
    await write(note("The TLB"), "import");
    expect(await editedAt(NOTE)).toBeNull();
    await writeAssetName(scratch.db, NOTE, "Translation lookaside buffer", LOCAL_LEARNER_ID);
    const [named] = await scratch.db.select({ at: assetName.updatedAt }).from(assetName);
    expect(await editedAt(NOTE)).toBe(named!.at.toISOString());
    const imported = await write(note("The TLB, as the files say"), "import");
    expect(await editedAt(NOTE)).toBeNull();

    // A rename in the same instant as the import loses the tie: the import
    // still cancels it.
    await writeAssetName(scratch.db, NOTE, "TLB", LOCAL_LEARNER_ID);
    expect(await editedAt(NOTE)).not.toBeNull();
    await scratch.db.update(assetName).set({ updatedAt: new Date(imported) });
    expect(await editedAt(NOTE)).toBeNull();
  });

  it("reads only the assets the reader may read", async () => {
    await write(note("The TLB"), "person");
    expect(await editedAt(NOTE, OTHER)).toBeUndefined();
  });
});
