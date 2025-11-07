// @ts-nocheck
import GObject from "gi://GObject";
import Clutter from "gi://Clutter";
import St from "gi://St";
import GLib from "gi://GLib";
import Meta from "gi://Meta";
import * as Main from "resource:///org/gnome/shell/ui/main.js";
import { Extension } from "resource:///org/gnome/shell/extensions/extension.js";
import {
  QuickMenuToggle,
  SystemIndicator,
} from "resource:///org/gnome/shell/ui/quickSettings.js";
import { PopupBaseMenuItem } from "resource:///org/gnome/shell/ui/popupMenu.js";

type EffectType = "snow" | "rain";
type DisplayMode = "wallpaper" | "screen";

const WeatherToggle = GObject.registerClass(
  class WeatherToggle extends QuickMenuToggle {
    private _settings: any;
    private _snowButton: St.Button | null = null;
    private _rainButton: St.Button | null = null;
    private _buttonBox: St.BoxLayout | null = null;
    private _settingsHandler: number | null = null;

    constructor(settings: any) {
      super({ title: "Weather Effect", iconName: "weather-snow-symbolic" });
      this._settings = settings;
      this.checked = true;

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

      this._snowButton.connect("clicked", () => {
        this._settings.set_string("effect-type", "snow");
        this.checked = true;
        this._updateButtons();
        this.iconName = "weather-snow-symbolic";
        log("Weather Effect: Snow selected");
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

      this._rainButton.connect("clicked", () => {
        this._settings.set_string("effect-type", "rain");
        this.checked = true;
        this._updateButtons();
        this.iconName = "weather-showers-symbolic";
        log("Weather Effect: Rain selected");
      });

      this.menu.box.add_child(this._buttonBox);

      this.connect("clicked", () => {
        this.checked = !this.checked;
        this._updateButtons();
        log(
          `Weather Effect: Toggle clicked, checked: ${
            this.checked
          }, effect-type: ${this._settings.get_string("effect-type")}`
        );
      });

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

    vfunc_destroy() {
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
      if (this._toggleHandler) {
        this.disconnect(this._toggleHandler);
        this._toggleHandler = null;
      }
      this._settings = null;
      this._snowButton = null;
      this._rainButton = null;
      this._buttonBox = null;

      super.vfunc_destroy();
    }
  }
);

const WeatherIndicator = GObject.registerClass(
  class WeatherIndicator extends SystemIndicator {
    public toggle: InstanceType<typeof WeatherToggle>;
    private _indicator: any;
    private _settings: any;
    private _settingsHandler: number | null = null;
    private _toggleHandler: number | null = null;

    constructor(settings: any) {
      super();
      this._indicator = this._addIndicator();
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
      this._indicator.iconName = checked
        ? effectType === "snow"
          ? "weather-snow-symbolic"
          : "weather-showers-symbolic"
        : "weather-clear-symbolic";
    }

    vfunc_destroy() {
      if (this._settingsHandler && this._settings) {
        this._settings.disconnect(this._settingsHandler);
        this._settingsHandler = null;
      }
      if (this._toggleHandler && this.toggle) {
        this.toggle.disconnect(this._toggleHandler);
        this._toggleHandler = null;
      }
      if (this.toggle) {
        this.toggle.destroy();
        this.toggle = null;
      }
      this._settings = null;
      this._indicator = null;

      super.vfunc_destroy();
    }
  }
);

interface MonitorActor {
  actor: Clutter.Actor;
  monitor: any;
  particles: St.Widget[];
}

export default class WeatherEffectExtension extends Extension {
  private _settings!: any;
  private _indicator!: InstanceType<typeof WeatherIndicator>;
  private monitorActors: MonitorActor[] = [];
  private timeoutId: number | null = null;
  private _overviewHandler: number | null = null;
  private _overviewHideHandler: number | null = null;
  private _windowHandler: number | null = null;
  private _windowMinimizeHandler: number | null = null;
  private _windowUnminimizeHandler: number | null = null;
  private _debounceTimeout: number | null = null;
  private _monitorsChangedHandler: number | null = null;
  private _workareasChangedHandler: number | null = null;
  private _settingsHandlers: number[] = [];
  private _workspaceChangedHandler: number | null = null;
  private _windowCreatedHandler: number | null = null;
  private _monitorObscuredCache: Map<number, boolean> = new Map();

  enable() {
    log("Weather Effect: Enabling extension");
    this._settings = this.getSettings();
    log(
      `Weather Effect: Initial effect-type: ${this._settings.get_string(
        "effect-type"
      )}`
    );

    this._indicator = new WeatherIndicator(this._settings);
    Main.panel.statusArea.quickSettings.addExternalIndicator(this._indicator);

    this.monitorActors = [];
    this._createMonitorActors();

    this._overviewHandler = Main.overview.connect("showing", () => {
      const mode: DisplayMode = this._settings.get_string("display-mode");
      if (mode === "wallpaper") {
        this._stopAnimation();
        log("Weather Effect: Overview shown, animation stopped");
      } else {
        this._syncToggleState();
        log("Weather Effect: Overview shown, syncing state for screen mode");
      }
    });
    this._overviewHideHandler = Main.overview.connect("hidden", () => {
      this._recomputeObscuration();
      this._syncToggleState();
      log("Weather Effect: Overview hidden, syncing state");
    });

    GLib.timeout_add(GLib.PRIORITY_DEFAULT, 1000, () => {
      this._syncToggleState();
      log("Weather Effect: Checked state after boot");
      return GLib.SOURCE_REMOVE;
    });

    this._indicator.toggle.connect("notify::checked", () => {
      GLib.timeout_add(GLib.PRIORITY_DEFAULT, 50, () => {
        this._syncToggleState();
        log("Weather Effect: Toggle state changed");
        return GLib.SOURCE_REMOVE;
      });
    });

    this._settingsHandlers.push(
      this._settings.connect("changed::display-mode", () => {
        const wasRunning = !!this.timeoutId;
        this._stopAnimation();
        this._attachMonitorActors();
        if (wasRunning) {
          GLib.timeout_add(GLib.PRIORITY_DEFAULT, 100, () => {
            this._syncToggleState();
            return GLib.SOURCE_REMOVE;
          });
        } else {
          this._syncToggleState();
        }
        log("Weather Effect: Display mode changed, actors reattached");
      })
    );

    this._monitorsChangedHandler = Main.layoutManager.connect(
      "monitors-changed",
      () => {
        log("Weather Effect: Monitors changed");
        this._monitorObscuredCache.clear();
        this._destroyMonitorActors();
        this._createMonitorActors();
        this._recomputeObscuration();
        this._syncToggleState();
      }
    );
    this._workareasChangedHandler = global.display.connect(
      "workareas-changed",
      () => {
        log("Weather Effect: Workareas changed");
        this._updateMonitorActors();
        this._recomputeObscuration();
        this._syncToggleState();
      }
    );

    this._workspaceChangedHandler = global.workspace_manager.connect(
      "active-workspace-changed",
      () => {
        log("Weather Effect: Active workspace changed");
        const mode: DisplayMode = this._settings.get_string("display-mode");

        if (mode === "wallpaper") {
          for (const monitorActor of this.monitorActors) {
            if (monitorActor.particles.length > 0) {
              monitorActor.particles.forEach((p) => {
                p.remove_all_transitions();
                p.destroy();
              });
              monitorActor.particles = [];
            }
          }
        }

        if (this._debounceTimeout) GLib.source_remove(this._debounceTimeout);
        this._debounceTimeout = GLib.timeout_add(
          GLib.PRIORITY_DEFAULT,
          100,
          () => {
            this._recomputeObscuration();
            this._syncToggleState();
            this._debounceTimeout = null;
            return GLib.SOURCE_REMOVE;
          }
        );
      }
    );

    this._windowCreatedHandler = global.display.connect(
      "window-created",
      () => {
        if (this._debounceTimeout) GLib.source_remove(this._debounceTimeout);
        this._debounceTimeout = GLib.timeout_add(
          GLib.PRIORITY_DEFAULT,
          100,
          () => {
            this._recomputeObscuration();
            this._syncToggleState();
            this._debounceTimeout = null;
            return GLib.SOURCE_REMOVE;
          }
        );
      }
    );

    this._windowHandler = global.window_manager.connect("size-changed", () => {
      if (this._debounceTimeout) GLib.source_remove(this._debounceTimeout);
      this._debounceTimeout = GLib.timeout_add(
        GLib.PRIORITY_DEFAULT,
        100,
        () => {
          this._recomputeObscuration();
          this._syncToggleState();
          this._debounceTimeout = null;
          return GLib.SOURCE_REMOVE;
        }
      );
    });

    this._windowMinimizeHandler = global.window_manager.connect(
      "minimize",
      () => {
        if (this._debounceTimeout) GLib.source_remove(this._debounceTimeout);
        this._debounceTimeout = GLib.timeout_add(
          GLib.PRIORITY_DEFAULT,
          100,
          () => {
            this._recomputeObscuration();
            this._syncToggleState();
            this._debounceTimeout = null;
            return GLib.SOURCE_REMOVE;
          }
        );
      }
    );

    this._windowUnminimizeHandler = global.window_manager.connect(
      "unminimize",
      () => {
        if (this._debounceTimeout) GLib.source_remove(this._debounceTimeout);
        this._debounceTimeout = GLib.timeout_add(
          GLib.PRIORITY_DEFAULT,
          100,
          () => {
            this._recomputeObscuration();
            this._syncToggleState();
            this._debounceTimeout = null;
            return GLib.SOURCE_REMOVE;
          }
        );
      }
    );
  }

  disable() {
    log("Weather Effect: Disabling extension");
    this._stopAnimation();
    if (this._overviewHandler) {
      Main.overview.disconnect(this._overviewHandler);
      this._overviewHandler = null;
    }
    if (this._overviewHideHandler) {
      Main.overview.disconnect(this._overviewHideHandler);
      this._overviewHideHandler = null;
    }
    if (this._monitorsChangedHandler) {
      Main.layoutManager.disconnect(this._monitorsChangedHandler);
      this._monitorsChangedHandler = null;
    }
    if (this._workareasChangedHandler) {
      global.display.disconnect(this._workareasChangedHandler);
      this._workareasChangedHandler = null;
    }
    if (this._workspaceChangedHandler) {
      global.workspace_manager.disconnect(this._workspaceChangedHandler);
      this._workspaceChangedHandler = null;
    }
    if (this._windowCreatedHandler) {
      global.display.disconnect(this._windowCreatedHandler);
      this._windowCreatedHandler = null;
    }
    if (this._windowHandler) {
      global.window_manager.disconnect(this._windowHandler);
      this._windowHandler = null;
    }
    if (this._windowMinimizeHandler) {
      global.window_manager.disconnect(this._windowMinimizeHandler);
      this._windowMinimizeHandler = null;
    }
    if (this._windowUnminimizeHandler) {
      global.window_manager.disconnect(this._windowUnminimizeHandler);
      this._windowUnminimizeHandler = null;
    }
    if (this._debounceTimeout) {
      GLib.source_remove(this._debounceTimeout);
      this._debounceTimeout = null;
    }
    this._settingsHandlers.forEach((id) => this._settings.disconnect(id));
    this._settingsHandlers = [];

    if (this._indicator) {
      this._indicator.destroy();
      this._indicator = null;
    }

    this._destroyMonitorActors();
  }

  private _createMonitorActors() {
    const monitors = Main.layoutManager.monitors;
    for (let i = 0; i < monitors.length; i++) {
      const monitor = monitors[i];
      const actor = new Clutter.Actor({
        width: monitor.width,
        height: monitor.height,
        reactive: false,
        x: monitor.x,
        y: monitor.y,
      });

      this.monitorActors.push({
        actor: actor,
        monitor: monitor,
        particles: [],
      });
    }
    this._attachMonitorActors();
    this._recomputeObscuration();
  }

  private _attachMonitorActors() {
    const mode: DisplayMode = this._settings.get_string(
      "display-mode"
    ) as DisplayMode;

    for (const monitorActor of this.monitorActors) {
      const parent = monitorActor.actor.get_parent();
      if (parent) parent.remove_child(monitorActor.actor);

      if (mode === "screen") {
        Main.layoutManager.uiGroup.add_child(monitorActor.actor);
      } else {
        Main.layoutManager._backgroundGroup.add_child(monitorActor.actor);
      }
    }
    this._updateMonitorActors();
  }

  private _updateMonitorActors() {
    const monitors = Main.layoutManager.monitors;

    for (let i = this.monitorActors.length - 1; i >= 0; i--) {
      const monitorActor = this.monitorActors[i];
      if (
        !monitors.find(
          (m: any) =>
            m.x === monitorActor.monitor.x && m.y === monitorActor.monitor.y
        )
      ) {
        monitorActor.particles = [];
        monitorActor.actor.destroy();
        this.monitorActors.splice(i, 1);
      }
    }

    for (let i = 0; i < monitors.length; i++) {
      const monitor = monitors[i];
      let monitorActor = this.monitorActors.find(
        (ma) => ma.monitor.x === monitor.x && ma.monitor.y === monitor.y
      );

      if (!monitorActor) {
        const actor = new Clutter.Actor({
          width: monitor.width,
          height: monitor.height,
          reactive: false,
          x: monitor.x,
          y: monitor.y,
        });
        monitorActor = {
          actor: actor,
          monitor: monitor,
          particles: [],
        };
        this.monitorActors.push(monitorActor);
        this._attachMonitorActors();
      } else {
        monitorActor.monitor = monitor;
        monitorActor.actor.set_size(monitor.width, monitor.height);
        monitorActor.actor.set_position(monitor.x, monitor.y);
      }
    }
  }

  private _destroyMonitorActors() {
    for (const monitorActor of this.monitorActors) {
      monitorActor.particles.forEach((p) => {
        p.remove_all_transitions();
        p.destroy();
      });
      monitorActor.particles = [];
      monitorActor.actor.destroy();
    }
    this.monitorActors = [];
  }

  private _syncToggleState() {
    if (!this._indicator || !this._indicator.toggle) return;
    const mode: DisplayMode = this._settings.get_string("display-mode");
    let shouldRun = false;
    if (this._indicator.toggle.checked) {
      if (mode === "screen") {
        shouldRun = true;
      } else {
        if (!Main.overview.visible) {
          const anyActive = this.monitorActors.some((ma) =>
            this._canRunOnMonitor(ma)
          );
          shouldRun = anyActive;
        }
      }
    }
    const isRunning = !!this.timeoutId;

    if (shouldRun && !isRunning) {
      log("Weather Effect: Starting animation");
      this._startAnimation();
    } else if (!shouldRun && isRunning) {
      log("Weather Effect: Stopping animation");
      this._stopAnimation();
    }
  }

  private _startAnimation() {
    if (this.timeoutId) return;

    const mode: DisplayMode = this._settings.get_string("display-mode");
    if (mode === "wallpaper" && Main.overview.visible) return;

    this.timeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 50, () => {
      this._animateParticles();
      return GLib.SOURCE_CONTINUE;
    });
  }

  private _stopAnimation() {
    if (this.timeoutId) {
      GLib.source_remove(this.timeoutId);
      this.timeoutId = null;
    }
    for (const monitorActor of this.monitorActors) {
      monitorActor.particles.forEach((p) => {
        p.remove_all_transitions();
        p.destroy();
      });
      monitorActor.particles = [];
    }
  }

  private _isMonitorObscured(monitor: any): boolean {
    const activeWs = global.workspace_manager.get_active_workspace();
    const workArea = {
      x1: monitor.x,
      y1: monitor.y,
      x2: monitor.x + monitor.width,
      y2: monitor.y + monitor.height,
    };

    const windows = global
      .get_window_actors()
      .map((actor: any) => actor.meta_window as Meta.Window)
      .filter(
        (w) =>
          !w.minimized &&
          w.get_workspace() === activeWs &&
          w.get_monitor() === monitor.index &&
          w.get_window_type() === Meta.WindowType.NORMAL
      );

    if (windows.some((w) => w.is_fullscreen())) {
      return true;
    }

    const rects = windows
      .map((w) => {
        const r = w.get_frame_rect();
        const x1 = Math.max(r.x, workArea.x1);
        const y1 = Math.max(r.y, workArea.y1);
        const x2 = Math.min(r.x + r.width, workArea.x2);
        const y2 = Math.min(r.y + r.height, workArea.y2);
        return x2 > x1 && y2 > y1
          ? { x1, y1, x2, y2 }
          : { x1: 0, y1: 0, x2: 0, y2: 0 };
      })
      .filter((r) => r.x2 > r.x1 && r.y2 > r.y1);

    if (rects.length === 0) {
      return false;
    }

    const covered = this._rectUnionArea(rects);
    const area = monitor.width * monitor.height;
    const ratio = covered / area;
    return ratio >= 0.95;
  }

  private _rectUnionArea(
    rects: { x1: number; y1: number; x2: number; y2: number }[]
  ): number {
    const events: { x: number; y1: number; y2: number; type: number }[] = [];
    for (const r of rects) {
      events.push({ x: r.x1, y1: r.y1, y2: r.y2, type: 1 });
      events.push({ x: r.x2, y1: r.y1, y2: r.y2, type: -1 });
    }
    events.sort((a, b) => a.x - b.x);
    let prevX = 0;
    let area = 0;
    let ys: { y1: number; y2: number }[] = [];
    let started = false;

    const coveredY = (intervals: { y1: number; y2: number }[]) => {
      if (intervals.length === 0) return 0;
      intervals.sort((a, b) => a.y1 - b.y1);
      let total = 0;
      let [cy1, cy2] = [intervals[0].y1, intervals[0].y2];
      for (let i = 1; i < intervals.length; i++) {
        const it = intervals[i];
        if (it.y1 <= cy2) {
          cy2 = Math.max(cy2, it.y2);
        } else {
          total += cy2 - cy1;
          [cy1, cy2] = [it.y1, it.y2];
        }
      }
      total += cy2 - cy1;
      return total;
    };

    for (const e of events) {
      if (!started) {
        prevX = e.x;
        started = true;
      }
      const dx = e.x - prevX;
      if (dx > 0) {
        area += coveredY(ys) * dx;
        prevX = e.x;
      }
      if (e.type === 1) {
        ys.push({ y1: e.y1, y2: e.y2 });
      } else {
        const idx = ys.findIndex((it) => it.y1 === e.y1 && it.y2 === e.y2);
        if (idx !== -1) ys.splice(idx, 1);
      }
    }
    return area;
  }

  private _canRunOnMonitor(monitorActor: MonitorActor): boolean {
    const mode: DisplayMode = this._settings.get_string("display-mode");
    if (Main.overview.visible) return false;

    if (mode === "screen") {
      return true;
    }

    const obscured =
      this._monitorObscuredCache.get(monitorActor.monitor.index) ?? false;
    return !obscured;
  }

  private _recomputeObscuration() {
    const mode: DisplayMode = this._settings.get_string("display-mode");
    if (mode === "screen") {
      this._monitorObscuredCache.clear();
      return;
    }
    for (const ma of this.monitorActors) {
      const wasObscured =
        this._monitorObscuredCache.get(ma.monitor.index) ?? false;
      const nowObscured = this._isMonitorObscured(ma.monitor);
      if (wasObscured !== nowObscured) {
        log(
          `Weather Effect: monitor ${ma.monitor.index} obscured: ${wasObscured} -> ${nowObscured}`
        );
        this._monitorObscuredCache.set(ma.monitor.index, nowObscured);
      }
    }
  }

  private _createParticle(
    type: EffectType,
    monitorActor: MonitorActor,
    screenWidth: number
  ): St.Widget {
    const size = this._settings.get_int("particle-size");
    const snowEmoji = this._settings.get_string("snow-emoji") as string;
    const rainEmoji = this._settings.get_string("rain-emoji") as string;

    let particle: St.Widget;
    if (type === "snow") {
      if (snowEmoji && snowEmoji !== "") {
        particle = new St.Label({
          text: snowEmoji,
          style: `font-size: ${size}px; color: ${this._settings.get_string(
            "snow-color"
          )};`,
          x: Math.random() * screenWidth,
          y: -20,
        });
      } else {
        particle = new St.Widget({
          style: `background-color: ${this._settings.get_string(
            "snow-color"
          )}; width: ${size}px; height: ${size}px; border-radius: ${size}px;`,
          x: Math.random() * screenWidth,
          y: -20,
        });
      }
    } else {
      if (rainEmoji && rainEmoji !== "") {
        particle = new St.Label({
          text: rainEmoji,
          style: `font-size: ${size}px; color: ${this._settings.get_string(
            "rain-color"
          )};`,
          x: Math.random() * screenWidth,
          y: -20,
        });
      } else {
        particle = new St.Widget({
          style: `background-color: ${this._settings.get_string(
            "rain-color"
          )}; width: ${size / 2}px; height: ${size * 2}px;`,
          x: Math.random() * screenWidth,
          y: -20,
        });
      }
    }
    monitorActor.actor.add_child(particle);
    return particle;
  }

  private _updateParticleStyle(particle: any, type: EffectType) {
    const size = this._settings.get_int("particle-size");
    const snowEmoji = this._settings.get_string("snow-emoji") as string;
    const rainEmoji = this._settings.get_string("rain-emoji") as string;

    if (type === "snow") {
      if (snowEmoji && snowEmoji !== "") {
        particle.text = snowEmoji;
        particle.style = `font-size: ${size}px; color: ${this._settings.get_string(
          "snow-color"
        )};`;
      } else {
        particle.style = `background-color: ${this._settings.get_string(
          "snow-color"
        )}; width: ${size}px; height: ${size}px; border-radius: ${size}px;`;
      }
    } else {
      if (rainEmoji && rainEmoji !== "") {
        particle.text = rainEmoji;
        particle.style = `font-size: ${size}px; color: ${this._settings.get_string(
          "rain-color"
        )};`;
      } else {
        particle.style = `background-color: ${this._settings.get_string(
          "rain-color"
        )}; width: ${size / 2}px; height: ${size * 2}px;`;
      }
    }
  }

  private _animateParticles() {
    const type: EffectType = this._settings.get_string("effect-type");
    const totalParticleCount = this._settings.get_int("particle-count");
    const speed = this._settings.get_int("speed");
    const baseDuration =
      speed === 0 ? 3000 : speed === 1 ? 2000 : speed === 2 ? 1000 : 500;

    const particleCountPerMonitor = Math.max(
      1,
      Math.floor(totalParticleCount / this.monitorActors.length)
    );

    for (const monitorActor of this.monitorActors) {
      if (!this._canRunOnMonitor(monitorActor)) {
        if (monitorActor.particles.length > 0) {
          log(
            `Weather Effect: Clearing ${monitorActor.particles.length} particles on monitor ${monitorActor.monitor.index} (obscured or inactive)`
          );
          monitorActor.particles.forEach((p) => {
            p.remove_all_transitions();
            p.destroy();
          });
          monitorActor.particles = [];
        }
        continue;
      }
      const screenWidth = monitorActor.monitor.width;
      const screenHeight = monitorActor.monitor.height;

      while (monitorActor.particles.length > particleCountPerMonitor) {
        const particle = monitorActor.particles.pop();
        if (particle) {
          particle.remove_all_transitions();
          particle.destroy();
        }
      }

      if (monitorActor.particles.length < particleCountPerMonitor) {
        const toAdd = particleCountPerMonitor - monitorActor.particles.length;
        for (let i = 0; i < toAdd; i++) {
          const particle = this._createParticle(
            type,
            monitorActor,
            screenWidth
          );
          monitorActor.particles.push(particle);
          this._animateSingleParticle(
            particle,
            monitorActor,
            screenHeight,
            baseDuration
          );
        }
      }

      for (let i = monitorActor.particles.length - 1; i >= 0; i--) {
        const particle: any = monitorActor.particles[i];
        const snowEmoji = this._settings.get_string("snow-emoji") as string;
        const rainEmoji = this._settings.get_string("rain-emoji") as string;

        let isCorrectType = false;
        if (type === "snow") {
          if (
            snowEmoji &&
            particle instanceof St.Label &&
            particle.text === snowEmoji
          ) {
            isCorrectType = true;
          } else if (
            !snowEmoji &&
            particle instanceof St.Widget &&
            !(particle instanceof St.Label)
          ) {
            isCorrectType = true;
          }
        } else {
          if (
            rainEmoji &&
            particle instanceof St.Label &&
            particle.text === rainEmoji
          ) {
            isCorrectType = true;
          } else if (
            !rainEmoji &&
            particle instanceof St.Widget &&
            !(particle instanceof St.Label)
          ) {
            isCorrectType = true;
          }
        }

        if (!isCorrectType) {
          particle.remove_all_transitions();
          particle.destroy();
          monitorActor.particles.splice(i, 1);
          const newParticle = this._createParticle(
            type,
            monitorActor,
            screenWidth
          );
          monitorActor.particles.push(newParticle);
          this._animateSingleParticle(
            newParticle,
            monitorActor,
            screenHeight,
            baseDuration
          );
        }
      }
    }
  }

  private _animateSingleParticle(
    particle: any,
    monitorActor: MonitorActor,
    screenHeight: number,
    baseDuration: number
  ) {
    const randomOffset = Math.random() * 500;
    particle.show();
    particle.ease({
      y: screenHeight + 20,
      duration: baseDuration + randomOffset,
      mode: Clutter.AnimationMode.LINEAR,
      onComplete: () => {
        particle.y = -20;
        particle.x = Math.random() * monitorActor.monitor.width;
        const updatedType: EffectType =
          this._settings.get_string("effect-type");
        const updatedTotalParticleCount =
          this._settings.get_int("particle-count");
        const updatedParticleCountPerMonitor = Math.max(
          1,
          Math.floor(updatedTotalParticleCount / this.monitorActors.length)
        );
        const updatedSpeed = this._settings.get_int("speed");
        const updatedBaseDuration =
          updatedSpeed === 0
            ? 3000
            : updatedSpeed === 1
            ? 2000
            : updatedSpeed === 2
            ? 1000
            : 500;

        this._updateParticleStyle(particle, updatedType);
        const mode: DisplayMode = this._settings.get_string("display-mode");
        const canRun =
          this._indicator &&
          this._indicator.toggle &&
          this._indicator.toggle.checked &&
          (mode === "screen" || this._canRunOnMonitor(monitorActor));
        if (
          canRun &&
          monitorActor.particles.length <= updatedParticleCountPerMonitor
        ) {
          this._animateSingleParticle(
            particle,
            monitorActor,
            screenHeight,
            updatedBaseDuration
          );
        } else {
          particle.remove_all_transitions();
          particle.destroy();
          const index = monitorActor.particles.indexOf(particle);
          if (index !== -1) monitorActor.particles.splice(index, 1);
        }
      },
    });
  }
}
