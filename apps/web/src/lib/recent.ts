import "server-only";

import { PREFERENCE_KEYS } from "@gnosia/schema/shared";
import {
  asLastVisited,
  asRecentModules,
  assetsByIds,
  readLearnerSnapshot,
  readPreferences,
  recentActivity,
  recentConcepts,
  recentDrafts,
  recentTutorSessions,
  type CatalogDatabase,
  type EventRecord,
  type RecentConcept,
  type RecentDraft,
  type RecentSession,
} from "@gnosia/catalog/state";

import { getCourses } from "@/data/courses";
import { ContentUnavailableError } from "@/data/source";
import { conceptTouches } from "@/lib/home-core";
import { catalogDatabase } from "@/lib/learner-store";
import { bucketOf } from "@/lib/mastery-bucket";
import { currentOwner, ownerScope, type OwnerScope } from "@/lib/owner";
import { parsePlayback } from "@/lib/playback";
import {
  asPinned,
  moduleVisits,
  recentItems,
  recentPage,
  RECENT_PAGE,
  rowMatches,
  type ModulePlace,
  type ModuleVisit,
  type RecentModel,
  type RecentSources,
  type SidebarCourse,
  type SessionTouch,
  type VideoProgress,
} from "@/lib/recent-core";
import { studioEnabled } from "@/lib/studio";
import type { Course } from "@/lib/types";

/**
 * Recent, read from the catalog (L7 of
 * docs/proposals/library-by-type-and-day.md): the rows behind the sidebar's
 * Recent, Pinned and Courses sections, and behind Home's "Pick up where you
 * left off", which takes the first five of the same list (`recentSources`
 * then `homeThreads`).
 *
 * The arithmetic is `recent-core.ts`; this file fetches the rows for one
 * owner and degrades the way `home.ts` does: a database that cannot be
 * reached is an empty answer with `reachable: false`, never a thrown render.
 */

const PLAYBACK_PREFIX = "playback:";

/**
 * The rows Recent is built from, as `readRecent` and Home read them. `events`
 * is the log as `recentActivity` folds it (one record per module and per
 * concept), or the whole log, which folds to the same rows. `concepts` holds
 * at least the concepts those events and the sessions' goals name: Home
 * passes every note it read for the rest of its page, the sidebar only those.
 */
export interface RecentRows {
  events: readonly EventRecord[];
  preferences: Record<string, unknown>;
  drafts: readonly RecentDraft[];
  sessions: readonly RecentSession[];
  concepts: readonly RecentConcept[];
  courses: readonly Course[];
}

/**
 * The module visits the `recentModules` preference holds (or, for an owner
 * with no list yet, the one visit `lastVisited` holds). Recent merges them
 * with the `visit` events (`moduleVisits`) until the preference is left
 * unread, one release after the events began.
 */
export function storedVisits(preferences: Record<string, unknown>): ModuleVisit[] {
  const list = asRecentModules(preferences[PREFERENCE_KEYS.recentModules]);
  if (list !== undefined) return list;
  const last = asLastVisited(preferences[PREFERENCE_KEYS.lastVisited]);
  return last === undefined ? [] : [last];
}

/** Where a visit points, read from the courses; null when the course or module is gone. */
export function modulePlace(courses: readonly Course[], visit: ModuleVisit): ModulePlace | null {
  const course = courses.find((c) => c.slug === visit.courseSlug);
  if (course === undefined) return null;
  const found = visit.moduleSlug === undefined ? undefined : course.modules.find((m) => m.slug === visit.moduleSlug);
  // A module that is gone is not a course page to fall back to: the visit was
  // to the module, and its course page is one click from anywhere.
  if (visit.moduleSlug !== undefined && found === undefined) return null;
  return {
    courseCode: course.code,
    courseTitle: course.title,
    moduleTitle: found?.title ?? null,
    moduleOrder: found?.order ?? null,
  };
}

/**
 * Every saved video position, with the asset's title. A failed title lookup
 * costs the video rows (an untitled row would have nothing to say), not the
 * list.
 */
export async function videoProgress(
  db: CatalogDatabase,
  preferences: Record<string, unknown>,
  scope: OwnerScope,
): Promise<VideoProgress[]> {
  const saved = Object.entries(preferences)
    .filter(([key]) => key.startsWith(PLAYBACK_PREFIX))
    .map(([key, value]) => ({ assetId: key.slice(PLAYBACK_PREFIX.length), playback: parsePlayback(value) }))
    .filter((v): v is { assetId: string; playback: NonNullable<typeof v.playback> } => v.playback !== null);
  if (saved.length === 0) return [];
  let titles: Record<string, string> = {};
  try {
    const rows = await assetsByIds(db, saved.map((v) => v.assetId), scope);
    titles = Object.fromEntries(rows.filter((r) => r.title !== null).map((r) => [r.id, r.title as string]));
  } catch {
    return [];
  }
  return saved.map(({ assetId, playback }) => ({
    assetId,
    title: titles[assetId] ?? null,
    position: playback.position,
    duration: playback.duration,
    watchedAt: playback.watchedAt,
    updatedAt: playback.updatedAt,
  }));
}

/**
 * The asset id a tutor session's log is filed under when the row does not
 * point at one: `session:learn/sessions/<id>.md`, the id `catalog`'s
 * `logAssetId` (services/catalog/src/content/session-logs.ts) gives every
 * log it writes. Repeated here because the web app reaches the catalog
 * through `@gnosia/catalog/state` alone.
 */
export function sessionLogId(sessionId: string): string {
  return `session:learn/sessions/${sessionId}.md`;
}

/**
 * The tutor sessions as rows: titled by the session, else by its log, else
 * by the concept it set out to learn; opening the log in the Library when
 * there is one, else the concept's page. A session with neither (a smoke
 * test, a goal that names no concept) has nowhere to go back to and is left
 * out, as a video whose asset is gone is.
 */
export async function sessionTouches(
  db: CatalogDatabase,
  sessions: readonly RecentSession[],
  scope: OwnerScope,
  concept: (id: string) => { title: string } | null,
): Promise<SessionTouch[]> {
  if (sessions.length === 0) return [];
  const logIds = sessions.map((s) => s.logAssetId ?? sessionLogId(s.id));
  let logs = new Map<string, string | null>();
  try {
    const rows = await assetsByIds(db, [...new Set(logIds)], scope);
    logs = new Map(rows.map((r) => [r.id, r.title]));
  } catch {
    // Without the logs a session still opens its concept, when it has one.
  }
  const out: SessionTouch[] = [];
  sessions.forEach((s, at) => {
    const logId = logIds[at];
    const hasLog = logs.has(logId);
    const goal = s.goal === null ? null : concept(s.goal);
    const title = [s.title, hasLog ? logs.get(logId) : null, goal?.title].find(
      (t): t is string => typeof t === "string" && t.trim() !== "",
    );
    const href = hasLog
      ? `/library/${encodeURIComponent(logId)}`
      : goal !== null && s.goal !== null
        ? `/learn/${encodeURIComponent(s.goal)}`
        : null;
    if (title === undefined || href === null) return;
    out.push({ id: s.id, title: title.trim(), href, updatedAt: s.updatedAt });
  });
  return out;
}

/** The five sources, from rows already read. */
export async function recentSources(db: CatalogDatabase, rows: RecentRows, scope: OwnerScope): Promise<RecentSources> {
  const byId = new Map(rows.concepts.map((c) => [c.id, c]));
  const [videos, sessions] = await Promise.all([
    videoProgress(db, rows.preferences, scope),
    sessionTouches(db, rows.sessions, scope, (id) => byId.get(id) ?? null),
  ]);
  return {
    modules: moduleVisits(rows.events, storedVisits(rows.preferences)),
    place: (visit) => modulePlace(rows.courses, visit),
    videos,
    drafts: rows.drafts,
    sessions,
    concepts: conceptTouches(rows.events, (id) => {
      const c = byId.get(id);
      return c === undefined ? null : { title: c.title, bucket: bucketOf(c), pL: c.pL };
    }),
  };
}

/* -------------------------------------------------------------------------- */
/* The sidebar's read                                                         */
/* -------------------------------------------------------------------------- */

/** The most courses the section lists. */
export const SIDEBAR_COURSES = 12;

/**
 * The courses the owner has opened, newest visit first: the courses of the
 * module visits, each once. An owner who has opened none yet gets the courses
 * they have ticked something in, in the shortlist's order, so the section is
 * not empty for someone who studied before visits were recorded. A course
 * set aside on the Courses page is left out, as Home leaves it out. Each
 * opens at the module visited last in it.
 */
export function sidebarCourses(
  courses: readonly Course[],
  visits: readonly ModuleVisit[],
  snapshot: { completed: Readonly<Record<string, true>>; inactiveCourses: readonly string[] },
): SidebarCourse[] {
  const active = courses.filter((c) => !snapshot.inactiveCourses.includes(c.slug));
  const bySlug = new Map(active.map((c) => [c.slug, c]));
  let picked = [...new Set(visits.map((v) => v.courseSlug))]
    .map((slug) => bySlug.get(slug))
    .filter((c): c is Course => c !== undefined);
  if (picked.length === 0) {
    picked = [...active]
      .sort((a, b) => a.order - b.order)
      .filter((c) => c.modules.some((m) => m.topics.some((t) => snapshot.completed[t.id] === true)));
  }
  return picked.slice(0, SIDEBAR_COURSES).map((c) => {
    const base = `/courses/${encodeURIComponent(c.slug)}`;
    // Visits are newest first, so the first one in this course with a module that still exists.
    const last = visits
      .filter((v) => v.courseSlug === c.slug && v.moduleSlug !== undefined)
      .map((v) => c.modules.find((m) => m.slug === v.moduleSlug))
      .find((m) => m !== undefined);
    return {
      slug: c.slug,
      code: c.code,
      title: c.title,
      href: base,
      open: last === undefined ? base : `${base}/${encodeURIComponent(last.slug)}`,
      resume: last === undefined ? null : { title: last.title, order: last.order },
    };
  });
}

export function emptyRecent(): RecentModel {
  return { reachable: false, items: [], more: false, pinned: [], courses: [] };
}

export interface RecentOptions {
  /** How many pages of `RECENT_PAGE` rows. */
  pages?: number;
  /**
   * Leave the studio's conversations out: the sidebar reads them from the
   * runner, which names one before it has a title, and merges them in itself.
   */
  withoutDrafts?: boolean;
  /** Only rows whose title holds these words, at most one page, newest first. */
  q?: string;
}

/**
 * Recent for the signed-in owner. Each part the database can lack while
 * answering the rest (the studio's drafts before its migrations, courses not
 * yet flipped) costs its own rows, not the list.
 */
export async function readRecent(options: RecentOptions = {}): Promise<RecentModel> {
  const owner = await currentOwner();
  const scope = ownerScope(owner);
  const pages = options.pages ?? 1;
  const q = options.q?.trim() ?? "";
  // A search looks through everything Recent holds, not the pages shown.
  const limit = q === "" ? Math.max(1, pages) * RECENT_PAGE + 1 : 1_000;
  const wantDrafts = studioEnabled() && options.withoutDrafts !== true;
  try {
    const db = await catalogDatabase();
    const [events, preferences, snapshot, drafts, sessions, courses] = await Promise.all([
      // The newest `limit` concepts are enough for the pages asked for; a
      // search looks through all of them, as it looks through every module.
      recentActivity(db, owner, q === "" ? { limit } : {}),
      readPreferences(db, owner),
      readLearnerSnapshot(db, owner),
      wantDrafts ? orNone("drafts", recentDrafts(db, owner, limit)) : Promise.resolve([]),
      orNone("tutor sessions", recentTutorSessions(db, owner, limit)),
      coursesOrWhy(),
    ]);
    // A conversation is called by its name, else its title (`recentItems`),
    // so a search here finds a renamed one by its name; with a studio, the
    // sidebar asks the runner instead, which matches the name too.
    const concepts = await recentConcepts(db, owner, conceptsNamed(events, sessions));
    const sources = await recentSources(db, { events, preferences, drafts, sessions, concepts, courses: courses.courses }, scope);
    const all = recentItems(sources);
    const page = q === "" ? recentPage(all, pages) : recentPage(all.filter((item) => rowMatches(item, q)), 1);
    return {
      reachable: true,
      items: page.items,
      more: page.more,
      pinned: asPinned(preferences[PREFERENCE_KEYS.pinned]),
      courses: sidebarCourses(courses.courses, sources.modules, snapshot),
      ...(courses.unavailable === null ? {} : { coursesUnavailable: courses.unavailable }),
    };
  } catch (error) {
    console.warn(`recent: unavailable, ${error instanceof Error ? error.message : String(error)}`);
    return emptyRecent();
  }
}

/** The concepts Recent titles: those answered on, and the tutor sessions' goals. */
export function conceptsNamed(events: readonly EventRecord[], sessions: readonly RecentSession[]): string[] {
  const ids = new Set<string>();
  for (const e of events) if (e.type === "observation" && typeof e.concept === "string" && e.concept !== "") ids.add(e.concept);
  for (const s of sessions) if (s.goal !== null && s.goal !== "") ids.add(s.goal);
  return [...ids];
}

/**
 * The courses, or none. A courses type nobody flipped is not an outage the
 * sidebar can stay quiet about: Home sends it to the error boundary, which
 * names the flip, and the sidebar says the same sentence where its courses
 * would be rather than reading as a learner with none.
 */
async function coursesOrWhy(): Promise<{ courses: Course[]; unavailable: string | null }> {
  try {
    return { courses: await getCourses(), unavailable: null };
  } catch (error) {
    if (error instanceof ContentUnavailableError && error.reason === "not-flipped") return { courses: [], unavailable: error.message };
    console.warn(`recent: courses unavailable, ${error instanceof Error ? error.message : String(error)}`);
    return { courses: [], unavailable: null };
  }
}

async function orNone<T>(what: string, read: Promise<T[]>): Promise<T[]> {
  try {
    return await read;
  } catch (error) {
    console.warn(`recent: ${what} unavailable, ${error instanceof Error ? error.message : String(error)}`);
    return [];
  }
}
