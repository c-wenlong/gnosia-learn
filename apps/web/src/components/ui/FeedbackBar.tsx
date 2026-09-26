import type { ReactNode } from "react";

import { cx } from "./classes";

/**
 * Kit `Feedback`, after Duolingo's lesson footer with Brilliant's colours: a
 * tinted bar at radius 16, a 44px icon disc, the verdict in 18/700 over one
 * line of reason in 13px, a note in 12px secondary, and the actions at the
 * right (ghost "Why?" and the coloured 3D Continue, passed in by the caller).
 *
 * `ok` is the green verdict; otherwise it is "not quite", yellow rather than
 * red. The bar is a live region, so a screen reader hears the verdict the
 * moment it replaces the buttons. On a phone the actions drop under the text.
 */
export function FeedbackBar({
  ok,
  title,
  detail,
  note,
  actions,
  className,
}: {
  ok: boolean;
  title: string;
  detail?: ReactNode;
  note?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div
      role="status"
      className={cx(
        "flex flex-col gap-4 rounded-2xl p-[18px] sm:flex-row sm:items-center",
        ok ? "bg-ok-tint" : "bg-warn-tint",
        className,
      )}
    >
      <div className="flex min-w-0 flex-1 items-start gap-4 sm:items-center">
        <span
          aria-hidden
          className={cx(
            "flex size-11 shrink-0 items-center justify-center rounded-full text-[20px] font-bold",
            ok ? "bg-ok text-[var(--ok-on)]" : "bg-warn text-[var(--warn-on)]",
          )}
        >
          {ok ? "✓" : "!"}
        </span>
        <div className="flex min-w-0 flex-col gap-[3px]">
          <p className={cx("text-[18px] font-bold leading-6", ok ? "text-ok-text" : "text-warn-text")}>{title}</p>
          {detail !== undefined && (
            <p className={cx("text-[13px] leading-5", ok ? "text-ok-text" : "text-warn-text")}>{detail}</p>
          )}
          {note !== undefined && <p className="text-[12px] leading-4 text-text2">{note}</p>}
        </div>
      </div>
      {actions !== undefined && <div className="flex shrink-0 flex-wrap items-center gap-2 sm:gap-4">{actions}</div>}
    </div>
  );
}
