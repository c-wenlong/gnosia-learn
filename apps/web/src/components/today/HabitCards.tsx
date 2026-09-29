import Link from "next/link";

import { Card } from "@/components/ui/Card";
import { StreakDay } from "@/components/ui/StreakDay";
import { TargetBar } from "@/components/ui/TargetBar";
import { cx } from "@/components/ui/classes";
import type { Habit } from "@/lib/habit-core";
import { describeTarget } from "@/lib/preferences";
import { leewayLine, streakStrip, targetRows } from "@/lib/today-core";

/**
 * The habit layer on Today (hi-fi 01, right column; 13, the two stat cards):
 * the target the learner set and how much of it is met, and the forgiving
 * streak with this week's discs. Facts only (DESIGN.md decision 5): nothing
 * here says "don't lose it".
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

export function StreakCard({ habit, today }: { habit: Habit; today: string }) {
  const { streak, reachable } = habit;
  return (
    <Card title="Streak">
      <div className="flex items-center gap-3">
        <span className="font-display text-[36px] leading-none font-bold text-streak tabular-nums">{streak.days}</span>
        <div className="flex flex-col gap-0.5">
          <span className="text-[15px] font-semibold text-text">day streak</span>
          <span className="text-[12px] text-text2">{leewayLine(habit)}</span>
        </div>
      </div>
      <ol aria-label="This week" className="flex flex-wrap gap-3">
        {streakStrip(streak.week, today).map((disc) => (
          <li key={disc.date}>
            <StreakDay letter={disc.letter} state={disc.state} isToday={disc.isToday} description={disc.description} />
          </li>
        ))}
      </ol>
      <p className="text-[12px] text-text3">
        {!reachable
          ? "The streak could not be read."
          : streak.activeToday
            ? "Studied today."
            : "Nothing recorded yet today."}
      </p>
    </Card>
  );
}

/** The phone's two small cards in place of the target and streak cards. */
export function PhoneHabitStats({ habit }: { habit: Habit }) {
  const { streak, target } = habit;
  const left =
    streak.leeway === 0 ? "Streak" : `Streak · ${streak.leewayLeft} ${streak.leewayLeft === 1 ? "miss" : "misses"} left`;
  return (
    <div className="grid grid-cols-2 gap-2.5">
      <Card tight>
        <div className="flex flex-col gap-0.5">
          <span className="font-display text-[24px] leading-tight font-bold text-text tabular-nums">
            {target.done} / {target.total}
          </span>
          <span className="text-[12px] text-text2">Target</span>
        </div>
      </Card>
      <Card tight>
        <div className="flex flex-col gap-0.5">
          <span className="font-display text-[24px] leading-tight font-bold text-streak tabular-nums">{streak.days}</span>
          <span className="text-[12px] text-text2">{left}</span>
        </div>
      </Card>
    </div>
  );
}
