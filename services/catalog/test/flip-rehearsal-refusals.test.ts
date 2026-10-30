import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { REPO_ROOT } from "../src/env";
import { rehearse } from "./flip-rehearsal-helpers";

/**
 * `scripts/flip-rehearsal.mjs`'s refusals: the switches it will not take
 * together, and `--real` without what it needs. None reaches a database
 * (flip-rehearsal-helpers.ts says why `--real` is tested only for these).
 */

describe("scripts/flip-rehearsal.mjs --real refuses", () => {
  it("without --database", async () => {
    const ran = await rehearse(["--real"]);
    expect(ran.code).toBe(2);
    expect(ran.stderr).toContain("--real needs --database <file>");
  });

  it("without --checkout", async () => {
    const ran = await rehearse(["--real", "--database", "gnosia_no_such_database"]);
    expect(ran.code).toBe(2);
    expect(ran.stderr).toContain("--real needs --checkout <dir>");
  });

  it("when --checkout is not the checkout the script is in", async () => {
    // A worktree or a clone of the script would import a tree without the
    // owner's untracked files and prune their rows.
    const elsewhere = await mkdtemp(path.join(tmpdir(), "flip-rehearsal-elsewhere-"));
    try {
      const ran = await rehearse(["--real", "--database", "gnosia_no_such_database", "--checkout", elsewhere]);
      expect(ran.code).toBe(2);
      expect(ran.stderr).toContain("is not the checkout this script is in");
      expect(ran.stdout).toBe("");
    } finally {
      await rm(elsewhere, { recursive: true, force: true });
    }
  });

  it("with a rehearsal's own options", async () => {
    const ran = await rehearse(["--real", "--database", "gnosia", "--keep"]);
    expect(ran.code).toBe(2);
    expect(ran.stderr).toContain("--keep belong to a rehearsal");
  });

  it("without a terminal to type the name on, before it touches anything", async () => {
    // stdin is not a TTY here, as for any agent or script: there is no --yes.
    const ran = await rehearse(["--real", "--database", "gnosia_no_such_database", "--checkout", REPO_ROOT]);
    expect(ran.code).toBe(2);
    expect(ran.stderr).toContain("typed on a terminal");
    expect(ran.stdout).toBe("");
  });

  it("--database without --real", async () => {
    const ran = await rehearse(["--database", "gnosia"]);
    expect(ran.code).toBe(2);
    expect(ran.stderr).toContain("--database goes with --real");
  });

  it("--checkout without --real or --cutover", async () => {
    const ran = await rehearse(["--checkout", REPO_ROOT]);
    expect(ran.code).toBe(2);
    expect(ran.stderr).toContain("--checkout goes with --real, or with --cutover");
  });

  it("a cut-over rehearsal on the checkout the script is in", async () => {
    const ran = await rehearse(["--cutover", "--checkout", REPO_ROOT, "--waive-reason", "because"]);
    expect(ran.code).toBe(2);
    expect(ran.stderr).toContain("is the checkout this script is in. A cut-over rehearsal reads a worktree at content-files-final");
  });

  it("a cut-over's --checkout that is not a worktree of this repository at the tag", async () => {
    const elsewhere = await mkdtemp(path.join(tmpdir(), "flip-rehearsal-elsewhere-"));
    try {
      for (const args of [
        ["--cutover", "--checkout", elsewhere, "--waive-reason", "because"],
        ["--real", "--cutover", "--database", "gnosia_no_such_database", "--checkout", elsewhere],
      ]) {
        const ran = await rehearse(args);
        expect(ran.code).toBe(2);
        expect(ran.stderr).toMatch(/is neither the checkout this script is in .* nor a worktree of it at content-files-final/);
      }
    } finally {
      await rm(elsewhere, { recursive: true, force: true });
    }
  });

  it("--tree-from with --checkout, and --blob-store without it", async () => {
    const both = await rehearse(["--cutover", "--checkout", REPO_ROOT, "--tree-from", REPO_ROOT]);
    expect(both.code).toBe(2);
    expect(both.stderr).toContain("--tree-from and --checkout both name the tree");
    const store = await rehearse(["--cutover", "--blob-store", "/nowhere"]);
    expect(store.code).toBe(2);
    expect(store.stderr).toContain("--blob-store goes with --cutover --checkout");
    const real = await rehearse(["--real", "--cutover", "--database", "gnosia_no_such_database", "--checkout", REPO_ROOT, "--blob-store", "/nowhere"]);
    expect(real.code).toBe(2);
    expect(real.stderr).toContain("--blob-store belong to a rehearsal");
  });

  it("--cutover without a terminal, before it touches anything", async () => {
    const ran = await rehearse(["--real", "--cutover", "--database", "gnosia_no_such_database", "--checkout", REPO_ROOT]);
    expect(ran.code).toBe(2);
    expect(ran.stderr).toContain("typed on a terminal");
    expect(ran.stdout).toBe("");
  });

  it("--cutover with --waive-reason: a real waiver's reason is typed, not passed", async () => {
    const ran = await rehearse(["--real", "--cutover", "--database", "gnosia", "--waive-reason", "because"]);
    expect(ran.code).toBe(2);
    expect(ran.stderr).toContain("asks for the waiver's reason on the terminal");
  });
});

describe("scripts/flip-rehearsal.mjs --waive-reason refuses", () => {
  it("without --cutover", async () => {
    const ran = await rehearse(["--waive-reason", "because"]);
    expect(ran.code).toBe(2);
    expect(ran.stderr).toContain("--waive-reason goes with --cutover");
  });

  it("an empty reason", async () => {
    const ran = await rehearse(["--cutover", "--waive-reason", "  "]);
    expect(ran.code).toBe(2);
    expect(ran.stderr).toContain("--waive-reason is empty");
  });
});
