#!/usr/bin/env bash
# Run the web app and the diagram studio's runner together for local work, one
# tmux pane each, after checking what they need. `npm run dev:up` calls this.
set -euo pipefail

usage() {
  cat <<'EOF'
Usage: scripts/dev.sh [start|stop|status] [options]

  start     (default) check what the app needs, then run the web app (:3000)
            and the studio runner (:7250) in one tmux session, a pane each
  stop      stop both and end the session; the runner is interrupted first so
            it can finish what it is writing
  status    say whether the session is up and whether each side answers

Options for start:
  --no-studio   run the web app alone, with Studio switched off
  --detach      create the session without attaching to it
  --no-tmux     run both in this terminal (npm run dev:all) instead
  --no-checks   skip the checks
  -h, --help    show this help

The panes get PATH, DATABASE_URL, PORT, GNOSIA_HOME and STUDIO_* from the
shell that ran this (a variable it does not have is unset for them), because
a tmux server that was already running would otherwise hand them its own
environment. They are passed in a private file the pane reads and deletes, so
a password in DATABASE_URL never appears in a command line. Everything else
belongs in apps/web/.env.local or services/catalog/.env, which the processes
read themselves. STUDIO_ENABLED is set for the web pane here, to 1 or (with
--no-studio) 0, whatever that file says: a runner with nothing proxying to it
is no use, and Studio with no runner behind it only errors.

Environment: DEV_SESSION (tmux session name, default gnosia). Detach with
Ctrl-b d; the session keeps running until `stop`.
EOF
}

die() { printf 'dev.sh: %s\n' "$*" >&2; exit 1; }
warn() { printf '  ! %s\n' "$*" >&2; }
say() { printf '%s\n' "$*"; }

# Overridable so the tests can stand in for tmux and the repository.
TMUX_BIN="${DEV_TMUX_BIN:-tmux}"
script_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
root="${DEV_ROOT:-$script_root}"
cd "$root"
DEV_ENV="$script_root/scripts/lib/dev-env.mjs"

SESSION="${DEV_SESSION:-gnosia}"
WEB_PORT="${PORT:-3000}"
STUDIO_PORT="${STUDIO_PORT:-7250}"

# ------------------------------------------------------------------ arguments
command_name=start
studio=1
attach=1
use_tmux=1
checks=1
seen_command=0
for arg in "$@"; do
  case "$arg" in
    start|stop|status)
      [ "$seen_command" = 0 ] || die "one command at a time (got $arg after $command_name)"
      command_name="$arg"; seen_command=1 ;;
    --no-studio) studio=0 ;;
    --detach) attach=0 ;;
    --no-tmux) use_tmux=0 ;;
    --no-checks) checks=0 ;;
    -h|--help) usage; exit 0 ;;
    *) printf 'dev.sh: unknown argument: %s\n\n' "$arg" >&2; usage >&2; exit 2 ;;
  esac
done

have_tmux() { command -v "$TMUX_BIN" >/dev/null 2>&1; }
session_exists() { "$TMUX_BIN" has-session -t "=$SESSION" 2>/dev/null; }

# Whether any pane of the session still has a process in it. Matched in bash,
# not with a pipe into grep -q, which pipefail can turn into a false answer.
any_pane_alive() {
  local dead
  dead="$("$TMUX_BIN" list-panes -s -t "=$SESSION" -F '#{pane_dead}' 2>/dev/null)" || return 1
  case $'\n'"$dead"$'\n' in
    *$'\n'0$'\n'*) return 0 ;;
  esac
  return 1
}

# The app's configuration as `next dev` reads it (its own env loader, so a
# quoted value or a trailing comment means what it means there), loaded once
# by load_env and then answered from memory. Never printed.
ENV_CACHE=""
load_env() {
  ENV_CACHE="$(node "$DEV_ENV" get "$root/apps/web" DATABASE_URL OWNER_PASSWORD AUTH_SECRET 2>/dev/null)" || ENV_CACHE=""
}
env_value() {
  local line
  while IFS= read -r line; do
    case "$line" in "$1="*) printf '%s\n' "${line#*=}"; return 0 ;; esac
  done <<<"$ENV_CACHE"
  return 0
}

# `pg_isready` and `psql`: PATH first, then PG_BIN, then Homebrew's keg-only
# Postgres 17, which is not on PATH unless linked (scripts/lib/pg.mjs).
pg_tool() {
  local dir
  command -v "$1" 2>/dev/null && return 0
  for dir in "${PG_BIN:-}" /opt/homebrew/opt/postgresql@17/bin /usr/local/opt/postgresql@17/bin; do
    if [ -n "$dir" ] && [ -x "$dir/$1" ]; then printf '%s\n' "$dir/$1"; return 0; fi
  done
  return 1
}

port_busy() {
  command -v lsof >/dev/null 2>&1 && lsof -nP -iTCP:"$1" -sTCP:LISTEN >/dev/null 2>&1
}

# ---------------------------------------------------------------------- checks
# Errors stop the start; warnings say what will not work and carry on.
preflight() {
  local errors=0 major url shown isready psql_bin line conn safe_url
  local -a pgenv=()

  # Without these nothing else can be read or run, so they stop the checks.
  major="$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)"
  [ "$major" -ge 22 ] || die "Node 22 or newer is required (found $major)"
  [ -d node_modules ] || die "node_modules is missing: run npm ci"

  load_env

  url="$(env_value DATABASE_URL)"
  url="${url:-postgres://localhost:5432/gnosia}"
  shown="$(printf '%s' "$url" | sed -E 's#://[^@/]*@#://***@#')"
  # The URL goes to pg_isready and psql with its password taken out; libpq
  # reads that from PGPASSWORD, so the secret is never an argument that `ps`
  # would show.
  if ! conn="$(node "$DEV_ENV" pg "$url" 2>/dev/null)"; then
    warn "DATABASE_URL ($shown) is not a postgres URL, so Postgres was not checked"
  elif isready="$(pg_tool pg_isready)"; then
    while IFS= read -r line; do
      case "$line" in
        URL=*) safe_url="${line#URL=}" ;;
        PGPASSWORD=*) pgenv+=("$line") ;;
      esac
    done <<<"$conn"
    if ! env ${pgenv[@]+"${pgenv[@]}"} "$isready" -q -d "$safe_url" 2>/dev/null; then
      warn "Postgres is not accepting connections at $shown (brew services start postgresql@17)"
      errors=1
    elif psql_bin="$(pg_tool psql)" && ! env ${pgenv[@]+"${pgenv[@]}"} "$psql_bin" -d "$safe_url" -Atqc 'select 1' >/dev/null 2>&1; then
      warn "cannot open the database at $shown: createdb gnosia, then npm run catalog -- migrate (README, Install)"
      errors=1
    fi
  else
    warn "no pg_isready on PATH or in Homebrew's postgresql@17, so Postgres was not checked"
  fi

  if [ -z "$(env_value OWNER_PASSWORD)" ] || [ -z "$(env_value AUTH_SECRET)" ]; then
    warn "OWNER_PASSWORD or AUTH_SECRET is not set in apps/web/.env.local, so nobody can sign in (see .env.example)"
  fi

  if [ "$studio" = 1 ]; then
    if [ ! -d tools/tldrawkc/dist ]; then
      warn "tools/tldrawkc is not built, so diagram jobs will be refused: git submodule update --init tools/tldrawkc && (cd tools/tldrawkc && npm ci && npm run build)"
    fi
    command -v claude >/dev/null 2>&1 || warn "no claude CLI on PATH, so the studio's agent cannot run"
  fi

  # Ports are only worth a word when this script did not start what holds them.
  if ! session_exists 2>/dev/null; then
    port_busy "$WEB_PORT" && warn "something already listens on :$WEB_PORT; Next will pick another port"
    [ "$studio" = 1 ] && port_busy "$STUDIO_PORT" && warn "something already listens on :$STUDIO_PORT, so the runner will not start"
  fi

  [ "$errors" = 0 ] || die "fix the above, or pass --no-checks"
}

# The command for one pane: a private file of its environment, which it reads
# and deletes before running the process. A tmux server that predates this
# shell would hand a pane its own environment, so the file sets what this
# shell has and unsets what it has not, among the names the processes read.
# It also keeps a password in DATABASE_URL out of every command line.
PANE_FILES=()
PANE_CMD=""
CREATED=0
STARTED=0
# A start that fails part-way must not leave a half-started session, or files
# a pane never read, behind.
cleanup_failed_start() {
  [ "$STARTED" = 1 ] && return 0
  rm -f ${PANE_FILES[@]+"${PANE_FILES[@]}"}
  [ "$CREATED" = 0 ] || "$TMUX_BIN" kill-session -t "=$SESSION" 2>/dev/null || true
}
trap cleanup_failed_start EXIT

# Sets PANE_CMD, rather than printing it, so the file it makes is remembered
# by this shell and not lost in a subshell.
pane_command() { # pane_command <process command...>
  local file name line
  local -a held=()
  file="$(mktemp "${TMPDIR:-/tmp}/gnosia-dev.XXXXXX")" || die "could not create a temporary file"
  PANE_FILES+=("$file")

  # Names a running tmux server holds that this shell may have since dropped.
  while IFS= read -r line; do
    case "$line" in STUDIO_*=*) held+=("${line%%=*}") ;; esac
  done < <("$TMUX_BIN" show-environment -g 2>/dev/null || true)

  {
    printf 'export PATH=%q\n' "$PATH"
    for name in DATABASE_URL PORT GNOSIA_HOME ${held[@]+"${held[@]}"}; do
      case "$name" in STUDIO_ENABLED) continue ;; esac
      if [ -n "${!name+x}" ]; then printf 'export %s=%q\n' "$name" "${!name}"; else printf 'unset %s\n' "$name"; fi
    done
    while IFS='=' read -r name _; do
      case "$name" in
        STUDIO_*) [ "$name" = STUDIO_ENABLED ] || printf 'export %s=%q\n' "$name" "${!name}" ;;
      esac
    done < <(env)
    # Set either way: the process environment wins over apps/web/.env.local.
    if [ "$studio" = 1 ]; then printf 'export STUDIO_ENABLED=1\n'; else printf 'export STUDIO_ENABLED=0\n'; fi
  } > "$file"

  PANE_CMD="$(printf '%q ' bash -c 'set -a; . "$1"; rm -f "$1"; shift; exec "$@"' dev-pane "$file" "$@")"
}

# Failing to attach (no terminal, say, when an agent runs this) leaves a
# working session behind, so it is a hint and not an error.
attach_to_session() {
  if [ -n "${TMUX:-}" ]; then
    "$TMUX_BIN" switch-client -t "=$SESSION" && return 0
  else
    "$TMUX_BIN" attach-session -t "=$SESSION" && return 0
  fi
  say "running, but could not attach from here; attach with: $TMUX_BIN attach -t $SESSION"
}

print_urls() {
  say "web     http://localhost:$WEB_PORT"
  [ "$studio" = 1 ] && say "studio  http://localhost:$WEB_PORT/studio (runner on 127.0.0.1:$STUDIO_PORT)"
  say "attach  $TMUX_BIN attach -t $SESSION      stop  scripts/dev.sh stop"
  return 0
}

# ----------------------------------------------------------------- commands
cmd_start() {
  if [ "$use_tmux" = 1 ] && ! have_tmux; then
    warn "tmux not found, so both run in this terminal (brew install tmux for a pane each)"
    use_tmux=0
  fi

  if [ "$use_tmux" = 0 ]; then
    [ "$checks" = 0 ] || preflight
    if [ "$studio" = 1 ]; then
      export STUDIO_ENABLED=1
      exec npm run dev:all
    fi
    export STUDIO_ENABLED=0
    exec npm run dev
  fi

  if session_exists; then
    if any_pane_alive; then
      say "already running in tmux session '$SESSION' (scripts/dev.sh stop to restart it)"
      [ "$attach" = 0 ] || attach_to_session
      return 0
    fi
    say "tmux session '$SESSION' is left over from a run that has exited; starting afresh"
    "$TMUX_BIN" kill-session -t "=$SESSION"
  fi

  [ "$checks" = 0 ] || preflight

  # Panes are addressed by the id tmux returns, not by index: a user's
  # pane-base-index or base-index would move every index.
  local web_pane studio_pane
  pane_command npm run dev
  web_pane="$("$TMUX_BIN" new-session -d -P -F '#{pane_id}' -s "$SESSION" -c "$root" -n dev "$PANE_CMD")"
  CREATED=1
  # Keep a pane that exited on screen with its error, rather than closing it.
  "$TMUX_BIN" set-option -w -t "=$SESSION:dev" remain-on-exit on
  "$TMUX_BIN" set-option -t "=$SESSION:" mouse on
  "$TMUX_BIN" set-option -w -t "=$SESSION:dev" pane-border-status top
  "$TMUX_BIN" set-option -w -t "=$SESSION:dev" pane-border-format ' #{pane_title} '
  "$TMUX_BIN" select-pane -t "$web_pane" -T "web :$WEB_PORT"
  if [ "$studio" = 1 ]; then
    pane_command npm run studio
    studio_pane="$("$TMUX_BIN" split-window -h -P -F '#{pane_id}' -t "$web_pane" -c "$root" "$PANE_CMD")"
    "$TMUX_BIN" select-pane -t "$studio_pane" -T "studio :$STUDIO_PORT"
  fi
  # The panes delete their files once they have read them.
  STARTED=1

  print_urls
  [ "$attach" = 0 ] || attach_to_session
}

cmd_stop() {
  if ! have_tmux; then
    say "tmux is not installed; Ctrl-C in the terminal running dev:all stops it"
    return 0
  fi
  if ! session_exists; then
    say "nothing running (no tmux session '$SESSION')"
    return 0
  fi

  # Ctrl-C reaches each process as SIGINT. The runner finishes what it is
  # writing on SIGINT or SIGTERM but not on the SIGHUP that ending a session
  # sends, so it is interrupted first and given time, then the session goes.
  local pane waited=0
  for pane in $("$TMUX_BIN" list-panes -s -t "=$SESSION" -F '#{pane_id}'); do
    "$TMUX_BIN" send-keys -t "$pane" C-c
  done
  while any_pane_alive; do
    if [ "$waited" -ge 20 ]; then
      warn "still running after 20s; ending the session anyway"
      break
    fi
    sleep 1
    waited=$((waited + 1))
  done
  "$TMUX_BIN" kill-session -t "=$SESSION"
  say "stopped"
}

# Prints what answers; the exit code says whether the session is up.
cmd_status() {
  if ! have_tmux || ! session_exists; then
    say "not running (no tmux session '$SESSION')"
    return 1
  fi
  "$TMUX_BIN" list-panes -s -t "=$SESSION" \
    -F '#{pane_title}: #{?pane_dead,exited (status #{pane_dead_status}),running}'
  if curl -fsS -o /dev/null -m 3 "http://127.0.0.1:$WEB_PORT/" 2>/dev/null; then
    say "web answers on :$WEB_PORT"
  else
    say "web does not answer on :$WEB_PORT yet"
  fi
  if curl -fsS -o /dev/null -m 3 "http://127.0.0.1:$STUDIO_PORT/api/health" 2>/dev/null; then
    say "runner answers on :$STUDIO_PORT"
  else
    say "runner does not answer on :$STUDIO_PORT"
  fi
}

case "$command_name" in
  start) cmd_start ;;
  stop) cmd_stop ;;
  status) cmd_status ;;
esac
