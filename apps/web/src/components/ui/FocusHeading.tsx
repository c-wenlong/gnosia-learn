import type { ReactNode } from "react";

import { CLOSE_TITLE, cx } from "./classes";

/**
 * Kit `FocusHeading`: the centred heading of a focus page's closing screen
 * (a session closed, a review queue done or empty), `CLOSE_TITLE` over a
 * 14px `--text2` lead held to a reading measure.
 *
 * The `<h1>` takes `tabIndex={-1}` with no outline, because the focus pages
 * move the focus to the heading of each new step, and this is the last one.
 * No state and no hooks, so a server component draws it.
 */
export function FocusHeading({
  title,
  lead,
  className,
}: {
  title: ReactNode;
  /** A line under the title: what happened, or what to do next. */
  lead?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cx("flex flex-col items-center gap-1.5 text-center", className)}>
      <h1 tabIndex={-1} className={cx(CLOSE_TITLE, "outline-none")}>
        {title}
      </h1>
      {lead !== undefined && lead !== null && lead !== "" && (
        <p className="max-w-[480px] text-[14px] text-text2">{lead}</p>
      )}
    </div>
  );
}
