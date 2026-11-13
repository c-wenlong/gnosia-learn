import { existsSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

/**
 * The product was Gnosia. Data written before the rename lives in
 * `~/.gnosia`. A checkout with no home set still finds that directory, so a
 * rename does not orphan the catalog and the blob store.
 */
export const HOME_ENV = "HERMES_HOME";
export const LEGACY_HOME_ENV = "GNOSIA_HOME";
const HOME_DIR = ".hermes";
const LEGACY_HOME_DIR = ".gnosia";

/** `$HERMES_HOME`, else `$GNOSIA_HOME`, else `~/.hermes` when it exists, else `~/.gnosia`. */
export function dataHome(env: NodeJS.ProcessEnv = process.env): string {
  const set = env[HOME_ENV]?.trim() || env[LEGACY_HOME_ENV]?.trim();
  if (set) {
    return set === "~" || set.startsWith("~/") ? path.join(homedir(), set.slice(1)) : set;
  }
  const next = path.join(homedir(), HOME_DIR);
  const legacy = path.join(homedir(), LEGACY_HOME_DIR);
  return existsSync(next) || !existsSync(legacy) ? next : legacy;
}
