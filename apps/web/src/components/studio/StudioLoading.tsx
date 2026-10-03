import Link from "next/link";

import { Spacer, StudioStrip } from "@/components/studio/StudioChrome";

/**
 * What `/studio` and a canvas show while the server reads the runner.
 *
 * Without a `loading.tsx` a press on Studio in the top bar did nothing at all
 * until the whole page had been read: every list is a catalog subprocess in
 * the runner, and three of them at once took two to four seconds. A loading
 * boundary is also what Next prefetches for a dynamic route, so this frame is
 * on screen in the same frame as the press.
 *
 * The shapes match the page's own strip and tiles, so nothing jumps when the
 * grid arrives. Pulsing is off under reduced motion.
 */

const PULSE = "animate-pulse motion-reduce:animate-none";

export function StudioGridLoading() {
  return (
    <div data-layout="full" className="flex min-h-0 min-w-0 flex-1 flex-col" aria-busy="true">
      <StudioStrip>
        <div className={`h-7 w-56 rounded-md bg-[var(--surface-hover)] ${PULSE}`} />
        <div className={`hidden h-6 w-40 rounded-full bg-[var(--surface-hover)] sm:block ${PULSE}`} />
        <Spacer />
        <div className={`h-7 w-16 rounded-md bg-[var(--surface-hover)] ${PULSE}`} />
        <div className={`h-7 w-16 rounded-md bg-[var(--surface-hover)] ${PULSE}`} />
      </StudioStrip>
      <p role="status" className="sr-only">
        Opening the studio
      </p>
      <div className="min-h-0 flex-1 overflow-hidden p-4">
        <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-4">
          {Array.from({ length: 8 }, (_, at) => (
            <div key={at} className="flex flex-col overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)]">
              <div className={`aspect-[16/10] bg-[var(--surface-hover)] ${PULSE}`} />
              <div className="flex flex-col gap-2 p-3">
                <div className={`h-3.5 w-3/4 rounded bg-[var(--surface-hover)] ${PULSE}`} />
                <div className={`h-3 w-1/3 rounded bg-[var(--surface-hover)] ${PULSE}`} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function StudioCanvasLoading() {
  return (
    <div data-layout="full" className="flex min-h-0 flex-1 flex-col" aria-busy="true">
      <StudioStrip>
        {/* The way back works before the canvas does. */}
        <Link
          href="/studio"
          className="inline-flex h-8 shrink-0 items-center rounded-md px-2 text-xs hover:bg-[var(--surface-hover)]"
          aria-label="Back to the studio"
        >
          ← Studio
        </Link>
        <div className={`h-4 w-48 rounded bg-[var(--surface-hover)] ${PULSE}`} />
      </StudioStrip>
      <p role="status" className="sr-only">
        Opening the canvas
      </p>
      <div className={`min-h-0 flex-1 bg-[var(--surface-hover)] ${PULSE}`} />
    </div>
  );
}
