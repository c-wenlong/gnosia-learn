"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { GnosiaWordmark } from "@/components/brand";
import { Pill } from "@/components/ui/Pill";
import { cx } from "@/components/ui/classes";
import { habitLabels, type Habit } from "@/lib/habit-core";
import { activeDestination, DESTINATIONS } from "@/lib/nav";

import { AvatarMenu } from "./AvatarMenu";
import { useHabitRefresh } from "./use-habit-refresh";

/**
 * Kit `TopBar`: 64px on `--surface` with a hairline under it. The wordmark in
 * the display face, the five destinations (the selected one in the text colour
 * over a 2px underline), and at the right the streak pill, the target pill and
 * the avatar menu.
 *
 * Below 768px it is the phone header (kit `Phone`): 56px, the wordmark, a
 * number-only streak pill and the avatar. The destinations move to `TabBar`.
 * Between 768 and 1024 the pills shorten so the five destinations still fit.
 * On a `data-layout="focus"` page it is hidden from 768px up: focus mode
 * draws its own step bar and exit instead.
 *
 * A client component for `usePathname` and for `useHabitRefresh`. The habit
 * numbers arrive as props from the root layout, which is the server component
 * that can read them; the hook asks the layout again once they are old.
 */
export function TopBar({ habit, studio }: { habit: Habit; studio: boolean }) {
  const active = activeDestination(usePathname());
  const labels = habitLabels(habit);
  useHabitRefresh(habit.asOf);

  return (
    <header className="sticky top-0 z-30 border-b border-hair bg-surface pt-[env(safe-area-inset-top)] group-has-[[data-layout=full]]/shell:static md:group-has-[[data-layout=focus]]/shell:hidden">
      <div className="flex h-14 items-center gap-4 px-4 md:h-16 md:gap-8 md:px-7">
        <Link
          href="/today"
          aria-label="Gnosia, Today"
          className="shrink-0 rounded-sm text-[14px] text-text focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent md:text-[15px]"
        >
          <GnosiaWordmark />
        </Link>

        <nav aria-label="Primary" className="hidden h-full md:block">
          <ul className="flex h-full gap-7">
            {DESTINATIONS.map((d) => {
              const on = d.key === active;
              return (
                <li key={d.key} className="h-full">
                  <Link
                    href={d.href}
                    aria-current={on ? "page" : undefined}
                    className={cx(
                      "group/nav flex h-full flex-col items-center justify-center gap-2 text-[15px] transition-colors duration-100",
                      "focus-visible:outline-none",
                      on ? "font-semibold text-text" : "font-medium text-text2 hover:text-text",
                    )}
                  >
                    <span className="rounded-sm leading-5 group-focus-visible/nav:outline-2 group-focus-visible/nav:outline-offset-4 group-focus-visible/nav:outline-accent">
                      {d.label}
                    </span>
                    <span aria-hidden className={cx("h-0.5 w-7 rounded-full", on ? "bg-text" : "bg-transparent")} />
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="ml-auto flex items-center gap-2 md:gap-4 lg:gap-8">
          {/* Visibility is on wrappers: a class that hides the pill itself
              would compete with the pill's own display utility. */}
          <span className="flex lg:hidden">
            <Pill dot="var(--streak)" title={labels.streakTitle}>
              <span className="sr-only">Streak: </span>
              {labels.streakShort}
            </Pill>
          </span>
          <span className="hidden lg:flex">
            <Pill dot="var(--streak)" title={labels.streakTitle}>
              {labels.streak}
            </Pill>
          </span>
          <span className="hidden md:flex">
            <Pill dot="var(--accent)" title={labels.targetTitle}>
              {labels.target}
            </Pill>
          </span>
          <AvatarMenu studio={studio} />
        </div>
      </div>
    </header>
  );
}
