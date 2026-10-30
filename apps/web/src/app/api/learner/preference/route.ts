import { asThemeMode, isUserResourceUrl, PREFERENCE_KEYS, THEME_MODES, USER_RESOURCE_LIMITS, type ThemeMode } from "@gnosia/schema/shared";
import { writePreference } from "@gnosia/catalog/state";
import { lastVisitedValue, rememberVisit } from "@gnosia/tutor/server/learner-writes";

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
 * `lastVisited` write (`rememberVisit`, shared with the sidecar). `dailyTarget` and `dailyLeeway` went with the
 * habit layer (H1 of docs/proposals/home-page.md): their rows stay, and nothing
 * writes them.
 */
const WRITABLE = {
  [PREFERENCE_KEYS.theme]: theme,
  [PREFERENCE_KEYS.lastVisited]: lastVisitedValue,
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

function theme(value: unknown): ThemeMode {
  const mode = asThemeMode(value);
  if (mode === null) {
    throw new BadRequest(`"value" must be one of ${THEME_MODES.map((m) => `"${m}"`).join(", ")}.`);
  }
  return mode;
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

const MAX_RESOURCE_MODULES = USER_RESOURCE_LIMITS.modules;
const MAX_RESOURCES_PER_MODULE = USER_RESOURCE_LIMITS.perModule;
const MAX_RESOURCE_CHARS = USER_RESOURCE_LIMITS.chars;

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
      // http(s) only (`isUserResourceUrl`): the value comes back out into an href.
      const url = String(resource.url);
      if (!isUserResourceUrl(url)) {
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
