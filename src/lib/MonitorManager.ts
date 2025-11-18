// @ts-nocheck
import Clutter from "gi://Clutter";
import St from "gi://St";
import * as Main from "resource:///org/gnome/shell/ui/main.js";

import { logDebug } from "./Debug.js";

export interface MonitorActor {
  actor: Clutter.Actor;
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
    const mode = this.settings.get_string("display-mode") as
      | "screen"
      | "wallpaper";

    for (const monitorActor of this.monitorActors) {
      const parent = monitorActor.actor.get_parent();
      if (parent) parent.remove_child(monitorActor.actor);

      if (mode === "screen") {
        Main.layoutManager.uiGroup.add_child(monitorActor.actor);
      } else {
        Main.layoutManager._backgroundGroup.add_child(monitorActor.actor);
      }
    }
    this.updateMonitorActors();
  }

  /**
   * Update actor sizes and positions
   */
  updateMonitorActors() {
    const monitors = Main.layoutManager.monitors;

    for (let i = this.monitorActors.length - 1; i >= 0; i--) {
      const monitorActor = this.monitorActors[i];
      if (
        !monitors.find(
          (m: any) =>
            m.x === monitorActor.monitor.x && m.y === monitorActor.monitor.y
        )
      ) {
        monitorActor.particles = [];
        monitorActor.actor.destroy();
        this.monitorActors.splice(i, 1);
      }
    }

    for (let i = 0; i < monitors.length; i++) {
      const monitor = monitors[i];
      let monitorActor = this.monitorActors.find(
        (ma) => ma.monitor.x === monitor.x && ma.monitor.y === monitor.y
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
        this.attachMonitorActors();
      } else {
        monitorActor.monitor = monitor;
        monitorActor.actor.set_size(monitor.width, monitor.height);
        monitorActor.actor.set_position(monitor.x, monitor.y);
      }
    }
  }

  /**
   * Destroy all actors
   */
  destroy() {
    for (const monitorActor of this.monitorActors) {
      monitorActor.particles.forEach((p) => {
        p.remove_all_transitions();
        p.destroy();
      });
      monitorActor.particles = [];
      monitorActor.actor.destroy();
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
    monitorActor.particles.forEach((p) => {
      p.remove_all_transitions();
      p.destroy();
    });
    monitorActor.particles = [];
  }
}
