import "server-only";

import path from "node:path";
import { Readable } from "node:stream";

import { BlobError, BlobNotFoundError, BlobRangeError, type BlobRead } from "@self-learn/blob";
import {
  assetBlobs,
  assetsByIds,
  conceptsForAsset,
  documentBytes,
  posterBlob,
  videosWithStoredPoster,
  type AssetBlob,
  type AssetRef,
  type CatalogDatabase,
} from "@self-learn/catalog/state";
import type { ContentType } from "@self-learn/content";

import { ContentUnavailableError, contentSource } from "@/data/source";
import type { RouteProblemCode } from "@/lib/asset-problems";
import { assetBlobStore } from "@/lib/blob-store";

/**
 * Turning an `asset` row into bytes a browser can play.
 *
 * **Two places the bytes can be, and neither is a file in the tree.** A row
 * that names a `blob_key` is served from the blob store (`catalog asset
 * upload` put the videos, their sidecars and posters there; a diagram's SVG
 * lands there on `diagram put`). A concept note, a session log or a diagram's
 * `.tldr` is served from its row. Since phase 2 of docs/CONTENT-MIGRATION.md
 * there is no third place: the legacy branch that read a file off this
 * machine's disk under the repository or manimkc's data root, and the
 * `ASSET_FILES_ENABLED` switch that gated it, are gone, and a row with
 * neither a blob nor row text answers `not-uploaded`.
 *
 * **The identifier never becomes a path.** Nothing from the URL is joined onto
 * anything. The id is a primary key: it is looked up, and what comes back is a
 * row whose blob key the store validates (`<owner>/<sha256>.<ext>`) or whose
 * text the database holds. An id of `manimkc:out/../../../../etc/passwd`
 * finds no row and stops there.
 */

/**
 * Extension to content type, and the list is closed.
 *
 * Every kind here is one the catalog actually stores: `mp4` videos with `vtt`
 * captions and `json` transcripts and chapters from manimkc, `svg` diagrams
 * from tldrawkc, `md` notes and session logs, `png` for a raster the
 * knowledge base may carry, `jpg` posters. An extension that is not here is
 * refused rather than sent as `application/octet-stream`, because an
 * unrecognised extension means an asset kind nobody has thought about, and
 * guessing is how an `.html` ends up executing in this origin.
 *
 * `.svg` is the dangerous one and it is the reason for the CSP the route sets:
 * an SVG is a document, so navigating to one served from this origin runs any
 * script inside it with this origin's cookies and storage. `image/svg+xml` is
 * still the right type, since the point is to put it in an `<img>`; the
 * sandbox is what makes it safe.
 */
export const CONTENT_TYPES: Readonly<Record<string, string>> = {
  ".mp4": "video/mp4",
  ".svg": "image/svg+xml",
  ".vtt": "text/vtt",
  ".json": "application/json",
  ".md": "text/markdown; charset=utf-8",
  ".png": "image/png",
  // A poster, cut from a video by `catalog asset upload` and served from the
  // blob store (docs/CONTENT-MIGRATION.md, Track E).
  ".jpg": "image/jpeg",
};

/** The declared type for a file name, or null when the extension is not on the list. */
export function contentTypeFor(file: string): string | null {
  return CONTENT_TYPES[path.extname(file).toLowerCase()] ?? null;
}

/** A resolution that failed, with the status the route should answer. */
export interface AssetFileProblem {
  ok: false;
  /** 404 for "nothing to serve", 503 for "this server cannot answer yet". */
  status: 404 | 503;
  /**
   * Which failure this is, for a component to switch on. `detail` is prose
   * for a person reading the raw response and may name a stored path; `code`
   * names only the category, and is the one the page is allowed to show.
   */
  code: RouteProblemCode;
  error: string;
  detail: string;
}

const missing = (code: RouteProblemCode, detail: string): AssetFileProblem => ({
  ok: false,
  status: 404,
  code,
  error: "No such asset file.",
  detail,
});

/**
 * A filename safe to put in a header. Only the basename, and only characters
 * that cannot terminate a quoted string or inject a header line, which rules
 * out CR and LF by construction rather than by checking for them.
 */
export function safeFilename(file: string): string {
  const ascii = path.basename(file).replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 120);
  return ascii === "" || ascii === "." || ascii === ".." ? "asset" : ascii;
}

/* -------------------------------------------------------------------------- */
/* The blob store                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Bytes the blob store holds for an asset (docs/CONTENT-MIGRATION.md, Track E).
 *
 * An asset whose row names a `blob_key` was uploaded on purpose, by `catalog
 * asset upload` or a diagram's Accept, and the key is the sha256 of the bytes
 * its `content_hash` records, so the store cannot hand back anything but what
 * was indexed. A `pending` blob, or an object the store no longer has, answers
 * `not-uploaded` (edge cases 5 and 9).
 *
 * **Nothing about the path here.** The key comes from the row, the store
 * refuses any key not shaped `<owner>/<sha256>.<ext>`, and the content type
 * comes off the key's extension through the closed list above.
 */
export interface AssetStored {
  ok: true;
  source: "blob";
  key: string;
  /** From the store's `stat`, not the row: the object is what gets sent. */
  bytes: number;
  sha256: string;
  contentType: string;
  filename: string;
}

/**
 * An asset whose bytes are a row, once the database owns its type: a concept
 * note (rendered as its row renders it), a session log (its entries
 * concatenated) or a diagram's `.tldr` (its document as canonical JSON). The
 * text is small, so it is held whole rather than streamed.
 */
export interface AssetRowText {
  ok: true;
  source: "row";
  body: Buffer;
  bytes: number;
  contentType: string;
  filename: string;
}

/** Wherever an asset's bytes are served from. */
export type AssetSource = AssetStored | AssetRowText;
export type AssetSourceResult = AssetSource | AssetFileProblem;

const notUploaded = (detail: string): AssetFileProblem => ({
  ok: false,
  status: 404,
  code: "not-uploaded",
  error: "No such asset file.",
  detail,
});

/** A blob store that would not open or answer: the root is misconfigured, or a cloud store is down. */
export function blobStoreProblem(error: unknown): AssetFileProblem {
  if (error instanceof BlobNotFoundError) {
    return notUploaded("The blob store no longer holds this object. Run `npm run catalog -- blob audit`.");
  }
  const message = error instanceof Error ? error.message : String(error);
  console.warn(`asset file: blob store unavailable: ${message}`);
  return {
    ok: false,
    status: 503,
    code: "blob-store-unavailable",
    error: "The blob store is unavailable.",
    detail: error instanceof BlobError ? `${error.code}: could not read from the blob store.` : "Could not read from the blob store.",
  };
}

/**
 * One stored object, checked: `present`, of a served type, and still in the
 * store. `name` is what the saved file is called: the asset's logical path,
 * whose extension is replaced by the object's (a poster is `<video>.jpg`).
 */
export async function resolveBlob(blob: AssetBlob, name: string): Promise<AssetStored | AssetFileProblem> {
  if (blob.state !== "present") {
    return notUploaded(
      `Asset ${blob.assetId} is kept in the blob store and its upload has not been confirmed. Rerun the upload.`,
    );
  }
  const ext = path.extname(blob.key).toLowerCase();
  const contentType = CONTENT_TYPES[ext] ?? null;
  if (contentType === null) {
    console.warn(`asset file: refusing ${blob.assetId}, unrecognised blob extension`);
    return missing("unsupported-type", `Asset ${blob.assetId} is stored with an extension this route will not serve.`);
  }
  let size: number;
  try {
    const stat = await assetBlobStore().stat(blob.key);
    if (stat === null) {
      console.warn(`asset file: ${blob.assetId} names ${blob.key}, which the store does not hold; run catalog blob audit`);
      return notUploaded(`Asset ${blob.assetId} is kept in the blob store, which no longer has it.`);
    }
    size = stat.bytes;
  } catch (error) {
    return blobStoreProblem(error);
  }
  const stem = path.basename(name).replace(/\.[^.]*$/, "");
  return {
    ok: true,
    source: "blob",
    key: blob.key,
    bytes: size,
    sha256: blob.sha256,
    contentType,
    filename: safeFilename(`${stem === "" ? "asset" : stem}${ext}`),
  };
}

/* -------------------------------------------------------------------------- */
/* Rows                                                                        */
/* -------------------------------------------------------------------------- */

/**
 * The asset kinds whose bytes are a row (Tracks C and D of
 * docs/CONTENT-MIGRATION.md): a note, a session log and a diagram's `.tldr`
 * live in the database, and phase 3 deletes the files they came from.
 */
const ROW_KINDS: Readonly<Record<string, ContentType>> = {
  note: "concepts",
  session: "sessions",
  diagram_source: "diagrams",
};

/**
 * What a row's text is served as. A second, smaller list than `CONTENT_TYPES`
 * on purpose: a `.tldr` is served only as the canonical document the database
 * holds, and no stored object is ever served as one.
 */
const ROW_CONTENT_TYPES: Readonly<Record<ContentType, string | undefined>> = {
  topics: undefined,
  tags: undefined,
  courses: undefined,
  concepts: "text/markdown; charset=utf-8",
  sessions: "text/markdown; charset=utf-8",
  diagrams: "application/json",
};

/** The kinds `ROW_KINDS` covers, for a caller deciding servability without the text. */
export function rowTypeFor(kind: string): ContentType | null {
  return ROW_KINDS[kind] ?? null;
}

/**
 * A row kind whose type this database has not flipped. The web app reads the
 * database only (`@/data/source`), so the text cannot be served, and the
 * answer says which flip is missing rather than calling the asset gone.
 */
const notFlipped = (error: ContentUnavailableError): AssetFileProblem => ({
  ok: false,
  status: 503,
  code: "not-flipped",
  error: "This content is not in the database yet.",
  detail: error.message,
});

/**
 * The asset's bytes from its row, or `undefined` when it is not a row kind and
 * the caller goes on. Every name here comes from the row the id found, never
 * from the URL.
 *
 * An unreachable catalog is thrown, as every other read here throws it, so
 * the route answers `catalog-unreachable`; only a type that is not flipped is
 * an answer of its own.
 */
export async function resolveRowText(
  db: CatalogDatabase,
  row: AssetRef,
): Promise<AssetRowText | AssetFileProblem | undefined> {
  const type = rowTypeFor(row.kind);
  if (type === null) return undefined;
  const seam = contentSource();

  const name = path.basename(row.path ?? row.id);
  let body: Buffer | null = null;
  try {
    if (type === "concepts") {
      // A note asset is linked to exactly one concept, its own: the concepts
      // indexer and the row writer both link it so.
      const [slug] = await conceptsForAsset(db, row.id);
      const note = slug === undefined ? null : await seam.concept(slug);
      body = note === null ? null : Buffer.from(note.markdown, "utf8");
    } else if (type === "sessions") {
      const log = await seam.sessionLog(name.replace(/\.md$/, ""));
      body = log === null ? null : Buffer.from(log.markdown, "utf8");
    } else {
      const diagram = await seam.diagram(name.replace(/\.tldr$/, ""));
      body = diagram === null ? null : documentBytes(diagram.document);
    }
  } catch (error) {
    if (error instanceof ContentUnavailableError && error.reason === "not-flipped") return notFlipped(error);
    throw error;
  }
  if (body === null) {
    return missing(
      "not-in-catalog",
      `The database holds no text for asset ${row.id}; it was archived, or never written.`,
    );
  }
  const contentType = ROW_CONTENT_TYPES[type];
  if (contentType === undefined) {
    return missing("unsupported-type", `Asset ${row.id} is a ${row.kind}, which this route will not serve.`);
  }
  return { ok: true, source: "row", body, bytes: body.length, contentType, filename: safeFilename(name) };
}

/** A row with a file-shaped path and no stored copy of its bytes. */
const noStoredCopy = (row: AssetRef): AssetFileProblem =>
  row.path === null
    ? // A `link` asset is a URL and nothing else: a row about something on
      // the web, so there is no file to serve and never will be.
      missing("no-file", `Asset ${row.id} is a ${row.kind} with no file; it has a url.`)
    : {
        ok: false,
        status: 404,
        code: "not-uploaded",
        error: "No such asset file.",
        detail:
          `Asset ${row.id} has no copy in the blob store, and this server reads no files off its disk. ` +
          `Run \`npm run catalog -- asset upload --source manimkc\` for a video or its sidecars.`,
      };

/**
 * An asset id to where its bytes are served from, or the reason there is
 * nowhere: the blob store when the row names a key, else the row itself for a
 * note, a log or a `.tldr`. Every route and every page check goes through
 * this, so the page and the route cannot give one asset two answers.
 */
export async function resolveAsset(db: CatalogDatabase, id: string): Promise<AssetSourceResult> {
  const [row] = await assetsByIds(db, [id]);
  if (row === undefined) return missing("not-in-catalog", `No asset ${JSON.stringify(id)} in the catalog.`);
  const blob = (await assetBlobs(db, [row.id])).get(row.id);
  if (blob !== undefined) return resolveBlob(blob, row.path ?? row.id);
  const text = await resolveRowText(db, row);
  if (text !== undefined) return text;
  return noStoredCopy(row);
}

/**
 * Which of these assets can be served: a blob the catalog records as
 * `present`, or a row kind whose type the database owns. For the pages'
 * thumbnails, which decide per row whether to draw a picture before the
 * browser asks. One query and one ownership read for the whole page, where
 * `resolveAsset` per card would stat the store and read every text; a card
 * whose picture then fails asks the status route why.
 *
 * An unreadable ownership leaves the row kinds out rather than failing the
 * set: the blobs were read, and a card with no picture is the honest answer
 * for a row this request could not vouch for.
 */
export async function servedAssets(
  db: CatalogDatabase,
  rows: readonly Pick<AssetRef, "id" | "kind">[],
): Promise<Set<string>> {
  const out = new Set<string>();
  if (rows.length === 0) return out;
  const blobs = await assetBlobs(db, rows.map((row) => row.id));
  for (const [id, blob] of blobs) if (blob.state === "present") out.add(id);
  const needsRow = rows.filter((row) => !out.has(row.id) && rowTypeFor(row.kind) !== null);
  if (needsRow.length > 0) {
    const owned = await contentSource()
      .resolution()
      .catch(() => null);
    for (const row of needsRow) {
      const type = rowTypeFor(row.kind);
      if (owned !== null && type !== null && owned[type].kind === "db") out.add(row.id);
    }
  }
  return out;
}

/**
 * The videos among these whose card can show a poster: the ones `catalog
 * asset upload` stored a poster for. Nothing cuts a poster at request time
 * any more, so a video with none shows the placeholder.
 */
export async function storedPosters(
  db: CatalogDatabase,
  rows: readonly Pick<AssetRef, "id" | "kind">[],
): Promise<Set<string>> {
  return videosWithStoredPoster(db, rows.filter((row) => row.kind === "video").map((row) => row.id));
}

/**
 * Where a video's poster comes from: the one `catalog asset upload` stored,
 * found by what it is (the `poster` asset derived from this video), not by
 * guessing its id. A stored poster that is `pending` or gone answers
 * `not-uploaded` like any other blob.
 *
 * The frame used to be cut here with ffmpeg from the video's file when none
 * was stored. That read the legacy file off this machine's disk, which phase
 * 2 retired with the file branch; the upload uses the same recipe
 * (`services/catalog/src/poster/recipe.ts`), so no picture was lost.
 */
export async function posterSource(db: CatalogDatabase, id: string): Promise<AssetStored | AssetFileProblem> {
  const stored = await posterBlob(db, id);
  if (stored !== null) return resolveBlob(stored, id);
  const [row] = await assetsByIds(db, [id]);
  if (row === undefined) return missing("not-in-catalog", `No asset ${JSON.stringify(id)} in the catalog.`);
  if (row.kind !== "video") {
    return {
      ok: false,
      status: 404,
      code: "not-a-video",
      error: "No such asset poster.",
      detail: `Asset ${id} is a ${row.kind}, and only a video has a poster.`,
    };
  }
  return {
    ok: false,
    status: 404,
    code: "not-uploaded",
    error: "No such asset poster.",
    detail:
      `No poster is stored for ${id}. \`npm run catalog -- asset upload --source manimkc\` cuts one ` +
      `for each video it uploads.`,
  };
}

/** The object, or a range of it, from the store. Rejects as `BlobStore.get` does. */
export async function openBlob(key: string, range?: { start: number; end: number }): Promise<BlobRead> {
  return assetBlobStore().get(key, range);
}

/** A range the store refused as past the end: the route's 416. */
export function isRangeRefusal(error: unknown): boolean {
  return error instanceof BlobRangeError;
}

/** What a `Range` header asked for, once measured against the real file size. */
export type RangeRequest =
  | { kind: "whole" }
  | { kind: "partial"; start: number; end: number }
  | { kind: "unsatisfiable" };

const BYTES_RANGE = /^bytes=(\d*)-(\d*)$/i;

/**
 * Parse one `Range` header.
 *
 * Three answers, and the difference between the last two is what makes video
 * seeking work. A range this file can satisfy becomes a 206 with the slice; a
 * range past the end of the file is a 416, because a player that asked for
 * byte 20,000,000 of a 10 MB video has to be told the file is shorter rather
 * than handed the whole thing again; anything else is ignored and the whole
 * file is sent, which RFC 9110 explicitly permits and which is the right
 * answer for a header that is malformed or asks for a unit we do not speak.
 *
 * Multiple ranges (`bytes=0-9,20-29`) fall into that last group. A multipart
 * response is real work and no browser needs one to scrub a video.
 *
 * `end` is inclusive throughout, as in the header and as in
 * `BlobStore.get`'s range, so the two never need converting between.
 */
export function parseRange(header: string | null, size: number): RangeRequest {
  if (header === null || header.trim() === "") return { kind: "whole" };
  const match = BYTES_RANGE.exec(header.trim());
  if (match === null) return { kind: "whole" };

  const [, rawStart = "", rawEnd = ""] = match;
  if (rawStart === "" && rawEnd === "") return { kind: "whole" };

  // An empty file can satisfy nothing, and `bytes=0-` against it would
  // otherwise compute the range 0..-1.
  if (size === 0) return { kind: "unsatisfiable" };

  if (rawStart === "") {
    // Suffix form: the last N bytes. `bytes=-0` asks for nothing, which is
    // unsatisfiable rather than an empty 206.
    const wanted = Number(rawEnd);
    if (wanted === 0) return { kind: "unsatisfiable" };
    return { kind: "partial", start: Math.max(0, size - wanted), end: size - 1 };
  }

  const start = Number(rawStart);
  const end = rawEnd === "" ? size - 1 : Math.min(Number(rawEnd), size - 1);
  if (!Number.isSafeInteger(start) || start > end || start >= size) {
    return { kind: "unsatisfiable" };
  }
  return { kind: "partial", start, end };
}

/**
 * How much may sit in the web stream's queue while a client is slow to read.
 *
 * The size function is the point. A queuing strategy that does not supply one
 * scores every chunk as 1, so a high-water mark of 65,536 means 65,536
 * *chunks*, which for a file stream reading 64 KiB at a time is four gigabytes
 * of a ten megabyte video in memory: the whole file, for one stalled client,
 * which is the exact thing streaming it was meant to avoid.
 *
 * Measured on Node 22.23 against an 8 MB file with a reader that stops after
 * one chunk: 196,608 bytes read with a byte-counting strategy, and all
 * 8,388,608 with a counting one. Node's own default for a non-object-mode
 * readable is already `ByteLengthQueuingStrategy`
 * (`newReadableStreamFromStreamReadable` in `internal/webstreams/adapters`),
 * so this is not a live leak being plugged. It is written out because the
 * guarantee matters more than the default does: it survives a Node that
 * changes its mind, and the test measures it rather than trusting either.
 */
export const BYTE_QUEUE = {
  highWaterMark: 64 * 1024,
  size: (chunk: Uint8Array) => chunk.byteLength,
};

/**
 * A Node readable as a web stream, queued by bytes.
 *
 * Exported so a test can hand in a stream it holds a reference to, stall the
 * reader, and read `bytesRead` off it. That is the only way to observe the
 * queue from outside.
 *
 * A client that seeks away cancels the web stream, which destroys the file
 * handle behind it; that is `Readable.toWeb`'s own behaviour and is why this
 * is not a hand-rolled `ReadableStream`.
 */
export function webStreamFrom(stream: Readable): ReadableStream<Uint8Array> {
  return Readable.toWeb(stream, { strategy: BYTE_QUEUE }) as unknown as ReadableStream<Uint8Array>;
}
