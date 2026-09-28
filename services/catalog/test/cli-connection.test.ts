import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { EXIT_UNREACHABLE } from "../src/connection-failure";
import { deadPort, refusingPostgres, type RefusingPostgres } from "./fake-postgres";

/**
 * The catalog CLI's answer when it cannot use the database, end to end.
 *
 * The studio reads the exit code to decide between "run the job without the
 * database" and "refuse it", so the code is what these pin, and the one line on
 * stderr that says why. Neither needs a Postgres: a dead port is nothing, and a
 * refusal comes from a server that speaks just enough of the protocol to say
 * no (see `fake-postgres.ts`).
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
      env: { ...process.env, DATABASE_URL: url },
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

describe("nothing listening", () => {
  let url: string;
  beforeAll(async () => {
    // `localhost`, not 127.0.0.1: it resolves to two addresses, and the driver
    // reports two refusals as one AggregateError with an empty message, which
    // is the shape the classifier most needs to read through.
    url = `postgres://localhost:${await deadPort()}/self_learn`;
  });

  it(`exits ${EXIT_UNREACHABLE} and says the connection was refused`, async () => {
    const ran = await catalog(url, "status");
    expect(ran.code).toBe(EXIT_UNREACHABLE);
    expect(ran.stderr).toContain("database unreachable: connection refused (ECONNREFUSED)");
  });

  it("keeps the --json shape on stdout and puts the reason on stderr", async () => {
    const ran = await catalog(url, "status", "--json");
    expect(ran.code).toBe(EXIT_UNREACHABLE);
    const body = JSON.parse(ran.stdout) as Record<string, unknown>;
    expect(Object.keys(body)).toEqual(["ok", "command", "database", "error"]);
    expect(body.ok).toBe(false);
    expect(ran.stderr.trim()).toBe(
      "catalog status failed: database unreachable: connection refused (ECONNREFUSED)",
    );
  });
});

describe("a host that does not resolve", () => {
  it(`exits ${EXIT_UNREACHABLE}`, async () => {
    // .invalid is reserved by RFC 2606 and never resolves. Without a network
    // the lookup fails as EAI_AGAIN instead, which is unreachable too.
    const ran = await catalog("postgres://no-such-host.invalid:5432/self_learn", "status");
    expect(ran.code).toBe(EXIT_UNREACHABLE);
    expect(ran.stderr).toMatch(/database unreachable: host (not found \(ENOTFOUND\)|lookup failed \(EAI_AGAIN\))/);
  });
});

describe("a live server that refuses", () => {
  const servers: RefusingPostgres[] = [];
  afterAll(async () => {
    await Promise.all(servers.map((server) => server.close()));
  });

  it.each([
    ["28P01", 'password authentication failed for user "nobody"', "authentication failed"],
    ["3D000", 'database "does_not_exist" does not exist', "database does not exist"],
  ])("stays exit 1 on %s, and names the cause", async (code, message, reason) => {
    const server = await refusingPostgres(code, message);
    servers.push(server);
    const ran = await catalog(`postgres://nobody:wrong@127.0.0.1:${server.port}/does_not_exist`, "status");
    expect(ran.code).toBe(1);
    expect(ran.stderr).toContain(`database connection failed: ${reason} (${code})`);
    // The password is never printed back.
    expect(ran.stderr).not.toContain("wrong");
  });
});

describe("catalog index, the old name of catalog import", () => {
  let url: string;
  beforeAll(async () => {
    url = `postgres://localhost:${await deadPort()}/self_learn`;
  });

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
