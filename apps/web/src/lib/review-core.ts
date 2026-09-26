/**
 * The review session's pure half: what a card is once it reaches the browser,
 * how it is built from a note, and the small formatting the page needs.
 *
 * React-free and server-free, so the server loader (`@/lib/review-queue`), the
 * client session and the tests share it. The scheduling itself is not here:
 * the intervals arrive precomputed from `reviewQueue` in the catalog, which runs
 * the same SM-2 a grade does, so nothing in the browser can disagree with what
 * pressing a button will write.
 */

/**
 * The four ratings in button order. The index is the rating
 * `POST /api/review/grade` takes; the catalog maps it onto SM-2's 1, 3, 4, 5
 * (`REVIEW_RATINGS` in `services/catalog/src/state/review.ts`).
 */
export type Rating = 0 | 1 | 2 | 3;

export const RATING_LABEL = ["Again", "Hard", "Good", "Easy"] as const;

/** A check card grades itself: right is Good, wrong is Again. */
export const RATING_IF_CORRECT: Rating = 2;
export const RATING_IF_WRONG: Rating = 0;

export function isRating(value: unknown): value is Rating {
  return value === 0 || value === 1 || value === 2 || value === 3;
}

/** One card as the page receives it. Everything the render needs, nothing it must look up. */
export interface ReviewItem {
  conceptId: string;
  title: string;
  summary: string;
  domain: string | null;
  /** `check`: a multiple-choice question from the note's first check block. `recall`: prompt and answer. */
  kind: "check" | "recall";
  prompt: string;
  answer: string;
  /** The check's `why:` line, shown behind "Why?". */
  why: string | null;
  /** The check's `source:` line, shown as a citation. */
  source: string | null;
  /** Check cards only: the options, and which one is right. */
  choices: string[] | null;
  correct: number | null;
  /** How many check blocks the note holds. */
  checks: number;
  /** The interval each rating would give, in days, index = rating. */
  intervals: [number, number, number, number];
  ease: number | null;
  repetitions: number;
  lapses: number;
  leech: boolean;
  lastReviewed: string | null;
  due: string | null;
}

/** The shape `GET /api/review/due` answers with, and the page's initial props. */
export interface ReviewSessionData {
  reachable: boolean;
  items: ReviewItem[];
  nextDue: string | null;
}

/** A check block, as `concept-note-core` reads it. */
export interface CheckLike {
  question: string;
  answer: string;
  why: string;
  source: string;
}

/** The fewest wrong options a multiple-choice card is worth showing. */
export const MIN_DISTRACTORS = 2;
export const MAX_CHOICES = 4;

/**
 * FNV-1a over a string. A seed, not a hash anyone relies on: it makes the
 * options for a card the same on every render, on the server and the client,
 * and different from one card to the next.
 */
export function seedOf(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** A small deterministic PRNG (mulberry32), so a shuffle is repeatable. */
function random(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffled<T>(list: readonly T[], seed: number): T[] {
  const out = [...list];
  const next = random(seed);
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(next() * (i + 1));
    [out[i], out[j]] = [out[j] as T, out[i] as T];
  }
  return out;
}

const norm = (text: string) => text.trim().replace(/\s+/g, " ").toLowerCase();

/**
 * The options for a check card: its own answer and up to three wrong ones from
 * `pool`, in an order fixed by the concept id. Null when the pool cannot supply
 * `MIN_DISTRACTORS`, in which case the card is asked as recall instead.
 *
 * The notes hold no authored wrong options (a check block is `q`, `a`, `why`
 * and `source`), so the wrong ones are other notes' answers and summaries: real
 * statements about neighbouring ideas, never invented ones. `pool` is in
 * preference order; the caller puts other checks' answers and same-domain
 * summaries first, since those read most like an answer to this question.
 */
export function buildChoices(
  conceptId: string,
  answer: string,
  pool: readonly string[],
): { choices: string[]; correct: number } | null {
  if (answer.trim() === "") return null;
  const seen = new Set([norm(answer)]);
  const candidates: string[] = [];
  for (const text of pool) {
    const key = norm(text);
    if (key === "" || seen.has(key)) continue;
    seen.add(key);
    candidates.push(text.trim());
  }
  if (candidates.length < MIN_DISTRACTORS) return null;

  const seed = seedOf(conceptId);
  // Draw from the front of the preference order, shuffled within it, so the
  // best distractors are used first but not always in the same slots.
  const wrong = shuffled(candidates.slice(0, (MAX_CHOICES - 1) * 2), seed).slice(0, MAX_CHOICES - 1);
  const choices = shuffled([answer.trim(), ...wrong], seed ^ 0x9e3779b9);
  return { choices, correct: choices.indexOf(answer.trim()) };
}

/** Compact for the phone's rating buttons ("4d"), words for the desktop ("4 days"). */
export function formatInterval(days: number, compact = false): string {
  const d = Math.max(0, Math.round(days));
  if (d < 31) return compact ? `${d}d` : `${d} ${d === 1 ? "day" : "days"}`;
  if (d < 365) {
    const m = Math.round(d / 30);
    return compact ? `${m}mo` : `${m} ${m === 1 ? "month" : "months"}`;
  }
  const y = Math.round((d / 365) * 10) / 10;
  return compact ? `${y}y` : `${y} ${y === 1 ? "year" : "years"}`;
}

/** Whole days between two instants, on the calendar rather than by 24-hour blocks. */
function calendarDays(from: Date, to: Date): number {
  const a = Date.UTC(from.getFullYear(), from.getMonth(), from.getDate());
  const b = Date.UTC(to.getFullYear(), to.getMonth(), to.getDate());
  return Math.round((b - a) / 86_400_000);
}

/** "today", "yesterday", "4 days ago". */
export function formatAgo(iso: string | null, now: Date): string | null {
  if (iso === null) return null;
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return null;
  const days = calendarDays(then, now);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  return `${days} days ago`;
}

/** "today", "tomorrow", "in 3 days", or a date past a week. */
export function formatDue(iso: string | null, now: Date): string | null {
  if (iso === null) return null;
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return null;
  const days = calendarDays(now, then);
  if (days <= 0) return "today";
  if (days === 1) return "tomorrow";
  if (days < 7) return `in ${days} days`;
  return then.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

/**
 * Minutes left, at thirty seconds a card. A round number for a header, not a
 * measurement: nothing records how long a review takes.
 */
export const SECONDS_PER_CARD = 30;
export function minutesLeft(cards: number): number {
  return Math.max(0, Math.ceil((cards * SECONDS_PER_CARD) / 60));
}

/** "algorithms", "mostly algorithms", or null when the queue has no plurality. */
export function queueDomain(domains: readonly (string | null)[]): string | null {
  const counts = new Map<string, number>();
  for (const d of domains) if (d !== null) counts.set(d, (counts.get(d) ?? 0) + 1);
  let best: [string, number] | null = null;
  for (const entry of counts) if (best === null || entry[1] > best[1]) best = entry;
  if (best === null) return null;
  if (best[1] === domains.length) return best[0];
  return best[1] * 2 > domains.length ? `mostly ${best[0]}` : null;
}

/** The footer's card line: "ease 2.5 · 4 reps · last seen 4 days ago", or "new card". */
export function cardStats(item: Pick<ReviewItem, "ease" | "repetitions" | "lastReviewed">, now: Date): string {
  if (item.ease === null) return "new card";
  const parts = [`ease ${Number(item.ease.toFixed(2))}`, `${item.repetitions} ${item.repetitions === 1 ? "rep" : "reps"}`];
  const ago = formatAgo(item.lastReviewed, now);
  if (ago !== null) parts.push(`last seen ${ago}`);
  return parts.join(" · ");
}
