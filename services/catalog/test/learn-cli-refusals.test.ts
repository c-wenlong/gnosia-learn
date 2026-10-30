import { rm, writeFile } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { ENTRY, execFileAsync, learnCli } from "./learn-cli-fixture";
import { probe } from "./scratch-database";

/**
 * What the `learn` CLI refuses, end to end: evidence about a concept the
 * catalog has no row for, and a database it cannot open. learn-cli-fixture.ts
 * describes the database and knowledge base.
 */

const reachable = await probe();

describe.skipIf(!reachable.ok)("learn CLI", () => {
  const cli = learnCli();
  const { learn } = cli;

  describe("refusals", () => {
    it("will not record evidence about a concept the catalog has never seen", async () => {
      await writeFile(
        path.join(cli.root, "learn", "concepts", "fixtures", "delta.md"),
        "---\nid: delta\ntitle: Delta\n---\n\n# Delta\n",
        "utf8",
      );
      try {
        await expect(learn("observe", "--concept", "delta", "--correct", "true")).rejects.toThrow(
          /no concept in the catalog for "delta"/,
        );
      } finally {
        await rm(path.join(cli.root, "learn", "concepts", "fixtures", "delta.md"), { force: true });
      }
    });

    it("doctor reports an unmigrated database as an error", async () => {
      const { stdout } = await execFileAsync(
        process.execPath,
        ["--import", "tsx", ENTRY, "doctor", "--json"],
        {
          env: { ...process.env, LEARN_ROOT: cli.root, DATABASE_URL: cli.unreachableUrl() },
        },
      ).catch((error: { stdout: string }) => error);

      const report = JSON.parse(stdout) as {
        ok: boolean;
        problems: { kind: string }[];
      };
      expect(report.ok).toBe(false);
      expect(report.problems.map((p) => p.kind)).toContain("database-unreachable");
    });
  });
});
