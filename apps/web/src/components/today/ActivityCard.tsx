import { Card, CardAction } from "@/components/ui/Card";
import { cx } from "@/components/ui/classes";
import type { ActivityRow } from "@/lib/today-core";

/** Rows a phone shows (hi-fi 13). */
const PHONE_ROWS = 2;

/**
 * Recent activity (hi-fi 01, bottom left; "Recent" on the phone): one row per
 * sitting, newest first, with p(L) before and after where there was one
 * concept to measure. Full history goes to the Learn index until a history
 * page exists.
 */
export function ActivityCard({ rows, reachable }: { rows: ActivityRow[]; reachable: boolean }) {
  return (
    <Card
      title={
        <>
          <span className="md:hidden">Recent</span>
          <span className="max-md:hidden">Recent activity</span>
        </>
      }
      action={
        <span className="max-md:hidden">
          <CardAction href="/learn">Full history</CardAction>
        </span>
      }
      className="max-md:gap-2 max-md:p-3.5"
    >
      {rows.length === 0 ? (
        <p className="text-[14px] text-text2">
          {reachable
            ? "Nothing recorded yet. Every answer, teach step and review you record shows here."
            : "Recent activity could not be read."}
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {rows.map((row, i) => (
            <li key={row.key} className={cx("flex min-w-0 items-center gap-3", i >= PHONE_ROWS && "max-md:hidden")}>
              <time dateTime={row.at} className="w-16 shrink-0 text-[12px] text-text3 md:w-[70px]">
                {row.day}
              </time>
              <span aria-hidden className="size-2 shrink-0 rounded-full bg-m-mid max-md:hidden" />
              <span className="min-w-0 flex-1 truncate text-[13px] text-text">
                <span className="md:hidden">{row.short}</span>
                <span className="max-md:hidden">{row.text}</span>
              </span>
              {row.detail !== null && (
                <span className="shrink-0 text-[12px] text-text2 max-md:hidden">{row.detail}</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
