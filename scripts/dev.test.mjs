import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";

// scripts/dev.sh against a recording stand-in for tmux and for what it checks
// (the catalog file, ports). Nothing here starts a process or touches a real tmux
// server. The script's own tmux calls were also run by hand on a real one,
// including with base-index and pane-base-index set to 1, which is how
// `remain-on-exit` being a window option, the `=session:` targets and the
// pane numbering were found out.

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), "dev.sh");
const dirs = [];

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

const stub = (bin, name, body) => {
  const file = join(bin, name);
  writeFileSync(file, `#!/bin/sh\n${body}\n`);
  chmodSync(file, 0o755);
};

/** A SQLite file holding `learner`, the one table the check asks a catalog for. */
const makeCatalog = (file) => {
  mkdirSync(dirname(file), { recursive: true });
  const db = new Database(file);
  db.exec("create table learner (id text primary key)");
  db.close();
  return file;
};

/**
 * A repository root, a bin directory of stubs and a call log. `envFile` is the
 * text of apps/web/.env.local; the stubs report success unless a test says so.
 * HOME is the sandbox, so the catalog the app would open by default is
 * `<sandbox>/.gnosia/catalog.db`, made unless `catalog` is false.
 */
function sandbox({ nodeModules = true, catalog = true, envFile = "OWNER_PASSWORD=pw\nAUTH_SECRET=secret\n" } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "dev-sh-"));
  dirs.push(dir);
  const root = join(dir, "root");
  const bin = join(dir, "bin");
  const state = join(dir, "state");
  const tmp = join(dir, "tmp");
  for (const d of [join(root, "apps", "web"), bin, state, tmp]) mkdirSync(d, { recursive: true });
  if (nodeModules) mkdirSync(join(root, "node_modules"));
  writeFileSync(join(root, "apps", "web", ".env.local"), envFile);
  const log = join(dir, "calls.log");
  writeFileSync(log, "");
  const defaultCatalog = join(dir, ".gnosia", "catalog.db");
  if (catalog) makeCatalog(defaultCatalog);

  stub(bin, "tmux", `echo "tmux $*" >> "$CALLS_LOG"
case "$1" in
  has-session) [ -f "$STATE_DIR/session" ] ;;
  new-session) touch "$STATE_DIR/session"; echo %0 ;;
  split-window) if [ -f "$STATE_DIR/split_fails" ]; then exit 1; fi; echo %1 ;;
  kill-session) rm -f "$STATE_DIR/session" "$STATE_DIR/interrupted" "$STATE_DIR/all_dead" ;;
  send-keys) touch "$STATE_DIR/interrupted" ;;
  show-environment) cat "$STATE_DIR/server_env" 2>/dev/null; true ;;
  attach-session|switch-client) [ ! -f "$STATE_DIR/no_terminal" ] || { echo "open terminal failed: not a terminal" >&2; exit 1; } ;;
  list-panes)
    case "$*" in
      *pane_title*) printf 'web :3000: running\\nstudio :7250: running\\n' ;;
      *pane_id*) printf '%%0\\n%%1\\n' ;;
      *) if [ -f "$STATE_DIR/interrupted" ] || [ -f "$STATE_DIR/all_dead" ]; then printf '1\\n1\\n'; else printf '0\\n0\\n'; fi ;;
    esac ;;
esac`);
  stub(bin, "npm", `echo "npm $* STUDIO_ENABLED=\${STUDIO_ENABLED:-unset}" >> "$CALLS_LOG"`);
  stub(bin, "lsof", `[ -n "$BUSY_PORT" ] || exit 1
case "$*" in *":$BUSY_PORT "*|*":$BUSY_PORT") echo "node 1 you 20u IPv4 TCP *:$BUSY_PORT (LISTEN)" ;; *) exit 1 ;; esac`);
  stub(bin, "claude", "exit 0");

  const calls = () => readFileSync(log, "utf8").split("\n").filter(Boolean);
  const run = (args = [], { env = {}, tmux = join(bin, "tmux") } = {}) => {
    const ran = spawnSync("/bin/bash", [SCRIPT, ...args], {
      encoding: "utf8",
      env: {
        // Built from nothing: the developer's own STUDIO_*, CATALOG_DB and
        // DATABASE_URL must not leak in. node is the test runner's, for the version check
        // and the env loader.
        PATH: `${bin}:${dirname(process.execPath)}:/usr/bin:/bin`,
        HOME: dir,
        TMPDIR: tmp,
        DEV_ROOT: root,
        DEV_TMUX_BIN: tmux,
        CALLS_LOG: log,
        STATE_DIR: state,
        // Ports nothing should listen on, so `status` never reaches a real
        // server, and different, so each message names the right one.
        PORT: "19001",
        STUDIO_PORT: "19002",
        ...env,
      },
    });
    return { code: ran.status, out: ran.stdout, err: ran.stderr, calls: calls() };
  };
  const flag = (name, content = "") => writeFileSync(join(state, name), content);
  /** The environment file a tmux call hands its pane, which a real pane would read and delete. */
  const paneEnv = (call) => {
    const file = /(\S*gnosia-dev\.\w+)/.exec(call)?.[1];
    expect(file, `no pane file in: ${call}`).toBeTruthy();
    return { file, text: readFileSync(file, "utf8") };
  };
  const leftovers = () => readdirSync(tmp).filter((name) => name.startsWith("gnosia-dev."));
  return { dir, root, bin, run, flag, calls, paneEnv, leftovers, defaultCatalog };
}

const tmuxCall = (calls, verb) => calls.filter((c) => c.startsWith(`tmux ${verb} `));

describe("scripts/dev.sh arguments", () => {
  it("prints its usage and exits zero", () => {
    const { run } = sandbox();
    const ran = run(["--help"]);
    expect(ran.code).toBe(0);
    expect(ran.out).toContain("Usage: scripts/dev.sh");
    expect(ran.calls).toEqual([]);
  });

  it("refuses an unknown option, and a second command, without starting anything", () => {
    const { run } = sandbox();
    const unknown = run(["--frobnicate"]);
    expect(unknown.code).toBe(2);
    expect(unknown.err).toContain("unknown argument: --frobnicate");
    const twice = run(["start", "stop"]);
    expect(twice.code).toBe(1);
    expect(twice.err).toContain("one command at a time");
    expect(tmuxCall(unknown.calls.concat(twice.calls), "new-session")).toEqual([]);
  });
});

describe("scripts/dev.sh start", () => {
  it("runs the web app and the runner as two panes of one session, with Studio on", () => {
    const { run, paneEnv } = sandbox();
    const ran = run(["start", "--detach", "--no-checks"]);
    expect(ran.code).toBe(0);
    const [created] = tmuxCall(ran.calls, "new-session");
    expect(created).toContain("-d -P -F #{pane_id} -s gnosia");
    expect(created).toContain("npm run dev");
    expect(paneEnv(created).text).toContain("export STUDIO_ENABLED=1");
    expect(paneEnv(created).text).toContain("export PATH=");
    const [split] = tmuxCall(ran.calls, "split-window");
    expect(split).toContain("npm run studio");
    expect(paneEnv(split).text).toContain("export STUDIO_ENABLED=1");
    expect(ran.out).toContain("http://localhost:19001/studio");
    // A pane that exits must stay on screen with its error.
    expect(ran.calls.some((c) => c.includes("remain-on-exit on"))).toBe(true);
  });

  it("addresses panes by the id tmux returned, so base-index settings cannot break it", () => {
    const { run } = sandbox();
    const ran = run(["--detach", "--no-checks"]);
    expect(ran.calls).toContain("tmux select-pane -t %0 -T web :19001");
    expect(tmuxCall(ran.calls, "split-window")[0]).toContain("-h -P -F #{pane_id} -t %0");
    expect(ran.calls).toContain("tmux select-pane -t %1 -T studio :19002");
    // No `session:window.index` target anywhere (the pane files are named gnosia-dev.XXXXXX).
    expect(ran.calls.filter((c) => /:dev\.\d/.test(c))).toEqual([]);
  });

  it("is what runs with no command at all", () => {
    const { run } = sandbox();
    const ran = run(["--detach", "--no-checks"]);
    expect(tmuxCall(ran.calls, "new-session")).toHaveLength(1);
  });

  it("attaches unless told not to, and switches client when already inside tmux", () => {
    const attached = sandbox().run(["--no-checks"]);
    expect(tmuxCall(attached.calls, "attach-session")[0]).toContain("-t =gnosia");
    const detached = sandbox().run(["--no-checks", "--detach"]);
    expect(tmuxCall(detached.calls, "attach-session")).toEqual([]);
    const inside = sandbox().run(["--no-checks"], { env: { TMUX: "/tmp/tmux-1/default,1,0" } });
    expect(tmuxCall(inside.calls, "switch-client")).toHaveLength(1);
    expect(tmuxCall(inside.calls, "attach-session")).toEqual([]);
  });

  it("with --no-studio runs one pane and switches Studio off", () => {
    const { run, paneEnv } = sandbox();
    const ran = run(["--detach", "--no-checks", "--no-studio"]);
    expect(tmuxCall(ran.calls, "split-window")).toEqual([]);
    expect(paneEnv(tmuxCall(ran.calls, "new-session")[0]).text).toContain("export STUDIO_ENABLED=0");
    expect(ran.out).not.toContain("/studio");
  });

  it("hands the panes PATH and the variables the processes read, and nothing else", () => {
    const { run, paneEnv } = sandbox();
    const ran = run(["--detach", "--no-checks"], {
      env: { STUDIO_DAILY_USD: "3", CATALOG_DB: "/srv/catalog.db", DATABASE_URL: "/srv/other.db", SECRET_THING: "nope" },
    });
    for (const verb of ["new-session", "split-window"]) {
      const { file, text } = paneEnv(tmuxCall(ran.calls, verb)[0]);
      expect(text).toContain("export STUDIO_DAILY_USD=3");
      expect(text).toContain("export CATALOG_DB=/srv/catalog.db");
      expect(text).toContain("export DATABASE_URL=/srv/other.db");
      expect(text).not.toContain("SECRET_THING");
      expect(statSync(file).mode & 0o777).toBe(0o600);
    }
  });

  it("unsets what a tmux server that predates the shell still holds", () => {
    const { run, flag, paneEnv } = sandbox();
    // The server was started when DATABASE_URL and two STUDIO_* variables were
    // set; this shell has since dropped DATABASE_URL and STUDIO_DAILY_USD.
    flag("server_env", "STUDIO_DAILY_USD=9\nSTUDIO_OWNER=old\nDATABASE_URL=/old/catalog.db\nPATH=/x\n-FOO\n");
    const ran = run(["--detach", "--no-checks"], { env: { STUDIO_OWNER: "me" } });
    const { text } = paneEnv(tmuxCall(ran.calls, "new-session")[0]);
    expect(text).toContain("unset STUDIO_DAILY_USD");
    expect(text).toContain("unset DATABASE_URL");
    expect(text).toContain("export STUDIO_OWNER=me");
    expect(text).not.toContain("unset STUDIO_OWNER");
    expect(text).not.toContain("/x");
  });

  it("leaves nothing behind when the second pane cannot be created", () => {
    const { run, flag, leftovers } = sandbox();
    flag("split_fails");
    const ran = run(["--detach", "--no-checks"]);
    expect(ran.code).not.toBe(0);
    expect(leftovers()).toEqual([]);
    expect(tmuxCall(ran.calls, "kill-session")).toHaveLength(1);
  });

  it("keeps the files for the panes to read when it succeeds", () => {
    const { run, leftovers } = sandbox();
    run(["--detach", "--no-checks"]);
    expect(leftovers()).toHaveLength(2);
  });

  it("reuses a session that is already up instead of starting a second one", () => {
    const { run, flag } = sandbox();
    flag("session");
    const ran = run(["--no-checks"]);
    expect(ran.out).toContain("already running in tmux session 'gnosia'");
    expect(tmuxCall(ran.calls, "new-session")).toEqual([]);
    expect(tmuxCall(ran.calls, "attach-session")).toHaveLength(1);
  });

  it("starts again when the session is left over from panes that have all exited", () => {
    const { run, flag } = sandbox();
    flag("session");
    flag("all_dead");
    const ran = run(["--detach", "--no-checks"]);
    expect(ran.out).toContain("left over from a run that has exited");
    const kill = ran.calls.findIndex((c) => c.startsWith("tmux kill-session"));
    const create = ran.calls.findIndex((c) => c.startsWith("tmux new-session"));
    expect(kill).toBeGreaterThanOrEqual(0);
    expect(create).toBeGreaterThan(kill);
  });

  it("says how to attach, and still succeeds, when there is no terminal to attach from", () => {
    const { run, flag } = sandbox();
    flag("no_terminal");
    const ran = run(["--no-checks"]);
    expect(ran.code).toBe(0);
    expect(ran.out).toContain("could not attach from here");
    expect(tmuxCall(ran.calls, "new-session")).toHaveLength(1);
  });

  it("falls back to dev:all in this terminal when tmux is missing", () => {
    const { run } = sandbox();
    const ran = run(["--no-checks"], { tmux: "/nonexistent/tmux" });
    expect(ran.err).toContain("tmux not found");
    expect(ran.calls).toEqual(["npm run dev:all STUDIO_ENABLED=1"]);
  });

  it("runs dev:all, or the web app alone, in this terminal with --no-tmux", () => {
    const both = sandbox().run(["--no-checks", "--no-tmux"]);
    expect(both.calls).toEqual(["npm run dev:all STUDIO_ENABLED=1"]);
    const web = sandbox().run(["--no-checks", "--no-tmux", "--no-studio"]);
    expect(web.calls).toEqual(["npm run dev STUDIO_ENABLED=0"]);
  });
});

describe("scripts/dev.sh checks", () => {
  it("stops, before touching tmux, when dependencies are not installed", () => {
    const { run } = sandbox({ nodeModules: false });
    const ran = run(["--detach"]);
    expect(ran.code).toBe(1);
    expect(ran.err).toContain("run npm ci");
    expect(tmuxCall(ran.calls, "new-session")).toEqual([]);
  });

  it("refuses, before touching tmux, when there is no catalog file", () => {
    const { run, defaultCatalog } = sandbox({ catalog: false });
    const ran = run(["--detach"]);
    expect(ran.code).toBe(1);
    expect(ran.err).toContain(`there is no catalog at ${defaultCatalog}`);
    expect(ran.err).toContain("npm run catalog -- migrate");
    expect(tmuxCall(ran.calls, "new-session")).toEqual([]);
  });

  it("reads .env.local the way Next does: a quoted value and a trailing comment", () => {
    const { dir, root, run } = sandbox({ catalog: false });
    const file = join(dir, "elsewhere", "catalog.db");
    writeFileSync(join(root, "apps", "web", ".env.local"), `CATALOG_DB="${file}" # local database\nOWNER_PASSWORD=pw\nAUTH_SECRET=s\n`);
    expect(run(["--detach"]).err).toContain(`there is no catalog at ${file}:`);
    makeCatalog(file);
    expect(run(["--detach"]).code).toBe(0);
  });

  it("takes CATALOG_DB before DATABASE_URL, the environment before the file, and $GNOSIA_HOME last", () => {
    const { dir, run } = sandbox({ envFile: "CATALOG_DB=/from/file.db\nOWNER_PASSWORD=pw\nAUTH_SECRET=s\n" });
    expect(run(["--detach"]).err).toContain("there is no catalog at /from/file.db");
    expect(run(["--detach"], { env: { CATALOG_DB: "/from/env.db" } }).err).toContain("there is no catalog at /from/env.db");
    const bare = sandbox({ catalog: false });
    expect(bare.run(["--detach"], { env: { DATABASE_URL: "/from/url.db" } }).err).toContain("at /from/url.db");
    expect(bare.run(["--detach"], { env: { DATABASE_URL: "/from/url.db", CATALOG_DB: "/from/env.db" } }).err).toContain(
      "at /from/env.db",
    );
    expect(bare.run(["--detach"], { env: { GNOSIA_HOME: join(dir, "home") } }).err).toContain(
      `at ${join(dir, "home", "catalog.db")}`,
    );
  });

  it("refuses a postgres:// DATABASE_URL, with the password hidden", () => {
    const envFile = "DATABASE_URL=postgres://catalog:hunter2@db.example:5433/learn\nOWNER_PASSWORD=pw\nAUTH_SECRET=s\n";
    const ran = sandbox({ envFile }).run(["--detach"]);
    expect(ran.code).toBe(1);
    expect(ran.err).toContain("is a Postgres URL");
    expect(ran.err).toContain("CATALOG_DB");
    expect(ran.out + ran.err).not.toContain("hunter2");
    expect(tmuxCall(ran.calls, "new-session")).toEqual([]);
  });

  it("refuses a file that is not a database, and a database never migrated", () => {
    const { dir, run } = sandbox({ catalog: false });
    const junk = join(dir, "junk.db");
    writeFileSync(junk, "not a database, just text long enough to have a header\n".repeat(4));
    const notDb = run(["--detach"], { env: { CATALOG_DB: junk } });
    expect(notDb.code).toBe(1);
    expect(notDb.err).toContain(`cannot open the catalog at ${junk}`);
    const empty = join(dir, "empty.db");
    new Database(empty).close();
    const ran = run(["--detach"], { env: { CATALOG_DB: empty } });
    expect(ran.code).toBe(1);
    expect(ran.err).toContain(`the catalog at ${empty} has no tables yet`);
  });

  it("never creates or changes the catalog file it checks", () => {
    const { run, defaultCatalog } = sandbox();
    const before = statSync(defaultCatalog);
    expect(run(["--detach"]).code).toBe(0);
    const after = statSync(defaultCatalog);
    expect([after.size, after.mtimeMs]).toEqual([before.size, before.mtimeMs]);
    const missing = sandbox({ catalog: false });
    missing.run(["--detach"]);
    expect(existsSync(missing.defaultCatalog)).toBe(false);
  });

  it("warns, and still starts, when nobody could sign in", () => {
    const missing = sandbox({ envFile: "OWNER_PASSWORD=\n" }).run(["--detach"]);
    expect(missing.code).toBe(0);
    expect(missing.err).toContain("OWNER_PASSWORD or AUTH_SECRET");
    expect(tmuxCall(missing.calls, "new-session")).toHaveLength(1);
    const present = sandbox().run(["--detach"]);
    expect(present.err).not.toContain("OWNER_PASSWORD");
  });

  it("warns about an unbuilt tldrawkc only while Studio is on", () => {
    expect(sandbox().run(["--detach"]).err).toContain("tools/tldrawkc is not built");
    expect(sandbox().run(["--detach", "--no-studio"]).err).not.toContain("tldrawkc");
    const built = sandbox();
    mkdirSync(join(built.root, "tools", "tldrawkc", "dist"), { recursive: true });
    expect(built.run(["--detach"]).err).not.toContain("tldrawkc");
  });

  it("warns when a port is taken, but not when the session is its own", () => {
    const { run, flag } = sandbox();
    const taken = run(["--detach"], { env: { BUSY_PORT: "19002" } });
    expect(taken.code).toBe(0);
    expect(taken.err).toContain("already listens on :19002");
    expect(taken.err).not.toContain(":19001");
    flag("session");
    expect(run(["--detach"], { env: { BUSY_PORT: "19002" } }).err).not.toContain("listens");
  });

  it("is skipped by --no-checks", () => {
    const { run } = sandbox({ nodeModules: false, catalog: false });
    const ran = run(["--detach", "--no-checks"]);
    expect(ran.code).toBe(0);
    expect(ran.err).not.toContain("catalog");
    expect(tmuxCall(ran.calls, "new-session")).toHaveLength(1);
  });
});

describe("scripts/dev.sh stop and status", () => {
  it("interrupts every pane before ending the session", () => {
    const { run, flag } = sandbox();
    flag("session");
    const ran = run(["stop"]);
    expect(ran.code).toBe(0);
    const sent = ran.calls.filter((c) => c.startsWith("tmux send-keys"));
    expect(sent).toEqual(["tmux send-keys -t %0 C-c", "tmux send-keys -t %1 C-c"]);
    const lastInterrupt = ran.calls.lastIndexOf(sent[1]);
    const killed = ran.calls.findIndex((c) => c.startsWith("tmux kill-session"));
    expect(killed).toBeGreaterThan(lastInterrupt);
    expect(ran.out).toContain("stopped");
  });

  it("has nothing to do when no session is up", () => {
    const ran = sandbox().run(["stop"]);
    expect(ran.code).toBe(0);
    expect(ran.out).toContain("nothing running");
    expect(tmuxCall(ran.calls, "kill-session")).toEqual([]);
  });

  it("reports the session's panes, and exits non-zero when there is none", () => {
    const { run, flag } = sandbox();
    expect(run(["status"]).code).toBe(1);
    flag("session");
    const up = run(["status"]);
    expect(up.code).toBe(0);
    expect(up.out).toContain("web :3000: running");
    expect(up.out).toContain("runner does not answer on :19002");
  });

  it("takes the session name from DEV_SESSION", () => {
    const { run } = sandbox();
    const ran = run(["--detach", "--no-checks"], { env: { DEV_SESSION: "other" } });
    expect(tmuxCall(ran.calls, "new-session")[0]).toContain("-s other");
    expect(existsSync(SCRIPT)).toBe(true);
  });
});
