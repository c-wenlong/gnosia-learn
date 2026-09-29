import type { ReactNode } from "react";

import { cx, PILL } from "./classes";

/**
 * Kit `Pill`: a stat in a pill ("14 day streak", "Target 1 / 2"). 36px, 2px
 * border, a 10px dot in the stat's colour before the label. `dot` is any CSS
 * colour, normally a token such as `var(--streak)`. A static label; the top
 * bar's pills, which open their facts on a tap, are `HabitPill` in
 * `components/shell`, on the same face (`PILL`).
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
    <span title={title} className={cx(PILL, className)}>
      {dot !== undefined && <span aria-hidden className="size-2.5 shrink-0 rounded-full" style={{ background: dot }} />}
      {children}
    </span>
  );
}
