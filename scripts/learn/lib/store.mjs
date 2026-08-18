import fs from "node:fs/promises";
import path from "node:path";
import {
  ALL_DIRS,
  CONCEPTS_DIR,
  EVENTS_FILE,
  MODEL_FILE,
  REVIEWS_FILE,
  SESSIONS_DIR,
} from "./paths.mjs";
import { parseFrontmatter, stringifyFrontmatter } from "./markdown.mjs";
import { DEFAULT_PARAMS } from "./bkt.mjs";

export const SCHEMA_VERSION = 1;

export async function ensureDirs() {
  for (const dir of ALL_DIRS) {
    await fs.mkdir(dir, { recursive: true });
  }
}

async function readJson(file, fallback) {
  try {
    return JSON.parse(await fs.readFile(file, "utf8"));
  } catch (err) {
    if (err.code === "ENOENT") return fallback;
    throw new Error(`${file} is not valid JSON: ${err.message}`);
  }
}

/** Write via a temp file + rename so a crash can't truncate state. */
async function writeJson(file, value) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  await fs.writeFile(tmp, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await fs.rename(tmp, file);
}

export const emptyModel = () => ({
  version: SCHEMA_VERSION,
  params: { ...DEFAULT_PARAMS },
  concepts: {},
  updatedAt: null,
});

export const emptyReviews = () => ({
  version: SCHEMA_VERSION,
  cards: {},
  updatedAt: null,
});

export const readModel = () => readJson(MODEL_FILE, emptyModel());
export const readReviews = () => readJson(REVIEWS_FILE, emptyReviews());

export async function writeModel(model) {
  model.updatedAt = new Date().toISOString();
  await writeJson(MODEL_FILE, model);
  return model;
}

export async function writeReviews(reviews) {
  reviews.updatedAt = new Date().toISOString();
  await writeJson(REVIEWS_FILE, reviews);
  return reviews;
}

/**
 * Append one event to the trajectory log. This file is the source of
 * truth: model.json is a derived cache that `learn model --rebuild`
 * reconstructs by replaying these events in order.
 */
export async function appendEvent(event) {
  await fs.mkdir(path.dirname(EVENTS_FILE), { recursive: true });
  const record = { at: new Date().toISOString(), ...event };
  await fs.appendFile(EVENTS_FILE, `${JSON.stringify(record)}\n`, "utf8");
  return record;
}

export async function readEvents() {
  try {
    const raw = await fs.readFile(EVENTS_FILE, "utf8");
    return raw
      .split("\n")
      .filter((line) => line.trim())
      .map((line, i) => {
        try {
          return JSON.parse(line);
        } catch {
          throw new Error(`events.jsonl line ${i + 1} is not valid JSON`);
        }
      });
  } catch (err) {
    if (err.code === "ENOENT") return [];
    throw err;
  }
}

// ---------------------------------------------------------------- concepts

export function conceptPath(id) {
  return path.join(CONCEPTS_DIR, `${id}.md`);
}

export async function readConcept(id) {
  try {
    const raw = await fs.readFile(conceptPath(id), "utf8");
    const { data, body } = parseFrontmatter(raw);
    return { id, ...data, body, path: conceptPath(id) };
  } catch (err) {
    if (err.code === "ENOENT") return null;
    throw err;
  }
}

export async function listConcepts() {
  let files;
  try {
    files = await fs.readdir(CONCEPTS_DIR);
  } catch (err) {
    if (err.code === "ENOENT") return [];
    throw err;
  }

  const concepts = [];
  for (const file of files.sort()) {
    if (!file.endsWith(".md")) continue;
    const concept = await readConcept(file.replace(/\.md$/, ""));
    if (concept) concepts.push(concept);
  }
  return concepts;
}

/** Keys that are derived, not frontmatter, and must never be serialised. */
const NON_FRONTMATTER = new Set(["body", "path", "id"]);

export async function writeConcept(concept) {
  const body = concept.body ?? "";
  const id = concept.id;
  const data = Object.fromEntries(
    Object.entries(concept).filter(([key]) => !NON_FRONTMATTER.has(key)),
  );
  await fs.mkdir(CONCEPTS_DIR, { recursive: true });
  const file = conceptPath(id);
  await fs.writeFile(file, stringifyFrontmatter({ id, ...data }, body), "utf8");
  return file;
}

// ---------------------------------------------------------------- sessions

export function sessionPath(id) {
  return path.join(SESSIONS_DIR, `${id}.md`);
}

export async function listSessions() {
  try {
    const files = await fs.readdir(SESSIONS_DIR);
    return files.filter((f) => f.endsWith(".md")).sort();
  } catch (err) {
    if (err.code === "ENOENT") return [];
    throw err;
  }
}

/**
 * Append markdown to a session log. This is the "MD log" primitive: the
 * agent narrates into a file the learner can keep open in Obsidian while
 * the session runs.
 */
export async function appendSession(id, markdown) {
  const file = sessionPath(id);
  await fs.mkdir(SESSIONS_DIR, { recursive: true });
  await fs.appendFile(file, `${markdown.replace(/\s+$/, "")}\n\n`, "utf8");
  return file;
}

export async function readSession(id) {
  try {
    return await fs.readFile(sessionPath(id), "utf8");
  } catch (err) {
    if (err.code === "ENOENT") return null;
    throw err;
  }
}
