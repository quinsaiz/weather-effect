// @ts-nocheck
import GLib from "gi://GLib";
import * as Main from "resource:///org/gnome/shell/ui/main.js";
import { WeatherIndicator } from "./UIManager.js";
import { MonitorManager } from "./MonitorManager.js";
import { ObscurationManager } from "./ObscurationManager.js";
import { ParticleManager } from "./ParticleManager.js";
import { logDebug } from "./Debug.js";
/**
 * Main controller for the extension.
 * Coordinates the different managers and handles lifecycle.
 */
export class WeatherEffectController {
    _settings;
    _indicator = null;
    _monitorManager = null;
    _obscurationManager = null;
    _particleManager = null;
    timeoutId = null;
    _overviewHandler = null;
    _overviewHideHandler = null;
    _windowHandler = null;
    _windowMinimizeHandler = null;
    _windowUnminimizeHandler = null;
    _debounceTimeout = null;
    _monitorsChangedHandler = null;
    _workareasChangedHandler = null;
    _settingsHandlers = [];
    _workspaceChangedHandler = null;
    _windowCreatedHandler = null;
    _toggleHandler = null;
    constructor(settings) {
        this._settings = settings;
    }
    /**
     * Enable the extension
     */
    enable() {
        logDebug("Enabling extension");
        // Initialize managers
        this._monitorManager = new MonitorManager(this._settings);
        this._obscurationManager = new ObscurationManager(this._settings);
        this._particleManager = new ParticleManager(this._settings, this._onParticleAnimationComplete.bind(this));
        // Create UI
        this._indicator = new WeatherIndicator(this._settings);
        Main.panel.statusArea.quickSettings.addExternalIndicator(this._indicator);
        // Create monitor actors
        this._monitorManager.createMonitorActors();
        this._obscurationManager.recomputeObscuration(this._monitorManager.getMonitorActors());
        // Set up event handlers
        this._setupEventHandlers();
        // Sync state
        GLib.timeout_add(GLib.PRIORITY_DEFAULT, 1000, () => {
            this._syncToggleState();
            logDebug("Checked state after boot");
            return GLib.SOURCE_REMOVE;
        });
    }
    /**
     * Disable the extension
     */
    disable() {
        logDebug("Disabling extension");
        this._stopAnimation();
        this._disconnectAllHandlers();
        this._monitorManager?.destroy();
        this._monitorManager = null;
        this._obscurationManager?.clear();
        this._obscurationManager = null;
        this._particleManager = null;
        this._indicator?.destroy();
        this._indicator = null;
        this._settings = null;
    }
    /**
     * Set up all event handlers
     */
    _setupEventHandlers() {
        // Overview
        this._overviewHandler = Main.overview.connect("showing", () => {
            const mode = this._settings.get_string("display-mode");
            if (mode === "wallpaper") {
                this._stopAnimation();
                logDebug("Overview shown, animation stopped");
            }
        });
        this._overviewHideHandler = Main.overview.connect("hidden", () => {
            this._recomputeObscuration();
            this._syncToggleState();
            logDebug("Overview hidden, syncing state");
        });
        // Toggle
        this._toggleHandler = this._indicator.toggle.connect("notify::checked", () => {
            GLib.timeout_add(GLib.PRIORITY_DEFAULT, 50, () => {
                this._syncToggleState();
                logDebug("Toggle state changed");
                return GLib.SOURCE_REMOVE;
            });
        });
        // Settings
        this._settingsHandlers.push(this._settings.connect("changed::display-mode", () => {
            const wasRunning = !!this.timeoutId;
            this._stopAnimation();
            this._monitorManager?.attachMonitorActors();
            if (wasRunning) {
                GLib.timeout_add(GLib.PRIORITY_DEFAULT, 100, () => {
                    this._syncToggleState();
                    return GLib.SOURCE_REMOVE;
                });
            }
            else {
                this._syncToggleState();
            }
            logDebug("Display mode changed, actors reattached");
        }));
        this._settingsHandlers.push(this._settings.connect("changed::pause-on-fullscreen", () => {
            this._recomputeObscuration();
            this._syncToggleState();
            logDebug("Pause on fullscreen setting changed");
        }));
        // Monitors
        this._monitorsChangedHandler = Main.layoutManager.connect("monitors-changed", () => {
            logDebug("Monitors changed");
            this._monitorManager?.destroy();
            this._monitorManager?.createMonitorActors();
            this._recomputeObscuration();
            this._syncToggleState();
        });
        this._workareasChangedHandler = global.display.connect("workareas-changed", () => {
            logDebug("Workareas changed");
            this._monitorManager?.updateMonitorActors();
            this._recomputeObscuration();
            this._syncToggleState();
        });
        // Workspace
        this._workspaceChangedHandler = global.workspace_manager.connect("active-workspace-changed", () => {
            logDebug("Active workspace changed");
            const mode = this._settings.get_string("display-mode");
            if (mode === "wallpaper") {
                this._monitorManager?.getMonitorActors().forEach((ma) => {
                    this._monitorManager?.clearParticles(ma);
                });
            }
            this._debouncedRecompute();
        });
        // Windows
        this._windowCreatedHandler = global.display.connect("window-created", () => {
            this._debouncedRecompute();
        });
        this._windowHandler = global.window_manager.connect("size-changed", () => {
            this._debouncedRecompute();
        });
        this._windowMinimizeHandler = global.window_manager.connect("minimize", () => {
            this._debouncedRecompute();
        });
        this._windowUnminimizeHandler = global.window_manager.connect("unminimize", () => {
            this._debouncedRecompute();
        });
    }
    /**
     * Disconnect all handlers
     */
    _disconnectAllHandlers() {
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
        if (this._toggleHandler && this._indicator?.toggle) {
            this._indicator.toggle.disconnect(this._toggleHandler);
            this._toggleHandler = null;
        }
        this._settingsHandlers.forEach((id) => this._settings.disconnect(id));
        this._settingsHandlers = [];
    }
    /**
     * Debounced recompute of obscuration
     */
    _debouncedRecompute() {
        if (this._debounceTimeout)
            GLib.source_remove(this._debounceTimeout);
        this._debounceTimeout = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 100, () => {
            this._recomputeObscuration();
            this._syncToggleState();
            this._debounceTimeout = null;
            return GLib.SOURCE_REMOVE;
        });
    }
    /**
     * Sync toggle state
     */
    _syncToggleState() {
        if (!this._indicator?.toggle || !this._monitorManager)
            return;
        const mode = this._settings.get_string("display-mode");
        let shouldRun = false;
        if (this._indicator.toggle.checked) {
            if (mode === "screen") {
                shouldRun = true;
            }
            else if (!Main.overview.visible) {
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
        }
        else if (!shouldRun && isRunning) {
            logDebug("Stopping animation");
            this._stopAnimation();
        }
    }
    /**
     * Start animation
     */
    _startAnimation() {
        if (this.timeoutId)
            return;
        const mode = this._settings.get_string("display-mode");
        if (mode === "wallpaper" && Main.overview.visible)
            return;
        this.timeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 50, () => {
            this._animateParticles();
            return GLib.SOURCE_CONTINUE;
        });
    }
    /**
     * Stop animation
     */
    _stopAnimation() {
        if (this.timeoutId) {
            GLib.source_remove(this.timeoutId);
            this.timeoutId = null;
        }
        this._monitorManager?.getMonitorActors().forEach((ma) => {
            this._monitorManager?.clearParticles(ma);
        });
    }
    /**
     * Recompute obscuration for monitors
     */
    _recomputeObscuration() {
        if (!this._obscurationManager || !this._monitorManager)
            return;
        this._obscurationManager.recomputeObscuration(this._monitorManager.getMonitorActors());
    }
    /**
     * Can run on monitor
     */
    _canRunOnMonitor(monitorActor) {
        if (!this._obscurationManager || !this._indicator?.toggle)
            return false;
        return this._obscurationManager.canRunOnMonitor(monitorActor, this._indicator.toggle, Main.overview.visible);
    }
    /**
     * Animate all particles
     */
    _animateParticles() {
        if (!this._monitorManager || !this._particleManager)
            return;
        const type = this._settings.get_string("effect-type");
        const totalParticleCount = this._settings.get_int("particle-count");
        const speed = this._settings.get_int("speed");
        const baseDuration = this._particleManager.getBaseDuration(speed);
        const monitorActors = this._monitorManager.getMonitorActors();
        const particleCountPerMonitor = Math.max(1, Math.floor(totalParticleCount / monitorActors.length));
        for (const monitorActor of monitorActors) {
            if (!this._canRunOnMonitor(monitorActor)) {
                if (monitorActor.particles.length > 0) {
                    logDebug(`Clearing ${monitorActor.particles.length} particles on monitor ${monitorActor.monitor.index}`);
                    this._monitorManager.clearParticles(monitorActor);
                }
                continue;
            }
            const screenWidth = Math.max(1, monitorActor.monitor.width);
            const screenHeight = Math.max(1, monitorActor.monitor.height);
            if (screenWidth <= 0 || screenHeight <= 0)
                continue;
            // Remove excess particles
            while (monitorActor.particles.length > particleCountPerMonitor) {
                const particle = monitorActor.particles.pop();
                if (particle) {
                    particle.remove_all_transitions();
                    particle.destroy();
                }
            }
            // Add new particles
            if (monitorActor.particles.length < particleCountPerMonitor) {
                const toAdd = particleCountPerMonitor - monitorActor.particles.length;
                for (let i = 0; i < toAdd; i++) {
                    const particle = this._particleManager.createParticle(type, monitorActor, screenWidth);
                    monitorActor.particles.push(particle);
                    this._particleManager.animateSingleParticle(particle, monitorActor, screenHeight, baseDuration);
                }
            }
            // Verify particle types
            for (let i = monitorActor.particles.length - 1; i >= 0; i--) {
                const particle = monitorActor.particles[i];
                if (!this._particleManager.isCorrectType(particle, type)) {
                    particle.remove_all_transitions();
                    particle.destroy();
                    monitorActor.particles.splice(i, 1);
                    const newParticle = this._particleManager.createParticle(type, monitorActor, screenWidth);
                    monitorActor.particles.push(newParticle);
                    this._particleManager.animateSingleParticle(newParticle, monitorActor, screenHeight, baseDuration);
                }
            }
        }
    }
    /**
     * Handler invoked when a particle animation completes
     */
    _onParticleAnimationComplete(particle, monitorActor, screenHeight, baseDuration) {
        if (!particle ||
            !monitorActor ||
            !this._monitorManager ||
            !this._particleManager) {
            return;
        }
        particle.y = -20;
        const safeWidth = Math.max(1, monitorActor.monitor.width);
        particle.x = Math.random() * safeWidth;
        const updatedType = this._settings.get_string("effect-type");
        const updatedSpeed = this._settings.get_int("speed");
        const updatedBaseDuration = this._particleManager.getBaseDuration(updatedSpeed);
        const mode = this._settings.get_string("display-mode");
        this._particleManager.updateParticleStyle(particle, updatedType);
        const canRun = this._indicator?.toggle?.checked &&
            (mode === "screen" || this._canRunOnMonitor(monitorActor));
        if (canRun) {
            this._particleManager.animateSingleParticle(particle, monitorActor, screenHeight, updatedBaseDuration);
        }
        else {
            particle.remove_all_transitions();
            particle.destroy();
            const index = monitorActor.particles.indexOf(particle);
            if (index !== -1)
                monitorActor.particles.splice(index, 1);
        }
    }
}
