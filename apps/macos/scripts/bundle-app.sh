#!/bin/bash
# Bundle .build/release/Gnosia into .build/Gnosia.app — Info.plist, the
# SwiftPM resource bundle, and an .icns built from Resources/mark.png.
# Adhoc-signed so Finder launches it without the unidentified-developer
# path; distribution signing is a separate decision.
set -euo pipefail

cd "$(dirname "$0")/.."

APP=.build/Gnosia.app
CONTENTS="$APP/Contents"
MARK=Sources/Gnosia/AppIcon.png

swift build -c release

rm -rf "$APP"
mkdir -p "$CONTENTS/MacOS" "$CONTENTS/Resources"

cp .build/release/Gnosia "$CONTENTS/MacOS/Gnosia"
cp -R .build/release/Gnosia_Gnosia.bundle "$CONTENTS/Resources/"

# Icon: the brand mark at every required size.
ICONSET=$(mktemp -d)/AppIcon.iconset
mkdir -p "$ICONSET"
for size in 16 32 128 256 512; do
  sips -z "$size" "$size" "$MARK" --out "$ICONSET/icon_${size}x${size}.png" >/dev/null
  sips -z "$((size * 2))" "$((size * 2))" "$MARK" --out "$ICONSET/icon_${size}x${size}@2x.png" >/dev/null
done
iconutil -c icns "$ICONSET" -o "$CONTENTS/Resources/AppIcon.icns"
rm -rf "$(dirname "$ICONSET")"

cat > "$CONTENTS/Info.plist" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CFBundleExecutable</key><string>Gnosia</string>
    <key>CFBundleIdentifier</key><string>app.gnosia.local</string>
    <key>CFBundleName</key><string>Gnosia</string>
    <key>CFBundleDisplayName</key><string>Gnosia</string>
    <key>CFBundlePackageType</key><string>APPL</string>
    <key>CFBundleVersion</key><string>1</string>
    <key>CFBundleShortVersionString</key><string>0.1.0</string>
    <key>CFBundleIconFile</key><string>AppIcon</string>
    <key>LSMinimumSystemVersion</key><string>14.0</string>
    <key>NSHighResolutionCapable</key><true/>
    <key>NSPrincipalClass</key><string>NSApplication</string>
</dict>
</plist>
PLIST

codesign --sign - --force --deep "$APP" 2>/dev/null || true

echo "Built $APP — open it or copy it to /Applications."
