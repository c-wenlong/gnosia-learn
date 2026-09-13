import "server-only";

import { existsSync } from "node:fs";
import path from "node:path";

/**
 * Where `content/` is, seen from inside the app.
 *
 * `@self-learn/content` defaults its root to `process.cwd()`, which was the
 * repository root for as long as the app *was* the repository root. It is
 * `apps/web/` now — Next runs a build and a server from the project directory,
 * and Vercel does the same with the project's Root Directory set — so the
 * default would look for `apps/web/content/` and find nothing.
 *
 * Walking up rather than hardcoding `../..` is not defensiveness for its own
 * sake: the deployed tree is not the repository (`outputFileTracingRoot` in
 * next.config.ts decides how much of it comes along), and a build run from the
 * repository root instead of the app directory is a normal thing to do. Both
 * land on the directory that actually holds the content, and a tree with no
 * content at all fails here with a sentence rather than deep inside a YAML
 * reader with "content/courses does not exist".
 */
function findRepoRoot(): string {
  let directory = process.cwd();
  for (;;) {
    if (existsSync(path.join(directory, "content", "courses"))) return directory;
    const parent = path.dirname(directory);
    if (parent === directory) {
      throw new Error(
        `No content/courses directory above ${process.cwd()}. The web app reads the ` +
          `authored content from the repository's content/ directory at request time; ` +
          `if this is a deployment, next.config.ts's outputFileTracingIncludes is what ` +
          `puts those files there.`,
      );
    }
    directory = parent;
  }
}

/** Resolved once per server process. */
export const REPO_ROOT: string = findRepoRoot();
