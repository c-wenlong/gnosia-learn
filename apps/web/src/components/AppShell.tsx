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
      className="flex items-start gap-3 border-b border-[var(--warn-border)] bg-[var(--warn-bg)] px-4 py-2 text-sm text-[var(--warn)]"
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
  studio = false,
  children,
}: {
  nav: CourseNavEntry[];
  /** Passed through to the sidebar. The server is the only thing that can know. */
  studio?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const { state, ready } = useLearner();
  const allTopicIds = useMemo(() => navTopicIds(nav), [nav]);
  const progress = countsFromIds(allTopicIds, state.completed);

  return (
    <div className="flex min-h-full bg-[var(--background)] text-[var(--foreground)] has-[[data-layout=full]]:h-dvh has-[[data-layout=full]]:overflow-hidden">
      <Sidebar nav={nav} open={open} onClose={() => setOpen(false)} studio={studio} />
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
        {/* 48rem is the reading measure every page wants and one does not: a
            gallery at that width is two cards across, and the media player's
            own container queries only reach their side-by-side layout at 64rem.
            A page opts out by putting `data-layout="wide"` on its root element,
            which `has-*` reads without a prop, a context or a client boundary
            between the layout and the route.

            `full` is the third value and not a wider `wide`. The studio's
            canvas is an iframe that has to fill the region exactly: a measure
            of any width is still a measure, and the page gutters that make
            prose readable put a border of background around a drawing surface.
            So `full` drops the measure *and* the padding, fixes the shell to
            the viewport height, and hands the route a flex child it can make
            as tall as the space left under the header. Only the content
            scrolls, which is what the design asks for and what `wide` cannot
            give without breaking every page that uses it. */}
        <main className="flex-1 px-4 py-8 has-[[data-layout=full]]:flex has-[[data-layout=full]]:min-h-0 has-[[data-layout=full]]:p-0 sm:px-8 lg:px-12">
          <div className="mx-auto w-full max-w-3xl has-[[data-layout=wide]]:max-w-6xl has-[[data-layout=full]]:flex has-[[data-layout=full]]:min-h-0 has-[[data-layout=full]]:flex-1 has-[[data-layout=full]]:max-w-none">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
