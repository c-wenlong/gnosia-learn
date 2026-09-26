import "server-only";

import { readFile } from "node:fs/promises";
import path from "node:path";

import { connection } from "next/server";
import {
  dueReviews,
  notePaths,
  readEvents,
  readKnowledgeBase,
  readLearnerSnapshot,
  readPreferences,
  type CatalogDatabase,
  type KbConcept,
} from "@self-learn/catalog/state";

import { courses } from "@/data/courses";
import { REPO_ROOT } from "@/data/repo-root";
import { findTopicAcrossCourses } from "@/lib/agent/lookup";
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

  const { kb, events, preferences, due, snapshot } = rows;
  const byId = new Map(kb.concepts.map((c) => [c.id, c]));
  const title = (id: string) => byId.get(id)?.title ?? id;

  const first = kb.frontier.map((id) => byId.get(id)).find((c): c is KbConcept => c !== undefined);
  const nextUp: NextUp | null = first === undefined ? null : toNextUp(first, placeOf(first), now, timeZone);

  const shown = due.slice(0, REVIEW_ROWS);
  const checks = await checkCounts(db, shown.map((card) => card.conceptId));
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
      limit: ACTIVITY_ROWS,
    }),
    habit: computeHabit({ events, preferences, dueReviews: due.length, now, timeZone }),
    courses: coursesInProgress(
      courses.map((c) => ({
        slug: c.slug,
        code: c.code,
        title: c.title,
        order: c.order,
        topicIds: c.modules.flatMap((m) => m.topics.map((t) => t.id)),
      })),
      snapshot.completed,
    ),
  };
}

/** The dashboard for this request. */
export async function loadToday(): Promise<TodayModel> {
  await connection();
  return readToday();
}

async function readAll(db: CatalogDatabase, now: Date) {
  const [kb, events, preferences, due, snapshot] = await Promise.all([
    readKnowledgeBase(db),
    readEvents(db),
    readPreferences(db),
    dueReviews(db, { now }),
    readLearnerSnapshot(db),
  ]);
  return { kb, events, preferences, due, snapshot };
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
    courses: [],
  };
}

/**
 * Where a concept sits on the courses: the first curriculum item it supports
 * that a course still has. A note links to items through its `topics:`
 * frontmatter, and most notes link to none, so the domain folder is the
 * fallback the eyebrow prints.
 */
function placeOf(concept: KbConcept): { courseCode?: string; moduleOrder?: number; domain?: string | null } {
  for (const item of concept.topics) {
    const found = findTopicAcrossCourses(item);
    if (found !== undefined) return { courseCode: found.course.code, moduleOrder: found.module.order };
  }
  return { domain: concept.domain };
}

/**
 * How many check blocks each concept's note holds, read from the files the
 * catalog indexed. A note that cannot be read (a deployment without `learn/`,
 * a file moved since the last index) counts as none, which the row prints as
 * "recall": the card is still due, it just has nothing stored to ask.
 */
async function checkCounts(db: CatalogDatabase, slugs: string[]): Promise<Record<string, number>> {
  if (slugs.length === 0) return {};
  let paths: Record<string, string>;
  try {
    paths = await notePaths(db, slugs);
  } catch {
    // The rest of the dashboard was read a moment ago; losing the counts
    // costs the "check · 2" labels, not the page.
    return {};
  }
  const root = path.resolve(REPO_ROOT);
  const entries = await Promise.all(
    Object.entries(paths).map(async ([slug, relative]) => {
      const file = path.resolve(root, relative);
      // The path came from the index, which read it out of git, but a row is
      // still data: a note is a Markdown file inside the repository or it is
      // not read.
      if (!file.startsWith(root + path.sep) || !file.endsWith(".md")) return [slug, 0] as const;
      try {
        return [slug, countCheckBlocks(await readFile(file, "utf8"))] as const;
      } catch {
        return [slug, 0] as const;
      }
    }),
  );
  return Object.fromEntries(entries);
}
