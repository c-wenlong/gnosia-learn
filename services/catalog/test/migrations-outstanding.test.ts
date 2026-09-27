import { spawn } from "node:child_process";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { EXIT_UNREACHABLE } from "../src/connection-failure";
import { applyMigrations, EXIT_MIGRATIONS_OUTSTANDING, journalTags } from "../src/migrations";
import { partialMigrations } from "./partial-migrations";
import { createScratchDatabase, probe, type Scratch } from "./scratch-database";

/**
 * A database behind the journal, as the owner's was at 0009 when phase 0
 * merged: every command that reads what a later migration adds refuses by
 * name, with exit 4, and never with drizzle's `Failed query: ...` or a stack.
 */

const reachable = await probe();

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CATALOG = path.resolve(HERE, "..", "src", "cli.ts");
const LEARN = path.resolve(HERE, "..", "src", "learn", "cli.ts");

/** 0000 through 0009: the last migration before the content expand. */
const THROUGH_0009 = 10;

interface Ran {
  code: number | null;
  stdout: string;
  stderr: string;
}

function run(entry: string, env: Record<string, string>, ...args: string[]): Promise<Ran> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["--import", "tsx", entry, ...args], {
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

describe.skipIf(!reachable.ok)("a database behind the journal", () => {
  let scratch: Scratch;
  let dir: string;
  let outstanding: number;

  beforeAll(async () => {
    scratch = await createScratchDatabase();
    await applyMigrations(scratch.db, { folder: await partialMigrations(THROUGH_0009) });
    dir = await mkdtemp(path.join(tmpdir(), "catalog-behind-"));
    await mkdir(path.join(dir, "learn", "concepts"), { recursive: true });
    outstanding = (await journalTags()).length - THROUGH_0009;
  }, 60_000);

  afterAll(async () => {
    await scratch?.drop();
    if (dir !== undefined) await rm(dir, { recursive: true, force: true });
  });

  it("is a distinct exit code", () => {
    expect(EXIT_MIGRATIONS_OUTSTANDING).toBe(4);
    expect(EXIT_MIGRATIONS_OUTSTANDING).not.toBe(EXIT_UNREACHABLE);
  });

  it.each([
    ["index"],
    ["import", "<dir>"],
    ["export", "--out", "<dir>/out"],
    ["parity", "<dir>"],
    ["flip", "tags"],
    ["ls"],
    ["show", "alpha"],
    ["history", "topic", "alpha"],
    ["diff", "1"],
  ])("catalog %s refuses with the count and the command to run", async (...args) => {
    const argv = args.map((arg) => arg.replace("<dir>", dir));
    const ran = await run(CATALOG, { DATABASE_URL: scratch.url, MANIMKC_ROOT: path.join(dir, "none") }, ...argv);
    expect(ran.code, ran.stderr).toBe(EXIT_MIGRATIONS_OUTSTANDING);
    expect(ran.stderr).toContain(`${outstanding} migration(s) outstanding`);
    expect(ran.stderr).toContain("Run: npm run catalog -- migrate");
    expect(ran.stderr).not.toMatch(/Failed query|content_source|\n\s+at /);
  }, 30_000);

  it("still answers a wrong invocation as one, exit 2, whatever state the database is in", async () => {
    for (const argv of [["export"], ["show"], ["parity"], ["flip"], ["import"]]) {
      const ran = await run(CATALOG, { DATABASE_URL: scratch.url }, ...argv);
      expect(ran.code, `${argv.join(" ")}: ${ran.stderr}`).toBe(2);
      expect(ran.stderr).not.toContain("migration(s) outstanding");
    }
  }, 60_000);

  it("says the same in --json, with the pending tags on stdout", async () => {
    const ran = await run(CATALOG, { DATABASE_URL: scratch.url }, "export", "--out", path.join(dir, "out"), "--json");
    expect(ran.code).toBe(EXIT_MIGRATIONS_OUTSTANDING);
    const body = JSON.parse(ran.stdout) as { ok: boolean; pending: string[] };
    expect(body.ok).toBe(false);
    expect(body.pending).toHaveLength(outstanding);
    expect(body.pending[0]).toMatch(/^0010_/);
  }, 30_000);

  it("leaves status and doctor to say it themselves", async () => {
    const status = await run(CATALOG, { DATABASE_URL: scratch.url }, "status", "--json");
    expect(status.code).toBe(0);
    expect((JSON.parse(status.stdout) as { migrations: { pending: string[] } }).migrations.pending).toHaveLength(
      outstanding,
    );
  }, 30_000);

  it("learn index refuses the same way, without a stack trace", async () => {
    const ran = await run(LEARN, { DATABASE_URL: scratch.url, LEARN_ROOT: dir }, "index");
    expect(ran.code, ran.stderr).toBe(EXIT_MIGRATIONS_OUTSTANDING);
    expect(ran.stderr).toContain(`${outstanding} migration(s) outstanding`);
    expect(ran.stderr).toContain("Run: npm run catalog -- migrate");
    expect(ran.stderr).not.toMatch(/Failed query|\n\s+at /);
  }, 30_000);
});
