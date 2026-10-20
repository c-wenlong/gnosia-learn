import { fsStore, type BlobStore } from "@self-learn/blob";
import { blobRoot, connect, type CatalogDatabase, type Connection } from "@self-learn/catalog/state";
import { ownerScope } from "@self-learn/schema/shared";
import type { TutorDeps } from "@self-learn/tutor/server/deps";
import { selectContentSource } from "@self-learn/tutor/server/content-source";

import { owner as configuredOwner } from "./config";

/**
 * The seams the tutor core reads through, resolved once for the process.
 *
 * This is the sidecar half of the shape `apps/web` builds per request in
 * `src/lib/agent/env.ts`: the same `TutorDeps`, built here around this
 * process's own pool and the one configured owner instead of a session's.
 * `seams` is left unset on purpose — the package's own readers answer, which
 * is what "the sidecar reuses the TypeScript implementation" means.
 *
 * `db` is the pool handle as a promise, exactly as the web deps hand it: a
 * database that is down rejects inside whichever read asks for it, and that
 * read's own degradation answers — a chat says 503 for a missing concept,
 * saved keys fall back to the server's env keys and the turn still runs.
 */
export interface SidecarRuntime {
  deps: TutorDeps;
  /** The pool's own `close`, for shutdown. */
  close: () => Promise<void>;
}

/**
 * Open the pool and build the deps. The connect is lazy in the same way the
 * web app's is: `connect()` opens the pool object without touching the
 * server, so a dead Postgres is a request-time 503, not a failed boot — the
 * native app should be able to ask `/api/health` and be told.
 */
export function tutorDeps(env: Record<string, string | undefined> = process.env): SidecarRuntime {
  const owner = configuredOwner(env);
  const connection: Connection = connect({ max: 4 });
  const db: Promise<CatalogDatabase> = Promise.resolve(connection.db);
  return {
    deps: {
      db,
      owner,
      scope: ownerScope(owner),
      source: selectContentSource({ db: () => db, scope: () => Promise.resolve(ownerScope(owner)) }),
      blobStore: blobStoreOf(),
      env,
    },
    close: () => connection.close(),
  };
}

/** The catalog's blob root (`SELF_LEARN_HOME`), as `fsStore` reads it. */
function blobStoreOf(): BlobStore {
  return fsStore(blobRoot());
}
