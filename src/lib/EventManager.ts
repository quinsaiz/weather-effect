// @ts-nocheck
import GLib from "gi://GLib";
import * as Main from "resource:///org/gnome/shell/ui/main.js";

/**
 * Manage all signal/event handlers with optional debouncing
 */
export class EventManager {
  private handlers: Map<string, number[]> = new Map();
  private debounceTimers: Map<string, number> = new Map();

  /**
   * Subscribe to a signal
   */
  connect(
    object: any,
    signal: string,
    callback: () => void,
    debounceMs: number = 0
  ): string {
    const key = `${object}:${signal}`;

    if (debounceMs > 0) {
      const debouncedCallback = () => {
        if (this.debounceTimers.has(key)) {
          GLib.source_remove(this.debounceTimers.get(key)!);
        }
        this.debounceTimers.set(
          key,
          GLib.timeout_add(GLib.PRIORITY_DEFAULT, debounceMs, () => {
            callback();
            this.debounceTimers.delete(key);
            return GLib.SOURCE_REMOVE;
          })
        );
      };
      const id = object.connect(signal, debouncedCallback);
      if (!this.handlers.has(key)) this.handlers.set(key, []);
      this.handlers.get(key)!.push(id);
      return key;
    }

    const id = object.connect(signal, callback);
    if (!this.handlers.has(key)) this.handlers.set(key, []);
    this.handlers.get(key)!.push(id);
    return key;
  }

  /**
   * Unsubscribe from a signal
   */
  disconnect(object: any, key: string) {
    if (!this.handlers.has(key)) return;

    const ids = this.handlers.get(key)!;
    for (const id of ids) {
      object.disconnect(id);
    }
    this.handlers.delete(key);

    if (this.debounceTimers.has(key)) {
      GLib.source_remove(this.debounceTimers.get(key)!);
      this.debounceTimers.delete(key);
    }
  }

  /**
   * Clear all handlers
   */
  disconnectAll() {
    for (const [key, ids] of this.handlers) {
      for (const id of ids) {
        // Handler likely destroyed along with the object
      }
    }
    this.handlers.clear();

    for (const timerId of this.debounceTimers.values()) {
      GLib.source_remove(timerId);
    }
    this.debounceTimers.clear();
  }
}
