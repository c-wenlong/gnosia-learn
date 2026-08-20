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

/**
 * Concepts live one folder deep, grouped by domain:
 *
 *   concepts/algorithms/big-o-witness-definition.md
 *
 * The folder is presentation only. **The id stays the bare slug**, because ids
 * appear in every `requires:` edge, every `[[wikilink]]`, `reviews.json` and
 * `events.jsonl`. Folding the folder into the id would break all of them, and
 * moving a note between domains would silently orphan its history.
 *
 * The domain is therefore read from the path rather than stored in
 * frontmatter, so the two can never disagree. A note at the root has no domain.
 */

/** Build id -> { file, domain } by scanning one level of folders. */
async function scanConcepts() {
  const index = new Map();
  const collisions = [];

  async function scanDir(dir, domain) {
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch (err) {
      if (err.code === "ENOENT") return;
      throw err;
    }

    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      const full = path.join(dir, entry.name);
      // One level only. Deeper nesting is a filing system, not a shelf.
      if (entry.isDirectory() && domain === null && !entry.name.startsWith(".")) {
        await scanDir(full, entry.name);
        continue;
      }
      if (!entry.isFile() || !entry.name.endsWith(".md")) continue;

      const id = entry.name.replace(/\.md$/, "");
      if (index.has(id)) {
        collisions.push({ id, kept: index.get(id).file, ignored: full });
        continue;
      }
      index.set(id, { file: full, domain });
    }
  }

  await scanDir(CONCEPTS_DIR, null);
  return { index, collisions };
}

/** Where a concept file lives, or where a new one should go. */
export async function conceptPath(id, domain) {
  if (domain !== undefined) {
    return domain
      ? path.join(CONCEPTS_DIR, domain, `${id}.md`)
      : path.join(CONCEPTS_DIR, `${id}.md`);
  }
  const { index } = await scanConcepts();
  return index.get(id)?.file ?? path.join(CONCEPTS_DIR, `${id}.md`);
}

/**
 * Filenames must be unique across domains, since the id is the filename and
 * Obsidian resolves `[[wikilinks]]` the same way. Reported by `doctor`.
 */
export async function conceptCollisions() {
  const { collisions } = await scanConcepts();
  return collisions;
}

async function readConceptAt(id, file, domain) {
  try {
    const raw = await fs.readFile(file, "utf8");
    const { data, body } = parseFrontmatter(raw);
    return { id, ...data, domain, body, path: file };
  } catch (err) {
    if (err.code === "ENOENT") return null;
    throw err;
  }
}

export async function readConcept(id) {
  const { index } = await scanConcepts();
  const entry = index.get(id);
  if (!entry) return null;
  return readConceptAt(id, entry.file, entry.domain);
}

export async function listConcepts() {
  const { index } = await scanConcepts();
  const concepts = [];
  for (const [id, { file, domain }] of [...index].sort((a, b) =>
    a[0].localeCompare(b[0]),
  )) {
    const concept = await readConceptAt(id, file, domain);
    if (concept) concepts.push(concept);
  }
  return concepts;
}

/** Every domain folder currently in use, with its concept count. */
export async function listDomains() {
  const { index } = await scanConcepts();
  const counts = new Map();
  for (const { domain } of index.values()) {
    const key = domain ?? "";
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts].map(([domain, count]) => ({ domain: domain || null, count }));
}

/** Keys that are derived, not frontmatter, and must never be serialised. */
const NON_FRONTMATTER = new Set(["body", "path", "id", "domain"]);

/**
 * Write a concept. Passing `domain` moves the file; omitting it keeps the note
 * wherever it already lives.
 */
export async function writeConcept(concept, options = {}) {
  const body = concept.body ?? "";
  const id = concept.id;
  const data = Object.fromEntries(
    Object.entries(concept).filter(([key]) => !NON_FRONTMATTER.has(key)),
  );

  const { index } = await scanConcepts();
  const existing = index.get(id);
  const domain =
    options.domain !== undefined ? options.domain : (existing?.domain ?? null);

  const file = await conceptPath(id, domain);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, stringifyFrontmatter({ id, ...data }, body), "utf8");

  // A move leaves the old file behind unless it is cleared explicitly.
  if (existing && existing.file !== file) {
    await fs.rm(existing.file, { force: true });
  }
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
