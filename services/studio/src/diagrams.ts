import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";

import { canonicalJson } from "@self-learn/schema/shared";

import { diagramCheckout, diagramList, diagramShow } from "./catalog";
import { studioOwner } from "./config";
import { readThrough } from "./content-cache";
import { ASSETS_DIR, workDir, workPath } from "./paths";

/**
 * The corpus, as the browser screen reads it: `catalog diagram list --json`.
 *
 * A diagram lives in the database since Track D of docs/CONTENT-MIGRATION.md,
 * so the list is the rows, read with no subprocess of tldrawkc's: the shape
 * count and the stamp are read inside jsonb by the catalog. Freshness is the
 * two hashes (`svg_document_hash` against `document_hash`), which replaced the
 * modification-time comparison this module used to make, since a blob has no
 * modification time worth comparing.
 *
 * Every successful list is kept under `$STUDIO_HOME/cache/diagrams.json`, and
 * with Postgres down the screen is answered from that copy, marked stale with
 * the time it was read (D13 and edge case 1). Drawing still runs on the
 * checkouts; landing a diagram waits for the database.
 *
 * Why this lives in the runner rather than in a Next server component: layering
 * rule 1. The UI is a view over this service's HTTP API.
 */

/** Whether the exported SVG still matches the document. */
export type SvgState = "current" | "stale" | "missing";

export interface DiagramFile {
  /** The logical name, `learn/assets/<slug>.tldr`, the same string the catalog and the job rows use (D11). */
  path: string;
  exists: boolean;
  /** When the row last changed, as ISO 8601, or null when there is none. */
  modified: string | null;
  bytes: number | null;
}

/** Where a diagram's checkout stands, when one exists. */
export interface CheckoutView {
  /** Absolute: the file the mirror and every verb open. */
  path: string;
  revision: number | null;
  /** Edits made on the canvas that were never committed. */
  dirty: boolean;
  /** The diagram has a revision the checkout does not. */
  behind: boolean;
}

/** One diagram and everything the grid, the inspector and the strip show. */
export interface DiagramView {
  /** The slug, which is the route segment and the embed name. */
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
  /** The latest revision, what a job's base and a checkout are measured against. */
  revision: number | null;
  /** Only on a single diagram's read. */
  checkout?: CheckoutView | null;
}

/** A diagram that could not be read. The database refuses unreadable documents, so this is empty today. */
export interface DiagramProblem {
  name: string;
  path: string;
  message: string;
}

export interface DiagramListing {
  /** Where the diagrams come from, for the screen's header. */
  dir: string;
  diagrams: DiagramView[];
  errors: DiagramProblem[];
  counts: { total: number; withTopic: number; unreadable: number };
  /** True when the database could not be read and this is the copy from `readAt`. */
  stale: boolean;
  readAt: string;
  error?: string;
}

/** What `catalog diagram list --json` returns per diagram. */
interface Summary {
  slug: string;
  path: string;
  svgPath: string | null;
  title: string | null;
  topic: string;
  concepts: string[];
  source: string | null;
  created: string | null;
  shapes: number;
  documentBytes: number;
  svg: { key: string; bytes: number; sha256: string } | null;
  svgState: SvgState;
  revision: number | null;
  updatedAt: string;
  svgUpdatedAt: string | null;
}

/** A name that is one path segment and a slug, so no request can name anything else. */
const NAME = /^[a-z0-9][a-z0-9-]*$/i;

export function isDiagramName(value: string): boolean {
  return NAME.test(value) && value.length <= 120;
}

function isSummaries(value: unknown): value is Summary[] {
  return Array.isArray(value) && value.every((entry) => typeof (entry as Summary)?.slug === "string");
}

function viewOf(summary: Summary): DiagramView {
  return {
    name: summary.slug,
    tldr: { path: summary.path, exists: true, modified: summary.updatedAt, bytes: summary.documentBytes },
    svg: {
      path: summary.svgPath ?? `${ASSETS_DIR}/${summary.slug}.svg`,
      exists: summary.svg !== null,
      modified: summary.svgUpdatedAt,
      bytes: summary.svg?.bytes ?? null,
    },
    title: summary.title,
    topic: summary.topic,
    concepts: summary.concepts,
    source: summary.source,
    shapes: summary.shapes,
    created: summary.created,
    svgState: summary.svgState,
    revision: summary.revision,
  };
}

/**
 * How long one read of the list answers the thumbnails. A grid asks for every
 * tile's SVG key at once; without this, each tile would start its own
 * `catalog diagram list` subprocess and database query for the same rows.
 * The screen's own list is read fresh every time.
 */
const THUMBNAIL_REUSE_MS = 2_000;
let recent: { at: number; read: ReturnType<typeof summaries> } | null = null;

function sharedSummaries(): ReturnType<typeof summaries> {
  const now = Date.now();
  if (recent !== null && now - recent.at < THUMBNAIL_REUSE_MS) return recent.read;
  const read = summaries();
  recent = { at: now, read };
  // A failed read is not kept: the next tile asks again.
  read.catch(() => {
    if (recent?.read === read) recent = null;
  });
  return read;
}

/** Forget the list the thumbnails share, after a write that changed an SVG. */
export function forgetDiagramList(): void {
  recent = null;
}

/**
 * The cache's name for this runner's list: one per owner, since the list is
 * one owner's (the catalog is asked with `--owner`), and never the old
 * `diagrams`, which a runner from before owners wrote from every owner's rows.
 * An upgraded runner that finds the database down before its first read
 * therefore has no copy to show, rather than one with somebody else's
 * diagrams and SVG keys in it.
 */
function cacheName(): string {
  return `diagrams.${studioOwner()}`;
}

/** Every diagram's row as the catalog lists it, through the cache. */
async function summaries() {
  return readThrough<Summary[]>(
    cacheName(),
    async () => {
      const result = await diagramList();
      const list = (result.json as { diagrams?: unknown } | null)?.diagrams;
      if (!result.ok || !isSummaries(list)) {
        throw new Error(result.error ?? "catalog diagram list printed no diagrams list");
      }
      return list;
    },
    { isValue: isSummaries },
  );
}

/** The key of each diagram's SVG in the blob store, from the same (possibly cached) list. */
export async function svgKeyOf(name: string): Promise<{ key: string | null; stale: boolean }> {
  const read = await sharedSummaries();
  const found = read.value.find((entry) => entry.slug === name);
  return { key: found?.svg?.key ?? null, stale: read.stale };
}

export async function listDiagrams(): Promise<DiagramListing> {
  const read = await summaries();
  const diagrams = read.value.map(viewOf);
  return {
    dir: "the catalog",
    diagrams,
    errors: [],
    counts: {
      total: diagrams.length,
      withTopic: diagrams.filter((entry) => entry.topic !== null).length,
      unreadable: 0,
    },
    stale: read.stale,
    readAt: read.readAt,
    ...(read.error === undefined ? {} : { error: read.error }),
  };
}

/** One diagram by name, with its checkout, or null when the database has no such diagram. */
export async function readDiagram(name: string): Promise<DiagramView | null> {
  const listing = await listDiagrams();
  const found = listing.diagrams.find((entry) => entry.name === name) ?? null;
  if (found === null) return null;
  return { ...found, checkout: await checkoutOf(name) };
}

/** Where the checkout of `name` stands, from the catalog, or from the file alone when the database is down. */
export async function checkoutOf(name: string): Promise<CheckoutView | null> {
  const shown = await diagramShow(name, workDir());
  const state = (shown.json as { checkout?: unknown } | null)?.checkout as
    | { record: { revision: number | null } | null; dirty: boolean; behind: boolean }
    | undefined;
  if (shown.ok && state !== undefined) {
    if (state.record === null) return null;
    return { path: workPath(name), revision: state.record.revision, dirty: state.dirty, behind: state.behind };
  }
  const exists = (await stat(workPath(name)).catch(() => null)) !== null;
  return exists ? { path: workPath(name), revision: null, dirty: false, behind: false } : null;
}

export interface Checkout {
  /** Absolute path to the file every verb and the mirror take. */
  path: string;
  /** Whether there is a document at that path. */
  exists: boolean;
  /** The revision it was written from, when the catalog said. */
  revision: number | null;
  /** A sentence for the screen: what happened, or why the file was left alone. */
  note: string;
  /** The catalog could not be reached, and the file is whatever was checked out last. */
  offline: boolean;
  /**
   * The catalog answered and could not write the checkout, for a reason that
   * is neither an outage nor uncommitted edits. The file on disk, if any, may
   * be an older revision than the diagram, so nothing should build on it.
   */
  failed: boolean;
}

/**
 * A document file's hash as the catalog defines `document_hash`: the sha256
 * of its canonical JSON, so a file whose keys are in another order still
 * matches the row it came from. Null when there is no file; the file's raw
 * sha256 when it is not JSON, which then matches nothing, as it should.
 */
export async function documentHashOf(file: string): Promise<string | null> {
  const bytes = await readFile(file).catch(() => null);
  if (bytes === null) return null;
  let text: string;
  try {
    text = canonicalJson(JSON.parse(bytes.toString("utf8")));
  } catch {
    return createHash("sha256").update(bytes).digest("hex");
  }
  return createHash("sha256").update(text, "utf8").digest("hex");
}

/**
 * The revision the checkout on disk was written from, read from the record the
 * catalog keeps beside it (`<slug>.checkout.json`), with no database needed.
 * Null when it was checked out before the diagram existed; undefined when
 * there is no record to read.
 */
export async function checkoutRevision(name: string): Promise<number | null | undefined> {
  const record = await readFile(path.join(workDir(), `${name}.checkout.json`), "utf8").catch(() => null);
  if (record === null) return undefined;
  try {
    const revision = (JSON.parse(record) as { revision?: unknown }).revision;
    return typeof revision === "number" || revision === null ? revision : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Bring the checkout up to the diagram's latest revision, and say where it is.
 *
 * A checkout holding edits nobody committed is left exactly as it is: the
 * catalog refuses to overwrite it, and that refusal is an answer here, not a
 * failure, since those edits exist nowhere else. With the database down, the
 * last checkout on disk is what there is, and drawing still runs on it (D16).
 */
export async function ensureCheckout(name: string, options: { canvasOpen?: boolean } = {}): Promise<Checkout> {
  const onDisk = async () => (await stat(workPath(name)).catch(() => null)) !== null;
  // A canvas open on the checkout saves the whole document whenever a person
  // presses Cmd+S. The catalog checks for edits and then writes, and a save
  // landing between the two would be overwritten, so a checkout a canvas holds
  // is never refreshed: the canvas already shows it, and a commit from it is
  // checked against its base like any other.
  if (options.canvasOpen === true) {
    return {
      path: workPath(name),
      exists: await onDisk(),
      revision: (await checkoutRevision(name)) ?? null,
      note: `a canvas is open on ${workPath(name)}, so it was used as it is rather than refreshed`,
      offline: false,
      failed: false,
    };
  }
  const result = await diagramCheckout(name, workDir());
  const json = (result.json ?? {}) as { exists?: unknown; revision?: unknown; note?: unknown; code?: unknown };
  if (result.ok) {
    return {
      path: workPath(name),
      exists: json.exists === true,
      revision: typeof json.revision === "number" ? json.revision : null,
      note: typeof json.note === "string" ? json.note : "checked out",
      offline: false,
      failed: false,
    };
  }
  if (json.code === "dirty-checkout") {
    return {
      path: workPath(name),
      exists: await onDisk(),
      revision: (await checkoutRevision(name)) ?? null,
      note: `${workPath(name)} holds edits that were never committed, so it was left as it is`,
      offline: false,
      failed: false,
    };
  }
  if (result.offline) {
    return {
      path: workPath(name),
      exists: await onDisk(),
      revision: (await checkoutRevision(name)) ?? null,
      note: `the catalog is unreachable, so ${name} is the last checkout on disk`,
      offline: true,
      failed: false,
    };
  }
  return {
    path: workPath(name),
    exists: await onDisk(),
    revision: null,
    note: `the catalog could not check ${name} out: ${result.error ?? "no reason given"}`,
    offline: false,
    failed: true,
  };
}
