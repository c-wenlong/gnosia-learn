import { LOADING_BLOCK, PageLoading } from "@/components/PageLoading";
import { cardClasses, cx } from "@/components/ui/classes";

/**
 * Settings while it is read: its own outline (a heading over one column of
 * cards, Profile, Appearance and tutor, Model, Provider keys, Models) rather
 * than the two-column one most pages share, so the frame does not draw a
 * column the page is about to take away. It waits and fades in the same way
 * (`PageLoading`).
 */
export default function Loading() {
  return (
    <PageLoading>
      <div className="flex max-w-[852px] flex-col gap-4">
        <div className={cx(LOADING_BLOCK, "h-8 w-36")} />
        {[120, 236, 260, 300, 180].map((height) => (
          <div key={height} className={cardClasses({ className: "flex flex-col gap-3" })} style={{ minHeight: height }}>
            <div className={cx(LOADING_BLOCK, "h-4 w-32")} />
            <div className={cx(LOADING_BLOCK, "h-3 w-3/4")} />
            <div className={cx(LOADING_BLOCK, "h-3 w-1/2")} />
          </div>
        ))}
      </div>
    </PageLoading>
  );
}
