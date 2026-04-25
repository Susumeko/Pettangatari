export interface GameplaySettings {
  bgmVolume: number;
  ambienceVolume: number;
  blipVolume: number;
  blipSpeed: number;
  textSpeed: number;
  backgroundDimming: number;
  triggerSimilarityThreshold: number;
  sceneParallaxStrength: number;
  sceneDepthMotionSpeed: number;
  spriteParallaxStrength: number;
  parallaxEnabled: boolean;
  weatherEffectsEnabled: boolean;
  idleAnimationEnabled: boolean;
  closeBlurStrength: number;
  hideInteractiveZoneTriggers: boolean;
  hideAffinityChanges: boolean;
  hideLustValue: boolean;
  debugMode: boolean;
}

export const GAMEPLAY_SETTINGS_STORAGE_KEY = 'pettangatari:gameplay-settings';

export const DEFAULT_GAMEPLAY_SETTINGS: GameplaySettings = {
  bgmVolume: 40,
  ambienceVolume: 100,
  blipVolume: 100,
  blipSpeed: 100,
  textSpeed: 70,
  backgroundDimming: 0,
  triggerSimilarityThreshold: 100,
  sceneParallaxStrength: 50,
  sceneDepthMotionSpeed: 35,
  spriteParallaxStrength: 50,
  parallaxEnabled: true,
  weatherEffectsEnabled: true,
  idleAnimationEnabled: true,
  closeBlurStrength: 50,
  hideInteractiveZoneTriggers: true,
  hideAffinityChanges: false,
  hideLustValue: false,
  debugMode: false,
};

function clampNumber(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function normalizeGameplaySettings(value: unknown): GameplaySettings {
  const source = value && typeof value === 'object' ? (value as Partial<GameplaySettings>) : {};

  return {
    bgmVolume: clampNumber(Number(source.bgmVolume ?? DEFAULT_GAMEPLAY_SETTINGS.bgmVolume), 0, 100),
    ambienceVolume: clampNumber(Number(source.ambienceVolume ?? DEFAULT_GAMEPLAY_SETTINGS.ambienceVolume), 0, 100),
    blipVolume: clampNumber(Number(source.blipVolume ?? DEFAULT_GAMEPLAY_SETTINGS.blipVolume), 0, 100),
    blipSpeed: clampNumber(Number(source.blipSpeed ?? DEFAULT_GAMEPLAY_SETTINGS.blipSpeed), 50, 180),
    textSpeed: clampNumber(Number(source.textSpeed ?? DEFAULT_GAMEPLAY_SETTINGS.textSpeed), 0, 100),
    backgroundDimming: clampNumber(
      Number(source.backgroundDimming ?? DEFAULT_GAMEPLAY_SETTINGS.backgroundDimming),
      0,
      100,
    ),
    triggerSimilarityThreshold: clampNumber(
      Number(source.triggerSimilarityThreshold ?? DEFAULT_GAMEPLAY_SETTINGS.triggerSimilarityThreshold),
      50,
      100,
    ),
    sceneParallaxStrength: clampNumber(
      Number(source.sceneParallaxStrength ?? DEFAULT_GAMEPLAY_SETTINGS.sceneParallaxStrength),
      0,
      200,
    ),
    sceneDepthMotionSpeed: clampNumber(
      Number(source.sceneDepthMotionSpeed ?? DEFAULT_GAMEPLAY_SETTINGS.sceneDepthMotionSpeed),
      0,
      100,
    ),
    spriteParallaxStrength: clampNumber(
      Number(source.spriteParallaxStrength ?? DEFAULT_GAMEPLAY_SETTINGS.spriteParallaxStrength),
      0,
      200,
    ),
    parallaxEnabled:
      typeof source.parallaxEnabled === 'boolean'
        ? source.parallaxEnabled
        : DEFAULT_GAMEPLAY_SETTINGS.parallaxEnabled,
    weatherEffectsEnabled:
      typeof source.weatherEffectsEnabled === 'boolean'
        ? source.weatherEffectsEnabled
        : DEFAULT_GAMEPLAY_SETTINGS.weatherEffectsEnabled,
    idleAnimationEnabled:
      typeof source.idleAnimationEnabled === 'boolean'
        ? source.idleAnimationEnabled
        : DEFAULT_GAMEPLAY_SETTINGS.idleAnimationEnabled,
    closeBlurStrength: clampNumber(
      Number(
        source.closeBlurStrength ??
          (typeof (source as { closeBlurEnabled?: unknown }).closeBlurEnabled === 'boolean'
            ? (source as { closeBlurEnabled: boolean }).closeBlurEnabled
              ? 100
              : 0
            : DEFAULT_GAMEPLAY_SETTINGS.closeBlurStrength),
      ),
      0,
      100,
    ),
    hideInteractiveZoneTriggers:
      typeof source.hideInteractiveZoneTriggers === 'boolean'
        ? source.hideInteractiveZoneTriggers
        : DEFAULT_GAMEPLAY_SETTINGS.hideInteractiveZoneTriggers,
    hideAffinityChanges:
      typeof source.hideAffinityChanges === 'boolean'
        ? source.hideAffinityChanges
        : DEFAULT_GAMEPLAY_SETTINGS.hideAffinityChanges,
    hideLustValue:
      typeof source.hideLustValue === 'boolean' ? source.hideLustValue : DEFAULT_GAMEPLAY_SETTINGS.hideLustValue,
    debugMode:
      typeof source.debugMode === 'boolean'
        ? source.debugMode
        : DEFAULT_GAMEPLAY_SETTINGS.debugMode,
  };
}

export function loadGameplaySettings(): GameplaySettings {
  if (typeof window === 'undefined') {
    return DEFAULT_GAMEPLAY_SETTINGS;
  }

  try {
    const stored = window.localStorage.getItem(GAMEPLAY_SETTINGS_STORAGE_KEY);
    if (!stored) {
      return DEFAULT_GAMEPLAY_SETTINGS;
    }

    return normalizeGameplaySettings(JSON.parse(stored));
  } catch {
    return DEFAULT_GAMEPLAY_SETTINGS;
  }
}

export function getTextRevealDelayMs(textSpeed: number) {
  return Math.round(34 - clampNumber(textSpeed, 0, 100) * 0.28);
}
