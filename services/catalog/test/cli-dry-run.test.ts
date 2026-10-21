import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { beforeAll, describe, expect, it } from "vitest";

import { EXIT_UNREACHABLE } from "../src/connection-failure";


/**
 * `--dry-run` is parsed for every command but read by only four. Everywhere
 * else it was accepted and ignored, so `catalog import --dry-run` wrote to the
 * owner's database. These pin both halves: a command that cannot dry-run
 * refuses before it connects (exit 2, not the unreachable 3), and the four
 * that can still get past the check to their own work.
 *
 * The database is a dead port, so nothing here can write whatever the CLI does.
 */

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ENTRY = path.resolve(HERE, "..", "src", "cli.ts");

function catalog(url: string, ...args: string[]): Promise<{ code: number | null; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["--import", "tsx", ENTRY, ...args], {
      env: { ...process.env, DATABASE_URL: url },
      stdio: ["ignore", "ignore", "pipe"],
    });
    let stderr = "";
    child.stderr.on("data", (chunk: Buffer) => (stderr += chunk.toString()));
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, stderr }));
  });
}

// A file used as a directory: SQLite cannot open it, which is this app's
// "database is down".
const url = `${tmpdir()}/catalog-dry-run-file-${process.pid}`;
writeFileSync(url, "x");
const unreachable = `${url}/child.db`;

describe("--dry-run on a command that cannot honour it", () => {
  it.each([
    [["import", "--only", "remotionkc"], "catalog import"],
    [["index"], "catalog index"],
    [["flip", "topics"], "catalog flip topics"],
    [["topic", "edit", "some-topic", "--title", "T", "--reason", "r"], "catalog topic edit"],
    [["ls"], "catalog ls"],
  ])("refuses %j before connecting", async (args, said) => {
    const ran = await catalog(unreachable, ...args, "--dry-run");
    expect(ran.code).toBe(2);
    expect(ran.stderr).toContain(`${said} has no --dry-run.`);
    expect(ran.stderr).toContain("catalog asset upload, catalog topic add, catalog course import, catalog course cover");
  });
});

describe("--dry-run where it is honoured", () => {
  it("lets asset upload through to the database, which is down", async () => {
    const ran = await catalog(unreachable, "asset", "upload", "--source", "remotionkc", "--dry-run");
    expect(ran.stderr).not.toContain("has no --dry-run");
    expect(ran.code).toBe(EXIT_UNREACHABLE);
  });

  it("lets course import through to the database, which is down", async () => {
    const ran = await catalog(unreachable, "course", "import", "course.yml", "--reason", "r", "--dry-run");
    expect(ran.stderr).not.toContain("has no --dry-run");
    expect(ran.code).toBe(EXIT_UNREACHABLE);
  });

  it("lets course cover through to the database, which is down", async () => {
    const ran = await catalog(
      unreachable, "course", "cover", "cs3230", "--file", "cover.jpg", "--photographer", "P",
      "--source", "https://example.com", "--licence", "L", "--reason", "r", "--dry-run",
    );
    expect(ran.stderr).not.toContain("has no --dry-run");
    expect(ran.code).toBe(EXIT_UNREACHABLE);
  });

  it("lets topic add through to the database, which is down", async () => {
    const ran = await catalog(unreachable, "topic", "add", "--slug", "x-y", "--title", "X", "--domain", "d", "--reason", "r", "--dry-run");
    expect(ran.stderr).not.toContain("has no --dry-run");
    expect(ran.code).toBe(EXIT_UNREACHABLE);
  });
});
