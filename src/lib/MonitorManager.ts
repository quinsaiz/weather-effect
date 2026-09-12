import Clutter from "gi://Clutter";
import St from "gi://St";
import * as Main from "resource:///org/gnome/shell/ui/main.js";


export interface MonitorActor {
  actor: Clutter.Actor | null;
  monitor: any;
  particles: St.Widget[];
}

/**
 * Manage monitors and their actors
 */
export class MonitorManager {
  private monitorActors: MonitorActor[] = [];
  private settings: any;
  private uiGroup: Clutter.Actor | null = null;
  private uiGroupDestroyId: number | null = null;
  private backgroundGroup: Clutter.Actor | null = null;
  private backgroundGroupDestroyId: number | null = null;
  private wallpaperUsesUiGroup = false;
  private shellContainersAvailable = true;

  constructor(settings: any) {
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

    this.backgroundGroup =
      (Main.layoutManager as any).backgroundGroup ??
      (Main.layoutManager as any)._backgroundGroup ??
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
      const actor = new Clutter.Actor({
        width: monitor.width,
        height: monitor.height,
        reactive: false,
        x: monitor.x,
        y: monitor.y,
      });

      (actor as any)._weatherDestroyed = false;
      actor.connect("destroy", (a: any) => {
        a._weatherDestroyed = true;
      });

      this.monitorActors.push({
        actor: actor,
        monitor: monitor,
        particles: [],
      });
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

    for (const monitorActor of this.monitorActors) {
      if (
        !monitorActor.actor ||
        (monitorActor.actor as any)._weatherDestroyed
      )
        continue;

      const parent = monitorActor.actor.get_parent();
      if (parent) parent.remove_child(monitorActor.actor);

      targetContainer.add_child(monitorActor.actor);
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
        !monitorActor?.actor ||
        (monitorActor.actor as any)._weatherDestroyed
      ) {
        this.monitorActors.splice(i, 1);
        continue;
      }

      const exists = monitors.find(
        (m: any) =>
          m.x === monitorActor.monitor.x && m.y === monitorActor.monitor.y,
      );

      if (!exists) {
        monitorActor.particles = [];
        monitorActor.actor.destroy();
        this.monitorActors.splice(i, 1);
      }
    }

    // Add actors for new monitors
    for (const monitor of monitors) {
      const exists = this.monitorActors.find(
        (ma) => ma.monitor.x === monitor.x && ma.monitor.y === monitor.y,
      );
      if (exists) continue;

      const actor = new Clutter.Actor({
        width: monitor.width,
        height: monitor.height,
        reactive: false,
        x: monitor.x,
        y: monitor.y,
      });

      (actor as any)._weatherDestroyed = false;
      actor.connect("destroy", (a: any) => {
        a._weatherDestroyed = true;
      });

      this.monitorActors.push({ actor, monitor, particles: [] });
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
    for (const monitorActor of this.monitorActors) {
      if (monitorActor) {
        monitorActor.particles.forEach((p) => {
          if (p && !(p as any)._weatherDestroyed) {
            (p as any)._weatherDisposed = true;
            p.remove_all_transitions();
            p.destroy();
          }
        });
        monitorActor.particles = [];
        if (
          monitorActor.actor &&
          !(monitorActor.actor as any)._weatherDestroyed
        ) {
          monitorActor.actor.destroy();
          monitorActor.actor = null;
        }
      }
    }
    this.monitorActors = [];
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

  /**
   * Clear particles from a monitor
   */
  clearParticles(monitorActor: MonitorActor) {
    if (!monitorActor) {
      return;
    }

    if (
      !monitorActor.actor ||
      (monitorActor.actor as any)._weatherDestroyed
    ) {
      monitorActor.particles = [];
      return;
    }

    monitorActor.particles.forEach((p) => {
      if (p && !(p as any)._weatherDestroyed) {
        (p as any)._weatherDisposed = true;
        p.remove_all_transitions();
        p.destroy();
      }
    });
    monitorActor.particles = [];
  }
}
