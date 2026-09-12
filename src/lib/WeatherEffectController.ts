import type Gio from "gi://Gio";
import GLib from "gi://GLib";
import * as Main from "resource:///org/gnome/shell/ui/main.js";

import { WeatherIndicator } from "./UIManager.js";
import { MonitorManager } from "./MonitorManager.js";
import { ObscurationManager } from "./ObscurationManager.js";
import { ParticleManager, type EffectType } from "./ParticleManager.js";

type DisplayMode = "wallpaper" | "screen";

/**
 * Main controller for the extension.
 * Coordinates different managers and safely handles GNOME Shell lifecycle.
 */
export class WeatherEffectController {
  private _settings: Gio.Settings | null;
  private _indicator: InstanceType<typeof WeatherIndicator> | null = null;
  private _monitorManager: MonitorManager | null = null;
  private _obscurationManager: ObscurationManager | null = null;
  private _particleManager: ParticleManager | null = null;
  private _isEnabled: boolean = false;

  // Centralized timeout tracking to prevent memory leaks
  private _timeouts: Set<number> = new Set();
  private timeoutId: number | null = null;
  private _debounceTimeout: number | null = null;
  private _fullscreenRefreshPending: boolean = false;
  private _grabDragTimeout: number | null = null;

  constructor(settings: Gio.Settings) {
    this._settings = settings;
  }

  /**
   * Helper method to create a GLib timeout and automatically track its ID
   * in the _timeouts set for clean removal upon disabling.
   */
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

  /**
   * Remove a specific tracked timeout safely.
   */
  private _removeTimeout(id: number | null): null {
    if (id !== null && this._timeouts.has(id)) {
      GLib.source_remove(id);
      this._timeouts.delete(id);
    }
    return null;
  }

  /**
   * Enable the extension.
   */
  enable() {
    this._isEnabled = true;

    // Initialize managers
    this._monitorManager = new MonitorManager(this._settings as Gio.Settings);
    this._obscurationManager = new ObscurationManager(
      this._settings as Gio.Settings,
    );
    this._particleManager = new ParticleManager(
      this._settings as Gio.Settings,
    );

    // Create UI if configured
    if (
      (this._settings as Gio.Settings).get_boolean("show-in-quick-settings")
    ) {
      this._createIndicator();
    }

    // Create monitor actors
    this._monitorManager.createMonitorActors();
    this._obscurationManager.recomputeObscuration(
      this._monitorManager.getMonitorActors(),
    );

    // Set up event handlers using connectObject
    this._setupEventHandlers();

    this._refreshFullscreenStateAndReconcile();
  }

  /**
   * Disable the extension.
   */
  disable() {
    this._isEnabled = false;

    this._stopAllTimeouts();
    this._disconnectAllHandlers();
    this._stopAnimation();
    this._destroyUIAndManagers();
  }

  /**
   * Create the Quick Settings indicator.
   */
  private _createIndicator() {
    if (this._indicator || !this._settings) return;

    this._indicator = new (WeatherIndicator as typeof WeatherIndicator & {
      new (settings: Gio.Settings): InstanceType<typeof WeatherIndicator>;
    })(this._settings);
    Main.panel.statusArea.quickSettings.addExternalIndicator(
      this._indicator as any,
    );
  }

  /**
   * Destroy the Quick Settings indicator.
   */
  private _destroyIndicator() {
    if (this._indicator) {
      this._indicator.destroy();
      this._indicator = null;
    }
  }

  /**
   * Handle show-in-quick-settings setting change.
   */
  private _onShowInQuickSettingsChanged() {
    if (!this._isEnabled || !this._settings) return;

    const show = this._settings.get_boolean("show-in-quick-settings");

    if (show && !this._indicator) {
      this._createIndicator();
    } else if (!show && this._indicator) {
      this._destroyIndicator();
    }
  }

  /**
   * Set up all event handlers using GNOME's connectObject pattern.
   */
  private _setupEventHandlers() {
    // Overview events
    Main.overview.connectObject(
      "showing",
      () => {
        if (!this._isEnabled) return;
        this._reconcileAnimation(true);
      },
      this,
    );

    Main.overview.connectObject(
      "hidden",
      () => {
        if (!this._isEnabled) return;
        this._recomputeObscuration();
        this._reconcileAnimation();
      },
      this,
    );

    // Settings events
    if (this._settings) {
      this._settings.connectObject(
        "changed::active",
        () => {
          if (!this._isEnabled) return;
          this._refreshFullscreenStateAndReconcile();
        },
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

          this._stopAnimation();
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
    }

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
        if (!this._isEnabled) return;
        if (!this._monitorManager?.updateMonitorActors()) {
          this.timeoutId = this._removeTimeout(this.timeoutId);
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
        const mode = (this._settings as Gio.Settings).get_string(
          "display-mode",
        ) as DisplayMode;
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
            this._reconcileAnimation();
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

  /**
   * Stop and clear all tracked timeouts.
   */
  private _stopAllTimeouts() {
    this._timeouts.forEach((id) => GLib.source_remove(id));
    this._timeouts.clear();

    this.timeoutId = null;
    this._debounceTimeout = null;
    this._fullscreenRefreshPending = false;
    this._grabDragTimeout = null;
  }

  /**
   * Disconnect all handlers automatically by target object.
   */
  private _disconnectAllHandlers() {
    if (this._settings) {
      this._settings.disconnectObject(this);
    }

    Main.overview.disconnectObject(this);
    Main.layoutManager.disconnectObject(this);
    global.display.disconnectObject(this);
    global.workspace_manager.disconnectObject(this);
    global.window_manager.disconnectObject(this);
  }

  /**
   * Destroy UI components and managers.
   */
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
    this._settings = null;
  }

  /**
   * Debounced recompute of obscuration.
   */
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
        this._reconcileAnimation();
      }
      this._debounceTimeout = null;
      return GLib.SOURCE_REMOVE;
    });
  }

  private _refreshFullscreenStateAndReconcile() {
    if (!this._isEnabled || !this._obscurationManager) return;
    if (!this._monitorManager?.hasAvailableContainer()) {
      this._fullscreenRefreshPending = false;
      this.timeoutId = this._removeTimeout(this.timeoutId);
      this._particleManager?.clearAll();
      return;
    }

    this._fullscreenRefreshPending = false;
    this._obscurationManager.refreshFullscreenState();
    this._reconcileAnimation();
  }

  /**
   * Reconcile particles and the management source with current monitor state.
   */
  private _reconcileAnimation(isOverviewVisible?: boolean) {
    if (!this._monitorManager?.hasAvailableContainer()) {
      this.timeoutId = this._removeTimeout(this.timeoutId);
      this._particleManager?.clearAll();
      return;
    }

    const overviewVisible = isOverviewVisible ?? Main.overview.visible;
    const canRender = this._maintainParticles(overviewVisible);

    if (canRender) {
      this._startAnimation();
    } else {
      this.timeoutId = this._removeTimeout(this.timeoutId);
    }
  }

  private _maintainParticles(isOverviewVisible?: boolean): boolean {
    if (
      !this._isEnabled ||
      !this._monitorManager ||
      !this._monitorManager.hasAvailableContainer() ||
      !this._obscurationManager ||
      !this._particleManager ||
      !this._settings
    ) {
      return false;
    }

    const overviewVisible = isOverviewVisible ?? Main.overview.visible;
    const monitorActors = this._monitorManager.getMonitorActors();
    const runnableMonitorActors =
      this._obscurationManager.getRunnableMonitorActors(
        monitorActors,
        overviewVisible,
      );

    const type = this._settings.get_string("effect-type") as EffectType;
    const count = this._settings.get_int("particle-count");
    const speed = this._settings.get_int("speed");
    const targets = runnableMonitorActors.map((monitorActor) => ({
      monitorActor,
      type,
      count,
      speed,
    }));

    this._particleManager.reconcile(monitorActors, targets);

    if (runnableMonitorActors.length === 0) {
      return false;
    }

    return true;
  }

  /**
   * Start particle animation loop.
   */
  private _startAnimation() {
    if (
      this.timeoutId ||
      !this._isEnabled ||
      !this._monitorManager?.hasAvailableContainer() ||
      !this._settings
    )
      return;

    this.timeoutId = this._addTimeout(GLib.PRIORITY_DEFAULT, 50, () => {
      if (!this._isEnabled) {
        this.timeoutId = null;
        return GLib.SOURCE_REMOVE;
      }
      if (!this._maintainParticles()) {
        this.timeoutId = null;
        return GLib.SOURCE_REMOVE;
      }
      return GLib.SOURCE_CONTINUE;
    });
  }

  /**
   * Stop animation and retire all particles.
   */
  private _stopAnimation() {
    this.timeoutId = this._removeTimeout(this.timeoutId);
    this._particleManager?.clearAll();
  }

  /**
   * Recompute obscuration for all active monitors.
   */
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
