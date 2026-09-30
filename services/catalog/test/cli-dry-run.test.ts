import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { beforeAll, describe, expect, it } from "vitest";

import { EXIT_UNREACHABLE } from "../src/connection-failure";
import { deadPort } from "./fake-postgres";

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

let url: string;
beforeAll(async () => {
  url = `postgres://localhost:${await deadPort()}/self_learn`;
});

describe("--dry-run on a command that cannot honour it", () => {
  it.each([
    [["import", "--only", "remotionkc"], "catalog import"],
    [["index"], "catalog index"],
    [["flip", "topics"], "catalog flip topics"],
    [["topic", "edit", "some-topic", "--title", "T", "--reason", "r"], "catalog topic edit"],
  ])("refuses %j before connecting", async (args, said) => {
    const ran = await catalog(url, ...args, "--dry-run");
    expect(ran.code).toBe(2);
    expect(ran.stderr).toContain(`${said} has no --dry-run, and would write if run.`);
    expect(ran.stderr).toContain("catalog asset upload, catalog topic add, catalog course import, catalog course cover");
  });
});

describe("--dry-run where it is honoured", () => {
  it("lets asset upload through to the database, which is down", async () => {
    const ran = await catalog(url, "asset", "upload", "--source", "remotionkc", "--dry-run");
    expect(ran.stderr).not.toContain("has no --dry-run");
    expect(ran.code).toBe(EXIT_UNREACHABLE);
  });

  it("lets topic add through to the database, which is down", async () => {
    const ran = await catalog(url, "topic", "add", "--slug", "x-y", "--title", "X", "--domain", "d", "--reason", "r", "--dry-run");
    expect(ran.stderr).not.toContain("has no --dry-run");
    expect(ran.code).toBe(EXIT_UNREACHABLE);
  });
});
