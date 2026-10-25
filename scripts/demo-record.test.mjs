import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

import { buildSeedDatabase, freePort, seedEnv, stopGroup } from "./lib/app-harness.mjs";

// scripts/demo-record.mjs refuses a bad command line before it builds or
// starts anything, and the harness it shares with scripts/e2e.mjs. Recording
// a video needs a build and a browser, so that half is checked by running the
// script, as CONTRIBUTING.md describes, not here.

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SCRIPT = join(ROOT, "scripts/demo-record.mjs");
const SCENARIO = join(ROOT, "scripts/demo-scenarios/concept-tutor-choice-checks.mjs");
const dirs = [];

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

const scratch = () => {
  const dir = mkdtempSync(join(tmpdir(), "demo-record-test-"));
  dirs.push(dir);
  return dir;
};

const run = (...args) => spawnSync(process.execPath, [SCRIPT, ...args], { encoding: "utf8" });

describe("demo-record's command line", () => {
  it("needs both --scenario and --out", () => {
    const ran = run("--scenario", SCENARIO);
    expect(ran.status).toBe(2);
    expect(ran.stderr).toContain("--scenario and --out are both required");
  });

  it("refuses an unknown option", () => {
    const ran = run("--scenario", SCENARIO, "--out", join(scratch(), "a.mp4"), "--bogus");
    expect(ran.status).toBe(2);
    expect(ran.stderr).toContain("--bogus");
  });

  it("refuses an --out that is not an mp4", () => {
    const ran = run("--scenario", SCENARIO, "--out", join(scratch(), "a.webm"));
    expect(ran.status).toBe(2);
    expect(ran.stderr).toContain("must name an .mp4 file");
  });

  it("refuses an --out inside the checkout", () => {
    const ran = run("--scenario", SCENARIO, "--out", join(ROOT, "demo.mp4"));
    expect(ran.status).toBe(2);
    expect(ran.stderr).toContain("is inside the checkout");
  });

  it("refuses an --out reached through a symlink to the checkout", () => {
    const link = join(scratch(), "checkout");
    symlinkSync(ROOT, link);
    const ran = run("--scenario", SCENARIO, "--out", join(link, "demo.mp4"));
    expect(ran.status).toBe(2);
    expect(ran.stderr).toContain("is inside the checkout");
  });

  it("refuses an --out whose directory does not exist", () => {
    const ran = run("--scenario", SCENARIO, "--out", join(scratch(), "missing", "a.mp4"));
    expect(ran.status).toBe(2);
    expect(ran.stderr).toContain("does not exist");
  });

  it("refuses a scenario that is not there", () => {
    const ran = run("--scenario", join(scratch(), "nope.mjs"), "--out", join(scratch(), "a.mp4"));
    expect(ran.status).toBe(2);
    expect(ran.stderr).toContain("no scenario at");
  });

  it("refuses a checkout with no build", () => {
    const root = scratch();
    const scenario = join(scratch(), "scenario.mjs");
    writeFileSync(scenario, "export async function run() {}\n");
    const ran = run("--root", root, "--scenario", scenario, "--out", join(scratch(), "a.mp4"));
    expect(ran.status).toBe(2);
    expect(ran.stderr).toContain("no production build");
  });
});

describe("the app harness", () => {
  it("starts no seed command once it is told to stop", async () => {
    await expect(buildSeedDatabase("/nonexistent", {}, { stopped: () => true })).rejects.toThrow("interrupted");
  });

  it("points every catalog command at the scratch database and no video tool", () => {
    const env = seedEnv({ root: "/r", db: "/w/catalog.db", home: "/w/home", emptyRoot: "/w/empty" });
    expect(env).toMatchObject({
      CATALOG_DB: "/w/catalog.db",
      DATABASE_URL: "/w/catalog.db",
      GNOSIA_HOME: "/w/home",
      MANIMKC_ROOT: "/w/empty",
      REMOTIONKC_ROOT: "/w/empty",
      REVIDEOKC_ROOT: "/w/empty",
      BLENDERKC_ROOT: "/w/empty",
      LEARN_ROOT: "/r/seed",
    });
  });

  it("finds a port it can listen on", async () => {
    const port = await freePort();
    expect(port).toBeGreaterThan(0);
  });

  it("stops a process group and its children", async () => {
    const child = spawn("/bin/sh", ["-c", "sleep 30 & sleep 30"], { detached: true, stdio: "ignore" });
    await new Promise((resolve) => child.once("spawn", resolve));
    expect(await stopGroup(child)).toBe(true);
    expect(() => process.kill(-child.pid, 0)).toThrow();
  });
});
