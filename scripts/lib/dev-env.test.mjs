import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

import { pgEnv } from "./dev-env.mjs";

// What scripts/dev.sh asks of Node: the app's env files read the way Next
// reads them, and a DATABASE_URL turned into the variables libpq reads.

const CLI = join(dirname(fileURLToPath(import.meta.url)), "dev-env.mjs");
const dirs = [];
const appDir = (files) => {
  const dir = mkdtempSync(join(tmpdir(), "dev-env-"));
  dirs.push(dir);
  for (const [name, text] of Object.entries(files)) writeFileSync(join(dir, name), text);
  return dir;
};
// `get` runs in a process of its own: Next's loader writes to process.env.
const cli = (args, env = {}) => {
  const ran = spawnSync(process.execPath, [CLI, ...args], { encoding: "utf8", env: { PATH: process.env.PATH, ...env } });
  return { code: ran.status, out: ran.stdout, err: ran.stderr };
};

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("pgEnv", () => {
  it("splits a URL into the variables libpq reads", () => {
    expect(pgEnv("postgres://catalog:secret@db.example:5433/learn")).toEqual({
      PGHOST: "db.example",
      PGPORT: "5433",
      PGUSER: "catalog",
      PGPASSWORD: "secret",
      PGDATABASE: "learn",
    });
  });

  it("leaves out what the URL does not say, so libpq's own defaults apply", () => {
    expect(pgEnv("postgres://localhost/self_learn")).toEqual({ PGHOST: "localhost", PGDATABASE: "self_learn" });
    expect(pgEnv("postgresql://localhost")).toEqual({ PGHOST: "localhost" });
  });

  it("decodes percent-escapes in the user and password", () => {
    const env = pgEnv("postgres://us%40er:p%40ss%3Aw%2Frd@h/db");
    expect(env.PGUSER).toBe("us@er");
    expect(env.PGPASSWORD).toBe("p@ss:w/rd");
  });

  it("takes an IPv6 host without its brackets", () => {
    expect(pgEnv("postgres://[::1]:5432/db").PGHOST).toBe("::1");
  });

  it("honours the query parameters that move the connection", () => {
    expect(pgEnv("postgres:///db?host=/var/run/postgresql&sslmode=require")).toMatchObject({
      PGHOST: "/var/run/postgresql",
      PGSSLMODE: "require",
      PGDATABASE: "db",
    });
  });

  it("refuses a URL that is not a postgres one", () => {
    expect(() => pgEnv("mysql://x/y")).toThrow("not a postgres URL");
    expect(() => pgEnv("not a url")).toThrow();
  });
});

describe("dev-env.mjs pg", () => {
  it("prints NAME=value lines, and exits 3 on a URL it cannot use", () => {
    const ok = cli(["pg", "postgres://u:p@h:1/d"]);
    expect(ok.code).toBe(0);
    expect(ok.out.split("\n").filter(Boolean)).toEqual(["PGHOST=h", "PGPORT=1", "PGUSER=u", "PGPASSWORD=p", "PGDATABASE=d"]);
    const bad = cli(["pg", "mysql://x/y"]);
    expect(bad.code).toBe(3);
    expect(bad.out).toBe("");
  });

  it("prints usage and exits 2 for anything else", () => {
    expect(cli([]).code).toBe(2);
    expect(cli(["get", "only-one-arg"]).code).toBe(2);
    expect(cli(["pg"]).code).toBe(2);
  });
});

describe("dev-env.mjs get", () => {
  it("reads a quoted value with a trailing comment as Next does", () => {
    const dir = appDir({ ".env.local": 'DATABASE_URL="postgres://localhost:5432/self_learn" # local database\nOWNER_PASSWORD=pw\n' });
    const ran = cli(["get", dir, "DATABASE_URL", "OWNER_PASSWORD", "AUTH_SECRET"]);
    expect(ran.code).toBe(0);
    // A key that is not set is left out, not printed empty.
    expect(ran.out).toBe("DATABASE_URL=postgres://localhost:5432/self_learn\nOWNER_PASSWORD=pw\n");
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
    const ran = cli(["get", appDir({}), "DATABASE_URL"]);
    expect(ran.code).toBe(0);
    expect(ran.out).toBe("");
  });
});
