// @ts-nocheck
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
  private _toggleHandler: number | null = null;

  constructor(settings: any) {
    this._settings = settings;
  }

  /**
   * Enable the extension
   */
  enable() {
    logDebug("Enabling extension");
    this._isEnabled = true;

    // Initialize managers
    this._monitorManager = new MonitorManager(this._settings);
    this._obscurationManager = new ObscurationManager(this._settings);
    this._particleManager = new ParticleManager(
      this._settings,
      this._onParticleAnimationComplete.bind(this)
    );

    // Create UI
    this._indicator = new WeatherIndicator(this._settings);
    Main.panel.statusArea.quickSettings.addExternalIndicator(this._indicator);

    // Create monitor actors
    this._monitorManager.createMonitorActors();
    this._obscurationManager.recomputeObscuration(
      this._monitorManager.getMonitorActors()
    );

    // Set up event handlers
    this._setupEventHandlers();

    // Sync state after boot
    this._bootTimeout = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 1000, () => {
      this._syncToggleState();
      logDebug("Checked state after boot");
      this._bootTimeout = null;
      return GLib.SOURCE_REMOVE;
    });
  }

  /**
   * Disable the extension
   */
  disable() {
    logDebug("Disabling extension");
    this._isEnabled = false;

    this._stopAllTimeouts();

    this._disconnectAllHandlers();

    this._stopAnimation();

    this._destroyUIAndManagers();
  }

  /**
   * Set up all event handlers
   */
  private _setupEventHandlers() {
    // Overview
    this._overviewHandler = Main.overview.connect("showing", () => {
      if (!this._isEnabled) return;
      const mode: DisplayMode = this._settings.get_string("display-mode");
      if (mode === "wallpaper") {
        this._stopAnimation();
        logDebug("Overview shown, animation stopped");
      }
    });

    this._overviewHideHandler = Main.overview.connect("hidden", () => {
      if (!this._isEnabled) return;
      this._recomputeObscuration();
      this._syncToggleState();
      logDebug("Overview hidden, syncing state");
    });

    // Toggle
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
            logDebug("Toggle state changed");
            this._toggleTimeout = null;
            return GLib.SOURCE_REMOVE;
          }
        );
      }
    );

    // Settings
    if (this._settings) {
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
              }
            );
          } else {
            this._syncToggleState();
          }
          logDebug("Display mode changed, actors reattached");
        })
      );
    }

    if (this._settings) {
      this._settingsHandlers.push(
        this._settings.connect("changed::pause-on-fullscreen", () => {
          if (
            !this._isEnabled ||
            !this._monitorManager ||
            !this._obscurationManager
          )
            return;
          this._recomputeObscuration();
          this._syncToggleState();
          logDebug("Pause on fullscreen setting changed");
        })
      );
    }

    // Monitors
    this._monitorsChangedHandler = Main.layoutManager.connect(
      "monitors-changed",
      () => {
        if (!this._isEnabled) return;
        logDebug("Monitors changed");
        this._monitorManager?.destroy();
        this._monitorManager?.createMonitorActors();
        this._recomputeObscuration();
        this._syncToggleState();
      }
    );

    this._workareasChangedHandler = global.display.connect(
      "workareas-changed",
      () => {
        if (!this._isEnabled) return;
        logDebug("Workareas changed");
        this._monitorManager?.updateMonitorActors();
        this._recomputeObscuration();
        this._syncToggleState();
      }
    );

    // Workspace
    this._workspaceChangedHandler = global.workspace_manager.connect(
      "active-workspace-changed",
      () => {
        if (!this._isEnabled) return;
        logDebug("Active workspace changed");
        const mode: DisplayMode = this._settings.get_string("display-mode");

        if (mode === "wallpaper") {
          this._monitorManager?.getMonitorActors().forEach((ma) => {
            this._monitorManager?.clearParticles(ma);
          });
        }

        this._debouncedRecompute();
      }
    );

    // Windows
    this._windowCreatedHandler = global.display.connect(
      "window-created",
      () => {
        if (!this._isEnabled) return;
        this._debouncedRecompute();
      }
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
      }
    );

    this._windowUnminimizeHandler = global.window_manager.connect(
      "unminimize",
      () => {
        if (!this._isEnabled) return;
        this._debouncedRecompute();
      }
    );
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
  }

  /**
   * Disconnect all handlers
   */
  private _disconnectAllHandlers() {
    logDebug("Disconnecting all handlers");

    if (this._toggleHandler && this._indicator?.toggle) {
      try {
        this._indicator.toggle.disconnect(this._toggleHandler);
      } catch (e) {
        logDebug("Toggle handler already disconnected");
      }
      this._toggleHandler = null;
    }

    const handlers = [
      { handler: this._overviewHandler, obj: Main.overview, name: "overview" },
      {
        handler: this._overviewHideHandler,
        obj: Main.overview,
        name: "overviewHide",
      },
      {
        handler: this._monitorsChangedHandler,
        obj: Main.layoutManager,
        name: "monitorsChanged",
      },
      {
        handler: this._workareasChangedHandler,
        obj: global.display,
        name: "workareasChanged",
      },
      {
        handler: this._workspaceChangedHandler,
        obj: global.workspace_manager,
        name: "workspaceChanged",
      },
      {
        handler: this._windowCreatedHandler,
        obj: global.display,
        name: "windowCreated",
      },
      {
        handler: this._windowHandler,
        obj: global.window_manager,
        name: "windowHandler",
      },
      {
        handler: this._windowMinimizeHandler,
        obj: global.window_manager,
        name: "windowMinimize",
      },
      {
        handler: this._windowUnminimizeHandler,
        obj: global.window_manager,
        name: "windowUnminimize",
      },
    ];

    handlers.forEach(({ handler, obj, name }) => {
      if (handler && obj) {
        try {
          obj.disconnect(handler);
          logDebug(`Disconnected handler: ${name}`);
        } catch (e) {
          logDebug(`Handler ${name} already disconnected`);
        }
      }
    });

    this._settingsHandlers.forEach((id) => {
      if (this._settings && id) {
        try {
          this._settings.disconnect(id);
        } catch (e) {
          logDebug(
            "Settings handler already disconnected / Error disconnecting"
          );
        }
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
  }

  /**
   * Destroy UI and managers
   */
  private _destroyUIAndManagers() {
    logDebug("Destroying UI and managers");

    if (this._indicator) {
      this._indicator.destroy();
      this._indicator = null;
    }

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
   * Sync toggle state
   */
  private _syncToggleState() {
    try {
      if (!this._isEnabled) {
        return;
      }

      if (!this._indicator || !this._monitorManager || !this._settings) {
        return;
      }

      if (this._indicator.is_finalized?.()) {
        return;
      }

      const toggle = this._getSafeToggle();
      if (!toggle) {
        this._stopAnimation();
        return;
      }

      let toggleChecked = false;
      try {
        if (toggle.is_finalized?.()) {
          this._stopAnimation();
          return;
        }
        toggleChecked = !!(toggle as any).checked;
      } catch (e) {
        logError(`toggle access failed: ${e}`);
        this._stopAnimation();
        return;
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
        logDebug("Starting animation");
        this._startAnimation();
      } else if (!shouldRun && isRunning) {
        logDebug("Stopping animation");
        this._stopAnimation();
      }
    } catch (e) {
      logError(`syncToggleState failed: ${e}`);
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
        if (ma && ma.actor && !ma.actor.is_finalized?.()) {
          for (const particle of ma.particles) {
            if (particle && !particle.is_finalized?.()) {
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
  }

  /**
   * Recompute obscuration for monitors
   */
  private _recomputeObscuration() {
    try {
      if (
        !this._isEnabled ||
        !this._obscurationManager ||
        !this._monitorManager
      )
        return;
      this._obscurationManager.recomputeObscuration(
        this._monitorManager.getMonitorActors()
      );
    } catch (e) {
      logError(`_recomputeObscuration failed: ${e}`);
    }
  }

  /**
   * Can run on monitor
   */
  private _canRunOnMonitor(monitorActor: MonitorActor): boolean {
    try {
      if (!this._isEnabled || !this._obscurationManager) return false;

      const toggle = this._getSafeToggle();
      if (!toggle) return false;

      return this._obscurationManager.canRunOnMonitor(
        monitorActor,
        toggle,
        Main.overview.visible
      );
    } catch (e) {
      logError(`canRunOnMonitor guard failed: ${e}`);
      return false;
    }
  }

  /**
   * Animate all particles
   */
  private _animateParticles() {
    try {
      if (!this._isEnabled) {
        return;
      }

      if (!this._monitorManager || !this._particleManager || !this._settings)
        return;

      const type: EffectType = this._settings.get_string("effect-type");
      const totalParticleCount = this._settings.get_int("particle-count");
      const speed = this._settings.get_int("speed");
      const baseDuration = this._particleManager.getBaseDuration(speed);

      const monitorActors = this._monitorManager.getMonitorActors();
      const particleCountPerMonitor = Math.max(
        1,
        Math.floor(totalParticleCount / monitorActors.length)
      );

      for (const monitorActor of monitorActors) {
        if (!monitorActor?.actor || monitorActor.actor.is_finalized?.()) {
          continue;
        }
        if (!this._canRunOnMonitor(monitorActor)) {
          if (monitorActor.particles.length > 0) {
            logDebug(
              `Clearing ${monitorActor.particles.length} particles on monitor ${monitorActor.monitor.index}`
            );
            this._monitorManager.clearParticles(monitorActor);
          }
          continue;
        }

        const screenWidth = Math.max(1, monitorActor.monitor.width);
        const screenHeight = Math.max(1, monitorActor.monitor.height);

        if (screenWidth <= 0 || screenHeight <= 0) continue;

        if (!monitorActor.particles) {
          monitorActor.particles = [];
        }

        while (monitorActor.particles.length > particleCountPerMonitor) {
          const particle = monitorActor.particles.pop();
          if (particle && !particle.is_finalized?.()) {
            try {
              particle.remove_all_transitions();
              particle.destroy();
            } catch (e) {
              logError(`clearParticles destroy failed: ${e}`);
            }
          }
        }

        if (monitorActor.particles.length < particleCountPerMonitor) {
          const toAdd = particleCountPerMonitor - monitorActor.particles.length;
          for (let i = 0; i < toAdd; i++) {
            if (!this._isEnabled) {
              break;
            }
            try {
              const particle = this._particleManager.createParticle(
                type,
                monitorActor,
                screenWidth
              );
              if (particle) {
                monitorActor.particles.push(particle);
                this._particleManager.animateSingleParticle(
                  particle,
                  monitorActor,
                  screenHeight,
                  baseDuration
                );
              }
            } catch (e) {
              logError(`createParticle failed: ${e}`);
            }
          }
        }

        for (let i = monitorActor.particles.length - 1; i >= 0; i--) {
          const particle = monitorActor.particles[i];
          if (
            !particle ||
            particle.is_finalized?.() ||
            (particle as any)._weatherDisposed
          ) {
            monitorActor.particles.splice(i, 1);
            continue;
          }

          try {
            if (
              particle.is_finalized?.() ||
              typeof particle.get_parent !== "function"
            ) {
              monitorActor.particles.splice(i, 1);
              continue;
            }
            if (!particle.get_parent()) {
              monitorActor.particles.splice(i, 1);
              continue;
            }
          } catch (e) {
            logError(`particle parent check failed: ${e}`);
            monitorActor.particles.splice(i, 1);
            continue;
          }

          if (!this._particleManager.isCorrectType(particle, type)) {
            try {
              particle.remove_all_transitions();
              particle.destroy();
            } catch (e) {
              logError(`replace incorrect particle destroy failed: ${e}`);
            }
            monitorActor.particles.splice(i, 1);

            if (!this._isEnabled) {
              continue;
            }

            try {
              const newParticle = this._particleManager.createParticle(
                type,
                monitorActor,
                screenWidth
              );
              if (newParticle) {
                monitorActor.particles.push(newParticle);
                this._particleManager.animateSingleParticle(
                  newParticle,
                  monitorActor,
                  screenHeight,
                  baseDuration
                );
              }
            } catch (e) {
              logError(`recreate particle failed: ${e}`);
            }
          }
        }
      }
    } catch (e) {
      logError(`_animateParticles failed: ${e}`);
    }
  }

  /**
   * Handler invoked when a particle animation completes
   */
  private _onParticleAnimationComplete(
    particle: any,
    monitorActor: MonitorActor,
    screenHeight: number,
    baseDuration: number
  ) {
    try {
      if (!this._isEnabled) {
        return;
      }

      if (
        !particle ||
        particle.is_finalized?.() ||
        !monitorActor ||
        !monitorActor.actor ||
        monitorActor.actor.is_finalized?.() ||
        !this._monitorManager ||
        !this._particleManager ||
        !this._settings
      ) {
        return;
      }

      try {
        if (!monitorActor.actor || monitorActor.actor.is_finalized?.()) {
          return;
        }
      } catch (e) {
        logError(`monitorActor actor check failed: ${e}`);
        return;
      }

      if (typeof (particle as any).get_parent !== "function") {
        return;
      }

      const monitorActors = this._monitorManager.getMonitorActors();
      if (!monitorActors.includes(monitorActor)) {
        return;
      }

      try {
        particle.y = -20;
        const safeWidth = Math.max(1, monitorActor.monitor.width);
        particle.x = Math.random() * safeWidth;

        const updatedType: EffectType =
          this._settings.get_string("effect-type");
        const updatedSpeed = this._settings.get_int("speed");
        const updatedBaseDuration =
          this._particleManager.getBaseDuration(updatedSpeed);
        const mode: DisplayMode = this._settings.get_string("display-mode");

        this._particleManager.updateParticleStyle(particle, updatedType);

        const toggle = this._getSafeToggle();
        if (!toggle) {
          this._safeDestroyParticle(particle, monitorActor);
          return;
        }

        let toggleChecked = false;
        try {
          toggleChecked = !!toggle.checked;
        } catch (e) {
          logError(`toggle checked access failed: ${e}`);
          toggleChecked = false;
        }

        const canRun =
          toggleChecked &&
          (mode === "screen" || this._canRunOnMonitor(monitorActor));

        if (canRun) {
          this._particleManager.animateSingleParticle(
            particle,
            monitorActor,
            screenHeight,
            updatedBaseDuration
          );
        } else {
          this._safeDestroyParticle(particle, monitorActor);
        }
      } catch (e) {
        logError(`onParticleAnimationComplete failed: ${e}`);
        this._safeDestroyParticle(particle, monitorActor, true);
      }
    } catch (e) {
      logError(`onParticleAnimationComplete guard failed: ${e}`);
    }
  }

  /**
   * Safely destroy a particle and remove from monitor
   */
  private _safeDestroyParticle(
    particle: any,
    monitorActor: MonitorActor,
    logErrors: boolean = false
  ) {
    try {
      if (particle && !particle.is_finalized?.()) {
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
      if (!this._indicator || this._indicator.is_finalized?.()) return null;
      const toggle = this._indicator.toggle;
      if (!toggle) return null;
      try {
        if (toggle.is_finalized?.() || (toggle as any)._deleted) {
          return null;
        }
      } catch (_e) {
        return null;
      }
      return toggle;
    } catch (_e) {
      return null;
    }
  }
}
