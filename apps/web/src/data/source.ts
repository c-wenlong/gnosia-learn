import "server-only";

import { fileSource, selectSource, type SelectedSource } from "@self-learn/content";
import { connection } from "next/server";
import { cache } from "react";

import { REPO_ROOT } from "@/data/repo-root";
import { catalogDatabase } from "@/lib/learner-store";

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
 * **The database is reached only for a type that resolves to it**, and not at
 * build time: `connection()` marks the read as request work, the rule every
 * other database read in the app follows, and the catalog is imported lazily
 * so nothing constructs a pool during `next build`.
 */

const files = fileSource(REPO_ROOT);

export const contentSource = cache(
  (): SelectedSource =>
    selectSource({
      files,
      db: async () => {
        await connection();
        const { dbSource } = await import("@self-learn/catalog/state");
        return dbSource(await catalogDatabase());
      },
    }),
);
