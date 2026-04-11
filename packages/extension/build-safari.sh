#!/bin/bash
# Build the Safari extension Xcode project from the Chrome extension source.
# Usage: ./build-safari.sh [--prod]
#
# Builds dist-dev by default. With --prod, builds dist-prod.
# Generates an Xcode project at ~/Desktop/Wikipedia Breadcrumbs/

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
XCODE_DIR="${XCODE_DIR:-$HOME/Desktop/Wikipedia Breadcrumbs}"
BUNDLE_ID="${BUNDLE_ID:-net.lightseed.breadcrumbs}"
APP_NAME="${APP_NAME:-Wikipedia Breadcrumbs}"

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
  --force \
  --no-open \
  --no-prompt

echo ""
echo "Xcode project created at: $XCODE_DIR"
echo "Open with: open \"$XCODE_DIR/$APP_NAME.xcodeproj\""
