import { createHash } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { key as blobKey, type BlobStore } from "@self-learn/blob";
import { asset, assetDerivation, blobObject, LOCAL_LEARNER_ID, readableOwners, type Asset } from "@self-learn/schema";
import { and, eq, inArray, sql } from "drizzle-orm";

import type { CatalogDatabase } from "../db";
import { fileFacts } from "../index/files";
import {
  readToolReport,
  VIDEO_TOOL_MIME,
  VIDEO_TOOL_NAMES,
  videoTool,
  type TopicsReport,
  type VideoToolName,
} from "../index/video-tool";
import { buildVideoPdf, pdfInputs, segmentsFromText } from "../pdf/build";
import { pdfInputsOf } from "../pdf/document";
import { PDF_CONTENT_TYPE, PDF_EXTENSION, type PdfSegment } from "../pdf/recipe";
import { extractPoster } from "../poster/extract";
import { POSTER_CONTENT_TYPE, POSTER_EXTENSION } from "../poster/recipe";
import {
  OWNER_BYTES_CAP_ENV,
  OWNER_UPLOADS_PER_DAY_ENV,
  OwnerCapError,
  ownerCapsOrError,
  ownerUsage,
  uploadBlob,
} from "./blob";
import { latestRevisions } from "./revisions";
import { ContentWriteError, writeContents, type WriteContentInput } from "./write";
import { CLI_OWNER } from "./scope";

/**
 * `catalog asset upload --source manimkc|remotionkc|revideokc|blenderkc`: a video
 * tool's rendered videos and their sidecars into the blob store, a poster made for each video on the way, and
 * every `asset` row pointed at its blob (docs/CONTENT-MIGRATION.md, Track E;
 * D5, D7, D8, D11; edge cases 5 and 9).
 *
 * **Which files.** The same report the tool's indexer reads,
 * `<tool> topics --json`, with its `outRoot`: nothing here re-derives the
 * tool's layout. manimkc is described below; remotionkc's, revideokc's and
 * blenderkc's reports have the same shape and their rows the `remotionkc:`,
 * `revideokc:` and `blenderkc:` namespaces, and everything holds for them
 * with that name in place of manimkc's. A deliverable is only uploaded onto an asset row the
 * indexer already wrote (`manimkc:<out/...>`), because the
 * row is what the page asks for and a blob no row points at is an orphan on
 * arrival.
 *
 * **The bytes must be the indexed bytes.** A file whose sha256 is not its
 * row's `content_hash` has been re-rendered since the last index, and hooking
 * its new bytes to the old row would break the one parity rule this track has:
 * each asset's `content_hash` equals its blob's sha256. It is refused by name,
 * with the command that fixes it.
 *
 * **Resumable by construction** (edge case 5). Keys are content addressed, so
 * a rerun skips an asset whose row already names a `present` blob the store
 * still has, without reading the file again; a `pending` row an interrupted
 * run left is uploaded again, and the bytes are necessarily the same. The
 * `blob_object` protocol (pending row, put, head, present) is `uploadBlob`'s.
 *
 * **One transaction per video.** Its blobs are uploaded and confirmed first,
 * then the video's `blob_key`, its sidecars' and its poster row are written
 * together through `writeContents`, each with its own revision. An upload that
 * dies before that leaves `pending` or unreferenced `present` rows and no
 * asset change, so the page keeps serving the legacy file.
 *
 * **Posters** (the plan's "Posters" row). A still per video, cut with the
 * shared recipe (`../poster/recipe.ts`) on this machine (D8), stored as a blob
 * and recorded as an asset of kind `poster` with id `poster:<video id>`,
 * derived from the video through `asset_derivation`. The id sits outside the
 * `manimkc:` namespace on purpose: the manimkc indexer prunes every
 * `manimkc:` row it did not produce, and it never produces a poster. A poster
 * is made again only when it is missing or its video's blob changed, since a
 * re-cut of the same video would at best reproduce the same bytes.
 *
 * **Each row is written as its own owner** (phase 4, D23). A blob's key is
 * prefixed by its row's owner (D5), so the bytes of a row the commons holds
 * land under `commons/`, and the row write that points at them is the
 * commons' too; writing it as the CLI's owner would be the seam's
 * `foreign-owner` refusal, after the bytes were already stored. A row neither
 * the CLI's owner nor the commons holds is another tenant's, and is refused
 * by name before anything is read or stored.
 */

/** The namespace a poster asset id lives in: `poster:` + its video's id. */
export const POSTER_PREFIX = "poster:";

export function posterId(videoId: string): string {
  return `${POSTER_PREFIX}${videoId}`;
}

/** The namespace a video's PDF asset id lives in: `pdf:` + its video's id. */
export const PDF_PREFIX = "pdf:";

export function pdfId(videoId: string): string {
  return `${PDF_PREFIX}${videoId}`;
}

/** Media types for what this command uploads, by extension: the video tools' own, and the poster. */
const MIME: Readonly<Record<string, string>> = { ...VIDEO_TOOL_MIME, jpg: POSTER_CONTENT_TYPE };

/** The video tools whose renders this command stores: each one an index source of the same name. */
export type UploadSource = VideoToolName;
export const UPLOAD_SOURCES: readonly UploadSource[] = VIDEO_TOOL_NAMES;

export interface AssetUploadOptions {
  store: BlobStore;
  /** Which tool's renders. Defaults to manimkc. */
  source?: UploadSource;
  /** Where the pinned tool CLIs resolve from (the repository). */
  repoRoot: string;
  /**
   * The checkout the source's CLI reads, as `catalog import` takes it:
   * `manimkcRoot` for manimkc, `remotionkcRoot` for remotionkc,
   * `revideokcRoot` for revideokc, `blenderkcRoot` for blenderkc. Absent,
   * the tool's variable, else its submodule under `repoRoot`.
   */
  manimkcRoot?: string;
  remotionkcRoot?: string;
  revideokcRoot?: string;
  blenderkcRoot?: string;
  dryRun?: boolean;
  /** Absolute path to ffmpeg, or null when there is none: posters are then skipped and said so. */
  ffmpeg: string | null;
  author?: string;
  /** The kind of author the row writes carry. Defaults to `person`; `catalog import` passes `import`. */
  authorKind?: "person" | "import";
  reason?: string;
  /** A captured report, for tests; otherwise the CLI is run. */
  report?: TopicsReport;
  /**
   * Whose upload this is: rows this owner or the commons holds are uploaded,
   * each written as its own owner; any other owner's are refused. Defaults to
   * the CLIs' owner.
   */
  owner?: string;
}

/**
 * What happened to one file. `present`: its row already names a blob the store
 * has. `uploaded`: stored now. `linked`: the blob was already stored and only
 * the row changed. `would-upload`, `would-link`, `would-make`: the dry run's
 * answers. `detached`: a poster cut from the video's old bytes, unhooked from
 * it because no new one could be made (see `settlePoster`). `refused`: see
 * `detail`.
 */
export type UploadAction =
  | "present"
  | "uploaded"
  | "linked"
  | "made"
  | "would-upload"
  | "would-link"
  | "would-make"
  | "detached"
  | "refused";

export interface UploadItem {
  id: string;
  kind: string;
  action: UploadAction;
  key: string | null;
  bytes: number | null;
  detail?: string;
}

export interface AssetUploadResult {
  source: UploadSource;
  outRoot: string;
  dryRun: boolean;
  /** Files the report lists, and posters and PDFs present or made (planned, on a dry run) by the end. */
  counts: { videos: number; sidecars: number; posters: number; pdfs: number };
  /** Files whose bytes went into the store this run, and how many bytes. */
  uploaded: number;
  uploadedBytes: number;
  /** Asset rows written this run (a revision each). */
  rowsWritten: number;
  refused: number;
  /** Why posters were not made at all this run, when that is the case. */
  postersSkipped: string | null;
  /** Why PDFs were not made at all this run, when that is the case. */
  pdfsSkipped: string | null;
  /**
   * On a dry run under a bytes cap that plans posters: why its bytes-cap
   * answers are an estimate. A poster's size is known only once ffmpeg cuts
   * it, so the planned posters are not counted against the cap, and a file
   * the dry run passed may still be refused by the real run. Null otherwise.
   */
  bytesCapEstimate: string | null;
  items: UploadItem[];
}

interface Planned {
  row: Asset;
  file: string;
  ext: string;
}

interface Group {
  video: Planned | null;
  videoId: string;
  sidecars: Planned[];
}

function str(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

function extOf(file: string): string {
  return path.extname(file).slice(1).toLowerCase();
}

/** The deliverables and sidecars the report says exist, grouped by video. */
function deliverables(report: TopicsReport): { videoPath: string; sidecars: string[] }[] {
  const out: { videoPath: string; sidecars: string[] }[] = [];
  for (const entry of report.topics) {
    for (const raw of Array.isArray(entry.sections) ? entry.sections : []) {
      const deliverable = (raw as { deliverable?: { path?: unknown; exists?: unknown; sidecars?: Record<string, { path?: unknown; exists?: unknown }> } | null }).deliverable;
      if (!deliverable || deliverable.exists !== true) continue;
      const videoPath = str(deliverable.path);
      if (videoPath === null) continue;
      const sidecars: string[] = [];
      for (const sidecar of Object.values(deliverable.sidecars ?? {})) {
        if (sidecar?.exists !== true) continue;
        const sidecarPath = str(sidecar.path);
        if (sidecarPath !== null) sidecars.push(sidecarPath);
      }
      out.push({ videoPath, sidecars });
    }
  }
  return out;
}

/** The row without the two columns that are facts about the write, for `writeContent`. */
function contentRow(row: Asset): Record<string, unknown> {
  const rest: Record<string, unknown> = { ...row };
  delete rest.createdAt;
  delete rest.updatedAt;
  return rest;
}

/**
 * Unhook the derived asset (`prefix` + video id: a poster, a PDF) of each of
 * `videoIds` that was cut from other bytes than the video's now, the way the
 * upload unhooks one when it links new bytes and cannot cut a fresh one (see
 * `detach` below). Under the blob contract (0013) the import, not the upload,
 * is what links a re-render, so the upload would otherwise find the video's
 * blob present and the derived asset still hooked to it, keeping a picture
 * or a document of the old render. Unhooked, it is not derived from the
 * video, and the next `catalog asset upload` makes a new one and hooks it
 * back up.
 *
 * "Cut from other bytes" is read from the revisions, not from what this run
 * changed: the video's `blob_key` as of the derived asset's revision that
 * last cut or hooked it (a revision that derives it from the video where the
 * one before did not, or that changed its own bytes), against its key now.
 * Any other revision of it, a title edit say, is not a cut. So an import
 * that linked the new bytes and then failed before this ran is caught by the
 * next one, whose own write changes nothing.
 *
 * Which derived assets are stale, their rows, and the revision each was read
 * at come from one snapshot, and each unhook is based on that revision. A
 * `catalog asset upload` that remade and relinked one after the snapshot
 * therefore fails the write's base check, and it is left as the upload made
 * it and reported as `moved`, rather than having its fresh link cleared or
 * failing the import. Detecting outside the snapshot, as this once did, let
 * a relink landing between the two reads become the base, and the unhook
 * then undid it.
 */
export async function unhookDerivations(
  db: CatalogDatabase,
  videoIds: readonly string[],
  prefix: string,
  options: { author: string; reason: string; owner?: string },
): Promise<{ unhooked: string[]; moved: string[] }> {
  const readable = readableOwners(options.owner ?? CLI_OWNER);
  if (videoIds.length === 0) return { unhooked: [], moved: [] };
  const ids = sql.join(
    videoIds.map((id) => sql`${id}`),
    sql`, `,
  );
  const { posters, bases } = await db.transaction(
    async (tx) => {
      const { rows: derived } = await tx.execute<{ poster: string }>(sql`
        select d.asset_id as poster
        from asset_derivation d
        join asset v on v.id = d.source_asset_id
        cross join lateral (
          select max(p.id) as id
          from (
            select r.id, r.snapshot, lag(r.snapshot) over (order by r.id) as prev
            from content_revision r
            where r.entity_type = 'asset' and r.entity_id = d.asset_id
          ) p
          where p.snapshot -> 'links' -> 'asset_derivation' @> jsonb_build_array(jsonb_build_object('source_asset_id', v.id))
            and (
              p.prev is null
              or not coalesce(
                p.prev -> 'links' -> 'asset_derivation' @> jsonb_build_array(jsonb_build_object('source_asset_id', v.id)),
                false
              )
              or p.prev -> 'entity' ->> 'blob_key' is distinct from p.snapshot -> 'entity' ->> 'blob_key'
            )
        ) cut
        where d.source_asset_id in (${ids})
          and d.asset_id = ${prefix} || d.source_asset_id
          and (
            select r.snapshot -> 'entity' ->> 'blob_key'
            from content_revision r
            where r.entity_type = 'asset' and r.entity_id = v.id and r.id < cut.id
            order by r.id desc
            limit 1
          ) is distinct from v.blob_key
        order by d.asset_id collate "C"
      `);
      if (derived.length === 0) return { posters: [], bases: new Map<string, number | null>() };
      const stale = derived.map((d) => d.poster);
      const latest = await latestRevisions(tx, "asset", stale);
      return {
        posters: await tx.select().from(asset).where(inArray(asset.id, stale)),
        bases: new Map(stale.map((id) => [id, latest.get(id)?.id ?? null] as const)),
      };
    },
    { isolationLevel: "repeatable read", accessMode: "read only" },
  );
  const unhooked: string[] = [];
  const moved: string[] = [];
  // One write per poster, since a composite write refused on one stale base
  // would roll back the others with it.
  for (const row of [...posters].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))) {
    // Another tenant's poster of this owner's video is theirs to settle.
    if (!readable.includes(row.ownerId)) continue;
    try {
      await writeContents(db, [
        {
          owner: row.ownerId,
          type: "asset" as const,
          id: row.id,
          next: { row: contentRow(row), links: { asset_derivation: [] } },
          base: bases.get(row.id) ?? null,
          author: options.author,
          authorKind: "import" as const,
          reason: options.reason,
        },
      ]);
      unhooked.push(row.id);
    } catch (error) {
      if (!(error instanceof ContentWriteError) || error.code !== "stale-base") throw error;
      moved.push(row.id);
    }
  }
  return { unhooked, moved };
}

export async function uploadAssets(db: CatalogDatabase, options: AssetUploadOptions): Promise<AssetUploadResult> {
  const dryRun = options.dryRun ?? false;
  const source: UploadSource = options.source ?? "manimkc";
  const tool = videoTool(source);
  const named: Record<UploadSource, string | undefined> = {
    manimkc: options.manimkcRoot,
    remotionkc: options.remotionkcRoot,
    revideokc: options.revideokcRoot,
    blenderkc: options.blenderkcRoot,
  };
  const checkout = named[source] ?? tool.resolveRoot(options.repoRoot);
  const report = options.report ?? (await readToolReport(tool, options.repoRoot, checkout));
  const outRoot = str(report.outRoot) ?? checkout;
  /** What a refusal says to run when a row is missing or stale. */
  const reindex = `npm run catalog -- import --only ${source}`;
  const { store } = options;
  const author = options.author ?? LOCAL_LEARNER_ID;
  const authorKind = options.authorKind ?? "person";
  const readable = readableOwners(options.owner ?? CLI_OWNER);
  /** Why a row is not this upload's to write, or null when it is. */
  const foreign = (row: Asset): string | null =>
    readable.includes(row.ownerId)
      ? null
      : `${row.id} belongs to ${row.ownerId}, and this upload writes only ${readable.join(" and ")}'s rows; nothing was stored`;
  const reason = options.reason ?? `catalog asset upload --source ${source}: bytes into the blob store`;

  const found = deliverables(report);
  const ids = found.flatMap((d) => [d.videoPath, ...d.sidecars]).map((p) => `${tool.prefix}${p}`);
  const derivedIds = found.flatMap((d) => [posterId(`${tool.prefix}${d.videoPath}`), pdfId(`${tool.prefix}${d.videoPath}`)]);
  // The rows and the revision each was read at, in one snapshot. Every write
  // below copies the row it read and changes its blob key, so it is based on
  // that revision: a `catalog import` that rewrote the row in the minutes an
  // upload takes is refused, not overwritten with the row as it was.
  const { rows, bases } = await db.transaction(
    async (tx) => {
      const all = [...ids, ...derivedIds];
      const read = all.length === 0 ? [] : await tx.select().from(asset).where(inArray(asset.id, all));
      const latest = await latestRevisions(tx, "asset", all);
      return {
        rows: new Map(read.map((row) => [row.id, row] as const)),
        bases: new Map(all.map((id) => [id, latest.get(id)?.id ?? null] as const)),
      };
    },
    { isolationLevel: "repeatable read", accessMode: "read only" },
  );
  const keys = [...rows.values()].map((row) => row.blobKey).filter((k): k is string => k !== null);
  const blobs = new Map(
    (keys.length === 0 ? [] : await db.select().from(blobObject).where(inArray(blobObject.key, keys))).map(
      (row) => [row.key, row] as const,
    ),
  );

  const items: UploadItem[] = [];
  const result: AssetUploadResult = {
    source,
    outRoot,
    dryRun,
    counts: { videos: 0, sidecars: 0, posters: 0, pdfs: 0 },
    uploaded: 0,
    uploadedBytes: 0,
    rowsWritten: 0,
    refused: 0,
    postersSkipped: options.ffmpeg === null ? "ffmpeg was not found; set FFMPEG_PATH or put ffmpeg on PATH" : null,
    pdfsSkipped: options.ffmpeg === null ? "ffmpeg was not found; set FFMPEG_PATH or put ffmpeg on PATH" : null,
    bytesCapEstimate: null,
    items,
  };

  /**
   * For a dry run: why the caps would refuse a new object, or null. Each
   * owner is measured once and the objects the dry run has planned are added
   * as it goes, the way a real run's own uploads would count against the next.
   */
  const caps = dryRun ? ownerCapsOrError() : null;
  const planned = new Map<string, { bytes: number; uploads: number }>();
  // A key planned once is a row by the time a real run reaches it again (two
  // files with the same bytes), so it is counted once.
  const plannedKeys = new Set<string>();
  const wouldCap = async (owner: string, key: string, bytes: number): Promise<string | null> => {
    if (caps === null || plannedKeys.has(key)) return null;
    if ("error" in caps) return `a real run would refuse this new object: ${caps.error}`;
    if (caps.bytes === null && caps.uploadsPerDay === null) return null;
    let tally = planned.get(owner);
    if (tally === undefined) {
      const [usage] = await ownerUsage(db, { owner });
      tally = { bytes: usage?.bytes ?? 0, uploads: usage?.uploadsLastDay ?? 0 };
      planned.set(owner, tally);
    }
    if (caps.bytes !== null && tally.bytes + bytes > caps.bytes) {
      return `${key} is ${bytes} bytes, and ${owner} would store ${tally.bytes} before it; a real run would refuse it under the ${caps.bytes}-byte ${OWNER_BYTES_CAP_ENV} cap`;
    }
    if (caps.uploadsPerDay !== null && tally.uploads + 1 > caps.uploadsPerDay) {
      return `${owner} would have uploaded ${tally.uploads} new object(s) in 24 hours before it; a real run would refuse it under the ${OWNER_UPLOADS_PER_DAY_ENV} cap of ${caps.uploadsPerDay}`;
    }
    tally.bytes += bytes;
    tally.uploads += 1;
    plannedKeys.add(key);
    return null;
  };
  /**
   * The same for a derived file the dry run would make (a poster, a PDF):
   * its bytes are unknown until ffmpeg runs, so only the day's count can be
   * asked; the bytes cap is said to be unknowable rather than guessed.
   */
  const wouldCapDerived = async (owner: string, noun: string): Promise<string | null> => {
    if (caps === null) return null;
    if ("error" in caps) return `a real run would refuse this new ${noun}: ${caps.error}`;
    if (caps.uploadsPerDay === null) return null;
    let tally = planned.get(owner);
    if (tally === undefined) {
      const [usage] = await ownerUsage(db, { owner });
      tally = { bytes: usage?.bytes ?? 0, uploads: usage?.uploadsLastDay ?? 0 };
      planned.set(owner, tally);
    }
    if (tally.uploads + 1 > caps.uploadsPerDay) {
      return `${owner} would have uploaded ${tally.uploads} new object(s) in 24 hours before this ${noun}; a real run would refuse it under the ${OWNER_UPLOADS_PER_DAY_ENV} cap of ${caps.uploadsPerDay}`;
    }
    tally.uploads += 1;
    return null;
  };

  const refuse = (id: string, kind: string, detail: string) => {
    items.push({ id, kind, action: "refused", key: null, bytes: null, detail });
    result.refused += 1;
  };

  /** The bytes of a confirmed blob: what the row names, never what a file claims. */
  const blobBytes = async (key: string): Promise<Buffer> => {
    const chunks: Buffer[] = [];
    for await (const chunk of (await store.get(key)).body) chunks.push(chunk as Buffer);
    return Buffer.concat(chunks);
  };
  const blobText = async (key: string): Promise<string> => (await blobBytes(key)).toString("utf8");

  /** A present blob the row already names and the store still has: nothing to read or write. */
  const alreadyStored = async (row: Asset, ext: string): Promise<string | null> => {
    if (row.blobKey === null || row.contentHash === null) return null;
    if (row.blobKey !== blobKey(row.ownerId, row.contentHash, ext)) return null;
    if (blobs.get(row.blobKey)?.state !== "present") return null;
    const stat = await store.stat(row.blobKey);
    return stat !== null && (row.bytes === null || stat.bytes === row.bytes) ? row.blobKey : null;
  };

  /**
   * One indexed file: its blob, uploaded or confirmed. Returns the key its row
   * should name, or null when the file was refused (already recorded).
   */
  const settle = async (planned: Planned): Promise<{ key: string; changed: boolean } | null> => {
    const { row, file, ext } = planned;
    const theirs = foreign(row);
    if (theirs !== null) {
      refuse(row.id, row.kind, theirs);
      return null;
    }
    const kept = await alreadyStored(row, ext);
    if (kept !== null) {
      items.push({ id: row.id, kind: row.kind, action: "present", key: kept, bytes: row.bytes });
      return { key: kept, changed: false };
    }
    if (MIME[ext] === undefined) {
      refuse(row.id, row.kind, `.${ext} is not a type this command uploads`);
      return null;
    }
    let facts;
    try {
      facts = await fileFacts(file);
    } catch (error) {
      refuse(row.id, row.kind, `${row.path} cannot be read under ${outRoot}: ${(error as NodeJS.ErrnoException).code ?? (error as Error).message}`);
      return null;
    }
    if (facts.contentHash !== row.contentHash) {
      refuse(
        row.id,
        row.kind,
        `${row.path} has changed since it was indexed (sha256 ${facts.contentHash.slice(0, 12)}, row ` +
          `${row.contentHash?.slice(0, 12) ?? "none"}). Run \`${reindex}\`, then upload again.`,
      );
      return null;
    }
    const key = blobKey(row.ownerId, facts.contentHash, ext);
    if (dryRun) {
      const [stored] = await db.select({ state: blobObject.state }).from(blobObject).where(eq(blobObject.key, key));
      const there = stored?.state === "present" && (await store.stat(key)) !== null;
      // A new object is what the caps measure, so the dry run asks them too,
      // counting what it has already planned, and says which files a real
      // run would refuse rather than calling every one `would-upload`.
      const capped = stored === undefined ? await wouldCap(row.ownerId, key, facts.bytes) : null;
      if (capped !== null) {
        refuse(row.id, row.kind, capped);
        return null;
      }
      items.push({ id: row.id, kind: row.kind, action: there ? "would-link" : "would-upload", key, bytes: facts.bytes });
      return { key, changed: true };
    }
    let done;
    try {
      done = await uploadBlob(db, store, {
        ownerId: row.ownerId,
        file,
        mime: MIME[ext] as string,
        ext,
        sha256: facts.contentHash,
        bytes: facts.bytes,
      });
    } catch (error) {
      // Its owner's cap (phase 4): this file is refused and the run goes on,
      // since the next file may be another owner's, or one already stored.
      if (!(error instanceof OwnerCapError)) throw error;
      refuse(row.id, row.kind, error.message);
      return null;
    }
    if (done.uploaded) {
      result.uploaded += 1;
      result.uploadedBytes += done.bytes;
    }
    items.push({ id: row.id, kind: row.kind, action: done.uploaded ? "uploaded" : "linked", key: done.key, bytes: done.bytes });
    return { key: done.key, changed: row.blobKey !== done.key };
  };

  const groups: Group[] = found.map((d) => {
    const videoId = `${tool.prefix}${d.videoPath}`;
    const plan = (p: string): Planned | null => {
      const row = rows.get(`${tool.prefix}${p}`);
      return row === undefined ? null : { row, file: path.join(outRoot, p), ext: extOf(p) };
    };
    const sidecars: Planned[] = [];
    for (const p of d.sidecars) {
      const planned = plan(p);
      if (planned === null) refuse(`${tool.prefix}${p}`, "sidecar", `not in the catalog. Run \`${reindex}\` first.`);
      else sidecars.push(planned);
    }
    return { videoId, video: plan(d.videoPath), sidecars };
  });

  for (const group of groups) {
    if (group.video === null) {
      refuse(group.videoId, "video", `not in the catalog. Run \`${reindex}\` first.`);
      continue;
    }
    const writes: WriteContentInput[] = [];
    const groupStart = items.length;
    const linkTo = (row: Asset, key: string) =>
      writes.push({
        owner: row.ownerId,
        type: "asset",
        id: row.id,
        next: { row: { ...contentRow(row), blobKey: key } },
        base: null,
        author,
        authorKind,
        reason,
      });

    result.counts.videos += 1;
    const video = await settle(group.video);
    if (video !== null && video.changed) linkTo(group.video.row, video.key);
    let transcriptSettled: { key: string; changed: boolean } | null = null;
    for (const sidecar of group.sidecars) {
      result.counts.sidecars += 1;
      const done = await settle(sidecar);
      if (sidecar.row.kind === "transcript") transcriptSettled = done;
      if (done !== null && done.changed) linkTo(sidecar.row, done.key);
    }

    if (video !== null) {
      const poster = await settlePoster(group.video, video.changed);
      if (poster !== null) writes.push(poster);
      const pdf = await settlePdf(group, transcriptSettled);
      if (pdf !== null) writes.push(pdf);
    }

    if (dryRun || writes.length === 0) continue;
    for (const write of writes) write.base = bases.get(write.id) ?? null;
    try {
      const written = await writeContents(db, writes);
      result.rowsWritten += written.filter((w) => w.changed || w.repaired === true).length;
    } catch (error) {
      if (!(error instanceof ContentWriteError) || error.code !== "stale-base") throw error;
      // The bytes are stored and confirmed; only the rows are refused. A rerun
      // reads the rows as they are now and links the same keys.
      const refused = new Set(writes.map((w) => w.id));
      // `refused` counts files, not items: a poster already refused (its cap,
      // or no frame to cut) whose detach write this was is not counted again.
      const counted = new Set(items.slice(groupStart).filter((i) => i.action === "refused").map((i) => i.id));
      for (const item of items.slice(groupStart)) {
        if (!refused.has(item.id) || item.action === "refused") continue;
        item.action = "refused";
        item.detail = `its row changed while this upload ran, so it was not pointed at ${item.key ?? "its blob"}. ${error.message}`;
        if (!counted.has(item.id)) result.refused += 1;
        counted.add(item.id);
      }
    }
  }

  const plannedDerived = items.filter((i) => (i.kind === "poster" || i.kind === "pdf") && i.action === "would-make").length;
  if (plannedDerived > 0 && caps !== null && !("error" in caps) && caps.bytes !== null) {
    result.bytesCapEstimate =
      `the ${OWNER_BYTES_CAP_ENV} answers are an estimate: the ${plannedDerived} poster(s)/PDF(s) this run would make are not counted, ` +
      `since their size is known only once ffmpeg runs, so a real run may refuse a file this one passed`;
  }

  return result;

  /** The poster for one video: made and stored if it needs to be, and the row write that records it. */
  async function settlePoster(video: Planned, videoChanged: boolean): Promise<WriteContentInput | null> {
    const id = posterId(video.row.id);
    const existing = rows.get(id);
    const theirs = existing === undefined ? null : foreign(existing);
    if (theirs !== null) {
      refuse(id, "poster", theirs);
      return null;
    }
    const current =
      existing !== undefined && existing.blobKey !== null && existing.contentHash !== null
        ? await alreadyStored(existing, POSTER_EXTENSION.slice(1))
        : null;
    const derived =
      existing !== undefined &&
      (
        await db
          .select({ id: assetDerivation.assetId })
          .from(assetDerivation)
          .where(and(eq(assetDerivation.assetId, id), eq(assetDerivation.sourceAssetId, video.row.id)))
      ).length > 0;
    /**
     * No new poster this run. When the video's bytes just changed, the stored
     * poster shows the old render, and nothing later would notice: the next
     * run sees the video linked and the poster present. So it is unhooked from
     * the video in the same transaction that links the new bytes, and the
     * poster route falls back to cutting a frame from the file until an upload
     * with a working ffmpeg makes a new one (which hooks it back up). A poster
     * whose video did not change is left alone: it is the right picture.
     */
    const detach = (why: string): WriteContentInput | null => {
      if (!videoChanged || existing === undefined || !derived) return null;
      items.push({ id, kind: "poster", action: "detached", key: existing.blobKey, bytes: existing.bytes, detail: why });
      return {
        owner: existing.ownerId,
        type: "asset",
        id,
        next: { row: contentRow(existing), links: { asset_derivation: [] } },
        base: null,
        author,
        authorKind,
        reason,
      };
    };
    // A poster is its video's owner's, and its bytes are keyed by that owner.
    // One left behind when its video moved (D23's move, done by hand for one
    // table and not the other) cannot be recut under either owner without
    // one of the two writes being refused, so it is refused here, before a
    // byte is cut or stored, and said even when it is present; and when its
    // video's link changes in this run it is unhooked, written as its own
    // owner, so it is not served as the video's new current picture.
    if (existing !== undefined && existing.ownerId !== video.row.ownerId) {
      const why =
        `${id} belongs to ${existing.ownerId} and its video to ${video.row.ownerId}; move the poster with its ` +
        `video (\`update asset set owner_id = '${video.row.ownerId}' where id = '${id}'\`), then upload again`;
      refuse(id, "poster", why);
      // Unhooked only when its video's link changes in this run; otherwise
      // it is still the right picture, and saying so is enough.
      return dryRun ? null : detach(why);
    }
    if (current !== null && derived && !videoChanged) {
      result.counts.posters += 1;
      items.push({ id, kind: "poster", action: "present", key: current, bytes: existing?.bytes ?? null });
      return null;
    }
    if (dryRun) {
      if (options.ffmpeg === null) return null;
      const capped = await wouldCapDerived(video.row.ownerId, "poster");
      if (capped !== null) {
        refuse(id, "poster", capped);
        return null;
      }
      result.counts.posters += 1;
      items.push({
        id,
        kind: "poster",
        action: "would-make",
        key: null,
        bytes: null,
        ...(caps !== null && !("error" in caps) && caps.bytes !== null
          ? { detail: `its size is known only once it is cut, so the ${OWNER_BYTES_CAP_ENV} cap is not asked` }
          : {}),
      });
      return null;
    }
    if (options.ffmpeg === null) return detach("no ffmpeg to cut a poster from the new render");
    // The file must still be the bytes the row names, before the cut and
    // after it: a video answered `present` was not read again, and a render
    // that changed on disk since its import would otherwise give the stored
    // video a poster of other bytes.
    const indexed = async (): Promise<string | null> => {
      let facts;
      try {
        facts = await fileFacts(video.file);
      } catch (error) {
        return `${video.row.path} cannot be read under ${outRoot}: ${(error as NodeJS.ErrnoException).code ?? (error as Error).message}`;
      }
      return facts.contentHash === video.row.contentHash
        ? null
        : `${video.row.path} has changed since it was indexed, so no poster was cut from it. Run \`${reindex}\`, then upload again.`;
    };
    const before = await indexed();
    if (before !== null) {
      refuse(id, "poster", before);
      return detach(before);
    }
    const frame = await extractPoster(options.ffmpeg, video.file);
    if (!frame.ok) {
      refuse(id, "poster", `no poster could be cut from ${video.row.path}: ${frame.reason}`);
      return detach(`no poster could be cut from the new render: ${frame.reason}`);
    }
    const after = await indexed();
    if (after !== null) {
      refuse(id, "poster", after);
      return detach(after);
    }
    const sha256 = createHash("sha256").update(frame.body).digest("hex");
    const dir = await mkdtemp(path.join(os.tmpdir(), "self-learn-poster-"));
    try {
      const file = path.join(dir, `poster${POSTER_EXTENSION}`);
      await writeFile(file, frame.body);
      let done;
      try {
        done = await uploadBlob(db, store, {
          ownerId: video.row.ownerId,
          file,
          mime: POSTER_CONTENT_TYPE,
          ext: POSTER_EXTENSION.slice(1),
          sha256,
          bytes: frame.body.length,
        });
      } catch (error) {
        if (!(error instanceof OwnerCapError)) throw error;
        refuse(id, "poster", error.message);
        return detach(`its owner's cap refused the new poster: ${error.message}`);
      }
      if (done.uploaded) {
        result.uploaded += 1;
        result.uploadedBytes += done.bytes;
      }
      result.counts.posters += 1;
      // The same picture its row already names, only not hooked to its video
      // (a prune deleted the video and the derivation cascaded away with it,
      // and the video came back with the same id): the write below restores
      // the link, and nothing new was cut into the store.
      const relinked = existing !== undefined && existing.blobKey === done.key && !done.uploaded;
      items.push({ id, kind: "poster", action: relinked ? "linked" : "made", key: done.key, bytes: done.bytes });
      return {
        // The poster is its video's owner's, as its key's prefix already says.
        owner: video.row.ownerId,
        type: "asset",
        id,
        next: {
          row: {
            id,
            kind: "poster",
            // No path: a poster has no file anywhere but the store, and a path
            // would send the legacy branch of the file route looking for one.
            path: null,
            url: null,
            contentHash: sha256,
            bytes: done.bytes,
            title: `${video.row.title ?? video.row.id} (poster)`,
            // Made by this repository's upload command, not rendered by the tool.
            sourceRepo: "self-learn",
            blobKey: done.key,
            resourceType: null,
            ownerId: video.row.ownerId,
          },
          links: { asset_derivation: [{ sourceAssetId: video.row.id }] },
        },
        base: null,
        author,
        authorKind,
        reason,
      };
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }

  /**
   * The PDF for one video: made and stored if it needs to be, and the row
   * write that records it. The poster's sibling under every rule that
   * matters — same id pattern outside the tool's namespace, same owner's
   * key, same "missing, unlinked or the video's bytes changed" recut rule,
   * same unhook-on-new-render. It differs in what it is made from: the
   * transcript sidecar gives the page plan (one page per narration beat),
   * and a video without one falls back to a fixed cadence of frames.
   */
  async function settlePdf(group: Group, transcriptSettled: { key: string } | null): Promise<WriteContentInput | null> {
    const video = group.video as Planned;
    const id = pdfId(video.row.id);
    const existing = rows.get(id);
    const theirs = existing === undefined ? null : foreign(existing);
    if (theirs !== null) {
      refuse(id, "pdf", theirs);
      return null;
    }
    const current =
      existing !== undefined && existing.blobKey !== null && existing.contentHash !== null
        ? await alreadyStored(existing, PDF_EXTENSION.slice(1))
        : null;
    const derived =
      existing !== undefined &&
      (
        await db
          .select({ id: assetDerivation.assetId })
          .from(assetDerivation)
          .where(and(eq(assetDerivation.assetId, id), eq(assetDerivation.sourceAssetId, video.row.id)))
      ).length > 0;
    // What the PDF is made from: the video's bytes, its title, and the
    // narration its transcript's segments give it. The segments come from
    // the transcript's confirmed blob — the bytes its row names — never the
    // file: `settle` may have refused a file that changed since it was
    // indexed, and a transcript linked in an earlier run can drift on disk
    // afterwards. Either way the fingerprint and (if it comes to that) the
    // build read what the catalog serves.
    const transcript = group.sidecars.find((s) => s.row.kind === "transcript");
    const transcriptKey =
      transcript === undefined ? null : (transcriptSettled?.key ?? (await alreadyStored(transcript.row, transcript.ext)));
    let segments: PdfSegment[] | null = null;
    if (transcriptKey !== null) {
      try {
        segments = segmentsFromText(await blobText(transcriptKey));
      } catch {
        segments = null;
      }
    }
    const expected = pdfInputs(video.row.contentHash ?? "", video.row.title ?? video.row.id, segments);
    // The stored document carries that fingerprint in its own metadata, so
    // the comparison is against the bytes themselves rather than the
    // revision history's memory of them — a memory that does not move when a
    // rebuild lands on identical bytes (a write that changes nothing appends
    // no revision). A transcript rewritten with the same segments then
    // fingerprints the same and recuts nothing, and a run without ffmpeg
    // unhooks only a document that is actually out of date.
    const inputChanged =
      current !== null && derived ? (await pdfInputsOf(await blobBytes(current))) !== expected : false;
    // A video whose inputs just changed leaves its PDF picturing the old
    // render or quoting the old transcript, and nothing later would notice:
    // the next run sees the video linked and the PDF present. So it is
    // unhooked in the same write, as `detach` on the poster does for the
    // render alone, until an upload with a working ffmpeg makes the new one.
    const unhook = (why: string): WriteContentInput | null => {
      if (existing === undefined || !derived) return null;
      items.push({ id, kind: "pdf", action: "detached", key: existing.blobKey, bytes: existing.bytes, detail: why });
      return {
        owner: existing.ownerId,
        type: "asset",
        id,
        next: { row: contentRow(existing), links: { asset_derivation: [] } },
        base: null,
        author,
        authorKind,
        reason,
      };
    };
    // Unhooking for staleness only when the inputs say it is; an owner
    // mismatch unhooks at any age, since the video must not serve a document
    // under the other owner's prefix at all.
    const detach = (why: string): WriteContentInput | null => (inputChanged ? unhook(why) : null);
    if (existing !== undefined && existing.ownerId !== video.row.ownerId) {
      const why =
        `${id} belongs to ${existing.ownerId} and its video to ${video.row.ownerId}; move the PDF with its ` +
        `video (\`update asset set owner_id = '${video.row.ownerId}' where id = '${id}'\`), then upload again`;
      refuse(id, "pdf", why);
      return dryRun ? null : unhook(why);
    }
    if (current !== null && derived && !inputChanged) {
      result.counts.pdfs += 1;
      items.push({ id, kind: "pdf", action: "present", key: current, bytes: existing?.bytes ?? null });
      return null;
    }
    if (dryRun) {
      if (options.ffmpeg === null) return null;
      const capped = await wouldCapDerived(video.row.ownerId, "PDF");
      if (capped !== null) {
        refuse(id, "pdf", capped);
        return null;
      }
      result.counts.pdfs += 1;
      items.push({
        id,
        kind: "pdf",
        action: "would-make",
        key: null,
        bytes: null,
        ...(caps !== null && !("error" in caps) && caps.bytes !== null
          ? { detail: `its size is known only once it is made, so the ${OWNER_BYTES_CAP_ENV} cap is not asked` }
          : {}),
      });
      return null;
    }
    if (options.ffmpeg === null) return detach("no ffmpeg to make a PDF from the new render");
    // The file must still be the bytes the row names, before the pages are
    // cut and after them: a video answered `present` was not read again, and
    // a render that changed on disk since its import would otherwise give
    // the stored video a document of other bytes.
    const indexed = async (): Promise<string | null> => {
      let facts;
      try {
        facts = await fileFacts(video.file);
      } catch (error) {
        return `${video.row.path} cannot be read under ${outRoot}: ${(error as NodeJS.ErrnoException).code ?? (error as Error).message}`;
      }
      return facts.contentHash === video.row.contentHash
        ? null
        : `${video.row.path} has changed since it was indexed, so no PDF was made from it. Run \`${reindex}\`, then upload again.`;
    };
    const before = await indexed();
    if (before !== null) {
      refuse(id, "pdf", before);
      return detach(before);
    }
    const made = await buildVideoPdf(
      options.ffmpeg,
      video.file,
      video.row.contentHash ?? "",
      video.row.title ?? video.row.id,
      segments,
    );
    if (!made.ok) {
      refuse(id, "pdf", `no PDF could be made from ${video.row.path}: ${made.reason}`);
      return detach(`no PDF could be made from the new render: ${made.reason}`);
    }
    const after = await indexed();
    if (after !== null) {
      refuse(id, "pdf", after);
      return detach(after);
    }
    const sha256 = createHash("sha256").update(made.body).digest("hex");
    const dir = await mkdtemp(path.join(os.tmpdir(), "self-learn-pdf-"));
    try {
      const file = path.join(dir, `video${PDF_EXTENSION}`);
      await writeFile(file, made.body);
      let done;
      try {
        done = await uploadBlob(db, store, {
          ownerId: video.row.ownerId,
          file,
          mime: PDF_CONTENT_TYPE,
          ext: PDF_EXTENSION.slice(1),
          sha256,
          bytes: made.body.length,
        });
      } catch (error) {
        if (!(error instanceof OwnerCapError)) throw error;
        refuse(id, "pdf", error.message);
        return detach(`its owner's cap refused the new PDF: ${error.message}`);
      }
      if (done.uploaded) {
        result.uploaded += 1;
        result.uploadedBytes += done.bytes;
      }
      result.counts.pdfs += 1;
      const relinked = existing !== undefined && existing.blobKey === done.key && !done.uploaded;
      items.push({ id, kind: "pdf", action: relinked ? "linked" : "made", key: done.key, bytes: done.bytes });
      return {
        // The PDF is its video's owner's, as its key's prefix already says.
        owner: video.row.ownerId,
        type: "asset",
        id,
        next: {
          row: {
            id,
            kind: "pdf",
            // No path: a PDF has no file anywhere but the store, as posters
            // have none.
            path: null,
            url: null,
            contentHash: sha256,
            bytes: done.bytes,
            title: `${video.row.title ?? video.row.id} (PDF)`,
            // Made by this repository's upload command, not rendered by the tool.
            sourceRepo: "self-learn",
            blobKey: done.key,
            resourceType: null,
            ownerId: video.row.ownerId,
          },
          links: { asset_derivation: [{ sourceAssetId: video.row.id }] },
        },
        base: null,
        author,
        authorKind,
        reason,
      };
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }
}
