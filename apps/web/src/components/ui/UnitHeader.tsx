import type { ReactNode } from "react";

import { cx } from "./classes";
import { Eyebrow } from "./Eyebrow";

/**
 * Kit unit header (Duolingo's unit banner, in our tint): the eyebrow, a 20/700
 * title and a 12px line under it, with the unit's actions at the right. Radius
 * 16, padding 16, on `--tint`; `muted` puts it on `--surface2` instead, which is
 * how the kit draws a locked unit.
 *
 * The actions wrap under the title on a narrow screen rather than squeezing it.
 */
export function UnitHeader({
  eyebrow,
  title,
  subtitle,
  actions,
  muted = false,
  headingLevel = 2,
  className,
}: {
  eyebrow: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  muted?: boolean;
  headingLevel?: 2 | 3;
  className?: string;
}) {
  const Heading = headingLevel === 2 ? "h2" : "h3";
  return (
    <div
      className={cx(
        "flex flex-wrap items-center gap-2.5 rounded-2xl p-4",
        muted ? "bg-surface2" : "bg-tint",
        className,
      )}
    >
      <div className="flex min-w-[min(100%,16rem)] flex-1 flex-col gap-[3px]">
        <Eyebrow>{eyebrow}</Eyebrow>
        <Heading className="text-[20px] font-bold leading-tight text-text">{title}</Heading>
        {subtitle !== undefined && <p className="text-[12px] text-text2">{subtitle}</p>}
      </div>
      {actions !== undefined && <div className="flex flex-wrap items-center gap-2.5">{actions}</div>}
    </div>
  );
}
