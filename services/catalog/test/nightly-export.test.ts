import { spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, readlink, readdir, rm, utimes } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { runImportCommand } from "../src/commands/index-command";
import { REPO_ROOT } from "../src/env";
import { applyMigrations } from "../src/migrations";
import { createScratchDatabase, probe, type Scratch } from "./scratch-database";
import { SEED } from "./seed";

/**
 * `scripts/nightly-export.mjs`: the database written out into
 * `$SELF_LEARN_HOME/archive/<time>/`, `latest` pointed at it, the oldest
 * pruned. Run against a scratch database holding the seed, so the export can
 * be compared with the seed byte for byte.
 */

const reachable = await probe();
const SCRIPT = path.join(REPO_ROOT, "scripts", "nightly-export.mjs");

function run(args: string[], env: NodeJS.ProcessEnv): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [SCRIPT, ...args], { cwd: REPO_ROOT, env: { ...process.env, ...env } });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => (stdout += chunk.toString()));
    child.stderr.on("data", (chunk: Buffer) => (stderr += chunk.toString()));
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, stdout, stderr }));
  });
}

async function filesUnder(root: string, prefix = ""): Promise<string[]> {
  const out: string[] = [];
  for (const entry of await readdir(path.join(root, prefix), { withFileTypes: true })) {
    const at = path.posix.join(prefix, entry.name);
    if (entry.isDirectory()) out.push(...(await filesUnder(root, at)));
    else out.push(at);
  }
  return out.sort();
}

describe("scripts/nightly-export.mjs refuses", () => {
  it("a relative SELF_LEARN_HOME", async () => {
    const ran = await run([], { SELF_LEARN_HOME: "relative/home" });
    expect(ran.code).toBe(2);
    expect(ran.stderr).toContain("SELF_LEARN_HOME must be absolute");
  });

  it("an archive inside the checkout", async () => {
    const ran = await run([], { SELF_LEARN_HOME: path.join(REPO_ROOT, "no-such-home") });
    expect(ran.code).toBe(2);
    expect(ran.stderr).toContain("inside the self-learn checkout");
  });

  it("a --keep that is not a whole number", async () => {
    const ran = await run(["--keep", "0"], {});
    expect(ran.code).toBe(2);
    expect(ran.stderr).toContain("--keep 0");
  });
});

describe.skipIf(!reachable.ok)("scripts/nightly-export.mjs", () => {
  let scratch: Scratch;
  let home: string;
  let noManimkc: string;
  const saved: Record<string, string | undefined> = {};

  beforeAll(async () => {
    scratch = await createScratchDatabase();
    await applyMigrations(scratch.db);
    home = await mkdtemp(path.join(tmpdir(), "catalog-nightly-home-"));
    noManimkc = await mkdtemp(path.join(tmpdir(), "catalog-nightly-no-manimkc-"));
    for (const key of ["DATABASE_URL", "SELF_LEARN_HOME", "MANIMKC_ROOT"]) saved[key] = process.env[key];
    process.env["DATABASE_URL"] = scratch.url;
    process.env["SELF_LEARN_HOME"] = home;
    process.env["MANIMKC_ROOT"] = noManimkc;
    // The seed's diagram SVG goes into this home's blob store, which is
    // where the export reads it back from.
    await runImportCommand({ dir: SEED });
  }, 120_000);

  afterAll(async () => {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    await scratch?.drop();
    if (home !== undefined) await rm(home, { recursive: true, force: true });
    if (noManimkc !== undefined) await rm(noManimkc, { recursive: true, force: true });
  });

  it("exports the database into a dated folder, points latest at it, and prunes to --keep", async () => {
    const archive = path.join(home, "archive");
    // Three older exports, and a partial a failed run left two days ago.
    for (const old of ["20260101T000000Z", "20260102T000000Z", "20260103T000000Z"]) {
      await mkdir(path.join(archive, old, "content"), { recursive: true });
    }
    const stale = path.join(archive, ".20260101T000000Z.partial");
    await mkdir(stale, { recursive: true });
    const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
    await utimes(stale, twoDaysAgo, twoDaysAgo);

    const ran = await run(["--keep", "2", "--json"], { DATABASE_URL: scratch.url, SELF_LEARN_HOME: home });
    expect(ran.stderr).toBe("");
    expect(ran.code).toBe(0);
    const report = JSON.parse(ran.stdout) as {
      export: string;
      kept: number;
      pruned: string[];
      stalePartials: string[];
      types: { type: string; files: number }[];
    };
    const stamp = path.basename(report.export);
    expect(stamp).toMatch(/^\d{8}T\d{6}Z$/);
    expect(await readlink(path.join(archive, "latest"))).toBe(stamp);
    expect(report.pruned).toEqual(["20260101T000000Z", "20260102T000000Z"]);
    expect(report.stalePartials).toEqual([".20260101T000000Z.partial"]);
    expect(report.kept).toBe(2);
    expect((await readdir(archive)).sort()).toEqual(["20260103T000000Z", stamp, "latest"].sort());
    expect(report.types.map((t) => t.type)).toEqual(["topics", "tags", "courses", "concepts", "sessions", "diagrams"]);

    // The seed went in, so the seed comes out: every file, byte for byte.
    const seedFiles = (await filesUnder(SEED)).filter((f) => f.startsWith("content/") || f.startsWith("learn/"));
    expect(await filesUnder(report.export)).toEqual(seedFiles);
    for (const file of seedFiles) {
      expect((await readFile(path.join(report.export, file))).equals(await readFile(path.join(SEED, file))), file).toBe(true);
    }
  }, 120_000);
});
