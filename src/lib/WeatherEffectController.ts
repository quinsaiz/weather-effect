import GLib from "gi://GLib";
import * as Main from "resource:///org/gnome/shell/ui/main.js";

import { WeatherIndicator } from "./UIManager.js";
import { MonitorManager, MonitorActor } from "./MonitorManager.js";
import { ObscurationManager } from "./ObscurationManager.js";
import { ParticleManager } from "./ParticleManager.js";

type EffectType = "snow" | "rain";
type DisplayMode = "wallpaper" | "screen";

/**
 * Main controller for the extension.
 * Coordinates different managers and safely handles GNOME Shell lifecycle.
 */
export class WeatherEffectController {
  private _settings: any;
  private _indicator: any = null;
  private _monitorManager: MonitorManager | null = null;
  private _obscurationManager: ObscurationManager | null = null;
  private _particleManager: ParticleManager | null = null;
  private _isEnabled: boolean = false;

  // Centralized timeout tracking to prevent memory leaks
  private _timeouts: Set<number> = new Set();
  private timeoutId: number | null = null;
  private _toggleTimeout: number | null = null;
  private _displayModeTimeout: number | null = null;
  private _debounceTimeout: number | null = null;
  private _grabDragTimeout: number | null = null;

  constructor(settings: any) {
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
    this._monitorManager = new MonitorManager(this._settings);
    this._obscurationManager = new ObscurationManager(this._settings);
    this._particleManager = new ParticleManager(
      this._settings,
      this._onParticleAnimationComplete.bind(this),
    );

    // Create UI if configured
    if (this._settings.get_boolean("show-in-quick-settings")) {
      this._createIndicator();
    }

    // Create monitor actors
    this._monitorManager.createMonitorActors();
    this._obscurationManager.recomputeObscuration(
      this._monitorManager.getMonitorActors(),
    );

    // Set up event handlers using connectObject
    this._setupEventHandlers();

    // Sync state after boot
    this._addTimeout(GLib.PRIORITY_DEFAULT, 1000, () => {
      if (!this._isEnabled) return GLib.SOURCE_REMOVE;
      this._syncToggleState();
      return GLib.SOURCE_REMOVE;
    });
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
   * Create the Quick Settings indicator and connect its toggle handler.
   */
  private _createIndicator() {
    if (this._indicator || !this._settings) return;

    this._indicator = new WeatherIndicator(this._settings);
    Main.panel.statusArea.quickSettings.addExternalIndicator(this._indicator);
    this._connectToggleHandler();
  }

  /**
   * Destroy the Quick Settings indicator and disconnect its toggle handler.
   */
  private _destroyIndicator() {
    this._disconnectToggleHandler();

    if (this._indicator) {
      this._indicator.destroy();
      this._indicator = null;
    }
  }

  /**
   * Connect the toggle's notify::checked handler using connectObject.
   */
  private _connectToggleHandler() {
    if (!this._indicator?.toggle) return;

    this._indicator.toggle.connectObject(
      "notify::checked",
      () => {
        if (!this._isEnabled) return;

        this._toggleTimeout = this._removeTimeout(this._toggleTimeout);
        this._toggleTimeout = this._addTimeout(GLib.PRIORITY_DEFAULT, 50, () => {
          if (!this._isEnabled) {
            this._toggleTimeout = null;
            return GLib.SOURCE_REMOVE;
          }
          this._syncToggleState();
          this._toggleTimeout = null;
          return GLib.SOURCE_REMOVE;
        });
      },
      this, // Target object required for disconnectObject
    );
  }

  /**
   * Disconnect the toggle's handlers cleanly.
   */
  private _disconnectToggleHandler() {
    if (this._indicator?.toggle) {
      this._indicator.toggle.disconnectObject(this);
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
   * Set up all event handlers using GNOME's connectObject pattern.
   */
  private _setupEventHandlers() {
    // Overview events
    Main.overview.connectObject(
      "showing",
      () => {
        if (!this._isEnabled) return;
        const mode: DisplayMode = this._settings.get_string("display-mode");
        if (mode === "wallpaper") this._stopAnimation();
      },
      this,
    );

    Main.overview.connectObject(
      "hidden",
      () => {
        if (!this._isEnabled) return;
        this._recomputeObscuration();
        this._syncToggleState();
      },
      this,
    );

    // Toggle indicator events
    this._connectToggleHandler();

    // Settings events
    if (this._settings) {
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

          const wasRunning = !!this.timeoutId;
          this._stopAnimation();
          this._monitorManager?.attachMonitorActors();

          if (wasRunning) {
            this._displayModeTimeout = this._removeTimeout(this._displayModeTimeout);
            this._displayModeTimeout = this._addTimeout(
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
        },
        this,
      );

      this._settings.connectObject(
        "changed::pause-on-fullscreen",
        () => {
          if (!this._isEnabled || !this._monitorManager || !this._obscurationManager) return;
          this._recomputeObscuration();
          this._syncToggleState();
        },
        this,
      );
    }

    // Monitor and Layout events
    Main.layoutManager.connectObject(
      "monitors-changed",
      () => {
        if (!this._isEnabled) return;
        this._monitorManager?.destroy();
        this._monitorManager?.createMonitorActors();
        this._recomputeObscuration();
        this._syncToggleState();
      },
      this,
    );

    global.display.connectObject(
      "workareas-changed",
      () => {
        if (!this._isEnabled) return;
        this._monitorManager?.updateMonitorActors();
        this._recomputeObscuration();
        this._syncToggleState();
      },
      this,
    );

    // Workspace events
    global.workspace_manager.connectObject(
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
      this,
    );

    // Window and Display events
    global.display.connectObject(
      "window-created",
      () => {
        if (!this._isEnabled) return;
        this._debouncedRecompute();
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
        this._debouncedRecompute();
      },
      this,
    );

    global.window_manager.connectObject(
      "unminimize",
      () => {
        if (!this._isEnabled) return;
        this._debouncedRecompute();
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
        this._debouncedRecompute();
      },
      this,
    );

    // Grab operation events (window dragging/resizing)
    global.display.connectObject(
      "grab-op-begin",
      () => {
        if (!this._isEnabled) return;
        this._grabDragTimeout = this._removeTimeout(this._grabDragTimeout);
        this._grabDragTimeout = this._addTimeout(
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
    this._toggleTimeout = null;
    this._displayModeTimeout = null;
    this._debounceTimeout = null;
    this._grabDragTimeout = null;
  }

  /**
   * Disconnect all handlers automatically by target object.
   */
  private _disconnectAllHandlers() {
    this._disconnectToggleHandler();

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

    this._particleManager = null;
    this._settings = null;
  }

  /**
   * Debounced recompute of obscuration.
   */
  private _debouncedRecompute() {
    this._debounceTimeout = this._removeTimeout(this._debounceTimeout);
    this._debounceTimeout = this._addTimeout(GLib.PRIORITY_DEFAULT, 100, () => {
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
   * Sync toggle state and determine if the animation should run.
   */
  private _syncToggleState() {
    if (!this._isEnabled || !this._monitorManager || !this._settings) return;

    let toggleChecked: boolean;
    const toggle = this._getSafeToggle();

    if (toggle) {
      toggleChecked = !!toggle.checked;
    } else {
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
   * Start particle animation loop.
   */
  private _startAnimation() {
    if (this.timeoutId || !this._isEnabled || !this._settings) return;

    const mode: DisplayMode = this._settings.get_string("display-mode");
    if (mode === "wallpaper" && Main.overview.visible) return;

    this.timeoutId = this._addTimeout(GLib.PRIORITY_DEFAULT, 50, () => {
      if (!this._isEnabled) {
        this.timeoutId = null;
        return GLib.SOURCE_REMOVE;
      }
      this._animateParticles();
      return GLib.SOURCE_CONTINUE;
    });
  }

  /**
   * Stop animation and clean up particles cleanly without silent try-catch blocks.
   */
  private _stopAnimation() {
    this.timeoutId = this._removeTimeout(this.timeoutId);

    if (!this._monitorManager) return;
    const monitorActors = this._monitorManager.getMonitorActors();

    for (const ma of monitorActors) {
      if (!ma?.actor || (ma.actor as any)._isDestroyedByGnome) continue;

      for (const particle of ma.particles) {
        if (particle && !(particle as any)._isDestroyedByGnome) {
          (particle as any)._weatherDisposed = true;
          particle.remove_all_transitions();
        }
      }
      this._monitorManager.clearParticles(ma);
    }
  }

  /**
   * Recompute obscuration for all active monitors.
   */
  private _recomputeObscuration() {
    if (!this._isEnabled || !this._obscurationManager || !this._monitorManager) return;
    this._obscurationManager.recomputeObscuration(
      this._monitorManager.getMonitorActors(),
    );
  }

  /**
   * Check if animation can run on a specific monitor.
   */
  private _canRunOnMonitor(monitorActor: MonitorActor): boolean {
    if (!this._isEnabled || !this._obscurationManager) return false;

    const toggle = this._getSafeToggle();
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
   * Animate and manage particle counts across monitors.
   */
  private _animateParticles() {
    if (!this._isEnabled || !this._monitorManager || !this._particleManager || !this._settings) {
      return;
    }

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
      if (!monitorActor?.actor || (monitorActor.actor as any)._isDestroyedByGnome) {
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

      // Clean up disposed or mismatched particles without silent try-catch blocks
      for (let i = monitorActor.particles.length - 1; i >= 0; i--) {
        const particle = monitorActor.particles[i];

        if (
          !particle ||
          (particle as any)._isDestroyedByGnome ||
          (particle as any)._weatherDisposed ||
          !particle.get_parent()
        ) {
          monitorActor.particles.splice(i, 1);
          continue;
        }

        if (!this._particleManager.isCorrectType(particle, type)) {
          const currentX = particle.x;
          const currentY = particle.y;

          (particle as any)._weatherDisposed = true;
          particle.remove_all_transitions();
          particle.destroy();
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
   * Handler invoked when a particle animation completes.
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
      (particle as any)._weatherDisposed ||
      !monitorActor?.actor ||
      (monitorActor.actor as any)._isDestroyedByGnome ||
      typeof (particle as any).get_parent !== "function"
    ) {
      return;
    }

    const monitorActors = this._monitorManager!.getMonitorActors();
    if (!monitorActors.includes(monitorActor)) return;

    particle.y = -20;
    particle.x = Math.random() * Math.max(1, monitorActor.monitor.width);

    const updatedType: EffectType = this._settings.get_string("effect-type");
    const updatedSpeed = this._settings.get_int("speed");
    const updatedBaseDuration = this._particleManager!.getBaseDuration(updatedSpeed);
    const mode: DisplayMode = this._settings.get_string("display-mode");

    this._particleManager!.updateParticleStyle(particle, updatedType);

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
  }

  /**
   * Check if the toggle is currently active.
   */
  private _isToggleActive(): boolean {
    const toggle = this._getSafeToggle();
    if (toggle) return !!toggle.checked;
    return this._settings?.get_boolean("active") ?? false;
  }

  /**
   * Safely destroy a particle and remove it from monitor tracking.
   */
  private _safeDestroyParticle(particle: any, monitorActor: MonitorActor) {
    if (particle && !(particle as any)._isDestroyedByGnome) {
      (particle as any)._weatherDisposed = true;
      particle.remove_all_transitions();
      particle.destroy();
    }

    const index = monitorActor.particles.indexOf(particle);
    if (index !== -1) {
      monitorActor.particles.splice(index, 1);
    }
  }

  /**
   * Safely get the toggle actor without relying on try-catch blocks.
   */
  private _getSafeToggle(): any | null {
    if (!this._indicator || (this._indicator as any)._isDestroyedByGnome) {
      return null;
    }
    const toggle = this._indicator.toggle;
    if (!toggle || (toggle as any)._isDestroyedByGnome) {
      return null;
    }
    return toggle;
  }
}
