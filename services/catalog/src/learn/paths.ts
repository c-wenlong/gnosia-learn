import { tmpdir } from "node:os";
import path from "node:path";

import { loadEnv, REPO_ROOT } from "../env";

/**
 * Where the knowledge base's *files* live. The state that used to sit beside
 * them under `learn/state/` is in Postgres now; what is left here is what was
 * always authored rather than derived — the notes, the session logs, the
 * diagrams and the generated map.
 *
 * `LEARN_ROOT` overrides the repository root. The old `paths.mjs` resolved it
 * from the CLI file's own location, which let `cli.test.mjs` copy the pipeline
 * into a temp directory and get a temp knowledge base for free. That trick
 * stops working when the CLI lives in a workspace and the state lives in a
 * database, so the override is explicit: the tests set `LEARN_ROOT` to a
 * fixture tree and `DATABASE_URL` to a scratch database, and nothing they do
 * can touch the real `learn/` or the real `self_learn`.
 *
 * It is read through `loadEnv` rather than straight off `process.env`, so
 * `services/catalog/.env.example` can document it beside `DATABASE_URL` and
 * have that documentation be true. A test setting it in the process
 * environment still wins: `loadEnv` never overwrites a variable already set.
 */

export const LEARN_ROOT_ENV = "LEARN_ROOT";

export function repoRoot(): string {
  loadEnv();
  const override = process.env[LEARN_ROOT_ENV]?.trim();
  return override !== undefined && override !== "" ? path.resolve(override) : REPO_ROOT;
}

export const kbDir = () => path.join(repoRoot(), "learn");
export const conceptsDir = () => path.join(kbDir(), "concepts");
export const sessionsDir = () => path.join(kbDir(), "sessions");
export const assetsDir = () => path.join(kbDir(), "assets");
export const mapFile = () => path.join(kbDir(), "map.md");

/**
 * Directories `ensureDirs` creates. `state/` is gone: it held `model.json`,
 * `reviews.json`, `events.jsonl` and `index.json`, all four of which are now
 * tables, and recreating an empty directory on every run would leave a
 * confusing husk in every checkout.
 */
export const allDirs = () => [kbDir(), conceptsDir(), sessionsDir(), assetsDir()];

/**
 * Where `learn concept checkout` puts the copy a session edits: under
 * `$LEARN_ROOT/work/` when `LEARN_ROOT` is set (a test's fixture tree, or a
 * knowledge base kept outside the repository), else under the OS temp
 * directory. Never under the repository itself, where a checkout would be an
 * untracked file in the owner's `git status`. `LEARN_WORK_DIR` overrides both.
 */
export function workDir(): string {
  loadEnv();
  const explicit = process.env["LEARN_WORK_DIR"]?.trim();
  if (explicit !== undefined && explicit !== "") return path.resolve(explicit);
  const root = process.env[LEARN_ROOT_ENV]?.trim();
  if (root !== undefined && root !== "") return path.join(path.resolve(root), "work");
  return path.join(tmpdir(), "self-learn", "work");
}

/** Path relative to the repo root, for display. */
export function rel(target: string): string {
  return path.relative(repoRoot(), target) || ".";
}
