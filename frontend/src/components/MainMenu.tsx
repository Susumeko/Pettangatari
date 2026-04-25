import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import Cropper, { type Area } from 'react-easy-crop';
import { BLIP_OPTIONS, BLIP_OPTION_MAP, type BlipOption } from '../blips';
import { AMBIENT_PRESET_OPTIONS } from '../ambient';
import { renderPerLetterQuoteAnimationText, shouldRenderPerLetterQuoteAnimation } from './AnimatedQuoteText';
import { DepthParallaxImage } from './DepthSpritePreview';
import { GameplaySettingsContent } from './GameplaySettingsMenu';
import { type GameplaySettings } from '../gameplaySettings';
import {
  DEFAULT_INTERFACE_SETTINGS,
  ROLEPLAY_LANGUAGE_OPTIONS,
  type InterfaceSettings,
} from '../interfaceSettings';
import {
  DEFAULT_DIALOGUE_QUOTE_FONT_ID,
  DIALOGUE_QUOTE_FONT_OPTIONS,
  ensureDialogueQuoteFontStylesheet,
  getDialogueQuoteFontFamily,
  getDialogueQuoteFontOption,
} from '../quoteFonts';
import {
  DEFAULT_DIALOGUE_QUOTE_ANIMATION_COLOR,
  DEFAULT_DIALOGUE_QUOTE_ANIMATION_PRESET,
  DEFAULT_DIALOGUE_QUOTE_ANIMATION_SPEED,
  DIALOGUE_QUOTE_ANIMATION_OPTIONS,
  getDialogueQuoteAnimationClass,
  normalizeDialogueQuoteAnimationColor,
  normalizeDialogueQuoteAnimationPreset,
  normalizeDialogueQuoteAnimationSpeed,
} from '../quoteTextEffects';
import exampleDownloadImage from '../guide/exampledownload.jpg';
import koboldcppGuideImage from '../guide/koboldcpp.jpg';
import sillyTavernChatGuideImage from '../guide/sillytavernchat.jpg';
import sillyTavernConnectionGuideImage from '../guide/sillytavernconnection.jpg';
import {
  deleteGeneratedComfyAssets,
  fetchComfyOptions,
  fetchExampleAutomaticGenerationConfig,
  generateComfyDepthMap,
  generateComfyImage,
  updateComfyConnection,
} from '../api/client';
import type {
  AutomaticGenerationArtStylePreset,
  CharacterAutomaticGenerationSettings,
  CharacterOption,
  OneShotScenario,
  ScenarioPackage,
  ScenarioRun,
  SceneWeatherPreset,
  StartRunOptions,
  SillyTavernConnectionInfo,
  SpriteAnimationFrameSet,
  SpriteInteractiveZone,
  StudioCharacter,
} from '../types';
import addIcon from '../icons/plus-circle.svg';
import backIcon from '../icons/arrow-left-circle.svg';
import closeIcon from '../icons/x-circle.svg';
import colorIcon from '../icons/color-swatch.svg';
import deleteIcon from '../icons/delete.svg';
import descriptionIcon from '../icons/document.svg';
import clipboardIcon from '../icons/clipboard.svg';
import editIcon from '../icons/pencil.svg';
import duplicateIcon from '../icons/duplicate.svg';
import folderIcon from '../icons/folder.svg';
import helpCircleIcon from '../icons/help-circle.svg';
import heartIcon from '../icons/heart.svg';
import imageIcon from '../icons/photo.svg';
import mapIcon from '../icons/map.svg';
import refreshIcon from '../icons/refresh.svg';
import nameIcon from '../icons/document-text.svg';
import pauseIcon from '../icons/pause-circle.svg';
import playIcon from '../icons/play-circle.svg';
import resumeIcon from '../icons/play.svg';
import saveIcon from '../icons/floppy.svg';
import settingsIcon from '../icons/adjustments.svg';
import alertTriangleIcon from '../icons/alert-triangle.svg';
import eyeIcon from '../icons/eye.svg';
import speakerIcon from '../icons/speaker.svg';
import triggerIcon from '../icons/cursor-click.svg';
import userIcon from '../icons/user.svg';
import userSquareIcon from '../icons/user-square.svg';
import uploadIcon from '../icons/cloud-upload.svg';

const SPRITE_EXPRESSIONS = [
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
  'EMBARRASSED',
  'SHOCKED',
  'SCARED',
] as const;
const DEFAULT_CHARACTER_ACCENT_COLOR = '#d4d8df';
const ASSET_VARIANT_COUNT = 10;
const ASSET_VARIANT_INDEXES = Array.from({ length: ASSET_VARIANT_COUNT }, (_, index) => index);
const DEFAULT_EXPRESSION_VARIANT_COUNT = 1;
const DEFAULT_CG_VARIANT_COUNT = 1;
const DEFAULT_AUTOGEN_STEPS = 30;
const ARTSTYLE_PREVIEW_PROMPT = 'cowboy shot, looking at viewer, light smile';
const GETTING_STARTED_HIDE_STORAGE_KEY = 'pettangatari-hide-getting-started';
const MOUTH_ANIMATION_WARNING_HIDE_STORAGE_KEY = 'pettangatari-hide-mouth-animation-warning';
const EXAMPLE_PACKAGE_DOWNLOAD_URL = 'https://mega.nz/file/oZZxVALJ#Xyge0CmrbOS-Lsn2Rsc-FvzI2B2To-UZi-dBWlWsv7g';
const KOBOLDCPP_GITHUB_URL = 'https://github.com/LostRuins/koboldcpp';
const GEMMA_MODEL_URL = 'https://huggingface.co/TrevorJS/gemma-4-31B-it-uncensored-GGUF';
const TOONOUT_URL = 'https://huggingface.co/joelseytre/toonout';
const CG_DEFINITION_PROMPT_PREFIX = 'simple_background';
const SPRITE_GENERATION_SECONDS_WITHOUT_FACEDETAILER = 35;
const CG_GENERATION_SECONDS = 40;
const GENERATION_SECONDS_WITH_FACEDETAILER = 60;
const MOUTH_ANIMATION_GENERATION_SECONDS = 25;
const SCENARIO_LAZY_PROMPT_TEXT = `Write a .json file with [number locations] locations that would fit a roleplay session with [fictional character], if indoors, use the ambient noise that would fit the exterior of said place but set muffled to true. Chose from the following ambient noises: apartment, indoors with crowd, jungle, morning city, morning outdoors, night city, night outdoors. Do NOT set muffled to apartment or indoors with crowd.

Output it with this .json format:
{
  "version": 1,
  "presetType": "scenario-scene-generation",
  "checkpoint": "animaOfficial_preview3Base.safetensors",
  "generateDepthMaps": true,
  "places": [
    {
      "locationName": "Example Place",
      "prompt": "indoors, room, bed, desk, computer, window, curtains, carpet",
      "triggerWordsInput": "room, my house, bedroom",
      "ambientNoiseDataUrl": "",
      "ambientNoisePresetId": "apartment",
      "ambientNoiseMuffled": false,
      "generatedSceneId": ""
    }
  ]
}`;
const PREFERRED_CG_EXPRESSION_OPTIONS = [
  { value: 'ANY', label: 'Any', tag: '' },
  { value: 'HAPPY', label: 'Happy', tag: 'happy' },
  { value: 'ANNOYED', label: 'Annoyed', tag: 'annoyed' },
  { value: 'EXPRESSIONLESS', label: 'Expressionless', tag: 'expressionless' },
  { value: 'CRYING', label: 'Crying', tag: 'crying' },
  { value: 'LIGHT_SMILE', label: 'Light Smile', tag: 'light smile' },
  { value: 'NAUGHTY_FACE', label: 'Naughty Face', tag: 'naughty face' },
  { value: 'AHEGAO', label: 'Ahegao', tag: 'ahegao' },
] as const;
const LIGHTING_COLOR_OPTIONS = [
  { value: 'NEUTRAL', label: 'Neutral', tag: 'white background' },
  { value: 'BLUE', label: 'Blue', tag: 'blue background' },
  { value: 'RED', label: 'Red', tag: 'red background' },
  { value: 'PURPLE', label: 'Purple', tag: 'purple background' },
  { value: 'ORANGE', label: 'Orange', tag: 'orange background' },
  { value: 'YELLOW', label: 'Yellow', tag: 'yellow background' },
  { value: 'GREEN', label: 'Green', tag: 'green background' },
  { value: 'PINK', label: 'Pink', tag: 'pink background' },
] as const;
const BREAST_SIZE_OPTIONS = [
  { value: 'FLAT', label: 'Flat', tag: 'flat chest' },
  { value: 'SMALL', label: 'Small', tag: 'small breasts' },
  { value: 'MEDIUM', label: 'Medium', tag: 'medium breasts' },
  { value: 'LARGE', label: 'Large', tag: 'large breasts' },
  { value: 'HUGE', label: 'Huge', tag: 'huge breasts' },
  { value: 'GIGANTIC', label: 'Gigantic', tag: 'gigantic breasts' },
] as const;
const SCENE_WEATHER_PRESET_OPTIONS: Array<{ id: SceneWeatherPreset; label: string }> = [
  { id: 'none', label: 'None' },
  { id: 'rain', label: 'Rain' },
  { id: 'thunderstorm', label: 'Thunderstorm' },
  { id: 'fog', label: 'Fog' },
  { id: 'snow', label: 'Snow' },
  { id: 'sakura-petals', label: 'Sakura Petals' },
  { id: 'autumn-leaves', label: 'Autumn Leaves' },
];
type SpriteExpression = (typeof SPRITE_EXPRESSIONS)[number];
type TabId = 'character-creator' | 'scenario-creator' | 'packages' | 'play';
type CharacterView = 'list' | 'editor';
type ScenarioView = 'list' | 'editor';
type PlayView = 'list' | 'new-run';
type CharacterEditorSubTab = 'manual' | 'automatic';
type ScenarioEditorSubTab = 'manual' | 'automatic';
type GettingStartedPageId =
  | 'intro'
  | 'koboldcpp'
  | 'sillytavern'
  | 'example-package'
  | 'sprite-workflow'
  | 'cg-workflow'
  | 'finish';
type HsvColor = {
  h: number;
  s: number;
  v: number;
};
type ConfirmState = {
  title: string;
  description: string;
  confirmLabel: string;
  successMessage?: string;
  variant?: 'package-delete';
  action: () => Promise<void>;
};

type Toast = {
  id: string;
  kind: 'error' | 'success';
  message: string;
};

type BottomProgressState = {
  label: string;
  value: number;
  tone: 'active' | 'success' | 'error';
};

type GuideSpriteTestState = {
  generating: boolean;
  imageDataUrl: string;
  errorMessage: string | null;
};

type GettingStartedPage = {
  id: GettingStartedPageId;
  title: string;
  eyebrow: string;
};

interface CharacterFormState {
  id?: string;
  cardName: string;
  name: string;
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
  sprites: Record<string, string[]>;
  spriteDepthMaps: Record<string, string[]>;
  spriteAnimationFrames: Record<string, SpriteAnimationFrameSet>;
  spriteZones: Record<string, SpriteInteractiveZone[]>;
  customReactions: Array<{
    id: string;
    triggersInput: string;
  }>;
  cgs: Array<{
    id: string;
    triggersInput: string;
  }>;
  automaticGeneration: CharacterAutomaticGenerationSettings;
}

interface ScenarioFormState {
  id?: string;
  name: string;
  description: string;
  startMessage: string;
  specialInstructions: string;
  characterId: string;
  bannerDataUrl: string;
  startSceneId: string;
  startingPoints: Array<{
    id: string;
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
    weatherPreset?: SceneWeatherPreset;
    triggerWordsInput: string;
  }>;
}

type ComfyConnectionState = 'checking' | 'online' | 'offline';

type ScenarioAutoPlaceDraft = {
  id: string;
  locationName: string;
  prompt: string;
  triggerWordsInput: string;
  ambientNoiseDataUrl: string;
  ambientNoisePresetId: string;
  ambientNoiseMuffled: boolean;
  generatedSceneId?: string;
};

type GeneratedThumbnail = {
  id: string;
  label: string;
  kind: 'sprite' | 'cg';
  variantNumber: number;
  dataUrl?: string;
  depthMapDataUrl?: string;
  status: 'pending' | 'done' | 'failed';
};

type GenerationTask = {
  kind: 'sprite' | 'cg';
  label: string;
  triggerTag: string;
  promptAddition: string;
  variantNumber: number;
  assetKey: string;
};
type BuildPromptOptions = {
  artStylePromptOverride?: string;
  promptAdditionOverride?: string;
  ignoreLowerBodyTags?: boolean;
};
type PromptPreviewOptions = BuildPromptOptions & {
  checkpointOverride?: string;
  lorasOverride?: CharacterAutomaticGenerationSettings['loras'];
  previewLabel?: string;
  skipDepthMapGeneration?: boolean;
};

type GenerationWriteMode = 'replace' | 'append';
type ManualGenerationMode = 'regenerate' | 'generate-new';
type ManualGenerationDialogState = {
  assetKey: string;
  variantIndex: number;
  mode: ManualGenerationMode;
  generateMouthAnimations: boolean;
};

type MouthAnimationWarningDialogState = {
  target: 'automatic' | 'manual';
  doNotShowAgain: boolean;
};

type GeneratedSpriteFileSet = {
  imageFilePath?: string;
  depthMapFilePath?: string;
  openMouthFilePath?: string;
};

type RunStartingPointDialogState = {
  scenarioId: string;
  selectedStartingPointId?: string;
  affinityEnabled: boolean;
  affinityStartingValue: number;
  affinityMinimumValue: number;
  affinityMaximumValue: number;
  lustEnabled: boolean;
  lustStartingValue: number;
  lustMaximumValue: number;
};

type ComfyMissingNodeState = {
  workflowKind: 'sprite' | 'cg';
  nodeId: number;
  nodeType: string;
  nodeTitle: string;
};

function describeNegativeAffinityLimit(value: number): { title: string; detail: string } {
  if (value === 0) {
    return {
      title: 'No changes',
      detail:
        'This cap disables negative affinity changes.',
    };
  }
  if (value <= -120) {
    return {
      title: 'Lowest allowed affinity: murder intent',
      detail:
        '{{char}} can escalate into active murderous intent toward {{user}}. Responses may carry lethal fixation, willingness to hunt, and a clear desire to seriously harm or kill {{user}} if the scene permits it.',
    };
  }
  if (value <= -100) {
    return {
      title: 'Lowest allowed affinity: pure hatred',
      detail:
        '{{char}} can become openly hostile, insulting, cruel, and eager to cuss at {{user}}. Warmth, patience, and benefit of the doubt can disappear unless survival or hard scene constraints force cooperation.',
    };
  }
  if (value <= -80) {
    return {
      title: 'Lowest allowed affinity: strong dislike',
      detail:
        '{{char}} can be rude, contemptuous, harsh, and quick to assume bad intent, but the full pure-hatred band is blocked.',
    };
  }
  if (value <= -60) {
    return {
      title: 'Lowest allowed affinity: cold antagonism',
      detail:
        '{{char}} may be distrustful, dismissive, sarcastic, and reluctant to help, but not outright hateful or vicious.',
    };
  }
  if (value <= -40) {
    return {
      title: 'Lowest allowed affinity: irritated and guarded',
      detail:
        '{{char}} may be impatient, skeptical, and emotionally distant, but will not escalate into cold contempt or direct hostility.',
    };
  }
  return {
    title: 'Lowest allowed affinity: uneasy or neutral',
    detail:
      '{{char}} may be cautious, reserved, and fragile in trust, but true hostility, contempt, and hatred are cut off by this cap.',
  };
}

function describePositiveAffinityLimit(value: number): { title: string; detail: string } {
  if (value === 0) {
    return {
      title: 'No changes',
      detail:
        'This cap disables positive affinity changes.',
    };
  }
  if (value >= 120) {
    return {
      title: 'Highest allowed affinity: stalker',
      detail:
        '{{char}} can escalate past devotion into stalker behavior toward {{user}}. Expect obsessive watching, refusal to let go, invasive attachment, and a dangerous need to stay involved in every part of {{user}}\'s life.',
    };
  }
  if (value >= 81) {
    return {
      title: 'Highest allowed affinity: absolute devotion',
      detail:
        '{{char}} can become absolutely in love with {{user}}, intensely devoted, clingy, possessive, and emotionally dependent.',
    };
  }
  if (value >= 61) {
    return {
      title: 'Highest allowed affinity: deep attachment',
      detail:
        '{{char}} can become deeply attached, strongly affectionate, eager for closeness, somewhat jealous, and very focused on pleasing or comforting {{user}}, but not fully all-consuming.',
    };
  }
  if (value >= 41) {
    return {
      title: 'Highest allowed affinity: affectionate and invested',
      detail:
        '{{char}} may become openly warm, trusting, supportive, protective, and naturally tender, but not deeply clingy or obsessive.',
    };
  }
  if (value >= 21) {
    return {
      title: 'Highest allowed affinity: friendly warmth',
      detail:
        '{{char}} may generally like {{user}}, act friendly and relaxed, and interpret actions generously, but stronger affection is blocked.',
    };
  }
  if (value >= 1) {
    return {
      title: 'Highest allowed affinity: tentative openness',
      detail:
        '{{char}} may be polite, mildly warm, and somewhat open, but still restrained and not deeply trusting or affectionate.',
    };
  }
  return {
    title: 'Highest allowed affinity: neutral or uncertain',
    detail:
      '{{char}} stays in neutral or uneasy territory. Genuine liking, affection, and attachment are all blocked by this cap.',
  };
}

function describeLustLimit(value: number): { title: string; detail: string } {
  if (value === 0) {
    return {
      title: 'No changes',
      detail:
        'This cap disables lust changes.',
    };
  }
  if (value >= 81) {
    return {
      title: 'Highest allowed band: sexually obsessive',
      detail:
        '{{char}} can become intensely horny, eager to initiate sexual acts quickly, verbally explicit, and fixated on turning interactions sexual whenever the scene allows it.',
    };
  }
  if (value >= 61) {
    return {
      title: 'Highest allowed band: openly lustful',
      detail:
        '{{char}} can become strongly lustful, bold about sexual tension, eager to flirt physically, and much more willing to initiate sexual contact.',
    };
  }
  if (value >= 41) {
    return {
      title: 'Highest allowed band: heated desire',
      detail:
        '{{char}} can become visibly turned on, more teasing and suggestive, and increasingly willing to escalate intimate touching or sexual invitations.',
    };
  }
  if (value >= 21) {
    return {
      title: 'Highest allowed band: suggestive interest',
      detail:
        '{{char}} can show clear sexual interest, flirt more obviously, and use lightly horny wording, but still stops short of aggressive initiation.',
    };
  }
  return {
    title: 'Highest allowed band: restrained',
    detail:
      '{{char}} stays mostly restrained. Sexual talk and initiative remain limited, subdued, or easy to redirect.',
  };
}

interface MainMenuProps {
  stCards: CharacterOption[];
  characters: StudioCharacter[];
  scenarios: OneShotScenario[];
  runs: ScenarioRun[];
  packages: ScenarioPackage[];
  artStylePresets: AutomaticGenerationArtStylePreset[];
  sillyTavernConnection: SillyTavernConnectionInfo;
  gameplaySettings: GameplaySettings;
  interfaceSettings: InterfaceSettings;
  loading: boolean;
  error: string | null;
  onUpdateSillyTavernConnection: (baseUrl: string) => Promise<void>;
  onRefreshSillyTavernCards: () => Promise<void>;
  onGameplaySettingsChange: (nextSettings: GameplaySettings) => void;
  onInterfaceSettingsChange: (nextSettings: InterfaceSettings) => void;
  onArtStylePresetsChange: (nextPresets: AutomaticGenerationArtStylePreset[]) => Promise<void>;
  onSaveCharacter: (payload: {
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
    automaticGeneration: CharacterAutomaticGenerationSettings;
    spriteZones: Record<string, SpriteInteractiveZone[]>;
    cgs: Array<{ name: string; images: string[]; triggers?: string[] }>;
  }) => Promise<void>;
  onDeleteCharacter: (characterId: string) => Promise<void>;
  onSaveScenario: (payload: {
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
      weatherPreset?: SceneWeatherPreset;
      triggerWords: string[];
    }>;
  }) => Promise<void>;
  onDeleteScenario: (scenarioId: string) => Promise<void>;
  onStartRun: (scenarioId: string, options?: StartRunOptions) => Promise<void>;
  onResumeRun: (runId: string) => Promise<void>;
  onReplayRun: (runId: string) => Promise<void>;
  onDeleteRun: (runId: string) => Promise<void>;
  onCreatePackage: (scenarioId: string, options?: { packageName?: string }) => Promise<void>;
  onImportPackage: (fileName: string, packageData: string) => Promise<void>;
  onRevealPackage: (packageId: string) => Promise<void>;
  onDeletePackage: (
    packageId: string,
    options?: {
      deleteCharacters?: boolean;
      deleteScenarios?: boolean;
    },
  ) => Promise<void>;
}

function createEmptyExpressionVariantMap(): Record<SpriteExpression, string[]> {
  return SPRITE_EXPRESSIONS.reduce(
    (result, expression) => ({
      ...result,
      [expression]: [],
    }),
    {} as Record<SpriteExpression, string[]>,
  );
}

function createSpriteVariantMap(source: Partial<Record<string, string[]>> | undefined): Record<SpriteExpression, string[]> {
  return Object.fromEntries(
    SPRITE_EXPRESSIONS.map((expression) => [expression, normalizeAssetVariants(source?.[expression])]),
  ) as Record<SpriteExpression, string[]>;
}

function createSpriteDepthMapVariantMap(
  source: Partial<Record<string, string[]>> | undefined,
  sprites: Partial<Record<string, string[]>>,
): Record<SpriteExpression, string[]> {
  return Object.fromEntries(
    SPRITE_EXPRESSIONS.map((expression) => [
      expression,
      normalizeDepthMapVariants(source?.[expression], normalizeAssetVariants(sprites[expression]).length),
    ]),
  ) as Record<SpriteExpression, string[]>;
}

function normalizeSpriteAnimationFrameSet(
  value: SpriteAnimationFrameSet | undefined,
  spriteCount = ASSET_VARIANT_COUNT,
): SpriteAnimationFrameSet {
  return {
    closedEyes: normalizeAssetVariants(value?.closedEyes).slice(0, spriteCount),
    openMouth: normalizeAssetVariants(value?.openMouth).slice(0, spriteCount),
  };
}

function createSpriteAnimationFrameMap(
  source: Partial<Record<string, SpriteAnimationFrameSet>> | undefined,
  sprites: Partial<Record<string, string[]>>,
): Record<SpriteExpression, SpriteAnimationFrameSet> {
  return Object.fromEntries(
    SPRITE_EXPRESSIONS.map((expression) => [
      expression,
      normalizeSpriteAnimationFrameSet(source?.[expression], normalizeAssetVariants(sprites[expression]).length),
    ]),
  ) as Record<SpriteExpression, SpriteAnimationFrameSet>;
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

function createEmptyCharacterForm(cardName = '', defaultName = ''): CharacterFormState {
  const emptyExpressionVariants = createEmptyExpressionVariantMap();
  const emptyAnimationFrames = createSpriteAnimationFrameMap({}, emptyExpressionVariants);

  return {
    cardName,
    name: defaultName,
    accentColor: DEFAULT_CHARACTER_ACCENT_COLOR,
    suggestedAffinityPositiveMaximum: 100,
    suggestedAffinityNegativeMaximum: -100,
    suggestedLustMaximum: 60,
    characterNameFontId: DEFAULT_DIALOGUE_QUOTE_FONT_ID,
    characterNameColor: DEFAULT_CHARACTER_ACCENT_COLOR,
    blipSound: '',
    dialogueQuoteFontId: DEFAULT_DIALOGUE_QUOTE_FONT_ID,
    dialogueQuoteAnimationPreset: DEFAULT_DIALOGUE_QUOTE_ANIMATION_PRESET,
    dialogueQuoteAnimationSpeed: DEFAULT_DIALOGUE_QUOTE_ANIMATION_SPEED,
    dialogueQuoteAnimationColor: DEFAULT_DIALOGUE_QUOTE_ANIMATION_COLOR,
    sprites: { ...emptyExpressionVariants },
    spriteDepthMaps: { ...emptyExpressionVariants },
    spriteAnimationFrames: { ...emptyAnimationFrames },
    spriteZones: {},
    customReactions: [],
    cgs: [],
    automaticGeneration: createDefaultAutomaticGenerationSettings(),
  };
}

function createDefaultAutomaticGenerationSettings(): CharacterAutomaticGenerationSettings {
  const expressionPrompts: Record<SpriteExpression, string> = {
    DEFAULT: 'full body, standing, facing viewer, light smile, solo',
    HAPPY: 'full body, standing, facing viewer, happy, open mouth, solo',
    LAUGHING: 'full body, standing, facing viewer, laughing, open mouth, solo',
    SAD: 'full body, standing, facing viewer, sad, solo',
    ANGRY: 'full body, standing, facing viewer, angry, solo',
    ANNOYED: 'full body, standing, facing viewer, annoyed, solo',
    POUTING: 'full body, standing, facing viewer, pouting, solo',
    THINKING: 'full body, standing, facing viewer, thinking, solo',
    CONFUSED: 'full body, standing, facing viewer, confused, solo',
    FLIRTATIOUS: 'full body, standing, facing viewer, naughty face, seductive, solo',
    EMBARRASSED: 'full body, standing, facing viewer, embarrassed, solo',
    SHOCKED: 'full body, standing, facing viewer, shocked, solo',
    SCARED: 'full body, standing, facing viewer, scared, solo',
  };
  const defaultExpressions = SPRITE_EXPRESSIONS.map((expression) => ({
    enabled: true,
    expression,
    prompt: normalizeDefaultExpressionPrompt(expression, expressionPrompts[expression] || expression),
  }));

  return {
    checkpoint: '',
    upscaleModel: '',
    loras: [],
    basePrompt: 'masterpiece, best quality, score_7.',
    negativePrompt: '',
    artStylePrompt: '',
    artStylePresets: [],
    characterMainTags: '',
    upperBodyTags: '',
    waistTags: '',
    openMouthTags: '',
    lowerBodyTags: '',
    expressionVariantCount: DEFAULT_EXPRESSION_VARIANT_COUNT,
    cgVariantCount: DEFAULT_CG_VARIANT_COUNT,
    steps: DEFAULT_AUTOGEN_STEPS,
    preferredPenetrationExpression: 'ANY',
    preferredCgExpression: 'ANY',
    lightingColor: 'NEUTRAL',
    breastSize: 'MEDIUM',
    bloomIntensity: 0,
    generateDepthMaps: true,
    generateMouthAnimations: false,
    defaultExpressions,
    customExpressions: [],
    cgDefinitions: [],
    generatedPromptBySlot: {},
    resumeState: null,
  };
}

function normalizeDepthMapVariants(value: unknown, maxLength = ASSET_VARIANT_COUNT): string[] {
  return (Array.isArray(value) ? value : [])
    .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
    .filter(Boolean)
    .slice(0, maxLength);
}

function normalizeAutomaticGenerationSettings(
  value: CharacterAutomaticGenerationSettings | undefined,
): CharacterAutomaticGenerationSettings {
  if (!value) {
    return createDefaultAutomaticGenerationSettings();
  }

  return {
    checkpoint: value.checkpoint || '',
    upscaleModel: value.upscaleModel || '',
    loras: Array.isArray(value.loras)
      ? value.loras
          .map((entry) => ({
            name: (entry?.name || '').trim(),
            strength: Number.isFinite(entry?.strength) ? Math.min(Math.max(entry.strength, -4), 4) : 1,
          }))
          .filter((entry) => entry.name)
      : [],
    basePrompt: value.basePrompt || '',
    negativePrompt: value.negativePrompt || '',
    artStylePrompt: value.artStylePrompt || '',
    artStylePresets: Array.isArray(value.artStylePresets)
      ? value.artStylePresets
          .map((entry, index) => ({
            id: `${entry?.id || ''}`.trim() || createFormLocalId(`style-${index + 1}`),
            name: `${entry?.name || ''}`.trim().slice(0, 60),
            prompt: `${entry?.prompt || ''}`.trim(),
            checkpoint: `${entry?.checkpoint || ''}`.trim(),
            loras: Array.isArray(entry?.loras)
              ? entry.loras
                  .map((lora) => ({
                    name: `${lora?.name || ''}`.trim(),
                    strength: Number.isFinite(lora?.strength) ? Math.min(Math.max(lora.strength, -4), 4) : 1,
                  }))
                  .filter((lora) => lora.name)
              : [],
            thumbnailDataUrl:
              typeof entry?.thumbnailDataUrl === 'string' && entry.thumbnailDataUrl.startsWith('data:image/')
                ? entry.thumbnailDataUrl
                : undefined,
          }))
          .filter((entry) => entry.name && entry.prompt)
      : [],
    characterMainTags: value.characterMainTags || '',
    upperBodyTags: value.upperBodyTags || '',
    waistTags: value.waistTags || '',
    openMouthTags: value.openMouthTags || '',
    lowerBodyTags: value.lowerBodyTags || '',
    expressionVariantCount: Number.isFinite(value.expressionVariantCount)
      ? clampNumber(Math.round(value.expressionVariantCount), 0, ASSET_VARIANT_COUNT)
      : DEFAULT_EXPRESSION_VARIANT_COUNT,
    cgVariantCount: Number.isFinite(value.cgVariantCount)
      ? clampNumber(Math.round(value.cgVariantCount), 0, ASSET_VARIANT_COUNT)
      : DEFAULT_CG_VARIANT_COUNT,
    steps: Number.isFinite(value.steps) ? clampNumber(Math.round(value.steps), 1, 150) : DEFAULT_AUTOGEN_STEPS,
    preferredPenetrationExpression: normalizePreferredCgExpressionValue(
      value.preferredPenetrationExpression ?? value.preferredCgExpression,
    ),
    preferredCgExpression: Object.prototype.hasOwnProperty.call(value, 'preferredPenetrationExpression')
      ? normalizePreferredCgExpressionValue(value.preferredCgExpression)
      : 'ANY',
    lightingColor: normalizeLightingColorValue(value.lightingColor),
    breastSize: normalizeBreastSizeValue(value.breastSize),
    bloomIntensity: normalizeBloomIntensityValue(value.bloomIntensity),
    generateDepthMaps: typeof value.generateDepthMaps === 'boolean' ? value.generateDepthMaps : true,
    generateMouthAnimations:
      typeof value.generateMouthAnimations === 'boolean'
        ? value.generateMouthAnimations
        : typeof (value as { generateBlinkingAndTalking?: unknown }).generateBlinkingAndTalking === 'boolean'
          ? (value as unknown as { generateBlinkingAndTalking: boolean }).generateBlinkingAndTalking
          : false,
    defaultExpressions: (() => {
      const defaults = createDefaultAutomaticGenerationSettings().defaultExpressions;
      const incoming = Array.isArray(value.defaultExpressions)
        ? value.defaultExpressions
            .map((entry) => ({
              enabled: entry?.enabled !== false,
              expression: normalizeExpressionLabel(entry?.expression || ''),
              prompt: (entry?.prompt || '').trim(),
            }))
            .filter((entry) => entry.expression)
        : [];
      const byExpression = new Map(incoming.map((entry) => [entry.expression, entry]));

      return defaults.map((entry) => ({
        enabled: byExpression.get(entry.expression)?.enabled !== false,
        expression: entry.expression,
        prompt: normalizeDefaultExpressionPrompt(entry.expression, byExpression.get(entry.expression)?.prompt || entry.prompt),
      }));
    })(),
    customExpressions: Array.isArray(value.customExpressions)
      ? value.customExpressions
          .map((entry) => ({
            enabled: entry?.enabled !== false,
            triggerTag: normalizeReactionName(entry?.triggerTag || ''),
            prompt: (entry?.prompt || '').trim(),
          }))
          .filter((entry) => entry.triggerTag)
      : [],
    cgDefinitions: Array.isArray(value.cgDefinitions)
      ? value.cgDefinitions
          .map((entry) => ({
            enabled: entry?.enabled !== false,
            triggerTag: normalizeReactionName(entry?.triggerTag || ''),
            prompt: (entry?.prompt || '').trim(),
            excludeUpperBodyTags: entry?.excludeUpperBodyTags === true,
            excludeWaistTags: entry?.excludeWaistTags === true,
            excludeLowerBodyTags: entry?.excludeLowerBodyTags === true,
          }))
          .filter((entry) => entry.triggerTag)
      : [],
    generatedPromptBySlot:
      value.generatedPromptBySlot && typeof value.generatedPromptBySlot === 'object'
        ? Object.fromEntries(
            Object.entries(value.generatedPromptBySlot)
              .map(([slotKey, prompt]) => [slotKey.trim(), `${prompt || ''}`.trim()] as const)
              .filter(([slotKey, prompt]) => slotKey && prompt),
          )
        : {},
    resumeState:
      value.resumeState &&
      (value.resumeState.mode === 'replace' || value.resumeState.mode === 'append') &&
      Number.isFinite(value.resumeState.nextTaskIndex) &&
      Number.isFinite(value.resumeState.totalTasks) &&
      typeof value.resumeState.taskSignature === 'string' &&
      value.resumeState.taskSignature.trim()
        ? {
            mode: value.resumeState.mode,
            nextTaskIndex: Math.max(0, Math.round(value.resumeState.nextTaskIndex)),
            totalTasks: Math.max(0, Math.round(value.resumeState.totalTasks)),
            taskSignature: value.resumeState.taskSignature.trim(),
            appendBaseIndexByAsset:
              value.resumeState.appendBaseIndexByAsset && typeof value.resumeState.appendBaseIndexByAsset === 'object'
                ? Object.fromEntries(
                    Object.entries(value.resumeState.appendBaseIndexByAsset)
                      .map(([assetKey, index]) => [
                        assetKey.trim(),
                        Number.isFinite(index) ? Math.max(0, Math.round(Number(index))) : -1,
                      ] as const)
                      .filter(([assetKey, index]) => assetKey && index >= 0),
                  )
                : {},
            updatedAt: typeof value.resumeState.updatedAt === 'string' ? value.resumeState.updatedAt : new Date().toISOString(),
          }
        : null,
  };
}

function normalizeSuggestedAffinityPositiveMaximum(value: unknown): number | undefined {
  const numeric = typeof value === 'number' ? value : Number.parseFloat(`${value ?? ''}`);
  if (!Number.isFinite(numeric)) {
    return undefined;
  }
  return clampNumber(Math.round(numeric), 0, 120);
}

function normalizeSuggestedAffinityNegativeMaximum(value: unknown): number | undefined {
  const numeric = typeof value === 'number' ? value : Number.parseFloat(`${value ?? ''}`);
  if (!Number.isFinite(numeric)) {
    return undefined;
  }
  return clampNumber(Math.round(numeric), -120, 0);
}

function normalizeSuggestedLustMaximum(value: unknown): number | undefined {
  const numeric = typeof value === 'number' ? value : Number.parseFloat(`${value ?? ''}`);
  if (!Number.isFinite(numeric)) {
    return undefined;
  }
  return clampNumber(Math.round(numeric), 0, 100);
}

function getCharacterSuggestedSessionValues(character?: StudioCharacter | null): {
  affinityPositiveMaximum: number;
  affinityNegativeMaximum: number;
  lustMaximum: number;
} {
  return {
    affinityPositiveMaximum: normalizeSuggestedAffinityPositiveMaximum(character?.suggestedAffinityPositiveMaximum) ?? 100,
    affinityNegativeMaximum: normalizeSuggestedAffinityNegativeMaximum(character?.suggestedAffinityNegativeMaximum) ?? -100,
    lustMaximum: normalizeSuggestedLustMaximum(character?.suggestedLustMaximum) ?? 60,
  };
}

function createEmptyScenarioForm(characterId = ''): ScenarioFormState {
  const defaultSceneId = createFormLocalId('scene');
  return {
    name: '',
    description: '',
    startMessage: '',
    specialInstructions: '',
    characterId,
    bannerDataUrl: '',
    startSceneId: '',
    startingPoints: [
      {
        id: createFormLocalId('start'),
        name: 'Default',
        sceneId: defaultSceneId,
        startMessage: '',
        specialInstructions: '',
      },
    ],
    scenes: [
      {
        id: defaultSceneId,
        name: 'Default Scene',
        backgroundDataUrl: '',
        backgroundDepthMapDataUrl: '',
        bgmDataUrl: '',
      ambientNoiseDataUrl: '',
      ambientNoisePresetId: '',
      ambientNoiseMuffled: false,
      weatherPreset: 'none',
      triggerWordsInput: '',
    },
  ],
  };
}

function normalizeSceneWeatherPreset(value: unknown): SceneWeatherPreset {
  const normalized = `${value || ''}`.trim().toLowerCase();
  return SCENE_WEATHER_PRESET_OPTIONS.some((entry) => entry.id === normalized)
    ? (normalized as SceneWeatherPreset)
    : 'none';
}

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

  const fallbackScene = scenario.scenes.find((scene) => scene.id === scenario.startSceneId) || scenario.scenes[0];
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

function normalizeScenarioFormStartingPoints(form: ScenarioFormState): ScenarioFormState['startingPoints'] {
  const validSceneIds = new Set(form.scenes.map((scene) => scene.id).filter(Boolean) as string[]);
  const points: ScenarioFormState['startingPoints'] = [];

  for (const point of form.startingPoints) {
    if (!point.sceneId || !validSceneIds.has(point.sceneId)) {
      continue;
    }

    points.push({
      id: point.id || createFormLocalId('start'),
      name: point.name.trim() || form.scenes.find((scene) => scene.id === point.sceneId)?.name || `Start ${points.length + 1}`,
      sceneId: point.sceneId,
      startMessage: point.startMessage.trim(),
      specialInstructions: point.specialInstructions.trim(),
    });

    if (points.length >= 5) {
      break;
    }
  }

  if (points.length === 0 && form.scenes[0]?.id) {
    const fallbackSceneId = validSceneIds.has(form.startSceneId) ? form.startSceneId : form.scenes[0].id!;
    points.push({
      id: createFormLocalId('start'),
      name: form.scenes.find((scene) => scene.id === fallbackSceneId)?.name || 'Default',
      sceneId: fallbackSceneId,
      startMessage: '',
      specialInstructions: '',
    });
  }

  return points;
}

function createEmptyScenarioAutoPlace(): ScenarioAutoPlaceDraft {
  return {
    id: createFormLocalId('place'),
    locationName: '',
    prompt: '',
    triggerWordsInput: '',
    ambientNoiseDataUrl: '',
    ambientNoisePresetId: '',
    ambientNoiseMuffled: false,
    generatedSceneId: '',
  };
}

function normalizeScenarioAutoPlacePresetEntry(value: unknown): Omit<ScenarioAutoPlaceDraft, 'id'> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  const record = value as Record<string, unknown>;
  const locationName = `${record.locationName ?? record.name ?? record.label ?? ''}`.trim();
  const prompt = `${record.prompt ?? record.description ?? ''}`.trim();
  const triggerWordsInput = (() => {
    const triggerWordsFromInput =
      typeof record.triggerWordsInput === 'string'
        ? record.triggerWordsInput
        : typeof record.triggersInput === 'string'
          ? record.triggersInput
          : '';
    const triggerWordsFromArray = Array.isArray(record.triggerWords)
      ? record.triggerWords
          .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
          .filter(Boolean)
          .join(', ')
      : typeof record.triggerWords === 'string'
        ? record.triggerWords
        : '';
    return parseTriggerWordsInput(triggerWordsFromInput || triggerWordsFromArray).join(', ');
  })();
  const generatedSceneId = typeof record.generatedSceneId === 'string' ? record.generatedSceneId.trim() : '';
  const ambientNoiseDataUrl = typeof record.ambientNoiseDataUrl === 'string' ? record.ambientNoiseDataUrl.trim() : '';
  const ambientNoisePresetId = typeof record.ambientNoisePresetId === 'string' ? record.ambientNoisePresetId.trim() : '';
  const ambientNoiseMuffled = record.ambientNoiseMuffled === true;

  if (!locationName && !prompt && !triggerWordsInput && !ambientNoiseDataUrl && !ambientNoisePresetId && !generatedSceneId) {
    return null;
  }

  return {
    locationName,
    prompt,
    triggerWordsInput,
    ambientNoiseDataUrl,
    ambientNoisePresetId,
    ambientNoiseMuffled,
    generatedSceneId,
  };
}

function normalizeAssetVariants(value: string[] | undefined): string[] {
  return Array.isArray(value) ? value.filter(Boolean).slice(0, ASSET_VARIANT_COUNT) : [];
}

function getFirstAssetVariant(value: string[] | undefined): string {
  return normalizeAssetVariants(value)[0] || '';
}

function parseTriggerWordsInput(value: string): string[] {
  const seen = new Set<string>();
  const triggerWords: string[] = [];

  for (const rawPart of value.split(',')) {
    const nextWord = rawPart.trim();
    if (!nextWord) {
      continue;
    }

    const key = nextWord.toLowerCase();
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    triggerWords.push(nextWord);
  }

  return triggerWords;
}

function formatDurationFromSeconds(totalSeconds: number): string {
  const rounded = Math.max(0, Math.round(totalSeconds));
  const hours = Math.floor(rounded / 3600);
  const minutes = Math.floor((rounded % 3600) / 60);
  const seconds = rounded % 60;

  if (hours > 0) {
    return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  }

  if (minutes > 0) {
    return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`;
  }

  return `${seconds}s`;
}

function formatSignedDurationFromSeconds(totalSeconds: number): string {
  const rounded = Math.round(totalSeconds);
  if (rounded === 0) {
    return '0s';
  }

  const sign = rounded > 0 ? '+' : '-';
  return `${sign}${formatDurationFromSeconds(Math.abs(rounded))}`;
}

function buildGenerationTaskSignature(tasks: GenerationTask[]): string {
  return tasks
    .map((task) => `${task.kind}|${task.assetKey}|${task.variantNumber}|${task.triggerTag}`)
    .join('||');
}

function normalizeReactionName(value: string): string {
  return value
    .replace(/[\[\]]/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')
    .toUpperCase();
}

function parseReactionTriggersInput(value: string): string[] {
  const seen = new Set<string>();
  const triggers: string[] = [];

  for (const rawPart of value.split(',')) {
    const normalized = normalizeReactionName(rawPart);
    if (!normalized || seen.has(normalized)) {
      continue;
    }

    seen.add(normalized);
    triggers.push(normalized);
  }

  return triggers;
}

function composePrompt(...segments: string[]): string {
  const seen = new Set<string>();
  const values: string[] = [];

  for (const segment of segments) {
    const parts = segment
      .split(/[,\n]/g)
      .map((part) => part.trim())
      .filter(Boolean);

    for (const part of parts) {
      const key = part.toLowerCase();
      if (seen.has(key)) {
        continue;
      }

      seen.add(key);
      values.push(part);
    }
  }

  return values.join(', ');
}

function normalizePreferredCgExpressionValue(
  value: unknown,
): CharacterAutomaticGenerationSettings['preferredCgExpression'] {
  const normalized = `${value || ''}`.trim().toUpperCase();
  return PREFERRED_CG_EXPRESSION_OPTIONS.some((entry) => entry.value === normalized)
    ? (normalized as CharacterAutomaticGenerationSettings['preferredCgExpression'])
    : 'ANY';
}

function normalizeLightingColorValue(value: unknown): CharacterAutomaticGenerationSettings['lightingColor'] {
  const normalized = `${value || ''}`.trim().toUpperCase();
  return LIGHTING_COLOR_OPTIONS.some((entry) => entry.value === normalized)
    ? (normalized as CharacterAutomaticGenerationSettings['lightingColor'])
    : 'NEUTRAL';
}

function normalizeBreastSizeValue(value: unknown): CharacterAutomaticGenerationSettings['breastSize'] {
  const normalized = `${value || ''}`.trim().toUpperCase();
  return BREAST_SIZE_OPTIONS.some((entry) => entry.value === normalized)
    ? (normalized as CharacterAutomaticGenerationSettings['breastSize'])
    : 'MEDIUM';
}

function normalizeBloomIntensityValue(value: unknown): number {
  const numericValue = typeof value === 'number' ? value : Number.parseFloat(`${value || ''}`);
  return Number.isFinite(numericValue) ? clampUnit(numericValue) : 0;
}

function getLightingBackgroundTag(value: CharacterAutomaticGenerationSettings['lightingColor']): string {
  return LIGHTING_COLOR_OPTIONS.find((entry) => entry.value === value)?.tag || 'white background';
}

function getBreastSizeTag(value: CharacterAutomaticGenerationSettings['breastSize']): string {
  return BREAST_SIZE_OPTIONS.find((entry) => entry.value === value)?.tag || 'medium breasts';
}

function promptContainsTag(prompt: string, tag: string): boolean {
  const normalizedTag = tag.trim().toLowerCase();
  if (!normalizedTag) {
    return false;
  }

  return prompt
    .split(/[,\n]/g)
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean)
    .some((part) => part === normalizedTag);
}

function ensureSoloPromptTag(prompt: string): string {
  const normalized = prompt.trim();
  if (!normalized) {
    return '';
  }

  return promptContainsTag(normalized, 'solo') ? normalized : composePrompt(normalized, 'solo');
}

function normalizeDefaultExpressionPrompt(expression: string, prompt: string): string {
  const withSolo = ensureSoloPromptTag(prompt);
  if (!withSolo) {
    return '';
  }

  return withSolo;
}

function normalizeExpressionLabel(value: string): string {
  return normalizeReactionName(value || '');
}

function shouldSkipMouthAnimationForTask(task: Pick<GenerationTask, 'assetKey' | 'label'>): boolean {
  return normalizeExpressionLabel(task.assetKey) === 'LAUGHING' || normalizeExpressionLabel(task.label) === 'LAUGHING';
}

function formatTimestamp(value: string): string {
  return new Date(value).toLocaleString([], {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

function stopTextFieldHotkeys(event: ReactKeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) {
  event.stopPropagation();
}

function normalizeHexColor(value: string, fallback = DEFAULT_CHARACTER_ACCENT_COLOR): string {
  const trimmed = value.trim();
  const withHash = trimmed.startsWith('#') ? trimmed : `#${trimmed}`;
  if (/^#[0-9a-fA-F]{3}$/.test(withHash)) {
    return `#${withHash
      .slice(1)
      .split('')
      .map((part) => `${part}${part}`)
      .join('')}`.toUpperCase();
  }
  return /^#[0-9a-fA-F]{6}$/.test(withHash) ? withHash.toUpperCase() : fallback;
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function rgbToHex(red: number, green: number, blue: number): string {
  return `#${[red, green, blue]
    .map((channel) => clampNumber(Math.round(channel), 0, 255).toString(16).padStart(2, '0'))
    .join('')}`.toUpperCase();
}

function hexToRgba(value: string, alpha: number): string {
  const { red, green, blue } = hexToRgb(value);
  return `rgba(${red}, ${green}, ${blue}, ${clampNumber(alpha, 0, 1)})`;
}

function hexToRgb(value: string): { red: number; green: number; blue: number } {
  const normalized = normalizeHexColor(value);
  return {
    red: Number.parseInt(normalized.slice(1, 3), 16),
    green: Number.parseInt(normalized.slice(3, 5), 16),
    blue: Number.parseInt(normalized.slice(5, 7), 16),
  };
}

function hsvToRgb({ h, s, v }: HsvColor): { red: number; green: number; blue: number } {
  const hue = ((h % 360) + 360) % 360;
  const saturation = clampNumber(s, 0, 1);
  const value = clampNumber(v, 0, 1);
  const chroma = value * saturation;
  const segment = hue / 60;
  const secondary = chroma * (1 - Math.abs((segment % 2) - 1));
  const match = value - chroma;

  let redPrime = 0;
  let greenPrime = 0;
  let bluePrime = 0;

  if (segment >= 0 && segment < 1) {
    redPrime = chroma;
    greenPrime = secondary;
  } else if (segment < 2) {
    redPrime = secondary;
    greenPrime = chroma;
  } else if (segment < 3) {
    greenPrime = chroma;
    bluePrime = secondary;
  } else if (segment < 4) {
    greenPrime = secondary;
    bluePrime = chroma;
  } else if (segment < 5) {
    redPrime = secondary;
    bluePrime = chroma;
  } else {
    redPrime = chroma;
    bluePrime = secondary;
  }

  return {
    red: (redPrime + match) * 255,
    green: (greenPrime + match) * 255,
    blue: (bluePrime + match) * 255,
  };
}

function rgbToHsv(red: number, green: number, blue: number): HsvColor {
  const normalizedRed = clampNumber(red / 255, 0, 1);
  const normalizedGreen = clampNumber(green / 255, 0, 1);
  const normalizedBlue = clampNumber(blue / 255, 0, 1);
  const max = Math.max(normalizedRed, normalizedGreen, normalizedBlue);
  const min = Math.min(normalizedRed, normalizedGreen, normalizedBlue);
  const delta = max - min;

  let hue = 0;
  if (delta !== 0) {
    if (max === normalizedRed) {
      hue = 60 * (((normalizedGreen - normalizedBlue) / delta) % 6);
    } else if (max === normalizedGreen) {
      hue = 60 * ((normalizedBlue - normalizedRed) / delta + 2);
    } else {
      hue = 60 * ((normalizedRed - normalizedGreen) / delta + 4);
    }
  }

  return {
    h: (hue + 360) % 360,
    s: max === 0 ? 0 : delta / max,
    v: max,
  };
}

function hsvToHex(color: HsvColor): string {
  const { red, green, blue } = hsvToRgb(color);
  return rgbToHex(red, green, blue);
}

function hexToHsv(value: string): HsvColor {
  const { red, green, blue } = hexToRgb(value);
  return rgbToHsv(red, green, blue);
}

function IconImage({ src, alt = '' }: { src: string; alt?: string }) {
  return <img src={src} alt={alt} aria-hidden={alt ? undefined : true} className="ui-icon" />;
}

function FieldLabel({ icon, children }: { icon: string; children: ReactNode }) {
  return (
    <span className="field-label">
      <IconImage src={icon} />
      <span>{children}</span>
    </span>
  );
}

function FieldLabelWithTooltip({
  icon,
  tooltip,
  align = 'start',
  tooltipSide = 'right',
  compact = false,
  children,
}: {
  icon: string;
  tooltip: string;
  align?: 'start' | 'center';
  tooltipSide?: 'left' | 'right';
  compact?: boolean;
  children: ReactNode;
}) {
  return (
    <span
      className={`field-label field-label-with-tooltip field-label-with-tooltip-${align} ${
        compact ? 'is-compact' : ''
      }`.trim()}
    >
      <IconImage src={icon} />
      <span>{children}</span>
      <span className="field-label-tooltip-wrap">
        <button
          type="button"
          className="field-label-tooltip-button"
          aria-label={tooltip}
        >
          <IconImage src={helpCircleIcon} />
        </button>
        <span className={`field-label-tooltip-panel field-label-tooltip-panel-${tooltipSide}`} role="tooltip">
          {tooltip}
        </span>
      </span>
    </span>
  );
}

function IconButton({
  icon,
  label,
  className,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  icon: string;
  label: string;
}) {
  const iconToneClass = icon === deleteIcon ? 'icon-button-delete' : icon === refreshIcon ? 'icon-button-refresh' : '';

  return (
    <button
      {...props}
      type={props.type || 'button'}
      className={['icon-button', iconToneClass, className].filter(Boolean).join(' ')}
      aria-label={label}
      data-tooltip={label}
    >
      <IconImage src={icon} />
      {children}
    </button>
  );
}

function ActionButton({
  icon,
  label,
  className,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  icon: string;
  label: string;
}) {
  return (
    <button {...props} type={props.type || 'button'} className={['action-button', className].filter(Boolean).join(' ')}>
      <IconImage src={icon} />
      <span>{children || label}</span>
    </button>
  );
}

function DownloadCard({
  imageSrc,
  imageAlt,
  title,
  description,
  buttonLabel,
  href,
  download,
  showImage = true,
  compact = false,
}: {
  imageSrc: string;
  imageAlt: string;
  title: string;
  description: string;
  buttonLabel: string;
  href: string;
  download?: string;
  showImage?: boolean;
  compact?: boolean;
}) {
  const isDisabled = !href;

  return (
    <article className={`getting-started-download-card ${compact ? 'is-compact' : ''}`.trim()}>
      {showImage ? (
        <div className="getting-started-download-media">
          <img src={imageSrc} alt={imageAlt} />
        </div>
      ) : null}
      <div className="getting-started-download-copy">
        <strong>{title}</strong>
        <p>{description}</p>
      </div>
      {isDisabled ? (
        <button type="button" className="action-button primary-action is-disabled" disabled>
          <IconImage src={uploadIcon} />
          <span>{buttonLabel}</span>
        </button>
      ) : (
        <a
          className="action-button primary-action"
          href={href}
          download={download}
          target={download ? undefined : '_blank'}
          rel={download ? undefined : 'noreferrer'}
        >
          <IconImage src={uploadIcon} />
          <span>{buttonLabel}</span>
        </a>
      )}
    </article>
  );
}

const GETTING_STARTED_PAGES: GettingStartedPage[] = [
  { id: 'intro', title: 'Overview', eyebrow: 'Getting Started' },
  { id: 'koboldcpp', title: 'Gemma + KoboldCPP Setup', eyebrow: 'Step 1' },
  { id: 'sillytavern', title: 'SillyTavern Connection', eyebrow: 'Step 2' },
  { id: 'example-package', title: 'Next: Asset Generation', eyebrow: 'Step 3' },
  { id: 'sprite-workflow', title: 'Sprite Workflow Requirements', eyebrow: 'Workflow' },
  { id: 'cg-workflow', title: 'CG Workflow Download', eyebrow: 'Workflow' },
  { id: 'finish', title: 'Start Playing', eyebrow: 'Finished' },
];

function BlipSelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (nextValue: string) => void;
}) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [open, setOpen] = useState(false);
  const [previewingId, setPreviewingId] = useState<string | null>(null);
  const selectedOption = value ? BLIP_OPTION_MAP.get(value) ?? null : null;

  const stopPreview = () => {
    if (!audioRef.current) {
      setPreviewingId(null);
      return;
    }

    audioRef.current.pause();
    audioRef.current.currentTime = 0;
    setPreviewingId(null);
  };

  useEffect(() => {
    if (!open) {
      stopPreview();
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        stopPreview();
        setOpen(false);
      }
    };

    window.addEventListener('mousedown', handlePointerDown);
    return () => window.removeEventListener('mousedown', handlePointerDown);
  }, [open]);

  useEffect(() => {
    return () => {
      stopPreview();
      if (audioRef.current) {
        audioRef.current.src = '';
        audioRef.current = null;
      }
    };
  }, []);

  const togglePreview = async (option: BlipOption) => {
    if (previewingId === option.id) {
      stopPreview();
      return;
    }

    let audio = audioRef.current;
    if (!audio) {
      audio = new Audio();
      audio.loop = true;
      audioRef.current = audio;
    }

    audio.pause();
    audio.currentTime = 0;
    if (audio.src !== option.src) {
      audio.src = option.src;
    }

    setPreviewingId(option.id);
    try {
      await audio.play();
    } catch {
      setPreviewingId(null);
    }
  };

  return (
    <div ref={rootRef} className={`blip-select ${open ? 'is-open' : ''}`}>
      <button
        type="button"
        className="blip-select-trigger"
        onClick={() => setOpen((current) => !current)}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="blip-select-value">{selectedOption?.label || 'No blip selected'}</span>
        <span className="blip-select-chevron" aria-hidden="true">
          v
        </span>
      </button>

      {open ? (
        <div className="blip-select-menu" role="listbox" aria-label="Blip options">
          <button
            type="button"
            className={`blip-option ${!value ? 'is-selected' : ''}`}
            onClick={() => {
              stopPreview();
              onChange('');
              setOpen(false);
            }}
          >
            <span className="blip-option-label">No blip</span>
          </button>

          {BLIP_OPTIONS.map((option) => (
            <div
              key={option.id}
              className={`blip-option-row ${value === option.id ? 'is-selected' : ''}`}
              role="option"
              aria-selected={value === option.id}
            >
              <button
                type="button"
                className="blip-option"
                onClick={() => {
                  stopPreview();
                  onChange(option.id);
                  setOpen(false);
                }}
              >
                <span className="blip-option-label">{option.label}</span>
              </button>
              <button
                type="button"
                className="blip-preview-button"
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  void togglePreview(option);
                }}
                aria-label={previewingId === option.id ? `Pause ${option.label}` : `Play ${option.label}`}
              >
                <IconImage src={previewingId === option.id ? pauseIcon : playIcon} />
              </button>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function ColorPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (nextValue: string) => void;
}) {
  const wheelRef = useRef<HTMLDivElement | null>(null);
  const wheelCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isDraggingWheel, setIsDraggingWheel] = useState(false);
  const normalizedValue = useMemo(() => normalizeHexColor(value), [value]);
  const hsvValue = useMemo(() => hexToHsv(normalizedValue), [normalizedValue]);
  const wheelMarkerStyle = useMemo<CSSProperties>(() => {
    const angle = ((hsvValue.h - 90) * Math.PI) / 180;
    const distance = hsvValue.s * 50;
    return {
      left: `${50 + Math.cos(angle) * distance}%`,
      top: `${50 + Math.sin(angle) * distance}%`,
      backgroundColor: normalizedValue,
    };
  }, [hsvValue.h, hsvValue.s, normalizedValue]);
  const valueTrackStyle = useMemo<CSSProperties>(
    () =>
      ({
        '--color-slider-value': hsvToHex({ h: hsvValue.h, s: hsvValue.s, v: 1 }),
      }) as CSSProperties,
    [hsvValue.h, hsvValue.s],
  );

  useEffect(() => {
    const renderWheel = () => {
      const wheelElement = wheelRef.current;
      const canvas = wheelCanvasRef.current;
      if (!wheelElement || !canvas) {
        return;
      }

      const wheelSize = Math.max(1, Math.round(wheelElement.clientWidth));
      const pixelRatio = window.devicePixelRatio || 1;
      const canvasSize = Math.max(1, Math.round(wheelSize * pixelRatio));

      if (canvas.width !== canvasSize || canvas.height !== canvasSize) {
        canvas.width = canvasSize;
        canvas.height = canvasSize;
      }

      const context = canvas.getContext('2d');
      if (!context) {
        return;
      }

      const radius = canvasSize / 2;
      const imageData = context.createImageData(canvasSize, canvasSize);
      const data = imageData.data;

      for (let y = 0; y < canvasSize; y += 1) {
        for (let x = 0; x < canvasSize; x += 1) {
          const deltaX = x + 0.5 - radius;
          const deltaY = y + 0.5 - radius;
          const distance = Math.hypot(deltaX, deltaY);
          const pixelOffset = (y * canvasSize + x) * 4;

          if (distance > radius) {
            data[pixelOffset + 3] = 0;
            continue;
          }

          const hue = ((Math.atan2(deltaY, deltaX) * 180) / Math.PI + 90 + 360) % 360;
          const saturation = radius === 0 ? 0 : distance / radius;
          const rgb = hsvToRgb({ h: hue, s: saturation, v: 1 });

          data[pixelOffset] = Math.round(clampNumber(rgb.red, 0, 255));
          data[pixelOffset + 1] = Math.round(clampNumber(rgb.green, 0, 255));
          data[pixelOffset + 2] = Math.round(clampNumber(rgb.blue, 0, 255));
          data[pixelOffset + 3] = 255;
        }
      }

      context.putImageData(imageData, 0, 0);
      canvas.style.width = `${wheelSize}px`;
      canvas.style.height = `${wheelSize}px`;
    };

    renderWheel();
    window.addEventListener('resize', renderWheel);
    return () => window.removeEventListener('resize', renderWheel);
  }, []);

  const updateFromWheelPoint = (clientX: number, clientY: number) => {
    if (!wheelRef.current) {
      return;
    }

    const bounds = wheelRef.current.getBoundingClientRect();
    const radius = bounds.width / 2;
    const centerX = bounds.left + radius;
    const centerY = bounds.top + radius;
    const deltaX = clientX - centerX;
    const deltaY = clientY - centerY;
    const distance = Math.min(Math.hypot(deltaX, deltaY), radius);

    onChange(
      hsvToHex({
        h: ((Math.atan2(deltaY, deltaX) * 180) / Math.PI + 90 + 360) % 360,
        s: radius === 0 ? 0 : distance / radius,
        v: hsvValue.v,
      }),
    );
  };

  const handleWheelPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    setIsDraggingWheel(true);
    updateFromWheelPoint(event.clientX, event.clientY);
  };

  const handleWheelPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!isDraggingWheel) {
      return;
    }
    updateFromWheelPoint(event.clientX, event.clientY);
  };

  const finishWheelDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (isDraggingWheel) {
      updateFromWheelPoint(event.clientX, event.clientY);
      setIsDraggingWheel(false);
    }
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const handleWheelKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const hueStep = event.shiftKey ? 15 : 6;
    const saturationStep = event.shiftKey ? 0.12 : 0.05;
    let nextValue: HsvColor | null = null;

    if (event.key === 'ArrowLeft') {
      nextValue = { ...hsvValue, h: hsvValue.h - hueStep };
    } else if (event.key === 'ArrowRight') {
      nextValue = { ...hsvValue, h: hsvValue.h + hueStep };
    } else if (event.key === 'ArrowUp') {
      nextValue = { ...hsvValue, s: clampNumber(hsvValue.s + saturationStep, 0, 1) };
    } else if (event.key === 'ArrowDown') {
      nextValue = { ...hsvValue, s: clampNumber(hsvValue.s - saturationStep, 0, 1) };
    }

    if (!nextValue) {
      return;
    }

    event.preventDefault();
    onChange(hsvToHex(nextValue));
  };

  return (
    <div className="color-picker">
      <div
        ref={wheelRef}
        className={`color-wheel ${isDraggingWheel ? 'is-dragging' : ''}`}
        tabIndex={0}
        role="group"
        aria-label="Accent color hue and saturation"
        onKeyDown={handleWheelKeyDown}
        onPointerDown={handleWheelPointerDown}
        onPointerMove={handleWheelPointerMove}
        onPointerUp={finishWheelDrag}
        onPointerCancel={finishWheelDrag}
      >
        <canvas ref={wheelCanvasRef} className="color-wheel-canvas" aria-hidden="true" />
        <div className="color-wheel-marker" style={wheelMarkerStyle} aria-hidden="true" />
      </div>
      <label className="color-value-control">
        <span>Brightness</span>
        <input
          type="range"
          min="0"
          max="100"
          step="1"
          value={Math.round(hsvValue.v * 100)}
          style={valueTrackStyle}
          onChange={(event) =>
            onChange(
              hsvToHex({
                ...hsvValue,
                v: clampNumber(Number(event.target.value) / 100, 0, 1),
              }),
            )
          }
          aria-label="Accent color brightness"
        />
      </label>
      <div className="color-picker-current">
        <div className="color-picker-preview" style={{ backgroundColor: normalizedValue }} aria-hidden="true" />
        <input
          type="text"
          value={normalizedValue}
          inputMode="text"
          spellCheck={false}
          onChange={(event) => onChange(normalizeHexColor(event.target.value, normalizedValue))}
          aria-label="Accent color hex value"
        />
      </div>
    </div>
  );
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
        return;
      }
      reject(new Error('Image read failed.'));
    };
    reader.onerror = () => reject(new Error('Image read failed.'));
    reader.readAsDataURL(file);
  });
}

function createFileCacheKey(file: File): string {
  return `${file.name}::${file.size}::${file.lastModified}::${file.type}`;
}

function loadImage(source: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Failed to load image for cropping.'));
    image.src = source;
  });
}

function encodeCanvasAsWebpDataUrl(canvas: HTMLCanvasElement): string {
  const webpDataUrl = canvas.toDataURL('image/webp', 1);
  if (webpDataUrl.startsWith('data:image/webp')) {
    return webpDataUrl;
  }

  // Fallback for environments without WebP canvas support.
  return canvas.toDataURL('image/png');
}

async function optimizeImageDataUrlToWebp(
  sourceDataUrl: string,
  onProgress?: (progress: number) => void,
): Promise<string> {
  onProgress?.(10);
  const image = await loadImage(sourceDataUrl);
  onProgress?.(45);

  const width = Math.max(1, Math.round(image.naturalWidth || image.width));
  const height = Math.max(1, Math.round(image.naturalHeight || image.height));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('Failed to initialize image optimization canvas.');
  }

  context.drawImage(image, 0, 0, width, height);
  onProgress?.(78);

  const optimizedDataUrl = encodeCanvasAsWebpDataUrl(canvas);
  onProgress?.(100);
  return optimizedDataUrl;
}

async function cropImageToDataUrl(
  sourceDataUrl: string,
  cropPixels: Area,
  onProgress?: (progress: number) => void,
): Promise<string> {
  onProgress?.(12);
  const image = await loadImage(sourceDataUrl);
  onProgress?.(35);
  const canvas = document.createElement('canvas');
  const width = Math.max(1, Math.round(cropPixels.width));
  const height = Math.max(1, Math.round(cropPixels.height));
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('Failed to initialize crop canvas.');
  }

  onProgress?.(58);
  context.drawImage(
    image,
    cropPixels.x,
    cropPixels.y,
    width,
    height,
    0,
    0,
    width,
    height,
  );

  onProgress?.(82);
  const croppedDataUrl = encodeCanvasAsWebpDataUrl(canvas);
  onProgress?.(100);
  return croppedDataUrl;
}

function createFormLocalId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function clampUnit(value: number): number {
  return clampNumber(value, 0, 1);
}

function buildCharacterBloomFilter(intensity: number): string {
  const bloomIntensity = clampUnit(intensity);
  const baseShadow = 'drop-shadow(0 24px 32px rgba(0, 0, 0, 0.45))';
  if (bloomIntensity <= 0) {
    return `brightness(1.02) saturate(1.02) ${baseShadow}`;
  }

  const glowBlurPrimary = 10 + bloomIntensity * 22;
  const glowBlurSecondary = 18 + bloomIntensity * 34;
  const glowAlphaPrimary = 0.12 + bloomIntensity * 0.28;
  const glowAlphaSecondary = 0.05 + bloomIntensity * 0.18;
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

export function MainMenu({
  stCards,
  characters,
  scenarios,
  runs,
  packages,
  artStylePresets,
  sillyTavernConnection,
  gameplaySettings,
  interfaceSettings,
  loading,
  error,
  onUpdateSillyTavernConnection,
  onRefreshSillyTavernCards,
  onGameplaySettingsChange,
  onInterfaceSettingsChange,
  onArtStylePresetsChange,
  onSaveCharacter,
  onDeleteCharacter,
  onSaveScenario,
  onDeleteScenario,
  onStartRun,
  onResumeRun,
  onReplayRun,
  onDeleteRun,
  onCreatePackage,
  onImportPackage,
  onRevealPackage,
  onDeletePackage,
}: MainMenuProps) {
  const [activeTab, setActiveTab] = useState<TabId>('character-creator');
  const [characterView, setCharacterView] = useState<CharacterView>('list');
  const [characterEditorSubTab, setCharacterEditorSubTab] = useState<CharacterEditorSubTab>('manual');
  const [scenarioView, setScenarioView] = useState<ScenarioView>('list');
  const [scenarioEditorSubTab, setScenarioEditorSubTab] = useState<ScenarioEditorSubTab>('manual');
  const [playView, setPlayView] = useState<PlayView>('list');
  const [selectedPackageScenarioId, setSelectedPackageScenarioId] = useState('');
  const [packageNameInput, setPackageNameInput] = useState('');
  const [packageCreating, setPackageCreating] = useState(false);
  const [selectedAssetVariantByKey, setSelectedAssetVariantByKey] = useState<Record<string, number>>({});
  const [selectedScenarioStartingPointId, setSelectedScenarioStartingPointId] = useState('');

  const [characterNameTouched, setCharacterNameTouched] = useState(false);
  const [characterForm, setCharacterForm] = useState<CharacterFormState>(
    createEmptyCharacterForm(stCards[0]?.name || '', stCards[0]?.name || ''),
  );
  const [scenarioForm, setScenarioForm] = useState<ScenarioFormState>(
    createEmptyScenarioForm(characters[0]?.id || ''),
  );
  const [scenarioAutoPlaces, setScenarioAutoPlaces] = useState<ScenarioAutoPlaceDraft[]>([createEmptyScenarioAutoPlace()]);
  const [scenarioAutoGenerationInProgress, setScenarioAutoGenerationInProgress] = useState(false);
  const [scenarioLazyPromptOpen, setScenarioLazyPromptOpen] = useState(false);
  const [scenarioGenerationStopRequested, setScenarioGenerationStopRequested] = useState(false);
  const [scenarioGeneratedThumbnails, setScenarioGeneratedThumbnails] = useState<GeneratedThumbnail[]>([]);
  const [scenarioThumbnailHoverPreview, setScenarioThumbnailHoverPreview] = useState<{
    thumbnail: GeneratedThumbnail;
    x: number;
    y: number;
  } | null>(null);
  const [scenarioGenerateDepthMaps, setScenarioGenerateDepthMaps] = useState(true);
  const [hideCgSpoilers, setHideCgSpoilers] = useState(false);
  const [characterSearchQuery, setCharacterSearchQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [deletingRunIds, setDeletingRunIds] = useState<Set<string>>(new Set());
  const [runMassDeletionEnabled, setRunMassDeletionEnabled] = useState(false);
  const [selectedRunIdsForDeletion, setSelectedRunIdsForDeletion] = useState<Set<string>>(new Set());
  const [deletingPackageIds, setDeletingPackageIds] = useState<Set<string>>(new Set());
  const [loadedSpritePreviews, setLoadedSpritePreviews] = useState<Record<string, string>>({});
  const [currentSpritePreviewLoadingKey, setCurrentSpritePreviewLoadingKey] = useState<string | null>(null);
  const [loadedScenarioScenePreviews, setLoadedScenarioScenePreviews] = useState<Record<string, string>>({});
  const [currentScenarioSceneLoadingKey, setCurrentScenarioSceneLoadingKey] = useState<string | null>(null);
  const [bottomProgress, setBottomProgress] = useState<BottomProgressState | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [guideSpriteTest, setGuideSpriteTest] = useState<GuideSpriteTestState>({
    generating: false,
    imageDataUrl: '',
    errorMessage: null,
  });
  const [pendingConfirm, setPendingConfirm] = useState<ConfirmState | null>(null);
  const [packageDeleteOptions, setPackageDeleteOptions] = useState({
    deleteCharacters: true,
    deleteScenarios: true,
  });
  const [menuSettingsOpen, setMenuSettingsOpen] = useState(false);
  const [menuSettingsTab, setMenuSettingsTab] = useState<'interface' | 'game'>('interface');
  const [menuInterfaceSettingsDraft, setMenuInterfaceSettingsDraft] = useState<InterfaceSettings>(interfaceSettings);
  const [menuGameplaySettingsDraft, setMenuGameplaySettingsDraft] = useState<GameplaySettings>(gameplaySettings);
  const [gettingStartedOpen, setGettingStartedOpen] = useState<boolean>(() => {
    if (typeof window === 'undefined') {
      return false;
    }
    return window.localStorage.getItem(GETTING_STARTED_HIDE_STORAGE_KEY) !== '1';
  });
  const [gettingStartedPageIndex, setGettingStartedPageIndex] = useState(0);
  const [hideGettingStartedOnStartup, setHideGettingStartedOnStartup] = useState<boolean>(() => {
    if (typeof window === 'undefined') {
      return false;
    }
    return window.localStorage.getItem(GETTING_STARTED_HIDE_STORAGE_KEY) === '1';
  });
  const [hideMouthAnimationWarning, setHideMouthAnimationWarning] = useState<boolean>(() => {
    if (typeof window === 'undefined') {
      return false;
    }
    return window.localStorage.getItem(MOUTH_ANIMATION_WARNING_HIDE_STORAGE_KEY) === '1';
  });
  const [connectionPanelOpen, setConnectionPanelOpen] = useState(false);
  const [connectionAddressDraft, setConnectionAddressDraft] = useState(sillyTavernConnection.baseUrl);
  const [comfyConnectionAddressDraft, setComfyConnectionAddressDraft] = useState('http://127.0.0.1:8188');
  const [connectionBusy, setConnectionBusy] = useState(false);
  const [preferencesConnectionBusy, setPreferencesConnectionBusy] = useState(false);
  const [comfyConnectionState, setComfyConnectionState] = useState<ComfyConnectionState>('checking');
  const [comfyBaseUrl, setComfyBaseUrl] = useState('http://127.0.0.1:8188');
  const [comfyConnectionError, setComfyConnectionError] = useState('');
  const [guideTestCheckpoint, setGuideTestCheckpoint] = useState('');
  const [comfyCheckpoints, setComfyCheckpoints] = useState<string[]>([]);
  const [comfyLoras, setComfyLoras] = useState<string[]>([]);
  const [comfyUpscaleModels, setComfyUpscaleModels] = useState<string[]>([]);
  const [comfyMissingNodes, setComfyMissingNodes] = useState<ComfyMissingNodeState[]>([]);
  const [generationInProgress, setGenerationInProgress] = useState(false);
  const [useFaceDetailerForSprites, setUseFaceDetailerForSprites] = useState(false);
  const [generationStopRequested, setGenerationStopRequested] = useState(false);
  const [generationProgressValue, setGenerationProgressValue] = useState(0);
  const [generationProgressText, setGenerationProgressText] = useState('');
  const [showGeneratedThumbnails, setShowGeneratedThumbnails] = useState(true);
  const [generatedThumbnails, setGeneratedThumbnails] = useState<GeneratedThumbnail[]>([]);
  const [autogenPreviewGenerating, setAutogenPreviewGenerating] = useState(false);
  const [autogenPromptPreviewDataUrl, setAutogenPromptPreviewDataUrl] = useState('');
  const [autogenPromptPreviewDepthMapDataUrl, setAutogenPromptPreviewDepthMapDataUrl] = useState('');
  const [autogenPromptPreviewDepthGenerating, setAutogenPromptPreviewDepthGenerating] = useState(false);
  const [autogenPromptPreviewLabel, setAutogenPromptPreviewLabel] = useState('DEFAULT');
  const [autogenPromptPreviewKind, setAutogenPromptPreviewKind] = useState<'sprite' | 'cg'>('sprite');
  const [autogenPromptPreviewDismissed, setAutogenPromptPreviewDismissed] = useState(false);
  const [artStylePresetNameDraft, setArtStylePresetNameDraft] = useState('');
  const [artStylePresetCheckpointDraft, setArtStylePresetCheckpointDraft] = useState('');
  const [artStylePresetLoraDraft, setArtStylePresetLoraDraft] = useState<CharacterAutomaticGenerationSettings['loras']>([]);
  const [activeArtStylePresetId, setActiveArtStylePresetId] = useState('');
  const [generatingArtStylePresetId, setGeneratingArtStylePresetId] = useState<string | null>(null);
  const autogenPromptPreviewDepthRequestIdRef = useRef(0);
  const [pendingGenerationModePrompt, setPendingGenerationModePrompt] = useState<{
    tasks: GenerationTask[];
    continuationTasks: GenerationTask[];
    existingSpriteAssets: number;
    existingCgAssets: number;
  } | null>(null);
  const [pendingCharacterEditorExit, setPendingCharacterEditorExit] = useState(false);
  const [defaultExpressionsCollapsed, setDefaultExpressionsCollapsed] = useState(true);
  const [activeCustomExpressionIndex, setActiveCustomExpressionIndex] = useState<number | null>(null);
  const [activeCgDefinitionIndex, setActiveCgDefinitionIndex] = useState<number | null>(null);
  const [manualRegeneratingSlotKey, setManualRegeneratingSlotKey] = useState<string | null>(null);
  const [manualGenerationDialog, setManualGenerationDialog] = useState<ManualGenerationDialogState | null>(null);
  const [mouthAnimationWarningDialog, setMouthAnimationWarningDialog] = useState<MouthAnimationWarningDialogState | null>(null);
  const [runStartingPointDialog, setRunStartingPointDialog] = useState<RunStartingPointDialogState | null>(null);
  const [negativeAffinityDangerFlashActive, setNegativeAffinityDangerFlashActive] = useState(false);
  const [positiveAffinityDangerFlashActive, setPositiveAffinityDangerFlashActive] = useState(false);
  const [manualDepthGeneratingKey, setManualDepthGeneratingKey] = useState<string | null>(null);
  const [thumbnailHoverPreview, setThumbnailHoverPreview] = useState<{
    thumbnail: GeneratedThumbnail;
    x: number;
    y: number;
  } | null>(null);
  const [spriteMouthPreviewByKey, setSpriteMouthPreviewByKey] = useState<Record<string, 'closed' | 'open'>>({});
  const [draggingSpriteExpression, setDraggingSpriteExpression] = useState<string | null>(null);
  const [spriteCropDialog, setSpriteCropDialog] = useState<{
    target: 'character-sprite' | 'scenario-banner' | 'menu-wallpaper';
    expression: string;
    variantIndex: number;
    sourceDataUrl: string;
    aspect: number;
  } | null>(null);
  const [spriteCropPosition, setSpriteCropPosition] = useState({ x: 0, y: 0 });
  const [spriteCropZoom, setSpriteCropZoom] = useState(1);
  const [spriteCropPixels, setSpriteCropPixels] = useState<Area | null>(null);
  const [interactiveZonesDialog, setInteractiveZonesDialog] = useState<{
    expression: string;
    title: string;
    sourceDataUrl: string;
  } | null>(null);
  const [interactiveZonesDraft, setInteractiveZonesDraft] = useState<SpriteInteractiveZone[]>([]);
  const [copiedInteractiveZones, setCopiedInteractiveZones] = useState<SpriteInteractiveZone[] | null>(null);
  const [interactiveZoneTool, setInteractiveZoneTool] = useState<'draw' | 'select'>('draw');
  const [selectedInteractiveZoneId, setSelectedInteractiveZoneId] = useState<string | null>(null);
  const [draftInteractiveZone, setDraftInteractiveZone] = useState<{
    originX: number;
    originY: number;
    x: number;
    y: number;
    width: number;
    height: number;
  } | null>(null);
  const [movingInteractiveZone, setMovingInteractiveZone] = useState<{
    zoneId: string;
    pointerOffsetX: number;
    pointerOffsetY: number;
  } | null>(null);
  const generatedSpriteFilesBySlotRef = useRef<Record<string, GeneratedSpriteFileSet>>({});
  const interactiveZoneCanvasRef = useRef<HTMLDivElement | null>(null);
  const connectionPanelRef = useRef<HTMLDivElement | null>(null);
  const packageDeleteOptionsRef = useRef(packageDeleteOptions);
  const menuWallpaperInputRef = useRef<HTMLInputElement | null>(null);
  const customReactionUploadInputRefsRef = useRef<Map<string, HTMLInputElement | null>>(new Map());
  const bgmFileCacheRef = useRef<Map<string, string>>(new Map());
  const ambientFileCacheRef = useRef<Map<string, string>>(new Map());
  const spriteCropSourceUrlRef = useRef<string | null>(null);
  const generationImportInputRef = useRef<HTMLInputElement | null>(null);
  const customExpressionImportInputRef = useRef<HTMLInputElement | null>(null);
  const cgDefinitionImportInputRef = useRef<HTMLInputElement | null>(null);
  const scenarioPlacePresetImportInputRef = useRef<HTMLInputElement | null>(null);
  const generationAbortControllerRef = useRef<AbortController | null>(null);
  const generationStopRequestedRef = useRef(false);
  const scenarioGenerationStopRequestedRef = useRef(false);
  const characterPreviewMouthTimeoutRef = useRef<number | null>(null);
  const negativeAffinityDangerFlashTimeoutRef = useRef<number | null>(null);
  const positiveAffinityDangerFlashTimeoutRef = useRef<number | null>(null);
  const comfyConnectionIntervalRef = useRef<number | null>(null);
  const toastTimeoutsRef = useRef<Map<string, number>>(new Map());
  const bottomProgressHideTimeoutRef = useRef<number | null>(null);
  const bottomProgressPulseIntervalRef = useRef<number | null>(null);
  const lastExternalErrorRef = useRef<string | null>(null);
  const [characterPreviewMouthVisible, setCharacterPreviewMouthVisible] = useState(false);
  const [characterPreviewMouthFrameReady, setCharacterPreviewMouthFrameReady] = useState(false);
  const [characterPreviewSpriteAspect, setCharacterPreviewSpriteAspect] = useState(2 / 3);
  const effectiveInterfaceSettings = menuSettingsOpen ? menuInterfaceSettingsDraft : interfaceSettings;
  const generationConfigImportInputId = useId();
  const cgDefinitionImportInputId = useId();
  const scenarioPlacePresetImportInputId = useId();
  const currentGettingStartedPageId = GETTING_STARTED_PAGES[gettingStartedPageIndex]?.id;
  const canAdvanceGettingStarted = currentGettingStartedPageId !== 'sprite-workflow' || Boolean(guideSpriteTest.imageDataUrl);
  const isSillyTavernOnline = sillyTavernConnection.online;
  const comfyGenerationBusy =
    generationInProgress ||
    autogenPreviewGenerating ||
    Boolean(manualRegeneratingSlotKey) ||
    Boolean(manualDepthGeneratingKey) ||
    scenarioAutoGenerationInProgress;
  const comfyGenerationBlocked = comfyConnectionState !== 'online' || comfyMissingNodes.length > 0;
  const autogenPreviewBlocked = comfyGenerationBusy || comfyConnectionState !== 'online';
  const autogenPromptPreviewVisible =
    !autogenPromptPreviewDismissed && (autogenPreviewGenerating || Boolean(autogenPromptPreviewDataUrl));
  const autogenPromptPreviewAnchoredVisible =
    autogenPromptPreviewVisible &&
    ((activeTab === 'character-creator' && characterView === 'editor' && characterEditorSubTab === 'automatic') ||
      (activeTab === 'scenario-creator' && scenarioView === 'editor' && scenarioEditorSubTab === 'automatic'));
  const characterSpriteGenerationActive = generationInProgress || Boolean(manualRegeneratingSlotKey);

  useEffect(() => {
    return () => {
      if (negativeAffinityDangerFlashTimeoutRef.current !== null) {
        window.clearTimeout(negativeAffinityDangerFlashTimeoutRef.current);
      }
      if (positiveAffinityDangerFlashTimeoutRef.current !== null) {
        window.clearTimeout(positiveAffinityDangerFlashTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (runStartingPointDialog?.affinityMinimumValue !== -120) {
      setNegativeAffinityDangerFlashActive(false);
      if (negativeAffinityDangerFlashTimeoutRef.current !== null) {
        window.clearTimeout(negativeAffinityDangerFlashTimeoutRef.current);
        negativeAffinityDangerFlashTimeoutRef.current = null;
      }
      return;
    }

    setNegativeAffinityDangerFlashActive(true);
    if (negativeAffinityDangerFlashTimeoutRef.current !== null) {
      window.clearTimeout(negativeAffinityDangerFlashTimeoutRef.current);
    }
    negativeAffinityDangerFlashTimeoutRef.current = window.setTimeout(() => {
      setNegativeAffinityDangerFlashActive(false);
      negativeAffinityDangerFlashTimeoutRef.current = null;
    }, 720);
  }, [runStartingPointDialog?.affinityMinimumValue]);

  useEffect(() => {
    if (runStartingPointDialog?.affinityMaximumValue !== 120) {
      setPositiveAffinityDangerFlashActive(false);
      if (positiveAffinityDangerFlashTimeoutRef.current !== null) {
        window.clearTimeout(positiveAffinityDangerFlashTimeoutRef.current);
        positiveAffinityDangerFlashTimeoutRef.current = null;
      }
      return;
    }

    setPositiveAffinityDangerFlashActive(true);
    if (positiveAffinityDangerFlashTimeoutRef.current !== null) {
      window.clearTimeout(positiveAffinityDangerFlashTimeoutRef.current);
    }
    positiveAffinityDangerFlashTimeoutRef.current = window.setTimeout(() => {
      setPositiveAffinityDangerFlashActive(false);
      positiveAffinityDangerFlashTimeoutRef.current = null;
    }, 900);
  }, [runStartingPointDialog?.affinityMaximumValue]);

  const scenarioNameById = useMemo(
    () => new Map(scenarios.map((scenario) => [scenario.id, scenario.name])),
    [scenarios],
  );
  const scenarioById = useMemo(() => new Map(scenarios.map((scenario) => [scenario.id, scenario])), [scenarios]);
  const cardByName = useMemo(() => new Map(stCards.map((card) => [card.name, card])), [stCards]);
  const filteredCharacters = useMemo(() => {
    const query = characterSearchQuery.trim().toLowerCase();
    if (!query) {
      return characters;
    }

    return characters.filter((character) => {
      const creator = cardByName.get(character.cardName)?.creator || '';
      return [character.name, character.cardName, creator].some((value) => value.toLowerCase().includes(query));
    });
  }, [cardByName, characterSearchQuery, characters]);
  const characterNameById = useMemo(
    () => new Map(characters.map((character) => [character.id, character.name])),
    [characters],
  );
  const characterById = useMemo(
    () => new Map(characters.map((character) => [character.id, character])),
    [characters],
  );
  const selectedCard = useMemo(
    () => stCards.find((entry) => entry.name === characterForm.cardName) ?? null,
    [characterForm.cardName, stCards],
  );
  const selectedScenarioCharacter = useMemo(
    () => characters.find((entry) => entry.id === scenarioForm.characterId) ?? null,
    [characters, scenarioForm.characterId],
  );
  const generationEstimate = useMemo(() => {
    const spriteVariantCount = clampNumber(
      Math.round(characterForm.automaticGeneration.expressionVariantCount),
      0,
      ASSET_VARIANT_COUNT,
    );
    const cgVariantCount = clampNumber(
      Math.round(characterForm.automaticGeneration.cgVariantCount),
      0,
      ASSET_VARIANT_COUNT,
    );
    const usableDefaultExpressions = characterForm.automaticGeneration.defaultExpressions.filter(
      (entry) => entry.enabled !== false && Boolean(normalizeExpressionLabel(entry.expression)),
    ).length;
    const usableCustomExpressions = characterForm.automaticGeneration.customExpressions.filter(
      (entry) => entry.enabled !== false && Boolean(normalizeExpressionLabel(entry.triggerTag)),
    ).length;
    const usableCgDefinitions = characterForm.automaticGeneration.cgDefinitions.filter(
      (entry) => entry.enabled !== false && Boolean(normalizeExpressionLabel(entry.triggerTag)),
    ).length;

    const spriteJobs = (usableDefaultExpressions + usableCustomExpressions) * spriteVariantCount;
    const cgJobs = usableCgDefinitions * cgVariantCount;
    const totalJobs = spriteJobs + cgJobs;

    const stepDelta = Math.round(characterForm.automaticGeneration.steps) - DEFAULT_AUTOGEN_STEPS;
    const baseSpriteSecondsPerImage = useFaceDetailerForSprites
      ? Math.max(1, GENERATION_SECONDS_WITH_FACEDETAILER + stepDelta)
      : Math.max(1, SPRITE_GENERATION_SECONDS_WITHOUT_FACEDETAILER + stepDelta);
    const talkingSecondsPerImage = characterForm.automaticGeneration.generateMouthAnimations
      ? MOUTH_ANIMATION_GENERATION_SECONDS
      : 0;
    const spriteSecondsPerImage = baseSpriteSecondsPerImage + talkingSecondsPerImage;
    const cgSecondsPerImage = Math.max(1, CG_GENERATION_SECONDS + stepDelta);
    const spriteSeconds = spriteJobs * spriteSecondsPerImage;
    const cgSeconds = cgJobs * cgSecondsPerImage;
    const totalSeconds = spriteSeconds + cgSeconds;
    const spriteVariantDelta = spriteVariantCount - DEFAULT_EXPRESSION_VARIANT_COUNT;
    const spritePassesPerVariant = usableDefaultExpressions + usableCustomExpressions;
    const cgVariantDelta = cgVariantCount - DEFAULT_CG_VARIANT_COUNT;
    const factorChips: Array<{ label: string; value: string; tone: 'neutral' | 'increase' | 'decrease' }> = [
      {
        label: 'Default expressions',
        value: `${usableDefaultExpressions} (${formatSignedDurationFromSeconds(
          usableDefaultExpressions * spriteVariantCount * spriteSecondsPerImage,
        )})`,
        tone: usableDefaultExpressions > 0 ? 'neutral' : 'decrease',
      },
      {
        label: 'Custom expressions',
        value: `${usableCustomExpressions} (${formatSignedDurationFromSeconds(
          usableCustomExpressions * spriteVariantCount * spriteSecondsPerImage,
        )})`,
        tone: usableCustomExpressions > 0 ? 'increase' : 'decrease',
      },
      {
        label: 'CG definitions',
        value: `${usableCgDefinitions} (${formatSignedDurationFromSeconds(
          usableCgDefinitions * cgVariantCount * cgSecondsPerImage,
        )})`,
        tone: usableCgDefinitions > 0 ? 'neutral' : 'decrease',
      },
      {
        label: 'Sprite variants',
        value: `x${spriteVariantCount} (${formatSignedDurationFromSeconds(
          spriteVariantDelta * spritePassesPerVariant * spriteSecondsPerImage,
        )})`,
        tone:
          spriteVariantDelta > 0 ? 'increase' : spriteVariantDelta < 0 ? 'decrease' : 'neutral',
      },
      {
        label: 'CG variants',
        value: `x${cgVariantCount} (${formatSignedDurationFromSeconds(
          cgVariantDelta * usableCgDefinitions * cgSecondsPerImage,
        )})`,
        tone: cgVariantDelta > 0 ? 'increase' : cgVariantDelta < 0 ? 'decrease' : 'neutral',
      },
      {
        label: 'Steps',
        value: `${Math.round(characterForm.automaticGeneration.steps)} (${formatSignedDurationFromSeconds(
          totalJobs * stepDelta,
        )})`,
        tone:
          stepDelta > 0 ? 'increase' : stepDelta < 0 ? 'decrease' : 'neutral',
      },
      {
        label: 'FaceDetailer',
        value: `${useFaceDetailerForSprites ? 'On' : 'Off'} (${formatSignedDurationFromSeconds(
          useFaceDetailerForSprites
            ? spriteJobs * (GENERATION_SECONDS_WITH_FACEDETAILER - SPRITE_GENERATION_SECONDS_WITHOUT_FACEDETAILER)
            : 0,
        )})`,
        tone: useFaceDetailerForSprites ? 'increase' : 'neutral',
      },
      {
        label: 'Talking',
        value: `${characterForm.automaticGeneration.generateMouthAnimations ? 'On' : 'Off'} (${formatSignedDurationFromSeconds(
          characterForm.automaticGeneration.generateMouthAnimations
            ? spriteJobs * MOUTH_ANIMATION_GENERATION_SECONDS
            : 0,
        )})`,
        tone: characterForm.automaticGeneration.generateMouthAnimations ? 'increase' : 'neutral',
      },
      {
        label: 'Sprite base',
        value: `${SPRITE_GENERATION_SECONDS_WITHOUT_FACEDETAILER}s/image (${formatSignedDurationFromSeconds(
          spriteJobs * SPRITE_GENERATION_SECONDS_WITHOUT_FACEDETAILER,
        )})`,
        tone: 'neutral',
      },
      {
        label: 'CG base',
        value: `${CG_GENERATION_SECONDS}s/image (${formatSignedDurationFromSeconds(
          cgJobs * CG_GENERATION_SECONDS,
        )})`,
        tone: 'neutral',
      },
    ];

    return {
      spriteJobs,
      cgJobs,
      totalJobs,
      totalSeconds,
      formattedTotal: formatDurationFromSeconds(totalSeconds),
      formattedSprite: formatDurationFromSeconds(spriteSeconds),
      formattedCg: formatDurationFromSeconds(cgSeconds),
      spriteSecondsPerImage,
      cgSecondsPerImage,
      factorChips,
    };
  }, [characterForm.automaticGeneration, useFaceDetailerForSprites]);
  const thumbnailAccentRgb = useMemo(() => hexToRgb(characterForm.accentColor), [characterForm.accentColor]);
  const selectedDialogueQuoteFont = useMemo(
    () => getDialogueQuoteFontOption(characterForm.dialogueQuoteFontId),
    [characterForm.dialogueQuoteFontId],
  );
  const selectedCharacterNameFont = useMemo(
    () => getDialogueQuoteFontOption(characterForm.characterNameFontId),
    [characterForm.characterNameFontId],
  );
  const selectedDialogueQuoteAnimation = useMemo(
    () =>
      DIALOGUE_QUOTE_ANIMATION_OPTIONS.find(
        (entry) => entry.id === normalizeDialogueQuoteAnimationPreset(characterForm.dialogueQuoteAnimationPreset),
      ) || DIALOGUE_QUOTE_ANIMATION_OPTIONS[0],
    [characterForm.dialogueQuoteAnimationPreset],
  );
  const characterInGamePreviewSpriteUrl = getFirstAssetVariant(characterForm.sprites.DEFAULT) || selectedCard?.avatar || '';
  const characterInGamePreviewDepthUrl = getFirstAssetVariant(characterForm.spriteDepthMaps.DEFAULT);
  const characterInGamePreviewAnimationFrames = normalizeSpriteAnimationFrameSet(
    characterForm.spriteAnimationFrames.DEFAULT,
    normalizeAssetVariants(characterForm.sprites.DEFAULT).length,
  );
  const characterInGamePreviewOpenMouthUrl = characterInGamePreviewAnimationFrames.openMouth[0] || '';
  const characterInGamePreviewName = characterForm.name || selectedCard?.name || 'Unnamed character';
  const characterInGamePreviewQuote = '"This is what my dialogue will look like."';
  const scenarioThumbnailAccentColor = selectedScenarioCharacter?.accentColor || '#d4a667';
  const scenarioThumbnailAccentRgb = useMemo(() => hexToRgb(scenarioThumbnailAccentColor), [scenarioThumbnailAccentColor]);
  const activeCgDefinition =
    activeCgDefinitionIndex !== null
      ? characterForm.automaticGeneration.cgDefinitions[activeCgDefinitionIndex] ?? null
      : null;
  const activeCustomExpression =
    activeCustomExpressionIndex !== null
      ? characterForm.automaticGeneration.customExpressions[activeCustomExpressionIndex] ?? null
      : null;
  const activeArtStylePreset =
    artStylePresets.find((entry) => entry.id === activeArtStylePresetId) ?? null;
  const displayedArtStyleCheckpoint =
    artStylePresetCheckpointDraft || (!activeArtStylePreset ? characterForm.automaticGeneration.checkpoint : '');
  const displayedArtStyleLoras = activeArtStylePreset ? activeArtStylePreset.loras : artStylePresetLoraDraft;

  useEffect(() => {
    ensureDialogueQuoteFontStylesheet(characterForm.dialogueQuoteFontId);
  }, [characterForm.dialogueQuoteFontId]);

  useEffect(() => {
    ensureDialogueQuoteFontStylesheet(characterForm.characterNameFontId);
  }, [characterForm.characterNameFontId]);

  useEffect(() => {
    if (!characterInGamePreviewSpriteUrl) {
      setCharacterPreviewSpriteAspect(2 / 3);
      return undefined;
    }

    let cancelled = false;
    const image = new Image();
    image.onload = () => {
      if (cancelled) {
        return;
      }

      const width = image.naturalWidth || image.width || 1;
      const height = image.naturalHeight || image.height || 1;
      setCharacterPreviewSpriteAspect(width / height);
    };
    image.src = characterInGamePreviewSpriteUrl;

    return () => {
      cancelled = true;
    };
  }, [characterInGamePreviewSpriteUrl]);

  useEffect(() => {
    setCharacterPreviewMouthFrameReady(false);
    if (!characterInGamePreviewOpenMouthUrl) {
      return undefined;
    }

    let cancelled = false;
    const image = new Image();
    image.onload = () => {
      if (!cancelled) {
        setCharacterPreviewMouthFrameReady(true);
      }
    };
    image.onerror = () => {
      if (!cancelled) {
        setCharacterPreviewMouthFrameReady(false);
      }
    };
    image.src = characterInGamePreviewOpenMouthUrl;

    return () => {
      cancelled = true;
    };
  }, [characterInGamePreviewOpenMouthUrl]);

  useEffect(() => {
    if (characterPreviewMouthTimeoutRef.current !== null) {
      window.clearTimeout(characterPreviewMouthTimeoutRef.current);
      characterPreviewMouthTimeoutRef.current = null;
    }
    setCharacterPreviewMouthVisible(false);

    if (!characterInGamePreviewOpenMouthUrl) {
      return undefined;
    }

    let cancelled = false;
    const scheduleTalkBurst = () => {
      characterPreviewMouthTimeoutRef.current = window.setTimeout(
        () => {
          if (cancelled) {
            return;
          }

          const stopAt = Date.now() + 900 + Math.random() * 900;
          const tick = () => {
            if (cancelled || Date.now() >= stopAt) {
              setCharacterPreviewMouthVisible(false);
              scheduleTalkBurst();
              return;
            }

            setCharacterPreviewMouthVisible((current) => !current);
            characterPreviewMouthTimeoutRef.current = window.setTimeout(tick, 95 + Math.random() * 85);
          };

          tick();
        },
        2200 + Math.random() * 3600,
      );
    };

    scheduleTalkBurst();

    return () => {
      cancelled = true;
      if (characterPreviewMouthTimeoutRef.current !== null) {
        window.clearTimeout(characterPreviewMouthTimeoutRef.current);
        characterPreviewMouthTimeoutRef.current = null;
      }
      setCharacterPreviewMouthVisible(false);
    };
  }, [characterInGamePreviewOpenMouthUrl]);

  useEffect(() => {
    if (!showGeneratedThumbnails || generatedThumbnails.length === 0) {
      setThumbnailHoverPreview(null);
    }
  }, [showGeneratedThumbnails, generatedThumbnails.length]);
  useEffect(() => {
    if (scenarioGeneratedThumbnails.length === 0) {
      setScenarioThumbnailHoverPreview(null);
    }
  }, [scenarioGeneratedThumbnails.length]);
  useEffect(() => {
    const expressionCount = characterForm.automaticGeneration.customExpressions.length;
    if (activeCustomExpressionIndex === null) {
      return;
    }
    if (expressionCount === 0) {
      setActiveCustomExpressionIndex(null);
      return;
    }
    if (activeCustomExpressionIndex >= expressionCount) {
      setActiveCustomExpressionIndex(expressionCount - 1);
    }
  }, [activeCustomExpressionIndex, characterForm.automaticGeneration.customExpressions.length]);
  useEffect(() => {
    const definitionCount = characterForm.automaticGeneration.cgDefinitions.length;
    if (activeCgDefinitionIndex === null) {
      return;
    }
    if (definitionCount === 0) {
      setActiveCgDefinitionIndex(null);
      return;
    }
    if (activeCgDefinitionIndex >= definitionCount) {
      setActiveCgDefinitionIndex(definitionCount - 1);
    }
  }, [activeCgDefinitionIndex, characterForm.automaticGeneration.cgDefinitions.length]);
  useEffect(() => {
    const presets = artStylePresets;
    if (presets.length === 0) {
      if (activeArtStylePresetId) {
        setActiveArtStylePresetId('');
      }
      return;
    }

    if (!activeArtStylePresetId || !presets.some((preset) => preset.id === activeArtStylePresetId)) {
      setActiveArtStylePresetId(presets[0].id);
    }
  }, [activeArtStylePresetId, artStylePresets]);
  useEffect(() => {
    if (!activeArtStylePresetId) {
      return;
    }
    const activePreset = artStylePresets.find(
      (preset) => preset.id === activeArtStylePresetId,
    );
    if (!activePreset) {
      return;
    }
    if (artStylePresetNameDraft !== activePreset.name) {
      setArtStylePresetNameDraft(activePreset.name);
    }
    if (artStylePresetCheckpointDraft !== activePreset.checkpoint) {
      setArtStylePresetCheckpointDraft(activePreset.checkpoint);
    }
  }, [activeArtStylePresetId, artStylePresets]);
  const selectedScenarioCard = useMemo(
    () => (selectedScenarioCharacter ? cardByName.get(selectedScenarioCharacter.cardName) ?? null : null),
    [cardByName, selectedScenarioCharacter],
  );
  const menuAccentColor = normalizeHexColor(
    effectiveInterfaceSettings.accentColor,
    DEFAULT_INTERFACE_SETTINGS.accentColor,
  );
  const menuAccentRgb = useMemo(() => hexToRgb(menuAccentColor), [menuAccentColor]);
  const menuAccentStrong = useMemo(() => {
    const hsv = hexToHsv(menuAccentColor);
    return hsvToHex({
      h: hsv.h,
      s: clampNumber(hsv.s * 0.82, 0.18, 1),
      v: clampNumber(hsv.v * 1.18, 0, 1),
    });
  }, [menuAccentColor]);
  const menuScreenStyle = useMemo(
    () =>
      ({
        '--accent': menuAccentColor,
        '--accent-strong': menuAccentStrong,
        '--accent-rgb': `${Math.round(menuAccentRgb.red)}, ${Math.round(menuAccentRgb.green)}, ${Math.round(
          menuAccentRgb.blue,
        )}`,
        '--line-strong': hexToRgba(menuAccentColor, 0.34),
        backgroundImage: effectiveInterfaceSettings.wallpaperDataUrl
          ? `linear-gradient(180deg, rgba(7, 7, 8, 0.58), rgba(7, 7, 8, 0.88)), url("${effectiveInterfaceSettings.wallpaperDataUrl}")`
          : 'linear-gradient(180deg, rgba(7, 7, 8, 0.58), rgba(7, 7, 8, 0.88))',
      }) as CSSProperties,
    [effectiveInterfaceSettings.wallpaperDataUrl, menuAccentColor, menuAccentRgb.blue, menuAccentRgb.green, menuAccentRgb.red, menuAccentStrong],
  );
  const currentInteractiveZones = useMemo(() => {
    if (!interactiveZonesDialog) {
      return [];
    }

    return interactiveZonesDraft;
  }, [interactiveZonesDialog, interactiveZonesDraft]);
  const selectedInteractiveZone = useMemo(
    () => currentInteractiveZones.find((zone) => zone.id === selectedInteractiveZoneId) || null,
    [currentInteractiveZones, selectedInteractiveZoneId],
  );
  const characterSpritePreviewSources = useMemo(() => {
    const sources: Record<string, string> = {};
    for (const [assetKey, variants] of Object.entries(characterForm.sprites)) {
      normalizeAssetVariants(variants).forEach((variantUrl, variantIndex) => {
        sources[`${assetKey}:${variantIndex}`] = variantUrl;
      });
    }
    for (const [assetKey, frames] of Object.entries(characterForm.spriteAnimationFrames)) {
      normalizeAssetVariants(frames?.openMouth).forEach((variantUrl, variantIndex) => {
        sources[`${assetKey}:${variantIndex}:openMouth`] = variantUrl;
      });
    }
    return sources;
  }, [characterForm.spriteAnimationFrames, characterForm.sprites]);
  const scenarioScenePreviewSources = useMemo(() => {
    const sources: Record<string, string> = {};
    for (let index = 0; index < scenarioForm.scenes.length; index += 1) {
      const scene = scenarioForm.scenes[index];
      const key = scene.id || `scene-${index}`;
      if (!scene.backgroundDataUrl) {
        continue;
      }
      sources[key] = scene.backgroundDataUrl;
    }
    return sources;
  }, [scenarioForm.scenes]);

  useEffect(() => {
    if (!characterForm.cardName && stCards[0]?.name) {
      setCharacterForm((current) => ({
        ...current,
        cardName: stCards[0].name,
        name: current.name || stCards[0].name,
      }));
    }
  }, [characterForm.cardName, stCards]);

  useEffect(() => {
    if (!scenarioForm.characterId && characters[0]?.id) {
      setScenarioForm((current) => ({
        ...current,
        characterId: characters[0].id,
      }));
    }
  }, [characters, scenarioForm.characterId]);

  useEffect(() => {
    if (!selectedPackageScenarioId && scenarios[0]?.id) {
      setSelectedPackageScenarioId(scenarios[0].id);
      return;
    }

    if (selectedPackageScenarioId && !scenarios.some((entry) => entry.id === selectedPackageScenarioId)) {
      setSelectedPackageScenarioId(scenarios[0]?.id || '');
    }
  }, [scenarios, selectedPackageScenarioId]);

  useEffect(() => {
    if (!pendingCharacterEditorExit || characterView !== 'editor' || characterSpriteGenerationActive) {
      return;
    }
    setCharacterView('list');
    resetCharacterForm();
    setPendingCharacterEditorExit(false);
  }, [pendingCharacterEditorExit, characterView, characterSpriteGenerationActive]);

  useEffect(() => {
    void refreshComfyConnectionOptions(true);
  }, []);

  useEffect(() => {
    void refreshComfyConnectionOptions(true);
    comfyConnectionIntervalRef.current = window.setInterval(() => {
      void refreshComfyConnectionOptions(false);
    }, 4_000);

    return () => {
      if (comfyConnectionIntervalRef.current !== null) {
        window.clearInterval(comfyConnectionIntervalRef.current);
        comfyConnectionIntervalRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    setDeletingRunIds((current) => {
      if (current.size === 0) {
        return current;
      }

      const activeRunIds = new Set(runs.map((run) => run.id));
      let changed = false;
      const next = new Set<string>();
      for (const runId of current) {
        if (activeRunIds.has(runId)) {
          next.add(runId);
        } else {
          changed = true;
        }
      }

      return changed ? next : current;
    });
  }, [runs]);

  useEffect(() => {
    setDeletingPackageIds((current) => {
      if (current.size === 0) {
        return current;
      }

      const activePackageIds = new Set(packages.map((entry) => entry.id));
      let changed = false;
      const next = new Set<string>();
      for (const packageId of current) {
        if (activePackageIds.has(packageId)) {
          next.add(packageId);
        } else {
          changed = true;
        }
      }

      return changed ? next : current;
    });
  }, [packages]);

  useEffect(() => {
    return () => {
      if (spriteCropSourceUrlRef.current) {
        URL.revokeObjectURL(spriteCropSourceUrlRef.current);
        spriteCropSourceUrlRef.current = null;
      }

      for (const timeoutId of toastTimeoutsRef.current.values()) {
        window.clearTimeout(timeoutId);
      }
      toastTimeoutsRef.current.clear();

      if (bottomProgressHideTimeoutRef.current !== null) {
        window.clearTimeout(bottomProgressHideTimeoutRef.current);
        bottomProgressHideTimeoutRef.current = null;
      }
      if (bottomProgressPulseIntervalRef.current !== null) {
        window.clearInterval(bottomProgressPulseIntervalRef.current);
        bottomProgressPulseIntervalRef.current = null;
      }

      if (comfyConnectionIntervalRef.current !== null) {
        window.clearInterval(comfyConnectionIntervalRef.current);
        comfyConnectionIntervalRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!error) {
      lastExternalErrorRef.current = null;
      return;
    }

    if (error === lastExternalErrorRef.current) {
      return;
    }

    lastExternalErrorRef.current = error;
    pushToast('error', error);
  }, [error]);

  useEffect(() => {
    if (packageNameInput.trim()) {
      return;
    }

    const selectedScenario = scenarios.find((entry) => entry.id === selectedPackageScenarioId);
    if (!selectedScenario) {
      return;
    }

    setPackageNameInput(`${selectedScenario.name} Package`);
  }, [packageNameInput, scenarios, selectedPackageScenarioId]);

  useEffect(() => {
    const availableRunIds = new Set(runs.map((run) => run.id));
    setSelectedRunIdsForDeletion((current) => {
      let changed = false;
      const next = new Set<string>();
      current.forEach((runId) => {
        if (availableRunIds.has(runId)) {
          next.add(runId);
        } else {
          changed = true;
        }
      });
      return changed ? next : current;
    });
  }, [runs]);

  useEffect(() => {
    if (runMassDeletionEnabled) {
      return;
    }
    setSelectedRunIdsForDeletion(new Set());
  }, [runMassDeletionEnabled]);

  function selectPackageScenario(scenarioId: string) {
    setSelectedPackageScenarioId(scenarioId);
    const selectedScenario = scenarios.find((entry) => entry.id === scenarioId);
    setPackageNameInput(selectedScenario ? `${selectedScenario.name} Package` : '');
  }

  useEffect(() => {
    if (!menuSettingsOpen) {
      return;
    }

    setMenuInterfaceSettingsDraft(interfaceSettings);
    setMenuGameplaySettingsDraft(gameplaySettings);
  }, [gameplaySettings, interfaceSettings, menuSettingsOpen]);

  useEffect(() => {
    packageDeleteOptionsRef.current = packageDeleteOptions;
  }, [packageDeleteOptions]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    window.localStorage.setItem(GETTING_STARTED_HIDE_STORAGE_KEY, hideGettingStartedOnStartup ? '1' : '0');
  }, [hideGettingStartedOnStartup]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    window.localStorage.setItem(MOUTH_ANIMATION_WARNING_HIDE_STORAGE_KEY, hideMouthAnimationWarning ? '1' : '0');
  }, [hideMouthAnimationWarning]);

  useEffect(() => {
    setConnectionAddressDraft(sillyTavernConnection.baseUrl);
  }, [sillyTavernConnection.baseUrl]);

  useEffect(() => {
    setComfyConnectionAddressDraft(comfyBaseUrl);
  }, [comfyBaseUrl]);

  useEffect(() => {
    if (comfyCheckpoints.length === 0) {
      if (guideTestCheckpoint) {
        setGuideTestCheckpoint('');
      }
      return;
    }

    if (guideTestCheckpoint && comfyCheckpoints.includes(guideTestCheckpoint)) {
      return;
    }

    const preferredCheckpoint = characterForm.automaticGeneration.checkpoint.trim();
    if (preferredCheckpoint && comfyCheckpoints.includes(preferredCheckpoint)) {
      setGuideTestCheckpoint(preferredCheckpoint);
      return;
    }

    setGuideTestCheckpoint(comfyCheckpoints[0] || '');
  }, [characterForm.automaticGeneration.checkpoint, comfyCheckpoints, guideTestCheckpoint]);

  useEffect(() => {
    if (!connectionPanelOpen) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      if (!connectionPanelRef.current?.contains(event.target as Node)) {
        setConnectionPanelOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setConnectionPanelOpen(false);
      }
    };

    window.addEventListener('mousedown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('mousedown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [connectionPanelOpen]);

  useEffect(() => {
    setLoadedSpritePreviews((current) => {
      const next: Record<string, string> = {};
      let changed = false;

      for (const [spriteKey, spriteUrl] of Object.entries(characterSpritePreviewSources)) {
        if (current[spriteKey] === spriteUrl) {
          next[spriteKey] = spriteUrl;
        } else {
          changed = true;
        }
      }

      const currentKeys = Object.keys(current);
      if (currentKeys.length !== Object.keys(next).length) {
        changed = true;
      }

      return changed ? next : current;
    });
  }, [characterSpritePreviewSources]);

  useEffect(() => {
    if (characterView !== 'editor') {
      setCurrentSpritePreviewLoadingKey(null);
      return;
    }

    const pendingEntry = Object.entries(characterSpritePreviewSources).find(
      ([spriteKey, spriteUrl]) => Boolean(spriteUrl) && loadedSpritePreviews[spriteKey] !== spriteUrl,
    );
    if (!pendingEntry) {
      setCurrentSpritePreviewLoadingKey(null);
      return;
    }

    const [spriteKey, spriteUrl] = pendingEntry;
    let cancelled = false;
    setCurrentSpritePreviewLoadingKey(spriteKey);

    void loadImage(spriteUrl)
      .catch(() => null)
      .then(() => {
        if (cancelled) {
          return;
        }

        setLoadedSpritePreviews((current) => {
          if (current[spriteKey] === spriteUrl) {
            return current;
          }
          return {
            ...current,
            [spriteKey]: spriteUrl,
          };
        });
      });

    return () => {
      cancelled = true;
    };
  }, [characterSpritePreviewSources, characterView, loadedSpritePreviews]);

  useEffect(() => {
    setLoadedScenarioScenePreviews((current) => {
      const next: Record<string, string> = {};
      let changed = false;

      for (const [sceneKey, sceneUrl] of Object.entries(scenarioScenePreviewSources)) {
        if (current[sceneKey] === sceneUrl) {
          next[sceneKey] = sceneUrl;
        } else {
          changed = true;
        }
      }

      const currentKeys = Object.keys(current);
      if (currentKeys.length !== Object.keys(next).length) {
        changed = true;
      }

      return changed ? next : current;
    });
  }, [scenarioScenePreviewSources]);

  useEffect(() => {
    if (scenarioView !== 'editor') {
      setCurrentScenarioSceneLoadingKey(null);
      return;
    }

    const pendingEntry = Object.entries(scenarioScenePreviewSources).find(
      ([sceneKey, sceneUrl]) => loadedScenarioScenePreviews[sceneKey] !== sceneUrl,
    );
    if (!pendingEntry) {
      setCurrentScenarioSceneLoadingKey(null);
      return;
    }

    const [sceneKey, sceneUrl] = pendingEntry;
    let cancelled = false;
    setCurrentScenarioSceneLoadingKey(sceneKey);

    void loadImage(sceneUrl)
      .catch(() => null)
      .then(() => {
        if (cancelled) {
          return;
        }

        setLoadedScenarioScenePreviews((current) => {
          if (current[sceneKey] === sceneUrl) {
            return current;
          }
          return {
            ...current,
            [sceneKey]: sceneUrl,
          };
        });
      });

    return () => {
      cancelled = true;
    };
  }, [loadedScenarioScenePreviews, scenarioScenePreviewSources, scenarioView]);

  useEffect(() => {
    if (!interactiveZonesDialog || !selectedInteractiveZoneId) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isTypingTarget =
        target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);

      if (event.key === 'Delete' && !isTypingTarget) {
        event.preventDefault();
        setInteractiveZonesDraft((current) => current.filter((zone) => zone.id !== selectedInteractiveZoneId));
        setSelectedInteractiveZoneId(null);
        return;
      }

      if (event.key === 'Escape') {
        event.preventDefault();
        setDraftInteractiveZone(null);
        setMovingInteractiveZone(null);
        setSelectedInteractiveZoneId(null);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [interactiveZonesDialog, selectedInteractiveZoneId]);

  function clearBottomProgressPulse() {
    if (bottomProgressPulseIntervalRef.current !== null) {
      window.clearInterval(bottomProgressPulseIntervalRef.current);
      bottomProgressPulseIntervalRef.current = null;
    }
  }

  function clearBottomProgressHideTimeout() {
    if (bottomProgressHideTimeoutRef.current !== null) {
      window.clearTimeout(bottomProgressHideTimeoutRef.current);
      bottomProgressHideTimeoutRef.current = null;
    }
  }

  function waitForNextPaint(): Promise<void> {
    return new Promise((resolve) => {
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => resolve());
      });
    });
  }

  function openGettingStartedDialog(pageIndex = 0) {
    setGettingStartedPageIndex(clampNumber(pageIndex, 0, GETTING_STARTED_PAGES.length - 1));
    setGettingStartedOpen(true);
  }

  function closeGettingStartedDialog() {
    setGettingStartedOpen(false);
  }

  function renderGettingStartedPage(pageId: GettingStartedPageId) {
    switch (pageId) {
      case 'intro':
        return (
          <div className="getting-started-page-copy">
            <p>
              Welcome to Pettangatari. A SillyTavern frontend to create a more immersive visual novel experience with ComfyUI and Anima.
            </p>
            <p>
              Pettangatari automatically handles expressions, music, backgrounds and has a built-in CG system.
            </p>
            <p className="getting-started-callout">
              Pettangatari is meant to be played with <strong>Gemma 4 31b</strong> models, it will most likely not work with other self
              hosted models. I have not tried APIs as I have no interest in online services.
            </p>
            <p>
              <strong>It is also recommended that you use </strong>
              <a href={KOBOLDCPP_GITHUB_URL} target="_blank" rel="noreferrer">
                Koboldcpp
              </a>
              .
            </p>
            <p>Please read this guide carefully to get Pettangatari to work as intended.</p>
          </div>
        );
      case 'koboldcpp':
        return (
          <div className="getting-started-page-copy">
            <p>If you plan to use APIs, you can skip this step.</p>
            <p>As mentioned earlier, Pettangatari works using Gemma 4 31b models.</p>
            <p>
              It is recommended that you grab an uncensored model for the best experience. My personal favorite right now is{' '}
              <a href={GEMMA_MODEL_URL} target="_blank" rel="noreferrer">
                gemma-4-31B-it-uncensored-Q4_K_M.gguf
              </a>
            </p>
            <p className="getting-started-callout">
              <strong>When loading your Gemma 4 model on koboldCPP, remember to turn on Jinja and Jinja Tools in the Context tab!</strong>
            </p>
            <p>
                Pettangatari is not meant to be used with thinking enabled, so I recommend leaving Jj.Kwargs empty.
            </p>
            <figure className="getting-started-figure getting-started-figure-compact">
              <img src={koboldcppGuideImage} alt="KoboldCPP configuration screenshot" />
            </figure>
            <p>Once done, launch KoboldCPP and wait until the model is fully loaded.</p>
          </div>
        );
      case 'sillytavern':
        return (
          <div className="getting-started-page-copy">
            <p>
              Setting up SillyTavern is straightforward, change your API to Chat Completion, change Chat Completion
              Source to Custom, use <code>http://localhost:5001/v1</code> as your Custom Endpoint, then connect, it
              should connect without any issues.
            </p>
            <figure className="getting-started-figure">
              <img src={sillyTavernConnectionGuideImage} alt="SillyTavern connection settings screenshot" />
            </figure>
            <p className="getting-started-callout">
              <strong>Increase the context size to at least 8192, Pettangatari injects its own custom prompt into SillyTavern and it can get quite lengthy.</strong>
            </p>
            <figure className="getting-started-figure">
              <img src={sillyTavernChatGuideImage} alt="SillyTavern chat settings screenshot" />
            </figure>
            <p>I personally find Max Response Length at 400 tokens a good starting point</p>
            <p>Also don't forget to turn on Streaming.</p>
          </div>
        );
      case 'example-package':
        return (
          <div className="getting-started-page-copy">
            <p>That's it, everything should work as intended now.</p>
            <p>
              You are now ready to generate your first assets for your visual novel using ComfyUI and Anima.
            </p>
          </div>
        );
      case 'sprite-workflow':
        return (
          <div className="getting-started-page-copy">
            <p>
              Before you get started, be sure you have the following nodes installed on ComfyUI:
            </p>
            <ul>
              <li>
                <strong>ComfyUI Impact Pack</strong> for <code>UltralyticsDetectorProvider</code>.
              </li>
              <li>
                <strong>ComfyUI Impact Subpack</strong> for <code>FaceDetailer</code>.
              </li>
              <li>
                <strong>ComfyUI-RMBG</strong> for <code>BiRefNetRMBG</code>.
              </li>
              <li>
                <strong>ComfyUI ControlNet Auxiliary Preprocessors</strong> or <strong>ComfyUI-DepthAnythingV2</strong> for depth map generation.
              </li>
            </ul>
            <p>If you haven't done it yet, download an Anima checkpoint of your choice, I personally just use the Preview 3 one.
              You will also need a text encoders and vae for anima:</p>
              <ul>
              <li>
                <strong>Text Encoder: qwen_3_06b_base.safetensors</strong>
              </li>
              <li>
                <strong>VAE: qwen_image_vae.safetensors</strong>
              </li>
              </ul>
            <p>Do NOT rename these files.</p>
            <p><strong>Note that Pettangatari will download ToonOut and DepthAnythingV2 automatically during your first generation, so your first generation will most likely appear slow for that reason.</strong></p>
            <p>
              If you've acquired everything mentioned above, press the button below to check if everything is in order, you
              should see Hatsune Miku waving at you.
            </p>
            <div className="getting-started-guide-test-controls">
              <span className="getting-started-guide-test-label">Checkpoint</span>
              <div className="getting-started-guide-test-control-row">
                <select
                  className="getting-started-guide-test-select-input"
                  value={guideTestCheckpoint}
                  disabled={guideSpriteTest.generating || comfyCheckpoints.length === 0}
                  onChange={(event) => {
                    setGuideTestCheckpoint(event.target.value);
                    setGuideSpriteTest((current) => ({
                      ...current,
                      imageDataUrl: '',
                    }));
                  }}
                >
                  {comfyCheckpoints.length === 0 ? <option value="">No checkpoints detected</option> : null}
                  {comfyCheckpoints.map((checkpointName) => (
                    <option key={checkpointName} value={checkpointName}>
                      {checkpointName}
                    </option>
                  ))}
                </select>
                <IconButton
                  icon={refreshIcon}
                  label="Refresh checkpoints"
                  disabled={guideSpriteTest.generating}
                  onClick={() => {
                    void refreshComfyConnectionOptions(true);
                  }}
                />
              </div>
            </div>
            <div className="getting-started-guide-test-card" aria-live="polite">
              {guideSpriteTest.generating ? (
                <div className="getting-started-guide-test-loader">
                  <span className="sprite-loader-spinner" aria-hidden="true" />
                  <span>Generating [WAVING] test sprite...</span>
                </div>
              ) : guideSpriteTest.imageDataUrl ? (
                <img src={guideSpriteTest.imageDataUrl} alt="Hatsune Miku waving test sprite" className="getting-started-guide-test-image" />
              ) : (
                <div className="getting-started-guide-test-empty">Your generated test sprite will appear here.</div>
              )}
            </div>
            <div className="row-actions getting-started-guide-test-actions">
              {guideSpriteTest.imageDataUrl && !guideSpriteTest.generating ? (
                <div className="getting-started-guide-test-success">You're good to go!</div>
              ) : (
                <ActionButton
                  icon={playIcon}
                  label={guideSpriteTest.generating ? 'Testing ComfyUI Generation...' : 'Test ComfyUI Generation'}
                  className="primary-action"
                  disabled={guideSpriteTest.generating || comfyGenerationBusy}
                  onClick={() => {
                    void runGuideSpriteWorkflowTest();
                  }}
                >
                  {guideSpriteTest.generating ? (
                    <>
                      <span className="button-loader-spinner" aria-hidden="true" />
                      <span>Testing ComfyUI Generation...</span>
                    </>
                  ) : (
                    'Test ComfyUI Generation'
                  )}
                </ActionButton>
              )}
            </div>
          </div>
        );
      case 'cg-workflow':
        return (
          <div className="getting-started-page-copy">
            <p>
              Once you are done with your character sheet, move over to the scenario tab and create one.
            </p>
            <p>This is where you'll generate your locations and come up with a premise. Assign the character and you're good to go.</p>
          </div>
        );
      case 'finish':
        return (
          <div className="getting-started-page-copy">
            <p>That's it, you're all set to start playing.</p>
          </div>
        );
      default:
        return null;
    }
  }

  function startBottomProgress(label: string, initialValue = 6, pulse = false) {
    clearBottomProgressHideTimeout();
    clearBottomProgressPulse();
    setBottomProgress({
      label,
      value: clampNumber(initialValue, 0, 100),
      tone: 'active',
    });

    if (!pulse) {
      return;
    }

    bottomProgressPulseIntervalRef.current = window.setInterval(() => {
      setBottomProgress((current) => {
        if (!current || current.tone !== 'active') {
          return current;
        }
        return {
          ...current,
          value: Math.min(current.value + 4, 92),
        };
      });
    }, 240);
  }

  function updateBottomProgress(value: number, label?: string) {
    setBottomProgress((current) => ({
      label: label || current?.label || '',
      value: clampNumber(value, 0, 100),
      tone: current?.tone || 'active',
    }));
  }

  function finishBottomProgress(label?: string, tone: BottomProgressState['tone'] = 'success') {
    clearBottomProgressPulse();
    setBottomProgress((current) => ({
      label: label || current?.label || '',
      value: 100,
      tone,
    }));

    clearBottomProgressHideTimeout();
    bottomProgressHideTimeoutRef.current = window.setTimeout(() => {
      setBottomProgress((current) => (current && current.tone === tone ? null : current));
      bottomProgressHideTimeoutRef.current = null;
    }, 760);
  }

  function dismissToast(toastId: string) {
    const timeoutId = toastTimeoutsRef.current.get(toastId);
    if (typeof timeoutId === 'number') {
      window.clearTimeout(timeoutId);
      toastTimeoutsRef.current.delete(toastId);
    }
    setToasts((current) => current.filter((toast) => toast.id !== toastId));
  }

  function pushToast(kind: Toast['kind'], message: string) {
    const toastId = createFormLocalId('toast');
    setToasts((current) => [...current, { id: toastId, kind, message }]);
    const timeoutId = window.setTimeout(() => {
      toastTimeoutsRef.current.delete(toastId);
      setToasts((current) => current.filter((toast) => toast.id !== toastId));
    }, kind === 'error' ? 6000 : 3600);
    toastTimeoutsRef.current.set(toastId, timeoutId);
  }

  function getGeneratedSpriteFilePaths(files?: GeneratedSpriteFileSet): string[] {
    if (!files) {
      return [];
    }
    return Array.from(
      new Set([files.imageFilePath, files.depthMapFilePath, files.openMouthFilePath].filter((value): value is string => Boolean(value))),
    );
  }

  function queueGeneratedSpriteFileCleanup(filePaths: string[], failureMessage: string) {
    if (filePaths.length === 0) {
      return;
    }

    void deleteGeneratedComfyAssets(filePaths).catch((error) => {
      pushToast('error', error instanceof Error ? error.message : failureMessage);
    });
  }

  function applyGenerateMouthAnimationsEnabled(target: 'automatic' | 'manual') {
    if (target === 'manual') {
      setManualGenerationDialog((current) => (current ? { ...current, generateMouthAnimations: true } : current));
      return;
    }

    updateAutomaticGeneration((current) => ({
      ...current,
      generateMouthAnimations: true,
    }));
  }

  function requestGenerateMouthAnimationsEnabled(target: 'automatic' | 'manual') {
    if (hideMouthAnimationWarning) {
      applyGenerateMouthAnimationsEnabled(target);
      return;
    }

    setMouthAnimationWarningDialog({
      target,
      doNotShowAgain: false,
    });
  }

  function ensureSillyTavernOnline(actionLabel: string): boolean {
    if (sillyTavernConnection.online) {
      return true;
    }

    pushToast('error', `SillyTavern is offline. Reconnect before ${actionLabel}.`);
    return false;
  }

  async function runWithBusyState(task: () => Promise<void>, successMessage?: string) {
    try {
      setBusy(true);
      await task();
      if (successMessage) {
        pushToast('success', successMessage);
      }
    } catch (taskError) {
      pushToast('error', taskError instanceof Error ? taskError.message : 'Action failed.');
    } finally {
      setBusy(false);
    }
  }

  function getScenarioStartingPointScene(
    scenario: OneShotScenario,
    startingPoint: ReturnType<typeof getScenarioStartingPoints>[number],
  ) {
    return scenario.scenes.find((scene) => scene.id === startingPoint.sceneId) || null;
  }

  function requestRunStart(scenario: OneShotScenario) {
    const startingPoints = getScenarioStartingPoints(scenario);
    const leadCharacter = characterById.get(scenario.characterId);
    const suggestedValues = getCharacterSuggestedSessionValues(leadCharacter);
    setRunStartingPointDialog({
      scenarioId: scenario.id,
      selectedStartingPointId: startingPoints[0]?.id,
      affinityEnabled: false,
      affinityStartingValue: 1,
      affinityMinimumValue: suggestedValues.affinityNegativeMaximum,
      affinityMaximumValue: suggestedValues.affinityPositiveMaximum,
      lustEnabled: false,
      lustStartingValue: 0,
      lustMaximumValue: suggestedValues.lustMaximum,
    });
  }

  function startRunFromDialog() {
    if (!runStartingPointDialog) {
      return;
    }

    const options: StartRunOptions = {
      startingPointId: runStartingPointDialog.selectedStartingPointId,
    };
    if (runStartingPointDialog.affinityEnabled) {
      options.affinity = {
        enabled: true,
        startingValue: runStartingPointDialog.affinityStartingValue,
        minimumValue: runStartingPointDialog.affinityMinimumValue,
        maximumValue: runStartingPointDialog.affinityMaximumValue,
      };
    }
    if (runStartingPointDialog.lustEnabled) {
      options.lust = {
        enabled: true,
        startingValue: runStartingPointDialog.lustStartingValue,
        maximumValue: runStartingPointDialog.lustMaximumValue,
      };
    }
    const scenarioId = runStartingPointDialog.scenarioId;
    setRunStartingPointDialog(null);
    void runWithBusyState(async () => {
      await onStartRun(scenarioId, options);
    });
  }

  async function refreshComfyConnectionOptions(showCheckingState = false) {
    if (showCheckingState) {
      setComfyConnectionState('checking');
      setComfyConnectionError('');
    }

    try {
      const options = await fetchComfyOptions();
      const spriteMissingNodes = options.missingNodes.filter((entry) => entry.workflowKind === 'sprite');
      const hasMissingNodes = spriteMissingNodes.length > 0;
      setComfyConnectionState(options.online ? 'online' : 'offline');
      setComfyBaseUrl(options.baseUrl || comfyBaseUrl);
      setComfyMissingNodes(spriteMissingNodes);
      setComfyConnectionError(
        options.online
          ? hasMissingNodes
            ? 'Missing ComfyUI nodes detected. Install required nodes before generating.'
            : options.error || ''
          : options.error || '',
      );
      setComfyCheckpoints(options.checkpoints);
      setComfyLoras(options.loras);
      setComfyUpscaleModels(options.upscaleModels);

      if (options.defaultCheckpoint) {
        setCharacterForm((current) =>
          current.automaticGeneration.checkpoint
            ? current
            : {
                ...current,
                automaticGeneration: {
                  ...current.automaticGeneration,
                  checkpoint: options.defaultCheckpoint,
                },
              },
        );
      }
    } catch (error) {
      setComfyConnectionState('offline');
      setComfyMissingNodes([]);
      setComfyUpscaleModels([]);
      setComfyConnectionError(error instanceof Error ? error.message : 'ComfyUI is unreachable.');
    }
  }

  function requestConfirmation(confirmState: ConfirmState) {
    setPendingConfirm(confirmState);
  }

  function toggleRunMassDeletion(enabled: boolean) {
    setRunMassDeletionEnabled(enabled);
  }

  function toggleRunDeletionSelection(runId: string) {
    setSelectedRunIdsForDeletion((current) => {
      const next = new Set(current);
      if (next.has(runId)) {
        next.delete(runId);
      } else {
        next.add(runId);
      }
      return next;
    });
  }

  function requestDeleteSelectedRuns() {
    const runIds = runs
      .map((run) => run.id)
      .filter((runId) => selectedRunIdsForDeletion.has(runId) && !deletingRunIds.has(runId));

    if (runIds.length === 0) {
      return;
    }

    requestConfirmation({
      title: 'Delete selected runs?',
      description: `Delete ${runIds.length} selected saved ${runIds.length === 1 ? 'run' : 'runs'}?`,
      confirmLabel: 'Delete selected',
      successMessage: `${runIds.length} ${runIds.length === 1 ? 'run' : 'runs'} deleted.`,
      action: async () => {
        setDeletingRunIds((current) => {
          const next = new Set(current);
          runIds.forEach((runId) => next.add(runId));
          return next;
        });
        try {
          await Promise.all(runIds.map((runId) => onDeleteRun(runId)));
          setSelectedRunIdsForDeletion((current) => {
            const next = new Set(current);
            runIds.forEach((runId) => next.delete(runId));
            return next;
          });
          setRunMassDeletionEnabled(false);
        } finally {
          setDeletingRunIds((current) => {
            const next = new Set(current);
            runIds.forEach((runId) => next.delete(runId));
            return next;
          });
        }
      },
    });
  }

  function switchSidebarTab(nextTab: TabId) {
    if (nextTab === activeTab) {
      return;
    }

    const isEditingCharacter = activeTab === 'character-creator' && characterView === 'editor';
    const isEditingScenario = activeTab === 'scenario-creator' && scenarioView === 'editor';

    if (!isEditingCharacter && !isEditingScenario) {
      setActiveTab(nextTab);
      return;
    }

    requestConfirmation({
      title: 'Discard unsaved changes?',
      description: `Continue to another tab? All unsaved ${isEditingCharacter ? 'character' : 'scenario'} changes will be lost.`,
      confirmLabel: 'Continue',
      action: async () => {
        if (isEditingCharacter) {
          setCharacterView('list');
          resetCharacterForm();
        }

        if (isEditingScenario) {
          setScenarioView('list');
          resetScenarioForm();
        }

        setActiveTab(nextTab);
      },
    });
  }

  function resetCharacterForm() {
    setPendingCharacterEditorExit(false);
    setCharacterNameTouched(false);
    setCharacterEditorSubTab('manual');
    generatedSpriteFilesBySlotRef.current = {};
    setCharacterForm(createEmptyCharacterForm(stCards[0]?.name || '', stCards[0]?.name || ''));
    setSelectedAssetVariantByKey({});
    setGenerationInProgress(false);
    setGenerationProgressValue(0);
    setGenerationProgressText('');
    setGeneratedThumbnails([]);
    closeSpriteCropDialog();
    setInteractiveZonesDialog(null);
    setInteractiveZoneTool('draw');
    setSelectedInteractiveZoneId(null);
    setDraftInteractiveZone(null);
    setCopiedInteractiveZones(null);
  }

  function resetScenarioForm() {
    const nextForm = createEmptyScenarioForm(characters[0]?.id || '');
    setScenarioForm(nextForm);
    setSelectedScenarioStartingPointId(nextForm.startingPoints[0]?.id || '');
    setScenarioEditorSubTab('manual');
    setScenarioAutoPlaces([createEmptyScenarioAutoPlace()]);
    setScenarioAutoGenerationInProgress(false);
  }

  function openNewCharacterEditor() {
    resetCharacterForm();
    setPendingCharacterEditorExit(false);
    setCharacterView('editor');
  }

  function openCharacterEditor(character: StudioCharacter) {
    setCharacterNameTouched(true);
    generatedSpriteFilesBySlotRef.current = {};
    const customReactions = (character.customReactions || []).map((reaction, index) => ({
      id: `${reaction.name}-${index}`,
      triggersInput: Array.from(new Set([reaction.name, ...(reaction.triggers || [])])).join(', '),
    }));
    const cgs = (character.cgs || []).map((cg, index) => ({
      id: `${cg.name}-${index}`,
      triggersInput: Array.from(new Set([cg.name, ...(cg.triggers || [])])).join(', '),
    }));
    const customReactionSprites = Object.fromEntries(
      customReactions.map((reaction, index) => [
        `CUSTOM:${reaction.id}`,
        normalizeAssetVariants(character.customReactions[index]?.sprites),
      ] as const),
    );
    const customReactionDepthMaps = Object.fromEntries(
      customReactions.map((reaction, index) => {
        const sprites = normalizeAssetVariants(character.customReactions[index]?.sprites);
        return [
          `CUSTOM:${reaction.id}`,
          normalizeDepthMapVariants(character.customReactions[index]?.depthMaps, sprites.length),
        ] as const;
      }),
    );
    const customReactionAnimationFrames = Object.fromEntries(
      customReactions.map((reaction, index) => {
        const sprites = normalizeAssetVariants(character.customReactions[index]?.sprites);
        return [
          `CUSTOM:${reaction.id}`,
          normalizeSpriteAnimationFrameSet(character.customReactions[index]?.animationFrames, sprites.length),
        ] as const;
      }),
    );
    const cgImages = Object.fromEntries(
      (character.cgs || [])
        .map((cg, index) => [`CG:${cg.name}-${index}`, normalizeAssetVariants(cg.images)] as const),
    );
    const spriteZones = Object.fromEntries(
      Object.entries(character.spriteZones || {}).map(([expression, zones]) => [
        expression,
        Array.isArray(zones) ? zones.map((zone) => ({ ...zone })) : [],
      ]),
    );

    const spriteVariants = createSpriteVariantMap(character.sprites);
    const spriteDepthMapVariants = createSpriteDepthMapVariantMap(character.spriteDepthMaps, character.sprites);
    const spriteAnimationFrameVariants = createSpriteAnimationFrameMap(character.spriteAnimationFrames, character.sprites);

    setCharacterForm({
      id: character.id,
      name: character.name,
      cardName: character.cardName,
      accentColor: character.accentColor || DEFAULT_CHARACTER_ACCENT_COLOR,
      suggestedAffinityPositiveMaximum: getCharacterSuggestedSessionValues(character).affinityPositiveMaximum,
      suggestedAffinityNegativeMaximum: getCharacterSuggestedSessionValues(character).affinityNegativeMaximum,
      suggestedLustMaximum: getCharacterSuggestedSessionValues(character).lustMaximum,
      characterNameFontId: character.characterNameFontId || DEFAULT_DIALOGUE_QUOTE_FONT_ID,
      characterNameColor: character.characterNameColor || character.accentColor || DEFAULT_CHARACTER_ACCENT_COLOR,
      blipSound: character.blipSound || '',
      dialogueQuoteFontId: character.dialogueQuoteFontId || DEFAULT_DIALOGUE_QUOTE_FONT_ID,
      dialogueQuoteAnimationPreset: normalizeDialogueQuoteAnimationPreset(character.dialogueQuoteAnimationPreset),
      dialogueQuoteAnimationSpeed: normalizeDialogueQuoteAnimationSpeed(character.dialogueQuoteAnimationSpeed),
      dialogueQuoteAnimationColor: normalizeDialogueQuoteAnimationColor(character.dialogueQuoteAnimationColor),
      sprites: {
        ...spriteVariants,
        ...customReactionSprites,
        ...cgImages,
      },
      spriteDepthMaps: {
        ...spriteDepthMapVariants,
        ...customReactionDepthMaps,
      },
      spriteAnimationFrames: {
        ...spriteAnimationFrameVariants,
        ...customReactionAnimationFrames,
      },
      spriteZones,
      customReactions,
      cgs,
      automaticGeneration: normalizeAutomaticGenerationSettings(character.automaticGeneration),
    });
    setSelectedAssetVariantByKey({});
    setGeneratedThumbnails([]);
    setGenerationProgressValue(0);
    setGenerationProgressText('');
    setCharacterEditorSubTab('manual');
    setPendingCharacterEditorExit(false);
    setCharacterView('editor');
  }

  function openNewScenarioEditor() {
    resetScenarioForm();
    setScenarioView('editor');
  }

  function openScenarioEditor(scenario: OneShotScenario) {
    const nextStartingPoints = getScenarioStartingPoints(scenario).map((point) => ({
      id: point.id,
      name: point.name,
      sceneId: point.sceneId,
      startMessage: point.startMessage,
      specialInstructions: point.specialInstructions,
    }));
    setScenarioForm({
      id: scenario.id,
      name: scenario.name,
      description: scenario.description,
      startMessage: scenario.startMessage || '',
      specialInstructions: scenario.specialInstructions || '',
      characterId: scenario.characterId,
      bannerDataUrl: scenario.bannerDataUrl || '',
      startSceneId: scenario.startSceneId || scenario.scenes[0]?.id || '',
      startingPoints: nextStartingPoints,
      scenes: scenario.scenes.map((scene) => ({
        id: scene.id,
        name: scene.name,
        backgroundDataUrl: scene.backgroundDataUrl,
        backgroundDepthMapDataUrl: scene.backgroundDepthMapDataUrl || '',
        bgmDataUrl: scene.bgmDataUrl || '',
        ambientNoiseDataUrl: scene.ambientNoiseDataUrl || '',
        ambientNoisePresetId: scene.ambientNoisePresetId || '',
        ambientNoiseMuffled: scene.ambientNoiseMuffled === true,
        weatherPreset: normalizeSceneWeatherPreset(scene.weatherPreset),
        triggerWordsInput: (scene.triggerWords || []).join(', '),
      })),
    });
    setScenarioEditorSubTab('manual');
    setScenarioAutoPlaces([createEmptyScenarioAutoPlace()]);
    setScenarioAutoGenerationInProgress(false);
    setSelectedScenarioStartingPointId(nextStartingPoints[0]?.id || '');
    setScenarioView('editor');
  }

  function addScenarioStartingPoint() {
    setScenarioForm((current) => {
      if (current.startingPoints.length >= 5) {
        return current;
      }

      const nextScene = current.scenes[0];
      if (!nextScene?.id) {
        return current;
      }
      const nextPointId = createFormLocalId('start');
      setSelectedScenarioStartingPointId(nextPointId);

      return {
        ...current,
        startingPoints: normalizeScenarioFormStartingPoints({
          ...current,
          startingPoints: [
            ...current.startingPoints,
            {
              id: nextPointId,
              name: nextScene.name || `Start ${current.startingPoints.length + 1}`,
              sceneId: nextScene.id,
              startMessage: '',
              specialInstructions: '',
            },
          ],
        }),
      };
    });
  }

  function updateScenarioStartingPoint(
    startingPointId: string,
    updates: Partial<{ name: string; sceneId: string; startMessage: string; specialInstructions: string }>,
  ) {
    setScenarioForm((current) => ({
      ...current,
      startingPoints: normalizeScenarioFormStartingPoints({
        ...current,
        startingPoints: current.startingPoints.map((point) =>
          point.id === startingPointId ? { ...point, ...updates } : point,
        ),
      }),
    }));
  }

  function removeScenarioStartingPoint(startingPointId: string) {
    setScenarioForm((current) => ({
      ...current,
      startingPoints: (() => {
        const nextPoints = normalizeScenarioFormStartingPoints({
          ...current,
          startingPoints: current.startingPoints.filter((point) => point.id !== startingPointId),
        });
        if (selectedScenarioStartingPointId === startingPointId) {
          setSelectedScenarioStartingPointId(nextPoints[0]?.id || '');
        }
        return nextPoints;
      })(),
    }));
  }

  function getSelectedAssetVariantIndex(assetKey: string): number {
    const rawIndex = selectedAssetVariantByKey[assetKey];
    return Number.isInteger(rawIndex) && rawIndex >= 0 && rawIndex < ASSET_VARIANT_COUNT ? rawIndex : 0;
  }

  function setSelectedAssetVariantIndex(assetKey: string, variantIndex: number) {
    setSelectedAssetVariantByKey((current) => ({
      ...current,
      [assetKey]: variantIndex,
    }));
  }

  function getCharacterSpriteVariant(expression: string, variantIndex = getSelectedAssetVariantIndex(expression)): string {
    return normalizeAssetVariants(characterForm.sprites[expression])[variantIndex] || '';
  }

  function getCharacterSpriteDepthMapVariant(expression: string, variantIndex = getSelectedAssetVariantIndex(expression)): string {
    return normalizeAssetVariants(characterForm.spriteDepthMaps[expression])[variantIndex] || '';
  }

  function getCharacterSpriteOpenMouthVariant(expression: string, variantIndex = getSelectedAssetVariantIndex(expression)): string {
    return normalizeSpriteAnimationFrameSet(characterForm.spriteAnimationFrames[expression]).openMouth[variantIndex] || '';
  }

  function getGeneratedPromptSlotKey(assetKey: string, variantIndex: number): string {
    return `${assetKey}::${variantIndex + 1}`;
  }

  function setCharacterSprite(
    expression: string,
    imageDataUrl: string,
    variantIndex = getSelectedAssetVariantIndex(expression),
    options?: {
      generatedPrompt?: string;
      depthMapDataUrl?: string;
      animationFrames?: { closedEyes?: string; openMouth?: string };
      generatedFiles?: GeneratedSpriteFileSet;
    },
  ) {
    const slotKey = getGeneratedPromptSlotKey(expression, variantIndex);
    const previewKey = `${expression}:${variantIndex}`;
    const previousGeneratedFiles = generatedSpriteFilesBySlotRef.current[slotKey];
    const nextGeneratedFiles = options?.generatedFiles;
    const nextGeneratedFilePaths = getGeneratedSpriteFilePaths(nextGeneratedFiles);
    const previousGeneratedFilePaths = getGeneratedSpriteFilePaths(previousGeneratedFiles);
    const staleGeneratedFilePaths = previousGeneratedFilePaths.filter((filePath) => !nextGeneratedFilePaths.includes(filePath));

    setLoadedSpritePreviews((current) => {
      if (current[previewKey] === imageDataUrl) {
        return current;
      }
      return {
        ...current,
        [previewKey]: imageDataUrl,
      };
    });

    if (nextGeneratedFiles && nextGeneratedFilePaths.length > 0) {
      generatedSpriteFilesBySlotRef.current[slotKey] = nextGeneratedFiles;
    } else {
      delete generatedSpriteFilesBySlotRef.current[slotKey];
    }
    queueGeneratedSpriteFileCleanup(staleGeneratedFilePaths, 'Failed to delete replaced generated sprite files.');

    setCharacterForm((current) => {
      const nextVariants = normalizeAssetVariants(current.sprites[expression]);
      const nextDepthMaps = normalizeAssetVariants(current.spriteDepthMaps[expression]);
      const currentAnimationFrames = normalizeSpriteAnimationFrameSet(current.spriteAnimationFrames[expression]);
      const nextClosedEyes = [...currentAnimationFrames.closedEyes];
      const nextOpenMouth = [...currentAnimationFrames.openMouth];
      nextVariants[variantIndex] = imageDataUrl;
      if (options?.depthMapDataUrl) {
        nextDepthMaps[variantIndex] = options.depthMapDataUrl;
      } else {
        delete nextDepthMaps[variantIndex];
      }
      if (options?.animationFrames?.closedEyes) {
        nextClosedEyes[variantIndex] = options.animationFrames.closedEyes;
      } else {
        delete nextClosedEyes[variantIndex];
      }
      if (options?.animationFrames?.openMouth) {
        nextOpenMouth[variantIndex] = options.animationFrames.openMouth;
      } else {
        delete nextOpenMouth[variantIndex];
      }
      const nextGeneratedPromptBySlot = { ...current.automaticGeneration.generatedPromptBySlot };
      const generatedPrompt = options?.generatedPrompt?.trim() || '';
      if (generatedPrompt) {
        nextGeneratedPromptBySlot[slotKey] = generatedPrompt;
      } else {
        delete nextGeneratedPromptBySlot[slotKey];
      }
      return {
        ...current,
        sprites: {
          ...current.sprites,
          [expression]: nextVariants.filter(Boolean).slice(0, ASSET_VARIANT_COUNT),
        },
        spriteDepthMaps: {
          ...current.spriteDepthMaps,
          [expression]: nextDepthMaps.slice(0, ASSET_VARIANT_COUNT),
        },
        spriteAnimationFrames: {
          ...current.spriteAnimationFrames,
          [expression]: {
            closedEyes: nextClosedEyes.slice(0, ASSET_VARIANT_COUNT),
            openMouth: nextOpenMouth.slice(0, ASSET_VARIANT_COUNT),
          },
        },
        automaticGeneration: {
          ...current.automaticGeneration,
          generatedPromptBySlot: nextGeneratedPromptBySlot,
        },
      };
    });
  }

  function clearCharacterSprite(expression: string, variantIndex = getSelectedAssetVariantIndex(expression)) {
    const removedSlotKey = getGeneratedPromptSlotKey(expression, variantIndex);
    const previousGeneratedFiles = generatedSpriteFilesBySlotRef.current[removedSlotKey];
    delete generatedSpriteFilesBySlotRef.current[removedSlotKey];
    for (let currentIndex = variantIndex + 1; currentIndex < ASSET_VARIANT_COUNT; currentIndex += 1) {
      const sourceKey = getGeneratedPromptSlotKey(expression, currentIndex);
      const destinationKey = getGeneratedPromptSlotKey(expression, currentIndex - 1);
      const sourceFiles = generatedSpriteFilesBySlotRef.current[sourceKey];
      if (sourceFiles) {
        generatedSpriteFilesBySlotRef.current[destinationKey] = sourceFiles;
        delete generatedSpriteFilesBySlotRef.current[sourceKey];
      } else {
        delete generatedSpriteFilesBySlotRef.current[destinationKey];
      }
    }
    setLoadedSpritePreviews((current) => {
      const next = { ...current };
      let changed = false;
      for (let currentIndex = variantIndex; currentIndex < ASSET_VARIANT_COUNT; currentIndex += 1) {
        const sourcePreviewKey = `${expression}:${currentIndex + 1}`;
        const destinationPreviewKey = `${expression}:${currentIndex}`;
        if (sourcePreviewKey in next) {
          next[destinationPreviewKey] = next[sourcePreviewKey];
          delete next[sourcePreviewKey];
          changed = true;
          continue;
        }
        if (destinationPreviewKey in next) {
          delete next[destinationPreviewKey];
          changed = true;
        }
      }
      return changed ? next : current;
    });
    queueGeneratedSpriteFileCleanup(
      getGeneratedSpriteFilePaths(previousGeneratedFiles),
      'Failed to delete cleared generated sprite files.',
    );

    setCharacterForm((current) => {
      const nextSpriteZones = { ...current.spriteZones };
      const nextVariants = normalizeAssetVariants(current.sprites[expression]);
      const nextDepthMaps = normalizeAssetVariants(current.spriteDepthMaps[expression]);
      const nextAnimationFrames = normalizeSpriteAnimationFrameSet(current.spriteAnimationFrames[expression]);
      nextVariants.splice(variantIndex, 1);
      nextDepthMaps.splice(variantIndex, 1);
      nextAnimationFrames.closedEyes.splice(variantIndex, 1);
      nextAnimationFrames.openMouth.splice(variantIndex, 1);
      const nextGeneratedPromptBySlot = { ...current.automaticGeneration.generatedPromptBySlot };
      delete nextGeneratedPromptBySlot[removedSlotKey];
      for (let currentIndex = variantIndex + 1; currentIndex < ASSET_VARIANT_COUNT; currentIndex += 1) {
        const sourceKey = getGeneratedPromptSlotKey(expression, currentIndex);
        const destinationKey = getGeneratedPromptSlotKey(expression, currentIndex - 1);
        if (!nextGeneratedPromptBySlot[sourceKey]) {
          continue;
        }
        nextGeneratedPromptBySlot[destinationKey] = nextGeneratedPromptBySlot[sourceKey];
        delete nextGeneratedPromptBySlot[sourceKey];
      }
      if (nextVariants.length === 0) {
        delete nextSpriteZones[expression];
      }
      return {
        ...current,
        sprites: {
          ...current.sprites,
          [expression]: nextVariants,
        },
        spriteDepthMaps: {
          ...current.spriteDepthMaps,
          [expression]: nextDepthMaps,
        },
        spriteAnimationFrames: {
          ...current.spriteAnimationFrames,
          [expression]: nextAnimationFrames,
        },
        spriteZones: nextSpriteZones,
        automaticGeneration: {
          ...current.automaticGeneration,
          generatedPromptBySlot: nextGeneratedPromptBySlot,
        },
      };
    });
    if (
      interactiveZonesDialog?.expression === expression &&
      normalizeAssetVariants(characterForm.sprites[expression]).length <= 1
    ) {
      setInteractiveZonesDialog(null);
      setSelectedInteractiveZoneId(null);
      setDraftInteractiveZone(null);
    }
  }

  function openInteractiveZonesEditor(expression: string, imageDataUrl: string, title: string) {
    if (!imageDataUrl) {
      return;
    }

    setInteractiveZonesDialog({
      expression,
      title,
      sourceDataUrl: imageDataUrl,
    });
    setInteractiveZonesDraft((characterForm.spriteZones[expression] || []).map((zone) => ({ ...zone })));
    setInteractiveZoneTool('draw');
    setSelectedInteractiveZoneId(null);
    setDraftInteractiveZone(null);
    setMovingInteractiveZone(null);
  }

  function addCustomReaction() {
    const newId = createFormLocalId('custom');
    setCharacterForm((current) => ({
      ...current,
      customReactions: [...current.customReactions, { id: newId, triggersInput: '' }],
    }));
  }

  function addCg() {
    const newId = createFormLocalId('cg');
    setCharacterForm((current) => ({
      ...current,
      cgs: [...current.cgs, { id: newId, triggersInput: '' }],
    }));
  }

  function updateCustomReactionTriggers(reactionId: string, nextTriggersInput: string) {
    setCharacterForm((current) => {
      const currentReaction = current.customReactions.find((entry) => entry.id === reactionId);
      if (!currentReaction) {
        return current;
      }

      const previousNormalizedName = parseReactionTriggersInput(currentReaction.triggersInput)[0] || '';
      const normalizedName = parseReactionTriggersInput(nextTriggersInput)[0] || '';
      const nextCustomReactions = current.customReactions.map((entry) =>
        entry.id === reactionId
          ? {
              ...entry,
              triggersInput: nextTriggersInput,
            }
          : entry,
      );

      const nextSpriteZones = { ...current.spriteZones };
      if (previousNormalizedName && previousNormalizedName !== normalizedName) {
        const previousZones = nextSpriteZones[previousNormalizedName] || [];
        delete nextSpriteZones[previousNormalizedName];
        if (normalizedName && previousZones.length > 0 && !(nextSpriteZones[normalizedName]?.length)) {
          nextSpriteZones[normalizedName] = previousZones;
        }
      }

      return {
        ...current,
        customReactions: nextCustomReactions,
        spriteZones: nextSpriteZones,
      };
    });
  }

  function removeCustomReaction(reactionId: string) {
    const filePathsToDelete: string[] = [];
    const nextLoadedSpritePreviews = { ...loadedSpritePreviews };
    for (let variantIndex = 0; variantIndex < ASSET_VARIANT_COUNT; variantIndex += 1) {
      const slotKey = getGeneratedPromptSlotKey(`CUSTOM:${reactionId}`, variantIndex);
      filePathsToDelete.push(...getGeneratedSpriteFilePaths(generatedSpriteFilesBySlotRef.current[slotKey]));
      delete generatedSpriteFilesBySlotRef.current[slotKey];
      delete nextLoadedSpritePreviews[`CUSTOM:${reactionId}:${variantIndex}`];
    }
    setLoadedSpritePreviews(nextLoadedSpritePreviews);
    queueGeneratedSpriteFileCleanup(filePathsToDelete, 'Failed to delete removed generated reaction sprite files.');

    setCharacterForm((current) => {
      const target = current.customReactions.find((entry) => entry.id === reactionId);
      if (!target) {
        return current;
      }

      const nextSprites = { ...current.sprites };
      const nextSpriteDepthMaps = { ...current.spriteDepthMaps };
      const nextSpriteAnimationFrames = { ...current.spriteAnimationFrames };
      const nextSpriteZones = { ...current.spriteZones };
      const nextGeneratedPromptBySlot = { ...current.automaticGeneration.generatedPromptBySlot };
      delete nextSprites[`CUSTOM:${reactionId}`];
      delete nextSpriteDepthMaps[`CUSTOM:${reactionId}`];
      delete nextSpriteAnimationFrames[`CUSTOM:${reactionId}`];
      for (let variantIndex = 0; variantIndex < ASSET_VARIANT_COUNT; variantIndex += 1) {
        delete nextGeneratedPromptBySlot[getGeneratedPromptSlotKey(`CUSTOM:${reactionId}`, variantIndex)];
      }
      for (const trigger of parseReactionTriggersInput(target.triggersInput)) {
        delete nextSpriteZones[trigger];
      }

      return {
        ...current,
        customReactions: current.customReactions.filter((entry) => entry.id !== reactionId),
        sprites: nextSprites,
        spriteDepthMaps: nextSpriteDepthMaps,
        spriteAnimationFrames: nextSpriteAnimationFrames,
        spriteZones: nextSpriteZones,
        automaticGeneration: {
          ...current.automaticGeneration,
          generatedPromptBySlot: nextGeneratedPromptBySlot,
        },
      };
    });
  }

  function updateCg(cgId: string, updates: Partial<{ triggersInput: string }>) {
    setCharacterForm((current) => {
      const target = current.cgs.find((entry) => entry.id === cgId);
      if (!target) {
        return current;
      }

      const previousKey = `CG:${target.id}`;
      const nextKey = previousKey;
      const nextCgs = current.cgs.map((entry) => (entry.id === cgId ? { ...entry, ...updates } : entry));

      const nextSprites = { ...current.sprites };
      const nextSpriteDepthMaps = { ...current.spriteDepthMaps };
      const nextSpriteAnimationFrames = { ...current.spriteAnimationFrames };
      if (previousKey !== nextKey && nextSprites[previousKey]?.length) {
        nextSprites[nextKey] = nextSprites[previousKey];
        delete nextSprites[previousKey];
        nextSpriteDepthMaps[nextKey] = nextSpriteDepthMaps[previousKey];
        delete nextSpriteDepthMaps[previousKey];
        nextSpriteAnimationFrames[nextKey] = nextSpriteAnimationFrames[previousKey];
        delete nextSpriteAnimationFrames[previousKey];
      }

      return {
        ...current,
        cgs: nextCgs,
        sprites: nextSprites,
        spriteDepthMaps: nextSpriteDepthMaps,
        spriteAnimationFrames: nextSpriteAnimationFrames,
      };
    });
  }

  function removeCg(cgId: string) {
    const filePathsToDelete: string[] = [];
    const nextLoadedSpritePreviews = { ...loadedSpritePreviews };
    for (let variantIndex = 0; variantIndex < ASSET_VARIANT_COUNT; variantIndex += 1) {
      const slotKey = getGeneratedPromptSlotKey(`CG:${cgId}`, variantIndex);
      filePathsToDelete.push(...getGeneratedSpriteFilePaths(generatedSpriteFilesBySlotRef.current[slotKey]));
      delete generatedSpriteFilesBySlotRef.current[slotKey];
      delete nextLoadedSpritePreviews[`CG:${cgId}:${variantIndex}`];
    }
    setLoadedSpritePreviews(nextLoadedSpritePreviews);
    queueGeneratedSpriteFileCleanup(filePathsToDelete, 'Failed to delete removed generated CG files.');

    setCharacterForm((current) => {
      const nextSprites = { ...current.sprites };
      const nextSpriteDepthMaps = { ...current.spriteDepthMaps };
      const nextSpriteAnimationFrames = { ...current.spriteAnimationFrames };
      const nextGeneratedPromptBySlot = { ...current.automaticGeneration.generatedPromptBySlot };
      delete nextSprites[`CG:${cgId}`];
      delete nextSpriteDepthMaps[`CG:${cgId}`];
      delete nextSpriteAnimationFrames[`CG:${cgId}`];
      for (let variantIndex = 0; variantIndex < ASSET_VARIANT_COUNT; variantIndex += 1) {
        delete nextGeneratedPromptBySlot[getGeneratedPromptSlotKey(`CG:${cgId}`, variantIndex)];
      }

      return {
        ...current,
        cgs: current.cgs.filter((entry) => entry.id !== cgId),
        sprites: nextSprites,
        spriteDepthMaps: nextSpriteDepthMaps,
        spriteAnimationFrames: nextSpriteAnimationFrames,
        automaticGeneration: {
          ...current.automaticGeneration,
          generatedPromptBySlot: nextGeneratedPromptBySlot,
        },
      };
    });
  }

  function setCharacterSpriteAtVariant(
    assetKey: string,
    imageDataUrl: string,
    variantIndex: number,
    options?: {
      generatedPrompt?: string;
      depthMapDataUrl?: string;
      animationFrames?: { closedEyes?: string; openMouth?: string };
      generatedFiles?: GeneratedSpriteFileSet;
    },
  ) {
    setCharacterSprite(assetKey, imageDataUrl, variantIndex, options);
  }

  function setCharacterSpriteDepthMap(
    assetKey: string,
    depthMapDataUrl: string,
    variantIndex: number,
    options?: { generatedFilePath?: string },
  ) {
    const slotKey = getGeneratedPromptSlotKey(assetKey, variantIndex);
    const previousGeneratedFiles = generatedSpriteFilesBySlotRef.current[slotKey];
    const nextGeneratedFiles =
      previousGeneratedFiles || options?.generatedFilePath
        ? {
            ...previousGeneratedFiles,
            depthMapFilePath: options?.generatedFilePath,
          }
        : undefined;
    const previousGeneratedFilePaths = getGeneratedSpriteFilePaths(previousGeneratedFiles);
    const nextGeneratedFilePaths = getGeneratedSpriteFilePaths(nextGeneratedFiles);
    const staleGeneratedFilePaths = previousGeneratedFilePaths.filter((filePath) => !nextGeneratedFilePaths.includes(filePath));

    if (nextGeneratedFiles && nextGeneratedFilePaths.length > 0) {
      generatedSpriteFilesBySlotRef.current[slotKey] = nextGeneratedFiles;
    } else {
      delete generatedSpriteFilesBySlotRef.current[slotKey];
    }
    queueGeneratedSpriteFileCleanup(staleGeneratedFilePaths, 'Failed to delete replaced generated depth map files.');

    setCharacterForm((current) => {
      const nextDepthMaps = normalizeAssetVariants(current.spriteDepthMaps[assetKey]);
      nextDepthMaps[variantIndex] = depthMapDataUrl;

      return {
        ...current,
        spriteDepthMaps: {
          ...current.spriteDepthMaps,
          [assetKey]: nextDepthMaps.slice(0, ASSET_VARIANT_COUNT),
        },
      };
    });
  }

  async function generateManualSpriteDepthMap(assetKey: string, variantIndex: number, label: string) {
    if (comfyGenerationBusy) {
      return;
    }
    if (comfyConnectionState !== 'online') {
      throw new Error('ComfyUI unavailable.');
    }

    const imageDataUrl = getCharacterSpriteVariant(assetKey, variantIndex);
    if (!imageDataUrl) {
      throw new Error('Add an image before generating its depth map.');
    }
    if (getCharacterSpriteDepthMapVariant(assetKey, variantIndex)) {
      return;
    }

    const variantNumber = variantIndex + 1;
    const depthKey = `sprite-depth:${assetKey}:${variantIndex}`;
    setManualDepthGeneratingKey(depthKey);
    startBottomProgress(`Generating depth map for [${label}] #${variantNumber}...`, 8, true);

    const abortController = new AbortController();
    generationAbortControllerRef.current = abortController;
    try {
      const characterName = characterForm.name.trim() || selectedCard?.name || 'Character';
      const depthMap = await generateComfyDepthMap(
        {
          imageDataUrl,
          characterName,
          label,
          variantNumber,
        },
        { signal: abortController.signal },
      );
      setCharacterSpriteDepthMap(assetKey, depthMap.dataUrl, variantIndex, {
        generatedFilePath: depthMap.filePath,
      });
      finishBottomProgress('Depth map generated.');
      pushToast('success', `Generated depth map for [${label}] #${variantNumber}.`);
    } catch (error) {
      finishBottomProgress('Depth map generation failed.', 'error');
      throw error;
    } finally {
      generationAbortControllerRef.current = null;
      setManualDepthGeneratingKey(null);
    }
  }

  async function generateScenarioSceneDepthMap(sceneIndex: number) {
    if (comfyGenerationBusy) {
      return;
    }
    if (comfyConnectionState !== 'online') {
      throw new Error('ComfyUI unavailable.');
    }

    const scene = scenarioForm.scenes[sceneIndex];
    if (!scene?.backgroundDataUrl) {
      throw new Error('Add a scene background before generating its depth map.');
    }
    if (scene.backgroundDepthMapDataUrl) {
      return;
    }

    const sceneLabel = scene.name.trim() || `Scene ${sceneIndex + 1}`;
    const depthKey = `scene-depth:${scene.id || sceneIndex}`;
    setManualDepthGeneratingKey(depthKey);
    startBottomProgress(`Generating depth map for [${sceneLabel}]...`, 8, true);

    const abortController = new AbortController();
    generationAbortControllerRef.current = abortController;
    try {
      const characterName = scenarioForm.name.trim() || selectedScenarioCharacter?.name || 'Scenario';
      const depthMap = await generateComfyDepthMap(
        {
          imageDataUrl: scene.backgroundDataUrl,
          characterName,
          label: sceneLabel,
          variantNumber: 1,
        },
        { signal: abortController.signal },
      );
      setScenarioForm((current) => ({
        ...current,
        scenes: current.scenes.map((entry, entryIndex) =>
          entryIndex === sceneIndex ? { ...entry, backgroundDepthMapDataUrl: depthMap.dataUrl } : entry,
        ),
      }));
      finishBottomProgress('Depth map generated.');
      pushToast('success', `Generated depth map for [${sceneLabel}].`);
    } catch (error) {
      finishBottomProgress('Depth map generation failed.', 'error');
      throw error;
    } finally {
      generationAbortControllerRef.current = null;
      setManualDepthGeneratingKey(null);
    }
  }

  function updateAutomaticGeneration(
    updater: (current: CharacterAutomaticGenerationSettings) => CharacterAutomaticGenerationSettings,
  ) {
    setCharacterForm((current) => ({
      ...current,
      automaticGeneration: updater(current.automaticGeneration),
    }));
  }

  function addAutomaticGenerationLora() {
    updateAutomaticGeneration((current) => ({
      ...current,
      loras: [...current.loras, { name: '', strength: 1 }],
    }));
  }

  function updateAutomaticGenerationLora(index: number, updates: Partial<{ name: string; strength: number }>) {
    updateAutomaticGeneration((current) => ({
      ...current,
      loras: current.loras.map((entry, entryIndex) =>
        entryIndex === index
          ? {
              name: typeof updates.name === 'string' ? updates.name : entry.name,
              strength:
                typeof updates.strength === 'number' && Number.isFinite(updates.strength)
                  ? Math.min(Math.max(updates.strength, -4), 4)
                  : entry.strength,
            }
          : entry,
      ),
    }));
  }

  function removeAutomaticGenerationLora(index: number) {
    updateAutomaticGeneration((current) => ({
      ...current,
      loras: current.loras.filter((_, entryIndex) => entryIndex !== index),
    }));
  }

  function getActiveArtStyleGenerationLoras(): CharacterAutomaticGenerationSettings['loras'] {
    const preset = artStylePresets.find((entry) => entry.id === activeArtStylePresetId);
    return preset ? preset.loras : characterForm.automaticGeneration.loras;
  }

  async function updateSharedArtStylePresets(
    updater: (current: AutomaticGenerationArtStylePreset[]) => AutomaticGenerationArtStylePreset[],
  ) {
    await onArtStylePresetsChange(updater(artStylePresets));
  }

  async function addActiveArtStylePresetLora() {
    if (!activeArtStylePresetId) {
      throw new Error('Select an artstyle preset first.');
    }

    await updateSharedArtStylePresets((current) =>
      current.map((preset) =>
        preset.id === activeArtStylePresetId
          ? {
              ...preset,
              loras: [...preset.loras, { name: '', strength: 1 }],
            }
          : preset,
      ),
    );
  }

  async function updateActiveArtStylePresetLora(index: number, updates: Partial<{ name: string; strength: number }>) {
    if (!activeArtStylePresetId) {
      throw new Error('Select an artstyle preset first.');
    }

    await updateSharedArtStylePresets((current) =>
      current.map((preset) =>
        preset.id === activeArtStylePresetId
          ? {
              ...preset,
              loras: preset.loras.map((entry, entryIndex) =>
                entryIndex === index
                  ? {
                      name: typeof updates.name === 'string' ? updates.name : entry.name,
                      strength:
                        typeof updates.strength === 'number' && Number.isFinite(updates.strength)
                          ? Math.min(Math.max(updates.strength, -4), 4)
                          : entry.strength,
                    }
                  : entry,
              ),
            }
          : preset,
      ),
    );
  }

  async function removeActiveArtStylePresetLora(index: number) {
    if (!activeArtStylePresetId) {
      throw new Error('Select an artstyle preset first.');
    }

    await updateSharedArtStylePresets((current) =>
      current.map((preset) =>
        preset.id === activeArtStylePresetId
          ? {
              ...preset,
              loras: preset.loras.filter((_, entryIndex) => entryIndex !== index),
            }
          : preset,
      ),
    );
  }

  async function addArtStyleLora() {
    if (activeArtStylePresetId) {
      await addActiveArtStylePresetLora();
      return;
    }

    setArtStylePresetLoraDraft((current) => [...current, { name: '', strength: 1 }]);
  }

  async function updateArtStyleLora(index: number, updates: Partial<{ name: string; strength: number }>) {
    if (activeArtStylePresetId) {
      await updateActiveArtStylePresetLora(index, updates);
      return;
    }

    setArtStylePresetLoraDraft((current) =>
      current.map((entry, entryIndex) =>
        entryIndex === index
          ? {
              name: typeof updates.name === 'string' ? updates.name : entry.name,
              strength:
                typeof updates.strength === 'number' && Number.isFinite(updates.strength)
                  ? Math.min(Math.max(updates.strength, -4), 4)
                  : entry.strength,
            }
          : entry,
      ),
    );
  }

  async function removeArtStyleLora(index: number) {
    if (activeArtStylePresetId) {
      await removeActiveArtStylePresetLora(index);
      return;
    }

    setArtStylePresetLoraDraft((current) => current.filter((_, entryIndex) => entryIndex !== index));
  }

  function normalizeArtStylePresetName(value: string): string {
    return value.trim().replace(/\s+/g, ' ').slice(0, 60);
  }

  async function saveArtStylePreset() {
    const prompt = characterForm.automaticGeneration.artStylePrompt.trim();
    const presetName =
      normalizeArtStylePresetName(artStylePresetNameDraft) ||
      `Artstyle ${artStylePresets.length + 1}`;
    if (!prompt) {
      throw new Error('Add an artstyle prompt before saving a preset.');
    }

    const presetId = createFormLocalId('artstyle');
    await updateSharedArtStylePresets((current) => [
        ...current,
        {
          id: presetId,
          name: presetName,
          prompt,
          checkpoint: displayedArtStyleCheckpoint.trim(),
          loras: displayedArtStyleLoras.map((entry) => ({ ...entry })),
        },
      ]);
    setActiveArtStylePresetId(presetId);
    setArtStylePresetNameDraft(presetName);
  }

  async function updateActiveArtStylePresetFromPrompt() {
    if (!activeArtStylePresetId) {
      throw new Error('Select an artstyle preset first.');
    }

    const prompt = characterForm.automaticGeneration.artStylePrompt.trim();
    if (!prompt) {
      throw new Error('Add an artstyle prompt before updating the preset.');
    }

    const presetName = normalizeArtStylePresetName(artStylePresetNameDraft);
    if (!presetName) {
      throw new Error('Add a preset name before updating.');
    }

    await updateSharedArtStylePresets((current) =>
      current.map((preset) =>
        preset.id === activeArtStylePresetId
          ? {
              ...preset,
              name: presetName,
              prompt,
              checkpoint: displayedArtStyleCheckpoint.trim(),
            }
          : preset,
      ),
    );
  }

  function loadArtStylePresetIntoPrompt(presetId: string) {
    const preset = artStylePresets.find((entry) => entry.id === presetId);
    if (!preset) {
      throw new Error('This artstyle preset no longer exists.');
    }

    setActiveArtStylePresetId(preset.id);
    setArtStylePresetNameDraft(preset.name);
    setArtStylePresetCheckpointDraft(preset.checkpoint);
    updateAutomaticGeneration((current) => ({
      ...current,
      checkpoint: preset.checkpoint,
      artStylePrompt: preset.prompt,
    }));
  }

  async function removeArtStylePreset(presetId: string) {
    const preset = artStylePresets.find((entry) => entry.id === presetId);
    if (!preset) {
      return;
    }

    await updateSharedArtStylePresets((current) => current.filter((entry) => entry.id !== presetId));
    if (activeArtStylePresetId === presetId) {
      setActiveArtStylePresetId('');
    }
  }

  async function assignCurrentPreviewToArtStylePreset(presetId: string) {
    const preset = artStylePresets.find((entry) => entry.id === presetId);
    if (!preset) {
      throw new Error('This artstyle preset no longer exists.');
    }
    if (!autogenPromptPreviewDataUrl) {
      throw new Error('Generate a preview first, then assign it as thumbnail.');
    }

    await updateSharedArtStylePresets((current) =>
      current.map((entry) =>
        entry.id === presetId
          ? {
              ...entry,
              thumbnailDataUrl: autogenPromptPreviewDataUrl,
            }
          : entry,
      ),
    );
  }

  async function assignCurrentPreviewToActiveArtStylePreset() {
    if (!activeArtStylePresetId) {
      throw new Error('Select an artstyle preset first.');
    }
    await assignCurrentPreviewToArtStylePreset(activeArtStylePresetId);
  }

  function buildArtStylePreviewTask(): GenerationTask {
    return {
      kind: 'sprite',
      label: 'ARTSTYLE',
      triggerTag: 'DEFAULT',
      promptAddition: ARTSTYLE_PREVIEW_PROMPT,
      variantNumber: 1,
      assetKey: 'PREVIEW:ARTSTYLE',
    };
  }

  async function generateArtStylePromptPreview() {
    const artStylePrompt = characterForm.automaticGeneration.artStylePrompt.trim();
    if (!artStylePrompt) {
      throw new Error('Add an artstyle prompt before generating a preview.');
    }

    const previewTask = buildArtStylePreviewTask();
    const activePreset = artStylePresets.find(
      (entry) => entry.id === activeArtStylePresetId,
    );
    await generateAutomaticPromptPreviewForTask(previewTask, {
      artStylePromptOverride: artStylePrompt,
      checkpointOverride: displayedArtStyleCheckpoint.trim(),
      promptAdditionOverride: ARTSTYLE_PREVIEW_PROMPT,
      ignoreLowerBodyTags: true,
      skipDepthMapGeneration: true,
      lorasOverride: activePreset ? activePreset.loras : artStylePresetLoraDraft,
      previewLabel: activePreset ? `Style ${activePreset.name}` : 'Artstyle Preview',
    });
  }

  async function generateArtStylePresetPreview(presetId: string) {
    if (generatingArtStylePresetId) {
      return;
    }
    const preset = artStylePresets.find((entry) => entry.id === presetId);
    if (!preset) {
      throw new Error('This artstyle preset no longer exists.');
    }

    const previewTask = buildArtStylePreviewTask();

    setGeneratingArtStylePresetId(presetId);
    try {
      await generateAutomaticPromptPreviewForTask(previewTask, {
        artStylePromptOverride: preset.prompt,
        checkpointOverride: preset.checkpoint,
        lorasOverride: preset.loras,
        promptAdditionOverride: ARTSTYLE_PREVIEW_PROMPT,
        ignoreLowerBodyTags: true,
        skipDepthMapGeneration: true,
        previewLabel: `Style ${preset.name}`,
      });
    } finally {
      setGeneratingArtStylePresetId(null);
    }
  }

  function addAutomaticCustomExpression() {
    updateAutomaticGeneration((current) => ({
      ...current,
      customExpressions: [...current.customExpressions, { enabled: true, triggerTag: '', prompt: '' }],
    }));
  }

  function updateAutomaticDefaultExpression(
    expression: string,
    updates: Partial<{ enabled: boolean; prompt: string }>,
  ) {
    const normalizedExpression = normalizeExpressionLabel(expression);
    updateAutomaticGeneration((current) => ({
      ...current,
      defaultExpressions: current.defaultExpressions.map((entry) =>
        normalizeExpressionLabel(entry.expression) === normalizedExpression
          ? {
              ...entry,
              enabled: typeof updates.enabled === 'boolean' ? updates.enabled : entry.enabled !== false,
              prompt: typeof updates.prompt === 'string' ? updates.prompt : entry.prompt,
            }
          : entry,
      ),
    }));
  }

  function updateAutomaticCustomExpression(
    index: number,
    updates: Partial<{ enabled: boolean; triggerTag: string; prompt: string }>,
  ) {
    updateAutomaticGeneration((current) => ({
      ...current,
      customExpressions: current.customExpressions.map((entry, entryIndex) =>
        entryIndex === index
          ? {
              enabled: typeof updates.enabled === 'boolean' ? updates.enabled : entry.enabled !== false,
              triggerTag:
                typeof updates.triggerTag === 'string'
                  ? updates.triggerTag
                  : entry.triggerTag,
              prompt: typeof updates.prompt === 'string' ? updates.prompt : entry.prompt,
            }
          : entry,
      ),
    }));
  }

  function removeAutomaticCustomExpression(index: number) {
    updateAutomaticGeneration((current) => ({
      ...current,
      customExpressions: current.customExpressions.filter((_, entryIndex) => entryIndex !== index),
    }));
  }

  function addAutomaticCgDefinition() {
    const nextIndex = characterForm.automaticGeneration.cgDefinitions.length;
    updateAutomaticGeneration((current) => ({
      ...current,
      cgDefinitions: [
        ...current.cgDefinitions,
        {
          enabled: true,
          triggerTag: '',
          prompt: '',
          excludeUpperBodyTags: false,
          excludeWaistTags: false,
          excludeLowerBodyTags: false,
        },
      ],
    }));
    setActiveCgDefinitionIndex(nextIndex);
  }

  function updateAutomaticCgDefinition(
    index: number,
    updates: Partial<{
      enabled: boolean;
      triggerTag: string;
      prompt: string;
      excludeUpperBodyTags: boolean;
      excludeWaistTags: boolean;
      excludeLowerBodyTags: boolean;
    }>,
  ) {
    updateAutomaticGeneration((current) => ({
      ...current,
      cgDefinitions: current.cgDefinitions.map((entry, entryIndex) =>
        entryIndex === index
          ? {
              enabled: typeof updates.enabled === 'boolean' ? updates.enabled : entry.enabled !== false,
              triggerTag:
                typeof updates.triggerTag === 'string'
                  ? updates.triggerTag
                  : entry.triggerTag,
              prompt: typeof updates.prompt === 'string' ? updates.prompt : entry.prompt,
              excludeUpperBodyTags:
                typeof updates.excludeUpperBodyTags === 'boolean'
                  ? updates.excludeUpperBodyTags
                  : entry.excludeUpperBodyTags,
              excludeWaistTags:
                typeof updates.excludeWaistTags === 'boolean'
                  ? updates.excludeWaistTags
                  : entry.excludeWaistTags,
              excludeLowerBodyTags:
                typeof updates.excludeLowerBodyTags === 'boolean'
                  ? updates.excludeLowerBodyTags
                  : entry.excludeLowerBodyTags,
            }
          : entry,
      ),
    }));
  }

  function removeAutomaticCgDefinition(index: number) {
    setActiveCgDefinitionIndex((current) => {
      if (current === null) {
        return null;
      }
      if (current === index) {
        return null;
      }
      return current > index ? current - 1 : current;
    });
    updateAutomaticGeneration((current) => ({
      ...current,
      cgDefinitions: current.cgDefinitions.filter((_, entryIndex) => entryIndex !== index),
    }));
  }

  function exportAutomaticCgDefinitionsConfig() {
    const exportedPayload = {
      version: 1,
      cgDefinitions: normalizeAutomaticGenerationSettings(characterForm.automaticGeneration).cgDefinitions,
    };

    const blob = new Blob([`${JSON.stringify(exportedPayload, null, 2)}\n`], {
      type: 'application/json',
    });
    const objectUrl = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = objectUrl;
    anchor.download = `${sanitizeFileName(characterForm.name || characterForm.cardName || 'character')}-cg-definitions.json`;
    anchor.click();
    URL.revokeObjectURL(objectUrl);
  }

  async function importAutomaticCgDefinitionsConfigFromFile(file: File) {
    const rawText = await file.text();
    let parsed: unknown;

    try {
      parsed = JSON.parse(rawText);
    } catch {
      throw new Error('Invalid imported JSON.');
    }

    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('Invalid imported JSON.');
    }

    const record = parsed as Record<string, unknown>;
    const source = Array.isArray(record.cgDefinitions) ? record.cgDefinitions : Array.isArray(parsed) ? parsed : [];
    const normalizedCgDefinitions = normalizeAutomaticGenerationSettings({
      ...createDefaultAutomaticGenerationSettings(),
      cgDefinitions: source as CharacterAutomaticGenerationSettings['cgDefinitions'],
    }).cgDefinitions;

    if (normalizedCgDefinitions.length === 0) {
      throw new Error('Imported JSON does not contain valid CG definitions.');
    }

    updateAutomaticGeneration((current) => ({
      ...current,
      cgDefinitions: normalizedCgDefinitions,
    }));
  }

  function exportAutomaticCustomExpressionsConfig() {
    const exportedPayload = {
      version: 1,
      customExpressions: normalizeAutomaticGenerationSettings(characterForm.automaticGeneration).customExpressions,
    };

    const blob = new Blob([`${JSON.stringify(exportedPayload, null, 2)}\n`], {
      type: 'application/json',
    });
    const objectUrl = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = objectUrl;
    anchor.download = `${sanitizeFileName(characterForm.name || characterForm.cardName || 'character')}-custom-expressions.json`;
    anchor.click();
    URL.revokeObjectURL(objectUrl);
  }

  async function importAutomaticCustomExpressionsConfigFromFile(file: File) {
    const rawText = await file.text();
    let parsed: unknown;

    try {
      parsed = JSON.parse(rawText);
    } catch {
      throw new Error('Invalid imported JSON.');
    }

    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('Invalid imported JSON.');
    }

    const record = parsed as Record<string, unknown>;
    const source = Array.isArray(record.customExpressions) ? record.customExpressions : Array.isArray(parsed) ? parsed : [];
    const normalizedCustomExpressions = normalizeAutomaticGenerationSettings({
      ...createDefaultAutomaticGenerationSettings(),
      customExpressions: source as CharacterAutomaticGenerationSettings['customExpressions'],
    }).customExpressions;

    if (normalizedCustomExpressions.length === 0) {
      throw new Error('Imported JSON does not contain valid custom expressions.');
    }

    setActiveCustomExpressionIndex(null);
    updateAutomaticGeneration((current) => ({
      ...current,
      customExpressions: normalizedCustomExpressions,
    }));
  }

  function exportAutomaticGenerationConfig() {
    const exportedPayload = {
      version: 1,
      automaticGeneration: normalizeAutomaticGenerationSettings(characterForm.automaticGeneration),
    };

    const blob = new Blob([`${JSON.stringify(exportedPayload, null, 2)}\n`], {
      type: 'application/json',
    });
    const objectUrl = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = objectUrl;
    anchor.download = `${sanitizeFileName(characterForm.name || characterForm.cardName || 'character')}-autogen-config.json`;
    anchor.click();
    URL.revokeObjectURL(objectUrl);
  }

  function importAutomaticGenerationConfigFromUnknown(parsed: unknown) {
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('Invalid imported JSON.');
    }

    const record = parsed as Record<string, unknown>;
    const candidateSettings = (() => {
      if (record.automaticGeneration && typeof record.automaticGeneration === 'object' && !Array.isArray(record.automaticGeneration)) {
        return record.automaticGeneration as unknown as CharacterAutomaticGenerationSettings;
      }
      return record as unknown as CharacterAutomaticGenerationSettings;
    })();
    const normalizedSettings = normalizeAutomaticGenerationSettings(candidateSettings);

    const hasUsableConfig =
      Boolean(
        normalizedSettings.checkpoint ||
          normalizedSettings.basePrompt ||
          normalizedSettings.characterMainTags ||
          normalizedSettings.artStylePrompt,
      ) ||
      normalizedSettings.loras.length > 0 ||
      normalizedSettings.artStylePresets.length > 0 ||
      normalizedSettings.customExpressions.length > 0 ||
      normalizedSettings.cgDefinitions.length > 0;
    if (!hasUsableConfig) {
      throw new Error('Imported JSON does not contain automatic generation settings.');
    }

    updateAutomaticGeneration(() => normalizedSettings);
  }

  async function importAutomaticGenerationConfigFromFile(file: File) {
    const rawText = await file.text();
    let parsed: unknown;

    try {
      parsed = JSON.parse(rawText);
    } catch {
      throw new Error('Invalid imported JSON.');
    }

    importAutomaticGenerationConfigFromUnknown(parsed);
  }

  async function importAutomaticGenerationExampleProject() {
    const parsed = await fetchExampleAutomaticGenerationConfig();
    importAutomaticGenerationConfigFromUnknown(parsed);
  }

  function sanitizeFileName(value: string): string {
    return value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'character';
  }

  function formatMissingNodesForDisplay(nodes: ComfyMissingNodeState[]): string {
    const grouped = new Map<'sprite' | 'cg', string[]>();
    for (const node of nodes) {
      const label = `${node.nodeType}#${node.nodeId}${node.nodeTitle ? ` (${node.nodeTitle})` : ''}`;
      const current = grouped.get(node.workflowKind) || [];
      grouped.set(node.workflowKind, [...current, label]);
    }

    const parts: string[] = [];
    for (const kind of ['sprite', 'cg'] as const) {
      const entries = grouped.get(kind) || [];
      if (entries.length === 0) {
        continue;
      }
      parts.push(`${kind}: ${entries.join(', ')}`);
    }

    return parts.join(' | ');
  }

  function isAbortError(error: unknown): boolean {
    return error instanceof Error && error.name === 'AbortError';
  }

  function stopAutomaticGeneration() {
    if (!generationInProgress) {
      return;
    }

    generationStopRequestedRef.current = true;
    setGenerationStopRequested(true);
    setGenerationProgressText('Stopping generation...');
    generationAbortControllerRef.current?.abort();
  }

  function stopScenarioAutoGeneration() {
    if (!scenarioAutoGenerationInProgress) {
      return;
    }

    scenarioGenerationStopRequestedRef.current = true;
    setScenarioGenerationStopRequested(true);
    generationAbortControllerRef.current?.abort();
  }

  function buildGenerationTasks(): GenerationTask[] {
    const tasks: GenerationTask[] = [];
    const spriteVariantCount = clampNumber(
      Math.round(characterForm.automaticGeneration.expressionVariantCount),
      0,
      ASSET_VARIANT_COUNT,
    );
    const cgVariantCount = clampNumber(
      Math.round(characterForm.automaticGeneration.cgVariantCount),
      0,
      ASSET_VARIANT_COUNT,
    );
    const customReactionIdByTrigger = new Map<string, string>(
      characterForm.customReactions.flatMap((reaction) => {
        const triggers = parseReactionTriggersInput(reaction.triggersInput);
        const primaryTrigger = triggers[0];
        return primaryTrigger ? [[primaryTrigger, reaction.id] as const] : [];
      }),
    );
    const cgIdByTrigger = new Map<string, string>(
      characterForm.cgs.flatMap((cg) => {
        const triggers = parseReactionTriggersInput(cg.triggersInput);
        const primaryTrigger = triggers[0];
        return primaryTrigger ? [[primaryTrigger, cg.id] as const] : [];
      }),
    );

    for (const defaultExpression of characterForm.automaticGeneration.defaultExpressions) {
      if (defaultExpression.enabled === false) {
        continue;
      }
      const expression = normalizeExpressionLabel(defaultExpression.expression);
      if (!expression) {
        continue;
      }
      for (let variantNumber = 1; variantNumber <= spriteVariantCount; variantNumber += 1) {
        tasks.push({
          kind: 'sprite',
          label: expression,
          triggerTag: expression,
          promptAddition: normalizeDefaultExpressionPrompt(defaultExpression.expression, defaultExpression.prompt || expression),
          variantNumber,
          assetKey: expression,
        });
      }
    }

    for (const customExpression of characterForm.automaticGeneration.customExpressions) {
      if (customExpression.enabled === false) {
        continue;
      }
      const normalizedTriggerTag = normalizeExpressionLabel(customExpression.triggerTag);
      if (!normalizedTriggerTag) {
        continue;
      }

      let reactionId = customReactionIdByTrigger.get(normalizedTriggerTag);
      if (!reactionId) {
        reactionId = createFormLocalId('custom');
        customReactionIdByTrigger.set(normalizedTriggerTag, reactionId);
        setCharacterForm((current) => ({
          ...current,
          customReactions: current.customReactions.some((reaction) =>
            parseReactionTriggersInput(reaction.triggersInput).includes(normalizedTriggerTag),
          )
            ? current.customReactions
            : [...current.customReactions, { id: reactionId!, triggersInput: normalizedTriggerTag }],
        }));
      }

      for (let variantNumber = 1; variantNumber <= spriteVariantCount; variantNumber += 1) {
        tasks.push({
          kind: 'sprite',
          label: normalizedTriggerTag,
          triggerTag: normalizedTriggerTag,
          promptAddition: customExpression.prompt,
          variantNumber,
          assetKey: `CUSTOM:${reactionId}`,
        });
      }
    }

    for (const cgDefinition of characterForm.automaticGeneration.cgDefinitions) {
      if (cgDefinition.enabled === false) {
        continue;
      }
      const normalizedTriggerTag = normalizeExpressionLabel(cgDefinition.triggerTag);
      if (!normalizedTriggerTag) {
        continue;
      }

      let cgId = cgIdByTrigger.get(normalizedTriggerTag);
      if (!cgId) {
        cgId = createFormLocalId('cg');
        cgIdByTrigger.set(normalizedTriggerTag, cgId);
        setCharacterForm((current) => ({
          ...current,
          cgs: current.cgs.some((cg) => parseReactionTriggersInput(cg.triggersInput).includes(normalizedTriggerTag))
            ? current.cgs
            : [...current.cgs, { id: cgId!, triggersInput: normalizedTriggerTag }],
        }));
      }

      for (let variantNumber = 1; variantNumber <= cgVariantCount; variantNumber += 1) {
        tasks.push({
          kind: 'cg',
          label: normalizedTriggerTag,
          triggerTag: normalizedTriggerTag,
          promptAddition: cgDefinition.prompt,
          variantNumber,
          assetKey: `CG:${cgId}`,
        });
      }
    }

    return tasks;
  }

  function countExistingAssetsForGenerationTasks(tasks: GenerationTask[]): { spriteAssets: number; cgAssets: number } {
    const seenAssetKeys = new Set<string>();
    let spriteAssets = 0;
    let cgAssets = 0;

    for (const task of tasks) {
      if (seenAssetKeys.has(task.assetKey)) {
        continue;
      }
      seenAssetKeys.add(task.assetKey);
      if (normalizeAssetVariants(characterForm.sprites[task.assetKey]).length === 0) {
        continue;
      }
      if (task.kind === 'sprite') {
        spriteAssets += 1;
      } else {
        cgAssets += 1;
      }
    }

    return { spriteAssets, cgAssets };
  }

  function getContinuationGenerationTasks(tasks: GenerationTask[]): GenerationTask[] {
    return tasks.filter((task) => {
      const existingVariants = normalizeAssetVariants(characterForm.sprites[task.assetKey]);
      return !existingVariants[task.variantNumber - 1];
    });
  }

  function buildPromptForTaskWithSettings(
    task: GenerationTask,
    settings: CharacterAutomaticGenerationSettings,
    options?: BuildPromptOptions,
  ): string {
    const relatedCg = settings.cgDefinitions.find((entry) => normalizeExpressionLabel(entry.triggerTag) === task.triggerTag);
    const includeUpperBody = task.kind === 'sprite' || !relatedCg?.excludeUpperBodyTags;
    const includeWaist = task.kind === 'sprite' || !relatedCg?.excludeWaistTags;
    const includeLowerBody =
      !options?.ignoreLowerBodyTags && (task.kind === 'sprite' || !relatedCg?.excludeLowerBodyTags);
    const promptAdditionSource =
      typeof options?.promptAdditionOverride === 'string'
        ? options.promptAdditionOverride.trim()
        : task.promptAddition;
    const includeOpenMouth = promptContainsTag(promptAdditionSource, 'open mouth');
    const backgroundTag = getLightingBackgroundTag(settings.lightingColor);
    const breastSizeTag = getBreastSizeTag(settings.breastSize);
    const isSexCg = task.kind === 'cg' && promptContainsTag(promptAdditionSource, 'sex');
    const preferredCgExpressionTag =
      task.kind === 'cg'
        ? PREFERRED_CG_EXPRESSION_OPTIONS.find((entry) =>
            entry.value === (isSexCg ? settings.preferredPenetrationExpression : settings.preferredCgExpression)
          )?.tag || ''
        : '';
    const promptAddition =
      task.kind === 'cg'
        ? composePrompt(CG_DEFINITION_PROMPT_PREFIX, backgroundTag, promptAdditionSource)
        : composePrompt(backgroundTag, promptAdditionSource);
    const appendedArtStylePrompt =
      typeof options?.artStylePromptOverride === 'string'
        ? options.artStylePromptOverride.trim()
        : settings.artStylePrompt.trim();

    return composePrompt(
      settings.basePrompt,
      appendedArtStylePrompt,
      settings.characterMainTags,
      includeUpperBody ? settings.upperBodyTags : '',
      includeWaist ? settings.waistTags : '',
      includeOpenMouth ? settings.openMouthTags : '',
      includeLowerBody ? settings.lowerBodyTags : '',
      breastSizeTag,
      preferredCgExpressionTag,
      promptAddition,
    );
  }

  function buildPromptForTask(task: GenerationTask, options?: BuildPromptOptions): string {
    return buildPromptForTaskWithSettings(task, characterForm.automaticGeneration, options);
  }

  function getGuideSpriteTestFailureMessage(error: unknown): string {
    if (isAbortError(error)) {
      return 'ComfyUI generation timed out after 4 minutes.';
    }

    if (error instanceof Error && error.message.trim()) {
      return error.message.trim();
    }

    return 'Failed to generate the [WAVING] test sprite.';
  }

  async function runGuideSpriteWorkflowTest() {
    if (guideSpriteTest.generating || comfyGenerationBusy) {
      return;
    }

    try {
      if (comfyConnectionState !== 'online') {
        throw new Error(comfyConnectionError.trim() || 'ComfyUI unavailable.');
      }

      if (comfyMissingNodes.length > 0) {
        throw new Error(`Missing ComfyUI nodes: ${formatMissingNodesForDisplay(comfyMissingNodes)}`);
      }

      setGuideSpriteTest((current) => ({
        ...current,
        generating: true,
        errorMessage: null,
      }));

      const parsed = await fetchExampleAutomaticGenerationConfig();
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error('The example automatic generation config is invalid.');
      }

      const record = parsed as Record<string, unknown>;
      const candidateSettings =
        record.automaticGeneration && typeof record.automaticGeneration === 'object' && !Array.isArray(record.automaticGeneration)
          ? (record.automaticGeneration as unknown as CharacterAutomaticGenerationSettings)
          : (record as unknown as CharacterAutomaticGenerationSettings);
      const exampleSettings = normalizeAutomaticGenerationSettings(candidateSettings);
      const wavingExpression = exampleSettings.customExpressions.find(
        (entry) => normalizeExpressionLabel(entry.triggerTag) === 'WAVING',
      );

      if (!wavingExpression) {
        throw new Error('The example automatic generation config is missing the [WAVING] custom expression.');
      }

      const checkpoint = (guideTestCheckpoint.trim() || exampleSettings.checkpoint.trim()).trim();

      if (!checkpoint) {
        throw new Error('The example automatic generation config is missing a checkpoint.');
      }

      const task: GenerationTask = {
        kind: 'sprite',
        label: 'WAVING',
        triggerTag: 'WAVING',
        promptAddition: (wavingExpression.prompt || 'WAVING').trim(),
        variantNumber: 1,
        assetKey: 'GUIDE:WAVING',
      };
      const prompt = buildPromptForTaskWithSettings(task, exampleSettings);
      const abortController = new AbortController();
      const timeout = window.setTimeout(() => abortController.abort(), 4 * 60_000);

      try {
        const generated = await generateComfyImage(
          {
            workflowKind: 'sprite',
            characterName: 'Hatsune Miku',
            label: 'WAVING',
            variantNumber: 1,
            prompt,
            negativePrompt: exampleSettings.negativePrompt,
            checkpoint,
            steps: exampleSettings.steps,
            upscaleModel: exampleSettings.upscaleModel,
            loras: exampleSettings.loras
              .map((entry) => ({
                name: entry.name.trim(),
                strength: entry.strength,
              }))
              .filter((entry) => entry.name),
            skipFaceDetailer: true,
            generateDepthMap: false,
          },
          { signal: abortController.signal },
        );
        setGuideSpriteTest({
          generating: false,
          imageDataUrl: generated.dataUrl,
          errorMessage: null,
        });
        pushToast('success', '[WAVING] guide test sprite generated.');
      } finally {
        window.clearTimeout(timeout);
      }
    } catch (error) {
      const errorMessage = getGuideSpriteTestFailureMessage(error);
      setGuideSpriteTest((current) => ({
        ...current,
        generating: false,
        errorMessage,
      }));
    } finally {
      setGuideSpriteTest((current) => ({
        ...current,
        generating: false,
      }));
    }
  }

  function getManualGenerationLabelForAsset(assetKey: string): string {
    if (assetKey.startsWith('CUSTOM:')) {
      const reactionId = assetKey.slice('CUSTOM:'.length);
      const reaction = characterForm.customReactions.find((entry) => entry.id === reactionId);
      return parseReactionTriggersInput(reaction?.triggersInput || '')[0] || 'REACTION';
    }

    if (assetKey.startsWith('CG:')) {
      const cgId = assetKey.slice('CG:'.length);
      const cg = characterForm.cgs.find((entry) => entry.id === cgId);
      return parseReactionTriggersInput(cg?.triggersInput || '')[0] || 'CG';
    }

    return normalizeExpressionLabel(assetKey) || assetKey || 'ASSET';
  }

  function getManualGenerationPromptError(assetKey: string): string | null {
    if (assetKey.startsWith('CUSTOM:')) {
      const reactionId = assetKey.slice('CUSTOM:'.length);
      const reaction = characterForm.customReactions.find((entry) => entry.id === reactionId);
      if (!reaction) {
        return 'This reaction no longer exists.';
      }
      const triggerTag = parseReactionTriggersInput(reaction.triggersInput)[0] || '';
      if (!triggerTag) {
        return 'Set at least one reaction trigger before generating this sprite.';
      }
      const promptEntry = characterForm.automaticGeneration.customExpressions.find(
        (entry) => normalizeExpressionLabel(entry.triggerTag) === triggerTag,
      );
      if (!promptEntry) {
        return `No automatic prompt definition found for [${triggerTag}]. Re-add it in Automatic Generation > Custom Expressions.`;
      }
      return null;
    }

    if (assetKey.startsWith('CG:')) {
      const cgId = assetKey.slice('CG:'.length);
      const cg = characterForm.cgs.find((entry) => entry.id === cgId);
      if (!cg) {
        return 'This CG entry no longer exists.';
      }
      const triggerTag = parseReactionTriggersInput(cg.triggersInput)[0] || '';
      if (!triggerTag) {
        return 'Set at least one CG trigger before generating this CG.';
      }
      const promptEntry = characterForm.automaticGeneration.cgDefinitions.find(
        (entry) => normalizeExpressionLabel(entry.triggerTag) === triggerTag,
      );
      if (!promptEntry) {
        return `No CG definition prompt found for [${triggerTag}]. Re-add it in Automatic Generation > CG Generation Definitions.`;
      }
      return null;
    }

    const normalizedExpression = normalizeExpressionLabel(assetKey);
    if (!normalizedExpression) {
      return 'Invalid expression selected.';
    }
    const promptEntry = characterForm.automaticGeneration.defaultExpressions.find(
      (entry) => normalizeExpressionLabel(entry.expression) === normalizedExpression,
    );
    if (!promptEntry) {
      return `No default expression prompt found for [${normalizedExpression}]. Restore it in Automatic Generation > Default Expressions.`;
    }
    return null;
  }

  function buildGenerationTaskForAsset(assetKey: string, variantNumber: number): GenerationTask | null {
    if (variantNumber < 1 || variantNumber > ASSET_VARIANT_COUNT) {
      return null;
    }

    if (assetKey.startsWith('CUSTOM:')) {
      const reactionId = assetKey.slice('CUSTOM:'.length);
      const reaction = characterForm.customReactions.find((entry) => entry.id === reactionId);
      if (!reaction) {
        return null;
      }

      const triggerTag = parseReactionTriggersInput(reaction.triggersInput)[0] || '';
      if (!triggerTag) {
        return null;
      }

      const promptEntry = characterForm.automaticGeneration.customExpressions.find(
        (entry) => normalizeExpressionLabel(entry.triggerTag) === triggerTag,
      );
      if (!promptEntry) {
        return null;
      }
      return {
        kind: 'sprite',
        label: triggerTag,
        triggerTag,
        promptAddition: promptEntry.prompt.trim(),
        variantNumber,
        assetKey,
      };
    }

    if (assetKey.startsWith('CG:')) {
      const cgId = assetKey.slice('CG:'.length);
      const cg = characterForm.cgs.find((entry) => entry.id === cgId);
      if (!cg) {
        return null;
      }

      const triggerTag = parseReactionTriggersInput(cg.triggersInput)[0] || '';
      if (!triggerTag) {
        return null;
      }

      const promptEntry = characterForm.automaticGeneration.cgDefinitions.find(
        (entry) => normalizeExpressionLabel(entry.triggerTag) === triggerTag,
      );
      if (!promptEntry) {
        return null;
      }
      return {
        kind: 'cg',
        label: triggerTag,
        triggerTag,
        promptAddition: promptEntry.prompt.trim(),
        variantNumber,
        assetKey,
      };
    }

    const normalizedExpression = normalizeExpressionLabel(assetKey);
    if (!normalizedExpression) {
      return null;
    }

    const promptEntry = characterForm.automaticGeneration.defaultExpressions.find(
      (entry) => normalizeExpressionLabel(entry.expression) === normalizedExpression,
    );
    if (!promptEntry) {
      return null;
    }
    return {
      kind: 'sprite',
      label: normalizedExpression,
      triggerTag: normalizedExpression,
      promptAddition: normalizeDefaultExpressionPrompt(promptEntry.expression, promptEntry.prompt || normalizedExpression),
      variantNumber,
      assetKey: normalizedExpression,
    };
  }

  async function regenerateManualSprite(
    assetKey: string,
    variantIndex: number,
    mode: ManualGenerationMode = 'regenerate',
    options?: { generateMouthAnimations?: boolean },
  ) {
    if (comfyGenerationBusy) {
      return;
    }

    if (comfyConnectionState !== 'online') {
      throw new Error('ComfyUI unavailable.');
    }

    if (comfyMissingNodes.length > 0) {
      throw new Error(
        `Missing ComfyUI nodes detected. Install required nodes before generating. ${formatMissingNodesForDisplay(
          comfyMissingNodes,
        )}`,
      );
    }

    const variantNumber = variantIndex + 1;
    const promptError = getManualGenerationPromptError(assetKey);
    if (promptError) {
      throw new Error(promptError);
    }
    const task = buildGenerationTaskForAsset(assetKey, variantNumber);
    if (!task) {
      throw new Error('This slot cannot be generated yet. Check triggers and automatic generation prompts first.');
    }
    const prompt = buildPromptForTask(task);
    if (!prompt.trim()) {
      throw new Error('Unable to build prompt for this slot. Check your automatic generation settings.');
    }
    const generateAnimationFrames =
      task.kind === 'sprite' &&
      options?.generateMouthAnimations === true &&
      !shouldSkipMouthAnimationForTask(task);

    const slotKey = `${task.assetKey}:${variantIndex}`;
    setManualRegeneratingSlotKey(slotKey);

    try {
      const characterName = characterForm.name.trim() || selectedCard?.name || 'Character';
      const generated = await generateComfyImage({
        workflowKind: task.kind,
        characterName,
        label: task.label,
        variantNumber: task.variantNumber,
        prompt,
        negativePrompt: characterForm.automaticGeneration.negativePrompt,
        checkpoint: characterForm.automaticGeneration.checkpoint,
        steps: characterForm.automaticGeneration.steps,
        upscaleModel: characterForm.automaticGeneration.upscaleModel,
        loras: getActiveArtStyleGenerationLoras()
          .map((entry) => ({
            name: entry.name.trim(),
            strength: entry.strength,
          }))
          .filter((entry) => entry.name),
        skipFaceDetailer: task.kind === 'sprite' ? !useFaceDetailerForSprites : true,
        generateDepthMap: characterForm.automaticGeneration.generateDepthMaps,
        generateAnimationFrames,
        animationFramePrompts: generateAnimationFrames
          ? {
              openMouth: composePrompt(prompt, 'open mouth', characterForm.automaticGeneration.openMouthTags),
            }
          : undefined,
      });

      setCharacterSpriteAtVariant(task.assetKey, generated.dataUrl, variantIndex, {
        generatedPrompt: prompt,
        depthMapDataUrl: generated.depthMap?.dataUrl,
        animationFrames: {
          openMouth: generated.animationFrames?.openMouth?.dataUrl,
        },
        generatedFiles: {
          imageFilePath: generated.filePath,
          depthMapFilePath: generated.depthMap?.filePath,
          openMouthFilePath: generated.animationFrames?.openMouth?.filePath,
        },
      });
      setSelectedAssetVariantIndex(task.assetKey, variantIndex);
      if (generated.depthMapError) {
        pushToast('error', generated.depthMapError);
      }
      pushToast('success', `${mode === 'generate-new' ? 'Generated new' : 'Regenerated'} [${task.label}] #${variantNumber}.`);
    } catch (error) {
      throw error;
    } finally {
      setManualRegeneratingSlotKey(null);
    }
  }

  function openManualGenerationDialogForAsset(assetKey: string, variantIndex: number, mode: ManualGenerationMode) {
    if (comfyConnectionState !== 'online') {
      pushToast('error', 'ComfyUI unavailable.');
      return;
    }

    if (comfyMissingNodes.length > 0) {
      pushToast('error', `Missing ComfyUI nodes: ${formatMissingNodesForDisplay(comfyMissingNodes)}`);
      return;
    }

    const task = buildGenerationTaskForAsset(assetKey, variantIndex + 1);
    setManualGenerationDialog({
      assetKey,
      variantIndex,
      mode,
      generateMouthAnimations:
        task?.kind === 'sprite' && characterForm.automaticGeneration.generateMouthAnimations === true,
    });
  }

  function submitManualGenerationDialog() {
    const dialogState = manualGenerationDialog;
    if (!dialogState) {
      return;
    }

    setManualGenerationDialog(null);
    void regenerateManualSprite(dialogState.assetKey, dialogState.variantIndex, dialogState.mode, {
      generateMouthAnimations: dialogState.generateMouthAnimations,
    }).catch((error) => {
      pushToast('error', error instanceof Error ? error.message : 'Generation failed.');
    });
  }

  async function runAutomaticGeneration(options?: { mode?: GenerationWriteMode; tasks?: GenerationTask[] }) {
    if (comfyGenerationBusy) {
      return;
    }

    if (comfyConnectionState !== 'online') {
      throw new Error('ComfyUI unavailable.');
    }

    if (comfyMissingNodes.length > 0) {
      throw new Error(
        `Missing ComfyUI nodes detected. Install required nodes before generating. ${formatMissingNodesForDisplay(
          comfyMissingNodes,
        )}`,
      );
    }

    const characterName = characterForm.name.trim() || selectedCard?.name || 'Character';
    const mode: GenerationWriteMode = options?.mode || 'replace';
    const existingCustomReactionIds = new Set(characterForm.customReactions.map((entry) => entry.id));
    const existingCgIds = new Set(characterForm.cgs.map((entry) => entry.id));
    const tasks = options?.tasks || buildGenerationTasks();
    if (tasks.length === 0) {
      throw new Error('Add at least one expression or CG definition before generating.');
    }
    const taskSignature = buildGenerationTaskSignature(tasks);
    const savedResumeState = characterForm.automaticGeneration.resumeState;
    const isResumeEligible =
      Boolean(savedResumeState) &&
      savedResumeState?.mode === mode &&
      savedResumeState?.totalTasks === tasks.length &&
      savedResumeState?.taskSignature === taskSignature &&
      (savedResumeState?.nextTaskIndex || 0) > 0 &&
      (savedResumeState?.nextTaskIndex || 0) < tasks.length;
    const resumeStartIndex = isResumeEligible ? savedResumeState!.nextTaskIndex : 0;
    const runnableTasks = tasks.slice(resumeStartIndex);
    if (runnableTasks.length === 0) {
      setCharacterForm((current) => ({
        ...current,
        automaticGeneration: {
          ...current.automaticGeneration,
          resumeState: null,
        },
      }));
      throw new Error('Nothing left to resume. Generation state has been reset.');
    }

    const appendStartIndexByAsset = new Map<string, number>();
    if (mode === 'append') {
      const requiredCountByAsset = new Map<string, number>();
      for (const task of tasks) {
        requiredCountByAsset.set(task.assetKey, (requiredCountByAsset.get(task.assetKey) || 0) + 1);
      }
      for (const [assetKey, requiredCount] of requiredCountByAsset.entries()) {
        if (isResumeEligible) {
          const resumeBaseIndex = savedResumeState?.appendBaseIndexByAsset?.[assetKey];
          if (Number.isFinite(resumeBaseIndex)) {
            appendStartIndexByAsset.set(assetKey, Number(resumeBaseIndex));
            continue;
          }
        }

        const existingCount = normalizeAssetVariants(characterForm.sprites[assetKey]).length;
        if (existingCount + requiredCount > ASSET_VARIANT_COUNT) {
          throw new Error(
            `[${assetKey}] has ${existingCount} variants already. Add-as-variant needs ${requiredCount} extra slots but max is ${ASSET_VARIANT_COUNT}.`,
          );
        }
        appendStartIndexByAsset.set(assetKey, existingCount);
      }
    }

    setGenerationInProgress(true);
    generationStopRequestedRef.current = false;
    setGenerationStopRequested(false);
    setGenerationProgressValue(0);
    setGenerationProgressText('Preparing generation...');
    setGeneratedThumbnails([]);
    setThumbnailHoverPreview(null);

    const totalTasks = runnableTasks.length;
    let completedTasks = 0;
    let failedTasks = 0;
    let stoppedEarly = false;
    let nextTaskIndex = resumeStartIndex;
    const appendBaseIndexByAsset = Object.fromEntries(appendStartIndexByAsset.entries());

    try {
      for (let taskOffset = 0; taskOffset < runnableTasks.length; taskOffset += 1) {
        const task = runnableTasks[taskOffset];
        const absoluteTaskIndex = resumeStartIndex + taskOffset;
        if (generationStopRequestedRef.current) {
          nextTaskIndex = absoluteTaskIndex;
          stoppedEarly = true;
          break;
        }

        const targetVariantIndex =
          mode === 'append'
            ? (appendStartIndexByAsset.get(task.assetKey) || 0) + (task.variantNumber - 1)
            : task.variantNumber - 1;
        const targetVariantNumber = targetVariantIndex + 1;
        const prompt = buildPromptForTask(task);
        const generateAnimationFrames =
          task.kind === 'sprite' &&
          characterForm.automaticGeneration.generateMouthAnimations &&
          !shouldSkipMouthAnimationForTask(task);
        const animationFramePrompts = generateAnimationFrames
          ? {
              openMouth: composePrompt(prompt, 'open mouth', characterForm.automaticGeneration.openMouthTags),
            }
          : undefined;
        const actionText = `Generating [${task.label}] | Variant [${targetVariantNumber}]`;
        setGenerationProgressText(actionText);
        const thumbnailId = showGeneratedThumbnails ? createFormLocalId('thumb') : '';
        if (thumbnailId) {
          setGeneratedThumbnails((current) => [
            ...current,
            {
              id: thumbnailId,
              label: task.label,
              kind: task.kind,
              variantNumber: targetVariantNumber,
              status: 'pending',
            },
          ]);
        }

        try {
          const abortController = new AbortController();
          generationAbortControllerRef.current = abortController;
          const generated = await generateComfyImage({
            workflowKind: task.kind,
            characterName,
            label: task.label,
            variantNumber: targetVariantNumber,
            prompt,
            negativePrompt: characterForm.automaticGeneration.negativePrompt,
            checkpoint: characterForm.automaticGeneration.checkpoint,
            steps: characterForm.automaticGeneration.steps,
            upscaleModel: characterForm.automaticGeneration.upscaleModel,
            loras: getActiveArtStyleGenerationLoras()
              .map((entry) => ({
                name: entry.name.trim(),
                strength: entry.strength,
              }))
              .filter((entry) => entry.name),
            skipFaceDetailer: task.kind === 'cg' || (task.kind === 'sprite' && !useFaceDetailerForSprites),
            generateDepthMap: task.kind === 'sprite' && characterForm.automaticGeneration.generateDepthMaps,
            generateAnimationFrames,
            animationFramePrompts,
          }, { signal: abortController.signal });

          setCharacterSpriteAtVariant(task.assetKey, generated.dataUrl, targetVariantIndex, {
            generatedPrompt: prompt,
            depthMapDataUrl: generated.depthMap?.dataUrl,
            animationFrames: {
              openMouth: generated.animationFrames?.openMouth?.dataUrl,
            },
            generatedFiles: {
              imageFilePath: generated.filePath,
              depthMapFilePath: generated.depthMap?.filePath,
              openMouthFilePath: generated.animationFrames?.openMouth?.filePath,
            },
          });
          if (generated.depthMapError) {
            pushToast('error', generated.depthMapError);
          }
          if (thumbnailId) {
            setGeneratedThumbnails((current) =>
              current.map((entry) =>
                entry.id === thumbnailId
                  ? {
                      ...entry,
                      dataUrl: generated.dataUrl,
                      depthMapDataUrl: generated.depthMap?.dataUrl,
                      status: 'done',
                    }
                  : entry,
              ),
            );
          }
          nextTaskIndex = absoluteTaskIndex + 1;
          completedTasks += 1;
          setGenerationProgressValue((completedTasks / totalTasks) * 100);
        } catch (error) {
          if (generationStopRequestedRef.current && isAbortError(error)) {
            if (thumbnailId) {
              setGeneratedThumbnails((current) =>
                current.map((entry) =>
                  entry.id === thumbnailId
                    ? {
                        ...entry,
                        status: 'failed',
                      }
                    : entry,
                ),
              );
            }
            nextTaskIndex = absoluteTaskIndex;
            stoppedEarly = true;
            break;
          }

          failedTasks += 1;
          if (thumbnailId) {
            setGeneratedThumbnails((current) =>
              current.map((entry) =>
                entry.id === thumbnailId
                  ? {
                      ...entry,
                      status: 'failed',
                    }
                  : entry,
                ),
            );
          }
          nextTaskIndex = absoluteTaskIndex + 1;
          completedTasks += 1;
          setGenerationProgressValue((completedTasks / totalTasks) * 100);
          pushToast('error', error instanceof Error ? error.message : 'Generation failed for one image.');
        } finally {
          generationAbortControllerRef.current = null;
        }
      }
    } finally {
      generationAbortControllerRef.current = null;
      generationStopRequestedRef.current = false;
      setGenerationStopRequested(false);
      const resumeState =
        stoppedEarly && nextTaskIndex < tasks.length
          ? {
              mode,
              nextTaskIndex,
              totalTasks: tasks.length,
              taskSignature,
              appendBaseIndexByAsset,
              updatedAt: new Date().toISOString(),
            }
          : null;
      setCharacterForm((current) => ({
        ...current,
        automaticGeneration: {
          ...current.automaticGeneration,
          resumeState,
        },
        customReactions: current.customReactions.filter((reaction) => {
          if (existingCustomReactionIds.has(reaction.id)) {
            return true;
          }
          return normalizeAssetVariants(current.sprites[`CUSTOM:${reaction.id}`]).length > 0;
        }),
        cgs: current.cgs.filter((cg) => {
          if (existingCgIds.has(cg.id)) {
            return true;
          }
          return normalizeAssetVariants(current.sprites[`CG:${cg.id}`]).length > 0;
        }),
        sprites: (() => {
          const nextSprites = { ...current.sprites };
          for (const reaction of current.customReactions) {
            if (existingCustomReactionIds.has(reaction.id)) {
              continue;
            }
            if (normalizeAssetVariants(current.sprites[`CUSTOM:${reaction.id}`]).length > 0) {
              continue;
            }
            delete nextSprites[`CUSTOM:${reaction.id}`];
          }
          for (const cg of current.cgs) {
            if (existingCgIds.has(cg.id)) {
              continue;
            }
            if (normalizeAssetVariants(current.sprites[`CG:${cg.id}`]).length > 0) {
              continue;
            }
            delete nextSprites[`CG:${cg.id}`];
          }
          return nextSprites;
        })(),
        spriteAnimationFrames: (() => {
          const nextAnimationFrames = { ...current.spriteAnimationFrames };
          for (const reaction of current.customReactions) {
            if (existingCustomReactionIds.has(reaction.id)) {
              continue;
            }
            if (normalizeAssetVariants(current.sprites[`CUSTOM:${reaction.id}`]).length > 0) {
              continue;
            }
            delete nextAnimationFrames[`CUSTOM:${reaction.id}`];
          }
          return nextAnimationFrames;
        })(),
      }));
      setGenerationInProgress(false);
      if (stoppedEarly) {
        setGenerationProgressText(`Generation stopped (${completedTasks}/${totalTasks}). Progress was saved for resume.`);
        pushToast('success', 'Generation stopped. Resume state saved.');
      } else if (failedTasks > 0) {
        setGenerationProgressText(
          failedTasks === totalTasks
            ? 'Generation failed.'
            : `Generation finished with partial success (${completedTasks - failedTasks}/${totalTasks}).`,
        );
      } else {
        setGenerationProgressText(`Generation completed (${completedTasks}/${totalTasks}).`);
      }
    }
  }

  function releaseSpriteCropSourceUrl() {
    if (!spriteCropSourceUrlRef.current) {
      return;
    }

    URL.revokeObjectURL(spriteCropSourceUrlRef.current);
    spriteCropSourceUrlRef.current = null;
  }

  function openSpriteCropDialogFromFile(
    target: 'character-sprite' | 'scenario-banner' | 'menu-wallpaper',
    expression: string,
    variantIndex: number,
    file: File,
    aspect: number,
  ) {
    if (!file.type.startsWith('image/')) {
      throw new Error('Please upload an image file.');
    }

    releaseSpriteCropSourceUrl();
    const sourceUrl = URL.createObjectURL(file);
    spriteCropSourceUrlRef.current = sourceUrl;
    setSpriteCropDialog({
      target,
      expression,
      variantIndex,
      sourceDataUrl: sourceUrl,
      aspect: aspect,
    });
    setSpriteCropPosition({ x: 0, y: 0 });
    setSpriteCropZoom(1);
    setSpriteCropPixels(null);
  }

  async function beginCharacterSpriteCrop(
    expression: string,
    file: File,
    aspect = 2 / 3,
    variantIndex = getSelectedAssetVariantIndex(expression),
  ) {
    openSpriteCropDialogFromFile('character-sprite', expression, variantIndex, file, aspect);
  }

  async function handleScenarioSceneUpload(sceneIndex: number, file: File) {
    const targetSceneId = scenarioForm.scenes[sceneIndex]?.id || '';
    startBottomProgress('Optimizing image...', 8);
    try {
      const imageDataUrl = await readFileAsDataUrl(file);
      updateBottomProgress(28, 'Converting to optimized WebP...');
      const optimizedDataUrl = await optimizeImageDataUrlToWebp(imageDataUrl, (progress) =>
        updateBottomProgress(28 + progress * 0.62),
      );
      setScenarioForm((current) => ({
        ...current,
        scenes: current.scenes.map((scene, index) =>
          index === sceneIndex ? { ...scene, backgroundDataUrl: optimizedDataUrl, backgroundDepthMapDataUrl: '' } : scene,
        ),
      }));
      if (targetSceneId) {
        setScenarioAutoPlaces((current) =>
          current.map((entry) =>
            entry.generatedSceneId === targetSceneId
              ? {
                  ...entry,
                  generatedSceneId: '',
                }
              : entry,
          ),
        );
      }
      finishBottomProgress('Image ready.');
    } catch (error) {
      finishBottomProgress('Image optimization failed.', 'error');
      throw error;
    }
  }

  async function handleScenarioBgmUpload(sceneIndex: number, file: File) {
    if (!file.type.startsWith('audio/')) {
      throw new Error('Please upload an audio file for BGM.');
    }

    const fileCacheKey = createFileCacheKey(file);
    let audioDataUrl = bgmFileCacheRef.current.get(fileCacheKey);
    if (!audioDataUrl) {
      audioDataUrl = await readFileAsDataUrl(file);
      bgmFileCacheRef.current.set(fileCacheKey, audioDataUrl);
    }

    setScenarioForm((current) => ({
      ...current,
      scenes: current.scenes.map((scene, index) => {
        if (index !== sceneIndex) {
          return scene;
        }

        const sharedExistingBgm =
          current.scenes.find((entry, entryIndex) => entryIndex !== sceneIndex && entry.bgmDataUrl === audioDataUrl)
            ?.bgmDataUrl || audioDataUrl;

        return {
          ...scene,
          bgmDataUrl: sharedExistingBgm,
        };
      }),
    }));
  }

  async function handleScenarioAmbientUpload(sceneIndex: number, file: File) {
    if (!file.type.startsWith('audio/')) {
      throw new Error('Please upload an audio file for ambient noise.');
    }

    const fileCacheKey = createFileCacheKey(file);
    let audioDataUrl = ambientFileCacheRef.current.get(fileCacheKey);
    if (!audioDataUrl) {
      audioDataUrl = await readFileAsDataUrl(file);
      ambientFileCacheRef.current.set(fileCacheKey, audioDataUrl);
    }

    setScenarioForm((current) => ({
      ...current,
      scenes: current.scenes.map((scene, index) => {
        if (index !== sceneIndex) {
          return scene;
        }

        const sharedExistingAmbient =
          current.scenes.find(
            (entry, entryIndex) => entryIndex !== sceneIndex && entry.ambientNoiseDataUrl === audioDataUrl,
          )?.ambientNoiseDataUrl || audioDataUrl;

        return {
          ...scene,
          ambientNoiseDataUrl: sharedExistingAmbient,
          ambientNoisePresetId: '',
          ambientNoiseMuffled: scene.ambientNoiseMuffled === true,
        };
      }),
    }));
  }

  async function handleScenarioAmbientPresetSelect(sceneIndex: number, presetId: string) {
    const preset = AMBIENT_PRESET_OPTIONS.find((option) => option.id === presetId);
    if (!preset) {
      setScenarioForm((current) => ({
        ...current,
        scenes: current.scenes.map((scene, index) =>
          index === sceneIndex ? { ...scene, ambientNoiseDataUrl: '', ambientNoisePresetId: '' } : scene,
        ),
      }));
      return;
    }

    setScenarioForm((current) => ({
      ...current,
      scenes: current.scenes.map((scene, index) =>
        index === sceneIndex ? { ...scene, ambientNoiseDataUrl: '', ambientNoisePresetId: preset.id } : scene,
      ),
    }));
  }

  function addScenarioAutoPlace() {
    setScenarioAutoPlaces((current) => [...current, createEmptyScenarioAutoPlace()]);
  }

  function resolveAmbientPresetSelection(presetId: string): { dataUrl: string; presetId: string } {
    const preset = AMBIENT_PRESET_OPTIONS.find((option) => option.id === presetId);
    if (!preset) {
      return { dataUrl: '', presetId: '' };
    }

    return { dataUrl: '', presetId: preset.id };
  }

  function renderCardMedia(backdropUrl: string, leadSpriteUrl: string, alt: string): ReactNode {
    if (!backdropUrl && !leadSpriteUrl) {
      return <div className="card-cover-empty">No scene image</div>;
    }

    return (
      <div className="scenario-card-media">
        {backdropUrl ? (
          <img src={backdropUrl} alt={alt} className="card-cover scenario-card-background" />
        ) : (
          <div className="card-cover-empty">No scene image</div>
        )}
        {leadSpriteUrl ? (
          <img src={leadSpriteUrl} alt="" aria-hidden="true" className="scenario-card-lead-sprite" />
        ) : null}
      </div>
    );
  }

  function renderScenarioCardMedia(scenario: OneShotScenario): ReactNode {
    const backdropUrl = scenario.bannerDataUrl || scenario.scenes[0]?.backgroundDataUrl || '';
    const leadSpriteUrl = getFirstAssetVariant(characterById.get(scenario.characterId)?.sprites.DEFAULT);

    return renderCardMedia(backdropUrl, leadSpriteUrl, scenario.name);
  }

  function renderPackageCardMedia(entry: ScenarioPackage): ReactNode {
    const linkedScenario = scenarioById.get(entry.scenarioId);
    const backdropUrl = entry.bannerDataUrl || linkedScenario?.bannerDataUrl || linkedScenario?.scenes[0]?.backgroundDataUrl || '';
    const leadSpriteUrl = linkedScenario
      ? getFirstAssetVariant(characterById.get(linkedScenario.characterId)?.sprites.DEFAULT)
      : '';

    return renderCardMedia(backdropUrl, leadSpriteUrl, entry.name);
  }

  async function handleScenarioAutoPlaceAmbientPresetSelect(placeId: string, presetId: string) {
    const resolved = resolveAmbientPresetSelection(presetId);
    updateScenarioAutoPlace(placeId, {
      ambientNoiseDataUrl: resolved.dataUrl,
      ambientNoisePresetId: resolved.presetId,
    });
  }

  async function handleScenarioAutoPlaceAmbientUpload(placeId: string, file: File) {
    if (!file.type.startsWith('audio/')) {
      throw new Error('Please upload an audio file for ambient noise.');
    }

    const fileCacheKey = createFileCacheKey(file);
    let audioDataUrl = ambientFileCacheRef.current.get(fileCacheKey);
    if (!audioDataUrl) {
      audioDataUrl = await readFileAsDataUrl(file);
      ambientFileCacheRef.current.set(fileCacheKey, audioDataUrl);
    }

    updateScenarioAutoPlace(placeId, {
      ambientNoiseDataUrl: audioDataUrl,
      ambientNoisePresetId: '',
    });
  }

  function updateScenarioAutoPlace(
    placeId: string,
    updates: Partial<
      Pick<
        ScenarioAutoPlaceDraft,
        | 'locationName'
        | 'prompt'
        | 'triggerWordsInput'
        | 'ambientNoiseDataUrl'
        | 'ambientNoisePresetId'
        | 'ambientNoiseMuffled'
        | 'generatedSceneId'
      >
    >,
  ) {
    setScenarioAutoPlaces((current) =>
      current.map((entry) =>
        entry.id === placeId
          ? {
              ...entry,
              locationName: typeof updates.locationName === 'string' ? updates.locationName : entry.locationName,
              prompt: typeof updates.prompt === 'string' ? updates.prompt : entry.prompt,
              triggerWordsInput:
                typeof updates.triggerWordsInput === 'string' ? updates.triggerWordsInput : entry.triggerWordsInput,
              ambientNoiseDataUrl:
                typeof updates.ambientNoiseDataUrl === 'string' ? updates.ambientNoiseDataUrl : entry.ambientNoiseDataUrl,
              ambientNoisePresetId:
                typeof updates.ambientNoisePresetId === 'string'
                  ? updates.ambientNoisePresetId
                  : entry.ambientNoisePresetId,
              ambientNoiseMuffled:
                typeof updates.ambientNoiseMuffled === 'boolean'
                  ? updates.ambientNoiseMuffled
                  : entry.ambientNoiseMuffled,
              generatedSceneId:
                typeof updates.generatedSceneId === 'string' ? updates.generatedSceneId : entry.generatedSceneId,
            }
          : entry,
      ),
    );
  }

  function removeScenarioAutoPlace(placeId: string) {
    setScenarioAutoPlaces((current) => {
      const next = current.filter((entry) => entry.id !== placeId);
      return next.length > 0 ? next : [createEmptyScenarioAutoPlace()];
    });
  }

  function exportScenarioAutoPlacePreset() {
    const places = scenarioAutoPlaces
      .map((entry) => ({
        locationName: entry.locationName.trim(),
        prompt: entry.prompt.trim(),
        triggerWordsInput: parseTriggerWordsInput(entry.triggerWordsInput).join(', '),
        ambientNoiseDataUrl: entry.ambientNoiseDataUrl,
        ambientNoisePresetId: entry.ambientNoisePresetId,
        ambientNoiseMuffled: entry.ambientNoiseMuffled,
        generatedSceneId: (entry.generatedSceneId || '').trim(),
      }))
      .filter(
        (entry) =>
          entry.locationName ||
          entry.prompt ||
          entry.triggerWordsInput ||
          entry.ambientNoiseDataUrl ||
          entry.ambientNoisePresetId ||
          entry.generatedSceneId,
      );

    const exportedPayload = {
      version: 1,
      presetType: 'scenario-scene-generation',
      checkpoint: (characterForm.automaticGeneration.checkpoint || '').trim(),
      generateDepthMaps: scenarioGenerateDepthMaps,
      places,
    };

    const blob = new Blob([`${JSON.stringify(exportedPayload, null, 2)}\n`], {
      type: 'application/json',
    });
    const objectUrl = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = objectUrl;
    anchor.download = `${sanitizeFileName(scenarioForm.name || 'scenario')}-scene-presets.json`;
    anchor.click();
    URL.revokeObjectURL(objectUrl);
  }

  async function importScenarioAutoPlacePresetFromFile(file: File) {
    const rawText = await file.text();
    let parsed: unknown;

    try {
      parsed = JSON.parse(rawText);
    } catch {
      throw new Error('Invalid imported JSON.');
    }

    let importedCheckpoint: string | null = null;
    let importedGenerateDepthMaps: boolean | null = null;
    let sourcePlaces: unknown[] = [];

    if (Array.isArray(parsed)) {
      sourcePlaces = parsed;
    } else if (parsed && typeof parsed === 'object') {
      const record = parsed as Record<string, unknown>;
      if (typeof record.checkpoint === 'string') {
        importedCheckpoint = record.checkpoint.trim();
      }
      if (typeof record.generateDepthMaps === 'boolean') {
        importedGenerateDepthMaps = record.generateDepthMaps;
      }
      if (record.automaticGeneration && typeof record.automaticGeneration === 'object' && !Array.isArray(record.automaticGeneration)) {
        const automaticGenerationRecord = record.automaticGeneration as Record<string, unknown>;
        if (importedCheckpoint === null && typeof automaticGenerationRecord.checkpoint === 'string') {
          importedCheckpoint = automaticGenerationRecord.checkpoint.trim();
        }
        if (importedGenerateDepthMaps === null && typeof automaticGenerationRecord.generateDepthMaps === 'boolean') {
          importedGenerateDepthMaps = automaticGenerationRecord.generateDepthMaps;
        }
      }

      if (Array.isArray(record.places)) {
        sourcePlaces = record.places;
      } else if (Array.isArray(record.scenarioAutoPlaces)) {
        sourcePlaces = record.scenarioAutoPlaces;
      } else if (Array.isArray(record.scenes)) {
        sourcePlaces = record.scenes;
      } else {
        sourcePlaces = [record];
      }
    } else {
      throw new Error('Invalid imported JSON.');
    }

    const normalizedPlaces = sourcePlaces
      .map((entry) => normalizeScenarioAutoPlacePresetEntry(entry))
      .filter((entry): entry is Omit<ScenarioAutoPlaceDraft, 'id'> => Boolean(entry));

    if (normalizedPlaces.length === 0) {
      throw new Error('Imported JSON does not contain valid place presets.');
    }

    setScenarioAutoPlaces(
      normalizedPlaces.map((entry) => ({
        id: createFormLocalId('place'),
        locationName: entry.locationName,
        prompt: entry.prompt,
        triggerWordsInput: entry.triggerWordsInput,
        ambientNoiseDataUrl: entry.ambientNoiseDataUrl,
        ambientNoisePresetId: entry.ambientNoisePresetId,
        ambientNoiseMuffled: entry.ambientNoiseMuffled,
        generatedSceneId: entry.generatedSceneId || '',
      })),
    );
    setScenarioGeneratedThumbnails([]);
    setScenarioThumbnailHoverPreview(null);

    if (importedCheckpoint !== null) {
      updateAutomaticGeneration((current) => ({
        ...current,
        checkpoint: importedCheckpoint || '',
      }));
    }
    if (importedGenerateDepthMaps !== null) {
      setScenarioGenerateDepthMaps(importedGenerateDepthMaps);
    }
  }

  async function generateScenarioPlacesAutomatically() {
    if (comfyGenerationBusy) {
      return;
    }
    if (comfyConnectionState !== 'online') {
      throw new Error('ComfyUI unavailable.');
    }
    if (comfyMissingNodes.length > 0) {
      throw new Error(
        `Missing ComfyUI nodes detected. Install required nodes before generating. ${formatMissingNodesForDisplay(
          comfyMissingNodes,
        )}`,
      );
    }

    const places = scenarioAutoPlaces
      .map((entry) => ({
        id: entry.id,
        locationName: entry.locationName.trim(),
        prompt: entry.prompt.trim(),
        triggerWordsInput: entry.triggerWordsInput.trim(),
        ambientNoiseDataUrl: entry.ambientNoiseDataUrl,
        ambientNoisePresetId: entry.ambientNoisePresetId,
        ambientNoiseMuffled: entry.ambientNoiseMuffled,
        generatedSceneId: (entry.generatedSceneId || '').trim(),
      }))
      .filter((entry) => entry.locationName && entry.prompt);

    if (places.length === 0) {
      throw new Error('Add at least one place with both a location name and prompt.');
    }

    const checkpoint = (characterForm.automaticGeneration.checkpoint || comfyCheckpoints[0] || '').trim();
    const characterName = scenarioForm.name.trim() || selectedScenarioCharacter?.name || 'Scenario';

    setScenarioAutoGenerationInProgress(true);
    scenarioGenerationStopRequestedRef.current = false;
    setScenarioGenerationStopRequested(false);
    setScenarioGeneratedThumbnails([]);
    setScenarioThumbnailHoverPreview(null);

    let completedPlaces = 0;
    let stoppedEarly = false;

    try {
      for (let index = 0; index < places.length; index += 1) {
        if (scenarioGenerationStopRequestedRef.current) {
          stoppedEarly = true;
          break;
        }

        const place = places[index];
        const sceneId = place.generatedSceneId || `AUTO:${place.id}:${Date.now()}:${index}`;
        const thumbnailId = createFormLocalId('scenario-thumb');
        setScenarioGeneratedThumbnails((current) => [
          ...current,
          {
            id: thumbnailId,
            label: place.locationName,
            kind: 'cg',
            variantNumber: 1,
            status: 'pending',
          },
        ]);

        setScenarioForm((current) => {
          if (current.scenes.some((scene) => scene.id === sceneId)) {
            return current;
          }
          return {
            ...current,
            scenes: [
              ...current.scenes,
              {
                id: sceneId,
                name: place.locationName,
                backgroundDataUrl: '',
                backgroundDepthMapDataUrl: '',
                bgmDataUrl: '',
                ambientNoiseDataUrl: place.ambientNoiseDataUrl,
                ambientNoisePresetId: place.ambientNoisePresetId,
                ambientNoiseMuffled: place.ambientNoiseMuffled,
                weatherPreset: 'none',
                triggerWordsInput: place.triggerWordsInput || place.locationName,
              },
            ],
          };
        });
        if (!place.generatedSceneId) {
          updateScenarioAutoPlace(place.id, { generatedSceneId: sceneId });
        }

        try {
          const abortController = new AbortController();
          generationAbortControllerRef.current = abortController;
          const generated = await generateComfyImage({
            workflowKind: 'cg',
            characterName,
            label: place.locationName,
            variantNumber: 1,
            prompt: place.prompt,
            checkpoint,
            steps: characterForm.automaticGeneration.steps,
            upscaleModel: '',
            loras: [],
            latentWidth: 1500,
            latentHeight: 900,
            skipFaceDetailer: true,
            skipBackgroundRemoval: true,
            generateDepthMap: scenarioGenerateDepthMaps,
          }, { signal: abortController.signal });
          if (generated.depthMapError) {
            pushToast('error', generated.depthMapError);
          }
          completedPlaces += 1;
          setScenarioGeneratedThumbnails((current) =>
            current.map((entry) =>
              entry.id === thumbnailId
                ? {
                    ...entry,
                    dataUrl: generated.dataUrl,
                    depthMapDataUrl: generated.depthMap?.dataUrl,
                    status: 'done',
                  }
                : entry,
            ),
          );

          setScenarioForm((current) => ({
            ...current,
            scenes: current.scenes.map((scene) =>
              scene.id === sceneId
                ? {
                    ...scene,
                    name: place.locationName,
                    triggerWordsInput: place.triggerWordsInput || place.locationName,
                    backgroundDataUrl: generated.dataUrl,
                    backgroundDepthMapDataUrl: generated.depthMap?.dataUrl || '',
                  }
                : scene,
            ),
          }));
        } catch (error) {
          if (scenarioGenerationStopRequestedRef.current && isAbortError(error)) {
            stoppedEarly = true;
            break;
          }
          throw error;
        } finally {
          generationAbortControllerRef.current = null;
        }
      }

      if (stoppedEarly) {
        setScenarioGeneratedThumbnails((current) =>
          current.map((entry) =>
            entry.status === 'pending'
              ? {
                  ...entry,
                  status: 'failed',
                }
              : entry,
          ),
        );
        pushToast('success', `Place generation stopped (${completedPlaces}/${places.length}).`);
        return;
      }

      pushToast('success', `Generated ${places.length} place${places.length === 1 ? '' : 's'} and added them to scenes.`);
      setScenarioEditorSubTab('manual');
    } catch (error) {
      setScenarioGeneratedThumbnails((current) =>
        current.map((entry) =>
          entry.status === 'pending'
            ? {
                ...entry,
                status: 'failed',
              }
            : entry,
        ),
      );
      throw error;
    } finally {
      generationAbortControllerRef.current = null;
      scenarioGenerationStopRequestedRef.current = false;
      setScenarioGenerationStopRequested(false);
      setScenarioAutoGenerationInProgress(false);
    }
  }

  async function regenerateScenarioAutoPlace(placeId: string) {
    if (comfyGenerationBusy) {
      return;
    }
    if (comfyConnectionState !== 'online') {
      throw new Error('ComfyUI unavailable.');
    }
    if (comfyMissingNodes.length > 0) {
      throw new Error(
        `Missing ComfyUI nodes detected. Install required nodes before generating. ${formatMissingNodesForDisplay(
          comfyMissingNodes,
        )}`,
      );
    }

    const rawPlace = scenarioAutoPlaces.find((entry) => entry.id === placeId);
    if (!rawPlace) {
      throw new Error('Place not found.');
    }
    const locationName = rawPlace.locationName.trim();
    const prompt = rawPlace.prompt.trim();
    if (!locationName || !prompt) {
      throw new Error('Set both location name and prompt before regenerating this place.');
    }

    const sceneId = (rawPlace.generatedSceneId || '').trim() || `AUTO:${rawPlace.id}:${Date.now()}:regen`;
    const checkpoint = (characterForm.automaticGeneration.checkpoint || comfyCheckpoints[0] || '').trim();
    const characterName = scenarioForm.name.trim() || selectedScenarioCharacter?.name || 'Scenario';

    setScenarioAutoGenerationInProgress(true);
    scenarioGenerationStopRequestedRef.current = false;
    setScenarioGenerationStopRequested(false);
    const thumbnailId = createFormLocalId('scenario-thumb');
    setScenarioGeneratedThumbnails((current) => [
      ...current,
      {
        id: thumbnailId,
        label: locationName,
        kind: 'cg',
        variantNumber: 1,
        status: 'pending',
      },
    ]);

    try {
      setScenarioForm((current) => {
        if (current.scenes.some((scene) => scene.id === sceneId)) {
          return current;
        }
        return {
          ...current,
          scenes: [
            ...current.scenes,
            {
              id: sceneId,
              name: locationName,
              backgroundDataUrl: '',
              backgroundDepthMapDataUrl: '',
              bgmDataUrl: '',
              ambientNoiseDataUrl: rawPlace.ambientNoiseDataUrl,
              ambientNoisePresetId: rawPlace.ambientNoisePresetId,
              ambientNoiseMuffled: rawPlace.ambientNoiseMuffled,
              weatherPreset: 'none',
              triggerWordsInput: rawPlace.triggerWordsInput.trim() || locationName,
            },
          ],
        };
      });
      updateScenarioAutoPlace(rawPlace.id, { generatedSceneId: sceneId });

      const abortController = new AbortController();
      generationAbortControllerRef.current = abortController;
      const generated = await generateComfyImage({
        workflowKind: 'cg',
        characterName,
        label: locationName,
        variantNumber: 1,
        prompt,
        checkpoint,
        steps: characterForm.automaticGeneration.steps,
        upscaleModel: '',
        loras: [],
        latentWidth: 1500,
        latentHeight: 900,
        skipFaceDetailer: true,
        skipBackgroundRemoval: true,
        generateDepthMap: scenarioGenerateDepthMaps,
      }, { signal: abortController.signal });
      if (generated.depthMapError) {
        pushToast('error', generated.depthMapError);
      }

      setScenarioGeneratedThumbnails((current) =>
        current.map((entry) =>
          entry.id === thumbnailId
            ? {
                ...entry,
                dataUrl: generated.dataUrl,
                depthMapDataUrl: generated.depthMap?.dataUrl,
                status: 'done',
              }
            : entry,
        ),
      );

      setScenarioForm((current) => ({
        ...current,
        scenes: current.scenes.map((scene) =>
          scene.id === sceneId
            ? {
                ...scene,
                name: locationName,
                triggerWordsInput: rawPlace.triggerWordsInput.trim() || locationName,
                backgroundDataUrl: generated.dataUrl,
                backgroundDepthMapDataUrl: generated.depthMap?.dataUrl || '',
              }
            : scene,
        ),
      }));
      pushToast('success', `Regenerated [${locationName}] place image.`);
    } catch (error) {
      if (scenarioGenerationStopRequestedRef.current && isAbortError(error)) {
        setScenarioGeneratedThumbnails((current) =>
          current.map((entry) =>
            entry.id === thumbnailId
              ? {
                  ...entry,
                  status: 'failed',
                }
              : entry,
          ),
        );
        pushToast('success', 'Place generation stopped.');
        return;
      }
      setScenarioGeneratedThumbnails((current) =>
        current.map((entry) =>
          entry.id === thumbnailId
            ? {
                ...entry,
                status: 'failed',
              }
            : entry,
        ),
      );
      throw error;
    } finally {
      generationAbortControllerRef.current = null;
      scenarioGenerationStopRequestedRef.current = false;
      setScenarioGenerationStopRequested(false);
      setScenarioAutoGenerationInProgress(false);
    }
  }

  function getScenarioPlacePromptForScene(sceneId?: string): string {
    if (!sceneId) {
      return '';
    }
    const linkedPlace = scenarioAutoPlaces.find((entry) => entry.generatedSceneId === sceneId);
    return (linkedPlace?.prompt || '').trim();
  }

  async function regenerateScenarioSceneInManual(sceneId?: string) {
    if (!sceneId) {
      throw new Error('This scene has no linked generated place yet.');
    }
    const linkedPlace = scenarioAutoPlaces.find((entry) => entry.generatedSceneId === sceneId);
    if (!linkedPlace) {
      throw new Error('No saved place prompt for this scene yet. Generate it once from Automatic Place Generation first.');
    }
    await regenerateScenarioAutoPlace(linkedPlace.id);
  }

  async function generateAutomaticPromptPreviewForTask(
    task: GenerationTask,
    options?: PromptPreviewOptions,
  ): Promise<string | null> {
    if (comfyGenerationBusy) {
      return null;
    }
    if (comfyConnectionState !== 'online') {
      throw new Error('ComfyUI unavailable.');
    }
    const prompt = buildPromptForTask(task, {
      artStylePromptOverride: options?.artStylePromptOverride,
      promptAdditionOverride: options?.promptAdditionOverride,
      ignoreLowerBodyTags: options?.ignoreLowerBodyTags,
    });
    const characterName = characterForm.name.trim() || selectedCard?.name || 'Character';
    const previewLabel = options?.previewLabel?.trim() || task.label || 'Preview';

    setAutogenPromptPreviewDataUrl('');
    setAutogenPromptPreviewDepthMapDataUrl('');
    setAutogenPromptPreviewDepthGenerating(false);
    autogenPromptPreviewDepthRequestIdRef.current += 1;
    setAutogenPromptPreviewLabel(previewLabel);
    setAutogenPromptPreviewKind(task.kind);
    setAutogenPromptPreviewDismissed(false);
    setAutogenPreviewGenerating(true);
    const abortController = new AbortController();
    const timeout = window.setTimeout(() => abortController.abort(), 4 * 60_000);
    try {
      const generated = await generateComfyImage({
        workflowKind: task.kind,
        characterName,
        label: previewLabel,
        variantNumber: task.variantNumber,
        prompt,
        negativePrompt: characterForm.automaticGeneration.negativePrompt,
        checkpoint: (options?.checkpointOverride || characterForm.automaticGeneration.checkpoint).trim(),
        steps: characterForm.automaticGeneration.steps,
        upscaleModel: characterForm.automaticGeneration.upscaleModel,
        loras: (options?.lorasOverride ?? getActiveArtStyleGenerationLoras())
          .map((entry) => ({
            name: entry.name.trim(),
            strength: entry.strength,
          }))
          .filter((entry) => entry.name),
        skipFaceDetailer: true,
        generateDepthMap: false,
      }, { signal: abortController.signal });
      setAutogenPromptPreviewDataUrl(generated.dataUrl);
      setAutogenPromptPreviewDepthMapDataUrl(generated.depthMap?.dataUrl || '');
      if (generated.depthMapError) {
        pushToast('error', generated.depthMapError);
      }
      pushToast('success', `[${previewLabel}] preview generated.`);
      if (task.kind === 'sprite' && characterForm.automaticGeneration.generateDepthMaps && !options?.skipDepthMapGeneration) {
        generateDepthMapForPromptPreview({
          imageDataUrl: generated.dataUrl,
          characterName,
          label: previewLabel,
          variantNumber: task.variantNumber,
        });
      }
      return generated.dataUrl;
    } finally {
      window.clearTimeout(timeout);
      setAutogenPreviewGenerating(false);
    }
  }

  async function generateScenarioPlacePromptPreview(place: ScenarioAutoPlaceDraft) {
    if (comfyGenerationBusy) {
      return;
    }
    if (comfyConnectionState !== 'online') {
      throw new Error('ComfyUI unavailable.');
    }

    const label = place.locationName.trim() || 'Scene Preview';
    const prompt = place.prompt.trim();
    if (!prompt) {
      throw new Error('Add a scene prompt before generating a preview.');
    }

    const checkpoint = (characterForm.automaticGeneration.checkpoint || comfyCheckpoints[0] || '').trim();
    const characterName = scenarioForm.name.trim() || selectedScenarioCharacter?.name || 'Scenario';

    setAutogenPromptPreviewDataUrl('');
    setAutogenPromptPreviewDepthMapDataUrl('');
    setAutogenPromptPreviewDepthGenerating(false);
    autogenPromptPreviewDepthRequestIdRef.current += 1;
    setAutogenPromptPreviewLabel(label);
    setAutogenPromptPreviewKind('cg');
    setAutogenPromptPreviewDismissed(false);
    setAutogenPreviewGenerating(true);

    const abortController = new AbortController();
    const timeout = window.setTimeout(() => abortController.abort(), 4 * 60_000);
    try {
      const generated = await generateComfyImage({
        workflowKind: 'cg',
        characterName,
        label,
        variantNumber: 1,
        prompt,
        checkpoint,
        steps: characterForm.automaticGeneration.steps,
        upscaleModel: '',
        loras: [],
        latentWidth: 1500,
        latentHeight: 900,
        skipFaceDetailer: true,
        skipBackgroundRemoval: true,
        generateDepthMap: scenarioGenerateDepthMaps,
      }, { signal: abortController.signal });

      setAutogenPromptPreviewDataUrl(generated.dataUrl);
      setAutogenPromptPreviewDepthMapDataUrl(generated.depthMap?.dataUrl || '');
      if (generated.depthMapError) {
        pushToast('error', generated.depthMapError);
      }
      pushToast('success', `[${label}] preview generated.`);
    } finally {
      window.clearTimeout(timeout);
      setAutogenPreviewGenerating(false);
    }
  }

  function generateDepthMapForPromptPreview(payload: {
    imageDataUrl: string;
    characterName: string;
    label: string;
    variantNumber: number;
  }) {
    const requestId = autogenPromptPreviewDepthRequestIdRef.current + 1;
    autogenPromptPreviewDepthRequestIdRef.current = requestId;
    setAutogenPromptPreviewDepthGenerating(true);
    const abortController = new AbortController();
    const timeout = window.setTimeout(() => abortController.abort(), 4 * 60_000);

    void generateComfyDepthMap(payload, { signal: abortController.signal })
      .then((depthMap) => {
        if (autogenPromptPreviewDepthRequestIdRef.current !== requestId) {
          return;
        }
        setAutogenPromptPreviewDepthMapDataUrl(depthMap.dataUrl);
      })
      .catch((error) => {
        if (autogenPromptPreviewDepthRequestIdRef.current !== requestId || isAbortError(error)) {
          return;
        }
        pushToast('error', error instanceof Error ? error.message : 'Depth map generation failed.');
      })
      .finally(() => {
        if (autogenPromptPreviewDepthRequestIdRef.current === requestId) {
          setAutogenPromptPreviewDepthGenerating(false);
        }
        window.clearTimeout(timeout);
      });
  }

  async function generateAutomaticPromptPreview() {
    const task = buildGenerationTaskForAsset('DEFAULT', 1);
    if (!task) {
      throw new Error('Unable to build preview generation task.');
    }
    await generateAutomaticPromptPreviewForTask(task);
  }

  async function beginMenuWallpaperCrop(file: File) {
    openSpriteCropDialogFromFile('menu-wallpaper', 'MENU WALLPAPER', 0, file, 16 / 9);
  }

  async function beginScenarioBannerCrop(file: File) {
    openSpriteCropDialogFromFile('scenario-banner', 'SCENARIO BANNER', 0, file, 16 / 9);
  }

  function clearDragState() {
    setDraggingSpriteExpression(null);
  }

  function renderVariantSelector(assetKey: string) {
    const selectedVariantIndex = getSelectedAssetVariantIndex(assetKey);

    return (
      <div className="asset-variant-selector" aria-label="Asset variants">
        {ASSET_VARIANT_INDEXES.map((variantIndex) => (
          <button
            key={`${assetKey}-variant-${variantIndex}`}
            type="button"
            className={`asset-variant-button ${selectedVariantIndex === variantIndex ? 'active' : ''}`.trim()}
            onClick={() => setSelectedAssetVariantIndex(assetKey, variantIndex)}
          >
            {variantIndex + 1}
          </button>
        ))}
      </div>
    );
  }

  function renderGenerateSpriteDepthMapButton(assetKey: string, label: string, disabled = false) {
    const variantIndex = getSelectedAssetVariantIndex(assetKey);
    const spriteUrl = getCharacterSpriteVariant(assetKey, variantIndex);
    const depthMapUrl = getCharacterSpriteDepthMapVariant(assetKey, variantIndex);
    if (!spriteUrl || depthMapUrl || comfyConnectionState !== 'online') {
      return null;
    }

    const depthKey = `sprite-depth:${assetKey}:${variantIndex}`;
    return (
      <IconButton
        icon={imageIcon}
        label={manualDepthGeneratingKey === depthKey ? 'Generating depth map...' : 'Generate depth map'}
        disabled={disabled || comfyGenerationBusy}
        onClick={() => {
          void generateManualSpriteDepthMap(assetKey, variantIndex, label).catch((error) => {
            pushToast('error', error instanceof Error ? error.message : 'Depth map generation failed.');
          });
        }}
      />
    );
  }

  function renderSpriteThumbContent(
    spriteKey: string,
    spriteUrl: string,
    alt: string,
    emptyLabel: string,
    _depthMapUrl = '',
    hideAsCgSpoiler = false,
    openMouthUrl = '',
  ) {
    if (!spriteUrl) {
      return <div className="image-slot-empty">{emptyLabel}</div>;
    }
    if (hideCgSpoilers && hideAsCgSpoiler) {
      return <div className="image-slot-empty">CG hidden to avoid spoilers</div>;
    }

    const previewAssetKey = spriteKey.slice(0, spriteKey.lastIndexOf(':'));
    const hasOpenMouthPreview = Boolean(openMouthUrl);
    const mouthPreviewMode =
      hasOpenMouthPreview && spriteMouthPreviewByKey[previewAssetKey] === 'open' ? 'open' : 'closed';
    const previewUrl = mouthPreviewMode === 'open' ? openMouthUrl : spriteUrl;
    const previewKey = mouthPreviewMode === 'open' ? `${spriteKey}:openMouth` : spriteKey;

    const mouthPreviewTabs = hasOpenMouthPreview ? (
      <div className="sprite-mouth-preview-tabs" role="tablist" aria-label={`${alt} mouth preview`}>
        <button
          type="button"
          role="tab"
          aria-selected={mouthPreviewMode === 'closed'}
          className={`sprite-mouth-preview-tab ${mouthPreviewMode === 'closed' ? 'is-active' : ''}`.trim()}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation();
            setSpriteMouthPreviewByKey((current) => ({ ...current, [previewAssetKey]: 'closed' }));
          }}
        >
          Closed Mouth
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mouthPreviewMode === 'open'}
          className={`sprite-mouth-preview-tab ${mouthPreviewMode === 'open' ? 'is-active' : ''}`.trim()}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation();
            setSpriteMouthPreviewByKey((current) => ({ ...current, [previewAssetKey]: 'open' }));
          }}
        >
          Open Mouth
        </button>
      </div>
    ) : null;

    if (loadedSpritePreviews[previewKey] === previewUrl) {
      return (
        <>
          {mouthPreviewTabs}
          <img src={previewUrl} alt={alt} />
        </>
      );
    }

    return (
      <>
        {mouthPreviewTabs}
        <div className="sprite-thumb-loader" aria-live="polite">
          <span className="sprite-loader-spinner" aria-hidden="true" />
          <span>{currentSpritePreviewLoadingKey === previewKey ? 'Loading sprite...' : 'Queued...'}</span>
        </div>
      </>
    );
  }

  function renderManualRegenerationOverlay(assetKey: string): ReactNode {
    if (!isManualRegeneratingAsset(assetKey)) {
      return null;
    }

    return (
      <div className="sprite-regeneration-overlay" aria-live="polite">
        <span className="sprite-loader-spinner" aria-hidden="true" />
        <span>Generating...</span>
      </div>
    );
  }

  function isManualRegeneratingAsset(assetKey: string): boolean {
    const variantIndex = getSelectedAssetVariantIndex(assetKey);
    return manualRegeneratingSlotKey === `${assetKey}:${variantIndex}`;
  }

  function renderScenarioSceneMedia(
    sceneKey: string,
    sceneName: string,
    sceneBackgroundDataUrl: string,
    sceneDepthMapDataUrl = '',
  ) {
    if (!sceneBackgroundDataUrl) {
      return (
        <div className="scene-media-empty">
          <strong>No background yet</strong>
          <span>Upload a location image to anchor this scene.</span>
        </div>
      );
    }

    if (loadedScenarioScenePreviews[sceneKey] === sceneBackgroundDataUrl) {
      if (sceneDepthMapDataUrl) {
        return (
          <DepthParallaxImage
            imageSrc={sceneBackgroundDataUrl}
            depthSrc={sceneDepthMapDataUrl}
            alt={sceneName}
            settings={{ strength: 20, focus: 100, edgeFill: 0, smearGuard: 15, quality: 'clean' }}
            fit="cover"
            alphaMode="opaque"
          />
        );
      }
      return <img src={sceneBackgroundDataUrl} alt={sceneName} />;
    }

    return (
      <div className="scene-media-loader" aria-live="polite">
        <span className="sprite-loader-spinner" aria-hidden="true" />
        <span>{currentScenarioSceneLoadingKey === sceneKey ? 'Loading scene...' : 'Queued...'}</span>
      </div>
    );
  }

  function closeSpriteCropDialog() {
    releaseSpriteCropSourceUrl();
    setSpriteCropDialog(null);
    setSpriteCropPosition({ x: 0, y: 0 });
    setSpriteCropZoom(1);
    setSpriteCropPixels(null);
  }

  function closeInteractiveZonesDialog() {
    setInteractiveZonesDialog(null);
    setInteractiveZonesDraft([]);
    setInteractiveZoneTool('draw');
    setSelectedInteractiveZoneId(null);
    setDraftInteractiveZone(null);
    setMovingInteractiveZone(null);
  }

  function saveInteractiveZonesDialog() {
    if (!interactiveZonesDialog) {
      return;
    }

    setCharacterForm((current) => ({
      ...current,
      spriteZones: {
        ...current.spriteZones,
        [interactiveZonesDialog.expression]: interactiveZonesDraft,
      },
    }));
    closeInteractiveZonesDialog();
  }

  function copyInteractiveZones(sourceKey: string) {
    const zones = characterForm.spriteZones[sourceKey] || [];
    if (zones.length === 0) {
      return;
    }

    setCopiedInteractiveZones(zones.map((zone) => ({ ...zone })));
    pushToast('success', 'Interactive zones copied.');
  }

  function pasteInteractiveZones(targetKey: string) {
    if (!copiedInteractiveZones || copiedInteractiveZones.length === 0) {
      return;
    }

    setCharacterForm((current) => ({
      ...current,
      spriteZones: {
        ...current.spriteZones,
        [targetKey]: copiedInteractiveZones.map((zone) => ({
          ...zone,
          id: createFormLocalId('zone'),
        })),
      },
    }));
    pushToast('success', 'Interactive zones pasted.');
  }

  function getInteractiveZoneCanvasPoint(event: { clientX: number; clientY: number }) {
    const rect = interactiveZoneCanvasRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0 || rect.height <= 0) {
      return null;
    }

    const x = clampUnit((event.clientX - rect.left) / rect.width);
    const y = clampUnit((event.clientY - rect.top) / rect.height);
    return { x, y };
  }

  function beginInteractiveZoneDraw(event: ReactPointerEvent<HTMLDivElement>) {
    if (!interactiveZonesDialog || interactiveZoneTool !== 'draw') {
      return;
    }

    const point = getInteractiveZoneCanvasPoint(event);
    if (!point) {
      return;
    }

    setSelectedInteractiveZoneId(null);
    setDraftInteractiveZone({
      originX: point.x,
      originY: point.y,
      x: point.x,
      y: point.y,
      width: 0,
      height: 0,
    });
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function updateInteractiveZoneDraw(event: ReactPointerEvent<HTMLDivElement>) {
    if (!draftInteractiveZone) {
      return;
    }

    const point = getInteractiveZoneCanvasPoint(event);
    if (!point) {
      return;
    }

    const deltaX = point.x - draftInteractiveZone.originX;
    const deltaY = point.y - draftInteractiveZone.originY;
    const x = clampUnit(Math.min(draftInteractiveZone.originX, point.x));
    const y = clampUnit(Math.min(draftInteractiveZone.originY, point.y));
    const width = Math.min(Math.abs(deltaX), 1 - x);
    const height = Math.min(Math.abs(deltaY), 1 - y);
    setDraftInteractiveZone({
      ...draftInteractiveZone,
      x,
      y,
      width,
      height,
    });
  }

  function finalizeInteractiveZoneDraw() {
    if (!interactiveZonesDialog || !draftInteractiveZone) {
      return;
    }

    const width = clampUnit(draftInteractiveZone.width);
    const height = clampUnit(draftInteractiveZone.height);
    if (width < 0.01 || height < 0.01) {
      setDraftInteractiveZone(null);
      return;
    }

    const nextZone: SpriteInteractiveZone = {
      id: createFormLocalId('zone'),
      x: clampUnit(draftInteractiveZone.x),
      y: clampUnit(draftInteractiveZone.y),
      width: Math.min(width, 1 - clampUnit(draftInteractiveZone.x)),
      height: Math.min(height, 1 - clampUnit(draftInteractiveZone.y)),
      prompt: '',
    };

    setInteractiveZonesDraft((current) => [...current, nextZone]);
    setSelectedInteractiveZoneId(nextZone.id);
    setInteractiveZoneTool('select');
    setDraftInteractiveZone(null);
  }

  function updateSelectedInteractiveZonePrompt(prompt: string) {
    if (!selectedInteractiveZoneId) {
      return;
    }

    setInteractiveZonesDraft((current) =>
      current.map((zone) => (zone.id === selectedInteractiveZoneId ? { ...zone, prompt } : zone)),
    );
  }

  function beginInteractiveZoneMove(zone: SpriteInteractiveZone, event: ReactPointerEvent<HTMLButtonElement>) {
    if (interactiveZoneTool !== 'select') {
      return;
    }

    const point = getInteractiveZoneCanvasPoint(event);
    if (!point) {
      return;
    }

    setSelectedInteractiveZoneId(zone.id);
    setMovingInteractiveZone({
      zoneId: zone.id,
      pointerOffsetX: point.x - zone.x,
      pointerOffsetY: point.y - zone.y,
    });
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function updateInteractiveZoneMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (!movingInteractiveZone) {
      return;
    }

    const point = getInteractiveZoneCanvasPoint(event);
    if (!point) {
      return;
    }

    setInteractiveZonesDraft((current) =>
      current.map((zone) => {
        if (zone.id !== movingInteractiveZone.zoneId) {
          return zone;
        }

        const x = clampUnit(point.x - movingInteractiveZone.pointerOffsetX);
        const y = clampUnit(point.y - movingInteractiveZone.pointerOffsetY);
        return {
          ...zone,
          x: Math.min(x, 1 - zone.width),
          y: Math.min(y, 1 - zone.height),
        };
      }),
    );
  }

  function finishInteractiveZonePointerInteraction() {
    setDraftInteractiveZone(null);
    setMovingInteractiveZone(null);
  }

  async function applySpriteCrop() {
    if (!spriteCropDialog || !spriteCropPixels) {
      throw new Error('Adjust crop area before applying.');
    }

    startBottomProgress('Optimizing image...', 10);
    try {
      const croppedDataUrl = await cropImageToDataUrl(spriteCropDialog.sourceDataUrl, spriteCropPixels, (progress) =>
        updateBottomProgress(10 + progress * 0.86),
      );
      if (spriteCropDialog.target === 'scenario-banner') {
        setScenarioForm((current) => ({
          ...current,
          bannerDataUrl: croppedDataUrl,
        }));
      } else if (spriteCropDialog.target === 'menu-wallpaper') {
        setMenuInterfaceSettingsDraft((current) => ({
          ...current,
          wallpaperDataUrl: croppedDataUrl,
        }));
      } else {
        setCharacterSprite(spriteCropDialog.expression, croppedDataUrl, spriteCropDialog.variantIndex);
      }
      closeSpriteCropDialog();
      finishBottomProgress('Image ready.');
    } catch (error) {
      finishBottomProgress('Image optimization failed.', 'error');
      throw error;
    }
  }

  async function submitSillyTavernConnection(event?: { preventDefault: () => void }) {
    event?.preventDefault();

    if (!connectionAddressDraft.trim()) {
      pushToast('error', 'Enter a SillyTavern API address first.');
      return;
    }

    setConnectionBusy(true);
    try {
      await onUpdateSillyTavernConnection(connectionAddressDraft);
      pushToast('success', 'SillyTavern connected. Characters refreshed.');
      setConnectionPanelOpen(false);
    } catch (error) {
      pushToast('error', error instanceof Error ? error.message : 'Failed to connect to SillyTavern.');
    } finally {
      setConnectionBusy(false);
    }
  }

  async function connectUserPreferenceApiAddresses() {
    if (!connectionAddressDraft.trim()) {
      pushToast('error', 'Enter a SillyTavern API address first.');
      return;
    }
    if (!comfyConnectionAddressDraft.trim()) {
      pushToast('error', 'Enter a ComfyUI API address first.');
      return;
    }

    setPreferencesConnectionBusy(true);
    try {
      await onUpdateSillyTavernConnection(connectionAddressDraft);
      const comfyConnection = await updateComfyConnection(comfyConnectionAddressDraft);
      setComfyBaseUrl(comfyConnection.baseUrl || comfyConnectionAddressDraft.trim());
      await refreshComfyConnectionOptions(true);
      pushToast('success', 'SillyTavern and ComfyUI connected.');
    } catch (error) {
      pushToast('error', error instanceof Error ? error.message : 'Failed to connect to one or more services.');
    } finally {
      setPreferencesConnectionBusy(false);
    }
  }

  return (
    <main
      className={`menu-screen ${effectiveInterfaceSettings.wallpaperDataUrl ? 'has-custom-wallpaper' : ''}`.trim()}
      style={menuScreenStyle}
    >
      <section className="menu-shell studio-shell" aria-label="Studio workspace">
        <aside className="studio-toolbar">
          <div className="pettangatari-logo studio-toolbar-logo" aria-label="Pettangatari">
            Pettangatari
            <span className="studio-toolbar-version">v1.0.0</span>
          </div>
          <nav className="studio-tabs" aria-label="Main tabs">
            <button
              type="button"
              className={`studio-tab ${activeTab === 'character-creator' ? 'active' : ''}`}
              onClick={() => switchSidebarTab('character-creator')}
            >
              <img className="studio-tab-icon" src={userIcon} alt="" aria-hidden="true" />
              <span>Characters</span>
            </button>
            <button
              type="button"
              className={`studio-tab ${activeTab === 'scenario-creator' ? 'active' : ''}`}
              onClick={() => switchSidebarTab('scenario-creator')}
            >
              <img className="studio-tab-icon" src={mapIcon} alt="" aria-hidden="true" />
              <span>Scenarios</span>
            </button>
            <button
              type="button"
              className={`studio-tab ${activeTab === 'packages' ? 'active' : ''}`}
              onClick={() => switchSidebarTab('packages')}
            >
              <img className="studio-tab-icon" src={folderIcon} alt="" aria-hidden="true" />
              <span>Packages</span>
            </button>
            <button
              type="button"
              className={`studio-tab ${activeTab === 'play' ? 'active' : ''}`}
              onClick={() => switchSidebarTab('play')}
            >
              <img className="studio-tab-icon" src={playIcon} alt="" aria-hidden="true" />
              <span>Play</span>
            </button>
          </nav>

          <div className="studio-toolbar-footer">
            <IconButton icon={helpCircleIcon} label="Getting Started" onClick={() => openGettingStartedDialog(0)} />
            <IconButton
              icon={settingsIcon}
              label="Settings"
              onClick={() => {
                setMenuSettingsTab('interface');
                setMenuInterfaceSettingsDraft(interfaceSettings);
                setMenuGameplaySettingsDraft(gameplaySettings);
                setMenuSettingsOpen(true);
              }}
            />
          </div>
        </aside>

        <section className="studio-main">
          {activeTab === 'character-creator' ? (
            <section className="menu-card panel-card workspace-panel">
              <div className="view-switch" key={`character-${characterView}`}>
                {characterView === 'list' ? (
                  <>
                    <div className="panel-head panel-head-rich">
                      <div>
                        <h2>Characters</h2>
                      </div>
                      <IconButton
                        icon={addIcon}
                        label="Add character"
                        className="primary-action"
                        onClick={openNewCharacterEditor}
                      />
                    </div>
                    <label className="settings-row settings-row-toggle">
                      <span className="settings-row-label">
                        <span>Hide CGs to avoid spoilers</span>
                      </span>
                      <span className="settings-toggle-wrap">
                        <input
                          type="checkbox"
                          className="settings-toggle-input"
                          checked={hideCgSpoilers}
                          onChange={(event) => setHideCgSpoilers(event.target.checked)}
                        />
                        <span className="settings-toggle" aria-hidden="true" />
                      </span>
                    </label>
                    <label className="settings-row character-search-row">
                      <span className="settings-row-copy">
                        <span className="settings-row-label">
                          <span className="character-search-icon" aria-hidden="true" />
                          <span>Search characters</span>
                        </span>
                        <strong className="character-list-meta">
                          {filteredCharacters.length} / {characters.length}
                        </strong>
                      </span>
                      <input
                        type="search"
                        className="character-list-search"
                        placeholder="Search characters..."
                        value={characterSearchQuery}
                        onChange={(event) => setCharacterSearchQuery(event.target.value)}
                        aria-label="Search characters"
                      />
                    </label>
                    <div className="character-card-grid">
                      {filteredCharacters.map((character, filteredIndex) => {
                        const linkedCard = cardByName.get(character.cardName);
                        const coverSprite = getFirstAssetVariant(character.sprites.DEFAULT);
                        const characterCardAccent = normalizeHexColor(
                          character.accentColor,
                          DEFAULT_CHARACTER_ACCENT_COLOR,
                        );

                        return (
                          <article
                            key={character.id}
                            className="character-card"
                            style={
                              {
                                '--character-card-accent': characterCardAccent,
                                '--character-card-enter-delay': `${Math.min(filteredIndex, 20) * 58}ms`,
                              } as CSSProperties
                            }
                          >
                            {coverSprite ? (
                              <img
                                src={coverSprite}
                                alt={character.name}
                                className="card-cover card-cover-zoom"
                              />
                            ) : (
                              <div className="card-cover-empty">No sprite</div>
                            )}
                            <div className="card-bottom-gradient" />
                            <div className="card-label card-label-block">
                              <span className="card-kicker">{linkedCard?.creator || 'Studio character'}</span>
                              <strong>{character.name}</strong>
                              <span>{character.cardName}</span>
                            </div>
                            <div className="card-hover-actions card-top-actions character-card-actions">
                              <IconButton
                                icon={editIcon}
                                label={`Edit ${character.name}`}
                                onClick={() => openCharacterEditor(character)}
                              />
                              <IconButton
                                icon={deleteIcon}
                                label={`Delete ${character.name}`}
                                className="danger"
                                onClick={() =>
                                  requestConfirmation({
                                    title: 'Delete character?',
                                    description: `Delete "${character.name}" from the studio cast?`,
                                    confirmLabel: 'Delete',
                                    successMessage: 'Character deleted.',
                                    action: async () => {
                                      await onDeleteCharacter(character.id);
                                    },
                                  })
                                }
                              />
                            </div>
                          </article>
                        );
                      })}
                    </div>
                    {!loading && characters.length === 0 ? (
                      <div className="empty-state roomy-empty">No characters yet. Add one to start building your cast.</div>
                    ) : null}
                    {!loading && characters.length > 0 && filteredCharacters.length === 0 ? (
                      <div className="empty-state roomy-empty">No characters match your search.</div>
                    ) : null}
                  </>
                ) : (
                  <>
                    <div className="panel-head panel-head-rich">
                      <div>
                        <h2>{characterForm.id ? 'Edit Character' : 'Create Character'}</h2>
                      </div>
                      <IconButton
                        icon={backIcon}
                        label="Back to character list"
                        onClick={() => {
                          if (characterSpriteGenerationActive) {
                            setPendingCharacterEditorExit(true);
                            return;
                          }
                          setCharacterView('list');
                          resetCharacterForm();
                        }}
                      />
                    </div>
                    {pendingCharacterEditorExit ? (
                      <div className="sprite-thumb-loader" aria-live="polite">
                        <span className="sprite-loader-spinner" aria-hidden="true" />
                        <span>Generating...</span>
                      </div>
                    ) : null}
                    <div className="editor-shell">
                      <fieldset className="editor-fieldset">
                      <div className="form-stack roomy-form editor-main">
                        <label>
                          <FieldLabel icon={userSquareIcon}>Character Card (SillyTavern)</FieldLabel>
                          <div className="row-actions">
                            <select
                              value={characterForm.cardName}
                              onChange={(event) => {
                                const nextCardName = event.target.value;
                                const card = stCards.find((entry) => entry.name === nextCardName);
                                setCharacterForm((current) => ({
                                  ...current,
                                  cardName: nextCardName,
                                  name: characterNameTouched ? current.name : card?.name || current.name,
                                }));
                              }}
                              disabled={!isSillyTavernOnline && stCards.length === 0}
                            >
                              <option value="" disabled>
                                {isSillyTavernOnline ? 'Select a character card' : 'Reconnect SillyTavern to load cards'}
                              </option>
                              {stCards.map((card) => (
                                <option key={card.id} value={card.name}>{card.name}</option>
                              ))}
                            </select>
                            <IconButton
                              icon={refreshIcon}
                              label="Refresh character cards"
                              disabled={busy}
                              onClick={() => {
                                void runWithBusyState(async () => {
                                  await onRefreshSillyTavernCards();
                                }, 'Character cards refreshed.');
                              }}
                            />
                          </div>
                        </label>

                        <div className="character-editor-overview">
                          <div className="editor-field-grid character-meta-grid">
                            <label>
                              <FieldLabel icon={userIcon}>Name</FieldLabel>
                              <input
                                type="text"
                                value={characterForm.name}
                                onChange={(event) => {
                                  setCharacterNameTouched(true);
                                  setCharacterForm((current) => ({
                                    ...current,
                                    name: event.target.value,
                                  }));
                                }}
                              />
                            </label>

                            <label>
                              <FieldLabel icon={speakerIcon}>Blips</FieldLabel>
                              <BlipSelect
                                value={characterForm.blipSound}
                                onChange={(nextValue) =>
                                  setCharacterForm((current) => ({
                                    ...current,
                                    blipSound: nextValue,
                                  }))
                                }
                              />
                            </label>

                            <div className="settings-section character-affinity-settings">
                              <div className="settings-section-title">
                                <FieldLabelWithTooltip
                                  icon={settingsIcon}
                                  tooltip="This feature is still being tested"
                                  compact
                                >
                                  Affinity (Experimental)
                                </FieldLabelWithTooltip>
                              </div>

                              <div className="suggested-session-setting">
                                <label className="settings-row settings-row-slider">
                                  <span className="settings-row-copy">
                                    <span className="settings-row-label">
                                      <span>Max Suggested Positive Affinity</span>
                                    </span>
                                    <strong>{characterForm.suggestedAffinityPositiveMaximum ?? 100}</strong>
                                  </span>
                                  <input
                                    className="settings-slider settings-slider-positive"
                                    type="range"
                                    min={0}
                                    max={120}
                                    step={20}
                                    value={characterForm.suggestedAffinityPositiveMaximum ?? 100}
                                    onChange={(event) =>
                                      setCharacterForm((current) => ({
                                        ...current,
                                        suggestedAffinityPositiveMaximum: normalizeSuggestedAffinityPositiveMaximum(event.target.value),
                                      }))
                                    }
                                  />
                                </label>
                                <div
                                  className={`run-affinity-limit-card is-positive ${
                                    (characterForm.suggestedAffinityPositiveMaximum ?? 100) >= 120 ? 'is-stalker' : ''
                                  }`.trim()}
                                >
                                  <strong className="run-affinity-limit-card-title">
                                    {((characterForm.suggestedAffinityPositiveMaximum ?? 100) >= 120) ? (
                                      <img src={eyeIcon} alt="" aria-hidden="true" className="ui-icon" />
                                    ) : null}
                                    <span>
                                      {describePositiveAffinityLimit(characterForm.suggestedAffinityPositiveMaximum ?? 100).title}
                                    </span>
                                  </strong>
                                  <p>{describePositiveAffinityLimit(characterForm.suggestedAffinityPositiveMaximum ?? 100).detail}</p>
                                </div>
                              </div>

                              <div className="suggested-session-setting">
                                <label className="settings-row settings-row-slider">
                                  <span className="settings-row-copy">
                                    <span className="settings-row-label">
                                      <span>Max Suggested Negative Affinity</span>
                                    </span>
                                    <strong>{characterForm.suggestedAffinityNegativeMaximum ?? -100}</strong>
                                  </span>
                                  <input
                                    className="settings-slider settings-slider-negative"
                                    type="range"
                                    min={0}
                                    max={120}
                                    step={20}
                                    value={Math.abs(characterForm.suggestedAffinityNegativeMaximum ?? -100)}
                                    onChange={(event) =>
                                      setCharacterForm((current) => ({
                                        ...current,
                                        suggestedAffinityNegativeMaximum: normalizeSuggestedAffinityNegativeMaximum(
                                          -Number(event.target.value),
                                        ),
                                      }))
                                    }
                                  />
                                </label>
                                <div
                                  className={`run-affinity-limit-card is-negative ${
                                    (characterForm.suggestedAffinityNegativeMaximum ?? -100) <= -120 ? 'is-murder-intent' : ''
                                  }`.trim()}
                                >
                                  <strong className="run-affinity-limit-card-title">
                                    {((characterForm.suggestedAffinityNegativeMaximum ?? -100) <= -120) ? (
                                      <img src={alertTriangleIcon} alt="" aria-hidden="true" className="ui-icon" />
                                    ) : null}
                                    <span>
                                      {describeNegativeAffinityLimit(characterForm.suggestedAffinityNegativeMaximum ?? -100).title}
                                    </span>
                                  </strong>
                                  <p>{describeNegativeAffinityLimit(characterForm.suggestedAffinityNegativeMaximum ?? -100).detail}</p>
                                </div>
                              </div>
                            </div>

                            <div className="settings-section character-affinity-settings character-lust-settings">
                              <div className="settings-section-title">
                                <FieldLabelWithTooltip
                                  icon={heartIcon}
                                  tooltip="This feature is still being tested"
                                  compact
                                >
                                  Lust (Experimental)
                                </FieldLabelWithTooltip>
                              </div>

                              <div className="suggested-session-setting">
                                <label className="settings-row settings-row-slider">
                                  <span className="settings-row-copy">
                                    <span className="settings-row-label">
                                      <span>Max Suggested Lust</span>
                                    </span>
                                    <strong>{characterForm.suggestedLustMaximum ?? 60}</strong>
                                  </span>
                                  <input
                                    className="settings-slider settings-slider-positive"
                                    type="range"
                                    min={0}
                                    max={100}
                                    step={20}
                                    value={characterForm.suggestedLustMaximum ?? 60}
                                    onChange={(event) =>
                                      setCharacterForm((current) => ({
                                        ...current,
                                        suggestedLustMaximum: normalizeSuggestedLustMaximum(event.target.value),
                                      }))
                                    }
                                  />
                                </label>
                                <div className="run-affinity-limit-card is-positive">
                                  <strong className="run-affinity-limit-card-title">
                                    <span>{describeLustLimit(characterForm.suggestedLustMaximum ?? 60).title}</span>
                                  </strong>
                                  <p>{describeLustLimit(characterForm.suggestedLustMaximum ?? 60).detail}</p>
                                </div>
                              </div>
                            </div>
                          </div>

                          <div className="character-preview-stack">
                            <section
                              className="character-ingame-preview"
                              style={
                                {
                                  '--dialogue-accent': characterForm.accentColor,
                                  '--quote-animation-color': normalizeDialogueQuoteAnimationColor(characterForm.dialogueQuoteAnimationColor),
                                  '--quote-animation-speed': `${normalizeDialogueQuoteAnimationSpeed(characterForm.dialogueQuoteAnimationSpeed)}`,
                                } as CSSProperties
                              }
                              aria-label="In-game character preview"
                            >
                              <div className="character-ingame-preview-stage">
                                <div className="character-ingame-preview-scene" aria-hidden="true">
                                  <div className="character-ingame-preview-horizon" />
                                  <div className="character-ingame-preview-floor" />
                                </div>
                                <div className="character-ingame-preview-sprite-wrap">
                                  <div className="character-stage-floor" aria-hidden="true" />
                                  {characterInGamePreviewSpriteUrl ? (
                                    <div
                                      className={`character-ingame-preview-sprite-shell ${
                                        characterPreviewMouthVisible &&
                                        characterInGamePreviewOpenMouthUrl &&
                                        characterPreviewMouthFrameReady
                                          ? 'is-mouth-replaced'
                                          : ''
                                      }`.trim()}
                                      style={
                                        {
                                          '--sprite-preview-aspect': characterPreviewSpriteAspect,
                                          '--character-bloom-filter': buildCharacterBloomFilter(
                                            characterForm.automaticGeneration.bloomIntensity,
                                          ),
                                        } as CSSProperties
                                      }
                                    >
                                      {characterInGamePreviewDepthUrl ? (
                                        <DepthParallaxImage
                                          imageSrc={characterInGamePreviewSpriteUrl}
                                          depthSrc={characterInGamePreviewDepthUrl}
                                          alt={characterInGamePreviewName}
                                          className="character-ingame-preview-sprite"
                                          settings={{ strength: 10, focus: 100, edgeFill: 0, smearGuard: 40, quality: 'clean' }}
                                          fit="contain"
                                          pointerMode="circle"
                                          alphaMode="preserve"
                                          alphaPaddingIterations={12}
                                          disabled={busy}
                                        />
                                      ) : (
                                        <img
                                          src={characterInGamePreviewSpriteUrl}
                                          alt={characterInGamePreviewName}
                                          className="character-ingame-preview-sprite"
                                        />
                                      )}
                                      {characterInGamePreviewOpenMouthUrl ? (
                                        characterInGamePreviewDepthUrl ? (
                                          <DepthParallaxImage
                                            imageSrc={characterInGamePreviewOpenMouthUrl}
                                            layoutReferenceSrc={characterInGamePreviewSpriteUrl}
                                            depthSrc={characterInGamePreviewDepthUrl}
                                            alt="Preview mouth animation"
                                            className={`character-ingame-preview-animation-layer character-ingame-preview-mouth-layer ${
                                              characterPreviewMouthVisible ? 'is-visible' : ''
                                            }`.trim()}
                                            settings={{ strength: 10, focus: 100, edgeFill: 0, smearGuard: 40, quality: 'clean' }}
                                            fit="contain"
                                            pointerMode="circle"
                                            alphaMode="preserve"
                                            alphaPaddingIterations={12}
                                            disabled={busy}
                                          />
                                        ) : (
                                          <BlackTransparentImage
                                            src={characterInGamePreviewOpenMouthUrl}
                                            className="character-ingame-preview-animation-layer character-ingame-preview-mouth-layer"
                                            visible={characterPreviewMouthVisible}
                                          />
                                        )
                                      ) : null}
                                    </div>
                                  ) : (
                                    <div className="character-ingame-preview-empty">
                                      <IconImage src={imageIcon} />
                                    </div>
                                  )}
                                </div>
                                <section
                                  className="character-ingame-preview-lower-ui vn-lower-ui"
                                  style={{ '--dialogue-accent': characterForm.accentColor } as CSSProperties}
                                >
                                  <div className="character-ingame-preview-dialogue-wrapper dialogue-wrapper">
                                    <div
                                      className="character-ingame-preview-dialogue dialogue-box is-accented"
                                      style={{ '--dialogue-accent': characterForm.accentColor } as CSSProperties}
                                    >
                                      <div className="dialogue-topline">
                                        <div
                                          className="dialogue-speaker"
                                          style={{
                                            color: characterForm.characterNameColor || characterForm.accentColor,
                                            fontFamily: getDialogueQuoteFontFamily(selectedCharacterNameFont.id),
                                          }}
                                        >
                                          {characterInGamePreviewName}
                                        </div>
                                        <div className="dialogue-state">Ready</div>
                                      </div>
                                      <div className="dialogue-content">
                                        <p
                                          className={`dialogue-line dialogue ${getDialogueQuoteAnimationClass(
                                            normalizeDialogueQuoteAnimationPreset(characterForm.dialogueQuoteAnimationPreset),
                                          )}`.trim()}
                                          style={{
                                            fontFamily: getDialogueQuoteFontFamily(selectedDialogueQuoteFont.id),
                                            color: normalizeDialogueQuoteAnimationColor(characterForm.dialogueQuoteAnimationColor),
                                          }}
                                        >
                                          {shouldRenderPerLetterQuoteAnimation(selectedDialogueQuoteAnimation.id)
                                            ? renderPerLetterQuoteAnimationText(
                                                characterInGamePreviewQuote,
                                                selectedDialogueQuoteAnimation.id,
                                                characterForm.dialogueQuoteAnimationSpeed,
                                              )
                                            : characterInGamePreviewQuote}
                                        </p>
                                      </div>
                                      <div className="continue-hint">Click, Enter, or Space to continue</div>
                                    </div>
                                  </div>
                                </section>
                              </div>
                            </section>

                            <div className="form-section character-form-section">
                              <div className="form-section-heading">
                                <h3>Sprite Bloom</h3>
                              </div>
                              <label className="settings-row settings-row-slider">
                                <span className="settings-row-copy">
                                  <span className="settings-row-label">
                                    <span>Bloom Intensity</span>
                                  </span>
                                  <strong>{characterForm.automaticGeneration.bloomIntensity.toFixed(2)}</strong>
                                </span>
                                <input
                                  className="settings-slider"
                                  type="range"
                                  min={0}
                                  max={1}
                                  step={0.01}
                                  value={characterForm.automaticGeneration.bloomIntensity}
                                  onChange={(event) =>
                                    updateAutomaticGeneration((current) => ({
                                      ...current,
                                      bloomIntensity: normalizeBloomIntensityValue(event.target.value),
                                    }))
                                  }
                                />
                              </label>
                            </div>

                            <div className="form-section character-form-section">
                              <div className="form-section-heading">
                                <h3>Name</h3>
                              </div>
                              <label>
                                <FieldLabel icon={descriptionIcon}>Name Font</FieldLabel>
                                <select
                                  value={selectedCharacterNameFont.id}
                                  onChange={(event) => {
                                    const nextFont = getDialogueQuoteFontOption(event.target.value);
                                    ensureDialogueQuoteFontStylesheet(nextFont.id);
                                    setCharacterForm((current) => ({
                                      ...current,
                                      characterNameFontId: nextFont.id,
                                    }));
                                  }}
                                >
                                  {DIALOGUE_QUOTE_FONT_OPTIONS.map((fontOption) => (
                                    <option key={fontOption.id} value={fontOption.id}>
                                      {fontOption.label} ({fontOption.kind})
                                    </option>
                                  ))}
                                </select>
                              </label>
                              <div className="character-text-color-field">
                                <FieldLabel icon={colorIcon}>Name Color</FieldLabel>
                                <ColorPicker
                                  value={characterForm.characterNameColor || characterForm.accentColor}
                                  onChange={(nextValue) =>
                                    setCharacterForm((current) => ({
                                      ...current,
                                      characterNameColor: nextValue,
                                    }))
                                  }
                                />
                              </div>
                            </div>

                            <div className="form-section character-form-section">
                              <div className="form-section-heading">
                                <h3>Quote</h3>
                              </div>
                              <label>
                                <FieldLabel icon={descriptionIcon}>Quote Font</FieldLabel>
                                <select
                                  value={selectedDialogueQuoteFont.id}
                                  onChange={(event) => {
                                    const nextFont = getDialogueQuoteFontOption(event.target.value);
                                    ensureDialogueQuoteFontStylesheet(nextFont.id);
                                    setCharacterForm((current) => ({
                                      ...current,
                                      dialogueQuoteFontId: nextFont.id,
                                    }));
                                  }}
                                >
                                  {DIALOGUE_QUOTE_FONT_OPTIONS.map((fontOption) => (
                                    <option key={fontOption.id} value={fontOption.id}>
                                      {fontOption.label} ({fontOption.kind})
                                    </option>
                                  ))}
                                </select>
                              </label>
                              <label>
                                <FieldLabel icon={settingsIcon}>Quote Animation</FieldLabel>
                                <select
                                  value={selectedDialogueQuoteAnimation.id}
                                  onChange={(event) =>
                                    setCharacterForm((current) => ({
                                      ...current,
                                      dialogueQuoteAnimationPreset: normalizeDialogueQuoteAnimationPreset(event.target.value),
                                    }))
                                  }
                                >
                                  {DIALOGUE_QUOTE_ANIMATION_OPTIONS.map((animationOption) => (
                                    <option key={animationOption.id} value={animationOption.id}>
                                      {animationOption.label}
                                    </option>
                                  ))}
                                </select>
                              </label>
                              <label>
                                <FieldLabel icon={settingsIcon}>
                                  Animation Speed ({normalizeDialogueQuoteAnimationSpeed(characterForm.dialogueQuoteAnimationSpeed).toFixed(2)}x)
                                </FieldLabel>
                                <input
                                  type="range"
                                  min={0.25}
                                  max={3}
                                  step={0.05}
                                  value={normalizeDialogueQuoteAnimationSpeed(characterForm.dialogueQuoteAnimationSpeed)}
                                  onChange={(event) =>
                                    setCharacterForm((current) => ({
                                      ...current,
                                      dialogueQuoteAnimationSpeed: normalizeDialogueQuoteAnimationSpeed(event.target.value),
                                    }))
                                  }
                                />
                              </label>
                              <div className="character-text-color-field">
                                <FieldLabel icon={colorIcon}>Text Color</FieldLabel>
                                <ColorPicker
                                  value={normalizeDialogueQuoteAnimationColor(characterForm.dialogueQuoteAnimationColor)}
                                  onChange={(nextValue) =>
                                    setCharacterForm((current) => ({
                                      ...current,
                                      dialogueQuoteAnimationColor: normalizeDialogueQuoteAnimationColor(nextValue),
                                    }))
                                  }
                                />
                              </div>
                              <div className="row-actions character-text-color-reset">
                                <ActionButton
                                  icon={backIcon}
                                  label="Reset text color"
                                  onClick={() =>
                                    setCharacterForm((current) => ({
                                      ...current,
                                      dialogueQuoteAnimationColor: '#FFFFFF',
                                    }))
                                  }
                                />
                              </div>
                            </div>
                          </div>
                        </div>

                        <div className="settings-tab-bar character-editor-tab-bar" role="tablist" aria-label="Character editor modes">
                          <button
                            type="button"
                            role="tab"
                            aria-selected={characterEditorSubTab === 'manual'}
                            className={`settings-tab-button ${characterEditorSubTab === 'manual' ? 'is-active' : ''}`.trim()}
                            onClick={() => setCharacterEditorSubTab('manual')}
                          >
                            Manual
                          </button>
                          <button
                            type="button"
                            role="tab"
                            aria-selected={characterEditorSubTab === 'automatic'}
                            className={`settings-tab-button ${characterEditorSubTab === 'automatic' ? 'is-active' : ''}`.trim()}
                            onClick={() => setCharacterEditorSubTab('automatic')}
                          >
                            Automatic Generation
                          </button>
                        </div>

                        {characterEditorSubTab === 'manual' ? (
                          <>
                        <div
                          className="form-section character-form-section"
                          style={
                            {
                              background: hexToRgba(characterForm.accentColor, 0.08),
                              borderColor: hexToRgba(characterForm.accentColor, 0.28),
                            } satisfies CSSProperties
                          }
                        >
                          <div className="form-section-heading">
                            <h3>Sprite Sheet</h3>
                            <p>Default is required. Drop or upload art for any extra expression you want available in dialogue.</p>
                          </div>
                          <div className="sprite-grid">
                            {SPRITE_EXPRESSIONS.map((expression) => (
                              <div key={expression} className="sprite-slot">
                                <span className="sprite-slot-title">
                                  <IconImage src={imageIcon} />
                                  <span>
                                    [{expression}]
                                    {expression === 'DEFAULT' ? ' *' : ''}
                                  </span>
                                </span>
                                <div className="sprite-thumb-with-variants">
                                  {renderVariantSelector(expression)}
                                  <div
                                    className={`sprite-thumb sprite-thumb-dropzone ${
                                      draggingSpriteExpression === expression ? 'drag-active' : ''
                                    } ${isManualRegeneratingAsset(expression) ? 'is-regenerating' : ''}`}
                                    onDragOver={(event) => {
                                      event.preventDefault();
                                      if (draggingSpriteExpression !== expression) {
                                        setDraggingSpriteExpression(expression);
                                      }
                                    }}
                                    onDragLeave={(event) => {
                                      const relatedTarget = event.relatedTarget as Node | null;
                                      if (relatedTarget && event.currentTarget.contains(relatedTarget)) {
                                        return;
                                      }
                                      clearDragState();
                                    }}
                                    onDrop={(event) => {
                                      event.preventDefault();
                                      clearDragState();
                                      const file = event.dataTransfer.files?.[0];
                                      if (!file) {
                                        return;
                                      }
                                      void runWithBusyState(async () => {
                                        await beginCharacterSpriteCrop(
                                          expression,
                                          file,
                                          2 / 3,
                                          getSelectedAssetVariantIndex(expression),
                                        );
                                      });
                                    }}
                                  >
                                    {renderManualRegenerationOverlay(expression)}
                                    {renderSpriteThumbContent(
                                      `${expression}:${getSelectedAssetVariantIndex(expression)}`,
                                      getCharacterSpriteVariant(expression),
                                      `${expression} sprite`,
                                      'Drop image here',
                                      getCharacterSpriteDepthMapVariant(expression),
                                      false,
                                      getCharacterSpriteOpenMouthVariant(expression),
                                    )}
                                  </div>
                                </div>
                                <div className="row-actions">
                                  {comfyConnectionState === 'online' ? (
                                        <ActionButton
                                          icon={
                                            getCharacterSpriteVariant(expression, getSelectedAssetVariantIndex(expression))
                                              ? resumeIcon
                                              : playIcon
                                          }
                                          label={
                                            getCharacterSpriteVariant(expression, getSelectedAssetVariantIndex(expression))
                                              ? 'Regenerate sprite'
                                              : 'Generate sprite'
                                          }
                                          disabled={comfyGenerationBusy || comfyGenerationBlocked}
                                          onClick={() => {
                                            const variantIndex = getSelectedAssetVariantIndex(expression);
                                            openManualGenerationDialogForAsset(
                                              expression,
                                          variantIndex,
                                          getCharacterSpriteVariant(expression, variantIndex) ? 'regenerate' : 'generate-new',
                                        );
                                      }}
                                    />
                                  ) : null}
                                  {renderGenerateSpriteDepthMapButton(expression, expression)}
                                  <label className="file-picker">
                                    <input
                                      type="file"
                                      accept="image/*"
                                      className="file-picker-input"
                                      onChange={(event) => {
                                        const file = event.target.files?.[0];
                                        if (!file) {
                                          return;
                                        }
                                        void runWithBusyState(async () => {
                                          await beginCharacterSpriteCrop(
                                            expression,
                                            file,
                                            2 / 3,
                                            getSelectedAssetVariantIndex(expression),
                                          );
                                        });
                                        event.currentTarget.value = '';
                                      }}
                                    />
                                    <span
                                      className="file-picker-button icon-button"
                                      data-tooltip={getCharacterSpriteVariant(expression) ? 'Replace image' : 'Upload image'}
                                    >
                                      <IconImage src={uploadIcon} />
                                    </span>
                                  </label>
                                  <IconButton
                                    icon={triggerIcon}
                                    label="Interactive Zones"
                                    disabled={!getFirstAssetVariant(characterForm.sprites[expression])}
                                    onClick={() =>
                                      openInteractiveZonesEditor(
                                        expression,
                                        getFirstAssetVariant(characterForm.sprites[expression]),
                                        `[${expression}] Interactive Zones`,
                                      )
                                    }
                                  />
                                  <IconButton
                                    icon={duplicateIcon}
                                    label="Copy Interactive Zones"
                                    disabled={(characterForm.spriteZones[expression] || []).length === 0}
                                    onClick={() => copyInteractiveZones(expression)}
                                  />
                                  <IconButton
                                    icon={clipboardIcon}
                                    label="Paste interactive zones"
                                    disabled={!copiedInteractiveZones || copiedInteractiveZones.length === 0}
                                    onClick={() => pasteInteractiveZones(expression)}
                                  />
                                  <IconButton
                                    icon={deleteIcon}
                                    label={`Clear [${expression}]`}
                                    disabled={!getCharacterSpriteVariant(expression)}
                                    onClick={() => clearCharacterSprite(expression, getSelectedAssetVariantIndex(expression))}
                                  />
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>

                        <div
                          className="form-section character-form-section"
                          style={
                            {
                              background: hexToRgba(characterForm.accentColor, 0.06),
                              borderColor: hexToRgba(characterForm.accentColor, 0.2),
                            } satisfies CSSProperties
                          }
                        >
                          <div className="form-section-heading">
                            <h3>Custom Reactions</h3>
                            <p>Add extra tags like [TURN AROUND] and assign a sprite for each.</p>
                          </div>

                          <div className="row-actions character-editor-actions">
                            <ActionButton icon={addIcon} label="Add custom reaction" onClick={addCustomReaction} />
                          </div>

                          {characterForm.customReactions.length > 0 ? (
                            <div className="sprite-grid">
                              {characterForm.customReactions.map((reaction) => {
                                const triggers = parseReactionTriggersInput(reaction.triggersInput);
                                const primaryTrigger = triggers[0] || '';
                                const spriteKey = `CUSTOM:${reaction.id}`;
                                const spriteValue = getCharacterSpriteVariant(spriteKey);
                                const baseSpriteValue = getFirstAssetVariant(characterForm.sprites[spriteKey]);

                                return (
                                  <div key={reaction.id} className="sprite-slot">
                                    <span className="sprite-slot-title">
                                      <IconImage src={imageIcon} />
                                      <span>{primaryTrigger ? `[${primaryTrigger}]` : '[TRIGGER REQUIRED]'}</span>
                                    </span>
                                    <label>
                                      <FieldLabel icon={nameIcon}>Reaction Triggers</FieldLabel>
                                      <input
                                        type="text"
                                        value={reaction.triggersInput}
                                        placeholder="TURN AROUND, SHE SHOWS YOU THE DOOR"
                                        onChange={(event) => updateCustomReactionTriggers(reaction.id, event.target.value)}
                                      />
                                    </label>

                                    <div className="sprite-thumb-with-variants">
                                      {renderVariantSelector(spriteKey)}
                                      <div
                                        className={`sprite-thumb sprite-thumb-dropzone ${
                                          draggingSpriteExpression === spriteKey && primaryTrigger ? 'drag-active' : ''
                                        } ${isManualRegeneratingAsset(spriteKey) ? 'is-regenerating' : ''}`}
                                        onDragOver={(event) => {
                                          if (!primaryTrigger) {
                                            return;
                                          }
                                          event.preventDefault();
                                          if (draggingSpriteExpression !== spriteKey) {
                                            setDraggingSpriteExpression(spriteKey);
                                          }
                                        }}
                                        onDragLeave={(event) => {
                                          const relatedTarget = event.relatedTarget as Node | null;
                                          if (relatedTarget && event.currentTarget.contains(relatedTarget)) {
                                            return;
                                          }
                                          clearDragState();
                                        }}
                                        onDrop={(event) => {
                                          if (!primaryTrigger) {
                                            return;
                                          }
                                          event.preventDefault();
                                          clearDragState();
                                          const file = event.dataTransfer.files?.[0];
                                          if (!file) {
                                            return;
                                          }
                                          void runWithBusyState(async () => {
                                            await beginCharacterSpriteCrop(
                                              spriteKey,
                                              file,
                                              2 / 3,
                                              getSelectedAssetVariantIndex(spriteKey),
                                            );
                                          });
                                        }}
                                      >
                                        {renderManualRegenerationOverlay(spriteKey)}
                                        {renderSpriteThumbContent(
                                          `${spriteKey}:${getSelectedAssetVariantIndex(spriteKey)}`,
                                          spriteValue,
                                          `${primaryTrigger || 'Reaction'} sprite`,
                                          'Drop image here',
                                          getCharacterSpriteDepthMapVariant(spriteKey),
                                          false,
                                          getCharacterSpriteOpenMouthVariant(spriteKey),
                                        )}
                                      </div>
                                    </div>

                                    <div className="row-actions">
                                      <input
                                        ref={(input) => {
                                          if (input) {
                                            customReactionUploadInputRefsRef.current.set(reaction.id, input);
                                          } else {
                                            customReactionUploadInputRefsRef.current.delete(reaction.id);
                                          }
                                        }}
                                        type="file"
                                        accept="image/*"
                                        className="file-picker-input settings-hidden-input"
                                        onChange={(event) => {
                                          const file = event.target.files?.[0];
                                          event.currentTarget.value = '';
                                          if (!file) {
                                            return;
                                          }
                                          if (!primaryTrigger) {
                                            pushToast('error', 'Set at least one reaction trigger before uploading its image.');
                                            return;
                                          }
                                          void runWithBusyState(async () => {
                                            await beginCharacterSpriteCrop(
                                              spriteKey,
                                              file,
                                              2 / 3,
                                              getSelectedAssetVariantIndex(spriteKey),
                                            );
                                          });
                                        }}
                                      />
                                      <IconButton
                                        icon={uploadIcon}
                                        label={spriteValue ? 'Replace image' : 'Upload image'}
                                        onClick={() => {
                                          if (!primaryTrigger) {
                                            pushToast('error', 'Set at least one reaction trigger before uploading its image.');
                                            return;
                                          }
                                          customReactionUploadInputRefsRef.current.get(reaction.id)?.click();
                                        }}
                                      />
                                      {comfyConnectionState === 'online' ? (
                                        <IconButton
                                          icon={spriteValue ? resumeIcon : playIcon}
                                          label={spriteValue ? 'Regenerate' : 'Generate new'}
                                          disabled={
                                            !primaryTrigger ||
                                            comfyGenerationBusy ||
                                            comfyGenerationBlocked
                                          }
                                          onClick={() => {
                                            const variantIndex = getSelectedAssetVariantIndex(spriteKey);
                                            openManualGenerationDialogForAsset(
                                              spriteKey,
                                              variantIndex,
                                              getCharacterSpriteVariant(spriteKey, variantIndex) ? 'regenerate' : 'generate-new',
                                            );
                                          }}
                                        />
                                      ) : null}
                                      {renderGenerateSpriteDepthMapButton(spriteKey, primaryTrigger || 'Reaction', !primaryTrigger)}
                                      <IconButton
                                        icon={triggerIcon}
                                        label="Interactive Zones"
                                        disabled={!baseSpriteValue || !primaryTrigger}
                                        onClick={() => {
                                          if (!primaryTrigger || !baseSpriteValue) {
                                            return;
                                          }
                                          openInteractiveZonesEditor(
                                            primaryTrigger,
                                            baseSpriteValue,
                                            `[${primaryTrigger}] Interactive Zones`,
                                          );
                                        }}
                                      />
                                      <IconButton
                                        icon={duplicateIcon}
                                        label="Copy Interactive Zones"
                                        disabled={!primaryTrigger || (characterForm.spriteZones[primaryTrigger] || []).length === 0}
                                        onClick={() => {
                                          if (!primaryTrigger) {
                                            return;
                                          }
                                          copyInteractiveZones(primaryTrigger);
                                        }}
                                      />
                                      <IconButton
                                        icon={clipboardIcon}
                                        label="Paste interactive zones"
                                        disabled={!primaryTrigger || !copiedInteractiveZones || copiedInteractiveZones.length === 0}
                                        onClick={() => {
                                          if (!primaryTrigger) {
                                            return;
                                          }
                                          pasteInteractiveZones(primaryTrigger);
                                        }}
                                      />

                                      <IconButton
                                        icon={deleteIcon}
                                        label={`Clear [${primaryTrigger || 'REACTION'}]`}
                                        disabled={!spriteValue}
                                        onClick={() => clearCharacterSprite(spriteKey, getSelectedAssetVariantIndex(spriteKey))}
                                      />

                                      <IconButton
                                        icon={deleteIcon}
                                        label="Remove custom reaction"
                                        className="danger"
                                        onClick={() => removeCustomReaction(reaction.id)}
                                      />
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          ) : (
                            <div className="empty-state">No custom reactions yet.</div>
                          )}
                        </div>

                        <div
                          className="form-section character-form-section"
                          style={
                            {
                              background: hexToRgba(characterForm.accentColor, 0.05),
                              borderColor: hexToRgba(characterForm.accentColor, 0.18),
                            } satisfies CSSProperties
                          }
                        >
                          <div className="form-section-heading">
                            <h3>CG</h3>
                            <p>Add wide 16:9 CG images. The name becomes the generated tag, like [LOOKING AT DOOR].</p>
                          </div>

                          <div className="row-actions character-editor-actions">
                            <ActionButton icon={addIcon} label="Add CG" onClick={addCg} />
                          </div>

                          {characterForm.cgs.length > 0 ? (
                            <div className="sprite-grid">
                              {characterForm.cgs.map((cg) => {
                                const imageKey = `CG:${cg.id}`;
                                const imageValue = getCharacterSpriteVariant(imageKey);
                                const cgTriggers = parseReactionTriggersInput(cg.triggersInput);
                                const primaryCgTrigger = cgTriggers[0] || '';

                                return (
                                  <div key={cg.id} className="sprite-slot">
                                    <span className="sprite-slot-title">
                                      <IconImage src={imageIcon} />
                                      <span>{primaryCgTrigger ? `[${primaryCgTrigger}]` : '[TRIGGER REQUIRED]'}</span>
                                    </span>
                                    <label>
                                      <FieldLabel icon={nameIcon}>CG Triggers</FieldLabel>
                                      <input
                                        type="text"
                                        value={cg.triggersInput}
                                        placeholder="LOOKING AT DOOR, SHE SHOWS YOU THE DOOR"
                                        onChange={(event) => updateCg(cg.id, { triggersInput: event.target.value })}
                                      />
                                    </label>

                                    <div className="sprite-thumb-with-variants">
                                      {renderVariantSelector(imageKey)}
                                      <div
                                        className={`sprite-thumb sprite-thumb-dropzone ${
                                          draggingSpriteExpression === imageKey ? 'drag-active' : ''
                                        } ${isManualRegeneratingAsset(imageKey) ? 'is-regenerating' : ''}`}
                                        onDragOver={(event) => {
                                          event.preventDefault();
                                          if (draggingSpriteExpression !== imageKey) {
                                            setDraggingSpriteExpression(imageKey);
                                          }
                                        }}
                                        onDragLeave={(event) => {
                                          const relatedTarget = event.relatedTarget as Node | null;
                                          if (relatedTarget && event.currentTarget.contains(relatedTarget)) {
                                            return;
                                          }
                                          clearDragState();
                                        }}
                                        onDrop={(event) => {
                                          event.preventDefault();
                                          clearDragState();
                                          const file = event.dataTransfer.files?.[0];
                                          if (!file) {
                                            return;
                                          }
                                          void runWithBusyState(async () => {
                                            await beginCharacterSpriteCrop(
                                              imageKey,
                                              file,
                                              16 / 9,
                                              getSelectedAssetVariantIndex(imageKey),
                                            );
                                          });
                                        }}
                                      >
                                        {renderManualRegenerationOverlay(imageKey)}
                                        {renderSpriteThumbContent(
                                          `${imageKey}:${getSelectedAssetVariantIndex(imageKey)}`,
                                          imageValue,
                                          `${primaryCgTrigger || 'CG'} image`,
                                          'Drop 16:9 image here',
                                          getCharacterSpriteDepthMapVariant(imageKey),
                                          true,
                                        )}
                                      </div>
                                    </div>

                                    <div className="row-actions">
                                      {comfyConnectionState === 'online' ? (
                                        <IconButton
                                          icon={imageValue ? resumeIcon : playIcon}
                                          label={imageValue ? 'Regenerate' : 'Generate new'}
                                          disabled={
                                            !primaryCgTrigger ||
                                            comfyGenerationBusy ||
                                            comfyGenerationBlocked
                                          }
                                          onClick={() => {
                                            const variantIndex = getSelectedAssetVariantIndex(imageKey);
                                            openManualGenerationDialogForAsset(
                                              imageKey,
                                              variantIndex,
                                              getCharacterSpriteVariant(imageKey, variantIndex) ? 'regenerate' : 'generate-new',
                                            );
                                          }}
                                        />
                                      ) : null}
                                      <label className="file-picker">
                                        <input
                                          type="file"
                                          accept="image/*"
                                          className="file-picker-input"
                                          onChange={(event) => {
                                            const file = event.target.files?.[0];
                                            if (!file) {
                                              return;
                                            }
                                            void runWithBusyState(async () => {
                                              await beginCharacterSpriteCrop(
                                                imageKey,
                                                file,
                                                16 / 9,
                                                getSelectedAssetVariantIndex(imageKey),
                                              );
                                            });
                                            event.currentTarget.value = '';
                                          }}
                                        />
                                        <span
                                          className="file-picker-button icon-button"
                                          data-tooltip={imageValue ? 'Replace CG image' : 'Upload CG image'}
                                        >
                                          <IconImage src={uploadIcon} />
                                        </span>
                                      </label>

                                      <IconButton
                                        icon={deleteIcon}
                                        label={`Clear CG ${primaryCgTrigger ? `[${primaryCgTrigger}]` : ''}`.trim()}
                                        disabled={!imageValue}
                                        onClick={() => clearCharacterSprite(imageKey, getSelectedAssetVariantIndex(imageKey))}
                                      />

                                      <IconButton
                                        icon={deleteIcon}
                                        label="Remove CG"
                                        className="danger"
                                        onClick={() => removeCg(cg.id)}
                                      />
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          ) : (
                            <div className="empty-state">No CG entries yet.</div>
                          )}
                        </div>
                          </>
                        ) : (
                          <div className="form-stack autogen-stack">
                            <div className="form-section character-form-section">
                              <div className="form-section-head-row">
                                <div className="form-section-heading">
                                  <h3>Automatic Generation</h3>
                                  <p>Generate sprite and CG variants with your local ComfyUI workflow and inject them directly into this character.</p>
                                </div>
                                <div className="autogen-connection-status">
                                  {comfyConnectionState === 'checking' ? (
                                    <span className="sprite-loader-spinner" aria-hidden="true" />
                                  ) : null}
                                  <span
                                    className={`menu-connection-dot ${
                                      comfyConnectionState === 'online'
                                        ? 'is-online'
                                        : comfyConnectionState === 'offline'
                                          ? 'is-offline'
                                          : ''
                                    }`.trim()}
                                  />
                                  <span>
                                    {comfyConnectionState === 'checking'
                                      ? 'Checking local ComfyUI...'
                                      : comfyConnectionState === 'online'
                                        ? comfyMissingNodes.length > 0
                                          ? 'ComfyUI connected, but required nodes are missing'
                                          : 'ComfyUI connected'
                                        : comfyConnectionError || 'ComfyUI disconnected'}
                                  </span>
                                </div>
                              </div>

                              <div className="row-actions autogen-top-actions">
                                <ActionButton icon={folderIcon} label="Export Settings" onClick={exportAutomaticGenerationConfig} />
                                <input
                                  id={generationConfigImportInputId}
                                  ref={generationImportInputRef}
                                  type="file"
                                  accept="application/json,.json"
                                  className="file-picker-input settings-hidden-input"
                                  onChange={(event) => {
                                    const file = event.target.files?.[0];
                                    event.currentTarget.value = '';
                                    if (!file) {
                                      return;
                                    }
                                    void runWithBusyState(async () => {
                                      await importAutomaticGenerationConfigFromFile(file);
                                    }, 'Automatic generation config imported.');
                                  }}
                                />
                                <ActionButton
                                  icon={uploadIcon}
                                  label="Import Settings"
                                  onClick={() => generationImportInputRef.current?.click()}
                                />
                                <ActionButton
                                  icon={settingsIcon}
                                  label="Import Example Project"
                                  onClick={() =>
                                    void runWithBusyState(
                                      async () => {
                                        await importAutomaticGenerationExampleProject();
                                      },
                                      'Example automatic generation config imported.',
                                    )
                                  }
                                />
                              </div>

                              {comfyMissingNodes.length > 0 ? (
                                <div className="menu-error autogen-missing-nodes-alert">
                                  <strong>Missing ComfyUI nodes</strong>
                                  <p>Install these nodes in ComfyUI before generation:</p>
                                  <p>{formatMissingNodesForDisplay(comfyMissingNodes)}</p>
                                </div>
                              ) : null}

                              <div className="editor-field-grid autogen-primary-grid">
                                <label>
                                  <FieldLabel icon={nameIcon}>Checkpoint selection</FieldLabel>
                                  <select
                                    value={characterForm.automaticGeneration.checkpoint}
                                    onChange={(event) =>
                                      updateAutomaticGeneration((current) => ({
                                        ...current,
                                        checkpoint: event.target.value,
                                      }))
                                    }
                                  >
                                    <option value="">Select checkpoint</option>
                                    {comfyCheckpoints.map((checkpointName) => (
                                      <option key={checkpointName} value={checkpointName}>
                                        {checkpointName}
                                      </option>
                                    ))}
                                  </select>
                                </label>

                                <label>
                                  <FieldLabel icon={nameIcon}>Upscale model (optional)</FieldLabel>
                                  <select
                                    value={characterForm.automaticGeneration.upscaleModel}
                                    onChange={(event) =>
                                      updateAutomaticGeneration((current) => ({
                                        ...current,
                                        upscaleModel: event.target.value,
                                      }))
                                    }
                                  >
                                    <option value="">None (bypass upscaler)</option>
                                    {comfyUpscaleModels.map((upscaleModelName) => (
                                      <option key={upscaleModelName} value={upscaleModelName}>
                                        {upscaleModelName}
                                      </option>
                                    ))}
                                  </select>
                                </label>

                                <label className="autogen-variant-count-field">
                                  <FieldLabel icon={descriptionIcon}>Expression variant count</FieldLabel>
                                  <input
                                    type="number"
                                    min={0}
                                    max={ASSET_VARIANT_COUNT}
                                    value={characterForm.automaticGeneration.expressionVariantCount}
                                    onChange={(event) =>
                                      updateAutomaticGeneration((current) => ({
                                        ...current,
                                        expressionVariantCount: clampNumber(
                                          Number.parseInt(event.target.value || '0', 10) || 0,
                                          0,
                                          ASSET_VARIANT_COUNT,
                                        ),
                                      }))
                                    }
                                  />
                                </label>
                                <label className="autogen-variant-count-field">
                                  <FieldLabel icon={descriptionIcon}>CG variant count</FieldLabel>
                                  <input
                                    type="number"
                                    min={0}
                                    max={ASSET_VARIANT_COUNT}
                                    value={characterForm.automaticGeneration.cgVariantCount}
                                    onChange={(event) =>
                                      updateAutomaticGeneration((current) => ({
                                        ...current,
                                        cgVariantCount: clampNumber(
                                          Number.parseInt(event.target.value || '0', 10) || 0,
                                          0,
                                          ASSET_VARIANT_COUNT,
                                        ),
                                      }))
                                    }
                                  />
                                </label>
                                <label className="autogen-variant-count-field">
                                  <FieldLabel icon={settingsIcon}>Steps</FieldLabel>
                                  <input
                                    type="number"
                                    min={1}
                                    max={150}
                                    value={characterForm.automaticGeneration.steps}
                                    onChange={(event) =>
                                      updateAutomaticGeneration((current) => ({
                                        ...current,
                                        steps: clampNumber(Number.parseInt(event.target.value || '0', 10) || 1, 1, 150),
                                      }))
                                    }
                                  />
                                </label>
                                {characterForm.automaticGeneration.steps < 20 ? (
                                  <div className="menu-error autogen-steps-warning">
                                    <strong>Low step count warning</strong>
                                    <p>Values below 20 might produce poor sprite/CG results.</p>
                                  </div>
                                ) : null}
                                <label className="settings-row settings-row-toggle">
                                  <span className="settings-row-label">
                                    <span>Generate Depthmaps</span>
                                  </span>
                                  <span className="settings-toggle-wrap">
                                    <input
                                      type="checkbox"
                                      className="settings-toggle-input"
                                      checked={characterForm.automaticGeneration.generateDepthMaps}
                                      onChange={(event) =>
                                        updateAutomaticGeneration((current) => ({
                                          ...current,
                                          generateDepthMaps: event.target.checked,
                                        }))
                                      }
                                    />
                                    <span className="settings-toggle" aria-hidden="true" />
                                  </span>
                                </label>
                                <label className="settings-row settings-row-toggle">
                                  <span className="settings-row-label">
                                    <span>Generate Mouth Animations (experimental)</span>
                                  </span>
                                  <span className="settings-toggle-wrap">
                                    <input
                                      type="checkbox"
                                      className="settings-toggle-input"
                                      checked={characterForm.automaticGeneration.generateMouthAnimations}
                                      onChange={(event) => {
                                        if (event.target.checked) {
                                          requestGenerateMouthAnimationsEnabled('automatic');
                                          return;
                                        }
                                        updateAutomaticGeneration((current) => ({
                                          ...current,
                                          generateMouthAnimations: false,
                                        }));
                                      }}
                                    />
                                    <span className="settings-toggle" aria-hidden="true" />
                                  </span>
                                </label>
                                <div className="autogen-preferred-cg-grid">
                                  <label className="autogen-variant-count-field autogen-tooltip-field">
                                  <FieldLabelWithTooltip
                                    icon={descriptionIcon}
                                    align="center"
                                    tooltip={'This expression will be used for any CG that does not contain the tag "sex"'}
                                  >
                                    Preferred CG Expression
                                  </FieldLabelWithTooltip>
                                    <select
                                      value={characterForm.automaticGeneration.preferredCgExpression}
                                      onChange={(event) =>
                                        updateAutomaticGeneration((current) => ({
                                          ...current,
                                          preferredCgExpression: normalizePreferredCgExpressionValue(event.target.value),
                                        }))
                                      }
                                    >
                                      {PREFERRED_CG_EXPRESSION_OPTIONS.map((entry) => (
                                        <option key={entry.value} value={entry.value}>
                                          {entry.label}
                                        </option>
                                      ))}
                                    </select>
                                  </label>
                                  <label className="autogen-variant-count-field autogen-tooltip-field">
                                  <FieldLabelWithTooltip
                                    icon={descriptionIcon}
                                    align="center"
                                    tooltip={'This expression will be used for any CG that contains the tag "sex"'}
                                  >
                                    Preferred Penetration Expression
                                  </FieldLabelWithTooltip>
                                    <select
                                      value={characterForm.automaticGeneration.preferredPenetrationExpression}
                                      onChange={(event) =>
                                        updateAutomaticGeneration((current) => ({
                                          ...current,
                                          preferredPenetrationExpression: normalizePreferredCgExpressionValue(event.target.value),
                                        }))
                                      }
                                    >
                                      {PREFERRED_CG_EXPRESSION_OPTIONS.map((entry) => (
                                        <option key={entry.value} value={entry.value}>
                                          {entry.label}
                                        </option>
                                      ))}
                                    </select>
                                  </label>
                                </div>

                                <label className="scenario-description-field">
                                  <FieldLabel icon={descriptionIcon}>Base prompt</FieldLabel>
                                  <textarea
                                    rows={4}
                                    value={characterForm.automaticGeneration.basePrompt}
                                    onChange={(event) =>
                                      updateAutomaticGeneration((current) => ({
                                        ...current,
                                        basePrompt: event.target.value,
                                      }))
                                    }
                                  />
                                </label>

                                <label className="scenario-description-field">
                                  <FieldLabel icon={descriptionIcon}>Negative prompt</FieldLabel>
                                  <textarea
                                    rows={4}
                                    value={characterForm.automaticGeneration.negativePrompt}
                                    onChange={(event) =>
                                      updateAutomaticGeneration((current) => ({
                                        ...current,
                                        negativePrompt: event.target.value,
                                      }))
                                    }
                                  />
                                </label>

                                <div className="scenario-description-field autogen-artstyle-section">
                                  <div className="form-section-head-row">
                                    <div className="form-section-heading">
                                      <h4>Artstyle Presets</h4>
                                      <p>Save/load style prompts, manage selected-preset LoRAs, generate previews, and assign card thumbnails.</p>
                                    </div>
                                  </div>
                                  <div className="autogen-artstyle-controls">
                                    <label>
                                      <FieldLabel icon={nameIcon}>Preset Name</FieldLabel>
                                      <input
                                        type="text"
                                        value={artStylePresetNameDraft}
                                        onChange={(event) => setArtStylePresetNameDraft(event.target.value)}
                                        placeholder="Style name"
                                      />
                                    </label>
                                    <label>
                                      <FieldLabel icon={folderIcon}>Preset Checkpoint</FieldLabel>
                                      <select
                                        value={displayedArtStyleCheckpoint}
                                        onChange={(event) => setArtStylePresetCheckpointDraft(event.target.value)}
                                      >
                                        <option value="">Use current checkpoint</option>
                                        {comfyCheckpoints.map((checkpointName) => (
                                          <option key={checkpointName} value={checkpointName}>
                                            {checkpointName}
                                          </option>
                                        ))}
                                      </select>
                                    </label>
                                    <div className="row-actions autogen-artstyle-actions">
                                      <ActionButton
                                        icon={saveIcon}
                                        label="Save Preset"
                                        onClick={() =>
                                          void runWithBusyState(async () => {
                                            await saveArtStylePreset();
                                          }, 'Artstyle preset saved.')
                                        }
                                      />
                                      <ActionButton
                                        icon={refreshIcon}
                                        label="Update Selected"
                                        className="autogen-artstyle-update-action"
                                        disabled={!activeArtStylePresetId}
                                        onClick={() =>
                                          void runWithBusyState(async () => {
                                            await updateActiveArtStylePresetFromPrompt();
                                          }, 'Artstyle preset updated.')
                                        }
                                      />
                                    </div>
                                  </div>
                                  <label className="autogen-artstyle-prompt-field">
                                    <FieldLabel icon={descriptionIcon}>Artstyle prompt</FieldLabel>
                                    <textarea
                                      rows={3}
                                      value={characterForm.automaticGeneration.artStylePrompt}
                                      onChange={(event) =>
                                        updateAutomaticGeneration((current) => ({
                                          ...current,
                                          artStylePrompt: event.target.value,
                                        }))
                                      }
                                    />
                                  </label>
                                  <div className="row-actions autogen-artstyle-preview-actions">
                                    <ActionButton
                                      icon={playIcon}
                                      label={autogenPreviewGenerating ? 'Generating Preview...' : 'Generate Preview'}
                                      disabled={autogenPreviewBlocked || !characterForm.automaticGeneration.artStylePrompt.trim()}
                                      onClick={() =>
                                        void runWithBusyState(async () => {
                                          await generateArtStylePromptPreview();
                                        }, 'Artstyle preview generated.')
                                      }
                                    />
                                    <ActionButton
                                      icon={imageIcon}
                                      label="Assign Preview as Thumbnail"
                                      disabled={!activeArtStylePresetId || !autogenPromptPreviewDataUrl}
                                      onClick={() =>
                                          void runWithBusyState(async () => {
                                          await assignCurrentPreviewToActiveArtStylePreset();
                                        }, 'Artstyle thumbnail assigned.')
                                      }
                                    />
                                    <span className="autogen-artstyle-active-hint">
                                      {activeArtStylePreset
                                        ? `Selected preset: ${activeArtStylePreset.name}`
                                        : 'Select a preset card to assign the thumbnail.'}
                                    </span>
                                  </div>

                                  <div className="autogen-lora-section autogen-artstyle-lora-section">
                                    <div className="form-section-head-row">
                                      <div className="form-section-heading">
                                        <h4>Artstyle LoRAs</h4>
                                        <p>
                                          {activeArtStylePreset
                                            ? `These LoRAs stay attached to ${activeArtStylePreset.name}.`
                                            : 'These LoRAs will be embedded when you save this preset.'}
                                        </p>
                                      </div>
                                      <ActionButton
                                        icon={addIcon}
                                        label="Add LoRA"
                                        onClick={() =>
                                          void runWithBusyState(async () => {
                                            await addArtStyleLora();
                                          }, 'Artstyle LoRA added.')
                                        }
                                      />
                                    </div>
                                    {displayedArtStyleLoras.length > 0 ? (
                                      <div className="autogen-lora-list">
                                        {displayedArtStyleLoras.map((lora, index) => (
                                          <div key={`artstyle-lora-${activeArtStylePresetId || 'draft'}-${index}`} className="autogen-lora-row">
                                            <label>
                                              <FieldLabel icon={nameIcon}>LoRA</FieldLabel>
                                              <select
                                                value={lora.name}
                                                onChange={(event) =>
                                                  void updateArtStyleLora(index, { name: event.target.value }).catch((error) => {
                                                    pushToast('error', error instanceof Error ? error.message : 'Failed to update artstyle LoRA.');
                                                  })
                                                }
                                              >
                                                <option value="">Select LoRA</option>
                                                {comfyLoras.map((loraName) => (
                                                  <option key={loraName} value={loraName}>
                                                    {loraName}
                                                  </option>
                                                ))}
                                              </select>
                                            </label>
                                            <label>
                                              <FieldLabel icon={descriptionIcon}>Strength</FieldLabel>
                                              <input
                                                type="number"
                                                step="0.05"
                                                min={-4}
                                                max={4}
                                                value={lora.strength}
                                                onChange={(event) =>
                                                  void updateArtStyleLora(index, {
                                                    strength: Number.parseFloat(event.target.value || '1'),
                                                  }).catch((error) => {
                                                    pushToast('error', error instanceof Error ? error.message : 'Failed to update artstyle LoRA.');
                                                  })
                                                }
                                              />
                                            </label>
                                            <IconButton
                                              icon={deleteIcon}
                                              label="Remove artstyle LoRA"
                                              onClick={() =>
                                                void removeArtStyleLora(index).catch((error) => {
                                                  pushToast('error', error instanceof Error ? error.message : 'Failed to remove artstyle LoRA.');
                                                })
                                              }
                                            />
                                          </div>
                                        ))}
                                      </div>
                                    ) : (
                                      <div className="empty-state">No LoRAs embedded in this artstyle.</div>
                                    )}
                                  </div>

                                  {artStylePresets.length > 0 ? (
                                    <div className="autogen-artstyle-grid">
                                      {artStylePresets.map((preset) => (
                                        <article
                                          key={preset.id}
                                          className={`autogen-artstyle-card ${
                                            activeArtStylePresetId === preset.id ? 'is-active' : ''
                                          }`.trim()}
                                        >
                                          <div className="autogen-artstyle-card-visual">
                                            <button
                                              type="button"
                                              className="autogen-artstyle-thumbnail"
                                              onClick={() =>
                                                void runWithBusyState(async () => {
                                                  loadArtStylePresetIntoPrompt(preset.id);
                                                }, `Loaded [${preset.name}] artstyle preset.`)
                                              }
                                            >
                                              {preset.thumbnailDataUrl ? (
                                                <img src={preset.thumbnailDataUrl} alt={`${preset.name} preset thumbnail`} />
                                              ) : (
                                                <span>No thumbnail</span>
                                              )}
                                            </button>

                                            <div className="autogen-artstyle-card-copy">
                                              <strong>{preset.name}</strong>
                                              <p>{preset.prompt}</p>
                                              <p>{preset.checkpoint ? `Checkpoint: ${preset.checkpoint}` : 'Checkpoint: current selection'}</p>
                                              <p>{preset.loras.length > 0 ? `LoRAs: ${preset.loras.map((entry) => entry.name).join(', ')}` : 'LoRAs: none'}</p>
                                            </div>
                                          </div>

                                          <div className="row-actions autogen-artstyle-card-actions">
                                            <ActionButton
                                              icon={folderIcon}
                                              label="Load"
                                              onClick={() =>
                                                void runWithBusyState(async () => {
                                                  loadArtStylePresetIntoPrompt(preset.id);
                                                }, `Loaded [${preset.name}] artstyle preset.`)
                                              }
                                            />
                                            <ActionButton
                                              icon={playIcon}
                                              label={
                                                generatingArtStylePresetId === preset.id
                                                  ? 'Generating Preview...'
                                                  : 'Generate Preview'
                                              }
                                              disabled={Boolean(generatingArtStylePresetId) || autogenPreviewBlocked}
                                              onClick={() =>
                                                void runWithBusyState(async () => {
                                                  await generateArtStylePresetPreview(preset.id);
                                                }, `[${preset.name}] style preview generated.`)
                                              }
                                            />
                                            <ActionButton
                                              icon={imageIcon}
                                              label="Use Current Preview"
                                              disabled={!autogenPromptPreviewDataUrl}
                                              onClick={() =>
                                                void runWithBusyState(async () => {
                                                  await assignCurrentPreviewToArtStylePreset(preset.id);
                                                }, `[${preset.name}] thumbnail updated.`)
                                              }
                                            />
                                            <ActionButton
                                              icon={deleteIcon}
                                              label="Delete"
                                              className="danger"
                                              onClick={() =>
                                                void runWithBusyState(async () => {
                                                  await removeArtStylePreset(preset.id);
                                                }, `[${preset.name}] artstyle preset deleted.`)
                                              }
                                            />
                                          </div>
                                        </article>
                                      ))}
                                    </div>
                                  ) : (
                                    <div className="empty-state">No artstyle presets saved yet.</div>
                                  )}
                                </div>
                              </div>

                              <div className="autogen-lora-section">
                                <div className="form-section-head-row">
                                  <div className="form-section-heading">
                                    <h4>LoRA selection list</h4>
                                  </div>
                                  <button type="button" className="action-button" onClick={addAutomaticGenerationLora}>
                                    <span>+</span>
                                  </button>
                                </div>
                                {characterForm.automaticGeneration.loras.length > 0 ? (
                                  <div className="autogen-lora-list">
                                    {characterForm.automaticGeneration.loras.map((lora, index) => (
                                      <div key={`lora-${index}`} className="autogen-lora-row">
                                        <label>
                                          <FieldLabel icon={nameIcon}>LoRA</FieldLabel>
                                          <select
                                            value={lora.name}
                                            onChange={(event) =>
                                              updateAutomaticGenerationLora(index, { name: event.target.value })
                                            }
                                          >
                                            <option value="">Select LoRA</option>
                                            {comfyLoras.map((loraName) => (
                                              <option key={loraName} value={loraName}>
                                                {loraName}
                                              </option>
                                            ))}
                                          </select>
                                        </label>
                                        <label>
                                          <FieldLabel icon={descriptionIcon}>Strength</FieldLabel>
                                          <input
                                            type="number"
                                            step="0.05"
                                            min={-4}
                                            max={4}
                                            value={lora.strength}
                                            onChange={(event) =>
                                              updateAutomaticGenerationLora(index, {
                                                strength: Number.parseFloat(event.target.value || '1'),
                                              })
                                            }
                                          />
                                        </label>
                                        <IconButton icon={deleteIcon} label="Remove LoRA" onClick={() => removeAutomaticGenerationLora(index)} />
                                      </div>
                                    ))}
                                  </div>
                                ) : (
                                  <div className="empty-state">No LoRAs selected.</div>
                                )}
                              </div>

                              <div className="editor-field-grid autogen-tags-grid">
                                <label>
                                  <FieldLabel icon={descriptionIcon}>Character Main Tags</FieldLabel>
                                  <textarea
                                    rows={3}
                                    value={characterForm.automaticGeneration.characterMainTags}
                                    onChange={(event) =>
                                      updateAutomaticGeneration((current) => ({
                                        ...current,
                                        characterMainTags: event.target.value,
                                      }))
                                    }
                                  />
                                </label>
                                <label>
                                  <FieldLabel icon={descriptionIcon}>Upper Body Tags</FieldLabel>
                                  <textarea
                                    rows={3}
                                    value={characterForm.automaticGeneration.upperBodyTags}
                                    onChange={(event) =>
                                      updateAutomaticGeneration((current) => ({
                                        ...current,
                                        upperBodyTags: event.target.value,
                                      }))
                                    }
                                  />
                                </label>
                                <label>
                                  <FieldLabel icon={descriptionIcon}>Waist Tags</FieldLabel>
                                  <textarea
                                    rows={3}
                                    value={characterForm.automaticGeneration.waistTags}
                                    onChange={(event) =>
                                      updateAutomaticGeneration((current) => ({
                                        ...current,
                                        waistTags: event.target.value,
                                      }))
                                    }
                                  />
                                </label>
                                <label>
                                  <FieldLabel icon={descriptionIcon}>Lower Body Tags</FieldLabel>
                                  <textarea
                                    rows={3}
                                    value={characterForm.automaticGeneration.lowerBodyTags}
                                    onChange={(event) =>
                                      updateAutomaticGeneration((current) => ({
                                        ...current,
                                        lowerBodyTags: event.target.value,
                                      }))
                                    }
                                  />
                                </label>
                                <label>
                                  <FieldLabelWithTooltip
                                    icon={descriptionIcon}
                                    tooltip={
                                      'These tags will only appear if a cg or expression contains "open mouth", so that they are not forced into all of them, for example: sharp teeth'
                                    }
                                  >
                                    Open mouth tags
                                  </FieldLabelWithTooltip>
                                  <textarea
                                    rows={3}
                                    value={characterForm.automaticGeneration.openMouthTags}
                                    onChange={(event) =>
                                      updateAutomaticGeneration((current) => ({
                                        ...current,
                                        openMouthTags: event.target.value,
                                      }))
                                    }
                                  />
                                </label>
                                <label>
                                  <FieldLabel icon={descriptionIcon}>Lighting Color</FieldLabel>
                                  <select
                                    value={characterForm.automaticGeneration.lightingColor}
                                    onChange={(event) =>
                                      updateAutomaticGeneration((current) => ({
                                        ...current,
                                        lightingColor: normalizeLightingColorValue(event.target.value),
                                      }))
                                    }
                                  >
                                    {LIGHTING_COLOR_OPTIONS.map((entry) => (
                                      <option key={entry.value} value={entry.value}>
                                        {entry.label}
                                      </option>
                                    ))}
                                  </select>
                                </label>
                                <label>
                                  <FieldLabel icon={descriptionIcon}>Breast Size</FieldLabel>
                                  <select
                                    value={characterForm.automaticGeneration.breastSize}
                                    onChange={(event) =>
                                      updateAutomaticGeneration((current) => ({
                                        ...current,
                                        breastSize: normalizeBreastSizeValue(event.target.value),
                                      }))
                                    }
                                  >
                                    {BREAST_SIZE_OPTIONS.map((entry) => (
                                      <option key={entry.value} value={entry.value}>
                                        {entry.label}
                                      </option>
                                    ))}
                                  </select>
                                </label>
                              </div>
                              <div className="row-actions autogen-preview-actions">
                                <ActionButton
                                  icon={playIcon}
                                  label={autogenPreviewGenerating ? 'Generating Preview...' : 'Generate Preview'}
                                  className="primary-action"
                                  disabled={autogenPreviewBlocked}
                                  onClick={() => {
                                    void generateAutomaticPromptPreview().catch((error) => {
                                      pushToast('error', error instanceof Error ? error.message : 'Preview generation failed.');
                                    });
                                  }}
                                />
                              </div>
                            </div>

                            <div className="form-section character-form-section">
                              <div className="form-section-head-row">
                                <div className="form-section-heading">
                                  <h3>Default Expressions</h3>
                                  <p>These are used for the base sprite sheet generation queue.</p>
                                </div>
                                <ActionButton
                                  icon={defaultExpressionsCollapsed ? addIcon : backIcon}
                                  label={defaultExpressionsCollapsed ? 'Show fields' : 'Collapse'}
                                  onClick={() => setDefaultExpressionsCollapsed((current) => !current)}
                                />
                              </div>
                              {!defaultExpressionsCollapsed && characterForm.automaticGeneration.defaultExpressions.length > 0 ? (
                                <div className="autogen-definition-list">
                                  {characterForm.automaticGeneration.defaultExpressions.map((entry) => (
                                    <div
                                      key={`default-expression-${entry.expression}`}
                                      className="autogen-definition-row autogen-default-expression-row"
                                    >
                                      <label>
                                        <FieldLabel icon={triggerIcon}>Expression</FieldLabel>
                                        <input type="text" value={entry.expression} disabled />
                                      </label>
                                      <label>
                                        <FieldLabel icon={descriptionIcon}>Expression prompt</FieldLabel>
                                        <input
                                          type="text"
                                          value={entry.prompt}
                                          placeholder="Expression prompt used in generation"
                                          onKeyDown={stopTextFieldHotkeys}
                                          onChange={(event) =>
                                            updateAutomaticDefaultExpression(entry.expression, { prompt: event.target.value })
                                          }
                                        />
                                      </label>
                                      <label className="settings-row settings-row-toggle">
                                        <span className="settings-row-label">
                                          <span>Queue generation</span>
                                        </span>
                                        <span className="settings-toggle-wrap">
                                          <input
                                            type="checkbox"
                                            className="settings-toggle-input"
                                            checked={entry.enabled !== false}
                                            onChange={(event) =>
                                              updateAutomaticDefaultExpression(entry.expression, {
                                                enabled: event.target.checked,
                                              })
                                            }
                                          />
                                          <span className="settings-toggle" aria-hidden="true" />
                                        </span>
                                      </label>
                                      <div className="row-actions">
                                        <ActionButton
                                          icon={playIcon}
                                          label="Generate Preview"
                                          className="primary-action"
                                          disabled={autogenPreviewBlocked || !normalizeExpressionLabel(entry.expression)}
                                          onClick={() => {
                                            const normalizedExpression = normalizeExpressionLabel(entry.expression);
                                            if (!normalizedExpression) {
                                              return;
                                            }
                                            const previewTask: GenerationTask = {
                                              kind: 'sprite',
                                              label: normalizedExpression,
                                              triggerTag: normalizedExpression,
                                              promptAddition: normalizeDefaultExpressionPrompt(
                                                entry.expression,
                                                entry.prompt || normalizedExpression,
                                              ),
                                              variantNumber: 1,
                                              assetKey: `PREVIEW:${normalizedExpression}`,
                                            };
                                            void generateAutomaticPromptPreviewForTask(previewTask).catch((error) => {
                                              pushToast('error', error instanceof Error ? error.message : 'Preview generation failed.');
                                            });
                                          }}
                                        />
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              ) : defaultExpressionsCollapsed ? (
                                <div className="scene-bgm-status">Fields collapsed.</div>
                              ) : (
                                <div className="empty-state">No default expressions configured.</div>
                              )}
                            </div>

                            <div className="form-section character-form-section">
                              <div className="form-section-head-row">
                                <div className="form-section-heading">
                                  <h3>Custom Expressions</h3>
                                </div>
                                <div className="row-actions">
                                  <ActionButton icon={folderIcon} label="Export JSON" onClick={exportAutomaticCustomExpressionsConfig} />
                                  <input
                                    ref={customExpressionImportInputRef}
                                    type="file"
                                    accept="application/json,.json"
                                    className="file-picker-input settings-hidden-input"
                                    onChange={(event) => {
                                      const file = event.target.files?.[0];
                                      event.currentTarget.value = '';
                                      if (!file) {
                                        return;
                                      }
                                      void runWithBusyState(async () => {
                                        await importAutomaticCustomExpressionsConfigFromFile(file);
                                      }, 'Custom expressions imported.');
                                    }}
                                  />
                                  <ActionButton
                                    icon={uploadIcon}
                                    label="Import JSON"
                                    onClick={() => customExpressionImportInputRef.current?.click()}
                                  />
                                  <ActionButton icon={addIcon} label="Add expression" onClick={addAutomaticCustomExpression} />
                                </div>
                              </div>
                              {characterForm.automaticGeneration.customExpressions.length > 0 ? (
                                <div className="autogen-cg-definition-grid">
                                  {characterForm.automaticGeneration.customExpressions.map((entry, index) => (
                                    <article key={`custom-expression-${index}`} className="autogen-cg-definition-card">
                                      <div className="autogen-cg-definition-card-head">
                                        <span className="autogen-cg-definition-card-index">Expression {index + 1}</span>
                                        <label className="settings-row settings-row-toggle autogen-card-toggle">
                                          <span className="settings-toggle-wrap">
                                            <input
                                              type="checkbox"
                                              className="settings-toggle-input"
                                              checked={entry.enabled !== false}
                                              onChange={(event) =>
                                                updateAutomaticCustomExpression(index, {
                                                  enabled: event.target.checked,
                                                })
                                              }
                                            />
                                            <span className="settings-toggle" aria-hidden="true" />
                                          </span>
                                        </label>
                                      </div>
                                      <button
                                        type="button"
                                        className="autogen-cg-definition-card-main"
                                        onClick={() => setActiveCustomExpressionIndex(index)}
                                      >
                                        <strong>{normalizeExpressionLabel(entry.triggerTag) || 'Untitled Expression'}</strong>
                                        <span>{entry.prompt.trim() || 'No sprite prompt override.'}</span>
                                      </button>
                                    </article>
                                  ))}
                                </div>
                              ) : (
                                <div className="empty-state">No custom expressions yet.</div>
                              )}
                            </div>

                            <div className="form-section character-form-section">
                              <div className="form-section-head-row">
                                <div className="form-section-heading">
                                  <h3>CG Generation Definitions</h3>
                                </div>
                                <div className="row-actions">
                                  <ActionButton icon={folderIcon} label="Export JSON" onClick={exportAutomaticCgDefinitionsConfig} />
                                  <input
                                    id={cgDefinitionImportInputId}
                                    ref={cgDefinitionImportInputRef}
                                    type="file"
                                    accept="application/json,.json"
                                    className="file-picker-input settings-hidden-input"
                                    onChange={(event) => {
                                      const file = event.target.files?.[0];
                                      event.currentTarget.value = '';
                                      if (!file) {
                                        return;
                                      }
                                      void runWithBusyState(async () => {
                                        await importAutomaticCgDefinitionsConfigFromFile(file);
                                      }, 'CG definitions imported.');
                                    }}
                                  />
                                  <ActionButton
                                    icon={uploadIcon}
                                    label="Import JSON"
                                    onClick={() => cgDefinitionImportInputRef.current?.click()}
                                  />
                                </div>
                              </div>
                              {characterForm.automaticGeneration.cgDefinitions.length > 0 ? (
                                <div className="autogen-cg-definition-grid">
                                  {characterForm.automaticGeneration.cgDefinitions.map((entry, index) => (
                                    <article key={`cg-definition-${index}`} className="autogen-cg-definition-card">
                                      <div className="autogen-cg-definition-card-head">
                                        <span className="autogen-cg-definition-card-index">Definition {index + 1}</span>
                                        <label className="settings-row settings-row-toggle autogen-card-toggle">
                                          <span className="settings-toggle-wrap">
                                            <input
                                              type="checkbox"
                                              className="settings-toggle-input"
                                              checked={entry.enabled !== false}
                                              onChange={(event) =>
                                                updateAutomaticCgDefinition(index, {
                                                  enabled: event.target.checked,
                                                })
                                              }
                                            />
                                            <span className="settings-toggle" aria-hidden="true" />
                                          </span>
                                        </label>
                                      </div>
                                      <button
                                        type="button"
                                        className="autogen-cg-definition-card-main"
                                        onClick={() => setActiveCgDefinitionIndex(index)}
                                      >
                                      <strong>{normalizeExpressionLabel(entry.triggerTag) || 'Untitled CG Definition'}</strong>
                                      <span>{entry.prompt.trim() || 'No prompt override.'}</span>
                                      <span className="autogen-cg-definition-card-flags">
                                        {entry.excludeUpperBodyTags ? 'No Upper Body' : 'Upper Body OK'} ·{' '}
                                        {entry.excludeWaistTags ? 'No Waist' : 'Waist OK'} ·{' '}
                                        {entry.excludeLowerBodyTags ? 'No Lower Body' : 'Lower Body OK'}
                                      </span>
                                      </button>
                                    </article>
                                  ))}
                                </div>
                              ) : (
                                <div className="empty-state">No CG definitions yet.</div>
                              )}
                              <div className="row-actions">
                                <ActionButton icon={addIcon} label="Add CG definition" onClick={addAutomaticCgDefinition} />
                              </div>
                            </div>

                            <div className="form-section character-form-section">
                              <div className="form-section-heading">
                                <h3>Generation Run</h3>
                              </div>

                              <label className="settings-row settings-row-toggle">
                                <span className="settings-row-label">
                                  <span>Display generated thumbnails</span>
                                </span>
                                <span className="settings-toggle-wrap">
                                  <input
                                    type="checkbox"
                                    className="settings-toggle-input"
                                    checked={showGeneratedThumbnails}
                                    onChange={(event) => setShowGeneratedThumbnails(event.target.checked)}
                                  />
                                  <span className="settings-toggle" aria-hidden="true" />
                                </span>
                              </label>
                              <label className="settings-row settings-row-toggle">
                                <span className="settings-row-label">
                                  <span>Use facedetailer for sprites</span>
                                </span>
                                <span className="settings-toggle-wrap">
                                  <input
                                    type="checkbox"
                                    className="settings-toggle-input"
                                    checked={useFaceDetailerForSprites}
                                    onChange={(event) => setUseFaceDetailerForSprites(event.target.checked)}
                                  />
                                  <span className="settings-toggle" aria-hidden="true" />
                                </span>
                              </label>

                              <div className="autogen-progress-area">
                                <div className="bottom-progress-copy">
                                  <strong>{generationProgressText || 'Waiting to generate.'}</strong>
                                </div>
                                <div className="bottom-progress-track">
                                  <div
                                    className="bottom-progress-fill"
                                    style={{ width: `${clampNumber(generationProgressValue, 0, 100)}%` }}
                                  />
                                </div>
                              </div>

                              <div className="row-actions">
                                <ActionButton
                                  icon={generationInProgress ? pauseIcon : playIcon}
                                  label={generationInProgress ? (generationStopRequested ? 'Stopping...' : 'Stop') : 'Generate'}
                                  className={generationInProgress ? 'danger' : 'primary-action'}
                                  onClick={() => {
                                    if (generationInProgress) {
                                      stopAutomaticGeneration();
                                      return;
                                    }
                                    const tasks = buildGenerationTasks();
                                    const { spriteAssets, cgAssets } = countExistingAssetsForGenerationTasks(tasks);
                                    const continuationTasks = getContinuationGenerationTasks(tasks);
                                    if (spriteAssets > 0 || cgAssets > 0) {
                                      setPendingGenerationModePrompt({
                                        tasks,
                                        continuationTasks,
                                        existingSpriteAssets: spriteAssets,
                                        existingCgAssets: cgAssets,
                                      });
                                      return;
                                    }
                                    void runWithBusyState(async () => {
                                      await runAutomaticGeneration({ mode: 'replace', tasks });
                                    });
                                  }}
                                  disabled={
                                    generationInProgress
                                      ? generationStopRequested
                                      : comfyGenerationBlocked || comfyGenerationBusy
                                  }
                                />
                              </div>
                              <div className="autogen-time-estimate" aria-live="polite">
                                <strong>Estimated generation time: {generationEstimate.formattedTotal}</strong>
                                <span>
                                  {generationEstimate.totalJobs} total image
                                  {generationEstimate.totalJobs === 1 ? '' : 's'}.
                                  Sprites: {generationEstimate.spriteJobs} ({generationEstimate.formattedSprite}, ~
                                  {generationEstimate.spriteSecondsPerImage}s each
                                  {useFaceDetailerForSprites ? ', facedetailer on' : ', facedetailer off'}). CGs:{' '}
                                  {generationEstimate.cgJobs} ({generationEstimate.formattedCg}, ~
                                  {generationEstimate.cgSecondsPerImage}s each).
                                </span>
                                <div className="autogen-time-chip-list">
                                  {generationEstimate.factorChips.map((chip) => (
                                    <span
                                      key={`${chip.label}-${chip.value}`}
                                      className={`autogen-time-chip is-${chip.tone}`.trim()}
                                    >
                                      {chip.label}: {chip.value}
                                    </span>
                                  ))}
                                </div>
                              </div>

                              {showGeneratedThumbnails && generatedThumbnails.length > 0 ? (
                                <div className="autogen-thumb-grid">
                                  {generatedThumbnails.map((thumbnail, index) => (
                                    <button
                                      key={thumbnail.id}
                                      type="button"
                                      className={`autogen-thumb-item ${
                                        thumbnail.status === 'pending' ? 'is-pending' : thumbnail.status === 'failed' ? 'is-failed' : ''
                                      }`.trim()}
                                      style={
                                        {
                                          animationDelay: `${Math.min(index, 20) * 35}ms`,
                                          '--autogen-thumb-accent-rgb': `${Math.round(thumbnailAccentRgb.red)}, ${Math.round(
                                            thumbnailAccentRgb.green,
                                          )}, ${Math.round(thumbnailAccentRgb.blue)}`,
                                          '--autogen-thumb-accent': characterForm.accentColor,
                                        } as CSSProperties
                                      }
                                      onPointerEnter={(event) => {
                                        if (thumbnail.status !== 'done' || !thumbnail.dataUrl) {
                                          return;
                                        }
                                        setThumbnailHoverPreview({
                                          thumbnail,
                                          x: event.clientX,
                                          y: event.clientY,
                                        });
                                      }}
                                      onPointerMove={(event) => {
                                        if (thumbnail.status !== 'done' || !thumbnail.dataUrl) {
                                          return;
                                        }
                                        setThumbnailHoverPreview({
                                          thumbnail,
                                          x: event.clientX,
                                          y: event.clientY,
                                        });
                                      }}
                                      onPointerLeave={() => setThumbnailHoverPreview(null)}
                                      onPointerCancel={() => setThumbnailHoverPreview(null)}
                                      onBlur={() => setThumbnailHoverPreview(null)}
                                    >
                                      {thumbnail.status === 'done' && thumbnail.dataUrl ? (
                                        <img
                                          src={thumbnail.dataUrl}
                                          alt={`${thumbnail.label} variant ${thumbnail.variantNumber}`}
                                        />
                                      ) : (
                                        <div className="autogen-thumb-placeholder" aria-live="polite">
                                          <span className="sprite-loader-spinner" aria-hidden="true" />
                                          <span>{thumbnail.status === 'failed' ? 'Generation failed' : 'Generating...'}</span>
                                        </div>
                                      )}
                                      <span className="autogen-thumb-meta">
                                        <strong>[{thumbnail.label}]</strong> #{thumbnail.variantNumber}
                                      </span>
                                      <span className="autogen-thumb-kind">{thumbnail.kind}</span>
                                    </button>
                                  ))}
                                </div>
                              ) : null}
                              {showGeneratedThumbnails &&
                              thumbnailHoverPreview &&
                              thumbnailHoverPreview.thumbnail.status === 'done' &&
                              thumbnailHoverPreview.thumbnail.dataUrl &&
                              typeof document !== 'undefined'
                                ? createPortal(
                                    <div
                                      className="autogen-thumb-hover-preview"
                                      style={{
                                        left: thumbnailHoverPreview.x,
                                        top: thumbnailHoverPreview.y - 20,
                                        borderColor: hexToRgba(characterForm.accentColor, 0.42),
                                        boxShadow: `0 22px 42px ${hexToRgba(characterForm.accentColor, 0.24)}`,
                                      }}
                                    >
                                      <img
                                        src={thumbnailHoverPreview.thumbnail.dataUrl}
                                        alt={`${thumbnailHoverPreview.thumbnail.label} enlarged preview`}
                                      />
                                      <span>
                                        [{thumbnailHoverPreview.thumbnail.label}] #{thumbnailHoverPreview.thumbnail.variantNumber}
                                      </span>
                                    </div>,
                                    document.body,
                                  )
                                : null}
                            </div>
                          </div>
                        )}

                        <div className="row-actions character-editor-actions">
                          <IconButton
                            icon={saveIcon}
                            label={characterForm.id ? 'Save character' : 'Create character'}
                            className="primary-action"
                            disabled={busy}
                            onClick={() => {
                              void runWithBusyState(async () => {
                                if (!characterForm.cardName.trim()) {
                                  throw new Error('Character card is required.');
                                }
                                if (!characterForm.name.trim()) {
                                  throw new Error('Character name is required.');
                                }
                                const preparedCustomReactions = characterForm.customReactions
                                  .map((reaction) => {
                                    const triggers = parseReactionTriggersInput(reaction.triggersInput);
                                    const sprites = normalizeAssetVariants(characterForm.sprites[`CUSTOM:${reaction.id}`]);
                                    const depthMaps = normalizeDepthMapVariants(characterForm.spriteDepthMaps[`CUSTOM:${reaction.id}`], sprites.length);
                                    const animationFrames = normalizeSpriteAnimationFrameSet(
                                      characterForm.spriteAnimationFrames[`CUSTOM:${reaction.id}`],
                                      sprites.length,
                                    );
                                    return { name: triggers[0] || '', sprites, depthMaps, animationFrames, triggers };
                                  })
                                  .filter((reaction) => reaction.name);

                                const duplicateReactionNames = new Set<string>();
                                for (const reaction of preparedCustomReactions) {
                                  for (const trigger of reaction.triggers) {
                                    if (duplicateReactionNames.has(trigger)) {
                                      throw new Error(`Duplicate custom reaction trigger: [${trigger}]`);
                                    }
                                    duplicateReactionNames.add(trigger);
                                  }
                                }

                                for (const reaction of preparedCustomReactions) {
                                  if (reaction.sprites.length === 0) {
                                    throw new Error(`Custom reaction [${reaction.name}] needs a sprite.`);
                                  }
                                }

                                const preparedCgs = characterForm.cgs.map((cg) => ({
                                  name: parseReactionTriggersInput(cg.triggersInput)[0] || '',
                                  triggers: parseReactionTriggersInput(cg.triggersInput),
                                  images: normalizeAssetVariants(characterForm.sprites[`CG:${cg.id}`]),
                                }));

                                const cgNames = new Set<string>();
                                for (const cg of preparedCgs) {
                                  if (!cg.name) {
                                    throw new Error('Each CG needs a name.');
                                  }
                                  for (const trigger of cg.triggers) {
                                    const key = trigger.toLowerCase();
                                    if (cgNames.has(key)) {
                                      throw new Error(`Duplicate CG trigger: ${trigger}`);
                                    }
                                    cgNames.add(key);
                                  }
                                  if (cg.images.length === 0) {
                                    throw new Error(`CG "${cg.name}" needs an image.`);
                                  }
                                }

                                startBottomProgress('Saving character...', 12, true);
                                try {
                                  const normalizedAutomaticGeneration = normalizeAutomaticGenerationSettings(
                                    characterForm.automaticGeneration,
                                  );
                                  await onSaveCharacter({
                                    id: characterForm.id,
                                    name: characterForm.name.trim(),
                                    cardName: characterForm.cardName.trim(),
                                    accentColor: characterForm.accentColor,
                                    suggestedAffinityPositiveMaximum: normalizeSuggestedAffinityPositiveMaximum(
                                      characterForm.suggestedAffinityPositiveMaximum,
                                    ),
                                    suggestedAffinityNegativeMaximum: normalizeSuggestedAffinityNegativeMaximum(
                                      characterForm.suggestedAffinityNegativeMaximum,
                                    ),
                                    suggestedLustMaximum: normalizeSuggestedLustMaximum(characterForm.suggestedLustMaximum),
                                    characterNameFontId: characterForm.characterNameFontId || undefined,
                                    characterNameColor: characterForm.characterNameColor || characterForm.accentColor,
                                    blipSound: characterForm.blipSound || undefined,
                                    dialogueQuoteFontId: characterForm.dialogueQuoteFontId || undefined,
                                    dialogueQuoteAnimationPreset: normalizeDialogueQuoteAnimationPreset(
                                      characterForm.dialogueQuoteAnimationPreset,
                                    ),
                                    dialogueQuoteAnimationSpeed: normalizeDialogueQuoteAnimationSpeed(
                                      characterForm.dialogueQuoteAnimationSpeed,
                                    ),
                                    dialogueQuoteAnimationColor: normalizeDialogueQuoteAnimationColor(
                                      characterForm.dialogueQuoteAnimationColor,
                                    ),
                                    sprites: Object.fromEntries(
                                      Object.entries(characterForm.sprites).map(([assetKey, variants]) => [
                                        assetKey,
                                        normalizeAssetVariants(variants),
                                      ]),
                                    ),
                                    spriteDepthMaps: Object.fromEntries(
                                      Object.entries(characterForm.spriteDepthMaps).map(([assetKey, variants]) => [
                                        assetKey,
                                        normalizeDepthMapVariants(
                                          variants,
                                          normalizeAssetVariants(characterForm.sprites[assetKey]).length,
                                        ),
                                      ]),
                                    ),
                                    spriteAnimationFrames: Object.fromEntries(
                                      Object.entries(characterForm.spriteAnimationFrames).map(([assetKey, frames]) => [
                                        assetKey,
                                        normalizeSpriteAnimationFrameSet(
                                          frames,
                                          normalizeAssetVariants(characterForm.sprites[assetKey]).length,
                                        ),
                                      ]),
                                    ),
                                    customReactions: preparedCustomReactions,
                                    spriteZones: Object.fromEntries(
                                      Object.entries(characterForm.spriteZones).filter(([, zones]) => zones.length > 0),
                                    ),
                                    automaticGeneration: normalizedAutomaticGeneration,
                                    cgs: preparedCgs,
                                  });
                                } catch (error) {
                                  finishBottomProgress('Character save failed.', 'error');
                                  throw error;
                                }
                                updateBottomProgress(96, 'Character saved.');
                                setCharacterView('list');
                                resetCharacterForm();
                                finishBottomProgress('Character saved.');
                              }, characterForm.id ? 'Character saved.' : 'Character created.');
                            }}
                          />
                        </div>
                      </div>

                      <aside className="editor-aside">
                        <section className="editor-preview-card">
                          <strong
                            className="character-preview-name"
                            style={{
                              color: characterForm.characterNameColor || characterForm.accentColor,
                              fontFamily: getDialogueQuoteFontFamily(selectedCharacterNameFont.id),
                            }}
                          >
                            {characterForm.name || selectedCard?.name || 'Unnamed character'}
                          </strong>
                          <p>{selectedCard?.description || 'Choose a card to pull in your base persona and then tailor the VN-facing presentation.'}</p>
                        </section>

                        <section className="editor-preview-card accent-picker-card">
                          <FieldLabel icon={colorIcon}>Accent Color</FieldLabel>
                          <ColorPicker
                            value={characterForm.accentColor}
                            onChange={(nextValue) =>
                              setCharacterForm((current) => {
                                const shouldSyncNameColor =
                                  !current.characterNameColor ||
                                  current.characterNameColor.toLowerCase() === current.accentColor.toLowerCase();
                                return {
                                  ...current,
                                  accentColor: nextValue,
                                  characterNameColor: shouldSyncNameColor ? nextValue : current.characterNameColor,
                                };
                              })
                            }
                          />
                        </section>
                      </aside>
                      </fieldset>
                    </div>
                  </>
                )}
              </div>
            </section>
          ) : null}

          {activeTab === 'scenario-creator' ? (
            <section className="menu-card panel-card workspace-panel">
              <div className="view-switch" key={`scenario-${scenarioView}`}>
                {scenarioView === 'list' ? (
                  <>
                    <div className="panel-head panel-head-rich">
                      <div>
                        <h2>Scenarios</h2>
                      </div>
                      <IconButton icon={addIcon} label="Add scenario" className="primary-action" onClick={openNewScenarioEditor} />
                    </div>

                    <div className="scenario-card-grid">
                      {scenarios.map((scenario) => (
                        <article key={scenario.id} className="scenario-wide-card">
                          {renderScenarioCardMedia(scenario)}
                          <div className="card-bottom-gradient" />
                          <div className="card-label card-label-block">
                            <span className="card-kicker">Scenario</span>
                            <strong>{scenario.name}</strong>
                            <span>{characterNameById.get(scenario.characterId) || 'Unknown character'}</span>
                          </div>
                          <div className="card-hover-actions">
                            <IconButton icon={editIcon} label={`Edit ${scenario.name}`} onClick={() => openScenarioEditor(scenario)} />
                            <IconButton
                              icon={deleteIcon}
                              label={`Delete ${scenario.name}`}
                              className="danger"
                              onClick={() =>
                                requestConfirmation({
                                  title: 'Delete scenario?',
                                  description: `Delete "${scenario.name}" and all of its runs?`,
                                  confirmLabel: 'Delete',
                                  successMessage: 'Scenario deleted.',
                                  action: async () => {
                                    await onDeleteScenario(scenario.id);
                                  },
                                })
                              }
                            />
                          </div>
                        </article>
                      ))}
                    </div>

                    {!loading && scenarios.length === 0 ? (
                      <div className="empty-state roomy-empty">No scenarios yet. Add one to start building playable routes.</div>
                    ) : null}
                  </>
                ) : (
                  <>
                    <div className="panel-head panel-head-rich">
                      <div>
                        <h2>{scenarioForm.id ? 'Refine Scenario' : 'Create Scenario'}</h2>
                      </div>
                      <IconButton
                        icon={backIcon}
                        label="Back to scenario list"
                        onClick={() => {
                          setScenarioView('list');
                          resetScenarioForm();
                        }}
                      />
                    </div>

                    <div className="editor-shell">
                      <div className="form-stack roomy-form editor-main">
                        <div className="scenario-identity-grid">
                          <label>
                            <FieldLabel icon={nameIcon}>Name</FieldLabel>
                            <input
                              type="text"
                              value={scenarioForm.name}
                              onChange={(event) =>
                                setScenarioForm((current) => ({
                                  ...current,
                                  name: event.target.value,
                                }))
                              }
                            />
                          </label>

                          <label>
                            <FieldLabel icon={userIcon}>Character</FieldLabel>
                            <select
                              value={scenarioForm.characterId}
                              onChange={(event) =>
                                setScenarioForm((current) => ({
                                  ...current,
                                  characterId: event.target.value,
                                }))
                              }
                            >
                              <option value="">Select character</option>
                              {characters.map((character) => (
                                <option key={character.id} value={character.id}>
                                  {character.name}
                                </option>
                              ))}
                            </select>
                          </label>

                          <label className="scenario-description-field">
                            <FieldLabel icon={descriptionIcon}>Description</FieldLabel>
                            <textarea
                              value={scenarioForm.description}
                              rows={3}
                              onChange={(event) =>
                                setScenarioForm((current) => ({
                                  ...current,
                                  description: event.target.value,
                                }))
                              }
                            />
                          </label>

                          <div className="scenario-description-field form-section">
                            <div className="form-section-head-row">
                              <FieldLabel icon={mapIcon}>Starting Points</FieldLabel>
                              <IconButton
                                icon={addIcon}
                                label="Add starting point"
                                className="secondary-action"
                                disabled={scenarioForm.startingPoints.length >= 5 || scenarioForm.scenes.length === 0}
                                onClick={addScenarioStartingPoint}
                              />
                            </div>
                            {(() => {
                              const startingPoints = normalizeScenarioFormStartingPoints(scenarioForm);
                              const selectedPoint =
                                startingPoints.find((point) => point.id === selectedScenarioStartingPointId) ||
                                startingPoints[0];

                              return (
                                <div className="form-stack">
                                  <div className="settings-tab-bar">
                                    {startingPoints.map((point, pointIndex) => (
                                      <button
                                        key={point.id}
                                        type="button"
                                        className={`settings-tab-button ${
                                          selectedPoint?.id === point.id ? 'is-active' : ''
                                        }`.trim()}
                                        onClick={() => setSelectedScenarioStartingPointId(point.id)}
                                      >
                                        {point.name || `Start ${pointIndex + 1}`}
                                      </button>
                                    ))}
                                  </div>

                                  {selectedPoint ? (
                                    <div className="editor-field-grid character-meta-grid">
                                      <label>
                                        <FieldLabel icon={nameIcon}>Start Name</FieldLabel>
                                        <input
                                          type="text"
                                          value={selectedPoint.name}
                                          onChange={(event) =>
                                            updateScenarioStartingPoint(selectedPoint.id, { name: event.target.value })
                                          }
                                        />
                                      </label>
                                      <label>
                                        <FieldLabel icon={mapIcon}>Starting Map</FieldLabel>
                                        <select
                                          value={selectedPoint.sceneId}
                                          onChange={(event) =>
                                            updateScenarioStartingPoint(selectedPoint.id, { sceneId: event.target.value })
                                          }
                                        >
                                          {scenarioForm.scenes.map((scene, sceneIndex) => (
                                            <option key={scene.id || sceneIndex} value={scene.id || ''}>
                                              {scene.name.trim() || `Scene ${sceneIndex + 1}`}
                                            </option>
                                          ))}
                                        </select>
                                      </label>
                                      <label className="scenario-description-field">
                                        <FieldLabel icon={descriptionIcon}>Starting Message</FieldLabel>
                                        <textarea
                                          value={selectedPoint.startMessage}
                                          rows={5}
                                          placeholder="Write the first assistant message for this starting point."
                                          onKeyDown={stopTextFieldHotkeys}
                                          onChange={(event) =>
                                            updateScenarioStartingPoint(selectedPoint.id, {
                                              startMessage: event.target.value,
                                            })
                                          }
                                        />
                                      </label>
                                      <label className="scenario-description-field">
                                        <FieldLabel icon={descriptionIcon}>Special Instructions</FieldLabel>
                                        <textarea
                                          value={selectedPoint.specialInstructions}
                                          rows={5}
                                          placeholder="Optional instructions used only when this starting point is selected."
                                          onChange={(event) =>
                                            updateScenarioStartingPoint(selectedPoint.id, {
                                              specialInstructions: event.target.value,
                                            })
                                          }
                                        />
                                      </label>
                                      <div className="row-actions">
                                        <IconButton
                                          icon={deleteIcon}
                                          label="Remove starting point"
                                          className="danger"
                                          disabled={startingPoints.length <= 1 || startingPoints[0]?.id === selectedPoint.id}
                                          onClick={() => removeScenarioStartingPoint(selectedPoint.id)}
                                        />
                                      </div>
                                    </div>
                                  ) : null}
                                </div>
                              );
                            })()}
                          </div>

                          <label className="scenario-description-field">
                            <FieldLabel icon={imageIcon}>Scenario Banner</FieldLabel>
                            <div className="scene-asset-actions">
                              <label className="file-picker">
                                <input
                                  type="file"
                                  accept="image/*"
                                  className="file-picker-input"
                                  onChange={(event) => {
                                    const file = event.target.files?.[0];
                                    if (!file) {
                                      return;
                                    }

                                    void runWithBusyState(async () => {
                                      await beginScenarioBannerCrop(file);
                                    });
                                    event.currentTarget.value = '';
                                  }}
                                />
                                <span className="file-picker-button icon-button" data-tooltip="Upload banner">
                                  <IconImage src={uploadIcon} />
                                </span>
                              </label>
                              {scenarioForm.bannerDataUrl ? (
                                <IconButton
                                  icon={deleteIcon}
                                  label="Clear scenario banner"
                                  onClick={() =>
                                    setScenarioForm((current) => ({
                                      ...current,
                                      bannerDataUrl: '',
                                    }))
                                  }
                                />
                              ) : null}
                            </div>
                            {scenarioForm.bannerDataUrl ? (
                              <img src={scenarioForm.bannerDataUrl} alt="Scenario banner preview" className="package-banner-preview" />
                            ) : (
                              <span className="scene-bgm-status">Optional 16:9 banner used by packages and scenario cards.</span>
                            )}
                          </label>
                        </div>

                        <div className="settings-tab-bar character-editor-tab-bar" role="tablist" aria-label="Scenario editor modes">
                          <button
                            type="button"
                            role="tab"
                            aria-selected={scenarioEditorSubTab === 'manual'}
                            className={`settings-tab-button ${scenarioEditorSubTab === 'manual' ? 'is-active' : ''}`.trim()}
                            onClick={() => setScenarioEditorSubTab('manual')}
                          >
                            Manual
                          </button>
                          <button
                            type="button"
                            role="tab"
                            aria-selected={scenarioEditorSubTab === 'automatic'}
                            className={`settings-tab-button ${scenarioEditorSubTab === 'automatic' ? 'is-active' : ''}`.trim()}
                            onClick={() => setScenarioEditorSubTab('automatic')}
                          >
                            Automatic Generation
                          </button>
                        </div>

                        {scenarioEditorSubTab === 'manual' ? (
                        <div className="form-section scenario-scenes-section">
                          <div className="form-section-head-row">
                            <div className="form-section-heading">
                              <h3>Scenes</h3>
                              <p>Add at least one background. Trigger words help the assistant choose the right location during play.</p>
                            </div>
                            <IconButton
                              icon={addIcon}
                              label="Add scene"
                              className="secondary-action"
                              onClick={() =>
                                setScenarioForm((current) => ({
                                  ...current,
                                  scenes: [
                                    ...current.scenes,
                                    {
                                      id: createFormLocalId('scene'),
                                      name: `Scene ${current.scenes.length + 1}`,
                                      backgroundDataUrl: '',
                                      backgroundDepthMapDataUrl: '',
                                      bgmDataUrl: '',
                                      ambientNoiseDataUrl: '',
                                      ambientNoisePresetId: '',
                                      ambientNoiseMuffled: false,
                                      weatherPreset: 'none',
                                      triggerWordsInput: '',
                                    },
                                  ],
                                }))
                              }
                            />
                          </div>
                          <div className="scene-list">
                            {scenarioForm.scenes.map((scene, index) => {
                              const sceneKey = scene.id || `scene-${index}`;
                              const startingPoints = normalizeScenarioFormStartingPoints(scenarioForm);
                              const selectedPoint =
                                startingPoints.find((point) => point.id === selectedScenarioStartingPointId) ||
                                startingPoints[0];
                              const isSelectedStartingMap = selectedPoint?.sceneId === sceneKey;
                              return (
                              <article key={sceneKey} className="scene-editor">
                                <div className="scene-editor-head">
                                  <div className="scene-editor-heading">
                                    <strong>{scene.name.trim() || `Untitled Scene ${index + 1}`}</strong>
                                    {isSelectedStartingMap ? <span className="scene-start-badge">Current tab start</span> : null}
                                  </div>
                                  <IconButton
                                    icon={mapIcon}
                                    label={isSelectedStartingMap ? 'Starting map for current tab' : 'Set as starting map'}
                                    disabled={!selectedPoint || isSelectedStartingMap}
                                    onClick={() => {
                                      if (selectedPoint) {
                                        updateScenarioStartingPoint(selectedPoint.id, { sceneId: sceneKey });
                                      }
                                    }}
                                  />
                                  <IconButton
                                    icon={deleteIcon}
                                    label="Remove scene"
                                    className="danger"
                                    disabled={scenarioForm.scenes.length <= 1}
                                    onClick={() =>
                                      setScenarioForm((current) => {
                                        if (current.scenes.length <= 1) {
                                          return current;
                                        }

                                        const removedSceneId = current.scenes[index]?.id || '';
                                        const scenes = current.scenes.filter((_, entryIndex) => entryIndex !== index);
                                        const startSceneId =
                                          current.startSceneId && current.startSceneId !== removedSceneId
                                            ? current.startSceneId
                                            : scenes[0]?.id || '';
                                        const next = {
                                          ...current,
                                          startSceneId,
                                          scenes,
                                        };
                                        const startingPoints = normalizeScenarioFormStartingPoints(next);
                                        if (!startingPoints.some((point) => point.id === selectedScenarioStartingPointId)) {
                                          setSelectedScenarioStartingPointId(startingPoints[0]?.id || '');
                                        }
                                        return {
                                          ...next,
                                          startingPoints,
                                        };
                                      })
                                    }
                                  />
                                </div>

                                <div className="scene-editor-layout">
                                  <div className="scene-editor-media-block">
                                    <div className="scene-editor-media">
                                      {renderScenarioSceneMedia(
                                        sceneKey,
                                        scene.name || `Scene ${index + 1}`,
                                        scene.backgroundDataUrl,
                                        scene.backgroundDepthMapDataUrl || '',
                                      )}
                                    </div>

                                    <div className="scene-asset-toolbar">
                                      <div className="scene-asset-group">
                                        <div className="scene-asset-meta">
                                          <span className="scene-asset-label">Background</span>
                                          <span className="scene-asset-status">
                                            {scene.backgroundDataUrl ? 'Image ready' : 'Upload required'}
                                          </span>
                                        </div>
                                        <div className="scene-asset-actions">
                                          <label className="file-picker">
                                            <input
                                              type="file"
                                              accept="image/*"
                                              className="file-picker-input"
                                              onChange={(event) => {
                                                const file = event.target.files?.[0];
                                                if (!file) {
                                                  return;
                                                }
                                                void runWithBusyState(async () => {
                                                  await handleScenarioSceneUpload(index, file);
                                                });
                                                event.currentTarget.value = '';
                                              }}
                                            />
                                            <span
                                              className="file-picker-button icon-button"
                                              data-tooltip={scene.backgroundDataUrl ? 'Replace background' : 'Upload background'}
                                            >
                                              <IconImage src={uploadIcon} />
                                            </span>
                                          </label>
                                          {comfyConnectionState === 'online' ? (
                                            <IconButton
                                              icon={resumeIcon}
                                              label="Regenerate"
                                              disabled={
                                                comfyGenerationBusy ||
                                                comfyMissingNodes.length > 0 ||
                                                !scene.backgroundDataUrl ||
                                                !getScenarioPlacePromptForScene(scene.id)
                                              }
                                              onClick={() => {
                                                void regenerateScenarioSceneInManual(scene.id).catch((error) => {
                                                  pushToast(
                                                    'error',
                                                    error instanceof Error ? error.message : 'Scene regeneration failed.',
                                                  );
                                                });
                                              }}
                                            />
                                          ) : null}
                                          {comfyConnectionState === 'online' &&
                                          scene.backgroundDataUrl &&
                                          !scene.backgroundDepthMapDataUrl ? (
                                            <IconButton
                                              icon={imageIcon}
                                              label={
                                                manualDepthGeneratingKey === `scene-depth:${scene.id || index}`
                                                  ? 'Generating depth map...'
                                                  : 'Generate depth map'
                                              }
                                              disabled={comfyGenerationBusy}
                                              onClick={() => {
                                                void generateScenarioSceneDepthMap(index).catch((error) => {
                                                  pushToast(
                                                    'error',
                                                    error instanceof Error ? error.message : 'Depth map generation failed.',
                                                  );
                                                });
                                              }}
                                            />
                                          ) : null}
                                        </div>
                                      </div>

                                      <div className="scene-asset-group">
                                        <div className="scene-asset-meta">
                                          <span className="scene-asset-label">BGM</span>
                                          <span className="scene-asset-status">
                                            {scene.bgmDataUrl ? 'Audio attached' : 'Optional'}
                                          </span>
                                        </div>
                                        <div className="scene-asset-actions">
                                          <label className="file-picker">
                                            <input
                                              type="file"
                                              accept="audio/*"
                                              className="file-picker-input"
                                              onChange={(event) => {
                                                const file = event.target.files?.[0];
                                                if (!file) {
                                                  return;
                                                }
                                                void runWithBusyState(async () => {
                                                  await handleScenarioBgmUpload(index, file);
                                                });
                                                event.currentTarget.value = '';
                                              }}
                                            />
                                            <span
                                              className="file-picker-button icon-button"
                                              data-tooltip={scene.bgmDataUrl ? 'Replace BGM' : 'Upload BGM'}
                                            >
                                              <IconImage src={speakerIcon} />
                                            </span>
                                          </label>
                                          {scene.bgmDataUrl ? (
                                            <IconButton
                                              icon={deleteIcon}
                                              label="Remove BGM"
                                              onClick={() =>
                                                setScenarioForm((current) => ({
                                                  ...current,
                                                  scenes: current.scenes.map((entry, entryIndex) =>
                                                    entryIndex === index ? { ...entry, bgmDataUrl: '' } : entry,
                                                  ),
                                                }))
                                              }
                                            />
                                          ) : null}
                                        </div>
                                      </div>

                                      <div className="scene-asset-group">
                                        <div className="scene-asset-meta">
                                          <span className="scene-asset-label">Ambient noise</span>
                                          <span className="scene-asset-status">
                                            {scene.ambientNoisePresetId || scene.ambientNoiseDataUrl ? 'Audio attached' : 'Optional'}
                                          </span>
                                        </div>
                                        <div className="scene-asset-actions">
                                          <select
                                            className="scene-ambient-select"
                                            value={scene.ambientNoisePresetId || ''}
                                            aria-label={`Ambient noise preset for ${scene.name || `scene ${index + 1}`}`}
                                            onChange={(event) => {
                                              const presetId = event.target.value;
                                              void runWithBusyState(async () => {
                                                await handleScenarioAmbientPresetSelect(index, presetId);
                                              });
                                            }}
                                          >
                                            <option value="">
                                              {scene.ambientNoiseDataUrl ? 'Custom / selected' : 'No ambience'}
                                            </option>
                                            {AMBIENT_PRESET_OPTIONS.map((option) => (
                                              <option key={option.id} value={option.id}>
                                                {option.label}
                                              </option>
                                            ))}
                                          </select>
                                          <label className="file-picker">
                                            <input
                                              type="file"
                                              accept="audio/*"
                                              className="file-picker-input"
                                              onChange={(event) => {
                                                const file = event.target.files?.[0];
                                                if (!file) {
                                                  return;
                                                }
                                                void runWithBusyState(async () => {
                                                  await handleScenarioAmbientUpload(index, file);
                                                });
                                                event.currentTarget.value = '';
                                              }}
                                            />
                                            <span
                                              className="file-picker-button icon-button"
                                              data-tooltip={
                                                scene.ambientNoisePresetId || scene.ambientNoiseDataUrl
                                                  ? 'Replace ambience'
                                                  : 'Upload ambience'
                                              }
                                            >
                                              <IconImage src={speakerIcon} />
                                            </span>
                                          </label>
                                          {scene.ambientNoisePresetId || scene.ambientNoiseDataUrl ? (
                                            <IconButton
                                              icon={deleteIcon}
                                              label="Remove ambient noise"
                                              onClick={() =>
                                                setScenarioForm((current) => ({
                                                  ...current,
                                                  scenes: current.scenes.map((entry, entryIndex) =>
                                                    entryIndex === index
                                                      ? { ...entry, ambientNoiseDataUrl: '', ambientNoisePresetId: '' }
                                                      : entry,
                                                  ),
                                                }))
                                              }
                                            />
                                          ) : null}
                                          <label className="settings-row settings-row-toggle ambient-muffle-toggle">
                                            <span className="settings-row-label">
                                              <span>Muffled</span>
                                            </span>
                                            <span className="settings-toggle-wrap">
                                              <input
                                                type="checkbox"
                                                className="settings-toggle-input"
                                                checked={scene.ambientNoiseMuffled === true}
                                                onChange={(event) =>
                                                  setScenarioForm((current) => ({
                                                    ...current,
                                                    scenes: current.scenes.map((entry, entryIndex) =>
                                                      entryIndex === index
                                                        ? { ...entry, ambientNoiseMuffled: event.target.checked }
                                                        : entry,
                                                    ),
                                                  }))
                                                }
                                              />
                                              <span className="settings-toggle" aria-hidden="true" />
                                            </span>
                                          </label>
                                        </div>
                                      </div>

                                      <div className="scene-asset-group">
                                        <div className="scene-asset-meta">
                                          <span className="scene-asset-label">Weather</span>
                                          <span className="scene-asset-status">
                                            {normalizeSceneWeatherPreset(scene.weatherPreset) === 'none'
                                              ? 'No effect'
                                              : SCENE_WEATHER_PRESET_OPTIONS.find(
                                                  (option) => option.id === normalizeSceneWeatherPreset(scene.weatherPreset),
                                                )?.label || 'Weather effect'}
                                          </span>
                                        </div>
                                        <div className="scene-asset-actions">
                                          <select
                                            className="scene-ambient-select"
                                            value={normalizeSceneWeatherPreset(scene.weatherPreset)}
                                            aria-label={`Weather preset for ${scene.name || `scene ${index + 1}`}`}
                                            onChange={(event) =>
                                              setScenarioForm((current) => ({
                                                ...current,
                                                scenes: current.scenes.map((entry, entryIndex) =>
                                                  entryIndex === index
                                                    ? { ...entry, weatherPreset: normalizeSceneWeatherPreset(event.target.value) }
                                                    : entry,
                                                ),
                                              }))
                                            }
                                          >
                                            {SCENE_WEATHER_PRESET_OPTIONS.map((option) => (
                                              <option key={option.id} value={option.id}>
                                                {option.label}
                                              </option>
                                            ))}
                                          </select>
                                        </div>
                                      </div>
                                    </div>
                                  </div>

                                  <div className="scene-editor-fields">
                                    <label>
                                      <FieldLabel icon={imageIcon}>Scene Name</FieldLabel>
                                      <input
                                        type="text"
                                        value={scene.name}
                                        onChange={(event) =>
                                          setScenarioForm((current) => ({
                                            ...current,
                                            scenes: current.scenes.map((entry, entryIndex) =>
                                              entryIndex === index ? { ...entry, name: event.target.value } : entry,
                                            ),
                                          }))
                                        }
                                      />
                                    </label>

                                    <label>
                                      <FieldLabel icon={triggerIcon}>Trigger Words</FieldLabel>
                                      <input
                                        type="text"
                                        value={scene.triggerWordsInput}
                                        onChange={(event) =>
                                          setScenarioForm((current) => ({
                                            ...current,
                                            scenes: current.scenes.map((entry, entryIndex) =>
                                              entryIndex === index
                                                ? { ...entry, triggerWordsInput: event.target.value }
                                                : entry,
                                            ),
                                          }))
                                        }
                                        placeholder="kitchen, bedroom"
                                      />
                                    </label>

                                    <div className="trigger-words-preview" aria-label="Parsed trigger words">
                                      {parseTriggerWordsInput(scene.triggerWordsInput).length > 0 ? (
                                        parseTriggerWordsInput(scene.triggerWordsInput).map((triggerWord) => (
                                          <span key={`${scene.id || index}-${triggerWord}`} className="trigger-word-chip">
                                            {triggerWord}
                                          </span>
                                        ))
                                      ) : (
                                        <span className="scene-bgm-status">No trigger words yet</span>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              </article>
                            );
                            })}
                          </div>
                        </div>
                        ) : (
                        <>
                          <div className="row-actions scenario-lazy-launch-row">
                            <ActionButton
                              icon={clipboardIcon}
                              label="I'm lazy"
                              className="primary-action scenario-lazy-launch-button"
                              onClick={() => setScenarioLazyPromptOpen(true)}
                            />
                          </div>
                          <div className="form-section character-form-section">
                          <div className="form-section-head-row">
                            <div className="form-section-heading">
                              <h3>Automatic Place Generation</h3>
                              <p>Add places with location name, prompt, and trigger words. Generated images are added to your scenes list.</p>
                            </div>
                            <div className="autogen-connection-status">
                              {comfyConnectionState === 'checking' ? (
                                <span className="sprite-loader-spinner" aria-hidden="true" />
                              ) : null}
                              <span
                                className={`menu-connection-dot ${
                                  comfyConnectionState === 'online'
                                    ? 'is-online'
                                    : comfyConnectionState === 'offline'
                                      ? 'is-offline'
                                      : ''
                                }`.trim()}
                              />
                              <span>
                                {comfyConnectionState === 'checking'
                                  ? 'Checking local ComfyUI...'
                                  : comfyConnectionState === 'online'
                                    ? comfyMissingNodes.length > 0
                                      ? 'ComfyUI connected, but required nodes are missing'
                                      : 'ComfyUI connected'
                                    : comfyConnectionError || 'ComfyUI disconnected'}
                              </span>
                            </div>
                            <div className="row-actions">
                              <ActionButton icon={addIcon} label="Add place" onClick={addScenarioAutoPlace} />
                              <ActionButton icon={folderIcon} label="Export JSON" onClick={exportScenarioAutoPlacePreset} />
                              <input
                                id={scenarioPlacePresetImportInputId}
                                ref={scenarioPlacePresetImportInputRef}
                                type="file"
                                accept="application/json,.json"
                                className="file-picker-input settings-hidden-input"
                                onChange={(event) => {
                                  const file = event.target.files?.[0];
                                  event.currentTarget.value = '';
                                  if (!file) {
                                    return;
                                  }
                                  void runWithBusyState(async () => {
                                    await importScenarioAutoPlacePresetFromFile(file);
                                  }, 'Scene place presets imported.');
                                }}
                              />
                              <ActionButton
                                icon={uploadIcon}
                                label="Import JSON"
                                onClick={() => scenarioPlacePresetImportInputRef.current?.click()}
                              />
                            </div>
                          </div>
                          <div className="editor-field-grid autogen-primary-grid">
                            <label>
                              <FieldLabel icon={nameIcon}>Checkpoint selection</FieldLabel>
                              <select
                                value={characterForm.automaticGeneration.checkpoint}
                                onChange={(event) =>
                                  updateAutomaticGeneration((current) => ({
                                    ...current,
                                    checkpoint: event.target.value,
                                  }))
                                }
                              >
                                <option value="">Select checkpoint</option>
                                {comfyCheckpoints.map((checkpointName) => (
                                  <option key={checkpointName} value={checkpointName}>
                                    {checkpointName}
                                  </option>
                                ))}
                              </select>
                            </label>
                            <label className="settings-row settings-row-toggle">
                              <span className="settings-row-label">
                                <span>Generate Depthmaps</span>
                              </span>
                              <span className="settings-toggle-wrap">
                                <input
                                  className="settings-toggle-input"
                                  type="checkbox"
                                  checked={scenarioGenerateDepthMaps}
                                  onChange={(event) => setScenarioGenerateDepthMaps(event.target.checked)}
                                />
                                <span className="settings-toggle" aria-hidden="true" />
                              </span>
                            </label>
                          </div>

                          {scenarioAutoPlaces.length > 0 ? (
                            <div className="autogen-definition-list">
                              {scenarioAutoPlaces.map((place, index) => (
                                <div key={place.id} className="autogen-definition-row autogen-place-row">
                                  <label>
                                    <FieldLabel icon={nameIcon}>Location Name</FieldLabel>
                                    <input
                                      type="text"
                                      value={place.locationName}
                                      placeholder={`Place ${index + 1}`}
                                      onChange={(event) =>
                                        updateScenarioAutoPlace(place.id, {
                                          locationName: event.target.value,
                                        })
                                      }
                                    />
                                  </label>
                                  <label>
                                    <FieldLabel icon={triggerIcon}>Trigger Words</FieldLabel>
                                    <input
                                      type="text"
                                      value={place.triggerWordsInput}
                                      placeholder="kitchen, backroom, storage"
                                      onChange={(event) =>
                                        updateScenarioAutoPlace(place.id, {
                                          triggerWordsInput: event.target.value,
                                        })
                                      }
                                    />
                                  </label>
                                  <label>
                                    <FieldLabel icon={speakerIcon}>Ambient Noise</FieldLabel>
                                    <select
                                      value={place.ambientNoisePresetId || ''}
                                      onChange={(event) => {
                                        const presetId = event.target.value;
                                        void runWithBusyState(async () => {
                                          await handleScenarioAutoPlaceAmbientPresetSelect(place.id, presetId);
                                        });
                                      }}
                                    >
                                      <option value="">
                                        {place.ambientNoiseDataUrl ? 'Custom / selected' : 'No ambience'}
                                      </option>
                                      {AMBIENT_PRESET_OPTIONS.map((option) => (
                                        <option key={option.id} value={option.id}>
                                          {option.label}
                                        </option>
                                      ))}
                                    </select>
                                  </label>
                                  <div className="scene-asset-actions">
                                    <label className="file-picker">
                                      <input
                                        type="file"
                                        accept="audio/*"
                                        className="file-picker-input"
                                        onChange={(event) => {
                                          const file = event.target.files?.[0];
                                          if (!file) {
                                            return;
                                          }
                                          void runWithBusyState(async () => {
                                            await handleScenarioAutoPlaceAmbientUpload(place.id, file);
                                          });
                                          event.currentTarget.value = '';
                                        }}
                                      />
                                      <span
                                        className="file-picker-button icon-button"
                                        data-tooltip={
                                          place.ambientNoisePresetId || place.ambientNoiseDataUrl
                                            ? 'Replace ambience'
                                            : 'Upload ambience'
                                        }
                                      >
                                        <IconImage src={speakerIcon} />
                                      </span>
                                    </label>
                                    {place.ambientNoisePresetId || place.ambientNoiseDataUrl ? (
                                      <IconButton
                                        icon={deleteIcon}
                                        label="Remove ambient noise"
                                        onClick={() =>
                                          updateScenarioAutoPlace(place.id, {
                                            ambientNoiseDataUrl: '',
                                            ambientNoisePresetId: '',
                                          })
                                        }
                                      />
                                    ) : null}
                                    <label className="settings-row settings-row-toggle ambient-muffle-toggle">
                                      <span className="settings-row-label">
                                        <span>Muffled</span>
                                      </span>
                                      <span className="settings-toggle-wrap">
                                        <input
                                          type="checkbox"
                                          className="settings-toggle-input"
                                          checked={place.ambientNoiseMuffled === true}
                                          onChange={(event) =>
                                            updateScenarioAutoPlace(place.id, {
                                              ambientNoiseMuffled: event.target.checked,
                                            })
                                          }
                                        />
                                        <span className="settings-toggle" aria-hidden="true" />
                                      </span>
                                    </label>
                                  </div>
                                  <IconButton
                                    icon={deleteIcon}
                                    label="Remove place"
                                    className="autogen-place-remove"
                                    onClick={() => removeScenarioAutoPlace(place.id)}
                                  />
                                  <ActionButton
                                    icon={playIcon}
                                    label="Generate Preview"
                                    className="primary-action"
                                    disabled={
                                      autogenPreviewBlocked ||
                                      !place.prompt.trim() ||
                                      comfyConnectionState !== 'online' ||
                                      comfyMissingNodes.length > 0
                                    }
                                    onClick={() => {
                                      void generateScenarioPlacePromptPreview(place).catch((error) => {
                                        pushToast('error', error instanceof Error ? error.message : 'Preview generation failed.');
                                      });
                                    }}
                                  />
                                  <label className="scenario-description-field">
                                    <FieldLabel icon={descriptionIcon}>Prompt</FieldLabel>
                                    <textarea
                                      rows={3}
                                      value={place.prompt}
                                      placeholder="Detailed environment prompt for this location"
                                      onChange={(event) =>
                                        updateScenarioAutoPlace(place.id, {
                                          prompt: event.target.value,
                                        })
                                      }
                                    />
                                  </label>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div className="empty-state">No places added yet.</div>
                          )}

                          {scenarioGeneratedThumbnails.length > 0 ? (
                            <div className="autogen-thumb-grid">
                              {scenarioGeneratedThumbnails.map((thumbnail, index) => (
                                <button
                                  key={thumbnail.id}
                                  type="button"
                                  className={`autogen-thumb-item ${
                                    thumbnail.status === 'pending' ? 'is-pending' : thumbnail.status === 'failed' ? 'is-failed' : ''
                                  }`.trim()}
                                  style={
                                    {
                                      animationDelay: `${Math.min(index, 20) * 35}ms`,
                                      '--autogen-thumb-accent-rgb': `${Math.round(scenarioThumbnailAccentRgb.red)}, ${Math.round(
                                        scenarioThumbnailAccentRgb.green,
                                      )}, ${Math.round(scenarioThumbnailAccentRgb.blue)}`,
                                      '--autogen-thumb-accent': scenarioThumbnailAccentColor,
                                    } as CSSProperties
                                  }
                                  onPointerEnter={(event) => {
                                    if (thumbnail.status !== 'done' || !thumbnail.dataUrl) {
                                      return;
                                    }
                                    setScenarioThumbnailHoverPreview({
                                      thumbnail,
                                      x: event.clientX,
                                      y: event.clientY,
                                    });
                                  }}
                                  onPointerMove={(event) => {
                                    if (thumbnail.status !== 'done' || !thumbnail.dataUrl) {
                                      return;
                                    }
                                    setScenarioThumbnailHoverPreview({
                                      thumbnail,
                                      x: event.clientX,
                                      y: event.clientY,
                                    });
                                  }}
                                  onPointerLeave={() => setScenarioThumbnailHoverPreview(null)}
                                  onPointerCancel={() => setScenarioThumbnailHoverPreview(null)}
                                  onBlur={() => setScenarioThumbnailHoverPreview(null)}
                                >
                                  {thumbnail.status === 'done' && thumbnail.dataUrl ? (
                                    thumbnail.depthMapDataUrl ? (
                                      <DepthParallaxImage
                                        imageSrc={thumbnail.dataUrl}
                                        depthSrc={thumbnail.depthMapDataUrl}
                                        alt={`${thumbnail.label} variant ${thumbnail.variantNumber}`}
                                        settings={{ strength: 20, focus: 100, edgeFill: 0, smearGuard: 15, quality: 'clean' }}
                                        fit="cover"
                                        alphaMode="opaque"
                                      />
                                    ) : (
                                      <img
                                        src={thumbnail.dataUrl}
                                        alt={`${thumbnail.label} variant ${thumbnail.variantNumber}`}
                                      />
                                    )
                                  ) : (
                                    <div className="autogen-thumb-placeholder" aria-live="polite">
                                      <span className="sprite-loader-spinner" aria-hidden="true" />
                                      <span>{thumbnail.status === 'failed' ? 'Generation failed' : 'Generating...'}</span>
                                    </div>
                                  )}
                                  <span className="autogen-thumb-meta">
                                    <strong>[{thumbnail.label}]</strong> #{thumbnail.variantNumber}
                                  </span>
                                </button>
                              ))}
                            </div>
                          ) : null}
                          {scenarioThumbnailHoverPreview &&
                          scenarioThumbnailHoverPreview.thumbnail.status === 'done' &&
                          scenarioThumbnailHoverPreview.thumbnail.dataUrl &&
                          typeof document !== 'undefined'
                            ? createPortal(
                                <div
                                  className="autogen-thumb-hover-preview"
                                  style={{
                                    left: scenarioThumbnailHoverPreview.x,
                                    top: scenarioThumbnailHoverPreview.y - 20,
                                    borderColor: hexToRgba(scenarioThumbnailAccentColor, 0.42),
                                    boxShadow: `0 22px 42px ${hexToRgba(scenarioThumbnailAccentColor, 0.24)}`,
                                  }}
                                >
                                  {scenarioThumbnailHoverPreview.thumbnail.depthMapDataUrl ? (
                                    <DepthParallaxImage
                                      imageSrc={scenarioThumbnailHoverPreview.thumbnail.dataUrl}
                                      depthSrc={scenarioThumbnailHoverPreview.thumbnail.depthMapDataUrl}
                                      alt={`${scenarioThumbnailHoverPreview.thumbnail.label} enlarged preview`}
                                      settings={{ strength: 20, focus: 100, edgeFill: 0, smearGuard: 15, quality: 'clean' }}
                                      fit="cover"
                                      alphaMode="opaque"
                                    />
                                  ) : (
                                    <img
                                      src={scenarioThumbnailHoverPreview.thumbnail.dataUrl}
                                      alt={`${scenarioThumbnailHoverPreview.thumbnail.label} enlarged preview`}
                                    />
                                  )}
                                  <span>
                                    [{scenarioThumbnailHoverPreview.thumbnail.label}] #
                                    {scenarioThumbnailHoverPreview.thumbnail.variantNumber}
                                  </span>
                                </div>,
                                document.body,
                              )
                            : null}

                          <div className="row-actions">
                            <ActionButton
                              icon={scenarioAutoGenerationInProgress ? pauseIcon : playIcon}
                              label={
                                scenarioAutoGenerationInProgress
                                  ? scenarioGenerationStopRequested
                                    ? 'Stopping...'
                                    : 'Stop'
                                  : 'Generate Places'
                              }
                              className={scenarioAutoGenerationInProgress ? 'danger' : 'primary-action'}
                              disabled={
                                scenarioAutoGenerationInProgress
                                  ? scenarioGenerationStopRequested
                                  : comfyGenerationBusy || comfyConnectionState !== 'online' || comfyMissingNodes.length > 0
                              }
                              onClick={() => {
                                if (scenarioAutoGenerationInProgress) {
                                  stopScenarioAutoGeneration();
                                  return;
                                }
                                void generateScenarioPlacesAutomatically().catch((error) => {
                                  pushToast('error', error instanceof Error ? error.message : 'Place generation failed.');
                                });
                              }}
                            />
                          </div>
                          </div>
                        </>
                        )}

                        <div className="row-actions">
                          <IconButton
                            icon={saveIcon}
                            label={scenarioForm.id ? 'Save scenario' : 'Create scenario'}
                            className="primary-action"
                            disabled={busy}
                            onClick={() => {
                              void runWithBusyState(async () => {
                                if (!scenarioForm.name.trim()) {
                                  throw new Error('Scenario name is required.');
                                }
                                if (!scenarioForm.characterId.trim()) {
                                  throw new Error('Scenario character is required.');
                                }
                                if (scenarioForm.scenes.length === 0) {
                                  throw new Error('At least one scene is required.');
                                }
                                for (const scene of scenarioForm.scenes) {
                                  if (!scene.name.trim()) {
                                    throw new Error('Each scene must have a name.');
                                  }
                                  if (!scene.backgroundDataUrl) {
                                    throw new Error('Each scene must have a background image.');
                                  }
                                }
                                const startingPoints = normalizeScenarioFormStartingPoints(scenarioForm);
                                if (startingPoints.length === 0) {
                                  throw new Error('At least one starting point is required.');
                                }
                                const firstStartingPoint = startingPoints[0];
                                if (!firstStartingPoint.startMessage.trim()) {
                                  throw new Error('The first starting point needs a starting message.');
                                }

                                await onSaveScenario({
                                  id: scenarioForm.id,
                                  name: scenarioForm.name.trim(),
                                  description: scenarioForm.description.trim(),
                                  startMessage: firstStartingPoint.startMessage.trim(),
                                  specialInstructions: firstStartingPoint.specialInstructions.trim(),
                                  characterId: scenarioForm.characterId,
                                  bannerDataUrl: scenarioForm.bannerDataUrl || undefined,
                                  startSceneId: firstStartingPoint.sceneId,
                                  startingPoints: startingPoints.map((point) => ({
                                    id: point.id,
                                    name: point.name.trim(),
                                    sceneId: point.sceneId,
                                    startMessage: point.startMessage.trim(),
                                    specialInstructions: point.specialInstructions.trim(),
                                  })),
                                  scenes: scenarioForm.scenes.map((scene) => ({
                                    id: scene.id,
                                    name: scene.name.trim(),
                                    backgroundDataUrl: scene.backgroundDataUrl,
                                    backgroundDepthMapDataUrl: scene.backgroundDepthMapDataUrl || undefined,
                                    bgmDataUrl: scene.bgmDataUrl?.trim() || undefined,
                                    ambientNoiseDataUrl: scene.ambientNoisePresetId
                                      ? undefined
                                      : scene.ambientNoiseDataUrl?.trim() || undefined,
                                    ambientNoisePresetId: scene.ambientNoisePresetId?.trim() || undefined,
                                    ambientNoiseMuffled: scene.ambientNoiseMuffled === true,
                                    weatherPreset: normalizeSceneWeatherPreset(scene.weatherPreset),
                                    triggerWords: parseTriggerWordsInput(scene.triggerWordsInput),
                                  })),
                                });
                                setScenarioView('list');
                                resetScenarioForm();
                              }, scenarioForm.id ? 'Scenario saved.' : 'Scenario created.');
                            }}
                          />
                        </div>
                      </div>

                      <aside className="editor-aside scenario-editor-aside">
                        <section className="scenario-character-spotlight">
                          <div className="scenario-character-thumbnail">
                            {getFirstAssetVariant(selectedScenarioCharacter?.sprites.DEFAULT) || selectedScenarioCard?.avatar ? (
                              <img
                                src={getFirstAssetVariant(selectedScenarioCharacter?.sprites.DEFAULT) || selectedScenarioCard?.avatar}
                                alt={selectedScenarioCharacter?.name || 'Selected character'}
                              />
                            ) : (
                              <div className="scenario-character-empty">
                                <strong>No character art</strong>
                                <span>Select a character with a default sprite to preview them here.</span>
                              </div>
                            )}
                            <div className="scenario-character-overlay">
                              <strong>{selectedScenarioCharacter?.name || 'No character selected'}</strong>
                              <span>{selectedScenarioCharacter?.cardName || 'Choose a studio character for this scenario'}</span>
                            </div>
                          </div>
                          <p>
                            {scenarioForm.description ||
                              'Scenarios inherit this lead character for casting, dialogue framing, and session startup.'}
                          </p>
                        </section>
                      </aside>
                    </div>
                  </>
                )}
              </div>
            </section>
          ) : null}

          {activeTab === 'packages' ? (
            <section className="menu-card panel-card workspace-panel">
              <div className="view-switch" key="packages">
                <div className="panel-head panel-head-rich">
                  <div>
                    <h2>Packages</h2>
                  </div>
                </div>

                <div className="editor-shell">
                  <div className="form-stack roomy-form editor-main">
                    <div className="form-section character-form-section">
                      <div className="form-section-heading">
                        <h3>Create Package</h3>
                        <p>Choose one scenario. Its linked character folder, scenario folder, and SillyTavern character card will be bundled into one ZIP file.</p>
                      </div>

                      <label>
                        <FieldLabel icon={descriptionIcon}>Scenario</FieldLabel>
                        <select
                          value={selectedPackageScenarioId}
                          onChange={(event) => selectPackageScenario(event.target.value)}
                        >
                          <option value="">Select a scenario</option>
                          {scenarios.map((scenario) => (
                            <option key={scenario.id} value={scenario.id}>
                              {scenario.name}
                            </option>
                          ))}
                        </select>
                      </label>

                      <label>
                        <FieldLabel icon={nameIcon}>Package Name</FieldLabel>
                        <input
                          type="text"
                          value={packageNameInput}
                          placeholder="My Scenario Package"
                          onChange={(event) => setPackageNameInput(event.target.value)}
                        />
                      </label>

                      <div className="row-actions character-editor-actions">
                        <ActionButton
                          icon={saveIcon}
                          label={packageCreating ? 'Creating package...' : 'Create package'}
                          className="primary-action"
                          disabled={!selectedPackageScenarioId || packageCreating}
                          onClick={() => {
                            void (async () => {
                              if (!selectedPackageScenarioId || packageCreating) {
                                pushToast('error', 'Select a scenario first.');
                                return;
                              }

                              setPackageCreating(true);
                              try {
                                await waitForNextPaint();
                                await onCreatePackage(selectedPackageScenarioId, {
                                  packageName: packageNameInput.trim() || undefined,
                                });
                                pushToast('success', 'Package created.');
                              } catch (error) {
                                pushToast('error', error instanceof Error ? error.message : 'Package creation failed.');
                              } finally {
                                setPackageCreating(false);
                              }
                            })();
                          }}
                        >
                          {packageCreating ? (
                            <>
                              <span className="button-loader-spinner" aria-hidden="true" />
                              <span>Creating package...</span>
                            </>
                          ) : (
                            'Create package'
                          )}
                        </ActionButton>
                      </div>
                    </div>

                    <div className="form-section character-form-section">
                      <div className="form-section-heading">
                        <h3>Import Package</h3>
                        <p>Import a package ZIP, unpack its Pettangatari content, and add its character card to the connected SillyTavern install.</p>
                      </div>

                      <label className="file-picker">
                        <input
                          type="file"
                          accept=".zip,application/zip,application/x-zip-compressed,application/octet-stream"
                          className="file-picker-input"
                          onChange={(event) => {
                            const file = event.target.files?.[0];
                            if (!file) {
                              return;
                            }
                            event.currentTarget.value = '';

                            void (async () => {
                              startBottomProgress('Importing package...', 12, true);
                              try {
                                await waitForNextPaint();
                                const packageData = await readFileAsDataUrl(file);
                                updateBottomProgress(44, 'Uploading package...');
                                await waitForNextPaint();
                                await onImportPackage(file.name, packageData);
                                updateBottomProgress(96, 'Package imported.');
                                finishBottomProgress('Package imported.');
                                pushToast('success', 'Package imported.');
                              } catch (error) {
                                finishBottomProgress('Package import failed.', 'error');
                                pushToast('error', error instanceof Error ? error.message : 'Package import failed.');
                              }
                            })();
                          }}
                        />
                        <span className="action-button primary-action">
                          <IconImage src={uploadIcon} />
                          <span>Import ZIP package</span>
                        </span>
                      </label>
                    </div>

                    <div className="scenario-card-grid">
                      {packages.map((entry) => (
                        <article
                          key={entry.id}
                          className={`scenario-wide-card package-card selectable-run-card ${deletingPackageIds.has(entry.id) ? 'is-deleting' : ''}`.trim()}
                        >
                          {renderPackageCardMedia(entry)}
                          {deletingPackageIds.has(entry.id) ? (
                            <div className="package-card-delete-overlay" aria-live="polite">
                              <span className="sprite-loader-spinner" aria-hidden="true" />
                              <span>Deleting package...</span>
                            </div>
                          ) : null}
                          <div className="card-bottom-gradient" />
                          <div className="card-label card-label-block">
                            <strong>{entry.name}</strong>
                          </div>
                          <div className="card-hover-actions">
                            {scenarioNameById.get(entry.scenarioId) ? (
                              <IconButton
                                icon={playIcon}
                                label={`Play ${entry.name}`}
                                disabled={!isSillyTavernOnline || deletingPackageIds.has(entry.id)}
                                onClick={() => {
                                  const scenario = scenarioById.get(entry.scenarioId);
                                  if (scenario) {
                                    requestRunStart(scenario);
                                  }
                                }}
                              />
                            ) : null}
                            <IconButton
                              icon={folderIcon}
                              label={`Show ${entry.name} in Explorer`}
                              disabled={deletingPackageIds.has(entry.id)}
                              onClick={() => {
                                void runWithBusyState(async () => {
                                  await onRevealPackage(entry.id);
                                }, 'Opened package location.');
                              }}
                            />
                            <IconButton
                              icon={deleteIcon}
                              label={`Delete ${entry.name}`}
                              className="danger"
                              disabled={deletingPackageIds.has(entry.id)}
                              onClick={() => {
                                setPackageDeleteOptions({
                                  deleteCharacters: true,
                                  deleteScenarios: true,
                                });
                                requestConfirmation({
                                  title: 'Delete package?',
                                  description: `Delete "${entry.name}" from this PC?`,
                                  confirmLabel: 'Delete',
                                  successMessage: 'Package deleted.',
                                  variant: 'package-delete',
                                  action: async () => {
                                    setDeletingPackageIds((current) => {
                                      const next = new Set(current);
                                      next.add(entry.id);
                                      return next;
                                    });
                                    try {
                                      await onDeletePackage(entry.id, packageDeleteOptionsRef.current);
                                    } finally {
                                      setDeletingPackageIds((current) => {
                                        if (!current.has(entry.id)) {
                                          return current;
                                        }
                                        const next = new Set(current);
                                        next.delete(entry.id);
                                        return next;
                                      });
                                    }
                                  },
                                });
                              }}
                            />
                          </div>
                        </article>
                      ))}
                    </div>

                    {!loading && packages.length === 0 ? (
                      <div className="empty-state roomy-empty">No packages yet. Create one from a scenario or import a ZIP package.</div>
                    ) : null}
                  </div>
                </div>
              </div>
            </section>
          ) : null}

          {activeTab === 'play' ? (
            <section className="menu-card panel-card workspace-panel">
              <div className="view-switch" key={`play-${playView}`}>
                {playView === 'list' ? (
                  <>
                    <div className="panel-head panel-head-rich">
                      <div>
                        <h2>Play</h2>
                      </div>
                      <div className="row-actions play-top-actions">
                        <label className="toggle-row play-mass-delete-toggle">
                          <span>Mass deletion</span>
                          <span className="settings-toggle-wrap">
                            <input
                              type="checkbox"
                              className="settings-toggle-input"
                              checked={runMassDeletionEnabled}
                              onChange={(event) => toggleRunMassDeletion(event.target.checked)}
                            />
                            <span className="settings-toggle" aria-hidden="true" />
                          </span>
                        </label>
                        {runMassDeletionEnabled ? (
                          <IconButton
                            icon={deleteIcon}
                            label={`Delete ${selectedRunIdsForDeletion.size} selected`}
                            className="danger"
                            disabled={selectedRunIdsForDeletion.size === 0}
                            onClick={requestDeleteSelectedRuns}
                          />
                        ) : null}
                        <IconButton
                          icon={playIcon}
                          label="Start new run"
                          className="primary-action"
                          disabled={!isSillyTavernOnline}
                          onClick={() => setPlayView('new-run')}
                        />
                      </div>
                    </div>

                    <div className="scenario-card-grid run-card-grid">
                      {runs.map((run) => {
                        const runScenario = scenarioById.get(run.scenarioId);
                        const isDeletingRun = deletingRunIds.has(run.id);
                        const isSelectedForDeletion = selectedRunIdsForDeletion.has(run.id);

                        return (
                          <article
                            key={run.id}
                            className={`scenario-wide-card run-session-card ${
                              isDeletingRun ? 'is-deleting' : ''
                            } ${runMassDeletionEnabled ? 'is-selection-mode' : ''} ${
                              isSelectedForDeletion ? 'is-selected-for-deletion' : ''
                            }`.trim()}
                            role={runMassDeletionEnabled ? 'button' : undefined}
                            tabIndex={runMassDeletionEnabled && !isDeletingRun ? 0 : undefined}
                            aria-pressed={runMassDeletionEnabled ? isSelectedForDeletion : undefined}
                            onClick={() => {
                              if (!runMassDeletionEnabled || isDeletingRun) {
                                return;
                              }
                              toggleRunDeletionSelection(run.id);
                            }}
                            onKeyDown={(event) => {
                              if (!runMassDeletionEnabled || isDeletingRun) {
                                return;
                              }
                              if (event.key !== 'Enter' && event.key !== ' ') {
                                return;
                              }
                              event.preventDefault();
                              toggleRunDeletionSelection(run.id);
                            }}
                          >
                            {runScenario ? renderScenarioCardMedia(runScenario) : <div className="card-cover-empty">Scenario missing</div>}
                            {runMassDeletionEnabled ? (
                              <div className="run-selection-indicator" aria-hidden="true">
                                <span>{isSelectedForDeletion ? 'Selected' : 'Select'}</span>
                              </div>
                            ) : null}
                            {isDeletingRun ? (
                              <div className="run-item-delete-overlay" aria-live="polite">
                                <span className="sprite-loader-spinner" aria-hidden="true" />
                                <span>Deleting session...</span>
                              </div>
                            ) : null}
                            <div className="card-bottom-gradient" />
                            <div className="card-label card-label-block run-copy">
                              <span className="card-kicker">Saved session</span>
                              <strong>{run.title}</strong>
                              <span>{scenarioNameById.get(run.scenarioId) || 'Unknown scenario'}</span>
                              <span>{formatTimestamp(run.updatedAt)}</span>
                            </div>
                            {!runMassDeletionEnabled ? (
                              <div className="card-hover-actions run-actions">
                                <IconButton
                                  icon={resumeIcon}
                                  label={`Resume ${run.title}`}
                                  disabled={!isSillyTavernOnline || isDeletingRun}
                                  onClick={() => {
                                    void runWithBusyState(async () => {
                                      await onResumeRun(run.id);
                                    });
                                  }}
                                />
                                <IconButton
                                  icon={playIcon}
                                  label={`Replay ${run.title}`}
                                  disabled={isDeletingRun || run.messages.length === 0}
                                  onClick={() => {
                                    void runWithBusyState(async () => {
                                      await onReplayRun(run.id);
                                    });
                                  }}
                                />
                                <IconButton
                                  icon={deleteIcon}
                                  label={`Delete ${run.title}`}
                                  className="danger"
                                  disabled={isDeletingRun}
                                  onClick={() =>
                                    requestConfirmation({
                                      title: 'Delete run?',
                                      description: `Delete the saved run "${run.title}"?`,
                                      confirmLabel: 'Delete',
                                      successMessage: 'Run deleted.',
                                      action: async () => {
                                        setDeletingRunIds((current) => {
                                          const next = new Set(current);
                                          next.add(run.id);
                                          return next;
                                        });
                                        try {
                                          await onDeleteRun(run.id);
                                        } finally {
                                          setDeletingRunIds((current) => {
                                            if (!current.has(run.id)) {
                                              return current;
                                            }
                                            const next = new Set(current);
                                            next.delete(run.id);
                                            return next;
                                          });
                                        }
                                      },
                                    })
                                  }
                                />
                              </div>
                            ) : null}
                          </article>
                        );
                      })}
                    </div>
                    {!loading && runs.length === 0 ? (
                      <div className="empty-state roomy-empty">No runs yet. Launch a scenario to create your first playable session.</div>
                    ) : null}
                  </>
                ) : (
                  <>
                    <div className="panel-head panel-head-rich">
                      <div>
                        <h2>Start New Run</h2>
                        <p>Choose a scenario and drop straight into the first scene with its linked character and opening setup.</p>
                      </div>
                      <IconButton icon={backIcon} label="Back to runs" onClick={() => setPlayView('list')} />
                    </div>

                    <div className="scenario-card-grid">
                      {scenarios.map((scenario) => {
                        const startingPoints = getScenarioStartingPoints(scenario);
                        return (
                        <article key={scenario.id} className="scenario-wide-card selectable-run-card">
                          {renderScenarioCardMedia(scenario)}
                          <div className="card-bottom-gradient" />
                          <div className="card-label card-label-block">
                            <span className="card-kicker">Ready to play</span>
                            <strong>{scenario.name}</strong>
                            <span>{characterNameById.get(scenario.characterId) || 'Unknown character'}</span>
                            {startingPoints.length > 1 ? <span>Multiple starting points available</span> : null}
                          </div>
                          <div className="card-hover-actions">
                            <IconButton
                              icon={playIcon}
                              label={`Start ${scenario.name}`}
                              className="primary-action"
                              disabled={!isSillyTavernOnline}
                              onClick={() => requestRunStart(scenario)}
                            />
                          </div>
                        </article>
                        );
                      })}
                    </div>
                    {!loading && scenarios.length === 0 ? (
                      <div className="empty-state roomy-empty">
                        No scenarios available. Create one in One-shot Scenarios first.
                      </div>
                    ) : null}
                  </>
                )}
              </div>
            </section>
          ) : null}
        </section>
      </section>

      {autogenPromptPreviewAnchoredVisible ? (
        <div className="autogen-prompt-preview-anchor">
          <div className="editor-preview-card autogen-prompt-preview-card autogen-prompt-preview-card-floating">
            <div className="autogen-prompt-preview-head">
              <IconButton
                icon={closeIcon}
                label="Close prompt preview"
                className="autogen-prompt-preview-close"
                onClick={() => setAutogenPromptPreviewDismissed(true)}
              />
            </div>
            <div
              className={`autogen-prompt-preview-media ${
                autogenPromptPreviewKind === 'cg' ? 'autogen-prompt-preview-media-cg' : ''
              }`.trim()}
            >
              {autogenPreviewGenerating ? (
                <div className="sprite-thumb-loader" aria-live="polite">
                  <span className="sprite-loader-spinner" aria-hidden="true" />
                  <span>Generating [{autogenPromptPreviewLabel}] preview...</span>
                </div>
              ) : autogenPromptPreviewDataUrl ? (
                autogenPromptPreviewDepthMapDataUrl && autogenPromptPreviewKind === 'cg' ? (
                  <DepthParallaxImage
                    imageSrc={autogenPromptPreviewDataUrl}
                    depthSrc={autogenPromptPreviewDepthMapDataUrl}
                    alt={`[${autogenPromptPreviewLabel}] prompt preview`}
                    settings={{ strength: 20, focus: 100, edgeFill: 0, smearGuard: 15, quality: 'clean' }}
                    fit="cover"
                    alphaMode="opaque"
                  />
                ) : (
                  <img src={autogenPromptPreviewDataUrl} alt={`[${autogenPromptPreviewLabel}] prompt preview`} />
                )
              ) : null}
              {!autogenPreviewGenerating && autogenPromptPreviewDepthGenerating ? (
                <div className="autogen-prompt-preview-depth-status" aria-live="polite">
                  <span className="sprite-loader-spinner" aria-hidden="true" />
                  <span>Generating depth map...</span>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      <div className="menu-connection-anchor" ref={connectionPanelRef}>
        {connectionPanelOpen ? (
          <section className="menu-connection-panel" aria-label="SillyTavern connection">
            <div className="menu-connection-panel-head">
              <div>
                <strong>SillyTavern</strong>
                <p>{sillyTavernConnection.online ? 'Connected and ready.' : sillyTavernConnection.error || 'Currently offline.'}</p>
              </div>
              <span
                className={`menu-connection-dot ${sillyTavernConnection.online ? 'is-online' : 'is-offline'}`.trim()}
                aria-hidden="true"
              />
            </div>

            <form className="form-stack menu-connection-form" onSubmit={(event) => void submitSillyTavernConnection(event)}>
              <label>
                <span>API address</span>
                <input
                  type="text"
                  value={connectionAddressDraft}
                  onChange={(event) => setConnectionAddressDraft(event.target.value)}
                  placeholder="http://127.0.0.1:8000"
                  autoFocus
                />
              </label>

              <div className="menu-connection-actions">
                <button type="submit" className="primary-action" disabled={connectionBusy}>
                  {connectionBusy ? 'Connecting...' : 'Save'}
                </button>
                <button
                  type="button"
                  className="secondary-action"
                  disabled={connectionBusy}
                  onClick={() => {
                    setConnectionAddressDraft(sillyTavernConnection.baseUrl);
                    setConnectionPanelOpen(false);
                  }}
                >
                  Cancel
                </button>
              </div>
            </form>
          </section>
        ) : null}

        <button
          type="button"
          className="menu-connection-button"
          data-tooltip={`SillyTavern ${sillyTavernConnection.online ? 'online' : 'offline'}`}
          onClick={() => {
            setConnectionAddressDraft(sillyTavernConnection.baseUrl);
            setConnectionPanelOpen((current) => !current);
          }}
        >
          <span
            className={`menu-connection-dot ${sillyTavernConnection.online ? 'is-online' : 'is-offline'}`.trim()}
            aria-hidden="true"
          />
          <span className="menu-connection-copy">
            <strong>SillyTavern</strong>
            <small>{sillyTavernConnection.online ? 'Online' : 'Offline'}</small>
          </span>
        </button>
      </div>

      {pendingGenerationModePrompt ? (
        <div className="confirm-overlay" role="dialog" aria-modal="true" aria-label="Generation mode">
          <section className="confirm-dialog">
            <div className="confirm-dialog-copy">
              <h3>Existing Assets Detected</h3>
              <p>
                Found existing assets for this run
                {pendingGenerationModePrompt.existingSpriteAssets > 0
                  ? ` (${pendingGenerationModePrompt.existingSpriteAssets} sprite set${
                      pendingGenerationModePrompt.existingSpriteAssets === 1 ? '' : 's'
                    }`
                  : ''}
                {pendingGenerationModePrompt.existingSpriteAssets > 0 && pendingGenerationModePrompt.existingCgAssets > 0
                  ? ', '
                  : ''}
                {pendingGenerationModePrompt.existingCgAssets > 0
                  ? `${pendingGenerationModePrompt.existingCgAssets} CG set${
                      pendingGenerationModePrompt.existingCgAssets === 1 ? '' : 's'
                    })`
                  : pendingGenerationModePrompt.existingSpriteAssets > 0
                    ? ')'
                    : ''}
                . Choose how generation should apply.
              </p>
              {pendingGenerationModePrompt.continuationTasks.length > 0 ? (
                <p>
                  Continue where you left off will keep existing images and generate the remaining{' '}
                  {pendingGenerationModePrompt.continuationTasks.length} missing slot
                  {pendingGenerationModePrompt.continuationTasks.length === 1 ? '' : 's'}.
                </p>
              ) : (
                <p>All configured slots already have images, so there is nothing missing to continue.</p>
              )}
            </div>
            <div className="row-actions confirm-actions">
              <IconButton icon={backIcon} label="Cancel" onClick={() => setPendingGenerationModePrompt(null)} />
              <ActionButton
                icon={playIcon}
                label="Continue Where Left Off"
                disabled={pendingGenerationModePrompt.continuationTasks.length === 0}
                onClick={() => {
                  const promptState = pendingGenerationModePrompt;
                  setPendingGenerationModePrompt(null);
                  if (!promptState || promptState.continuationTasks.length === 0) {
                    return;
                  }
                  void runWithBusyState(async () => {
                    await runAutomaticGeneration({ mode: 'replace', tasks: promptState.continuationTasks });
                  });
                }}
              />
              <ActionButton
                icon={duplicateIcon}
                label="Add As Variants"
                onClick={() => {
                  const promptState = pendingGenerationModePrompt;
                  setPendingGenerationModePrompt(null);
                  if (!promptState) {
                    return;
                  }
                  void runWithBusyState(async () => {
                    await runAutomaticGeneration({ mode: 'append', tasks: promptState.tasks });
                  });
                }}
              />
              <button
                type="button"
                className="danger"
                onClick={() => {
                  const promptState = pendingGenerationModePrompt;
                  setPendingGenerationModePrompt(null);
                  if (!promptState) {
                    return;
                  }
                  void runWithBusyState(async () => {
                    await runAutomaticGeneration({ mode: 'replace', tasks: promptState.tasks });
                  });
                }}
              >
                Replace Existing
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {manualGenerationDialog ? (
        <div className="confirm-overlay" role="dialog" aria-modal="true" aria-label="Manual generation options">
          <section className="confirm-dialog">
            <div className="confirm-dialog-copy">
              <h3>
                {manualGenerationDialog.mode === 'generate-new' ? 'Generate New' : 'Regenerate'} [
                {getManualGenerationLabelForAsset(manualGenerationDialog.assetKey)}] #
                {manualGenerationDialog.variantIndex + 1}
              </h3>
              <p>Uses the same prompt structure and model settings as Automatic Generation.</p>
              {getManualGenerationPromptError(manualGenerationDialog.assetKey) ? (
                <p className="menu-error">{getManualGenerationPromptError(manualGenerationDialog.assetKey)}</p>
              ) : null}
              <label className="settings-row settings-row-toggle confirm-toggle-row">
                <span className="settings-row-label">
                  <span>Generate Depthmap</span>
                </span>
                <span className="settings-toggle-wrap">
                  <input
                    className="settings-toggle-input"
                    type="checkbox"
                    checked={characterForm.automaticGeneration.generateDepthMaps}
                    onChange={(event) =>
                      updateAutomaticGeneration((current) => ({
                        ...current,
                        generateDepthMaps: event.target.checked,
                      }))
                    }
                  />
                  <span className="settings-toggle" aria-hidden="true" />
                </span>
              </label>
              {buildGenerationTaskForAsset(
                manualGenerationDialog.assetKey,
                manualGenerationDialog.variantIndex + 1,
              )?.kind === 'sprite' ? (
                <label className="settings-row settings-row-toggle confirm-toggle-row">
                  <span className="settings-row-label">
                    <span>Generate mouth animation (experimental)</span>
                  </span>
                  <span className="settings-toggle-wrap">
                    <input
                      className="settings-toggle-input"
                      type="checkbox"
                      checked={manualGenerationDialog.generateMouthAnimations}
                      onChange={(event) => {
                        if (event.target.checked) {
                          requestGenerateMouthAnimationsEnabled('manual');
                          return;
                        }
                        setManualGenerationDialog((current) =>
                          current
                            ? {
                                ...current,
                                generateMouthAnimations: false,
                              }
                            : current,
                        );
                      }}
                    />
                    <span className="settings-toggle" aria-hidden="true" />
                  </span>
                </label>
              ) : null}
              <label className="settings-row settings-row-toggle confirm-toggle-row">
                <span className="settings-row-label">
                  <span>Use facedetailer</span>
                </span>
                <span className="settings-toggle-wrap">
                  <input
                    className="settings-toggle-input"
                    type="checkbox"
                    checked={useFaceDetailerForSprites}
                    onChange={(event) => setUseFaceDetailerForSprites(event.target.checked)}
                  />
                  <span className="settings-toggle" aria-hidden="true" />
                </span>
              </label>
            </div>
            <div className="row-actions confirm-actions">
              <IconButton
                icon={backIcon}
                label="Cancel"
                onClick={() => setManualGenerationDialog(null)}
                disabled={Boolean(manualRegeneratingSlotKey)}
              />
              <ActionButton
                icon={manualGenerationDialog.mode === 'generate-new' ? playIcon : resumeIcon}
                label={manualGenerationDialog.mode === 'generate-new' ? 'Generate New' : 'Regenerate'}
                className="primary-action"
                disabled={
                  Boolean(manualRegeneratingSlotKey) ||
                  comfyGenerationBusy ||
                  comfyGenerationBlocked ||
                  Boolean(getManualGenerationPromptError(manualGenerationDialog.assetKey))
                }
                onClick={submitManualGenerationDialog}
              />
            </div>
          </section>
        </div>
      ) : null}

      {mouthAnimationWarningDialog ? (
        <div className="confirm-overlay" role="dialog" aria-modal="true" aria-label="Mouth animation warning">
          <section className="confirm-dialog">
            <div className="confirm-dialog-copy">
              <h3>Generate Mouth Animation</h3>
              <p>This will drastically increase sprite generation times.</p>
              <p>Expect roughly 180 seconds per sprite when mouth animation generation is enabled.</p>
              <label className="settings-row settings-row-toggle confirm-toggle-row">
                <span className="settings-row-label">
                  <span>Do not show this again</span>
                </span>
                <span className="settings-toggle-wrap">
                  <input
                    className="settings-toggle-input"
                    type="checkbox"
                    checked={mouthAnimationWarningDialog.doNotShowAgain}
                    onChange={(event) =>
                      setMouthAnimationWarningDialog((current) =>
                        current
                          ? {
                              ...current,
                              doNotShowAgain: event.target.checked,
                            }
                          : current,
                      )
                    }
                  />
                  <span className="settings-toggle" aria-hidden="true" />
                </span>
              </label>
            </div>
            <div className="row-actions confirm-actions">
              <IconButton
                icon={backIcon}
                label="Cancel"
                onClick={() => setMouthAnimationWarningDialog(null)}
              />
              <ActionButton
                icon={alertTriangleIcon}
                label="Enable anyway"
                className="primary-action"
                onClick={() => {
                  if (mouthAnimationWarningDialog.doNotShowAgain) {
                    setHideMouthAnimationWarning(true);
                  }
                  applyGenerateMouthAnimationsEnabled(mouthAnimationWarningDialog.target);
                  setMouthAnimationWarningDialog(null);
                }}
              />
            </div>
          </section>
        </div>
      ) : null}

      {activeCustomExpression && activeCustomExpressionIndex !== null ? (
        <div
          className="confirm-overlay"
          role="dialog"
          aria-modal="true"
          aria-label={`Custom Expression ${activeCustomExpressionIndex + 1}`}
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              setActiveCustomExpressionIndex(null);
            }
          }}
        >
          <section className="confirm-dialog autogen-cg-definition-dialog">
            <div className="confirm-dialog-copy">
              <h3>Custom Expression #{activeCustomExpressionIndex + 1}</h3>
              <label>
                <FieldLabel icon={triggerIcon}>Trigger tag</FieldLabel>
                <input
                  type="text"
                  value={activeCustomExpression.triggerTag}
                  placeholder="TURN AROUND"
                  onChange={(event) =>
                    updateAutomaticCustomExpression(activeCustomExpressionIndex, {
                      triggerTag: event.target.value,
                    })
                  }
                />
              </label>
              <label>
                <FieldLabel icon={descriptionIcon}>Sprite prompt</FieldLabel>
                <input
                  type="text"
                  value={activeCustomExpression.prompt}
                  placeholder="looking back, over the shoulder"
                  onKeyDown={stopTextFieldHotkeys}
                  onChange={(event) =>
                    updateAutomaticCustomExpression(activeCustomExpressionIndex, {
                      prompt: event.target.value,
                    })
                  }
                />
              </label>
            </div>
            <div className="row-actions confirm-actions">
              <IconButton icon={backIcon} label="Close" onClick={() => setActiveCustomExpressionIndex(null)} />
              <ActionButton
                icon={playIcon}
                label="Generate Preview"
                className="primary-action"
                disabled={autogenPreviewBlocked || !normalizeExpressionLabel(activeCustomExpression.triggerTag)}
                onClick={() => {
                  const triggerTag = normalizeExpressionLabel(activeCustomExpression.triggerTag);
                  if (!triggerTag) {
                    return;
                  }
                  const previewTask: GenerationTask = {
                    kind: 'sprite',
                    label: triggerTag,
                    triggerTag,
                    promptAddition: (activeCustomExpression.prompt || triggerTag).trim(),
                    variantNumber: 1,
                    assetKey: `PREVIEW:${triggerTag}`,
                  };
                  void generateAutomaticPromptPreviewForTask(previewTask).catch((error) => {
                    pushToast('error', error instanceof Error ? error.message : 'Preview generation failed.');
                  });
                }}
              />
              <IconButton
                icon={deleteIcon}
                label="Remove Expression"
                className="danger"
                onClick={() => {
                  removeAutomaticCustomExpression(activeCustomExpressionIndex);
                  setActiveCustomExpressionIndex(null);
                }}
              />
            </div>
          </section>
        </div>
      ) : null}

      {activeCgDefinition && activeCgDefinitionIndex !== null ? (
        <div
          className="confirm-overlay"
          role="dialog"
          aria-modal="true"
          aria-label={`CG Definition ${activeCgDefinitionIndex + 1}`}
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              setActiveCgDefinitionIndex(null);
            }
          }}
        >
          <section className="confirm-dialog autogen-cg-definition-dialog">
            <div className="confirm-dialog-copy">
              <h3>CG Definition #{activeCgDefinitionIndex + 1}</h3>
              <label>
                <FieldLabel icon={triggerIcon}>Trigger tag or CG identifier/name</FieldLabel>
                <input
                  type="text"
                  value={activeCgDefinition.triggerTag}
                  placeholder="LOOKING AT DOOR"
                  onChange={(event) =>
                    updateAutomaticCgDefinition(activeCgDefinitionIndex, {
                      triggerTag: event.target.value,
                    })
                  }
                />
              </label>
              <label>
                <FieldLabel icon={descriptionIcon}>Prompt to append/use during CG generation</FieldLabel>
                <input
                  type="text"
                  value={activeCgDefinition.prompt}
                  placeholder="standing in front of the door, dramatic lighting"
                  onKeyDown={stopTextFieldHotkeys}
                  onChange={(event) =>
                    updateAutomaticCgDefinition(activeCgDefinitionIndex, {
                      prompt: event.target.value,
                    })
                  }
                />
              </label>
              <div className="autogen-cg-definition-dialog-toggles">
                <label className="settings-row settings-row-toggle">
                  <span className="settings-row-label">
                    <span>Exclude Upper Body Tags</span>
                  </span>
                  <span className="settings-toggle-wrap">
                    <input
                      type="checkbox"
                      className="settings-toggle-input"
                      checked={activeCgDefinition.excludeUpperBodyTags}
                      onChange={(event) =>
                        updateAutomaticCgDefinition(activeCgDefinitionIndex, {
                          excludeUpperBodyTags: event.target.checked,
                        })
                      }
                    />
                    <span className="settings-toggle" aria-hidden="true" />
                  </span>
                </label>
                <label className="settings-row settings-row-toggle">
                  <span className="settings-row-label">
                    <span>Exclude Waist Tags</span>
                  </span>
                  <span className="settings-toggle-wrap">
                    <input
                      type="checkbox"
                      className="settings-toggle-input"
                      checked={activeCgDefinition.excludeWaistTags}
                      onChange={(event) =>
                        updateAutomaticCgDefinition(activeCgDefinitionIndex, {
                          excludeWaistTags: event.target.checked,
                        })
                      }
                    />
                    <span className="settings-toggle" aria-hidden="true" />
                  </span>
                </label>
                <label className="settings-row settings-row-toggle">
                  <span className="settings-row-label">
                    <span>Exclude Lower Body Tags</span>
                  </span>
                  <span className="settings-toggle-wrap">
                    <input
                      type="checkbox"
                      className="settings-toggle-input"
                      checked={activeCgDefinition.excludeLowerBodyTags}
                      onChange={(event) =>
                        updateAutomaticCgDefinition(activeCgDefinitionIndex, {
                          excludeLowerBodyTags: event.target.checked,
                        })
                      }
                    />
                    <span className="settings-toggle" aria-hidden="true" />
                  </span>
                </label>
              </div>
            </div>
            <div className="row-actions confirm-actions">
              <IconButton icon={backIcon} label="Close" onClick={() => setActiveCgDefinitionIndex(null)} />
              <ActionButton
                icon={playIcon}
                label="Generate Preview"
                className="primary-action"
                disabled={autogenPreviewBlocked || !normalizeExpressionLabel(activeCgDefinition.triggerTag)}
                onClick={() => {
                  const triggerTag = normalizeExpressionLabel(activeCgDefinition.triggerTag);
                  if (!triggerTag) {
                    return;
                  }
                  const previewTask: GenerationTask = {
                    kind: 'cg',
                    label: triggerTag,
                    triggerTag,
                    promptAddition: (activeCgDefinition.prompt || triggerTag).trim(),
                    variantNumber: 1,
                    assetKey: `PREVIEW:CG:${triggerTag}`,
                  };
                  void generateAutomaticPromptPreviewForTask(previewTask).catch((error) => {
                    pushToast('error', error instanceof Error ? error.message : 'Preview generation failed.');
                  });
                }}
              />
              <IconButton
                icon={deleteIcon}
                label="Remove Definition"
                className="danger"
                onClick={() => removeAutomaticCgDefinition(activeCgDefinitionIndex)}
              />
            </div>
          </section>
        </div>
      ) : null}

      {pendingConfirm ? (
        <div className="confirm-overlay" role="dialog" aria-modal="true" aria-label={pendingConfirm.title}>
          <section className="confirm-dialog">
            <div className="confirm-dialog-copy">
              <h3>{pendingConfirm.title}</h3>
              <p>{pendingConfirm.description}</p>
              {pendingConfirm.variant === 'package-delete' ? (
                <>
                  <label className="settings-row settings-row-toggle confirm-toggle-row">
                    <span className="settings-row-label">
                      <span>Delete characters imported by the package</span>
                    </span>
                    <span className="settings-toggle-wrap">
                      <input
                        className="settings-toggle-input"
                        type="checkbox"
                        checked={packageDeleteOptions.deleteCharacters}
                        onChange={(event) =>
                          setPackageDeleteOptions((current) => ({
                            ...current,
                            deleteCharacters: event.target.checked,
                          }))
                        }
                      />
                      <span className="settings-toggle" aria-hidden="true" />
                    </span>
                  </label>
                  <label className="settings-row settings-row-toggle confirm-toggle-row">
                    <span className="settings-row-label">
                      <span>Delete scenarios imported by the package</span>
                    </span>
                    <span className="settings-toggle-wrap">
                      <input
                        className="settings-toggle-input"
                        type="checkbox"
                        checked={packageDeleteOptions.deleteScenarios}
                        onChange={(event) =>
                          setPackageDeleteOptions((current) => ({
                            ...current,
                            deleteScenarios: event.target.checked,
                          }))
                        }
                      />
                      <span className="settings-toggle" aria-hidden="true" />
                    </span>
                  </label>
                </>
              ) : null}
            </div>
            <div className="row-actions confirm-actions">
              <IconButton icon={backIcon} label="Cancel" onClick={() => setPendingConfirm(null)} />
              <IconButton
                icon={deleteIcon}
                label={pendingConfirm.confirmLabel}
                className="danger"
                onClick={() => {
                  const nextAction = pendingConfirm.action;
                  const successMessage = pendingConfirm.successMessage;
                  setPendingConfirm(null);
                  void runWithBusyState(async () => {
                    await nextAction();
                  }, successMessage);
                }}
              />
            </div>
          </section>
        </div>
      ) : null}

      {bottomProgress ? (
        <div className={`bottom-progress bottom-progress-${bottomProgress.tone}`} aria-live="polite" aria-atomic="true">
          <div className="bottom-progress-copy">
            <span>{bottomProgress.label}</span>
            <span>{Math.round(bottomProgress.value)}%</span>
          </div>
          <div className="bottom-progress-track">
            <div className="bottom-progress-fill" style={{ width: `${bottomProgress.value}%` }} />
          </div>
        </div>
      ) : null}

      {toasts.length > 0 ? (
        <div className="toast-stack" aria-live="polite" aria-atomic="true">
          {toasts.map((toast) => (
            <div key={toast.id} className={`toast-notification toast-${toast.kind}`}>
              <span>{toast.message}</span>
              <button
                type="button"
                className="toast-dismiss"
                onClick={() => dismissToast(toast.id)}
                aria-label="Dismiss notification"
              >
                x
              </button>
            </div>
          ))}
        </div>
      ) : null}

      {scenarioLazyPromptOpen ? (
        <div
          className="confirm-overlay"
          role="dialog"
          aria-modal="true"
          aria-label="Scenario location prompt helper"
          onClick={() => setScenarioLazyPromptOpen(false)}
        >
          <section className="confirm-dialog scenario-lazy-prompt-dialog" onClick={(event) => event.stopPropagation()}>
            <div className="confirm-dialog-copy">
              <h3>I'm lazy</h3>
              <p>Prompt this in your LLM of choice and import it:</p>
              <textarea className="scenario-lazy-prompt-copy" value={SCENARIO_LAZY_PROMPT_TEXT} readOnly rows={6} />
            </div>
            <div className="row-actions confirm-actions">
              <IconButton icon={backIcon} label="Close" onClick={() => setScenarioLazyPromptOpen(false)} />
            </div>
          </section>
        </div>
      ) : null}

      {guideSpriteTest.errorMessage ? (
        <div
          className="confirm-overlay"
          role="dialog"
          aria-modal="true"
          aria-label="ComfyUI generation test failed"
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              setGuideSpriteTest((current) => ({ ...current, errorMessage: null }));
            }
          }}
        >
          <section className="confirm-dialog">
            <div className="confirm-dialog-copy">
              <h3>ComfyUI generation test failed</h3>
              <p>{guideSpriteTest.errorMessage}</p>
            </div>
            <div className="row-actions confirm-actions">
              <ActionButton
                icon={backIcon}
                label="Close"
                onClick={() => setGuideSpriteTest((current) => ({ ...current, errorMessage: null }))}
              />
            </div>
          </section>
        </div>
      ) : null}

      {runStartingPointDialog
          ? (() => {
            const scenario = scenarios.find((entry) => entry.id === runStartingPointDialog.scenarioId) || null;
            const startingPoints = scenario ? getScenarioStartingPoints(scenario) : [];
            if (!scenario) {
              return null;
            }
            const leadCharacter = characterById.get(scenario.characterId);
            const suggestedValues = getCharacterSuggestedSessionValues(leadCharacter);
            const selectedStartingPointId =
              runStartingPointDialog.selectedStartingPointId || startingPoints[0]?.id || '';
            const negativeLimitDescription = describeNegativeAffinityLimit(runStartingPointDialog.affinityMinimumValue);
            const positiveLimitDescription = describePositiveAffinityLimit(runStartingPointDialog.affinityMaximumValue);
            const lustLimitDescription = describeLustLimit(runStartingPointDialog.lustMaximumValue);

            return (
              <div
                className="confirm-overlay"
                role="dialog"
                aria-modal="true"
                aria-label={`Choose a starting point for ${scenario.name}`}
                onClick={(event) => {
                  if (event.target === event.currentTarget) {
                    setRunStartingPointDialog(null);
                  }
                }}
              >
                <section className="confirm-dialog run-starting-point-dialog">
                  <div className="confirm-dialog-copy">
                    <h3>{scenario.name}</h3>
                    <p>Choose how this new session begins.</p>
                  </div>

                  {startingPoints.length > 1 ? (
                    <div className="run-starting-point-grid">
                      {startingPoints.map((point) => {
                        const scene = getScenarioStartingPointScene(scenario, point);
                        const backgroundDataUrl = scene?.backgroundDataUrl || '';
                        const selected = selectedStartingPointId === point.id;
                        return (
                          <button
                            key={point.id}
                            type="button"
                            className={`run-starting-point-option ${selected ? 'is-active' : ''}`.trim()}
                            onClick={() =>
                              setRunStartingPointDialog((current) =>
                                current ? { ...current, selectedStartingPointId: point.id } : current,
                              )
                            }
                          >
                            {backgroundDataUrl ? (
                              <img
                                src={backgroundDataUrl}
                                alt=""
                                className="run-starting-point-option-image"
                                aria-hidden="true"
                              />
                            ) : (
                              <div className="run-starting-point-option-empty" aria-hidden="true">
                                No map image
                              </div>
                            )}
                            <span className="run-starting-point-option-overlay" aria-hidden="true" />
                            <span className="run-starting-point-option-name">{point.name}</span>
                          </button>
                        );
                      })}
                    </div>
                  ) : null}

                  <div className="settings-section run-affinity-settings">
                    <label className="settings-row settings-row-toggle">
                      <span className="settings-row-label">
                        <FieldLabelWithTooltip
                          icon={settingsIcon}
                          tooltip="This feature is still being tested"
                          compact
                        >
                          Affinity (Experimental)
                        </FieldLabelWithTooltip>
                      </span>
                      <span className="settings-toggle-wrap">
                        <input
                          type="checkbox"
                          className="settings-toggle-input"
                          checked={runStartingPointDialog.affinityEnabled}
                          onChange={(event) =>
                            setRunStartingPointDialog((current) =>
                              current ? { ...current, affinityEnabled: event.target.checked } : current,
                            )
                          }
                        />
                        <span className="settings-toggle" aria-hidden="true" />
                      </span>
                    </label>

                    {runStartingPointDialog.affinityEnabled ? (
                      <>
                        <div className="row-actions">
                          <ActionButton
                            icon={backIcon}
                            label="Reset to suggested values for this character"
                            onClick={() =>
                              setRunStartingPointDialog((current) =>
                                current
                                  ? {
                                      ...current,
                                      affinityEnabled: true,
                                      affinityMinimumValue: suggestedValues.affinityNegativeMaximum,
                                      affinityMaximumValue: suggestedValues.affinityPositiveMaximum,
                                      affinityStartingValue: clampNumber(
                                        current.affinityStartingValue,
                                        suggestedValues.affinityNegativeMaximum,
                                        suggestedValues.affinityPositiveMaximum,
                                      ),
                                    }
                                  : current,
                              )
                            }
                          />
                        </div>

                        <label className="settings-row settings-row-slider">
                          <span className="settings-row-copy">
                            <span className="settings-row-label">
                              <span>Starting affinity</span>
                            </span>
                            <strong>{runStartingPointDialog.affinityStartingValue}</strong>
                          </span>
                          <input
                            className="settings-slider"
                            type="range"
                            min={runStartingPointDialog.affinityMinimumValue}
                            max={runStartingPointDialog.affinityMaximumValue}
                            step={1}
                            value={runStartingPointDialog.affinityStartingValue}
                            onChange={(event) =>
                              setRunStartingPointDialog((current) =>
                                current
                                  ? { ...current, affinityStartingValue: Number(event.target.value) }
                                  : current,
                              )
                            }
                          />
                        </label>

                        <label className="settings-row settings-row-slider">
                          <span className="settings-row-copy">
                            <span className="settings-row-label">
                              <span>Maximum negative drop</span>
                            </span>
                            <strong>{runStartingPointDialog.affinityMinimumValue}</strong>
                          </span>
                          <input
                            className="settings-slider settings-slider-negative settings-slider-negative-inverted"
                            type="range"
                            min={-120}
                            max={0}
                            step={20}
                            value={runStartingPointDialog.affinityMinimumValue}
                            onChange={(event) =>
                              setRunStartingPointDialog((current) => {
                                if (!current) {
                                  return current;
                                }

                                const nextMinimumValue = clampNumber(
                                  Number(event.target.value),
                                  -120,
                                  0,
                                );
                                return {
                                  ...current,
                                  affinityMinimumValue: nextMinimumValue,
                                  affinityStartingValue: clampNumber(
                                    current.affinityStartingValue,
                                    nextMinimumValue,
                                    current.affinityMaximumValue,
                                  ),
                                };
                              })
                            }
                          />
                        </label>

                        <div
                          className={`run-affinity-limit-card is-negative ${
                            runStartingPointDialog.affinityMinimumValue <= -120 ? 'is-murder-intent' : ''
                          } ${negativeAffinityDangerFlashActive ? 'is-flashing' : ''}`.trim()}
                        >
                          <strong className="run-affinity-limit-card-title">
                            {runStartingPointDialog.affinityMinimumValue <= -120 ? (
                              <img src={alertTriangleIcon} alt="" aria-hidden="true" className="ui-icon" />
                            ) : null}
                            <span>{negativeLimitDescription.title}</span>
                          </strong>
                          <p>{negativeLimitDescription.detail}</p>
                        </div>

                        <label className="settings-row settings-row-slider">
                          <span className="settings-row-copy">
                            <span className="settings-row-label">
                              <span>Maximum positive rise</span>
                            </span>
                            <strong>{runStartingPointDialog.affinityMaximumValue}</strong>
                          </span>
                          <input
                            className="settings-slider settings-slider-positive"
                            type="range"
                            min={0}
                            max={120}
                            step={20}
                            value={runStartingPointDialog.affinityMaximumValue}
                            onChange={(event) =>
                              setRunStartingPointDialog((current) => {
                                if (!current) {
                                  return current;
                                }

                                const nextMaximumValue = clampNumber(
                                  Number(event.target.value),
                                  0,
                                  120,
                                );
                                return {
                                  ...current,
                                  affinityMaximumValue: nextMaximumValue,
                                  affinityStartingValue: clampNumber(
                                    current.affinityStartingValue,
                                    current.affinityMinimumValue,
                                    nextMaximumValue,
                                  ),
                                };
                              })
                            }
                          />
                        </label>

                        <div
                          className={`run-affinity-limit-card is-positive ${
                            runStartingPointDialog.affinityMaximumValue >= 120 ? 'is-stalker' : ''
                          } ${positiveAffinityDangerFlashActive ? 'is-flashing' : ''}`.trim()}
                        >
                          <strong className="run-affinity-limit-card-title">
                            {runStartingPointDialog.affinityMaximumValue >= 120 ? (
                              <img src={eyeIcon} alt="" aria-hidden="true" className="ui-icon" />
                            ) : null}
                            <span>{positiveLimitDescription.title}</span>
                          </strong>
                          <p>{positiveLimitDescription.detail}</p>
                        </div>
                      </>
                    ) : null}

                  </div>

                  <div className="settings-section run-affinity-settings">
                    <label className="settings-row settings-row-toggle">
                      <span className="settings-row-label">
                          <FieldLabelWithTooltip
                            icon={heartIcon}
                            tooltip="This feature is still being tested"
                            compact
                          >
                            Lust (Experimental)
                        </FieldLabelWithTooltip>
                      </span>
                      <span className="settings-toggle-wrap">
                        <input
                          type="checkbox"
                          className="settings-toggle-input"
                          checked={runStartingPointDialog.lustEnabled}
                          onChange={(event) =>
                            setRunStartingPointDialog((current) =>
                              current ? { ...current, lustEnabled: event.target.checked } : current,
                            )
                          }
                        />
                        <span className="settings-toggle" aria-hidden="true" />
                      </span>
                    </label>

                    {runStartingPointDialog.lustEnabled ? (
                      <>
                        <div className="row-actions">
                          <ActionButton
                            icon={backIcon}
                            label="Reset to suggested values for this character"
                            onClick={() =>
                              setRunStartingPointDialog((current) =>
                                current
                                  ? {
                                      ...current,
                                      lustEnabled: true,
                                      lustMaximumValue: suggestedValues.lustMaximum,
                                      lustStartingValue: clampNumber(current.lustStartingValue, 0, suggestedValues.lustMaximum),
                                    }
                                  : current,
                              )
                            }
                          />
                        </div>

                        <label className="settings-row settings-row-slider">
                          <span className="settings-row-copy">
                            <span className="settings-row-label">
                              <span>Starting lust</span>
                            </span>
                            <strong>{runStartingPointDialog.lustStartingValue}</strong>
                          </span>
                          <input
                            className="settings-slider settings-slider-positive"
                            type="range"
                            min={0}
                            max={runStartingPointDialog.lustMaximumValue}
                            step={20}
                            value={runStartingPointDialog.lustStartingValue}
                            onChange={(event) =>
                              setRunStartingPointDialog((current) =>
                                current
                                  ? { ...current, lustStartingValue: Number(event.target.value) }
                                  : current,
                              )
                            }
                          />
                        </label>

                        <label className="settings-row settings-row-slider">
                          <span className="settings-row-copy">
                            <span className="settings-row-label">
                              <span>Maximum lust</span>
                            </span>
                            <strong>{runStartingPointDialog.lustMaximumValue}</strong>
                          </span>
                          <input
                            className="settings-slider settings-slider-positive"
                            type="range"
                            min={0}
                            max={100}
                            step={20}
                            value={runStartingPointDialog.lustMaximumValue}
                            onChange={(event) =>
                              setRunStartingPointDialog((current) => {
                                if (!current) {
                                  return current;
                                }

                                const nextMaximumValue = clampNumber(Number(event.target.value), 0, 100);
                                return {
                                  ...current,
                                  lustMaximumValue: nextMaximumValue,
                                  lustStartingValue: clampNumber(current.lustStartingValue, 0, nextMaximumValue),
                                };
                              })
                            }
                          />
                        </label>

                        <div className="run-affinity-limit-card is-positive">
                          <strong className="run-affinity-limit-card-title">
                            <span>{lustLimitDescription.title}</span>
                          </strong>
                          <p>{lustLimitDescription.detail}</p>
                        </div>
                      </>
                    ) : null}
                  </div>

                  <div className="row-actions confirm-actions">
                    <ActionButton icon={playIcon} label="Start Session" onClick={startRunFromDialog} disabled={busy} />
                    <ActionButton icon={backIcon} label="Cancel" onClick={() => setRunStartingPointDialog(null)} disabled={busy} />
                  </div>
                </section>
              </div>
            );
          })()
        : null}

      {menuSettingsOpen ? (
        <div
          className="settings-overlay"
          role="dialog"
          aria-modal="true"
          aria-label="Studio settings"
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              setMenuSettingsOpen(false);
            }
          }}
        >
          <section className="settings-dialog menu-settings-dialog">
            <div className="settings-head">
              <div>
                <h2>Preferences</h2>
              </div>
              <IconButton
                icon={closeIcon}
                label="Close settings"
                onClick={() => setMenuSettingsOpen(false)}
              />
            </div>

            <div className="settings-tab-bar" role="tablist" aria-label="Studio settings categories">
              <button
                type="button"
                role="tab"
                aria-selected={menuSettingsTab === 'interface'}
                className={`settings-tab-button ${menuSettingsTab === 'interface' ? 'is-active' : ''}`.trim()}
                onClick={() => setMenuSettingsTab('interface')}
              >
                Interface
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={menuSettingsTab === 'game'}
                className={`settings-tab-button ${menuSettingsTab === 'game' ? 'is-active' : ''}`.trim()}
                onClick={() => setMenuSettingsTab('game')}
              >
                Game
              </button>
            </div>

            <div className="settings-scroll-area">
              {menuSettingsTab === 'interface' ? (
                <div className="settings-section">
                  <div className="settings-row menu-interface-setting">
                    <div className="settings-row-copy">
                      <span className="settings-row-label">
                        <IconImage src={settingsIcon} />
                        <span>SillyTavern API address</span>
                      </span>
                      <span className="settings-status-indicator">
                        <span
                          className={`menu-connection-dot ${sillyTavernConnection.online ? 'is-online' : 'is-offline'}`.trim()}
                          aria-hidden="true"
                        />
                        <strong>{sillyTavernConnection.online ? 'Online' : 'Offline'}</strong>
                      </span>
                    </div>
                    <input
                      type="text"
                      value={connectionAddressDraft}
                      onChange={(event) => setConnectionAddressDraft(event.target.value)}
                      placeholder="http://127.0.0.1:8000"
                    />
                  </div>

                  <div className="settings-row menu-interface-setting">
                    <div className="settings-row-copy">
                      <span className="settings-row-label">
                        <IconImage src={settingsIcon} />
                        <span>ComfyUI API address</span>
                      </span>
                      <span className="settings-status-indicator">
                        <span
                          className={`menu-connection-dot ${comfyConnectionState === 'online' ? 'is-online' : 'is-offline'}`.trim()}
                          aria-hidden="true"
                        />
                        <strong>{comfyConnectionState === 'online' ? 'Online' : 'Offline'}</strong>
                      </span>
                    </div>
                    <input
                      type="text"
                      value={comfyConnectionAddressDraft}
                      onChange={(event) => setComfyConnectionAddressDraft(event.target.value)}
                      placeholder="http://127.0.0.1:8188"
                    />
                    {comfyConnectionError ? <div className="scene-bgm-status">{comfyConnectionError}</div> : null}
                  </div>

                  <div className="row-actions">
                    <ActionButton
                      icon={playIcon}
                      label={preferencesConnectionBusy ? 'Connecting...' : 'Connect'}
                      className="primary-action"
                      disabled={preferencesConnectionBusy}
                      onClick={() => {
                        void connectUserPreferenceApiAddresses();
                      }}
                    />
                  </div>

                  <div className="settings-row menu-interface-setting">
                    <div className="settings-row-copy">
                      <span className="settings-row-label">
                        <IconImage src={colorIcon} />
                        <span>Accent color</span>
                      </span>
                    </div>
                    <ColorPicker
                      value={normalizeHexColor(menuInterfaceSettingsDraft.accentColor, DEFAULT_INTERFACE_SETTINGS.accentColor)}
                      onChange={(nextValue) =>
                        setMenuInterfaceSettingsDraft({
                          ...menuInterfaceSettingsDraft,
                          accentColor: nextValue,
                        })
                      }
                    />
                  </div>

                  <div className="settings-row menu-interface-setting">
                    <div className="settings-row-copy">
                      <span className="settings-row-label">
                        <IconImage src={userIcon} />
                        <span>Roleplay language preference</span>
                      </span>
                      <strong>{menuInterfaceSettingsDraft.roleplayLanguagePreference || 'English'}</strong>
                    </div>
                    <select
                      value={menuInterfaceSettingsDraft.roleplayLanguagePreference}
                      onChange={(event) =>
                        setMenuInterfaceSettingsDraft({
                          ...menuInterfaceSettingsDraft,
                          roleplayLanguagePreference: event.target.value,
                        })
                      }
                    >
                      {ROLEPLAY_LANGUAGE_OPTIONS.map((language) => (
                        <option key={language} value={language}>
                          {language}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="settings-row menu-interface-setting">
                    <div className="settings-row-copy">
                      <span className="settings-row-label">
                        <IconImage src={imageIcon} />
                        <span>Wallpaper</span>
                      </span>
                      <strong>{menuInterfaceSettingsDraft.wallpaperDataUrl ? 'Loaded' : 'Default'}</strong>
                    </div>

                    {menuInterfaceSettingsDraft.wallpaperDataUrl ? (
                      <img src={menuInterfaceSettingsDraft.wallpaperDataUrl} alt="Main menu wallpaper" className="settings-wallpaper-preview" />
                    ) : (
                      <div className="settings-wallpaper-empty">No wallpaper selected</div>
                    )}

                    <div className="row-actions">
                      <input
                        ref={menuWallpaperInputRef}
                        type="file"
                        accept="image/*"
                        className="file-picker-input settings-hidden-input"
                        onChange={(event) => {
                          const input = event.currentTarget;
                          const file = input.files?.[0];
                          input.value = '';
                          if (!file) {
                            return;
                          }

                          void beginMenuWallpaperCrop(file).catch((uploadError) => {
                            pushToast('error', uploadError instanceof Error ? uploadError.message : 'Image read failed.');
                          });
                        }}
                      />
                      <ActionButton
                        icon={uploadIcon}
                        label="Import wallpaper"
                        className="primary-action"
                        onClick={() => menuWallpaperInputRef.current?.click()}
                      />
                      <ActionButton
                        icon={deleteIcon}
                        label="Clear wallpaper"
                        disabled={!menuInterfaceSettingsDraft.wallpaperDataUrl}
                        onClick={() =>
                          setMenuInterfaceSettingsDraft({
                            ...menuInterfaceSettingsDraft,
                            wallpaperDataUrl: '',
                          })
                        }
                      />
                      <ActionButton
                        icon={backIcon}
                        label="Reset interface"
                        onClick={() => setMenuInterfaceSettingsDraft({ ...DEFAULT_INTERFACE_SETTINGS })}
                      />
                    </div>
                  </div>
                </div>
              ) : (
                <GameplaySettingsContent settings={menuGameplaySettingsDraft} onChange={setMenuGameplaySettingsDraft} />
              )}
            </div>

            <div className="settings-actions">
              <ActionButton
                icon={saveIcon}
                label="Save settings"
                className="primary-action"
                onClick={() => {
                  onInterfaceSettingsChange(menuInterfaceSettingsDraft);
                  onGameplaySettingsChange(menuGameplaySettingsDraft);
                  setMenuSettingsOpen(false);
                }}
              />
            </div>
          </section>
        </div>
      ) : null}

      {gettingStartedOpen ? (
        <div
          className="settings-overlay"
          role="dialog"
          aria-modal="true"
          aria-label="Getting started"
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              closeGettingStartedDialog();
            }
          }}
        >
          <section className="settings-dialog getting-started-dialog">
            <div className="settings-head">
              <div>
                <h2>{GETTING_STARTED_PAGES[gettingStartedPageIndex]?.title}</h2>
              </div>
              <IconButton icon={closeIcon} label="Close guide" onClick={closeGettingStartedDialog} />
            </div>

            <div className="getting-started-progress" aria-hidden="true">
              {GETTING_STARTED_PAGES.map((page, index) => (
                <button
                  key={page.id}
                  type="button"
                  className={`getting-started-progress-dot ${index === gettingStartedPageIndex ? 'is-active' : ''}`.trim()}
                  aria-label={page.title}
                  title={page.title}
                  onClick={() => setGettingStartedPageIndex(index)}
                />
              ))}
            </div>

            <div className="getting-started-body">{renderGettingStartedPage(GETTING_STARTED_PAGES[gettingStartedPageIndex].id)}</div>

            <div className="getting-started-footer">
              <label className="settings-row settings-row-toggle getting-started-toggle-row">
                <span className="settings-row-label">
                  <span>Do not show this on startup</span>
                </span>
                <span className="settings-toggle-wrap">
                  <input
                    type="checkbox"
                    className="settings-toggle-input"
                    checked={hideGettingStartedOnStartup}
                    onChange={(event) => setHideGettingStartedOnStartup(event.target.checked)}
                  />
                  <span className="settings-toggle" aria-hidden="true" />
                </span>
              </label>

              <div className="row-actions">
                {gettingStartedPageIndex > 0 ? (
                  <button
                    type="button"
                    className="secondary-action"
                    onClick={() => setGettingStartedPageIndex((current) => Math.max(0, current - 1))}
                  >
                    Back
                  </button>
                ) : null}

                {gettingStartedPageIndex < GETTING_STARTED_PAGES.length - 1 ? (
                  <button
                    type="button"
                    className="primary-action"
                    disabled={!canAdvanceGettingStarted}
                    onClick={() =>
                      setGettingStartedPageIndex((current) => Math.min(GETTING_STARTED_PAGES.length - 1, current + 1))
                    }
                  >
                    Next
                  </button>
                ) : (
                  <button type="button" className="primary-action" onClick={closeGettingStartedDialog}>
                    OK
                  </button>
                )}
              </div>
            </div>
          </section>
        </div>
      ) : null}

      {interactiveZonesDialog ? (
        <div className="cropper-overlay" role="dialog" aria-modal="true" aria-label="Interactive zones editor">
          <section className="cropper-modal interactive-zones-modal">
            <header className="cropper-head">
              <h3>{interactiveZonesDialog.title}</h3>
              <p>Use Draw to drag out areas. Switch to Select to edit prompts, move areas around, or press Delete to remove the selected area.</p>
            </header>

            <div className="row-actions interactive-zones-toolbar">
              <ActionButton
                icon={imageIcon}
                label="Draw"
                className={`interactive-tool-button ${interactiveZoneTool === 'draw' ? 'is-active' : ''}`.trim()}
                onClick={() => {
                  setInteractiveZoneTool('draw');
                  setSelectedInteractiveZoneId(null);
                }}
              />
              <ActionButton
                icon={triggerIcon}
                label="Select"
                className={`interactive-tool-button ${interactiveZoneTool === 'select' ? 'is-active' : ''}`.trim()}
                onClick={() => setInteractiveZoneTool('select')}
              />
            </div>

            <div className="interactive-zones-stage">
              <div
                ref={interactiveZoneCanvasRef}
                className={`interactive-zones-canvas tool-${interactiveZoneTool}`}
                onPointerDown={(event) => {
                  if (interactiveZoneTool === 'select') {
                    setSelectedInteractiveZoneId(null);
                    return;
                  }

                  beginInteractiveZoneDraw(event);
                }}
                onPointerMove={updateInteractiveZoneDraw}
                onPointerMoveCapture={updateInteractiveZoneMove}
                onPointerUp={(event) => {
                  if (draftInteractiveZone || movingInteractiveZone) {
                    try {
                      event.currentTarget.releasePointerCapture(event.pointerId);
                    } catch {
                      // Ignore missing capture state.
                    }
                  }
                  if (draftInteractiveZone) {
                    finalizeInteractiveZoneDraw();
                    return;
                  }
                  finishInteractiveZonePointerInteraction();
                }}
                onPointerCancel={finishInteractiveZonePointerInteraction}
              >
                <div className="interactive-zones-image-frame">
                  <img
                    src={interactiveZonesDialog.sourceDataUrl}
                    alt={interactiveZonesDialog.title}
                    className="interactive-zones-image"
                    draggable={false}
                  />
                </div>

                {currentInteractiveZones.map((zone) => {
                  const isSelected = zone.id === selectedInteractiveZoneId;
                  return (
                    <button
                      key={zone.id}
                      type="button"
                      className={`interactive-zone-rect ${isSelected ? 'is-selected' : ''}`.trim()}
                      style={{
                        left: `${zone.x * 100}%`,
                        top: `${zone.y * 100}%`,
                        width: `${zone.width * 100}%`,
                        height: `${zone.height * 100}%`,
                      }}
                      onPointerDown={(event) => {
                        event.stopPropagation();
                        beginInteractiveZoneMove(zone, event);
                      }}
                      onClick={(event) => {
                        event.stopPropagation();
                        setInteractiveZoneTool('select');
                        setSelectedInteractiveZoneId(zone.id);
                      }}
                    >
                      <span>{zone.prompt.trim() ? 'Prompt set' : 'No prompt'}</span>
                    </button>
                  );
                })}

                {draftInteractiveZone ? (
                  <div
                    className="interactive-zone-rect is-draft"
                    style={{
                      left: `${draftInteractiveZone.x * 100}%`,
                      top: `${draftInteractiveZone.y * 100}%`,
                      width: `${draftInteractiveZone.width * 100}%`,
                      height: `${draftInteractiveZone.height * 100}%`,
                    }}
                  />
                ) : null}

                {selectedInteractiveZone ? (
                  <div
                    className="interactive-zone-tooltip"
                    style={{
                      left: `${Math.min(selectedInteractiveZone.x + selectedInteractiveZone.width, 0.74) * 100}%`,
                      top: `${Math.min(selectedInteractiveZone.y + selectedInteractiveZone.height + 0.02, 0.78) * 100}%`,
                    }}
                    onPointerDown={(event) => event.stopPropagation()}
                  >
                    <label>
                      <span>Prompt to submit:</span>
                      <textarea
                        value={selectedInteractiveZone.prompt}
                        onChange={(event) => updateSelectedInteractiveZonePrompt(event.target.value)}
                        placeholder="Look at the note on the wall."
                        rows={4}
                      />
                    </label>
                  </div>
                ) : null}
              </div>
            </div>

            <div className="row-actions cropper-actions">
              <ActionButton icon={saveIcon} label="Save" onClick={saveInteractiveZonesDialog} disabled={busy} />
              <ActionButton icon={backIcon} label="Close" onClick={closeInteractiveZonesDialog} disabled={busy} />
            </div>
          </section>
        </div>
      ) : null}

      {spriteCropDialog ? (
        <div className="cropper-overlay" role="dialog" aria-modal="true" aria-label="Crop sprite">
          <section className="cropper-modal">
            <header className="cropper-head">
              <h3>
                {spriteCropDialog.target === 'scenario-banner'
                  ? 'Crop Scenario Banner'
                  : spriteCropDialog.target === 'menu-wallpaper'
                    ? 'Crop Menu Wallpaper'
                    : `Crop Sprite [${spriteCropDialog.expression}]`}
              </h3>
              <p>
                Drag to reposition. Use zoom for framing. Aspect ratio is fixed to{' '}
                {Math.abs(spriteCropDialog.aspect - 16 / 9) < 0.001 ? '16:9' : '2:3'}.
              </p>
            </header>

            <div className="cropper-stage">
              <Cropper
                image={spriteCropDialog.sourceDataUrl}
                crop={spriteCropPosition}
                zoom={spriteCropZoom}
                aspect={spriteCropDialog.aspect}
                objectFit="contain"
                onCropChange={setSpriteCropPosition}
                onZoomChange={setSpriteCropZoom}
                onCropComplete={(_area, areaPixels) => setSpriteCropPixels(areaPixels)}
              />
            </div>

            <label className="cropper-zoom">
              <span>Zoom</span>
              <input
                type="range"
                min={1}
                max={4}
                step={0.01}
                value={spriteCropZoom}
                onChange={(event) => setSpriteCropZoom(Number(event.target.value))}
              />
            </label>

            <div className="row-actions cropper-actions">
              <IconButton icon={backIcon} label="Cancel crop" onClick={closeSpriteCropDialog} disabled={busy} />
              <IconButton
                icon={saveIcon}
                label="Apply crop"
                className="primary-action"
                disabled={busy || !spriteCropPixels}
                onClick={() => {
                  void runWithBusyState(async () => {
                    await applySpriteCrop();
                  });
                }}
              />
            </div>
          </section>
        </div>
      ) : null}
    </main>
  );
}
