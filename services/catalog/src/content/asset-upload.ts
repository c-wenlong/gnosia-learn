import { createHash } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { key as blobKey, type BlobStore } from "@self-learn/blob";
import { asset, assetDerivation, blobObject, LOCAL_LEARNER_ID, readableOwners, type Asset } from "@self-learn/schema";
import { and, eq, inArray, sql } from "drizzle-orm";

import type { CatalogDatabase } from "../db";
import { fileFacts } from "../index/files";
import { MANIMKC_MIME, readTopicsReport, type TopicsReport } from "../index/manimkc";
import { ASSET_PREFIX } from "../index/source";
import { extractPoster } from "../poster/extract";
import { POSTER_CONTENT_TYPE, POSTER_EXTENSION } from "../poster/recipe";
import { OwnerCapError, uploadBlob } from "./blob";
import { latestRevisions } from "./revisions";
import { ContentWriteError, writeContents, type WriteContentInput } from "./write";
import { CLI_OWNER } from "./scope";

/**
 * `catalog asset upload --source manimkc`: manimkc's rendered videos and their
 * sidecars into the blob store, a poster made for each video on the way, and
 * every `asset` row pointed at its blob (docs/CONTENT-MIGRATION.md, Track E;
 * D5, D7, D8, D11; edge cases 5 and 9).
 *
 * **Which files.** The same report the manimkc indexer reads,
 * `manimkc topics --json`, with its `outRoot`: nothing here re-derives
 * manimkc's layout. A deliverable is only uploaded onto an asset row the
 * indexer already wrote (`manimkc:<out/...>`), because the row is what the
 * page asks for and a blob no row points at is an orphan on arrival.
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

/** Media types for what this command uploads, by extension: manimkc's own, and the poster. */
const MIME: Readonly<Record<string, string>> = { ...MANIMKC_MIME, jpg: POSTER_CONTENT_TYPE };

export type UploadSource = "manimkc";
export const UPLOAD_SOURCES: readonly UploadSource[] = ["manimkc"];

export interface AssetUploadOptions {
  store: BlobStore;
  /** Where the pinned manimkc CLI resolves from (the repository). */
  repoRoot: string;
  /** The manimkc checkout the CLI reads, as `catalog import` takes it. */
  manimkcRoot: string;
  dryRun?: boolean;
  /** Absolute path to ffmpeg, or null when there is none: posters are then skipped and said so. */
  ffmpeg: string | null;
  author?: string;
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
  /** Files the report lists, and posters present or made (planned, on a dry run) by the end. */
  counts: { videos: number; sidecars: number; posters: number };
  /** Files whose bytes went into the store this run, and how many bytes. */
  uploaded: number;
  uploadedBytes: number;
  /** Asset rows written this run (a revision each). */
  rowsWritten: number;
  refused: number;
  /** Why posters were not made at all this run, when that is the case. */
  postersSkipped: string | null;
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
 * Unhook the poster of each of `videoIds` that was cut from other bytes than
 * the video's now, the way the upload unhooks one when it links new bytes and
 * cannot cut a new poster (see `detach` below). Under the blob contract (0013)
 * the import, not the upload, is what links a re-render, so the upload would
 * otherwise find the video's blob present and the poster derived from it, and
 * keep a picture of the old render. Unhooked, the poster is not derived from
 * the video, and the next `catalog asset upload` cuts a new one and hooks it
 * back up.
 *
 * "Cut from other bytes" is read from the revisions, not from what this run
 * changed: the video's `blob_key` as of the poster revision that last cut or
 * hooked it (a revision that derives the poster from the video where the one
 * before did not, or that changed the poster's own bytes), against its key
 * now. Any other poster revision, a title edit say, is not a cut. So an
 * import that linked the new bytes and then failed before this ran is caught
 * by the next one, whose own write changes nothing.
 *
 * Which posters are stale, their rows, and the revision each was read at come
 * from one snapshot, and each unhook is based on that revision. A `catalog
 * asset upload` that recut and relinked a poster after the snapshot therefore
 * fails the write's base check, and that poster is left as the upload made it
 * and reported as `moved`, rather than having its fresh link cleared or
 * failing the import. Detecting outside the snapshot, as this once did, let a
 * relink landing between the two reads become the base, and the unhook then
 * undid it.
 */
export async function unhookPosters(
  db: CatalogDatabase,
  videoIds: readonly string[],
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
          and d.asset_id = ${POSTER_PREFIX} || d.source_asset_id
          and (
            select r.snapshot -> 'entity' ->> 'blob_key'
            from content_revision r
            where r.entity_type = 'asset' and r.entity_id = v.id and r.id < cut.id
            order by r.id desc
            limit 1
          ) is distinct from v.blob_key
        order by d.asset_id
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
  const report = options.report ?? (await readTopicsReport(options.repoRoot, options.manimkcRoot));
  const outRoot = str(report.outRoot) ?? options.manimkcRoot;
  const { store } = options;
  const author = options.author ?? LOCAL_LEARNER_ID;
  const readable = readableOwners(options.owner ?? CLI_OWNER);
  /** Why a row is not this upload's to write, or null when it is. */
  const foreign = (row: Asset): string | null =>
    readable.includes(row.ownerId)
      ? null
      : `${row.id} belongs to ${row.ownerId}, and this upload writes only ${readable.join(" and ")}'s rows; nothing was stored`;
  const reason = options.reason ?? "catalog asset upload --source manimkc: bytes into the blob store";

  const found = deliverables(report);
  const ids = found.flatMap((d) => [d.videoPath, ...d.sidecars]).map((p) => `${ASSET_PREFIX.manimkc}${p}`);
  const posterIds = found.map((d) => posterId(`${ASSET_PREFIX.manimkc}${d.videoPath}`));
  // The rows and the revision each was read at, in one snapshot. Every write
  // below copies the row it read and changes its blob key, so it is based on
  // that revision: a `catalog import` that rewrote the row in the minutes an
  // upload takes is refused, not overwritten with the row as it was.
  const { rows, bases } = await db.transaction(
    async (tx) => {
      const all = [...ids, ...posterIds];
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
    source: "manimkc",
    outRoot,
    dryRun,
    counts: { videos: 0, sidecars: 0, posters: 0 },
    uploaded: 0,
    uploadedBytes: 0,
    rowsWritten: 0,
    refused: 0,
    postersSkipped: options.ffmpeg === null ? "ffmpeg was not found; set FFMPEG_PATH or put ffmpeg on PATH" : null,
    items,
  };

  const refuse = (id: string, kind: string, detail: string) => {
    items.push({ id, kind, action: "refused", key: null, bytes: null, detail });
    result.refused += 1;
  };

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
          `${row.contentHash?.slice(0, 12) ?? "none"}). Run \`npm run catalog -- import --only manimkc\`, then upload again.`,
      );
      return null;
    }
    const key = blobKey(row.ownerId, facts.contentHash, ext);
    if (dryRun) {
      const [stored] = await db.select({ state: blobObject.state }).from(blobObject).where(eq(blobObject.key, key));
      const there = stored?.state === "present" && (await store.stat(key)) !== null;
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
    const videoId = `${ASSET_PREFIX.manimkc}${d.videoPath}`;
    const plan = (p: string): Planned | null => {
      const row = rows.get(`${ASSET_PREFIX.manimkc}${p}`);
      return row === undefined ? null : { row, file: path.join(outRoot, p), ext: extOf(p) };
    };
    const sidecars: Planned[] = [];
    for (const p of d.sidecars) {
      const planned = plan(p);
      if (planned === null) refuse(`${ASSET_PREFIX.manimkc}${p}`, "sidecar", `not in the catalog. Run \`npm run catalog -- import --only manimkc\` first.`);
      else sidecars.push(planned);
    }
    return { videoId, video: plan(d.videoPath), sidecars };
  });

  for (const group of groups) {
    if (group.video === null) {
      refuse(group.videoId, "video", "not in the catalog. Run `npm run catalog -- import --only manimkc` first.");
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
        authorKind: "person",
        reason,
      });

    result.counts.videos += 1;
    const video = await settle(group.video);
    if (video !== null && video.changed) linkTo(group.video.row, video.key);
    for (const sidecar of group.sidecars) {
      result.counts.sidecars += 1;
      const done = await settle(sidecar);
      if (done !== null && done.changed) linkTo(sidecar.row, done.key);
    }

    if (video !== null) {
      const poster = await settlePoster(group.video, video.changed);
      if (poster !== null) writes.push(poster);
    }

    if (dryRun || writes.length === 0) continue;
    for (const write of writes) write.base = bases.get(write.id) ?? null;
    try {
      const written = await writeContents(db, writes);
      result.rowsWritten += written.filter((w) => w.changed).length;
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
    // A poster is its video's owner's, and its bytes are keyed by that owner.
    // One left behind when its video moved (D23's move, done by hand for one
    // table and not the other) cannot be recut under either owner without
    // one of the two writes being refused, so it is refused here, before a
    // byte is cut or stored.
    if (existing !== undefined && existing.ownerId !== video.row.ownerId) {
      refuse(
        id,
        "poster",
        `${id} belongs to ${existing.ownerId} and its video to ${video.row.ownerId}; move the poster with its ` +
          `video (\`update asset set owner_id = '${video.row.ownerId}' where id = '${id}'\`), then upload again`,
      );
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
    if (current !== null && derived && !videoChanged) {
      result.counts.posters += 1;
      items.push({ id, kind: "poster", action: "present", key: current, bytes: existing?.bytes ?? null });
      return null;
    }
    if (dryRun) {
      if (options.ffmpeg === null) return null;
      result.counts.posters += 1;
      items.push({ id, kind: "poster", action: "would-make", key: null, bytes: null });
      return null;
    }
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
        authorKind: "person",
        reason,
      };
    };
    if (options.ffmpeg === null) return detach("no ffmpeg to cut a poster from the new render");
    const frame = await extractPoster(options.ffmpeg, video.file);
    if (!frame.ok) {
      refuse(id, "poster", `no poster could be cut from ${video.row.path}: ${frame.reason}`);
      return detach(`no poster could be cut from the new render: ${frame.reason}`);
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
      items.push({ id, kind: "poster", action: "made", key: done.key, bytes: done.bytes });
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
            // Made by this repository's upload command, not rendered by manimkc.
            sourceRepo: "self-learn",
            blobKey: done.key,
            resourceType: null,
            ownerId: video.row.ownerId,
          },
          links: { asset_derivation: [{ sourceAssetId: video.row.id }] },
        },
        base: null,
        author,
        authorKind: "person",
        reason,
      };
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }
}
