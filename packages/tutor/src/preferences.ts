/**
 * The learner's own settings: what each preference may hold, what it is
 * called on screen, and the checks the preference route runs before storing
 * one.
 *
 * Pure and React-free, so the Settings form (a client component) and the
 * route handler read the same vocabulary. The storage keys are
 * `PREFERENCE_KEYS` in `@gnosia/schema/shared`.
 *
 * The daily target and the streak leeway were settings until the habit layer
 * was removed (H1 of docs/proposals/home-page.md). Their rows stay in the
 * database, unread, and the route no longer accepts them.
 */

/** Thrown by a validator. The route turns it into a 400 with this message. */
export class InvalidPreference extends Error {}

/* -------------------------------------------------------------------------- */
/* Vocabularies                                                               */
/* -------------------------------------------------------------------------- */

/**
 * How the tutor talks. Stored as the `id`; the concept tutor and the session's
 * question writer read it (`TUTOR_STYLE_INSTRUCTIONS` in `./prompt`,
 * `SESSION_EXPLANATION_RULES` in `./session-question`).
 */
export const TUTOR_STYLES = [
  { id: "guide-concise", label: "Learning guide · concise" },
  { id: "guide-detailed", label: "Learning guide · detailed" },
  { id: "socratic", label: "Socratic · questions first" },
  { id: "direct", label: "Direct · answers first" },
] as const;

export type TutorStyle = (typeof TUTOR_STYLES)[number]["id"];
export const DEFAULT_TUTOR_STYLE: TutorStyle = "guide-concise";

/**
 * Motion. `system` follows `prefers-reduced-motion`; `always` reduces motion
 * whatever the system says. There is no "always animate": overriding a
 * learner's accessibility setting from inside one app is not a choice worth
 * offering.
 */
export const MOTION_MODES = [
  { id: "system", label: "Respect system reduced motion" },
  { id: "always", label: "Always reduce motion" },
] as const;

export type MotionMode = (typeof MOTION_MODES)[number]["id"];
export const DEFAULT_MOTION_MODE: MotionMode = "system";

function isOneOf<T extends string>(list: readonly { id: T }[], value: unknown): value is T {
  return typeof value === "string" && list.some((entry) => entry.id === value);
}

/** The stored tutor style, or the default when the row is missing or unknown. */
export function parseTutorStyle(value: unknown): TutorStyle {
  return isOneOf(TUTOR_STYLES, value) ? value : DEFAULT_TUTOR_STYLE;
}

/** The stored motion mode, or the default. */
export function parseMotionMode(value: unknown): MotionMode {
  return isOneOf(MOTION_MODES, value) ? value : DEFAULT_MOTION_MODE;
}

/* -------------------------------------------------------------------------- */
/* Validators, for POST /api/learner/preference                               */
/* -------------------------------------------------------------------------- */

export function validateTutorStyle(value: unknown): TutorStyle {
  if (!isOneOf(TUTOR_STYLES, value)) {
    throw new InvalidPreference(`"value" must be one of ${TUTOR_STYLES.map((s) => s.id).join(", ")}.`);
  }
  return value;
}

export function validateMotionMode(value: unknown): MotionMode {
  if (!isOneOf(MOTION_MODES, value)) {
    throw new InvalidPreference(`"value" must be one of ${MOTION_MODES.map((m) => m.id).join(", ")}.`);
  }
  return value;
}
