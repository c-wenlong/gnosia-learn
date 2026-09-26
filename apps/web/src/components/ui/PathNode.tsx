import type { MasteryBucket } from "@/lib/mastery-bucket";

import { cx } from "./classes";

/**
 * Kit `PathNode` (Duolingo's path node, straightened): a 56px disc over a 6px
 * lip of a darker shade, coloured by mastery bucket, with a small mark in the
 * middle. The active node sits in a 3px accent ring.
 *
 * The box is always 72 by 78, ring or not, so a column of nodes lines up and
 * the connector between them stays centred. `glyph="check"` swaps the dot for
 * a tick, for a topic whose only record is the learner's own tick rather than
 * a mastery estimate.
 *
 * Decorative: the caption beside it says the same thing in words, so the
 * node is hidden from assistive technology.
 */
const FACE: Record<MasteryBucket, string> = {
  mastered: "bg-m-hi",
  learning: "bg-m-mid",
  untouched: "bg-m-lo",
};

const LIP: Record<MasteryBucket, string> = {
  mastered: "bg-[var(--m-hi-lip)]",
  learning: "bg-[var(--m-mid-lip)]",
  untouched: "bg-lip-shade",
};

export function PathNode({
  bucket,
  active = false,
  glyph = "dot",
  className,
}: {
  bucket: MasteryBucket;
  active?: boolean;
  glyph?: "dot" | "check";
  className?: string;
}) {
  // White on a learning face, as in the kit. The mastered face's mark is
  // `--m-hi-on`: white too, except under Gnosia dark, where mastered is the
  // bright teal and the mark turns navy. The untouched face is grey, so its
  // mark is the tertiary text colour.
  const mark = bucket === "untouched" ? "text-text3" : bucket === "mastered" ? "text-[var(--m-hi-on)]" : "text-white";
  return (
    <span
      aria-hidden
      className={cx(
        "flex h-[78px] w-[72px] shrink-0 items-center justify-center rounded-[39px]",
        active && "border-[3px] border-accent",
        className,
      )}
    >
      <span className={cx("relative block h-[62px] w-14 rounded-[28px]", LIP[bucket])}>
        <span className={cx("absolute inset-x-0 top-0 flex h-14 w-14 items-center justify-center rounded-full", FACE[bucket], mark)}>
          {glyph === "check" ? (
            <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12.5 10 17.5 19 7" />
            </svg>
          ) : (
            <span className="block h-3.5 w-3.5 rounded-full bg-current" />
          )}
        </span>
      </span>
    </span>
  );
}
