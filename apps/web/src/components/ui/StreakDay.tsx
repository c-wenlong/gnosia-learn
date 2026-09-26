import type { StreakDayState } from "@/lib/habit-core";

import { cx } from "./classes";

/**
 * Kit `StreakDay`, after Duolingo's streak week: a day letter over a 34px
 * disc. Done is a `--streak` disc with a check; today, with nothing done yet,
 * is a `--streak` ring around a dot; a missed or future day is a plain
 * `--border` disc. A miss the weekly leeway covered, which the kit does not
 * draw, is a dashed `--streak` ring: kept, but not earned.
 *
 * The letter is `--streak` on today and `--text3` otherwise. `description` is
 * what a screen reader hears in place of the drawing ("Monday, studied");
 * `streakStrip` in `@/lib/today-core` writes it.
 */
export function StreakDay({
  letter,
  state,
  isToday = false,
  description,
  className,
}: {
  letter: string;
  state: StreakDayState;
  isToday?: boolean;
  description: string;
  className?: string;
}) {
  return (
    <span className={cx("flex flex-col items-center gap-1.5", className)}>
      <span aria-hidden className={cx("text-[11px] font-bold leading-4", isToday ? "text-streak" : "text-text3")}>
        {letter}
      </span>
      <span
        aria-hidden
        className={cx(
          "flex size-[34px] shrink-0 items-center justify-center rounded-full",
          state === "done" && "bg-streak text-white",
          state === "today" && "border-2 border-streak",
          state === "forgiven" && "border-2 border-dashed border-streak",
          (state === "missed" || state === "future") && "bg-border",
        )}
      >
        {state === "done" && (
          <svg viewBox="0 0 16 16" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3.5 8.5l3 3 6-7" />
          </svg>
        )}
        {state === "today" && <span className="size-2.5 rounded-full bg-streak" />}
      </span>
      <span className="sr-only">{description}</span>
    </span>
  );
}
