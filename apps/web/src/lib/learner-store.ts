import "server-only";

import { connection } from "next/server";
import {
  EMPTY_KNOWLEDGE_BASE,
  readKnowledgeBase,
  readLearnerSnapshot,
  StateError,
  type CatalogDatabase,
  type KnowledgeBase,
} from "@gnosia/catalog/state";
import { emptyLearnerState, type LearnerState } from "@gnosia/schema/shared";
import { failureCode } from "@gnosia/tutor/server/provider-keys";

import { currentOwner } from "@/lib/owner";

/**
 * The web app's door to the learner state store.
 *
 * **Server only**, and `import "server-only"` enforces it: this holds the
 * catalog's SQLite handle, and a `"use client"` import would otherwise compile
 * and ship a database driver to the browser. Components get the state through
 * `LearnerProvider`, which a server component seeds from here, and change it
 * through `/api/learner/*`.
 *
 * Three rules shape this file.
 *
 * **Nothing here runs at build time.** Every entry point calls `connection()`
 * first, which tells Next this work belongs to a request. `connect` creates
 * the database file on first use, so a build that opened it would leave a
 * file behind wherever it ran, and a page that baked its answer in at build
 * time would show a study session from whenever the last deploy happened,
 * which is the bug `learn/state/index.json` had.
 *
 * **An unreachable database is a state, not a crash.** Reads degrade to empty
 * and say so, exactly as `loadKnowledgeBase` already did for a missing
 * snapshot file. The `reachable` flag travels with the data so the UI can tell
 * "nothing recorded yet" from "could not ask".
 *
 * **Writes never degrade.** A mutation that cannot reach the database has to
 * fail loudly and visibly. Swallowing it would leave the learner looking at an
 * optimistic tick that no longer exists after a reload, which is worse than an
 * error.
 */

/**
 * One connection for the process, opened on first use.
 *
 * Next reuses the module across requests, so this is per server instance
 * rather than per render. A SQLite file is one handle per connect, and its
 * writes are serialised by the file, not by a pool.
 */
let handle: { db: CatalogDatabase; close: () => Promise<void> } | null = null;

/**
 * The connection itself, for a read that lives in another module.
 *
 * `@/lib/asset-library` is the catalog's other reader — the content half rather
 * than the learner's — and it degrades in exactly the shape the three reads
 * below do. What it must not do is open a second handle: two in one process
 * are two busy timeouts on one file and two answers to "is the database up".
 * So the connection stays private to this module and is handed
 * out; the degradation stays with whoever is doing the reading, because the
 * empty value a failed read falls back to is different for every one of them.
 */
export async function catalogDatabase(): Promise<CatalogDatabase> {
  return database();
}

async function database(): Promise<CatalogDatabase> {
  if (handle === null) {
    // Imported lazily so nothing is opened during a build, even if something
    // imports this module for its types. `connectionTimeoutMillis` is how long
    // a read waits on a file another process is writing.
    const { connect } = await import("@gnosia/catalog/state");
    handle = connect({ connectionTimeoutMillis: 3_000 });
  }
  return handle.db;
}

export interface Snapshot {
  state: LearnerState;
  /** False when the database could not be reached; `state` is then empty. */
  reachable: boolean;
}

/**
 * The read, without the request marker.
 *
 * Split out because `connection()` throws outside a request scope, which is
 * every context that is not a render: a route handler, and a test. The
 * degradation is the interesting part and this is the function that has it.
 * `owner` is whose state (`currentOwner()`); it is resolved by the caller,
 * outside the degradation, so a request with no owner fails rather than
 * reading as an empty learner.
 */
export async function readSnapshot(owner: string): Promise<Snapshot> {
  try {
    return { state: await readLearnerSnapshot(await database(), owner), reachable: true };
  } catch (error) {
    warn("learner snapshot", error);
    return { state: emptyLearnerState(), reachable: false };
  }
}

/** The learner's whole state, or an empty one when the database is down. */
export async function loadLearnerSnapshot(): Promise<Snapshot> {
  await connection();
  return readSnapshot(await currentOwner());
}

export interface KnowledgeBaseSnapshot {
  kb: KnowledgeBase;
  reachable: boolean;
}

/** As `readSnapshot`, for the concept graph: the owner's mastery over the concepts they may read. */
export async function readKb(owner: string): Promise<KnowledgeBaseSnapshot> {
  try {
    return { kb: await readKnowledgeBase(await database(), owner), reachable: true };
  } catch (error) {
    warn("knowledge base", error);
    return { kb: EMPTY_KNOWLEDGE_BASE, reachable: false };
  }
}

/** The concept graph with mastery and schedule, or an empty one. */
export async function loadKnowledgeBase(): Promise<KnowledgeBaseSnapshot> {
  await connection();
  return readKb(await currentOwner());
}

/**
 * Run a write against the store. Unlike the reads, this throws: a mutation
 * that could not be recorded must reach the caller so the UI can say so.
 */
export async function withLearnerStore<T>(
  fn: (db: CatalogDatabase) => Promise<T>,
): Promise<T> {
  // No `connection()`: a route handler is always request-time by definition,
  // and calling it there throws for being outside a render's request scope.
  return fn(await database());
}

/** True when the error is the data's fault rather than the database's. */
export function isBadRequest(error: unknown): boolean {
  return error instanceof StateError;
}

/** Logged by code only: a drizzle message carries the statement and its parameters. */
function warn(what: string, error: unknown): void {
  console.warn(`learner store: ${what} unavailable (${failureCode(error)})`);
}
