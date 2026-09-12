"use client";

import { useMemo, useState, type ReactNode } from "react";
import { Sidebar } from "@/components/Sidebar";
import { ThemeToggle } from "@/components/ThemeToggle";
import { ProgressBar } from "@/components/ProgressBar";
import { useLearner } from "@/lib/learner-context";
import { countsFromIds } from "@/lib/progress";
import { navTopicIds, type CourseNavEntry } from "@/lib/curriculum";

/**
 * `nav` comes from the root layout, which is a server component and the only
 * thing allowed to read `content/`. It carries the whole-shortlist topic ids
 * the header's progress bar counts, as well as the sidebar's list.
 */
export function AppShell({
  nav,
  children,
}: {
  nav: CourseNavEntry[];
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const { state, ready } = useLearner();
  const allTopicIds = useMemo(() => navTopicIds(nav), [nav]);
  const progress = countsFromIds(allTopicIds, state.completed);

  return (
    <div className="flex min-h-full bg-[var(--background)] text-[var(--foreground)]">
      <Sidebar nav={nav} open={open} onClose={() => setOpen(false)} />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-[var(--border)] bg-[var(--header-bg)] px-4 py-2.5 backdrop-blur">
          <button
            type="button"
            className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-[var(--border)] text-sm lg:hidden"
            onClick={() => setOpen(true)}
            aria-label="Open navigation"
          >
            ☰
          </button>
          <div className="hidden min-w-0 flex-1 sm:block sm:max-w-xs">
            {ready ? (
              <ProgressBar progress={progress} size="sm" />
            ) : (
              <div className="h-2 rounded-full bg-[var(--border)]" />
            )}
          </div>
          <div className="ml-auto flex items-center gap-2">
            <span className="hidden text-xs text-[var(--muted)] md:inline">
              Progress is saved in this browser
            </span>
            <ThemeToggle />
          </div>
        </header>
        <main className="flex-1 px-4 py-8 sm:px-8 lg:px-12">
          <div className="mx-auto w-full max-w-3xl">{children}</div>
        </main>
      </div>
    </div>
  );
}
