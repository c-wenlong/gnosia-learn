#!/bin/bash
# Build "Gnosia Web.app" and install it to /Applications, replacing whatever
# copy is there. Quits a running instance first — replacing the bundle from
# under a live process corrupts the copy it is running, and a graceful quit
# also lets the shell stop the web server and the studio runner it owns.
set -euo pipefail

cd "$(dirname "$0")/.."

if pgrep -x GnosiaWeb >/dev/null; then
  osascript -e 'tell application "Gnosia Web" to quit' 2>/dev/null || true
  for _ in 1 2 3 4 5; do
    pgrep -x GnosiaWeb >/dev/null || break
    sleep 1
  done
fi
# A force-kill is not a fallback here: the shell stops its owned children
# (the web server, the studio runner) only through AppKit's terminate
# notification, which a POSIX signal never fires — pkill would orphan them,
# and a healthy orphan gets adopted by the relaunched copy still running
# its pre-merge code.
if pgrep -x GnosiaWeb >/dev/null; then
  echo "Gnosia Web did not quit — close it by hand and re-run." >&2
  exit 1
fi

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

APP='.build/Gnosia Web.app'
DEST='/Applications/Gnosia Web.app'

# Copy beside the target first: deleting the installed app before its
# replacement exists turns a failed or interrupted copy into no app at all.
rm -rf "$DEST.new"
ditto "$APP" "$DEST.new"
rm -rf "$DEST.old"
[ -d "$DEST" ] && mv "$DEST" "$DEST.old"
mv "$DEST.new" "$DEST"
rm -rf "$DEST.old"

echo "Installed $DEST — launch it from Applications or Spotlight."
