import type { ReactNode } from "react";

import { cx } from "./classes";

/**
 * Kit `Pill`: the stat pills in the top bar ("14 day streak", "Target 1 / 2").
 * 36px, 2px border, a 10px dot in the stat's colour before the label.
 * `dot` is any CSS colour, normally a token such as `var(--streak)`.
 */
export function Pill({
  dot,
  title,
  className,
  children,
}: {
  dot?: string;
  title?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      title={title}
      className={cx(
        "inline-flex h-9 shrink-0 items-center gap-2 whitespace-nowrap rounded-full border-2 border-border bg-surface px-3.5 text-[13px] font-semibold text-text tabular-nums",
        className,
      )}
    >
      {dot !== undefined && <span aria-hidden className="size-2.5 shrink-0 rounded-full" style={{ background: dot }} />}
      {children}
    </span>
  );
}
