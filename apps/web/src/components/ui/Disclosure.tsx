"use client";

import { useId, useState, type ReactNode } from "react";

import { Collapse } from "./Collapse";

/**
 * Kit `Disclosure`: a toggle and the region it folds open and shut, wired
 * together: the button's `aria-expanded` and `aria-controls`, and a
 * `Collapse` with the id it names, so a reader hears what the toggle does and
 * where the content went.
 *
 * Open is held here unless the caller holds it (`open` with `onOpenChange`),
 * as a fold that opens by itself on a failure, or that scrolls into view once
 * open, does. `summary` is the toggle's content, or a function of whether the
 * fold is open for one that changes its words ("Show", "Hide") or turns a
 * `CollapseChevron`. `className` styles the toggle and `regionClassName` the
 * fold's inner box, which takes no padding (see `Collapse`).
 *
 * Renders the button and the fold side by side, with no wrapper, so the
 * caller's own frame (a section, a list's foot) stays as it was.
 */
export function Disclosure({
  summary,
  open: held,
  defaultOpen = false,
  onOpenChange,
  className,
  regionClassName,
  children,
}: {
  summary: ReactNode | ((open: boolean) => ReactNode);
  /** Open, when the caller holds it; with `onOpenChange`. */
  open?: boolean;
  /** Open on the first render, when this holds it. */
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** The toggle's classes. */
  className?: string;
  /** The fold's inner box: layout, never padding. */
  regionClassName?: string;
  children: ReactNode;
}) {
  const [own, setOwn] = useState(defaultOpen);
  const open = held ?? own;
  const region = useId();
  return (
    <>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={region}
        onClick={() => {
          if (held === undefined) setOwn(!open);
          onOpenChange?.(!open);
        }}
        className={className}
      >
        {typeof summary === "function" ? summary(open) : summary}
      </button>
      <Collapse open={open} id={region} className={regionClassName}>
        {children}
      </Collapse>
    </>
  );
}
