import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

import { splitDatabaseUrl } from "./dev-env.mjs";

// What scripts/dev.sh asks of Node: the app's env files read the way Next
// reads them, and a DATABASE_URL with its password taken out.

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

describe("splitDatabaseUrl", () => {
  it("takes the password out and leaves the rest of the URL as it was", () => {
    expect(splitDatabaseUrl("postgres://catalog:secret@db.example:5433/learn")).toEqual({
      url: "postgres://catalog@db.example:5433/learn",
      password: "secret",
    });
  });

  it("leaves a URL with no password exactly as it was", () => {
    expect(splitDatabaseUrl("postgres://localhost:5432/self_learn")).toEqual({
      url: "postgres://localhost:5432/self_learn",
      password: "",
    });
    expect(splitDatabaseUrl("postgresql://localhost").url).toBe("postgresql://localhost");
  });

  it("decodes percent-escapes in the password, and keeps them in the user", () => {
    expect(splitDatabaseUrl("postgres://us%40er:p%40ss%3Aw%2Frd@h/db")).toEqual({
      url: "postgres://us%40er@h/db",
      password: "p@ss:w/rd",
    });
  });

  it("keeps every connection option, certificate paths included", () => {
    const query = "sslmode=verify-full&sslrootcert=/etc/ca.pem&sslcert=/c.pem&sslkey=/k.pem&connect_timeout=5&options=-c%20search_path%3Dx";
    expect(splitDatabaseUrl(`postgres://u:pw@h/db?${query}`).url).toBe(`postgres://u@h/db?${query}`);
  });

  it("keeps a socket-directory host", () => {
    expect(splitDatabaseUrl("postgres:///db?host=/var/run/postgresql").url).toBe("postgres:///db?host=/var/run/postgresql");
  });

  it("cuts a password given as a query parameter and leaves the other parameters untouched", () => {
    expect(splitDatabaseUrl("postgres://u@h/db?sslmode=require&password=via%20query&application_name=a%20b")).toEqual({
      url: "postgres://u@h/db?sslmode=require&application_name=a%20b",
      password: "via query",
    });
    expect(splitDatabaseUrl("postgres://u@h/db?password=only")).toEqual({ url: "postgres://u@h/db", password: "only" });
  });

  it("refuses a URL that is not a postgres one", () => {
    expect(() => splitDatabaseUrl("mysql://x/y")).toThrow("not a postgres URL");
    expect(() => splitDatabaseUrl("not a url")).toThrow();
  });
});

describe("dev-env.mjs pg", () => {
  it("prints the URL without its password, then the password, and exits 3 on a URL it cannot use", () => {
    const ok = cli(["pg", "postgres://u:p@h:1/d?sslmode=require"]);
    expect(ok.code).toBe(0);
    expect(ok.out.split("\n").filter(Boolean)).toEqual(["URL=postgres://u@h:1/d?sslmode=require", "PGPASSWORD=p"]);
    expect(cli(["pg", "postgres://h/d"]).out).toBe("URL=postgres://h/d\n");
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
