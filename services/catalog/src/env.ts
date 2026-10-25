import { defaultBlobRoot } from "@gnosia/blob";
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
 * The catalog's database is a SQLite file (docs/SQLITE-MIGRATION.md): one
 * file next to the blob store, at `$GNOSIA_HOME/catalog.db`, or
 * `~/.gnosia/catalog.db` when `GNOSIA_HOME` is unset. Daily
 * development needs no configuration at all; tests and scripts point
 * `CATALOG_DB` (or `DATABASE_URL`, below) at a scratch file.
 */
export const DEFAULT_DATABASE_PATH = path.join(homedir(), ".gnosia", "catalog.db");

/**
 * The variable that names the file. `CATALOG_DB` rather than reusing
 * `DATABASE_URL` alone, so a stale `postgres://…` value in a `.env` fails
 * loudly instead of being read as a path.
 */
export const CATALOG_DB_ENV = "CATALOG_DB";

/** The manimkc submodule, relative to the repo root. Also the git path in `git submodule update --init <here>`. */
export const MANIMKC_DIR = path.join("tools", "manimkc");

/** The tldrawkc submodule, relative to the repo root. Same, for the other tool. */
export const TLDRAWKC_DIR = path.join("tools", "tldrawkc");

/** The remotionkc submodule, relative to the repo root. The second video tool. */
export const REMOTIONKC_DIR = path.join("tools", "remotionkc");

/** The revideokc submodule, relative to the repo root. The third video tool. */
export const REVIDEOKC_DIR = path.join("tools", "revideokc");

/** The blenderkc submodule, relative to the repo root. The fourth video tool. */
export const BLENDERKC_DIR = path.join("tools", "blenderkc");

export const MANIMKC_ROOT_ENV = "MANIMKC_ROOT";

export const REMOTIONKC_ROOT_ENV = "REMOTIONKC_ROOT";

export const REVIDEOKC_ROOT_ENV = "REVIDEOKC_ROOT";

export const BLENDERKC_ROOT_ENV = "BLENDERKC_ROOT";

/**
 * Set to `1` to write to a database whose `catalog_instance` row says `copy`
 * (edge case 14 of docs/CONTENT-MIGRATION.md). For the test suites and
 * `scripts/e2e.mjs` only, which write to throwaway copies on purpose; a person
 * who finds themselves reaching for it is pointed at the wrong database.
 */
export const COPY_OK_ENV = "CATALOG_COPY_OK";

/** Whether this process may write to a copy. */
export function copyOk(): boolean {
  return process.env[COPY_OK_ENV] === "1";
}
export const TLDRAWKC_ROOT_ENV = "TLDRAWKC_ROOT";

/** Files already read, so each is read at most once. */
const loaded = new Set<string>();

/**
 * The dotenv this service reads unless a caller says otherwise.
 * `CATALOG_ENV_FILE` replaces it, for a test that spawns something which
 * resolves the database: without it, a developer's own services/catalog/.env
 * (a `CATALOG_DB` of their own, say) would reach the child, and the test
 * would check their database instead of its scratch file.
 */
export const ENV_FILE = process.env.CATALOG_ENV_FILE?.trim() || path.join(SERVICE_ROOT, ".env");

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

/**
 * The data root the catalog shares with the blob store: `$GNOSIA_HOME`,
 * or `~/.gnosia`. Read after `services/catalog/.env` like the other
 * resolvers, so one file configures the CLI and the web app together.
 */
function gnosiaHome(): string {
  const raw = process.env[GNOSIA_HOME_ENV]?.trim();
  if (!raw) return path.join(homedir(), ".gnosia");
  return raw === "~" || raw.startsWith("~/") ? path.join(homedir(), raw.slice(1)) : raw;
}

/**
 * The database a connection string or variable names, as a filesystem path.
 *
 * Accepted forms: a plain path (`/abs`, `./rel`, `~/…`), a `sqlite:` or
 * `file:` URL, and the literal `:memory:` for tests that want no file at
 * all. A `postgres:`/`postgresql:` URL is not silently read as a path: it is
 * the old world, and the message says where the data went and which script
 * carries it over (`services/catalog/scripts/pg-to-sqlite.mjs`).
 */
export function databasePath(url?: string): string {
  const raw = (url ?? databaseUrl()).trim();
  if (raw === ":memory:") return raw;
  if (raw.startsWith("postgres://") || raw.startsWith("postgresql://")) {
    throw new Error(
      `DATABASE_URL is a Postgres URL (${redactUrl(raw)}), but the catalog is a SQLite file now ` +
        `(docs/SQLITE-MIGRATION.md). Point ${CATALOG_DB_ENV} at the file the port script wrote, ` +
        `or unset DATABASE_URL to use the default ${DEFAULT_DATABASE_PATH}.`,
    );
  }
  if (raw.startsWith("sqlite:")) return stripScheme(raw, "sqlite:");
  if (raw.startsWith("file:")) return fileURLToPath(raw);
  const expanded = raw === "~" || raw.startsWith("~/") ? path.join(homedir(), raw.slice(1)) : raw;
  return path.resolve(expanded);
}

/** `sqlite:///abs/path` and `sqlite:rel/path` both become paths; `sqlite::memory:` stays. */
function stripScheme(raw: string, scheme: string): string {
  const rest = raw.slice(scheme.length);
  if (rest === ":memory:") return rest;
  const withoutSlashes = rest.replace(/^\/+/, "");
  return path.resolve(withoutSlashes.startsWith("/") ? withoutSlashes : `/${withoutSlashes}`);
}

/**
 * The connection string for the catalog's SQLite file, as the rest of the
 * code knows it: `CATALOG_DB`, then `DATABASE_URL` when it names a file (so
 * the `DATABASE_URL=<scratch>` flows tests and scripts already use keep
 * working), then the default under the data root. The name stays because it
 * is what `.env` files, CI and every spawn-with-env already write; the
 * *value* is a path or `sqlite:` URL now, which connect resolves through
 * `databasePath`.
 */
export function databaseUrl(): string {
  loadEnv();
  const fromCatalogDb = process.env[CATALOG_DB_ENV]?.trim();
  if (fromCatalogDb) return fromCatalogDb;
  const raw = process.env.DATABASE_URL?.trim();
  if (raw) return raw;
  return path.join(gnosiaHome(), "catalog.db");
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
 * only version of this that stays true, and a `GNOSIA_MANIMKC_ROOT` beside
 * it would be a second answer to a question that already has one. Note that it
 * is *not* `$MANIMKC_HOME`, which is where manimkc's generated data lands; the
 * indexers get that from each report's `outRoot` and never from a path here.
 */
export function resolveManimkcRoot(repoRoot: string = REPO_ROOT): string {
  return checkoutRoot(MANIMKC_ROOT_ENV, MANIMKC_DIR, repoRoot);
}

/**
 * The remotionkc checkout: where its CLI is run from, and the default for
 * `--remotionkc-root`. The same rule as `MANIMKC_ROOT`, for the same reason:
 * remotionkc's own CLI resolves its checkout from `--root`, then this
 * variable, so the name means one thing in both repositories. Where its
 * renders land is `$REMOTIONKC_HOME`, which this repo never reads: it arrives
 * as each report's `outRoot`, as manimkc's data root does.
 */
export function resolveRemotionkcRoot(repoRoot: string = REPO_ROOT): string {
  return checkoutRoot(REMOTIONKC_ROOT_ENV, REMOTIONKC_DIR, repoRoot);
}

/**
 * The revideokc checkout, the same way: `--revideokc-root`, else this
 * variable (revideokc's own, with the same meaning), else the submodule. Its
 * renders land under `$REVIDEOKC_HOME`, which arrives as the report's
 * `outRoot` and is never read here.
 */
export function resolveRevideokcRoot(repoRoot: string = REPO_ROOT): string {
  return checkoutRoot(REVIDEOKC_ROOT_ENV, REVIDEOKC_DIR, repoRoot);
}

/**
 * The blenderkc checkout, the same way again: `--blenderkc-root`, else this
 * variable (blenderkc's own, with the same meaning), else the submodule. Its
 * renders land under `$BLENDERKC_HOME`, which arrives as the report's
 * `outRoot` and is never read here.
 */
export function resolveBlenderkcRoot(repoRoot: string = REPO_ROOT): string {
  return checkoutRoot(BLENDERKC_ROOT_ENV, BLENDERKC_DIR, repoRoot);
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

/** Where the laptop's blob store lives: its data root, with `blobs` under it. */
export const GNOSIA_HOME_ENV = "GNOSIA_HOME";

/**
 * The `fs` blob store's root: `$GNOSIA_HOME/blobs`, else
 * `~/.gnosia/blobs` (`defaultBlobRoot` in `@gnosia/blob` has the rules).
 *
 * One function for every process that opens the store, so the catalog CLI
 * that uploads and the web app that serves cannot resolve two roots: the
 * variable is read after `services/catalog/.env` like `DATABASE_URL`, which
 * Next reaches through this same module, so a value set in either
 * `services/catalog/.env` or the shell is seen by both. A root set only in
 * `apps/web/.env.local` would reach the app alone, which is why
 * `.env.example` says to set it in the catalog's file.
 */
export function blobRoot(): string {
  loadEnv();
  return defaultBlobRoot(process.env);
}

/**
 * The target as it is safe to print or log. A SQLite path holds no secret,
 * so this only still blanks a password in a URL — which matters only in the
 * error `databasePath` throws for a Postgres URL.
 */
export function redactUrl(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.password) parsed.password = "***";
    return parsed.toString();
  } catch {
    return url;
  }
}
