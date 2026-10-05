import type { ReactNode } from "react";

import { Skeleton, SKELETON } from "@/components/ui/Skeleton";
import { cardClasses, cx } from "@/components/ui/classes";

/**
 * What a page under the app shell shows while the server reads it.
 *
 * Every page here is dynamic (the layout reads the learner's state), and none
 * had a loading boundary, so a press on a link in the sidebar changed nothing
 * on screen until the next page had read everything it shows: a quarter of a
 * second on a quiet machine, several seconds on a loaded one or under
 * `next dev`. A loading boundary is also what Next prefetches for a dynamic
 * route, so this frame, the new destination marked, is up in the frame of the
 * press. A page with its own (`studio/loading.tsx`, `review/loading.tsx`)
 * shows that instead.
 *
 * Neutral on purpose: a heading and a column of cards beside a narrower one,
 * the outline most pages share, in the surface colours every palette defines.
 * `focus` is Review's shape: no sidebar from 768px up and one centred card,
 * so the frame does not draw a chrome the page is about to take away. `full`
 * is the studio's: the page fills the shell edge to edge (`data-layout="full"`)
 * and passes its own outline as children. `workspace` is the concept page's:
 * its root carries the page's own `data-layout="workspace"` and classes, so
 * the shell is fixed to the viewport from 900px up while it loads, as it will
 * be once the page arrives, and the three panels are outlined at the page's
 * column widths (one, under a tab row, below 900px).
 *
 * The status line sits beside the busy region, not in it, so a screen reader
 * announces it rather than waiting for the region to settle.
 *
 * **It waits before it shows.** The frame is invisible for its first 120ms
 * and then fades in (`animate-fade-in-late`), so a page that answers quickly
 * replaces it before it was ever seen, rather than flashing grey blocks for a
 * frame; only a slow read shows it. The page that replaces it fades in on its
 * own (`PAGE_ENTER`). Under reduced motion the global rule drops the wait and
 * the frame shows at once, as it did before.
 */

/** A page's own way in once it replaces the loading frame: opacity only, so no transform is left on the page's root. */
export const PAGE_ENTER = "animate-fade-in motion-reduce:animate-none";

/** The frame's wait-then-fade, on the element carrying `data-layout`. */
const FRAME_ENTER = "animate-fade-in-late motion-reduce:animate-none";

export function PageLoading({
  layout = "app",
  label = "Loading",
  children,
}: {
  layout?: "app" | "focus" | "workspace" | "full";
  /** What the status line says to a screen reader, e.g. "Opening the studio". */
  label?: string;
  /** A page's own outline in place of the generic one, inside the same frame. */
  children?: ReactNode;
} = {}) {
  const status = (
    <p role="status" className="sr-only">
      {label}
    </p>
  );
  if (layout === "full") {
    return (
      <>
        {status}
        <div data-layout="full" aria-busy="true" className={cx("flex min-h-0 min-w-0 flex-1 flex-col", FRAME_ENTER)}>
          {children}
        </div>
      </>
    );
  }
  if (layout === "workspace") {
    return (
      <>
        {status}
        <div
          data-layout="workspace"
          aria-busy="true"
          className={cx(WORKSPACE_ROOT, FRAME_ENTER)}
        >
          {children ?? <WorkspaceOutline />}
        </div>
      </>
    );
  }
  if (layout === "focus") {
    return (
      <>
        {status}
        <div
          data-layout="focus"
          aria-busy="true"
          className={cx("mx-auto flex w-full max-w-2xl flex-col gap-4 px-4 pt-10", FRAME_ENTER)}
        >
          <Skeleton className="h-2 w-full" />
          <div className={cardClasses({ className: "min-h-[320px]" })}>
            <Skeleton className="h-5 w-2/3" />
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-5/6" />
          </div>
        </div>
      </>
    );
  }
  return (
    <>
      {status}
      <div data-layout="app" aria-busy="true" className={FRAME_ENTER}>
        {children ?? <AppOutline />}
      </div>
    </>
  );
}

/**
 * The concept workspace's root, as `learn/[concept]/(workspace)/page.tsx`
 * draws it: the shell's `has-[[data-layout=workspace]]` rules and this page's
 * own flex column have to agree between the frame and the page, or the shell
 * changes height under the learner as the page arrives.
 */
export const WORKSPACE_ROOT = "flex flex-col gap-4 min-[900px]:min-h-0 min-[900px]:flex-1";

/** The kit `Skeleton`'s classes, for a page outline whose block is not a `<div>`. */
export const LOADING_BLOCK = SKELETON;

/** The outline most pages share: a heading, a column of cards beside a narrower one. */
function AppOutline() {
  return (
    <>
      <Skeleton className="mb-5 h-8 w-48" />
      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="flex min-w-0 flex-col gap-4">
          {[176, 132, 220].map((height) => (
            <div
              key={height}
              className={cardClasses()}
              style={{ minHeight: height }}
            >
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-3 w-3/4" />
              <Skeleton className="h-3 w-1/2" />
            </div>
          ))}
        </div>
        <div className="flex min-w-0 flex-col gap-4 max-lg:hidden">
          {[148, 196].map((height) => (
            <div
              key={height}
              className={cardClasses()}
              style={{ minHeight: height }}
            >
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-3 w-2/3" />
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

/** One of the workspace's panels: a header row over a body, as the kit `Panel` draws it. */
function PanelOutline({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div className={cx("flex min-h-0 min-w-0 flex-col rounded-2xl bg-surface", className)}>
      <div className="flex h-12 shrink-0 items-center border-b border-hair px-4">
        <Skeleton className="h-4 w-28" />
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-3 p-4">{children}</div>
    </div>
  );
}

/**
 * The concept workspace's outline: the header (a place, the title, Teach me),
 * then the note, the tutor and the studio side by side at the page's open
 * widths from 900px up. Below that the page shows a tab row over one panel,
 * the note, so this does too.
 */
function WorkspaceOutline() {
  return (
    <>
      <div className="flex shrink-0 flex-wrap items-center gap-x-3.5 gap-y-3">
        <div className="flex min-w-0 flex-1 basis-[18rem] flex-col gap-2">
          <Skeleton className="h-3 w-40" />
          <Skeleton className="h-8 w-64 max-w-full" />
        </div>
        <Skeleton className="h-11 w-28" />
      </div>
      <Skeleton className="h-10 w-full min-[900px]:hidden" />
      <div
        className={cx(
          "grid grid-cols-1 gap-4",
          "min-[900px]:min-h-0 min-[900px]:flex-1 min-[900px]:grid-rows-[minmax(0,1fr)]",
          "min-[900px]:grid-cols-[250px_minmax(0,1fr)_270px] xl:grid-cols-[290px_minmax(0,1fr)_310px]",
        )}
      >
        <PanelOutline className="max-[899px]:min-h-[50dvh]">
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-5/6" />
          <Skeleton className="h-3 w-2/3" />
          <Skeleton className="mt-2 h-24 w-full" />
        </PanelOutline>
        <PanelOutline className="max-[899px]:hidden">
          <Skeleton className="h-3 w-3/4" />
          <Skeleton className="h-3 w-1/2" />
          <Skeleton className="mt-auto h-12 w-full" />
        </PanelOutline>
        <PanelOutline className="max-[899px]:hidden">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </PanelOutline>
      </div>
    </>
  );
}
