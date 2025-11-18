// @ts-nocheck
import Clutter from "gi://Clutter";
import St from "gi://St";
import { MonitorActor } from "./MonitorManager.js";

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
    baseDuration: number
  ) => void;

  constructor(
    settings: any,
    onAnimationFrame: (
      particle: St.Widget,
      monitorActor: MonitorActor,
      screenHeight: number,
      baseDuration: number
    ) => void
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
    screenWidth: number
  ): St.Widget {
    const size = this.settings.get_int("particle-size");
    const snowEmoji = this.settings.get_string("snow-emoji") as string;
    const rainEmoji = this.settings.get_string("rain-emoji") as string;

    const safeScreenWidth = Math.max(1, screenWidth);
    const safeX = Math.random() * safeScreenWidth;

    let particle: St.Widget;
    if (type === "snow") {
      if (snowEmoji && snowEmoji !== "") {
        particle = new St.Label({
          text: snowEmoji,
          style: `font-size: ${size}px; color: ${this.settings.get_string(
            "snow-color"
          )};`,
          x: safeX,
          y: -20,
        });
      } else {
        particle = new St.Widget({
          style: `background-color: ${this.settings.get_string(
            "snow-color"
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
            "rain-color"
          )};`,
          x: safeX,
          y: -20,
        });
      } else {
        particle = new St.Widget({
          style: `background-color: ${this.settings.get_string(
            "rain-color"
          )}; width: ${size / 2}px; height: ${size * 2}px;`,
          x: safeX,
          y: -20,
        });
      }
    }
    monitorActor.actor.add_child(particle);
    return particle;
  }

  /**
   * Update particle style
   */
  updateParticleStyle(particle: any, type: EffectType) {
    const size = this.settings.get_int("particle-size");
    const snowEmoji = this.settings.get_string("snow-emoji") as string;
    const rainEmoji = this.settings.get_string("rain-emoji") as string;

    if (type === "snow") {
      if (snowEmoji && snowEmoji !== "") {
        particle.text = snowEmoji;
        particle.style = `font-size: ${size}px; color: ${this.settings.get_string(
          "snow-color"
        )};`;
      } else {
        particle.style = `background-color: ${this.settings.get_string(
          "snow-color"
        )}; width: ${size}px; height: ${size}px; border-radius: ${size}px;`;
      }
    } else {
      if (rainEmoji && rainEmoji !== "") {
        particle.text = rainEmoji;
        particle.style = `font-size: ${size}px; color: ${this.settings.get_string(
          "rain-color"
        )};`;
      } else {
        particle.style = `background-color: ${this.settings.get_string(
          "rain-color"
        )}; width: ${size / 2}px; height: ${size * 2}px;`;
      }
    }
  }

  /**
   * Get base animation duration for a given speed
   */
  getBaseDuration(speed: number): number {
    switch (speed) {
      case 0:
        return 3000;
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
    baseDuration: number
  ) {
    if (!particle || !monitorActor || screenHeight <= 0 || baseDuration <= 0) {
      return;
    }

    const randomOffset = Math.random() * 500;
    particle.show();
    particle.ease({
      y: screenHeight + 20,
      duration: baseDuration + randomOffset,
      mode: Clutter.AnimationMode.LINEAR,
      onComplete: () => {
        this.onAnimationFrame(
          particle,
          monitorActor,
          screenHeight,
          baseDuration
        );
      },
    });
  }

  /**
   * Check if particle is of the correct type
   */
  isCorrectType(particle: any, type: EffectType): boolean {
    const snowEmoji = this.settings.get_string("snow-emoji") as string;
    const rainEmoji = this.settings.get_string("rain-emoji") as string;

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
    return false;
  }
}
