import { execFile, spawn } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";

import { REPO_ROOT } from "../src/env";

/**
 * `scripts/flip-rehearsal.mjs`, the flip-day procedure, run end to end
 * against a copy of the file. The suites are split by subject so vitest runs
 * them side by side: `flip-rehearsal-refusals.test.ts` (the switches it
 * refuses), `flip-rehearsal.test.ts` (flip day on a copy),
 * `flip-rehearsal-removes.test.ts` (a tree that would remove rows),
 * `flip-rehearsal-cutover.test.ts` (flip day then the cut-over) and
 * `flip-rehearsal-cutover-checkout.test.ts` (the owner's order, from a
 * worktree at the tag). This module holds what they share.
 *
 * Since phase 3's cut-over the contract migration (0013) is no longer held
 * back: the owner's database had applied it before the cut-over merged, and
 * a database at 0009 holding a render nobody uploaded now fails its first
 * migrate on 0013's guard, as it should. So the template here is a database
 * migrated to the head and never flipped, which is what flip day can still
 * meet: a fresh one, or one whose renders all have their blobs. The tree is
 * the seed with one manimkc topic folder mapped,
 * and the manimkc CLI a stand-in reporting one rendered video and its
 * transcript, so the two uploads have something to store and the second has
 * nothing left to. ffmpeg is the suites' stand-in (vitest.setup.ts): since
 * 2026-10-05 the import cuts each render's poster and fails without one, so
 * the uploads find the poster already there. The script copies the template's
 * file, runs every step, and removes the copy; the template is read and
 * nothing else.
 *
 * The `--real` switch is tested only for its refusals. It runs flip day
 * against the owner's database file in place, and nothing here may. Its two
 * safeguards run in a rehearsal too, so they are tested here on the copy: the
 * backup (its printed restore run as printed, then read back) and the import into a
 * throwaway copy that refuses a tree which would remove rows.
 */

export const SCRIPT = path.join(REPO_ROOT, "scripts", "flip-rehearsal.mjs");

export interface Ran {
  code: number | null;
  stdout: string;
  stderr: string;
}

export function rehearse(args: string[], env: NodeJS.ProcessEnv = {}, script: string = SCRIPT): Promise<Ran> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [script, ...args], {
      cwd: path.dirname(path.dirname(script)),
      env: { ...process.env, ...env },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => (stdout += chunk.toString()));
    child.stderr.on("data", (chunk: Buffer) => (stderr += chunk.toString()));
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, stdout, stderr }));
  });
}

export interface Step {
  name: string;
  ok: boolean;
  gist: string;
  warning: string | null;
  result: Record<string, unknown> & { [key: string]: unknown };
}

export interface Report {
  mode: string;
  ok: boolean;
  tree: string;
  copy: { name: string; method: string; kept: boolean; dropped: boolean };
  preflight: string;
  backup: { path: string; bytes: number; tables: number; restore: string; restoreArgv: string[][] } | null;
  steps: Step[];
  warnings: number;
}

export const execFileAsync = promisify(execFile);

/**
 * The JSON report a run printed. A run that refused or crashed prints none,
 * only a sentence on stderr (a missing client tool, say), so that is what
 * the failure shows rather than JSON.parse's "Unexpected end of JSON input".
 */
export function reportOf<T = Report>(ran: Ran): T {
  try {
    return JSON.parse(ran.stdout) as T;
  } catch {
    throw new Error(`flip-rehearsal printed no report (exit ${ran.code}): ${ran.stderr.trim() || "nothing on stderr"}`);
  }
}

/**
 * Whether the throwaway copy file one rehearsal named in its report is still
 * there: `<preflight name>.db` beside the tree it copied into, inside the
 * scratch directory the report's `tree` sits under.
 */
export function preflightExists(report: Report): boolean {
  return existsSync(path.join(path.dirname(report.tree), `${report.preflight}.db`));
}

/** Files under `file`'s directory that share its prefix — the `-wal`/`-shm` sidecars included. */
export function filesLike(file: string): string[] {
  const dir = path.dirname(file);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((entry) => entry.startsWith(path.basename(file)))
    .map((entry) => path.join(dir, entry));
}
