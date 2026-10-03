import { Button } from "@/components/ui/Button";
import { Card, CardAction } from "@/components/ui/Card";
import { MasteryDot } from "@/components/ui/MasteryDot";
import { cx } from "@/components/ui/classes";
import type { HomeModel } from "@/lib/home-core";

/** Rows a phone shows (hi-fi 13); the desktop shows all five. */
const PHONE_ROWS = 3;

/**
 * Reviews (hi-fi 01, middle left): the first five cards in the queue, each
 * with when its concept was last seen and whether its note holds checks to
 * ask, then Start review with the whole queue's size.
 *
 * No "overdue": a card's due date is SM-2's, and the owner learns on no
 * schedule, so a date that passed is not a debt (H3 of
 * docs/proposals/home-page.md). Phase 2 narrows the card to a few concepts
 * near what the owner is doing.
 */
export function ReviewsCard({ reviews, reachable }: { reviews: HomeModel["reviews"]; reachable: boolean }) {
  const { total, rows, estimateMinutes } = reviews;
  return (
    <Card
      title="Reviews"
      action={
        <span className="max-md:hidden">
          <CardAction href="/review">See all</CardAction>
        </span>
      }
      className="max-md:gap-2 max-md:p-3.5"
    >
      {total === 0 ? (
        <p className="text-[14px] text-text2">
          {reachable
            ? "Nothing to review. A concept comes back here a while after you learn it."
            : "The review queue could not be read."}
        </p>
      ) : (
        <>
          <ul className="flex flex-col gap-2">
            {rows.map((row, i) => (
              <li key={row.conceptId} className={cx("flex min-w-0 items-center gap-3", i >= PHONE_ROWS && "max-md:hidden")}>
                <MasteryDot bucket={row.bucket} />
                <span className="min-w-0 flex-1 truncate text-[14px] text-text">{row.title}</span>
                {row.lastSeen !== null && (
                  <span className="shrink-0 text-[12px] text-text2">
                    <span className="md:hidden">{row.lastSeen}</span>
                    <span className="max-md:hidden">last seen {row.lastSeen}</span>
                  </span>
                )}
                <span className="shrink-0 text-[12px] text-text3 max-md:hidden">{row.kindLabel}</span>
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap items-center gap-2.5">
            <Button href="/review" className="max-md:w-full">
              Start review · {total}
            </Button>
            <span className="ml-auto text-[12px] text-text3 max-md:hidden">Est. {estimateMinutes} min</span>
          </div>
        </>
      )}
    </Card>
  );
}
