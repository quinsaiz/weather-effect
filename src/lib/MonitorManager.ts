import Clutter from "gi://Clutter";
import St from "gi://St";
import * as Main from "resource:///org/gnome/shell/ui/main.js";

import { logDebug, logError } from "./Debug.js";

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

  constructor(settings: any) {
    this.settings = settings;
  }

  /**
   * Create actors for all monitors
   */
  createMonitorActors(): MonitorActor[] {
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

      (actor as any)._isDestroyedByGnome = false;
      actor.connect("destroy", (a: any) => {
        a._isDestroyedByGnome = true;
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
  attachMonitorActors() {
    if (!this.settings) {
      return;
    }

    const mode = this.settings.get_string("display-mode") as
      | "screen"
      | "wallpaper";
    const backgroundGroup =
      (Main.layoutManager as any).backgroundGroup ??
      (Main.layoutManager as any)._backgroundGroup;

    for (const monitorActor of this.monitorActors) {
      if (!monitorActor.actor || (monitorActor.actor as any)._isDestroyedByGnome) {
        continue;
      }

      try {
        const parent = monitorActor.actor.get_parent();
        if (parent) parent.remove_child(monitorActor.actor);
      } catch (e) {
        logError(`detach monitor actor failed: ${e}`);
        continue;
      }

      if (mode === "screen") {
        try {
          Main.layoutManager.uiGroup.add_child(monitorActor.actor);
        } catch (e) {
          logError(`attach monitor actor to uiGroup failed: ${e}`);
        }
      } else if (backgroundGroup) {
        try {
          backgroundGroup.add_child(monitorActor.actor);
        } catch (e) {
          logError(`attach monitor actor to backgroundGroup failed: ${e}`);
        }
      } else {
        try {
          Main.layoutManager.uiGroup.add_child(monitorActor.actor);
        } catch (e) {
          logError(`attach monitor actor to fallback group failed: ${e}`);
        }
      }
    }
    this.updateMonitorActors();
  }

  /**
   * Update actor sizes and positions
   */
  updateMonitorActors() {
    const monitors = Main.layoutManager.monitors;
    let needReattach = false;

    for (let i = this.monitorActors.length - 1; i >= 0; i--) {
      const monitorActor = this.monitorActors[i];
      if (!monitorActor?.actor || (monitorActor.actor as any)._isDestroyedByGnome) {
        this.monitorActors.splice(i, 1);
        continue;
      }

      const exists = monitors.find(
        (m: any) =>
          m.x === monitorActor.monitor.x && m.y === monitorActor.monitor.y,
      );

      if (!exists) {
        monitorActor.particles = [];
        try {
          monitorActor.actor.destroy();
        } catch (e) {
          logError(`destroy monitor actor failed: ${e}`);
        }
        this.monitorActors.splice(i, 1);
      }
    }

    for (let i = 0; i < monitors.length; i++) {
      const monitor = monitors[i];
      let monitorActor = this.monitorActors.find(
        (ma) => ma.monitor.x === monitor.x && ma.monitor.y === monitor.y,
      );

      if (!monitorActor) {
        const actor = new Clutter.Actor({
          width: monitor.width,
          height: monitor.height,
          reactive: false,
          x: monitor.x,
          y: monitor.y,
        });

        (actor as any)._isDestroyedByGnome = false;
        actor.connect("destroy", (a: any) => {
          a._isDestroyedByGnome = true;
        });

        monitorActor = {
          actor: actor,
          monitor: monitor,
          particles: [],
        };
        this.monitorActors.push(monitorActor);
        needReattach = true;
        monitorActor.monitor = monitor;

        if (!monitorActor.actor || (monitorActor.actor as any)._isDestroyedByGnome) {
          continue;
        }
        try {
          monitorActor.actor.set_size(monitor.width, monitor.height);
          monitorActor.actor.set_position(monitor.x, monitor.y);
        } catch (e) {
          logError(`update monitor actor geometry failed: ${e}`);
        }
      }

      if (needReattach) {
        this.attachMonitorActors();
      }
    }
  }

  /**
   * Destroy all actors
   */
  destroy() {
    for (const monitorActor of this.monitorActors) {
      if (monitorActor) {
        monitorActor.particles.forEach((p) => {
          if (p && !(p as any)._isDestroyedByGnome) {
            try {
              (p as any)._weatherDisposed = true;
              p.remove_all_transitions();
              p.destroy();
            } catch (e) {
              logError(`destroy particle on monitor destroy failed: ${e}`);
            }
          }
        });
        monitorActor.particles = [];
        if (monitorActor.actor && !(monitorActor.actor as any)._isDestroyedByGnome) {
          try {
            monitorActor.actor.destroy();
            monitorActor.actor = null;
          } catch (e) {
            logError(`destroy monitor actor failed: ${e}`);
          }
        }
      }
    }
    this.monitorActors = [];
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

    if (!monitorActor.actor || (monitorActor.actor as any)._isDestroyedByGnome) {
      monitorActor.particles = [];
      return;
    }

    monitorActor.particles.forEach((p) => {
      if (p && !(p as any)._isDestroyedByGnome) {
        try {
          (p as any)._weatherDisposed = true;
          p.remove_all_transitions();
          p.destroy();
        } catch (e) {
          logError(`destroy particle on monitor clear particles failed: ${e}`);
        }
      }
    });
    monitorActor.particles = [];
  }
}
