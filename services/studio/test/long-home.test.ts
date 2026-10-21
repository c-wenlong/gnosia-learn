import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { canvas } from "../src/canvas/canvas";
import { SNIPPETS } from "../src/manual/assemble";
import { checkSnippets, groupCanvas } from "../src/manual/source";
import { manualCheckDir } from "../src/paths";

/**
 * The manual check under a long `STUDIO_HOME`.
 *
 * The check runs `npm run canvas` with `TMPDIR` inside the studio's home, and
 * so does every job's agent. When `canvas` started through the `tsx` CLI, that
 * CLI bound a Unix socket at `$TMPDIR/tsx-<uid>/<pid>.pipe`, and macOS keeps
 * only 104 bytes of a socket path: libuv cut the rest off and bound whatever
 * the first 104 bytes named. A home whose `manual/check/tmp` is exactly 104
 * bytes long names that directory itself, so every run died on `EADDRINUSE`
 * and health said `manual: stale` for good. The longer home is the general
 * case, where the cut lands on a name that may or may not exist. `canvas` now
 * runs under `node --import tsx`, which binds no socket at all.
 *
 * Skipped where tldrawkc is not built, as `manual-snippets.test.ts` is.
 */

const MAC_SUN_PATH = 104;

const doctor = await canvas(["doctor", "--json"], 120_000).catch(() => null);
const built = doctor !== null && doctor.code === 0;

let root = "";

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), "studio-long-home-"));
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
  delete process.env.STUDIO_HOME;
});

/** A `STUDIO_HOME` under `root` whose manual check `TMPDIR` is `length` bytes long. */
async function homeWithCheckTmp(length: number): Promise<string> {
  const suffix = path.join("manual", "check", "tmp");
  const pad = length - root.length - suffix.length - 2;
  if (pad < 1) throw new Error(`the temp directory ${root} is too long to build a ${length}-byte path under`);
  const home = path.join(root, "h".repeat(pad));
  process.env.STUDIO_HOME = home;
  const tmp = path.join(manualCheckDir(), "tmp");
  expect(tmp).toHaveLength(length);
  await mkdir(tmp, { recursive: true });
  return home;
}

describe.skipIf(!built)(
  built ? "the manual check under a long STUDIO_HOME" : "SKIPPED, tldrawkc is not built: the manual check under a long STUDIO_HOME",
  () => {
    it.each([
      ["exactly the macOS socket path limit", MAC_SUN_PATH],
      ["far past it", 220],
    ])("runs canvas and every snippet with the check's TMPDIR %s", async (_label, length) => {
      await homeWithCheckTmp(length);
      const runCanvas = groupCanvas(new AbortController().signal);
      const api = await runCanvas(["api", "--json"], 60_000);
      expect(api.code, api.stderr).toBe(0);
      const checks = (await checkSnippets(runCanvas, manualCheckDir())) ?? [];
      expect(checks.map((check) => check.name)).toEqual(SNIPPETS.map((snippet) => snippet.name));
      for (const check of checks) expect(check, `${check.name}: ${check.detail}`).toMatchObject({ ok: true });
    }, 240_000);
  },
);
