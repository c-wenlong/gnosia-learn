#!/bin/bash
# Bundle .build/release/HermesWeb into .build/"Hermes Web.app" — Info.plist
# plus the brand .icns made from Resources/AppIcon.png. The shell has no
# SwiftPM resources of its own; everything it renders comes from the server
# it spawns. Ad hoc signed, and the Info.plist carries the folder usage
# strings macOS shows when the checkout is under Desktop, Documents or
# Downloads.
set -euo pipefail

cd "$(dirname "$0")/.."

APP='.build/Hermes Web.app'
CONTENTS="$APP/Contents"
MARK=Resources/AppIcon.png

swift build -c release

rm -rf "$APP"
mkdir -p "$CONTENTS/MacOS" "$CONTENTS/Resources"

cp .build/release/HermesWeb "$CONTENTS/MacOS/HermesWeb"

# Icon: the brand mark at every required size.
ICONSET=$(mktemp -d)/AppIcon.iconset
mkdir -p "$ICONSET"
for size in 16 32 128 256 512; do
  sips -z "$size" "$size" "$MARK" --out "$ICONSET/icon_${size}x${size}.png" >/dev/null
  sips -z "$((size * 2))" "$((size * 2))" "$MARK" --out "$ICONSET/icon_${size}x${size}@2x.png" >/dev/null
done
iconutil -c icns "$ICONSET" -o "$CONTENTS/Resources/AppIcon.icns"
rm -rf "$(dirname "$ICONSET")"

# The repo this bundle serves: baked in so the installed app finds the
# checkout without HERMES_REPO being set in the environment.
REPO_ROOT=$(cd ../.. && pwd)
# XML-escape: a path containing & or < would corrupt the plist.
REPO_ROOT_XML=$(printf '%s' "$REPO_ROOT" | sed -e 's/&/\&amp;/g' -e 's/</\&lt;/g' -e 's/>/\&gt;/g' -e 's/"/\&quot;/g' -e "s/'/\&apos;/g")

cat > "$CONTENTS/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CFBundleExecutable</key><string>HermesWeb</string>
    <key>CFBundleIdentifier</key><string>app.hermes.web</string>
    <key>CFBundleName</key><string>Hermes Web</string>
    <key>CFBundleDisplayName</key><string>Hermes</string>
    <key>CFBundlePackageType</key><string>APPL</string>
    <key>CFBundleVersion</key><string>1</string>
    <key>CFBundleShortVersionString</key><string>0.1.0</string>
    <key>CFBundleIconFile</key><string>AppIcon</string>
    <key>LSMinimumSystemVersion</key><string>14.0</string>
    <key>NSHighResolutionCapable</key><true/>
    <key>NSPrincipalClass</key><string>NSApplication</string>
    <!-- What macOS shows when it asks to let the app, and the servers it
         spawns, read a checkout under one of these folders. -->
    <key>NSDesktopFolderUsageDescription</key><string>Hermes serves the web app from its checkout, and the checkout is in your Desktop folder.</string>
    <key>NSDocumentsFolderUsageDescription</key><string>Hermes serves the web app from its checkout, and the checkout is in your Documents folder.</string>
    <key>NSDownloadsFolderUsageDescription</key><string>Hermes serves the web app from its checkout, and the checkout is in your Downloads folder.</string>
    <key>LSEnvironment</key>
    <dict>
        <key>HERMES_REPO</key><string>$REPO_ROOT_XML</string>
    </dict>
</dict>
</plist>
PLIST

# A signing failure stops the build: an unsigned bundle is what macOS then
# refuses or keeps asking about.
codesign --sign - --force --deep "$APP"

echo "Built $APP — open it or copy it to /Applications."
