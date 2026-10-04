import { PageLoading } from "@/components/PageLoading";
import { Skeleton } from "@/components/ui/Skeleton";
import { cardClasses } from "@/components/ui/classes";

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
        <Skeleton className="h-8 w-36" />
        <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:gap-8">
          <div className="flex gap-2 border-b-2 border-border pb-3 xl:w-[200px] xl:shrink-0 xl:flex-col xl:border-b-0 xl:pb-0">
            {[0, 1, 2, 3].map((tab) => (
              <Skeleton key={tab} className="h-6 w-20 xl:h-10 xl:w-full" />
            ))}
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-4">
            {[180, 140].map((height) => (
              <div key={height} className={cardClasses()} style={{ minHeight: height }}>
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-3 w-3/4" />
                <Skeleton className="h-3 w-1/2" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </PageLoading>
  );
}
