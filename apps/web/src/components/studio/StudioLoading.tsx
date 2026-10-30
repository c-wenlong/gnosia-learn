import { PageLoading } from "@/components/PageLoading";
import { BackToStudio, StudioStrip } from "@/components/studio/StudioChrome";
import { SHEET, TILE, TILE_THUMB } from "@/components/studio/surfaces";
import { Skeleton } from "@/components/ui/Skeleton";

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
 * grid arrives. The frame is `PageLoading`'s (`layout="full"`), so it waits
 * 120ms before it shows, as every other page's does, and a runner that answers
 * at once never flashes it; the blocks are the kit's `Skeleton`, which stops
 * pulsing under reduced motion.
 */

export function StudioGridLoading() {
  return (
    <PageLoading layout="full" label="Opening the studio">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        {/* The conversations are in the app's sidebar, which is already drawn. */}
        {/* The home view's heading and composer. */}
        <div className="flex min-h-[calc(100dvh-12rem)] flex-col items-center justify-center gap-7 px-4 py-12 md:min-h-[calc(100dvh-9rem)]">
          <Skeleton className="h-10 w-72 -translate-y-4" />
          <Skeleton className="h-[52px] w-full max-w-3xl -translate-y-4" />
        </div>
        <div className={SHEET}>
          <StudioStrip surface>
            {/* The toolbar's two halves, stacked where the panel is narrow, as `StudioToolbar` lays them out. */}
            <div className="@container min-w-0 flex-1">
              <div className="flex flex-col gap-2 @[52rem]:flex-row @[52rem]:items-center">
                <div className="flex min-w-0 items-center gap-2">
                  <Skeleton className="h-8 w-52 shrink-0" />
                  <Skeleton className="h-8 min-w-0 flex-1 @[52rem]:w-60 @[52rem]:flex-none" />
                </div>
                <div className="flex min-w-0 flex-1 items-center justify-end gap-2">
                  <Skeleton className="mr-auto h-7 w-40" />
                  <Skeleton className="h-7 w-16" />
                  <Skeleton className="h-7 w-16" />
                </div>
              </div>
            </div>
          </StudioStrip>
          <div className="min-h-0 flex-1 overflow-hidden p-4">
            <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-3">
              {Array.from({ length: 8 }, (_, at) => (
                <div key={at} className={TILE}>
                  <Skeleton fill className={TILE_THUMB} />
                  <div className="flex flex-col gap-2 p-3">
                    <Skeleton className="h-3.5 w-3/4" />
                    <Skeleton className="h-3 w-1/3" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </PageLoading>
  );
}

export function StudioCanvasLoading() {
  return (
    <PageLoading layout="full" label="Opening the canvas">
      <StudioStrip>
        {/* The way back works before the canvas does. */}
        <BackToStudio />
        <Skeleton className="h-4 w-48" />
      </StudioStrip>
      <Skeleton fill className="min-h-0 flex-1" />
    </PageLoading>
  );
}
