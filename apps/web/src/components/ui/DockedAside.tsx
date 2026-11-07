import type { ReactNode } from "react";

import { cx } from "./classes";

/**
 * Kit `DockedAside`: a main column with a side column docked beside it when
 * the page has the room, and stacked under it when it does not.
 *
 * Sized by the width the page actually has (a container query), not the
 * viewport's: the sidebar takes 60 or 260px of the window, so a viewport
 * breakpoint docked the side column beside a main one with no room left.
 *
 * `aside` picks the side column's width:
 * - "wide" for the Learn table's graph, 320 to 380px, so the graph keeps
 *   room for its labels;
 * - "narrow" for a domain map's list, a fixed 300px, so the picture keeps
 *   the rest.
 * Each is a literal class string, because Tailwind only generates the classes
 * it can read in the source.
 */
const COLUMNS = {
  wide: "gap-5 @4xl:grid-cols-[minmax(0,1fr)_minmax(320px,380px)]",
  narrow: "gap-4 @4xl:grid-cols-[minmax(0,1fr)_300px]",
} as const;

export function DockedAside({
  aside,
  className,
  children,
}: {
  aside: keyof typeof COLUMNS;
  /** Classes for the outer container, e.g. a fade-in. */
  className?: string;
  /** The main column first, then the side column. */
  children: ReactNode;
}) {
  return (
    <div className={cx("@container", className)}>
      <div
        data-docked-aside={aside}
        className={cx("grid grid-cols-1 items-start", COLUMNS[aside])}
      >
        {children}
      </div>
    </div>
  );
}
