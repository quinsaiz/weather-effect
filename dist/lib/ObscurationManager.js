// @ts-nocheck
import Meta from "gi://Meta";
import { logDebug } from "./Debug.js";
/**
 * Detect whether a monitor is obscured by windows
 */
export class ObscurationManager {
    monitorObscuredCache = new Map();
    settings;
    constructor(settings) {
        this.settings = settings;
    }
    /**
     * Is monitor obscured by a window
     */
    isMonitorObscured(monitor) {
        const activeWs = global.workspace_manager.get_active_workspace();
        const workArea = {
            x1: monitor.x,
            y1: monitor.y,
            x2: monitor.x + monitor.width,
            y2: monitor.y + monitor.height,
        };
        const windows = global
            .get_window_actors()
            .map((actor) => actor.meta_window)
            .filter((w) => !w.minimized &&
            w.get_workspace() === activeWs &&
            w.get_monitor() === monitor.index &&
            w.get_window_type() === Meta.WindowType.NORMAL);
        if (windows.some((w) => w.is_fullscreen())) {
            return true;
        }
        const rects = windows
            .map((w) => {
            const r = w.get_frame_rect();
            const x1 = Math.max(r.x, workArea.x1);
            const y1 = Math.max(r.y, workArea.y1);
            const x2 = Math.min(r.x + r.width, workArea.x2);
            const y2 = Math.min(r.y + r.height, workArea.y2);
            return x2 > x1 && y2 > y1
                ? { x1, y1, x2, y2 }
                : { x1: 0, y1: 0, x2: 0, y2: 0 };
        })
            .filter((r) => r.x2 > r.x1 && r.y2 > r.y1);
        if (rects.length === 0) {
            return false;
        }
        const covered = this._rectUnionArea(rects);
        const area = monitor.width * monitor.height;
        const ratio = covered / area;
        return ratio >= 0.95;
    }
    /**
     * Can run on monitor
     */
    canRunOnMonitor(monitorActor, toggle, isOverviewVisible) {
        const mode = this.settings.get_string("display-mode");
        if (mode === "screen") {
            const activeWs = global.workspace_manager.get_active_workspace();
            const windows = global
                .get_window_actors()
                .map((actor) => actor.meta_window)
                .filter((w) => !w.minimized &&
                w.get_workspace() === activeWs &&
                w.get_monitor() === monitorActor.monitor.index &&
                w.get_window_type() === Meta.WindowType.NORMAL);
            const pauseOnFullscreen = this.settings.get_boolean("pause-on-fullscreen");
            if (pauseOnFullscreen && windows.some((w) => w.is_fullscreen())) {
                return false;
            }
            return toggle.checked;
        }
        if (isOverviewVisible)
            return false;
        const obscured = this.monitorObscuredCache.get(monitorActor.monitor.index) ?? false;
        return !obscured && toggle.checked;
    }
    /**
     * Recompute obscuration for all monitors
     */
    recomputeObscuration(monitorActors) {
        const mode = this.settings.get_string("display-mode");
        if (mode === "screen") {
            this.monitorObscuredCache.clear();
            return;
        }
        for (const ma of monitorActors) {
            const wasObscured = this.monitorObscuredCache.get(ma.monitor.index) ?? false;
            const nowObscured = this.isMonitorObscured(ma.monitor);
            if (wasObscured !== nowObscured) {
                logDebug(`Monitor ${ma.monitor.index} obscured: ${wasObscured} -> ${nowObscured}`);
                this.monitorObscuredCache.set(ma.monitor.index, nowObscured);
            }
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
    _rectUnionArea(rects) {
        const events = [];
        for (const r of rects) {
            events.push({ x: r.x1, y1: r.y1, y2: r.y2, type: 1 });
            events.push({ x: r.x2, y1: r.y1, y2: r.y2, type: -1 });
        }
        events.sort((a, b) => a.x - b.x);
        let prevX = 0;
        let area = 0;
        let ys = [];
        let started = false;
        const coveredY = (intervals) => {
            if (intervals.length === 0)
                return 0;
            intervals.sort((a, b) => a.y1 - b.y1);
            let total = 0;
            let [cy1, cy2] = [intervals[0].y1, intervals[0].y2];
            for (let i = 1; i < intervals.length; i++) {
                const it = intervals[i];
                if (it.y1 <= cy2) {
                    cy2 = Math.max(cy2, it.y2);
                }
                else {
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
            }
            else {
                const idx = ys.findIndex((it) => it.y1 === e.y1 && it.y2 === e.y2);
                if (idx !== -1)
                    ys.splice(idx, 1);
            }
        }
        return area;
    }
}
