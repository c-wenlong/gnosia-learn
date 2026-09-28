import "server-only";

import { createReadStream } from "node:fs";
import { realpath, stat } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";

import { BlobError, BlobNotFoundError, BlobRangeError, type BlobRead } from "@self-learn/blob";
import {
  assetBlobs,
  assetsByIds,
  conceptsForAsset,
  documentBytes,
  indexedRoot,
  type AssetBlob,
  type AssetRef,
  type CatalogDatabase,
} from "@self-learn/catalog/state";
import type { ContentType } from "@self-learn/content";

import { REPO_ROOT } from "@/data/repo-root";
import { contentSource } from "@/data/source";
import type { RouteProblemCode } from "@/lib/asset-problems";
import { assetBlobStore } from "@/lib/blob-store";

/**
 * Turning an `asset` row into bytes a browser can play.
 *
 * The catalog knows about 30 videos, their transcript sidecars and a pair of
 * diagrams, and until now nothing could show one of them. The videos live
 * under manimkc's data root, which on this machine is outside the repository
 * altogether; the diagrams live in `learn/assets/` and are still not under
 * `apps/web/public/`. Next serves neither, so a route has to read the file
 * itself, and a route that reads files from an identifier in a URL is a
 * directory traversal hole unless it is built not to be.
 *
 * **The identifier never becomes a path.** Nothing from the URL is joined onto
 * anything. The id is a primary key: it is looked up, and what comes back is a
 * `path` an indexer wrote from a filesystem it walked. An id of
 * `manimkc:out/../../../../etc/passwd` finds no row and stops there, which is
 * the whole point of resolving through the database rather than through
 * `path.join`.
 *
 * **A stored path is still checked.** An indexer reads a real tree and could
 * in principle be handed a symlink or a `..`, and the row outlives the run that
 * wrote it. So the resolved absolute path is compared against the root it is
 * supposed to be under, twice: once as written, and once after `realpath`, so
 * a symlink inside the tree cannot point out of it. The comparison is
 * `path.relative`, not a prefix test: `/data/learn-assets-evil` starts with
 * `/data/learn-assets` as a string and is not inside it as a directory.
 *
 * **Two roots, and which one is which comes from the database.**
 * `self-learn` assets (`learn/assets/*.svg`, the notes, the session logs) are
 * repo-relative, and `@/data/repo-root` already knows where that is and why it
 * cannot be `process.cwd()`. `manimkc` assets are relative to manimkc's data
 * root, recorded by the indexer on `index_run.metadata.outRoot` at index time.
 * Reading `$MANIMKC_HOME` here is forbidden by AGENTS.md and would be wrong
 * besides: the data root belongs to the checkout that was indexed, not to
 * whatever environment this server happens to boot with.
 *
 * **An old index is not a missing file.** A manimkc run indexed before that
 * value was persisted has no `outRoot`, and the honest answer is "your index
 * predates this feature, re-run it" rather than a 404 that reads as "the video
 * is gone". They are different problems with different fixes and the route
 * says which one it hit.
 */

/**
 * The gate. Production has none of these files: the deployed bundle carries
 * `content/**\/*.yaml` and nothing else (`outputFileTracingIncludes` in
 * `next.config.ts`), and manimkc's data root is a directory on a laptop. So
 * the route is off unless a machine says otherwise, the same shape as the
 * studio's `STUDIO_ENABLED` gate (decision D11 in docs/TLDRAWKC-INTEGRATION.md).
 *
 * A separate variable rather than that one because they gate different things:
 * the studio is an agent runner with a UI, this is a read-only file server, and
 * a machine that wants one need not want the other.
 *
 * Deliberately *not* `NODE_ENV !== "production"`. `npm run dev` fails in the
 * desktop preview harness, so the documented way to look at this app locally is
 * `npm run build` then `next start`, which sets `NODE_ENV=production` on the
 * one machine that has the files. A gate keyed on that would be off exactly
 * where it needs to be on.
 */
export const ASSET_FILES_ENV = "ASSET_FILES_ENABLED";

/** Values that mean "set, but no". Anything else non-empty enables the route. */
const DISABLED_VALUES = new Set(["", "0", "false", "off", "no"]);

/**
 * Read per request rather than at module load, so a test can flip it without
 * re-importing the route and a developer can flip it without a restart. It is
 * a string comparison; nothing is saved by caching it.
 */
export function assetFilesEnabled(
  // A plain lookup rather than `NodeJS.ProcessEnv`: Next's types make
  // `NODE_ENV` required on that, so a test could not pass one variable on its
  // own without also asserting something this function never reads.
  env: Record<string, string | undefined> = process.env,
): boolean {
  return !DISABLED_VALUES.has((env[ASSET_FILES_ENV] ?? "").trim().toLowerCase());
}

/**
 * Extension to content type, and the list is closed.
 *
 * Every kind here is one the indexers actually produce: `mp4` videos with
 * `vtt` captions and `json` transcripts and chapters from manimkc, `svg`
 * diagrams from tldrawkc, `md` notes and session logs, `png` for a raster the
 * knowledge base may carry. An extension that is not here is refused rather
 * than sent as `application/octet-stream`, because an unrecognised extension
 * means an asset kind nobody has thought about, and guessing is how an `.html`
 * ends up executing in this origin.
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

/** The declared type for a file, or null when the extension is not on the list. */
export function contentTypeFor(file: string): string | null {
  return CONTENT_TYPES[path.extname(file).toLowerCase()] ?? null;
}

/** A resolution that failed, with the status the route should answer. */
export interface AssetFileProblem {
  ok: false;
  /** 404 for "no such file", 503 for "this server cannot answer yet". */
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

/** A resolution that found a real, readable, recognised file. */
export interface AssetFile {
  ok: true;
  source: "file";
  /** Absolute path, symlinks resolved, proven to be inside its root. */
  file: string;
  /** Size from `stat`, not from the row: the row's `bytes` can be stale. */
  bytes: number;
  contentType: string;
  /** Basename, reduced to characters that cannot break a header. */
  filename: string;
}

export type AssetFileResult = AssetFile | AssetFileProblem;

const missing = (code: RouteProblemCode, detail: string): AssetFileProblem => ({
  ok: false,
  status: 404,
  code,
  error: "No such asset file.",
  detail,
});

const unavailable = (code: RouteProblemCode, detail: string): AssetFileProblem => ({
  ok: false,
  status: 503,
  code,
  error: "The catalog cannot locate this file yet.",
  detail,
});

/**
 * Is `candidate` inside `root`?
 *
 * `path.relative` rather than `startsWith`: the string test says yes to
 * `/data/out-old` for a root of `/data/out`, and to nothing useful on a
 * trailing slash. A relative path that is empty means the candidate *is* the
 * root (a directory, never a file we serve), one starting `..` means it climbs
 * out, and an absolute one means the two are on different roots entirely,
 * which on Windows is a different drive and here means `path.relative` gave up.
 */
export function contains(root: string, candidate: string): boolean {
  const rel = path.relative(root, candidate);
  return rel !== "" && !rel.startsWith("..") && !path.isAbsolute(rel);
}

/**
 * A filename safe to put in a header. Only the basename, and only characters
 * that cannot terminate a quoted string or inject a header line, which rules
 * out CR and LF by construction rather than by checking for them.
 */
export function safeFilename(file: string): string {
  const ascii = path.basename(file).replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 120);
  return ascii === "" || ascii === "." || ascii === ".." ? "asset" : ascii;
}

/** Where this source repo's `asset.path` strings are relative to on this machine. */
async function rootFor(
  db: CatalogDatabase,
  row: AssetRef,
): Promise<{ ok: true; root: string } | AssetFileProblem> {
  if (row.sourceRepo === "self-learn") return { ok: true, root: REPO_ROOT };
  if (row.sourceRepo === "manimkc") {
    const run = await indexedRoot(db, "manimkc");
    if (run === null) {
      return unavailable(
        "manimkc-unindexed",
        `The manimkc source has never been indexed on this machine, so nothing ` +
          `records where its rendered files are. Run \`npm run catalog -- index --only manimkc\`.`,
      );
    }
    if (run.dataRoot === null) {
      return unavailable(
        "manimkc-stale",
        `The manimkc index on this machine predates the run recording its data ` +
          `root, so \`${row.path}\` has no base to resolve against. Re-run ` +
          `\`npm run catalog -- index --only manimkc\`.`,
      );
    }
    return { ok: true, root: run.dataRoot };
  }
  // `tldrawkc` is a valid `source_repo` that no indexer writes today: the
  // diagrams it draws land in `learn/assets/` and are filed as `self-learn`.
  // A row that did claim it would have no root here, and inventing one is how
  // a route starts serving from a directory nobody decided on.
  return missing(
    "refused",
    `Asset ${row.id} says its bytes live in ${row.sourceRepo}, which this route ` +
      `has no root for.`,
  );
}

/**
 * An asset id to a file on disk, or the reason there is none.
 *
 * The order is the security argument: look the id up, take the stored path,
 * pick the root from the row's own source, contain, resolve symlinks, contain
 * again, then stat. Nothing before the last step touches the filesystem with
 * anything the caller chose.
 */
export async function resolveAssetFile(
  db: CatalogDatabase,
  id: string,
): Promise<AssetFileResult> {
  const [row] = await assetsByIds(db, [id]);
  if (row === undefined) return missing("not-in-catalog", `No asset ${JSON.stringify(id)} in the catalog.`);
  return resolveRowFile(db, row);
}

/** `resolveAssetFile` for a row already in hand. */
async function resolveRowFile(db: CatalogDatabase, row: AssetRef): Promise<AssetFileResult> {
  if (row.path === null) {
    // A `link` asset is a URL and nothing else. It is a row about something on
    // the web, so there is no file to serve and never will be.
    return missing("no-file", `Asset ${row.id} is a ${row.kind} with no file; it has a url.`);
  }

  const resolved = await rootFor(db, row);
  if (resolved.ok === false) return resolved;
  const { root } = resolved;

  if (path.isAbsolute(row.path)) {
    console.warn(`asset file: refusing ${row.id}, stored path is absolute`);
    return missing("refused", `Asset ${row.id} has an absolute stored path.`);
  }

  const candidate = path.resolve(root, row.path);
  if (!contains(root, candidate)) {
    console.warn(`asset file: refusing ${row.id}, stored path escapes ${root}`);
    return missing("refused", `Asset ${row.id} resolves outside its source root.`);
  }

  let file: string;
  let realRoot: string;
  try {
    // Both sides, because comparing a resolved file against an unresolved root
    // is how a symlinked root reads as an escape. ENOENT lands here too, which
    // is the ordinary "the file is gone" case and the same 404.
    //
    // `turbopackIgnore` because Turbopack reads a `realpath` on a computed
    // path as "this route could open anything" and responds by tracing the
    // whole repository into the deployed bundle, `public/` included. It is
    // right that the path is computed and wrong about the consequence: these
    // files are not in the deployment at all, which is what the gate above is
    // for. Without the comment `npm run build` warns twice and the output
    // grows for a route that answers 404 in production.
    [file, realRoot] = await Promise.all([
      realpath(/* turbopackIgnore: true */ candidate),
      realpath(/* turbopackIgnore: true */ root),
    ]);
  } catch {
    return missing("file-missing", `Asset ${row.id} is indexed at ${row.path}, which is not on disk.`);
  }
  if (!contains(realRoot, file)) {
    // A symlink inside the tree pointing out of it. The row looked fine; the
    // filesystem disagreed.
    console.warn(`asset file: refusing ${row.id}, ${candidate} links outside ${realRoot}`);
    return missing("refused", `Asset ${row.id} resolves outside its source root.`);
  }

  const contentType = contentTypeFor(file);
  if (contentType === null) {
    console.warn(`asset file: refusing ${row.id}, unrecognised extension`);
    return missing("unsupported-type", `Asset ${row.id} has an extension this route will not serve.`);
  }

  const stats = await stat(file);
  if (!stats.isFile()) return missing("refused", `Asset ${row.id} is not a regular file.`);

  return { ok: true, source: "file", file, bytes: stats.size, contentType, filename: safeFilename(file) };
}

/* -------------------------------------------------------------------------- */
/* The blob store                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Bytes the blob store holds for an asset (docs/CONTENT-MIGRATION.md, Track E).
 *
 * **Why the store is asked first.** An asset whose row names a `blob_key` was
 * uploaded on purpose, by `catalog asset upload` or a diagram's Accept, and the
 * key is the sha256 of the bytes its `content_hash` records, so the store
 * cannot hand back anything but what was indexed. The legacy file under a data
 * root is only what the render left on this laptop, and it goes away at
 * cut-over. So a row with a key is served from the store or not at all: a
 * `pending` blob, or an object the store no longer has, answers `not-uploaded`
 * rather than quietly falling back to a file that may have been re-rendered
 * since (edge cases 5 and 9).
 *
 * **Nothing about the path here.** The key comes from the row, the store
 * refuses any key not shaped `<owner>/<sha256>.<ext>`, and the content type
 * comes off the key's extension through the same closed list the legacy branch
 * uses, so an unknown extension is refused the same way.
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
export type AssetSource = AssetFile | AssetStored | AssetRowText;
export type AssetSourceResult = AssetSource | AssetFileProblem;

/**
 * The switch's answer, as a problem. `ASSET_FILES_ENABLED` gates the legacy
 * file branch only: a blob is served whatever it says, because the store is
 * what a deployment without the files will have.
 */
export const FILES_OFF: AssetFileProblem = {
  ok: false,
  status: 404,
  code: "files-off",
  error: "Not found.",
  detail: "Asset files are not served by this deployment.",
};

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
 * The asset kinds whose bytes become a row when the database owns their type
 * (Tracks C and D of docs/CONTENT-MIGRATION.md). After that type's flip the
 * file under `learn/` is the export as of the flip at best: a note committed
 * since is not in it, a log started since has no file at all, and phase 2
 * deletes the tree. So the row is served, not the file.
 */
const ROW_KINDS: Readonly<Record<string, ContentType>> = {
  note: "concepts",
  session: "sessions",
  diagram_source: "diagrams",
};

/**
 * What a row's text is served as. A second, smaller list than `CONTENT_TYPES`
 * on purpose: a `.tldr` is served only as the canonical document the database
 * holds, never read off disk, so the legacy branch keeps refusing it.
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
 * The asset's bytes from its row, or `undefined` when its type is still read
 * from files (or it is not such a kind), and the caller goes on to the file.
 *
 * Not gated by `ASSET_FILES_ENABLED`, for the reason a blob is not: the switch
 * says whether this server reads files off a laptop's disk, and a row is not a
 * file. Every name here comes from the row the id found, never from the URL.
 */
export async function resolveRowText(
  db: CatalogDatabase,
  row: AssetRef,
): Promise<AssetRowText | AssetFileProblem | undefined> {
  const type = rowTypeFor(row.kind);
  if (type === null) return undefined;
  const seam = contentSource();
  if ((await seam.resolution())[type].kind !== "db") return undefined;

  const name = path.basename(row.path ?? row.id);
  let body: Buffer | null = null;
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
  if (body === null) {
    return missing(
      "not-in-catalog",
      `The database owns ${type} and holds no text for asset ${row.id}; it was archived, or never written.`,
    );
  }
  const contentType = ROW_CONTENT_TYPES[type];
  if (contentType === undefined) {
    return missing("unsupported-type", `Asset ${row.id} is a ${row.kind}, which this route will not serve.`);
  }
  return { ok: true, source: "row", body, bytes: body.length, contentType, filename: safeFilename(name) };
}

/**
 * An asset id to where its bytes are served from, or the reason there is
 * nowhere: the blob store when the row names a key, then the row itself when
 * the database owns the asset's type, else the legacy file, which the switch
 * gates. Every route and every page check goes through this, so the page and
 * the route cannot give one asset two answers.
 */
export async function resolveAsset(
  db: CatalogDatabase,
  id: string,
  env: Record<string, string | undefined> = process.env,
): Promise<AssetSourceResult> {
  const [row] = await assetsByIds(db, [id]);
  if (row === undefined) return missing("not-in-catalog", `No asset ${JSON.stringify(id)} in the catalog.`);
  const blob = (await assetBlobs(db, [row.id])).get(row.id);
  if (blob !== undefined) return resolveBlob(blob, row.path ?? row.id);
  const text = await resolveRowText(db, row);
  if (text !== undefined) return text;
  if (!assetFilesEnabled(env)) return FILES_OFF;
  return resolveRowFile(db, row);
}

/**
 * Which of these assets are served without reading a file off this server's
 * disk: a blob the catalog records as `present`, or a row the database owns.
 * For the pages' thumbnails and their files-off notice, which decide per row
 * whether to draw a picture before the browser asks. One query and one
 * ownership read for the whole page, where `resolveAsset` per card would stat
 * the store and read every text; a card whose picture then fails asks the
 * status route why, as it already does for a legacy file that went missing.
 */
export async function servedWithoutFiles(
  db: CatalogDatabase,
  rows: readonly Pick<AssetRef, "id" | "kind">[],
): Promise<Set<string>> {
  const out = new Set<string>();
  if (rows.length === 0) return out;
  const blobs = await assetBlobs(db, rows.map((row) => row.id));
  for (const [id, blob] of blobs) if (blob.state === "present") out.add(id);
  const needsRow = rows.filter((row) => !out.has(row.id) && rowTypeFor(row.kind) !== null);
  if (needsRow.length > 0) {
    const owned = await contentSource().resolution();
    for (const row of needsRow) {
      const type = rowTypeFor(row.kind);
      if (type !== null && owned[type].kind === "db") out.add(row.id);
    }
  }
  return out;
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
 * `createReadStream`'s options, so the two never need converting between.
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
 * Separate from `openRange` so a test can hand in a stream it holds a
 * reference to, stall the reader, and read `bytesRead` off it. That is the
 * only way to observe the queue from outside.
 *
 * A client that seeks away cancels the web stream, which destroys the file
 * handle behind it; that is `Readable.toWeb`'s own behaviour and is why this
 * is not a hand-rolled `ReadableStream`.
 */
export function webStreamFrom(stream: Readable): ReadableStream<Uint8Array> {
  return Readable.toWeb(stream, { strategy: BYTE_QUEUE }) as unknown as ReadableStream<Uint8Array>;
}

/**
 * The bytes, as a stream.
 *
 * Streamed rather than read into a buffer because a 10 MB video read whole
 * would sit in the server's heap for every concurrent request, and because a
 * range request exists precisely so that the rest of the file is never read.
 * `start` and `end` are passed to the read stream, so the kernel seeks and
 * only the asked-for slice is touched.
 */
export function openRange(file: string, start?: number, end?: number): ReadableStream<Uint8Array> {
  return webStreamFrom(createReadStream(file, start === undefined ? {} : { start, end }));
}
