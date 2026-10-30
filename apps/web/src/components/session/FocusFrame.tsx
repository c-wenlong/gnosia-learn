import type { ReactNode, RefObject } from "react";

import { cx, TRACK } from "@/components/ui/classes";
import { TextLink } from "@/components/ui/TextLink";

/**
 * Focus mode's frame, for the session page and Review: the progress bar, the
 * label and exit row, and the 720px column. The column is keyed on
 * `stepKey`, so each step mounts afresh and rises in; the bar above it
 * stays, and its fill slides to the new width.
 */
export function FocusFrame({
  percent,
  label,
  short,
  exit,
  progressLabel,
  stepKey,
  columnRef,
  children,
}: {
  percent: number;
  label: string;
  /** The label on a phone; `label` when absent. */
  short?: string;
  /** Where Exit goes, and what it says from 768px up ("Exit" on a phone). */
  exit: { href: string; label: string };
  /** The progress bar's accessible name. */
  progressLabel: string;
  stepKey: number | string;
  columnRef: RefObject<HTMLDivElement | null>;
  children: ReactNode;
}) {
  const value = Math.max(0, Math.min(100, percent));
  return (
    // On a phone the column fills what the shell's header and store banner
    // leave, less the page's bottom padding (the page's root is a flex column
    // there, `AppShell`), so the actions sit at the bottom where a thumb is
    // (hi-fi 14 and 15).
    <div className="flex flex-1 flex-col">
      <div
        className={cx("h-2 w-full md:h-3", TRACK)}
        role="progressbar"
        aria-label={progressLabel}
        aria-valuenow={Math.round(value)}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className="h-full rounded-r-[4px] bg-accent transition-[width] duration-300 ease-soft motion-reduce:transition-none md:rounded-r-md"
          style={{ width: `${value}%` }}
        />
      </div>
      <div className="flex items-center justify-between gap-4 px-3.5 py-2 text-[12px] font-medium text-text2 md:px-6 md:py-3">
        <p className="min-w-0 truncate">
          <span className="md:hidden">{short ?? label}</span>
          <span className="hidden md:inline">{label}</span>
        </p>
        <TextLink href={exit.href} tone="muted" className="shrink-0">
          <span className="md:hidden">Exit</span>
          <span className="hidden md:inline">{exit.label}</span>
        </TextLink>
      </div>
      <div
        key={stepKey}
        ref={columnRef}
        data-step={stepKey}
        className={cx(
          "mx-auto flex w-full max-w-[720px] flex-1 animate-enter flex-col gap-3 px-3.5 pt-1 pb-3.5 motion-reduce:animate-none",
          "md:flex-none md:gap-[22px] md:px-0 md:pt-0 md:pb-10",
        )}
      >
        {children}
      </div>
    </div>
  );
}
