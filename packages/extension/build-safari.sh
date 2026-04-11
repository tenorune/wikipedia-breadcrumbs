#!/bin/bash
# Build the Safari extension Xcode project from the Chrome extension source.
# Usage: ./build-safari.sh [--prod]
#
# Builds dist-dev by default. With --prod, builds dist-prod.
# Generates an Xcode project at ~/Desktop/Wikipedia Breadcrumbs/

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

XCODE_DIR="$HOME/Desktop/Wikipedia Breadcrumbs"
BUNDLE_ID="net.lightseed.breadcrumbs"
APP_NAME="Wikipedia Breadcrumbs"

# Build the extension
if [ "$1" = "--prod" ]; then
  echo "Building prod extension..."
  pnpm build:prod
  DIST_DIR="$SCRIPT_DIR/dist-prod"
else
  echo "Building dev extension..."
  pnpm build:dev
  DIST_DIR="$SCRIPT_DIR/dist-dev"
fi

# Remove previous Xcode project
rm -rf "$XCODE_DIR"

# Convert to Safari Xcode project (macOS + iOS)
echo "Converting to Safari extension..."
xcrun safari-web-extension-converter "$DIST_DIR/" \
  --project-location "$HOME/Desktop" \
  --app-name "$APP_NAME" \
  --bundle-identifier "$BUNDLE_ID" \
  --swift \
  --no-open \
  --no-prompt

echo ""
echo "Xcode project created at: $XCODE_DIR"
echo "Open with: open \"$XCODE_DIR/$APP_NAME.xcodeproj\""
