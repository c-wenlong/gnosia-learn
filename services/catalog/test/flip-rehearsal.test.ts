import { execFile, spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, readdirSync } from "node:fs";
import { cp, mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { connect } from "../src/db";
import { REPO_ROOT } from "../src/env";
import { journalTags } from "../src/migrations";
import { manimkcStandIn, seedWithManimkc } from "./manimkc-standin";
import { latestTag } from "./partial-migrations";
import { dropDatabase, migratedScratchDatabase, probe, type Scratch } from "./scratch-database";
import { storedBlob } from "./stored-blob";

/**
 * `scripts/flip-rehearsal.mjs`, the flip-day procedure, run end to end
 * against a copy of the file.
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

const reachable = await probe();

const SCRIPT = path.join(REPO_ROOT, "scripts", "flip-rehearsal.mjs");

interface Ran {
  code: number | null;
  stdout: string;
  stderr: string;
}

function rehearse(args: string[], env: NodeJS.ProcessEnv = {}, script: string = SCRIPT): Promise<Ran> {
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

interface Step {
  name: string;
  ok: boolean;
  gist: string;
  warning: string | null;
  result: Record<string, unknown> & { [key: string]: unknown };
}

interface Report {
  mode: string;
  ok: boolean;
  tree: string;
  copy: { name: string; method: string; kept: boolean; dropped: boolean };
  preflight: string;
  backup: { path: string; bytes: number; tables: number; restore: string; restoreArgv: string[][] } | null;
  steps: Step[];
  warnings: number;
}

const execFileAsync = promisify(execFile);

/**
 * The JSON report a run printed. A run that refused or crashed prints none,
 * only a sentence on stderr (a missing client tool, say), so that is what
 * the failure shows rather than JSON.parse's "Unexpected end of JSON input".
 */
function reportOf<T = Report>(ran: Ran): T {
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
function preflightExists(report: Report): boolean {
  return existsSync(path.join(path.dirname(report.tree), `${report.preflight}.db`));
}

/** Files under `file`'s directory that share its prefix — the `-wal`/`-shm` sidecars included. */
function filesLike(file: string): string[] {
  const dir = path.dirname(file);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((entry) => entry.startsWith(path.basename(file)))
    .map((entry) => path.join(dir, entry));
}

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

describe.skipIf(!reachable.ok)("scripts/flip-rehearsal.mjs on a copy", () => {
  let template: Scratch;
  let work: string;
  let tree: string;
  let manimkc: string;

  beforeAll(async () => {
    template = await migratedScratchDatabase();
    // Migrated to the head, never flipped, no content rows.

    work = await mkdtemp(path.join(tmpdir(), "catalog-flip-rehearsal-"));
    tree = path.join(work, "tree");
    await seedWithManimkc(tree);
    // A manimkc checkout whose data root holds one render and its transcript.
    manimkc = path.join(work, "manimkc");
    await manimkcStandIn(manimkc, randomBytes(4096));
  }, 60_000);

  afterAll(async () => {
    await template?.drop();
    if (work !== undefined) await rm(work, { recursive: true, force: true });
  });

  it("runs every flip-day step on a copy of the template, and its backup restores the template as it was", async () => {
    const name = path.join(work, "rehearsal.db");
    // --keep, so the backup is still there to restore; the test removes what it kept.
    const ran = await rehearse(["--from", template.url, "--name", name, "--tree-from", tree, "--keep", "--json"], {
      MANIMKC_ROOT: manimkc,
    });
    const report = reportOf(ran);
    try {
      const failed = report.steps.find((s) => !s.ok);
      expect(failed?.gist ?? null, `${failed?.name}: ${ran.stderr}`).toBeNull();
      expect(ran.code).toBe(0);
      expect(report.ok).toBe(true);
      expect(report.copy).toMatchObject({ name, method: "file copy", kept: true, dropped: false });

      // The procedure, in the plan's order.
      expect(report.steps.map((s) => s.name)).toEqual([
        "back up the database",
        "migrate",
        "doctor",
        "import into a throwaway copy",
        "import the tree",
        "parity",
        "flip topics",
        "flip tags",
        "export topics, tags",
        "flip concepts",
        "flip sessions",
        "export concepts, sessions",
        "flip courses",
        "export courses",
        "flip diagrams",
        "export diagrams",
        "import the tree again",
        "parity again",
        "asset upload",
        "asset upload again",
        "blob audit",
        "doctor again",
        "migrate the contract",
      ]);
      const step = (stepName: string) => report.steps.find((s) => s.name === stepName)?.result ?? {};

      // Nothing to apply and nothing held: the contract is in force from the start.
      expect(step("migrate")["applied"]).toEqual([]);
      expect(step("migrate")["held"]).toEqual([]);
      expect(step("doctor")["blobContract"]).toEqual({ inForce: true, unstored: [], unkeyed: [] });
      expect(step("import into a throwaway copy")["totals"]).toMatchObject({ deleted: 0 });
      expect(step("import the tree")["totals"]).toMatchObject({ deleted: 0 });
      // Courses flip without --strict: two seed items name no concept.
      expect(step("flip courses")["rulesArmed"]).toEqual([]);
      const skipped = (step("import the tree again")["skipped"] as { source: string }[]).map((s) => s.source).sort();
      // The six types as their own export, and remotionkc, revideokc and
      // blenderkc because the suites point their roots at nothing
      // (vitest.setup.ts), so none has a CLI to run.
      expect(skipped).toEqual(["blenderkc", "concepts", "courses", "diagrams", "remotionkc", "revideokc", "sessions", "tags", "topics"]);
      // Under the contract the import stored the render and its transcript
      // before their rows, and cut the render's poster and PDF, so the
      // upload has nothing left at all.
      expect(step("asset upload")).toMatchObject({ uploaded: 0, rowsWritten: 0, refused: 0, postersSkipped: null });
      expect(step("asset upload")["counts"]).toMatchObject({ videos: 1, posters: 1, pdfs: 1 });
      expect(report.warnings).toBe(0);
      expect(step("asset upload again")).toMatchObject({ uploaded: 0, rowsWritten: 0, refused: 0 });
      // The seed's diagram SVG and course cover, the render, its transcript,
      // its poster and its PDF: all six the import's.
      expect(step("blob audit")).toMatchObject({ rows: 6, objects: 6, outstanding: 0 });
      expect(step("doctor again")["blobContract"]).toEqual({ inForce: true, unstored: [], unkeyed: [] });
      expect(step("migrate the contract")).toMatchObject({ applied: [], head: latestTag(), held: [] });

      // The backup is the copy as it was before step 1, and restores as it.
      expect(report.backup).toMatchObject({ path: expect.stringMatching(/rehearsal-preflip-\d{8}T\d{6}Z\.db$/) });
      expect(report.backup?.bytes).toBeGreaterThan(0);
      // The printed restore removes the file and its sidecars, then puts the
      // backup in place; run as printed, in a shell with nothing but PATH in
      // its environment, it puts the flipped copy back as it was before step
      // 1. That is the owner's way back from a failed --real.
      // Checked on the argument lists, which the printed line is the quoted
      // join of; running the line below is what checks the quoting.
      const commands = report.backup?.restoreArgv ?? [];
      expect(commands.map((argv) => path.basename(argv[0] ?? ""))).toEqual(["rm", "cp"]);
      expect(commands[0]?.slice(1)).toEqual(["-f", name, `${name}-wal`, `${name}-shm`]);
      expect(commands[1]?.slice(-2)).toEqual([report.backup?.path, name]);
      await execFileAsync("/bin/sh", ["-c", report.backup?.restore ?? "false"], { env: { PATH: "/usr/bin:/bin" } });
      const back = connect({ url: name });
      try {
        const counts = await back.db.execute<{ migrations: number; assets: number; topics: number }>(
          sql`select (select count(*) from __drizzle_migrations) as migrations,
                     (select count(*) from asset) as assets,
                     (select count(*) from topic) as topics`,
        );
        expect(counts.rows[0]).toEqual({ migrations: (await journalTags()).length, assets: 0, topics: 0 });
      } finally {
        await back.close();
      }

      // The throwaway copy is gone, and the template is as it was: no content.
      // The report names the copy, and the step says it imported into that one.
      expect(report.preflight).toMatch(/^gnosia_preflight_\d+_[0-9a-z]+$/);
      expect(report.steps.find((s) => s.name === "import into a throwaway copy")?.gist).toMatch(
        new RegExp(`on ${report.preflight}; dropped$`),
      );
      expect(preflightExists(report)).toBe(false);
      const topics = await template.db.execute<{ n: number }>(sql`select count(*) as n from topic`);
      expect(topics.rows[0]?.n).toBe(0);
      const assets = await template.db.execute<{ n: number }>(sql`select count(*) as n from asset`);
      expect(assets.rows[0]?.n).toBe(0);
      const applied = await template.db.execute<{ n: number }>(sql`select count(*) as n from __drizzle_migrations`);
      expect(applied.rows[0]?.n).toBe((await journalTags()).length);
    } finally {
      await dropDatabase(name);
      await rm(path.dirname(report.tree), { recursive: true, force: true });
    }
  }, 240_000);
});

describe.skipIf(!reachable.ok)("scripts/flip-rehearsal.mjs on a tree that would remove rows", () => {
  let template: Scratch;
  let work: string;
  let tree: string;
  let manimkc: string;

  beforeAll(async () => {
    template = await migratedScratchDatabase();
    // Two renders recorded, and a manimkc checkout that reports only one:
    // the import would remove the other, as a worktree without the owner's
    // untracked files would remove theirs.
    for (const name of ["one", "gone"]) {
      const key = await storedBlob(template.db, name, "mp4");
      await template.db.execute(sql`
        insert into asset (id, kind, path, source_repo, blob_key)
        values (${`manimkc:out/demo/one/${name}.mp4`}, 'video', ${`out/demo/one/${name}.mp4`}, 'manimkc', ${key})`);
    }
    work = await mkdtemp(path.join(tmpdir(), "catalog-flip-rehearsal-removes-"));
    tree = path.join(work, "tree");
    await seedWithManimkc(tree);
    manimkc = path.join(work, "manimkc");
    await manimkcStandIn(manimkc, randomBytes(64));
  }, 60_000);

  afterAll(async () => {
    await template?.drop();
    if (work !== undefined) await rm(work, { recursive: true, force: true });
  });

  it("stops at the import into a throwaway copy, naming the row, before the copy under test is imported", async () => {
    const name = path.join(work, "removes.db");
    const ran = await rehearse(["--from", template.url, "--name", name, "--tree-from", tree, "--json"], {
      MANIMKC_ROOT: manimkc,
    });
    const report = reportOf(ran);
    expect(ran.code).toBe(1);
    expect(report.ok).toBe(false);
    expect(report.steps.map((s) => [s.name, s.ok])).toEqual([
      ["back up the database", true],
      ["migrate", true],
      ["doctor", true],
      ["import into a throwaway copy", false],
    ]);
    expect(report.steps.at(-1)?.gist).toMatch(/^on a copy, before touching .*: the import removed 1 row\(s\).*manimkc:out\/demo\/one\/gone\.mp4/);
    // Both copies are removed, without --keep.
    expect(report.copy).toMatchObject({ name, kept: false, dropped: true });
    expect(filesLike(name)).toEqual([]);
    expect(report.preflight).toMatch(/^gnosia_preflight_\d+_[0-9a-z]+$/);
    expect(preflightExists(report)).toBe(false);
  }, 120_000);
});

describe.skipIf(!reachable.ok)("scripts/flip-rehearsal.mjs --cutover on a copy", () => {
  let template: Scratch;
  let work: string;
  let tree: string;
  let manimkc: string;

  beforeAll(async () => {
    template = await migratedScratchDatabase();
    // At the head and never flipped: what flip day can meet since the
    // cut-over unregistered 0013 (see the first suite).
    work = await mkdtemp(path.join(tmpdir(), "catalog-cutover-rehearsal-"));
    tree = path.join(work, "tree");
    await seedWithManimkc(tree);
    manimkc = path.join(work, "manimkc");
    await manimkcStandIn(manimkc, randomBytes(4096));
  }, 60_000);

  afterAll(async () => {
    await template?.drop();
    if (work !== undefined) await rm(work, { recursive: true, force: true });
  });

  it("runs flip day and then the cut-over on one copy: strict flips, the waiver on record, parity saved, the tag made", async () => {
    const name = path.join(work, "cutover.db");
    const reason = "the seed's two items name no concept yet";
    const ran = await rehearse(
      ["--cutover", "--from", template.url, "--name", name, "--tree-from", tree, "--keep", "--waive-reason", reason, "--json"],
      { MANIMKC_ROOT: manimkc },
    );
    const report = reportOf<
      Report & {
        cutover: {
          parityReport: string;
          waivers: { rule: string; reason: string }[];
          tag: { name: string; commit: string; repo: string } | null;
        };
      }
    >(ran);
    try {
      const failed = report.steps.find((s) => !s.ok);
      expect(failed?.gist ?? null, `${failed?.name}: ${ran.stderr}`).toBeNull();
      expect(ran.code).toBe(0);

      const names = report.steps.map((s) => s.name);
      // Flip day's 23 steps, then the cut-over's.
      expect(names.slice(0, 23).at(-1)).toBe("migrate the contract");
      expect(names.slice(23)).toEqual([
        "cut-over: back up the database",
        "cut-over: migrate",
        "cut-over: every type flipped",
        "cut-over: import into a throwaway copy",
        "cut-over: import the tree",
        "cut-over: export",
        "cut-over: parity",
        "cut-over: decide the waivers",
        "cut-over: flip topics --strict",
        "cut-over: flip tags --strict",
        "cut-over: flip concepts --strict",
        "cut-over: flip sessions --strict",
        "cut-over: flip courses --strict",
        "cut-over: flip diagrams --strict",
        "cut-over: doctor",
        "cut-over: parity before the tag",
        "cut-over: tag content-files-final",
      ]);
      const step = (stepName: string) => report.steps.find((s) => s.name === stepName)?.result ?? {};

      // Two backups: before flip day and before the cut-over, each its own file.
      expect(report.steps[23]?.gist).toMatch(/cutover-precutover-\d{8}T\d{6}Z\.db/);
      expect(step("cut-over: migrate")).toMatchObject({ head: latestTag(), held: [] });
      const skipped = (step("cut-over: import the tree")["skipped"] as { source: string }[]).map((s) => s.source).sort();
      expect(skipped).toEqual(["blenderkc", "concepts", "courses", "diagrams", "remotionkc", "revideokc", "sessions", "tags", "topics"]);
      expect(step("cut-over: import the tree")["totals"]).toMatchObject({ deleted: 0 });

      // The parity report is on disk, clean, and every exported file is the tree's.
      const saved = JSON.parse(await readFile(report.cutover.parityReport, "utf8")) as {
        parity: { clean: boolean; mismatches: number };
        bytes: { compared: number; identical: number; differ: string[]; onlyInExport: string[] };
      };
      expect(saved.parity).toMatchObject({ clean: true, mismatches: 0 });
      expect(saved.bytes.differ).toEqual([]);
      expect(saved.bytes.onlyInExport).toEqual([]);
      expect(saved.bytes.identical).toBe(saved.bytes.compared);

      // The waiver: item-has-concept only, with the reason given, and the rest armed.
      expect(report.cutover.waivers).toEqual([{ rule: "item-has-concept", reason }]);
      expect(step("cut-over: flip courses --strict")).toMatchObject({
        rulesArmed: ["module-has-item", "item-concept-in-module-topic", "course-order-respects-requires"],
        waivers: [{ rule: "item-has-concept", reason }],
      });
      const doctor = step("cut-over: doctor") as {
        unsettled: string[];
        ok: boolean;
        rules: { name: string; state: string; waived: { reason: string } | null }[];
      };
      expect(doctor.unsettled).toEqual([]);
      expect(doctor.ok).toBe(true);
      expect(doctor.rules.map((r) => [r.name, r.state, r.waived?.reason ?? null])).toEqual([
        ["module-has-item", "armed", null],
        ["item-has-concept", "disarmed", reason],
        ["item-concept-in-module-topic", "armed", null],
        ["course-order-respects-requires", "armed", null],
      ]);

      // The tag, on a throwaway repository of the copied tree, at its HEAD.
      expect(report.cutover.tag).toMatchObject({ name: "content-files-final", repo: report.tree });
      const { stdout: head } = await execFileAsync("git", ["-C", report.tree, "rev-parse", "HEAD"]);
      const { stdout: tagged } = await execFileAsync("git", ["-C", report.tree, "rev-parse", "content-files-final^{commit}"]);
      expect(tagged.trim()).toBe(head.trim());
      expect(report.cutover.tag?.commit).toBe(head.trim());

      // A flipped template is refused for a --cutover rehearsal, before a copy is made.
      const again = await rehearse(["--cutover", "--from", name, "--tree-from", tree, "--waive-reason", reason]);
      expect(again.code).toBe(2);
      expect(again.stderr).toMatch(/owns concepts, courses, diagrams, sessions, tags, topics already/);

      // The template is as it was.
      const applied = await template.db.execute<{ n: number }>(sql`select count(*) as n from __drizzle_migrations`);
      expect(applied.rows[0]?.n).toBe((await journalTags()).length);
      const topics = await template.db.execute<{ n: number }>(sql`select count(*) as n from topic`);
      expect(topics.rows[0]?.n).toBe(0);
    } finally {
      await dropDatabase(name);
      await rm(path.dirname(report.tree), { recursive: true, force: true });
    }
  }, 300_000);
});

describe.skipIf(!reachable.ok)("scripts/flip-rehearsal.mjs --cutover --checkout, the owner's order", () => {
  let template: Scratch;
  let work: string;
  let manimkc: string;
  const copies: string[] = [];
  const kept: string[] = [];

  beforeAll(async () => {
    template = await migratedScratchDatabase();
    work = await mkdtemp(path.join(tmpdir(), "catalog-cutover-worktree-"));
    manimkc = path.join(work, "manimkc");
    await manimkcStandIn(manimkc, randomBytes(4096));
  }, 60_000);

  afterAll(async () => {
    for (const name of copies) await dropDatabase(name);
    for (const dir of kept) await rm(dir, { recursive: true, force: true });
    await template?.drop();
    if (work !== undefined) await rm(work, { recursive: true, force: true });
  });

  it("flip day from a worktree at the tag, then the cut-over on it from the newer script: the tag and the export accepted", async () => {
    // A repository standing in for the owner's, so the worktree below is a
    // worktree of the repository the script is in without touching this one:
    // the script as real files, the code it runs linked from this checkout,
    // and the seed as content/ and learn/.
    const repo = path.join(work, "repo");
    await mkdir(path.join(repo, "scripts", "lib"), { recursive: true });
    for (const file of ["flip-rehearsal.mjs", "lib/cutover.mjs", "lib/flip-order.mjs", "lib/proc.mjs", "lib/sqlite.mjs"]) {
      await cp(path.join(REPO_ROOT, "scripts", file), path.join(repo, "scripts", file));
    }
    for (const link of ["services", "packages", "node_modules"]) await symlink(path.join(REPO_ROOT, link), path.join(repo, link));
    await seedWithManimkc(repo);
    // The diagram's document in another key order: parity is clean, and
    // flip day's export rewrites it, as it did the owner's two .tldr files.
    const tldr = "learn/assets/vector-as-a-list-of-numbers.tldr";
    const document = JSON.parse(await readFile(path.join(repo, tldr), "utf8")) as Record<string, unknown>;
    await writeFile(path.join(repo, tldr), `${JSON.stringify(Object.fromEntries(Object.entries(document).reverse()), null, 2)}\n`);
    // A file no export writes, which the cut-over must refuse to see edited.
    await writeFile(path.join(repo, "learn", "README.md"), "the storage notes\n");
    const git = (dir: string, ...args: string[]) =>
      execFileAsync("git", ["-C", dir, "-c", "user.name=test", "-c", "user.email=test@localhost", "-c", "commit.gpgsign=false", "-c", "tag.gpgsign=false", ...args]);
    await git(repo, "init", "-q");
    await git(repo, "add", "-A");
    await git(repo, "commit", "-q", "-m", "the last commit with the files");
    await git(repo, "tag", "-a", "content-files-final", "-m", "last commit with content/ and learn/");
    const tagObject = (await git(repo, "rev-parse", "refs/tags/content-files-final")).stdout.trim();
    await git(repo, "rm", "-q", "-r", "content", "learn");
    await git(repo, "commit", "-q", "-m", "the cut-over");
    const files = path.join(work, "files");
    await git(repo, "worktree", "add", "-q", files, "content-files-final");
    const script = path.join(repo, "scripts", "flip-rehearsal.mjs");
    const env = { MANIMKC_ROOT: manimkc };

    // Flip day, from the worktree's tree, kept: the copy is the database flip
    // day ran on, and its temp tree holds the export it wrote.
    const flipDay = path.join(work, "flipday.db");
    copies.push(flipDay);
    const first = await rehearse(["--from", template.url, "--name", flipDay, "--tree-from", files, "--keep", "--json"], env, script);
    const day = reportOf(first);
    kept.push(path.dirname(day.tree));
    expect(day.steps.find((s) => !s.ok)?.gist ?? null, first.stderr).toBeNull();
    expect(day.steps.find((s) => s.name === "flip diagrams")?.result).toMatchObject({ export: { rewrites: [tldr] } });
    // --real exports into the checkout it runs from; here, the export lands in
    // the worktree by hand, which is where the owner's flip day leaves it.
    for (const folder of ["content", "learn"]) await cp(path.join(day.tree, folder), path.join(files, folder), { recursive: true });
    const status = async () => (await git(files, "status", "--porcelain", "--untracked-files=all")).stdout;
    const before = await status();
    expect(before).toBe(` M ${tldr}\n`);

    const cutover = async (name: string) => {
      copies.push(name);
      const ran = await rehearse(
        ["--cutover", "--from", flipDay, "--name", name, "--checkout", files, "--blob-store", path.join(path.dirname(day.tree), "home", "blobs"),
          "--waive-reason", "the seed's items name no concept yet", "--json"],
        env,
        script,
      );
      return { ran, report: reportOf<Report & { next: string[]; cutover: { tag: { commit: string; made: boolean } | null; rewrites: string[]; exported: string[] } }>(ran) };
    };
    const { ran, report } = await cutover(path.join(work, "cut.db"));
    const failed = report.steps.find((s) => !s.ok);
    expect(failed?.gist ?? null, `${failed?.name}: ${ran.stderr}`).toBeNull();
    expect(ran.code).toBe(0);
    // Only the cut-over's steps: flip day ran already.
    expect(report.steps[0]?.name).toBe("cut-over: back up the database");
    expect(report.steps).toHaveLength(17);
    const parity = report.steps.find((s) => s.name === "cut-over: parity")?.result as {
      rewrites: string[];
      unexpected: string[];
      headParity: { clean: boolean };
      bytes: { differ: string[] };
    };
    expect(parity).toMatchObject({ rewrites: [tldr], unexpected: [], headParity: { clean: true }, bytes: { differ: [] } });
    const head = (await git(files, "rev-parse", "HEAD")).stdout.trim();
    expect(report.cutover.tag).toMatchObject({ commit: head, made: false });
    expect(report.cutover.exported).toEqual([tldr]);
    // The stand-in's origin is not asked (it has none), so the push is
    // printed: a tag origin was not seen to hold is one to push.
    const at = await realpath(files);
    expect(report.next).toEqual([
      `git -C ${at} push origin content-files-final`,
      `git -C ${at} switch -c content-files-export`,
      `git -C ${at} add -- ${tldr}`,
      `git -C ${at} commit -m 'The export flip day wrote into content/ and learn/' -- ${tldr}`,
    ]);
    // Nothing written in the worktree, and the tag is the one made before.
    expect(await status()).toBe(before);
    expect((await git(repo, "rev-parse", "refs/tags/content-files-final")).stdout.trim()).toBe(tagObject);

    // Any other edit stops it, before anything is armed.
    await writeFile(path.join(files, "learn", "README.md"), "edited by hand\n");
    const stray = await cutover(path.join(work, "stray.db"));
    expect(stray.ran.code).toBe(1);
    expect(stray.report.steps.at(-1)).toMatchObject({ name: "cut-over: parity", ok: false });
    expect(stray.report.steps.at(-1)?.gist).toMatch(/learn\/README\.md \(no export writes this file\)/);
  }, 300_000);
});
