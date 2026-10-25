import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";

// What scripts/dev.sh asks of Node: the app's env files read the way Next
// reads them, and the catalog file the app would open, checked.

const CLI = join(dirname(fileURLToPath(import.meta.url)), "dev-env.mjs");
const dirs = [];
const appDir = (files) => {
  const dir = mkdtempSync(join(tmpdir(), "dev-env-"));
  dirs.push(dir);
  for (const [name, text] of Object.entries(files)) writeFileSync(join(dir, name), text);
  return dir;
};
// `get` runs in a process of its own: Next's loader writes to process.env.
// CATALOG_ENV_FILE names nothing, so a developer's services/catalog/.env
// cannot reach `db` and change which file it checks.
const cli = (args, env = {}) => {
  const ran = spawnSync(process.execPath, [CLI, ...args], {
    encoding: "utf8",
    env: { PATH: process.env.PATH, CATALOG_ENV_FILE: "/nonexistent/catalog.env", ...env },
  });
  return { code: ran.status, out: ran.stdout, err: ran.stderr };
};

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("dev-env.mjs db", () => {
  const catalogAt = (file) => {
    mkdirSync(dirname(file), { recursive: true });
    const db = new Database(file);
    db.exec("create table learner (id text primary key)");
    db.close();
    return file;
  };

  it("prints the file the app would open: CATALOG_DB from .env.local, else the default under HOME", () => {
    const home = appDir({});
    const file = catalogAt(join(home, "picked.db"));
    const ok = cli(["db", appDir({ ".env.local": `CATALOG_DB=${file}\n` })], { HOME: home });
    expect(ok.code).toBe(0);
    expect(ok.out).toBe(`FILE=${file}\n`);
    const fallback = catalogAt(join(home, ".gnosia", "catalog.db"));
    expect(cli(["db", appDir({})], { HOME: home }).out).toBe(`FILE=${fallback}\n`);
  });

  it("expands a leading ~ and reads a sqlite: URL, as the catalog does", () => {
    const home = appDir({});
    const file = catalogAt(join(home, "data", "catalog.db"));
    expect(cli(["db", appDir({})], { HOME: home, CATALOG_DB: "~/data/catalog.db" }).out).toBe(`FILE=${file}\n`);
    expect(cli(["db", appDir({})], { HOME: home, DATABASE_URL: `sqlite://${file}` }).out).toBe(`FILE=${file}\n`);
  });

  it("resolves a relative CATALOG_DB from the app's directory, where next dev runs", () => {
    const app = appDir({ ".env.local": "CATALOG_DB=./data/catalog.db\n" });
    const file = catalogAt(join(app, "data", "catalog.db"));
    const ran = cli(["db", app], { HOME: appDir({}) });
    expect(ran.code).toBe(0);
    // The cwd is the real path (macOS's /var is /private/var), so compare those.
    expect(ran.out).toBe(`FILE=${realpathSync(file)}\n`);
  });

  it("reads services/catalog/.env under the app's files, as the app does", () => {
    const home = appDir({});
    const file = catalogAt(join(home, "from-catalog-env.db"));
    const envFile = join(appDir({}), "catalog.env");
    writeFileSync(envFile, `CATALOG_DB=${file}\n`);
    expect(cli(["db", appDir({})], { HOME: home, CATALOG_ENV_FILE: envFile }).out).toBe(`FILE=${file}\n`);
    const other = catalogAt(join(home, "from-app.db"));
    const app = appDir({ ".env.local": `CATALOG_DB=${other}\n` });
    expect(cli(["db", app], { HOME: home, CATALOG_ENV_FILE: envFile }).out).toBe(`FILE=${other}\n`);
  });

  it("exits 3 with one line, and prints nothing on stdout, when the file is missing or a postgres URL is set", () => {
    const home = appDir({});
    const missing = cli(["db", appDir({})], { HOME: home });
    expect(missing.code).toBe(3);
    expect(missing.out).toBe("");
    expect(missing.err).toBe(
      `dev-env.mjs: there is no catalog at ${join(home, ".gnosia", "catalog.db")}: npm run catalog -- migrate, then import the seed (README, Install)\n`,
    );
    const pg = cli(["db", appDir({ ".env.local": "DATABASE_URL=postgres://u:secret@h/db\n" })], { HOME: home });
    expect(pg.code).toBe(3);
    expect(pg.err).toContain("is a Postgres URL");
    expect(pg.err).not.toContain("secret");
  });

  it("prints usage and exits 2 for anything else", () => {
    expect(cli([]).code).toBe(2);
    expect(cli(["get", "only-one-arg"]).code).toBe(2);
    expect(cli(["db"]).code).toBe(2);
    expect(cli(["pg", "postgres://h/d"]).code).toBe(2);
  });
});

describe("dev-env.mjs get", () => {
  it("reads a quoted value with a trailing comment as Next does", () => {
    const dir = appDir({ ".env.local": 'CATALOG_DB="~/.gnosia/catalog.db" # local database\nOWNER_PASSWORD=pw\n' });
    const ran = cli(["get", dir, "CATALOG_DB", "OWNER_PASSWORD", "AUTH_SECRET"]);
    expect(ran.code).toBe(0);
    // A key that is not set is left out, not printed empty.
    expect(ran.out).toBe("CATALOG_DB=~/.gnosia/catalog.db\nOWNER_PASSWORD=pw\n");
  });

  it("lets the environment win over the files, and .env.local over .env", () => {
    const dir = appDir({ ".env": "A=from-env\nB=from-env\nC=from-env\n", ".env.local": "B=from-local\nC=from-local\n" });
    const ran = cli(["get", dir, "A", "B", "C"], { C: "from-shell" });
    expect(ran.out).toBe("A=from-env\nB=from-local\nC=from-shell\n");
  });

  it("reads the files of the dev server, not the test or production ones", () => {
    const dir = appDir({ ".env.development": "MODE=dev\n", ".env.production": "MODE=production\n" });
    expect(cli(["get", dir, "MODE"]).out).toBe("MODE=dev\n");
  });

  it("prints nothing, and succeeds, when there are no env files", () => {
    const ran = cli(["get", appDir({}), "CATALOG_DB"]);
    expect(ran.code).toBe(0);
    expect(ran.out).toBe("");
  });
});
