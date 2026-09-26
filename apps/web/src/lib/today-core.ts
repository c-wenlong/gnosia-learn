/**
 * The Today dashboard's arithmetic and words (hi-fi screens 01 and 13): the
 * review rows, the recent-activity rows, the streak strip, the target
 * checklist and the courses in progress, from rows the server has already
 * read.
 *
 * Pure and React-free, so the page, `GET /api/learner/today` and a test all
 * call the same functions. `today.ts` is the server half that reads the
 * catalog and the concept notes and hands the rows here.
 *
 * Every date is turned into a calendar day in one time zone (`dayKey` from
 * `habit-core`, the same one the streak counts in) before it is compared, so
 * "yesterday" on the activity list and "yesterday" on the streak strip are
 * the same day.
 */

import type { MasteryLabel } from "@self-learn/catalog/state";

import {
  dayKey,
  type Habit,
  type HabitEvent,
  type StreakDay,
  type StreakDayState,
} from "@/lib/habit-core";
import { bucketOf, type MasteryBucket } from "@/lib/mastery-bucket";
import { numberWord } from "@/lib/preferences";

/* -------------------------------------------------------------------------- */
/* The model                                                                  */
/* -------------------------------------------------------------------------- */

export interface NextUp {
  id: string;
  title: string;
  bucket: MasteryBucket;
  pL: number;
  /** "3 days ago", or null when the concept was never observed. */
  lastSeen: string | null;
  /** "Next on your path · CP4281 · Module 2". */
  eyebrow: string;
  /** "Next up · CP4281 M2", for the phone card. */
  eyebrowShort: string;
}

export interface ReviewRow {
  conceptId: string;
  title: string;
  bucket: MasteryBucket;
  /** Whole days past due; 0 when it fell due today. */
  overdueDays: number;
  /** "due today", "overdue 3d". */
  dueLabel: string;
  /** "today", "3d late". */
  dueShort: string;
  /** Check blocks in the concept note; 0 means the card is a plain recall. */
  checks: number;
  /** "check · 2" or "recall". */
  kindLabel: string;
}

export type ActivityKind = "Teach" | "Probe" | "Review";

export interface ActivityRow {
  key: string;
  /** ISO instant of the group's last event. */
  at: string;
  /** "Today", "Yesterday", "Mon", "20 Aug". */
  day: string;
  kind: ActivityKind;
  /** "Teach · Cross product · 5 of 6 right". */
  text: string;
  /** "Teach · Cross product · 5/6", for the phone. */
  short: string;
  /** "p(L) 0.31 to 0.55", "next due Fri", or null. */
  detail: string | null;
}

export interface TargetRow {
  id: "reviews" | "concepts";
  label: string;
  done: boolean;
  /** "done", "open", "3 due", "1 of 2". */
  status: string;
}

export interface CourseInProgress {
  slug: string;
  code: string;
  title: string;
  completed: number;
  total: number;
  percent: number;
}

export interface TodayModel {
  /** False when the catalog could not be read; everything below is then empty. */
  reachable: boolean;
  asOf: string;
  /** Today as a `YYYY-MM-DD` key in the habit's time zone. */
  today: string;
  /** Concepts the catalog knows. Zero is a fresh database, which the empty states say. */
  conceptCount: number;
  nextUp: NextUp | null;
  reviews: { total: number; estimateMinutes: number; rows: ReviewRow[] };
  activity: ActivityRow[];
  habit: Habit;
  courses: CourseInProgress[];
}

/* -------------------------------------------------------------------------- */
/* Days                                                                       */
/* -------------------------------------------------------------------------- */

const DAY_MS = 86_400_000;
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function keyToUtc(key: string): number {
  const [y, m, d] = key.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

/** Whole days from `from` to `to` (both `YYYY-MM-DD`); negative when `to` is earlier. */
export function dayDiff(from: string, to: string): number {
  return Math.round((keyToUtc(to) - keyToUtc(from)) / DAY_MS);
}

function weekdayOf(key: string): number {
  return new Date(keyToUtc(key)).getUTCDay();
}

function shortDate(key: string, today: string): string {
  const [y, m, d] = key.split("-").map(Number);
  const base = `${d} ${MONTHS[m - 1]}`;
  return key.slice(0, 4) === today.slice(0, 4) ? base : `${base} ${y}`;
}

/** A past day, as the activity list names it: "Today", "Yesterday", "Mon", "20 Aug". */
export function pastDayLabel(key: string, today: string): string {
  const diff = dayDiff(key, today);
  if (diff <= 0) return "Today";
  if (diff === 1) return "Yesterday";
  if (diff < 7) return WEEKDAYS[weekdayOf(key)].slice(0, 3);
  return shortDate(key, today);
}

/** A coming day: "today", "tomorrow", "Fri", "12 Oct". Lower case: it ends a phrase. */
export function futureDayLabel(key: string, today: string): string {
  const diff = dayDiff(today, key);
  if (diff <= 0) return "today";
  if (diff === 1) return "tomorrow";
  if (diff < 7) return WEEKDAYS[weekdayOf(key)].slice(0, 3);
  return shortDate(key, today);
}

/** "today", "yesterday", "3 days ago", "on 20 Aug". */
export function lastSeenLabel(at: string | null, now: Date, timeZone?: string): string | null {
  if (at === null) return null;
  const then = new Date(at);
  if (Number.isNaN(then.getTime())) return null;
  const today = dayKey(now, timeZone);
  const key = dayKey(then, timeZone);
  const diff = dayDiff(key, today);
  if (diff <= 0) return "today";
  if (diff === 1) return "yesterday";
  if (diff < 30) return `${diff} days ago`;
  return `on ${shortDate(key, today)}`;
}

/* -------------------------------------------------------------------------- */
/* Reviews due                                                                */
/* -------------------------------------------------------------------------- */

/** How far past due a card is, in whole calendar days, and the two ways of saying it. */
export function dueLabel(
  due: string,
  now: Date,
  timeZone?: string,
): { overdueDays: number; long: string; short: string } {
  const diff = Math.max(0, dayDiff(dayKey(due, timeZone), dayKey(now, timeZone)));
  if (diff === 0) return { overdueDays: 0, long: "due today", short: "today" };
  return { overdueDays: diff, long: `overdue ${diff}d`, short: `${diff}d late` };
}

/**
 * Minutes a queue of `cards` takes, for the "Est. 9 min" beside Start review.
 * 45 seconds a card: a recall is a few seconds of thought and a rating, a
 * check is a question to read and answer. It is labelled an estimate on
 * screen, and nothing but that label reads it.
 */
export function estimateMinutes(cards: number): number {
  if (cards <= 0) return 0;
  return Math.max(1, Math.round(cards * 0.75));
}

/**
 * The check blocks a concept note holds: fenced ```` ```check ```` blocks with a
 * non-empty `q:` line. The same rule as `parseChecks` in
 * `scripts/learn/lib/markdown.mjs`, which the web app may not import
 * (ARCHITECTURE.md layering rule 1), so a check the CLI would not ask is not
 * counted here either.
 */
export function countCheckBlocks(body: string): number {
  const re = /```check\s*\r?\n([\s\S]*?)```/g;
  let count = 0;
  let match: RegExpExecArray | null;
  while ((match = re.exec(body)) !== null) {
    let field: string | null = null;
    let question = "";
    for (const line of match[1].split(/\r?\n/)) {
      const pair = line.match(/^\s*(q|a|why|source):\s*(.*)$/i);
      if (pair) {
        field = pair[1].toLowerCase();
        if (field === "q") question = pair[2].trim();
      } else if (field === "q" && line.trim()) {
        question = `${question} ${line.trim()}`.trim();
      }
    }
    if (question !== "") count += 1;
  }
  return count;
}

export function reviewKindLabel(checks: number): string {
  return checks > 0 ? `check · ${checks}` : "recall";
}

/* -------------------------------------------------------------------------- */
/* Recent activity                                                            */
/* -------------------------------------------------------------------------- */

interface Group {
  key: string;
  kind: ActivityKind;
  review: boolean;
  events: HabitEvent[];
}

function kindOf(event: HabitEvent): ActivityKind {
  if (event.type === "review") return "Review";
  const source = event.source ?? "probe";
  if (source === "teach") return "Teach";
  if (source === "review") return "Review";
  return "Probe";
}

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/**
 * The last few things the learner did, one row per sitting.
 *
 * Answered questions (`observation`) group by session and kind, so a probe
 * across seven concepts is one row rather than seven; answers with no
 * session group by day and kind. Graded review cards (`review`) carry no
 * session and group by day. `session-start` and `session-close` are
 * bookkeeping and never make a row, and anything inside a session a `void`
 * retracted is left out, as the streak leaves it out.
 *
 * A row about one concept names it and prints its p(L) before and after; a
 * row about several prints how many went up and down.
 */
export function activityRows(
  events: readonly HabitEvent[],
  options: {
    now: Date;
    timeZone?: string;
    title: (conceptId: string) => string;
    /** The concept's next review, if it has a card. */
    nextDue?: (conceptId: string) => string | null;
    limit?: number;
  },
): ActivityRow[] {
  const { now, timeZone, title, nextDue, limit = 4 } = options;
  const today = dayKey(now, timeZone);
  const voided = new Set(
    events
      .filter((e) => e.type === "void" && typeof e.session === "string" && e.session !== "")
      .map((e) => e.session as string),
  );

  const groups = new Map<string, Group>();
  const ordered = [...events]
    .filter((e) => (e.type === "observation" || e.type === "review") && !Number.isNaN(new Date(e.at).getTime()))
    .filter((e) => !(typeof e.session === "string" && voided.has(e.session)))
    .sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());

  for (const e of ordered) {
    const kind = kindOf(e);
    const review = e.type === "review";
    const day = dayKey(e.at, timeZone);
    const sitting = !review && typeof e.session === "string" && e.session !== "" ? `s:${e.session}` : `d:${day}`;
    const key = `${review ? "review" : "obs"}:${sitting}:${kind}`;
    const group = groups.get(key);
    if (group === undefined) groups.set(key, { key, kind, review, events: [e] });
    else group.events.push(e);
  }

  const last = (g: Group) => g.events[g.events.length - 1];
  return [...groups.values()]
    .sort((a, b) => new Date(last(b).at).getTime() - new Date(last(a).at).getTime())
    .slice(0, limit)
    .map((g) => {
      const at = last(g).at;
      const base = { key: g.key, at, day: pastDayLabel(dayKey(at, timeZone), today), kind: g.kind };
      const concepts = [...new Set(g.events.map((e) => e.concept).filter((c): c is string => typeof c === "string"))];
      return g.review
        ? { ...base, ...reviewText(g, concepts, today, timeZone, nextDue) }
        : { ...base, ...observationText(g, concepts, title) };
    });
}

function observationText(
  g: Group,
  concepts: string[],
  title: (id: string) => string,
): { text: string; short: string; detail: string | null } {
  const total = g.events.length;
  const right = g.events.filter((e) => e.correct === true).length;
  const subject = concepts.length === 1 ? title(concepts[0]) : plural(concepts.length, "concept", "concepts");

  // p(L) before the first answer and after the last, per concept.
  const moves = concepts.map((id) => {
    const mine = g.events.filter((e) => e.concept === id);
    return { before: num(mine[0].pLBefore), after: num(mine[mine.length - 1].pLAfter) };
  });
  let detail: string | null = null;
  if (concepts.length === 1) {
    const { before, after } = moves[0];
    if (before !== null && after !== null) detail = `p(L) ${before.toFixed(2)} to ${after.toFixed(2)}`;
  } else {
    const known = moves.filter((m) => m.before !== null && m.after !== null) as { before: number; after: number }[];
    const up = known.filter((m) => m.after > m.before).length;
    const down = known.filter((m) => m.after < m.before).length;
    const parts = [up > 0 ? `${up} up` : null, down > 0 ? `${down} down` : null].filter(Boolean);
    if (parts.length > 0) detail = `p(L) ${parts.join(" · ")}`;
  }

  return {
    text: `${g.kind} · ${subject} · ${right} of ${total} right`,
    short: `${g.kind} · ${subject} · ${right}/${total}`,
    detail,
  };
}

function reviewText(
  g: Group,
  concepts: string[],
  today: string,
  timeZone: string | undefined,
  nextDue: ((id: string) => string | null) | undefined,
): { text: string; short: string; detail: string | null } {
  const cards = concepts.length;
  // Grades are SM-2's 0 to 5; below 3 is a lapse, which Anki calls "again".
  const again = g.events.filter((e) => typeof e.grade === "number" && e.grade < 3).length;
  let detail: string | null = null;
  if (nextDue !== undefined) {
    const upcoming = concepts
      .map((id) => nextDue(id))
      .filter((d): d is string => typeof d === "string" && !Number.isNaN(new Date(d).getTime()))
      .map((d) => dayKey(d, timeZone))
      .filter((key) => key >= today)
      .sort();
    if (upcoming.length > 0) detail = `next due ${futureDayLabel(upcoming[0], today)}`;
  }
  return {
    text: `Review · ${plural(cards, "card", "cards")} · ${again} again`,
    short: `Review · ${plural(cards, "card", "cards")}`,
    detail,
  };
}

/* -------------------------------------------------------------------------- */
/* Next up                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * The eyebrow over the next concept: where it sits on a course when a
 * curriculum item links it, its note's folder when none does.
 */
export function nextUpEyebrows(place: {
  courseCode?: string | null;
  moduleOrder?: number | null;
  domain?: string | null;
}): { eyebrow: string; eyebrowShort: string } {
  const { courseCode, moduleOrder, domain } = place;
  if (courseCode) {
    const unit = typeof moduleOrder === "number" ? moduleOrder : null;
    return {
      eyebrow: ["Next on your path", courseCode, unit !== null ? `Module ${unit}` : null].filter(Boolean).join(" · "),
      eyebrowShort: `Next up · ${courseCode}${unit !== null ? ` M${unit}` : ""}`,
    };
  }
  if (domain) return { eyebrow: `Next on your path · ${domain}`, eyebrowShort: `Next up · ${domain}` };
  return { eyebrow: "Next on your path", eyebrowShort: "Next up" };
}

/** The fields of a `KbConcept` the dashboard reads. */
export interface ConceptLike {
  id: string;
  title: string;
  pL: number;
  mastery: MasteryLabel;
  observations: number;
  lastSeen: string | null;
}

export function toNextUp(
  concept: ConceptLike,
  place: Parameters<typeof nextUpEyebrows>[0],
  now: Date,
  timeZone?: string,
): NextUp {
  return {
    id: concept.id,
    title: concept.title,
    bucket: bucketOf(concept),
    pL: concept.pL,
    lastSeen: lastSeenLabel(concept.lastSeen, now, timeZone),
    ...nextUpEyebrows(place),
  };
}

/* -------------------------------------------------------------------------- */
/* The right column                                                           */
/* -------------------------------------------------------------------------- */

/** The two checklist rows under the target bar. Facts, not nudges. */
export function targetRows(habit: Habit): TargetRow[] {
  const { target, reachable } = habit;
  const rows: TargetRow[] = [];
  if (target.target.reviews) {
    const done = reachable && target.reviewsCleared;
    rows.push({
      id: "reviews",
      label: "Reviews cleared",
      done,
      status: !reachable ? "not read" : done ? "done" : `${target.dueReviews} due`,
    });
  }
  const want = target.target.concepts;
  if (want > 0) {
    const done = reachable && target.conceptsDone >= want;
    rows.push({
      id: "concepts",
      label: want === 1 ? "One concept taught" : `${numberWord(want)} concepts taught`,
      done,
      status: !reachable ? "not read" : done ? "done" : want === 1 ? "open" : `${target.conceptsDone} of ${want}`,
    });
  }
  return rows;
}

export interface StreakDisc {
  date: string;
  /** "M", "T", ... */
  letter: string;
  state: StreakDayState;
  isToday: boolean;
  /** "Monday, studied": what a screen reader hears for the disc. */
  description: string;
}

const STATE_WORDS: Record<StreakDayState, string> = {
  done: "studied",
  forgiven: "missed, covered by a free miss",
  missed: "missed",
  today: "today, nothing recorded yet",
  future: "not yet",
};

/** The seven discs of the streak card, Monday first, from the habit's `week`. */
export function streakStrip(week: readonly StreakDay[], today: string): StreakDisc[] {
  return week.map(({ date, state }) => {
    const name = WEEKDAYS[weekdayOf(date)];
    return {
      date,
      letter: name[0],
      state,
      isToday: date === today,
      description: `${name}, ${date === today && state === "done" ? "today, studied" : STATE_WORDS[state]}`,
    };
  });
}

/** "1 free miss left this week", "No free misses set". */
export function leewayLine(habit: Habit): string {
  const { leeway, leewayLeft } = habit.streak;
  if (leeway === 0) return "No free misses set";
  return `${leewayLeft} free ${leewayLeft === 1 ? "miss" : "misses"} left this week`;
}

/** The courses with at least one topic ticked, furthest along first. */
export function coursesInProgress(
  courses: readonly { slug: string; code: string; title: string; order: number; topicIds: readonly string[] }[],
  completed: Readonly<Record<string, true>>,
  limit = 4,
): CourseInProgress[] {
  return courses
    .map((c) => {
      const total = c.topicIds.length;
      const done = c.topicIds.filter((id) => completed[id]).length;
      const row: CourseInProgress = {
        slug: c.slug,
        code: c.code,
        title: c.title,
        completed: done,
        total,
        percent: total === 0 ? 0 : Math.round((done / total) * 100),
      };
      return { row, order: c.order };
    })
    .filter(({ row }) => row.completed > 0)
    .sort((a, b) => b.row.percent - a.row.percent || a.order - b.order)
    .slice(0, limit)
    .map(({ row }) => row);
}
