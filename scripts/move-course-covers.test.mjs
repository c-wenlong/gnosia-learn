import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

import { coverArgs, readCovers } from "./move-course-covers.mjs";

// The one-off move of the ten covers: its credits file and the arguments it
// hands `catalog course cover`. Running it against a database is what
// services/catalog/test/course-cover.test.ts does for the command itself; the
// run here stops before the database, on a --from that lacks the photos.

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), "move-course-covers.mjs");
const dirs = [];
const temp = () => {
  const dir = mkdtempSync(join(tmpdir(), "move-covers-"));
  dirs.push(dir);
  return dir;
};

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("scripts/move-course-covers.mjs", () => {
  it("carries a credit for each of the ten photos the web app used to serve", () => {
    const covers = readCovers();
    expect(covers.map((c) => c.course)).toEqual([
      "cp4281", "cp4282", "cp4283", "cp4284", "cp4285", "cs2111", "cs3216", "cs3227", "cs3249", "cs4263",
    ]);
    for (const cover of covers) {
      expect(cover.file).toBe(`${cover.course}.webp`);
      expect(cover.source).toMatch(/^https:\/\/unsplash\.com\/photos\/\S+$/);
      expect(cover.photographer.trim()).not.toBe("");
      expect(cover.licence).toBe("Unsplash License");
    }
  });

  it("hands the command the photo under --from, the credit, one reason and --json", () => {
    const [first] = readCovers();
    const args = coverArgs(first, "/photos", { dryRun: true, owner: "local" });
    expect(args.slice(0, 5)).toEqual(["course", "cover", "cp4281", "--file", "/photos/cp4281.webp"]);
    expect(args).toContain("--json");
    expect(args).toContain("--dry-run");
    expect(args.filter((a) => a === "--reason")).toHaveLength(1);
    expect(args[args.indexOf("--licence") + 1]).toBe("Unsplash License");
    expect(args.slice(-2)).toEqual(["--owner", "local"]);
    expect(coverArgs(first, "/photos")).not.toContain("--dry-run");
  });

  it("refuses a run without --from, or with a --from missing a photo, before it runs anything", () => {
    const env = { ...process.env, DATABASE_URL: "postgres://localhost:59999/nothing" };
    const bare = spawnSync(process.execPath, [SCRIPT], { env, encoding: "utf8" });
    expect(bare.status).toBe(2);
    expect(bare.stderr).toMatch(/--from is required/);

    const dir = temp();
    writeFileSync(join(dir, "cp4281.webp"), "one of ten");
    const partial = spawnSync(process.execPath, [SCRIPT, "--from", dir], { env, encoding: "utf8" });
    expect(partial.status).toBe(2);
    expect(partial.stderr).toMatch(new RegExp(`${resolve(dir)} lacks cp4282\\.webp, .*cs4263\\.webp; nothing was run`));
  });
});
