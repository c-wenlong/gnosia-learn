import Link from "next/link";

import { Card } from "@/components/ui/Card";
import { TargetBar } from "@/components/ui/TargetBar";
import { cx } from "@/components/ui/classes";
import type { Habit } from "@/lib/habit-core";
import { describeTarget } from "@/lib/preferences";
import { targetRows } from "@/lib/today-core";

/**
 * The habit layer on Today (hi-fi 01, right column; 13, the stat card): the
 * target the learner set and how much of it is met. Facts only (DESIGN.md
 * decision 5): nothing here says "don't lose it".
 *
 * The streak has no card here. The top bar's pill already says "2 day
 * streak", with the free misses and today's fact in its tooltip, so a card
 * saying it again was dropped on the owner's call (2026-09-29).
 */

export function TargetCard({ habit }: { habit: Habit }) {
  const { target } = habit;
  const rows = targetRows(habit);
  return (
    <Card aria-label="Today's target">
      <div className="flex flex-col gap-1">
        <h2 className="text-[16px] leading-snug font-bold text-text">Today&rsquo;s target</h2>
        <p className="text-[13px] text-text2">{describeTarget(target.target)}</p>
        <p className="text-[12px] text-accent-text">
          Set by you ·{" "}
          <Link
            href="/settings"
            className="rounded-sm underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            edit
          </Link>
        </p>
      </div>
      <TargetBar done={target.done} total={target.total} />
      {rows.length > 0 && (
        <ul className="flex flex-col gap-2">
          {rows.map((row) => (
            <li key={row.id} className="flex items-center gap-2.5">
              <span
                aria-hidden
                className={cx(
                  "size-2.5 shrink-0 rounded-full",
                  row.done ? "bg-ok" : "border-2 border-m-lo bg-surface",
                )}
              />
              <span className="min-w-0 flex-1 text-[13px] text-text">{row.label}</span>
              <span className="shrink-0 text-[12px] text-text3">{row.status}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/** The phone's small card in place of the target card; the streak is the top bar's pill. */
export function PhoneTargetStat({ habit }: { habit: Habit }) {
  const { target } = habit;
  return (
    // One row now that the streak card beside it is gone: a card as tall as
    // the pair was would be mostly empty.
    <Card tight>
      <div className="flex items-baseline gap-2">
        <span className="font-display text-[24px] leading-tight font-bold text-text tabular-nums">
          {target.done} / {target.total}
        </span>
        <span className="text-[13px] text-text2">Today&rsquo;s target</span>
      </div>
    </Card>
  );
}
