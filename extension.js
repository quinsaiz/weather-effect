import GObject from 'gi://GObject';
import Clutter from 'gi://Clutter';
import St from 'gi://St';
import GLib from 'gi://GLib';
import Meta from 'gi://Meta';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import {QuickMenuToggle, SystemIndicator} from 'resource:///org/gnome/shell/ui/quickSettings.js';

const WeatherToggle = GObject.registerClass(
class WeatherToggle extends QuickMenuToggle {
    constructor(settings) {
        super({
            title: 'Weather Effect',
            iconName: 'weather-snow-symbolic',
        });

        this._settings = settings;
        this.checked = true;
        this.menu.setHeader('weather-snow-symbolic', 'Weather Effect');

        this._snowItem = this.menu.addAction('Snow', () => {
            this._settings.set_string('effect-type', 'snow');
            this.checked = true;
            this._updateCheckmarks();
            log('Weather Effect: Snow selected');
        });
        this._rainItem = this.menu.addAction('Rain', () => {
            this._settings.set_string('effect-type', 'rain');
            this.checked = true;
            this._updateCheckmarks();
            log('Weather Effect: Rain selected');
        });

        this.connect('clicked', () => {
            this.checked = !this.checked;
            this._updateCheckmarks();
            log(`Weather Effect: Toggle clicked, checked: ${this.checked}, effect-type: ${this._settings.get_string('effect-type')}`);
        });

        this._updateCheckmarks();
    }

    _updateCheckmarks() {
        const effectType = this._settings.get_string('effect-type');
        this._snowItem.setOrnament(effectType === 'snow' && this.checked ? 1 : 0);
        this._rainItem.setOrnament(effectType === 'rain' && this.checked ? 1 : 0);
    }
});

const WeatherIndicator = GObject.registerClass(
class WeatherIndicator extends SystemIndicator {
    constructor(settings) {
        super();
        this._indicator = this._addIndicator();
        this._settings = settings;

        this.toggle = new WeatherToggle(settings);
        this.quickSettingsItems.push(this.toggle);
        
        this._updateIndicatorIcon();

        this._settings.connect('changed::effect-type', () => this._updateIndicatorIcon());
        this.toggle.connect('notify::checked', () => this._updateIndicatorIcon());
    }

    _updateIndicatorIcon() {
        const effectType = this._settings.get_string('effect-type');
        const checked = this.toggle.checked;
        this._indicator.iconName = checked ? (effectType === 'snow' ? 'weather-snow-symbolic' : 'weather-showers-symbolic') : 'weather-clear-symbolic';
    }
});

export default class WeatherEffectExtension extends Extension {
    enable() {
        log('Weather Effect: Enabling extension');
        this._settings = this.getSettings();
        log(`Weather Effect: Initial effect-type: ${this._settings.get_string('effect-type')}`);
        this._indicator = new WeatherIndicator(this._settings);
        Main.panel.statusArea.quickSettings.addExternalIndicator(this._indicator);

        this.activeParticles = [];
        this.weatherActor = new Clutter.Actor({
            width: Main.layoutManager.monitors[0].width,
            height: Main.layoutManager.monitors[0].height,
        });
        Main.layoutManager._backgroundGroup.add_child(this.weatherActor);

        this._overviewHandler = Main.overview.connect('showing', () => {
            this._stopAnimation();
            log('Weather Effect: Overview shown, animation stopped');
        });
        this._overviewHideHandler = Main.overview.connect('hidden', () => {
            this._syncToggleState();
            log('Weather Effect: Overview hidden, syncing state');
        });

        GLib.timeout_add(GLib.PRIORITY_DEFAULT, 1000, () => {
            this._syncToggleState();
            log('Weather Effect: Checked state after boot');
            return GLib.SOURCE_REMOVE;
        });

        this._indicator.toggle.connect('notify::checked', () => {
            GLib.timeout_add(GLib.PRIORITY_DEFAULT, 50, () => {
                this._syncToggleState();
                log('Weather Effect: Toggle state changed');
                return GLib.SOURCE_REMOVE;
            });
            log('Weather Effect: Checked state changed');
        });

        this._settings.connect('changed::effect-type', () => {
            this._indicator.toggle._updateCheckmarks();
            log('Weather Effect: Settings changed (effect-type)');
        });

        this._debounceTimeout = null;
        this._windowHandler = global.window_manager.connect('size-changed', () => {
        if (this._debounceTimeout) GLib.source_remove(this._debounceTimeout);
        this._debounceTimeout = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 100, () => {
            this._syncToggleState();
            this._debounceTimeout = null;
            return GLib.SOURCE_REMOVE;
        });
    });
    }

    disable() {
        log('Weather Effect: Disabling extension');
        this._stopAnimation();
        if (this._overviewHandler) {
            Main.overview.disconnect(this._overviewHandler);
            this._overviewHandler = null;
        }
        if (this._overviewHideHandler) {
            Main.overview.disconnect(this._overviewHideHandler);
            this._overviewHideHandler = null;
        }
        this._indicator.quickSettingsItems.forEach(item => item.destroy());
        this._indicator.destroy();
        this.weatherActor.destroy();
        this.activeParticles = [];

        if (this._debounceTimeout) {
            GLib.source_remove(this._debounceTimeout);
            this._debounceTimeout = null;
        }
        if (this._windowHandler) {
            global.window_manager.disconnect(this._windowHandler);
            this._windowHandler = null;
        }
    }

    _syncToggleState() {
        const shouldRun = this._indicator.toggle.checked && !Main.overview.visible && !this._isDesktopObscured();
        const isRunning = !!this.timeoutId;
    
        log(`Weather Effect: Syncing state - checked: ${this._indicator.toggle.checked}, overview: ${Main.overview.visible}, obscured: ${this._isDesktopObscured()}, isRunning: ${isRunning}`);
        if (shouldRun && !isRunning) {
            this._startAnimation();
            log('Weather Effect: Syncing state, animation started');
        } else if (!shouldRun && isRunning) {
            this._stopAnimation();
            log('Weather Effect: Syncing state, animation stopped');
        }
    }
    
    _startAnimation() {
        if (this.timeoutId) {
            log('Weather Effect: Animation already running, skipping start');
            return;
        }
        if (Main.overview.visible || this._isDesktopObscured()) {
            log('Weather Effect: Animation not started due to overview or obscured desktop');
            return;
        }
    
        log('Weather Effect: Starting animation');
        this.timeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 50, () => {
            this._animateParticles();
            return GLib.SOURCE_CONTINUE;
        });
    }

    _stopAnimation() {
        if (this.timeoutId) {
            GLib.source_remove(this.timeoutId);
            this.timeoutId = null;
        }
        this.activeParticles.forEach(p => p.destroy());
        this.activeParticles = [];
        log('Weather Effect: Animation stopped');
    }

    _isDesktopObscured() {
        const monitor = Main.layoutManager.primaryMonitor;
        const windows = global.get_window_actors()
            .map(actor => actor.meta_window)
            .filter(window => window.get_monitor() === monitor.index && !window.minimized);
    
        log(`Weather Effect: Checking obscured - windows: ${windows.length}`);
        if (windows.length === 1) {
            const window = windows[0];
            const result = window.is_fullscreen() || (window.maximized_horizontally && window.maximized_vertically);
            log(`Weather Effect: 1 window - fullscreen: ${window.is_fullscreen()}, maxH: ${window.maximized_horizontally}, maxV: ${window.maximized_vertically}, result: ${result}`);
            return result;
        } else if (windows.length >= 2) {
            const allMaxH = windows.every(w => w.maximized_horizontally && !w.maximized_vertically);
            const allMaxV = windows.every(w => !w.maximized_horizontally && w.maximized_vertically);
            const result = allMaxH || allMaxV;
            log(`Weather Effect: 2+ windows - allMaxH: ${allMaxH}, allMaxV: ${allMaxV}, result: ${result}`);
            return result;
        }
        return false;
    }

    _createParticle(type, screenWidth) {
        const size = this._settings.get_int('particle-size');
        const snowEmoji = this._settings.get_string('snow-emoji');
        const rainEmoji = this._settings.get_string('rain-emoji');
        let particle;

        if (type === 'snow') {
            if (snowEmoji && snowEmoji !== '') {
                particle = new St.Label({
                    text: snowEmoji,
                    style: `font-size: ${size}px; color: ${this._settings.get_string('snow-color')};`,
                    x: Math.random() * screenWidth,
                    y: -20,
                });
            } else {
                particle = new St.Widget({
                    style: `background-color: ${this._settings.get_string('snow-color')}; width: ${size}px; height: ${size}px; border-radius: ${size}px;`,
                    x: Math.random() * screenWidth,
                    y: -20,
                });
            }
        } else {
            if (rainEmoji && rainEmoji !== '') {
                particle = new St.Label({
                    text: rainEmoji,
                    style: `font-size: ${size}px; color: ${this._settings.get_string('rain-color')};`,
                    x: Math.random() * screenWidth,
                    y: -20,
                });
            } else {
                particle = new St.Widget({
                    style: `background-color: ${this._settings.get_string('rain-color')}; width: ${size / 2}px; height: ${size * 2}px;`,
                    x: Math.random() * screenWidth,
                    y: -20,
                });
            }
        }
        this.weatherActor.add_child(particle);
        return particle;
    }

    _updateParticleStyle(particle, type) {
        const size = this._settings.get_int('particle-size');
        const snowEmoji = this._settings.get_string('snow-emoji');
        const rainEmoji = this._settings.get_string('rain-emoji');

        if (type === 'snow') {
            if (snowEmoji && snowEmoji !== '') {
                particle.text = snowEmoji;
                particle.style = `font-size: ${size}px; color: ${this._settings.get_string('snow-color')};`;
            } else {
                particle.style = `background-color: ${this._settings.get_string('snow-color')}; width: ${size}px; height: ${size}px; border-radius: ${size}px;`;
            }
        } else {
            if (rainEmoji && rainEmoji !== '') {
                particle.text = rainEmoji;
                particle.style = `font-size: ${size}px; color: ${this._settings.get_string('rain-color')};`;
            } else {
                particle.style = `background-color: ${this._settings.get_string('rain-color')}; width: ${size / 2}px; height: ${size * 2}px;`;
            }
        }
    }

    _animateParticles() {
        const screenWidth = Main.layoutManager.monitors[0].width;
        const screenHeight = Main.layoutManager.monitors[0].height;
        const type = this._settings.get_string('effect-type');

        const particleCount = this._settings.get_int('particle-count');
        const speed = this._settings.get_int('speed');
        const baseDuration = speed === 0 ? 2000 : speed === 1 ? 1000 : 500;
        const snowEmoji = this._settings.get_string('snow-emoji');
        const rainEmoji = this._settings.get_string('rain-emoji');

        while (this.activeParticles.length > particleCount) {
            const particle = this.activeParticles.pop();
            particle.destroy();
        }

        if (this.activeParticles.length < particleCount) {
            const toAdd = particleCount - this.activeParticles.length;
            for (let i = 0; i < toAdd; i++) {
                const particle = this._createParticle(type, screenWidth);
                this.activeParticles.push(particle);
                this._animateSingleParticle(particle, screenHeight, baseDuration, type);
            }
        }

        this.activeParticles.forEach((particle, index) => {
            const isSnowEmoji = snowEmoji && particle.text === snowEmoji;
            const isRainEmoji = rainEmoji && particle.text === rainEmoji;
            const isSnowDefault = !snowEmoji && particle.style && particle.style.includes('border-radius');
            const isRainDefault = !rainEmoji && particle.style && particle.style.includes('height:');

            if ((type === 'snow' && !isSnowEmoji && !isSnowDefault) || 
                (type === 'rain' && !isRainEmoji && !isRainDefault)) {
                particle.destroy();
                this.activeParticles.splice(index, 1);
                const newParticle = this._createParticle(type, screenWidth);
                this.activeParticles.push(newParticle);
                this._animateSingleParticle(newParticle, screenHeight, baseDuration, type);
            }
        });
    }

    _animateSingleParticle(particle, screenHeight, baseDuration, type) {
        const randomOffset = Math.random() * 500;
        particle.show();
        particle.ease({
            y: screenHeight + 20,
            duration: baseDuration + randomOffset,
            mode: Clutter.AnimationMode.LINEAR,
            onComplete: () => {
                particle.y = -20;
                particle.x = Math.random() * Main.layoutManager.monitors[0].width;
                const updatedType = this._settings.get_string('effect-type');
                const updatedParticleCount = this._settings.get_int('particle-count');
                const updatedSpeed = this._settings.get_int('speed');
                const updatedBaseDuration = updatedSpeed === 0 ? 2000 : updatedSpeed === 1 ? 1000 : 500;

                this._updateParticleStyle(particle, updatedType);
                if (this._indicator.toggle.checked && !Main.overview.visible && !this._isDesktopObscured() && this.activeParticles.length <= updatedParticleCount) {
                    this._animateSingleParticle(particle, screenHeight, updatedBaseDuration, updatedType);
                } else {
                    particle.destroy();
                    const index = this.activeParticles.indexOf(particle);
                    if (index !== -1) this.activeParticles.splice(index, 1);
                }
            },
        });
    }
}