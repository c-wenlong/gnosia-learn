"use client";

import { useMemo, useState, type ReactNode } from "react";
import { Sidebar } from "@/components/Sidebar";
import { ThemeToggle } from "@/components/ThemeToggle";
import { ProgressBar } from "@/components/ProgressBar";
import { useLearner } from "@/lib/learner-context";
import { countsFromIds } from "@/lib/progress";
import { navTopicIds, type CourseNavEntry } from "@/lib/curriculum";

/**
 * The one place a failed write is visible.
 *
 * Progress used to be saved in the browser, where the only failure was a full
 * quota. It is a database now, and a database can be down — so the shell
 * carries two states the app never had before: the snapshot the server
 * rendered was empty because it could not ask, and the last change the learner
 * made did not land. Both are said in words rather than left to be inferred
 * from a progress bar that quietly reads zero.
 */
function StoreBanner() {
  const { reachable, saveError, dismissSaveError } = useLearner();
  if (saveError === null && reachable) return null;

  const message = saveError ?? "Not connected to the database — nothing you change here will be saved.";
  return (
    <div
      role="status"
      className="flex items-start gap-3 border-b border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200"
    >
      <span className="min-w-0 flex-1">{message}</span>
      {saveError !== null && (
        <button
          type="button"
          onClick={dismissSaveError}
          className="shrink-0 font-medium underline underline-offset-2"
        >
          Dismiss
        </button>
      )}
    </div>
  );
}

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
              Progress is saved to your catalog
            </span>
            <ThemeToggle />
          </div>
        </header>
        <StoreBanner />
        <main className="flex-1 px-4 py-8 sm:px-8 lg:px-12">
          <div className="mx-auto w-full max-w-3xl">{children}</div>
        </main>
      </div>
    </div>
  );
}
