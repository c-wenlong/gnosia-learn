import { cardClasses, cx } from "@/components/ui/classes";

/**
 * What a page under the app shell shows while the server reads it.
 *
 * Every page here is dynamic (the layout reads the learner's state), and none
 * had a loading boundary, so a press on a tab in the top bar changed nothing
 * on screen until the next page had read everything it shows: a quarter of a
 * second on a quiet machine, several seconds on a loaded one or under
 * `next dev`. A loading boundary is also what Next prefetches for a dynamic
 * route, so this frame, the new tab underlined, is up in the frame of the
 * press. A page with its own (`studio/loading.tsx`, `review/loading.tsx`)
 * shows that instead.
 *
 * Neutral on purpose: a heading and a column of cards beside a narrower one,
 * the outline most pages share, in the surface colours every palette defines.
 * `focus` is Review's shape: no top bar from 768px up and one centred card,
 * so the frame does not draw a chrome the page is about to take away.
 *
 * The status line sits beside the busy region, not in it, so a screen reader
 * announces it rather than waiting for the region to settle.
 */

const BLOCK = "rounded-md bg-surface2 animate-pulse motion-reduce:animate-none";

export function PageLoading({
  layout = "app",
}: { layout?: "app" | "focus" } = {}) {
  const status = (
    <p role="status" className="sr-only">
      Loading
    </p>
  );
  if (layout === "focus") {
    return (
      <>
        {status}
        <div
          data-layout="focus"
          aria-busy="true"
          className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-4 pt-10"
        >
          <div className={cx(BLOCK, "h-2 w-full")} />
          <div className={cardClasses({ className: "min-h-[320px]" })}>
            <div className={cx(BLOCK, "h-5 w-2/3")} />
            <div className={cx(BLOCK, "h-3 w-full")} />
            <div className={cx(BLOCK, "h-3 w-5/6")} />
          </div>
        </div>
      </>
    );
  }
  return (
    <>
      {status}
      <div data-layout="app" aria-busy="true">
        <div className={cx(BLOCK, "mb-5 h-8 w-48")} />
        <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
          <div className="flex min-w-0 flex-col gap-4">
            {[176, 132, 220].map((height) => (
              <div
                key={height}
                className={cardClasses({ className: "flex flex-col gap-3" })}
                style={{ minHeight: height }}
              >
                <div className={cx(BLOCK, "h-4 w-40")} />
                <div className={cx(BLOCK, "h-3 w-3/4")} />
                <div className={cx(BLOCK, "h-3 w-1/2")} />
              </div>
            ))}
          </div>
          <div className="flex min-w-0 flex-col gap-4 max-lg:hidden">
            {[148, 196].map((height) => (
              <div
                key={height}
                className={cardClasses({ className: "flex flex-col gap-3" })}
                style={{ minHeight: height }}
              >
                <div className={cx(BLOCK, "h-4 w-28")} />
                <div className={cx(BLOCK, "h-3 w-2/3")} />
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
