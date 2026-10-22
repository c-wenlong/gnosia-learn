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
  # Still up after a graceful quit — take it down.
  pkill -x GnosiaWeb 2>/dev/null || true
fi

bash scripts/bundle-app.sh

APP='.build/Gnosia Web.app'
DEST='/Applications/Gnosia Web.app'

rm -rf "$DEST"
ditto "$APP" "$DEST"

echo "Installed $DEST — launch it from Applications or Spotlight."
