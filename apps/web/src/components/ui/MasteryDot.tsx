import { masteryCaption, MASTERY_BUCKET_LABEL, type MasteryBucket } from "@gnosia/tutor/mastery-bucket";

import { cx } from "./classes";

/**
 * Kit `Mastery`: the one mark for "how well do I know this". Mastered is a
 * filled accent disc, learning a light-accent disc ringed in the accent,
 * untouched an empty ring. Get the bucket from `bucketOf` in
 * `@/lib/mastery-bucket`, never from the raw probability.
 *
 * With `showLabel` it adds the caption the hi-fi prints beside it
 * ("Learning · p(L) 0.42").
 */
export function MasteryDot({
  bucket,
  size = 14,
  showLabel = false,
  pL,
  className,
}: {
  bucket: MasteryBucket;
  /** Diameter in px. 14 in lists, 12 on library cards. */
  size?: number;
  showLabel?: boolean;
  /** Printed beside the label when `showLabel` is set. */
  pL?: number | null;
  className?: string;
}) {
  const dot = (
    <span
      role={showLabel ? undefined : "img"}
      aria-label={showLabel ? undefined : MASTERY_BUCKET_LABEL[bucket]}
      aria-hidden={showLabel ? true : undefined}
      className={cx(
        "inline-block shrink-0 rounded-full",
        bucket === "mastered" && "bg-m-hi",
        bucket === "learning" && "border-2 border-m-hi bg-m-mid",
        bucket === "untouched" && "border-2 border-m-lo bg-surface",
        !showLabel && className,
      )}
      style={{ width: size, height: size }}
    />
  );
  if (!showLabel) return dot;
  return (
    <span className={cx("inline-flex items-center gap-2 text-[12px] text-text2", className)}>
      {dot}
      <span>{masteryCaption(bucket, pL)}</span>
    </span>
  );
}
