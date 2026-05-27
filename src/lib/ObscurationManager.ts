import Meta from "gi://Meta";
import * as Main from "resource:///org/gnome/shell/ui/main.js";

import { MonitorActor } from "./MonitorManager.js";
import { logDebug, logError } from "./Debug.js";

type DisplayMode = "wallpaper" | "screen";

/**
 * Detect whether a monitor is obscured by windows
 */
export class ObscurationManager {
  private monitorObscuredCache: Map<number, boolean> = new Map();
  private settings: any;

  constructor(settings: any) {
    this.settings = settings;
  }

  /**
   * Is monitor obscured by a window
   */
  isMonitorObscured(monitor: any): boolean {
    if (!monitor || typeof monitor.index !== "number") {
      return false;
    }

    try {
      const activeWs = global.workspace_manager.get_active_workspace();
      if (!activeWs) {
        return false;
      }

      const workArea = {
        x1: monitor.x,
        y1: monitor.y,
        x2: monitor.x + monitor.width,
        y2: monitor.y + monitor.height,
      };

      const windowActors = global.get_window_actors();
      if (!windowActors) {
        return false;
      }

      const windows = windowActors
        .map((actor: any) => {
          try {
            return actor?.meta_window as Meta.Window;
          } catch (e) {
            return null;
          }
        })
        .filter(
          (w): w is Meta.Window =>
            w !== null &&
            !w.minimized &&
            w.get_workspace() === activeWs &&
            w.get_monitor() === monitor.index &&
            w.get_window_type() === Meta.WindowType.NORMAL,
        );

      if (windows.some((w) => w.is_fullscreen())) {
        return true;
      }

      const rects = windows
        .map((w) => {
          if (!w) return null;
          const r = w.get_frame_rect();
          if (!r) return null;
          const x1 = Math.max(r.x, workArea.x1);
          const y1 = Math.max(r.y, workArea.y1);
          const x2 = Math.min(r.x + r.width, workArea.x2);
          const y2 = Math.min(r.y + r.height, workArea.y2);
          return x2 > x1 && y2 > y1 ? { x1, y1, x2, y2 } : null;
        })
        .filter(
          (r): r is { x1: number; y1: number; x2: number; y2: number } =>
            r !== null && r.x2 > r.x1 && r.y2 > r.y1,
        );

      if (!rects || rects.length === 0) {
        return false;
      }

      const covered = this._rectUnionArea(rects);
      const area = monitor.width * monitor.height;
      const ratio = covered / area;
      return ratio >= 0.95;
    } catch (e) {
      logError(`isMonitorObscured failed for monitor ${monitor.index}: ${e}`);
      return false;
    }
  }

  /**
   * Can run on monitor
   */
  canRunOnMonitor(
    monitorActor: MonitorActor,
    toggle: any,
    isOverviewVisible: boolean,
  ): boolean {
    try {
      if (!this.settings || !monitorActor) {
        return false;
      }

      let checked: boolean = false;
      try {
        if (!toggle || typeof toggle !== "object") {
          return false;
        }
        if (toggle._isDestroyedByGnome) {
          return false;
        }
        checked = !!(toggle as any).checked;
      } catch (e) {
        logError(`toggle check failed: ${e}`);
        return false;
      }

      const mode: DisplayMode = this.settings.get_string("display-mode");

      if (mode === "screen") {
        try {
          const activeWs = global.workspace_manager.get_active_workspace();
          if (!activeWs) {
            return checked;
          }

          const windowActors = global.get_window_actors();
          if (!windowActors) {
            return checked;
          }

          const windows = windowActors
            .map((actor: any) => {
              try {
                return actor?.meta_window as Meta.Window;
              } catch (e) {
                return null;
              }
            })
            .filter(
              (w): w is Meta.Window =>
                w !== null &&
                !w.minimized &&
                w.get_workspace() === activeWs &&
                w.get_monitor() === monitorActor.monitor.index &&
                w.get_window_type() === Meta.WindowType.NORMAL,
            );

          const pauseOnFullscreen = this.settings.get_boolean(
            "pause-on-fullscreen",
          );
          if (pauseOnFullscreen && windows.some((w) => w.is_fullscreen())) {
            return false;
          }

          return checked;
        } catch (e) {
          logError(
            `canRunOnMonitor screen-mode window check failed on monitor ${monitorActor.monitor.index}: ${e}`,
          );
          return checked;
        }
      }

      if (isOverviewVisible) return false;

      const obscured =
        this.monitorObscuredCache.get(monitorActor.monitor.index) ?? false;
      return !obscured && checked;
    } catch (e) {
      logError(`canRunOnMonitor failed: ${e}`);
      return false;
    }
  }

  /**
   * Recompute obscuration for all monitors
   */
  recomputeObscuration(monitorActors: MonitorActor[]) {
    try {
      if (!this.settings || !monitorActors) {
        return;
      }

      const mode: DisplayMode = this.settings.get_string("display-mode");

      if (mode === "screen") {
        this.monitorObscuredCache.clear();
        return;
      }

      for (const ma of monitorActors) {
        if (!ma || !ma.monitor) continue;

        const wasObscured =
          this.monitorObscuredCache.get(ma.monitor.index) ?? false;
        const nowObscured = this.isMonitorObscured(ma.monitor);

        if (wasObscured !== nowObscured) {
          logDebug(
            `Monitor ${ma.monitor.index} obscured: ${wasObscured} -> ${nowObscured}`,
          );
          this.monitorObscuredCache.set(ma.monitor.index, nowObscured);
        }
      }
    } catch (e) {
      logError(`recomputeObscuration failed: ${e}`);
    }
  }

  /**
   * Clear the obscuration cache
   */
  clear() {
    this.monitorObscuredCache.clear();
  }

  /**
   * Compute union area of rectangles
   */
  private _rectUnionArea(
    rects: { x1: number; y1: number; x2: number; y2: number }[],
  ): number {
    const events: { x: number; y1: number; y2: number; type: number }[] = [];

    for (const r of rects) {
      events.push({ x: r.x1, y1: r.y1, y2: r.y2, type: 1 });
      events.push({ x: r.x2, y1: r.y1, y2: r.y2, type: -1 });
    }
    events.sort((a, b) => a.x - b.x);

    let prevX = 0;
    let area = 0;
    let ys: { y1: number; y2: number }[] = [];
    let started = false;

    const coveredY = (intervals: { y1: number; y2: number }[]) => {
      if (intervals.length === 0) return 0;
      intervals.sort((a, b) => a.y1 - b.y1);
      let total = 0;
      let [cy1, cy2] = [intervals[0].y1, intervals[0].y2];
      for (let i = 1; i < intervals.length; i++) {
        const it = intervals[i];
        if (it.y1 <= cy2) {
          cy2 = Math.max(cy2, it.y2);
        } else {
          total += cy2 - cy1;
          [cy1, cy2] = [it.y1, it.y2];
        }
      }
      total += cy2 - cy1;
      return total;
    };

    for (const e of events) {
      if (!started) {
        prevX = e.x;
        started = true;
      }

      const dx = e.x - prevX;
      if (dx > 0) {
        area += coveredY(ys) * dx;
        prevX = e.x;
      }

      if (e.type === 1) {
        ys.push({ y1: e.y1, y2: e.y2 });
      } else {
        const idx = ys.findIndex((it) => it.y1 === e.y1 && it.y2 === e.y2);
        if (idx !== -1) ys.splice(idx, 1);
      }
    }
    return area;
  }
}
