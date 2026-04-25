import { access, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { appConfig } from '../config.js';
import {
  DEFAULT_CHARACTER_AUTOMATIC_GENERATION,
  DEFAULT_STUDIO_STATE,
  type AutomaticGenerationArtStylePresetRecord,
  type CharacterAutomaticGenerationRecord,
  type OneShotScenarioUpsertInput,
  SPRITE_EXPRESSIONS,
  type ScenarioPackageRecord,
  type OneShotScenarioRecord,
  type ScenarioRunRecord,
  type ScenarioRunMessage,
  type SceneWeatherPreset,
  type StudioCharacterRecord,
  type SpriteInteractiveZoneRecord,
  type StudioCharacterUpsertInput,
  type StudioStateRecord,
} from './types.js';

const DEFAULT_CHARACTER_ACCENT_COLOR = '#d4d8df';
const MAX_ASSET_VARIANTS = 10;
const CHARACTER_MANIFEST_FILE = 'character.json';
const SCENARIO_MANIFEST_FILE = 'scenario.json';
const ASSET_URL_PREFIX = '/api/studio/assets/';
const ASSET_EXTENSION_BY_MIME: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'audio/mpeg': 'mp3',
  'audio/mp3': 'mp3',
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
  'audio/ogg': 'ogg',
};
const SCENE_WEATHER_PRESETS = new Set<SceneWeatherPreset>([
  'none',
  'rain',
  'thunderstorm',
  'fog',
  'snow',
  'sakura-petals',
  'autumn-leaves',
]);

type FileStoreIndex = {
  version: 1;
  runs: ScenarioRunRecord[];
  packages: ScenarioPackageRecord[];
  artStylePresets: AutomaticGenerationArtStylePresetRecord[];
  migratedFromLegacy?: boolean;
};

let writeQueue: Promise<void> = Promise.resolve();
let initialized = false;

function nowIso(): string {
  return new Date().toISOString();
}

function isString(value: unknown): value is string {
  return typeof value === 'string';
}

function asString(value: unknown): string {
  return isString(value) ? value : '';
}

function normalizeSceneWeatherPreset(value: unknown): SceneWeatherPreset {
  const normalized = asString(value).trim().toLowerCase();
  return SCENE_WEATHER_PRESETS.has(normalized as SceneWeatherPreset) ? (normalized as SceneWeatherPreset) : 'none';
}

function emptyIndex(): FileStoreIndex {
  return { version: 1, runs: [], packages: [], artStylePresets: [] };
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function isPathInsideDirectory(targetPath: string, directoryPath: string): boolean {
  const relative = path.relative(directoryPath, targetPath);
  return Boolean(relative) && !relative.startsWith('..') && !path.isAbsolute(relative);
}

function sanitizePathPart(value: string, fallback = 'asset'): string {
  const normalized = value
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return normalized || fallback;
}

function assetUrlFromPath(filePath: string): string {
  const relativePath = path.relative(appConfig.rootDataPath, filePath).replace(/\\/g, '/');
  return `${ASSET_URL_PREFIX}${relativePath.split('/').map(encodeURIComponent).join('/')}`;
}

function isStoredAssetUrl(value: string): boolean {
  return value.startsWith(ASSET_URL_PREFIX);
}

function dataUrlInfo(value: string): { mime: string; extension: string; buffer: Buffer } | null {
  const match = value.match(/^data:([^;]+);base64,(.+)$/i);
  if (!match) {
    return null;
  }

  const mime = match[1].toLowerCase();
  const extension = ASSET_EXTENSION_BY_MIME[mime];
  if (!extension) {
    return null;
  }

  try {
    return {
      mime,
      extension,
      buffer: Buffer.from(match[2], 'base64'),
    };
  } catch {
    return null;
  }
}

export async function saveUploadedStudioAsset(input: {
  ownerType: 'character' | 'scenario';
  ownerId: string;
  relativePath: string[];
  fileStem: string;
  mimeType: string;
  data: Buffer;
}): Promise<string> {
  await ensureFileStore();

  const ownerId = sanitizePathPart(input.ownerId, 'asset-owner');
  const ownerRoot =
    input.ownerType === 'character'
      ? path.join(appConfig.fileCharactersPath, ownerId)
      : path.join(appConfig.fileScenesPath, ownerId);
  const safeRelativePath = input.relativePath.map((part) => sanitizePathPart(part)).filter(Boolean);
  const assetDirectory = path.join(ownerRoot, ...safeRelativePath);
  if (assetDirectory !== ownerRoot && !isPathInsideDirectory(assetDirectory, ownerRoot)) {
    throw new Error('Invalid asset path.');
  }

  const mimeType = input.mimeType.split(';')[0]?.trim().toLowerCase() || '';
  const extension = ASSET_EXTENSION_BY_MIME[mimeType];
  if (!extension) {
    throw new Error('Unsupported asset type.');
  }

  await mkdir(assetDirectory, { recursive: true });
  const uniqueSuffix = randomUUID().slice(0, 8);
  const fileName = `${sanitizePathPart(input.fileStem)}-${uniqueSuffix}.${extension}`;
  const filePath = path.join(assetDirectory, fileName);
  if (!isPathInsideDirectory(filePath, ownerRoot)) {
    throw new Error('Invalid asset file path.');
  }

  await writeFile(filePath, input.data);
  return assetUrlFromPath(filePath);
}

async function persistAssetReference(
  value: string,
  assetDirectory: string,
  fileStem: string,
): Promise<string> {
  const trimmed = value.trim();
  if (!trimmed) {
    return '';
  }

  if (isStoredAssetUrl(trimmed)) {
    return trimmed;
  }

  const parsed = dataUrlInfo(trimmed);
  if (!parsed) {
    return trimmed;
  }

  await mkdir(assetDirectory, { recursive: true });
  const fileName = `${sanitizePathPart(fileStem)}.${parsed.extension}`;
  const filePath = path.join(assetDirectory, fileName);
  await writeFile(filePath, parsed.buffer);
  return assetUrlFromPath(filePath);
}

async function persistAssetVariants(
  values: string[],
  assetDirectory: string,
  fileStem: string,
): Promise<string[]> {
  const result: string[] = [];
  for (let index = 0; index < values.length && index < MAX_ASSET_VARIANTS; index += 1) {
    const saved = await persistAssetReference(values[index], assetDirectory, `${fileStem}-${index + 1}`);
    if (saved) {
      result.push(saved);
    }
  }
  return result;
}

async function removeLegacyCgSpriteDirectories(characterDirectory: string): Promise<void> {
  const spriteDirectory = path.join(characterDirectory, 'sprites');
  try {
    const entries = await readdir(spriteDirectory, { withFileTypes: true });
    await Promise.all(
      entries
        .filter((entry) => entry.isDirectory() && entry.name.toLowerCase().startsWith('cg-'))
        .map((entry) => rm(path.join(spriteDirectory, entry.name), { recursive: true, force: true })),
    );
  } catch {
    // No sprite directory yet, or a cleanup race. Saving should not fail because of stale asset cleanup.
  }
}

function normalizeAccentColor(value: unknown): string {
  const raw = asString(value).trim();
  return /^#[0-9a-fA-F]{6}$/.test(raw) ? raw.toLowerCase() : DEFAULT_CHARACTER_ACCENT_COLOR;
}

function normalizeBlipSound(value: unknown): string {
  const raw = asString(value).trim();
  return raw && /^[a-zA-Z0-9._-]+$/.test(raw) ? raw : '';
}

function normalizeCustomReactionName(value: unknown): string {
  const raw = asString(value)
    .replace(/[\[\]]/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')
    .toUpperCase();
  return /^[A-Z0-9 _-]{1,40}$/.test(raw) ? raw : '';
}

function normalizeTriggerAliases(value: unknown, fallbackName = ''): string[] {
  const rawValues = Array.isArray(value) ? value : [fallbackName];
  const seen = new Set<string>();
  const result: string[] = [];

  for (const entry of rawValues) {
    const normalized = normalizeCustomReactionName(entry);
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    result.push(normalized);
  }

  return result;
}

function normalizeImageVariants(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((entry) => asString(entry).trim()).filter(Boolean).slice(0, MAX_ASSET_VARIANTS);
  }

  const singleValue = asString(value).trim();
  return singleValue ? [singleValue] : [];
}

function normalizeVariantCount(value: unknown, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fallback;
  }

  return Math.min(Math.max(Math.round(value), 0), MAX_ASSET_VARIANTS);
}

function normalizePreferredCgExpression(value: unknown): CharacterAutomaticGenerationRecord['preferredCgExpression'] {
  const normalized = asString(value).trim().toUpperCase();
  switch (normalized) {
    case 'HAPPY':
    case 'ANNOYED':
    case 'EXPRESSIONLESS':
    case 'CRYING':
    case 'LIGHT_SMILE':
    case 'NAUGHTY_FACE':
    case 'AHEGAO':
      return normalized;
    default:
      return 'ANY';
  }
}

function normalizeLightingColor(value: unknown): CharacterAutomaticGenerationRecord['lightingColor'] {
  const normalized = asString(value).trim().toUpperCase();
  switch (normalized) {
    case 'BLUE':
    case 'RED':
    case 'PURPLE':
    case 'ORANGE':
    case 'YELLOW':
    case 'GREEN':
    case 'PINK':
      return normalized;
    default:
      return 'NEUTRAL';
  }
}

function normalizeBreastSize(value: unknown): CharacterAutomaticGenerationRecord['breastSize'] {
  const normalized = asString(value).trim().toUpperCase();
  switch (normalized) {
    case 'FLAT':
    case 'SMALL':
    case 'LARGE':
    case 'HUGE':
    case 'GIGANTIC':
      return normalized;
    default:
      return 'MEDIUM';
  }
}

function normalizeUnitNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.min(Math.max(value, 0), 1) : fallback;
}

function normalizeLoraStrength(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.min(Math.max(Number(value), -4), 4) : 1;
}

function normalizeAutomaticGenerationSettings(value: unknown): CharacterAutomaticGenerationRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {
      ...DEFAULT_CHARACTER_AUTOMATIC_GENERATION,
      loras: [],
      customExpressions: [],
      cgDefinitions: [],
    };
  }

  const record = value as Record<string, unknown>;
  const loras = (Array.isArray(record.loras) ? record.loras : [])
    .filter((entry): entry is Record<string, unknown> => Boolean(entry && typeof entry === 'object'))
    .map((entry) => ({
      name: asString(entry.name).trim(),
      strength: normalizeLoraStrength(entry.strength),
    }))
    .filter((entry) => entry.name);

  const normalizeExpressionList = (raw: unknown) =>
    (Array.isArray(raw) ? raw : [])
      .filter((entry): entry is Record<string, unknown> => Boolean(entry && typeof entry === 'object'))
      .map((entry) => ({
        enabled: entry.enabled !== false,
        triggerTag: normalizeCustomReactionName(entry.triggerTag),
        prompt: asString(entry.prompt).trim(),
      }))
      .filter((entry) => entry.triggerTag);

  const defaultExpressions = (Array.isArray(record.defaultExpressions) ? record.defaultExpressions : [])
    .filter((entry): entry is Record<string, unknown> => Boolean(entry && typeof entry === 'object'))
    .map((entry) => ({
      enabled: entry.enabled !== false,
      expression: normalizeCustomReactionName(entry.expression),
      prompt: asString(entry.prompt).trim(),
    }))
    .filter((entry) => entry.expression);

  const cgDefinitions = (Array.isArray(record.cgDefinitions) ? record.cgDefinitions : [])
    .filter((entry): entry is Record<string, unknown> => Boolean(entry && typeof entry === 'object'))
    .map((entry) => ({
      enabled: entry.enabled !== false,
      triggerTag: normalizeCustomReactionName(entry.triggerTag),
      prompt: asString(entry.prompt).trim(),
      excludeUpperBodyTags: entry.excludeUpperBodyTags === true,
      excludeWaistTags: entry.excludeWaistTags === true,
      excludeLowerBodyTags: entry.excludeLowerBodyTags === true,
    }))
    .filter((entry) => entry.triggerTag);

  const generatedPromptBySlotRaw =
    record.generatedPromptBySlot && typeof record.generatedPromptBySlot === 'object' && !Array.isArray(record.generatedPromptBySlot)
      ? (record.generatedPromptBySlot as Record<string, unknown>)
      : {};
  const generatedPromptBySlot = Object.fromEntries(
    Object.entries(generatedPromptBySlotRaw)
      .map(([slotKey, prompt]) => [slotKey.trim(), asString(prompt).trim()] as const)
      .filter(([slotKey, prompt]) => slotKey && prompt),
  );
  const resumeStateRaw =
    record.resumeState && typeof record.resumeState === 'object' && !Array.isArray(record.resumeState)
      ? (record.resumeState as Record<string, unknown>)
      : null;
  const parsedResumeMode: 'replace' | 'append' | null =
    resumeStateRaw?.mode === 'replace' || resumeStateRaw?.mode === 'append' ? resumeStateRaw.mode : null;
  const appendBaseIndexByAsset =
    resumeStateRaw &&
    resumeStateRaw.appendBaseIndexByAsset &&
    typeof resumeStateRaw.appendBaseIndexByAsset === 'object' &&
    !Array.isArray(resumeStateRaw.appendBaseIndexByAsset)
      ? Object.fromEntries(
          Object.entries(resumeStateRaw.appendBaseIndexByAsset as Record<string, unknown>)
            .map(([assetKey, index]) => [
              assetKey.trim(),
              typeof index === 'number' && Number.isFinite(index) ? Math.max(0, Math.round(index)) : -1,
            ] as const)
            .filter(([assetKey, index]) => assetKey && index >= 0),
        )
      : {};
  const resumeState =
    resumeStateRaw &&
    parsedResumeMode &&
    typeof resumeStateRaw.nextTaskIndex === 'number' &&
    Number.isFinite(resumeStateRaw.nextTaskIndex) &&
    typeof resumeStateRaw.totalTasks === 'number' &&
    Number.isFinite(resumeStateRaw.totalTasks) &&
    typeof resumeStateRaw.taskSignature === 'string' &&
    resumeStateRaw.taskSignature.trim()
      ? {
          mode: parsedResumeMode,
          nextTaskIndex: Math.max(0, Math.round(resumeStateRaw.nextTaskIndex)),
          totalTasks: Math.max(0, Math.round(resumeStateRaw.totalTasks)),
          taskSignature: resumeStateRaw.taskSignature.trim(),
          appendBaseIndexByAsset,
          updatedAt: asString(resumeStateRaw.updatedAt).trim() || new Date().toISOString(),
        }
      : null;

  return {
    checkpoint: asString(record.checkpoint).trim(),
    upscaleModel: asString(record.upscaleModel).trim(),
    loras,
    basePrompt: asString(record.basePrompt).trim(),
    negativePrompt: asString(record.negativePrompt).trim(),
    artStylePrompt: asString(record.artStylePrompt).trim(),
    artStylePresets: (Array.isArray(record.artStylePresets) ? record.artStylePresets : [])
      .filter((entry): entry is Record<string, unknown> => Boolean(entry && typeof entry === 'object'))
      .map((entry) => ({
        id: asString(entry.id).trim() || randomUUID(),
        name: asString(entry.name).trim().slice(0, 60),
        prompt: asString(entry.prompt).trim(),
        checkpoint: asString(entry.checkpoint).trim(),
        loras: (Array.isArray(entry.loras) ? entry.loras : [])
          .filter((lora): lora is Record<string, unknown> => Boolean(lora && typeof lora === 'object'))
          .map((lora) => ({
            name: asString(lora.name).trim(),
            strength:
              typeof lora.strength === 'number' && Number.isFinite(lora.strength)
                ? Math.min(Math.max(lora.strength, -4), 4)
                : 1,
          }))
          .filter((lora) => lora.name),
        thumbnailDataUrl:
          typeof entry.thumbnailDataUrl === 'string' && entry.thumbnailDataUrl.startsWith('data:image/')
            ? entry.thumbnailDataUrl
            : undefined,
      }))
      .filter((entry) => entry.name && entry.prompt),
    characterMainTags: asString(record.characterMainTags).trim(),
    upperBodyTags: asString(record.upperBodyTags).trim(),
    waistTags: asString(record.waistTags).trim(),
    openMouthTags: asString(record.openMouthTags).trim(),
    lowerBodyTags: asString(record.lowerBodyTags).trim(),
    expressionVariantCount: normalizeVariantCount(
      record.expressionVariantCount,
      DEFAULT_CHARACTER_AUTOMATIC_GENERATION.expressionVariantCount,
    ),
    cgVariantCount: normalizeVariantCount(record.cgVariantCount, DEFAULT_CHARACTER_AUTOMATIC_GENERATION.cgVariantCount),
    steps:
      typeof record.steps === 'number' && Number.isFinite(record.steps)
        ? Math.min(Math.max(Math.round(record.steps), 1), 150)
        : DEFAULT_CHARACTER_AUTOMATIC_GENERATION.steps,
    preferredPenetrationExpression: normalizePreferredCgExpression(
      record.preferredPenetrationExpression ?? record.preferredCgExpression,
    ),
    preferredCgExpression: Object.prototype.hasOwnProperty.call(record, 'preferredPenetrationExpression')
      ? normalizePreferredCgExpression(record.preferredCgExpression)
      : DEFAULT_CHARACTER_AUTOMATIC_GENERATION.preferredCgExpression,
    lightingColor: normalizeLightingColor(record.lightingColor),
    breastSize: normalizeBreastSize(record.breastSize),
    bloomIntensity: normalizeUnitNumber(record.bloomIntensity, DEFAULT_CHARACTER_AUTOMATIC_GENERATION.bloomIntensity),
    generateDepthMaps:
      typeof record.generateDepthMaps === 'boolean'
        ? record.generateDepthMaps
        : DEFAULT_CHARACTER_AUTOMATIC_GENERATION.generateDepthMaps,
    generateMouthAnimations:
      typeof record.generateMouthAnimations === 'boolean'
        ? record.generateMouthAnimations
        : typeof record.generateBlinkingAndTalking === 'boolean'
          ? record.generateBlinkingAndTalking
          : DEFAULT_CHARACTER_AUTOMATIC_GENERATION.generateMouthAnimations,
    defaultExpressions,
    customExpressions: normalizeExpressionList(record.customExpressions),
    cgDefinitions,
    generatedPromptBySlot,
    resumeState,
  };
}

function normalizeSpriteZones(value: unknown): Record<string, SpriteInteractiveZoneRecord[]> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  const zonesByExpression: Record<string, SpriteInteractiveZoneRecord[]> = {};
  for (const [expression, entryValue] of Object.entries(value as Record<string, unknown>)) {
    if (!expression.trim() || !Array.isArray(entryValue)) {
      continue;
    }

    const normalizedExpression = normalizeCustomReactionName(expression) || expression.trim();
    const nextZones = entryValue
      .filter((entry): entry is Record<string, unknown> => Boolean(entry && typeof entry === 'object'))
      .map((record) => {
        const x = typeof record.x === 'number' && Number.isFinite(record.x) ? Math.min(Math.max(record.x, 0), 1) : 0;
        const y = typeof record.y === 'number' && Number.isFinite(record.y) ? Math.min(Math.max(record.y, 0), 1) : 0;
        const width = typeof record.width === 'number' && Number.isFinite(record.width) ? Math.min(Math.max(record.width, 0), 1) : 0;
        const height = typeof record.height === 'number' && Number.isFinite(record.height) ? Math.min(Math.max(record.height, 0), 1) : 0;
        return {
          id: asString(record.id).trim() || randomUUID(),
          x,
          y,
          width: Math.min(width, 1 - x),
          height: Math.min(height, 1 - y),
          prompt: asString(record.prompt).trim(),
        };
      })
      .filter((zone) => zone.width > 0 && zone.height > 0);

    if (nextZones.length > 0) {
      zonesByExpression[normalizedExpression] = nextZones;
    }
  }

  return zonesByExpression;
}

function normalizeTriggerWords(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const seen = new Set<string>();
  const normalized: string[] = [];
  for (const entry of value) {
    const word = asString(entry).trim();
    const key = word.toLowerCase();
    if (!word || seen.has(key)) {
      continue;
    }
    seen.add(key);
    normalized.push(word);
  }
  return normalized;
}

function normalizeRunMessages(value: unknown): ScenarioRunMessage[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((entry): entry is Record<string, unknown> => Boolean(entry && typeof entry === 'object'))
    .map((entry) => ({
      role: entry.role === 'assistant' ? 'assistant' : 'user',
      content: asString(entry.content),
    }));
}

function normalizePackageSource(value: unknown): ScenarioPackageRecord['source'] {
  return value === 'imported' ? 'imported' : 'created';
}

function normalizeDialogueQuoteFontId(value: unknown): string {
  const normalized = `${value || ''}`.trim().toLowerCase();
  return /^[a-z0-9-]{1,80}$/.test(normalized) ? normalized : '';
}

function normalizeCharacterNameFontId(value: unknown): string {
  return normalizeDialogueQuoteFontId(value);
}

function normalizeCharacterNameColor(value: unknown, fallback: string): string {
  const raw = asString(value).trim();
  return /^#[0-9a-fA-F]{6}$/.test(raw) ? raw.toUpperCase() : fallback.toUpperCase();
}

function normalizeSuggestedPositiveAffinityMaximum(value: unknown): number | undefined {
  const numeric = typeof value === 'number' ? value : Number.parseFloat(`${value || ''}`);
  if (!Number.isFinite(numeric)) {
    return undefined;
  }
  return Math.min(Math.max(Math.round(numeric), 0), 120);
}

function normalizeSuggestedNegativeAffinityMaximum(value: unknown): number | undefined {
  const numeric = typeof value === 'number' ? value : Number.parseFloat(`${value || ''}`);
  if (!Number.isFinite(numeric)) {
    return undefined;
  }
  return Math.min(Math.max(Math.round(numeric), -120), 0);
}

function normalizeSuggestedLustMaximum(value: unknown): number | undefined {
  const numeric = typeof value === 'number' ? value : Number.parseFloat(`${value || ''}`);
  if (!Number.isFinite(numeric)) {
    return undefined;
  }
  return Math.min(Math.max(Math.round(numeric), 0), 100);
}

function normalizeDialogueQuoteAnimationPreset(value: unknown): string {
  const normalized = `${value || ''}`.trim().toLowerCase();
  return ['disabled', 'glowing', 'crawlies', 'wave', 'flicker', 'glitch', 'echo'].includes(normalized)
    ? normalized
    : 'disabled';
}

function normalizeDialogueQuoteAnimationSpeed(value: unknown): number {
  const numeric = typeof value === 'number' ? value : Number.parseFloat(`${value || ''}`);
  if (!Number.isFinite(numeric)) {
    return 1;
  }

  return Math.min(Math.max(numeric, 0.25), 3);
}

function normalizeDialogueQuoteAnimationColor(value: unknown): string {
  const raw = asString(value).trim();
  return /^#[0-9a-fA-F]{6}$/.test(raw) ? raw.toUpperCase() : '#F6F0E6';
}

function normalizeStoredCharacter(raw: unknown): StudioCharacterRecord | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return null;
  }

  const entry = raw as Record<string, unknown>;
  const spritesRaw = entry.sprites && typeof entry.sprites === 'object' ? (entry.sprites as Record<string, unknown>) : {};
  const sprites = Object.fromEntries(
    SPRITE_EXPRESSIONS.map((expression) => [expression, normalizeImageVariants(spritesRaw[expression])]),
  );
  const spriteDepthMapsRaw =
    entry.spriteDepthMaps && typeof entry.spriteDepthMaps === 'object'
      ? (entry.spriteDepthMaps as Record<string, unknown>)
      : {};
  const spriteDepthMaps = Object.fromEntries(
    SPRITE_EXPRESSIONS.map((expression) => [
      expression,
      normalizeImageVariants(spriteDepthMapsRaw[expression]).slice(0, sprites[expression]?.length || 0),
    ]),
  );
  const spriteAnimationFramesRaw =
    entry.spriteAnimationFrames && typeof entry.spriteAnimationFrames === 'object'
      ? (entry.spriteAnimationFrames as Record<string, unknown>)
      : {};
  const spriteAnimationFrames = Object.fromEntries(
    SPRITE_EXPRESSIONS.map((expression) => [
      expression,
      normalizeSpriteAnimationFrames(spriteAnimationFramesRaw[expression], sprites[expression]?.length || 0),
    ]),
  );

  return {
    id: asString(entry.id) || randomUUID(),
    name: asString(entry.name),
    cardName: asString(entry.cardName),
    accentColor: normalizeAccentColor(entry.accentColor),
    suggestedAffinityPositiveMaximum: normalizeSuggestedPositiveAffinityMaximum(entry.suggestedAffinityPositiveMaximum),
    suggestedAffinityNegativeMaximum: normalizeSuggestedNegativeAffinityMaximum(entry.suggestedAffinityNegativeMaximum),
    suggestedLustMaximum: normalizeSuggestedLustMaximum(entry.suggestedLustMaximum),
    characterNameFontId: normalizeCharacterNameFontId(entry.characterNameFontId),
    characterNameColor: normalizeCharacterNameColor(entry.characterNameColor, normalizeAccentColor(entry.accentColor)),
    blipSound: normalizeBlipSound(entry.blipSound),
    dialogueQuoteFontId: normalizeDialogueQuoteFontId(entry.dialogueQuoteFontId),
    dialogueQuoteAnimationPreset: normalizeDialogueQuoteAnimationPreset(entry.dialogueQuoteAnimationPreset),
    dialogueQuoteAnimationSpeed: normalizeDialogueQuoteAnimationSpeed(entry.dialogueQuoteAnimationSpeed),
    dialogueQuoteAnimationColor: normalizeDialogueQuoteAnimationColor(entry.dialogueQuoteAnimationColor),
    sprites,
    spriteDepthMaps,
    spriteAnimationFrames,
    customReactions: normalizeCustomReactions(entry.customReactions),
    automaticGeneration: normalizeAutomaticGenerationSettings(entry.automaticGeneration),
    spriteZones: normalizeSpriteZones(entry.spriteZones),
    cgs: normalizeCgs(entry.cgs),
    createdAt: asString(entry.createdAt) || nowIso(),
    updatedAt: asString(entry.updatedAt) || nowIso(),
  };
}

function normalizeStoredScenario(raw: unknown): OneShotScenarioRecord | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return null;
  }

  const entry = raw as Record<string, unknown>;
  const scenes = Array.isArray(entry.scenes)
    ? entry.scenes
        .filter((scene): scene is Record<string, unknown> => Boolean(scene && typeof scene === 'object'))
        .map((scene) => ({
          id: asString(scene.id) || randomUUID(),
          name: asString(scene.name),
          backgroundDataUrl: asString(scene.backgroundDataUrl),
          backgroundDepthMapDataUrl: asString(scene.backgroundDepthMapDataUrl ?? scene.depthMapDataUrl),
          bgmDataUrl: asString(scene.bgmDataUrl),
          ambientNoiseDataUrl: asString(scene.ambientNoiseDataUrl),
          ambientNoisePresetId: asString(scene.ambientNoisePresetId),
          ambientNoiseMuffled: scene.ambientNoiseMuffled === true,
          weatherPreset: normalizeSceneWeatherPreset(scene.weatherPreset),
          triggerWords: normalizeTriggerWords(scene.triggerWords),
        }))
    : [];
  const startSceneId = scenes.some((scene) => scene.id === asString(entry.startSceneId))
    ? asString(entry.startSceneId)
    : scenes[0]?.id || '';

  return {
    id: asString(entry.id) || randomUUID(),
    name: asString(entry.name),
    description: asString(entry.description),
    startMessage: asString(entry.startMessage),
    specialInstructions: asString(entry.specialInstructions),
    characterId: asString(entry.characterId),
    bannerDataUrl: asString(entry.bannerDataUrl),
    startSceneId,
    startingPoints: normalizeScenarioStartingPoints(
      entry.startingPoints,
      scenes,
      startSceneId,
      asString(entry.startMessage),
      asString(entry.specialInstructions),
    ),
    scenes,
    createdAt: asString(entry.createdAt) || nowIso(),
    updatedAt: asString(entry.updatedAt) || nowIso(),
  };
}

function normalizeScenarioStartingPoints(
  value: unknown,
  scenes: OneShotScenarioRecord['scenes'],
  startSceneId: string,
  defaultStartMessage = '',
  defaultSpecialInstructions = '',
): OneShotScenarioRecord['startingPoints'] {
  const validSceneIds = new Set(scenes.map((scene) => scene.id));
  const pointsRaw = Array.isArray(value) ? value : [];
  const result: OneShotScenarioRecord['startingPoints'] = [];

  for (const rawPoint of pointsRaw) {
    if (!rawPoint || typeof rawPoint !== 'object') {
      continue;
    }

    const point = rawPoint as Record<string, unknown>;
    const sceneId = asString(point.sceneId).trim();
    if (!sceneId || !validSceneIds.has(sceneId)) {
      continue;
    }

    result.push({
      id: asString(point.id) || randomUUID(),
      name: asString(point.name).trim() || scenes.find((scene) => scene.id === sceneId)?.name || `Start ${result.length + 1}`,
      sceneId,
      startMessage: asString(point.startMessage).trim() || defaultStartMessage.trim(),
      specialInstructions: asString(point.specialInstructions).trim() || defaultSpecialInstructions.trim(),
    });

    if (result.length >= 5) {
      break;
    }
  }

  if (result.length === 0 && scenes.length > 0) {
    const fallbackSceneId = validSceneIds.has(startSceneId) ? startSceneId : scenes[0].id;
    result.push({
      id: randomUUID(),
      name: scenes.find((scene) => scene.id === fallbackSceneId)?.name || 'Default',
      sceneId: fallbackSceneId,
      startMessage: defaultStartMessage.trim(),
      specialInstructions: defaultSpecialInstructions.trim(),
    });
  }

  return result;
}

function normalizeSpriteAnimationFrames(value: unknown, spriteCount: number): { closedEyes: string[]; openMouth: string[] } {
  const record = value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  return {
    closedEyes: normalizeImageVariants(record.closedEyes).slice(0, spriteCount),
    openMouth: normalizeImageVariants(record.openMouth).slice(0, spriteCount),
  };
}

function hasSpriteAnimationFrames(value: { closedEyes: string[]; openMouth: string[] }): boolean {
  return value.closedEyes.some(Boolean) || value.openMouth.some(Boolean);
}

function normalizeCustomReactions(
  value: unknown,
): Array<{
  name: string;
  sprites: string[];
  depthMaps?: string[];
  animationFrames?: { closedEyes: string[]; openMouth: string[] };
  triggers: string[];
}> {
  if (!Array.isArray(value)) {
    return [];
  }

  const seen = new Set<string>();
  const result: Array<{
    name: string;
    sprites: string[];
    depthMaps?: string[];
    animationFrames?: { closedEyes: string[]; openMouth: string[] };
    triggers: string[];
  }> = [];
  for (const entry of value) {
    if (!entry || typeof entry !== 'object') {
      continue;
    }

    const record = entry as Record<string, unknown>;
    const triggers = normalizeTriggerAliases(record.triggers, asString(record.name));
    const name = triggers[0] || '';
    const sprites = normalizeImageVariants(record.sprites ?? record.sprite);
    const depthMaps = normalizeImageVariants(record.depthMaps ?? record.depthMap);
    const animationFrames = normalizeSpriteAnimationFrames(record.animationFrames, sprites.length);

    if (!name || sprites.length === 0 || triggers.some((trigger) => seen.has(trigger))) {
      continue;
    }

    triggers.forEach((trigger) => seen.add(trigger));
    result.push({
      name,
      sprites,
      depthMaps: depthMaps.slice(0, sprites.length),
      animationFrames: hasSpriteAnimationFrames(animationFrames) ? animationFrames : undefined,
      triggers,
    });
  }
  return result;
}

function normalizeCgs(value: unknown): Array<{ name: string; images: string[]; triggers: string[] }> {
  if (!Array.isArray(value)) {
    return [];
  }

  const seen = new Set<string>();
  const result: Array<{ name: string; images: string[]; triggers: string[] }> = [];
  for (const entry of value) {
    if (!entry || typeof entry !== 'object') {
      continue;
    }

    const record = entry as Record<string, unknown>;
    const triggers = normalizeTriggerAliases(record.triggers, asString(record.name));
    const name = triggers[0] || '';
    const images = normalizeImageVariants(record.images ?? record.image);

    if (!name || images.length === 0 || triggers.some((trigger) => seen.has(trigger.toLowerCase()))) {
      continue;
    }

    triggers.forEach((trigger) => seen.add(trigger.toLowerCase()));
    result.push({ name, images, triggers });
  }
  return result;
}

async function readJsonFile<T>(filePath: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(filePath, 'utf8')) as T;
  } catch {
    return null;
  }
}

async function writeJsonFile(filePath: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, JSON.stringify(value, null, 2), 'utf8');
}

async function readIndex(): Promise<FileStoreIndex> {
  const raw = await readJsonFile<Record<string, unknown>>(appConfig.fileStoreIndexPath);
  if (!raw) {
    return emptyIndex();
  }

  return {
    version: 1,
    runs: Array.isArray(raw.runs)
      ? raw.runs
          .filter((entry): entry is Record<string, unknown> => Boolean(entry && typeof entry === 'object'))
          .map((entry) => ({
            id: asString(entry.id) || randomUUID(),
            scenarioId: asString(entry.scenarioId),
            title: asString(entry.title),
            messages: normalizeRunMessages(entry.messages),
            currentSceneId: asString(entry.currentSceneId) || undefined,
            startingPointId: asString(entry.startingPointId) || undefined,
            createdAt: asString(entry.createdAt) || nowIso(),
            updatedAt: asString(entry.updatedAt) || nowIso(),
          }))
      : [],
    packages: Array.isArray(raw.packages)
      ? raw.packages
          .filter((entry): entry is Record<string, unknown> => Boolean(entry && typeof entry === 'object'))
          .map((entry) => ({
            id: asString(entry.id) || randomUUID(),
            name: asString(entry.name),
            bannerDataUrl: asString(entry.bannerDataUrl),
            scenarioId: asString(entry.scenarioId),
            characterId: asString(entry.characterId),
            fileName: asString(entry.fileName),
            filePath: asString(entry.filePath),
            source: normalizePackageSource(entry.source),
            createdAt: asString(entry.createdAt) || nowIso(),
            updatedAt: asString(entry.updatedAt) || nowIso(),
          }))
      : [],
    artStylePresets: (Array.isArray(raw.artStylePresets) ? raw.artStylePresets : [])
      .filter((entry): entry is Record<string, unknown> => Boolean(entry && typeof entry === 'object'))
      .map((entry) => ({
        id: asString(entry.id) || randomUUID(),
        name: asString(entry.name),
        prompt: asString(entry.prompt),
        checkpoint: asString(entry.checkpoint),
        loras: Array.isArray(entry.loras)
          ? entry.loras
              .filter((lora): lora is Record<string, unknown> => Boolean(lora && typeof lora === 'object'))
              .map((lora) => ({
                name: asString(lora.name),
                strength: Number.isFinite(Number(lora.strength)) ? Number(lora.strength) : 1,
              }))
          : [],
        thumbnailDataUrl: asString(entry.thumbnailDataUrl) || undefined,
      })),
    migratedFromLegacy: raw.migratedFromLegacy === true,
  };
}

async function writeIndex(index: FileStoreIndex): Promise<void> {
  await writeJsonFile(appConfig.fileStoreIndexPath, index);
}

async function listManifestRecords<T>(
  rootPath: string,
  manifestFile: string,
  normalize: (raw: unknown) => T | null,
): Promise<T[]> {
  await mkdir(rootPath, { recursive: true });
  const entries = await readdir(rootPath, { withFileTypes: true });
  const records: T[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }
    const record = normalize(await readJsonFile(path.join(rootPath, entry.name, manifestFile)));
    if (record) {
      records.push(record);
    }
  }
  return records;
}

async function readCharacterById(characterId: string): Promise<StudioCharacterRecord | null> {
  return normalizeStoredCharacter(
    await readJsonFile(path.join(appConfig.fileCharactersPath, sanitizePathPart(characterId), CHARACTER_MANIFEST_FILE)),
  );
}

async function readScenarioById(scenarioId: string): Promise<OneShotScenarioRecord | null> {
  return normalizeStoredScenario(
    await readJsonFile(path.join(appConfig.fileScenesPath, sanitizePathPart(scenarioId), SCENARIO_MANIFEST_FILE)),
  );
}

async function readLegacyState(): Promise<StudioStateRecord | null> {
  if (!(await pathExists(appConfig.studioStatePath))) {
    return null;
  }

  const raw = await readJsonFile<Record<string, unknown>>(appConfig.studioStatePath);
  if (!raw) {
    return null;
  }

  return {
    version: 1,
    characters: Array.isArray(raw.characters)
      ? raw.characters.map(normalizeStoredCharacter).filter((entry): entry is StudioCharacterRecord => Boolean(entry))
      : [],
    scenarios: Array.isArray(raw.scenarios)
      ? raw.scenarios.map(normalizeStoredScenario).filter((entry): entry is OneShotScenarioRecord => Boolean(entry))
      : [],
    runs: Array.isArray(raw.runs)
      ? raw.runs
          .filter((entry): entry is Record<string, unknown> => Boolean(entry && typeof entry === 'object'))
          .map((entry) => ({
            id: asString(entry.id) || randomUUID(),
            scenarioId: asString(entry.scenarioId),
            title: asString(entry.title),
            messages: normalizeRunMessages(entry.messages),
            currentSceneId: asString(entry.currentSceneId) || undefined,
            createdAt: asString(entry.createdAt) || nowIso(),
            updatedAt: asString(entry.updatedAt) || nowIso(),
          }))
      : [],
    packages: Array.isArray(raw.packages)
      ? raw.packages
          .filter((entry): entry is Record<string, unknown> => Boolean(entry && typeof entry === 'object'))
          .map((entry) => ({
            id: asString(entry.id) || randomUUID(),
            name: asString(entry.name),
            bannerDataUrl: asString(entry.bannerDataUrl),
            scenarioId: asString(entry.scenarioId),
            characterId: asString(entry.characterId),
            fileName: asString(entry.fileName),
            filePath: asString(entry.filePath),
            source: normalizePackageSource(entry.source),
            createdAt: asString(entry.createdAt) || nowIso(),
            updatedAt: asString(entry.updatedAt) || nowIso(),
          }))
      : [],
    artStylePresets: (Array.isArray(raw.artStylePresets) ? raw.artStylePresets : [])
      .filter((entry): entry is Record<string, unknown> => Boolean(entry && typeof entry === 'object'))
      .map((entry) => ({
        id: asString(entry.id) || randomUUID(),
        name: asString(entry.name),
        prompt: asString(entry.prompt),
        checkpoint: asString(entry.checkpoint),
        loras: Array.isArray(entry.loras)
          ? entry.loras
              .filter((lora): lora is Record<string, unknown> => Boolean(lora && typeof lora === 'object'))
              .map((lora) => ({
                name: asString(lora.name),
                strength: Number.isFinite(Number(lora.strength)) ? Number(lora.strength) : 1,
              }))
          : [],
        thumbnailDataUrl: asString(entry.thumbnailDataUrl) || undefined,
      })),
  };
}

async function ensureFileStore(): Promise<void> {
  if (initialized) {
    return;
  }

  await mkdir(appConfig.fileCharactersPath, { recursive: true });
  await mkdir(appConfig.fileScenesPath, { recursive: true });
  if (!(await pathExists(appConfig.fileStoreIndexPath))) {
    await writeIndex(emptyIndex());
  }

  const index = await readIndex();
  const hasCharacters = (await readdir(appConfig.fileCharactersPath)).length > 0;
  const hasScenarios = (await readdir(appConfig.fileScenesPath)).length > 0;
  if (!index.migratedFromLegacy && !hasCharacters && !hasScenarios) {
    const legacyState = await readLegacyState();
    if (legacyState) {
      for (const character of legacyState.characters) {
        await saveCharacterManifestAndAssets(character);
      }
      for (const scenario of legacyState.scenarios) {
        await saveScenarioManifestAndAssets(scenario);
      }
      await writeIndex({
        version: 1,
        runs: legacyState.runs,
        packages: legacyState.packages,
        artStylePresets: legacyState.artStylePresets,
        migratedFromLegacy: true,
      });
    }
  }

  initialized = true;
}

function triggerKey(entity: { name: string; triggers?: string[] }): string {
  return normalizeTriggerAliases(entity.triggers, entity.name).join('|');
}

function mergeArtStylePresets(
  existing: AutomaticGenerationArtStylePresetRecord[],
  characters: StudioCharacterRecord[],
): AutomaticGenerationArtStylePresetRecord[] {
  const merged = new Map<string, AutomaticGenerationArtStylePresetRecord>();
  for (const preset of existing) {
    merged.set(preset.id, preset);
  }
  for (const character of characters) {
    for (const preset of character.automaticGeneration.artStylePresets) {
      if (!merged.has(preset.id)) {
        merged.set(preset.id, preset);
      }
    }
  }
  return [...merged.values()];
}

async function saveCharacterManifestAndAssets(character: StudioCharacterRecord): Promise<StudioCharacterRecord> {
  const characterId = sanitizePathPart(character.id);
  const characterDirectory = path.join(appConfig.fileCharactersPath, characterId);
  await removeLegacyCgSpriteDirectories(characterDirectory);

  const sprites: StudioCharacterRecord['sprites'] = {};
  for (const expression of SPRITE_EXPRESSIONS) {
    sprites[expression] = await persistAssetVariants(
      normalizeImageVariants(character.sprites[expression]),
      path.join(characterDirectory, 'sprites', sanitizePathPart(expression)),
      expression,
    );
  }

  const spriteDepthMaps: StudioCharacterRecord['spriteDepthMaps'] = {};
  for (const expression of SPRITE_EXPRESSIONS) {
    spriteDepthMaps[expression] = (
      await persistAssetVariants(
        normalizeImageVariants(character.spriteDepthMaps[expression]),
        path.join(characterDirectory, 'depthmaps', sanitizePathPart(expression)),
        expression,
      )
    ).slice(0, sprites[expression]?.length || 0);
  }

  const spriteAnimationFrames: StudioCharacterRecord['spriteAnimationFrames'] = {};
  for (const expression of SPRITE_EXPRESSIONS) {
    const animationFrames = normalizeSpriteAnimationFrames(
      character.spriteAnimationFrames?.[expression],
      sprites[expression]?.length || 0,
    );
    spriteAnimationFrames[expression] = {
      closedEyes: (
        await persistAssetVariants(
          animationFrames.closedEyes,
          path.join(characterDirectory, 'Animation', sanitizePathPart(expression), 'closed-eyes'),
          `${expression}-closed-eyes`,
        )
      ).slice(0, sprites[expression]?.length || 0),
      openMouth: (
        await persistAssetVariants(
          animationFrames.openMouth,
          path.join(characterDirectory, 'Animation', sanitizePathPart(expression), 'open-mouth'),
          `${expression}-open-mouth`,
        )
      ).slice(0, sprites[expression]?.length || 0),
    };
  }

  const customReactions: StudioCharacterRecord['customReactions'] = [];
  for (const reaction of normalizeCustomReactions(character.customReactions)) {
    const key = sanitizePathPart(triggerKey(reaction), 'custom-reaction');
    const reactionSprites = await persistAssetVariants(
      reaction.sprites,
      path.join(characterDirectory, 'custom-reactions', key, 'sprites'),
      'sprite',
    );
    const reactionDepthMaps = await persistAssetVariants(
      reaction.depthMaps || [],
      path.join(characterDirectory, 'custom-reactions', key, 'depthmaps'),
      'depthmap',
    );
    const reactionAnimationFrames = normalizeSpriteAnimationFrames(reaction.animationFrames, reactionSprites.length);
    const persistedReactionAnimationFrames = {
      closedEyes: (
        await persistAssetVariants(
          reactionAnimationFrames.closedEyes,
          path.join(characterDirectory, 'custom-reactions', key, 'Animation', 'closed-eyes'),
          'closed-eyes',
        )
      ).slice(0, reactionSprites.length),
      openMouth: (
        await persistAssetVariants(
          reactionAnimationFrames.openMouth,
          path.join(characterDirectory, 'custom-reactions', key, 'Animation', 'open-mouth'),
          'open-mouth',
        )
      ).slice(0, reactionSprites.length),
    };
    customReactions.push({
      ...reaction,
      sprites: reactionSprites,
      depthMaps: reactionDepthMaps.slice(0, reactionSprites.length),
      animationFrames: hasSpriteAnimationFrames(persistedReactionAnimationFrames)
        ? persistedReactionAnimationFrames
        : undefined,
    });
  }

  const cgs: StudioCharacterRecord['cgs'] = [];
  for (const cg of normalizeCgs(character.cgs)) {
    const key = sanitizePathPart(triggerKey(cg), 'cg');
    cgs.push({
      ...cg,
      images: await persistAssetVariants(cg.images, path.join(characterDirectory, 'cgs', key), 'image'),
    });
  }

  const nextCharacter: StudioCharacterRecord = {
    ...character,
    id: character.id,
    accentColor: normalizeAccentColor(character.accentColor),
    characterNameFontId: normalizeCharacterNameFontId(character.characterNameFontId),
    characterNameColor: normalizeCharacterNameColor(character.characterNameColor, normalizeAccentColor(character.accentColor)),
    blipSound: normalizeBlipSound(character.blipSound),
    dialogueQuoteFontId: normalizeDialogueQuoteFontId(character.dialogueQuoteFontId),
    dialogueQuoteAnimationPreset: normalizeDialogueQuoteAnimationPreset(character.dialogueQuoteAnimationPreset),
    dialogueQuoteAnimationSpeed: normalizeDialogueQuoteAnimationSpeed(character.dialogueQuoteAnimationSpeed),
    dialogueQuoteAnimationColor: normalizeDialogueQuoteAnimationColor(character.dialogueQuoteAnimationColor),
    sprites,
    spriteDepthMaps,
    spriteAnimationFrames,
    customReactions,
    automaticGeneration: normalizeAutomaticGenerationSettings(character.automaticGeneration),
    spriteZones: normalizeSpriteZones(character.spriteZones),
    cgs,
  };

  await writeJsonFile(path.join(characterDirectory, CHARACTER_MANIFEST_FILE), nextCharacter);
  return nextCharacter;
}

async function saveScenarioManifestAndAssets(scenario: OneShotScenarioRecord): Promise<OneShotScenarioRecord> {
  const scenarioId = sanitizePathPart(scenario.id);
  const scenarioDirectory = path.join(appConfig.fileScenesPath, scenarioId);
  const bannerDataUrl = scenario.bannerDataUrl
    ? await persistAssetReference(scenario.bannerDataUrl, path.join(scenarioDirectory, 'banner'), 'banner')
    : '';

  const scenes: OneShotScenarioRecord['scenes'] = [];
  for (const scene of scenario.scenes) {
    const sceneId = scene.id || randomUUID();
    const sceneDirectory = path.join(scenarioDirectory, 'scenes', sanitizePathPart(sceneId));
    scenes.push({
      id: sceneId,
      name: scene.name,
      backgroundDataUrl: await persistAssetReference(scene.backgroundDataUrl, sceneDirectory, 'background'),
      backgroundDepthMapDataUrl: scene.backgroundDepthMapDataUrl
        ? await persistAssetReference(scene.backgroundDepthMapDataUrl, sceneDirectory, 'background-depthmap')
        : '',
      bgmDataUrl: scene.bgmDataUrl ? await persistAssetReference(scene.bgmDataUrl, sceneDirectory, 'bgm') : '',
      ambientNoiseDataUrl: scene.ambientNoiseDataUrl
        ? await persistAssetReference(scene.ambientNoiseDataUrl, sceneDirectory, 'ambient')
        : '',
      ambientNoisePresetId: scene.ambientNoisePresetId || '',
      ambientNoiseMuffled: scene.ambientNoiseMuffled === true,
      weatherPreset: normalizeSceneWeatherPreset(scene.weatherPreset),
      triggerWords: normalizeTriggerWords(scene.triggerWords),
    });
  }

  const nextScenario: OneShotScenarioRecord = {
    ...scenario,
    bannerDataUrl,
    scenes,
    startSceneId: scenes.some((scene) => scene.id === scenario.startSceneId)
      ? scenario.startSceneId
      : scenes[0]?.id || '',
  };
  nextScenario.startingPoints = normalizeScenarioStartingPoints(
    scenario.startingPoints,
    scenes,
    nextScenario.startSceneId,
    scenario.startMessage,
    scenario.specialInstructions,
  );

  await writeJsonFile(path.join(scenarioDirectory, SCENARIO_MANIFEST_FILE), nextScenario);
  return nextScenario;
}

async function withWriteQueue<T>(operation: () => Promise<T>): Promise<T> {
  const result = writeQueue.then(operation);
  writeQueue = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

export async function getStudioState(): Promise<StudioStateRecord> {
  await ensureFileStore();
  const index = await readIndex();
  const characters = await listManifestRecords(appConfig.fileCharactersPath, CHARACTER_MANIFEST_FILE, normalizeStoredCharacter);
  const scenarios = await listManifestRecords(appConfig.fileScenesPath, SCENARIO_MANIFEST_FILE, normalizeStoredScenario);
  const artStylePresets = mergeArtStylePresets(index.artStylePresets, characters);
  if (artStylePresets.length !== index.artStylePresets.length) {
    await writeIndex({ ...index, artStylePresets });
  }
  return {
    version: 1,
    characters,
    scenarios,
    runs: index.runs,
    packages: index.packages,
    artStylePresets,
  };
}

export async function updateStudioArtStylePresets(
  presets: AutomaticGenerationArtStylePresetRecord[],
): Promise<AutomaticGenerationArtStylePresetRecord[]> {
  await ensureFileStore();
  return withWriteQueue(async () => {
    const index = await readIndex();
    const normalizedPresets = presets.map((preset) => ({
      id: preset.id || randomUUID(),
      name: asString(preset.name).trim(),
      prompt: asString(preset.prompt).trim(),
      checkpoint: asString(preset.checkpoint).trim(),
      loras: Array.isArray(preset.loras)
        ? preset.loras.map((lora) => ({
            name: asString(lora.name),
            strength: Number.isFinite(Number(lora.strength)) ? Number(lora.strength) : 1,
          }))
        : [],
      thumbnailDataUrl: asString(preset.thumbnailDataUrl) || undefined,
    }));
    await writeIndex({ ...index, artStylePresets: normalizedPresets });
    return normalizedPresets;
  });
}

export async function upsertStudioCharacter(payload: StudioCharacterUpsertInput): Promise<StudioCharacterRecord> {
  await ensureFileStore();
  return withWriteQueue(async () => {
    const timestamp = nowIso();
    const incomingId = (payload.id || '').trim();
    const existing = incomingId ? await readCharacterById(incomingId) : null;
    const id = existing?.id || incomingId || randomUUID();
    return saveCharacterManifestAndAssets({
      id,
      name: payload.name,
      cardName: payload.cardName,
      accentColor: normalizeAccentColor(payload.accentColor),
      suggestedAffinityPositiveMaximum: normalizeSuggestedPositiveAffinityMaximum(payload.suggestedAffinityPositiveMaximum),
      suggestedAffinityNegativeMaximum: normalizeSuggestedNegativeAffinityMaximum(payload.suggestedAffinityNegativeMaximum),
      suggestedLustMaximum: normalizeSuggestedLustMaximum(payload.suggestedLustMaximum),
      characterNameFontId: normalizeCharacterNameFontId(payload.characterNameFontId),
      characterNameColor: normalizeCharacterNameColor(payload.characterNameColor, normalizeAccentColor(payload.accentColor)),
      blipSound: normalizeBlipSound(payload.blipSound),
      dialogueQuoteFontId: normalizeDialogueQuoteFontId(payload.dialogueQuoteFontId),
      dialogueQuoteAnimationPreset: normalizeDialogueQuoteAnimationPreset(payload.dialogueQuoteAnimationPreset),
      dialogueQuoteAnimationSpeed: normalizeDialogueQuoteAnimationSpeed(payload.dialogueQuoteAnimationSpeed),
      dialogueQuoteAnimationColor: normalizeDialogueQuoteAnimationColor(payload.dialogueQuoteAnimationColor),
      sprites: payload.sprites,
      spriteDepthMaps: Object.fromEntries(
        SPRITE_EXPRESSIONS.map((expression) => [
          expression,
          normalizeImageVariants(payload.spriteDepthMaps?.[expression]).slice(
            0,
            normalizeImageVariants(payload.sprites[expression]).length,
          ),
        ]),
      ),
      spriteAnimationFrames: Object.fromEntries(
        SPRITE_EXPRESSIONS.map((expression) => [
          expression,
          normalizeSpriteAnimationFrames(
            payload.spriteAnimationFrames?.[expression],
            normalizeImageVariants(payload.sprites[expression]).length,
          ),
        ]),
      ),
      customReactions: normalizeCustomReactions(payload.customReactions),
      automaticGeneration: normalizeAutomaticGenerationSettings(payload.automaticGeneration),
      spriteZones: normalizeSpriteZones(payload.spriteZones),
      cgs: normalizeCgs(payload.cgs),
      createdAt: existing?.createdAt || timestamp,
      updatedAt: timestamp,
    });
  });
}

export async function deleteStudioCharacter(characterId: string): Promise<void> {
  await ensureFileStore();
  await withWriteQueue(async () => {
    const directory = path.join(appConfig.fileCharactersPath, sanitizePathPart(characterId));
    if (isPathInsideDirectory(directory, appConfig.fileCharactersPath)) {
      await rm(directory, { recursive: true, force: true });
    }
  });
}

export async function upsertScenario(payload: OneShotScenarioUpsertInput): Promise<OneShotScenarioRecord> {
  await ensureFileStore();
  return withWriteQueue(async () => {
    const timestamp = nowIso();
    const incomingId = (payload.id || '').trim();
    const existing = incomingId ? await readScenarioById(incomingId) : null;
    const id = existing?.id || incomingId || randomUUID();
    return saveScenarioManifestAndAssets({
      id,
      name: payload.name,
      description: payload.description,
      startMessage: payload.startMessage,
      specialInstructions: asString(payload.specialInstructions).trim(),
      characterId: payload.characterId,
      bannerDataUrl: asString(payload.bannerDataUrl).trim(),
      startSceneId: asString(payload.startSceneId).trim(),
      startingPoints: normalizeScenarioStartingPoints(
        payload.startingPoints,
        payload.scenes.map((scene) => ({
          id: scene.id || '',
          name: scene.name,
          backgroundDataUrl: scene.backgroundDataUrl,
          backgroundDepthMapDataUrl: scene.backgroundDepthMapDataUrl || '',
          bgmDataUrl: scene.bgmDataUrl || '',
          ambientNoiseDataUrl: scene.ambientNoiseDataUrl || '',
          ambientNoisePresetId: scene.ambientNoisePresetId || '',
          ambientNoiseMuffled: scene.ambientNoiseMuffled === true,
          weatherPreset: normalizeSceneWeatherPreset(scene.weatherPreset),
          triggerWords: normalizeTriggerWords(scene.triggerWords),
        })),
        asString(payload.startSceneId).trim(),
        payload.startMessage,
        asString(payload.specialInstructions).trim(),
      ),
      scenes: payload.scenes.map((scene) => ({
        id: scene.id || randomUUID(),
        name: scene.name,
        backgroundDataUrl: scene.backgroundDataUrl,
        backgroundDepthMapDataUrl: scene.backgroundDepthMapDataUrl || '',
        bgmDataUrl: scene.bgmDataUrl || '',
        ambientNoiseDataUrl: scene.ambientNoiseDataUrl || '',
        ambientNoisePresetId: scene.ambientNoisePresetId || '',
        ambientNoiseMuffled: scene.ambientNoiseMuffled === true,
        weatherPreset: normalizeSceneWeatherPreset(scene.weatherPreset),
        triggerWords: normalizeTriggerWords(scene.triggerWords),
      })),
      createdAt: existing?.createdAt || timestamp,
      updatedAt: timestamp,
    });
  });
}

export async function deleteScenario(scenarioId: string): Promise<void> {
  await ensureFileStore();
  await withWriteQueue(async () => {
    const index = await readIndex();
    const directory = path.join(appConfig.fileScenesPath, sanitizePathPart(scenarioId));
    if (isPathInsideDirectory(directory, appConfig.fileScenesPath)) {
      await rm(directory, { recursive: true, force: true });
    }
    await writeIndex({
      ...index,
      runs: index.runs.filter((entry) => entry.scenarioId !== scenarioId),
    });
  });
}

export async function createRun(payload: {
  scenarioId: string;
  title: string;
  messages: ScenarioRunMessage[];
  currentSceneId?: string;
  startingPointId?: string;
}): Promise<ScenarioRunRecord> {
  await ensureFileStore();
  return withWriteQueue(async () => {
    const timestamp = nowIso();
    const nextRun: ScenarioRunRecord = {
      id: randomUUID(),
      scenarioId: payload.scenarioId,
      title: payload.title,
      messages: payload.messages,
      currentSceneId: payload.currentSceneId,
      startingPointId: payload.startingPointId,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    const index = await readIndex();
    await writeIndex({ ...index, runs: [nextRun, ...index.runs] });
    return nextRun;
  });
}

export async function updateRunMessages(
  runId: string,
  messages: ScenarioRunMessage[],
  options: { currentSceneId?: string } = {},
): Promise<ScenarioRunRecord | null> {
  await ensureFileStore();
  return withWriteQueue(async () => {
    const index = await readIndex();
    const runIndex = index.runs.findIndex((entry) => entry.id === runId);
    if (runIndex < 0) {
      return null;
    }
    const updated = {
      ...index.runs[runIndex],
      messages,
      currentSceneId: options.currentSceneId || index.runs[runIndex].currentSceneId,
      updatedAt: nowIso(),
    };
    const runs = [...index.runs];
    runs[runIndex] = updated;
    await writeIndex({ ...index, runs });
    return updated;
  });
}

export async function deleteRun(runId: string): Promise<void> {
  await ensureFileStore();
  await withWriteQueue(async () => {
    const index = await readIndex();
    await writeIndex({ ...index, runs: index.runs.filter((entry) => entry.id !== runId) });
  });
}

export async function addPackageRecord(payload: {
  name: string;
  bannerDataUrl?: string;
  scenarioId: string;
  characterId: string;
  fileName: string;
  filePath: string;
  source: ScenarioPackageRecord['source'];
}): Promise<ScenarioPackageRecord> {
  await ensureFileStore();
  return withWriteQueue(async () => {
    const timestamp = nowIso();
    const nextPackage: ScenarioPackageRecord = {
      id: randomUUID(),
      name: payload.name,
      bannerDataUrl: asString(payload.bannerDataUrl).trim(),
      scenarioId: payload.scenarioId,
      characterId: payload.characterId,
      fileName: payload.fileName,
      filePath: payload.filePath,
      source: payload.source,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    const index = await readIndex();
    await writeIndex({ ...index, packages: [nextPackage, ...index.packages] });
    return nextPackage;
  });
}

export async function importPackageContent(payload: {
  packageName: string;
  fileName: string;
  filePath: string;
  character: Omit<StudioCharacterUpsertInput, 'id'>;
  scenario: Omit<OneShotScenarioUpsertInput, 'id' | 'characterId'>;
}): Promise<{
  packageRecord: ScenarioPackageRecord;
  character: StudioCharacterRecord;
  scenario: OneShotScenarioRecord;
}> {
  const character = await upsertStudioCharacter(payload.character);
  const scenario = await upsertScenario({ ...payload.scenario, characterId: character.id });
  const packageRecord = await addPackageRecord({
    name: payload.packageName,
    bannerDataUrl: scenario.bannerDataUrl,
    scenarioId: scenario.id,
    characterId: character.id,
    fileName: payload.fileName,
    filePath: payload.filePath,
    source: 'imported',
  });

  return { packageRecord, character, scenario };
}

export async function deletePackageAndLinkedContent(
  packageId: string,
  options?: {
    deleteCharacters?: boolean;
    deleteScenarios?: boolean;
  },
): Promise<{
  deletedPackages: ScenarioPackageRecord[];
  deletedScenarioIds: string[];
  deletedCharacterIds: string[];
}> {
  await ensureFileStore();
  const shouldDeleteCharacters = options?.deleteCharacters !== false;
  const shouldDeleteScenarios = options?.deleteScenarios !== false;

  return withWriteQueue(async () => {
    const state = await getStudioState();
    const target = state.packages.find((entry) => entry.id === packageId);
    if (!target) {
      return { deletedPackages: [], deletedScenarioIds: [], deletedCharacterIds: [] };
    }

    const deletedCharacterIds = shouldDeleteCharacters ? [target.characterId] : [];
    const deletedScenarioIds = state.scenarios
      .filter(
        (entry) =>
          (shouldDeleteScenarios && entry.id === target.scenarioId) ||
          (shouldDeleteCharacters && deletedCharacterIds.includes(entry.characterId)),
      )
      .map((entry) => entry.id);
    const deletedPackages = state.packages.filter(
      (entry) =>
        entry.id === target.id ||
        deletedScenarioIds.includes(entry.scenarioId) ||
        deletedCharacterIds.includes(entry.characterId),
    );

    for (const characterId of deletedCharacterIds) {
      const directory = path.join(appConfig.fileCharactersPath, sanitizePathPart(characterId));
      if (isPathInsideDirectory(directory, appConfig.fileCharactersPath)) {
        await rm(directory, { recursive: true, force: true });
      }
    }
    for (const scenarioId of deletedScenarioIds) {
      const directory = path.join(appConfig.fileScenesPath, sanitizePathPart(scenarioId));
      if (isPathInsideDirectory(directory, appConfig.fileScenesPath)) {
        await rm(directory, { recursive: true, force: true });
      }
    }

    const index = await readIndex();
    await writeIndex({
      ...index,
      runs: index.runs.filter((entry) => !deletedScenarioIds.includes(entry.scenarioId)),
      packages: index.packages.filter((entry) => !deletedPackages.some((deleted) => deleted.id === entry.id)),
    });

    return { deletedPackages, deletedScenarioIds, deletedCharacterIds };
  });
}
