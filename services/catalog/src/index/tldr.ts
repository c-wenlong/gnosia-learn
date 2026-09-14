import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

import { REPO_ROOT, resolveTldrawkcRoot } from "../env";
import { IndexError } from "./errors";
import { filesIn, relativeTo } from "./files";

/**
 * Reading what a `.tldr` says it is about, the two ways this repo can.
 *
 * tldrawkc writes a small versioned object onto the tldraw document record,
 * inside the file, at `meta.tldrawkc`. It travels with the drawing, needs no
 * sidecar, and is the only thing that files a diagram under a topic — the
 * filename stem used to do that job and was never more than a guess.
 *
 * **Two readers, one shape, and why both exist.** `tldrawkc list <dir> --json`
 * is the tool's own answer and the one to prefer: if the metadata's shape ever
 * moves, the command moves with it. But `tools/tldrawkc/dist` is a build
 * inside a submodule, and a fresh clone and CI deliberately have neither,
 * while the `.tldr` itself is JSON that is already in the tree. So the
 * fallback parses the file directly, and `tldr.test.ts` asserts the two agree
 * on a real document rather than trusting that they do.
 *
 * The fallback reads, and never writes. Writing metadata stays tldrawkc's, both
 * because `created` has a rule (written once, preserved) and because a writer
 * has to refuse a `kc` version it does not know, which is a decision belonging
 * with the tool that owns the shape.
 */

const run = promisify(execFile);

/** Relative to the tldrawkc checkout. The same file `npm run canvas` invokes. */
export const CANVAS_CLI = path.join("dist", "cli", "index.js");

/**
 * Where the built tldrawkc CLI is on this machine: `$TLDRAWKC_ROOT` if it is
 * set, otherwise the submodule.
 *
 * The override exists because the checkout has moved before (both submodules
 * went from the repo root into `tools/` on 2026-09-13), and because a build
 * kept outside the superproject is a reasonable thing to have.
 *
 * `npm run canvas` calls this function rather than expanding the variable in
 * the shell, so the two cannot disagree about which build they are talking to.
 * A shell cannot: it sees only the process environment, so a root set in
 * `services/catalog/.env` would reach the indexer and not the tool, and it does
 * not expand a `~` that arrived inside a variable's value. Both entry points go
 * through `services/catalog/src/canvas.ts` and this line.
 */
export function canvasCliPath(repoRoot: string = REPO_ROOT): string {
  return path.join(resolveTldrawkcRoot(repoRoot), CANVAS_CLI);
}

/** The metadata schema version this reader was written against. */
export const KC_SCHEMA = 1;

/**
 * `meta.tldrawkc` on the document record. Every field is optional in the file,
 * so every field is optional here and the indexer does the insisting.
 */
export interface DiagramMeta {
  kc?: number;
  title?: string;
  topic?: string;
  concepts?: string[];
  source?: string;
  created?: string;
}

/** One `.tldr`, with whatever it says about itself. */
export interface DiagramEntry {
  /** Absolute path to the `.tldr`. */
  path: string;
  meta: DiagramMeta | null;
}

export interface DiagramListing {
  /** Which reader answered. Reported by `index` so a run says how it read. */
  via: "tldrawkc" | "json";
  /** Sorted by path, so an index run is reproducible whichever reader ran. */
  diagrams: DiagramEntry[];
  /** Files that would not parse. One bad document must not cost the others. */
  errors: { path: string; message: string }[];
}

/** Is there a built tldrawkc CLI to run? */
export function hasCanvasCli(repoRoot: string): boolean {
  return existsSync(canvasCliPath(repoRoot));
}

function asMeta(value: unknown): DiagramMeta | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const meta: DiagramMeta = {};
  if (typeof raw.kc === "number") meta.kc = raw.kc;
  if (typeof raw.title === "string") meta.title = raw.title;
  if (typeof raw.topic === "string") meta.topic = raw.topic;
  if (typeof raw.source === "string") meta.source = raw.source;
  if (typeof raw.created === "string") meta.created = raw.created;
  if (Array.isArray(raw.concepts)) {
    meta.concepts = raw.concepts.filter((c): c is string => typeof c === "string");
  }
  return meta;
}

/**
 * The `document:document` record's `meta.tldrawkc`, straight out of the file.
 *
 * A `.tldr` is `{ tldrawFileFormatVersion, schema, records: [...] }` and the
 * document record is the one whose `typeName` is `document`. Matching on
 * `typeName` rather than on the literal id is deliberate: the id is tldraw's
 * and has been stable, but the type name is what the format documents.
 */
export function metaFromDocument(parsed: unknown): DiagramMeta | null {
  if (typeof parsed !== "object" || parsed === null) return null;
  const records = (parsed as { records?: unknown }).records;
  if (!Array.isArray(records)) return null;
  for (const record of records) {
    if (typeof record !== "object" || record === null) continue;
    const row = record as { typeName?: unknown; meta?: unknown };
    if (row.typeName !== "document") continue;
    if (typeof row.meta !== "object" || row.meta === null) return null;
    return asMeta((row.meta as Record<string, unknown>).tldrawkc);
  }
  return null;
}

/** Every `.tldr` in `directory`, read as JSON. No subprocess, no browser. */
export async function listByParsing(directory: string): Promise<DiagramListing> {
  const files = await filesIn(directory, [".tldr"]);
  const diagrams: DiagramEntry[] = [];
  const errors: { path: string; message: string }[] = [];
  for (const file of files) {
    try {
      diagrams.push({ path: file, meta: metaFromDocument(JSON.parse(await readFile(file, "utf8"))) });
    } catch (error) {
      errors.push({ path: file, message: (error as Error).message });
    }
  }
  return { via: "json", diagrams, errors };
}

/**
 * What `tldrawkc list --json` prints. Only the two fields this reader uses are
 * named; the command also returns the sibling `.svg` and `.png`, the shape
 * count and the mtime, and the indexer gets those from the filesystem it is
 * already walking.
 */
interface ListedDiagram {
  path?: unknown;
  meta?: unknown;
}

/** Turn one `tldrawkc list --json` payload into the shared shape. */
export function normaliseListing(parsed: unknown, directory: string): DiagramListing {
  const raw = (typeof parsed === "object" && parsed !== null ? parsed : {}) as {
    diagrams?: unknown;
    errors?: unknown;
  };
  if (!Array.isArray(raw.diagrams)) {
    throw new IndexError(`\`tldrawkc list ${directory} --json\` returned no "diagrams" list`);
  }
  const diagrams: DiagramEntry[] = [];
  for (const entry of raw.diagrams as ListedDiagram[]) {
    if (typeof entry?.path !== "string") continue;
    diagrams.push({ path: entry.path, meta: asMeta(entry.meta) });
  }
  const errors: { path: string; message: string }[] = [];
  for (const entry of Array.isArray(raw.errors) ? raw.errors : []) {
    const row = entry as { path?: unknown; message?: unknown; error?: unknown };
    errors.push({
      path: typeof row?.path === "string" ? row.path : directory,
      message: String(row?.message ?? row?.error ?? "unreadable"),
    });
  }
  // The command sorts by path already. Sorting again costs nothing and makes
  // "both readers return the same list" a property of this module rather than
  // of the other repo's implementation.
  diagrams.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  return { via: "tldrawkc", diagrams, errors };
}

/** `tldrawkc list <directory> --json`, run out of the pinned submodule build. */
export async function listByCli(repoRoot: string, directory: string): Promise<DiagramListing> {
  const cli = canvasCliPath(repoRoot);
  let stdout: string;
  try {
    ({ stdout } = await run("node", [cli, "list", directory, "--json"], {
      maxBuffer: 32 * 1024 * 1024,
    }));
  } catch (error) {
    const stderr = (error as { stderr?: string }).stderr?.trim();
    throw new IndexError(
      `\`tldrawkc list ${directory} --json\` failed\n  ${stderr || (error as Error).message}`,
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    throw new IndexError(`\`tldrawkc list ${directory} --json\` did not return JSON`);
  }
  return normaliseListing(parsed, directory);
}

/**
 * The tool's answer when it is built, the file's own bytes when it is not.
 *
 * Not a fallback on failure: a built CLI that errors is a real error and is
 * thrown, because silently dropping to the second reader is how the two come to
 * disagree without anyone finding out.
 */
export async function listDiagrams(
  repoRoot: string,
  directory: string,
): Promise<DiagramListing> {
  return hasCanvasCli(repoRoot) ? listByCli(repoRoot, directory) : listByParsing(directory);
}

/** A `.tldr` path as the error messages name it: repo-relative, forward slashes. */
export function describe(repoRoot: string, file: string): string {
  return relativeTo(repoRoot, file);
}

/**
 * One `.tldr`, read the same way the whole directory would be.
 *
 * It reads the directory and picks the file out rather than parsing the file
 * alone, so a single-file write path and a full index run always agree about
 * what a document says: `tldrawkc list` answers when the tool is built and the
 * JSON parser answers when it is not, and which of the two ran is not something
 * `catalog assert-output` should be able to decide differently.
 *
 * `learn/assets/` holds tens of files, not thousands, so the cost of reading
 * the siblings is a directory scan nobody notices.
 */
export async function readDiagram(
  repoRoot: string,
  file: string,
): Promise<DiagramEntry> {
  const listing = await listDiagrams(repoRoot, path.dirname(file));
  const failed = listing.errors.find((entry) => path.resolve(entry.path) === path.resolve(file));
  if (failed !== undefined) {
    throw new IndexError(
      `${describe(repoRoot, file)} could not be read as a tldraw document: ${failed.message}`,
    );
  }
  const found = listing.diagrams.find((entry) => path.resolve(entry.path) === path.resolve(file));
  if (found === undefined) {
    throw new IndexError(
      `${describe(repoRoot, file)} is not a .tldr this repo can read (read by ${listing.via})`,
    );
  }
  return found;
}
