import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import { canvas } from "../src/canvas";
import { SNIPPETS } from "../src/manual/assemble";
import { STATIC_LINT_NAMES } from "../src/manual/lints";
import { lintNamesFromApi, parseApi } from "../src/manual/listing";
import { checkSnippets } from "../src/manual/source";

/**
 * The manual's static half, against the tldrawkc build that is installed.
 *
 * Two things the manual claims that only the tool can confirm (M2, M3 of
 * docs/STUDIO-CHAT-FIRST.md): each of the three worked snippets runs through
 * `canvas run --no-save` with exit 0 and no lint at error level, and the lint
 * rules the tool names are the nine the static table has fixes for. A
 * tldrawkc change that breaks either fails here, before an agent is told
 * something untrue.
 *
 * Skipped, with the reason in the suite's name, where tldrawkc is not built:
 * a fresh clone has no `dist/`, and CI does not build the submodule. `doctor`
 * decides, because a snippet needs the page bundle and a Chromium as well as
 * the CLI.
 */

const doctor = await canvas(["doctor", "--json"], 120_000).catch(() => null);
const built = doctor !== null && doctor.code === 0;
const reason =
  doctor === null
    ? "the canvas launcher could not be run"
    : `canvas doctor exited ${doctor.code ?? "on a signal"}: ${(doctor.stderr || doctor.stdout).trim().split("\n")[0] ?? ""}`;

const scratch = await mkdtemp(path.join(tmpdir(), "studio-manual-snippets-"));

afterAll(async () => {
  await rm(scratch, { recursive: true, force: true });
});

describe.skipIf(!built)(
  built ? "the manual against the installed tldrawkc" : `SKIPPED, tldrawkc is not built (${reason}): the manual against the installed tldrawkc`,
  () => {
    it("runs each worked snippet clean: exit 0, no lint at error level (M3)", async () => {
      const checks = await checkSnippets(canvas, scratch);
      expect(checks.map((check) => check.name)).toEqual(SNIPPETS.map((snippet) => snippet.name));
      for (const check of checks) expect(check, `${check.name}: ${check.detail}`).toMatchObject({ ok: true });
      // `--no-save` means what it says: the documents it was pointed at never appear.
      expect((await readdir(scratch)).filter((file) => file.endsWith(".tldr"))).toEqual([]);
    }, 180_000);

    it("names the same nine lint rules the static table has fixes for (M2)", async () => {
      const api = await canvas(["api", "--json"], 60_000);
      expect(api.code).toBe(0);
      const entries = parseApi(api.json);
      expect(entries).not.toBeNull();
      expect(new Set(lintNamesFromApi(entries ?? []))).toEqual(new Set(STATIC_LINT_NAMES));
    });
  },
);
