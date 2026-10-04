import type { Metadata } from "next";

import { PAGE_ENTER } from "@/components/PageLoading";
import { AskBox } from "@/components/home/AskBox";
import { CoursesCard } from "@/components/home/CoursesCard";
import { NextUpCard } from "@/components/home/NextUpCard";
import { NextCard } from "@/components/home/NextCard";
import { RecallCard } from "@/components/home/RecallCard";
import { RefreshOnReturn } from "@/components/home/RefreshOnReturn";
import { ThreadsCard } from "@/components/home/ThreadsCard";
import { cx, PAGE_TITLE } from "@/components/ui/classes";
import { loadHome } from "@/lib/home";

export const metadata: Metadata = { title: "Home" };

/**
 * Home (docs/proposals/home-page.md; it replaced Today, hi-fi 01 and 13).
 * The Ask box across the top; then, left, what the owner was doing and can go
 * back to, what that opens up, and the few cards worth a quick recall; right,
 * the courses under way.
 *
 * A server component over one read (`loadHome`). A database that cannot be
 * reached renders every card's empty state and the shell's banner says why.
 * Below 1024px the right column drops under the left. A tab that comes back
 * to it reads it again (`RefreshOnReturn`), since what it lists changes in
 * other tabs.
 */
export default async function HomePage() {
  const home = await loadHome();
  return (
    <div data-layout="app" className={PAGE_ENTER}>
      <RefreshOnReturn asOf={home.asOf} />
      <h1 className={cx(PAGE_TITLE, "mb-3 md:sr-only")}>Home</h1>
      <div className="mb-5">
        <AskBox />
      </div>
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
