import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";

import { type BlobStore, BlobIntegrityError, fsStore, key as blobKey } from "@self-learn/blob";
import { blobObject } from "@self-learn/schema";
import { eq, sql } from "drizzle-orm";

import type { CatalogDatabase } from "../db";
import { blobRoot, loadEnv } from "../env";
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

/**
 * Per-owner caps (phase 4 of docs/CONTENT-MIGRATION.md): the most bytes one
 * owner may keep in the store, and the most new objects one owner may upload
 * in a rolling 24 hours. Both unset by default, which is no cap, and that is
 * today: one owner, uploading from their own laptop.
 */
export const OWNER_BYTES_CAP_ENV = "SELF_LEARN_OWNER_BYTES_CAP";
export const OWNER_UPLOADS_PER_DAY_ENV = "SELF_LEARN_OWNER_UPLOADS_PER_DAY";

/** The window the uploads cap counts over. Rolling, never a calendar day, as the studio's spend cap. */
export const UPLOAD_WINDOW_MS = 24 * 60 * 60 * 1000;

export interface OwnerCaps {
  /** Most bytes one owner's `blob_object` rows may add up to; null for no cap. */
  bytes: number | null;
  /** Most new objects one owner may upload in `UPLOAD_WINDOW_MS`; null for no cap. */
  uploadsPerDay: number | null;
}

/**
 * A cap variable that is not a whole number, or one too large to count
 * exactly. Thrown before a new object is measured or stored; a key that
 * already has a row never reads the caps at all (`uploadBlob`).
 */
export class OwnerCapConfigError extends Error {
  readonly code = "BLOB_CAP_CONFIG";
  constructor(variable: string, value: string) {
    const example = variable === OWNER_BYTES_CAP_ENV ? "bytes, such as 5000000000 for 5 GB" : "uploads, such as 200";
    super(
      /^\d+$/.test(value)
        ? `${variable}=${value} is larger than ${Number.MAX_SAFE_INTEGER}, the largest count the catalog can ` +
            `compare exactly. Set it to a smaller count (${example}), or unset it for no cap.`
        : `${variable}=${JSON.stringify(value)} is not a whole number. Set it to a count (${example}), or unset it for no cap.`,
    );
    this.name = "OwnerCapConfigError";
  }
}

function capFrom(env: Record<string, string | undefined>, variable: string): number | null {
  const raw = env[variable]?.trim();
  if (raw === undefined || raw === "") return null;
  // Refused rather than read as unset, unlike STUDIO_DAILY_USD: an upload is a
  // command a person runs and watches, so a typo is a sentence they can fix at
  // once, where silently dropping the cap would let an owner past it.
  if (!/^\d+$/.test(raw) || !Number.isSafeInteger(Number(raw))) throw new OwnerCapConfigError(variable, raw);
  return Number(raw);
}

/**
 * The caps, or the reason they cannot be read, for the commands that report
 * them (`doctor`, `status`, `blob audit`) rather than upload under them.
 */
export function ownerCapsOrError(env?: Record<string, string | undefined>): OwnerCaps | { error: string } {
  try {
    return ownerCaps(env);
  } catch (error) {
    if (!(error instanceof OwnerCapConfigError)) throw error;
    return { error: error.message };
  }
}

/**
 * The caps in force, from the environment, `services/catalog/.env` included,
 * where `SELF_LEARN_HOME` is set too. Zero is a real cap: nothing more for
 * that owner.
 */
export function ownerCaps(env?: Record<string, string | undefined>): OwnerCaps {
  if (env === undefined) loadEnv();
  const from = env ?? process.env;
  return { bytes: capFrom(from, OWNER_BYTES_CAP_ENV), uploadsPerDay: capFrom(from, OWNER_UPLOADS_PER_DAY_ENV) };
}

/** An upload an owner's cap refuses. Nothing was stored and no row was written. */
export class OwnerCapError extends Error {
  readonly code = "BLOB_CAP";
  constructor(
    readonly owner: string,
    readonly cap: "bytes" | "uploads-per-day",
    message: string,
  ) {
    super(message);
    this.name = "OwnerCapError";
  }
}

/**
 * The fields a `--json` failure carries for a cap refusal, beside its
 * sentence: the code a script branches on, and for `BLOB_CAP` whose cap it
 * was. Empty for any other error.
 */
export function capFailureFields(error: unknown): Record<string, string> {
  if (error instanceof OwnerCapError) return { code: error.code, owner: error.owner, cap: error.cap };
  if (error instanceof OwnerCapConfigError) return { code: error.code };
  return {};
}

/** What one owner holds in `blob_object`, measured by the key prefix every object carries. */
export interface OwnerUsage {
  owner: string;
  /** Rows under `<owner>/`, pending and present. */
  objects: number;
  /** Their bytes added up, pending included: an upload in flight is about to be stored. */
  bytes: number;
  /** Rows first written in the last `UPLOAD_WINDOW_MS`. */
  uploadsLastDay: number;
}

/** One owner's usage, or every owner's when `owner` is omitted. */
export async function ownerUsage(
  db: CatalogDatabase,
  options: { owner?: string; now?: Date } = {},
): Promise<OwnerUsage[]> {
  // The window is measured on the database's clock, the one that stamped
  // `created_at`, so an app server whose clock drifts cannot move an upload
  // in or out of it. `now` is for a caller that reports as of a moment.
  const since =
    options.now === undefined
      ? sql`now() - make_interval(secs => ${UPLOAD_WINDOW_MS / 1000})`
      : sql`${new Date(options.now.getTime() - UPLOAD_WINDOW_MS).toISOString()}::timestamptz`;
  // By `owner_id`, which the table's check ties to the key's prefix
  // (`starts_with(key, owner_id || '/' || sha256)`), so this is the prefix the
  // store lists by and the column the owner index serves.
  const { rows } = await db.execute<{ owner: string; objects: number; bytes: string; uploads: number }>(sql`
    select ${blobObject.ownerId} as owner, count(*)::int as objects, coalesce(sum(${blobObject.bytes}), 0)::text as bytes,
           (count(*) filter (where ${blobObject.createdAt} > ${since}))::int as uploads
    from ${blobObject}
    where true
      ${options.owner === undefined ? sql`` : sql`and ${blobObject.ownerId} = ${options.owner}`}
    group by 1 order by ${blobObject.ownerId} collate "C"
  `);
  return rows.map((row) => ({
    owner: row.owner,
    objects: row.objects,
    bytes: Number(row.bytes),
    uploadsLastDay: row.uploads,
  }));
}

/** The advisory lock one owner's cap checks serialise on, as the text `hashtextextended` keys it by. */
export function ownerCapLock(owner: string): string {
  return `blob_owner_cap:${owner}`;
}

/**
 * Refuses an upload that would take its owner past a cap. Run under the
 * owner's advisory lock, in the transaction that writes the pending row, so
 * two uploads at once cannot both fit under a cap only one of them fits.
 *
 * Only a new object is measured. A key that already has a row is already
 * counted, bytes and day both, and writing it again (a rerun, or putting back
 * an object the store lost) adds nothing, so it is never refused, even by a
 * cap lowered below what the owner already holds, or one set to a value that
 * cannot be read (`caps` is then the reason, and only a new object is
 * refused with it). Whether the row exists is asked here, under the lock, and
 * with the row locked until this transaction commits: an audit's `--fix`
 * deleting a stale pending row cannot land between this answer and the
 * pending write below, where it would turn a counted key into a new object
 * nobody measured. A delete that committed first is seen as no row, and the
 * object is measured as new.
 */
async function checkCaps(
  tx: CatalogDatabase,
  caps: OwnerCaps | OwnerCapConfigError,
  input: { owner: string; key: string; bytes: number },
): Promise<void> {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${ownerCapLock(input.owner)}, 0))`);
  const [existing] = await tx
    .select({ key: blobObject.key })
    .from(blobObject)
    .where(eq(blobObject.key, input.key))
    .for("update");
  if (existing !== undefined) return;
  if (caps instanceof OwnerCapConfigError) throw caps;
  const [usage] = await ownerUsage(tx, { owner: input.owner });
  const bytes = usage?.bytes ?? 0;
  const uploads = usage?.uploadsLastDay ?? 0;
  if (caps.bytes !== null && bytes + input.bytes > caps.bytes) {
    throw new OwnerCapError(
      input.owner,
      "bytes",
      `${input.key} is ${input.bytes} bytes, and ${input.owner} already stores ${bytes}; together they pass the ` +
        `${caps.bytes}-byte ${OWNER_BYTES_CAP_ENV} cap. Nothing was stored. Raise the cap, or remove what ` +
        `${input.owner} no longer needs (\`catalog blob audit\` lists unreferenced objects).`,
    );
  }
  if (caps.uploadsPerDay !== null && uploads + 1 > caps.uploadsPerDay) {
    throw new OwnerCapError(
      input.owner,
      "uploads-per-day",
      `${input.owner} has uploaded ${uploads} new object(s) in the last 24 hours, and the ` +
        `${OWNER_UPLOADS_PER_DAY_ENV} cap is ${caps.uploadsPerDay}. ${input.key} was not stored. Wait, or raise the cap.`,
    );
  }
}

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
 *
 * With a cap set (`ownerCaps`), a new object that would take its owner past
 * it is refused with `OwnerCapError` before the pending row is written, so a
 * refusal stores nothing and records nothing. A key that already has a row
 * is never refused (`checkCaps`), and a present one returns before the caps
 * are read at all, so a malformed cap refuses new objects only: an unchanged
 * `catalog import` or `diagram put` still goes through.
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

  // Read only now that bytes may move. A value that cannot be read is carried
  // to `checkCaps`, which refuses a new object with it and lets a key that
  // already has a row through.
  let caps: OwnerCaps | OwnerCapConfigError;
  try {
    caps = ownerCaps();
  } catch (error) {
    if (!(error instanceof OwnerCapConfigError)) throw error;
    caps = error;
  }

  // Pending first, committed on its own. A row that was present and whose
  // object has gone goes back to pending here, which is the audit's own verdict.
  const pending = (tx: CatalogDatabase) =>
    tx
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
  if (!(caps instanceof OwnerCapConfigError) && caps.bytes === null && caps.uploadsPerDay === null) {
    await pending(db);
  } else {
    await db.transaction(async (tx) => {
      await checkCaps(tx, caps, { owner: input.ownerId, key, bytes: facts.bytes });
      await pending(tx);
    });
  }

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
