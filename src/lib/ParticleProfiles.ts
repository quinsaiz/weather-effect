import type Gio from "gi://Gio";

export type ParticleEffectType = "snow" | "rain";

export type ParticleProfileKeys =
  | {
      readonly id: "snow-default";
      readonly countKey: "snow-default-particle-count";
      readonly sizeKey: "snow-default-particle-size";
    }
  | {
      readonly id: "snow-emoji";
      readonly countKey: "snow-emoji-particle-count";
      readonly sizeKey: "snow-emoji-particle-size";
    }
  | {
      readonly id: "rain-default";
      readonly countKey: "rain-default-particle-count";
      readonly sizeKey: "rain-default-particle-size";
    }
  | {
      readonly id: "rain-emoji";
      readonly countKey: "rain-emoji-particle-count";
      readonly sizeKey: "rain-emoji-particle-size";
    };

export type ParticleProfileId = ParticleProfileKeys["id"];

export type ParticleProfileCountKey = ParticleProfileKeys["countKey"];

export type ParticleProfileSizeKey = ParticleProfileKeys["sizeKey"];

export type ParticleProfileKey =
  | ParticleProfileCountKey
  | ParticleProfileSizeKey;

export type ResolvedParticleProfile = ParticleProfileKeys & {
  readonly count: number;
  readonly size: number;
};

export type ParticleProfileMap = {
  readonly [Id in ParticleProfileId]: Extract<
    ParticleProfileKeys,
    { readonly id: Id }
  >;
};

export const SNOW_DEFAULT_PARTICLE_PROFILE = Object.freeze({
  id: "snow-default",
  countKey: "snow-default-particle-count",
  sizeKey: "snow-default-particle-size",
}) satisfies Extract<ParticleProfileKeys, { readonly id: "snow-default" }>;

export const SNOW_EMOJI_PARTICLE_PROFILE = Object.freeze({
  id: "snow-emoji",
  countKey: "snow-emoji-particle-count",
  sizeKey: "snow-emoji-particle-size",
}) satisfies Extract<ParticleProfileKeys, { readonly id: "snow-emoji" }>;

export const RAIN_DEFAULT_PARTICLE_PROFILE = Object.freeze({
  id: "rain-default",
  countKey: "rain-default-particle-count",
  sizeKey: "rain-default-particle-size",
}) satisfies Extract<ParticleProfileKeys, { readonly id: "rain-default" }>;

export const RAIN_EMOJI_PARTICLE_PROFILE = Object.freeze({
  id: "rain-emoji",
  countKey: "rain-emoji-particle-count",
  sizeKey: "rain-emoji-particle-size",
}) satisfies Extract<ParticleProfileKeys, { readonly id: "rain-emoji" }>;

export const PARTICLE_PROFILES = Object.freeze({
  "snow-default": SNOW_DEFAULT_PARTICLE_PROFILE,
  "snow-emoji": SNOW_EMOJI_PARTICLE_PROFILE,
  "rain-default": RAIN_DEFAULT_PARTICLE_PROFILE,
  "rain-emoji": RAIN_EMOJI_PARTICLE_PROFILE,
}) satisfies ParticleProfileMap;

export const PARTICLE_PROFILE_COUNT_KEYS: readonly ParticleProfileCountKey[] =
  Object.freeze([
    SNOW_DEFAULT_PARTICLE_PROFILE.countKey,
    SNOW_EMOJI_PARTICLE_PROFILE.countKey,
    RAIN_DEFAULT_PARTICLE_PROFILE.countKey,
    RAIN_EMOJI_PARTICLE_PROFILE.countKey,
  ]);

export const PARTICLE_PROFILE_SIZE_KEYS: readonly ParticleProfileSizeKey[] =
  Object.freeze([
    SNOW_DEFAULT_PARTICLE_PROFILE.sizeKey,
    SNOW_EMOJI_PARTICLE_PROFILE.sizeKey,
    RAIN_DEFAULT_PARTICLE_PROFILE.sizeKey,
    RAIN_EMOJI_PARTICLE_PROFILE.sizeKey,
  ]);

export const PARTICLE_PROFILE_KEYS: readonly ParticleProfileKey[] =
  Object.freeze([
    ...PARTICLE_PROFILE_COUNT_KEYS,
    ...PARTICLE_PROFILE_SIZE_KEYS,
  ]);

export const PARTICLE_PROFILE_MIGRATION_VERSION = 1;

export function resolveParticleProfileId(
  effectType: ParticleEffectType,
  snowEmoji: string,
  rainEmoji: string,
): ParticleProfileId {
  const emoji = effectType === "snow" ? snowEmoji : rainEmoji;
  return `${effectType}-${emoji.trim() === "" ? "default" : "emoji"}`;
}

export function resolveActiveParticleProfile(
  settings: Gio.Settings,
): ParticleProfileKeys {
  const effectType = settings.get_string("effect-type") as ParticleEffectType;
  const snowEmoji = settings.get_string("snow-emoji");
  const rainEmoji = settings.get_string("rain-emoji");
  return PARTICLE_PROFILES[
    resolveParticleProfileId(effectType, snowEmoji, rainEmoji)
  ];
}

export function readActiveParticleProfile(
  settings: Gio.Settings,
): ResolvedParticleProfile {
  const profile = resolveActiveParticleProfile(settings);
  return {
    ...profile,
    count: settings.get_int(profile.countKey),
    size: settings.get_int(profile.sizeKey),
  };
}

/**
 * Copies explicit legacy particle values into the active profile once.
 *
 * The caller must pass a dedicated settings instance because this function
 * puts it into irreversible delay-apply mode when migration is required.
 */
export function migrateLegacyParticleProfile(settings: Gio.Settings): boolean {
  if (
    settings.get_uint("particle-profile-migration-version") >=
    PARTICLE_PROFILE_MIGRATION_VERSION
  ) {
    return true;
  }

  const effectType = settings.get_string("effect-type") as ParticleEffectType;
  const snowEmoji = settings.get_string("snow-emoji");
  const rainEmoji = settings.get_string("rain-emoji");
  const profile =
    PARTICLE_PROFILES[
      resolveParticleProfileId(effectType, snowEmoji, rainEmoji)
    ];
  const legacyCount = settings.get_user_value<"i">("particle-count");
  const legacySize = settings.get_user_value<"i">("particle-size");

  settings.delay();

  if (legacyCount && !settings.set_value(profile.countKey, legacyCount)) {
    settings.revert();
    return false;
  }

  if (legacySize && !settings.set_value(profile.sizeKey, legacySize)) {
    settings.revert();
    return false;
  }

  if (
    !settings.set_uint(
      "particle-profile-migration-version",
      PARTICLE_PROFILE_MIGRATION_VERSION,
    )
  ) {
    settings.revert();
    return false;
  }

  settings.apply();
  return true;
}
