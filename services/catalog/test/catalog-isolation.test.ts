import { execFile } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { afterAll, describe, expect, it } from "vitest";

import { databasePath, ENV_FILE, REPO_ROOT } from "../src/env";
import { canonical, forbiddenCatalogs, refuseForbiddenOpen } from "./catalog-guard";
import { NO_DEFAULT_CATALOG } from "./catalog-isolation";

/**
 * The guarantee vitest.setup.ts gives every suite: whatever the shell or
 * services/catalog/.env names, no test opens a catalog file it did not make.
 * R2-4-01: seventeen suites point the catalog at their scratch file through
 * `DATABASE_URL`, and `CATALOG_DB` wins over it, so on a machine whose .env
 * set `CATALOG_DB` (as docs/DEPLOYMENT.md says to) their route writes went
 * into the owner's real catalog.
 */

const scratch = mkdtempSync(path.join(tmpdir(), "catalog-isolation-"));
const execFileAsync = promisify(execFile);

afterAll(() => {
  rmSync(scratch, { recursive: true, force: true });
});

/** A suite that sets only `DATABASE_URL` before it imports a route, and writes a recap through it. */
const ROUTE_SUITE = "apps/web/src/lib/learner-context.recap-retry.test.ts";

/** Runs one suite in a vitest of its own, under `env` as its shell, and says whether it passed. */
async function runSuite(env: NodeJS.ProcessEnv, suite = ROUTE_SUITE): Promise<{ passed: boolean; output: string }> {
  // The child is a fresh run, not a worker of this one, so nothing of this
  // run's own vitest bookkeeping goes with it.
  const clean = Object.fromEntries(
    Object.entries({ ...process.env, ...env }).filter(([key]) => !key.startsWith("VITEST") && key !== "NODE_V8_COVERAGE"),
  );
  try {
    const { stdout, stderr } = await execFileAsync(
      process.execPath,
      [path.join(REPO_ROOT, "node_modules", "vitest", "vitest.mjs"), "run", suite],
      { cwd: REPO_ROOT, env: clean, timeout: 150_000, maxBuffer: 16 * 1024 * 1024 },
    );
    return { passed: true, output: stdout + stderr };
  } catch (error) {
    const failed = error as { stdout?: string; stderr?: string; message: string };
    return { passed: false, output: `${failed.message}\n${failed.stdout ?? ""}${failed.stderr ?? ""}` };
  }
}

describe("a route suite run under a machine's own catalog settings", () => {
  it("writes to its scratch file, not the CATALOG_DB the shell exports", async () => {
    const sentinel = path.join(scratch, "from-shell", "catalog.db");
    mkdirSync(path.dirname(sentinel), { recursive: true });
    const run = await runSuite({ CATALOG_DB: sentinel });
    // connect() creates the file on first use, so its absence is the proof.
    expect(existsSync(sentinel), run.output).toBe(false);
    expect(run.passed, run.output).toBe(true);
  }, 160_000);

  it("writes to its scratch file, not the CATALOG_DB services/catalog/.env names", async () => {
    const sentinel = path.join(scratch, "from-dotenv", "catalog.db");
    mkdirSync(path.dirname(sentinel), { recursive: true });
    // The dotenv the catalog reads is services/catalog/.env unless
    // CATALOG_ENV_FILE says otherwise; writing the real one would clobber a
    // developer's own, so this names a file with the same content instead.
    const envFile = path.join(scratch, "catalog.env");
    writeFileSync(envFile, `CATALOG_DB=${sentinel}\n`);
    const run = await runSuite({ CATALOG_DB: undefined, CATALOG_ENV_FILE: envFile });
    expect(existsSync(sentinel), run.output).toBe(false);
    expect(run.passed, run.output).toBe(true);
  }, 160_000);
});

describe("a test that opens a forbidden catalog itself", () => {
  it("is stopped at the open, before anything is written, by url or by a default it fell back to", async () => {
    const sentinel = path.join(scratch, "forbidden", "catalog.db");
    const home = path.join(scratch, "forbidden-home");
    mkdirSync(path.dirname(sentinel), { recursive: true });
    mkdirSync(home, { recursive: true });
    const run = await runSuite(
      { CATALOG_GUARD_FIXTURE: "1", CATALOG_GUARD_SENTINEL: sentinel, CATALOG_DB: sentinel, HOME: home },
      "services/catalog/test/catalog-guard-fixture.test.ts",
    );
    expect(existsSync(sentinel), run.output).toBe(false);
    expect(existsSync(path.join(home, ".gnosia", "catalog.db")), run.output).toBe(false);
    expect(run.passed, run.output).toBe(true);
    expect(run.output).toMatch(/2 passed/);
  }, 160_000);
});

describe("the catalog settings every test file starts with", () => {
  it("open nothing: the default is refused by name rather than created", () => {
    expect(process.env.CATALOG_DB).toBe("");
    expect(process.env.DATABASE_URL).toBe(NO_DEFAULT_CATALOG);
    expect(() => databasePath()).toThrow(/Postgres URL/);
  });

  it("never read the machine's services/catalog/.env: env.ts was first imported with the dotenv pointed at nothing", () => {
    expect(ENV_FILE).toBe(process.env.CATALOG_ENV_FILE);
    expect(existsSync(ENV_FILE)).toBe(false);
  });

  it("put the data home in a temp directory, whatever the shell exported", () => {
    const home = process.env.GNOSIA_HOME ?? "";
    expect(path.isAbsolute(home)).toBe(true);
    expect(home.startsWith(path.join(homedir(), ".gnosia"))).toBe(false);
  });
});

describe("forbiddenCatalogs", () => {
  it("names the default and every file the environment and the dotenv files point at", () => {
    const repo = path.join(scratch, "repo");
    mkdirSync(path.join(repo, "services", "catalog"), { recursive: true });
    mkdirSync(path.join(repo, "apps", "web"), { recursive: true });
    writeFileSync(path.join(repo, "services", "catalog", ".env"), "CATALOG_DB=/srv/from-catalog-env.db\n");
    writeFileSync(path.join(repo, "apps", "web", ".env.local"), "CATALOG_DB=/srv/from-env-local.db\n");
    writeFileSync(path.join(repo, "apps", "web", ".env.example"), "CATALOG_DB=/srv/from-example.db\n");
    const named = path.join(scratch, "named.env");
    writeFileSync(named, "DATABASE_URL=sqlite:///srv/from-named.db\nGNOSIA_HOME=/srv/named-home\n");

    const forbidden = forbiddenCatalogs(
      {
        HOME: "/home/someone",
        CATALOG_DB: "/srv/from-shell.db",
        DATABASE_URL: "postgres://elsewhere/",
        GNOSIA_HOME: "/srv/home",
        CATALOG_ENV_FILE: named,
      },
      repo,
    );

    for (const file of [
      path.join(homedir(), ".gnosia", "catalog.db"),
      "/home/someone/.gnosia/catalog.db",
      "/srv/from-shell.db",
      "/srv/home/catalog.db",
      "/srv/from-catalog-env.db",
      "/srv/from-env-local.db",
      "/srv/from-named.db",
      "/srv/named-home/catalog.db",
    ]) {
      // canonical: /home is a symlink on macOS, and /srv may be one anywhere.
      expect(forbidden, file).toContain(canonical(file));
    }
    expect(forbidden).not.toContain(canonical("/srv/from-example.db"));
  });
});

describe("refuseForbiddenOpen", () => {
  const forbidden = new Set(["/srv/owner/catalog.db"]);

  it("refuses a forbidden file, however the path is spelled", () => {
    expect(() => refuseForbiddenOpen("/srv/owner/catalog.db", forbidden)).toThrow(/did not make/);
    expect(() => refuseForbiddenOpen("/srv/owner/../owner/catalog.db", forbidden)).toThrow(/did not make/);
  });

  it("lets every other open through: scratch files, :memory:, SQLite's temp database and buffers", () => {
    for (const file of ["/srv/owner/scratch.db", ":memory:", "", undefined, Buffer.from("")]) {
      expect(() => refuseForbiddenOpen(file, forbidden)).not.toThrow();
    }
  });
});
