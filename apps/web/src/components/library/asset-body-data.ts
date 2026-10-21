import "server-only";

import type { AssetRef } from "@gnosia/catalog/state";

import type { VideoChapter } from "@/components/media";
import { readAssetText, readFileProblems, withCatalog } from "@/lib/asset-library";
import { storedPdfs, storedPosters } from "@/lib/asset-files";
import { problemSource, type RouteProblemCode } from "@/lib/asset-problems";
import { assetDownloadHref, assetFileHref, assetPdfHref, assetPosterHref, assetStatusHref } from "@/lib/library";
import { embedTargets } from "@/lib/note-embeds";
import { parseChapters, parseTranscript, type ParsedTranscript } from "@/lib/transcript";

/**
 * Everything `AssetBody` draws an asset from, read once on the server: the
 * asset page (`/library/[id]`) and the Library's previewer both call
 * `loadAssetBody` with what they already hold and hand the answer to
 * `AssetBody`, so the two show one body from one set of reads and cannot
 * drift apart.
 *
 * Everything about the file the server can know before render is decided
 * here, so the body sends a failure panel rather than a player that is
 * certain to fail. Asked of this row through the file route's own
 * `resolveAsset` (`readFileProblems`), so the body and the route give one
 * answer: a blob in the store, or a note, log or `.tldr` the database owns,
 * is servable, and anything else is `not-uploaded`.
 */
export interface AssetBodyData {
  asset: AssetRef;
  /** The file route for this asset: what a player, an `<img>` and Download load. */
  fileHref: string;
  /** Where a failed load asks why. */
  statusHref: string;
  /** What a failure names as the way back: a studio video is made again, not uploaded. */
  failureSource: string;
  /**
   * What Download fetches: the file route's `?download=1`, which names the
   * saved file after the asset's title, the same route the row menu's
   * Download takes, so the file has one name wherever it was pressed.
   */
  downloadHref: string;
  /** Why the file cannot be served, or null when it can (or is a link, which has no file). */
  fileProblem: RouteProblemCode | null;
  servable: boolean;
  /** A servable video's transcript and chapters; null for anything else. */
  sidecars: Sidecars | null;
  /** The poster `catalog asset upload` stored, shown before a video loads. */
  poster: string | undefined;
  /** The PDF `catalog asset upload` or `catalog video put` made for the video, or undefined. */
  pdfHref: string | undefined;
  /** The words of anything that is neither a player, a picture nor a URL, or null. */
  text: string | null;
  /** The pictures a note embeds, each checked as the asset itself is. */
  embedProblems: ReadonlyMap<string, RouteProblemCode | null>;
}

/**
 * The transcript beside a video, and the three answers that are not "here it
 * is". `none` when the video has no sidecar row at all, `unreadable` when it
 * has one whose bytes did not come back as a transcript. The player is told
 * different things for each, because "this video has no narration" and "the
 * narration file did not load" are different facts about the same screen.
 *
 * **The transcript is a prop, never a fetch.** It is a separate `asset` row
 * whose file the route serves, so the browser could ask for it, and then the
 * panel would need a loading state, a failure state and a second round trip
 * for text the server already had a request in which to read.
 * `readAssetText` reads it through `resolveAsset`, which holds every
 * containment check the asset route makes, and `parseTranscript` validates
 * what comes back. A sidecar that is truncated, half-written or simply not
 * JSON costs the transcript and nothing else.
 */
export type Sidecars =
  | { state: "none" }
  | { state: "unreadable" }
  | { state: "read"; chapters: VideoChapter[]; cues: ParsedTranscript["cues"]; dropped: number };

/** The kinds drawn by something other than their words. */
const RENDERED = new Set(["video", "diagram_svg", "link", "pdf"]);

/** The asset id a note's `![[name]]` embed names: the diagram rows' own. */
export function embedAssetId(embed: string): string {
  return `diagram:learn/assets/${embed}`;
}

/**
 * Reads what `AssetBody` needs for `asset`, given the companion rows the
 * caller already read with it (`loadAssetDetail`'s `derivations.derived`).
 */
export async function loadAssetBody(asset: AssetRef, derived: readonly AssetRef[]): Promise<AssetBodyData> {
  const fileHref = assetFileHref(asset.id);
  const fileProblem: RouteProblemCode | null =
    asset.kind === "link" ? null : ((await readFileProblems([asset.id])).get(asset.id) ?? null);
  const servable = asset.kind !== "link" && fileProblem === null;

  const [sidecars, posters, pdfs] =
    asset.kind === "video" && servable
      ? await Promise.all([
          videoSidecars(derived),
          withCatalog((db) => storedPosters(db, [asset])),
          withCatalog((db) => storedPdfs(db, [asset])),
        ])
      : [null, null, null];

  // Anything that is neither a player nor a picture nor a bare URL has words,
  // so it is read on the server and the body arrives with them. Attempted for
  // any kind rather than a fixed list, so a kind a future indexer adds shows
  // its contents instead of nothing; `resolveAsset`'s closed extension list is
  // what refuses a binary, and `readAssetText` refuses anything over the
  // preview cap. A null lands on `UnreadableFile`, which says so. A note or a
  // log is read from its row.
  const text =
    servable && !RENDERED.has(asset.kind) ? await withCatalog((db) => readAssetText(db, asset.id)) : null;

  // The pictures a note embeds are `learn/assets/<name>`, the same files the
  // diagram rows point at, so they resolve through the file route. Each one is
  // checked here first, for the same reason as the asset itself.
  const embedProblems =
    text !== null && asset.path?.endsWith(".md")
      ? await readFileProblems(embedTargets(text).map(embedAssetId))
      : new Map<string, RouteProblemCode | null>();

  return {
    asset,
    fileHref,
    statusHref: assetStatusHref(asset.id),
    failureSource: problemSource(asset.id, asset.sourceRepo) ?? asset.sourceRepo,
    downloadHref: assetDownloadHref(asset.id),
    fileProblem,
    servable,
    sidecars,
    poster: posters?.has(asset.id) ? assetPosterHref(asset.id) : undefined,
    pdfHref: pdfs?.has(asset.id) ? assetPdfHref(asset.id) : undefined,
    text,
    embedProblems,
  };
}

async function videoSidecars(derived: readonly AssetRef[]): Promise<Sidecars> {
  const transcript = derived.find((row) => row.kind === "transcript");
  const chapters = derived.find((row) => row.kind === "chapters");
  if (transcript === undefined && chapters === undefined) return { state: "none" };

  const parsed =
    transcript === undefined
      ? null
      : await withCatalog(async (db) => {
          const raw = await readAssetText(db, transcript.id);
          return raw === null ? null : parseTranscript(raw);
        });

  if (parsed != null) {
    return { state: "read", chapters: parsed.chapters, cues: parsed.cues, dropped: parsed.dropped };
  }

  // The transcript carries the chapter list too, so this only runs when it is
  // absent or unreadable, and then the chapter sidecar is the second, separate
  // row that can still give the video its chapters.
  const fromChapters =
    chapters === undefined
      ? null
      : await withCatalog(async (db) => {
          const raw = await readAssetText(db, chapters.id);
          return raw === null ? null : parseChapters(raw);
        });

  if (fromChapters != null) {
    return { state: "read", chapters: fromChapters, cues: [], dropped: 0 };
  }
  return { state: "unreadable" };
}
