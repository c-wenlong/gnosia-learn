import { execFile } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { afterAll, describe, expect, it } from "vitest";

import { REPO_ROOT } from "../src/env";
import { catalogInUse, forbiddenCatalogs, NO_DEFAULT_CATALOG } from "./catalog-isolation";

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
async function runSuite(env: NodeJS.ProcessEnv): Promise<{ passed: boolean; output: string }> {
  // The child is a fresh run, not a worker of this one, so nothing of this
  // run's own vitest bookkeeping goes with it.
  const clean = Object.fromEntries(
    Object.entries({ ...process.env, ...env }).filter(([key]) => !key.startsWith("VITEST") && key !== "NODE_V8_COVERAGE"),
  );
  try {
    const { stdout, stderr } = await execFileAsync(
      process.execPath,
      [path.join(REPO_ROOT, "node_modules", "vitest", "vitest.mjs"), "run", ROUTE_SUITE],
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

describe("the catalog settings every test file starts with", () => {
  it("open nothing: the default is refused by name rather than created", () => {
    expect(process.env.CATALOG_DB).toBe("");
    expect(process.env.DATABASE_URL).toBe(NO_DEFAULT_CATALOG);
    expect(catalogInUse()).toBeNull();
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
      expect(forbidden, file).toContain(file);
    }
    expect(forbidden).not.toContain("/srv/from-example.db");
  });
});
