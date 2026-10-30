import { cx, FOCUS } from "./classes";

/**
 * Kit `Rating`: one of the four equal-weight buttons under a review card, the
 * rating in 15/700 over the interval it would give in 12px tertiary. A 2px
 * `--border` on `--surface`, radius 16 (14 on a phone), no lip: the four are
 * one choice between equals, so none of them is a primary.
 *
 * `interval` prints from 768px up and `short` below it, where the phone frame
 * (hi-fi 14) writes "4d" for "4 days". `suggested` is the rating a check card
 * picked for itself; it takes the selected choice row's colours (`--tint` with
 * an `--accent` border) so the learner can see what Continue will record.
 *
 * No hooks, so it is safe in a server component; an `onClick` makes the caller
 * a client component, as with `Button`.
 */
export function RatingButton({
  label,
  interval,
  short,
  shortcut,
  suggested = false,
  disabled = false,
  onClick,
  className,
}: {
  label: string;
  interval: string;
  /** The phone's compact interval; defaults to `interval`. */
  short?: string;
  /** The key that presses it, for the accessible name ("1"). */
  shortcut?: string;
  suggested?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-keyshortcuts={shortcut}
      aria-label={`${label}, next in ${interval}`}
      className={cx(
        "flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-[14px] border-2 py-3 md:gap-1 md:rounded-2xl md:py-3.5",
        "transition-colors duration-100 select-none disabled:cursor-not-allowed disabled:opacity-50",
        FOCUS,
        suggested ? "border-accent bg-tint" : "border-border bg-surface not-disabled:hover:bg-surface2",
        className,
      )}
    >
      <span className="text-[14px] font-bold leading-5 text-text md:text-[15px]">{label}</span>
      <span className="text-[12px] leading-4 text-text3 tabular-nums">
        <span className="md:hidden">{short ?? interval}</span>
        <span className="hidden md:inline">{interval}</span>
      </span>
    </button>
  );
}
