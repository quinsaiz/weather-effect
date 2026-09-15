<div align="center">

# Weather Effect GNOME Extension

![GNOME Extension](https://img.shields.io/badge/GNOME-Extension-blue?style=for-the-badge&logo=gnome)
![License](https://img.shields.io/badge/License-GPLv3-green?style=for-the-badge)
![Version](https://img.shields.io/badge/Version-2.5.0-orange?style=for-the-badge)

</div>

## Description

Weather Effect is a GNOME Shell extension that adds beautiful animated weather effects (snow or rain) to your desktop wallpaper or as a full-screen overlay.

Enjoy the magic of falling snowflakes or raindrops on your GNOME desktop!

## Preview

<div align="center">

### Snow Effect

![Snow Effect Demo](demo/snow.gif)

### Rain Effect

![Rain Effect Demo](demo/rain.gif)

</div>

---

### Key Features

- ❄️ **Snow Effect**: Beautiful animated snowflakes falling on your desktop
- 🌧️ **Rain Effect**: Realistic rain animation with customizable particles
- **Display Modes**:
  - **Wallpaper Mode**: Places particles with the wallpaper/background layer. Particles pause per monitor while Overview is visible or when non-minimized normal windows on the active workspace cover at least 95% of that monitor by union area.
  - **Screen Mode**: Places particles above application windows and Overview, but below protected Shell UI such as the panel, screen shield, dialogs, keyboard, and screenshot UI. Particles remain visible in Overview; when **Pause on Fullscreen** is enabled, only fullscreen-covered monitors pause.
- **Customizable Settings**:
  - Particles per runnable monitor: 5–50
  - Particle size (4–64 pixels)
  - Independent Snow and Rain speed control (Ultra Slow, Slow, Medium, Fast)
  - Color customization for snow and rain
  - Preinstalled emojis support
- **Particle Rendering**: Each particle is an individual `St.Widget` or `St.Label` animated with a linear Clutter transition
- **Multi-Monitor Support**: Automatically works across all connected monitors
- **Quick Settings Integration**: Easy access through GNOME Quick Settings menu

Particle count is per runnable monitor: a count of 5 with three runnable monitors means 5 particles on each monitor. If one monitor is blocked, its particles are not redistributed to the others.

Snow Default (20 particles, size 4), Snow Emoji (20 particles, size 32), Rain Default (30 particles, size 4), and Rain Emoji (30 particles, size 12) each retain independent particle count and size values. Snow initially uses ❆. Snow and Rain also save independent speeds, defaulting to Slow and Medium respectively; switching between Default and Emoji within one effect keeps that effect's speed.

## Installation

### Prerequisites

- GNOME Shell 45 through 50

### From GNOME Extensions

Install directly from [extensions.gnome.org](https://extensions.gnome.org/extension/8848/weather-effect/).

### From Releases

1. **Download the latest release archive:**

   Download `weather-effect@quinsaiz.github.shell-extension.zip` from [Releases](https://github.com/quinsaiz/weather-effect/releases).

2. **Install via CLI:**

   ```bash
   gnome-extensions install weather-effect@quinsaiz.github.shell-extension.zip
   ```

3. **Log out and log back in to apply changes.**

## Building from Source

If you want to build the extension from source code, follow these steps:

### Prerequisites for Building

- **Node.js** (v16 or higher)
- **npm** (comes with Node.js)
- **glib-compile-schemas** (usually provided by the `glib2` package)
- **gnome-extensions** command-line tool
- **unzip**

### Build Steps

1. **Clone the repository:**

   ```bash
   git clone https://github.com/quinsaiz/weather-effect.git && \
   cd weather-effect
   ```

2. **Install dependencies:**

   ```bash
   npm ci
   ```

   This only installs the locked development dependencies. It does not build or
   install the GNOME Shell extension.

3. **Validate and build the extension archive:**

   ```bash
   npm run build
   ```

   This will:

   - Validate metadata, the settings schema, shell scripts, and TypeScript
   - Compile TypeScript files to JavaScript
   - Create and validate `build/weather-effect@quinsaiz.github.shell-extension.zip`

   `npm run build` already runs source validation and validates the resulting
   extension package.

   To validate metadata, the settings schema, shell scripts, and TypeScript
   without building:

   ```bash
   npm run validate
   ```

   To validate the already-built extension archive without rebuilding it:

   ```bash
   npm run validate:package
   ```

4. **Build and install the extension locally (optional):**

   ```bash
   npm run install:extension
   ```

   This performs a fresh validated build, then installs only the archive created
   by that build into your local GNOME Shell extensions directory.

### Maintenance Commands

Uninstall the extension without changing its saved preferences:

```bash
npm run uninstall:extension
```

Reset only the extension's saved preferences:

```bash
npm run reset:settings
```

**Warning:** `reset:settings` permanently removes all saved Weather Effect
settings. It does not uninstall, disable, install, or rebuild the extension.

## Usage

1. **Open Quick Settings** by clicking the system menu in the top-right corner.
2. **Click the Weather Effect toggle**.
3. **Select effect type**:
   - Choose between **Snow** or **Rain** using the horizontal selector buttons.
4. **Configure settings** (optional):
   - Open GNOME Extensions app.
   - Find **Weather Effect** and click the settings icon.
   - Adjust particles per monitor, size, speed, colors, and display mode.

## Project Structure

```plaintext
weather-effect/
├── demo/                           # Visual previews and media assets
│   ├── rain.gif
│   ├── rain.mp4
│   ├── snow.gif
│   └── snow.mp4
├── LICENSE
├── package.json
├── package-lock.json
├── README.md
├── scripts/
│   ├── build.sh                    # Build and installation script
│   ├── validate-metadata.mjs       # Source metadata semantic validation
│   ├── validate-package.sh         # Extension archive validation
│   └── validate.sh                 # Static source validation
├── src/
│   ├── ambient.d.ts                # Ambient type definitions for GJS and GNOME Shell
│   ├── extension.ts                # Main extension entry point (lifecycle hooks)
│   ├── metadata.json               # Extension manifest for GNOME Shell
│   ├── prefs.ts                    # Extension settings window entry point
│   ├── lib/
│   │   ├── MonitorManager.ts       # MonitorLayerRecord lifecycle and layer actor placement
│   │   ├── ObscurationManager.ts   # Active window occlusion and visibility tracking
│   │   ├── ParticleManager.ts      # Particle actor lifecycle and Clutter transitions
│   │   ├── ParticleProfiles.ts     # Particle profile resolution and settings migration
│   │   ├── QuickSettings.ts        # Quick Settings toggle and indicator components
│   │   └── WeatherEffectController.ts # Core orchestrator binding components and weather events
│   └── schemas/
│       └── org.gnome.shell.extensions.weather-effect.gschema.xml # GSettings schema definition
└── tsconfig.json                   # TypeScript compiler configuration
```

## Configuration

The extension can be configured through the GNOME Extensions app settings:

- **Effect Type**: Snow or Rain
- **Display Mode**: Wallpaper or Screen
- **Particles per runnable monitor**: 5–50
- **Particle Size**: 4 to 64 pixels
- **Speed**: Ultra Slow, Slow, Medium, or Fast, saved independently for Snow and Rain
- **Pause on Fullscreen**: Pause screen-mode particles on fullscreen-covered monitors
- **Show in Quick Settings**: Show or hide the Weather Effect Quick Settings integration
- **Show Panel Icon**: Show or hide its top-panel icon without removing the Quick Settings tile
- **Snow Color**: White, Light Blue, or Silver
- **Rain Color**: Gray or Dark Blue
- **Custom Emojis**: Choose emoji or use default shapes

## License

This project is licensed under the [GPLv3 License](/LICENSE).
