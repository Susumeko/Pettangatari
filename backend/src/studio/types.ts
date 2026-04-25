export type SpriteExpression =
  | 'DEFAULT'
  | 'HAPPY'
  | 'LAUGHING'
  | 'SAD'
  | 'ANGRY'
  | 'ANNOYED'
  | 'POUTING'
  | 'THINKING'
  | 'CONFUSED'
  | 'FLIRTATIOUS'
  | 'NAUGHTY'
  | 'EMBARRASSED'
  | 'SHOCKED'
  | 'SCARED';

export interface AutomaticGenerationLoraRecord {
  name: string;
  strength: number;
}

export interface AutomaticGenerationExpressionRecord {
  enabled: boolean;
  triggerTag: string;
  prompt: string;
}

export interface AutomaticGenerationDefaultExpressionRecord {
  enabled: boolean;
  expression: string;
  prompt: string;
}

export interface AutomaticGenerationCgDefinitionRecord {
  enabled: boolean;
  triggerTag: string;
  prompt: string;
  excludeUpperBodyTags: boolean;
  excludeWaistTags: boolean;
  excludeLowerBodyTags: boolean;
}

export interface AutomaticGenerationResumeStateRecord {
  mode: 'replace' | 'append';
  nextTaskIndex: number;
  totalTasks: number;
  taskSignature: string;
  appendBaseIndexByAsset: Record<string, number>;
  updatedAt: string;
}

export interface AutomaticGenerationArtStylePresetRecord {
  id: string;
  name: string;
  prompt: string;
  checkpoint: string;
  loras: AutomaticGenerationLoraRecord[];
  thumbnailDataUrl?: string;
}

export interface SpriteAnimationFrameSetRecord {
  closedEyes: string[];
  openMouth: string[];
}

export interface CharacterAutomaticGenerationRecord {
  checkpoint: string;
  upscaleModel: string;
  loras: AutomaticGenerationLoraRecord[];
  basePrompt: string;
  negativePrompt: string;
  artStylePrompt: string;
  artStylePresets: AutomaticGenerationArtStylePresetRecord[];
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
  defaultExpressions: AutomaticGenerationDefaultExpressionRecord[];
  customExpressions: AutomaticGenerationExpressionRecord[];
  cgDefinitions: AutomaticGenerationCgDefinitionRecord[];
  generatedPromptBySlot: Record<string, string>;
  resumeState?: AutomaticGenerationResumeStateRecord | null;
}

export interface SpriteInteractiveZoneRecord {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  prompt: string;
}

export interface StudioCharacterRecord {
  id: string;
  name: string;
  cardName: string;
  accentColor: string;
  suggestedAffinityPositiveMaximum?: number;
  suggestedAffinityNegativeMaximum?: number;
  suggestedLustMaximum?: number;
  characterNameFontId: string;
  characterNameColor: string;
  blipSound: string;
  dialogueQuoteFontId: string;
  dialogueQuoteAnimationPreset: string;
  dialogueQuoteAnimationSpeed: number;
  dialogueQuoteAnimationColor: string;
  sprites: Partial<Record<SpriteExpression, string[]>>;
  spriteDepthMaps: Partial<Record<SpriteExpression, string[]>>;
  spriteAnimationFrames: Partial<Record<SpriteExpression, SpriteAnimationFrameSetRecord>>;
  customReactions: Array<{
    name: string;
    sprites: string[];
    depthMaps?: string[];
    animationFrames?: SpriteAnimationFrameSetRecord;
    triggers?: string[];
  }>;
  automaticGeneration: CharacterAutomaticGenerationRecord;
  spriteZones: Record<string, SpriteInteractiveZoneRecord[]>;
  cgs: Array<{
    name: string;
    images: string[];
    triggers?: string[];
  }>;
  createdAt: string;
  updatedAt: string;
}

export interface StudioCharacterUpsertInput {
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
  sprites: Partial<Record<SpriteExpression, string[]>>;
  spriteDepthMaps?: Partial<Record<SpriteExpression, string[]>>;
  spriteAnimationFrames?: Partial<Record<SpriteExpression, SpriteAnimationFrameSetRecord>>;
  customReactions: Array<{
    name: string;
    sprites: string[];
    depthMaps?: string[];
    animationFrames?: SpriteAnimationFrameSetRecord;
    triggers?: string[];
  }>;
  automaticGeneration?: CharacterAutomaticGenerationRecord;
  spriteZones: Record<string, SpriteInteractiveZoneRecord[]>;
  cgs: Array<{
    name: string;
    images: string[];
    triggers?: string[];
  }>;
}

export interface ScenarioSceneRecord {
  id: string;
  name: string;
  backgroundDataUrl: string;
  backgroundDepthMapDataUrl: string;
  bgmDataUrl: string;
  ambientNoiseDataUrl: string;
  ambientNoisePresetId: string;
  ambientNoiseMuffled: boolean;
  weatherPreset: SceneWeatherPreset;
  triggerWords: string[];
}

export interface ScenarioStartingPointRecord {
  id: string;
  name: string;
  sceneId: string;
  startMessage: string;
  specialInstructions: string;
}

export interface OneShotScenarioRecord {
  id: string;
  name: string;
  description: string;
  startMessage: string;
  specialInstructions: string;
  characterId: string;
  bannerDataUrl: string;
  startSceneId: string;
  startingPoints: ScenarioStartingPointRecord[];
  scenes: ScenarioSceneRecord[];
  createdAt: string;
  updatedAt: string;
}

export interface ScenarioSceneUpsertInput {
  id?: string;
  name: string;
  backgroundDataUrl: string;
  backgroundDepthMapDataUrl?: string;
  bgmDataUrl?: string;
  ambientNoiseDataUrl?: string;
  ambientNoisePresetId?: string;
  ambientNoiseMuffled?: boolean;
  weatherPreset?: SceneWeatherPreset;
  triggerWords?: string[];
}

export type SceneWeatherPreset =
  | 'none'
  | 'rain'
  | 'thunderstorm'
  | 'fog'
  | 'snow'
  | 'sakura-petals'
  | 'autumn-leaves';

export interface OneShotScenarioUpsertInput {
  id?: string;
  name: string;
  description: string;
  startMessage: string;
  specialInstructions?: string;
  characterId: string;
  bannerDataUrl?: string;
  startSceneId?: string;
  startingPoints?: Array<{
    id?: string;
    name: string;
    sceneId: string;
    startMessage?: string;
    specialInstructions?: string;
  }>;
  scenes: ScenarioSceneUpsertInput[];
}

export interface ScenarioRunMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface ScenarioRunRecord {
  id: string;
  scenarioId: string;
  title: string;
  messages: ScenarioRunMessage[];
  currentSceneId?: string;
  startingPointId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ScenarioPackageRecord {
  id: string;
  name: string;
  bannerDataUrl: string;
  scenarioId: string;
  characterId: string;
  fileName: string;
  filePath: string;
  source: 'created' | 'imported';
  createdAt: string;
  updatedAt: string;
}

export interface StudioStateRecord {
  version: 1;
  characters: StudioCharacterRecord[];
  scenarios: OneShotScenarioRecord[];
  runs: ScenarioRunRecord[];
  packages: ScenarioPackageRecord[];
  artStylePresets: AutomaticGenerationArtStylePresetRecord[];
}

export const DEFAULT_STUDIO_STATE: StudioStateRecord = {
  version: 1,
  characters: [],
  scenarios: [],
  runs: [],
  packages: [],
  artStylePresets: [],
};

export const DEFAULT_CHARACTER_AUTOMATIC_GENERATION: CharacterAutomaticGenerationRecord = {
  checkpoint: '',
  upscaleModel: '',
  loras: [],
  basePrompt: '',
  negativePrompt: '',
  artStylePrompt: '',
  artStylePresets: [],
  characterMainTags: '',
  upperBodyTags: '',
  waistTags: '',
  openMouthTags: '',
  lowerBodyTags: '',
  expressionVariantCount: 3,
  cgVariantCount: 3,
  steps: 30,
  preferredPenetrationExpression: 'ANY',
  preferredCgExpression: 'ANY',
  lightingColor: 'NEUTRAL',
  breastSize: 'MEDIUM',
  bloomIntensity: 0,
  generateDepthMaps: true,
  generateMouthAnimations: false,
  defaultExpressions: [],
  customExpressions: [],
  cgDefinitions: [],
  generatedPromptBySlot: {},
  resumeState: null,
};

export const SPRITE_EXPRESSIONS: SpriteExpression[] = [
  'DEFAULT',
  'HAPPY',
  'LAUGHING',
  'SAD',
  'ANGRY',
  'ANNOYED',
  'POUTING',
  'THINKING',
  'CONFUSED',
  'FLIRTATIOUS',
  'NAUGHTY',
  'EMBARRASSED',
  'SHOCKED',
  'SCARED',
];
