import type { Metadata } from "next";

import { CoursesCard } from "@/components/home/CoursesCard";
import { NextUpCard } from "@/components/home/NextUpCard";
import { NextCard } from "@/components/home/NextCard";
import { RecallCard } from "@/components/home/RecallCard";
import { ThreadsCard } from "@/components/home/ThreadsCard";
import { loadHome } from "@/lib/home";

export const metadata: Metadata = { title: "Home" };

/**
 * Home (docs/proposals/home-page.md; it replaced Today, hi-fi 01 and 13).
 * Left, what the owner was doing and can go back to, what that opens up, and
 * the few cards worth a quick recall; right, the courses under way.
 *
 * A server component over one read (`loadHome`). A database that cannot be
 * reached renders every card's empty state and the shell's banner says why.
 * Below 1024px the right column drops under the left.
 */
export default async function HomePage() {
  const home = await loadHome();
  return (
    <div data-layout="app">
      <h1 className="mb-3 font-display text-[28px] leading-tight font-bold text-text md:sr-only">Home</h1>
      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="flex min-w-0 flex-col gap-3 md:gap-4">
          <ThreadsCard threads={home.threads} reachable={home.reachable} />
          {home.next.length > 0 ? (
            <NextCard groups={home.next} />
          ) : (
            <NextUpCard nextUp={home.nextUp} conceptCount={home.conceptCount} reachable={home.reachable} />
          )}
          {home.recall.length > 0 && <RecallCard picks={home.recall} />}
        </div>
        <div className="flex min-w-0 flex-col gap-4">
          <CoursesCard courses={home.courses} />
        </div>
      </div>
    </div>
  );
}
