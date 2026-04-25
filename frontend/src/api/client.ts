import type {
  AutomaticGenerationArtStylePreset,
  AutomaticGenerationLora,
  CharacterOption,
  CharacterAutomaticGenerationSettings,
  ConversationMessage,
  OneShotScenario,
  RuntimeInfo,
  ScenarioPackage,
  ScenarioRun,
  SceneWeatherPreset,
  SelectedCharacterPayload,
  SessionAffinityOptions,
  SessionLustOptions,
  SillyTavernConnectionInfo,
  SpriteAnimationFrameSet,
  StudioCharacter,
} from '../types';

interface RuntimeResponse {
  runtime: {
    model: string;
    chatCompletionSource: string;
    mainApi?: string;
  };
  streamingDefault: boolean;
}

interface ConnectionResponse {
  baseUrl: string;
  online: boolean;
  error?: string;
}

interface UpdateConnectionResponse extends ConnectionResponse {
  characters: CharacterResponse['characters'];
  runtime: RuntimeResponse['runtime'];
  streamingDefault: boolean;
}

interface CharacterResponse {
  characters: Array<{
    name: string;
    avatar?: string;
    data?: {
      description?: string;
      personality?: string;
      scenario?: string;
      first_mes?: string;
      mes_example?: string;
      system_prompt?: string;
      post_history_instructions?: string;
      creator?: string;
      tags?: string[];
    };
  }>;
}

interface GeneratePayload {
  messages: ConversationMessage[];
  stream: boolean;
  sessionId?: string;
  thinkingTurn?: boolean;
  continueTurn?: boolean;
  describeTurn?: boolean;
  turnInstruction?: string;
  character?: SelectedCharacterPayload;
}

interface StartSessionPayload {
  characterName: string;
  avatarUrl?: string;
  firstMes?: string;
  cgNames?: string[];
  locationNames?: string[];
  specialInstructions?: string;
  roleplayLanguagePreference?: string;
  affinity?: SessionAffinityOptions;
  lust?: SessionLustOptions;
}

interface GenerationSuccess {
  text: string;
  model: string;
  responseMs: number;
  affinity?: AffinityUpdate;
  lust?: LustUpdate;
}

export interface AffinityUpdate {
  enabled: boolean;
  value: number;
  previousValue: number;
  delta: number;
}

export interface LustUpdate {
  enabled: boolean;
  value: number;
  previousValue: number;
  delta: number;
}

interface StudioStateResponse {
  characters: StudioCharacter[];
  scenarios: OneShotScenario[];
  runs: ScenarioRun[];
  packages: ScenarioPackage[];
  artStylePresets: AutomaticGenerationArtStylePreset[];
}

interface ComfyStatusResponse {
  baseUrl: string;
  online: boolean;
  error?: string;
}

interface ComfyOptionsResponse extends ComfyStatusResponse {
  checkpoints?: string[];
  loras?: string[];
  upscaleModels?: string[];
  defaultCheckpoint?: string;
  missingNodes?: Array<{
    workflowKind?: 'sprite' | 'cg';
    nodeId?: number;
    nodeType?: string;
    nodeTitle?: string;
  }>;
}

interface ComfyGeneratedImageResponse {
  image?: {
    dataUrl: string;
    fileName: string;
    filePath: string;
    mimeType: string;
    depthMap?: {
      dataUrl: string;
      fileName: string;
      filePath: string;
      mimeType: string;
    };
    animationFrames?: {
      closedEyes?: {
        dataUrl: string;
        fileName: string;
        filePath: string;
        mimeType: string;
      };
      openMouth?: {
        dataUrl: string;
        fileName: string;
        filePath: string;
        mimeType: string;
      };
    };
    depthMapError?: string;
  };
  error?: string;
}

function summarizeResponseBody(value: string): string {
  return value.trim().replace(/\s+/g, ' ').slice(0, 180);
}

async function readJsonResponse<T>(response: Response, fallbackError: string): Promise<T> {
  const raw = await response.text();

  if (!raw.trim()) {
    throw new Error(`${fallbackError} The server returned an empty response.`);
  }

  try {
    return JSON.parse(raw) as T;
  } catch {
    const contentType = response.headers.get('content-type') || 'unknown content type';
    const preview = summarizeResponseBody(raw);
    throw new Error(
      `${fallbackError} The server returned non-JSON content (${response.status} ${response.statusText || 'response'}, ${contentType}).${
        preview ? ` ${preview}` : ''
      }`,
    );
  }
}

function getErrorMessage(payload: unknown, fallback: string): string {
  if (
    payload &&
    typeof payload === 'object' &&
    'error' in payload &&
    typeof (payload as { error?: unknown }).error === 'string' &&
    (payload as { error: string }).error.trim()
  ) {
    return (payload as { error: string }).error;
  }

  return fallback;
}

export async function fetchCharacters(): Promise<CharacterOption[]> {
  const response = await fetch('/api/silly/characters');
  const payload = await readJsonResponse<CharacterResponse | { error?: string }>(response, 'Failed to load characters.');

  if (!response.ok) {
    throw new Error(getErrorMessage(payload, 'Failed to load characters.'));
  }

  if (!('characters' in payload) || !Array.isArray(payload.characters)) {
    throw new Error('Invalid character payload from backend.');
  }

  return payload.characters.map((character) => ({
    id: character.name,
    name: character.name,
    avatar: character.avatar,
    description: character.data?.description,
    personality: character.data?.personality,
    scenario: character.data?.scenario,
    firstMes: character.data?.first_mes,
    mesExample: character.data?.mes_example,
    systemPrompt: character.data?.system_prompt,
    postHistoryInstructions: character.data?.post_history_instructions,
    creator: character.data?.creator,
    tags: character.data?.tags,
  }));
}

export async function fetchRuntime(): Promise<{ runtime: RuntimeInfo; streamingDefault: boolean }> {
  const response = await fetch('/api/silly/runtime');
  const payload = await readJsonResponse<RuntimeResponse | { error?: string }>(response, 'Failed to load runtime settings.');

  if (!response.ok) {
    throw new Error(getErrorMessage(payload, 'Failed to load runtime settings.'));
  }

  if (!('runtime' in payload)) {
    throw new Error('Invalid runtime payload from backend.');
  }

  return {
    runtime: {
      model: payload.runtime.model || 'unknown',
      chatCompletionSource: payload.runtime.chatCompletionSource || 'unknown',
      mainApi: payload.runtime.mainApi || 'unknown',
    },
    streamingDefault: Boolean(payload.streamingDefault),
  };
}

export async function fetchSillyTavernConnection(): Promise<SillyTavernConnectionInfo> {
  const response = await fetch('/api/silly/connection');
  const payload = await readJsonResponse<ConnectionResponse | { error?: string }>(
    response,
    'Failed to load SillyTavern connection status.',
  );

  if (!response.ok || !('baseUrl' in payload)) {
    throw new Error(getErrorMessage(payload, 'Failed to load SillyTavern connection status.'));
  }

  return {
    baseUrl: payload.baseUrl || '',
    online: Boolean(payload.online),
    error: payload.error || '',
  };
}

export async function updateSillyTavernConnection(
  baseUrl: string,
): Promise<{ connection: SillyTavernConnectionInfo; characters: CharacterOption[]; runtime: RuntimeInfo; streamingDefault: boolean }> {
  const response = await fetch('/api/silly/connection', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ baseUrl }),
  });

  const payload = await readJsonResponse<UpdateConnectionResponse | { error?: string }>(
    response,
    'Failed to connect to SillyTavern.',
  );

  if (!response.ok || !('baseUrl' in payload) || !payload.online) {
    throw new Error(getErrorMessage(payload, 'Failed to connect to SillyTavern.'));
  }

  return {
    connection: {
      baseUrl: payload.baseUrl || '',
      online: true,
      error: '',
    },
    characters: payload.characters.map((character) => ({
      id: character.name,
      name: character.name,
      avatar: character.avatar,
      description: character.data?.description,
      personality: character.data?.personality,
      scenario: character.data?.scenario,
      firstMes: character.data?.first_mes,
      mesExample: character.data?.mes_example,
      systemPrompt: character.data?.system_prompt,
      postHistoryInstructions: character.data?.post_history_instructions,
      creator: character.data?.creator,
      tags: character.data?.tags,
    })),
    runtime: {
      model: payload.runtime.model || 'unknown',
      chatCompletionSource: payload.runtime.chatCompletionSource || 'unknown',
      mainApi: payload.runtime.mainApi || 'unknown',
    },
    streamingDefault: Boolean(payload.streamingDefault),
  };
}

export async function startStorySession(payload: StartSessionPayload): Promise<{ sessionId: string; firstMes: string }> {
  const response = await fetch('/api/silly/session/start', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const json = await readJsonResponse<{ sessionId?: string; firstMes?: string; error?: string }>(
    response,
    'Failed to start SillyTavern story session.',
  );
  if (!response.ok || !json.sessionId) {
    throw new Error(getErrorMessage(json, 'Failed to start SillyTavern story session.'));
  }

  return {
    sessionId: json.sessionId,
    firstMes: typeof json.firstMes === 'string' ? json.firstMes : '',
  };
}

export async function fetchSystemConfig(): Promise<{ shutdownEnabled: boolean }> {
  const response = await fetch('/api/system/config');
  const payload = await readJsonResponse<{ shutdownEnabled?: boolean; error?: string }>(
    response,
    'Failed to load system config.',
  );

  if (!response.ok) {
    throw new Error(getErrorMessage(payload, 'Failed to load system config.'));
  }

  return {
    shutdownEnabled: Boolean(payload.shutdownEnabled),
  };
}

export async function generateAssistantReply(
  payload: GeneratePayload,
  handlers?: {
    onGenerationStart?: () => void;
    onToken?: (text: string) => void;
  },
  options?: { signal?: AbortSignal },
): Promise<{
  text: string;
  model: string;
  responseMs: number;
  generationStarted: boolean;
  affinity?: AffinityUpdate;
  lust?: LustUpdate;
}> {
  if (payload.stream) {
    return streamAssistantReply(payload, handlers, options);
  }

  const response = await fetch('/api/silly/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: options?.signal,
  });

  const json = (await response.json()) as
    | GenerationSuccess
    | { error?: string };

  if (!response.ok) {
    throw new Error('error' in json && json.error ? json.error : 'Generation failed.');
  }

  if (!isGenerationSuccess(json)) {
    throw new Error('Invalid non-stream response from backend.');
  }

  return {
    text: json.text,
    model: json.model,
    responseMs: json.responseMs,
    generationStarted: true,
    affinity: json.affinity,
    lust: isLustUpdate(json.lust) ? json.lust : undefined,
  };
}

async function streamAssistantReply(
  payload: GeneratePayload,
  handlers?: {
    onGenerationStart?: () => void;
    onToken?: (text: string) => void;
  },
  options?: { signal?: AbortSignal },
): Promise<{
  text: string;
  model: string;
  responseMs: number;
  generationStarted: boolean;
  affinity?: AffinityUpdate;
  lust?: LustUpdate;
}> {
  const response = await fetch('/api/silly/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: options?.signal,
  });

  if (!response.ok || !response.body) {
    let message = 'Streaming generation failed.';
    try {
      const json = (await response.json()) as { error?: string };
      if (json.error) {
        message = json.error;
      }
    } catch {
      // noop
    }
    throw new Error(message);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  let aggregate = '';
  let model = 'unknown';
  let responseMs = 0;
  let generationStarted = false;
  let affinity: AffinityUpdate | undefined;
  let lust: LustUpdate | undefined;

  while (true) {
    const { value, done } = await reader.read();

    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });

    let boundary = buffer.indexOf('\n\n');
    while (boundary !== -1) {
      const block = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);

      const eventName = extractSseEventName(block);
      const dataText = extractSseData(block);

      if (!dataText) {
        boundary = buffer.indexOf('\n\n');
        continue;
      }

      const payloadData = safeJsonParse(dataText);
      if (eventName === 'generation-start') {
        generationStarted = true;
        handlers?.onGenerationStart?.();
      }

      if (eventName === 'token' && payloadData && typeof payloadData === 'object') {
        const text = (payloadData as { text?: string }).text;
        if (typeof text === 'string') {
          aggregate = text;
          handlers?.onToken?.(aggregate);
        }
      }

      if (eventName === 'done' && payloadData && typeof payloadData === 'object') {
        const donePayload = payloadData as {
          text?: string;
          model?: string;
          responseMs?: number;
          generationStarted?: boolean;
          affinity?: AffinityUpdate;
          lust?: LustUpdate;
        };
        aggregate = typeof donePayload.text === 'string' ? donePayload.text : aggregate;
        model = typeof donePayload.model === 'string' ? donePayload.model : model;
        responseMs = typeof donePayload.responseMs === 'number' ? donePayload.responseMs : responseMs;
        generationStarted =
          typeof donePayload.generationStarted === 'boolean'
            ? donePayload.generationStarted
            : generationStarted;
        affinity = isAffinityUpdate(donePayload.affinity) ? donePayload.affinity : undefined;
        lust = isLustUpdate(donePayload.lust) ? donePayload.lust : undefined;
      }

      if (eventName === 'error') {
        const message =
          payloadData && typeof payloadData === 'object' && typeof (payloadData as { error?: string }).error === 'string'
            ? (payloadData as { error: string }).error
            : 'Streaming request failed.';
        throw new Error(message);
      }

      boundary = buffer.indexOf('\n\n');
    }
  }

  return {
    text: aggregate,
    model,
    responseMs,
    generationStarted,
    affinity,
    lust,
  };
}

function extractSseEventName(block: string): string {
  const eventLine = block
    .split(/\r?\n/)
    .find((line) => line.startsWith('event:'));

  if (!eventLine) {
    return '';
  }

  return eventLine.slice(6).trim();
}

function extractSseData(block: string): string {
  const dataLines = block
    .split(/\r?\n/)
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice(5).trimStart());

  return dataLines.join('\n').trim();
}

function safeJsonParse(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function isGenerationSuccess(value: unknown): value is GenerationSuccess {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.text === 'string' &&
    typeof candidate.model === 'string' &&
    typeof candidate.responseMs === 'number'
  );
}

export async function fetchStudioState(): Promise<StudioStateResponse> {
  const response = await fetch('/api/studio/state');
  const payload = await readJsonResponse<StudioStateResponse | { error?: string }>(
    response,
    'Failed to load studio state.',
  );

  if (!response.ok) {
    throw new Error(getErrorMessage(payload, 'Failed to load studio state.'));
  }

  if (!('characters' in payload) || !('scenarios' in payload) || !('runs' in payload) || !('packages' in payload)) {
    throw new Error('Invalid studio state payload.');
  }

  return {
    ...payload,
    artStylePresets: Array.isArray(payload.artStylePresets) ? payload.artStylePresets : [],
  };
}

export async function updateStudioArtStylePresets(
  artStylePresets: AutomaticGenerationArtStylePreset[],
): Promise<AutomaticGenerationArtStylePreset[]> {
  const response = await fetch('/api/studio/artstyle-presets', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ artStylePresets }),
  });
  const payload = await readJsonResponse<{ artStylePresets?: AutomaticGenerationArtStylePreset[]; error?: string }>(
    response,
    'Failed to update artstyle presets.',
  );

  if (!response.ok) {
    throw new Error(getErrorMessage(payload, 'Failed to update artstyle presets.'));
  }

  return Array.isArray(payload.artStylePresets) ? payload.artStylePresets : [];
}

export async function fetchExampleAutomaticGenerationConfig(): Promise<unknown> {
  const response = await fetch('/api/studio/automatic-generation/example-config');
  const payload = await readJsonResponse<unknown>(response, 'Failed to load example automatic generation config.');

  if (!response.ok) {
    throw new Error(getErrorMessage(payload, 'Failed to load example automatic generation config.'));
  }

  return payload;
}

export async function fetchComfyStatus(): Promise<ComfyStatusResponse> {
  const response = await fetch('/api/studio/comfy/status');
  const payload = (await response.json()) as ComfyStatusResponse | { error?: string };

  if (!response.ok || !('online' in payload)) {
    throw new Error('error' in payload && payload.error ? payload.error : 'Failed to check ComfyUI status.');
  }

  return {
    baseUrl: payload.baseUrl || '',
    online: Boolean(payload.online),
    error: payload.error || '',
  };
}

export async function updateComfyConnection(baseUrl: string): Promise<ComfyStatusResponse> {
  const response = await fetch('/api/studio/comfy/connection', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ baseUrl }),
  });
  const payload = (await response.json()) as ComfyStatusResponse | { error?: string };

  if (!response.ok || !('online' in payload) || !payload.online) {
    const message = 'error' in payload && payload.error ? payload.error : 'Failed to connect to ComfyUI.';
    throw new Error(message);
  }

  return {
    baseUrl: payload.baseUrl || '',
    online: true,
    error: '',
  };
}

export async function fetchComfyOptions(): Promise<{
  baseUrl: string;
  online: boolean;
  error?: string;
  checkpoints: string[];
  loras: string[];
  upscaleModels: string[];
  defaultCheckpoint: string;
  missingNodes: Array<{
    workflowKind: 'sprite' | 'cg';
    nodeId: number;
    nodeType: string;
    nodeTitle: string;
  }>;
}> {
  const response = await fetch('/api/studio/comfy/options');
  const payload = (await response.json()) as ComfyOptionsResponse | { error?: string };

  if (!response.ok || !('online' in payload)) {
    throw new Error('error' in payload && payload.error ? payload.error : 'Failed to load ComfyUI options.');
  }

  return {
    baseUrl: payload.baseUrl || '',
    online: Boolean(payload.online),
    error: payload.error || '',
    checkpoints: Array.isArray(payload.checkpoints) ? payload.checkpoints.filter((entry): entry is string => typeof entry === 'string') : [],
    loras: Array.isArray(payload.loras) ? payload.loras.filter((entry): entry is string => typeof entry === 'string') : [],
    upscaleModels: Array.isArray(payload.upscaleModels)
      ? payload.upscaleModels.filter((entry): entry is string => typeof entry === 'string')
      : [],
    defaultCheckpoint: typeof payload.defaultCheckpoint === 'string' ? payload.defaultCheckpoint : '',
    missingNodes: Array.isArray(payload.missingNodes)
      ? payload.missingNodes
          .filter(
            (entry): entry is { workflowKind: 'sprite' | 'cg'; nodeId: number; nodeType: string; nodeTitle: string } =>
              Boolean(
                entry &&
                  (entry.workflowKind === 'sprite' || entry.workflowKind === 'cg') &&
                  typeof entry.nodeId === 'number' &&
                  Number.isFinite(entry.nodeId) &&
                  typeof entry.nodeType === 'string',
              ),
          )
          .map((entry) => ({
            workflowKind: entry.workflowKind,
            nodeId: entry.nodeId,
            nodeType: entry.nodeType,
            nodeTitle: typeof entry.nodeTitle === 'string' ? entry.nodeTitle : '',
          }))
      : [],
  };
}

export async function generateComfyImage(payload: {
  workflowKind: 'sprite' | 'cg';
  characterName: string;
  label: string;
  variantNumber: number;
  prompt: string;
  negativePrompt?: string;
  checkpoint: string;
  steps?: number;
  upscaleModel: string;
  loras: AutomaticGenerationLora[];
  latentWidth?: number;
  latentHeight?: number;
  skipFaceDetailer?: boolean;
  skipBackgroundRemoval?: boolean;
  generateDepthMap?: boolean;
  generateAnimationFrames?: boolean;
  animationFramePrompts?: {
    closedEyes?: string;
    openMouth?: string;
  };
}, options?: { signal?: AbortSignal }): Promise<{
  dataUrl: string;
  fileName: string;
  filePath: string;
  mimeType: string;
  depthMap?: {
    dataUrl: string;
    fileName: string;
    filePath: string;
    mimeType: string;
  };
  animationFrames?: {
    closedEyes?: {
      dataUrl: string;
      fileName: string;
      filePath: string;
      mimeType: string;
    };
    openMouth?: {
      dataUrl: string;
      fileName: string;
      filePath: string;
      mimeType: string;
    };
  };
  depthMapError?: string;
}> {
  const response = await fetch('/api/studio/comfy/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: options?.signal,
  });

  const json = (await response.json()) as ComfyGeneratedImageResponse;
  if (!response.ok || !json.image) {
    throw new Error(json.error || 'Failed to generate image with ComfyUI.');
  }

  return {
    dataUrl: json.image.dataUrl,
    fileName: json.image.fileName,
    filePath: json.image.filePath,
    mimeType: json.image.mimeType,
    depthMap: json.image.depthMap,
    animationFrames: json.image.animationFrames,
    depthMapError: json.image.depthMapError,
  };
}

function isAffinityUpdate(value: unknown): value is AffinityUpdate {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return (
    candidate.enabled === true &&
    typeof candidate.value === 'number' &&
    typeof candidate.previousValue === 'number' &&
    typeof candidate.delta === 'number'
  );
}

function isLustUpdate(value: unknown): value is LustUpdate {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return (
    candidate.enabled === true &&
    typeof candidate.value === 'number' &&
    typeof candidate.previousValue === 'number' &&
    typeof candidate.delta === 'number'
  );
}

export async function generateComfyDepthMap(payload: {
  imageDataUrl: string;
  characterName: string;
  label: string;
  variantNumber: number;
}, options?: { signal?: AbortSignal }): Promise<{
  dataUrl: string;
  fileName: string;
  filePath: string;
  mimeType: string;
}> {
  const response = await fetch('/api/studio/comfy/depth-map', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: options?.signal,
  });

  const json = (await response.json()) as ComfyGeneratedImageResponse;
  if (!response.ok || !json.image) {
    throw new Error(json.error || 'Failed to generate depth map with ComfyUI.');
  }

  return {
    dataUrl: json.image.dataUrl,
    fileName: json.image.fileName,
    filePath: json.image.filePath,
    mimeType: json.image.mimeType,
  };
}

export async function deleteGeneratedComfyAssets(filePaths: string[]): Promise<void> {
  const normalizedFilePaths = Array.from(
    new Set(
      filePaths
        .map((value) => (typeof value === 'string' ? value.trim() : ''))
        .filter(Boolean),
    ),
  );
  if (normalizedFilePaths.length === 0) {
    return;
  }

  const response = await fetch('/api/studio/assets/delete-generated', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ filePaths: normalizedFilePaths }),
  });
  const json = (await response.json()) as { ok?: boolean; error?: string };
  if (!response.ok) {
    throw new Error(json.error || 'Failed to delete generated asset.');
  }
}

export async function createScenarioPackage(
  scenarioId: string,
  options?: { packageName?: string },
): Promise<ScenarioPackage> {
  const response = await fetch('/api/studio/packages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      scenarioId,
      packageName: options?.packageName,
    }),
  });
  const json = (await response.json()) as { package?: ScenarioPackage; error?: string };
  if (!response.ok || !json.package) {
    throw new Error(json.error || 'Failed to create package.');
  }
  return json.package;
}

export async function importScenarioPackage(fileName: string, packageData: string): Promise<{
  package: ScenarioPackage;
  character: StudioCharacter;
  scenario: OneShotScenario;
}> {
  const response = await fetch('/api/studio/packages/import', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fileName, packageData }),
  });
  const json = (await response.json()) as {
    package?: ScenarioPackage;
    character?: StudioCharacter;
    scenario?: OneShotScenario;
    error?: string;
  };
  if (!response.ok || !json.package || !json.character || !json.scenario) {
    throw new Error(json.error || 'Failed to import package.');
  }
  return {
    package: json.package,
    character: json.character,
    scenario: json.scenario,
  };
}

export async function revealScenarioPackage(packageId: string): Promise<void> {
  const response = await fetch(`/api/studio/packages/${packageId}/show-in-explorer`, {
    method: 'POST',
  });
  const json = (await response.json()) as { ok?: boolean; error?: string };
  if (!response.ok) {
    throw new Error(json.error || 'Failed to open package in Explorer.');
  }
}

export async function deleteScenarioPackage(
  packageId: string,
  options?: {
    deleteCharacters?: boolean;
    deleteScenarios?: boolean;
  },
): Promise<{
  deletedPackageIds: string[];
  deletedScenarioIds: string[];
  deletedCharacterIds: string[];
}> {
  const response = await fetch(`/api/studio/packages/${packageId}`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      deleteCharacters: options?.deleteCharacters !== false,
      deleteScenarios: options?.deleteScenarios !== false,
    }),
  });
  const json = (await response.json()) as {
    ok?: boolean;
    deletedPackageIds?: string[];
    deletedScenarioIds?: string[];
    deletedCharacterIds?: string[];
    error?: string;
  };
  if (!response.ok) {
    throw new Error(json.error || 'Failed to delete package.');
  }
  return {
    deletedPackageIds: Array.isArray(json.deletedPackageIds) ? json.deletedPackageIds : [],
    deletedScenarioIds: Array.isArray(json.deletedScenarioIds) ? json.deletedScenarioIds : [],
    deletedCharacterIds: Array.isArray(json.deletedCharacterIds) ? json.deletedCharacterIds : [],
  };
}

const STORED_STUDIO_ASSET_PREFIX = '/api/studio/assets/';
const DATA_URL_PATTERN = /^data:([^;]+);base64,(.*)$/i;

function createClientAssetId(): string {
  return globalThis.crypto?.randomUUID?.() || `client-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function slugAssetPart(value: string, fallback = 'asset'): string {
  const normalized = value
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return normalized || fallback;
}

function getAssetTriggerKey(entity: { name: string; triggers?: string[] }, fallback: string): string {
  const values = entity.triggers && entity.triggers.length > 0 ? entity.triggers : [entity.name];
  const key = values.map((value) => slugAssetPart(value)).filter(Boolean).join('-');
  return key || fallback;
}

function dataUrlToBlob(value: string): Blob | null {
  const match = value.match(DATA_URL_PATTERN);
  if (!match) {
    return null;
  }

  const mimeType = match[1].toLowerCase();
  const base64 = match[2];
  const binary = globalThis.atob(base64);
  const buffer = new ArrayBuffer(binary.length);
  const bytes = new Uint8Array(buffer);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return new Blob([buffer], { type: mimeType });
}

async function uploadStudioAssetReference(
  value: string,
  ownerType: 'character' | 'scenario',
  ownerId: string,
  relativePath: string[],
  fileStem: string,
): Promise<string> {
  if (!value || value.startsWith(STORED_STUDIO_ASSET_PREFIX) || !DATA_URL_PATTERN.test(value)) {
    return value;
  }

  const blob = dataUrlToBlob(value);
  if (!blob) {
    return value;
  }

  const params = new URLSearchParams({
    ownerType,
    ownerId,
    path: relativePath.map((part) => slugAssetPart(part)).join('/'),
    name: slugAssetPart(fileStem),
  });
  const response = await fetch(`/api/studio/assets/upload?${params.toString()}`, {
    method: 'POST',
    headers: { 'Content-Type': blob.type || 'application/octet-stream' },
    body: blob,
  });
  const json = (await response.json()) as { assetUrl?: string; error?: string };
  if (!response.ok || !json.assetUrl) {
    throw new Error(json.error || 'Failed to upload studio asset.');
  }

  return json.assetUrl;
}

async function uploadStudioAssetVariants(
  values: string[],
  ownerType: 'character' | 'scenario',
  ownerId: string,
  relativePath: string[],
  fileStem: string,
): Promise<string[]> {
  const uploaded: string[] = [];
  for (let index = 0; index < values.length; index += 1) {
    uploaded.push(
      await uploadStudioAssetReference(valueOrEmpty(values[index]), ownerType, ownerId, relativePath, `${fileStem}-${index + 1}`),
    );
  }
  return uploaded;
}

function valueOrEmpty(value: string | undefined): string {
  return typeof value === 'string' ? value : '';
}

export interface SaveStudioCharacterPayload {
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
  spriteZones: Record<
    string,
    Array<{ id: string; x: number; y: number; width: number; height: number; prompt: string }>
  >;
  cgs: Array<{ name: string; images: string[]; triggers?: string[] }>;
}

async function prepareStudioCharacterAssets(payload: SaveStudioCharacterPayload): Promise<SaveStudioCharacterPayload> {
  const characterId = payload.id || createClientAssetId();
  const sprites: SaveStudioCharacterPayload['sprites'] = {};
  for (const [assetKey, variants] of Object.entries(payload.sprites)) {
    sprites[assetKey] = await uploadStudioAssetVariants(
      variants,
      'character',
      characterId,
      ['sprites', assetKey],
      assetKey,
    );
  }

  const spriteDepthMaps: SaveStudioCharacterPayload['spriteDepthMaps'] = {};
  for (const [assetKey, variants] of Object.entries(payload.spriteDepthMaps)) {
    spriteDepthMaps[assetKey] = await uploadStudioAssetVariants(
      variants,
      'character',
      characterId,
      ['depthmaps', assetKey],
      `${assetKey}-depthmap`,
    );
  }

  const spriteAnimationFrames: SaveStudioCharacterPayload['spriteAnimationFrames'] = {};
  for (const [assetKey, frames] of Object.entries(payload.spriteAnimationFrames)) {
    spriteAnimationFrames[assetKey] = {
      closedEyes: await uploadStudioAssetVariants(
        frames.closedEyes,
        'character',
        characterId,
        ['Animation', assetKey, 'closed-eyes'],
        `${assetKey}-closed-eyes`,
      ),
      openMouth: await uploadStudioAssetVariants(
        frames.openMouth,
        'character',
        characterId,
        ['Animation', assetKey, 'open-mouth'],
        `${assetKey}-open-mouth`,
      ),
    };
  }

  const customReactions: SaveStudioCharacterPayload['customReactions'] = [];
  for (let index = 0; index < payload.customReactions.length; index += 1) {
    const reaction = payload.customReactions[index];
    const key = getAssetTriggerKey(reaction, `custom-reaction-${index + 1}`);
    const animationFrames = reaction.animationFrames
      ? {
          closedEyes: await uploadStudioAssetVariants(
            reaction.animationFrames.closedEyes,
            'character',
            characterId,
            ['custom-reactions', key, 'Animation', 'closed-eyes'],
            'closed-eyes',
          ),
          openMouth: await uploadStudioAssetVariants(
            reaction.animationFrames.openMouth,
            'character',
            characterId,
            ['custom-reactions', key, 'Animation', 'open-mouth'],
            'open-mouth',
          ),
        }
      : reaction.animationFrames;
    customReactions.push({
      ...reaction,
      sprites: await uploadStudioAssetVariants(
        reaction.sprites,
        'character',
        characterId,
        ['custom-reactions', key, 'sprites'],
        'sprite',
      ),
      depthMaps: reaction.depthMaps
        ? await uploadStudioAssetVariants(
            reaction.depthMaps,
            'character',
            characterId,
            ['custom-reactions', key, 'depthmaps'],
            'depthmap',
          )
        : reaction.depthMaps,
      animationFrames,
    });
  }

  const cgs: SaveStudioCharacterPayload['cgs'] = [];
  for (let index = 0; index < payload.cgs.length; index += 1) {
    const cg = payload.cgs[index];
    const key = getAssetTriggerKey(cg, `cg-${index + 1}`);
    cgs.push({
      ...cg,
      images: await uploadStudioAssetVariants(cg.images, 'character', characterId, ['cgs', key], 'image'),
    });
  }

  return {
    ...payload,
    id: characterId,
    sprites,
    spriteDepthMaps,
    spriteAnimationFrames,
    customReactions,
    cgs,
  };
}

export async function saveStudioCharacter(
  payload: SaveStudioCharacterPayload,
  savedPayload: SaveStudioCharacterPayload = payload,
): Promise<StudioCharacter> {
  const preparedPayload = await prepareStudioCharacterAssets(payload);
  const method = preparedPayload.id ? 'PUT' : 'POST';
  const endpoint = preparedPayload.id ? `/api/studio/characters/${preparedPayload.id}` : '/api/studio/characters';
  const response = await fetch(endpoint, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(preparedPayload),
  });
  const json = (await response.json()) as {
    character?: Partial<StudioCharacter> & Pick<StudioCharacter, 'id' | 'createdAt' | 'updatedAt'>;
    error?: string;
  };
  if (!response.ok || !json.character?.id) {
    throw new Error(json.error || 'Failed to save character.');
  }
  if (
    json.character.name &&
    json.character.sprites &&
    json.character.spriteDepthMaps &&
    json.character.spriteAnimationFrames &&
    json.character.cgs
  ) {
    return json.character as StudioCharacter;
  }
  const fallbackPayload = { ...savedPayload, ...preparedPayload };
  return {
    id: json.character.id,
    name: fallbackPayload.name,
    cardName: fallbackPayload.cardName,
    accentColor: fallbackPayload.accentColor,
    characterNameFontId: fallbackPayload.characterNameFontId,
    characterNameColor: fallbackPayload.characterNameColor,
    blipSound: fallbackPayload.blipSound,
    dialogueQuoteFontId: fallbackPayload.dialogueQuoteFontId,
    dialogueQuoteAnimationPreset: fallbackPayload.dialogueQuoteAnimationPreset,
    dialogueQuoteAnimationSpeed: fallbackPayload.dialogueQuoteAnimationSpeed,
    dialogueQuoteAnimationColor: fallbackPayload.dialogueQuoteAnimationColor,
    sprites: fallbackPayload.sprites,
    spriteDepthMaps: fallbackPayload.spriteDepthMaps,
    spriteAnimationFrames: fallbackPayload.spriteAnimationFrames,
    customReactions: fallbackPayload.customReactions.map((reaction) => ({
      name: reaction.name,
      sprites: reaction.sprites,
      depthMaps: reaction.depthMaps,
      animationFrames: reaction.animationFrames,
      triggers: reaction.triggers,
    })),
    automaticGeneration: fallbackPayload.automaticGeneration,
    spriteZones: fallbackPayload.spriteZones,
    cgs: fallbackPayload.cgs,
    createdAt: json.character.createdAt,
    updatedAt: json.character.updatedAt,
  };
}

export async function deleteStudioCharacter(characterId: string): Promise<void> {
  const response = await fetch(`/api/studio/characters/${characterId}`, {
    method: 'DELETE',
  });
  const json = (await response.json()) as { ok?: boolean; error?: string };
  if (!response.ok) {
    throw new Error(json.error || 'Failed to delete character.');
  }
}

export interface SaveScenarioPayload {
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
    startMessage?: string;
    specialInstructions?: string;
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
}

async function prepareScenarioAssets(payload: SaveScenarioPayload): Promise<SaveScenarioPayload> {
  const scenarioId = payload.id || createClientAssetId();
  const scenes: SaveScenarioPayload['scenes'] = [];
  for (let index = 0; index < payload.scenes.length; index += 1) {
    const scene = payload.scenes[index];
    const sceneId = scene.id || createClientAssetId();
    scenes.push({
      ...scene,
      id: sceneId,
      backgroundDataUrl: await uploadStudioAssetReference(
        scene.backgroundDataUrl,
        'scenario',
        scenarioId,
        ['scenes', sceneId],
        'background',
      ),
      backgroundDepthMapDataUrl: scene.backgroundDepthMapDataUrl
        ? await uploadStudioAssetReference(
            scene.backgroundDepthMapDataUrl,
            'scenario',
            scenarioId,
            ['scenes', sceneId],
            'background-depthmap',
          )
        : scene.backgroundDepthMapDataUrl,
      bgmDataUrl: scene.bgmDataUrl
        ? await uploadStudioAssetReference(scene.bgmDataUrl, 'scenario', scenarioId, ['scenes', sceneId], 'bgm')
        : scene.bgmDataUrl,
      ambientNoiseDataUrl: scene.ambientNoisePresetId
        ? undefined
        : scene.ambientNoiseDataUrl
        ? await uploadStudioAssetReference(
            scene.ambientNoiseDataUrl,
            'scenario',
            scenarioId,
            ['scenes', sceneId],
            'ambient',
          )
        : scene.ambientNoiseDataUrl,
    });
  }

  return {
    ...payload,
    id: scenarioId,
    startSceneId: payload.startSceneId || scenes[0]?.id,
    startingPoints: normalizeScenarioStartingPoints(
      payload.startingPoints,
      scenes,
      payload.startSceneId,
      payload.startMessage,
      payload.specialInstructions,
    ),
    bannerDataUrl: payload.bannerDataUrl
      ? await uploadStudioAssetReference(payload.bannerDataUrl, 'scenario', scenarioId, ['banner'], 'banner')
      : payload.bannerDataUrl,
    scenes,
  };
}

function normalizeScenarioStartingPoints(
  startingPoints: SaveScenarioPayload['startingPoints'],
  scenes: SaveScenarioPayload['scenes'],
  startSceneId?: string,
  defaultStartMessage = '',
  defaultSpecialInstructions = '',
): Array<{
  id?: string;
  name: string;
  sceneId: string;
  startMessage: string;
  specialInstructions: string;
}> {
  const validSceneIds = new Set(scenes.map((scene) => scene.id).filter(Boolean) as string[]);
  const result: Array<{
    id?: string;
    name: string;
    sceneId: string;
    startMessage: string;
    specialInstructions: string;
  }> = [];

  for (const point of startingPoints || []) {
    const sceneId = point.sceneId || '';
    const name = point.name.trim();
    if (!sceneId || !validSceneIds.has(sceneId)) {
      continue;
    }

    result.push({
      id: point.id || createClientAssetId(),
      name: name || scenes.find((scene) => scene.id === sceneId)?.name || `Start ${result.length + 1}`,
      sceneId,
      startMessage: (point.startMessage || '').trim(),
      specialInstructions: (point.specialInstructions || '').trim(),
    });

    if (result.length >= 5) {
      break;
    }
  }

  if (result.length === 0 && scenes[0]?.id) {
    const fallbackSceneId = validSceneIds.has(startSceneId || '') ? startSceneId! : scenes[0].id!;
    result.push({
      id: createClientAssetId(),
      name: scenes.find((scene) => scene.id === fallbackSceneId)?.name || 'Default',
      sceneId: fallbackSceneId,
      startMessage: defaultStartMessage.trim(),
      specialInstructions: defaultSpecialInstructions.trim(),
    });
  }

  return result;
}

export async function saveScenario(payload: SaveScenarioPayload): Promise<OneShotScenario> {
  const preparedPayload = await prepareScenarioAssets(payload);
  const method = preparedPayload.id ? 'PUT' : 'POST';
  const endpoint = preparedPayload.id ? `/api/studio/scenarios/${preparedPayload.id}` : '/api/studio/scenarios';
  const response = await fetch(endpoint, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(preparedPayload),
  });
  const json = (await response.json()) as { scenario?: OneShotScenario; error?: string };
  if (!response.ok || !json.scenario) {
    throw new Error(json.error || 'Failed to save scenario.');
  }
  return json.scenario;
}

export async function deleteScenario(scenarioId: string): Promise<void> {
  const response = await fetch(`/api/studio/scenarios/${scenarioId}`, {
    method: 'DELETE',
  });
  const json = (await response.json()) as { ok?: boolean; error?: string };
  if (!response.ok) {
    throw new Error(json.error || 'Failed to delete scenario.');
  }
}

export async function createScenarioRun(payload: {
  scenarioId: string;
  title: string;
  messages: ConversationMessage[];
  currentSceneId?: string;
  startingPointId?: string;
}): Promise<ScenarioRun> {
  const response = await fetch('/api/studio/runs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const json = (await response.json()) as { run?: ScenarioRun; error?: string };
  if (!response.ok || !json.run) {
    throw new Error(json.error || 'Failed to create scenario run.');
  }
  return json.run;
}

export async function updateScenarioRunMessages(
  runId: string,
  messages: ConversationMessage[],
  currentSceneId?: string,
): Promise<ScenarioRun> {
  const response = await fetch(`/api/studio/runs/${runId}/messages`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages, currentSceneId }),
  });
  const json = (await response.json()) as { run?: ScenarioRun; error?: string };
  if (!response.ok || !json.run) {
    throw new Error(json.error || 'Failed to update run.');
  }
  return json.run;
}

export async function deleteScenarioRun(runId: string): Promise<void> {
  const response = await fetch(`/api/studio/runs/${runId}`, {
    method: 'DELETE',
  });
  const json = (await response.json()) as { ok?: boolean; error?: string };
  if (!response.ok) {
    throw new Error(json.error || 'Failed to delete run.');
  }
}

export async function requestShutdown(): Promise<void> {
  await fetch('/api/system/shutdown', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
}
