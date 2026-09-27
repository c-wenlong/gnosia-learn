import type { Readable } from "node:stream";

/**
 * What the caller vouches for when it hands over bytes. `put` checks the first
 * two against the stream and refuses on any difference; `mime` is carried for
 * adapters that serve the object themselves (a cloud store's Content-Type) and
 * is otherwise the `blob_object` row's business.
 */
export interface BlobMeta {
  /** Lowercase hex sha256 of the whole body. Must equal the hash in the key. */
  sha256: string;
  /** Exact length of the body in bytes. */
  bytes: number;
  mime: string;
}

/** What `stat` reports: the size, without reading the bytes. */
export interface BlobStat {
  bytes: number;
}

export interface BlobHead extends BlobStat {
  /**
   * The sha256 of the bytes the store holds now, when the store can say.
   * Optional because a provider that keeps no checksum cannot report one; an
   * adapter must never fill it from the key, since the point of `head` after an
   * upload is to ask the store rather than repeat what the caller claimed.
   */
  sha256?: string;
}

/** Both ends inclusive, as in an HTTP `Range` header and `createReadStream`. */
export interface BlobRange {
  start: number;
  end: number;
}

/**
 * An open read: the bytes, and what a route needs to answer with them
 * (`Content-Length`, and for a range `Content-Range: bytes start-end/size`)
 * without a second request or a hash.
 *
 * `size` is the whole object's length. `start` and `end` are the inclusive
 * range the body holds, after clamping: `0` and `size - 1` for a whole read,
 * so an empty object reads as `start 0, end -1`, a body of no bytes.
 */
export interface BlobRead {
  body: Readable;
  size: number;
  start: number;
  end: number;
}

export interface BlobListing {
  key: string;
  bytes: number;
  /**
   * When the object was written. The audit in edge case 9 deletes an object
   * with no `blob_object` row only once it is a day old, so an upload whose
   * row is about to be written is not swept out from under it.
   */
  uploadedAt: Date;
}

/** The value `blob_object.provider` records for the store that holds a row. */
export type BlobProvider = "fs" | "vercel-blob" | "r2";

/**
 * One interface for every place bytes can live (D5 of docs/CONTENT-MIGRATION.md).
 *
 * Keys are content addressed, `<owner_id>/<sha256>.<ext>` (see `key.ts`), and
 * every method refuses a key that is not of that shape with `BlobKeyError`.
 * The contract each method keeps is written beside it, and
 * `test/conformance.ts` is the executable form of the same contract: an
 * adapter is correct when that suite passes against it unchanged.
 */
export interface BlobStore {
  readonly provider: BlobProvider;

  /**
   * Stores `body` under `key`, or stores nothing.
   *
   * The body is hashed and counted as it streams, and a sha256 or byte count
   * that differs from `meta`, or a `meta.sha256` that differs from the key's,
   * rejects with `BlobIntegrityError` and leaves no object behind. A body that
   * runs past `meta.bytes` is refused at that point rather than read to the
   * end. The object becomes visible to `head`, `get` and `list` all at once,
   * never partially. Putting a key that already exists succeeds and leaves the
   * same bytes, since the key is their hash. `put` owns `body`: it is consumed
   * on success and destroyed on any refusal.
   */
  put(key: string, body: Readable, meta: BlobMeta): Promise<void>;

  /**
   * Size and, where the store can measure it, the hash; null when absent.
   * Measuring may read every byte (the `fs` adapter does), so this is the
   * integrity check, not the way to learn a size.
   */
  head(key: string): Promise<BlobHead | null>;

  /** The size alone, without reading the bytes; null when absent. */
  stat(key: string): Promise<BlobStat | null>;

  /**
   * The object, or `range` of it, with the object's size and the range the
   * body holds (`BlobRead`). Rejects with `BlobNotFoundError` when the key is
   * absent, before any stream is returned. A range whose `end` runs past the
   * object is clamped to its last byte, as HTTP does; one whose `start` is at
   * or beyond the end, or that is not a pair of integers with
   * `0 <= start <= end`, rejects with `BlobRangeError`.
   */
  get(key: string, range?: BlobRange): Promise<BlobRead>;

  /**
   * A URL a browser can fetch the object from, Range requests included, for
   * about `ttlSeconds`. Null when the store has no such URL and the caller
   * must stream through `get` instead, which is the `fs` adapter's answer.
   */
  signedUrl(key: string, ttlSeconds: number): Promise<string | null>;

  /** Removes the object. Deleting an absent key succeeds. */
  delete(key: string): Promise<void>;

  /**
   * Every object whose key starts with `prefix`, as a plain string prefix the
   * way S3 lists, so `list("<owner_id>/")` is one tenant's objects (D3, D5).
   * Order is unspecified. An in-flight `put` is never listed.
   */
  list(prefix: string): AsyncIterable<BlobListing>;
}

/**
 * Every refusal the package makes is one of these, with a stable `code`, so a
 * caller can tell a bad key from missing bytes without matching on messages.
 */
export class BlobError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = new.target.name;
    this.code = code;
  }
}

/** The key is not `<owner_id>/<sha256>.<ext>`. A caller bug, never data. */
export class BlobKeyError extends BlobError {
  constructor(message: string) {
    super("BLOB_KEY", message);
  }
}

/** The bytes are not what `meta` or the key said they would be. */
export class BlobIntegrityError extends BlobError {
  constructor(message: string) {
    super("BLOB_INTEGRITY", message);
  }
}

export class BlobNotFoundError extends BlobError {
  constructor(key: string) {
    super("BLOB_NOT_FOUND", `no object at ${key}`);
  }
}

/** The equivalent of HTTP 416: the range cannot be served from this object. */
export class BlobRangeError extends BlobError {
  constructor(message: string) {
    super("BLOB_RANGE", message);
  }
}
