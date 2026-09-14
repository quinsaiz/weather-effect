import type Gio from "gi://Gio";
import Meta from "gi://Meta";

import type { MonitorLayerRecord, ShellMonitor } from "./MonitorManager.js";

type DisplayMode = "wallpaper" | "screen";
type CoverageRectangle = {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
};

/**
 * Detect whether a monitor is obscured by windows
 */
export class ObscurationManager {
  private monitorObscuredCache: Map<number, boolean> = new Map();
  private fullscreenCoveredMonitorIndexes: Set<number> = new Set();
  private settings: Gio.Settings;

  constructor(settings: Gio.Settings) {
    this.settings = settings;
  }

  /**
   * Get the current monitor actors that may render particles.
   */
  getRunnableMonitorActors(
    monitorActors: MonitorLayerRecord[],
    isOverviewVisible: boolean,
  ): MonitorLayerRecord[] {
    if (!this.settings.get_boolean("active")) return [];

    const currentMonitorActors = monitorActors.filter(
      (monitorActor) =>
        !!monitorActor.actor &&
        !monitorActor.actor._weatherDestroyed,
    );
    const mode = this.settings.get_string("display-mode") as DisplayMode;

    if (mode === "screen") {
      if (!this.settings.get_boolean("pause-on-fullscreen")) {
        return currentMonitorActors;
      }

      return currentMonitorActors.filter(
        (monitorActor) =>
          !this.isCachedFullscreenCovered(monitorActor.monitor.index),
      );
    }

    if (isOverviewVisible) return [];

    return currentMonitorActors.filter(
      (monitorActor) =>
        !(this.monitorObscuredCache.get(monitorActor.monitor.index) ?? false),
    );
  }

  refreshFullscreenState() {
    const fullscreenCoveredMonitorIndexes = new Set<number>();

    if (
      this.settings.get_boolean("active") &&
      this.settings.get_string("display-mode") === "screen" &&
      this.settings.get_boolean("pause-on-fullscreen")
    ) {
      const activeWs = global.workspace_manager.get_active_workspace();
      const windowActors = activeWs ? global.get_window_actors() : null;

      if (windowActors) {
        for (const actor of windowActors) {
          const window = actor?.meta_window;
          if (
            window &&
            !window.minimized &&
            window.get_workspace() === activeWs &&
            window.get_window_type() === Meta.WindowType.NORMAL &&
            window.is_fullscreen()
          ) {
            fullscreenCoveredMonitorIndexes.add(window.get_monitor());
          }
        }
      }
    }

    this.fullscreenCoveredMonitorIndexes = fullscreenCoveredMonitorIndexes;
  }

  isCachedFullscreenCovered(monitorIndex: number): boolean {
    return this.fullscreenCoveredMonitorIndexes.has(monitorIndex);
  }

  clearFullscreenState() {
    this.fullscreenCoveredMonitorIndexes.clear();
  }

  /**
   * Recompute obscuration for all monitors
   */
  recomputeObscuration(monitorActors: MonitorLayerRecord[]) {
    const mode = this.settings.get_string("display-mode") as DisplayMode;

    if (mode === "screen") {
      this.monitorObscuredCache.clear();
      return;
    }

    const monitorCoverage = new Map<
      number,
      {
        monitor: ShellMonitor;
        x1: number;
        y1: number;
        x2: number;
        y2: number;
        rectangles: CoverageRectangle[];
        hasFullscreen: boolean;
      }
    >();
    for (const monitorActor of monitorActors) {
      monitorCoverage.set(monitorActor.monitor.index, {
        monitor: monitorActor.monitor,
        x1: monitorActor.monitor.x,
        y1: monitorActor.monitor.y,
        x2: monitorActor.monitor.x + monitorActor.monitor.width,
        y2: monitorActor.monitor.y + monitorActor.monitor.height,
        rectangles: [],
        hasFullscreen: false,
      });
    }

    if (monitorCoverage.size === 0) return;

    const activeWs = global.workspace_manager.get_active_workspace();
    const windowActors = activeWs ? global.get_window_actors() : null;

    if (windowActors) {
      for (const actor of windowActors) {
        const window = actor?.meta_window;
        if (
          !window ||
          window.minimized ||
          window.get_workspace() !== activeWs ||
          window.get_window_type() !== Meta.WindowType.NORMAL
        ) {
          continue;
        }

        const monitorIndex = window.get_monitor();
        const isFullscreen = window.is_fullscreen();
        const coverage = monitorCoverage.get(monitorIndex);
        if (!coverage) continue;

        if (isFullscreen) {
          coverage.hasFullscreen = true;
          continue;
        }

        const frameRect = window.get_frame_rect();
        if (!frameRect) continue;

        const x1 = Math.max(frameRect.x, coverage.x1);
        const y1 = Math.max(frameRect.y, coverage.y1);
        const x2 = Math.min(frameRect.x + frameRect.width, coverage.x2);
        const y2 = Math.min(frameRect.y + frameRect.height, coverage.y2);
        if (x2 <= x1 || y2 <= y1) continue;

        coverage.rectangles.push({ x1, y1, x2, y2 });
      }
    }

    for (const coverage of monitorCoverage.values()) {
      const monitor = coverage.monitor;
      const area = monitor.width * monitor.height;
      const nowObscured =
        coverage.hasFullscreen ||
        (coverage.rectangles.length > 0 &&
          this._rectUnionArea(coverage.rectangles) / area >= 0.95);
      this.monitorObscuredCache.set(monitor.index, nowObscured);
    }
  }

  /**
   * Clear the obscuration cache
   */
  clear() {
    this.monitorObscuredCache.clear();
    this.clearFullscreenState();
  }

  /**
   * Compute union area of rectangles
   */
  private _rectUnionArea(
    rects: CoverageRectangle[],
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
