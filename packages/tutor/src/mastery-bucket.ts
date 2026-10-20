import type { MasteryLabel } from "@self-learn/catalog/state";

/**
 * The three colours the redesign draws mastery in.
 *
 * The `learn` pipeline labels a concept five ways (`mastered`, `solid`,
 * `shaky`, `weak`, `gap`, thresholds in `scripts/learn/lib/bkt.mjs`). The path,
 * the lists and the graph colour by bucket instead (docs/design/DESIGN.md,
 * "Mastery buckets"), because five shades of one accent are not tellable apart
 * at 14px and the question a learner asks of a dot is only "have I got this,
 * am I on it, or have I not started".
 *
 * `import type` only, so this stays safe in a client component: nothing from
 * the catalog reaches the bundle.
 */
export type MasteryBucket = "mastered" | "learning" | "untouched";

export const MASTERY_BUCKETS: readonly MasteryBucket[] = ["mastered", "learning", "untouched"];

/**
 * Which bucket a concept is in.
 *
 * `mastered` stays mastered whatever else is true. A concept with no
 * observations is untouched, even though its prior p(L) gives it a label
 * (usually `gap`): nobody has asked the learner anything yet. Everything else
 * is learning.
 *
 * `observations` is optional so a caller holding only a label can still ask,
 * and a missing count reads as zero: a caller that wants `learning` has to say
 * the concept was observed.
 */
export function bucketOf(concept: { mastery: MasteryLabel; observations?: number }): MasteryBucket {
  if (concept.mastery === "mastered") return "mastered";
  if (!concept.observations) return "untouched";
  return "learning";
}

/** The words the hi-fi prints beside a dot. */
export const MASTERY_BUCKET_LABEL: Record<MasteryBucket, string> = {
  mastered: "Mastered",
  learning: "Learning",
  untouched: "Not started",
};

/** "Learning · p(L) 0.42", or the bare label when there is no number to show. */
export function masteryCaption(bucket: MasteryBucket, pL?: number | null): string {
  const label = MASTERY_BUCKET_LABEL[bucket];
  if (pL === undefined || pL === null || !Number.isFinite(pL) || bucket === "untouched") return label;
  return `${label} · p(L) ${pL.toFixed(2)}`;
}
