import type { ReactNode } from "react";

import { cx } from "./classes";

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
  /** Classes for the inner box, which is what holds the content's layout. */
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      id={id}
      inert={!open}
      className={cx(
        "grid transition-[grid-template-rows,opacity] duration-300 ease-[cubic-bezier(0.2,0,0,1)] motion-reduce:transition-none",
        open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
      )}
    >
      <div className={cx("min-h-0 overflow-hidden", className)}>{children}</div>
    </div>
  );
}

/** The chevron a toggle for a `Collapse` carries: down when shut, up when open. */
export function CollapseChevron({ open, className }: { open: boolean; className?: string }) {
  return (
    <svg
      viewBox="0 0 20 20"
      className={cx(
        "h-5 w-5 transition-transform duration-300 ease-[cubic-bezier(0.2,0,0,1)] motion-reduce:transition-none",
        open && "rotate-180",
        className,
      )}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="m5 7.5 5 5 5-5" />
    </svg>
  );
}
