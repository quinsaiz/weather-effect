import Clutter from "gi://Clutter";
import type Gio from "gi://Gio";
import St from "gi://St";

import type { MonitorLayerRecord } from "./MonitorManager.js";
import type { ParticleEffectType } from "./ParticleProfiles.js";

type ParticleActor = St.Widget & {
  // Shell container destruction can precede manager cleanup.
  _weatherDestroyed?: boolean;
};

export interface ParticleTargetValues {
  type: ParticleEffectType;
  count: number;
  size: number;
  speed: number;
  emoji: string | null;
  color: string;
}

export interface ParticleTarget extends ParticleTargetValues {
  monitorActor: MonitorLayerRecord;
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
  private animationSettings: St.Settings | null;
  private animationSettingsHandlerIds: number[];
  private monitorStates: Map<MonitorLayerRecord, MonitorParticleState> = new Map();

  constructor(settings: Gio.Settings) {
    this.settings = settings;
    const animationSettings = St.Settings.get();
    this.animationSettings = animationSettings;
    this.animationSettingsHandlerIds = [
      "notify::enable-animations",
      "notify::slow-down-factor",
    ].map((signal) =>
      animationSettings.connect(signal, () => {
        for (const [monitorActor, state] of this.monitorStates) {
          for (const particle of [...state.particles]) {
            this.syncParticleAnimation(monitorActor, state, particle);
          }
        }
      }),
    );
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

      const previousTarget = state.target;
      const target = targetByMonitor.get(monitorActor) ?? null;
      state.target = target;

      if (target) {
        if (
          previousTarget &&
          previousTarget.type !== target.type &&
          previousTarget.speed !== target.speed
        ) {
          this.retimeMonitorState(monitorActor, state, target);
        }
        this.reconcileMonitorState(
          monitorActor,
          state,
          target,
          this.hasAppearanceChanged(previousTarget, target),
        );
      } else {
        this.clearMonitorState(state);
      }
    }
  }

  refreshAppearance(values: ParticleTargetValues): void {
    if (!this.settings) return;

    for (const [monitorActor, state] of this.monitorStates) {
      const target = state.target;
      if (!target) continue;

      const updatedTarget: ParticleTarget = {
        ...target,
        type: values.type,
        size: values.size,
        emoji: values.emoji,
        color: values.color,
      };
      state.target = updatedTarget;
      this.refreshMonitorAppearance(monitorActor, state, updatedTarget, true);
    }
  }

  retimeSpeed(speed: number): void {
    if (!this.settings || !this.settings.get_boolean("active")) return;

    for (const [monitorActor, state] of this.monitorStates) {
      const target = state.target;
      if (!target) continue;

      target.speed = speed;
      this.retimeMonitorState(monitorActor, state, target);
    }
  }

  private retimeMonitorState(
    monitorActor: MonitorLayerRecord,
    state: MonitorParticleState,
    target: ParticleTarget,
  ): void {
    const actor = monitorActor.actor;
    if (!actor || actor._weatherDestroyed) return;

    for (const particle of [...state.particles]) {
      if (
        this.monitorStates.get(monitorActor) !== state ||
        state.target !== target ||
        monitorActor.actor !== actor ||
        actor._weatherDestroyed ||
        particle._weatherDestroyed ||
        !state.particles.includes(particle)
      ) {
        continue;
      }

      particle.remove_transition("y");

      if (
        this.monitorStates.get(monitorActor) !== state ||
        state.target !== target ||
        monitorActor.actor !== actor ||
        actor._weatherDestroyed ||
        particle._weatherDestroyed ||
        !state.particles.includes(particle)
      ) {
        continue;
      }

      this.animateParticle(monitorActor, state, particle, target.speed);
    }
  }

  clearAll(): void {
    for (const state of this.monitorStates.values()) {
      state.target = null;
      this.clearMonitorState(state);
    }
  }

  destroy(): void {
    for (const id of this.animationSettingsHandlerIds) {
      this.animationSettings?.disconnect(id);
    }
    this.animationSettingsHandlerIds = [];
    this.animationSettings = null;
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
      const particle = this.createParticle(monitorActor, state, target);
      if (!particle) break;

      particle.y = Math.random() * Math.max(1, monitorActor.monitor.height) - 20;
      state.particles.push(particle);
      this.animateParticle(monitorActor, state, particle, target.speed);
    }

    this.refreshMonitorAppearance(
      monitorActor,
      state,
      target,
      refreshStyle,
    );
  }

  private refreshMonitorAppearance(
    monitorActor: MonitorLayerRecord,
    state: MonitorParticleState,
    target: ParticleTarget,
    refreshStyle: boolean,
  ): void {
    const actor = monitorActor.actor;
    if (!actor || actor._weatherDestroyed) return;

    for (let index = state.particles.length - 1; index >= 0; index--) {
      const particle = state.particles[index];

      if (particle._weatherDestroyed) {
        state.particles.splice(index, 1);
        continue;
      }

      if (!this.isCorrectActorClass(particle, target)) {
        const currentX = particle.x;
        const currentY = particle.y;

        this.retireParticle(state, particle);

        if (
          this.monitorStates.get(monitorActor) !== state ||
          state.target !== target ||
          monitorActor.actor !== actor ||
          actor._weatherDestroyed
        ) {
          continue;
        }

        const replacement = this.createParticle(monitorActor, state, target);
        if (!replacement) continue;

        replacement.x = currentX;
        replacement.y = currentY;
        state.particles.push(replacement);
        this.animateParticle(monitorActor, state, replacement, target.speed);
        continue;
      }

      if (refreshStyle) this.updateParticleStyle(particle, target);
    }
  }

  private createParticle(
    monitorActor: MonitorLayerRecord,
    state: MonitorParticleState,
    target: ParticleTargetValues,
  ): ParticleActor | null {
    const actor = monitorActor.actor;
    if (!this.settings || !actor || actor._weatherDestroyed) {
      return null;
    }

    const x = Math.random() * Math.max(1, monitorActor.monitor.width);

    let particle: ParticleActor;
    if (target.type === "snow") {
      if (target.emoji !== null) {
        particle = new St.Label({
          text: target.emoji,
          style: `font-size: ${target.size}px; color: ${target.color};`,
          x,
          y: -20,
        }) as ParticleActor;
      } else {
        particle = new St.Widget({
          style: `background-color: ${target.color}; width: ${target.size}px; height: ${target.size}px; border-radius: ${target.size}px;`,
          x,
          y: -20,
        }) as ParticleActor;
      }
    } else if (target.emoji !== null) {
      particle = new St.Label({
        text: target.emoji,
        style: `font-size: ${target.size}px; color: ${target.color};`,
        x,
        y: -20,
      }) as ParticleActor;
    } else {
      particle = new St.Widget({
        style: `background-color: ${target.color}; width: ${target.size / 2}px; height: ${target.size * 2}px;`,
        x,
        y: -20,
      }) as ParticleActor;
    }

    particle._weatherDestroyed = false;
    // Child mapping notifications also cover parent-layer unmap/remap ordering.
    particle.connect("notify::mapped", () => {
      this.syncParticleAnimation(monitorActor, state, particle);
    });
    particle.connect("destroy", (destroyedParticle) => {
      destroyedParticle._weatherDestroyed = true;
      const index = state.particles.indexOf(destroyedParticle);
      if (index !== -1) state.particles.splice(index, 1);
    });
    actor.add_child(particle);
    return particle;
  }

  private syncParticleAnimation(
    monitorActor: MonitorLayerRecord,
    state: MonitorParticleState,
    particle: ParticleActor,
  ): void {
    const actor = monitorActor.actor;
    if (
      !this.settings ||
      this.monitorStates.get(monitorActor) !== state ||
      !state.target ||
      !state.particles.includes(particle) ||
      !actor ||
      actor._weatherDestroyed ||
      particle._weatherDestroyed
    ) {
      return;
    }

    if (!this.canAnimate(particle)) {
      particle.remove_transition("y");
    } else if (!particle.get_transition("y")) {
      this.animateParticle(monitorActor, state, particle, state.target.speed);
    }
  }

  private canAnimate(particle: ParticleActor): boolean {
    return (
      !!this.settings?.get_boolean("active") &&
      !!this.animationSettings?.enable_animations &&
      this.animationSettings.slow_down_factor > 0 &&
      particle.mapped
    );
  }

  private animateParticle(
    monitorActor: MonitorLayerRecord,
    state: MonitorParticleState,
    particle: ParticleActor,
    speed: number,
  ): void {
    // A sub-millisecond tail can finish inline. Allow one full-cycle attempt,
    // but never recurse or schedule retries if Shell keeps skipping transitions.
    // Mapping/animation-setting notifications resume particles when available.
    for (let attempt = 0; attempt < 2; attempt++) {
      const actor = monitorActor.actor;
      if (
        this.monitorStates.get(monitorActor) !== state ||
        !state.target ||
        !state.particles.includes(particle) ||
        particle._weatherDestroyed ||
        !actor ||
        actor._weatherDestroyed ||
        !this.canAnimate(particle)
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

      let starting = true;
      let completedSynchronously = false;
      particle.show();
      particle.ease({
        y: targetY,
        duration,
        mode: Clutter.AnimationMode.LINEAR,
        onStopped: (isFinished) => {
          if (!isFinished) return;
          if (starting) {
            completedSynchronously = true;
            return;
          }
          this.handleTransitionComplete(monitorActor, state, particle);
        },
      });
      starting = false;
      if (!completedSynchronously) return;
      this.handleTransitionComplete(monitorActor, state, particle, false);
    }
  }

  private handleTransitionComplete(
    monitorActor: MonitorLayerRecord,
    state: MonitorParticleState,
    particle: ParticleActor,
    restart = true,
  ): void {
    // Completion can arrive after retirement or monitor-layer replacement.
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

    if (!this.settings.get_boolean("active")) {
      this.retireParticle(state, particle);
      return;
    }

    if (restart) {
      this.animateParticle(monitorActor, state, particle, state.target.speed);
    }
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
    // Release collection ownership before native destruction emits destroy.
    const index = state.particles.indexOf(particle);
    if (index !== -1) state.particles.splice(index, 1);

    if (particle._weatherDestroyed) return;
    particle.remove_all_transitions();
    particle.destroy();
  }

  private updateParticleStyle(
    particle: ParticleActor,
    target: ParticleTargetValues,
  ): void {
    if (!this.settings || particle._weatherDestroyed) return;

    if (target.type === "snow") {
      if (target.emoji !== null && particle instanceof St.Label) {
        particle.text = target.emoji;
        particle.style = `font-size: ${target.size}px; color: ${target.color};`;
      } else if (!(particle instanceof St.Label)) {
        particle.style = `background-color: ${target.color}; width: ${target.size}px; height: ${target.size}px; border-radius: ${target.size}px;`;
      }
    } else if (target.emoji !== null && particle instanceof St.Label) {
      particle.text = target.emoji;
      particle.style = `font-size: ${target.size}px; color: ${target.color};`;
    } else if (!(particle instanceof St.Label)) {
      particle.style = `background-color: ${target.color}; width: ${target.size / 2}px; height: ${target.size * 2}px;`;
    }
  }

  private isCorrectActorClass(
    particle: ParticleActor,
    target: ParticleTargetValues,
  ): boolean {
    if (!this.settings || particle._weatherDestroyed) return false;

    return target.emoji !== null
      ? particle instanceof St.Label
      : particle instanceof St.Widget && !(particle instanceof St.Label);
  }

  private hasAppearanceChanged(
    previousTarget: ParticleTarget | null,
    target: ParticleTarget,
  ): boolean {
    return (
      previousTarget !== null &&
      (previousTarget.type !== target.type ||
        previousTarget.size !== target.size ||
        previousTarget.emoji !== target.emoji ||
        previousTarget.color !== target.color)
    );
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
