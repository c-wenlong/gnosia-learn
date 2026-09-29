import type { Metadata } from "next";

import { ActivityCard } from "@/components/today/ActivityCard";
import { CoursesCard } from "@/components/today/CoursesCard";
import { PhoneTargetStat, TargetCard } from "@/components/today/HabitCards";
import { NextUpCard } from "@/components/today/NextUpCard";
import { ReviewsCard } from "@/components/today/ReviewsCard";
import { loadToday } from "@/lib/today";

export const metadata: Metadata = { title: "Today" };

/**
 * Today (hi-fi 01 on a desktop, 13 on a phone; DESIGN.md decision 9): what
 * to do now. Left, the next concept on the path, the reviews due and what
 * happened lately; right, the target, the streak and the courses under way.
 *
 * A server component over one read (`loadToday`). A database that cannot be
 * reached renders every card's empty state and the shell's banner says why.
 * Below 1024px the right column drops under the left; below 768px it is
 * replaced by the phone's two stat cards, which sit under Next up.
 */
export default async function TodayPage() {
  const today = await loadToday();
  return (
    <div data-layout="app">
      <h1 className="mb-3 font-display text-[28px] leading-tight font-bold text-text md:sr-only">Today</h1>
      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="flex min-w-0 flex-col gap-3 md:gap-4">
          <NextUpCard nextUp={today.nextUp} conceptCount={today.conceptCount} reachable={today.reachable} />
          <div className="md:hidden">
            <PhoneTargetStat habit={today.habit} />
          </div>
          <ReviewsCard reviews={today.reviews} reachable={today.reachable} />
          <ActivityCard rows={today.activity} reachable={today.reachable} />
        </div>
        <div className="flex min-w-0 flex-col gap-4 max-md:hidden">
          <TargetCard habit={today.habit} />
          <CoursesCard courses={today.courses} />
        </div>
      </div>
    </div>
  );
}
