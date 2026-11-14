#!/bin/bash
# Build "Hermes Web.app" and install it to /Applications, replacing whatever
# copy is there. Quits a running instance first — replacing the bundle from
# under a live process corrupts the copy it is running, and a graceful quit
# also lets the shell stop the web server and the studio runner it owns.
set -euo pipefail

cd "$(dirname "$0")/.."

# The installed process is HermesWeb after this rename, and GnosiaWeb until
# then. Quitting only the new name leaves the old web server and studio
# runner alive, and the new shell adopts them.
quit_running() {
  local process="$1" app="$2"
  if pgrep -x "$process" >/dev/null; then
    osascript -e "tell application \"$app\" to quit" 2>/dev/null || true
    for _ in 1 2 3 4 5; do
      pgrep -x "$process" >/dev/null || break
      sleep 1
    done
  fi
  if pgrep -x "$process" >/dev/null; then
    echo "$app did not quit — close it by hand and re-run." >&2
    exit 1
  fi
}
quit_running HermesWeb "Hermes Web"
quit_running GnosiaWeb "Gnosia Web"
# A force-kill is not a fallback here: the shell stops its owned children
# (the web server, the studio runner) only through AppKit's terminate
# notification, which a POSIX signal never fires — pkill would orphan them,
# and a healthy orphan gets adopted by the relaunched copy still running
# its pre-merge code.


# The quit only tells the shell's children to drain, and they take seconds
# (a job or a doctor check in flight, longer): while the runner still holds
# its port a relaunched copy would adopt a process that is already dying.
# A runner the shell adopted, not owned, stays up by design, so the wait is
# bounded and a holdout only gets noted.
for _ in $(seq 30); do
  lsof -nP -iTCP:7250 -sTCP:LISTEN >/dev/null 2>&1 || break
  sleep 1
done
lsof -nP -iTCP:7250 -sTCP:LISTEN >/dev/null 2>&1 &&
  echo "port 7250 is still held after 30s — an adopted runner stays up by design; continuing." >&2

bash scripts/bundle-app.sh

APP='.build/Hermes Web.app'
DEST='/Applications/Hermes Web.app'
OLD='/Applications/Gnosia Web.app'

# Copy beside the target first: deleting the installed app before its
# replacement exists turns a failed or interrupted copy into no app at all.
rm -rf "$DEST.new"
ditto "$APP" "$DEST.new"
rm -rf "$DEST.old"
[ -d "$DEST" ] && mv "$DEST" "$DEST.old"
mv "$DEST.new" "$DEST"
rm -rf "$DEST.old"
# The replacement is in place. Retire the old bundle only now, so a failed
# copy never leaves the machine with neither app.
rm -rf "$OLD"

echo "Installed $DEST — launch it from Applications or Spotlight."
