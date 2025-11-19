#!/bin/bash

set -e

GREEN="\e[32m"
RED="\e[31m"
BLUE="\e[34m"
RESET="\e[0m"

function info()    { echo -e "${BLUE}[INFO]${RESET} $1"; }
function success() { echo -e "${GREEN}[OK]${RESET} $1"; }
function error()   { echo -e "${RED}[ERROR]${RESET} $1"; }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
DIST_DIR="$ROOT_DIR/dist"
SRC_DIR="$ROOT_DIR/src"
SCHEMAS_DIR="$SRC_DIR/schemas"
RELEASE_DIR="$ROOT_DIR/build"
ZIP_NAME="weather-effect@quinsaiz.github.shell-extension.zip"

function build_extension() {
    mkdir -p "$RELEASE_DIR"

    TMP_PACK="$RELEASE_DIR/tmp_pack"
    rm -rf "$TMP_PACK"
    mkdir -p "$TMP_PACK"

    info "Copying JS files from dist..."
    cp -r "$DIST_DIR/"* "$TMP_PACK/" 2>/dev/null || error "Failed to copy JS files"

    info "Copying metadata.json..."
    cp "$SRC_DIR/metadata.json" "$TMP_PACK/" 2>/dev/null || error "Failed to copy metadata.json"

    info "Copying schemas..."
    mkdir -p "$TMP_PACK/schemas"
    if [ -d "$SCHEMAS_DIR" ]; then
        cp -r "$SCHEMAS_DIR/"* "$TMP_PACK/schemas/" 2>/dev/null || error "Failed to copy schema files"
    fi


    info "Packing extension..."
    if command -v gnome-extensions >/dev/null 2>&1; then
        gnome-extensions pack "$TMP_PACK" \
        -f \
        -o "$RELEASE_DIR" \
        --extra-source="lib"
        success "Extension packed successfully: $RELEASE_DIR/$ZIP_NAME"
    else
        error "gnome-extensions not found. Please install it."
        exit 1
    fi

    rm -rf "$TMP_PACK"
}

function install_extension() {
    info "Installing extension..."
    gnome-extensions install --force "$RELEASE_DIR/$ZIP_NAME" \
        && success "Extension installed successfully! Restart GNOME Shell." \
        || error "Failed to install extension!"
}

function uninstall_extension() {
    info "Uninstalling extension..."
    gnome-extensions uninstall weather-effect@quinsaiz.github \
        && success "Extension uninstalled successfully! Restart GNOME Shell." \
        || error "Failed to uninstall extension!"
    dconf reset -f /org/gnome/shell/extensions/weather-effect/
}

case "$1" in
    "" )
        build_extension
        ;;
    install|-i|--install)
        build_extension
        install_extension
        ;;
    uninstall|-u|--uninstall)
        uninstall_extension
        ;;
    *)
        echo -e "${RED}Usage:${RESET} $0 [--install | -i | --uninstall | -u]"
        exit 1
        ;;
esac
