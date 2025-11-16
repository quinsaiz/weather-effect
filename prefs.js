// @ts-nocheck
import Adw from "gi://Adw";
import Gtk from "gi://Gtk";
import { ExtensionPreferences } from "resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js";
export default class WeatherEffectPrefs extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings("org.gnome.shell.extensions.weather-effect");
        const generalPage = new Adw.PreferencesPage({
            title: "General",
            icon_name: "preferences-system-symbolic",
        });
        window.add(generalPage);
        const generalGroup = new Adw.PreferencesGroup({});
        generalPage.add(generalGroup);
        const typeRow = new Adw.ComboRow({
            title: "Effect Type",
            subtitle: "Choose between snow or rain effect",
            model: new Gtk.StringList({ strings: ["Snow", "Rain"] }),
            selected: settings.get_string("effect-type") === "snow" ? 0 : 1,
        });
        typeRow.connect("notify::selected", () => {
            settings.set_string("effect-type", typeRow.selected === 0 ? "snow" : "rain");
        });
        generalGroup.add(typeRow);
        const modeRow = new Adw.ComboRow({
            title: "Display Mode",
            subtitle: "Wallpaper only or full screen overlay",
            model: new Gtk.StringList({ strings: ["Wallpaper", "Screen"] }),
            selected: settings.get_string("display-mode") === "wallpaper" ? 0 : 1,
        });
        modeRow.connect("notify::selected", () => {
            settings.set_string("display-mode", modeRow.selected === 0 ? "wallpaper" : "screen");
        });
        generalGroup.add(modeRow);
        const pauseRow = new Adw.SwitchRow({
            title: "Pause on Fullscreen",
            subtitle: "When ON and in Screen mode, pause animation on fullscreen windows",
            active: settings.get_boolean("pause-on-fullscreen"),
        });
        pauseRow.connect("notify::active", (row) => {
            settings.set_boolean("pause-on-fullscreen", row.active);
        });
        generalGroup.add(pauseRow);
        const particlesPage = new Adw.PreferencesPage({
            title: "Particles",
            icon_name: "emoji-symbols-symbolic",
        });
        window.add(particlesPage);
        const particlesGroup = new Adw.PreferencesGroup({});
        particlesPage.add(particlesGroup);
        const particleCountRow = new Adw.SpinRow({
            title: "Particle Count",
            subtitle: "Number of falling particles (5-50)",
        });
        this._bindNumberRow({
            settings,
            row: particleCountRow,
            key: "particle-count",
            range: [5, 50, 5],
        });
        particlesGroup.add(particleCountRow);
        const particleSizeRow = new Adw.SpinRow({
            title: "Particle Size",
            subtitle: "Size of falling particles in pixels (4-32)",
        });
        this._bindNumberRow({
            settings,
            row: particleSizeRow,
            key: "particle-size",
            range: [4, 32, 4],
        });
        particlesGroup.add(particleSizeRow);
        const speedRow = new Adw.ComboRow({
            title: "Speed",
            model: new Gtk.StringList({
                strings: ["Ultra Slow", "Slow", "Medium", "Fast"],
            }),
            selected: settings.get_int("speed"),
        });
        speedRow.connect("notify::selected", () => {
            settings.set_int("speed", speedRow.selected);
        });
        particlesGroup.add(speedRow);
        const appearancePage = new Adw.PreferencesPage({
            title: "Appearance",
            icon_name: "preferences-desktop-theme-symbolic",
        });
        window.add(appearancePage);
        const appearanceGroup = new Adw.PreferencesGroup({});
        appearancePage.add(appearanceGroup);
        const snowColorRow = new Adw.ComboRow({
            title: "Snow Color",
            subtitle: "Color of snow particles",
            model: new Gtk.StringList({ strings: ["White", "Light Blue", "Silver"] }),
            selected: ["white", "lightblue", "silver"].indexOf(settings.get_string("snow-color")),
        });
        snowColorRow.connect("notify::selected", () => {
            settings.set_string("snow-color", ["white", "lightblue", "silver"][snowColorRow.selected]);
        });
        appearanceGroup.add(snowColorRow);
        const snowEmojiRow = new Adw.ComboRow({
            title: "Snow Emoji",
            subtitle: "Choose emoji or leave default shape",
            model: new Gtk.StringList({ strings: ["Default", "❄", "❅", "❆"] }),
            selected: ["default", "❄", "❅", "❆"].indexOf(settings.get_string("snow-emoji") || "default"),
        });
        snowEmojiRow.connect("notify::selected", () => {
            const value = ["default", "❄", "❅", "❆"][snowEmojiRow.selected];
            settings.set_string("snow-emoji", value === "default" ? "" : value);
        });
        appearanceGroup.add(snowEmojiRow);
        const rainColorRow = new Adw.ComboRow({
            title: "Rain Color",
            subtitle: "Color of rain particles",
            model: new Gtk.StringList({ strings: ["Gray", "Dark Blue"] }),
            selected: ["gray", "darkblue"].indexOf(settings.get_string("rain-color")),
        });
        rainColorRow.connect("notify::selected", () => {
            settings.set_string("rain-color", ["gray", "darkblue"][rainColorRow.selected]);
        });
        appearanceGroup.add(rainColorRow);
        const rainEmojiRow = new Adw.ComboRow({
            title: "Rain Emoji",
            subtitle: "Choose emoji or leave default shape",
            model: new Gtk.StringList({ strings: ["Default", "💧"] }),
            selected: ["default", "🌢"].indexOf(settings.get_string("rain-emoji") || "default"),
        });
        rainEmojiRow.connect("notify::selected", () => {
            const value = ["default", "🌢"][rainEmojiRow.selected];
            settings.set_string("rain-emoji", value === "default" ? "" : value);
        });
        appearanceGroup.add(rainEmojiRow);
    }
    _bindNumberRow({ settings, row, key, range, }) {
        row.adjustment = new Gtk.Adjustment({
            lower: range[0],
            upper: range[1],
            step_increment: range[2],
        });
        row.value = settings.get_int(key);
        row.connect("notify::value", (spin) => {
            const newValue = spin.get_value();
            settings.set_int(key, newValue);
        });
    }
}
