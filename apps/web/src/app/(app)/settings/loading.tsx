import { LOADING_BLOCK, PageLoading } from "@/components/PageLoading";
import { cardClasses, cx } from "@/components/ui/classes";

/**
 * Settings while it is read: its own outline rather than the two-column one
 * most pages share. A heading, then the tabs (`SettingsTabs`): a row across
 * the top below 1280px and a 200px column at the left from there, beside the
 * first tab's cards. It waits and fades in the same way (`PageLoading`).
 */
export default function Loading() {
  return (
    <PageLoading>
      <div className="flex max-w-[1084px] flex-col gap-4">
        <div className={cx(LOADING_BLOCK, "h-8 w-36")} />
        <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:gap-8">
          <div className="flex gap-2 border-b-2 border-border pb-3 xl:w-[200px] xl:shrink-0 xl:flex-col xl:border-b-0 xl:pb-0">
            {[0, 1, 2, 3].map((tab) => (
              <div key={tab} className={cx(LOADING_BLOCK, "h-6 w-20 xl:h-10 xl:w-full")} />
            ))}
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-4">
            {[180, 140].map((height) => (
              <div key={height} className={cardClasses({ className: "flex flex-col gap-3" })} style={{ minHeight: height }}>
                <div className={cx(LOADING_BLOCK, "h-4 w-32")} />
                <div className={cx(LOADING_BLOCK, "h-3 w-3/4")} />
                <div className={cx(LOADING_BLOCK, "h-3 w-1/2")} />
              </div>
            ))}
          </div>
        </div>
      </div>
    </PageLoading>
  );
}
