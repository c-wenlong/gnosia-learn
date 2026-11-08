#!/usr/bin/env bash
# Bring a fresh clone or worktree to a runnable state in one run: npm ci for
# every workspace, a starter apps/web/.env.local, the submodule checkouts it
# can reach, the tools/tldrawkc build `npm run canvas` and `npm run e2e` need,
# and a catalog migrate on a scratch file as the sanity check. Idempotent:
# a step that is already done is skipped, so it is safe to run after a pull.
set -euo pipefail

usage() {
  cat <<'EOF'
Usage: scripts/worktree-setup.sh [--with-video-env] [--skip-tldraw] [--help]

Set up a fresh clone or git worktree. Run it once, from anywhere.

  --with-video-env  also build each checked-out video tool's environment:
                    manimkc's .venv (uv, Python 3.13) and narration deps,
                    remotionkc's node_modules and narration deps, revideokc's
                    node_modules (PUPPETEER_SKIP_DOWNLOAD=1) and narration
                    deps, blenderkc's .venv (make deps) and narration deps.
                    Heavy (manim, bpy, the pinned gnosia-audio) and only
                    needed for video work. Needs uv on PATH and, for the three
                    private submodules, access to them.
  --skip-tldraw     leave tools/tldrawkc alone: `npm run canvas` then has no
                    dist/ to run and `npm run e2e` no playwright-core to
                    borrow, but the app, lint, typecheck and tests need
                    neither.
  -h, --help        show this help and exit

What it does, in order: checks Node (>= 22, the engines floor), runs `npm ci`
when node_modules is missing or older than the manifests, writes
apps/web/.env.local from .env.example with a generated AUTH_SECRET when none
exists, `git submodule update --init` for each of the five submodules (the
three private video tools degrade to a warning without access), `npm ci` and
`npm run build` inside tools/tldrawkc when present and stale, and migrates a
scratch catalog file under the OS temp directory as the sanity check. It
never touches ~/.gnosia or the real catalog.
EOF
}

die() { printf 'worktree-setup: %s\n' "$*" >&2; exit 1; }
warn() { printf '  ! %s\n' "$*" >&2; }
say() { printf '%s\n' "$*"; }

script_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$script_root"

video_env=0
skip_tldraw=0
for arg in "$@"; do
  case "$arg" in
    --with-video-env) video_env=1 ;;
    --skip-tldraw) skip_tldraw=1 ;;
    -h|--help) usage; exit 0 ;;
    *) printf 'worktree-setup: unknown argument: %s\n\n' "$arg" >&2; usage >&2; exit 2 ;;
  esac
done

# ------------------------------------------------------------------ toolchain
major="$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)"
[ "$major" -ge 22 ] || die "Node 22 or newer is required (found $major)"
command -v npm >/dev/null 2>&1 || die "npm is not on PATH"
command -v git >/dev/null 2>&1 || die "git is not on PATH"

# ------------------------------------------------------------------- npm ci
# node_modules/.package-lock.json is the marker npm itself writes on install;
# a manifest or the lockfile newer than it means the tree is out of date.
needs_install=1
installed_lock=node_modules/.package-lock.json
if [ -f "$installed_lock" ]; then
  needs_install=0
  for manifest in package.json package-lock.json \
                  apps/*/package.json packages/*/package.json services/*/package.json; do
    if [ "$manifest" -nt "$installed_lock" ]; then needs_install=1; break; fi
  done
fi
if [ "$needs_install" = 1 ]; then
  say "npm ci (a minute or two on a cold cache)"
  npm ci
else
  say "node_modules is current; skipping npm ci"
fi

# ----------------------------------------------------------------- .env.local
# Next reads .env files only from the directory it starts in, which is
# apps/web/. AUTH_SECRET is generated because it only has to be long and
# stable; OWNER_PASSWORD stays blank because the file's comments ask for a
# real choice, and dev.sh already warns while it is empty.
if [ ! -f apps/web/.env.local ]; then
  secret="$(node -e 'process.stdout.write(require("node:crypto").randomBytes(32).toString("base64"))')"
  sed "s|^AUTH_SECRET=.*|AUTH_SECRET=$secret|" .env.example > apps/web/.env.local
  say "wrote apps/web/.env.local from .env.example with a generated AUTH_SECRET"
  warn "OWNER_PASSWORD is still blank, so nobody can sign in until it is set"
else
  say "apps/web/.env.local exists; leaving it alone"
fi

# ------------------------------------------------------------------ submodules
# The app, the tests and the seed import all work with the three private
# video tools missing (README.md, Install), so a fetch that fails is a
# warning, not a stop. GIT_TERMINAL_PROMPT=0 keeps an auth question from
# hanging a non-interactive run; it fails fast instead.
for name in tldrawkc blenderkc manimkc remotionkc revideokc; do
  path="tools/$name"
  recursive=""
  [ "$name" = manimkc ] && recursive="--recursive"   # manim is nested inside it
  if GIT_TERMINAL_PROMPT=0 git submodule update --init $recursive "$path" >/dev/null 2>&1; then
    say "$path ready"
  elif [ "$name" = tldrawkc ] || [ "$name" = blenderkc ]; then
    warn "could not fetch $path; it is public, so this is a network problem"
  else
    warn "could not fetch $path (a private repository; fine on machines without access)"
  fi
done

# ------------------------------------------------------------------- tldrawkc
# `npm run canvas` executes tools/tldrawkc/dist/, which is build output and is
# not committed, and `npm run e2e` borrows playwright-core from its
# node_modules. Both came out of session failures, so a stale tree is rebuilt
# rather than trusted.
tldraw=tools/tldrawkc
if [ "$skip_tldraw" = 1 ]; then
  say "skipping $tldraw (--skip-tldraw)"
elif [ ! -e "$tldraw/.git" ]; then
  warn "$tldraw is not checked out; npm run canvas and npm run e2e will not work"
else
  t_needs_install=1
  if [ -f "$tldraw/node_modules/.package-lock.json" ]; then
    t_needs_install=0
    for manifest in "$tldraw/package.json" "$tldraw/package-lock.json"; do
      if [ "$manifest" -nt "$tldraw/node_modules/.package-lock.json" ]; then
        t_needs_install=1; break
      fi
    done
  fi
  if [ "$t_needs_install" = 1 ]; then
    say "npm ci in $tldraw (installs the playwright-core npm run e2e borrows)"
    (cd "$tldraw" && npm ci)
  fi

  # A rebuild is needed when the CLI output is absent or older than the
  # sources it compiles. Behaviour, not a timestamp alone, still decides:
  # `npm run --silent canvas -- doctor` below says what the build found.
  needs_build=1
  if [ -f "$tldraw/dist/cli/index.js" ]; then
    needs_build=0
    for source in "$tldraw/package.json" "$tldraw/tsconfig.json" "$tldraw/vite.config.ts"; do
      if [ "$source" -nt "$tldraw/dist/cli/index.js" ]; then needs_build=1; break; fi
    done
    if [ "$needs_build" = 0 ] &&
       [ -n "$(find "$tldraw/src" -type f -newer "$tldraw/dist/cli/index.js" -print -quit 2>/dev/null)" ]; then
      needs_build=1
    fi
  fi
  if [ "$needs_build" = 1 ]; then
    say "npm run build in $tldraw (dist/ is not committed)"
    (cd "$tldraw" && npm run build)
  else
    say "$tldraw is built; skipping its build"
  fi

  # Informational, never fatal: a missing Chromium is the usual failure and
  # doctor itself names the install for it.
  if ! npm run --silent canvas -- doctor; then
    warn "canvas doctor failed; its fix lines above say what is missing (often a Chromium: cd tools/tldrawkc && npx playwright install chromium)"
  fi
fi

# ----------------------------------------------------------------- video envs
# Opt-in because each is a heavy download and three live in private
# repositories. Each block is the command its own AGENTS.md documents, run
# only when the submodule is checked out; a failure warns and moves on, and
# the tool's own `doctor` is the fix reference.
if [ "$video_env" = 1 ]; then
  command -v uv >/dev/null 2>&1 || \
    warn "uv is not on PATH, so the video tools' .venv steps will fail (https://docs.astral.sh/uv/)"
  if [ -e tools/manimkc/.git ]; then
    say "manimkc: .venv (uv, Python 3.13) + narration-deps"
    (cd tools/manimkc &&
      { [ -x .venv/bin/python ] || uv venv --python 3.13 .venv; } &&
      uv pip install --python .venv/bin/python -e ./manim pydub pyyaml &&
      make narration-deps) || \
      warn "manimkc setup failed; tools/manimkc/tools/cli/manimkc doctor names the fix"
  fi
  if [ -e tools/remotionkc/.git ]; then
    say "remotionkc: npm ci + narration-deps"
    (cd tools/remotionkc && npm ci && npm run narration-deps) || \
      warn "remotionkc setup failed; node tools/remotionkc/tools/cli/remotionkc.mjs doctor names the fix"
  fi
  if [ -e tools/revideokc/.git ]; then
    say "revideokc: PUPPETEER_SKIP_DOWNLOAD=1 npm ci + narration-deps"
    (cd tools/revideokc && PUPPETEER_SKIP_DOWNLOAD=1 npm ci && npm run narration-deps) || \
      warn "revideokc setup failed; node tools/revideokc/tools/cli/revideokc.mjs doctor names the fix"
  fi
  if [ -e tools/blenderkc/.git ]; then
    say "blenderkc: make deps + narration-deps"
    (cd tools/blenderkc && make deps && make narration-deps) || \
      warn "blenderkc setup failed; python3 tools/blenderkc/tools/cli/blenderkc doctor names the fix"
  fi
fi

# --------------------------------------------------------------- sanity check
# The cheapest end-to-end check available: tsx loads the catalog CLI, the
# workspaces resolve, the better-sqlite3 native addon opens a database and
# the migrations apply. A native addon built for another Node version fails
# here, where it names the fix.
scratch="$(mktemp -d "${TMPDIR:-/tmp}/gnosia-setup.XXXXXX")"
trap 'rm -rf "$scratch"' EXIT
say "sanity check: catalog migrate on a scratch database"
if ! CATALOG_DB="$scratch/catalog.db" npm run --silent catalog -- migrate; then
  die "catalog migrate failed on a scratch file; if node_modules was built for another Node version, delete it and re-run this script"
fi

say ""
say "ready. The PR gate is: npm run lint && npm run typecheck && npm test && npm run build"
say "npm test is the long pole (minutes, not seconds); give it a long timeout"
say "or a background run. npm run dev needs OWNER_PASSWORD set in"
say "apps/web/.env.local and a catalog to serve (default ~/.gnosia/catalog.db;"
say "README.md, Install, builds one from seed/)."
