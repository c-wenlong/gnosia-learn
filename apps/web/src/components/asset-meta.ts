/**
 * What an asset row is called, what family it belongs to, and how big it is.
 *
 * Pure and React-free, and beside `AssetCard` for the same reason `media.ts`
 * sits beside `VideoPlayer`: the component renders these answers and both a
 * server component and a client one need to ask the question.
 *
 * **Not in `AssetCard.tsx`, and the reason is a runtime error rather than
 * taste.** That module is `"use client"`, which makes every one of its exports
 * a client reference — a function included. A server component importing
 * `assetKindLabel` from it type-checks, builds without a word, and then throws
 * *Attempted to call assetKindLabel() from the server* on the first request,
 * because what the server holds is a stub standing in for a function that lives
 * in the browser bundle. So the pure half lives here, where both sides may call
 * it, and the component imports it like anyone else.
 */

/**
 * The asset as `@self-learn/catalog/state` hands it over. Restated here rather
 * than imported: a `"use client"` module that reaches the catalog would drag a
 * Postgres driver into the browser bundle, and the shapes a component renders
 * are its own contract anyway. `title` is nullable and usually exactly one of
 * `path` and `url` is set, which is why both fallbacks below exist.
 */
export interface AssetCardRef {
  id: string;
  kind: string;
  path: string | null;
  url: string | null;
  bytes: number | null;
  title: string | null;
  sourceRepo?: string;
}

export type Family = "video" | "diagram" | "text" | "link";

/**
 * The kinds in the catalog today, with the counts they were written against:
 * link 68, note 32, video 30, captions 23, transcript 23, chapters 23,
 * session 3, diagram_svg 2, diagram_source 2. Anything not here is rendered
 * from its own name, so a new indexer does not need a change in this file to
 * put its rows on a page.
 */
const KINDS: Record<string, { label: string; family: Family }> = {
  video: { label: "Video", family: "video" },
  diagram_svg: { label: "Diagram", family: "diagram" },
  diagram_source: { label: "Diagram source", family: "text" },
  transcript: { label: "Transcript", family: "text" },
  captions: { label: "Captions", family: "text" },
  chapters: { label: "Chapters", family: "text" },
  note: { label: "Note", family: "text" },
  session: { label: "Session log", family: "text" },
  link: { label: "Link", family: "link" },
  // A still cut from a video by `catalog asset upload`, a companion of it.
  poster: { label: "Poster", family: "diagram" },
};

/** `diagram_source` reads as "Diagram source"; an unknown kind reads as itself. */
export function assetKindLabel(kind: string): string {
  const known = KINDS[kind];
  if (known) return known.label;
  const words = kind.replace(/[_-]+/g, " ").trim();
  if (!words) return "Asset";
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** Which of the four rendering families a kind belongs to; text is the default. */
export function familyOf(kind: string): Family {
  return KINDS[kind]?.family ?? "text";
}

/**
 * What to call this asset, and how honest the name is.
 *
 * `title` when there is one, else the filename, else the host of the link,
 * else an admission that the row has no name. The caller styles the three
 * cases differently, because a filename is not a title and should not be
 * dressed as one.
 */
export function assetDisplayTitle(asset: AssetCardRef): {
  text: string;
  source: "title" | "filename" | "host" | "none";
} {
  const title = asset.title?.trim();
  if (title) return { text: title, source: "title" };

  const path = asset.path?.trim();
  if (path) {
    const base = path.split("/").filter(Boolean).pop();
    if (base) return { text: base, source: "filename" };
  }

  const url = asset.url?.trim();
  if (url) {
    try {
      return { text: new URL(url).host, source: "host" };
    } catch {
      return { text: url, source: "filename" };
    }
  }

  return { text: `Untitled ${assetKindLabel(asset.kind).toLowerCase()}`, source: "none" };
}

/** `298 kB`, SI units, because that is what the file managers say. */
export function formatBytes(bytes: number | null): string | null {
  if (bytes === null || !Number.isFinite(bytes) || bytes < 0) return null;
  if (bytes < 1000) return `${Math.round(bytes)} B`;
  const units = ["kB", "MB", "GB", "TB"];
  let value = bytes / 1000;
  let unit = 0;
  while (value >= 1000 && unit < units.length - 1) {
    value /= 1000;
    unit += 1;
  }
  return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${units[unit]}`;
}

/** The tool that made a row, as the card's meta line names it. */
const SOURCE_LABEL: Record<string, string> = {
  manimkc: "manim",
  tldrawkc: "tldraw",
};

/**
 * The short line beside a card's kind chip (hi-fi 10: "4:12 · manim",
 * "svg · tldraw", "concept note", "external"): what made it and how big it is,
 * from what the row actually carries. There is no duration column, so a video
 * says its tool and its size rather than a running time nobody measured. A
 * note says only its size: the hi-fi's "concept note" sat beside a chip that
 * already reads "Note" (dropped 2026-09-29, with SVG capitalised as the
 * acronym it is).
 */
export function assetMetaLine(asset: AssetCardRef): string {
  const size = formatBytes(asset.bytes);
  const tool = asset.sourceRepo === undefined ? undefined : SOURCE_LABEL[asset.sourceRepo];
  const parts: (string | null | undefined)[] = [];
  switch (asset.kind) {
    case "video":
      parts.push(tool, size);
      break;
    case "diagram_svg":
      parts.push("SVG", tool, size);
      break;
    case "link": {
      let host: string | null = null;
      try {
        host = asset.url ? new URL(asset.url).host : null;
      } catch {
        host = null;
      }
      parts.push(host ?? "external");
      break;
    }
    default:
      parts.push(tool, size);
  }
  return parts.filter(Boolean).join(" · ");
}
