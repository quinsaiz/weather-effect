import GLib from "gi://GLib";
import * as Main from "resource:///org/gnome/shell/ui/main.js";

import { WeatherIndicator } from "./UIManager.js";
import { MonitorManager, MonitorActor } from "./MonitorManager.js";
import { ObscurationManager } from "./ObscurationManager.js";
import { ParticleManager } from "./ParticleManager.js";
import { logDebug, logError } from "./Debug.js";

type EffectType = "snow" | "rain";
type DisplayMode = "wallpaper" | "screen";

/**
 * Main controller for the extension.
 * Coordinates the different managers and handles lifecycle.
 */
export class WeatherEffectController {
  private _settings: any;
  private _indicator: any = null;
  private _monitorManager: MonitorManager | null = null;
  private _obscurationManager: ObscurationManager | null = null;
  private _particleManager: ParticleManager | null = null;
  private _isEnabled: boolean = false;

  private timeoutId: number | null = null;
  private _bootTimeout: number | null = null;
  private _toggleTimeout: number | null = null;
  private _displayModeTimeout: number | null = null;
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
  private _notifyFocusWindowHandler: number | null = null;
  private _notifyFullscreenHandler: number | null = null;
  private _grabOpBeginHandler: number | null = null;
  private _grabDragTimeout: number | null = null;
  private _grabOpEndHandler: number | null = null;
  private _toggleHandler: number | null = null;
  private _showInQsHandler: number | null = null;

  constructor(settings: any) {
    this._settings = settings;
  }

  /**
   * Enable the extension
   */
  enable() {
    logDebug("Starting extension");

    this._isEnabled = true;

    // Initialize managers
    this._monitorManager = new MonitorManager(this._settings);
    this._obscurationManager = new ObscurationManager(this._settings);
    this._particleManager = new ParticleManager(
      this._settings,
      this._onParticleAnimationComplete.bind(this),
    );

    // Create UI (only if show-in-quick-settings is enabled)
    if (this._settings.get_boolean("show-in-quick-settings")) {
      this._createIndicator();
    }

    // Create monitor actors
    this._monitorManager.createMonitorActors();
    this._obscurationManager.recomputeObscuration(
      this._monitorManager.getMonitorActors(),
    );

    // Set up event handlers
    this._setupEventHandlers();

    // Sync state after boot
    this._bootTimeout = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 1000, () => {
      this._syncToggleState();
      this._bootTimeout = null;
      return GLib.SOURCE_REMOVE;
    });
  }

  /**
   * Disable the extension
   */
  disable() {
    logDebug("Stopping extension");

    this._isEnabled = false;

    this._stopAllTimeouts();

    this._disconnectAllHandlers();

    this._stopAnimation();

    this._destroyUIAndManagers();
  }

  /**
   * Create the Quick Settings indicator and connect its toggle handler
   */
  private _createIndicator() {
    if (this._indicator || !this._settings) return;

    this._indicator = new WeatherIndicator(this._settings);
    Main.panel.statusArea.quickSettings.addExternalIndicator(this._indicator);
    this._connectToggleHandler();
  }

  /**
   * Destroy the Quick Settings indicator and disconnect its toggle handler
   */
  private _destroyIndicator() {
    this._disconnectToggleHandler();

    if (this._indicator) {
      this._indicator.destroy();
      this._indicator = null;
    }
  }

  /**
   * Connect the toggle's notify::checked handler
   */
  private _connectToggleHandler() {
    if (this._toggleHandler || !this._indicator?.toggle) return;

    this._toggleHandler = this._indicator.toggle.connect(
      "notify::checked",
      () => {
        if (!this._isEnabled) return;

        if (this._toggleTimeout) GLib.source_remove(this._toggleTimeout);

        this._toggleTimeout = GLib.timeout_add(
          GLib.PRIORITY_DEFAULT,
          50,
          () => {
            if (!this._isEnabled) {
              this._toggleTimeout = null;
              return GLib.SOURCE_REMOVE;
            }
            this._syncToggleState();
            this._toggleTimeout = null;
            return GLib.SOURCE_REMOVE;
          },
        );
      },
    );
  }

  /**
   * Disconnect the toggle's notify::checked handler
   */
  private _disconnectToggleHandler() {
    if (this._toggleHandler && this._indicator?.toggle) {
      try {
        this._indicator.toggle.disconnect(this._toggleHandler);
      } catch (_e) {}
      this._toggleHandler = null;
    }
  }

  /**
   * Handle show-in-quick-settings setting change
   */
  private _onShowInQuickSettingsChanged() {
    if (!this._isEnabled || !this._settings) return;

    const show = this._settings.get_boolean("show-in-quick-settings");

    if (show && !this._indicator) {
      this._createIndicator();

      // Sync the toggle state with current GSettings "active" value
      const toggle = this._getSafeToggle();
      if (toggle) {
        toggle.checked = this._settings.get_boolean("active");
      }
    } else if (!show && this._indicator) {
      this._destroyIndicator();
    }

    this._syncToggleState();
  }

  /**
   * Set up all event handlers
   */
  private _setupEventHandlers() {
    // Overview
    this._overviewHandler = Main.overview.connect("showing", () => {
      if (!this._isEnabled) return;
      const mode: DisplayMode = this._settings.get_string("display-mode");
      if (mode === "wallpaper") this._stopAnimation();
    });

    this._overviewHideHandler = Main.overview.connect("hidden", () => {
      if (!this._isEnabled) return;
      this._recomputeObscuration();
      this._syncToggleState();
    });

    // Toggle (connect only if indicator exists)
    this._connectToggleHandler();

    // Settings
    if (this._settings) {
      // Show in Quick Settings
      this._showInQsHandler = this._settings.connect(
        "changed::show-in-quick-settings",
        () => {
          if (!this._isEnabled) return;
          this._onShowInQuickSettingsChanged();
        },
      );

      // Display mode
      this._settingsHandlers.push(
        this._settings.connect("changed::display-mode", () => {
          if (!this._isEnabled || !this._monitorManager) return;

          const wasRunning = !!this.timeoutId;
          this._stopAnimation();
          this._monitorManager?.attachMonitorActors();

          if (wasRunning) {
            if (this._displayModeTimeout)
              GLib.source_remove(this._displayModeTimeout);

            this._displayModeTimeout = GLib.timeout_add(
              GLib.PRIORITY_DEFAULT,
              100,
              () => {
                if (!this._isEnabled) {
                  this._displayModeTimeout = null;
                  return GLib.SOURCE_REMOVE;
                }
                this._syncToggleState();
                this._displayModeTimeout = null;
                return GLib.SOURCE_REMOVE;
              },
            );
          } else {
            this._syncToggleState();
          }
        }),

        // Pause on fullscreen
        this._settings.connect("changed::pause-on-fullscreen", () => {
          if (
            !this._isEnabled ||
            !this._monitorManager ||
            !this._obscurationManager
          )
            return;

          this._recomputeObscuration();
          this._syncToggleState();
        }),
      );
    }

    // Monitors
    this._monitorsChangedHandler = Main.layoutManager.connect(
      "monitors-changed",
      () => {
        if (!this._isEnabled) return;
        this._monitorManager?.destroy();
        this._monitorManager?.createMonitorActors();
        this._recomputeObscuration();
        this._syncToggleState();
      },
    );

    this._workareasChangedHandler = global.display.connect(
      "workareas-changed",
      () => {
        if (!this._isEnabled) return;
        this._monitorManager?.updateMonitorActors();
        this._recomputeObscuration();
        this._syncToggleState();
      },
    );

    // Workspace
    this._workspaceChangedHandler = global.workspace_manager.connect(
      "active-workspace-changed",
      () => {
        if (!this._isEnabled) return;

        const mode: DisplayMode = this._settings.get_string("display-mode");
        if (mode === "wallpaper") {
          this._monitorManager?.getMonitorActors().forEach((ma) => {
            this._monitorManager?.clearParticles(ma);
          });
        }

        this._debouncedRecompute();
      },
    );

    // Windows
    this._windowCreatedHandler = global.display.connect(
      "window-created",
      () => {
        if (!this._isEnabled) return;
        this._debouncedRecompute();
      },
    );

    this._windowHandler = global.window_manager.connect("size-changed", () => {
      if (!this._isEnabled) return;
      this._debouncedRecompute();
    });

    this._windowMinimizeHandler = global.window_manager.connect(
      "minimize",
      () => {
        if (!this._isEnabled) return;
        this._debouncedRecompute();
      },
    );

    this._windowUnminimizeHandler = global.window_manager.connect(
      "unminimize",
      () => {
        if (!this._isEnabled) return;
        this._debouncedRecompute();
      },
    );

    this._notifyFocusWindowHandler = global.display.connect(
      "notify::focus-window",
      () => {
        if (!this._isEnabled) return;
        this._debouncedRecompute();
      },
    );

    this._notifyFullscreenHandler = global.display.connect(
      "in-fullscreen-changed",
      () => {
        if (!this._isEnabled) return;
        this._debouncedRecompute();
      },
    );

    this._grabOpBeginHandler = global.display.connect("grab-op-begin", () => {
      if (!this._isEnabled) return;

      if (this._grabDragTimeout) GLib.source_remove(this._grabDragTimeout);

      this._grabDragTimeout = GLib.timeout_add(
        GLib.PRIORITY_DEFAULT,
        200,
        () => {
          if (!this._isEnabled) {
            this._grabDragTimeout = null;
            return GLib.SOURCE_REMOVE;
          }
          this._recomputeObscuration();
          this._syncToggleState();
          return GLib.SOURCE_CONTINUE;
        },
      );
    });

    this._grabOpEndHandler = global.display.connect("grab-op-end", () => {
      if (!this._isEnabled) return;

      if (this._grabDragTimeout) {
        GLib.source_remove(this._grabDragTimeout);
        this._grabDragTimeout = null;
      }

      this._debouncedRecompute();
    });
  }

  /**
   * Stop all timeouts
   */
  private _stopAllTimeouts() {
    const timeouts = [
      this._bootTimeout,
      this._toggleTimeout,
      this._displayModeTimeout,
      this._debounceTimeout,
      this._grabDragTimeout,
    ];

    timeouts.forEach((timeout) => {
      if (timeout) {
        GLib.source_remove(timeout);
      }
    });

    this._bootTimeout = null;
    this._toggleTimeout = null;
    this._displayModeTimeout = null;
    this._debounceTimeout = null;
    this._grabDragTimeout = null;
  }

  /**
   * Disconnect all handlers
   */
  private _disconnectAllHandlers() {
    this._disconnectToggleHandler();

    // Show in Quick Settings handler
    if (this._showInQsHandler && this._settings) {
      try {
        this._settings.disconnect(this._showInQsHandler);
      } catch (_e) {}
      this._showInQsHandler = null;
    }

    const handlers = [
      { handler: this._overviewHandler, obj: Main.overview },
      { handler: this._overviewHideHandler, obj: Main.overview },
      { handler: this._monitorsChangedHandler, obj: Main.layoutManager },
      { handler: this._workareasChangedHandler, obj: global.display },
      { handler: this._workspaceChangedHandler, obj: global.workspace_manager },
      { handler: this._windowCreatedHandler, obj: global.display },
      { handler: this._windowHandler, obj: global.window_manager },
      { handler: this._windowMinimizeHandler, obj: global.window_manager },
      { handler: this._windowUnminimizeHandler, obj: global.window_manager },
      { handler: this._notifyFocusWindowHandler, obj: global.display },
      { handler: this._notifyFullscreenHandler, obj: global.display },
      { handler: this._grabOpBeginHandler, obj: global.display },
      { handler: this._grabOpEndHandler, obj: global.display },
    ];

    handlers.forEach(({ handler, obj }) => {
      if (handler && obj) {
        try {
          obj.disconnect(handler);
        } catch (_e) {}
      }
    });

    this._settingsHandlers.forEach((id) => {
      if (this._settings && id) {
        try {
          this._settings.disconnect(id);
        } catch (_e) {}
      }
    });
    this._settingsHandlers = [];

    this._overviewHandler = null;
    this._overviewHideHandler = null;
    this._monitorsChangedHandler = null;
    this._workareasChangedHandler = null;
    this._workspaceChangedHandler = null;
    this._windowCreatedHandler = null;
    this._windowHandler = null;
    this._windowMinimizeHandler = null;
    this._windowUnminimizeHandler = null;
    this._notifyFocusWindowHandler = null;
    this._notifyFullscreenHandler = null;
    this._grabOpBeginHandler = null;
    this._grabOpEndHandler = null;
  }

  /**
   * Destroy UI and managers
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

    this._particleManager = null;
    this._settings = null;
  }

  /**
   * Debounced recompute of obscuration
   */
  private _debouncedRecompute() {
    if (this._debounceTimeout) GLib.source_remove(this._debounceTimeout);

    this._debounceTimeout = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 100, () => {
      if (!this._isEnabled) {
        this._debounceTimeout = null;
        return GLib.SOURCE_REMOVE;
      }

      this._recomputeObscuration();
      this._syncToggleState();
      this._debounceTimeout = null;
      return GLib.SOURCE_REMOVE;
    });
  }

  /**
   * Sync toggle state.
   * When the indicator is hidden (show-in-quick-settings = false),
   * falls back to the GSettings "active" value.
   */
  private _syncToggleState() {
    if (!this._isEnabled) return;
    if (!this._monitorManager || !this._settings) return;

    // Determine checked state: from toggle if visible, from GSettings otherwise
    let toggleChecked: boolean;

    const toggle = this._getSafeToggle();
    if (toggle) {
      toggleChecked = !!toggle.checked;
    } else {
      // No indicator — use persisted "active" setting
      toggleChecked = this._settings.get_boolean("active");
    }

    const mode: DisplayMode = this._settings.get_string("display-mode");
    let shouldRun = false;

    if (toggleChecked) {
      if (mode === "screen") {
        shouldRun = true;
      } else if (!Main.overview.visible) {
        const anyActive = this._monitorManager
          .getMonitorActors()
          .some((ma) => this._canRunOnMonitor(ma));
        shouldRun = anyActive;
      }
    }

    const isRunning = !!this.timeoutId;

    if (shouldRun && !isRunning) {
      this._startAnimation();
    } else if (!shouldRun && isRunning) {
      this._stopAnimation();
    }
  }

  /**
   * Start animation
   */
  private _startAnimation() {
    if (this.timeoutId) return;
    if (!this._isEnabled || !this._settings) return;

    const mode: DisplayMode = this._settings.get_string("display-mode");
    if (mode === "wallpaper" && Main.overview.visible) return;

    this.timeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 50, () => {
      if (!this._isEnabled) {
        this.timeoutId = null;
        return GLib.SOURCE_REMOVE;
      }
      this._animateParticles();
      return GLib.SOURCE_CONTINUE;
    });
  }

  /**
   * Stop animation
   */
  private _stopAnimation() {
    if (this.timeoutId) {
      GLib.source_remove(this.timeoutId);
      this.timeoutId = null;
    }

    if (this._monitorManager) {
      const monitorActors = this._monitorManager.getMonitorActors();

      for (const ma of monitorActors) {
        if (!ma?.actor || (ma.actor as any)._isDestroyedByGnome) continue;

        for (const particle of ma.particles) {
          if (particle && !(particle as any)._isDestroyedByGnome) {
            try {
              (particle as any)._weatherDisposed = true;
              particle.remove_all_transitions();
            } catch (e) {
              logError(`remove_all_transitions failed: ${e}`);
            }
          }
        }

        this._monitorManager.clearParticles(ma);
      }
    }
  }

  /**
   * Recompute obscuration for monitors
   */
  private _recomputeObscuration() {
    if (!this._isEnabled || !this._obscurationManager || !this._monitorManager)
      return;

    this._obscurationManager.recomputeObscuration(
      this._monitorManager.getMonitorActors(),
    );
  }

  /**
   * Can run on monitor.
   * When the indicator is hidden, uses GSettings "active" instead of toggle.checked.
   */
  private _canRunOnMonitor(monitorActor: MonitorActor): boolean {
    if (!this._isEnabled || !this._obscurationManager) return false;

    const toggle = this._getSafeToggle();

    // If no toggle (indicator hidden), create a virtual toggle-like object
    // so ObscurationManager can evaluate properly
    const toggleProxy = toggle ?? {
      checked: this._settings?.get_boolean("active") ?? false,
      _isDestroyedByGnome: false,
    };

    return this._obscurationManager.canRunOnMonitor(
      monitorActor,
      toggleProxy,
      Main.overview.visible,
    );
  }

  /**
   * Animate all particles
   */
  private _animateParticles() {
    if (!this._isEnabled) return;
    if (!this._monitorManager || !this._particleManager || !this._settings)
      return;

    const type: EffectType = this._settings.get_string("effect-type");
    const totalParticleCount = this._settings.get_int("particle-count");
    const speed = this._settings.get_int("speed");
    const baseDuration = this._particleManager.getBaseDuration(speed);

    const monitorActors = this._monitorManager.getMonitorActors();
    const particleCountPerMonitor = Math.max(
      1,
      Math.floor(totalParticleCount / monitorActors.length),
    );

    for (const monitorActor of monitorActors) {
      if (
        !monitorActor?.actor ||
        (monitorActor.actor as any)._isDestroyedByGnome
      ) {
        continue;
      }

      if (!this._canRunOnMonitor(monitorActor)) {
        this._monitorManager.clearParticles(monitorActor);
        continue;
      }

      const screenWidth = Math.max(1, monitorActor.monitor.width);
      const screenHeight = Math.max(1, monitorActor.monitor.height);

      // Remove excess particles
      while (monitorActor.particles.length > particleCountPerMonitor) {
        const particle = monitorActor.particles.pop();
        if (particle && !(particle as any)._isDestroyedByGnome) {
          particle.remove_all_transitions();
          particle.destroy();
        }
      }

      // Add missing particles
      if (monitorActor.particles.length < particleCountPerMonitor) {
        const toAdd = particleCountPerMonitor - monitorActor.particles.length;

        for (let i = 0; i < toAdd; i++) {
          if (!this._isEnabled) break;

          const particle = this._particleManager.createParticle(
            type,
            monitorActor,
            screenWidth,
          );

          if (particle) {
            particle.y = Math.random() * screenHeight - 20;
            monitorActor.particles.push(particle);
            this._particleManager.animateSingleParticle(
              particle,
              monitorActor,
              screenHeight,
              baseDuration,
            );
          }
        }
      }

      // Clean up disposed / wrong-type particles
      for (let i = monitorActor.particles.length - 1; i >= 0; i--) {
        const particle = monitorActor.particles[i];

        if (
          !particle ||
          (particle as any)._isDestroyedByGnome ||
          (particle as any)._weatherDisposed
        ) {
          monitorActor.particles.splice(i, 1);
          continue;
        }

        if (!particle.get_parent()) {
          monitorActor.particles.splice(i, 1);
          continue;
        }

        if (!this._particleManager.isCorrectType(particle, type)) {
          let currentX = 0;
          let currentY = -20;

          try {
            currentX = particle.x;
            currentY = particle.y;
          } catch (_e) {}

          try {
            (particle as any)._weatherDisposed = true;
            particle.remove_all_transitions();
            particle.destroy();
          } catch (_e) {}

          monitorActor.particles.splice(i, 1);

          if (!this._isEnabled) continue;

          const newParticle = this._particleManager.createParticle(
            type,
            monitorActor,
            screenWidth,
          );

          if (newParticle) {
            newParticle.x = currentX;
            newParticle.y = currentY;

            monitorActor.particles.push(newParticle);
            this._particleManager.animateSingleParticle(
              newParticle,
              monitorActor,
              screenHeight,
              baseDuration,
            );
          }
        }
      }
    }
  }

  /**
   * Handler invoked when a particle animation completes
   */
  private _onParticleAnimationComplete(
    particle: any,
    monitorActor: MonitorActor,
    screenHeight: number,
    baseDuration: number,
  ) {
    if (!this._isEnabled) return;

    if (
      !particle ||
      (particle as any)._isDestroyedByGnome ||
      (particle as any)._weatherDisposed
    )
      return;

    if (!monitorActor?.actor || (monitorActor.actor as any)._isDestroyedByGnome)
      return;

    if (typeof (particle as any).get_parent !== "function") return;

    const monitorActors = this._monitorManager!.getMonitorActors();
    if (!monitorActors.includes(monitorActor)) return;

    try {
      particle.y = -20;
      particle.x = Math.random() * Math.max(1, monitorActor.monitor.width);

      const updatedType: EffectType = this._settings.get_string("effect-type");
      const updatedSpeed = this._settings.get_int("speed");
      const updatedBaseDuration =
        this._particleManager!.getBaseDuration(updatedSpeed);
      const mode: DisplayMode = this._settings.get_string("display-mode");

      this._particleManager!.updateParticleStyle(particle, updatedType);

      // Check if animation should continue
      const canRun =
        this._isToggleActive() &&
        (mode === "screen" || this._canRunOnMonitor(monitorActor));

      if (canRun) {
        this._particleManager!.animateSingleParticle(
          particle,
          monitorActor,
          screenHeight,
          updatedBaseDuration,
        );
      } else {
        this._safeDestroyParticle(particle, monitorActor);
      }
    } catch (e) {
      logError(`onParticleAnimationComplete failed: ${e}`);
      this._safeDestroyParticle(particle, monitorActor, true);
    }
  }

  /**
   * Check if the toggle is active.
   * Uses the toggle if indicator is visible, GSettings "active" otherwise.
   */
  private _isToggleActive(): boolean {
    const toggle = this._getSafeToggle();

    if (toggle) {
      return !!toggle.checked;
    }

    // No indicator — fallback to persisted setting
    return this._settings?.get_boolean("active") ?? false;
  }

  /**
   * Safely destroy a particle and remove from monitor
   */
  private _safeDestroyParticle(
    particle: any,
    monitorActor: MonitorActor,
    logErrors: boolean = false,
  ) {
    try {
      if (particle && !(particle as any)._isDestroyedByGnome) {
        (particle as any)._weatherDisposed = true;
        particle.remove_all_transitions();
        particle.destroy();
      }
    } catch (e) {
      if (logErrors) {
        logError(`cleanup after failure failed: ${e}`);
      }
    }

    const index = monitorActor.particles.indexOf(particle);
    if (index !== -1) monitorActor.particles.splice(index, 1);
  }

  /**
   * Safely get the toggle, guarding against disposed actors
   */
  private _getSafeToggle(): any | null {
    try {
      if (!this._indicator || (this._indicator as any)._isDestroyedByGnome)
        return null;

      const toggle = this._indicator.toggle;
      if (!toggle || (toggle as any)._isDestroyedByGnome) return null;

      return toggle;
    } catch (_e) {
      return null;
    }
  }
}
