import Adw from "gi://Adw";
import Gio from "gi://Gio";
import Gtk from "gi://Gtk";
import { ExtensionPreferences } from "resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js";

import { migrateLegacyParticleProfile } from "./lib/ParticleProfiles.js";

export default class WeatherEffectPrefs extends ExtensionPreferences {
  fillPreferencesWindow(window: Adw.PreferencesWindow): Promise<void> {
    migrateLegacyParticleProfile(this.getSettings());
    const settings = this.getSettings();
    const mappedSettingsHandlers: number[] = [];

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
    });
    const syncTypeRow = () => {
      const selected = settings.get_string("effect-type") === "snow" ? 0 : 1;
      if (typeRow.selected !== selected) typeRow.selected = selected;
    };
    syncTypeRow();
    typeRow.connect("notify::selected", () => {
      const value = typeRow.selected === 0 ? "snow" : "rain";
      if (settings.get_string("effect-type") !== value)
        settings.set_string("effect-type", value);
    });
    mappedSettingsHandlers.push(
      settings.connect("changed::effect-type", syncTypeRow)
    );
    generalGroup.add(typeRow);

    const modeRow = new Adw.ComboRow({
      title: "Display Mode",
      subtitle: "Wallpaper only or full screen overlay",
      model: new Gtk.StringList({ strings: ["Wallpaper", "Screen"] }),
    });
    const syncModeRow = () => {
      const selected =
        settings.get_string("display-mode") === "wallpaper" ? 0 : 1;
      if (modeRow.selected !== selected) modeRow.selected = selected;
    };
    syncModeRow();
    modeRow.connect("notify::selected", () => {
      const value = modeRow.selected === 0 ? "wallpaper" : "screen";
      if (settings.get_string("display-mode") !== value)
        settings.set_string("display-mode", value);
    });
    mappedSettingsHandlers.push(
      settings.connect("changed::display-mode", syncModeRow)
    );
    generalGroup.add(modeRow);

    const quickSettingsRow = new Adw.SwitchRow({
      title: "Show in Quick Settings",
      subtitle:
        "Display the toggle button and icon in the Quick Settings panel",
    });
    settings.bind(
      "show-in-quick-settings",
      quickSettingsRow,
      "active",
      Gio.SettingsBindFlags.DEFAULT
    );
    generalGroup.add(quickSettingsRow);

    const panelIconRow = new Adw.SwitchRow({
      title: "Show Panel Icon",
      subtitle: "Show the weather icon in the top panel",
    });
    settings.bind(
      "show-panel-icon",
      panelIconRow,
      "active",
      Gio.SettingsBindFlags.DEFAULT | Gio.SettingsBindFlags.NO_SENSITIVITY
    );
    settings.bind(
      "show-in-quick-settings",
      panelIconRow,
      "sensitive",
      Gio.SettingsBindFlags.GET | Gio.SettingsBindFlags.NO_SENSITIVITY
    );
    generalGroup.add(panelIconRow);

    const pauseRow = new Adw.SwitchRow({
      title: "Pause on Fullscreen",
      subtitle:
        "When ON and in Screen mode, pause animation on fullscreen windows",
    });
    settings.bind(
      "pause-on-fullscreen",
      pauseRow,
      "active",
      Gio.SettingsBindFlags.DEFAULT
    );
    generalGroup.add(pauseRow);

    const particlesPage = new Adw.PreferencesPage({
      title: "Particles",
      icon_name: "emoji-symbols-symbolic",
    });
    window.add(particlesPage);

    const particlesGroup = new Adw.PreferencesGroup({});
    particlesPage.add(particlesGroup);

    const particleCountRow = new Adw.SpinRow({
      title: "Particles per monitor",
      subtitle: "Number of particles shown on each monitor",
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
    });
    const syncSpeedRow = () => {
      const selected = settings.get_int("speed");
      if (speedRow.selected !== selected) speedRow.selected = selected;
    };
    syncSpeedRow();
    speedRow.connect("notify::selected", () => {
      if (settings.get_int("speed") !== speedRow.selected)
        settings.set_int("speed", speedRow.selected);
    });
    mappedSettingsHandlers.push(
      settings.connect("changed::speed", syncSpeedRow)
    );
    particlesGroup.add(speedRow);

    const appearancePage = new Adw.PreferencesPage({
      title: "Appearance",
      icon_name: "preferences-desktop-appearance-symbolic",
    });
    window.add(appearancePage);

    const appearanceGroup = new Adw.PreferencesGroup({});
    appearancePage.add(appearanceGroup);

    const snowColors = ["white", "lightblue", "silver"];
    const snowColorRow = new Adw.ComboRow({
      title: "Snow Color",
      subtitle: "Color of snow particles",
      model: new Gtk.StringList({ strings: ["White", "Light Blue", "Silver"] }),
    });
    const syncSnowColorRow = () => {
      const index = snowColors.indexOf(settings.get_string("snow-color"));
      const selected = index < 0 ? Gtk.INVALID_LIST_POSITION : index;
      if (snowColorRow.selected !== selected) snowColorRow.selected = selected;
    };
    syncSnowColorRow();
    snowColorRow.connect("notify::selected", () => {
      const value = snowColors[snowColorRow.selected];
      if (value !== undefined && settings.get_string("snow-color") !== value)
        settings.set_string("snow-color", value);
    });
    mappedSettingsHandlers.push(
      settings.connect("changed::snow-color", syncSnowColorRow)
    );
    appearanceGroup.add(snowColorRow);

    const snowEmojis = ["", "❄", "❅", "❆"];
    const snowEmojiRow = new Adw.ComboRow({
      title: "Snow Emoji",
      subtitle: "Choose emoji or leave default shape",
      model: new Gtk.StringList({ strings: ["Default", "❄", "❅", "❆"] }),
    });
    const syncSnowEmojiRow = () => {
      const index = snowEmojis.indexOf(settings.get_string("snow-emoji"));
      const selected = index < 0 ? Gtk.INVALID_LIST_POSITION : index;
      if (snowEmojiRow.selected !== selected) snowEmojiRow.selected = selected;
    };
    syncSnowEmojiRow();
    snowEmojiRow.connect("notify::selected", () => {
      const value = snowEmojis[snowEmojiRow.selected];
      if (value !== undefined && settings.get_string("snow-emoji") !== value)
        settings.set_string("snow-emoji", value);
    });
    mappedSettingsHandlers.push(
      settings.connect("changed::snow-emoji", syncSnowEmojiRow)
    );
    appearanceGroup.add(snowEmojiRow);

    const rainColors = ["gray", "darkblue"];
    const rainColorRow = new Adw.ComboRow({
      title: "Rain Color",
      subtitle: "Color of rain particles",
      model: new Gtk.StringList({ strings: ["Gray", "Dark Blue"] }),
    });
    const syncRainColorRow = () => {
      const index = rainColors.indexOf(settings.get_string("rain-color"));
      const selected = index < 0 ? Gtk.INVALID_LIST_POSITION : index;
      if (rainColorRow.selected !== selected) rainColorRow.selected = selected;
    };
    syncRainColorRow();
    rainColorRow.connect("notify::selected", () => {
      const value = rainColors[rainColorRow.selected];
      if (value !== undefined && settings.get_string("rain-color") !== value)
        settings.set_string("rain-color", value);
    });
    mappedSettingsHandlers.push(
      settings.connect("changed::rain-color", syncRainColorRow)
    );
    appearanceGroup.add(rainColorRow);

    const rainEmojis = ["", "🌢"];
    const rainEmojiRow = new Adw.ComboRow({
      title: "Rain Emoji",
      subtitle: "Choose emoji or leave default shape",
      model: new Gtk.StringList({ strings: ["Default", "🌢"] }),
    });
    const syncRainEmojiRow = () => {
      const index = rainEmojis.indexOf(settings.get_string("rain-emoji"));
      const selected = index < 0 ? Gtk.INVALID_LIST_POSITION : index;
      if (rainEmojiRow.selected !== selected) rainEmojiRow.selected = selected;
    };
    syncRainEmojiRow();
    rainEmojiRow.connect("notify::selected", () => {
      const value = rainEmojis[rainEmojiRow.selected];
      if (value !== undefined && settings.get_string("rain-emoji") !== value)
        settings.set_string("rain-emoji", value);
    });
    mappedSettingsHandlers.push(
      settings.connect("changed::rain-emoji", syncRainEmojiRow)
    );
    appearanceGroup.add(rainEmojiRow);

    // GSettings outlives Preferences widgets, so mapped handlers belong to the window.
    const disconnectMappedSettingsHandlers = () => {
      for (const handlerId of mappedSettingsHandlers.splice(0))
        settings.disconnect(handlerId);
    };
    window.connect("destroy", disconnectMappedSettingsHandlers);

    return Promise.resolve();
  }

  private _bindNumberRow({
    settings,
    row,
    key,
    range,
  }: {
    settings: Gio.Settings;
    row: Adw.SpinRow;
    key: string;
    range: [number, number, number];
  }) {
    row.adjustment = new Gtk.Adjustment({
      lower: range[0],
      upper: range[1],
      step_increment: range[2],
    });
    settings.bind(key, row, "value", Gio.SettingsBindFlags.DEFAULT);
  }
}
