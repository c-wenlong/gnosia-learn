import { cx } from "./classes";

/**
 * Kit `TargetBar`, after Duolingo's goal bar: a 20px track at radius 10 with
 * an accent fill, and the "x / y" count beside it rather than on it.
 */
export function TargetBar({
  done,
  total,
  label = "Today's target",
  className,
}: {
  done: number;
  total: number;
  /** Accessible name of the bar. */
  label?: string;
  className?: string;
}) {
  const percent = total <= 0 ? 0 : Math.max(0, Math.min(100, (done / total) * 100));
  return (
    <div className={cx("flex w-full items-center gap-3", className)}>
      <div
        className="h-5 min-w-0 flex-1 overflow-hidden rounded-[10px] bg-border"
        role="progressbar"
        aria-label={label}
        aria-valuenow={done}
        aria-valuemin={0}
        aria-valuemax={total}
      >
        <div className="h-5 rounded-[10px] bg-accent transition-[width] duration-300" style={{ width: `${percent}%` }} />
      </div>
      <span className="shrink-0 text-[13px] font-bold text-text tabular-nums">
        {done} / {total}
      </span>
    </div>
  );
}
