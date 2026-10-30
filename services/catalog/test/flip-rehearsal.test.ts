import { randomBytes } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { connect } from "../src/db";
import { journalTags } from "../src/migrations";
import { execFileAsync, preflightExists, rehearse, reportOf } from "./flip-rehearsal-helpers";
import { manimkcStandIn, seedWithManimkc } from "./manimkc-standin";
import { latestTag } from "./partial-migrations";
import { dropDatabase, migratedScratchDatabase, probe, type Scratch } from "./scratch-database";

const reachable = await probe();

/**
 * `scripts/flip-rehearsal.mjs`, flip day run end to end on a copy of a
 * template migrated to the head and never flipped, and its backup restored as
 * printed. flip-rehearsal-helpers.ts describes the template, the tree and the
 * manimkc stand-in every rehearsal here uses.
 */

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
