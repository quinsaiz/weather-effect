import Clutter from "gi://Clutter";
import St from "gi://St";
import { MonitorActor } from "./MonitorManager.js";
import { logError } from "./Debug.js";

type EffectType = "snow" | "rain";

/**
 * Management of particle creation and animation
 */
export class ParticleManager {
  private settings: any;
  private onAnimationFrame: (
    particle: St.Widget,
    monitorActor: MonitorActor,
    screenHeight: number,
    baseDuration: number,
  ) => void;

  constructor(
    settings: any,
    onAnimationFrame: (
      particle: St.Widget,
      monitorActor: MonitorActor,
      screenHeight: number,
      baseDuration: number,
    ) => void,
  ) {
    this.settings = settings;
    this.onAnimationFrame = onAnimationFrame;
  }

  /**
   * Create a particle
   */
  createParticle(
    type: EffectType,
    monitorActor: MonitorActor,
    screenWidth: number,
  ): St.Widget {
    if (!this.settings || !monitorActor || !monitorActor.actor) {
      throw new Error("Invalid parameters for createParticle");
    }

    const size = this.settings.get_int("particle-size");
    const snowEmoji = (this.settings.get_string("snow-emoji") || "").trim();
    const rainEmoji = (this.settings.get_string("rain-emoji") || "").trim();
    const safeScreenWidth = Math.max(1, screenWidth);
    const safeX = Math.random() * safeScreenWidth;

    let particle: St.Widget;
    try {
      if (type === "snow") {
        if (snowEmoji && snowEmoji !== "") {
          particle = new St.Label({
            text: snowEmoji,
            style: `font-size: ${size}px; color: ${this.settings.get_string(
              "snow-color",
            )};`,
            x: safeX,
            y: -20,
          });
        } else {
          particle = new St.Widget({
            style: `background-color: ${this.settings.get_string(
              "snow-color",
            )}; width: ${size}px; height: ${size}px; border-radius: ${size}px;`,
            x: safeX,
            y: -20,
          });
        }
      } else {
        if (rainEmoji && rainEmoji !== "") {
          particle = new St.Label({
            text: rainEmoji,
            style: `font-size: ${size}px; color: ${this.settings.get_string(
              "rain-color",
            )};`,
            x: safeX,
            y: -20,
          });
        } else {
          particle = new St.Widget({
            style: `background-color: ${this.settings.get_string(
              "rain-color",
            )}; width: ${size / 2}px; height: ${size * 2}px;`,
            x: safeX,
            y: -20,
          });
        }
      }
    } catch (e) {
      logError(`createParticle fallback: ${e}`);
      
      particle = new St.Widget({
        style: `background-color: ${
          type === "snow"
            ? this.settings.get_string("snow-color")
            : this.settings.get_string("rain-color")
        }; width: ${size}px; height: ${size}px; border-radius: ${size}px;`,
        x: safeX,
        y: -20,
      });
    }

    if (
      monitorActor.actor &&
      !(monitorActor.actor as any)._isDestroyedByGnome
    ) {
      monitorActor.actor.add_child(particle);
    }

    (particle as any)._isDestroyedByGnome = false;
    particle.connect("destroy", (actor: any) => {
      actor._isDestroyedByGnome = true;
    });
    return particle;
  }

  /**
   * Update particle style
   */
  updateParticleStyle(particle: any, type: EffectType) {
    if (!this.settings || !particle || (particle as any)._isDestroyedByGnome) {
      return;
    }

    const size = this.settings.get_int("particle-size");
    const snowEmoji = (this.settings.get_string("snow-emoji") || "").trim();
    const rainEmoji = (this.settings.get_string("rain-emoji") || "").trim();

    try {
      if (type === "snow") {
        if (snowEmoji && snowEmoji !== "" && particle instanceof St.Label) {
          particle.text = snowEmoji;
          particle.style = `font-size: ${size}px; color: ${this.settings.get_string(
            "snow-color",
          )};`;
        } else if (!(particle instanceof St.Label)) {
          particle.style = `background-color: ${this.settings.get_string(
            "snow-color",
          )}; width: ${size}px; height: ${size}px; border-radius: ${size}px;`;
        }
      } else {
        if (rainEmoji && rainEmoji !== "" && particle instanceof St.Label) {
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
    } catch (e) {
      logError(`updateParticleStyle failed: ${e}`);
    }
  }

  /**
   * Get base animation duration for a given speed
   */
  getBaseDuration(speed: number): number {
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

  /**
   * Animate a single particle
   */
  animateSingleParticle(
    particle: any,
    monitorActor: MonitorActor,
    screenHeight: number,
    baseDuration: number,
  ) {
    if (!particle || !monitorActor || screenHeight <= 0 || baseDuration <= 0) {
      return;
    }

    if (
      (particle as any)._isDestroyedByGnome ||
      !monitorActor.actor ||
      (monitorActor.actor as any)._isDestroyedByGnome
    ) {
      return;
    }

    const particleRef = particle;
    const monitorActorRef = monitorActor;
    const randomOffset = Math.random() * 500;
    const totalDuration = baseDuration + randomOffset;
    const startY = particle.y;
    const targetY = screenHeight + 20;
    const totalDistance = targetY + 20;
    const distanceToTravel = Math.max(1, targetY - startY);
    const actualDuration = (distanceToTravel / totalDistance) * totalDuration;

    try {
      particle.show();
      particle.ease({
        y: targetY,
        duration: actualDuration,
        mode: Clutter.AnimationMode.LINEAR,
        onComplete: () => {
          if (
            !particleRef ||
            (particleRef as any)._isDestroyedByGnome ||
            !monitorActorRef ||
            !monitorActorRef.actor ||
            (monitorActorRef.actor as any)._isDestroyedByGnome
          ) {
            return;
          }
          try {
            if (!particleRef.get_parent()) {
              return;
            }
          } catch (e) {
            logError(`animateSingleParticle parent check failed: ${e}`);
            return;
          }
          this.onAnimationFrame(
            particleRef,
            monitorActorRef,
            screenHeight,
            baseDuration,
          );
        },
      });
    } catch (e) {
      logError(`animateSingleParticle failed: ${e}`);
    }
  }

  /**
   * Check if particle is of the correct type
   */
  isCorrectType(particle: any, type: EffectType): boolean {
    if (!this.settings || !particle || (particle as any)._isDestroyedByGnome) {
      return false;
    }

    const snowEmoji = (this.settings.get_string("snow-emoji") || "").trim();
    const rainEmoji = (this.settings.get_string("rain-emoji") || "").trim();

    try {
      if (type === "snow") {
        if (
          snowEmoji &&
          particle instanceof St.Label &&
          particle.text === snowEmoji
        ) {
          return true;
        } else if (
          !snowEmoji &&
          particle instanceof St.Widget &&
          !(particle instanceof St.Label)
        ) {
          return true;
        }
      } else {
        if (
          rainEmoji &&
          particle instanceof St.Label &&
          particle.text === rainEmoji
        ) {
          return true;
        } else if (
          !rainEmoji &&
          particle instanceof St.Widget &&
          !(particle instanceof St.Label)
        ) {
          return true;
        }
      }
    } catch (e) {
      logError(`isCorrectType check failed: ${e}`);
      return false;
    }
    return false;
  }
}
