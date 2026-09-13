import type { ProgressCounts } from "@/lib/types";
import { formatProgress } from "@/lib/progress";

export function ProgressBar({
  progress,
  showLabel = true,
  size = "md",
}: {
  progress: ProgressCounts;
  showLabel?: boolean;
  size?: "sm" | "md";
}) {
  const height = size === "sm" ? "h-1.5" : "h-2";
  return (
    <div className="w-full">
      {showLabel && (
        <div className="mb-1 flex items-center justify-between text-xs text-[var(--muted)]">
          <span>{formatProgress(progress)}</span>
          <span>{progress.percent}%</span>
        </div>
      )}
      <div
        className={`${height} w-full overflow-hidden rounded-full bg-[var(--border)]`}
        role="progressbar"
        aria-valuenow={progress.percent}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className={`${height} rounded-full bg-[var(--accent)] transition-all duration-300`}
          style={{ width: `${progress.percent}%` }}
        />
      </div>
    </div>
  );
}
