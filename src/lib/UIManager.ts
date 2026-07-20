import GObject from "gi://GObject";
import Clutter from "gi://Clutter";
import St from "gi://St";
import {
  QuickMenuToggle,
  SystemIndicator,
} from "resource:///org/gnome/shell/ui/quickSettings.js";

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

    constructor(settings: any) {
      super({
        title: "Weather Effect",
        iconName: "weather-snow-symbolic",
        toggleMode: true,
      });

      this._isDestroyedByGnome = false;
      this.connect("destroy", (actor: any) => {
        actor._isDestroyedByGnome = true;
      });

      this._settings = settings;

      this.checked = this._settings.get_boolean("active");
      this.connect("notify::checked", () => {
        if (this._settings) {
          this._settings.set_boolean("active", this.checked);
        }
      });
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
        toggle_mode: true,
        icon_name: "weather-snow-symbolic",
        label_actor: snowLabel,
        checked: false,
      });
      snowBox.add_child(this._snowButton);
      snowBox.add_child(snowLabel);
      this._buttonBox.add_child(snowBox);

      this._snowButton.connectObject("clicked", () => {
        this._settings.set_string("effect-type", "snow");
        this.checked = true;
        this._updateButtons();
        this.iconName = "weather-snow-symbolic";
      }, this);

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
        toggle_mode: true,
        icon_name: "weather-showers-symbolic",
        label_actor: rainLabel,
        checked: false,
      });
      rainBox.add_child(this._rainButton);
      rainBox.add_child(rainLabel);
      this._buttonBox.add_child(rainBox);

      this._rainButton.connectObject("clicked", () => {
        this._settings.set_string("effect-type", "rain");
        this.checked = true;
        this._updateButtons();
        this.iconName = "weather-showers-symbolic";
      }, this);

      this.menu.box.add_child(this._buttonBox);

      this._settings.connectObject(
        "changed::effect-type",
        () => {
          this._updateButtons();
          const effectType: EffectType =
            this._settings.get_string("effect-type");
          this.iconName =
            effectType === "snow"
              ? "weather-snow-symbolic"
              : "weather-showers-symbolic";
        },
        this
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
      this._settings?.disconnectObject(this);
      this._snowButton?.disconnectObject(this);
      this._rainButton?.disconnectObject(this);

      this._settings = null;
      this._snowButton = null;
      this._rainButton = null;
      this._buttonBox = null;

      super.destroy();
    }
  },
);

/**
 * System Indicator for showing status
 */
export const WeatherIndicator = GObject.registerClass(
  class WeatherIndicator extends SystemIndicator {
    public toggle: InstanceType<typeof WeatherToggle>;
    private _indicator: any;
    private _settings: any;

    constructor(settings: any) {
      super();

      this._isDestroyedByGnome = false;
      this.connect("destroy", (actor: any) => {
        actor._isDestroyedByGnome = true;
      });

      this._indicator = (this as any)._addIndicator();
      this._indicator.icon_name = "weather-snow-symbolic";
      this._settings = settings;

      this.toggle = new WeatherToggle(settings);
      this.quickSettingsItems.push(this.toggle);

      this._updateIndicatorIcon();
      this._settings.connectObject(
        "changed::effect-type",
        () => this._updateIndicatorIcon(),
        this
      );
      this.toggle.connectObject("notify::checked", () =>
        this._updateIndicatorIcon(),
        this
      );
    }

    _updateIndicatorIcon() {
      if (
        !this._settings ||
        !this.toggle ||
        !this._indicator ||
        (this.toggle as any)._isDestroyedByGnome
      )
        return;
      const effectType: EffectType = this._settings.get_string("effect-type");
      let checked = false;
      if (this.toggle.checked !== undefined) {
        checked = this.toggle.checked;
      }
      this._indicator.icon_name = checked
        ? effectType === "snow"
          ? "weather-snow-symbolic"
          : "weather-showers-symbolic"
        : "weather-clear-symbolic";
    }

    destroy() {
      this._settings?.disconnectObject(this);
      this.toggle?.disconnectObject(this);

      if (this.toggle) {
        this.toggle.destroy();
        this.toggle = null as any;
      }

      this.quickSettingsItems.length = 0;

      this._settings = null;
      this._indicator = null;

      super.destroy();
    }
  },
);
