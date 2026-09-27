import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The one question this module answers that a caller acts on: is there nothing
 * there to talk to?
 *
 * `offline: true` means "run this job without the database-backed lease", so
 * the bar is not "the message looks like a connection error" but "this proves
 * nothing else is using the database either". The difference between those two
 * readings is two agents on one candidate path, which is why it has a test of
 * its own rather than being inferred from the runner's behaviour.
 */

const procMock = vi.hoisted(() => ({ run: vi.fn(), NPM: "npm" }));
vi.mock("../src/proc", () => procMock);

const { CATALOG_UNREACHABLE, status } = await import("../src/catalog");

function fails(stderr: string, timedOut = false, code: number | null = 1) {
  procMock.run.mockResolvedValue({
    code,
    signal: null,
    stdout: "",
    stderr,
    json: null,
    timedOut,
  });
}

beforeEach(() => {
  procMock.run.mockReset();
});

describe("nothing there to talk to", () => {
  it.each([
    ["connect ECONNREFUSED 127.0.0.1:5432", "nothing is listening"],
    ["getaddrinfo ENOTFOUND db.internal", "the name does not resolve"],
    ["getaddrinfo EAI_AGAIN db.internal", "the name cannot be looked up"],
    ["DATABASE_URL is not set", "there is no database to ask"],
  ])("is offline: %s", async (stderr) => {
    fails(stderr);
    expect((await status()).offline).toBe(true);
  });

  it("is offline on the CLI's unreachable exit code, whatever the text says", async () => {
    // What the catalog CLI printed for a dead port before it had an exit code
    // for it: drizzle's wrapper, with the driver's ECONNREFUSED nowhere in it.
    fails(
      "catalog job enqueue failed: database unreachable: connection refused (ECONNREFUSED)\n" +
        "Failed query: select 1\nparams: ",
      false,
      CATALOG_UNREACHABLE,
    );
    expect((await status()).offline).toBe(true);
  });

  it("is offline when the CLI itself would not start", async () => {
    procMock.run.mockRejectedValue(new Error("spawn npm ENOENT"));
    const result = await status();
    expect(result.offline).toBe(true);
    expect(result.ok).toBe(false);
  });
});

describe("a database that is alive and refused this process", () => {
  /**
   * Every one of these reads like a connection problem and none of them means
   * the database is down. Another runner may be connected right now, holding
   * the lease this one would be skipping.
   */
  it.each([
    ['password authentication failed for user "kaichen"', "misconfigured, not absent"],
    ["sorry, too many clients already", "up, and busy serving somebody"],
    ["the database system is starting up", "about to serve everyone"],
    ["Connection terminated unexpectedly", "it answered, then dropped us"],
    ["connect ETIMEDOUT 10.0.0.4:5432", "unreachable from here, not gone"],
  ])("is not offline: %s", async (stderr) => {
    fails(stderr);
    expect((await status()).offline).toBe(false);
  });

  it.each([
    ["database connection failed: authentication failed (28P01)"],
    ["database connection failed: authentication failed (28000)"],
    ["database connection failed: database does not exist (3D000)"],
    ["database connection failed: connection timed out (ETIMEDOUT)"],
  ])("is not offline on exit 1 with the CLI's refusal line: %s", async (line) => {
    fails(`catalog status failed: ${line}`);
    expect((await status()).offline).toBe(false);
  });

  it("is not offline on exit 1 when all it says is that a query failed", async () => {
    // The text every database failure used to share. Unclassified is a
    // refusal, the direction that costs a job rather than corrupting one.
    fails("Failed query: select to_regclass($1) is not null as present\nparams: x");
    expect((await status()).offline).toBe(false);
  });

  it("is not offline when our own timer killed the call", async () => {
    // Slow is not a licence to skip the lease.
    fails("", true);
    expect((await status()).offline).toBe(false);
  });
});

describe("a domain refusal", () => {
  it.each([
    [`no job "abc". \`catalog job ls\` lists them.`],
    [`learn/assets/x.tldr is already held by job abc (running).`],
    [`job abc is running, and running → accepted is not a transition.`],
    [`no topic "x" in the catalog. Add it to content/topics.yaml`],
  ])("is never offline: %s", async (stderr) => {
    fails(stderr);
    expect((await status()).offline).toBe(false);
  });
});

describe("a call that worked", () => {
  it("is not offline, and says so", async () => {
    procMock.run.mockResolvedValue({
      code: 0,
      signal: null,
      stdout: '{"ok":true}',
      stderr: "",
      json: { ok: true },
      timedOut: false,
    });
    const result = await status();
    expect(result.ok).toBe(true);
    expect(result.offline).toBe(false);
    expect(result.error).toBeNull();
  });
});
