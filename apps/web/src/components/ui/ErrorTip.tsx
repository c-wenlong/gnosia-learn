import type { ReactNode } from "react";

import { cx } from "./classes";

/**
 * Kit `ErrorTip`: a refusal floating by the button that caused it, for a
 * button with no room for a line beside it (a grid tile's action, a strip's
 * Cancel). Seen as well as heard: a `title` tooltip is out of reach on a
 * phone, so the words are a small surface card with `role="alert"`.
 *
 * The caller wraps the button in a `relative` box; the tip hangs off that
 * box's right edge, `below` it (the default) or `above` it, at most 176px
 * wide, so a 200px tile does not clip it.
 */
export function ErrorTip({
  children,
  place = "below",
  className,
}: {
  children: ReactNode;
  place?: "below" | "above";
  className?: string;
}) {
  return (
    <span
      role="alert"
      className={cx(
        "absolute right-0 z-20 w-max max-w-44 rounded-md border border-border bg-surface px-2 py-1.5 text-left text-xs leading-4 font-normal text-danger shadow-sm",
        place === "below" ? "top-full mt-1" : "bottom-full mb-1",
        className,
      )}
    >
      {children}
    </span>
  );
}
