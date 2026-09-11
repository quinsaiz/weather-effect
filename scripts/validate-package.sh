#!/bin/bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

if [ "$#" -ne 1 ]; then
	echo "Usage: $0 EXTENSION_ZIP" >&2
	exit 1
fi

PACKAGE="$1"

if [ ! -f "$PACKAGE" ] || [ -L "$PACKAGE" ]; then
	echo "[ERROR] Extension package is not a regular file: $PACKAGE" >&2
	exit 1
fi

unzip -tq "$PACKAGE"
PACKAGE_CONTENTS="$(unzip -Z1 "$PACKAGE")"

DUPLICATE_ENTRIES="$(printf '%s\n' "$PACKAGE_CONTENTS" | sort | uniq -d)"
if [ -n "$DUPLICATE_ENTRIES" ]; then
	echo "[ERROR] Duplicate package entries:" >&2
	printf '%s\n' "$DUPLICATE_ENTRIES" >&2
	exit 1
fi

EXPECTED_ENTRIES=(
	"extension.js"
	"prefs.js"
	"metadata.json"
	"lib/"
	"schemas/"
)

PRODUCTION_MODULES=(
	"MonitorManager"
	"ObscurationManager"
	"ParticleManager"
	"UIManager"
	"WeatherEffectController"
)

shopt -s nullglob
SCHEMA_SOURCES=("$ROOT_DIR"/src/schemas/*.gschema.xml)
shopt -u nullglob

if [ "${#SCHEMA_SOURCES[@]}" -eq 0 ]; then
	echo "[ERROR] Required schema sources are missing" >&2
	exit 1
fi

for module in "${PRODUCTION_MODULES[@]}"; do
	if [ ! -f "$ROOT_DIR/src/lib/$module.ts" ]; then
		echo "[ERROR] Required production source is missing: src/lib/$module.ts" >&2
		exit 1
	fi
	EXPECTED_ENTRIES+=("lib/$module.js")
done

for source in "${SCHEMA_SOURCES[@]}"; do
	EXPECTED_ENTRIES+=("schemas/$(basename "$source")")
done

for entry in "${EXPECTED_ENTRIES[@]}"; do
	if ! grep -Fxq "$entry" <<<"$PACKAGE_CONTENTS"; then
		echo "[ERROR] Required package entry is missing: $entry" >&2
		exit 1
	fi
done

while IFS= read -r entry; do
	if ! printf '%s\n' "${EXPECTED_ENTRIES[@]}" | grep -Fxq "$entry"; then
		echo "[ERROR] Unexpected package entry: $entry" >&2
		exit 1
	fi
done <<<"$PACKAGE_CONTENTS"

if ! unzip -p "$PACKAGE" metadata.json | cmp -s - "$ROOT_DIR/src/metadata.json"; then
	echo "[ERROR] Packaged metadata.json does not match the source" >&2
	exit 1
fi

for source in "${SCHEMA_SOURCES[@]}"; do
	entry="schemas/$(basename "$source")"
	if ! unzip -p "$PACKAGE" "$entry" | cmp -s - "$source"; then
		echo "[ERROR] Packaged schema does not match the source: $entry" >&2
		exit 1
	fi
done

echo "[OK] Extension package contains all required files: $PACKAGE"
