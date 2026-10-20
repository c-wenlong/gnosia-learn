import { asThemeMode, PREFERENCE_KEYS, THEME_MODES, type ThemeMode } from "@self-learn/schema/shared";
import {
  appendEvent,
  asLastVisited,
  asRecentModules,
  readPreference,
  withLearnerLock,
  inTransaction,
  withRecentModule,
  writePreference,
  type CatalogDatabase,
} from "@self-learn/catalog/state";

import { BadRequest, handler, MAX_ID_CHARS } from "@/lib/learner-api";
import {
  InvalidPreference,
  validateMotionMode,
  validateTutorStyle,
} from "@/lib/preferences";

/**
 * The key/value corner of the learner state: theme, where they were last,
 * their own resource links, the courses they set aside, and the Settings
 * page's tutor and motion choices.
 *
 * The allow-list is the point. `preference` is a key/value table so a new UI
 * toggle costs no migration, but an endpoint that wrote any key with any value
 * would be an open jsonb store on a route with no authentication, and "the
 * learner owns their own row" stops being much of an answer once anything can
 * write anything into it.
 *
 * `epoch` is not here: it is bumped by `/api/learner/reset`, which is the only
 * thing that has a reason to. `bktParams` is not here either — that belongs to
 * the `learn` CLI, and a browser has no business retuning the BKT model.
 * `recentModules` is not here because the route keeps it itself, beside every
 * `lastVisited` write (below). `dailyTarget` and `dailyLeeway` went with the
 * habit layer (H1 of docs/proposals/home-page.md): their rows stay, and nothing
 * writes them.
 */
const WRITABLE = {
  [PREFERENCE_KEYS.theme]: theme,
  [PREFERENCE_KEYS.lastVisited]: lastVisited,
  [PREFERENCE_KEYS.userResources]: userResources,
  [PREFERENCE_KEYS.inactiveCourses]: inactiveCourses,
  // The Settings page's keys. Their validators are pure and live in
  // `@/lib/preferences`, beside the vocabulary the form offers, so the two
  // cannot disagree about what a valid value is.
  [PREFERENCE_KEYS.tutorStyle]: settled(validateTutorStyle),
  [PREFERENCE_KEYS.reducedMotion]: settled(validateMotionMode),
} as const;

/** A pure validator's `InvalidPreference` as the 400 `handler` answers with. */
function settled<T>(validate: (value: unknown) => T): (value: unknown) => T {
  return (value) => {
    try {
      return validate(value);
    } catch (error) {
      if (error instanceof InvalidPreference) throw new BadRequest(error.message);
      throw error;
    }
  };
}

export const POST = handler(
  "preference",
  (body) => {
    const key = body.key;
    // `Object.hasOwn`, not `key in WRITABLE`. `in` walks the prototype chain,
    // so "constructor" and "toString" would pass the allow-list and then be
    // persisted as preference keys — with `Object` itself standing in as the
    // validator for the first of them.
    if (typeof key !== "string" || !Object.hasOwn(WRITABLE, key)) {
      throw new BadRequest(`"key" must be one of ${Object.keys(WRITABLE).join(", ")}.`);
    }
    const validate = WRITABLE[key as keyof typeof WRITABLE];
    return { key, value: validate(body.value) };
  },
  async (db, { key, value }, owner) => {
    if (key === PREFERENCE_KEYS.lastVisited) {
      await rememberVisit(db, value, owner);
    } else {
      await writePreference(db, key, value, owner);
    }
    return { key };
  },
);

/** A failed write's SQLSTATE, read down drizzle's `cause` chain; never its message, which carries the bind parameters. */
function failureCode(error: unknown): string {
  for (let at: unknown = error; at instanceof Error; at = at.cause) {
    const code = (at as { code?: unknown }).code;
    if (typeof code === "string") return code;
  }
  return "unknown";
}

/** Whether a failed write names `constraint`, down the same chain. */
function mentions(error: unknown, constraint: string): boolean {
  for (let at: unknown = error; at instanceof Error; at = at.cause) {
    if ((at as { constraint?: unknown }).constraint === constraint) return true;
  }
  return false;
}

/**
 * Write `lastVisited`, put the same visit at the front of `recentModules`, and
 * append a `visit` event, in one transaction under the learner's row lock so
 * two module pages opened together cannot drop each other's entry.
 *
 * The event is what the sidebar's Recent and Home read from now on
 * (`apps/web/src/lib/recent.ts`, L7 of
 * docs/proposals/library-by-type-and-day.md): one row per visit, so a visit
 * older than the preference's five survives. The preference is still written
 * for one release, as the proposal says, so a deployment rolled back past
 * this change still finds its list current; after that it is left unread, as
 * H1 left the streak's rows. Recent reads both meanwhile and merges them by
 * course and module, which is what keeps the five modules a list held before
 * the first event on Home and in the sidebar.
 *
 * Before the first such write an owner has `lastVisited` and no list, so the
 * list starts from the visit `lastVisited` held until now: a module opened
 * before `recentModules` existed is still on Home after the next visit.
 */
async function rememberVisit(db: CatalogDatabase, value: unknown, owner: string): Promise<void> {
  const visit = asLastVisited(value);
  await withLearnerLock(db, owner, async (tx) => {
    if (visit !== undefined) {
      // Stamped by the server, as `watched` is: the log orders by it, and a
      // browser's clock is not the log's. In a savepoint, so a database that
      // has not yet taken migration 0025 (which allows the type) loses the
      // event and still keeps the preferences, which Recent reads as well.
      try {
        await inTransaction(tx, async (savepoint) =>
          appendEvent(
            savepoint,
            { type: "visit", course: visit.courseSlug, ...(visit.moduleSlug === undefined ? {} : { module: visit.moduleSlug }) },
            owner,
          ),
        );
      } catch (error) {
        // Only the one refusal a database without 0025 gives (a check
        // violation, 23514, on `event_type_check`). Anything else fails the
        // write as before, so a log that has stopped taking visits is a 503
        // someone sees, not a quiet gap in Recent.
        if (failureCode(error) !== "23514" || !mentions(error, "event_type_check")) throw error;
        console.warn("preference: visit event not written, the database has not taken migration 0025");
      }
      const stored = asRecentModules(await readPreference(tx, PREFERENCE_KEYS.recentModules, owner));
      const previous = asLastVisited(await readPreference(tx, PREFERENCE_KEYS.lastVisited, owner));
      const list = stored ?? (previous !== undefined ? [previous] : []);
      await writePreference(tx, PREFERENCE_KEYS.recentModules, withRecentModule(list, visit), owner);
    }
    await writePreference(tx, PREFERENCE_KEYS.lastVisited, value, owner);
  });
}

function theme(value: unknown): ThemeMode {
  const mode = asThemeMode(value);
  if (mode === null) {
    throw new BadRequest(`"value" must be one of ${THEME_MODES.map((m) => `"${m}"`).join(", ")}.`);
  }
  return mode;
}

function lastVisited(value: unknown): {
  courseSlug: string;
  moduleSlug?: string;
  at: string;
} {
  const raw = object(value);
  const courseSlug = raw.courseSlug;
  if (typeof courseSlug !== "string" || courseSlug === "" || courseSlug.length > MAX_ID_CHARS) {
    throw new BadRequest(`"value.courseSlug" must be a non-empty slug.`);
  }
  const moduleSlug = raw.moduleSlug;
  if (
    moduleSlug !== undefined &&
    (typeof moduleSlug !== "string" || moduleSlug.length > MAX_ID_CHARS)
  ) {
    throw new BadRequest(`"value.moduleSlug" must be a slug.`);
  }
  return {
    courseSlug,
    ...(typeof moduleSlug === "string" ? { moduleSlug } : {}),
    at: typeof raw.at === "string" ? raw.at : new Date().toISOString(),
  };
}

/** More than any catalog holds; a cap so the value stays a short list. */
const MAX_INACTIVE_COURSES = 200;

/**
 * The slugs of the courses set aside, deduplicated. A slug the catalog does
 * not hold is kept rather than refused: the list is only ever read against
 * the courses a page already has, so a stale slug hides nothing.
 */
function inactiveCourses(value: unknown): string[] {
  if (!Array.isArray(value)) throw new BadRequest(`"value" must be an array of course slugs.`);
  if (value.length > MAX_INACTIVE_COURSES) {
    throw new BadRequest(`"value" names more than ${MAX_INACTIVE_COURSES} courses.`);
  }
  for (const [i, slug] of value.entries()) {
    if (typeof slug !== "string" || slug === "" || slug.length > MAX_ID_CHARS) {
      throw new BadRequest(`"value[${i}]" must be a non-empty slug.`);
    }
  }
  return [...new Set(value as string[])];
}

/** At most 50 modules, 50 links each: a personal reading list, not a mirror. */
const MAX_RESOURCE_MODULES = 50;
const MAX_RESOURCES_PER_MODULE = 50;
const MAX_RESOURCE_CHARS = 2_000;

function userResources(value: unknown): Record<string, { id: string; title: string; url: string }[]> {
  const raw = object(value);
  const entries = Object.entries(raw);
  if (entries.length > MAX_RESOURCE_MODULES) {
    throw new BadRequest(`"value" names more than ${MAX_RESOURCE_MODULES} modules.`);
  }
  const out: Record<string, { id: string; title: string; url: string }[]> = {};
  for (const [moduleId, list] of entries) {
    if (moduleId.length > MAX_ID_CHARS) throw new BadRequest(`"${moduleId}" is not a module id.`);
    if (!Array.isArray(list)) throw new BadRequest(`"value.${moduleId}" must be an array.`);
    if (list.length > MAX_RESOURCES_PER_MODULE) {
      throw new BadRequest(`"value.${moduleId}" has more than ${MAX_RESOURCES_PER_MODULE} links.`);
    }
    out[moduleId] = list.map((item, i) => {
      const resource = object(item);
      for (const field of ["id", "title", "url"] as const) {
        const text = resource[field];
        if (typeof text !== "string" || text.length > MAX_RESOURCE_CHARS) {
          throw new BadRequest(`"value.${moduleId}[${i}].${field}" must be a short string.`);
        }
      }
      // http(s) only. The value comes back out into an href, and a stored
      // `javascript:` URL would be a self-inflicted XSS on the next render.
      const url = String(resource.url);
      if (!/^https?:\/\//i.test(url)) {
        throw new BadRequest(`"value.${moduleId}[${i}].url" must be an http(s) URL.`);
      }
      return { id: String(resource.id), title: String(resource.title), url };
    });
  }
  return out;
}

function object(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new BadRequest(`"value" must be an object.`);
  }
  return value as Record<string, unknown>;
}
