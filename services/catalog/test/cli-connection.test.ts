import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";

import { describe, expect, it } from "vitest";

import { EXIT_UNREACHABLE } from "../src/connection-failure";


/**
 * The catalog CLI's answer when it cannot use the database, end to end.
 *
 * The studio reads the exit code to decide between "run the job without the
 * database" and "refuse it", so the code is what these pin, and the one line on
 * stderr that says why. A file that cannot be opened is "nothing there", and a
 * refusal comes from one that opens but cannot be used — a Postgres URL, a
 * lock, a path that is not a database.
 */

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ENTRY = path.resolve(HERE, "..", "src", "cli.ts");

interface Ran {
  code: number | null;
  stdout: string;
  stderr: string;
}

/** Runs the CLI with its own DATABASE_URL and keeps the exit code, whatever it is. */
function catalog(url: string, ...args: string[]): Promise<Ran> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["--import", "tsx", ENTRY, ...args], {
      // A short busy timeout: the suite itself sets CATALOG_DB_TIMEOUT_MS
      // high so lock holders have room, and a child probing a locked file
      // should give up fast.
      env: { ...process.env, DATABASE_URL: url, CATALOG_DB_TIMEOUT_MS: "500" },
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

describe("nothing openable", () => {
  // A file used as a directory: nothing can ever live at that path, the same
  // "nothing there" a dead port was.
  const url = `${tmpdir()}/catalog-conn-file-${process.pid}`;
  writeFileSync(url, "x");
  const dead = `${url}/child.db`;

  it(`exits ${EXIT_UNREACHABLE} and says the connection was refused`, async () => {
    const ran = await catalog(dead, "status");
    expect(ran.code).toBe(EXIT_UNREACHABLE);
    expect(ran.stderr).toContain("database unreachable: a path component is not a directory (ENOTDIR)");
  });

  it("keeps the --json shape on stdout and puts the reason on stderr", async () => {
    const ran = await catalog(dead, "status", "--json");
    expect(ran.code).toBe(EXIT_UNREACHABLE);
    const body = JSON.parse(ran.stdout) as Record<string, unknown>;
    expect(Object.keys(body)).toEqual(["ok", "command", "database", "error"]);
    expect(body.ok).toBe(false);
    expect(ran.stderr.trim()).toBe(
      "catalog status failed: database unreachable: a path component is not a directory (ENOTDIR)",
    );
  });
});

describe("a Postgres URL", () => {
  it("refuses it with the migration pointer, not a connection error", async () => {
    const ran = await catalog("postgres://no-such-host.invalid:5432/self_learn", "status");
    expect(ran.code).toBe(1);
    expect(ran.stderr).toMatch(/Postgres URL/);
    expect(ran.stderr).toContain("SQLITE-MIGRATION.md");
  });
});

describe("a locked database", () => {
  it("stays exit 1: the file is there and busy, the same shape a refused pg connection had", async () => {
    // A writer holding `begin immediate` past the child's busy timeout: the
    // child's open succeeds, its first write does not, and that is "up but
    // refusing", never "unreachable".
    const file = `${tmpdir()}/catalog-conn-busy-${process.pid}.db`;
    const Database = (await import("better-sqlite3")).default;
    const holder = new Database(file);
    holder.exec("create table t (id integer); begin immediate; insert into t values (1);");
    try {
      const ran = await catalog(file, "import", "--json");
      expect(ran.code).toBe(1);
      expect(ran.stderr).toContain("database connection failed: database is locked (SQLITE_BUSY)");
    } finally {
      holder.exec("rollback");
      holder.close();
    }
  }, 15_000);
});

describe("catalog index, the old name of catalog import", () => {
  let url: string;
  // An unopenable path: import reaches its first query and cannot open it.
  const held = `${tmpdir()}/catalog-index-file-${process.pid}`;
  writeFileSync(held, "x");
  url = `${held}/child.db`;

  it("says the new name once, on stderr, and then runs import", async () => {
    // A dead port, so the import itself fails at its first query: what is
    // pinned is the alias line, and that stdout stays the command's --json.
    const ran = await catalog(url, "index", "--json");
    expect(ran.code).toBe(EXIT_UNREACHABLE);
    expect(ran.stderr.match(/catalog index is now catalog import/g)).toHaveLength(1);
    expect(JSON.parse(ran.stdout)).toMatchObject({ ok: false, command: "index" });
  });

  it("takes no directory, since that was never its shape", async () => {
    const ran = await catalog(url, "index", "seed");
    expect(ran.code).toBe(2);
    expect(ran.stderr).toContain("index takes no directory");
  });

  it("is not printed by import", async () => {
    const ran = await catalog(url, "import", "--json");
    expect(ran.code).toBe(EXIT_UNREACHABLE);
    expect(ran.stderr).not.toContain("catalog index is now");
  });
});
