import Clutter from "gi://Clutter";
import type Gio from "gi://Gio";
import St from "gi://St";

import type { MonitorLayerRecord } from "./MonitorManager.js";

export type EffectType = "snow" | "rain";

type ParticleActor = St.Widget & {
  _weatherDestroyed?: boolean;
};

export interface ParticleTarget {
  monitorActor: MonitorLayerRecord;
  type: EffectType;
  count: number;
  speed: number;
}

interface MonitorParticleState {
  particles: ParticleActor[];
  target: ParticleTarget | null;
  monitorDestroyId: number | null;
}

/**
 * Owns particle creation, animation, reconciliation, and retirement.
 */
export class ParticleManager {
  private settings: Gio.Settings | null;
  private monitorStates: Map<MonitorLayerRecord, MonitorParticleState> = new Map();

  constructor(settings: Gio.Settings) {
    this.settings = settings;
  }

  reconcile(
    liveMonitorActors: readonly MonitorLayerRecord[],
    targets: readonly ParticleTarget[],
  ): void {
    if (!this.settings) return;

    const liveMonitorSet = new Set(
      liveMonitorActors.filter(
        (monitorActor) =>
          !!monitorActor.actor && !monitorActor.actor._weatherDestroyed,
      ),
    );

    for (const [monitorActor, state] of this.monitorStates) {
      if (!liveMonitorSet.has(monitorActor)) {
        this.retireMonitorState(monitorActor, state);
      }
    }

    for (const monitorActor of liveMonitorSet) {
      this.ensureMonitorState(monitorActor);
    }

    const targetByMonitor = new Map(
      targets.map((target) => [target.monitorActor, target]),
    );

    for (const monitorActor of liveMonitorSet) {
      const state = this.monitorStates.get(monitorActor);
      if (!state) continue;

      const target = targetByMonitor.get(monitorActor) ?? null;
      state.target = target;

      if (target) {
        this.reconcileMonitorState(monitorActor, state, target);
      } else {
        this.clearMonitorState(state);
      }
    }
  }

  refreshAppearance(): void {
    if (!this.settings) return;

    const type = this.settings.get_string("effect-type") as EffectType;
    const speed = this.settings.get_int("speed");
    for (const [monitorActor, state] of this.monitorStates) {
      const target = state.target;
      if (!target) continue;

      target.type = type;
      target.speed = speed;
      this.reconcileMonitorState(monitorActor, state, target, true);
    }
  }

  clearAll(): void {
    for (const state of this.monitorStates.values()) {
      state.target = null;
      this.clearMonitorState(state);
    }
  }

  destroy(): void {
    this.clearAll();

    for (const [monitorActor, state] of this.monitorStates) {
      const actor = monitorActor.actor;
      if (
        state.monitorDestroyId !== null &&
        actor &&
        !actor._weatherDestroyed
      ) {
        actor.disconnect(state.monitorDestroyId);
      }
      state.monitorDestroyId = null;
      state.particles = [];
    }

    this.monitorStates.clear();
    this.settings = null;
  }

  private ensureMonitorState(
    monitorActor: MonitorLayerRecord,
  ): MonitorParticleState | null {
    const existingState = this.monitorStates.get(monitorActor);
    if (existingState) return existingState;

    const actor = monitorActor.actor;
    if (!actor || actor._weatherDestroyed) return null;

    const state: MonitorParticleState = {
      particles: [],
      target: null,
      monitorDestroyId: null,
    };

    state.monitorDestroyId = actor.connect("destroy", () => {
      state.monitorDestroyId = null;
      state.target = null;
      state.particles = [];
      this.monitorStates.delete(monitorActor);
    });
    this.monitorStates.set(monitorActor, state);
    return state;
  }

  private retireMonitorState(
    monitorActor: MonitorLayerRecord,
    state: MonitorParticleState,
  ): void {
    state.target = null;
    const actor = monitorActor.actor;

    if (actor && !actor._weatherDestroyed) {
      this.clearMonitorState(state);
      if (state.monitorDestroyId !== null) {
        actor.disconnect(state.monitorDestroyId);
      }
    } else {
      state.particles = [];
    }

    state.monitorDestroyId = null;
    this.monitorStates.delete(monitorActor);
  }

  private reconcileMonitorState(
    monitorActor: MonitorLayerRecord,
    state: MonitorParticleState,
    target: ParticleTarget,
    refreshStyle = false,
  ): void {
    const actor = monitorActor.actor;
    if (!actor || actor._weatherDestroyed) return;

    while (state.particles.length > target.count) {
      const particle = state.particles.pop();
      if (particle) this.retireParticle(state, particle);
    }

    while (state.particles.length < target.count) {
      const particle = this.createParticle(monitorActor, state, target.type);
      if (!particle) break;

      particle.y = Math.random() * Math.max(1, monitorActor.monitor.height) - 20;
      state.particles.push(particle);
      this.animateParticle(monitorActor, state, particle, target.speed);
    }

    for (let index = state.particles.length - 1; index >= 0; index--) {
      const particle = state.particles[index];

      if (particle._weatherDestroyed) {
        state.particles.splice(index, 1);
        continue;
      }

      if (!this.isCorrectType(particle, target.type)) {
        const currentX = particle.x;
        const currentY = particle.y;

        this.retireParticle(state, particle);

        if (!state.target) continue;

        const replacement = this.createParticle(
          monitorActor,
          state,
          target.type,
        );
        if (!replacement) continue;

        replacement.x = currentX;
        replacement.y = currentY;
        state.particles.push(replacement);
        this.animateParticle(monitorActor, state, replacement, target.speed);
        continue;
      }

      if (refreshStyle) this.updateParticleStyle(particle, target.type);
    }
  }

  private createParticle(
    monitorActor: MonitorLayerRecord,
    state: MonitorParticleState,
    type: EffectType,
  ): ParticleActor | null {
    const actor = monitorActor.actor;
    if (!this.settings || !actor || actor._weatherDestroyed) {
      return null;
    }

    const size = this.settings.get_int("particle-size");
    const snowEmoji = (this.settings.get_string("snow-emoji") || "").trim();
    const rainEmoji = (this.settings.get_string("rain-emoji") || "").trim();
    const x = Math.random() * Math.max(1, monitorActor.monitor.width);

    let particle: ParticleActor;
    if (type === "snow") {
      if (snowEmoji) {
        particle = new St.Label({
          text: snowEmoji,
          style: `font-size: ${size}px; color: ${this.settings.get_string(
            "snow-color",
          )};`,
          x,
          y: -20,
        }) as ParticleActor;
      } else {
        particle = new St.Widget({
          style: `background-color: ${this.settings.get_string(
            "snow-color",
          )}; width: ${size}px; height: ${size}px; border-radius: ${size}px;`,
          x,
          y: -20,
        }) as ParticleActor;
      }
    } else if (rainEmoji) {
      particle = new St.Label({
        text: rainEmoji,
        style: `font-size: ${size}px; color: ${this.settings.get_string(
          "rain-color",
        )};`,
        x,
        y: -20,
      }) as ParticleActor;
    } else {
      particle = new St.Widget({
        style: `background-color: ${this.settings.get_string(
          "rain-color",
        )}; width: ${size / 2}px; height: ${size * 2}px;`,
        x,
        y: -20,
      }) as ParticleActor;
    }

    particle._weatherDestroyed = false;
    particle.connect("destroy", (destroyedParticle) => {
      destroyedParticle._weatherDestroyed = true;
      const index = state.particles.indexOf(destroyedParticle);
      if (index !== -1) state.particles.splice(index, 1);
    });
    actor.add_child(particle);
    return particle;
  }

  private animateParticle(
    monitorActor: MonitorLayerRecord,
    state: MonitorParticleState,
    particle: ParticleActor,
    speed: number,
  ): void {
    const actor = monitorActor.actor;
    if (
      particle._weatherDestroyed ||
      !actor ||
      actor._weatherDestroyed
    ) {
      return;
    }

    const monitorHeight = Math.max(1, monitorActor.monitor.height);
    const baseDuration = this.getBaseDuration(speed);
    const targetY = monitorHeight + 20;
    const totalDistance = targetY + 20;
    const distanceToTravel = Math.max(1, targetY - particle.y);
    const duration =
      (distanceToTravel / totalDistance) *
      (baseDuration + Math.random() * 500);

    particle.show();
    particle.ease({
      y: targetY,
      duration,
      mode: Clutter.AnimationMode.LINEAR,
      onComplete: () => {
        this.handleTransitionComplete(monitorActor, state, particle);
      },
    });
  }

  private handleTransitionComplete(
    monitorActor: MonitorLayerRecord,
    state: MonitorParticleState,
    particle: ParticleActor,
  ): void {
    if (
      !this.settings ||
      this.monitorStates.get(monitorActor) !== state ||
      !state.target ||
      !state.particles.includes(particle)
    ) {
      return;
    }

    const actor = monitorActor.actor;
    if (
      !actor ||
      actor._weatherDestroyed ||
      particle._weatherDestroyed
    )
      return;

    particle.y = -20;
    particle.x = Math.random() * Math.max(1, monitorActor.monitor.width);

    const speed = this.settings.get_int("speed");

    if (!this.settings.get_boolean("active")) {
      this.retireParticle(state, particle);
      return;
    }

    this.animateParticle(monitorActor, state, particle, speed);
  }

  private clearMonitorState(state: MonitorParticleState): void {
    for (const particle of [...state.particles]) {
      this.retireParticle(state, particle);
    }
    state.particles = [];
  }

  private retireParticle(
    state: MonitorParticleState,
    particle: ParticleActor,
  ): void {
    const index = state.particles.indexOf(particle);
    if (index !== -1) state.particles.splice(index, 1);

    if (particle._weatherDestroyed) return;
    particle.remove_all_transitions();
    particle.destroy();
  }

  private updateParticleStyle(particle: ParticleActor, type: EffectType): void {
    if (!this.settings || particle._weatherDestroyed) return;

    const size = this.settings.get_int("particle-size");
    const snowEmoji = (this.settings.get_string("snow-emoji") || "").trim();
    const rainEmoji = (this.settings.get_string("rain-emoji") || "").trim();

    if (type === "snow") {
      if (snowEmoji && particle instanceof St.Label) {
        particle.text = snowEmoji;
        particle.style = `font-size: ${size}px; color: ${this.settings.get_string(
          "snow-color",
        )};`;
      } else if (!(particle instanceof St.Label)) {
        particle.style = `background-color: ${this.settings.get_string(
          "snow-color",
        )}; width: ${size}px; height: ${size}px; border-radius: ${size}px;`;
      }
    } else if (rainEmoji && particle instanceof St.Label) {
      particle.text = rainEmoji;
      particle.style = `font-size: ${size}px; color: ${this.settings.get_string(
        "rain-color",
      )};`;
    } else if (!(particle instanceof St.Label)) {
      particle.style = `background-color: ${this.settings.get_string(
        "rain-color",
      )}; width: ${size / 2}px; height: ${size * 2}px;`;
    }
  }

  private isCorrectType(particle: ParticleActor, type: EffectType): boolean {
    if (!this.settings || particle._weatherDestroyed) return false;

    const snowEmoji = (this.settings.get_string("snow-emoji") || "").trim();
    const rainEmoji = (this.settings.get_string("rain-emoji") || "").trim();

    if (type === "snow") {
      return snowEmoji
        ? particle instanceof St.Label && particle.text === snowEmoji
        : particle instanceof St.Widget && !(particle instanceof St.Label);
    }

    return rainEmoji
      ? particle instanceof St.Label && particle.text === rainEmoji
      : particle instanceof St.Widget && !(particle instanceof St.Label);
  }

  private getBaseDuration(speed: number): number {
    switch (speed) {
      case 0:
        return 3500;
      case 1:
        return 2000;
      case 2:
        return 1000;
      default:
        return 500;
    }
  }
}
