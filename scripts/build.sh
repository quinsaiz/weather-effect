#!/bin/bash

set -euo pipefail

GREEN="\e[32m"
RED="\e[31m"
BLUE="\e[34m"
RESET="\e[0m"

info() { echo -e "${BLUE}[INFO]${RESET} $1"; }
success() { echo -e "${GREEN}[OK]${RESET} $1"; }
error() {
	echo -e "${RED}[ERROR]${RESET} $1" >&2
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
	info "Uninstalling extension..."
	gnome-extensions uninstall weather-effect@quinsaiz.github &&
		success "Extension uninstalled successfully! Restart GNOME Shell." ||
		error "Failed to uninstall extension!"
	dconf reset -f /org/gnome/shell/extensions/weather-effect/
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
*)
	echo -e "${RED}Usage:${RESET} $0 [--clean | --pack | --validate-package | --install | --uninstall]"
	exit 1
	;;
esac
