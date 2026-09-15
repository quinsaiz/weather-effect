import type Gio from "gi://Gio";
import GLib from "gi://GLib";
import * as Main from "resource:///org/gnome/shell/ui/main.js";

import { WeatherIndicator } from "./QuickSettings.js";
import { MonitorManager } from "./MonitorManager.js";
import { ObscurationManager } from "./ObscurationManager.js";
import {
  ParticleManager,
  type ParticleTargetValues,
} from "./ParticleManager.js";
import {
  PARTICLE_PROFILES,
  resolveActiveParticleProfile,
  resolveParticleProfileId,
  resolveParticleSpeedKey,
  type ParticleEffectType,
  type ParticleProfileCountKey,
  type ParticleProfileSizeKey,
  type ParticleSpeedKey,
} from "./ParticleProfiles.js";

type DisplayMode = "wallpaper" | "screen";

/**
 * Coordinates settings, Shell events, monitor layers, particles, and Quick Settings.
 */
export class WeatherEffectController {
  private readonly _settings: Gio.Settings;
  private _indicator: InstanceType<typeof WeatherIndicator> | null = null;
  private _monitorManager: MonitorManager | null = null;
  private _obscurationManager: ObscurationManager | null = null;
  private _particleManager: ParticleManager | null = null;
  private _isEnabled: boolean = false;

  // Every GLib source is owned here so disable can remove it before manager teardown.
  private _timeouts: Set<number> = new Set();
  private _debounceTimeout: number | null = null;
  private _fullscreenRefreshPending: boolean = false;
  private _grabDragTimeout: number | null = null;

  constructor(settings: Gio.Settings) {
    this._settings = settings;
  }

  private _addTimeout(
    priority: number,
    interval: number,
    callback: () => boolean,
  ): number {
    const id = GLib.timeout_add(priority, interval, () => {
      const result = callback();
      if (result === GLib.SOURCE_REMOVE) {
        this._timeouts.delete(id);
      }
      return result;
    });

    this._timeouts.add(id);
    return id;
  }

  private _removeTimeout(id: number | null): null {
    if (id !== null && this._timeouts.has(id)) {
      GLib.source_remove(id);
      this._timeouts.delete(id);
    }
    return null;
  }

  enable() {
    this._isEnabled = true;

    this._monitorManager = new MonitorManager(this._settings);
    this._obscurationManager = new ObscurationManager(this._settings);
    this._particleManager = new ParticleManager(this._settings);

    if (this._settings.get_boolean("show-in-quick-settings")) {
      this._createIndicator();
    }

    this._monitorManager.createMonitorActors();
    this._obscurationManager.recomputeObscuration(
      this._monitorManager.getMonitorActors(),
    );

    this._setupEventHandlers();

    this._refreshFullscreenStateAndReconcile();
  }

  disable() {
    this._isEnabled = false;

    this._stopAllTimeouts();
    this._disconnectAllHandlers();
    this._particleManager?.clearAll();
    this._destroyUIAndManagers();
  }

  private _createIndicator() {
    if (this._indicator) return;

    this._indicator = new (WeatherIndicator as typeof WeatherIndicator & {
      new (settings: Gio.Settings): InstanceType<typeof WeatherIndicator>;
    })(this._settings);
    Main.panel.statusArea.quickSettings.addExternalIndicator(
      this._indicator as any,
    );
  }

  private _destroyIndicator() {
    if (this._indicator) {
      this._indicator.destroy();
      this._indicator = null;
    }
  }

  private _onShowInQuickSettingsChanged() {
    const show = this._settings.get_boolean("show-in-quick-settings");

    if (show && !this._indicator) {
      this._createIndicator();
    } else if (!show && this._indicator) {
      this._destroyIndicator();
    }
  }

  private _setupEventHandlers() {
    // Overview events
    Main.overview.connectObject(
      "showing",
      () => {
        if (!this._isEnabled) return;
        this._reconcileParticles(true);
      },
      this,
    );

    Main.overview.connectObject(
      "hidden",
      () => {
        if (!this._isEnabled) return;
        this._recomputeObscuration();
        this._reconcileParticles();
      },
      this,
    );

    // Settings events
    this._settings.connectObject(
      "changed::active",
      () => {
        if (!this._isEnabled) return;
        this._refreshFullscreenStateAndReconcile();
      },
      this,
    );

    this._settings.connectObject(
      "changed::snow-default-particle-count",
      () => this._onProfileCountChanged("snow-default-particle-count"),
      "changed::snow-emoji-particle-count",
      () => this._onProfileCountChanged("snow-emoji-particle-count"),
      "changed::rain-default-particle-count",
      () => this._onProfileCountChanged("rain-default-particle-count"),
      "changed::rain-emoji-particle-count",
      () => this._onProfileCountChanged("rain-emoji-particle-count"),
      "changed::snow-default-particle-size",
      () => this._onProfileSizeChanged("snow-default-particle-size"),
      "changed::snow-emoji-particle-size",
      () => this._onProfileSizeChanged("snow-emoji-particle-size"),
      "changed::rain-default-particle-size",
      () => this._onProfileSizeChanged("rain-default-particle-size"),
      "changed::rain-emoji-particle-size",
      () => this._onProfileSizeChanged("rain-emoji-particle-size"),
      this,
    );

    this._settings.connectObject(
      "changed::snow-speed",
      () => this._onSpeedChanged("snow-speed"),
      "changed::rain-speed",
      () => this._onSpeedChanged("rain-speed"),
      this,
    );

    this._settings.connectObject(
      "changed::effect-type",
      () => {
        if (!this._isEnabled) return;
        this._reconcileParticles();
      },
      "changed::snow-color",
      () => this._onEffectColorChanged("snow"),
      "changed::snow-emoji",
      () => this._onEffectEmojiChanged("snow"),
      "changed::rain-color",
      () => this._onEffectColorChanged("rain"),
      "changed::rain-emoji",
      () => this._onEffectEmojiChanged("rain"),
      this,
    );

    this._settings.connectObject(
      "changed::show-in-quick-settings",
      () => {
        if (!this._isEnabled) return;
        this._onShowInQuickSettingsChanged();
      },
      this,
    );

    this._settings.connectObject(
      "changed::display-mode",
      () => {
        if (!this._isEnabled || !this._monitorManager) return;

        this._particleManager?.clearAll();
        this._monitorManager?.attachMonitorActors();
        this._recomputeObscuration();
        this._refreshFullscreenStateAndReconcile();
      },
      this,
    );

    this._settings.connectObject(
      "changed::pause-on-fullscreen",
      () => {
        if (!this._isEnabled || !this._monitorManager || !this._obscurationManager) return;
        this._recomputeObscuration();
        this._refreshFullscreenStateAndReconcile();
      },
      this,
    );

    // Monitor and Layout events
    Main.layoutManager.connectObject(
      "monitors-changed",
      () => {
        if (!this._isEnabled) return;
        this._particleManager?.clearAll();
        this._monitorManager?.rebuildMonitorActors();
        this._recomputeObscuration();
        this._refreshFullscreenStateAndReconcile();
      },
      this,
    );

    global.display.connectObject(
      "workareas-changed",
      () => {
        // Logout can remove Shell containers before this signal is delivered.
        if (!this._isEnabled) return;
        if (!this._monitorManager?.updateMonitorActors()) {
          this._particleManager?.clearAll();
          return;
        }
        this._recomputeObscuration();
        this._refreshFullscreenStateAndReconcile();
      },
      this,
    );

    // Workspace events
    global.workspace_manager.connectObject(
      "active-workspace-changed",
      () => {
        if (!this._isEnabled) return;
        const mode = this._settings.get_string("display-mode") as DisplayMode;
        if (mode === "wallpaper") {
          this._particleManager?.clearAll();
        }
        this._debouncedRecompute(true);
      },
      this,
    );

    // Window and Display events
    global.display.connectObject(
      "window-created",
      () => {
        if (!this._isEnabled) return;
        this._debouncedRecompute(true);
      },
      this,
    );

    global.window_manager.connectObject(
      "size-changed",
      () => {
        if (!this._isEnabled) return;
        this._debouncedRecompute();
      },
      this,
    );

    global.window_manager.connectObject(
      "minimize",
      () => {
        if (!this._isEnabled) return;
        this._debouncedRecompute(true);
      },
      this,
    );

    global.window_manager.connectObject(
      "unminimize",
      () => {
        if (!this._isEnabled) return;
        this._debouncedRecompute(true);
      },
      this,
    );

    global.window_manager.connectObject(
      "destroy",
      () => {
        if (!this._isEnabled) return;
        this._debouncedRecompute(true);
      },
      this,
    );

    global.display.connectObject(
      "notify::focus-window",
      () => {
        if (!this._isEnabled) return;
        this._debouncedRecompute();
      },
      this,
    );

    global.display.connectObject(
      "in-fullscreen-changed",
      () => {
        if (!this._isEnabled) return;
        this._debouncedRecompute(true);
      },
      this,
    );

    global.display.connectObject(
      "window-entered-monitor",
      () => {
        if (!this._isEnabled) return;
        this._debouncedRecompute(true);
      },
      this,
    );

    global.display.connectObject(
      "window-left-monitor",
      () => {
        if (!this._isEnabled) return;
        this._debouncedRecompute(true);
      },
      this,
    );

    // Grab operation events (window dragging/resizing)
    global.display.connectObject(
      "grab-op-begin",
      () => {
        if (
          !this._isEnabled ||
          !this._monitorManager?.hasAvailableContainer()
        )
          return;
        this._grabDragTimeout = this._removeTimeout(this._grabDragTimeout);
        this._grabDragTimeout = this._addTimeout(
          GLib.PRIORITY_DEFAULT,
          200,
          () => {
            if (
              !this._isEnabled ||
              !this._monitorManager?.hasAvailableContainer()
            ) {
              this._grabDragTimeout = null;
              return GLib.SOURCE_REMOVE;
            }
            this._recomputeObscuration();
            this._reconcileParticles();
            return GLib.SOURCE_CONTINUE;
          },
        );
      },
      this,
    );

    global.display.connectObject(
      "grab-op-end",
      () => {
        if (!this._isEnabled) return;
        this._grabDragTimeout = this._removeTimeout(this._grabDragTimeout);
        this._debouncedRecompute();
      },
      this,
    );
  }

  private _stopAllTimeouts() {
    this._timeouts.forEach((id) => GLib.source_remove(id));
    this._timeouts.clear();

    this._debounceTimeout = null;
    this._fullscreenRefreshPending = false;
    this._grabDragTimeout = null;
  }

  private _onProfileCountChanged(key: ParticleProfileCountKey) {
    if (
      !this._isEnabled ||
      resolveActiveParticleProfile(this._settings).countKey !== key
    ) {
      return;
    }

    this._reconcileParticles();
  }

  private _onProfileSizeChanged(key: ParticleProfileSizeKey) {
    if (
      !this._isEnabled ||
      resolveActiveParticleProfile(this._settings).sizeKey !== key
    ) {
      return;
    }

    this._refreshParticleAppearance();
  }

  private _onSpeedChanged(key: ParticleSpeedKey) {
    if (!this._isEnabled) return;

    const effectType = this._settings.get_string(
      "effect-type",
    ) as ParticleEffectType;
    if (resolveParticleSpeedKey(effectType) !== key) return;

    this._particleManager?.retimeSpeed(this._settings.get_int(key));
  }

  private _onEffectEmojiChanged(effectType: ParticleEffectType) {
    if (
      !this._isEnabled ||
      this._settings.get_string("effect-type") !== effectType
    ) {
      return;
    }

    this._reconcileParticles();
  }

  private _onEffectColorChanged(effectType: ParticleEffectType) {
    if (
      !this._isEnabled ||
      this._settings.get_string("effect-type") !== effectType
    ) {
      return;
    }

    this._refreshParticleAppearance();
  }

  private _refreshParticleAppearance() {
    this._particleManager?.refreshAppearance(this._readParticleTargetValues());
  }

  private _disconnectAllHandlers() {
    this._settings.disconnectObject(this);

    Main.overview.disconnectObject(this);
    Main.layoutManager.disconnectObject(this);
    global.display.disconnectObject(this);
    global.workspace_manager.disconnectObject(this);
    global.window_manager.disconnectObject(this);
  }

  private _destroyUIAndManagers() {
    this._destroyIndicator();

    if (this._monitorManager) {
      this._monitorManager.destroy();
      this._monitorManager = null;
    }

    if (this._obscurationManager) {
      this._obscurationManager.clear();
      this._obscurationManager = null;
    }

    this._particleManager?.destroy();
    this._particleManager = null;
  }

  private _debouncedRecompute(refreshFullscreenState = false) {
    if (!this._monitorManager?.hasAvailableContainer()) return;

    this._fullscreenRefreshPending ||= refreshFullscreenState;
    this._debounceTimeout = this._removeTimeout(this._debounceTimeout);
    this._debounceTimeout = this._addTimeout(GLib.PRIORITY_DEFAULT, 100, () => {
      if (
        !this._isEnabled ||
        !this._monitorManager?.hasAvailableContainer()
      ) {
        this._debounceTimeout = null;
        this._fullscreenRefreshPending = false;
        return GLib.SOURCE_REMOVE;
      }
      this._recomputeObscuration();
      if (this._fullscreenRefreshPending) {
        this._fullscreenRefreshPending = false;
        this._refreshFullscreenStateAndReconcile();
      } else {
        this._reconcileParticles();
      }
      this._debounceTimeout = null;
      return GLib.SOURCE_REMOVE;
    });
  }

  private _refreshFullscreenStateAndReconcile() {
    if (!this._isEnabled || !this._obscurationManager) return;
    if (!this._monitorManager?.hasAvailableContainer()) {
      this._fullscreenRefreshPending = false;
      this._particleManager?.clearAll();
      return;
    }

    this._fullscreenRefreshPending = false;
    this._obscurationManager.refreshFullscreenState();
    this._reconcileParticles();
  }

  private _reconcileParticles(isOverviewVisible?: boolean) {
    if (
      !this._isEnabled ||
      !this._monitorManager ||
      !this._obscurationManager ||
      !this._particleManager
    ) {
      return;
    }

    if (!this._monitorManager.hasAvailableContainer()) {
      this._particleManager.clearAll();
      return;
    }

    const overviewVisible = isOverviewVisible ?? Main.overview.visible;
    const monitorActors = this._monitorManager.getMonitorActors();
    const runnableMonitorActors =
      this._obscurationManager.getRunnableMonitorActors(
        monitorActors,
        overviewVisible,
      );

    const targetValues = this._readParticleTargetValues();
    const targets = runnableMonitorActors.map((monitorActor) => ({
      monitorActor,
      ...targetValues,
    }));

    this._particleManager.reconcile(monitorActors, targets);
  }

  private _readParticleTargetValues(): ParticleTargetValues {
    const type = this._settings.get_string(
      "effect-type",
    ) as ParticleEffectType;
    const snowEmoji = this._settings.get_string("snow-emoji");
    const rainEmoji = this._settings.get_string("rain-emoji");
    const profile =
      PARTICLE_PROFILES[
        resolveParticleProfileId(type, snowEmoji, rainEmoji)
      ];
    const speedKey = resolveParticleSpeedKey(type);
    const emoji = (type === "snow" ? snowEmoji : rainEmoji).trim();

    return {
      type,
      count: this._settings.get_int(profile.countKey),
      size: this._settings.get_int(profile.sizeKey),
      speed: this._settings.get_int(speedKey),
      emoji: emoji === "" ? null : emoji,
      color: this._settings.get_string(`${type}-color`),
    };
  }

  private _recomputeObscuration() {
    if (
      !this._isEnabled ||
      !this._obscurationManager ||
      !this._monitorManager?.hasAvailableContainer()
    )
      return;
    this._obscurationManager.recomputeObscuration(
      this._monitorManager.getMonitorActors(),
    );
  }

}
