import { BlobIntegrityError, BlobKeyError, BlobRangeError, type BlobMeta, type BlobRange } from "./store";

/**
 * The key scheme, `<owner_id>/<sha256>.<ext>`, and the checks every adapter
 * shares.
 *
 * **Everything in a key is lowercase.** The owner id is checked rather than
 * folded, because two ids that differ only in case are two owners and folding
 * would merge them; the hash and the extension are folded, because `ABC` and
 * `abc` are the same hash and the same type. Lowercase is not taste: macOS's
 * default filesystem is case-insensitive while S3 and R2 are not, so a key that
 * could differ only in case would name one file on the laptop and two objects
 * in the cloud.
 *
 * **Exactly two segments.** A key becomes a relative path in the `fs` adapter,
 * so a shape that admits `..`, a leading `/` or a third segment is a path
 * traversal waiting for a caller that forgets to check. Refusing them here
 * means no adapter has to.
 */

/*
 * The same rule as the database's `blob_object_key_check` since migration
 * 0013, which builds that check from `BLOB_KEY_PATTERN` in
 * packages/schema/src/content.ts. 0010's check was looser (any owner without
 * a slash, an optional extension of any length); 0013 tightened it to this
 * rather than relaxing this to match, since that would admit `..` as an owner
 * and mixed case, the two things the rules above exist to refuse.
 * `test/key.test.ts` holds `key()` and `isKey()` against the pattern, so the
 * two cannot drift apart.
 */
const OWNER = /^[a-z0-9][a-z0-9_-]{0,63}$/;
const SHA256 = /^[0-9a-f]{64}$/;
const EXT = /^[a-z0-9]{1,16}$/;
const KEY = /^([a-z0-9][a-z0-9_-]{0,63})\/([0-9a-f]{64})\.([a-z0-9]{1,16})$/;

export interface ParsedKey {
  ownerId: string;
  sha256: string;
  ext: string;
}

/**
 * Builds a key. `ext` may carry its leading dot (`.mp4`) and either case; the
 * hash may be either case. The owner id must already be valid.
 */
export function key(ownerId: string, sha256: string, ext: string): string {
  if (!OWNER.test(ownerId)) {
    throw new BlobKeyError(
      `owner id ${JSON.stringify(ownerId)} must be 1 to 64 of a-z, 0-9, _ and -, starting with a letter or digit`,
    );
  }
  const hash = sha256.toLowerCase();
  if (!SHA256.test(hash)) {
    throw new BlobKeyError(`${JSON.stringify(sha256)} is not a hex sha256`);
  }
  const extension = (ext.startsWith(".") ? ext.slice(1) : ext).toLowerCase();
  if (!EXT.test(extension)) {
    throw new BlobKeyError(`extension ${JSON.stringify(ext)} must be 1 to 16 of a-z and 0-9`);
  }
  return `${ownerId}/${hash}.${extension}`;
}

/** Splits a key into its parts, refusing anything `key()` could not have made. */
export function parseKey(value: string): ParsedKey {
  const match = KEY.exec(value);
  if (match === null) {
    throw new BlobKeyError(`${JSON.stringify(value)} is not a blob key; expected <owner_id>/<sha256>.<ext>, all lowercase`);
  }
  const [, ownerId = "", sha256 = "", ext = ""] = match;
  return { ownerId, sha256, ext };
}

export function isKey(value: string): boolean {
  return KEY.test(value);
}

export function isOwnerId(value: string): boolean {
  return OWNER.test(value);
}

/**
 * Checks `meta` on its own and against the key, before a byte is read. A
 * `meta.sha256` that is not the key's hash is refused here because content
 * addressing is the whole guarantee: a row can only point at the wrong bytes if
 * a key is ever stored under a hash that is not its own.
 */
export function checkMeta(parsed: ParsedKey, meta: BlobMeta): void {
  if (!SHA256.test(meta.sha256)) {
    throw new BlobIntegrityError(`meta.sha256 ${JSON.stringify(meta.sha256)} is not a lowercase hex sha256`);
  }
  if (meta.sha256 !== parsed.sha256) {
    throw new BlobIntegrityError(`meta.sha256 ${meta.sha256} is not the key's hash ${parsed.sha256}`);
  }
  if (!Number.isSafeInteger(meta.bytes) || meta.bytes < 0) {
    throw new BlobIntegrityError(`meta.bytes ${meta.bytes} is not a byte count`);
  }
  if (typeof meta.mime !== "string" || !meta.mime.includes("/")) {
    throw new BlobIntegrityError(`meta.mime ${JSON.stringify(meta.mime)} is not a media type`);
  }
}

/**
 * Resolves a range against an object's size: `end` clamped to the last byte,
 * anything that cannot be served refused. Returns the inclusive pair to read.
 */
export function resolveRange(range: BlobRange, size: number): BlobRange {
  const { start, end } = range;
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || start > end) {
    throw new BlobRangeError(`range ${start}-${end} is not 0 <= start <= end in whole bytes`);
  }
  if (start >= size) {
    throw new BlobRangeError(`range starts at ${start}, past the object's ${size} bytes`);
  }
  return { start, end: Math.min(end, size - 1) };
}
