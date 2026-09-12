#!/bin/bash

set -euo pipefail

GREEN=$'\033[32m'
RESET=$'\033[0m'

color_enabled() {
  [ -z "${NO_COLOR+x}" ] && [ -z "${CI+x}" ] && [ -t "$1" ]
}

success() {
  if color_enabled 1; then
    printf '%s[OK]%s %s\n' "$GREEN" "$RESET" "$1"
  else
    printf '[OK] %s\n' "$1"
  fi
}

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

node "$SCRIPT_DIR/validate-metadata.mjs" \
  "$ROOT_DIR/src/metadata.json" \
  "$ROOT_DIR/package.json" \
  "$ROOT_DIR/src/schemas"
success "metadata validation passed"

glib-compile-schemas --strict --dry-run "$ROOT_DIR/src/schemas"
success "GSettings schema validation passed"

bash -n \
  "$ROOT_DIR/scripts/build.sh" \
  "$ROOT_DIR/scripts/validate.sh" \
  "$ROOT_DIR/scripts/validate-package.sh"
success "Shell syntax validation passed"
