import { randomBytes } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { journalTags } from "../src/migrations";
import { execFileAsync, rehearse, reportOf, type Report } from "./flip-rehearsal-helpers";
import { manimkcStandIn, seedWithManimkc } from "./manimkc-standin";
import { latestTag } from "./partial-migrations";
import { dropDatabase, migratedScratchDatabase, probe, type Scratch } from "./scratch-database";

const reachable = await probe();

/**
 * `scripts/flip-rehearsal.mjs --cutover`: flip day and then the cut-over on
 * one copy, with strict flips, the waiver on record, parity saved and the tag
 * made on a throwaway repository of the copied tree.
 */

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
