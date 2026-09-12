#!/bin/bash

set -euo pipefail

GREEN=$'\033[32m'
RED=$'\033[31m'
BLUE=$'\033[34m'
RESET=$'\033[0m'

color_enabled() {
	[ -z "${NO_COLOR+x}" ] && [ -z "${CI+x}" ] && [ -t "$1" ]
}

info() {
	if color_enabled 1; then
		printf '%s[INFO]%s %s\n' "$BLUE" "$RESET" "$1"
	else
		printf '[INFO] %s\n' "$1"
	fi
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
	exit 1
}

SCRIPT_PATH="$(readlink -f -- "${BASH_SOURCE[0]}")"
SCRIPT_DIR="$(dirname -- "$SCRIPT_PATH")"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd -P)"
DIST_DIR="$ROOT_DIR/dist"
SRC_DIR="$ROOT_DIR/src"
SCHEMAS_DIR="$SRC_DIR/schemas"
RELEASE_DIR="$ROOT_DIR/build"

check_generated_paths() {
	if [ -z "$ROOT_DIR" ] || [ "$ROOT_DIR" = "/" ]; then
		error "Refusing to clean unexpected build paths"
	fi

	local canonical_dist canonical_build
	canonical_dist="$(realpath -m -- "$DIST_DIR")"
	canonical_build="$(realpath -m -- "$RELEASE_DIR")"

	if [ "$canonical_dist" != "$ROOT_DIR/dist" ] || [ "$canonical_build" != "$ROOT_DIR/build" ]; then
		error "Refusing to clean unexpected build paths"
	fi
}

clean_generated() {
	check_generated_paths
	rm -rf -- "$DIST_DIR" "$RELEASE_DIR"
}

find_package() {
	local archives=()

	shopt -s nullglob
	archives=("$RELEASE_DIR"/*.shell-extension.zip)
	shopt -u nullglob

	if [ "${#archives[@]}" -ne 1 ]; then
		error "Expected exactly one extension archive in $RELEASE_DIR; found ${#archives[@]}"
	fi

	printf '%s\n' "${archives[0]}"
}

validate_package() {
	local package
	package="$(find_package)"
	"$SCRIPT_DIR/validate-package.sh" "$package"
}

build_extension() {
	check_generated_paths
	rm -rf -- "$RELEASE_DIR"
	trap 'clean_generated' EXIT

	local tmp_pack="$RELEASE_DIR/tmp_pack"
	local package
	mkdir -p "$tmp_pack"

	info "Copying JS files from dist..."
	cp -r "$DIST_DIR/"* "$tmp_pack/" || error "Failed to copy JS files"

	info "Copying metadata.json..."
	cp "$SRC_DIR/metadata.json" "$tmp_pack/" || error "Failed to copy metadata.json"

	info "Copying schemas..."
	if [ ! -d "$SCHEMAS_DIR" ]; then
		error "Schemas directory not found: $SCHEMAS_DIR"
	fi
	glib-compile-schemas --strict --dry-run "$SCHEMAS_DIR"
	mkdir -p "$tmp_pack/schemas"
	cp -r "$SCHEMAS_DIR/"* "$tmp_pack/schemas/" || error "Failed to copy schema files"

	info "Packing extension..."
	if command -v gnome-extensions >/dev/null 2>&1; then
		gnome-extensions pack "$tmp_pack" \
			-f \
			-o "$RELEASE_DIR" \
			--extra-source="lib"
	else
		error "gnome-extensions not found. Please install it."
	fi

	package="$(find_package)"
	"$SCRIPT_DIR/validate-package.sh" "$package"
	rm -rf -- "$tmp_pack" "$DIST_DIR"
	trap - EXIT
	success "Extension packed successfully: $package"
}

install_extension() {
	local package
	package="$(find_package)"
	"$SCRIPT_DIR/validate-package.sh" "$package"

	info "Installing extension..."
	if ! gnome-extensions install --force "$package"; then
		error "Failed to install extension!"
	fi
	success "Extension installed successfully! Restart GNOME Shell."
}

uninstall_extension() {
	if ! command -v gnome-extensions >/dev/null 2>&1; then
		error "gnome-extensions not found. Please install it."
	fi

	info "Uninstalling extension..."
	if ! gnome-extensions uninstall weather-effect@quinsaiz.github; then
		error "Failed to uninstall extension!"
	fi
	success "Extension uninstalled successfully! Restart GNOME Shell."
}

reset_settings() {
	if ! command -v dconf >/dev/null 2>&1; then
		error "dconf not found. Please install it."
	fi

	info "Resetting Weather Effect settings..."
	if ! dconf reset -f /org/gnome/shell/extensions/weather-effect/; then
		error "Failed to reset Weather Effect settings!"
	fi
	success "Weather Effect settings reset successfully!"
}

case "${1:-}" in
clean | --clean)
	clean_generated
	;;
pack | --pack | "")
	build_extension
	;;
validate-package | --validate-package)
	validate_package
	;;
install | -i | --install)
	install_extension
	;;
uninstall | -u | --uninstall)
	uninstall_extension
	;;
reset-settings | --reset-settings)
	reset_settings
	;;
*)
	if color_enabled 1; then
		printf '%sUsage:%s %s [--clean | --pack | --validate-package | --install | --uninstall | --reset-settings]\n' \
			"$RED" "$RESET" "$0"
	else
		printf 'Usage: %s [--clean | --pack | --validate-package | --install | --uninstall | --reset-settings]\n' "$0"
	fi
	exit 1
	;;
esac
