// @ts-nocheck
import GObject from "gi://GObject";
import Clutter from "gi://Clutter";
import St from "gi://St";
import * as Main from "resource:///org/gnome/shell/ui/main.js";

import {
  QuickMenuToggle,
  SystemIndicator,
} from "resource:///org/gnome/shell/ui/quickSettings.js";
import { logDebug } from "./Debug.js";

type EffectType = "snow" | "rain";

/**
 * Quick Settings Toggle for selecting the effect
 */
export const WeatherToggle = GObject.registerClass(
  class WeatherToggle extends QuickMenuToggle {
    private _settings: any;
    private _snowButton: St.Button | null = null;
    private _rainButton: St.Button | null = null;
    private _buttonBox: St.BoxLayout | null = null;
    private _settingsHandler: number | null = null;
    private _snowButtonHandler: number | null = null;
    private _rainButtonHandler: number | null = null;

    constructor(settings: any) {
      super({
        title: "Weather Effect",
        iconName: "weather-snow-symbolic",
        toggleMode: true,
      });
      this._settings = settings;

      this.checked = true;
      const effectType: EffectType = this._settings.get_string("effect-type");
      this.iconName =
        effectType === "snow"
          ? "weather-snow-symbolic"
          : "weather-showers-symbolic";

      this._buttonBox = new St.BoxLayout({
        style_class: "popup-menu-item",
        reactive: true,
        x_expand: true,
      });

      const snowBox = new St.BoxLayout({
        style_class: "keyboard-brightness-level",
        orientation: Clutter.Orientation.VERTICAL,
        x_expand: true,
      });
      const snowLabel = new St.Label({
        text: "Snow",
        x_align: Clutter.ActorAlign.CENTER,
      });
      this._snowButton = new St.Button({
        style_class: "icon-button",
        can_focus: true,
        icon_name: "weather-snow-symbolic",
        label_actor: snowLabel,
        checked: false,
      });
      snowBox.add_child(this._snowButton);
      snowBox.add_child(snowLabel);
      this._buttonBox.add_child(snowBox);

      this._snowButtonHandler = this._snowButton.connect("clicked", () => {
        this._settings.set_string("effect-type", "snow");
        this.checked = true;
        this._updateButtons();
        this.iconName = "weather-snow-symbolic";
        logDebug("Snow selected");
      });

      const rainBox = new St.BoxLayout({
        style_class: "keyboard-brightness-level",
        orientation: Clutter.Orientation.VERTICAL,
        x_expand: true,
      });
      const rainLabel = new St.Label({
        text: "Rain",
        x_align: Clutter.ActorAlign.CENTER,
      });
      this._rainButton = new St.Button({
        style_class: "icon-button",
        can_focus: true,
        icon_name: "weather-showers-symbolic",
        label_actor: rainLabel,
        checked: false,
      });
      rainBox.add_child(this._rainButton);
      rainBox.add_child(rainLabel);
      this._buttonBox.add_child(rainBox);

      this._rainButtonHandler = this._rainButton.connect("clicked", () => {
        this._settings.set_string("effect-type", "rain");
        this.checked = true;
        this._updateButtons();
        this.iconName = "weather-showers-symbolic";
        logDebug("Rain selected");
      });

      this.menu.box.add_child(this._buttonBox);

      this._settingsHandler = this._settings.connect(
        "changed::effect-type",
        () => {
          this._updateButtons();
          const effectType: EffectType =
            this._settings.get_string("effect-type");
          this.iconName =
            effectType === "snow"
              ? "weather-snow-symbolic"
              : "weather-showers-symbolic";
        }
      );

      this._updateButtons();
    }

    _updateButtons() {
      if (!this._settings || !this._snowButton || !this._rainButton) return;
      const effectType: EffectType = this._settings.get_string("effect-type");
      const isActive = this.checked;

      if (effectType === "snow" && isActive) {
        this._snowButton.checked = true;
        this._rainButton.checked = false;
      } else if (effectType === "rain" && isActive) {
        this._rainButton.checked = true;
        this._snowButton.checked = false;
      } else {
        this._snowButton.checked = false;
        this._rainButton.checked = false;
      }
    }

    destroy() {
      if (this._settingsHandler && this._settings) {
        this._settings.disconnect(this._settingsHandler);
        this._settingsHandler = null;
      }
      if (this._snowButtonHandler && this._snowButton) {
        this._snowButton.disconnect(this._snowButtonHandler);
        this._snowButtonHandler = null;
      }
      if (this._rainButtonHandler && this._rainButton) {
        this._rainButton.disconnect(this._rainButtonHandler);
        this._rainButtonHandler = null;
      }

      this._settings = null;
      this._snowButton = null;
      this._rainButton = null;
      this._buttonBox = null;

      super.destroy();
    }
  }
);

/**
 * System Indicator for showing status
 */
export const WeatherIndicator = GObject.registerClass(
  class WeatherIndicator extends SystemIndicator {
    public toggle: InstanceType<typeof WeatherToggle>;
    private _indicator: any;
    private _settings: any;
    private _settingsHandler: number | null = null;
    private _toggleHandler: number | null = null;

    constructor(settings: any) {
      super();
      this._indicator = this._addIndicator();
      this._indicator.icon_name = "weather-snow-symbolic";
      this._settings = settings;

      this.toggle = new WeatherToggle(settings);
      this.quickSettingsItems.push(this.toggle);

      this._updateIndicatorIcon();
      this._settingsHandler = this._settings.connect(
        "changed::effect-type",
        () => this._updateIndicatorIcon()
      );
      this._toggleHandler = this.toggle.connect("notify::checked", () =>
        this._updateIndicatorIcon()
      );
    }

    _updateIndicatorIcon() {
      if (!this._settings || !this.toggle || !this._indicator) return;
      const effectType: EffectType = this._settings.get_string("effect-type");
      const checked = this.toggle.checked;
      this._indicator.icon_name = checked
        ? effectType === "snow"
          ? "weather-snow-symbolic"
          : "weather-showers-symbolic"
        : "weather-clear-symbolic";
    }

    destroy() {
      if (this._settingsHandler && this._settings) {
        this._settings.disconnect(this._settingsHandler);
        this._settingsHandler = null;
      }
      if (this._toggleHandler && this.toggle) {
        this.toggle.disconnect(this._toggleHandler);
        this._toggleHandler = null;
      }

      this.quickSettingsItems.forEach((item) => item.destroy());

      this._settings = null;
      this._indicator = null;

      super.destroy();
    }
  }
);
