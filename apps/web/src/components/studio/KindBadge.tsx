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
 */
export function KindBadge({ kind, inline = false }: { kind: "diagram" | "video"; inline?: boolean }) {
  // A list row on a phone has no room for it beside the name; the
  // thumbnail's mat (black or light) still tells the two apart there.
  return (
    <span
      data-kind-badge={kind}
      className={cx(
        "pointer-events-none shrink-0 items-center rounded-lg font-semibold",
        inline ? "hidden h-5 px-1.5 text-[11px] sm:inline-flex" : "absolute top-2 left-2 inline-flex h-6 px-2 text-xs",
        kind === "video"
          ? // Off the poster, on the page's own ground, it needs more ink to keep its white text legible.
            inline
            ? "bg-black/75 text-white"
            : "bg-black/45 text-white backdrop-blur-sm"
          : "border border-[var(--border)] bg-[var(--surface2)] text-[var(--text2)]",
      )}
    >
      {kind === "video" ? "Video" : "Diagram"}
    </span>
  );
}

/**
 * A tile's lift: a few pixels up and a deeper shadow under the pointer or
 * keyboard focus, as Gauth's story card does, still under reduced motion.
 * Tailwind's translate and shadow, so a selected tile's ring (also a
 * box-shadow) composes with it rather than being replaced.
 */
export const TILE_LIFT =
  "transition-[translate,box-shadow,background-color] duration-200 ease-out hover:-translate-y-[3px] hover:shadow-[0_16px_32px_-18px_rgb(0_0_0/0.35)] focus-within:-translate-y-[3px] focus-within:shadow-[0_16px_32px_-18px_rgb(0_0_0/0.35)] motion-reduce:transition-none motion-reduce:hover:translate-y-0 motion-reduce:focus-within:translate-y-0";
