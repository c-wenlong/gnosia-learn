/**
 * Spaced repetition over concepts, using SM-2.
 *
 * SM-2 is chosen over FSRS deliberately: it is ~40 lines, has no trained
 * parameter vector to maintain, and its behaviour is legible when you are
 * reading your own review queue. The knobs that matter here are the grade
 * mapping and the leech rule, not squeezing the last few points of recall
 * accuracy out of the scheduler.
 *
 * Grades follow SM-2 convention:
 *   0 blackout · 1 wrong, familiar · 2 wrong, easy to recall once told
 *   3 correct, hard · 4 correct, some hesitation · 5 correct, instant
 * A grade below 3 fails the card and restarts its interval.
 */

export const MIN_EASE = 1.3;
export const DEFAULT_EASE = 2.5;
export const PASS_GRADE = 3;

/** Consecutive lapses before a card is flagged for reformulation. */
export const LEECH_THRESHOLD = 4;

/**
 * Interval ceiling, in days (~100 years). Without it the ease multiplier
 * compounds until the due date overflows the Date range and every later
 * write throws.
 */
export const MAX_INTERVAL_DAYS = 36500;

export const DAY_MS = 24 * 60 * 60 * 1000;

export function newCard(conceptId, now = new Date()) {
  return {
    conceptId,
    repetitions: 0,
    ease: DEFAULT_EASE,
    intervalDays: 0,
    lapses: 0,
    due: new Date(now).toISOString(),
    lastReviewed: null,
    leech: false,
    history: [],
  };
}

function addDays(date, days) {
  return new Date(new Date(date).getTime() + days * DAY_MS);
}

/** SM-2 ease update: EF' = EF + (0.1 - (5-q)(0.08 + (5-q)0.02)) */
export function nextEase(ease, grade) {
  const q = Math.max(0, Math.min(5, grade));
  const delta = 0.1 - (5 - q) * (0.08 + (5 - q) * 0.02);
  return Math.max(MIN_EASE, ease + delta);
}

/**
 * Apply one review. Returns a new card; the input is not mutated.
 * `fuzz` spreads same-day clusters so reviews don't all land together.
 */
export function review(card, grade, options = {}) {
  const { now = new Date(), fuzz = true } = options;
  const q = Math.max(0, Math.min(5, Math.round(grade)));
  const passed = q >= PASS_GRADE;

  const ease = nextEase(card.ease ?? DEFAULT_EASE, q);
  let repetitions = card.repetitions ?? 0;
  let intervalDays;
  let lapses = card.lapses ?? 0;

  if (passed) {
    repetitions += 1;
    if (repetitions === 1) intervalDays = 1;
    else if (repetitions === 2) intervalDays = 6;
    else intervalDays = Math.round((card.intervalDays || 1) * ease);
  } else {
    repetitions = 0;
    lapses += 1;
    intervalDays = 1;
  }

  if (fuzz && intervalDays >= 7) {
    const spread = Math.max(1, Math.round(intervalDays * 0.05));
    const offset = ((intervalDays + lapses) % (spread * 2 + 1)) - spread;
    intervalDays = Math.max(1, intervalDays + offset);
  }

  intervalDays = Math.min(intervalDays, MAX_INTERVAL_DAYS);

  return {
    ...card,
    repetitions,
    ease,
    intervalDays,
    lapses,
    leech: lapses >= LEECH_THRESHOLD,
    due: addDays(now, intervalDays).toISOString(),
    lastReviewed: new Date(now).toISOString(),
    history: [
      ...(card.history ?? []).slice(-19),
      { at: new Date(now).toISOString(), grade: q, intervalDays },
    ],
  };
}

/** Cards due at or before `now`, most overdue first. */
export function dueCards(reviews, options = {}) {
  const { now = new Date(), limit = Infinity } = options;
  const cutoff = new Date(now).getTime();

  return Object.values(reviews.cards ?? {})
    .filter((card) => new Date(card.due).getTime() <= cutoff)
    .sort((a, b) => new Date(a.due) - new Date(b.due))
    .slice(0, limit);
}

/** Day-by-day count of upcoming reviews, for a workload read-out. */
export function forecast(reviews, options = {}) {
  const { now = new Date(), days = 14 } = options;
  const start = new Date(now).setHours(0, 0, 0, 0);
  const buckets = new Array(days).fill(0);
  let overdue = 0;

  for (const card of Object.values(reviews.cards ?? {})) {
    const dueDay = new Date(card.due).setHours(0, 0, 0, 0);
    const offset = Math.round((dueDay - start) / DAY_MS);
    if (offset < 0) overdue += 1;
    else if (offset < days) buckets[offset] += 1;
  }

  return { overdue, buckets };
}

/**
 * Map a Bayesian mastery probability to an SM-2 grade, so a probe or a
 * teaching check can feed the scheduler without a separate self-rating.
 */
export function gradeFromOutcome(correct, pL = 0.5) {
  if (!correct) return pL > 0.7 ? 2 : 1;
  if (pL >= 0.9) return 5;
  if (pL >= 0.7) return 4;
  return 3;
}
