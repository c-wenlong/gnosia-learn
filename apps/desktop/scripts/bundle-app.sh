#!/bin/bash
# Bundle .build/release/GnosiaWeb into .build/"Gnosia Web.app" — Info.plist
# plus the brand .icns shared with apps/macos. The shell has no SwiftPM
# resources of its own; everything it renders comes from the server it
# spawns. Adhoc-signed like the native bundle.
set -euo pipefail

cd "$(dirname "$0")/.."

APP='.build/Gnosia Web.app'
CONTENTS="$APP/Contents"
MARK=../macos/Sources/Gnosia/AppIcon.png

swift build -c release

rm -rf "$APP"
mkdir -p "$CONTENTS/MacOS" "$CONTENTS/Resources"

cp .build/release/GnosiaWeb "$CONTENTS/MacOS/GnosiaWeb"

# Icon: the brand mark at every required size, same source as apps/macos.
ICONSET=$(mktemp -d)/AppIcon.iconset
mkdir -p "$ICONSET"
for size in 16 32 128 256 512; do
  sips -z "$size" "$size" "$MARK" --out "$ICONSET/icon_${size}x${size}.png" >/dev/null
  sips -z "$((size * 2))" "$((size * 2))" "$MARK" --out "$ICONSET/icon_${size}x${size}@2x.png" >/dev/null
done
iconutil -c icns "$ICONSET" -o "$CONTENTS/Resources/AppIcon.icns"
rm -rf "$(dirname "$ICONSET")"

# The repo this bundle serves: baked in so the installed app finds the
# checkout without GNOSIA_REPO being set in the environment.
REPO_ROOT=$(cd ../.. && pwd)
# XML-escape: a path containing & or < would corrupt the plist.
REPO_ROOT_XML=$(printf '%s' "$REPO_ROOT" | sed -e 's/&/\&amp;/g' -e 's/</\&lt;/g' -e 's/>/\&gt;/g' -e 's/"/\&quot;/g' -e "s/'/\&apos;/g")

cat > "$CONTENTS/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CFBundleExecutable</key><string>GnosiaWeb</string>
    <key>CFBundleIdentifier</key><string>app.gnosia.web</string>
    <key>CFBundleName</key><string>Gnosia Web</string>
    <key>CFBundleDisplayName</key><string>Gnosia</string>
    <key>CFBundlePackageType</key><string>APPL</string>
    <key>CFBundleVersion</key><string>1</string>
    <key>CFBundleShortVersionString</key><string>0.1.0</string>
    <key>CFBundleIconFile</key><string>AppIcon</string>
    <key>LSMinimumSystemVersion</key><string>14.0</string>
    <key>NSHighResolutionCapable</key><true/>
    <key>NSPrincipalClass</key><string>NSApplication</string>
    <key>LSEnvironment</key>
    <dict>
        <key>GNOSIA_REPO</key><string>$REPO_ROOT_XML</string>
    </dict>
</dict>
</plist>
PLIST

codesign --sign - --force --deep "$APP" 2>/dev/null || true

echo "Built $APP — open it or copy it to /Applications."
