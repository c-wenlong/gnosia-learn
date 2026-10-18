import { spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

// scripts/dev.sh against a recording stand-in for tmux and for what it checks
// (Postgres, ports). Nothing here starts a process or touches a real tmux
// server; the script's own tmux calls were exercised once on a real one, which
// is how `remain-on-exit` and the `=session:` targets were found to need a
// window and a trailing colon.

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

/**
 * A repository root, a bin directory of stubs and a call log. `envFile` is the
 * text of apps/web/.env.local; the stubs report success unless a test says so.
 */
function sandbox({ nodeModules = true, envFile = "OWNER_PASSWORD=pw\nAUTH_SECRET=secret\n" } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "dev-sh-"));
  dirs.push(dir);
  const root = join(dir, "root");
  const bin = join(dir, "bin");
  const state = join(dir, "state");
  mkdirSync(join(root, "apps", "web"), { recursive: true });
  mkdirSync(bin);
  mkdirSync(state);
  if (nodeModules) mkdirSync(join(root, "node_modules"));
  writeFileSync(join(root, "apps", "web", ".env.local"), envFile);
  const log = join(dir, "calls.log");
  writeFileSync(log, "");

  stub(bin, "tmux", `echo "tmux $*" >> "$CALLS_LOG"
case "$1" in
  has-session) [ -f "$STATE_DIR/session" ] ;;
  new-session) touch "$STATE_DIR/session" ;;
  kill-session) rm -f "$STATE_DIR/session" "$STATE_DIR/interrupted" "$STATE_DIR/all_dead" ;;
  send-keys) touch "$STATE_DIR/interrupted" ;;
  attach-session|switch-client) [ ! -f "$STATE_DIR/no_terminal" ] || { echo "open terminal failed: not a terminal" >&2; exit 1; } ;;
  list-panes)
    case "$*" in
      *pane_title*) printf 'web :3000: running\\nstudio :7250: running\\n' ;;
      *pane_id*) printf '%%0\\n%%1\\n' ;;
      *) if [ -f "$STATE_DIR/interrupted" ] || [ -f "$STATE_DIR/all_dead" ]; then printf '1\\n1\\n'; else printf '0\\n0\\n'; fi ;;
    esac ;;
esac`);
  stub(bin, "npm", `echo "npm $* STUDIO_ENABLED=\${STUDIO_ENABLED:-unset}" >> "$CALLS_LOG"`);
  stub(bin, "pg_isready", `echo "pg_isready $*" >> "$CALLS_LOG"; [ ! -f "$STATE_DIR/pg_down" ]`);
  stub(bin, "psql", `[ ! -f "$STATE_DIR/no_database" ]`);
  stub(bin, "lsof", `[ -n "$BUSY_PORT" ] || exit 1
case "$*" in *":$BUSY_PORT "*|*":$BUSY_PORT") echo "node 1 you 20u IPv4 TCP *:$BUSY_PORT (LISTEN)" ;; *) exit 1 ;; esac`);
  stub(bin, "claude", "exit 0");

  const calls = () => readFileSync(log, "utf8").split("\n").filter(Boolean);
  const run = (args = [], { env = {}, tmux = join(bin, "tmux") } = {}) => {
    const ran = spawnSync("/bin/bash", [SCRIPT, ...args], {
      encoding: "utf8",
      env: {
        // Built from nothing: the developer's own STUDIO_* and DATABASE_URL
        // must not leak in. node is the test runner's, for the version check.
        PATH: `${bin}:${dirname(process.execPath)}:/usr/bin:/bin`,
        HOME: dir,
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
  const flag = (name) => writeFileSync(join(state, name), "");
  return { root, bin, run, flag, calls };
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
    const { run } = sandbox();
    const ran = run(["start", "--detach", "--no-checks"]);
    expect(ran.code).toBe(0);
    const [created] = tmuxCall(ran.calls, "new-session");
    expect(created).toContain("-d -s self-learn");
    expect(created).toContain("npm run dev");
    expect(created).toContain("STUDIO_ENABLED=1");
    expect(created).toContain("PATH=");
    const [split] = tmuxCall(ran.calls, "split-window");
    expect(split).toContain("npm run studio");
    expect(split).toContain("STUDIO_ENABLED=1");
    expect(ran.out).toContain("http://localhost:19001/studio");
    // A pane that exits must stay on screen with its error.
    expect(ran.calls.some((c) => c.includes("remain-on-exit on"))).toBe(true);
  });

  it("is what runs with no command at all", () => {
    const { run } = sandbox();
    const ran = run(["--detach", "--no-checks"]);
    expect(tmuxCall(ran.calls, "new-session")).toHaveLength(1);
  });

  it("attaches unless told not to, and switches client when already inside tmux", () => {
    const attached = sandbox().run(["--no-checks"]);
    expect(tmuxCall(attached.calls, "attach-session")[0]).toContain("-t =self-learn");
    const detached = sandbox().run(["--no-checks", "--detach"]);
    expect(tmuxCall(detached.calls, "attach-session")).toEqual([]);
    const inside = sandbox().run(["--no-checks"], { env: { TMUX: "/tmp/tmux-1/default,1,0" } });
    expect(tmuxCall(inside.calls, "switch-client")).toHaveLength(1);
    expect(tmuxCall(inside.calls, "attach-session")).toEqual([]);
  });

  it("with --no-studio runs one pane and switches Studio off", () => {
    const { run } = sandbox();
    const ran = run(["--detach", "--no-checks", "--no-studio"]);
    expect(tmuxCall(ran.calls, "split-window")).toEqual([]);
    expect(tmuxCall(ran.calls, "new-session")[0]).toContain("STUDIO_ENABLED=0");
    expect(ran.out).not.toContain("/studio");
  });

  it("hands the panes PATH and the variables the processes read, and nothing else", () => {
    const { run } = sandbox();
    const ran = run(["--detach", "--no-checks"], {
      env: { STUDIO_DAILY_USD: "3", DATABASE_URL: "postgres://localhost/other", SECRET_THING: "nope" },
    });
    for (const verb of ["new-session", "split-window"]) {
      const [call] = tmuxCall(ran.calls, verb);
      expect(call).toContain("STUDIO_DAILY_USD=3");
      expect(call).toContain("DATABASE_URL=postgres://localhost/other");
      expect(call).not.toContain("SECRET_THING");
    }
  });

  it("reuses a session that is already up instead of starting a second one", () => {
    const { run, flag } = sandbox();
    flag("session");
    const ran = run(["--no-checks"]);
    expect(ran.out).toContain("already running in tmux session 'self-learn'");
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

  it("asks pg_isready about the database .env.local names, and hides its password", () => {
    const url = "postgres://catalog:hunter2@db.example:5433/learn";
    const envFile = `DATABASE_URL=${url}\nOWNER_PASSWORD=pw\nAUTH_SECRET=s\n`;
    expect(sandbox({ envFile }).run(["--detach"]).calls).toContain(`pg_isready -q -d ${url}`);
    // Separate sandbox: a first start leaves a session, and a second run
    // would reuse it without checking anything.
    const refused = sandbox({ envFile });
    refused.flag("pg_down");
    const down = refused.run(["--detach"]);
    expect(down.code).toBe(1);
    expect(down.err).toContain("brew services start postgresql@17");
    expect(down.err).toContain("postgres://***@db.example:5433/learn");
    expect(down.err).not.toContain("hunter2");
  });

  it("uses DATABASE_URL from the environment before the file, and the Homebrew default last", () => {
    const { run } = sandbox({ envFile: "DATABASE_URL=postgres://file/db\nOWNER_PASSWORD=pw\nAUTH_SECRET=s\n" });
    expect(run(["--detach"], { env: { DATABASE_URL: "postgres://env/db" } }).calls).toContain(
      "pg_isready -q -d postgres://env/db",
    );
    expect(sandbox().run(["--detach"]).calls).toContain("pg_isready -q -d postgres://localhost:5432/self_learn");
  });

  it("says to createdb when Postgres is up but the database is not there", () => {
    const { run, flag } = sandbox();
    flag("no_database");
    const ran = run(["--detach"]);
    expect(ran.code).toBe(1);
    expect(ran.err).toContain("createdb self_learn");
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
    const { run, root } = sandbox();
    expect(run(["--detach"]).err).toContain("tools/tldrawkc is not built");
    expect(run(["--detach", "--no-studio"]).err).not.toContain("tldrawkc");
    mkdirSync(join(root, "tools", "tldrawkc", "dist"), { recursive: true });
    expect(run(["--detach"]).err).not.toContain("tldrawkc");
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
    const { run, flag } = sandbox({ nodeModules: false });
    flag("pg_down");
    const ran = run(["--detach", "--no-checks"]);
    expect(ran.code).toBe(0);
    expect(ran.calls.some((c) => c.startsWith("pg_isready"))).toBe(false);
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
  });
});
