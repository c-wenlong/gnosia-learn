import "server-only";

import { connection } from "next/server";
import {
  dueReviews,
  readKnowledgeBase,
  readLearnerSnapshot,
  readPreferences,
  recentActivity,
  recentDrafts,
  recentTutorSessions,
  type CatalogDatabase,
  type RecentDraft,
  type RecentSession,
  type KbConcept,
} from "@gnosia/catalog/state";

import { getCourses } from "@/data/courses";
import { getTopics } from "@/data/topics";
import { ContentUnavailableError } from "@/data/source";
import { findTopicAcrossCourses } from "@gnosia/tutor/lookup";
import type { Course } from "@gnosia/tutor/types";
import { continueHref, conceptsForTopic, itemDoneWith, itemStanding, resolveTopicMastery } from "@/lib/course-path";
import { activeOnly } from "@/lib/course-summary";
import { dayKey } from "@gnosia/tutor/days";
import {
  coursesInProgress,
  homeThreads,
  nearThreads,
  nextFromHere,
  recallPicks,
  toNextUp,
  type HomeModel,
  type NextUp,
  type PathCourse,
} from "@/lib/home-core";
import { catalogDatabase } from "@/lib/learner-store";
import { currentOwner, ownerScope } from "@/lib/owner";
import { recentSources } from "@/lib/recent";
import { studioEnabled } from "@/lib/studio";
import { appTimeZone } from "@gnosia/tutor/server/time-zone";

/**
 * Everything Home shows, read in one pass (docs/proposals/home-page.md).
 *
 * The arithmetic and the words are `home-core.ts`; this file fetches the rows
 * and degrades the way `learner-store.ts` does: a database that cannot be
 * reached is the empty page with `reachable: false`, never a thrown render,
 * and the shell's banner is what says so.
 */

/** Threads under "Pick up where you left off". */
const THREAD_ROWS = 5;
/** Courses the card lists; it says how many more there are. */
const COURSE_ROWS = 4;

export async function readHome(now: Date = new Date()): Promise<HomeModel> {
  const timeZone = appTimeZone();
  // Whose page, resolved before the degradation below: a request with no
  // owner fails rather than reading as an empty learner (phase 4).
  const owner = await currentOwner();
  let db: CatalogDatabase;
  let rows: Awaited<ReturnType<typeof readAll>>;
  try {
    db = await catalogDatabase();
    rows = await readAll(db, now, owner);
  } catch (error) {
    // A courses type that is not flipped is not an outage. The database
    // answered, so the shell shows no banner, and the empty page would read
    // as a learner with no courses; the error boundary names the flip
    // instead, as it does on every other page.
    if (error instanceof ContentUnavailableError && error.reason === "not-flipped") throw error;
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`home: page unavailable, ${message}`);
    return emptyHome(now, timeZone);
  }

  const { kb, events, preferences, due, snapshot, courses, drafts, sessions, topics } = rows;
  const byId = new Map(kb.concepts.map((c) => [c.id, c]));

  // A course set aside on the Courses page is left off the card, as it is
  // left out of Continue learning there, and "Next from here" does not walk it.
  const active = activeOnly(courses, snapshot.inactiveCourses);
  const courseRows = active.map((c) => ({
    slug: c.slug,
    code: c.code,
    title: c.title,
    order: c.order,
    topicIds: c.modules.flatMap((m) => m.topics.map((t) => t.id)),
  }));
  const standing = itemStanding(kb.concepts, courseRows.flatMap((c) => c.topicIds));

  // Recent's own sources (`recent.ts`), the list the sidebar shows too; Home
  // takes its first rows.
  const sources = await recentSources(
    db,
    { events, preferences, drafts, sessions, concepts: kb.concepts, courses },
    ownerScope(owner),
  );
  const threads = homeThreads(sources, { now, timeZone, limit: THREAD_ROWS });
  // A course opened counts as started, as the sidebar's Courses section has it.
  const opened = new Set(sources.modules.map((visit) => visit.courseSlug));
  const started = coursesInProgress(courseRows, snapshot.completed, standing, opened);

  const paths: PathCourse[] = active.map((c) => ({
    slug: c.slug,
    code: c.code,
    order: c.order,
    modules: c.modules.map((m) => ({
      slug: m.slug,
      order: m.order,
      topics: m.topics.map((t) => ({ id: t.id, title: t.title })),
    })),
  }));
  const next = nextFromHere(threads, {
    concepts: kb.concepts,
    frontier: kb.frontier,
    courses: paths,
    done: itemDoneWith(standing, snapshot.completed),
    // The course page's own rule (`course-home.ts`), with the module's
    // authored concept order, so a topic's Continue goes to the same concept
    // from either page.
    topicHref: (course, moduleSlug, topicId) => {
      const vocabulary = active.find((c) => c.slug === course.slug)?.modules.find((m) => m.slug === moduleSlug)?.topic;
      const authored = topics.find((t) => t.slug === vocabulary)?.maps.concepts ?? [];
      const mastery = resolveTopicMastery(conceptsForTopic(kb.concepts, topicId, authored), kb.frontier);
      return continueHref(course.slug, moduleSlug, topicId, mastery);
    },
  });

  // The old single pick, kept for a page whose threads open nothing.
  const first = kb.frontier.map((id) => byId.get(id)).find((c): c is KbConcept => c !== undefined);
  const nextUp: NextUp | null =
    next.length > 0 || first === undefined ? null : toNextUp(first, placeOf(courses, first), now, timeZone);

  const recall = recallPicks(due, nearThreads(threads, next, kb.concepts, paths), kb.concepts, { now, timeZone });

  return {
    reachable: true,
    asOf: now.toISOString(),
    today: dayKey(now, timeZone),
    conceptCount: kb.concepts.length,
    threads,
    next,
    nextUp,
    recall,
    courses: { rows: started.slice(0, COURSE_ROWS), total: started.length },
  };
}

/** Home for this request. */
export async function loadHome(): Promise<HomeModel> {
  await connection();
  return readHome();
}

async function readAll(db: CatalogDatabase, now: Date, owner: string) {
  // The courses are read with the rows because they are rows (track B of
  // docs/CONTENT-MIGRATION.md), and a course read that fails because the
  // database is down degrades like the others: the empty page, not a thrown
  // render. One refused because courses are not flipped is rethrown by
  // `readHome`. Drafts are the studio's, so a deployment without one does
  // not ask for them.
  const [kb, events, preferences, due, snapshot, courses, drafts, sessions, topics] = await Promise.all([
    readKnowledgeBase(db, owner),
    // The log folded per module and concept, the newest few concepts only:
    // Home lists the first `THREAD_ROWS` of Recent and reads it for nothing else.
    recentActivity(db, owner, { limit: THREAD_ROWS }),
    readPreferences(db, owner),
    dueReviews(db, { now, learnerId: owner }),
    readLearnerSnapshot(db, owner),
    getCourses(),
    studioEnabled() ? draftsOrNone(db, owner) : Promise.resolve([]),
    sessionsOrNone(db, owner),
    // The topic vocabulary only orders a topic's concepts for its Continue
    // link; without it the order falls back to the note positions.
    getTopics().catch(() => []),
  ]);
  return { kb, events, preferences, due, snapshot, courses, drafts, sessions, topics };
}

/** The owner's tutor sessions, or none when they cannot be read: a missing row kind is no reason to empty the page. */
async function sessionsOrNone(db: CatalogDatabase, owner: string): Promise<RecentSession[]> {
  try {
    return await recentTutorSessions(db, owner, THREAD_ROWS);
  } catch (error) {
    console.warn(`home: tutor sessions unavailable, ${error instanceof Error ? error.message : String(error)}`);
    return [];
  }
}

/**
 * The studio's drafts, or none when they cannot be read. They are the one
 * read here that a database can lack while answering every other (a studio
 * turned on before its migrations ran), and a missing thread kind is no
 * reason to empty the page.
 */
async function draftsOrNone(db: CatalogDatabase, owner: string): Promise<RecentDraft[]> {
  try {
    return await recentDrafts(db, owner, THREAD_ROWS);
  } catch (error) {
    console.warn(`home: studio drafts unavailable, ${error instanceof Error ? error.message : String(error)}`);
    return [];
  }
}

export function emptyHome(now: Date, timeZone?: string): HomeModel {
  return {
    reachable: false,
    asOf: now.toISOString(),
    today: dayKey(now, timeZone),
    conceptCount: 0,
    threads: [],
    next: [],
    nextUp: null,
    recall: [],
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
