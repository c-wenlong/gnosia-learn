"use client";

import type { MouseEvent, ReactNode } from "react";

import { cx } from "./classes";
import { CollapseChevron } from "./Collapse";
import { Eyebrow } from "./Eyebrow";

/**
 * Kit unit header (Duolingo's unit banner, in our tint): the eyebrow, a 20/700
 * title and a 12px line under it, with the unit's actions at the right. Radius
 * 16, padding 16, on `--tint`; `muted` puts it on `--surface2` instead, which is
 * how the kit draws a locked unit.
 *
 * The actions wrap under the title on a narrow screen rather than squeezing it.
 *
 * With `toggle`, the header opens and shuts the unit under it: a chevron
 * button at the right carries `aria-expanded` for the keyboard and a screen
 * reader, and a click anywhere else on the header does the same, except on
 * the unit's own actions, which keep their meaning.
 */
export function UnitHeader({
  eyebrow,
  title,
  subtitle,
  actions,
  muted = false,
  headingLevel = 2,
  toggle,
  className,
}: {
  eyebrow: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  muted?: boolean;
  headingLevel?: 2 | 3;
  toggle?: {
    open: boolean;
    onToggle: () => void;
    /** The id of the region it opens. */
    controls: string;
    /** What the region is, for the button's name: "Module 2: Understanding Users". */
    label: string;
  };
  className?: string;
}) {
  const Heading = headingLevel === 2 ? "h2" : "h3";
  const onClick = toggle
    ? (event: MouseEvent<HTMLDivElement>) => {
        if ((event.target as HTMLElement).closest("a, button, input, select, textarea")) return;
        toggle.onToggle();
      }
    : undefined;
  return (
    <div
      onClick={onClick}
      className={cx(
        "flex flex-wrap items-center gap-2.5 rounded-2xl p-4",
        muted ? "bg-surface2" : "bg-tint",
        toggle && "cursor-pointer select-none",
        className,
      )}
    >
      <div className="flex min-w-[min(100%,16rem)] flex-1 flex-col gap-[3px]">
        <Eyebrow>{eyebrow}</Eyebrow>
        <Heading className="text-[20px] font-bold leading-tight text-text">{title}</Heading>
        {subtitle !== undefined && <p className="text-[12px] text-text2">{subtitle}</p>}
      </div>
      {(actions !== undefined || toggle) && (
        <div className="flex flex-wrap items-center gap-2.5">
          {actions}
          {toggle && (
            <button
              type="button"
              onClick={toggle.onToggle}
              aria-expanded={toggle.open}
              aria-controls={toggle.controls}
              aria-label={`${toggle.open ? "Collapse" : "Expand"} ${toggle.label}`}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-text2 transition-colors duration-100 hover:bg-surface2 hover:text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              <CollapseChevron open={toggle.open} />
            </button>
          )}
        </div>
      )}
    </div>
  );
}
