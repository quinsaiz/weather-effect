// @ts-nocheck
import GObject from 'gi://GObject';
import Clutter from 'gi://Clutter';
import St from 'gi://St';
import GLib from 'gi://GLib';
import Meta from 'gi://Meta';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';
import { QuickMenuToggle, SystemIndicator } from 'resource:///org/gnome/shell/ui/quickSettings.js';
import { PopupBaseMenuItem } from 'resource:///org/gnome/shell/ui/popupMenu.js';

type EffectType = 'snow' | 'rain';
type DisplayMode = 'wallpaper' | 'screen';

const WeatherToggle = GObject.registerClass(
class WeatherToggle extends QuickMenuToggle {
    private _settings: any;
    private _snowButton: St.Button | null = null;
    private _rainButton: St.Button | null = null;
    private _buttonBox: St.BoxLayout | null = null;

    constructor(settings: any) {
        super({ title: 'Weather Effect', iconName: 'weather-snow-symbolic' });
        this._settings = settings;
        this.checked = true;

        this._buttonBox = new St.BoxLayout({
            style_class: 'popup-menu-item',
            reactive: true,
            x_expand: true,
        });

        const snowBox = new St.BoxLayout({
            style_class: 'keyboard-brightness-level',
            orientation: Clutter.Orientation.VERTICAL,
            x_expand: true,
        });
        const snowLabel = new St.Label({
            text: 'Snow',
            x_align: Clutter.ActorAlign.CENTER,
        });
        this._snowButton = new St.Button({
            style_class: 'icon-button',
            can_focus: true,
            icon_name: 'weather-snow-symbolic',
            label_actor: snowLabel,
            checked: false,
        });
        snowBox.add_child(this._snowButton);
        snowBox.add_child(snowLabel);
        this._buttonBox.add_child(snowBox);

        this._snowButton.connect('clicked', () => {
            this._settings.set_string('effect-type', 'snow');
            this.checked = true;
            this._updateButtons();
            this.iconName = 'weather-snow-symbolic';
            //log('Weather Effect: Snow selected');
        });

        const rainBox = new St.BoxLayout({
            style_class: 'keyboard-brightness-level',
            orientation: Clutter.Orientation.VERTICAL,
            x_expand: true,
        });
        const rainLabel = new St.Label({
            text: 'Rain',
            x_align: Clutter.ActorAlign.CENTER,
        });
        this._rainButton = new St.Button({
            style_class: 'icon-button',
            can_focus: true,
            icon_name: 'weather-showers-symbolic',
            label_actor: rainLabel,
            checked: false,
        });
        rainBox.add_child(this._rainButton);
        rainBox.add_child(rainLabel);
        this._buttonBox.add_child(rainBox);

        this._rainButton.connect('clicked', () => {
            this._settings.set_string('effect-type', 'rain');
            this.checked = true;
            this._updateButtons();
            this.iconName = 'weather-showers-symbolic';
            //log('Weather Effect: Rain selected');
        });

        this.menu.box.add_child(this._buttonBox);

        this.connect('clicked', () => {
            this.checked = !this.checked;
            this._updateButtons();
            //log(`Weather Effect: Toggle clicked, checked: ${this.checked}, effect-type: ${this._settings.get_string('effect-type')}`);
        });

        this._settings.connect('changed::effect-type', () => {
            this._updateButtons();
            const effectType: EffectType = this._settings.get_string('effect-type');
            this.iconName = effectType === 'snow' ? 'weather-snow-symbolic' : 'weather-showers-symbolic';
        });

        this._updateButtons();
    }

    _updateButtons() {
        const effectType: EffectType = this._settings.get_string('effect-type');
        const isActive = this.checked;

        if (this._snowButton && this._rainButton) {
            if (effectType === 'snow' && isActive) {
                this._snowButton.checked = true;
                this._rainButton.checked = false;
            } else if (effectType === 'rain' && isActive) {
                this._rainButton.checked = true;
                this._snowButton.checked = false;
            } else {
                this._snowButton.checked = false;
                this._rainButton.checked = false;
            }
        }
    }
});

const WeatherIndicator = GObject.registerClass(
class WeatherIndicator extends SystemIndicator {
    public toggle: InstanceType<typeof WeatherToggle>;
    private _indicator: any;
    private _settings: any;

    constructor(settings: any) {
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
        const effectType: EffectType = this._settings.get_string('effect-type');
        const checked = this.toggle.checked;
        this._indicator.iconName = checked ? (effectType === 'snow' ? 'weather-snow-symbolic' : 'weather-showers-symbolic') : 'weather-clear-symbolic';
    }
});

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
    private _debounceTimeout: number | null = null;
    private _monitorsChangedHandler: number | null = null;
    private _workareasChangedHandler: number | null = null;
    private _settingsHandlers: number[] = [];

    enable() {
        //log('Weather Effect: Enabling extension');
        this._settings = this.getSettings();
        //log(`Weather Effect: Initial effect-type: ${this._settings.get_string('effect-type')}`);
        
        this._indicator = new WeatherIndicator(this._settings);
        Main.panel.statusArea.quickSettings.addExternalIndicator(this._indicator);

        this.monitorActors = [];
        this._createMonitorActors();

        this._overviewHandler = Main.overview.connect('showing', () => {
            const mode: DisplayMode = this._settings.get_string('display-mode');
            if (mode === 'wallpaper') {
                this._stopAnimation();
                //log('Weather Effect: Overview shown, animation stopped');
            } else {
                this._syncToggleState();
                //log('Weather Effect: Overview shown, syncing state for screen mode');
            }
        });
        this._overviewHideHandler = Main.overview.connect('hidden', () => {
            this._syncToggleState();
            //log('Weather Effect: Overview hidden, syncing state');
        });

        GLib.timeout_add(GLib.PRIORITY_DEFAULT, 1000, () => {
            this._syncToggleState();
            //log('Weather Effect: Checked state after boot');
            return GLib.SOURCE_REMOVE;
        });

        this._indicator.toggle.connect('notify::checked', () => {
            GLib.timeout_add(GLib.PRIORITY_DEFAULT, 50, () => {
                this._syncToggleState();
                //log('Weather Effect: Toggle state changed');
                return GLib.SOURCE_REMOVE;
            });
        });

        this._settingsHandlers.push(
            this._settings.connect('changed::effect-type', () => this._indicator.toggle._updateCheckmarks()),
            this._settings.connect('changed::display-mode', () => {
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
                //log('Weather Effect: Display mode changed, actors reattached');
            })
        );

        this._monitorsChangedHandler = Main.layoutManager.connect('monitors-changed', () => {
            this._destroyMonitorActors();
            this._createMonitorActors();
            this._syncToggleState();
        });
        this._workareasChangedHandler = global.display.connect('workareas-changed', () => {
            this._updateMonitorActors();
        });

        this._windowHandler = global.window_manager.connect('size-changed', () => {
            if (this._debounceTimeout)
                GLib.source_remove(this._debounceTimeout);
            this._debounceTimeout = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 100, () => {
                this._syncToggleState();
                this._debounceTimeout = null;
                return GLib.SOURCE_REMOVE;
            });
        });
    }

    disable() {
        //log('Weather Effect: Disabling extension');
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
        if (this._windowHandler) {
            global.window_manager.disconnect(this._windowHandler);
            this._windowHandler = null;
        }
        if (this._debounceTimeout) {
            GLib.source_remove(this._debounceTimeout);
            this._debounceTimeout = null;
        }
        this._settingsHandlers.forEach(id => this._settings.disconnect(id));
        this._settingsHandlers = [];

        this._indicator.quickSettingsItems.forEach((item: any) => item.destroy());
        this._indicator.destroy();
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
    }

    private _attachMonitorActors() {
        const mode: DisplayMode = this._settings.get_string('display-mode') as DisplayMode;
        
        for (const monitorActor of this.monitorActors) {
            const parent = monitorActor.actor.get_parent();
            if (parent)
                parent.remove_child(monitorActor.actor);

            if (mode === 'screen') {
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
            if (!monitors.find((m: any) => m.x === monitorActor.monitor.x && m.y === monitorActor.monitor.y)) {
                monitorActor.particles.forEach(p => p.destroy());
                monitorActor.actor.destroy();
                this.monitorActors.splice(i, 1);
            }
        }
        
        for (let i = 0; i < monitors.length; i++) {
            const monitor = monitors[i];
            let monitorActor = this.monitorActors.find(ma => 
                ma.monitor.x === monitor.x && ma.monitor.y === monitor.y
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
            monitorActor.particles.forEach(p => p.destroy());
            monitorActor.actor.destroy();
        }
        this.monitorActors = [];
    }

    private _syncToggleState() {
        const mode: DisplayMode = this._settings.get_string('display-mode');
        const shouldRun = this._indicator.toggle.checked && 
                         (mode === 'screen' || (!Main.overview.visible && !this._isDesktopObscured()));
        const isRunning = !!this.timeoutId;

        if (shouldRun && !isRunning) {
            this._startAnimation();
        } else if (!shouldRun && isRunning) {
            this._stopAnimation();
        }
    }

    private _startAnimation() {
        if (this.timeoutId)
            return;

        const mode: DisplayMode = this._settings.get_string('display-mode');
        if (mode === 'wallpaper' && Main.overview.visible)
            return;

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
            monitorActor.particles.forEach(p => p.destroy());
            monitorActor.particles = [];
        }
    }

    private _isDesktopObscured(): boolean {
        const monitor = Main.layoutManager.primaryMonitor;
        const windows = global.get_window_actors()
            .map((actor: any) => actor.meta_window as Meta.Window)
            .filter(w => w.get_monitor() === monitor.index && !w.minimized);

        if (windows.length === 1) {
            const win = windows[0];
            return win.is_fullscreen() || (win.maximized_horizontally && win.maximized_vertically);
        } else if (windows.length >= 2) {
            const allMaxH = windows.every(w => w.maximized_horizontally && !w.maximized_vertically);
            const allMaxV = windows.every(w => !w.maximized_horizontally && w.maximized_vertically);
            return allMaxH || allMaxV;
        }
        return false;
    }

    private _createParticle(type: EffectType, monitorActor: MonitorActor, screenWidth: number): St.Widget {
        const size = this._settings.get_int('particle-size');
        const snowEmoji = this._settings.get_string('snow-emoji') as string;
        const rainEmoji = this._settings.get_string('rain-emoji') as string;

        let particle: St.Widget;
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
        monitorActor.actor.add_child(particle);
        return particle;
    }

    private _updateParticleStyle(particle: any, type: EffectType) {
        const size = this._settings.get_int('particle-size');
        const snowEmoji = this._settings.get_string('snow-emoji') as string;
        const rainEmoji = this._settings.get_string('rain-emoji') as string;

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

    private _animateParticles() {
        const type: EffectType = this._settings.get_string('effect-type');
        const totalParticleCount = this._settings.get_int('particle-count');
        const speed = this._settings.get_int('speed');
        const baseDuration = speed === 0 ? 2000 : speed === 1 ? 1000 : 500;
        const snowEmoji = this._settings.get_string('snow-emoji') as string;
        const rainEmoji = this._settings.get_string('rain-emoji') as string;

        const particleCountPerMonitor = Math.max(1, Math.floor(totalParticleCount / this.monitorActors.length));

        for (const monitorActor of this.monitorActors) {
            const screenWidth = monitorActor.monitor.width;
            const screenHeight = monitorActor.monitor.height;

            while (monitorActor.particles.length > particleCountPerMonitor) {
                const particle = monitorActor.particles.pop();
                if (particle)
                    particle.destroy();
            }

            if (monitorActor.particles.length < particleCountPerMonitor) {
                const toAdd = particleCountPerMonitor - monitorActor.particles.length;
                for (let i = 0; i < toAdd; i++) {
                    const particle = this._createParticle(type, monitorActor, screenWidth);
                    monitorActor.particles.push(particle);
                    this._animateSingleParticle(particle, monitorActor, screenHeight, baseDuration);
                }
            }

            for (let i = monitorActor.particles.length - 1; i >= 0; i--) {
                const particle: any = monitorActor.particles[i];
                const isSnowEmoji = snowEmoji && particle.text === snowEmoji;
                const isRainEmoji = rainEmoji && particle.text === rainEmoji;
                const isSnowDefault = !snowEmoji && particle.style && particle.style.includes('border-radius');
                const isRainDefault = !rainEmoji && particle.style && particle.style.includes('height:');

                const needsReplace = (type === 'snow' && !isSnowEmoji && !isSnowDefault) ||
                                     (type === 'rain' && !isRainEmoji && !isRainDefault);
                if (needsReplace) {
                    particle.destroy();
                    monitorActor.particles.splice(i, 1);
                    const newParticle = this._createParticle(type, monitorActor, screenWidth);
                    monitorActor.particles.push(newParticle);
                    this._animateSingleParticle(newParticle, monitorActor, screenHeight, baseDuration);
                }
            }
        }
    }

    private _animateSingleParticle(particle: any, monitorActor: MonitorActor, screenHeight: number, baseDuration: number) {
        const randomOffset = Math.random() * 500;
        particle.show();
        particle.ease({
            y: screenHeight + 20,
            duration: baseDuration + randomOffset,
            mode: Clutter.AnimationMode.LINEAR,
            onComplete: () => {
                particle.y = -20;
                particle.x = Math.random() * monitorActor.monitor.width;
                const updatedType: EffectType = this._settings.get_string('effect-type');
                const updatedTotalParticleCount = this._settings.get_int('particle-count');
                const updatedParticleCountPerMonitor = Math.max(1, Math.floor(updatedTotalParticleCount / this.monitorActors.length));
                const updatedSpeed = this._settings.get_int('speed');
                const updatedBaseDuration = updatedSpeed === 0 ? 2000 : updatedSpeed === 1 ? 1000 : 500;

                this._updateParticleStyle(particle, updatedType);
                const mode: DisplayMode = this._settings.get_string('display-mode');
                const canRun = this._indicator.toggle.checked && 
                              (mode === 'screen' || (!Main.overview.visible && !this._isDesktopObscured()));
                if (canRun && monitorActor.particles.length <= updatedParticleCountPerMonitor) {
                    this._animateSingleParticle(particle, monitorActor, screenHeight, updatedBaseDuration);
                } else {
                    particle.destroy();
                    const index = monitorActor.particles.indexOf(particle);
                    if (index !== -1) monitorActor.particles.splice(index, 1);
                }
            },
        });
    }
}