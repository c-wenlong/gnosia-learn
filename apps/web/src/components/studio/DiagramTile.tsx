import Link from "next/link";

import { ExtendLink } from "@/components/studio/ExtendLink";
import { Chip } from "@/components/studio/StudioChrome";
import {
  canvasHref,
  displayTitle,
  formatBytes,
  relativeTime,
  thumbnailHref,
  type Diagram,
} from "@/lib/studio-view";

/**
 * One diagram in the grid, or one row in the list.
 *
 * The thumbnail is 4:3 and contained, never cropped, which is D22 and is the
 * one place this design refuses Figma's 16:9. The two real exports measure
 * 1367x1167 and 1537x1236 — near 7:6 — so a 16:9 crop takes a piece of the
 * drawing off, and the drawing is the only thing the eye is scanning for. The
 * library's own `AssetCard` ships a 16:9 tile; that is its call for a gallery
 * of videos and diagrams together, and this screen is diagrams only.
 *
 * `next/link` rather than a plain anchor, deliberately. `/library`'s cards are
 * anchors, so moving between assets there is a full page load; the studio is a
 * screen a person moves around in, and reloading the shell to select a card
 * would throw away the scroll position of the grid they are scanning.
 *
 * A card with no topic is not decorated, it is warned about: `diagrams.ts`
 * refuses such a file *by name*, so it will never appear in `/library` at all,
 * and this tile is the only place it is ever visible.
 */
export function DiagramTile({
  diagram,
  selectHref,
  extendHref,
  selected,
  showConcepts,
}: {
  diagram: Diagram;
  selectHref: string;
  /** Where Extend goes: this view with a conversation opening on the diagram. */
  extendHref: string;
  selected: boolean;
  showConcepts: boolean;
}) {
  const untopiced = diagram.topic === null;
  return (
    <div
      className={`group relative flex flex-col overflow-hidden rounded-xl border bg-[var(--surface)] transition-colors ${
        untopiced ? "border-[var(--warn-border)]" : "border-[var(--border)]"
      } ${selected ? "ring-2 ring-[var(--accent)]" : "hover:bg-[var(--surface-hover)]"}`}
    >
      <Link href={selectHref} scroll={false} className="flex min-w-0 flex-col">
        <Thumbnail diagram={diagram} />
        <div className="flex min-w-0 flex-col gap-1.5 p-3">
          <span className="truncate text-sm font-medium" title={displayTitle(diagram)}>
            {displayTitle(diagram)}
          </span>
          <div className="flex min-w-0 flex-wrap items-center gap-1.5">
            {untopiced ? (
              <Chip tone="warn">No topic</Chip>
            ) : (
              <Chip title={diagram.topic ?? undefined}>{diagram.topic}</Chip>
            )}
            <span className="text-xs text-[var(--muted)]">
              {relativeTime(diagram.tldr.modified)}
            </span>
          </div>
          {showConcepts && diagram.concepts.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {diagram.concepts.map((slug) => (
                <Chip key={slug}>{slug}</Chip>
              ))}
            </div>
          )}
          {untopiced && (
            <p className="text-xs text-[var(--warn-text)]">
              The indexer refuses a diagram with no topic by name, so this one is in no catalog.
              Set one from the panel.
            </p>
          )}
        </div>
      </Link>
      {/* Selecting opens the tile's panel; the two controls here go straight
          to the canvas, or to a conversation about extending the diagram.
          Separate targets, because a grid where one click does everything has
          no way to browse. Shown on hover, and on keyboard focus anywhere in
          the tile, so Tab reaches them, and while Extend is opening; invisible
          controls take no clicks. */}
      <div className="pointer-events-none absolute right-2 top-2 flex gap-1.5 opacity-0 transition-opacity duration-100 group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100 has-[[data-pending]]:pointer-events-auto has-[[data-pending]]:opacity-100 motion-reduce:transition-none">
        <Link href={canvasHref(diagram.name)} className={HOVER_CONTROL}>
          Open <span className="sr-only">{displayTitle(diagram)} on the </span>canvas
        </Link>
        <ExtendLink href={extendHref} className={HOVER_CONTROL} diagram={displayTitle(diagram)} />
      </div>
    </div>
  );
}

const HOVER_CONTROL =
  "flex h-8 items-center rounded-md border border-[var(--border)] bg-[var(--surface-raised)] px-2 text-xs font-medium text-[var(--foreground)] shadow-sm hover:bg-[var(--surface-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]";

/**
 * The exported SVG, or what to do about there not being one.
 *
 * Lazy: the two committed SVGs are 200kB and 300kB each, so a directory of
 * thirty would be several megabytes of thumbnails a person may never scroll to.
 * The light mat is the same constant `DiagramView` uses — a diagram drawn on
 * white stays legible on it in both themes, and `filter: invert()` would
 * recolour the drawing rather than the page.
 */
function Thumbnail({ diagram }: { diagram: Diagram }) {
  const badges = [
    diagram.topic === null ? { key: "topic", label: "No topic" } : null,
    diagram.svgState === "stale" ? { key: "svg", label: "SVG stale" } : null,
  ].filter((badge) => badge !== null);

  return (
    <div className="relative flex aspect-[4/3] items-center justify-center overflow-hidden border-b border-[var(--border)] bg-[#f7f6f3]">
      {diagram.svg.exists ? (
        /* The runner streams a file from outside the app's tree, so there is
           nothing for the image optimiser to resolve, and an SVG is not a format
           it would resize anyway. */
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={thumbnailHref(diagram.name)}
          alt={displayTitle(diagram)}
          loading="lazy"
          decoding="async"
          className="h-full w-full object-contain p-2"
        />
      ) : (
        <div className="flex flex-col items-center gap-1 text-center text-[var(--muted)]">
          <span className="text-xs font-medium">not exported</span>
          <span className="text-xs">{diagram.shapes} shapes</span>
        </div>
      )}
      {badges.length > 0 && (
        <div className="absolute right-2 top-2 flex flex-col items-end gap-1">
          {badges.map((badge) => (
            <Chip key={badge.key} tone="warn">
              {badge.label}
            </Chip>
          ))}
        </div>
      )}
    </div>
  );
}

/** The 32px list row. Same ratio on a 48px thumbnail, per D22's one-ratio rule. */
export function DiagramRow({
  diagram,
  selectHref,
  selected,
  showConcepts,
}: {
  diagram: Diagram;
  selectHref: string;
  selected: boolean;
  showConcepts: boolean;
}) {
  return (
    <Link
      href={selectHref}
      scroll={false}
      className={`flex h-8 min-w-0 items-center gap-2 rounded-md px-2 text-xs transition-colors ${
        selected ? "bg-[var(--nav-active-bg)]" : "hover:bg-[var(--surface-hover)]"
      }`}
    >
      <span className="flex h-6 w-12 shrink-0 items-center justify-center overflow-hidden rounded border border-[var(--border)] bg-[#f7f6f3]">
        {diagram.svg.exists && (
          // eslint-disable-next-line @next/next/no-img-element -- see Thumbnail.
          <img
            src={thumbnailHref(diagram.name)}
            alt=""
            loading="lazy"
            className="h-full w-full object-contain"
          />
        )}
      </span>
      <span className="min-w-0 flex-1 truncate font-medium">{displayTitle(diagram)}</span>
      {diagram.topic === null ? (
        <Chip tone="warn">No topic</Chip>
      ) : (
        <span className="hidden shrink-0 text-[var(--muted)] sm:inline">{diagram.topic}</span>
      )}
      {showConcepts && (
        <span className="hidden shrink-0 text-[var(--muted)] lg:inline">
          {diagram.concepts.join(", ")}
        </span>
      )}
      <span className="w-20 shrink-0 text-right text-[var(--muted)]">
        {formatBytes(diagram.svg.bytes) ?? `${diagram.shapes} shapes`}
      </span>
      <span className="w-24 shrink-0 text-right text-[var(--muted)]">
        {relativeTime(diagram.tldr.modified)}
      </span>
    </Link>
  );
}
