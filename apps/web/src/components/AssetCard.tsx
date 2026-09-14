"use client";

import { useState, type ReactNode } from "react";

/**
 * One row of the catalog's asset table, as a card in a grid.
 *
 * The asset comes in as a prop, already read by whoever is listing them; the
 * thumbnail and the link come in already resolved. The component's whole job
 * is to say what this thing is and let the reader open it.
 *
 * **Two shapes, not one.** A video and a diagram are worth looking at before
 * opening, so they get a preview tile. A transcript, a note or a link is text,
 * and a 16:9 grey rectangle above every one of them would be a grid of empty
 * boxes pretending to be a gallery. Those get a compact row instead: a glyph,
 * the title, the file. Same card vocabulary, sized to what is in it.
 *
 * **It has to degrade honestly**, because the catalog holds rows this app has
 * never seen. A kind with no special rendering still reads as itself. A video
 * with no poster shows a labelled placeholder, not a black hole. An asset with
 * no title falls back to its filename, in mono, because that is what it is
 * actually called, and to `Untitled <kind>` only when there is no name at all.
 * A preview that fails to load says so where the picture would have been.
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

type Family = "video" | "diagram" | "text" | "link";

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
};

/** `diagram_source` reads as "Diagram source"; an unknown kind reads as itself. */
export function assetKindLabel(kind: string): string {
  const known = KINDS[kind];
  if (known) return known.label;
  const words = kind.replace(/[_-]+/g, " ").trim();
  if (!words) return "Asset";
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function familyOf(kind: string): Family {
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

/** One stroke set for every kind, so the grid reads as one family of things. */
function KindGlyph({ family, className }: { family: Family; className?: string }) {
  const common = {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.5,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
    className,
  };
  if (family === "video") {
    return (
      <svg {...common}>
        <rect x="3" y="5" width="18" height="14" rx="2.5" />
        <path d="M10.5 9.5 15 12l-4.5 2.5z" />
      </svg>
    );
  }
  if (family === "diagram") {
    return (
      <svg {...common}>
        <rect x="3" y="4" width="7" height="5" rx="1.5" />
        <rect x="14" y="15" width="7" height="5" rx="1.5" />
        <path d="M6.5 9v4.5a2 2 0 0 0 2 2H14" />
      </svg>
    );
  }
  if (family === "link") {
    return (
      <svg {...common}>
        <path d="M10 13.5a3.5 3.5 0 0 0 5 0l3-3a3.5 3.5 0 0 0-5-5l-1 1" />
        <path d="M14 10.5a3.5 3.5 0 0 0-5 0l-3 3a3.5 3.5 0 0 0 5 5l1-1" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <path d="M6 3.5h7L18 8v12.5H6z" />
      <path d="M13 3.5V8h5" />
      <path d="M9 13h6M9 16.5h4" />
    </svg>
  );
}

function Chip({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-md border border-[var(--border)] bg-[var(--chip-bg)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--muted-strong)]">
      {children}
    </span>
  );
}

export function AssetCard({
  asset,
  topic,
  thumbnailSrc,
  href,
}: {
  asset: AssetCardRef;
  /** The topic this asset is filed under, already resolved to a label. */
  topic?: string;
  /** A poster for a video, or the diagram itself. Already resolved. */
  thumbnailSrc?: string | null;
  /** Where clicking goes. Without one the card is a description, not a link. */
  href?: string;
}) {
  const [thumbFailed, setThumbFailed] = useState(false);

  const family = familyOf(asset.kind);
  const label = assetKindLabel(asset.kind);
  const name = assetDisplayTitle(asset);
  const size = formatBytes(asset.bytes);
  const previewable = family === "video" || family === "diagram";
  const showThumb = previewable && Boolean(thumbnailSrc) && !thumbFailed;

  const nameClass =
    name.source === "title"
      ? "font-medium text-[var(--foreground)]"
      : name.source === "none"
        ? "font-medium text-[var(--muted)]"
        : "font-mono text-[13px] font-medium text-[var(--muted-strong)]";

  const meta = (
    <div className="mt-2 flex flex-wrap items-center gap-1.5">
      <Chip>{label}</Chip>
      {topic && <Chip>{topic}</Chip>}
      {size && <span className="text-[10px] tabular-nums text-[var(--muted)]">{size}</span>}
    </div>
  );

  const body = previewable ? (
    <>
      <div
        className={`flex aspect-video items-center justify-center overflow-hidden border-b border-[var(--border)] ${
          // The diagram's own ground, held constant in both themes; see
          // DiagramView for why an exported drawing is never recoloured.
          showThumb && family === "diagram" ? "bg-[#f7f6f3]" : "bg-[var(--chip-bg)]"
        }`}
      >
        {showThumb ? (
          // eslint-disable-next-line @next/next/no-img-element -- the poster and the diagram are files the app serves as-is, and a vector drawing must not be rasterised.
          <img
            src={thumbnailSrc ?? undefined}
            alt=""
            loading="lazy"
            decoding="async"
            onError={() => setThumbFailed(true)}
            className={`h-full w-full ${family === "diagram" ? "object-contain p-2" : "object-cover"}`}
          />
        ) : (
          <span className="flex flex-col items-center gap-1 text-[var(--muted)]">
            <KindGlyph family={family} className="h-7 w-7" />
            <span className="text-[10px]">
              {thumbFailed
                ? "Preview unavailable"
                : family === "video"
                  ? "No poster"
                  : "No preview"}
            </span>
          </span>
        )}
      </div>
      <div className="p-3">
        <h3 className={`line-clamp-2 break-words text-sm leading-snug ${nameClass}`}>
          {name.text}
        </h3>
        {meta}
      </div>
    </>
  ) : (
    <div className="flex gap-3 p-3">
      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--chip-bg)] text-[var(--muted)]">
        <KindGlyph family={family} className="h-4 w-4" />
      </span>
      <div className="min-w-0">
        <h3 className={`line-clamp-2 break-words text-sm leading-snug ${nameClass}`}>
          {name.text}
        </h3>
        {meta}
      </div>
    </div>
  );

  // `self-start` so a compact row does not stretch to the height of the
  // preview card beside it: the two shapes share a grid and the empty space
  // that stretching leaves is the ugliest thing a mixed grid does.
  const shell =
    "block self-start overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)] shadow-sm transition-colors duration-150";

  if (!href) {
    return <article className={shell}>{body}</article>;
  }

  return (
    <a
      href={href}
      className={`${shell} hover:border-[var(--accent)]/40 hover:bg-[var(--surface-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]`}
    >
      {body}
    </a>
  );
}
