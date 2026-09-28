import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";

import { type BlobStore, BlobIntegrityError, fsStore, key as blobKey } from "@self-learn/blob";
import { blobObject } from "@self-learn/schema";
import { eq, sql } from "drizzle-orm";

import type { CatalogDatabase } from "../db";
import { blobRoot } from "../env";
import { fileFacts } from "../index/files";
import { assertWritable } from "./blob-owner";

/**
 * Putting bytes in the blob store and saying so in `blob_object`
 * (docs/CONTENT-MIGRATION.md 0.4, the `upload(file)` box, and D5).
 *
 * The order is the whole design. The `pending` row is written and committed
 * first, on its own, before a byte moves; then the bytes are streamed; then
 * the store is asked, with `head`, whether it holds exactly what was claimed;
 * only then is the row marked `present`. So an upload that dies anywhere
 * leaves a `pending` row naming the key, which is what edge cases 5 and 9
 * sweep, and never a `present` row with no object behind it. The key is the
 * hash, so a rerun of an interrupted upload writes identical bytes to the same
 * place.
 *
 * Nothing here touches `asset` or `diagram`. A caller points a row at the key
 * through the write seam (`writeContent`, `writeContents`) after this returns,
 * which is also the only order the foreign key allows: `blob_key` references
 * `blob_object(key)`.
 *
 * `blob_object` carries no revisions (D5): it is a fact about where bytes are,
 * not authored content, and the pending row exists before any revision could.
 */

/** A store the catalog opened, with the directory it is rooted at. */
export type CatalogBlobStore = BlobStore & { readonly root: string };

/**
 * The one place the catalog chooses a store: the `fs` adapter under
 * `blobRoot()` (`$SELF_LEARN_HOME/blobs`), until 0.1's cloud adapter. Every
 * command that writes or audits blobs opens it here, so the store a command
 * writes is the one the web app serves; a scratch run points
 * `SELF_LEARN_HOME` somewhere else, and both follow.
 */
export function openBlobStore(): CatalogBlobStore {
  const root = blobRoot();
  return Object.assign(fsStore(root), { root });
}

export interface UploadInput {
  ownerId: string;
  /** Absolute path to the bytes. */
  file: string;
  mime: string;
  /** The key's extension, with or without its dot. */
  ext: string;
  /** Pass both when the caller has already hashed the file, to skip a read. */
  sha256?: string;
  bytes?: number;
}

export interface UploadResult {
  key: string;
  sha256: string;
  bytes: number;
  mime: string;
  /** False when a `present` row and the object were both already there. */
  uploaded: boolean;
}


/**
 * Store one file and record it, or throw having recorded at most a `pending`
 * row.
 *
 * `db` must be the database, not a transaction: the pending row has to be
 * committed before the bytes move, or an upload that dies takes the evidence
 * of itself down with the rollback.
 */
export async function uploadBlob(
  db: CatalogDatabase,
  store: BlobStore,
  input: UploadInput,
): Promise<UploadResult> {
  const facts =
    input.sha256 !== undefined && input.bytes !== undefined
      ? { sha256: input.sha256.toLowerCase(), bytes: input.bytes }
      : await fileFacts(input.file).then((f) => ({ sha256: f.contentHash, bytes: f.bytes }));
  const key = blobKey(input.ownerId, facts.sha256, input.ext);
  // The root names the database that writes it, and only that database
  // writes it, so no `blob audit --fix` takes these bytes for orphans
  // (`blob-owner.ts`).
  if ("root" in store && typeof store.root === "string") await assertWritable(db, store.root);
  const result = { key, sha256: facts.sha256, bytes: facts.bytes, mime: input.mime };

  const [row] = await db.select().from(blobObject).where(eq(blobObject.key, key)).limit(1);
  if (row?.state === "present") {
    // The row says present, and `stat` is cheap: trust the pair, and leave the
    // full hash to the audit, which is the caller that asks for it.
    const there = await store.stat(key);
    if (there !== null && there.bytes === facts.bytes) return { ...result, uploaded: false };
  }

  // Pending first, committed on its own. A row that was present and whose
  // object has gone goes back to pending here, which is the audit's own verdict.
  await db
    .insert(blobObject)
    .values({
      key,
      ownerId: input.ownerId,
      sha256: facts.sha256,
      bytes: facts.bytes,
      mime: input.mime,
      provider: store.provider,
      state: "pending",
    })
    .onConflictDoUpdate({
      target: blobObject.key,
      set: { state: "pending", mime: input.mime, provider: store.provider, updatedAt: sql`now()` },
    });

  await store.put(key, createReadStream(input.file), {
    sha256: facts.sha256,
    bytes: facts.bytes,
    mime: input.mime,
  });

  // Ask the store rather than repeat what was claimed: `put` checked the
  // stream, and this checks what is there now.
  const head = await store.head(key);
  if (head === null || head.bytes !== facts.bytes || (head.sha256 !== undefined && head.sha256 !== facts.sha256)) {
    throw new BlobIntegrityError(
      `${key} did not read back as written (${head === null ? "absent" : `${head.bytes} bytes, sha256 ${head.sha256 ?? "unknown"}`}); its row stays pending`,
    );
  }

  await db
    .update(blobObject)
    .set({ state: "present", confirmedAt: sql`now()`, updatedAt: sql`now()` })
    .where(eq(blobObject.key, key));
  return { ...result, uploaded: true };
}

/** An audit's verdict on a row whose object is missing or wrong: back to pending, keeping when it was last seen. */
export async function markBlobPending(db: CatalogDatabase, key: string): Promise<void> {
  await db
    .update(blobObject)
    .set({ state: "pending", updatedAt: sql`now()` })
    .where(eq(blobObject.key, key));
}

/** A whole object as one buffer, checked against its key's hash. For SVGs and sidecars, never videos. */
export async function readBlob(store: BlobStore, key: string, expected?: string): Promise<Buffer> {
  const { body } = await store.get(key);
  const chunks: Buffer[] = [];
  for await (const chunk of body) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array));
  const bytes = Buffer.concat(chunks);
  const sha = createHash("sha256").update(bytes).digest("hex");
  const want = expected ?? key.slice(key.indexOf("/") + 1, key.lastIndexOf("."));
  if (sha !== want) {
    throw new BlobIntegrityError(`${key} holds bytes that hash to ${sha}, not ${want}`);
  }
  return bytes;
}
