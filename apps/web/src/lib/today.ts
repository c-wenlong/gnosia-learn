import "server-only";

import { connection } from "next/server";
import {
  assetsByIds,
  dueReviews,
  readEvents,
  readKnowledgeBase,
  readLearnerSnapshot,
  readPreferences,
  type CatalogDatabase,
  type KbConcept,
} from "@self-learn/catalog/state";

import { getCourses } from "@/data/courses";
import { contentSource } from "@/data/source";
import { findTopicAcrossCourses } from "@/lib/agent/lookup";
import type { Course } from "@/lib/types";
import { itemStanding } from "@/lib/course-path";
import { computeHabit, dayKey, emptyHabit } from "@/lib/habit-core";
import { habitTimeZone } from "@/lib/habit";
import { catalogDatabase } from "@/lib/learner-store";
import { bucketOf } from "@/lib/mastery-bucket";
import {
  activityRows,
  countCheckBlocks,
  coursesInProgress,
  dueLabel,
  estimateMinutes,
  reviewKindLabel,
  toNextUp,
  type NextUp,
  type ReviewRow,
  type TodayModel,
} from "@/lib/today-core";

/**
 * Everything the Today dashboard shows, read in one pass.
 *
 * The arithmetic and the words are `today-core.ts`; this file fetches the
 * rows and degrades the way `habit.ts` and `learner-store.ts` do: a database
 * that cannot be reached is the empty dashboard with `reachable: false`, never
 * a thrown render, and the shell's banner is what says so.
 *
 * The habit numbers are computed here from the same event log and due queue
 * the rest of the page reads, rather than by calling `readHabit`, which would
 * read both again. The top bar's pills come from the root layout's own read;
 * both run `computeHabit` over the same rows, so they agree.
 */

/** Rows the reviews card lists; the count beside Start review is the whole queue. */
const REVIEW_ROWS = 5;
const ACTIVITY_ROWS = 4;
/** Courses the card lists; it says how many more there are. */
const COURSE_ROWS = 4;

export async function readToday(now: Date = new Date()): Promise<TodayModel> {
  const timeZone = habitTimeZone();
  let db: CatalogDatabase;
  let rows: Awaited<ReturnType<typeof readAll>>;
  try {
    db = await catalogDatabase();
    rows = await readAll(db, now);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`today: dashboard unavailable, ${message}`);
    return emptyToday(now, timeZone);
  }

  const { kb, events, preferences, due, snapshot, courses } = rows;
  const byId = new Map(kb.concepts.map((c) => [c.id, c]));
  const title = (id: string) => byId.get(id)?.title ?? id;

  const first = kb.frontier.map((id) => byId.get(id)).find((c): c is KbConcept => c !== undefined);
  const nextUp: NextUp | null =
    first === undefined ? null : toNextUp(first, placeOf(courses, first), now, timeZone);

  const courseRows = courses.map((c) => ({
    slug: c.slug,
    code: c.code,
    title: c.title,
    order: c.order,
    topicIds: c.modules.flatMap((m) => m.topics.map((t) => t.id)),
  }));
  const started = coursesInProgress(
    courseRows,
    snapshot.completed,
    itemStanding(kb.concepts, courseRows.flatMap((c) => c.topicIds)),
  );

  const shown = due.slice(0, REVIEW_ROWS);
  const [checks, assets] = await Promise.all([
    checkCounts(shown.map((card) => card.conceptId)),
    assetTitles(db, events),
  ]);
  const reviewRows: ReviewRow[] = shown.map((card) => {
    const concept = byId.get(card.conceptId);
    const when = dueLabel(card.due, now, timeZone);
    const count = checks[card.conceptId] ?? 0;
    return {
      conceptId: card.conceptId,
      title: title(card.conceptId),
      bucket: concept === undefined ? "untouched" : bucketOf(concept),
      overdueDays: when.overdueDays,
      dueLabel: when.long,
      dueShort: when.short,
      checks: count,
      kindLabel: reviewKindLabel(count),
    };
  });

  return {
    reachable: true,
    asOf: now.toISOString(),
    today: dayKey(now, timeZone),
    conceptCount: kb.concepts.length,
    nextUp,
    reviews: { total: due.length, estimateMinutes: estimateMinutes(due.length), rows: reviewRows },
    activity: activityRows(events, {
      now,
      timeZone,
      title,
      nextDue: (id) => byId.get(id)?.due ?? null,
      assetTitle: (id) => assets[id] ?? null,
      limit: ACTIVITY_ROWS,
    }),
    habit: computeHabit({ events, preferences, dueReviews: due.length, now, timeZone }),
    courses: { rows: started.slice(0, COURSE_ROWS), total: started.length },
  };
}

/** The dashboard for this request. */
export async function loadToday(): Promise<TodayModel> {
  await connection();
  return readToday();
}

async function readAll(db: CatalogDatabase, now: Date) {
  // The courses are read with the rows rather than after them because they
  // will be rows too (docs/CONTENT-MIGRATION.md, track B), and a course read
  // that fails has to degrade like the others: the empty dashboard, not a
  // thrown render.
  const [kb, events, preferences, due, snapshot, courses] = await Promise.all([
    readKnowledgeBase(db),
    readEvents(db),
    readPreferences(db),
    dueReviews(db, { now }),
    readLearnerSnapshot(db),
    getCourses(),
  ]);
  return { kb, events, preferences, due, snapshot, courses };
}

export function emptyToday(now: Date, timeZone?: string): TodayModel {
  return {
    reachable: false,
    asOf: now.toISOString(),
    today: dayKey(now, timeZone),
    conceptCount: 0,
    nextUp: null,
    reviews: { total: 0, estimateMinutes: 0, rows: [] },
    activity: [],
    habit: emptyHabit(now, timeZone),
    courses: { rows: [], total: 0 },
  };
}

/**
 * Where a concept sits on the courses: the first curriculum item it supports
 * that a course still has. A note links to items through its `topics:`
 * frontmatter, and most notes link to none, so the domain folder is the
 * fallback the eyebrow prints.
 */
function placeOf(
  courses: readonly Course[],
  concept: KbConcept,
): { courseCode?: string; moduleOrder?: number; domain?: string | null } {
  for (const item of concept.topics) {
    const found = findTopicAcrossCourses(courses, item);
    if (found !== undefined) return { courseCode: found.course.code, moduleOrder: found.module.order };
  }
  return { domain: concept.domain };
}

/**
 * How many check blocks each concept's note holds, read through the content
 * seam from `concept.body` (Track C of docs/CONTENT-MIGRATION.md). A note that
 * cannot be read (the database is down, concepts are not flipped, a slug with
 * no note) counts as none, which the row prints as "recall": the card is
 * still due, it just has nothing stored to ask.
 */
async function checkCounts(slugs: string[]): Promise<Record<string, number>> {
  if (slugs.length === 0) return {};
  const source = contentSource();
  const entries = await Promise.all(
    slugs.map(async (slug) => {
      try {
        const note = await source.concept(slug);
        return [slug, note === null ? 0 : countCheckBlocks(note.markdown)] as const;
      } catch {
        // The rest of the dashboard was read a moment ago; losing the counts
        // costs the "check · 2" labels, not the page.
        return [slug, 0] as const;
      }
    }),
  );
  return Object.fromEntries(entries);
}

/**
 * Titles for the library assets the log says were watched or read. A failed
 * lookup costs the titles (the rows print the asset id), not the page.
 */
async function assetTitles(db: CatalogDatabase, events: readonly { type: string; asset?: unknown }[]): Promise<Record<string, string>> {
  const ids = [
    ...new Set(events.filter((e) => e.type === "watched" && typeof e.asset === "string").map((e) => e.asset as string)),
  ];
  if (ids.length === 0) return {};
  try {
    const rows = await assetsByIds(db, ids);
    return Object.fromEntries(rows.filter((r) => r.title !== null).map((r) => [r.id, r.title as string]));
  } catch {
    return {};
  }
}
