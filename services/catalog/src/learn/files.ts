import fs from "node:fs/promises";
import path from "node:path";

import {
  parseFrontmatter,
  stringifyFrontmatter,
} from "../../../../scripts/learn/lib/markdown.mjs";
import { allDirs, conceptsDir, sessionsDir } from "./paths";

/**
 * The file half of the old `scripts/learn/lib/store.mjs`, unchanged in
 * behaviour and ported to TypeScript.
 *
 * The state half of that module — `readModel`, `writeReviews`, `appendEvent` —
 * is gone; those are `../state/`. What is left is exactly the part that was
 * never state: concept notes, session logs, and the scanning rules that make an
 * id a filename.
 */

export interface ConceptNote {
  id: string;
  title?: string;
  summary?: string;
  requires?: unknown;
  assumes?: unknown;
  tags?: unknown;
  topics?: unknown;
  sources?: unknown;
  created?: string;
  /** The folder the note sits in. Read from the path, never from frontmatter. */
  domain: string | null;
  body: string;
  path: string;
  [key: string]: unknown;
}

export async function ensureDirs(): Promise<void> {
  for (const dir of allDirs()) await fs.mkdir(dir, { recursive: true });
}

/**
 * Concepts live one folder deep, grouped by domain:
 *
 *   concepts/algorithms/big-o-witness-definition.md
 *
 * The folder is presentation only. **The id stays the bare slug**, because ids
 * appear in every `requires:` edge, every `[[wikilink]]`, and now in
 * `event.concept_slug`, `mastery.concept_slug` and `review.concept_slug`.
 * Folding the folder into the id would break all of them, and moving a note
 * between domains would orphan its history — which, now that the history is a
 * foreign key, would be a constraint error rather than a silent loss.
 */
interface Scan {
  index: Map<string, { file: string; domain: string | null }>;
  collisions: { id: string; kept: string; ignored: string }[];
}

async function scanConcepts(): Promise<Scan> {
  const index = new Map<string, { file: string; domain: string | null }>();
  const collisions: Scan["collisions"] = [];

  async function scanDir(dir: string, domain: string | null): Promise<void> {
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
      throw error;
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
      const existing = index.get(id);
      if (existing !== undefined) {
        collisions.push({ id, kept: existing.file, ignored: full });
        continue;
      }
      index.set(id, { file: full, domain });
    }
  }

  await scanDir(conceptsDir(), null);
  return { index, collisions };
}

/** Where a concept file lives, or where a new one should go. */
export async function conceptPath(id: string, domain?: string | null): Promise<string> {
  if (domain !== undefined) {
    return domain !== null && domain !== ""
      ? path.join(conceptsDir(), domain, `${id}.md`)
      : path.join(conceptsDir(), `${id}.md`);
  }
  const { index } = await scanConcepts();
  return index.get(id)?.file ?? path.join(conceptsDir(), `${id}.md`);
}

/**
 * Filenames must be unique across domains, since the id is the filename and
 * Obsidian resolves `[[wikilinks]]` the same way. Reported by `doctor`.
 */
export async function conceptCollisions(): Promise<Scan["collisions"]> {
  return (await scanConcepts()).collisions;
}

async function readConceptAt(
  id: string,
  file: string,
  domain: string | null,
): Promise<ConceptNote | null> {
  try {
    const raw = await fs.readFile(file, "utf8");
    const { data, body } = parseFrontmatter(raw) as {
      data: Record<string, unknown>;
      body: string;
    };
    return { ...data, id, domain, body, path: file };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

export async function readConcept(id: string): Promise<ConceptNote | null> {
  const { index } = await scanConcepts();
  const entry = index.get(id);
  if (entry === undefined) return null;
  return readConceptAt(id, entry.file, entry.domain);
}

export async function listConcepts(): Promise<ConceptNote[]> {
  const { index } = await scanConcepts();
  const concepts: ConceptNote[] = [];
  for (const [id, { file, domain }] of [...index].sort((a, b) => a[0].localeCompare(b[0]))) {
    const note = await readConceptAt(id, file, domain);
    if (note !== null) concepts.push(note);
  }
  return concepts;
}

/** Every domain folder currently in use, with its concept count. */
export async function listDomains(): Promise<{ domain: string | null; count: number }[]> {
  const { index } = await scanConcepts();
  const counts = new Map<string, number>();
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
export async function writeConcept(
  note: Record<string, unknown> & { id: string },
  options: { domain?: string | null } = {},
): Promise<string> {
  const body = typeof note.body === "string" ? note.body : "";
  const id = note.id;
  const data = Object.fromEntries(
    Object.entries(note).filter(([key]) => !NON_FRONTMATTER.has(key)),
  );

  const { index } = await scanConcepts();
  const existing = index.get(id);
  const domain =
    options.domain !== undefined ? options.domain : (existing?.domain ?? null);

  const file = await conceptPath(id, domain);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, stringifyFrontmatter({ id, ...data }, body), "utf8");

  // A move leaves the old file behind unless it is cleared explicitly.
  if (existing !== undefined && existing.file !== file) {
    await fs.rm(existing.file, { force: true });
  }
  return file;
}

/* ------------------------------------------------------------------ sessions */

export function sessionPath(id: string): string {
  return path.join(sessionsDir(), `${id}.md`);
}

export async function listSessions(): Promise<string[]> {
  try {
    const files = await fs.readdir(sessionsDir());
    return files.filter((f) => f.endsWith(".md")).sort();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

/**
 * Append markdown to a session log. This is the "MD log" primitive: the agent
 * narrates into a file the learner can keep open in Obsidian while the session
 * runs.
 */
export async function appendSession(id: string, markdown: string): Promise<string> {
  const file = sessionPath(id);
  await fs.mkdir(sessionsDir(), { recursive: true });
  await fs.appendFile(file, `${markdown.replace(/\s+$/, "")}\n\n`, "utf8");
  return file;
}
