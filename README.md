<div align="center">

# Weather Effect GNOME Extension

![GNOME Extension](https://img.shields.io/badge/GNOME-Extension-blue?style=for-the-badge&logo=gnome)
![License](https://img.shields.io/badge/License-GPLv3-green?style=for-the-badge)
![Version](https://img.shields.io/badge/Version-2.4.0-orange?style=for-the-badge)

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
  - **Wallpaper Mode**: Effects only on desktop wallpaper background
  - **Screen Mode**: Full-screen overlay that works even in overview
- **Customizable Settings**:
  - Particle count (5–50)
  - Particle size (4–32 pixels)
  - Speed control (Slow, Medium, Fast)
  - Color customization for snow and rain
  - Preinstalled emojis support
- **Multi-Monitor Support**: Automatically works across all connected monitors
- **Smart Behavior**: Pauses when desktop is obscured by fullscreen windows
- **Quick Settings Integration**: Easy access through GNOME Quick Settings menu

## Installation

### Prerequisites

- GNOME Shell 45+

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

### Build Steps

1. **Clone the repository:**

   ```bash
   git clone https://github.com/quinsaiz/weather-effect.git && \
   cd weather-effect
   ```

2. **Install dependencies:**

   ```bash
   npm i
   ```

3. **Build the extension:**

   ```bash
   npm run install
   ```

   This will:

   - Compile TypeScript files to JavaScript
   - Create the extension archive `.zip`
   - Deploy it directly to your local extensions directory `~/.local/share/gnome-shell/extensions/`

## Usage

1. **Open Quick Settings** by clicking the system menu in the top-right corner.
2. **Click the Weather Effect toggle**.
3. **Select effect type**:
   - Choose between **Snow** or **Rain** using the horizontal selector buttons.
4. **Configure settings** (optional):
   - Open GNOME Extensions app.
   - Find **Weather Effect** and click the settings icon.
   - Adjust particle count, size, speed, colors, and display mode.

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
│   └── build.sh                    # Build and installation script
├── src/
│   ├── ambient.d.ts                # Ambient type definitions for GJS and GNOME Shell
│   ├── extension.ts                # Main extension entry point (lifecycle hooks)
│   ├── metadata.json               # Extension manifest for GNOME Shell
│   ├── prefs.ts                    # Extension settings window entry point
│   ├── lib/
│   │   ├── MonitorManager.ts       # Monitor detection and overlay actor placement
│   │   ├── ObscurationManager.ts   # Active window occlusion and visibility tracking
│   │   ├── ParticleManager.ts      # Particle lifecycle, physics, and canvas rendering
│   │   ├── UIManager.ts            # Quick Settings panel Integration and UI components
│   │   └── WeatherEffectController.ts # Core orchestrator binding components and weather events
│   └── schemas/
│       └── org.gnome.shell.extensions.weather-effect.gschema.xml # GSettings schema definition
└── tsconfig.json                   # TypeScript compiler configuration
```

## Configuration

The extension can be configured through the GNOME Extensions app settings:

- **Effect Type**: Snow or Rain
- **Display Mode**: Wallpaper only or Full screen overlay
- **Particle Count**: 5 to 50 particles
- **Particle Size**: 4 to 32 pixels
- **Speed**: Slow, Medium, or Fast
- **Snow Color**: White, Light Blue, or Silver
- **Rain Color**: Gray or Dark Blue
- **Custom Emojis**: Choose emoji or use default shapes

## License

This project is licensed under the [GPLv3 License](/LICENSE).
