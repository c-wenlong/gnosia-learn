import type { ReactNode } from "react";

import { cx } from "./classes";
import { Glyph } from "./Glyph";

/**
 * A region that glides open and shut.
 *
 * The height animates through the grid-rows trick: a one-row grid moving
 * between `0fr` and `1fr` transitions to and from the content's natural
 * height, which `height: auto` cannot, and needs no measuring in script. The
 * content fades with it. A person who asked for less motion gets it snapping
 * instead (`motion-reduce`).
 *
 * Closed content stays mounted, so its state survives (a half-typed note, a
 * scroll position), and is made `inert`: nobody can tab into a region they
 * cannot see, and a screen reader skips it, as it would `hidden`.
 *
 * The inner box clips with `overflow: clip` and a 4px `overflow-clip-margin`
 * rather than `overflow: hidden`, so a focus ring on a control at the edge
 * (2px wide, 2px out) is drawn whole instead of cut off, and so the box is
 * not a scroll container: focusing a field inside while it opens cannot
 * scroll the content up inside its own frame. A browser without
 * `overflow-clip-margin` clips at the edge, as before.
 *
 * **The inner box is `relative`, and must stay so.** A box clips only the
 * positioned descendants whose containing block is the box itself or inside
 * it. Without it, an `sr-only` line (which is `position: absolute`) inside a
 * shut fold took its containing block from far up the page, escaped the
 * clip at its static position, and made the document taller than the shell:
 * the sticky sidebar then stopped short and a blank strip showed under it.
 *
 * **No padding on `className`.** The inner box cannot be shorter than its own
 * padding, so a fold with `pt-4` there keeps 16px open while it is shut. The
 * space a fold carries (the gap above it, say) goes on its content instead,
 * which folds away with it; `collapse-padding.test.ts` holds that.
 */
export function Collapse({
  open,
  id,
  className,
  children,
}: {
  open: boolean;
  /** For the toggle's `aria-controls`. */
  id?: string;
  /** Classes for the inner box, which is what holds the content's layout. Never padding: see above. */
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      id={id}
      inert={!open}
      className={cx(
        "grid transition-[grid-template-rows,opacity] duration-300 ease-soft motion-reduce:transition-none",
        open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
      )}
    >
      <div className={cx("relative min-h-0 overflow-clip [overflow-clip-margin:4px]", className)}>{children}</div>
    </div>
  );
}

/** The chevron a toggle for a `Collapse` carries: down when shut, up when open. */
export function CollapseChevron({ open, className }: { open: boolean; className?: string }) {
  return (
    <Glyph
      name="chevron"
      className={cx(
        "h-5 w-5 transition-transform duration-300 ease-soft motion-reduce:transition-none",
        open && "rotate-180",
        className,
      )}
    />
  );
}
