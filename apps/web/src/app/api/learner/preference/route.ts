import { PREFERENCE_KEYS } from "@self-learn/schema/shared";
import { writePreference } from "@self-learn/catalog/state";

import { BadRequest, handler, MAX_ID_CHARS } from "@/lib/learner-api";
import {
  InvalidPreference,
  validateDailyTarget,
  validateLeeway,
  validateMotionMode,
  validateTutorStyle,
} from "@/lib/preferences";

/**
 * The key/value corner of the learner state: theme, where they were last,
 * their own resource links, and the Settings page's habit and tutor choices.
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
 */
const WRITABLE = {
  [PREFERENCE_KEYS.theme]: theme,
  [PREFERENCE_KEYS.lastVisited]: lastVisited,
  [PREFERENCE_KEYS.userResources]: userResources,
  // The Settings page's keys. Their validators are pure and live in
  // `@/lib/preferences`, beside the vocabulary the form offers, so the two
  // cannot disagree about what a valid value is.
  [PREFERENCE_KEYS.dailyTarget]: settled(validateDailyTarget),
  [PREFERENCE_KEYS.dailyLeeway]: settled(validateLeeway),
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
  async (db, { key, value }) => {
    await writePreference(db, key, value);
    return { key };
  },
);

function theme(value: unknown): "light" | "dark" {
  if (value !== "light" && value !== "dark") {
    throw new BadRequest(`"value" must be "light" or "dark".`);
  }
  return value;
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
