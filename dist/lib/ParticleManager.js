// @ts-nocheck
import Clutter from "gi://Clutter";
import St from "gi://St";
import { logError } from "./Debug.js";
/**
 * Management of particle creation and animation
 */
export class ParticleManager {
    settings;
    onAnimationFrame;
    constructor(settings, onAnimationFrame) {
        this.settings = settings;
        this.onAnimationFrame = onAnimationFrame;
    }
    /**
     * Create a particle
     */
    createParticle(type, monitorActor, screenWidth) {
        if (!this.settings || !monitorActor || !monitorActor.actor) {
            throw new Error("Invalid parameters for createParticle");
        }
        const size = this.settings.get_int("particle-size");
        const snowEmoji = (this.settings.get_string("snow-emoji") || "").trim();
        const rainEmoji = (this.settings.get_string("rain-emoji") || "").trim();
        const safeScreenWidth = Math.max(1, screenWidth);
        const safeX = Math.random() * safeScreenWidth;
        let particle;
        try {
            if (type === "snow") {
                if (snowEmoji && snowEmoji !== "") {
                    particle = new St.Label({
                        text: snowEmoji,
                        style: `font-size: ${size}px; color: ${this.settings.get_string("snow-color")};`,
                        x: safeX,
                        y: -20,
                    });
                }
                else {
                    particle = new St.Widget({
                        style: `background-color: ${this.settings.get_string("snow-color")}; width: ${size}px; height: ${size}px; border-radius: ${size}px;`,
                        x: safeX,
                        y: -20,
                    });
                }
            }
            else {
                if (rainEmoji && rainEmoji !== "") {
                    particle = new St.Label({
                        text: rainEmoji,
                        style: `font-size: ${size}px; color: ${this.settings.get_string("rain-color")};`,
                        x: safeX,
                        y: -20,
                    });
                }
                else {
                    particle = new St.Widget({
                        style: `background-color: ${this.settings.get_string("rain-color")}; width: ${size / 2}px; height: ${size * 2}px;`,
                        x: safeX,
                        y: -20,
                    });
                }
            }
            if (monitorActor.actor && !monitorActor.actor.is_finalized?.()) {
                monitorActor.actor.add_child(particle);
            }
        }
        catch (e) {
            // Fallback to simple widget if emoji causes issues
            logError(`createParticle fallback: ${e}`);
            particle = new St.Widget({
                style: `background-color: ${type === "snow"
                    ? this.settings.get_string("snow-color")
                    : this.settings.get_string("rain-color")}; width: ${size}px; height: ${size}px; border-radius: ${size}px;`,
                x: safeX,
                y: -20,
            });
            if (monitorActor.actor && !monitorActor.actor.is_finalized?.()) {
                monitorActor.actor.add_child(particle);
            }
        }
        return particle;
    }
    /**
     * Update particle style
     */
    updateParticleStyle(particle, type) {
        if (!this.settings || !particle || particle.is_finalized?.()) {
            return;
        }
        const size = this.settings.get_int("particle-size");
        const snowEmoji = (this.settings.get_string("snow-emoji") || "").trim();
        const rainEmoji = (this.settings.get_string("rain-emoji") || "").trim();
        try {
            if (type === "snow") {
                if (snowEmoji && snowEmoji !== "" && particle instanceof St.Label) {
                    particle.text = snowEmoji;
                    particle.style = `font-size: ${size}px; color: ${this.settings.get_string("snow-color")};`;
                }
                else if (!(particle instanceof St.Label)) {
                    particle.style = `background-color: ${this.settings.get_string("snow-color")}; width: ${size}px; height: ${size}px; border-radius: ${size}px;`;
                }
            }
            else {
                if (rainEmoji && rainEmoji !== "" && particle instanceof St.Label) {
                    particle.text = rainEmoji;
                    particle.style = `font-size: ${size}px; color: ${this.settings.get_string("rain-color")};`;
                }
                else if (!(particle instanceof St.Label)) {
                    particle.style = `background-color: ${this.settings.get_string("rain-color")}; width: ${size / 2}px; height: ${size * 2}px;`;
                }
            }
        }
        catch (e) {
            // If emoji update fails, keep existing style
            logError(`updateParticleStyle failed: ${e}`);
        }
    }
    /**
     * Get base animation duration for a given speed
     */
    getBaseDuration(speed) {
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
    animateSingleParticle(particle, monitorActor, screenHeight, baseDuration) {
        if (!particle || !monitorActor || screenHeight <= 0 || baseDuration <= 0) {
            return;
        }
        if (particle.is_finalized?.() ||
            !monitorActor.actor ||
            monitorActor.actor.is_finalized?.()) {
            return;
        }
        // Store reference to check in callback
        const particleRef = particle;
        const monitorActorRef = monitorActor;
        const randomOffset = Math.random() * 500;
        try {
            particle.show();
            particle.ease({
                y: screenHeight + 20,
                duration: baseDuration + randomOffset,
                mode: Clutter.AnimationMode.LINEAR,
                onComplete: () => {
                    // Check if objects are still valid before calling callback
                    if (!particleRef ||
                        particleRef.is_finalized?.() ||
                        !monitorActorRef ||
                        !monitorActorRef.actor ||
                        monitorActorRef.actor.is_finalized?.()) {
                        return;
                    }
                    // Check if particle still has parent (not removed)
                    try {
                        if (!particleRef.get_parent()) {
                            return;
                        }
                    }
                    catch (e) {
                        logError(`animateSingleParticle parent check failed: ${e}`);
                        return;
                    }
                    this.onAnimationFrame(particleRef, monitorActorRef, screenHeight, baseDuration);
                },
            });
        }
        catch (e) {
            logError(`animateSingleParticle failed: ${e}`);
        }
    }
    /**
     * Check if particle is of the correct type
     */
    isCorrectType(particle, type) {
        if (!this.settings || !particle || particle.is_finalized?.()) {
            return false;
        }
        const snowEmoji = (this.settings.get_string("snow-emoji") || "").trim();
        const rainEmoji = (this.settings.get_string("rain-emoji") || "").trim();
        try {
            if (type === "snow") {
                if (snowEmoji &&
                    particle instanceof St.Label &&
                    particle.text === snowEmoji) {
                    return true;
                }
                else if (!snowEmoji &&
                    particle instanceof St.Widget &&
                    !(particle instanceof St.Label)) {
                    return true;
                }
            }
            else {
                if (rainEmoji &&
                    particle instanceof St.Label &&
                    particle.text === rainEmoji) {
                    return true;
                }
                else if (!rainEmoji &&
                    particle instanceof St.Widget &&
                    !(particle instanceof St.Label)) {
                    return true;
                }
            }
        }
        catch (e) {
            logError(`isCorrectType check failed: ${e}`);
            return false;
        }
        return false;
    }
}
