import type { ReactNode } from "react";

import { cx } from "./classes";

/** Kit `Eyebrow`: 11px, 700, uppercase, tracked, tertiary text. A section label, not a badge. */
export function Eyebrow({
  as: Tag = "p",
  className,
  children,
}: {
  as?: "p" | "span" | "h2" | "h3" | "div";
  className?: string;
  children: ReactNode;
}) {
  return (
    <Tag className={cx("text-[11px] font-bold uppercase leading-4 tracking-[0.05em] text-text3", className)}>
      {children}
    </Tag>
  );
}
