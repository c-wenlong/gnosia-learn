import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";

/**
 * The environment the sidecar runs with: the one the web app sees.
 *
 * Saved provider keys are sealed under `AUTH_SECRET` (docs/BYOK.md), and the
 * sidecar must open them with the same secret the web sealed them with. The
 * web gets its environment from two files no other process reads on its own:
 * `$GNOSIA_HOME/.env`, which the desktop shell merges under its own
 * environment before it spawns `next dev` (apps/desktop's
 * `Checkout.childEnv()`), and `apps/web/.env.local` and its siblings, which
 * Next loads itself. The macOS app spawns the sidecar with neither, so
 * without this every key saved on the web read as unreadable here, and a
 * save from macOS failed `NO_SECRET` (or, with a different secret exported by
 * the shell, sealed a key the web could not open).
 *
 * The order is the web's in the desktop shell, highest first:
 *
 * 1. the process's own environment (what the shell exported);
 * 2. `$GNOSIA_HOME/.env` (default `~/.gnosia/.env`);
 * 3. the app's `.env` files, read by Next's own loader (`@next/env`) in
 *    development mode, as `scripts/lib/dev-env.mjs` reads them for
 *    `npm run dev:up`, so a quoted value, a comment or a `$VAR` reads as it
 *    does under `next dev`.
 *
 * `services/catalog/.env` needs nothing here: the catalog reads it itself.
 */

/** The data home's `.env`: `$GNOSIA_HOME/.env`, or `~/.gnosia/.env`. */
export function dataHomeEnvFile(env: Record<string, string | undefined>): string {
  const home = env.GNOSIA_HOME?.trim();
  return join(home ? home : join(homedir(), ".gnosia"), ".env");
}

/** KEY=VALUE pairs of a dotenv file, or none when it cannot be read. */
export function readEnvFile(file: string): Record<string, string> {
  if (!existsSync(file)) return {};
  try {
    return parseEnv(readFileSync(file, "utf8")) as Record<string, string>;
  } catch {
    return {};
  }
}

interface NextEnv {
  loadEnvConfig?: (dir: string, dev: boolean, log: { info(): void; error(): void }, forceReload: boolean) => unknown;
}

/** The repository root, three levels above this file's directory (`services/sidecar/src`). */
function repoRoot(): string {
  return resolve(fileURLToPath(new URL(".", import.meta.url)), "..", "..", "..");
}

/**
 * Fill `process.env` as the web's own is filled, in the order above. Next's
 * loader writes into `process.env` and keeps what is already there, so the
 * data home's values go in first and the app's files only fill what is left.
 * A loader that cannot run (no `@next/env` in a stripped checkout) costs the
 * app's files, not the start: the data home's values are already in.
 */
export async function loadSidecarEnv({ appDir = join(repoRoot(), "apps", "web") }: { appDir?: string } = {}): Promise<void> {
  for (const [key, value] of Object.entries(readEnvFile(dataHomeEnvFile(process.env)))) {
    if (process.env[key] === undefined) process.env[key] = value;
  }
  if (!existsSync(appDir)) return;
  try {
    // The CommonJS module's namespace differs between plain node (`default`)
    // and tsx (named exports), so take the function from whichever holds it.
    const mod = (await import("@next/env")) as NextEnv & { default?: NextEnv };
    const load = mod.loadEnvConfig ?? mod.default?.loadEnvConfig;
    if (load === undefined) throw new Error("@next/env has no loadEnvConfig");
    load(appDir, true, { info() {}, error() {} }, true);
  } catch (error) {
    process.stderr.write(
      `sidecar: could not read ${appDir}'s .env files: ${error instanceof Error ? error.message : String(error)}\n`,
    );
  }
}
