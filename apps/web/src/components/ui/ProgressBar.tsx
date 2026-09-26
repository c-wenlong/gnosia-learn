import type { ProgressCounts } from "@/lib/types";
import { formatProgress } from "@/lib/progress";

import { cx } from "./classes";

/**
 * Kit `Bar`: an 8px track in `--border` with a fill proportional to a
 * fraction. The accent by default; `tone` picks the ok green or the
 * learning-mastery tint for the close screen's before-and-after bars.
 *
 * Takes either `percent` (0 to 100) or the older `progress` counts. With
 * `progress` it prints the "3/17 · 18%" line above the bar, as it always did,
 * unless `showLabel` is false; with `percent` it prints nothing unless asked.
 */
export type ProgressTone = "accent" | "ok" | "mid";

const TONE: Record<ProgressTone, string> = {
  accent: "bg-accent",
  ok: "bg-ok",
  mid: "bg-m-mid",
};

export function ProgressBar({
  percent,
  progress,
  showLabel,
  size = "md",
  tone = "accent",
  label,
  className,
}: {
  percent?: number;
  progress?: ProgressCounts;
  showLabel?: boolean;
  /** 8px (`md`) or 6px (`sm`). */
  size?: "sm" | "md";
  tone?: ProgressTone;
  /** Accessible name, e.g. "CP4281 progress". */
  label?: string;
  className?: string;
}) {
  const raw = percent ?? progress?.percent ?? 0;
  const value = Math.max(0, Math.min(100, Number.isFinite(raw) ? raw : 0));
  const withLabel = showLabel ?? progress !== undefined;
  const height = size === "sm" ? "h-1.5" : "h-2";
  return (
    <div className={cx("w-full", className)}>
      {withLabel && (
        <div className="mb-1 flex items-center justify-between text-xs text-text2 tabular-nums">
          <span>{progress ? formatProgress(progress) : `${Math.round(value)}%`}</span>
          {progress && <span>{progress.percent}%</span>}
        </div>
      )}
      <div
        className={cx(height, "w-full overflow-hidden rounded-full bg-border")}
        role="progressbar"
        aria-label={label}
        aria-valuenow={Math.round(value)}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div className={cx(height, TONE[tone], "rounded-full transition-[width] duration-300")} style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}
