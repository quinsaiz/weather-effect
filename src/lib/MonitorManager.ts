import Clutter from "gi://Clutter";
import type Gio from "gi://Gio";
import * as Main from "resource:///org/gnome/shell/ui/main.js";

export type ShellMonitor = (typeof Main.layoutManager.monitors)[number];
export type MonitorLayerActor = Clutter.Actor & {
  _weatherDestroyed: boolean;
};

export interface MonitorActor {
  actor: MonitorLayerActor | null;
  monitor: ShellMonitor;
}

/**
 * Manage monitors and their actors
 */
export class MonitorManager {
  private monitorActors: MonitorActor[] = [];
  private settings: Gio.Settings | null;
  private uiGroup: Clutter.Actor | null = null;
  private uiGroupDestroyId: number | null = null;
  private screenShieldGroup: Clutter.Actor | null = null;
  private screenShieldGroupDestroyId: number | null = null;
  private backgroundGroup: Clutter.Actor | null = null;
  private backgroundGroupDestroyId: number | null = null;
  private wallpaperUsesUiGroup = false;
  private shellContainersAvailable = true;

  constructor(settings: Gio.Settings) {
    this.settings = settings;

    this.uiGroup = Main.layoutManager.uiGroup;
    if (this.uiGroup) {
      this.uiGroupDestroyId = this.uiGroup.connect("destroy", () => {
        this.shellContainersAvailable = false;
        this.uiGroup = null;
        this.uiGroupDestroyId = null;
      });
    } else {
      this.shellContainersAvailable = false;
    }

    this.screenShieldGroup = Main.layoutManager.screenShieldGroup ?? null;
    if (this.screenShieldGroup) {
      this.screenShieldGroupDestroyId = this.screenShieldGroup.connect(
        "destroy",
        () => {
          this.screenShieldGroup = null;
          this.screenShieldGroupDestroyId = null;
        },
      );
    }

    this.backgroundGroup =
      (
        Main.layoutManager as typeof Main.layoutManager & {
          backgroundGroup?: Clutter.Actor;
        }
      ).backgroundGroup ??
      Main.layoutManager._backgroundGroup ??
      null;
    this.wallpaperUsesUiGroup = !this.backgroundGroup;

    if (this.backgroundGroup) {
      this.backgroundGroupDestroyId = this.backgroundGroup.connect(
        "destroy",
        () => {
          this.shellContainersAvailable = false;
          this.backgroundGroup = null;
          this.backgroundGroupDestroyId = null;
        },
      );
    }
  }

  hasAvailableContainer(): boolean {
    return this.getTargetContainer() !== null;
  }

  private getTargetContainer(): Clutter.Actor | null {
    if (!this.settings || !this.shellContainersAvailable) return null;

    const mode = this.settings.get_string("display-mode") as
      | "screen"
      | "wallpaper";

    if (mode === "wallpaper" && !this.wallpaperUsesUiGroup) {
      return this.backgroundGroup;
    }

    if (mode === "screen") {
      if (!this.uiGroup || !this.screenShieldGroup) return null;
      if (this.screenShieldGroup.get_parent() !== this.uiGroup) return null;
    }

    return this.uiGroup;
  }

  /**
   * Create actors for all monitors
   */
  createMonitorActors(): MonitorActor[] {
    if (!this.hasAvailableContainer()) {
      this.monitorActors = [];
      return this.monitorActors;
    }

    const monitors = Main.layoutManager.monitors;
    this.monitorActors = [];

    for (let i = 0; i < monitors.length; i++) {
      const monitor = monitors[i];
      this.monitorActors.push(this.createMonitorActor(monitor));
    }

    this.attachMonitorActors();
    return this.monitorActors;
  }

  /**
   * Attach actors to the scene
   */
  attachMonitorActors(): boolean {
    const targetContainer = this.getTargetContainer();
    if (!targetContainer) return false;

    const mode = this.settings?.get_string("display-mode") as
      | "screen"
      | "wallpaper";
    const screenShieldGroup =
      mode === "screen" ? this.screenShieldGroup : null;
    if (mode === "screen" && !screenShieldGroup) return false;

    for (const monitorActor of this.monitorActors) {
      if (
        !monitorActor.actor || monitorActor.actor._weatherDestroyed
      )
        continue;

      const parent = monitorActor.actor.get_parent();
      if (parent) parent.remove_child(monitorActor.actor);

      if (screenShieldGroup) {
        targetContainer.insert_child_below(
          monitorActor.actor,
          screenShieldGroup,
        );
      } else {
        targetContainer.add_child(monitorActor.actor);
      }
    }

    return this.updateMonitorActors();
  }

  /**
   * Update actor sizes and positions
   */
  updateMonitorActors(): boolean {
    if (!this.hasAvailableContainer()) return false;

    const monitors = Main.layoutManager.monitors;
    let needReattach = false;

    // Remove actors for disconnected monitors
    for (let i = this.monitorActors.length - 1; i >= 0; i--) {
      const monitorActor = this.monitorActors[i];

      if (
        !monitorActor?.actor || monitorActor.actor._weatherDestroyed
      ) {
        this.monitorActors.splice(i, 1);
        continue;
      }

      const exists = monitors.find(
        (m) => m.x === monitorActor.monitor.x && m.y === monitorActor.monitor.y,
      );

      if (!exists) {
        this.monitorActors.splice(i, 1);
        monitorActor.actor.destroy();
      }
    }

    // Add actors for new monitors
    for (const monitor of monitors) {
      const exists = this.monitorActors.find(
        (ma) => ma.monitor.x === monitor.x && ma.monitor.y === monitor.y,
      );
      if (exists) continue;

      this.monitorActors.push(this.createMonitorActor(monitor));
      needReattach = true;
    }

    if (needReattach) return this.attachMonitorActors();
    return true;
  }

  rebuildMonitorActors(): MonitorActor[] {
    this.destroyMonitorActors();
    return this.createMonitorActors();
  }

  /**
   * Destroy all actors
   */
  destroy() {
    this.destroyMonitorActors();
    this.disconnectShellContainerHandlers();
    this.shellContainersAvailable = false;
    this.settings = null;
  }

  private destroyMonitorActors() {
    const monitorActors = this.monitorActors;
    this.monitorActors = [];

    for (const monitorActor of monitorActors) {
      if (monitorActor) {
        if (
          monitorActor.actor && !monitorActor.actor._weatherDestroyed
        ) {
          monitorActor.actor.destroy();
          monitorActor.actor = null;
        }
      }
    }
  }

  private createMonitorActor(monitor: ShellMonitor): MonitorActor {
    const actor = new Clutter.Actor({
      width: monitor.width,
      height: monitor.height,
      reactive: false,
      clip_to_allocation: true,
      x: monitor.x,
      y: monitor.y,
    }) as MonitorLayerActor;
    const monitorActor: MonitorActor = { actor, monitor };

    actor._weatherDestroyed = false;
    actor.connect("destroy", (destroyedActor) => {
      destroyedActor._weatherDestroyed = true;
      monitorActor.actor = null;

      const index = this.monitorActors.indexOf(monitorActor);
      if (index !== -1) this.monitorActors.splice(index, 1);
    });

    return monitorActor;
  }

  private disconnectShellContainerHandlers() {
    if (
      this.uiGroupDestroyId !== null &&
      this.uiGroup
    ) {
      this.uiGroup.disconnect(this.uiGroupDestroyId);
    }
    this.uiGroupDestroyId = null;
    this.uiGroup = null;

    if (
      this.screenShieldGroupDestroyId !== null &&
      this.screenShieldGroup
    ) {
      this.screenShieldGroup.disconnect(this.screenShieldGroupDestroyId);
    }
    this.screenShieldGroupDestroyId = null;
    this.screenShieldGroup = null;

    if (
      this.backgroundGroupDestroyId !== null &&
      this.backgroundGroup
    ) {
      this.backgroundGroup.disconnect(this.backgroundGroupDestroyId);
    }
    this.backgroundGroupDestroyId = null;
    this.backgroundGroup = null;
  }

  /**
   * Get all monitor actors
   */
  getMonitorActors(): MonitorActor[] {
    return this.monitorActors;
  }
}
