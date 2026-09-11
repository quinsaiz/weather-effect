#!/bin/bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

node -e 'JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"))' \
	"$ROOT_DIR/src/metadata.json"
echo "[OK] metadata.json is valid JSON"

glib-compile-schemas --strict --dry-run "$ROOT_DIR/src/schemas"
echo "[OK] GSettings schema validation passed"

bash -n \
	"$ROOT_DIR/scripts/build.sh" \
	"$ROOT_DIR/scripts/validate.sh" \
	"$ROOT_DIR/scripts/validate-package.sh"
echo "[OK] Shell syntax validation passed"
