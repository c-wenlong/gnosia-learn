import "server-only";

import { fileSource, selectSource, type SelectedSource } from "@self-learn/content";
import { unstable_rethrow } from "next/navigation";
import { connection } from "next/server";
import { cache } from "react";

import { REPO_ROOT } from "@/data/repo-root";
import { catalogDatabase } from "@/lib/learner-store";
import { currentScope } from "@/lib/owner";

/**
 * Where the app's authored content comes from: the composition root of the
 * reader seam (docs/CONTENT-MIGRATION.md 0.6).
 *
 * Every content reader in the app (`getCourses`, `getTopics`, `getTags`) asks
 * `contentSource()` and never learns whether the answer came from `content/`
 * or from Postgres. Today every type resolves to files; a type moves to the
 * database when its track flips it, and `CONTENT_SOURCE=files` points it back.
 *
 * **One per request.** `cache()` gives each server render its own selected
 * source, so the `content_source` rows are asked once per request and a flip
 * shows on the next one. Outside a render (a route handler, a test) React's
 * `cache` does not memoise, and each call gets a fresh one, which is still
 * correct and costs a `stat` per file.
 *
 * **The file source is one per process**, because it keeps its last parse for
 * as long as the files are unchanged (`packages/content/src/file-source.ts`).
 *
 * **Who owns a type is the `content_source` row** (D18), read once per
 * request through `ownership`; `CONTENT_SOURCE` still overrides it for this
 * reader. When the rows cannot be read (the database is down, or not migrated
 * to 0010) every type falls back to files, which is what the pages served
 * before the seam existed, and the reason is logged once per outage rather
 * than once per request. "Once" is per cause: a database that was refusing
 * connections and now answers without a `content_source` table (or, later,
 * refuses the role) is a new problem, and a person needs to see it.
 *
 * **The database is reached only at request time**: `connection()` marks the
 * read as request work, the rule every other database read in the app
 * follows, and the catalog is imported lazily so nothing constructs a pool
 * during `next build`. The content itself is read from it only for a type
 * that resolves to `db`. During a prerender `connection()` throws Next's own
 * "dynamic server usage" signal, which has to reach Next rather than be taken
 * for an outage: `selectSource` catches whatever the callback throws and
 * hands it to `onOwnershipError`, so that is where it is rethrown.
 */

const files = fileSource(REPO_ROOT);

/**
 * The cause last reported, so each outage is logged once and a different
 * cause is logged again. A successful read clears it.
 */
let warnedCause: string | null = null;

export const contentSource = cache(
  (): SelectedSource =>
    selectSource({
      files,
      ownership: async () => {
        await connection();
        const { contentOwnership } = await import("@self-learn/catalog/state");
        const rows = await contentOwnership(await catalogDatabase());
        warnedCause = null;
        return rows;
      },
      onOwnershipError: (error) => {
        // Next's control flow, not an outage: a prerender bailing out on
        // `connection()`, a redirect, a not-found. It propagates to Next.
        unstable_rethrow(error);
        const reason = cause(error);
        if (reason === warnedCause) return;
        warnedCause = reason;
        console.warn(`content source: the content_source rows could not be read, reading files. ${reason}`);
      },
      db: async () => {
        await connection();
        const { dbSource } = await import("@self-learn/catalog/state");
        // The requesting owner's rows and the commons' only (phase 4).
        return dbSource(await catalogDatabase(), await currentScope());
      },
    }),
);

/**
 * The innermost message. drizzle wraps a driver error as "Failed query: ..."
 * and keeps what Postgres said (`relation "content_source" does not exist`)
 * on `cause`, and that is the half a person can act on.
 */
function cause(error: unknown): string {
  let message = error instanceof Error ? error.message : String(error);
  let current: unknown = error;
  for (let depth = 0; depth < 5 && current instanceof Error && current.cause !== undefined; depth += 1) {
    current = current.cause;
    if (current instanceof Error && current.message !== "") message = current.message;
  }
  return message;
}
