import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import {
  createScenarioPackage,
  createScenarioRun,
  deleteScenario,
  deleteScenarioPackage,
  deleteScenarioRun,
  deleteStudioCharacter,
  fetchCharacters,
  fetchSillyTavernConnection,
  fetchRuntime,
  fetchStudioState,
  fetchSystemConfig,
  generateAssistantReply,
  importScenarioPackage,
  revealScenarioPackage,
  requestShutdown,
  saveScenario,
  saveStudioCharacter,
  startStorySession,
  updateSillyTavernConnection,
  updateStudioArtStylePresets,
  updateScenarioRunMessages,
  type AffinityUpdate,
  type LustUpdate,
  type SaveStudioCharacterPayload,
} from './api/client';
import { AMBIENT_PRESET_MAP } from './ambient';
import { DialogueBox } from './components/DialogueBox';
import { DebugOverlay } from './components/DebugOverlay';
import { GameplaySettingsMenu } from './components/GameplaySettingsMenu';
import { DepthParallaxImage } from './components/DepthSpritePreview';
import { MainMenu } from './components/MainMenu';
import { MenuSkeleton } from './components/MenuSkeleton';
import { PauseMenu } from './components/PauseMenu';
import { ensureDialogueQuoteFontStylesheet, getDialogueQuoteFontFamily } from './quoteFonts';
import {
  normalizeDialogueQuoteAnimationColor,
  normalizeDialogueQuoteAnimationPreset,
  normalizeDialogueQuoteAnimationSpeed,
} from './quoteTextEffects';
import { TooltipLayer } from './components/TooltipLayer';
import {
  GAMEPLAY_SETTINGS_STORAGE_KEY,
  getTextRevealDelayMs,
  loadGameplaySettings,
  type GameplaySettings,
} from './gameplaySettings';
import {
  INTERFACE_SETTINGS_STORAGE_KEY,
  loadInterfaceSettings,
  type InterfaceSettings,
} from './interfaceSettings';
import {
  splitAssistantDialoguePages,
  splitNeutralDialoguePages,
  type DialoguePage,
  type DialoguePortraitDistance,
  type DialoguePortraitPosition,
} from './hooks/splitIntoDialoguePages';
import { BLIP_OPTION_MAP } from './blips';
import type {
  AutomaticGenerationArtStylePreset,
  CharacterOption,
  ConversationMessage,
  OneShotScenario,
  ScenarioPackage,
  RuntimeInfo,
  ScenarioRun,
  StartRunOptions,
  SceneWeatherPreset,
  SillyTavernConnectionInfo,
  SpriteAnimationFrameSet,
  SpriteInteractiveZone,
  SpriteExpression,
  StudioCharacter,
} from './types';
import closeIcon from './icons/x-circle.svg';
import settingsIcon from './icons/adjustments.svg';
import debugIcon from './icons/terminal.svg';
import mapIcon from './icons/map.svg';
import menuIcon from './icons/apps.svg';
import eyeIcon from './icons/eye.svg';
import eyeOffIcon from './icons/eye-off.svg';
import resetPositionIcon from './icons/align-vertical-center.svg';

type Screen = 'menu' | 'game';
type GameMode = 'player-input' | 'user-echo' | 'waiting-reply' | 'streaming' | 'assistant-pages' | 'replay';
type SceneVisualState = Pick<
  OneShotScenario['scenes'][number],
  | 'id'
  | 'backgroundDataUrl'
  | 'backgroundDepthMapDataUrl'
  | 'bgmDataUrl'
  | 'ambientNoiseDataUrl'
  | 'ambientNoisePresetId'
  | 'ambientNoiseMuffled'
  | 'weatherPreset'
>;
const NARRATOR_ACCENT_COLOR = '#4a4a4a';

const DEFAULT_RUNTIME: RuntimeInfo = {
  model: 'unknown',
  chatCompletionSource: 'unknown',
  mainApi: 'unknown',
};
const DEFAULT_SILLY_TAVERN_CONNECTION: SillyTavernConnectionInfo = {
  baseUrl: 'http://127.0.0.1:8000',
  online: false,
  error: '',
};

const DEFAULT_CHARACTER_SPRITE = '/assets/characters/placeholder-character.svg';
const KEEP_CHARACTER_ASSET_TOKEN = '__PETTANGATARI_KEEP_CHARACTER_ASSET__';
const LOCATION_FADE_HALF_MS = 2500;
const CG_TRANSITION_MS = 420;
const UNDO_BLACK_SCREEN_WAIT_MS = 1000;
const PORTRAIT_DISTANCE_STEPS: DialoguePortraitDistance[] = ['far', 'away', 'normal', 'close', 'closer'];

function buildCharacterBloomFilter(intensity: number, glowBoost = 0): string {
  const bloomIntensity = Math.min(1, Math.max(0, intensity));
  const baseShadow = 'drop-shadow(0 30px 40px rgba(0, 0, 0, 0.45))';
  if (bloomIntensity <= 0) {
    return `brightness(1.02) saturate(1.02) ${baseShadow}`;
  }

  const glowIntensity = Math.min(1, bloomIntensity + Math.max(0, glowBoost));
  const glowBlurPrimary = 12 + glowIntensity * 24;
  const glowBlurSecondary = 20 + glowIntensity * 36;
  const glowAlphaPrimary = 0.12 + glowIntensity * 0.28;
  const glowAlphaSecondary = 0.05 + glowIntensity * 0.18;
  const brightness = 1.02 + bloomIntensity * 0.16;
  const saturation = 1.02 + bloomIntensity * 0.26;

  return [
    `brightness(${brightness.toFixed(3)})`,
    `saturate(${saturation.toFixed(3)})`,
    `drop-shadow(0 0 ${glowBlurPrimary.toFixed(1)}px rgba(255, 244, 220, ${glowAlphaPrimary.toFixed(3)}))`,
    `drop-shadow(0 0 ${glowBlurSecondary.toFixed(1)}px rgba(255, 231, 184, ${glowAlphaSecondary.toFixed(3)}))`,
    baseShadow,
  ].join(' ');
}

function normalizeAssetVariants(value: string[] | undefined): string[] {
  return Array.isArray(value) ? value.filter(Boolean).slice(0, 10) : [];
}

function getPrimaryAssetVariant(value: string[] | undefined): string {
  return normalizeAssetVariants(value)[0] || '';
}

function pickRandomAssetVariant(value: string[] | undefined): string {
  const variants = normalizeAssetVariants(value);
  if (variants.length === 0) {
    return '';
  }

  return variants[Math.floor(Math.random() * variants.length)] || variants[0] || '';
}

function pickNextAssetVariant(value: string[] | undefined, currentVariant: string): string {
  const variants = normalizeAssetVariants(value);
  if (variants.length === 0) {
    return '';
  }

  if (variants.length === 1) {
    return variants[0] || '';
  }

  const currentIndex = variants.indexOf(currentVariant);
  if (currentIndex < 0) {
    return variants[0] || '';
  }

  return variants[(currentIndex + 1) % variants.length] || variants[0] || '';
}

function hideIncompleteTrailingTag(value: string): string {
  if (!value) {
    return '';
  }

  const lastOpenIndex = value.lastIndexOf('[');
  const lastCloseIndex = value.lastIndexOf(']');
  if (lastOpenIndex === -1 || lastOpenIndex < lastCloseIndex) {
    return value;
  }

  return value.slice(0, lastOpenIndex);
}

function waitForNextPaint(): Promise<void> {
  return new Promise((resolve) => {
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => resolve());
    });
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function resolveSpriteExpressionForPage(
  page: DialoguePage,
  revealedChars: number,
): SpriteExpression {
  let expression: SpriteExpression = page.baseExpression || 'DEFAULT';
  const cues = page.expressionCues || [];

  for (const cue of cues) {
    if (cue.at <= revealedChars) {
      expression = cue.expression;
      continue;
    }
    break;
  }

  return expression;
}

function resolvePortraitPositionForPage(
  page: DialoguePage,
  revealedChars: number,
): DialoguePortraitPosition {
  let position: DialoguePortraitPosition = page.basePortraitPosition || 'center';
  const cues = page.portraitPositionCues || [];

  for (const cue of cues) {
    if (cue.at <= revealedChars) {
      position = cue.position;
      continue;
    }
    break;
  }

  return position;
}

function getDialoguePageSignature(page: DialoguePage): string {
  return JSON.stringify({
    text: page.text,
    tone: page.tone,
    baseExpression: page.baseExpression || '',
    expressionCues: page.expressionCues || [],
    baseTag: page.baseTag || '',
    tagCues: page.tagCues || [],
    baseSituation: page.baseSituation || '',
    situationCues: page.situationCues || [],
    locationCues: page.locationCues || [],
    basePortraitPosition: page.basePortraitPosition || '',
    portraitPositionCues: page.portraitPositionCues || [],
    basePortraitDistance: page.basePortraitDistance || '',
    portraitDistanceCues: page.portraitDistanceCues || [],
  });
}

function getLatestNonNullSituationCueFromText(text: string): { tag: string; signature: string } | null {
  if (!text) {
    return null;
  }

  let latest: { tag: string; signature: string } | null = null;
  const matches = text.matchAll(/\[SITUATION\s*:\s*([^[\]]{1,120})\]/gi);

  for (const match of matches) {
    const tag = `${match[1] || ''}`.trim();
    const normalizedTag = normalizeExpressionKey(tag);
    if (!normalizedTag || normalizedTag === 'NULL') {
      continue;
    }

    latest = {
      tag,
      signature: `${typeof match.index === 'number' ? match.index : -1}:${normalizedTag}`,
    };
  }

  return latest;
}

function getLatestVisibleSituationCueFromPages(
  pages: DialoguePage[],
  pageIndex: number,
  revealedChars: number,
): { tag: string; signature: string } | null {
  let latest: { tag: string; signature: string } | null = null;
  const safePageIndex = Math.max(0, Math.min(pageIndex, pages.length - 1));

  for (let index = 0; index <= safePageIndex; index += 1) {
    const page = pages[index];
    if (!page) {
      continue;
    }

    const maxAt = index === safePageIndex ? Math.max(0, revealedChars) : page.text.length;
    const cues = page.situationCues || [];
    for (const cue of cues) {
      if (cue.at > maxAt) {
        continue;
      }

      const normalizedTag = normalizeExpressionKey(cue.tag);
      latest = {
        tag: cue.tag,
        signature: `${index}:${cue.at}:${normalizedTag}`,
      };
    }
  }

  return latest;
}

function textContainsCharacterDialogue(text: string): boolean {
  return splitAssistantDialoguePages(text).some((page) => page.tone === 'dialogue');
}

function stepPortraitDistance(
  current: DialoguePortraitDistance,
  direction: 'closer' | 'away',
): DialoguePortraitDistance {
  const currentIndex = PORTRAIT_DISTANCE_STEPS.indexOf(current);
  const safeIndex = currentIndex >= 0 ? currentIndex : PORTRAIT_DISTANCE_STEPS.indexOf('normal');
  const nextIndex =
    direction === 'closer'
      ? Math.min(safeIndex + 1, PORTRAIT_DISTANCE_STEPS.length - 1)
      : Math.max(safeIndex - 1, 0);

  return PORTRAIT_DISTANCE_STEPS[nextIndex];
}

function streamingTextEndsAtStepBoundary(text: string): boolean {
  const normalized = text.replace(/\r\n/g, '\n');
  if (!normalized.trim()) {
    return false;
  }

  return /\n\s*$/.test(normalized) || /["\u201C\u201D]\s*$/.test(normalized);
}

function normalizeExpressionKey(value: string): string {
  return value
    .replace(/[\[\]]/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')
    .toUpperCase();
}

function getEntityTriggerNames(entity: { name: string; triggers?: string[] }): string[] {
  const values = [entity.name, ...(entity.triggers || [])];
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    const normalized = normalizeExpressionKey(value);
    if (!normalized || seen.has(normalized)) {
      continue;
    }

    seen.add(normalized);
    result.push(normalized);
  }

  return result;
}

function retainUnchangedImageVariants(nextVariants: string[], previousVariants: string[] | undefined): string[] {
  return nextVariants.map((variant, index) =>
    variant && previousVariants?.[index] === variant ? KEEP_CHARACTER_ASSET_TOKEN : variant,
  );
}

function retainUnchangedAnimationFrames(
  nextFrames: SpriteAnimationFrameSet | undefined,
  previousFrames: SpriteAnimationFrameSet | undefined,
): SpriteAnimationFrameSet | undefined {
  if (!nextFrames) {
    return nextFrames;
  }

  return {
    closedEyes: retainUnchangedImageVariants(nextFrames.closedEyes, previousFrames?.closedEyes),
    openMouth: retainUnchangedImageVariants(nextFrames.openMouth, previousFrames?.openMouth),
  };
}

function BlackTransparentImage({
  src,
  className = '',
  visible = true,
}: {
  src: string;
  className?: string;
  visible?: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !src) {
      return undefined;
    }

    let cancelled = false;
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => {
      if (cancelled) {
        return;
      }

      const width = image.naturalWidth || image.width || 1;
      const height = image.naturalHeight || image.height || 1;
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext('2d', { willReadFrequently: true });
      if (!context) {
        return;
      }

      context.clearRect(0, 0, width, height);
      context.drawImage(image, 0, 0, width, height);
      const imageData = context.getImageData(0, 0, width, height);
      const data = imageData.data;
      for (let index = 0; index < data.length; index += 4) {
        if (data[index] === 0 && data[index + 1] === 0 && data[index + 2] === 0) {
          data[index + 3] = 0;
        }
      }
      context.putImageData(imageData, 0, 0);
    };
    image.src = src;

    return () => {
      cancelled = true;
    };
  }, [src]);

  return (
    <canvas
      ref={canvasRef}
      className={`${className} ${visible ? 'is-visible' : ''}`.trim()}
      aria-hidden="true"
    />
  );
}

function getEntityTriggerKey(entity: { name: string; triggers?: string[] }): string {
  return getEntityTriggerNames(entity).join('|');
}

function findMatchingEntity<T extends { name: string; triggers?: string[] }>(entities: T[], target: T): T | undefined {
  const targetKey = getEntityTriggerKey(target);
  return entities.find((entity) => getEntityTriggerKey(entity) === targetKey);
}

function createRetainedAssetCharacterPayload(
  payload: SaveStudioCharacterPayload,
  previousCharacter: StudioCharacter | undefined,
): SaveStudioCharacterPayload {
  if (!payload.id || !previousCharacter) {
    return payload;
  }

  return {
    ...payload,
    sprites: Object.fromEntries(
      Object.entries(payload.sprites).map(([expression, variants]) => [
        expression,
        retainUnchangedImageVariants(variants, previousCharacter.sprites[expression]),
      ]),
    ),
    spriteDepthMaps: Object.fromEntries(
      Object.entries(payload.spriteDepthMaps).map(([expression, variants]) => [
        expression,
        retainUnchangedImageVariants(variants, previousCharacter.spriteDepthMaps[expression]),
      ]),
    ),
    spriteAnimationFrames: Object.fromEntries(
      Object.entries(payload.spriteAnimationFrames).map(([expression, frames]) => [
        expression,
        retainUnchangedAnimationFrames(frames, previousCharacter.spriteAnimationFrames?.[expression]) || {
          closedEyes: [],
          openMouth: [],
        },
      ]),
    ),
    customReactions: payload.customReactions.map((reaction) => {
      const previousReaction = findMatchingEntity(previousCharacter.customReactions, reaction);
      return {
        ...reaction,
        sprites: retainUnchangedImageVariants(reaction.sprites, previousReaction?.sprites),
        depthMaps: reaction.depthMaps
          ? retainUnchangedImageVariants(reaction.depthMaps, previousReaction?.depthMaps)
          : reaction.depthMaps,
        animationFrames: retainUnchangedAnimationFrames(reaction.animationFrames, previousReaction?.animationFrames),
      };
    }),
    cgs: payload.cgs.map((cg) => {
      const previousCg = findMatchingEntity(previousCharacter.cgs, cg);
      return {
        ...cg,
        images: retainUnchangedImageVariants(cg.images, previousCg?.images),
      };
    }),
  };
}

const TRIGGER_MATCH_STOP_WORDS = new Set([
  'A',
  'AN',
  'THE',
  'THIS',
  'THAT',
  'THESE',
  'THOSE',
  'IS',
  'ARE',
  'AM',
  'WAS',
  'WERE',
  'BE',
  'BEEN',
  'BEING',
  'I',
  'ME',
  'MY',
  'MINE',
  'YOU',
  'YOUR',
  'YOURS',
  'HE',
  'HIM',
  'HIS',
  'SHE',
  'HER',
  'HERS',
  'THEY',
  'THEM',
  'THEIR',
  'THEIRS',
  'WE',
  'US',
  'OUR',
  'OURS',
  'IT',
  'ITS',
  'ON',
  'IN',
  'AT',
  'TO',
  'FROM',
  'FOR',
  'OF',
  'WITH',
  'BY',
  'AS',
  'AND',
  'OR',
]);

function stemTriggerToken(token: string): string {
  let value = token.trim().toUpperCase();
  if (!value) {
    return '';
  }

  if (value.length > 5 && value.endsWith('ING')) {
    value = value.slice(0, -3);
  } else if (value.length > 4 && value.endsWith('IED')) {
    value = `${value.slice(0, -3)}Y`;
  } else if (value.length > 4 && value.endsWith('ED')) {
    value = value.slice(0, -2);
  }

  if (value.length > 4 && value.endsWith('ES')) {
    value = value.slice(0, -2);
  } else if (value.length > 3 && value.endsWith('S') && !value.endsWith('SS')) {
    value = value.slice(0, -1);
  }

  if (value.length > 3 && /(.)\1$/.test(value)) {
    value = value.slice(0, -1);
  }

  return value;
}

function getTriggerMatchTokens(value: string): string[] {
  const normalized = normalizeExpressionKey(value)
    .replace(/[^\w\s]/g, ' ')
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!normalized) {
    return [];
  }

  const rawTokens = normalized
    .split(' ')
    .map((token) => stemTriggerToken(token))
    .filter(Boolean);

  const filteredTokens = rawTokens.filter((token) => !TRIGGER_MATCH_STOP_WORDS.has(token));
  return filteredTokens.length > 0 ? filteredTokens : rawTokens;
}

function scoreTriggerMatch(target: string, candidate: string): number {
  const normalizedTarget = normalizeExpressionKey(target);
  const normalizedCandidate = normalizeExpressionKey(candidate);

  if (!normalizedTarget || !normalizedCandidate) {
    return 0;
  }

  if (normalizedTarget === normalizedCandidate) {
    return 1;
  }

  const targetTokens = getTriggerMatchTokens(target);
  const candidateTokens = getTriggerMatchTokens(candidate);
  if (targetTokens.length === 0 || candidateTokens.length === 0) {
    return 0;
  }

  const targetSet = new Set(targetTokens);
  const candidateSet = new Set(candidateTokens);
  let intersection = 0;
  for (const token of targetSet) {
    if (candidateSet.has(token)) {
      intersection += 1;
    }
  }

  if (intersection === 0) {
    return 0;
  }

  const minimumMeaningfulOverlap =
    targetSet.size >= 2 && candidateSet.size >= 2
      ? 2
      : 1;
  if (intersection < minimumMeaningfulOverlap) {
    return 0;
  }

  const coverageScore = intersection / Math.max(targetSet.size, candidateSet.size, 1);
  const precisionScore = intersection / Math.min(targetSet.size, candidateSet.size, 1);
  const unionSize = new Set([...targetSet, ...candidateSet]).size || 1;
  const jaccardScore = intersection / unionSize;
  const containmentScore =
    [...targetSet].every((token) => candidateSet.has(token)) || [...candidateSet].every((token) => targetSet.has(token))
      ? 0.96
      : 0;
  const hasConflictingUniqueTokens = intersection < targetSet.size && intersection < candidateSet.size;

  const tokenPhraseTarget = targetTokens.join(' ');
  const tokenPhraseCandidate = candidateTokens.join(' ');
  const tokenDistanceScore =
    1 -
    levenshteinDistance(tokenPhraseTarget, tokenPhraseCandidate) /
      Math.max(tokenPhraseTarget.length, tokenPhraseCandidate.length, 1);
  const rawDistanceScore =
    1 -
    levenshteinDistance(normalizedTarget, normalizedCandidate) /
      Math.max(normalizedTarget.length, normalizedCandidate.length, 1);
  const lexicalScore = coverageScore * 0.5 + precisionScore * 0.2 + jaccardScore * 0.3;
  const distanceScore = tokenDistanceScore * 0.7 + rawDistanceScore * 0.3;
  const fuzzyScore = hasConflictingUniqueTokens ? Math.min(lexicalScore * jaccardScore, jaccardScore) : Math.max(lexicalScore, distanceScore * 0.82);

  return Math.max(containmentScore, fuzzyScore);
}

function findBestTriggerMatch<T extends { name: string; triggers?: string[] }>(
  target: string,
  entities: T[],
  minimumScore = 0.8,
): T | null {
  let bestMatch: T | null = null;
  let bestScore = 0;

  for (const entity of entities) {
    for (const candidate of getEntityTriggerNames(entity)) {
      const score = scoreTriggerMatch(target, candidate);
      if (score > bestScore) {
        bestScore = score;
        bestMatch = entity;
      }
    }
  }

  return bestScore >= minimumScore ? bestMatch : null;
}

function findExactTriggerMatch<T extends { name: string; triggers?: string[] }>(target: string, entities: T[]): T | null {
  const normalizedTarget = normalizeExpressionKey(target);
  if (!normalizedTarget) {
    return null;
  }

  return entities.find((entity) => getEntityTriggerNames(entity).includes(normalizedTarget)) || null;
}

function findExactSceneLocationMatch(
  requestedLocation: string,
  scenes: OneShotScenario['scenes'],
): OneShotScenario['scenes'][number] | null {
  const normalizedLocation = normalizeExpressionKey(requestedLocation);
  if (!normalizedLocation) {
    return null;
  }

  return (
    scenes.find((scene) => {
      const names = [scene.name, ...(scene.triggerWords || [])].map((value) => normalizeExpressionKey(value));
      return names.includes(normalizedLocation);
    }) || null
  );
}

function resolveCharacterCardForStudioCharacter(
  studioCharacter: Pick<StudioCharacter, 'name' | 'cardName'>,
  cards: CharacterOption[],
): CharacterOption | null {
  const exactCardMatch = cards.find((entry) => entry.name === studioCharacter.cardName);
  if (exactCardMatch) {
    return exactCardMatch;
  }

  const exactNameMatch = cards.find((entry) => entry.name === studioCharacter.name);
  if (exactNameMatch) {
    return exactNameMatch;
  }

  const fuzzyCardMatch = findBestTriggerMatch(studioCharacter.cardName, cards, 0.82);
  if (fuzzyCardMatch) {
    return fuzzyCardMatch;
  }

  return findBestTriggerMatch(studioCharacter.name, cards, 0.82);
}

function normalizeSceneWeatherPreset(value: unknown): SceneWeatherPreset {
  const normalized = `${value || ''}`.trim().toLowerCase();
  return ['rain', 'thunderstorm', 'fog', 'snow', 'sakura-petals', 'autumn-leaves'].includes(normalized)
    ? (normalized as SceneWeatherPreset)
    : 'none';
}

function WeatherEffects({ preset }: { preset?: SceneWeatherPreset }): JSX.Element | null {
  const normalizedPreset = normalizeSceneWeatherPreset(preset);
  const [lightningFlashes, setLightningFlashes] = useState<Array<{ id: number; x: number; opacity: number }>>([]);

  useEffect(() => {
    if (normalizedPreset !== 'thunderstorm') {
      setLightningFlashes([]);
      return undefined;
    }

    let cancelled = false;
    let nextId = 0;
    let timeoutId: number | null = null;
    const activeFlashTimeouts = new Set<number>();

    const scheduleStrike = () => {
      if (cancelled) {
        return;
      }

      const delay = 1200 + Math.random() * 5200;
      timeoutId = window.setTimeout(() => {
        if (cancelled) {
          return;
        }

        const burstCount = 1 + Math.floor(Math.random() * 3);
        for (let burstIndex = 0; burstIndex < burstCount; burstIndex += 1) {
          const flashTimeout = window.setTimeout(() => {
            if (cancelled) {
              return;
            }

            const id = nextId;
            nextId += 1;
            setLightningFlashes((current) => [
              ...current,
              { id, x: 18 + Math.random() * 64, opacity: 0.28 + Math.random() * 0.42 },
            ]);

            const removeTimeout = window.setTimeout(() => {
              setLightningFlashes((current) => current.filter((flash) => flash.id !== id));
              activeFlashTimeouts.delete(removeTimeout);
            }, 620);
            activeFlashTimeouts.add(removeTimeout);
            activeFlashTimeouts.delete(flashTimeout);
          }, burstIndex * (85 + Math.random() * 170));
          activeFlashTimeouts.add(flashTimeout);
        }

        scheduleStrike();
      }, delay);
    };

    scheduleStrike();

    return () => {
      cancelled = true;
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
      }
      activeFlashTimeouts.forEach((entry) => window.clearTimeout(entry));
      activeFlashTimeouts.clear();
    };
  }, [normalizedPreset]);

  if (normalizedPreset === 'none') {
    return null;
  }

  if (normalizedPreset === 'fog') {
    return (
      <div className="weather-overlay weather-fog" aria-hidden="true">
        {Array.from({ length: 5 }, (_, index) => (
          <span
            key={index}
            style={
              {
                '--weather-index': index,
                '--weather-delay': `${index * -5.5}s`,
              } as CSSProperties
            }
          />
        ))}
      </div>
    );
  }

  const particleCount =
    normalizedPreset === 'rain' || normalizedPreset === 'thunderstorm'
      ? 72
      : normalizedPreset === 'snow'
        ? 52
        : 34;
  const isWindborneWeather =
    normalizedPreset === 'snow' || normalizedPreset === 'sakura-petals' || normalizedPreset === 'autumn-leaves';

  return (
    <div className={`weather-overlay weather-${normalizedPreset}`} aria-hidden="true">
      {normalizedPreset === 'thunderstorm'
        ? lightningFlashes.map((flash) => (
            <div
              key={flash.id}
              className="weather-lightning"
              style={
              {
                '--weather-lightning-x': `${flash.x}%`,
                '--weather-lightning-opacity': flash.opacity,
                '--weather-lightning-dim-opacity': flash.opacity * 0.55,
              } as CSSProperties
            }
            />
          ))
        : null}
      {Array.from({ length: particleCount }, (_, index) => {
        const angle = -28 - ((index * 5) % 18);
        const spin = 180 + ((index * 31) % 300);
        const windDrift = 18 + ((index * 13) % 34);
        return (
          <span
            key={index}
            style={
              {
                '--weather-index': index,
                '--weather-x': `${(index * 37) % 101}%`,
                '--weather-delay': `${((index * 19) % 90) / -10}s`,
                '--weather-duration':
                  normalizedPreset === 'rain' || normalizedPreset === 'thunderstorm'
                    ? `${0.42 + ((index * 11) % 28) / 100}s`
                    : normalizedPreset === 'snow'
                      ? `${8.5 + ((index * 17) % 72) / 10}s`
                      : `${7.2 + ((index * 17) % 62) / 10}s`,
                '--weather-drift': isWindborneWeather ? `${windDrift}vw` : `${((index % 9) - 4) * 12}px`,
                '--weather-end-drift': `${windDrift * 1.35}vw`,
                '--weather-mid-drift': `${8 + ((index * 7) % 28)}vw`,
                '--weather-wobble': `${((index % 11) - 5) * 16}px`,
                '--weather-angle': `${angle}deg`,
                '--weather-spin-mid': `${angle + spin * 0.22}deg`,
                '--weather-spin-late': `${angle + spin * 0.58}deg`,
                '--weather-spin-end': `${angle + spin}deg`,
                '--weather-size': `${0.72 + ((index * 7) % 9) / 10}`,
              } as CSSProperties
            }
          />
        );
      })}
    </div>
  );
}

function normalizePlayerInputForSubmission(rawText: string): string {
  const trimmed = rawText.trim();
  if (!trimmed) {
    return '';
  }

  if (trimmed.includes('*')) {
    return trimmed;
  }

  if (/^["\u201C].*["\u201D]$/s.test(trimmed)) {
    return trimmed;
  }

  return `"${trimmed}"`;
}

function parseSpecialPlayerInput(rawText: string): {
  thinkingTurn: boolean;
  describeTurn: boolean;
  submittedText: string;
} {
  const trimmed = rawText.trim();
  const thinkingMatch = trimmed.match(/^\/think(?:\s+([\s\S]*))?$/i);
  if (thinkingMatch) {
    const thought = (thinkingMatch[1] || '').trim();
    return {
      thinkingTurn: true,
      describeTurn: false,
      submittedText: thought ? `Internal thought: ${thought}` : '',
    };
  }

  const describeMatch = trimmed.match(/^\/describe(?:\s+([\s\S]*))?$/i);
  if (describeMatch) {
    const subject = (describeMatch[1] || '').trim();
    return {
      thinkingTurn: false,
      describeTurn: true,
      submittedText: subject ? `Describe: ${subject}` : '',
    };
  }

  return {
    thinkingTurn: false,
    describeTurn: false,
    submittedText: normalizePlayerInputForSubmission(rawText),
  };
}

function isUndoCommand(rawText: string): boolean {
  return /^\/undo\s*$/i.test(rawText.trim());
}

function isContinueCommand(rawText: string): boolean {
  return /^\/continue\s*$/i.test(rawText.trim());
}

function appendAssistantContinuation(existingText: string, continuationText: string): string {
  const trimmedContinuation = continuationText.trimStart();
  if (!trimmedContinuation) {
    return existingText;
  }

  if (!existingText.trim()) {
    return trimmedContinuation;
  }

  return /\s$/.test(existingText) ? `${existingText}${trimmedContinuation}` : `${existingText} ${trimmedContinuation}`;
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

function levenshteinDistance(a: string, b: string): number {
  if (a === b) {
    return 0;
  }

  if (a.length === 0) {
    return b.length;
  }

  if (b.length === 0) {
    return a.length;
  }

  const previous = new Array<number>(b.length + 1);
  const current = new Array<number>(b.length + 1);

  for (let column = 0; column <= b.length; column += 1) {
    previous[column] = column;
  }

  for (let row = 1; row <= a.length; row += 1) {
    current[0] = row;
    for (let column = 1; column <= b.length; column += 1) {
      const cost = a[row - 1] === b[column - 1] ? 0 : 1;
      current[column] = Math.min(
        current[column - 1] + 1,
        previous[column] + 1,
        previous[column - 1] + cost,
      );
    }

    for (let column = 0; column <= b.length; column += 1) {
      previous[column] = current[column];
    }
  }

  return previous[b.length];
}

export default function App() {
  const [screen, setScreen] = useState<Screen>('menu');
  const [menuLoading, setMenuLoading] = useState(true);
  const [menuError, setMenuError] = useState<string | null>(null);

  const [stCards, setStCards] = useState<CharacterOption[]>([]);
  const [studioCharacters, setStudioCharacters] = useState<StudioCharacter[]>([]);
  const [scenarios, setScenarios] = useState<OneShotScenario[]>([]);
  const [runs, setRuns] = useState<ScenarioRun[]>([]);
  const [packages, setPackages] = useState<ScenarioPackage[]>([]);
  const [artStylePresets, setArtStylePresets] = useState<AutomaticGenerationArtStylePreset[]>([]);
  const [sillyTavernConnection, setSillyTavernConnection] = useState<SillyTavernConnectionInfo>(
    DEFAULT_SILLY_TAVERN_CONNECTION,
  );

  const [activeRunId, setActiveRunId] = useState('');
  const [activeScenarioId, setActiveScenarioId] = useState('');
  const [activeStudioCharacterId, setActiveStudioCharacterId] = useState('');
  const [storySessionId, setStorySessionId] = useState('');
  const [currentBackgroundUrl, setCurrentBackgroundUrl] = useState('');
  const [currentBgmUrl, setCurrentBgmUrl] = useState('');
  const [currentAmbientNoiseUrl, setCurrentAmbientNoiseUrl] = useState('');
  const [currentAmbientNoiseMuffled, setCurrentAmbientNoiseMuffled] = useState(false);
  const [currentSceneId, setCurrentSceneId] = useState('');
  const [locationFadeOpacity, setLocationFadeOpacity] = useState(0);
  const [entryFadeOpacity, setEntryFadeOpacity] = useState(0);
  const [screenLoadFadeOpacity, setScreenLoadFadeOpacity] = useState(0);
  const [undoFadeOpacity, setUndoFadeOpacity] = useState(0);

  const [runtime, setRuntime] = useState<RuntimeInfo>(DEFAULT_RUNTIME);
  const [streamEnabled, setStreamEnabled] = useState(true);
  const [shutdownEnabled, setShutdownEnabled] = useState(false);

  const [conversation, setConversation] = useState<ConversationMessage[]>([]);
  const [mode, setMode] = useState<GameMode>('player-input');
  const [dialogueSpeaker, setDialogueSpeaker] = useState('Narration');
  const [dialoguePages, setDialoguePages] = useState<DialoguePage[]>([
    { text: 'Your turn. Enter your action or dialogue.', tone: 'neutral' },
  ]);
  const [dialoguePageIndex, setDialoguePageIndex] = useState(0);
  const [streamText, setStreamText] = useState('');
  const [streamPageIndex, setStreamPageIndex] = useState(0);
  const [streamingAdvancePending, setStreamingAdvancePending] = useState(false);
  const [replayMessageIndex, setReplayMessageIndex] = useState(0);
  const [revealedChars, setRevealedChars] = useState(0);
  const [inputValue, setInputValue] = useState('');
  const [pauseOpen, setPauseOpen] = useState(false);
  const [mapOpen, setMapOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [logsOpen, setLogsOpen] = useState(false);
  const [dialogueBoxHidden, setDialogueBoxHidden] = useState(false);
  const [debugInfoVisible, setDebugInfoVisible] = useState(false);
  const [quitHint, setQuitHint] = useState<string | null>(null);
  const [gameplaySettings, setGameplaySettings] = useState<GameplaySettings>(() => loadGameplaySettings());
  const [interfaceSettings, setInterfaceSettings] = useState<InterfaceSettings>(() => loadInterfaceSettings());
  const [startupLogoVisible, setStartupLogoVisible] = useState(true);

  const [lastResponseMs, setLastResponseMs] = useState<number | null>(null);
  const [lastModel, setLastModel] = useState('unknown');
  const [hasCharacterSpoken, setHasCharacterSpoken] = useState(false);
  const [hideCharacterUntilNextQuote, setHideCharacterUntilNextQuote] = useState(false);
  const [portraitExpression, setPortraitExpression] = useState<SpriteExpression>('DEFAULT');
  const [portraitPosition, setPortraitPosition] = useState<DialoguePortraitPosition>('center');
  const [portraitDistance, setPortraitDistance] = useState<DialoguePortraitDistance>('normal');
  const [activeCgName, setActiveCgName] = useState('');
  const [dismissedCgCueSignature, setDismissedCgCueSignature] = useState('');
  const [selectedCharacterSpriteUrl, setSelectedCharacterSpriteUrl] = useState('');
  const [selectedCgImageUrl, setSelectedCgImageUrl] = useState('');
  const [renderedCgImageUrl, setRenderedCgImageUrl] = useState('');
  const [isCgLayerVisible, setIsCgLayerVisible] = useState(false);
  const [mouthLayerVisible, setMouthLayerVisible] = useState(false);
  const [affinityNotice, setAffinityNotice] = useState<{ id: number; text: string } | null>(null);
  const [currentSessionAffinity, setCurrentSessionAffinity] = useState<{ enabled: boolean; value: number } | null>(null);
  const [currentSessionLust, setCurrentSessionLust] = useState<{ enabled: boolean; value: number } | null>(null);

  const generationSequenceRef = useRef(0);
  const streamPageIndexRef = useRef(0);
  const previousLiveStreamingPagesLengthRef = useRef(0);
  const lastVisibleStreamingPageRef = useRef<DialoguePage | null>(null);
  const modeRef = useRef<GameMode>('player-input');
  const activeGenerationAbortControllerRef = useRef<AbortController | null>(null);
  const activeGenerationRequestIdRef = useRef(0);
  const activeGenerationUndoOnStopRef = useRef(false);
  const pendingGenerationStartedRef = useRef(false);
  const pendingFinalResultRef = useRef<{
    text: string;
    model: string;
    responseMs: number;
    requestId: number;
    continueTurn?: boolean;
  } | null>(null);
  const pendingErrorRef = useRef<string | null>(null);
  const replayMessagesRef = useRef<ConversationMessage[]>([]);
  const replaySpeakerNameRef = useRef('Assistant');
  const processedLocationCueRef = useRef<Set<string>>(new Set());
  const processedDistanceCueRef = useRef<Set<string>>(new Set());
  const currentSceneIdRef = useRef('');
  const locationTransitionInProgressRef = useRef(false);
  const queuedSceneIdRef = useRef<string | null>(null);
  const fadeOutTimeoutRef = useRef<number | null>(null);
  const fadeInTimeoutRef = useRef<number | null>(null);
  const entryFadeRafRef = useRef<number | null>(null);
  const bounceTimeoutRef = useRef<number | null>(null);
  const cgTransitionTimeoutRef = useRef<number | null>(null);
  const mouthTimeoutRef = useRef<number | null>(null);
  const affinityNoticeTimeoutRef = useRef<number | null>(null);
  const bgmAudioRef = useRef<HTMLAudioElement | null>(null);
  const ambientAudioRef = useRef<HTMLAudioElement | null>(null);
  const ambientAudioContextRef = useRef<AudioContext | null>(null);
  const ambientAudioSourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const ambientAudioFilterRef = useRef<BiquadFilterNode | null>(null);
  const ambientAudioGainRef = useRef<GainNode | null>(null);
  const dialogueBlipAudioRef = useRef<HTMLAudioElement | null>(null);
  const loadedBgmUrlRef = useRef('');
  const loadedAmbientNoiseUrlRef = useRef('');
  const loadedDialogueBlipRef = useRef('');
  const lastBounceSignatureRef = useRef('');
  const previousPageRef = useRef<{
    mode: GameMode;
    tone: DialoguePage['tone'];
    text: string;
    signature: string;
  } | null>(null);
  const previousResolvedCharacterExpressionRef = useRef<SpriteExpression>('DEFAULT');
  const vnScreenRef = useRef<HTMLElement | null>(null);
  const parallaxTargetRef = useRef({ x: 0, y: 0 });
  const parallaxCurrentRef = useRef({ x: 0, y: 0 });
  const parallaxRafRef = useRef<number | null>(null);
  const characterDepthMotionRef = useRef({ x: 0, y: 0 });
  const characterDepthMotionRafRef = useRef<number | null>(null);
  const [characterBouncing, setCharacterBouncing] = useState(false);
  const activeScenario = useMemo(
    () => scenarios.find((entry) => entry.id === activeScenarioId) ?? null,
    [activeScenarioId, scenarios],
  );

  const activeStudioCharacter = useMemo(
    () => studioCharacters.find((entry) => entry.id === activeStudioCharacterId) ?? null,
    [studioCharacters, activeStudioCharacterId],
  );
  const characterBloomIntensity = activeStudioCharacter?.automaticGeneration.bloomIntensity ?? 0;
  const characterBloomStyle = useMemo(
    () =>
      ({
        '--character-bloom-filter': buildCharacterBloomFilter(characterBloomIntensity),
      } as CSSProperties),
    [characterBloomIntensity],
  );

  const activeCard = useMemo(() => {
    if (!activeStudioCharacter) {
      return null;
    }
    return resolveCharacterCardForStudioCharacter(activeStudioCharacter, stCards);
  }, [activeStudioCharacter, stCards]);

  const assistantDisplayName = activeStudioCharacter?.name || activeCard?.name || 'Assistant';
  const currentScene = useMemo(
    () => activeScenario?.scenes.find((scene) => scene.id === currentSceneId) ?? activeScenario?.scenes[0] ?? null,
    [activeScenario, currentSceneId],
  );
  const triggerSimilarityThresholdScore = gameplaySettings.triggerSimilarityThreshold / 100;

  useEffect(() => {
    return () => {
      if (cgTransitionTimeoutRef.current !== null) {
        window.clearTimeout(cgTransitionTimeoutRef.current);
      }
      if (affinityNoticeTimeoutRef.current !== null) {
        window.clearTimeout(affinityNoticeTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (screen === 'game') {
      setDebugInfoVisible(false);
    }
  }, [screen]);

  const triggerGameEntryFade = useCallback(() => {
    setEntryFadeOpacity(1);

    if (entryFadeRafRef.current !== null) {
      window.cancelAnimationFrame(entryFadeRafRef.current);
      entryFadeRafRef.current = null;
    }

    entryFadeRafRef.current = window.requestAnimationFrame(() => {
      setEntryFadeOpacity(0);
    });
  }, []);

  const beginScreenLoadFade = useCallback(async () => {
    setScreenLoadFadeOpacity(1);
    await waitForNextPaint();
  }, []);

  const endScreenLoadFade = useCallback(() => {
    window.requestAnimationFrame(() => {
      setScreenLoadFadeOpacity(0);
    });
  }, []);

  useEffect(() => {
    streamPageIndexRef.current = streamPageIndex;
  }, [streamPageIndex]);

  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setStartupLogoVisible(false);
    }, 1450);

    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    currentSceneIdRef.current = currentSceneId;
  }, [currentSceneId]);

  useEffect(() => {
    try {
      window.localStorage.setItem(GAMEPLAY_SETTINGS_STORAGE_KEY, JSON.stringify(gameplaySettings));
    } catch {
      // Keep runtime settings working even if persistence is unavailable.
    }
  }, [gameplaySettings]);

  useEffect(() => {
    try {
      window.localStorage.setItem(INTERFACE_SETTINGS_STORAGE_KEY, JSON.stringify(interfaceSettings));
    } catch {
      // Keep interface settings working even if persistence is unavailable.
    }
  }, [interfaceSettings]);

  useEffect(() => {
    if (screen !== 'game') {
      return;
    }

    triggerGameEntryFade();
  }, [screen, triggerGameEntryFade]);

  useEffect(() => {
    let audio = bgmAudioRef.current;
    if (!audio) {
      audio = new Audio();
      audio.loop = true;
      bgmAudioRef.current = audio;
    }

    if (!currentBgmUrl) {
      loadedBgmUrlRef.current = '';
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
      return;
    }

    audio.volume = gameplaySettings.bgmVolume / 100;

    if (loadedBgmUrlRef.current === currentBgmUrl) {
      const resumeResult = audio.play();
      if (resumeResult instanceof Promise) {
        resumeResult.catch(() => undefined);
      }
      return;
    }

    loadedBgmUrlRef.current = currentBgmUrl;
    audio.src = currentBgmUrl;
    audio.currentTime = 0;
    const playResult = audio.play();
    if (playResult instanceof Promise) {
      playResult.catch(() => undefined);
    }
  }, [currentBgmUrl, gameplaySettings.bgmVolume]);

  useEffect(() => {
    let audio = ambientAudioRef.current;
    if (!audio) {
      audio = new Audio();
      audio.loop = true;
      ambientAudioRef.current = audio;
    }
    const filter =
      currentAmbientNoiseMuffled || ambientAudioFilterRef.current ? ensureAmbientAudioFilter(audio) : null;
    const audioContext = ambientAudioContextRef.current;
    if (filter && audioContext) {
      const targetFrequency = currentAmbientNoiseMuffled ? 320 : 22050;
      filter.type = 'lowpass';
      filter.frequency.setTargetAtTime(targetFrequency, audioContext.currentTime, 0.04);
      filter.Q.setTargetAtTime(currentAmbientNoiseMuffled ? 0.45 : 0.0001, audioContext.currentTime, 0.04);
      ambientAudioGainRef.current?.gain.setTargetAtTime(
        currentAmbientNoiseMuffled ? 10 : 1,
        audioContext.currentTime,
        0.04,
      );
    }

    if (!currentAmbientNoiseUrl) {
      loadedAmbientNoiseUrlRef.current = '';
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
      return;
    }

    audio.volume = gameplaySettings.ambienceVolume / 100;

    if (loadedAmbientNoiseUrlRef.current === currentAmbientNoiseUrl) {
      void resumeAmbientAudioContext().finally(() => {
        const resumeResult = audio.play();
        if (resumeResult instanceof Promise) {
          resumeResult.catch(() => undefined);
        }
      });
      return;
    }

    loadedAmbientNoiseUrlRef.current = currentAmbientNoiseUrl;
    audio.src = currentAmbientNoiseUrl;
    audio.currentTime = 0;
    void resumeAmbientAudioContext().finally(() => {
      const playResult = audio.play();
      if (playResult instanceof Promise) {
        playResult.catch(() => undefined);
      }
    });
  }, [currentAmbientNoiseMuffled, currentAmbientNoiseUrl, gameplaySettings.ambienceVolume]);

  useEffect(() => {
    const resumeAmbient = () => {
      void resumeAmbientAudioContext();
    };

    window.addEventListener('pointerdown', resumeAmbient);
    window.addEventListener('keydown', resumeAmbient);
    return () => {
      window.removeEventListener('pointerdown', resumeAmbient);
      window.removeEventListener('keydown', resumeAmbient);
    };
  }, []);

  useEffect(() => {
    return () => {
      if (bounceTimeoutRef.current !== null) {
        window.clearTimeout(bounceTimeoutRef.current);
      }
      if (fadeOutTimeoutRef.current !== null) {
        window.clearTimeout(fadeOutTimeoutRef.current);
      }
      if (fadeInTimeoutRef.current !== null) {
        window.clearTimeout(fadeInTimeoutRef.current);
      }
      if (entryFadeRafRef.current !== null) {
        window.cancelAnimationFrame(entryFadeRafRef.current);
      }
      if (bgmAudioRef.current) {
        bgmAudioRef.current.pause();
        bgmAudioRef.current = null;
      }
      if (ambientAudioRef.current) {
        ambientAudioRef.current.pause();
        ambientAudioRef.current = null;
      }
      if (ambientAudioContextRef.current) {
        void ambientAudioContextRef.current.close().catch(() => undefined);
        ambientAudioContextRef.current = null;
        ambientAudioSourceRef.current = null;
        ambientAudioFilterRef.current = null;
        ambientAudioGainRef.current = null;
      }
      if (dialogueBlipAudioRef.current) {
        dialogueBlipAudioRef.current.pause();
        dialogueBlipAudioRef.current = null;
      }
      if (parallaxRafRef.current !== null) {
        window.cancelAnimationFrame(parallaxRafRef.current);
        parallaxRafRef.current = null;
      }
      if (characterDepthMotionRafRef.current !== null) {
        window.cancelAnimationFrame(characterDepthMotionRafRef.current);
        characterDepthMotionRafRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (screen !== 'game') {
      return;
    }

    const stage = vnScreenRef.current;
    if (!stage) {
      return;
    }

    const supportsParallax =
      gameplaySettings.parallaxEnabled &&
      !window.matchMedia('(prefers-reduced-motion: reduce)').matches &&
      !window.matchMedia('(pointer: coarse)').matches;

    const applyParallax = (x: number, y: number) => {
      stage.style.setProperty('--parallax-bg-x', `${(-x * 18).toFixed(2)}px`);
      stage.style.setProperty('--parallax-bg-y', `${(-y * 12).toFixed(2)}px`);
      stage.style.setProperty('--parallax-sprite-x', '0px');
      stage.style.setProperty('--parallax-sprite-y', '0px');
    };

    if (!supportsParallax) {
      applyParallax(0, 0);
      return;
    }

    const animate = () => {
      const target = parallaxTargetRef.current;
      const current = parallaxCurrentRef.current;
      current.x += (target.x - current.x) * 0.12;
      current.y += (target.y - current.y) * 0.12;
      applyParallax(current.x, current.y);

      const shouldContinue =
        Math.abs(target.x - current.x) > 0.001 || Math.abs(target.y - current.y) > 0.001;

      if (shouldContinue) {
        parallaxRafRef.current = window.requestAnimationFrame(animate);
      } else {
        parallaxRafRef.current = null;
      }
    };

    const startAnimation = () => {
      if (parallaxRafRef.current !== null) {
        return;
      }
      parallaxRafRef.current = window.requestAnimationFrame(animate);
    };

    const handlePointerMove = (event: PointerEvent) => {
      const normalizedX = (event.clientX / window.innerWidth) * 2 - 1;
      const normalizedY = (event.clientY / window.innerHeight) * 2 - 1;
      parallaxTargetRef.current = {
        x: Math.max(-1, Math.min(1, normalizedX)),
        y: Math.max(-1, Math.min(1, normalizedY)),
      };
      startAnimation();
    };

    const resetParallax = () => {
      parallaxTargetRef.current = { x: 0, y: 0 };
      startAnimation();
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerleave', resetParallax);
    window.addEventListener('blur', resetParallax);

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerleave', resetParallax);
      window.removeEventListener('blur', resetParallax);
      if (parallaxRafRef.current !== null) {
        window.cancelAnimationFrame(parallaxRafRef.current);
        parallaxRafRef.current = null;
      }
      parallaxTargetRef.current = { x: 0, y: 0 };
      parallaxCurrentRef.current = { x: 0, y: 0 };
      applyParallax(0, 0);
    };
  }, [gameplaySettings.parallaxEnabled, screen]);

  useEffect(() => {
    if (
      screen !== 'game' ||
      !gameplaySettings.parallaxEnabled ||
      !gameplaySettings.idleAnimationEnabled
    ) {
      characterDepthMotionRef.current = { x: 0, y: 0 };
      if (characterDepthMotionRafRef.current !== null) {
        window.cancelAnimationFrame(characterDepthMotionRafRef.current);
        characterDepthMotionRafRef.current = null;
      }
      return undefined;
    }

    const animate = () => {
      const elapsedSeconds = performance.now() / 1000;
      characterDepthMotionRef.current = {
        x: Math.cos(elapsedSeconds * 0.72) * 0.82,
        y: Math.sin(elapsedSeconds * 0.72) * 0.82,
      };
      characterDepthMotionRafRef.current = window.requestAnimationFrame(animate);
    };

    characterDepthMotionRafRef.current = window.requestAnimationFrame(animate);

    return () => {
      if (characterDepthMotionRafRef.current !== null) {
        window.cancelAnimationFrame(characterDepthMotionRafRef.current);
        characterDepthMotionRafRef.current = null;
      }
      characterDepthMotionRef.current = { x: 0, y: 0 };
    };
  }, [gameplaySettings.idleAnimationEnabled, gameplaySettings.parallaxEnabled, screen]);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      setMenuLoading(true);
      setMenuError(null);

      try {
        const [connectionInfo, systemInfo, studioState] = await Promise.all([
          fetchSillyTavernConnection(),
          fetchSystemConfig(),
          fetchStudioState(),
        ]);

        if (cancelled) {
          return;
        }

        setSillyTavernConnection(connectionInfo);
        setShutdownEnabled(systemInfo.shutdownEnabled);
        setStudioCharacters(studioState.characters);
        setScenarios(studioState.scenarios);
        setRuns(studioState.runs);
        setPackages(studioState.packages);
        setArtStylePresets(studioState.artStylePresets);

        if (!connectionInfo.online) {
          setStCards([]);
          setRuntime(DEFAULT_RUNTIME);
          setLastModel(DEFAULT_RUNTIME.model);
          return;
        }

        const [loadedCards, runtimeInfo] = await Promise.all([fetchCharacters(), fetchRuntime()]);
        if (cancelled) {
          return;
        }

        setStCards(loadedCards);
        setRuntime(runtimeInfo.runtime);
        setLastModel(runtimeInfo.runtime.model || 'unknown');
        setStreamEnabled(runtimeInfo.streamingDefault);
      } catch (error) {
        if (cancelled) {
          return;
        }

        const message = error instanceof Error ? error.message : 'Failed to initialize app.';
        setMenuError(message);
      } finally {
        if (!cancelled) {
          setMenuLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (screen !== 'menu') {
      return;
    }

    let cancelled = false;

    const refreshConnectionStatus = async () => {
      try {
        const connectionInfo = await fetchSillyTavernConnection();
        if (!cancelled) {
          setSillyTavernConnection(connectionInfo);
        }
      } catch {
        if (!cancelled) {
          setSillyTavernConnection((current) => ({
            ...current,
            online: false,
            error: 'Failed to load SillyTavern connection status.',
          }));
        }
      }
    };

    const intervalId = window.setInterval(() => {
      void refreshConnectionStatus();
    }, 15000);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [screen]);

  const handleUpdateSillyTavernConnection = useCallback(async (baseUrl: string) => {
    const result = await updateSillyTavernConnection(baseUrl);
    setSillyTavernConnection(result.connection);
    setStCards(result.characters);
    setRuntime(result.runtime);
    setLastModel(result.runtime.model || 'unknown');
    setStreamEnabled(result.streamingDefault);
    setMenuError(null);
  }, []);

  const handleRefreshSillyTavernCards = useCallback(async () => {
    const connectionInfo = await fetchSillyTavernConnection();
    setSillyTavernConnection(connectionInfo);
    if (!connectionInfo.online) {
      setStCards([]);
      throw new Error(connectionInfo.error || 'SillyTavern is offline.');
    }
    const loadedCards = await fetchCharacters();
    setStCards(loadedCards);
    setMenuError(null);
  }, []);

  const resetForNewSession = useCallback(() => {
    generationSequenceRef.current += 1;
    activeGenerationAbortControllerRef.current?.abort();
    activeGenerationAbortControllerRef.current = null;
    activeGenerationRequestIdRef.current = 0;
    activeGenerationUndoOnStopRef.current = false;
    setConversation([]);
    setMode('player-input');
    setDialogueSpeaker('Narration');
    setDialoguePages([{ text: 'Your turn. Enter your action or dialogue.', tone: 'neutral' }]);
    setDialoguePageIndex(0);
    setStreamText('');
    setStreamPageIndex(0);
    setStreamingAdvancePending(false);
    setReplayMessageIndex(0);
    streamPageIndexRef.current = 0;
    replayMessagesRef.current = [];
    replaySpeakerNameRef.current = 'Assistant';
    setRevealedChars(0);
    setInputValue('');
    setLastResponseMs(null);
    setPauseOpen(false);
    setMapOpen(false);
    setSettingsOpen(false);
    setQuitHint(null);
    setLogsOpen(false);
    setDialogueBoxHidden(false);
    setStorySessionId('');
    setCurrentSceneId('');
    setCurrentBackgroundUrl('');
    setCurrentBgmUrl('');
    setCurrentAmbientNoiseUrl('');
    setCurrentAmbientNoiseMuffled(false);
    setCurrentSessionAffinity(null);
    setLocationFadeOpacity(0);
    setEntryFadeOpacity(0);
    setUndoFadeOpacity(0);
    pendingGenerationStartedRef.current = false;
    pendingFinalResultRef.current = null;
    pendingErrorRef.current = null;
    processedLocationCueRef.current = new Set();
    processedDistanceCueRef.current = new Set();
    locationTransitionInProgressRef.current = false;
    queuedSceneIdRef.current = null;
    if (fadeOutTimeoutRef.current !== null) {
      window.clearTimeout(fadeOutTimeoutRef.current);
      fadeOutTimeoutRef.current = null;
    }
    if (fadeInTimeoutRef.current !== null) {
      window.clearTimeout(fadeInTimeoutRef.current);
      fadeInTimeoutRef.current = null;
    }
    if (entryFadeRafRef.current !== null) {
      window.cancelAnimationFrame(entryFadeRafRef.current);
      entryFadeRafRef.current = null;
    }
    loadedBgmUrlRef.current = '';
    if (bgmAudioRef.current) {
      bgmAudioRef.current.pause();
      bgmAudioRef.current.removeAttribute('src');
      bgmAudioRef.current.load();
    }
    loadedAmbientNoiseUrlRef.current = '';
    if (ambientAudioRef.current) {
      ambientAudioRef.current.pause();
      ambientAudioRef.current.removeAttribute('src');
      ambientAudioRef.current.load();
    }
    loadedDialogueBlipRef.current = '';
    if (dialogueBlipAudioRef.current) {
      dialogueBlipAudioRef.current.pause();
      dialogueBlipAudioRef.current.removeAttribute('src');
      dialogueBlipAudioRef.current.load();
    }
    lastBounceSignatureRef.current = '';
    setCharacterBouncing(false);
    setHasCharacterSpoken(false);
    setHideCharacterUntilNextQuote(false);
    setPortraitExpression('DEFAULT');
    previousResolvedCharacterExpressionRef.current = 'DEFAULT';
    setPortraitPosition('center');
    setPortraitDistance('normal');
    setActiveCgName('');
    setDismissedCgCueSignature('');
    setSelectedCharacterSpriteUrl('');
    setSelectedCgImageUrl('');
    setRenderedCgImageUrl('');
    setIsCgLayerVisible(false);
    if (cgTransitionTimeoutRef.current !== null) {
      window.clearTimeout(cgTransitionTimeoutRef.current);
      cgTransitionTimeoutRef.current = null;
    }
    previousPageRef.current = null;
  }, []);

  const applyOpeningMessage = useCallback((openingText: string | undefined, speakerName = assistantDisplayName) => {
    const trimmed = (openingText || '').trim();
    if (!trimmed) {
      return;
    }

    pendingGenerationStartedRef.current = false;
    pendingFinalResultRef.current = null;
    pendingErrorRef.current = null;
    setStreamText('');
    setStreamPageIndex(0);
    setStreamingAdvancePending(false);
    streamPageIndexRef.current = 0;
    setRevealedChars(0);

    setConversation([{ role: 'assistant', content: trimmed }]);
    setHasCharacterSpoken(false);
    setDialogueSpeaker(speakerName);
    setDialoguePages(splitAssistantDialoguePages(trimmed));
    setDialoguePageIndex(0);
    setMode('assistant-pages');
  }, [assistantDisplayName]);

  const restoreConversationForRun = useCallback(
    (messages: ConversationMessage[], speakerName = assistantDisplayName) => {
      setConversation(messages);
      setHasCharacterSpoken(
        messages.some((message) => message.role === 'assistant' && textContainsCharacterDialogue(message.content)),
      );
      setStreamText('');
      setStreamPageIndex(0);
      setStreamingAdvancePending(false);
      streamPageIndexRef.current = 0;
      setRevealedChars(0);
      pendingGenerationStartedRef.current = false;
      pendingFinalResultRef.current = null;
      pendingErrorRef.current = null;

      if (messages.length === 0) {
        setDialogueSpeaker('Narration');
        setDialoguePages([{ text: 'Your turn. Enter your action or dialogue.', tone: 'neutral' }]);
        setDialoguePageIndex(0);
        setMode('player-input');
        return;
      }

      const lastMessage = messages[messages.length - 1];
      if (lastMessage.role === 'assistant') {
        setDialogueSpeaker(speakerName);
        setDialoguePages(splitAssistantDialoguePages(lastMessage.content));
      } else {
        setDialogueSpeaker('You');
        setDialoguePages(splitNeutralDialoguePages(lastMessage.content, 'dialogue'));
      }
      setDialoguePageIndex(0);
      setMode('assistant-pages');
    },
    [assistantDisplayName],
  );

  const restoreConversationForPlayerInput = useCallback(
    (messages: ConversationMessage[], speakerName = assistantDisplayName) => {
      setConversation(messages);
      setHasCharacterSpoken(
        messages.some((message) => message.role === 'assistant' && textContainsCharacterDialogue(message.content)),
      );
      setStreamText('');
      setStreamPageIndex(0);
      setStreamingAdvancePending(false);
      streamPageIndexRef.current = 0;
      pendingGenerationStartedRef.current = false;
      pendingFinalResultRef.current = null;
      pendingErrorRef.current = null;
      previousPageRef.current = null;

      if (messages.length === 0) {
        const pages = [{ text: 'Your turn. Enter your action or dialogue.', tone: 'neutral' as const }];
        setDialogueSpeaker('Narration');
        setDialoguePages(pages);
        setDialoguePageIndex(0);
        setRevealedChars(pages[0].text.length);
        setMode('player-input');
        return;
      }

      const lastMessage = messages[messages.length - 1];
      const pages =
        lastMessage.role === 'assistant'
          ? splitAssistantDialoguePages(lastMessage.content)
          : splitNeutralDialoguePages(lastMessage.content, 'dialogue');
      const lastPageIndex = Math.max(0, pages.length - 1);

      setDialogueSpeaker(lastMessage.role === 'assistant' ? speakerName : 'You');
      setDialoguePages(pages);
      setDialoguePageIndex(lastPageIndex);
      setRevealedChars((pages[lastPageIndex] ?? { text: '' }).text.length);
      setMode('player-input');
    },
    [assistantDisplayName],
  );

  const showReplayMessage = useCallback((message: ConversationMessage, speakerName: string) => {
    setDialogueSpeaker(message.role === 'assistant' ? speakerName : 'You');
    setDialoguePages(
      message.role === 'assistant'
        ? splitAssistantDialoguePages(message.content)
        : splitNeutralDialoguePages(message.content, 'dialogue'),
    );
    setDialoguePageIndex(0);
    setStreamText('');
    setStreamPageIndex(0);
    setStreamingAdvancePending(false);
    streamPageIndexRef.current = 0;
    setRevealedChars(0);
    setMode('replay');
  }, []);

  function getScenarioStartingPoints(
    scenario: OneShotScenario,
  ): Array<{ id: string; name: string; sceneId: string; startMessage: string; specialInstructions: string }> {
    const validSceneIds = new Set(scenario.scenes.map((scene) => scene.id));
    const points = (scenario.startingPoints || [])
      .filter((point) => validSceneIds.has(point.sceneId))
      .slice(0, 5)
      .map((point, index) => ({
        id: point.id || `start-${index}`,
        name: point.name || scenario.scenes.find((scene) => scene.id === point.sceneId)?.name || `Start ${index + 1}`,
        sceneId: point.sceneId,
        startMessage: point.startMessage || scenario.startMessage || '',
        specialInstructions: point.specialInstructions || scenario.specialInstructions || '',
      }));

    if (points.length > 0) {
      return points;
    }

    const fallbackScene = scenario.scenes.find((scene) => scene.id === scenario.startSceneId) ?? scenario.scenes[0];
    return fallbackScene
      ? [
          {
            id: 'default',
            name: fallbackScene.name || 'Default',
            sceneId: fallbackScene.id,
            startMessage: scenario.startMessage || '',
            specialInstructions: scenario.specialInstructions || '',
          },
        ]
      : [];
  }

  function getScenarioContext(scenarioId: string, startingPointId?: string): {
    scenario: OneShotScenario;
    studioCharacter: StudioCharacter;
    card: CharacterOption;
    startScene: SceneVisualState | null;
    startingPoint: {
      id: string;
      name: string;
      sceneId: string;
      startMessage: string;
      specialInstructions: string;
    } | null;
  } {
    const scenario = scenarios.find((entry) => entry.id === scenarioId);
    if (!scenario) {
      throw new Error('Scenario not found.');
    }

    const studioCharacter = studioCharacters.find((entry) => entry.id === scenario.characterId);
    if (!studioCharacter) {
      throw new Error('Scenario character was removed. Edit the scenario first.');
    }
    if (normalizeAssetVariants(studioCharacter.sprites.DEFAULT).length === 0) {
      throw new Error(
        `Scenario character "${studioCharacter.name}" is missing a default sprite. Add a default sprite before playing this scenario.`,
      );
    }

    const card = resolveCharacterCardForStudioCharacter(studioCharacter, stCards);
    if (!card) {
      throw new Error(
        `SillyTavern card "${studioCharacter.cardName}" was not found for "${studioCharacter.name}". Re-import it in SillyTavern or edit this character.`,
      );
    }

    const startingPoints = getScenarioStartingPoints(scenario);
    const startingPoint =
      startingPoints.find((point) => point.id === startingPointId) || startingPoints[0] || null;
    if (!startingPoint?.startMessage.trim()) {
      throw new Error('Selected starting point needs a starting message. Edit the scenario first.');
    }
    const scenarioStartScene =
      scenario.scenes.find((scene) => scene.id === startingPoint?.sceneId) ??
      scenario.scenes.find((scene) => scene.id === scenario.startSceneId) ??
      scenario.scenes[0];
    const startScene = scenarioStartScene
      ? {
          id: scenarioStartScene.id,
          backgroundDataUrl: scenarioStartScene.backgroundDataUrl,
          backgroundDepthMapDataUrl: scenarioStartScene.backgroundDepthMapDataUrl,
          bgmDataUrl: scenarioStartScene.bgmDataUrl,
          ambientNoiseDataUrl: scenarioStartScene.ambientNoiseDataUrl,
          ambientNoisePresetId: scenarioStartScene.ambientNoisePresetId,
          ambientNoiseMuffled: scenarioStartScene.ambientNoiseMuffled,
          weatherPreset: scenarioStartScene.weatherPreset,
        }
      : null;

    return {
      scenario,
      studioCharacter,
      card,
      startScene,
      startingPoint,
    };
  }

  function applySceneState(scene: SceneVisualState | null): void {
    setCurrentSceneId(scene?.id || '');
    setCurrentBackgroundUrl(scene?.backgroundDataUrl || '');
    setCurrentBgmUrl(scene?.bgmDataUrl || '');
    setCurrentAmbientNoiseUrl(resolveSceneAmbientNoiseUrl(scene));
    setCurrentAmbientNoiseMuffled(scene?.ambientNoiseMuffled === true);
  }

  function toSceneVisualState(scene: OneShotScenario['scenes'][number] | null): SceneVisualState | null {
    return scene
      ? {
          id: scene.id,
          backgroundDataUrl: scene.backgroundDataUrl,
          backgroundDepthMapDataUrl: scene.backgroundDepthMapDataUrl,
          bgmDataUrl: scene.bgmDataUrl,
          ambientNoiseDataUrl: scene.ambientNoiseDataUrl,
          ambientNoisePresetId: scene.ambientNoisePresetId,
          ambientNoiseMuffled: scene.ambientNoiseMuffled,
          weatherPreset: scene.weatherPreset,
        }
      : null;
  }

  function ensureAmbientAudioFilter(audio: HTMLAudioElement): BiquadFilterNode | null {
    if (ambientAudioFilterRef.current) {
      return ambientAudioFilterRef.current;
    }

    const AudioContextConstructor =
      window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextConstructor) {
      return null;
    }

    try {
      const audioContext = ambientAudioContextRef.current || new AudioContextConstructor();
      ambientAudioContextRef.current = audioContext;
      const source = ambientAudioSourceRef.current || audioContext.createMediaElementSource(audio);
      ambientAudioSourceRef.current = source;
      const filter = audioContext.createBiquadFilter();
      const gain = audioContext.createGain();
      filter.type = 'lowpass';
      source.connect(filter);
      filter.connect(gain);
      gain.connect(audioContext.destination);
      ambientAudioFilterRef.current = filter;
      ambientAudioGainRef.current = gain;
      return filter;
    } catch {
      return null;
    }
  }

  async function resumeAmbientAudioContext(): Promise<void> {
    const audioContext = ambientAudioContextRef.current;
    if (!audioContext || audioContext.state !== 'suspended') {
      return;
    }

    await audioContext.resume();
  }

  function resolveSceneAmbientNoiseUrl(scene: SceneVisualState | null): string {
    if (!scene) {
      return '';
    }

    return scene.ambientNoisePresetId
      ? AMBIENT_PRESET_MAP.get(scene.ambientNoisePresetId)?.src || ''
      : scene.ambientNoiseDataUrl || '';
  }

  function resolveRunScene(
    scenario: OneShotScenario,
    currentSceneId: string | undefined,
  ): OneShotScenario['scenes'][number] | null {
    return scenario.scenes.find((scene) => scene.id === currentSceneId) ?? scenario.scenes[0] ?? null;
  }

  function resolveSceneAfterMessages(scenario: OneShotScenario, messages: ConversationMessage[]): SceneVisualState | null {
    let scene = resolveRunScene(scenario, scenario.startSceneId);

    for (const message of messages) {
      if (message.role !== 'assistant') {
        continue;
      }

      for (const page of splitAssistantDialoguePages(message.content)) {
        for (const cue of page.locationCues || []) {
          const matchedScene = findExactSceneLocationMatch(cue.location, scenario.scenes);
          if (matchedScene) {
            scene = matchedScene;
          }
        }
      }
    }

    return toSceneVisualState(scene);
  }

  const handleSaveCharacter = useCallback(
    async (payload: {
      id?: string;
      name: string;
      cardName: string;
      accentColor: string;
      suggestedAffinityPositiveMaximum?: number;
      suggestedAffinityNegativeMaximum?: number;
      suggestedLustMaximum?: number;
      characterNameFontId?: string;
      characterNameColor?: string;
      blipSound?: string;
      dialogueQuoteFontId?: string;
      dialogueQuoteAnimationPreset?: string;
      dialogueQuoteAnimationSpeed?: number;
      dialogueQuoteAnimationColor?: string;
      sprites: Record<string, string[]>;
      spriteDepthMaps: Record<string, string[]>;
      spriteAnimationFrames: Record<string, SpriteAnimationFrameSet>;
      customReactions: Array<{
        name: string;
        sprites: string[];
        depthMaps?: string[];
        animationFrames?: SpriteAnimationFrameSet;
        triggers?: string[];
      }>;
      automaticGeneration: {
        checkpoint: string;
        upscaleModel: string;
        loras: Array<{ name: string; strength: number }>;
        basePrompt: string;
        negativePrompt: string;
        artStylePrompt: string;
        artStylePresets: Array<{
          id: string;
          name: string;
          prompt: string;
          checkpoint: string;
          loras: Array<{ name: string; strength: number }>;
          thumbnailDataUrl?: string;
        }>;
        characterMainTags: string;
        upperBodyTags: string;
        waistTags: string;
        openMouthTags: string;
        lowerBodyTags: string;
        expressionVariantCount: number;
        cgVariantCount: number;
        steps: number;
        preferredPenetrationExpression:
          | 'ANY'
          | 'HAPPY'
          | 'ANNOYED'
          | 'EXPRESSIONLESS'
          | 'CRYING'
          | 'LIGHT_SMILE'
          | 'NAUGHTY_FACE'
          | 'AHEGAO';
        preferredCgExpression:
          | 'ANY'
          | 'HAPPY'
          | 'ANNOYED'
          | 'EXPRESSIONLESS'
          | 'CRYING'
          | 'LIGHT_SMILE'
          | 'NAUGHTY_FACE'
          | 'AHEGAO';
        lightingColor: 'NEUTRAL' | 'BLUE' | 'RED' | 'PURPLE' | 'ORANGE' | 'YELLOW' | 'GREEN' | 'PINK';
        breastSize: 'FLAT' | 'SMALL' | 'MEDIUM' | 'LARGE' | 'HUGE' | 'GIGANTIC';
        bloomIntensity: number;
        generateDepthMaps: boolean;
        generateMouthAnimations: boolean;
        defaultExpressions: Array<{ enabled: boolean; expression: string; prompt: string }>;
        customExpressions: Array<{ enabled: boolean; triggerTag: string; prompt: string }>;
        cgDefinitions: Array<{
          enabled: boolean;
          triggerTag: string;
          prompt: string;
          excludeUpperBodyTags: boolean;
          excludeWaistTags: boolean;
          excludeLowerBodyTags: boolean;
        }>;
        generatedPromptBySlot: Record<string, string>;
      };
      spriteZones: Record<string, SpriteInteractiveZone[]>;
      cgs: Array<{ name: string; images: string[]; triggers?: string[] }>;
    }) => {
      const previousCharacter = payload.id
        ? studioCharacters.find((character) => character.id === payload.id)
        : undefined;
      const transportPayload = createRetainedAssetCharacterPayload(payload, previousCharacter);
      const saved = await saveStudioCharacter(transportPayload, payload);
      const resolvedSavedCharacter: StudioCharacter = {
        ...saved,
        name: payload.name,
        cardName: payload.cardName,
        accentColor: payload.accentColor,
        suggestedAffinityPositiveMaximum: payload.suggestedAffinityPositiveMaximum,
        suggestedAffinityNegativeMaximum: payload.suggestedAffinityNegativeMaximum,
        suggestedLustMaximum: payload.suggestedLustMaximum,
        characterNameFontId: payload.characterNameFontId,
        characterNameColor: payload.characterNameColor,
        blipSound: payload.blipSound,
        dialogueQuoteFontId: payload.dialogueQuoteFontId,
        dialogueQuoteAnimationPreset: payload.dialogueQuoteAnimationPreset,
        dialogueQuoteAnimationSpeed: payload.dialogueQuoteAnimationSpeed,
        dialogueQuoteAnimationColor: payload.dialogueQuoteAnimationColor,
      };
      setStudioCharacters((current) => {
        const next = [...current];
        const index = next.findIndex((entry) => entry.id === resolvedSavedCharacter.id);
        if (index >= 0) {
          next[index] = resolvedSavedCharacter;
        } else {
          next.push(resolvedSavedCharacter);
        }
        return next;
      });

      if (previousCharacter && previousCharacter.cardName !== resolvedSavedCharacter.cardName) {
        const scenariosToRefresh = scenarios.filter((scenario) => scenario.characterId === previousCharacter.id);
        if (scenariosToRefresh.length > 0) {
          const refreshedScenarios = await Promise.all(
            scenariosToRefresh.map((scenario) =>
              saveScenario({
                id: scenario.id,
                name: scenario.name,
                description: scenario.description,
                startMessage: scenario.startMessage,
                specialInstructions: scenario.specialInstructions,
                characterId: resolvedSavedCharacter.id,
                bannerDataUrl: scenario.bannerDataUrl,
                startSceneId: scenario.startSceneId,
                startingPoints: scenario.startingPoints?.map((point) => ({
                  id: point.id,
                  name: point.name,
                  sceneId: point.sceneId,
                  startMessage: point.startMessage,
                  specialInstructions: point.specialInstructions,
                })),
                scenes: scenario.scenes.map((scene) => ({
                  id: scene.id,
                  name: scene.name,
                  backgroundDataUrl: scene.backgroundDataUrl,
                  backgroundDepthMapDataUrl: scene.backgroundDepthMapDataUrl,
                  bgmDataUrl: scene.bgmDataUrl,
                  ambientNoiseDataUrl: scene.ambientNoiseDataUrl,
                  ambientNoisePresetId: scene.ambientNoisePresetId,
                  ambientNoiseMuffled: scene.ambientNoiseMuffled,
                  weatherPreset: scene.weatherPreset,
                  triggerWords: scene.triggerWords,
                })),
              }),
            ),
          );

          setScenarios((current) => {
            const refreshedById = new Map(refreshedScenarios.map((scenario) => [scenario.id, scenario]));
            return current.map((scenario) => refreshedById.get(scenario.id) ?? scenario);
          });
        }
      }
    },
    [scenarios, studioCharacters],
  );

  const handleDeleteCharacter = useCallback(async (characterId: string) => {
    await deleteStudioCharacter(characterId);
    setStudioCharacters((current) => current.filter((entry) => entry.id !== characterId));
  }, []);

  const handleUpdateArtStylePresets = useCallback(async (nextPresets: AutomaticGenerationArtStylePreset[]) => {
    setArtStylePresets(nextPresets);
    const savedPresets = await updateStudioArtStylePresets(nextPresets);
    setArtStylePresets(savedPresets);
  }, []);

  const handleSaveScenario = useCallback(
    async (payload: {
      id?: string;
      name: string;
      description: string;
      startMessage: string;
      specialInstructions: string;
      characterId: string;
      bannerDataUrl?: string;
      startSceneId?: string;
      startingPoints?: Array<{
        id?: string;
        name: string;
        sceneId: string;
        startMessage: string;
        specialInstructions: string;
      }>;
      scenes: Array<{
        id?: string;
        name: string;
        backgroundDataUrl: string;
        backgroundDepthMapDataUrl?: string;
        bgmDataUrl?: string;
        ambientNoiseDataUrl?: string;
        ambientNoisePresetId?: string;
        ambientNoiseMuffled?: boolean;
        triggerWords: string[];
      }>;
    }) => {
      const saved = await saveScenario(payload);
      setScenarios((current) => {
        const next = [...current];
        const index = next.findIndex((entry) => entry.id === saved.id);
        if (index >= 0) {
          next[index] = saved;
        } else {
          next.push(saved);
        }
        return next;
      });
    },
    [],
  );

  const handleDeleteScenario = useCallback(async (scenarioId: string) => {
    await deleteScenario(scenarioId);
    setScenarios((current) => current.filter((entry) => entry.id !== scenarioId));
    setRuns((current) => current.filter((entry) => entry.scenarioId !== scenarioId));
  }, []);

  const handleStartRun = useCallback(
    async (scenarioId: string, options: StartRunOptions = {}) => {
      if (!sillyTavernConnection.online) {
        throw new Error('SillyTavern is offline. Reconnect before starting a run.');
      }

      await beginScreenLoadFade();

      try {
        const context = getScenarioContext(scenarioId, options.startingPointId);
        const startMessage = (context.startingPoint?.startMessage || context.scenario.startMessage || '').trim();
        const specialInstructions = (
          context.startingPoint?.specialInstructions ||
          context.scenario.specialInstructions ||
          ''
        ).trim();
        const session = await startStorySession({
          characterName: context.card.name,
          avatarUrl: context.card.avatar,
          firstMes: startMessage,
          cgNames: context.studioCharacter.cgs.flatMap((cg) => getEntityTriggerNames(cg)),
          locationNames: context.scenario.scenes.map((scene) => scene.name),
          specialInstructions,
          roleplayLanguagePreference: interfaceSettings.roleplayLanguagePreference,
          affinity: options.affinity,
          lust: options.lust,
        });

        const openingText = (session.firstMes || startMessage || '').trim();
        const initialMessages: ConversationMessage[] = openingText
          ? [{ role: 'assistant', content: openingText }]
          : [];

        const run = await createScenarioRun({
          scenarioId: context.scenario.id,
          title: `${context.scenario.name}${
            context.startingPoint ? ` - ${context.startingPoint.name}` : ''
          } ${new Date().toLocaleString()}`,
          messages: initialMessages,
          currentSceneId: context.startScene?.id || undefined,
          startingPointId: context.startingPoint?.id,
        });

        setRuns((current) => [run, ...current.filter((entry) => entry.id !== run.id)]);
        setActiveRunId(run.id);
        setActiveScenarioId(context.scenario.id);
        setActiveStudioCharacterId(context.studioCharacter.id);
        applySceneState(context.startScene);

        resetForNewSession();
        setStorySessionId(session.sessionId);
        setCurrentSessionAffinity(
          options.affinity?.enabled
            ? {
                enabled: true,
                value: Math.min(120, Math.max(-120, Math.round(options.affinity.startingValue))),
              }
            : null,
        );
        setCurrentSessionLust(
          options.lust?.enabled
            ? {
                enabled: true,
                value: Math.min(100, Math.max(0, Math.round(options.lust.startingValue))),
              }
            : null,
        );
        applySceneState(context.startScene);
        applyOpeningMessage(openingText, context.studioCharacter.name || context.card.name);
        setEntryFadeOpacity(1);
        setScreen('game');
        setMenuError(null);
      } catch (error) {
        endScreenLoadFade();
        throw error;
      }

      endScreenLoadFade();
    },
    [
      applyOpeningMessage,
      beginScreenLoadFade,
      endScreenLoadFade,
      interfaceSettings.roleplayLanguagePreference,
      resetForNewSession,
      scenarios,
      sillyTavernConnection.online,
      stCards,
      studioCharacters,
    ],
  );

  const handleResumeRun = useCallback(
    async (runId: string) => {
      if (!sillyTavernConnection.online) {
        throw new Error('SillyTavern is offline. Reconnect before resuming a run.');
      }

      await beginScreenLoadFade();

      try {
        const run = runs.find((entry) => entry.id === runId);
        if (!run) {
          throw new Error('Run not found.');
        }

        const context = getScenarioContext(run.scenarioId, run.startingPointId);
        const specialInstructions = (
          context.startingPoint?.specialInstructions ||
          context.scenario.specialInstructions ||
          ''
        ).trim();
        const session = await startStorySession({
          characterName: context.card.name,
          avatarUrl: context.card.avatar,
          firstMes: '',
          cgNames: context.studioCharacter.cgs.flatMap((cg) => getEntityTriggerNames(cg)),
          locationNames: context.scenario.scenes.map((scene) => scene.name),
          specialInstructions,
          roleplayLanguagePreference: interfaceSettings.roleplayLanguagePreference,
        });

        setActiveRunId(run.id);
        setActiveScenarioId(context.scenario.id);
        setActiveStudioCharacterId(context.studioCharacter.id);
        const resumeScene = resolveRunScene(context.scenario, run.currentSceneId);
        applySceneState(resumeScene);

        resetForNewSession();
        setStorySessionId(session.sessionId);
        setCurrentSessionAffinity(null);
        applySceneState(resumeScene);
        restoreConversationForRun(run.messages, context.studioCharacter.name || context.card.name);
        setEntryFadeOpacity(1);
        setScreen('game');
        setMenuError(null);
      } catch (error) {
        endScreenLoadFade();
        throw error;
      }

      endScreenLoadFade();
    },
    [
      beginScreenLoadFade,
      endScreenLoadFade,
      interfaceSettings.roleplayLanguagePreference,
      resetForNewSession,
      restoreConversationForRun,
      runs,
      scenarios,
      sillyTavernConnection.online,
      stCards,
      studioCharacters,
    ],
  );

  const handleReplayRun = useCallback(
    async (runId: string) => {
      await beginScreenLoadFade();

      try {
        const run = runs.find((entry) => entry.id === runId);
        if (!run) {
          throw new Error('Run not found.');
        }

        const context = getScenarioContext(run.scenarioId);
        const speakerName = context.studioCharacter.name || context.card.name;
        const replayMessages = run.messages;

        setActiveRunId(run.id);
        setActiveScenarioId(context.scenario.id);
        setActiveStudioCharacterId(context.studioCharacter.id);

        resetForNewSession();
        setCurrentSessionAffinity(null);
        replayMessagesRef.current = replayMessages;
        replaySpeakerNameRef.current = speakerName;
        setConversation(replayMessages);
        applySceneState(context.startScene);
        setEntryFadeOpacity(1);
        setScreen('game');
        setMenuError(null);

        if (replayMessages.length > 0) {
          setReplayMessageIndex(0);
          showReplayMessage(replayMessages[0], speakerName);
        } else {
          setReplayMessageIndex(0);
          setDialogueSpeaker('System');
          setDialoguePages(splitNeutralDialoguePages('No saved messages to replay.', 'neutral'));
          setDialoguePageIndex(0);
          setMode('assistant-pages');
        }
      } catch (error) {
        endScreenLoadFade();
        throw error;
      }

      endScreenLoadFade();
    },
    [
      beginScreenLoadFade,
      endScreenLoadFade,
      resetForNewSession,
      runs,
      scenarios,
      showReplayMessage,
      stCards,
      studioCharacters,
    ],
  );

  const handleDeleteRun = useCallback(async (runId: string) => {
    await deleteScenarioRun(runId);
    setRuns((current) => current.filter((entry) => entry.id !== runId));
  }, []);

  const handleCreatePackage = useCallback(
    async (scenarioId: string, options?: { packageName?: string }) => {
      const createdPackage = await createScenarioPackage(scenarioId, options);
      setPackages((current) => [createdPackage, ...current.filter((entry) => entry.id !== createdPackage.id)]);
    },
    [],
  );

  const handleImportPackage = useCallback(async (fileName: string, packageData: string) => {
    const imported = await importScenarioPackage(fileName, packageData);
    setPackages((current) => [imported.package, ...current.filter((entry) => entry.id !== imported.package.id)]);
    setStudioCharacters((current) => [imported.character, ...current.filter((entry) => entry.id !== imported.character.id)]);
    setScenarios((current) => [imported.scenario, ...current.filter((entry) => entry.id !== imported.scenario.id)]);
    const connectionInfo = await fetchSillyTavernConnection();
    setSillyTavernConnection(connectionInfo);
    if (connectionInfo.online) {
      setStCards(await fetchCharacters());
    }
  }, []);

  const handleRevealPackage = useCallback(async (packageId: string) => {
    await revealScenarioPackage(packageId);
  }, []);

  const handleDeletePackage = useCallback(
    async (
      packageId: string,
      options?: {
        deleteCharacters?: boolean;
        deleteScenarios?: boolean;
      },
    ) => {
      const deleted = await deleteScenarioPackage(packageId, options);
    setPackages((current) => current.filter((entry) => !deleted.deletedPackageIds.includes(entry.id)));
    setScenarios((current) => current.filter((entry) => !deleted.deletedScenarioIds.includes(entry.id)));
    setRuns((current) => current.filter((entry) => !deleted.deletedScenarioIds.includes(entry.scenarioId)));
    setStudioCharacters((current) => current.filter((entry) => !deleted.deletedCharacterIds.includes(entry.id)));
    },
    [],
  );

  useEffect(() => {
    if (screen !== 'game' || !activeRunId || mode === 'replay') {
      return;
    }

    const timer = window.setTimeout(() => {
      void updateScenarioRunMessages(activeRunId, conversation, currentSceneId || undefined)
        .then((updatedRun) => {
          setRuns((current) =>
            current.map((entry) => (entry.id === updatedRun.id ? updatedRun : entry)),
          );
        })
        .catch(() => undefined);
    }, 250);

    return () => window.clearTimeout(timer);
  }, [activeRunId, conversation, currentSceneId, mode, screen]);

  const applyAssistantResult = useCallback(
    (assistantText: string, model: string, responseMs: number) => {
      const text = assistantText || '';
      const pages = splitAssistantDialoguePages(text || '(No text returned.)');

      pendingGenerationStartedRef.current = false;
      pendingFinalResultRef.current = null;
      pendingErrorRef.current = null;

      setConversation((current) => [...current, { role: 'assistant', content: text }]);
      setDialogueSpeaker(assistantDisplayName);
      setDialoguePages(pages);
      setDialoguePageIndex(Math.min(streamPageIndexRef.current, pages.length - 1));
      setMode('assistant-pages');
      setStreamText('');
      setStreamPageIndex(0);
      setStreamingAdvancePending(false);
      streamPageIndexRef.current = 0;
      setLastModel(model || runtime.model || 'unknown');
      setLastResponseMs(responseMs);
    },
    [assistantDisplayName, runtime.model],
  );

  const applyAssistantContinuationResult = useCallback(
    (assistantText: string, model: string, responseMs: number) => {
      const text = assistantText || '';
      const lastAssistantIndex = conversation.map((message) => message.role).lastIndexOf('assistant');
      const combinedText =
        lastAssistantIndex >= 0
          ? appendAssistantContinuation(conversation[lastAssistantIndex].content, text)
          : text;

      pendingGenerationStartedRef.current = false;
      pendingFinalResultRef.current = null;
      pendingErrorRef.current = null;

      setConversation((current) =>
        lastAssistantIndex >= 0
          ? current.map((message, index) => (index === lastAssistantIndex ? { ...message, content: combinedText } : message))
          : [...current, { role: 'assistant', content: text }],
      );

      const pages = splitAssistantDialoguePages(combinedText || '(No text returned.)');
      setDialogueSpeaker(assistantDisplayName);
      setDialoguePages(pages);
      setDialoguePageIndex(Math.min(streamPageIndexRef.current, pages.length - 1));
      setMode('assistant-pages');
      setStreamText('');
      setStreamPageIndex(0);
      setStreamingAdvancePending(false);
      streamPageIndexRef.current = 0;
      setLastModel(model || runtime.model || 'unknown');
      setLastResponseMs(responseMs);
    },
    [assistantDisplayName, conversation, runtime.model],
  );

  const showAffinityUpdate = useCallback(
    (affinity?: AffinityUpdate) => {
      if (!affinity) {
        return;
      }

      setCurrentSessionAffinity(
        affinity.enabled
          ? {
              enabled: true,
              value: affinity.value,
            }
          : null,
      );

      if (affinity.delta === 0) {
        return;
      }

      if (affinityNoticeTimeoutRef.current !== null) {
        window.clearTimeout(affinityNoticeTimeoutRef.current);
      }

      const signedDelta = affinity.delta > 0 ? `+${affinity.delta}` : `${affinity.delta}`;
      setAffinityNotice({
        id: Date.now(),
        text: `Affinity ${signedDelta} (${affinity.value})`,
      });
      affinityNoticeTimeoutRef.current = window.setTimeout(() => {
        setAffinityNotice(null);
        affinityNoticeTimeoutRef.current = null;
      }, 2800);
    },
    [],
  );

  const showLustUpdate = useCallback((lust?: LustUpdate) => {
    if (!lust) {
      return;
    }

    setCurrentSessionLust(
      lust.enabled
        ? {
            enabled: true,
            value: lust.value,
          }
        : null,
    );
  }, []);

  const handleFinalizeAssistant = useCallback(
    (
      assistantText: string,
      model: string,
      responseMs: number,
      requestId: number,
      options: { continueTurn?: boolean } = {},
    ) => {
      if (generationSequenceRef.current !== requestId) {
        return;
      }

      if (modeRef.current === 'user-echo') {
        pendingFinalResultRef.current = {
          text: assistantText,
          model,
          responseMs,
          requestId,
          continueTurn: options.continueTurn === true,
        };
        return;
      }

      if (options.continueTurn) {
        applyAssistantContinuationResult(assistantText, model, responseMs);
        return;
      }

      applyAssistantResult(assistantText, model, responseMs);
    },
    [applyAssistantContinuationResult, applyAssistantResult],
  );

  const generateAssistantTurn = useCallback(
    async (
      messages: ConversationMessage[],
      requestId: number,
      options: { thinkingTurn?: boolean; continueTurn?: boolean; describeTurn?: boolean } = {},
    ) => {
      if (!activeCard) {
        throw new Error('No active SillyTavern card is selected for this run.');
      }

      const abortController = new AbortController();
      activeGenerationAbortControllerRef.current = abortController;
      activeGenerationRequestIdRef.current = requestId;
      activeGenerationUndoOnStopRef.current = options.continueTurn !== true;

      try {
        const result = await generateAssistantReply(
          {
            messages,
            stream: streamEnabled,
            sessionId: storySessionId,
            thinkingTurn: options.thinkingTurn === true,
            continueTurn: options.continueTurn === true,
            describeTurn: options.describeTurn === true,
            character: {
              name: activeCard.name,
              description: activeCard.description,
              personality: activeCard.personality,
              scenario: activeCard.scenario,
              first_mes: '',
              mes_example: activeCard.mesExample,
              system_prompt: activeCard.systemPrompt,
              post_history_instructions: activeCard.postHistoryInstructions,
            },
          },
          {
            onGenerationStart: () => {
              if (generationSequenceRef.current !== requestId) {
                return;
              }
              pendingGenerationStartedRef.current = true;
              if (modeRef.current !== 'user-echo') {
                setMode('streaming');
              }
            },
            onToken: (text) => {
              if (generationSequenceRef.current !== requestId) {
                return;
              }
              if (modeRef.current !== 'user-echo') {
                setMode('streaming');
              }
              setStreamText(text);
            },
          },
          { signal: abortController.signal },
        );

        showAffinityUpdate(result.affinity);
        showLustUpdate(result.lust);
        handleFinalizeAssistant(result.text, result.model, result.responseMs, requestId, {
          continueTurn: options.continueTurn === true,
        });
      } catch (error) {
        if (generationSequenceRef.current !== requestId) {
          return;
        }

        if (isAbortError(error)) {
          return;
        }

        const message = error instanceof Error ? error.message : 'Generation failed.';
        pendingGenerationStartedRef.current = false;
        if (modeRef.current === 'user-echo') {
          pendingErrorRef.current = message;
          return;
        }

        setDialogueSpeaker('System');
        setDialoguePages(splitNeutralDialoguePages(`Generation failed: ${message}`, 'neutral'));
        setDialoguePageIndex(0);
        setMode('assistant-pages');
      } finally {
        if (activeGenerationRequestIdRef.current === requestId) {
          activeGenerationAbortControllerRef.current = null;
          activeGenerationRequestIdRef.current = 0;
          activeGenerationUndoOnStopRef.current = false;
        }
      }
    },
    [activeCard, handleFinalizeAssistant, showAffinityUpdate, showLustUpdate, storySessionId, streamEnabled],
  );

  const performUndoLastTurn = useCallback((options: { fade?: boolean } = {}) => {
    const lastUserMessageIndex = conversation.map((message) => message.role).lastIndexOf('user');
    if (lastUserMessageIndex < 0) {
      const pages = splitNeutralDialoguePages('Nothing to undo.', 'neutral');
      setDialogueSpeaker('System');
      setDialoguePages(pages);
      setDialoguePageIndex(0);
      setRevealedChars(pages[0]?.text.length || 0);
      return;
    }

    const nextHistory = conversation.slice(0, lastUserMessageIndex);
    const nextScene = activeScenario ? resolveSceneAfterMessages(activeScenario, nextHistory) : currentScene;

    void (async () => {
      generationSequenceRef.current += 1;
      setInputValue('');
      setLogsOpen(false);
      activeGenerationAbortControllerRef.current?.abort();
      activeGenerationAbortControllerRef.current = null;
      activeGenerationRequestIdRef.current = 0;
      activeGenerationUndoOnStopRef.current = false;

      if (options.fade !== false) {
        setUndoFadeOpacity(1);
        await waitForNextPaint();
        await sleep(UNDO_BLACK_SCREEN_WAIT_MS);
      }

      pendingGenerationStartedRef.current = false;
      pendingFinalResultRef.current = null;
      pendingErrorRef.current = null;

      try {
        setActiveCgName('');
        applySceneState(nextScene);
        restoreConversationForPlayerInput(nextHistory, assistantDisplayName);

        if (activeRunId) {
          const updated = await updateScenarioRunMessages(activeRunId, nextHistory, nextScene?.id || undefined);
          setRuns((current) => current.map((entry) => (entry.id === updated.id ? updated : entry)));
        }
      } catch (error) {
        const pages = splitNeutralDialoguePages(
          `Undo failed: ${error instanceof Error ? error.message : 'Could not update the saved run.'}`,
          'neutral',
        );
        setDialogueSpeaker('System');
        setDialoguePages(pages);
        setDialoguePageIndex(0);
        setRevealedChars(pages[0]?.text.length || 0);
        setMode('player-input');
      } finally {
        setUndoFadeOpacity(0);
      }
    })();
  }, [
    activeRunId,
    activeScenario,
    assistantDisplayName,
    conversation,
    currentScene,
    restoreConversationForPlayerInput,
  ]);

  const handleUndoCommand = useCallback(() => {
    if (pauseOpen || mapOpen || settingsOpen || mode !== 'player-input') {
      return;
    }

    performUndoLastTurn();
  }, [mapOpen, mode, pauseOpen, performUndoLastTurn, settingsOpen]);

  const handleContinueCommand = useCallback(() => {
    if (pauseOpen || mapOpen || settingsOpen || mode !== 'player-input') {
      return;
    }

    if (!conversation.some((message) => message.role === 'assistant')) {
      const pages = splitNeutralDialoguePages('Nothing to continue.', 'neutral');
      setDialogueSpeaker('System');
      setDialoguePages(pages);
      setDialoguePageIndex(0);
      setRevealedChars(pages[0]?.text.length || 0);
      return;
    }

    const requestId = generationSequenceRef.current + 1;
    generationSequenceRef.current = requestId;

    setInputValue('');
    setDialogueSpeaker(assistantDisplayName);
    setMode('waiting-reply');
    setStreamText('');
    setStreamPageIndex(0);
    setStreamingAdvancePending(false);
    streamPageIndexRef.current = 0;
    pendingGenerationStartedRef.current = false;
    pendingFinalResultRef.current = null;
    pendingErrorRef.current = null;

    void generateAssistantTurn(conversation, requestId, { continueTurn: true });
  }, [
    assistantDisplayName,
    conversation,
    generateAssistantTurn,
    mapOpen,
    mode,
    pauseOpen,
    settingsOpen,
  ]);

  const handleStopGeneration = useCallback(() => {
    const controller = activeGenerationAbortControllerRef.current;
    if (!controller) {
      return;
    }

    const shouldUndo = activeGenerationUndoOnStopRef.current;
    controller.abort();

    if (shouldUndo) {
      performUndoLastTurn();
      return;
    }

    generationSequenceRef.current += 1;
    activeGenerationAbortControllerRef.current = null;
    activeGenerationRequestIdRef.current = 0;
    activeGenerationUndoOnStopRef.current = false;
    pendingGenerationStartedRef.current = false;
    pendingFinalResultRef.current = null;
    pendingErrorRef.current = null;
    setStreamText('');
    setStreamPageIndex(0);
    setStreamingAdvancePending(false);
    streamPageIndexRef.current = 0;
    restoreConversationForPlayerInput(conversation, assistantDisplayName);
  }, [assistantDisplayName, conversation, performUndoLastTurn, restoreConversationForPlayerInput]);

  const submitPlayerInputText = useCallback((rawText: string) => {
    if (pauseOpen || mapOpen || settingsOpen || mode !== 'player-input') {
      return;
    }

    if (isUndoCommand(rawText)) {
      handleUndoCommand();
      return;
    }

    if (isContinueCommand(rawText)) {
      handleContinueCommand();
      return;
    }

    const { thinkingTurn, describeTurn, submittedText } = parseSpecialPlayerInput(rawText);
    if (!submittedText) {
      return;
    }

    const requestId = generationSequenceRef.current + 1;
    generationSequenceRef.current = requestId;

    const userPages = splitNeutralDialoguePages(submittedText, 'dialogue');
    const nextHistory: ConversationMessage[] = [
      ...conversation,
      { role: 'user', content: submittedText },
    ];

    setConversation(nextHistory);
    setInputValue('');
    setDialogueSpeaker('You');
    setDialoguePages(userPages);
    setDialoguePageIndex(0);
    setMode('user-echo');
    setStreamText('');
    setStreamPageIndex(0);
    setStreamingAdvancePending(false);
    streamPageIndexRef.current = 0;
    pendingGenerationStartedRef.current = false;
    pendingFinalResultRef.current = null;
    pendingErrorRef.current = null;

    void generateAssistantTurn(nextHistory, requestId, { thinkingTurn, describeTurn });
  }, [
    conversation,
    generateAssistantTurn,
    handleContinueCommand,
    handleUndoCommand,
    mapOpen,
    mode,
    pauseOpen,
    settingsOpen,
  ]);

  const submitPlayerInput = useCallback(() => {
    submitPlayerInputText(inputValue);
  }, [inputValue, submitPlayerInputText]);

  const parsedStreamingPages = useMemo(() => splitAssistantDialoguePages(streamText), [streamText]);
  const liveStreamingPages = useMemo(() => {
    if (parsedStreamingPages.length === 0) {
      return [];
    }

    if (streamingTextEndsAtStepBoundary(streamText)) {
      return parsedStreamingPages;
    }

    // Keep at least one in-progress page visible while streaming so the loader
    // does not flicker back on and replay the same line.
    return parsedStreamingPages.length > 1 ? parsedStreamingPages.slice(0, -1) : parsedStreamingPages;
  }, [parsedStreamingPages, streamText]);
  const currentStreamingPage = useMemo(
    () => (streamPageIndex < liveStreamingPages.length ? liveStreamingPages[streamPageIndex] : null),
    [liveStreamingPages, streamPageIndex],
  );
  const visibleStreamingPage = useMemo(
    () => currentStreamingPage ?? lastVisibleStreamingPageRef.current,
    [currentStreamingPage],
  );
  const isStreamingPageReady = mode !== 'streaming' || Boolean(currentStreamingPage ?? visibleStreamingPage);

  useEffect(() => {
    if (mode !== 'streaming') {
      lastVisibleStreamingPageRef.current = null;
      setStreamingAdvancePending(false);
      return;
    }

    if (currentStreamingPage) {
      lastVisibleStreamingPageRef.current = currentStreamingPage;
      setStreamingAdvancePending(false);
    }
  }, [currentStreamingPage, mode]);
  
  useEffect(() => {
    if (mode !== 'streaming') {
      previousLiveStreamingPagesLengthRef.current = liveStreamingPages.length;
      return;
    }

    setStreamPageIndex((index) => {
      const previousLength = previousLiveStreamingPagesLengthRef.current;
      const nextLength = liveStreamingPages.length;
      const wasOnNewestVisiblePage =
        previousLength === 0 ? index === 0 : index >= previousLength - 1;

      let nextIndex = Math.min(index, nextLength);
      if (nextLength > previousLength && wasOnNewestVisiblePage) {
        nextIndex = Math.max(0, nextLength - 1);
      }

      streamPageIndexRef.current = nextIndex;
      return nextIndex;
    });
    previousLiveStreamingPagesLengthRef.current = liveStreamingPages.length;
  }, [liveStreamingPages.length, mode]);
  
  const dialoguePageForView = useMemo(() => {
    if (mode === 'streaming') {
      return visibleStreamingPage ?? { text: '', tone: 'neutral' as const };
    }

    return dialoguePages[dialoguePageIndex] ?? { text: '', tone: 'neutral' as const };
  }, [dialoguePageIndex, dialoguePages, mode, visibleStreamingPage]);
  const dialoguePageSignature = useMemo(() => getDialoguePageSignature(dialoguePageForView), [dialoguePageForView]);
  const rawAssistantTextForCgTracking = useMemo(() => {
    if (mode === 'streaming') {
      return streamText;
    }

    if (mode === 'assistant-pages') {
      for (let index = conversation.length - 1; index >= 0; index -= 1) {
        const message = conversation[index];
        if (message?.role === 'assistant') {
          return message.content || '';
        }
      }

      return '';
    }

    if (mode === 'replay') {
      const replayMessage = replayMessagesRef.current[replayMessageIndex];
      return replayMessage?.role === 'assistant' ? replayMessage.content || '' : '';
    }

    return '';
  }, [conversation, mode, replayMessageIndex, streamText]);
  const latestVisibleNonNullSituationCue = useMemo(
    () => getLatestNonNullSituationCueFromText(rawAssistantTextForCgTracking),
    [rawAssistantTextForCgTracking],
  );
  const currentDialogueStepKey = useMemo(() => {
    if (mode === 'streaming') {
      return `stream:${activeGenerationRequestIdRef.current}:${streamPageIndex}`;
    }

    if (mode === 'assistant-pages') {
      return `assistant:${conversation.map((message) => message.role).lastIndexOf('assistant')}:${dialoguePageIndex}`;
    }

    if (mode === 'replay') {
      return `replay:${replayMessageIndex}:${dialoguePageIndex}`;
    }

    return `${mode}:${dialoguePageIndex}`;
  }, [conversation, dialoguePageIndex, mode, replayMessageIndex, streamPageIndex]);
  const currentCgSourceKey = useMemo(() => {
    if (mode === 'streaming') {
      return `assistant:${conversation.length}`;
    }

    if (mode === 'assistant-pages') {
      return `assistant:${conversation.map((message) => message.role).lastIndexOf('assistant')}`;
    }

    if (mode === 'replay') {
      return `replay:${replayMessageIndex}`;
    }

    return 'none';
  }, [conversation, mode, replayMessageIndex]);
  const currentCgCueSignature = useMemo(() => {
    if (!latestVisibleNonNullSituationCue) {
      return '';
    }

    return `${currentCgSourceKey}:${latestVisibleNonNullSituationCue.signature}`;
  }, [currentCgSourceKey, latestVisibleNonNullSituationCue]);

  useEffect(() => {
    setDismissedCgCueSignature('');
  }, [currentCgSourceKey]);

  const speakerForCurrentView = mode === 'streaming' ? assistantDisplayName : dialogueSpeaker;
  const isNonCharacterSpeaker =
    speakerForCurrentView === 'You' || speakerForCurrentView === 'System' || speakerForCurrentView === 'Narration';
  const isCharacterSpeaker = !isNonCharacterSpeaker;
  const isCharacterTurn = mode === 'streaming' || ((mode === 'assistant-pages' || mode === 'replay') && isCharacterSpeaker);
  const isCharacterSpeakingDialogue = isCharacterTurn && dialoguePageForView.tone === 'dialogue';
  const isNarrationSpeaker =
    speakerForCurrentView === 'Narration' ||
    ((mode === 'assistant-pages' || mode === 'streaming' || mode === 'replay') &&
      dialoguePageForView.tone === 'roleplay');
  const dialogueSpeakerForView = isNarrationSpeaker ? 'Narrator' : speakerForCurrentView;
  const shouldUseCharacterNameStyle = isCharacterSpeaker && !isNarrationSpeaker;
  const dialogueAccentColor = isNarrationSpeaker
    ? NARRATOR_ACCENT_COLOR
    : isCharacterSpeaker
      ? activeStudioCharacter?.accentColor || ''
      : '';
  const dialogueQuoteFontFamily = useMemo(
    () => getDialogueQuoteFontFamily(activeStudioCharacter?.dialogueQuoteFontId),
    [activeStudioCharacter?.dialogueQuoteFontId],
  );
  const characterNameFontFamily = useMemo(
    () => getDialogueQuoteFontFamily(activeStudioCharacter?.characterNameFontId),
    [activeStudioCharacter?.characterNameFontId],
  );
  const characterNameColor = activeStudioCharacter?.characterNameColor || activeStudioCharacter?.accentColor || '';
  const dialogueQuoteAnimationPreset = useMemo(
    () => normalizeDialogueQuoteAnimationPreset(activeStudioCharacter?.dialogueQuoteAnimationPreset),
    [activeStudioCharacter?.dialogueQuoteAnimationPreset],
  );
  const dialogueQuoteAnimationSpeed = useMemo(
    () => normalizeDialogueQuoteAnimationSpeed(activeStudioCharacter?.dialogueQuoteAnimationSpeed),
    [activeStudioCharacter?.dialogueQuoteAnimationSpeed],
  );
  const dialogueQuoteAnimationColor = useMemo(
    () => normalizeDialogueQuoteAnimationColor(activeStudioCharacter?.dialogueQuoteAnimationColor),
    [activeStudioCharacter?.dialogueQuoteAnimationColor],
  );
  const effectiveDialogueQuoteFontFamily = isCharacterSpeakingDialogue ? dialogueQuoteFontFamily : undefined;
  const activeDialogueBlipUrl = useMemo(() => {
    const blipId = activeStudioCharacter?.blipSound || '';
    return blipId ? BLIP_OPTION_MAP.get(blipId)?.src || '' : '';
  }, [activeStudioCharacter?.blipSound]);

  useEffect(() => {
    ensureDialogueQuoteFontStylesheet(activeStudioCharacter?.dialogueQuoteFontId);
  }, [activeStudioCharacter?.dialogueQuoteFontId]);

  useEffect(() => {
    ensureDialogueQuoteFontStylesheet(activeStudioCharacter?.characterNameFontId);
  }, [activeStudioCharacter?.characterNameFontId]);

  useEffect(() => {
    if (isCharacterSpeakingDialogue) {
      setHasCharacterSpoken(true);
      setHideCharacterUntilNextQuote(false);
    }
  }, [isCharacterSpeakingDialogue]);

  const resolvedCharacterExpression = useMemo<SpriteExpression>(() => {
    if (!isCharacterTurn) {
      return portraitExpression;
    }

    return resolveSpriteExpressionForPage(dialoguePageForView, Math.max(0, revealedChars));
  }, [dialoguePageForView, isCharacterTurn, portraitExpression, revealedChars]);

  useEffect(() => {
    if (!isCharacterTurn) {
      return;
    }

    const expressionChanged = previousResolvedCharacterExpressionRef.current !== resolvedCharacterExpression;
    previousResolvedCharacterExpressionRef.current = resolvedCharacterExpression;
    if (expressionChanged) {
      setPortraitDistance((current) => (current === 'normal' ? current : 'normal'));
    }

    setPortraitExpression((current) =>
      current === resolvedCharacterExpression ? current : resolvedCharacterExpression,
    );
  }, [isCharacterTurn, resolvedCharacterExpression]);

  useEffect(() => {
    if (!isCharacterTurn) {
      return;
    }

    const hasPortraitPositionCue =
      typeof dialoguePageForView.basePortraitPosition !== 'undefined' ||
      (dialoguePageForView.portraitPositionCues?.length || 0) > 0;
    if (!hasPortraitPositionCue) {
      return;
    }

    const nextPosition = resolvePortraitPositionForPage(dialoguePageForView, Math.max(0, revealedChars));
    setPortraitPosition((current) => (current === nextPosition ? current : nextPosition));
  }, [dialoguePageForView, isCharacterTurn, revealedChars]);

  useEffect(() => {
    if (!isCharacterTurn) {
      return;
    }

    const hasPortraitDistanceCue =
      typeof dialoguePageForView.basePortraitDistance !== 'undefined' ||
      (dialoguePageForView.portraitDistanceCues?.length || 0) > 0;
    if (!hasPortraitDistanceCue) {
      setPortraitDistance((current) => (current === 'normal' ? current : 'normal'));
      return;
    }

    if (typeof dialoguePageForView.basePortraitDistance === 'undefined') {
      setPortraitDistance((current) => (current === 'normal' ? current : 'normal'));
      return;
    }

    setPortraitDistance((current) =>
      current === dialoguePageForView.basePortraitDistance ? current : dialoguePageForView.basePortraitDistance!,
    );
  }, [
    currentDialogueStepKey,
    dialoguePageForView.basePortraitDistance,
    dialoguePageForView.portraitDistanceCues?.length,
    isCharacterTurn,
  ]);

  useEffect(() => {
    if (!isCharacterTurn) {
      return;
    }

    const cues = dialoguePageForView.portraitDistanceCues || [];

    for (let cueIndex = 0; cueIndex < cues.length; cueIndex += 1) {
      const cue = cues[cueIndex];
      if (cue.at > revealedChars) {
        continue;
      }

      const signature = `${currentDialogueStepKey}:${cueIndex}:${cue.at}:${cue.distance}`;
      if (processedDistanceCueRef.current.has(signature)) {
        continue;
      }

      processedDistanceCueRef.current.add(signature);
      setPortraitDistance((current) => {
        if (cue.distance === 'closer') {
          return stepPortraitDistance(current, 'closer');
        }

        if (cue.distance === 'away') {
          return stepPortraitDistance(current, 'away');
        }

        return cue.distance;
      });
    }
  }, [currentDialogueStepKey, dialoguePageForView.portraitDistanceCues, isCharacterTurn, revealedChars]);

  const matchedCustomReaction = useMemo(() => {
    if (!activeStudioCharacter) {
      return null;
    }

    const normalizedExpression = normalizeExpressionKey(portraitExpression);
    const exactMatch = activeStudioCharacter.customReactions.find((reaction) =>
      getEntityTriggerNames(reaction).includes(normalizedExpression),
    );
    if (exactMatch) {
      return exactMatch;
    }

    if (normalizeAssetVariants(activeStudioCharacter.sprites[portraitExpression]).length > 0) {
      return null;
    }

    return findBestTriggerMatch(
      normalizedExpression,
      activeStudioCharacter.customReactions,
      triggerSimilarityThresholdScore,
    );
  }, [activeStudioCharacter, portraitExpression, triggerSimilarityThresholdScore]);

  const currentSpriteVariantPool = useMemo(() => {
    if (!activeStudioCharacter) {
      return [];
    }

    return matchedCustomReaction
      ? normalizeAssetVariants(matchedCustomReaction.sprites)
      : normalizeAssetVariants(activeStudioCharacter.sprites[portraitExpression]).length > 0
        ? normalizeAssetVariants(activeStudioCharacter.sprites[portraitExpression])
        : normalizeAssetVariants(activeStudioCharacter.sprites.DEFAULT);
  }, [activeStudioCharacter, matchedCustomReaction, portraitExpression]);
  const currentSpriteDepthMapPool = useMemo(() => {
    if (!activeStudioCharacter) {
      return [];
    }

    return matchedCustomReaction
      ? normalizeAssetVariants(matchedCustomReaction.depthMaps)
      : normalizeAssetVariants(activeStudioCharacter.sprites[portraitExpression]).length > 0
        ? normalizeAssetVariants(activeStudioCharacter.spriteDepthMaps[portraitExpression])
        : normalizeAssetVariants(activeStudioCharacter.spriteDepthMaps.DEFAULT);
  }, [activeStudioCharacter, matchedCustomReaction, portraitExpression]);
  const currentSpriteVariantKey = useMemo(() => {
    if (!activeStudioCharacter) {
      return '';
    }

    if (matchedCustomReaction) {
      return `reaction:${normalizeExpressionKey(matchedCustomReaction.name)}`;
    }

    return normalizeAssetVariants(activeStudioCharacter.sprites[portraitExpression]).length > 0
      ? `expression:${normalizeExpressionKey(portraitExpression)}`
      : 'expression:DEFAULT';
  }, [activeStudioCharacter, matchedCustomReaction, portraitExpression]);
  const currentCgMatch = useMemo(() => {
    if (!activeStudioCharacter) {
      return null;
    }

    if (currentCgCueSignature) {
      if (currentCgCueSignature === dismissedCgCueSignature || !latestVisibleNonNullSituationCue) {
        return null;
      }

      return (
        findExactTriggerMatch(latestVisibleNonNullSituationCue.tag, activeStudioCharacter.cgs) ||
        findBestTriggerMatch(latestVisibleNonNullSituationCue.tag, activeStudioCharacter.cgs, 0.96)
      );
    }

    return null;
  }, [
    activeCgName,
    activeStudioCharacter,
    currentCgCueSignature,
    dismissedCgCueSignature,
    latestVisibleNonNullSituationCue,
  ]);
  const currentCgVariantPool = useMemo(
    () => (currentCgMatch ? normalizeAssetVariants(currentCgMatch.images) : []),
    [currentCgMatch],
  );
  const currentCgVariantKey = useMemo(
    () => (currentCgMatch ? normalizeExpressionKey(currentCgMatch.name) : ''),
    [currentCgMatch],
  );
  const characterSpriteUrl = selectedCharacterSpriteUrl || DEFAULT_CHARACTER_SPRITE;
  const characterSpriteDepthMapUrl = useMemo(() => {
    const selectedIndex = currentSpriteVariantPool.indexOf(selectedCharacterSpriteUrl);
    return selectedIndex >= 0 ? currentSpriteDepthMapPool[selectedIndex] || '' : '';
  }, [currentSpriteDepthMapPool, currentSpriteVariantPool, selectedCharacterSpriteUrl]);
  const currentSpriteAnimationFrames = useMemo<SpriteAnimationFrameSet>(() => {
    if (!activeStudioCharacter) {
      return { closedEyes: [], openMouth: [] };
    }

    if (matchedCustomReaction) {
      return matchedCustomReaction.animationFrames || { closedEyes: [], openMouth: [] };
    }

    return normalizeAssetVariants(activeStudioCharacter.sprites[portraitExpression]).length > 0
      ? activeStudioCharacter.spriteAnimationFrames?.[portraitExpression] || { closedEyes: [], openMouth: [] }
      : activeStudioCharacter.spriteAnimationFrames?.DEFAULT || { closedEyes: [], openMouth: [] };
  }, [activeStudioCharacter, matchedCustomReaction, portraitExpression]);
  const characterSpriteAnimationFrameUrls = useMemo(() => {
    const selectedIndex = currentSpriteVariantPool.indexOf(selectedCharacterSpriteUrl);
    if (selectedIndex < 0) {
      return { closedEyes: '', openMouth: '' };
    }

    return {
      openMouth: currentSpriteAnimationFrames.openMouth[selectedIndex] || '',
    };
  }, [currentSpriteAnimationFrames, currentSpriteVariantPool, selectedCharacterSpriteUrl]);
  const currentBackgroundDepthMapUrl = currentScene?.backgroundDepthMapDataUrl || '';
  const activeCgImageUrl = selectedCgImageUrl;
  const isCgStageActive = Boolean(renderedCgImageUrl);
  const rawDialogueTextForView = dialoguePageForView.text.slice(0, Math.max(0, revealedChars));
  const displayedDialogueTextForView =
    mode === 'streaming' ? hideIncompleteTrailingTag(rawDialogueTextForView) : rawDialogueTextForView;
  const isTextFullyRevealed = revealedChars >= dialoguePageForView.text.length;
  const shouldAnimateSpeakingVisuals =
    isCharacterSpeakingDialogue &&
    !pauseOpen &&
    !mapOpen &&
    !settingsOpen &&
    !isTextFullyRevealed &&
    displayedDialogueTextForView.trim().length > 0;

  useEffect(() => {
    if (
      selectedCharacterSpriteUrl &&
      currentSpriteVariantPool.includes(selectedCharacterSpriteUrl)
    ) {
      return;
    }

    setSelectedCharacterSpriteUrl(pickRandomAssetVariant(currentSpriteVariantPool));
  }, [currentSpriteVariantKey, currentSpriteVariantPool, selectedCharacterSpriteUrl]);

  useEffect(() => {
    if (currentCgVariantPool.length === 0) {
      if (selectedCgImageUrl) {
        setSelectedCgImageUrl('');
      }
      return;
    }

    if (selectedCgImageUrl && currentCgVariantPool.includes(selectedCgImageUrl)) {
      return;
    }

    setSelectedCgImageUrl(currentCgVariantPool[0] || '');
  }, [currentCgVariantKey, currentCgVariantPool, selectedCgImageUrl]);

  useEffect(() => {
    if (mouthTimeoutRef.current !== null) {
      window.clearTimeout(mouthTimeoutRef.current);
      mouthTimeoutRef.current = null;
    }
    setMouthLayerVisible(false);

    const shouldAnimateMouth =
      Boolean(characterSpriteAnimationFrameUrls.openMouth) &&
      shouldAnimateSpeakingVisuals &&
      !isCgStageActive;
    if (!shouldAnimateMouth) {
      return undefined;
    }

    let cancelled = false;
    const scheduleTalkBurst = () => {
      mouthTimeoutRef.current = window.setTimeout(
        () => {
          if (cancelled) {
            return;
          }

          const stopAt = Date.now() + 650 + Math.random() * 850;
          const tick = () => {
            if (cancelled || Date.now() >= stopAt) {
              setMouthLayerVisible(false);
              scheduleTalkBurst();
              return;
            }

            setMouthLayerVisible((current) => !current);
            mouthTimeoutRef.current = window.setTimeout(tick, 95 + Math.random() * 85);
          };

          tick();
        },
        70 + Math.random() * 180,
      );
    };

    scheduleTalkBurst();

    return () => {
      cancelled = true;
      if (mouthTimeoutRef.current !== null) {
        window.clearTimeout(mouthTimeoutRef.current);
        mouthTimeoutRef.current = null;
      }
      setMouthLayerVisible(false);
    };
  }, [
    characterSpriteAnimationFrameUrls.openMouth,
    currentSpriteVariantKey,
    shouldAnimateSpeakingVisuals,
    isCgStageActive,
  ]);

  const activeSpriteZones = useMemo<SpriteInteractiveZone[]>(() => {
    if (!activeStudioCharacter) {
      return [];
    }

    const normalizedExpression = normalizeExpressionKey(portraitExpression);
    const zoneKey = matchedCustomReaction?.name ? normalizeExpressionKey(matchedCustomReaction.name) : normalizedExpression;
    return activeStudioCharacter.spriteZones[zoneKey] || [];
  }, [activeStudioCharacter, matchedCustomReaction, portraitExpression]);

  useEffect(() => {
    if (cgTransitionTimeoutRef.current !== null) {
      window.clearTimeout(cgTransitionTimeoutRef.current);
      cgTransitionTimeoutRef.current = null;
    }

    if (activeCgImageUrl) {
      setRenderedCgImageUrl(activeCgImageUrl);
      window.requestAnimationFrame(() => {
        setIsCgLayerVisible(true);
      });
      return;
    }

    setIsCgLayerVisible(false);
    if (!renderedCgImageUrl) {
      return;
    }

    cgTransitionTimeoutRef.current = window.setTimeout(() => {
      setRenderedCgImageUrl('');
      cgTransitionTimeoutRef.current = null;
    }, CG_TRANSITION_MS);
  }, [activeCgImageUrl, renderedCgImageUrl]);
  
    const resolveClosestScene = useCallback(
    (requestedLocation: string) => {
      if (!activeScenario || activeScenario.scenes.length === 0) {
        return null;
      }

      return findExactSceneLocationMatch(requestedLocation, activeScenario.scenes);
    },
    [activeScenario],
  );

  const performLocationTransition = useCallback(
    (sceneId: string) => {
      if (!activeScenario) {
        return;
      }

      const runTransition = (nextSceneId: string) => {
        const targetScene = activeScenario.scenes.find((scene) => scene.id === nextSceneId);
        if (!targetScene) {
          return;
        }

        if (targetScene.id === currentSceneIdRef.current) {
          return;
        }

        if (locationTransitionInProgressRef.current) {
          queuedSceneIdRef.current = targetScene.id;
          return;
        }

        locationTransitionInProgressRef.current = true;
        setLocationFadeOpacity(1);

        if (fadeOutTimeoutRef.current !== null) {
          window.clearTimeout(fadeOutTimeoutRef.current);
          fadeOutTimeoutRef.current = null;
        }
        if (fadeInTimeoutRef.current !== null) {
          window.clearTimeout(fadeInTimeoutRef.current);
          fadeInTimeoutRef.current = null;
        }

        fadeOutTimeoutRef.current = window.setTimeout(() => {
          setActiveCgName('');
          setCurrentSceneId(targetScene.id);
          setCurrentBackgroundUrl(targetScene.backgroundDataUrl);
          setCurrentBgmUrl(targetScene.bgmDataUrl || '');
          setCurrentAmbientNoiseUrl(resolveSceneAmbientNoiseUrl(targetScene));
          setCurrentAmbientNoiseMuffled(targetScene.ambientNoiseMuffled === true);
          setHasCharacterSpoken(false);
          setHideCharacterUntilNextQuote(true);
          setLocationFadeOpacity(0);

          fadeInTimeoutRef.current = window.setTimeout(() => {
            locationTransitionInProgressRef.current = false;
            const queued = queuedSceneIdRef.current;
            queuedSceneIdRef.current = null;

            if (queued && queued !== targetScene.id) {
              runTransition(queued);
            }
          }, LOCATION_FADE_HALF_MS);
        }, LOCATION_FADE_HALF_MS);
      };

      runTransition(sceneId);
    },
    [activeScenario],
  );

  const handleLocationCue = useCallback(
    (requestedLocation: string) => {
      const closestScene = resolveClosestScene(requestedLocation);
      if (!closestScene) {
        return;
      }

      if (closestScene.id === currentSceneIdRef.current) {
        return;
      }

      performLocationTransition(closestScene.id);
    },
    [performLocationTransition, resolveClosestScene],
  );

  const shouldShowLoader =
    mode === 'waiting-reply' ||
    (mode === 'streaming' && !currentStreamingPage && (!visibleStreamingPage || streamingAdvancePending));

  useLayoutEffect(() => {
    if (shouldShowLoader) {
      return;
    }

    const previousPage = previousPageRef.current;
    const isStreamingExtension =
      previousPage &&
      mode === 'streaming' &&
      previousPage.mode === 'streaming' &&
      previousPage.tone === dialoguePageForView.tone &&
      dialoguePageForView.text.startsWith(previousPage.text);

    const isSamePage =
      previousPage &&
      previousPage.mode === mode &&
      previousPage.signature === dialoguePageSignature;

    const isStreamingFinalizeCarryover =
      previousPage &&
      previousPage.mode === 'streaming' &&
      mode === 'assistant-pages' &&
      previousPage.signature === dialoguePageSignature;

    const isAssistantToPlayerInputCarryover =
      previousPage &&
      previousPage.mode === 'assistant-pages' &&
      mode === 'player-input' &&
      previousPage.signature === dialoguePageSignature;

    if (
      !isStreamingExtension &&
      !isSamePage &&
      !isStreamingFinalizeCarryover &&
      !isAssistantToPlayerInputCarryover
    ) {
      setRevealedChars(0);
    }

    previousPageRef.current = {
      mode,
      tone: dialoguePageForView.tone,
      text: dialoguePageForView.text,
      signature: dialoguePageSignature,
    };
  }, [dialoguePageForView.text, dialoguePageForView.tone, dialoguePageSignature, mode, shouldShowLoader]);

  useEffect(() => {
    if (shouldShowLoader) {
      return;
    }

    const fullText = dialoguePageForView.text;
    if (!fullText) {
      return;
    }

    if (revealedChars >= fullText.length) {
      return;
    }

    const timer = window.setTimeout(() => {
      setRevealedChars((current) => Math.min(current + 1, fullText.length));
    }, getTextRevealDelayMs(gameplaySettings.textSpeed));

    return () => window.clearTimeout(timer);
  }, [
    dialoguePageForView.text,
    gameplaySettings.textSpeed,
    mode,
    revealedChars,
    shouldShowLoader,
  ]);

  const dialogueTextForView = rawDialogueTextForView;
  const shouldPlayDialogueBlip =
    Boolean(activeDialogueBlipUrl) &&
    shouldAnimateSpeakingVisuals;

  useEffect(() => {
    let audio = dialogueBlipAudioRef.current;
    if (!audio) {
      audio = new Audio();
      audio.loop = true;
      dialogueBlipAudioRef.current = audio;
    }

    if (!shouldPlayDialogueBlip || !activeDialogueBlipUrl) {
      loadedDialogueBlipRef.current = '';
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
      return;
    }

    if (loadedDialogueBlipRef.current !== activeDialogueBlipUrl) {
      loadedDialogueBlipRef.current = activeDialogueBlipUrl;
      audio.src = activeDialogueBlipUrl;
      audio.currentTime = 0;
    }

    audio.volume = gameplaySettings.blipVolume / 100;
    audio.playbackRate = gameplaySettings.blipSpeed / 100;

    const playResult = audio.play();
    if (playResult instanceof Promise) {
      playResult.catch(() => undefined);
    }
  }, [activeDialogueBlipUrl, gameplaySettings.blipSpeed, gameplaySettings.blipVolume, shouldPlayDialogueBlip]);

  useEffect(() => {
    if (!isCharacterTurn) {
      return;
    }

    const pageKey =
      mode === 'streaming'
        ? `stream:${streamPageIndex}`
        : mode === 'assistant-pages' || mode === 'replay'
          ? `${mode}:${dialoguePageSignature}`
          : 'none';
    const cues = dialoguePageForView.locationCues || [];

    for (let cueIndex = 0; cueIndex < cues.length; cueIndex += 1) {
      const cue = cues[cueIndex];
      if (cue.at > revealedChars) {
        continue;
      }

      const signature = `${pageKey}:${cueIndex}:${cue.location}`;
      if (processedLocationCueRef.current.has(signature)) {
        continue;
      }

      processedLocationCueRef.current.add(signature);
      handleLocationCue(cue.location);
    }
  }, [
    dialoguePageForView,
    dialoguePageSignature,
    handleLocationCue,
    isCharacterTurn,
    mode,
    revealedChars,
    streamPageIndex,
  ]);

  useEffect(() => {
    if (!isCharacterTurn) {
      return;
    }

    const availableCgs = activeStudioCharacter?.cgs || [];
    if (availableCgs.length === 0 || !latestVisibleNonNullSituationCue) {
      return;
    }

    const signature = `${currentCgSourceKey}:${latestVisibleNonNullSituationCue.signature}`;
    if (processedLocationCueRef.current.has(`cg:${signature}`)) {
      return;
    }

    const normalizedCueTag = normalizeExpressionKey(latestVisibleNonNullSituationCue.tag);
    if (normalizedCueTag === 'NULL') {
      processedLocationCueRef.current.add(`cg:${signature}`);
      return;
    }

    const matchedCg =
      findExactTriggerMatch(latestVisibleNonNullSituationCue.tag, availableCgs) ||
      findBestTriggerMatch(latestVisibleNonNullSituationCue.tag, availableCgs, 0.96);
    if (!matchedCg) {
      return;
    }

    processedLocationCueRef.current.add(`cg:${signature}`);
    const currentVariantForCg = activeCgName === matchedCg.name ? selectedCgImageUrl : '';
    const nextCgVariant = pickNextAssetVariant(matchedCg.images, currentVariantForCg);
    setActiveCgName(matchedCg.name);
    setSelectedCgImageUrl(nextCgVariant);
  }, [
    activeCgName,
    activeStudioCharacter,
    currentCgSourceKey,
    isCharacterTurn,
    latestVisibleNonNullSituationCue,
    selectedCgImageUrl,
  ]);

  useEffect(() => {
    const pageKey =
      mode === 'streaming'
        ? `stream:${streamPageIndex}`
        : mode === 'assistant-pages' || mode === 'replay'
          ? `${mode}:${dialoguePageIndex}`
          : 'none';
    const shouldBounce = shouldAnimateSpeakingVisuals;

    if (!shouldBounce) {
      setCharacterBouncing(false);
      return;
    }

    const signature = `${mode}:${pageKey}:${dialoguePageForView.tone}`;
    if (signature === lastBounceSignatureRef.current) {
      return;
    }

    lastBounceSignatureRef.current = signature;
    setCharacterBouncing(false);

    const frameId = window.requestAnimationFrame(() => {
      setCharacterBouncing(true);
    });

    if (bounceTimeoutRef.current !== null) {
      window.clearTimeout(bounceTimeoutRef.current);
    }

    bounceTimeoutRef.current = window.setTimeout(() => {
      setCharacterBouncing(false);
      bounceTimeoutRef.current = null;
    }, 380);

    return () => window.cancelAnimationFrame(frameId);
  }, [
    dialoguePageForView.tone,
    dialoguePageIndex,
    shouldAnimateSpeakingVisuals,
    mode,
    streamPageIndex,
  ]);

  const handleContinue = useCallback(() => {
    if (pauseOpen || mapOpen || settingsOpen) {
      return;
    }

    if (!isTextFullyRevealed) {
      setRevealedChars(dialoguePageForView.text.length);
      return;
    }

    if (mode === 'streaming') {
      if (!currentStreamingPage) {
        return;
      }

      setStreamPageIndex((index) => {
        const nextIndex = Math.min(index + 1, liveStreamingPages.length);
        setStreamingAdvancePending(nextIndex >= liveStreamingPages.length);
        streamPageIndexRef.current = nextIndex;
        return nextIndex;
      });
      return;
    }

    if (mode === 'assistant-pages') {
      const isLastPage = dialoguePageIndex >= dialoguePages.length - 1;
      if (isLastPage) {
        setMode('player-input');
        return;
      }

      let nextIndex = dialoguePageIndex + 1;
      const currentPage = dialoguePages[dialoguePageIndex];
      const currentPageSignature = getDialoguePageSignature(currentPage);
      while (
        nextIndex < dialoguePages.length &&
        getDialoguePageSignature(dialoguePages[nextIndex]) === currentPageSignature
      ) {
        nextIndex += 1;
      }

      if (nextIndex >= dialoguePages.length) {
        setMode('player-input');
        return;
      }

      setDialoguePageIndex(nextIndex);
      return;
    }

    if (mode === 'replay') {
      if (replayMessageIndex >= replayMessagesRef.current.length) {
        return;
      }

      const isLastPage = dialoguePageIndex >= dialoguePages.length - 1;
      if (!isLastPage) {
        let nextIndex = dialoguePageIndex + 1;
        const currentPage = dialoguePages[dialoguePageIndex];
        const currentPageSignature = getDialoguePageSignature(currentPage);
        while (
          nextIndex < dialoguePages.length &&
          getDialoguePageSignature(dialoguePages[nextIndex]) === currentPageSignature
        ) {
          nextIndex += 1;
        }

        if (nextIndex < dialoguePages.length) {
          setDialoguePageIndex(nextIndex);
        }
        return;
      }

      const nextMessageIndex = replayMessageIndex + 1;
      const nextMessage = replayMessagesRef.current[nextMessageIndex];
      if (!nextMessage) {
        setReplayMessageIndex(replayMessagesRef.current.length);
        setDialogueSpeaker('System');
        setDialoguePages(splitNeutralDialoguePages('Replay complete.', 'neutral'));
        setDialoguePageIndex(0);
        return;
      }

      setReplayMessageIndex(nextMessageIndex);
      showReplayMessage(nextMessage, replaySpeakerNameRef.current);
      return;
    }

    if (mode === 'user-echo') {
      if (pendingErrorRef.current) {
        const message = pendingErrorRef.current;
        pendingErrorRef.current = null;
        setDialogueSpeaker('System');
        setDialoguePages(splitNeutralDialoguePages(`Generation failed: ${message}`, 'neutral'));
        setDialoguePageIndex(0);
        setMode('assistant-pages');
        return;
      }

      if (pendingFinalResultRef.current) {
        const pending = pendingFinalResultRef.current;
        pendingFinalResultRef.current = null;
        if (pending.continueTurn) {
          applyAssistantContinuationResult(pending.text, pending.model, pending.responseMs);
          return;
        }
        applyAssistantResult(pending.text, pending.model, pending.responseMs);
        return;
      }

      if (pendingGenerationStartedRef.current) {
        setMode('streaming');
        return;
      }

      setMode('waiting-reply');
    }
  }, [
    applyAssistantResult,
    applyAssistantContinuationResult,
    dialoguePageForView.text.length,
    dialoguePageForView.text,
    dialoguePageIndex,
    dialoguePages,
    isTextFullyRevealed,
    liveStreamingPages.length,
    currentStreamingPage,
    mode,
    mapOpen,
    pauseOpen,
    replayMessageIndex,
    settingsOpen,
    showReplayMessage,
    streamPageIndex,
  ]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (screen !== 'game') {
        return;
      }

      if (event.key === 'Escape') {
        event.preventDefault();
        if (logsOpen) {
          setLogsOpen(false);
          return;
        }
        if (settingsOpen) {
          setSettingsOpen(false);
          return;
        }
        if (mapOpen) {
          setMapOpen(false);
          return;
        }
        setPauseOpen((open) => !open);
        return;
      }

      if (pauseOpen || mapOpen || settingsOpen) {
        return;
      }

      const target = event.target as HTMLElement | null;
      const typingTarget =
        target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);

      if (typingTarget) {
        return;
      }

      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        handleContinue();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleContinue, logsOpen, mapOpen, pauseOpen, screen, settingsOpen]);

  const handleStartOver = useCallback(() => {
    void (async () => {
      if (!activeScenarioId || !activeRunId) {
        resetForNewSession();
        return;
      }

      await beginScreenLoadFade();

      try {
        const activeRun = runs.find((entry) => entry.id === activeRunId);
        const context = getScenarioContext(activeScenarioId, activeRun?.startingPointId);
        const startMessage = (context.startingPoint?.startMessage || context.scenario.startMessage || '').trim();
        const specialInstructions = (
          context.startingPoint?.specialInstructions ||
          context.scenario.specialInstructions ||
          ''
        ).trim();
        const session = await startStorySession({
          characterName: context.card.name,
          avatarUrl: context.card.avatar,
          firstMes: startMessage,
          cgNames: context.studioCharacter.cgs.flatMap((cg) => getEntityTriggerNames(cg)),
          locationNames: context.scenario.scenes.map((scene) => scene.name),
          specialInstructions,
          roleplayLanguagePreference: interfaceSettings.roleplayLanguagePreference,
        });
        const openingText = (session.firstMes || startMessage || '').trim();
        const initialMessages: ConversationMessage[] = openingText
          ? [{ role: 'assistant', content: openingText }]
          : [];

        const updated = await updateScenarioRunMessages(activeRunId, initialMessages, context.startScene?.id || undefined);
        setRuns((current) =>
          current.map((entry) => (entry.id === updated.id ? updated : entry)),
        );

        resetForNewSession();
        await waitForNextPaint();
        setStorySessionId(session.sessionId);
        applySceneState(context.startScene);
        applyOpeningMessage(openingText, context.studioCharacter.name || context.card.name);
      } catch (error) {
        endScreenLoadFade();
        resetForNewSession();
        setDialogueSpeaker('System');
        setDialoguePages(
          splitNeutralDialoguePages(
            `Start over failed: ${error instanceof Error ? error.message : 'Could not create a new SillyTavern chat.'}`,
            'neutral',
          ),
        );
        setDialoguePageIndex(0);
        setMode('assistant-pages');
        return;
      }

      endScreenLoadFade();
    })();
  }, [
    activeRunId,
    activeScenarioId,
    applyOpeningMessage,
    beginScreenLoadFade,
    endScreenLoadFade,
    interfaceSettings.roleplayLanguagePreference,
    resetForNewSession,
    runs,
    scenarios,
    stCards,
    studioCharacters,
  ]);

  const handleReturnToMenu = useCallback(() => {
    setPauseOpen(false);
    setMapOpen(false);
    setSettingsOpen(false);
    setLogsOpen(false);
    setScreen('menu');
    resetForNewSession();
  }, [resetForNewSession]);

  const handleQuit = useCallback(async () => {
    setQuitHint(null);

    if (shutdownEnabled) {
      await requestShutdown().catch(() => undefined);
    }

    window.open('', '_self');
    window.close();

    window.setTimeout(() => {
      setQuitHint('Browser blocked automatic tab close. You can close this tab manually.');
    }, 250);
  }, [shutdownEnabled]);

  const showInput = mode === 'player-input' && !pauseOpen && !mapOpen && !settingsOpen;
  const showGenerationStopButton =
    !pauseOpen && !mapOpen && !settingsOpen && (mode === 'user-echo' || mode === 'waiting-reply' || mode === 'streaming');
  const streamingCanAdvance = mode === 'streaming' && isStreamingPageReady;
  const replayCanAdvance = mode === 'replay' && replayMessageIndex < replayMessagesRef.current.length;
  const canAdvance =
    !pauseOpen &&
    !mapOpen &&
    !settingsOpen &&
    (mode === 'assistant-pages' || mode === 'user-echo' || streamingCanAdvance || replayCanAdvance);
  const showContinueHint = canAdvance && isTextFullyRevealed;
  const isReadingTagPrefix = mode === 'streaming' && !isStreamingPageReady && streamText.trimStart().startsWith('[');
  const dialogueShouldShowLoader = shouldShowLoader || isReadingTagPrefix;
  const shouldShowCharacter = !hideCharacterUntilNextQuote && (hasCharacterSpoken || isCharacterSpeakingDialogue);
  const shouldEnableInteractiveZones = showInput && !isCgStageActive && activeSpriteZones.length > 0;
  const shouldShowInteractiveZoneVisuals =
    shouldEnableInteractiveZones && !gameplaySettings.hideInteractiveZoneTriggers;
  const canResetCharacterPosition = portraitDistance !== 'normal';
  const characterStageClassName = `character-stage position-${portraitPosition}`;
  const characterDistanceClassName = `character-portrait-distance distance-${portraitDistance}`;
  const cgStageClassName = ['cg-stage', isCgLayerVisible ? 'is-visible' : ''].filter(Boolean).join(' ');
  const isBackgroundZoomBlurred =
    gameplaySettings.closeBlurStrength > 0 && (portraitDistance === 'close' || portraitDistance === 'closer');
  // Temporary gameplay-only presentation toggle. Keep this isolated so it is easy to remove later.
  const debugModeEnabled = gameplaySettings.debugMode && screen === 'game';
  const shouldUseDebugModeGameplayView = debugModeEnabled && !pauseOpen && !mapOpen && !settingsOpen;
  const dialogueBoxVisible = shouldUseDebugModeGameplayView || !dialogueBoxHidden;
  const dialogueMessageLog = conversation.map((entry) => ({
    role: entry.role,
    speaker: entry.role === 'user' ? 'You' : assistantDisplayName,
    content: entry.content,
  }));
  const characterPortraitClassName = [
    'character-portrait',
    characterBouncing ? 'speaking-bounce' : '',
    shouldShowCharacter ? '' : 'is-hidden',
    shouldShowCharacter && isCgLayerVisible ? 'is-faded-for-cg' : '',
  ]
    .filter(Boolean)
    .join(' ');
  const characterPortraitShellClassName = [
    'character-portrait-shell',
    mouthLayerVisible && characterSpriteAnimationFrameUrls.openMouth ? 'is-mouth-replaced' : '',
  ]
    .filter(Boolean)
    .join(' ');
  const characterPortraitAnimationClassName = [
    'character-portrait-animation-layer',
    'character-portrait-mouth-layer',
    characterBouncing ? 'speaking-bounce' : '',
    shouldShowCharacter ? '' : 'is-hidden',
    shouldShowCharacter && isCgLayerVisible ? 'is-faded-for-cg' : '',
  ]
    .filter(Boolean)
    .join(' ');

  useEffect(() => {
    if (!showInput || pauseOpen || mapOpen || settingsOpen || screen !== 'game') {
      setLogsOpen(false);
    }
  }, [mapOpen, pauseOpen, screen, settingsOpen, showInput]);

  if (screen === 'menu') {
    return (
      <>
        <MenuSkeleton loading={menuLoading}>
          <MainMenu
            stCards={stCards}
            characters={studioCharacters}
            scenarios={scenarios}
            runs={runs}
            packages={packages}
            artStylePresets={artStylePresets}
            sillyTavernConnection={sillyTavernConnection}
            gameplaySettings={gameplaySettings}
            interfaceSettings={interfaceSettings}
            loading={menuLoading}
            error={menuError}
            onUpdateSillyTavernConnection={handleUpdateSillyTavernConnection}
            onRefreshSillyTavernCards={handleRefreshSillyTavernCards}
            onGameplaySettingsChange={setGameplaySettings}
            onInterfaceSettingsChange={setInterfaceSettings}
            onArtStylePresetsChange={handleUpdateArtStylePresets}
            onSaveCharacter={handleSaveCharacter}
            onDeleteCharacter={handleDeleteCharacter}
            onSaveScenario={handleSaveScenario}
            onDeleteScenario={handleDeleteScenario}
            onStartRun={handleStartRun}
            onResumeRun={handleResumeRun}
            onReplayRun={handleReplayRun}
            onDeleteRun={handleDeleteRun}
            onCreatePackage={handleCreatePackage}
            onImportPackage={handleImportPackage}
            onRevealPackage={handleRevealPackage}
            onDeletePackage={handleDeletePackage}
          />
        </MenuSkeleton>
        <TooltipLayer />
        <div
          className={`screen-load-fade-overlay ${screenLoadFadeOpacity > 0 ? 'is-visible' : ''}`.trim()}
          style={{ opacity: screenLoadFadeOpacity, pointerEvents: screenLoadFadeOpacity > 0 ? 'auto' : 'none' }}
          aria-hidden="true"
        >
          <div className="screen-load-loader" role="status" aria-live="polite">
            <span className="screen-load-spinner" aria-hidden="true" />
            <span>Loading...</span>
          </div>
        </div>
        {startupLogoVisible ? (
          <div className="startup-logo-splash" aria-hidden="true">
            <div className="pettangatari-logo startup-logo-wordmark">Pettangatari</div>
          </div>
        ) : null}
      </>
    );
  }

  return (
    <>
      <main
        ref={vnScreenRef}
        className="vn-screen"
        style={
          {
            '--bg-dim-opacity': `${Math.min(0.86, Math.min(100, Math.max(0, gameplaySettings.backgroundDimming)) / 100)}`,
            '--bg-close-blur-amount': `${Math.round((Math.min(100, Math.max(0, gameplaySettings.closeBlurStrength)) / 100) * 15)}px`,
            '--bg-close-blur-scale': `${1 + (Math.min(100, Math.max(0, gameplaySettings.closeBlurStrength)) / 100) * 0.09}`,
            backgroundColor: shouldUseDebugModeGameplayView ? '#000' : undefined,
          } as CSSProperties
        }
      >
        {!shouldUseDebugModeGameplayView ? (
          <>
            {currentBackgroundUrl && currentBackgroundDepthMapUrl && gameplaySettings.parallaxEnabled ? (
              <DepthParallaxImage
                imageSrc={currentBackgroundUrl}
                depthSrc={currentBackgroundDepthMapUrl}
                alt=""
                className={`vn-background-layer vn-depth-background-layer ${isBackgroundZoomBlurred ? 'is-zoom-blur' : ''}`}
                fit="cover"
                settings={{ strength: 20, focus: 100, edgeFill: 0, smearGuard: 15, quality: 'clean' }}
                pointerMode="mouse"
                useWindowPointer
                strengthScale={gameplaySettings.sceneParallaxStrength / 100}
                autoMotionSpeed={gameplaySettings.sceneDepthMotionSpeed}
                autoMotionPauseMs={1200}
                alphaMode="opaque"
                disabled={!gameplaySettings.parallaxEnabled}
              />
            ) : (
              <div
                className={`vn-background-layer ${isBackgroundZoomBlurred ? 'is-zoom-blur' : ''}`}
                style={currentBackgroundUrl ? { backgroundImage: `url(${currentBackgroundUrl})` } : undefined}
                aria-hidden="true"
              />
            )}
            <div className="vn-atmosphere" aria-hidden="true">
              <div className="vn-atmosphere-glow" />
              <div className="vn-atmosphere-vignette" />
              <div className="vn-atmosphere-grain" />
            </div>
            {gameplaySettings.weatherEffectsEnabled ? <WeatherEffects preset={currentScene?.weatherPreset} /> : null}

      <header className="vn-topbar">
        <div className="vn-title-block">
          <strong>{activeScenario?.name || 'Untitled session'}</strong>
          <span>{currentScene?.name || 'No active scene'}</span>
          <div className="vn-title-actions">
            <button
              className="map-button icon-button"
              type="button"
              onClick={() => {
                setSettingsOpen(false);
                setMapOpen(true);
              }}
              disabled={!activeScenario}
              aria-label="Open scenario map"
              data-tooltip="Open scenario map"
            >
              <img src={mapIcon} alt="" aria-hidden="true" className="ui-icon" />
            </button>
            <button
              type="button"
              className={`icon-button ${debugInfoVisible ? 'is-active' : ''}`.trim()}
              onClick={() => setDebugInfoVisible((current) => !current)}
              aria-pressed={debugInfoVisible}
              aria-label="Debug info"
              data-tooltip="Debug info"
              data-tooltip-placement="bottom"
            >
              <img src={debugIcon} alt="" aria-hidden="true" className="ui-icon" />
            </button>
          </div>
          {debugInfoVisible ? (
            <DebugOverlay
              responseMs={lastResponseMs}
              model={lastModel}
              mainApi={runtime.mainApi}
              source={runtime.chatCompletionSource}
              streamEnabled={streamEnabled}
            />
          ) : null}
        </div>

        <div className="vn-topbar-actions">
          <button
            className="icon-button"
            type="button"
            onClick={() => {
              setMapOpen(false);
              setPauseOpen(false);
              setSettingsOpen(true);
            }}
            aria-label="Settings"
            data-tooltip="Settings"
            data-tooltip-placement="bottom"
          >
            <img src={settingsIcon} alt="" aria-hidden="true" className="ui-icon" />
          </button>
          <button
            className="pause-button icon-button"
            type="button"
            onClick={() => {
              setSettingsOpen(false);
              setPauseOpen(true);
            }}
            aria-label="Open menu"
            data-tooltip="Open menu"
            data-tooltip-placement="bottom"
          >
            <img src={menuIcon} alt="" aria-hidden="true" className="ui-icon" />
          </button>
        </div>
      </header>

      {affinityNotice ? (
        <div key={affinityNotice.id} className="affinity-change-notice" aria-live="polite">
          {affinityNotice.text}
        </div>
      ) : null}

      <div className={characterStageClassName} aria-label="Character stage">
        {isCgStageActive ? (
          <div className={cgStageClassName} aria-label="Current CG">
            <img src={renderedCgImageUrl} className="cg-image" alt="Current CG" />
          </div>
        ) : null}
        <div className="character-stage-floor" aria-hidden="true" />
        <div className="character-parallax-layer">
          <div className="character-portrait-track">
            <div className={characterDistanceClassName}>
              <div
                className={`character-idle-float ${
                  gameplaySettings.idleAnimationEnabled && !characterSpriteDepthMapUrl ? '' : 'is-disabled'
                }`.trim()}
              >
                <div className={characterPortraitShellClassName} style={characterBloomStyle}>
                  {characterSpriteDepthMapUrl && gameplaySettings.parallaxEnabled ? (
                    <DepthParallaxImage
                      imageSrc={characterSpriteUrl}
                      depthSrc={characterSpriteDepthMapUrl}
                      className={characterPortraitClassName}
                      alt="Character"
                      fit="contain"
                      settings={{ strength: 10, focus: 100, edgeFill: 0, smearGuard: 40, quality: 'clean' }}
                      pointerMode="circle"
                      strengthScale={gameplaySettings.spriteParallaxStrength / 100}
                      alphaMode="preserve"
                      alphaPaddingIterations={12}
                      disabled={!gameplaySettings.idleAnimationEnabled}
                      syncAutoMotion
                      motionRef={characterDepthMotionRef}
                    />
                  ) : (
                    <img
                      src={characterSpriteUrl}
                      className={characterPortraitClassName}
                      alt="Character"
                    />
                  )}
                  {characterSpriteAnimationFrameUrls.openMouth ? (
                    characterSpriteDepthMapUrl && gameplaySettings.parallaxEnabled ? (
                      <DepthParallaxImage
                        imageSrc={characterSpriteAnimationFrameUrls.openMouth}
                        layoutReferenceSrc={characterSpriteUrl}
                        depthSrc={characterSpriteDepthMapUrl}
                        className={`${characterPortraitAnimationClassName} ${mouthLayerVisible ? 'is-visible' : ''}`.trim()}
                        alt="Character mouth animation"
                        fit="contain"
                        settings={{ strength: 10, focus: 100, edgeFill: 0, smearGuard: 40, quality: 'clean' }}
                        pointerMode="circle"
                        strengthScale={gameplaySettings.spriteParallaxStrength / 100}
                        alphaMode="preserve"
                        alphaPaddingIterations={12}
                        disabled={!gameplaySettings.idleAnimationEnabled}
                        syncAutoMotion
                        motionRef={characterDepthMotionRef}
                      />
                    ) : (
                      <BlackTransparentImage
                        src={characterSpriteAnimationFrameUrls.openMouth}
                        className={characterPortraitAnimationClassName}
                        visible={mouthLayerVisible}
                      />
                    )
                  ) : null}
                  {shouldEnableInteractiveZones ? (
                    <div
                      className={`character-interactive-zones ${shouldShowInteractiveZoneVisuals ? '' : 'is-hidden-triggers'}`.trim()}
                      aria-label="Interactive character zones"
                    >
                      {activeSpriteZones.map((zone) => (
                        <button
                          key={zone.id}
                          type="button"
                          className="character-interactive-zone"
                          style={{
                            left: `${zone.x * 100}%`,
                            top: `${zone.y * 100}%`,
                            width: `${zone.width * 100}%`,
                            height: `${zone.height * 100}%`,
                          }}
                          aria-label={zone.prompt.trim() || 'Interactive zone'}
                          data-tooltip={shouldShowInteractiveZoneVisuals ? zone.prompt.trim() || 'Interactive zone' : undefined}
                          onClick={(event) => {
                            event.stopPropagation();
                            submitPlayerInputText(zone.prompt);
                          }}
                        />
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {isCgStageActive ? (
        <button
          type="button"
          className="action-button pause-action-button cg-close-button"
          aria-label="Close CG"
          onClick={(event) => {
            event.stopPropagation();
            setDismissedCgCueSignature(currentCgCueSignature || '');
            setActiveCgName('');
            setSelectedCgImageUrl('');
          }}
        >
          <img src={closeIcon} alt="" aria-hidden="true" className="ui-icon" />
          <span>Close CG</span>
        </button>
      ) : null}
          </>
        ) : null}

      <section
        className={`vn-lower-ui ${dialogueBoxVisible ? '' : 'is-dialogue-hidden'}`.trim()}
        style={
          dialogueAccentColor
            ? ({ '--dialogue-accent': dialogueAccentColor } as CSSProperties)
            : undefined
        }
      >
        {dialogueBoxVisible ? (
          <div
            className="dialogue-wrapper"
            onClick={canAdvance ? handleContinue : undefined}
            role="button"
            tabIndex={0}
            onKeyDown={(event) => {
              if ((event.key === 'Enter' || event.key === ' ') && canAdvance) {
                event.preventDefault();
                handleContinue();
              }
            }}
          >
            <DialogueBox
              text={displayedDialogueTextForView}
              textTone={dialoguePageForView.tone}
              speakerName={dialogueSpeakerForView}
              accentColor={dialogueAccentColor}
              speakerFontFamily={shouldUseCharacterNameStyle ? characterNameFontFamily : undefined}
              speakerColor={shouldUseCharacterNameStyle ? characterNameColor : undefined}
              quoteFontFamily={effectiveDialogueQuoteFontFamily}
              quoteAnimationPreset={isCharacterSpeakingDialogue ? dialogueQuoteAnimationPreset : 'disabled'}
              quoteAnimationSpeed={dialogueQuoteAnimationSpeed}
              quoteAnimationColor={dialogueQuoteAnimationColor}
              affinityValue={
                !gameplaySettings.hideAffinityChanges && currentSessionAffinity?.enabled
                  ? currentSessionAffinity.value
                  : null
              }
              lustValue={!gameplaySettings.hideLustValue && currentSessionLust?.enabled ? currentSessionLust.value : null}
              isTextFullyRevealed={isTextFullyRevealed}
              allowBoldEmphasis={isCharacterSpeakingDialogue}
              showContinueHint={showContinueHint}
              isWaitingForReply={dialogueShouldShowLoader}
              showStopButton={showGenerationStopButton}
              canAdvance={canAdvance}
              showInput={showInput}
              inputValue={inputValue}
              messageLog={dialogueMessageLog}
              logsOpen={logsOpen}
              onInputChange={setInputValue}
              onLogsToggle={() => setLogsOpen((current) => !current)}
              onLogsClose={() => setLogsOpen(false)}
              onSubmit={submitPlayerInput}
              onStop={handleStopGeneration}
            />
          </div>
        ) : null}
        {!shouldUseDebugModeGameplayView ? (
          <div className="dialogue-side-controls" aria-label="Dialogue controls">
            <button
              type="button"
              className={`dialogue-visibility-toggle icon-button ${dialogueBoxHidden ? 'is-active' : ''}`.trim()}
              onClick={() => {
                setDialogueBoxHidden((current) => {
                  const nextHidden = !current;
                  if (nextHidden) {
                    setLogsOpen(false);
                  }
                  return nextHidden;
                });
              }}
              aria-label={dialogueBoxHidden ? 'Show dialogue box' : 'Hide dialogue box'}
              aria-pressed={dialogueBoxHidden}
              data-tooltip={dialogueBoxHidden ? 'Show dialogue box' : 'Hide dialogue box'}
            >
              <img src={dialogueBoxHidden ? eyeIcon : eyeOffIcon} alt="" aria-hidden="true" className="ui-icon" />
            </button>
            {canResetCharacterPosition ? (
              <button
                type="button"
                className="character-position-reset-button icon-button"
                onClick={() => setPortraitDistance('normal')}
                aria-label="Reset character position"
                data-tooltip="Reset character position"
              >
                <img src={resetPositionIcon} alt="" aria-hidden="true" className="ui-icon" />
              </button>
            ) : null}
          </div>
        ) : null}
      </section>

      <div className="location-fade-overlay" style={{ opacity: locationFadeOpacity }} aria-hidden="true" />
      <div className="screen-entry-fade-overlay" style={{ opacity: entryFadeOpacity }} aria-hidden="true" />
      <div
        className="undo-fade-overlay"
        style={{ opacity: undoFadeOpacity, pointerEvents: undoFadeOpacity > 0 ? 'auto' : 'none' }}
        aria-hidden="true"
      />

      {mapOpen ? (
        <div className="map-overlay" role="dialog" aria-modal="true" aria-label="Scenario map">
          <section className="map-dialog">
            <div className="map-head">
              <div>
                <h2>{activeScenario?.name || 'No active scenario'}</h2>
              </div>
              <button
                type="button"
                className="icon-button"
                onClick={() => setMapOpen(false)}
                aria-label="Close map"
                data-tooltip="Close map"
              >
                <img src={closeIcon} alt="" aria-hidden="true" className="ui-icon" />
              </button>
            </div>

            <div className="map-location-list">
              {(activeScenario?.scenes || []).map((scene) => (
                <article
                  key={scene.id}
                  className={`map-location ${scene.id === currentScene?.id ? 'is-current' : ''}`}
                >
                  <div className="map-location-media">
                    {scene.backgroundDataUrl ? (
                      <img src={scene.backgroundDataUrl} alt={scene.name} className="map-location-image" />
                    ) : (
                      <div className="map-location-image-placeholder">No background image</div>
                    )}
                    {scene.id === currentScene?.id ? <span className="map-current-badge">Current</span> : null}
                  </div>
                  <div className="map-location-title-row">
                    <strong>{scene.name}</strong>
                  </div>
                  <div className="map-trigger-group">
                    <span className="map-trigger-label">Trigger words</span>
                    <div className="map-trigger-list" aria-label={`Trigger words for ${scene.name}`}>
                      {scene.triggerWords.length > 0 ? (
                        scene.triggerWords.map((triggerWord) => <span key={`${scene.id}-${triggerWord}`}>{triggerWord}</span>)
                      ) : (
                        <span>No trigger words</span>
                      )}
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </section>
        </div>
      ) : null}

      <GameplaySettingsMenu
        open={settingsOpen}
        settings={gameplaySettings}
        onClose={() => setSettingsOpen(false)}
        onChange={setGameplaySettings}
      />

        <PauseMenu
          open={pauseOpen}
          onResume={() => setPauseOpen(false)}
          onReturnToMenu={handleReturnToMenu}
          onStartOver={handleStartOver}
          onQuit={handleQuit}
          closeHint={quitHint}
        />
      </main>
      <TooltipLayer />
      <div
        className={`screen-load-fade-overlay ${screenLoadFadeOpacity > 0 ? 'is-visible' : ''}`.trim()}
        style={{ opacity: screenLoadFadeOpacity, pointerEvents: screenLoadFadeOpacity > 0 ? 'auto' : 'none' }}
        aria-hidden="true"
      >
        <div className="screen-load-loader" role="status" aria-live="polite">
          <span className="screen-load-spinner" aria-hidden="true" />
          <span>Loading...</span>
        </div>
      </div>
      {startupLogoVisible ? (
        <div className="startup-logo-splash" aria-hidden="true">
          <div className="pettangatari-logo startup-logo-wordmark">Pettangatari</div>
        </div>
      ) : null}
    </>
  );
}
