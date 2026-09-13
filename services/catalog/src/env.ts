import { existsSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** services/catalog/ */
export const SERVICE_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

/** The repository root: two levels above services/catalog/. */
export const REPO_ROOT = path.resolve(SERVICE_ROOT, "..", "..");

/**
 * Local Postgres, the Homebrew install, database `self_learn`. Documented in
 * services/catalog/.env.example. Daily development needs no configuration at
 * all; CI and the homeserver set DATABASE_URL and point at compose.yaml.
 */
export const DEFAULT_DATABASE_URL = "postgres://localhost:5432/self_learn";

/** The manimkc submodule, relative to the repo root. Also the git path in `git submodule update --init <here>`. */
export const MANIMKC_DIR = path.join("tools", "manimkc");

/** The tldrawkc submodule, relative to the repo root. Same, for the other tool. */
export const TLDRAWKC_DIR = path.join("tools", "tldrawkc");

export const MANIMKC_ROOT_ENV = "MANIMKC_ROOT";
export const TLDRAWKC_ROOT_ENV = "TLDRAWKC_ROOT";

/** Files already read, so each is read at most once. */
const loaded = new Set<string>();

/** The dotenv this service reads unless a caller says otherwise. */
export const ENV_FILE = path.join(SERVICE_ROOT, ".env");

/**
 * Reads services/catalog/.env if it exists. `process.loadEnvFile` is stdlib
 * (Node >= 20.12), so this costs no dependency, and it does not overwrite a
 * variable that is already set — which is what makes `DATABASE_URL=... npm run
 * catalog` and CI's job-level env win over a developer's local file.
 *
 * `file` exists for the tests, which need to prove that a value reaching a
 * resolver *through the dotenv* normalises the same way one from the shell
 * does. They cannot demonstrate that against the real path: it is a fixed
 * location in the repo, so writing it would clobber a developer's own file and
 * a crashed run would leave it behind.
 */
export function loadEnv(file: string = ENV_FILE): void {
  if (loaded.has(file)) return;
  loaded.add(file);
  if (!existsSync(file)) return;
  const before = { ...process.env };
  process.loadEnvFile(file);
  for (const [key, value] of Object.entries(before)) {
    if (value !== undefined) process.env[key] = value;
  }
}

export function databaseUrl(): string {
  loadEnv();
  const raw = process.env.DATABASE_URL?.trim();
  return raw ? raw : DEFAULT_DATABASE_URL;
}

/**
 * A submodule checkout, wherever this machine keeps it.
 *
 * Same precedence as `databaseUrl`, for the same reason: the shell environment
 * wins over `services/catalog/.env`, which wins over the default. And like
 * `DATABASE_URL`, the default is the one daily development wants, so nothing
 * has to be configured for the two submodules to be found where `.gitmodules`
 * puts them.
 *
 * Two things the URL case does not have to decide:
 *
 * **A relative value resolves against the repo root, never the working
 * directory.** A variable is set once, in a shell profile or a `.env`, and then
 * read by commands run from wherever the author happens to be; resolving
 * against the cwd would have it name a different folder each time. A flag is
 * typed at a prompt with the cwd in view, so `--manimkc-root` keeps resolving
 * against that (see `cli.ts`) and the two are deliberately different.
 *
 * **A leading `~` is expanded.** `process.loadEnvFile` performs no shell
 * expansion, so `MANIMKC_ROOT=~/code/manimkc` in a `.env` would otherwise name
 * a literal `~` directory beside the repo. manimkc's own CLI expands it, and a
 * value that means one thing in one tool and another in the next is worse than
 * either behaviour on its own.
 */
function checkoutRoot(variable: string, fallback: string, repoRoot: string): string {
  loadEnv();
  const raw = process.env[variable]?.trim();
  if (!raw) return path.join(repoRoot, fallback);
  const expanded = raw === "~" || raw.startsWith("~/") ? path.join(homedir(), raw.slice(1)) : raw;
  return path.resolve(repoRoot, expanded);
}

/**
 * The manimkc checkout: where its CLI is run from, and the default for
 * `--manimkc-root`.
 *
 * **`MANIMKC_ROOT` is manimkc's own variable, and it means the same thing
 * here.** Its CLI resolves the checkout as `--root`, then `$MANIMKC_ROOT`, then
 * a walk up from the working directory
 * (`tools/manimkc/tools/cli/manimkc_cli/repo.py`). Reusing the name is
 * deliberate: one variable that means "the manimkc checkout" everywhere is the
 * only version of this that stays true, and a `SELF_LEARN_MANIMKC_ROOT` beside
 * it would be a second answer to a question that already has one. Note that it
 * is *not* `$MANIMKC_HOME`, which is where manimkc's generated data lands; the
 * indexers get that from each report's `outRoot` and never from a path here.
 */
export function resolveManimkcRoot(repoRoot: string = REPO_ROOT): string {
  return checkoutRoot(MANIMKC_ROOT_ENV, MANIMKC_DIR, repoRoot);
}

/**
 * The tldrawkc checkout, whose `dist/cli/index.js` is what `npm run canvas`
 * invokes and what the diagram indexer prefers over parsing `.tldr` itself.
 *
 * `TLDRAWKC_ROOT` is new here rather than borrowed: tldrawkc reads only
 * `TLDRAWKC_CHROMIUM` today, so the name is free and follows its prefix. The
 * `canvas` script in the root package.json honours it too, so the tool and the
 * indexer cannot end up reading different builds.
 */
export function resolveTldrawkcRoot(repoRoot: string = REPO_ROOT): string {
  return checkoutRoot(TLDRAWKC_ROOT_ENV, TLDRAWKC_DIR, repoRoot);
}

/** The connection string with any password blanked, safe to print or log. */
export function redactUrl(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.password) parsed.password = "***";
    return parsed.toString();
  } catch {
    return "(unparseable DATABASE_URL)";
  }
}
