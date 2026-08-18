import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));

/** Repo root, resolved from this file's location (scripts/learn/lib). */
export const ROOT = path.resolve(here, "..", "..", "..");

export const KB = path.join(ROOT, "learn");
export const CONCEPTS_DIR = path.join(KB, "concepts");
export const SESSIONS_DIR = path.join(KB, "sessions");
export const STATE_DIR = path.join(KB, "state");
export const ASSETS_DIR = path.join(KB, "assets");

export const MODEL_FILE = path.join(STATE_DIR, "model.json");
export const REVIEWS_FILE = path.join(STATE_DIR, "reviews.json");
export const EVENTS_FILE = path.join(STATE_DIR, "events.jsonl");
export const MAP_FILE = path.join(KB, "map.md");

export const ALL_DIRS = [
  KB,
  CONCEPTS_DIR,
  SESSIONS_DIR,
  STATE_DIR,
  ASSETS_DIR,
];

/** Path relative to the repo root, for display. */
export function rel(p) {
  return path.relative(ROOT, p) || ".";
}
