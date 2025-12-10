<h1 align="center">Weather Effect GNOME Extension</h1>

<p align="center">
    <img src="https://img.shields.io/badge/GNOME-Shell-blue?style=for-the-badge&logo=gnome" alt="GNOME Shell"/>
    <img src="https://img.shields.io/badge/License-GPLv3-green?style=for-the-badge" alt="License"/>
    <img src="https://img.shields.io/badge/Version-1.2-orange?style=for-the-badge" alt="Version"/>
</p>

## Description

Weather Effect is a GNOME Shell extension that adds beautiful animated weather effects (snow or rain) to your desktop wallpaper or as a full-screen overlay. Enjoy the magic of falling snowflakes or raindrops on your GNOME desktop!

### Key Features:

- ❄️ **Snow Effect**: Beautiful animated snowflakes falling on your desktop
- 🌧️ **Rain Effect**: Realistic rain animation with customizable particles
- **Display Modes**:
  - **Wallpaper Mode**: Effects only on desktop wallpaper background
  - **Screen Mode**: Full-screen overlay that works even in overview
- **Customizable Settings**:
  - Particle count (5-50)
  - Particle size (4-32 pixels)
  - Speed control (Slow, Medium, Fast)
  - Color customization for snow and rain
  - Custom emoji support (❄, ❅, ❆, 💧)
- **Multi-Monitor Support**: Automatically works across all connected monitors
- **Smart Behavior**: Pauses when desktop is obscured by fullscreen windows
- **Quick Settings Integration**: Easy access through GNOME Quick Settings menu

## Installation

### Prerequisites

- GNOME Shell 45+

### Quick Installation

1. **Download last [weather-effect@quinsaiz.github.shell-extension.zip](https://github.com/quinsaiz/weather-effect/releases)**

2. **Install:**

   ```bash
   gnome-extensions install weather-effect@quinsaiz.github.shell-extension.zip
   ```

3. **Log out and log back in**

## Building from Source

If you want to build the extension from source code, follow these steps:

### Prerequisites for Building

- **[Node.js](https://nodejs.org/)** (v16 or higher)
- **npm** (comes with Node.js)
- **glib-compile-schemas** (usually comes with GNOME development packages)

#### Ubuntu/Debian:

```bash
sudo apt install nodejs npm gir1.2-glib-2.0
```

#### Fedora:

```bash
sudo dnf install nodejs npm glib2-devel
```

#### Arch:

```bash
sudo pacman -S nodejs npm glib2
```

### Build Steps

1. **Clone the repository:**

   ```bash
   git clone https://github.com/quinsaiz/weather-effect.git
   cd weather-effect
   ```

2. **Install dependencies:**

   ```bash
   npm i
   ```

3. **Build the extension:**

   ```bash
   npm run build
   ```

   This will:

   - Compile TypeScript files to JavaScript
   - Compile GNOME settings schemas
   - Copy compiled files to gnome extensions folder

## Usage

1. **Open Quick Settings** by clicking the system menu in the top-right corner
2. **Click the Weather Effect toggle** (weather icon)
3. **Select effect type**:
   - Choose between **Snow** ❄️ or **Rain** 🌧️ using the horizontal selector buttons
4. **Configure settings** (optional):
   - Open GNOME Extensions app
   - Click the ⚙️ gear icon next to Weather Effect
   - Adjust particle count, size, speed, colors, and display mode

## Project Structure

```text
weather-effect/
│
├── src/
│   ├── extension.ts           # Main extension entry point
│   ├── metadata.json          # Extension manifest
│   ├── prefs.ts               # Preferences window
│   └── lib/
│       ├── WeatherEffectController.ts  # Main orchestrator
│       ├── UIManager.ts                # Quick Settings UI components
│       ├── MonitorManager.ts           # Monitor actor management
│       ├── ObscurationManager.ts       # Window obscuration detection
│       ├── ParticleManager.ts          # Particle creation & animation
│       ├── EventManager.ts             # Centralized signal handlers
│       └── Debug.ts                    # Centralized logging
│
├── schemas/
│   └── org.gnome.shell.extensions.weather-effect.gschema.xml
│
├── scripts/
│   └── build.sh          # Build and installation script
│
├── package.json          # Dependencies & build scripts
├── tsconfig.json         # TypeScript compiler options
├── LICENSE               # GPLv3 License
└── README.md             # This file
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
- **Custom Emojis**: Choose custom emoji or use default shapes

## Author

### quinsaiz

GitHub: https://github.com/quinsaiz

## License

This project is licensed under the [GPLv3 License](/LICENSE).

## Support

If you like this project, please give it a star on GitHub!

[![GitHub stars](https://img.shields.io/github/stars/quinsaiz/weather-effect?style=social)](https://github.com/quinsaiz/weather-effect)

## Contributing

Contributions, issues, and feature requests are welcome! Feel free to check the [issues page](https://github.com/quinsaiz/weather-effect/issues).
