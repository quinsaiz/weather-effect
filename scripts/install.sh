#!/bin/bash

set -e

GREEN="\e[32m"
RED="\e[31m"
BLUE="\e[34m"
RESET="\e[0m"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
EXTENSION_UUID="weather-effect@quinsaiz.github"
EXTENSION_DIR="$HOME/.local/share/gnome-shell/extensions/$EXTENSION_UUID"
DIST_DIR="$ROOT_DIR/dist"
METADATA_FILE="$ROOT_DIR/src/metadata.json"
SCHEMAS_DIR="$ROOT_DIR/src/schemas"

function info()    { echo -e "${BLUE}[INFO]${RESET} $1"; }
function success() { echo -e "${GREEN}[OK]${RESET} $1"; }
function error()   { echo -e "${RED}[ERROR]${RESET} $1"; }

function install_extension() {
    info "Installing Weather Effect extension..."

    mkdir -p "$EXTENSION_DIR"

    if [ -d "$DIST_DIR" ]; then
        info "Copying files from dist..."
        cp -r "$DIST_DIR/"* "$EXTENSION_DIR/" 2>/dev/null || error "Some dist files failed to copy"
    else
        error "Dist folder not found: $DIST_DIR"
    fi

    if [ -f "$METADATA_FILE" ]; then
        cp "$METADATA_FILE" "$EXTENSION_DIR/" 2>/dev/null || error "Failed to copy metadata.json"
    else
        error "metadata.json not found: $METADATA_FILE"
    fi

    mkdir -p "$EXTENSION_DIR/schemas"
    if [ -d "$SCHEMAS_DIR" ]; then
        cp -r "$SCHEMAS_DIR/"* "$EXTENSION_DIR/schemas/" 2>/dev/null || error "Failed to copy schema files"
        info "Compiling schemas..."
        glib-compile-schemas "$EXTENSION_DIR/schemas" 2>/dev/null || error "Schema compilation failed. Extension might not work correctly."
    fi

    success "Extension installed successfully!"
    echo ""

    if [ "$XDG_SESSION_TYPE" = "x11" ]; then
        if command -v gnome-shell >/dev/null 2>&1; then
            DISPLAY=:0 gnome-shell --replace >/dev/null 2>&1 &
            success "GNOME Shell reload triggered."
        else
            info "gnome-shell command not found. Please log out and back in manually."
        fi
    else
        info "To enable the extension:"
        echo "1. Log out and log back in"
        echo "2. Open GNOME Extensions app and enable 'Weather Effect'"
    fi
}

function uninstall_extension() {
    if [ -d "$EXTENSION_DIR" ]; then
        info "Removing extension folder: $EXTENSION_DIR"
        rm -rf "$EXTENSION_DIR"
        success "Extension uninstalled successfully!"
    else
        error "Extension folder does not exist."
    fi
}

case "$1" in
    install|"")
        install_extension
        ;;
    uninstall|--uninstall|-u)
        uninstall_extension
        ;;
    *)
        echo -e "${RED}Usage:${RESET} $0 [install | uninstall | --uninstall | -u]"
        ;;
esac
