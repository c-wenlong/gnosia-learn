import { stat } from "node:fs/promises";

import { canvas } from "./canvas";
import { absolute, ASSETS_DIR, targetPath, targetSvgPath } from "./paths";

/**
 * The corpus, as the browser screen reads it.
 *
 * `canvas list --json` is the source and this module adds exactly one thing to
 * it: the SVG's own modified time, which the tool does not report. `list`
 * answers `svg: { path, exists }` and nothing more, so "is the picture older
 * than the document" — the only question the freshness pill asks — cannot be
 * answered from that output alone. One `stat` per entry closes it.
 *
 * Why this lives in the runner rather than in a Next server component: layering
 * rule 1. The UI is a view over this service's HTTP API, and a page that
 * spawned `npm run canvas` itself would be a second implementation of what a
 * diagram is, drifting from the first the day either changed. D13 also says the
 * freshness answer is the server's to give, since the cross-origin mirror
 * cannot be asked.
 *
 * Deliberately *not* the `asset` table. `/library` reads that, and the indexer
 * refuses a `.tldr` with no topic by name — which is precisely the file the
 * studio exists to show, because a person has to see it to fix it.
 */

/** Whether the exported SVG still matches the document beside it. */
export type SvgState = "current" | "stale" | "missing";

export interface DiagramFile {
  /** Repo-relative, so it is the same string the catalog and the job rows use. */
  path: string;
  exists: boolean;
  /** ISO 8601, or null when the file is not there. */
  modified: string | null;
  bytes: number | null;
}

/** One `.tldr` and everything the grid, the inspector and the strip show. */
export interface DiagramView {
  /** The filename stem, which is the concept id and the route segment. */
  name: string;
  tldr: DiagramFile;
  svg: DiagramFile;
  title: string | null;
  topic: string | null;
  concepts: string[];
  /** The note the diagram was drawn for, when the document records one. */
  source: string | null;
  shapes: number;
  /** From `meta.created`, the only creation time anything records. */
  created: string | null;
  svgState: SvgState;
}

/** A `.tldr` that would not parse. U6: the one place it is visible. */
export interface DiagramProblem {
  name: string;
  path: string;
  message: string;
}

export interface DiagramListing {
  /** Repo-relative directory that was walked. */
  dir: string;
  diagrams: DiagramView[];
  errors: DiagramProblem[];
  counts: { total: number; withTopic: number; unreadable: number };
}

/* -------------------------------------------------------------------------- */

/** `learn/assets/x.tldr` from an absolute path, or the absolute path unchanged. */
function relativise(file: string, root: string): string {
  return file.startsWith(`${root}/`) ? file.slice(root.length + 1) : file;
}

async function fileFacts(relative: string): Promise<DiagramFile> {
  try {
    const info = await stat(absolute(relative));
    return {
      path: relative,
      exists: info.isFile(),
      modified: info.mtime.toISOString(),
      bytes: info.size,
    };
  } catch {
    return { path: relative, exists: false, modified: null, bytes: null };
  }
}

/**
 * Stale is `svg older than tldr`, and missing is its own answer.
 *
 * Strictly older rather than "not newer": the two files are written seconds
 * apart by `export`, and an equal-to-the-millisecond pair is the normal result
 * of a fresh export on a filesystem with coarse timestamps. Calling that stale
 * would leave the pill amber on every diagram the tool just made.
 */
export function svgStateFor(tldrModified: string | null, svgModified: string | null): SvgState {
  if (svgModified === null) return "missing";
  if (tldrModified === null) return "current";
  return Date.parse(svgModified) < Date.parse(tldrModified) ? "stale" : "current";
}

/** A name that is one path segment and cannot climb out of `learn/assets`. */
const NAME = /^[a-z0-9][a-z0-9-]*$/i;

export function isDiagramName(value: string): boolean {
  return NAME.test(value) && value.length <= 120;
}

interface RawEntry {
  path?: string;
  name?: string;
  relative?: string;
  shapes?: number;
  modified?: string;
  meta?: {
    title?: string;
    topic?: string;
    concepts?: string[];
    source?: string;
    created?: string;
  } | null;
}

interface RawListing {
  dir?: string;
  diagrams?: RawEntry[];
  errors?: { path?: string; relative?: string; message?: string }[];
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

/**
 * Walk `learn/assets` and answer what is in it.
 *
 * A file that will not parse is data rather than a failure, which is `list`'s
 * own verdict and the reason this returns `errors` instead of throwing: the
 * caller asked what is in the directory, and "these two, and this one is
 * broken" is the complete answer.
 */
export async function listDiagrams(): Promise<DiagramListing> {
  const result = await canvas(["list", absolute(ASSETS_DIR), "--json"], 60_000);
  if (result.code !== 0 || result.json === null) {
    throw new Error(
      `canvas list exited ${result.code ?? "on a signal"} and printed no JSON: ` +
        `${(result.stderr || result.stdout).trim().split("\n").slice(-3).join(" ") || "nothing at all"}`,
    );
  }
  const raw = result.json as RawListing;
  const root = absolute("");
  const dir = relativise(text(raw.dir) ?? absolute(ASSETS_DIR), root.replace(/\/$/, ""));

  const diagrams: DiagramView[] = [];
  for (const entry of raw.diagrams ?? []) {
    const name = text(entry.name);
    if (name === null) continue;
    const [tldr, svg] = await Promise.all([
      fileFacts(targetPath(name)),
      fileFacts(targetSvgPath(name)),
    ]);
    diagrams.push({
      name,
      tldr,
      svg,
      title: text(entry.meta?.title),
      topic: text(entry.meta?.topic),
      concepts: (entry.meta?.concepts ?? []).filter((slug) => typeof slug === "string"),
      source: text(entry.meta?.source),
      shapes: typeof entry.shapes === "number" ? entry.shapes : 0,
      created: text(entry.meta?.created),
      svgState: svgStateFor(tldr.modified, svg.modified),
    });
  }

  const errors: DiagramProblem[] = (raw.errors ?? []).map((problem) => {
    const relative = text(problem.relative) ?? text(problem.path) ?? "an unnamed file";
    return {
      name: relative.replace(/\.tldr$/, ""),
      path: `${ASSETS_DIR}/${relative}`,
      message: text(problem.message) ?? "would not parse",
    };
  });

  return {
    dir,
    diagrams,
    errors,
    counts: {
      total: diagrams.length,
      withTopic: diagrams.filter((entry) => entry.topic !== null).length,
      unreadable: errors.length,
    },
  };
}

/** One diagram by name, or null when the directory has no such file. */
export async function readDiagram(name: string): Promise<DiagramView | null> {
  const listing = await listDiagrams();
  return listing.diagrams.find((entry) => entry.name === name) ?? null;
}
