#!/bin/bash
# Build the Safari extension Xcode project from the Chrome extension source.
# Usage: ./build-safari.sh [--prod]
#
# Builds dist-dev by default. With --prod, builds dist-prod.
# Reads SAFARI_XCODE_DIR, SAFARI_BUNDLE_ID, SAFARI_APP_NAME from .env.dev/.env.prod.

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

# Load Safari config from the appropriate env file
if [ "$1" = "--prod" ]; then
  ENV_FILE="$SCRIPT_DIR/.env.prod"
else
  ENV_FILE="$SCRIPT_DIR/.env.dev"
fi

# Read Safari-specific vars from env file (expand $HOME in values)
get_env() { local val; val="$(grep "^$1=" "$ENV_FILE" | cut -d= -f2-)"; eval echo "$val"; }
XCODE_DIR="$(get_env SAFARI_XCODE_DIR)"
BUNDLE_ID="$(get_env SAFARI_BUNDLE_ID)"
APP_NAME="$(get_env SAFARI_APP_NAME)"

if [ -z "$XCODE_DIR" ] || [ -z "$BUNDLE_ID" ] || [ -z "$APP_NAME" ]; then
  echo "Error: Missing SAFARI_XCODE_DIR, SAFARI_BUNDLE_ID, or SAFARI_APP_NAME in $ENV_FILE"
  exit 1
fi

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
XCODE_PARENT="$(dirname "$XCODE_DIR")"
xcrun safari-web-extension-converter "$DIST_DIR/" \
  --project-location "$XCODE_PARENT" \
  --app-name "$APP_NAME" \
  --bundle-identifier "$BUNDLE_ID" \
  --swift \
  --copy-resources \
  --force \
  --no-open \
  --no-prompt

echo ""
echo "Xcode project created at: $XCODE_DIR"
echo "Open with: open \"$XCODE_DIR/$APP_NAME.xcodeproj\""
