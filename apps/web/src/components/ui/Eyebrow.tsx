import type { ReactNode } from "react";

import { cx, LABEL } from "./classes";

/**
 * A section label, not a badge: 12/600 in `--text2`, sentence case, no
 * letter-spacing (`LABEL` in `./classes`). It was 11/700 uppercase and tracked
 * until 2026-09-29. Use it only for a label that says something the heading
 * under it does not, such as a place ("CS4263 · Module 1 · Informed search"),
 * a number or a status. A label that repeats the heading, or names what the
 * layout already shows, is left out instead.
 */
export function Eyebrow({
  as: Tag = "p",
  className,
  children,
}: {
  as?: "p" | "span" | "h2" | "h3" | "h4" | "div";
  className?: string;
  children: ReactNode;
}) {
  return <Tag className={cx(LABEL, className)}>{children}</Tag>;
}
