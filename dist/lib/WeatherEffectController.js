// @ts-nocheck
import GLib from "gi://GLib";
import * as Main from "resource:///org/gnome/shell/ui/main.js";
import { WeatherIndicator } from "./UIManager.js";
import { MonitorManager } from "./MonitorManager.js";
import { ObscurationManager } from "./ObscurationManager.js";
import { ParticleManager } from "./ParticleManager.js";
import { logDebug, logError } from "./Debug.js";
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
    _isEnabled = false;
    timeoutId = null;
    _bootTimeout = null;
    _toggleTimeout = null;
    _displayModeTimeout = null;
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
        this._isEnabled = true;
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
        this._stopAnimation();
        this._disconnectAllHandlers();
        this._destroyUIAndManagers();
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
            if (this._toggleTimeout)
                GLib.source_remove(this._toggleTimeout);
            this._toggleTimeout = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 50, () => {
                this._syncToggleState();
                logDebug("Toggle state changed");
                this._toggleTimeout = null;
                return GLib.SOURCE_REMOVE;
            });
        });
        // Settings
        if (this._settings) {
            this._settingsHandlers.push(this._settings.connect("changed::display-mode", () => {
                if (!this._isEnabled || !this._monitorManager)
                    return;
                const wasRunning = !!this.timeoutId;
                this._stopAnimation();
                this._monitorManager?.attachMonitorActors();
                if (wasRunning) {
                    if (this._displayModeTimeout)
                        GLib.source_remove(this._displayModeTimeout);
                    this._displayModeTimeout = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 100, () => {
                        this._syncToggleState();
                        this._displayModeTimeout = null;
                        return GLib.SOURCE_REMOVE;
                    });
                }
                else {
                    this._syncToggleState();
                }
                logDebug("Display mode changed, actors reattached");
            }));
        }
        if (this._settings) {
            this._settingsHandlers.push(this._settings.connect("changed::pause-on-fullscreen", () => {
                if (!this._isEnabled)
                    return;
                this._recomputeObscuration();
                this._syncToggleState();
                logDebug("Pause on fullscreen setting changed");
            }));
        }
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
     * Stop all timeouts
     */
    _stopAllTimeouts() {
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
    _disconnectAllHandlers() {
        logDebug("Disconnecting all handlers");
        if (this._toggleHandler && this._indicator?.toggle) {
            try {
                this._indicator.toggle.disconnect(this._toggleHandler);
            }
            catch (e) {
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
                }
                catch (e) {
                    logDebug(`Handler ${name} already disconnected`);
                }
            }
        });
        this._settingsHandlers.forEach((id) => {
            if (this._settings && id) {
                try {
                    this._settings.disconnect(id);
                }
                catch (e) {
                    logDebug("Settings handler already disconnected / Error disconnecting");
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
    _destroyUIAndManagers() {
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
        try {
            if (!this._isEnabled ||
                !this._indicator ||
                !this._monitorManager ||
                !this._settings) {
                return;
            }
            if (this._indicator.is_finalized?.()) {
                return;
            }
            const toggle = this._getSafeToggle();
            if (!toggle) {
                // If toggle is gone, stop animation to avoid accessing disposed actors
                this._stopAnimation();
                return;
            }
            // Any property access on disposed objects can throw; guard with try
            let toggleChecked = false;
            try {
                toggleChecked = !!toggle.checked;
            }
            catch (e) {
                logError(`toggle access failed: ${e}`);
                return;
            }
            const mode = this._settings.get_string("display-mode");
            let shouldRun = false;
            if (toggleChecked) {
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
        catch (e) {
            logError(`syncToggleState failed: ${e}`);
        }
    }
    /**
     * Start animation
     */
    _startAnimation() {
        if (this.timeoutId)
            return;
        if (!this._settings)
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
        if (this._monitorManager) {
            const monitorActors = this._monitorManager.getMonitorActors();
            for (const ma of monitorActors) {
                if (ma && ma.actor && !ma.actor.is_finalized?.()) {
                    // Stop all particle animations before clearing
                    for (const particle of ma.particles) {
                        if (particle && !particle.is_finalized?.()) {
                            try {
                                particle._weatherDisposed = true;
                                particle.remove_all_transitions();
                            }
                            catch (e) {
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
    _recomputeObscuration() {
        if (!this._obscurationManager || !this._monitorManager)
            return;
        this._obscurationManager.recomputeObscuration(this._monitorManager.getMonitorActors());
    }
    /**
     * Can run on monitor
     */
    _canRunOnMonitor(monitorActor) {
        try {
            if (!this._isEnabled || !this._obscurationManager)
                return false;
            const toggle = this._getSafeToggle();
            if (!toggle)
                return false;
            return this._obscurationManager.canRunOnMonitor(monitorActor, toggle, Main.overview.visible);
        }
        catch (e) {
            logError(`canRunOnMonitor guard failed: ${e}`);
            return false;
        }
    }
    /**
     * Animate all particles
     */
    _animateParticles() {
        if (!this._isEnabled ||
            !this._monitorManager ||
            !this._particleManager ||
            !this._settings)
            return;
        const type = this._settings.get_string("effect-type");
        const totalParticleCount = this._settings.get_int("particle-count");
        const speed = this._settings.get_int("speed");
        const baseDuration = this._particleManager.getBaseDuration(speed);
        const monitorActors = this._monitorManager.getMonitorActors();
        const particleCountPerMonitor = Math.max(1, Math.floor(totalParticleCount / monitorActors.length));
        for (const monitorActor of monitorActors) {
            if (!monitorActor?.actor || monitorActor.actor.is_finalized?.()) {
                continue;
            }
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
            // Ensure particles array exists
            if (!monitorActor.particles) {
                monitorActor.particles = [];
            }
            // Remove excess particles
            while (monitorActor.particles.length > particleCountPerMonitor) {
                const particle = monitorActor.particles.pop();
                if (particle && !particle.is_finalized?.()) {
                    try {
                        particle.remove_all_transitions();
                        particle.destroy();
                    }
                    catch (e) {
                        logError(`clearParticles destroy failed: ${e}`);
                    }
                }
            }
            // Add new particles
            if (monitorActor.particles.length < particleCountPerMonitor) {
                const toAdd = particleCountPerMonitor - monitorActor.particles.length;
                for (let i = 0; i < toAdd; i++) {
                    // Check if still enabled before creating new particles
                    if (!this._isEnabled) {
                        break;
                    }
                    try {
                        const particle = this._particleManager.createParticle(type, monitorActor, screenWidth);
                        if (particle) {
                            monitorActor.particles.push(particle);
                            this._particleManager.animateSingleParticle(particle, monitorActor, screenHeight, baseDuration);
                        }
                    }
                    catch (e) {
                        logError(`createParticle failed: ${e}`);
                    }
                }
            }
            // Verify particle types
            for (let i = monitorActor.particles.length - 1; i >= 0; i--) {
                const particle = monitorActor.particles[i];
                if (!particle ||
                    particle.is_finalized?.() ||
                    particle._weatherDisposed) {
                    monitorActor.particles.splice(i, 1);
                    continue;
                }
                // Check if particle still has parent
                try {
                    if (!particle.get_parent()) {
                        monitorActor.particles.splice(i, 1);
                        continue;
                    }
                }
                catch (e) {
                    logError(`particle parent check failed: ${e}`);
                    monitorActor.particles.splice(i, 1);
                    continue;
                }
                // If the particle no longer exposes get_parent, treat as invalid
                /*if (typeof (particle as any).get_parent !== "function") {
                  monitorActor.particles.splice(i, 1);
                  continue;
                }*/
                if (!this._particleManager.isCorrectType(particle, type)) {
                    try {
                        particle.remove_all_transitions();
                        particle.destroy();
                    }
                    catch (e) {
                        logError(`replace incorrect particle destroy failed: ${e}`);
                    }
                    monitorActor.particles.splice(i, 1);
                    // Check if still enabled before creating new particle
                    if (!this._isEnabled) {
                        continue;
                    }
                    try {
                        const newParticle = this._particleManager.createParticle(type, monitorActor, screenWidth);
                        if (newParticle) {
                            monitorActor.particles.push(newParticle);
                            this._particleManager.animateSingleParticle(newParticle, monitorActor, screenHeight, baseDuration);
                        }
                    }
                    catch (e) {
                        logError(`recreate particle failed: ${e}`);
                    }
                }
            }
        }
    }
    /**
     * Handler invoked when a particle animation completes
     */
    _onParticleAnimationComplete(particle, monitorActor, screenHeight, baseDuration) {
        try {
            // Early return if extension is disabled
            if (!this._isEnabled) {
                return;
            }
            // Check all required objects exist and are not finalized
            if (!particle ||
                particle.is_finalized?.() ||
                !monitorActor ||
                !monitorActor.actor ||
                monitorActor.actor.is_finalized?.() ||
                !this._monitorManager ||
                !this._particleManager ||
                !this._settings) {
                return;
            }
            // If monitor actor itself was destroyed, stop
            try {
                if (!monitorActor.actor || monitorActor.actor.is_finalized?.()) {
                    return;
                }
            }
            catch (e) {
                logError(`monitorActor actor check failed: ${e}`);
                return;
            }
            // Check if particle still has parent
            if (typeof particle.get_parent !== "function") {
                return;
            }
            // Check if monitor actor is still in the list
            const monitorActors = this._monitorManager.getMonitorActors();
            if (!monitorActors.includes(monitorActor)) {
                return;
            }
            try {
                particle.y = -20;
                const safeWidth = Math.max(1, monitorActor.monitor.width);
                particle.x = Math.random() * safeWidth;
                const updatedType = this._settings.get_string("effect-type");
                const updatedSpeed = this._settings.get_int("speed");
                const updatedBaseDuration = this._particleManager.getBaseDuration(updatedSpeed);
                const mode = this._settings.get_string("display-mode");
                this._particleManager.updateParticleStyle(particle, updatedType);
                // Check if indicator and toggle are still valid
                const toggle = this._getSafeToggle();
                if (!toggle) {
                    this._safeDestroyParticle(particle, monitorActor);
                    return;
                }
                let toggleChecked = false;
                try {
                    toggleChecked = !!toggle.checked;
                }
                catch (e) {
                    logError(`toggle checked access failed: ${e}`);
                    toggleChecked = false;
                }
                const canRun = toggleChecked &&
                    (mode === "screen" || this._canRunOnMonitor(monitorActor));
                if (canRun) {
                    this._particleManager.animateSingleParticle(particle, monitorActor, screenHeight, updatedBaseDuration);
                }
                else {
                    this._safeDestroyParticle(particle, monitorActor);
                }
            }
            catch (e) {
                logError(`onParticleAnimationComplete failed: ${e}`);
                // Error during particle update, clean up
                this._safeDestroyParticle(particle, monitorActor, true);
            }
        }
        catch (e) {
            logError(`onParticleAnimationComplete guard failed: ${e}`);
        }
    }
    /**
     * Safely destroy a particle and remove from monitor
     */
    _safeDestroyParticle(particle, monitorActor, logErrors = false) {
        try {
            if (particle && !particle.is_finalized?.()) {
                // Mark as disposed to avoid later GObject calls that spam warnings
                particle._weatherDisposed = true;
                particle.remove_all_transitions();
                particle.destroy();
            }
        }
        catch (e) {
            if (logErrors) {
                logError(`cleanup after failure failed: ${e}`);
            }
        }
        const index = monitorActor.particles.indexOf(particle);
        if (index !== -1)
            monitorActor.particles.splice(index, 1);
    }
    /**
     * Safely get the toggle, guarding against disposed actors
     */
    _getSafeToggle() {
        try {
            if (!this._indicator || this._indicator.is_finalized?.())
                return null;
            const toggle = this._indicator.toggle;
            if (!toggle)
                return null;
            try {
                if (toggle.is_finalized?.() || toggle._deleted) {
                    return null;
                }
            }
            catch (_e) {
                return null;
            }
            return toggle;
        }
        catch (_e) {
            return null;
        }
    }
}
