import { createHash } from "node:crypto";

import { readCheckDistractors, writeCheckDistractor, type CatalogDatabase } from "@gnosia/catalog/state";

import { CHECK_OPTIONS_VERSION } from "../check-options";
import type { ConceptCheck } from "../concept-note-core";

/**
 * The server half of the tutor's wrong options per note check: which stored
 * row still fits its check, and the one generation per check at a time
 * (docs/LEARN.md, "Wrong options"). The prompt and the parser are
 * `../check-options.ts`; the turn that calls the model is
 * `checkOptionsTurn` in `./turns.ts`.
 */

/** A check's wrong options, by check id: the shape a plan builder takes. */
export type WrittenOptions = Readonly<Record<string, readonly string[]>>;

/**
 * The hash a stored row is kept under: the prompt's version, the question and
 * the answer, so a check whose wording changed, or that moved to another
 * place in its note (ids are positional), reads as missing and is written
 * again. `why` and `source` are left out: they change neither what is asked
 * nor what is right.
 */
export function checkHash(check: Pick<ConceptCheck, "question" | "answer">): string {
  return createHash("sha256")
    .update(`v${CHECK_OPTIONS_VERSION}\n${check.question.trim()}\n${check.answer.trim()}`)
    .digest("hex");
}

/**
 * The stored wrong options that still fit each note's checks, for one
 * learner: a map from concept slug to its checks' options by check id, with a
 * row whose hash no longer matches its check left out. Reads only, so a page
 * may call it on every render. A database that cannot answer (down, or behind
 * the migration that made the table) is no rows, and the questions fall back
 * to the notes, as they did before the cache.
 */
export async function readWrittenOptions(
  db: CatalogDatabase | Promise<CatalogDatabase>,
  learnerId: string,
  notes: readonly { slug: string; checks: readonly ConceptCheck[] }[],
): Promise<Map<string, WrittenOptions>> {
  const out = new Map<string, WrittenOptions>();
  const wanted = notes.filter((n) => n.checks.length > 0);
  if (wanted.length === 0) return out;
  let rows;
  try {
    rows = await readCheckDistractors(
      await db,
      learnerId,
      wanted.map((n) => n.slug),
    );
  } catch (error) {
    console.warn(`check options: the stored wrong options are unavailable, ${error instanceof Error ? error.message : String(error)}`);
    return out;
  }
  const byKey = new Map(rows.map((r) => [`${r.conceptSlug}\0${r.checkId}`, r]));
  for (const note of wanted) {
    const written: Record<string, readonly string[]> = {};
    for (const check of note.checks) {
      const row = byKey.get(`${note.slug}\0${check.id}`);
      if (row !== undefined && row.checkHash === checkHash(check)) written[check.id] = row.options;
    }
    if (Object.keys(written).length > 0) out.set(note.slug, written);
  }
  return out;
}

/**
 * Generations in flight, by learner, concept, check and hash. A second caller
 * for the same check (two tabs, or a week check and a session at once) waits
 * on the first one's promise instead of calling the model again. Per process:
 * the web app and the sidecar each hold their own, and the row's upsert makes
 * a rare double write harmless.
 */
const inFlight = new Map<string, Promise<unknown>>();

/** Run `generate` once per key at a time; every concurrent caller gets the same result. */
export function oncePerCheck<T>(key: string, generate: () => Promise<T>): Promise<T> {
  const running = inFlight.get(key);
  if (running !== undefined) return running as Promise<T>;
  const started = generate().finally(() => inFlight.delete(key));
  inFlight.set(key, started);
  return started;
}

/** The key `oncePerCheck` holds a generation under. */
export function generationKey(learnerId: string, conceptSlug: string, checkId: string, hash: string): string {
  return [learnerId, conceptSlug, checkId, hash].join("\0");
}

/**
 * Store a generation's options. A write that fails (a read-only copy, a
 * database behind the migration) costs the cache and nothing else: the
 * options were written and the learner still gets them, so this logs and
 * returns false rather than throwing.
 */
export async function storeOptions(
  db: CatalogDatabase | Promise<CatalogDatabase>,
  learnerId: string,
  row: { conceptSlug: string; checkId: string; checkHash: string; options: string[]; model: string | null; provider: string | null },
): Promise<boolean> {
  try {
    await writeCheckDistractor(await db, learnerId, row);
    return true;
  } catch (error) {
    console.warn(
      `check options: wrong options for ${row.conceptSlug}#${row.checkId} were written but not stored, ${error instanceof Error ? error.message : String(error)}`,
    );
    return false;
  }
}
