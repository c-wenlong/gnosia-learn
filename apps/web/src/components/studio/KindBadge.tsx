import { cx } from "@/components/ui/classes";

/**
 * "Video" or "Diagram" over a tile's thumbnail, top left (D85 of
 * docs/STUDIO-CHAT-FIRST.md), the way Gauth's story cards say which ones
 * play. A video's is translucent black over its poster, which sits on a
 * black mat in every palette; a diagram's is a quiet token fill, since its
 * mat is the light one. `inline` is the list row's, beside a thumbnail too
 * small to carry one.
 *
 * Drawn after a tile's job loader, as a sibling of its link rather than
 * inside the thumbnail, so a change being drawn or rendered over an existing
 * tile does not cover it; positioned against the tile, whose top left is the
 * thumbnail's.
 *
 * Hidden from a screen reader, since it sits outside the tile's link: the
 * link says the kind itself (`KindWord`), so a list of links still tells
 * the diagrams from the videos.
 */
export function KindBadge({ kind, inline = false }: { kind: "diagram" | "video"; inline?: boolean }) {
  // A list row on a phone has no room for it beside the name; the
  // thumbnail's mat (black or light) still tells the two apart there.
  return (
    <span
      aria-hidden
      data-kind-badge={kind}
      className={cx(
        "pointer-events-none shrink-0 items-center rounded-lg font-semibold",
        inline ? "hidden h-5 px-1.5 text-xs sm:inline-flex" : "absolute top-2 left-2 inline-flex h-6 px-2 text-xs",
        kind === "video"
          ? // Off the poster, on the page's own ground, it needs more ink to keep its white text legible.
            inline
            ? "bg-black/75 text-white"
            : "bg-black/45 text-white backdrop-blur-sm"
          : "border border-border bg-surface2 text-text2",
      )}
    >
      {kind === "video" ? "Video" : "Diagram"}
    </span>
  );
}

/** The kind, first in a tile's or a row's link, for a screen reader only: "Diagram: The dot product". */
export function KindWord({ kind }: { kind: "diagram" | "video" }) {
  return <span className="sr-only">{kind === "video" ? "Video: " : "Diagram: "}</span>;
}
