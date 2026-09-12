#!/bin/bash

set -euo pipefail

GREEN=$'\033[32m'
RED=$'\033[31m'
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

error() {
	if color_enabled 2; then
		printf '%s[ERROR]%s %s\n' "$RED" "$RESET" "$1" >&2
	else
		printf '[ERROR] %s\n' "$1" >&2
	fi
}

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

if [ "$#" -ne 1 ]; then
	printf 'Usage: %s EXTENSION_ZIP\n' "$0" >&2
	exit 1
fi

PACKAGE="$1"

if [ ! -f "$PACKAGE" ] || [ -L "$PACKAGE" ]; then
	error "Extension package is not a regular file: $PACKAGE"
	exit 1
fi

unzip -tq "$PACKAGE"
PACKAGE_CONTENTS="$(unzip -Z1 "$PACKAGE")"

DUPLICATE_ENTRIES="$(printf '%s\n' "$PACKAGE_CONTENTS" | sort | uniq -d)"
if [ -n "$DUPLICATE_ENTRIES" ]; then
	error "Duplicate package entries:"
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
	error "Required schema sources are missing"
	exit 1
fi

for module in "${PRODUCTION_MODULES[@]}"; do
	if [ ! -f "$ROOT_DIR/src/lib/$module.ts" ]; then
		error "Required production source is missing: src/lib/$module.ts"
		exit 1
	fi
	EXPECTED_ENTRIES+=("lib/$module.js")
done

for source in "${SCHEMA_SOURCES[@]}"; do
	EXPECTED_ENTRIES+=("schemas/$(basename "$source")")
done

for entry in "${EXPECTED_ENTRIES[@]}"; do
	if ! grep -Fxq "$entry" <<<"$PACKAGE_CONTENTS"; then
		error "Required package entry is missing: $entry"
		exit 1
	fi
done

while IFS= read -r entry; do
	if ! printf '%s\n' "${EXPECTED_ENTRIES[@]}" | grep -Fxq "$entry"; then
		error "Unexpected package entry: $entry"
		exit 1
	fi
done <<<"$PACKAGE_CONTENTS"

if ! unzip -p "$PACKAGE" metadata.json | cmp -s - "$ROOT_DIR/src/metadata.json"; then
	error "Packaged metadata.json does not match the source"
	exit 1
fi

for source in "${SCHEMA_SOURCES[@]}"; do
	entry="schemas/$(basename "$source")"
	if ! unzip -p "$PACKAGE" "$entry" | cmp -s - "$source"; then
		error "Packaged schema does not match the source: $entry"
		exit 1
	fi
done

success "Extension package contains all required files: $PACKAGE"
