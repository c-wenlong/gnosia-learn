/**
 * The learner's own settings: what each preference may hold, what it is
 * called on screen, and the checks the preference route runs before storing
 * one.
 *
 * Pure and React-free, so the Settings form (a client component), the Today
 * page and the route handler all read the same vocabulary. The storage keys
 * are `PREFERENCE_KEYS` in `@self-learn/schema/shared`; the habit arithmetic
 * that reads `dailyTarget` and `dailyLeeway` is `habit-core.ts`, and its
 * bounds are the ones enforced here, so a value this module accepts is a
 * value that module never has to clamp.
 */

import {
  LEEWAY_MAX,
  TARGET_MAX_CONCEPTS,
  type DailyTarget,
} from "@/lib/habit-core";

/** Thrown by a validator. The route turns it into a 400 with this message. */
export class InvalidPreference extends Error {}

/* -------------------------------------------------------------------------- */
/* Vocabularies                                                               */
/* -------------------------------------------------------------------------- */

/** How the tutor talks. Stored as the `id`; the tutor does not read it yet. */
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

function wholeNumberIn(value: unknown, min: number, max: number, field: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < min || value > max) {
    throw new InvalidPreference(`"${field}" must be a whole number from ${min} to ${max}.`);
  }
  return value;
}

/**
 * `{ concepts, reviews }`, exactly. Refused rather than clamped: the form only
 * offers values in range, so anything else is not the form talking, and
 * storing a quietly different number than the one sent would be a surprise.
 */
export function validateDailyTarget(value: unknown): DailyTarget {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new InvalidPreference(`"value" must be an object with "concepts" and "reviews".`);
  }
  const raw = value as Record<string, unknown>;
  const concepts = wholeNumberIn(raw.concepts, 0, TARGET_MAX_CONCEPTS, "value.concepts");
  if (typeof raw.reviews !== "boolean") {
    throw new InvalidPreference(`"value.reviews" must be a boolean.`);
  }
  return { concepts, reviews: raw.reviews };
}

/** Free misses per week, 0 to 7. */
export function validateLeeway(value: unknown): number {
  return wholeNumberIn(value, 0, LEEWAY_MAX, "value");
}

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

/* -------------------------------------------------------------------------- */
/* Words                                                                      */
/* -------------------------------------------------------------------------- */

const WORDS = ["No", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten"];

/** "One", "Two", ... "Ten", then digits. Capitalised: it starts a phrase. */
export function numberWord(n: number): string {
  return WORDS[n] ?? String(n);
}

/** "One concept + due reviews", "Two concepts", "Due reviews only", "No target". */
export function describeTarget(target: DailyTarget): string {
  if (target.concepts === 0) return target.reviews ? "Due reviews only" : "No target";
  const concepts = `${numberWord(target.concepts)} ${target.concepts === 1 ? "concept" : "concepts"}`;
  return target.reviews ? `${concepts} + due reviews` : concepts;
}

/** "No free misses", "1 free miss per week", "2 free misses per week". */
export function describeLeeway(leeway: number): string {
  if (leeway === 0) return "No free misses";
  return `${leeway} free ${leeway === 1 ? "miss" : "misses"} per week`;
}

/** The concept counts the Settings select offers. The stored value is added if it is not one. */
const TARGET_CONCEPT_CHOICES = [0, 1, 2, 3, 4, 5];

/**
 * Every target the Settings select offers, as `{ value, label, target }`.
 * `value` is a string key (`"2+r"`, `"2"`) because a `<select>` holds strings.
 * The current target is always in the list, so a value set from the CLI
 * (seven concepts, say) is shown as itself rather than as the first option.
 */
export function targetChoices(current: DailyTarget): { value: string; label: string; target: DailyTarget }[] {
  const counts = [...new Set([...TARGET_CONCEPT_CHOICES, current.concepts])].sort((a, b) => a - b);
  const out: { value: string; label: string; target: DailyTarget }[] = [];
  for (const concepts of counts) {
    for (const reviews of [true, false]) {
      const target = { concepts, reviews };
      out.push({ value: targetKey(target), label: describeTarget(target), target });
    }
  }
  return out;
}

export function targetKey(target: DailyTarget): string {
  return `${target.concepts}${target.reviews ? "+r" : ""}`;
}

/** 0 to 7, with their labels. */
export function leewayChoices(): { value: number; label: string }[] {
  return Array.from({ length: LEEWAY_MAX + 1 }, (_, n) => ({ value: n, label: describeLeeway(n) }));
}
