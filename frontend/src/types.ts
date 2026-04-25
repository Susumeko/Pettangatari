export interface CharacterOption {
  id: string;
  name: string;
  avatar?: string;
  description?: string;
  personality?: string;
  scenario?: string;
  firstMes?: string;
  mesExample?: string;
  systemPrompt?: string;
  postHistoryInstructions?: string;
  creator?: string;
  tags?: string[];
}

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
  | 'SCARED'
  | (string & {});

export interface CustomReaction {
  name: string;
  sprites: string[];
  depthMaps?: string[];
  animationFrames?: SpriteAnimationFrameSet;
  triggers?: string[];
}

export interface AutomaticGenerationLora {
  name: string;
  strength: number;
}

export interface AutomaticGenerationExpression {
  enabled: boolean;
  triggerTag: string;
  prompt: string;
}

export interface AutomaticGenerationDefaultExpression {
  enabled: boolean;
  expression: string;
  prompt: string;
}

export interface AutomaticGenerationCgDefinition {
  enabled: boolean;
  triggerTag: string;
  prompt: string;
  excludeUpperBodyTags: boolean;
  excludeWaistTags: boolean;
  excludeLowerBodyTags: boolean;
}

export interface AutomaticGenerationResumeState {
  mode: 'replace' | 'append';
  nextTaskIndex: number;
  totalTasks: number;
  taskSignature: string;
  appendBaseIndexByAsset: Record<string, number>;
  updatedAt: string;
}

export interface AutomaticGenerationArtStylePreset {
  id: string;
  name: string;
  prompt: string;
  checkpoint: string;
  loras: AutomaticGenerationLora[];
  thumbnailDataUrl?: string;
}

export interface CharacterAutomaticGenerationSettings {
  checkpoint: string;
  upscaleModel: string;
  loras: AutomaticGenerationLora[];
  basePrompt: string;
  negativePrompt: string;
  artStylePrompt: string;
  artStylePresets: AutomaticGenerationArtStylePreset[];
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
  defaultExpressions: AutomaticGenerationDefaultExpression[];
  customExpressions: AutomaticGenerationExpression[];
  cgDefinitions: AutomaticGenerationCgDefinition[];
  generatedPromptBySlot: Record<string, string>;
  resumeState?: AutomaticGenerationResumeState | null;
}

export interface SpriteAnimationFrameSet {
  closedEyes: string[];
  openMouth: string[];
}

export interface SpriteInteractiveZone {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  prompt: string;
}

export interface SessionAffinityOptions {
  enabled: boolean;
  startingValue: number;
  minimumValue: number;
  maximumValue: number;
}

export interface SessionLustOptions {
  enabled: boolean;
  startingValue: number;
  maximumValue: number;
}

export interface StartRunOptions {
  startingPointId?: string;
  affinity?: SessionAffinityOptions;
  lust?: SessionLustOptions;
}

export interface CharacterCg {
  name: string;
  images: string[];
  triggers?: string[];
}

export type SceneWeatherPreset =
  | 'none'
  | 'rain'
  | 'thunderstorm'
  | 'fog'
  | 'snow'
  | 'sakura-petals'
  | 'autumn-leaves';

export interface StudioCharacter {
  id: string;
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
  spriteDepthMaps: Partial<Record<SpriteExpression, string[]>>;
  spriteAnimationFrames: Partial<Record<SpriteExpression, SpriteAnimationFrameSet>>;
  customReactions: CustomReaction[];
  automaticGeneration: CharacterAutomaticGenerationSettings;
  spriteZones: Record<string, SpriteInteractiveZone[]>;
  cgs: CharacterCg[];
  createdAt: string;
  updatedAt: string;
}

export interface ScenarioScene {
  id: string;
  name: string;
  backgroundDataUrl: string;
  backgroundDepthMapDataUrl?: string;
  bgmDataUrl?: string;
  ambientNoiseDataUrl?: string;
  ambientNoisePresetId?: string;
  ambientNoiseMuffled?: boolean;
  weatherPreset?: SceneWeatherPreset;
  triggerWords: string[];
}

export interface ScenarioStartingPoint {
  id: string;
  name: string;
  sceneId: string;
  startMessage: string;
  specialInstructions: string;
}

export interface OneShotScenario {
  id: string;
  name: string;
  description: string;
  startMessage: string;
  specialInstructions: string;
  characterId: string;
  bannerDataUrl?: string;
  startSceneId?: string;
  startingPoints?: ScenarioStartingPoint[];
  scenes: ScenarioScene[];
  createdAt: string;
  updatedAt: string;
}

export interface ScenarioRun {
  id: string;
  scenarioId: string;
  title: string;
  messages: ConversationMessage[];
  currentSceneId?: string;
  startingPointId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ScenarioPackage {
  id: string;
  name: string;
  bannerDataUrl?: string;
  scenarioId: string;
  characterId: string;
  fileName: string;
  filePath: string;
  source: 'created' | 'imported';
  createdAt: string;
  updatedAt: string;
}

export interface RuntimeInfo {
  model: string;
  chatCompletionSource: string;
  mainApi?: string;
}

export interface SillyTavernConnectionInfo {
  baseUrl: string;
  online: boolean;
  error?: string;
}

export interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface SelectedCharacterPayload {
  name: string;
  description?: string;
  personality?: string;
  scenario?: string;
  first_mes?: string;
  mes_example?: string;
  system_prompt?: string;
  post_history_instructions?: string;
}
