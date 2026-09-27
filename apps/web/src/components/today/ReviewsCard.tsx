import { Button } from "@/components/ui/Button";
import { Card, CardAction } from "@/components/ui/Card";
import { MasteryDot } from "@/components/ui/MasteryDot";
import { cx } from "@/components/ui/classes";
import type { TodayModel } from "@/lib/today-core";

/** Rows a phone shows (hi-fi 13); the desktop shows all five. */
const PHONE_ROWS = 3;

/**
 * Reviews due (hi-fi 01, middle left): the first five cards in the queue,
 * each with how late it is and whether its note holds checks to ask, then
 * Start review with the whole queue's size. Snooze is drawn and disabled:
 * there is nothing yet to snooze a card with.
 */
export function ReviewsCard({ reviews, reachable }: { reviews: TodayModel["reviews"]; reachable: boolean }) {
  const { total, rows, estimateMinutes } = reviews;
  return (
    <Card
      title="Reviews due"
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
            ? "Nothing due. A concept comes back here when its next review falls due."
            : "The review queue could not be read."}
        </p>
      ) : (
        <>
          <ul className="flex flex-col gap-2">
            {rows.map((row, i) => (
              <li key={row.conceptId} className={cx("flex min-w-0 items-center gap-3", i >= PHONE_ROWS && "max-md:hidden")}>
                <MasteryDot bucket={row.bucket} />
                <span className="min-w-0 flex-1 truncate text-[14px] text-text">{row.title}</span>
                <span className="shrink-0 text-[12px] text-text2">
                  <span className="md:hidden">{row.dueShort}</span>
                  <span className="max-md:hidden">{row.dueLabel}</span>
                </span>
                <span className="shrink-0 text-[12px] text-text3 max-md:hidden">{row.kindLabel}</span>
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap items-center gap-2.5">
            <Button href="/review" className="max-md:w-full">
              <span className="md:hidden">Start review · {total}</span>
              <span className="max-md:hidden">Start review · {total} due</span>
            </Button>
            <span className="max-md:hidden">
              <Button variant="secondary" disabled disabledReason="Not built yet.">
                Snooze to tomorrow
              </Button>
            </span>
            <span className="ml-auto text-[12px] text-text3 max-md:hidden">Est. {estimateMinutes} min</span>
          </div>
        </>
      )}
    </Card>
  );
}
