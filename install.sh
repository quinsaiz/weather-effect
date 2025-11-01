#!/bin/bash

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
EXTENSION_UUID="weather-effect@quinsaiz.github"
EXTENSION_DIR="$HOME/.local/share/gnome-shell/extensions/$EXTENSION_UUID"

echo "Installing Weather Effect extension..."

echo "Creating extension directory: $EXTENSION_DIR"
mkdir -p "$EXTENSION_DIR"

echo "Copying files..."

cp -v "$SCRIPT_DIR/extension.js" "$EXTENSION_DIR/"
cp -v "$SCRIPT_DIR/metadata.json" "$EXTENSION_DIR/"
cp -v "$SCRIPT_DIR/prefs.js" "$EXTENSION_DIR/"

mkdir -p "$EXTENSION_DIR/schemas"
cp -rv "$SCRIPT_DIR/schemas/"* "$EXTENSION_DIR/schemas/"

echo "Compiling schemas..."
glib-compile-schemas "$EXTENSION_DIR/schemas"

if [ $? -ne 0 ]; then
    echo "Warning: Schema compilation failed. Extension might not work correctly."
fi

echo ""
echo "Extension installed successfully!"
echo ""
echo "To enable the extension:"
echo "1. Log out and log back in"
echo "2. Open GNOME Extensions app and enable 'Weather Effect'"
echo ""