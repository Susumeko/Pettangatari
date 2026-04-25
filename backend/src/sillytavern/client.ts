import { appConfig } from '../config.js';
import { getSillyTavernBaseUrl } from './connectionSettings.js';
import {
  extractRuntimeFromSettings,
  extractTextFromFinalResponse,
  extractTokenFromStreamPayload,
} from './parser.js';
import type {
  GenerateRequestBody,
  GenerateResult,
  RuntimeGenerationSettings,
  SillyTavernCharacter,
  TurnMessage,
} from './types.js';

const CSRF_TOKEN_ENDPOINT = '/csrf-token';

function normalizeUrl(baseUrl: string, endpoint: string): string {
  if (endpoint.startsWith('http://') || endpoint.startsWith('https://')) {
    return endpoint;
  }
  return `${baseUrl.replace(/\/$/, '')}/${endpoint.replace(/^\//, '')}`;
}

async function parseJsonSafe(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

interface SessionGenerationContext {
  id: string;
  fileName: string;
  avatarUrl: string;
  characterName: string;
  auxiliaryPrompt?: string;
}

interface GenerationOptions {
  signal?: AbortSignal;
}

export class SillyTavernClient {
  private csrfToken = '';
  private cookieHeader = '';
  private sessionGenerateUnavailable = false;

  resetConnection(): void {
    this.csrfToken = '';
    this.cookieHeader = '';
    this.sessionGenerateUnavailable = false;
  }

  async getCharacters(): Promise<SillyTavernCharacter[]> {
    const response = await this.postJson(appConfig.sillyTavern.charactersEndpoint, {});

    if (!response.ok) {
      throw new Error(`Character request failed (${response.status})`);
    }

    const payload = await parseJsonSafe(response);
    if (!Array.isArray(payload)) {
      return [];
    }

    return payload
      .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object'))
      .map((item) => {
        const data =
          item.data && typeof item.data === 'object'
            ? ({ ...(item.data as Record<string, unknown>) } as SillyTavernCharacter['data'])
            : undefined;

        if (data) {
          data.name = asString(data.name);
          data.description = asString(data.description);
          data.personality = asString(data.personality);
          data.scenario = asString(data.scenario);
          data.first_mes = asString(data.first_mes);
          data.mes_example = asString(data.mes_example);
          data.system_prompt = asString(data.system_prompt);
          data.post_history_instructions = asString(data.post_history_instructions);
          data.creator = asString(data.creator);
          data.tags = Array.isArray(data.tags)
            ? (data.tags as unknown[]).filter((tag): tag is string => typeof tag === 'string')
            : undefined;
        }

        return {
          ...item,
          name: typeof item.name === 'string' ? item.name : 'Unnamed Character',
          avatar: typeof item.avatar === 'string' ? item.avatar : undefined,
          data,
        } satisfies SillyTavernCharacter;
      });
  }

  async createCharacterFromCard(card: SillyTavernCharacter): Promise<void> {
    const name = card.data?.name?.trim() || card.name?.trim();
    if (!name) {
      throw new Error('Character card name is required.');
    }

    const tags = Array.isArray(card.data?.tags) ? card.data.tags : [];
    const passthroughRootFields = Object.fromEntries(
      Object.entries(card).filter(([key]) => !['name', 'avatar', 'data'].includes(key)),
    );
    const passthroughCardFields =
      card.data && typeof card.data === 'object'
        ? Object.fromEntries(
            Object.entries(card.data).filter(
              ([key]) =>
                ![
                  'name',
                  'description',
                  'personality',
                  'scenario',
                  'first_mes',
                  'mes_example',
                  'system_prompt',
                  'post_history_instructions',
                  'creator',
                  'tags',
                ].includes(key),
            ),
          )
        : {};

    const payload: Record<string, unknown> = {
      ...passthroughRootFields,
      ...passthroughCardFields,
      ch_name: name,
      description: card.data?.description || '',
      personality: card.data?.personality || '',
      scenario: card.data?.scenario || '',
      first_mes: card.data?.first_mes || '',
      mes_example: card.data?.mes_example || '',
      system_prompt: card.data?.system_prompt || '',
      post_history_instructions: card.data?.post_history_instructions || '',
      creator: card.data?.creator || '',
      tags,
      talkativeness: 0.5,
      fav: false,
    };

    const response = await this.postJson('/api/characters/create', payload);
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`SillyTavern character create failed (${response.status}): ${errorText.slice(0, 220)}`);
    }
  }

  async saveCharacterChat(
    avatarUrl: string,
    fileName: string,
    chat: Array<Record<string, unknown>>,
  ): Promise<void> {
    const ensureResponse = await this.postJson('/api/chats/get', {
      avatar_url: avatarUrl,
      file_name: fileName,
    });

    if (!ensureResponse.ok) {
      const ensureText = await ensureResponse.text();
      throw new Error(`Chat directory check failed (${ensureResponse.status}): ${ensureText.slice(0, 220)}`);
    }

    const response = await this.postJson('/api/chats/save', {
      avatar_url: avatarUrl,
      file_name: fileName,
      chat,
      force: true,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Chat save failed (${response.status}): ${errorText.slice(0, 220)}`);
    }
  }

  async getRuntimeSettings(): Promise<RuntimeGenerationSettings> {
    const settingsResponse = await this.postJson(appConfig.sillyTavern.settingsEndpoint, {});

    if (!settingsResponse.ok) {
      throw new Error(`SillyTavern settings request failed (${settingsResponse.status}).`);
    }

    const settingsPayload = (await parseJsonSafe(settingsResponse)) as Record<string, unknown> | null;
    if (!settingsPayload) {
      throw new Error('SillyTavern settings payload was empty.');
    }

    try {
      const parsedSettings = parseSettingsPayload(settingsPayload.settings ?? settingsPayload);
      const runtime = extractRuntimeFromSettings(
        parsedSettings,
        appConfig.sillyTavern.defaultChatCompletionSource,
        appConfig.sillyTavern.defaultModel,
      );

      if (!runtime.model) {
        const statusModel = await this.getFirstStatusModel(runtime.chatCompletionSource);
        runtime.model = statusModel || appConfig.sillyTavern.defaultModel;
      }

      return runtime;
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'Unknown parser error.';
      throw new Error(`Failed to parse SillyTavern runtime settings: ${reason}`);
    }
  }

  async generate(
    body: GenerateRequestBody,
    session?: SessionGenerationContext,
    options: GenerationOptions = {},
  ): Promise<GenerateResult> {
    const runtime = await this.getRuntimeSettings();
    const startedAt = Date.now();
    const response = await this.resolveGenerationResponse(body, runtime, false, session, options);

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Generation request failed (${response.status}): ${errorText.slice(0, 220)}`);
    }

    const parsed = await parseJsonSafe(response);
    const text = sanitizeAssistantOutput(extractTextFromFinalResponse(parsed));
    const model =
      (parsed && typeof parsed === 'object' && typeof (parsed as Record<string, unknown>).model === 'string'
        ? ((parsed as Record<string, unknown>).model as string)
        : runtime.model) || 'unknown';

    return {
      text,
      model,
      responseMs: Date.now() - startedAt,
    };
  }

  async streamGenerate(
    body: GenerateRequestBody,
    handlers: {
      onToken: (token: string, aggregate: string) => void;
      onGenerationStarted: () => void;
    },
    session?: SessionGenerationContext,
    options: GenerationOptions = {},
  ): Promise<GenerateResult> {
    const runtime = await this.getRuntimeSettings();
    const startedAt = Date.now();
    const response = await this.resolveGenerationResponse(body, runtime, true, session, options);

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Streaming request failed (${response.status}): ${errorText.slice(0, 220)}`);
    }

    if (!response.body) {
      throw new Error('Streaming response body is missing.');
    }

    let fullText = '';
    let model = runtime.model || 'unknown';
    let started = false;

    for await (const eventData of readSseEventData(response.body)) {
      if (eventData === '[DONE]') {
        continue;
      }

      let parsed: unknown;
      try {
        parsed = JSON.parse(eventData);
      } catch {
        continue;
      }

      if (parsed && typeof parsed === 'object') {
        const parsedModel = asString((parsed as Record<string, unknown>).model);
        if (parsedModel) {
          model = parsedModel;
        }
      }

      const token = extractTokenFromStreamPayload(parsed, runtime.chatCompletionSource);
      if (!token) {
        continue;
      }

      if (!started) {
        started = true;
        handlers.onGenerationStarted();
      }

      if (fullText && token.startsWith(fullText)) {
        fullText = token;
      } else {
        fullText += token;
      }
      handlers.onToken(token, sanitizeAssistantOutput(fullText));
    }

    const sanitizedText = sanitizeAssistantOutput(fullText);
    return {
      text: sanitizedText,
      model,
      responseMs: Date.now() - startedAt,
    };
  }

  private async resolveGenerationResponse(
    body: GenerateRequestBody,
    runtime: RuntimeGenerationSettings,
    stream: boolean,
    session?: SessionGenerationContext,
    options: GenerationOptions = {},
  ): Promise<Response> {
    const sessionResponse = await this.trySessionGenerate(body, runtime, stream, session);
    if (sessionResponse) {
      return sessionResponse;
    }

    const payload = this.buildGeneratePayload(body, runtime, stream, session?.auxiliaryPrompt);
    const endpoint = this.resolveGenerateEndpoint();
    return this.postJson(endpoint, payload, options);
  }

  private async trySessionGenerate(
    body: GenerateRequestBody,
    runtime: RuntimeGenerationSettings,
    stream: boolean,
    session?: SessionGenerationContext,
  ): Promise<Response | null> {
    // The dedicated SillyTavern session-generate route has been causing
    // duplicated/restarted replies with the VN-managed chat history.
    // We still persist the session chat file ourselves, but generation
    // should run through the normal payload path exactly once.
    void body;
    void runtime;
    void stream;
    void session;
    return null;
  }

  private buildGeneratePayload(
    body: GenerateRequestBody,
    runtime: RuntimeGenerationSettings,
    stream: boolean,
    auxiliaryPrompt?: string,
  ): Record<string, unknown> {
    const resolvedSource =
      asString(runtime.rawSettings?.chat_completion_source) ||
      runtime.chatCompletionSource ||
      appConfig.sillyTavern.defaultChatCompletionSource;
    const resolvedModel =
      asString(runtime.rawSettings?.model) ||
      runtime.model ||
      appConfig.sillyTavern.defaultModel;

    const effectiveSystemPrompt = getEffectiveSystemPrompt(runtime.globalSettings, body.character);
    const effectivePostHistoryInstruction = getEffectivePostHistoryInstruction(
      runtime.globalSettings,
      body.character,
      undefined,
    );

    const promptParts = [auxiliaryPrompt?.trim(), body.turnInstruction?.trim()].filter(
      (part): part is string => Boolean(part),
    );
    const systemParts = [effectiveSystemPrompt, ...promptParts].filter((part): part is string => Boolean(part?.trim()));

    const messages: Array<{ role: string; content: string }> = body.messages.map((message) => ({
      role: message.role,
      content: message.content,
    }));

    if (systemParts.length > 0) {
      messages.unshift({ role: 'system', content: systemParts.join('\n\n') });
    }

    if (effectivePostHistoryInstruction) {
      messages.push({ role: 'user', content: effectivePostHistoryInstruction });
    }

    const payload: Record<string, unknown> = {
      type: 'normal',
      messages,
      model: resolvedModel,
      chat_completion_source: resolvedSource,
      stream,
    };

    applySavedSillyTavernSettings(payload, runtime.rawSettings, resolvedSource);

    if (typeof runtime.temperature === 'number') {
      payload.temperature = runtime.temperature;
    }
    if (typeof runtime.topP === 'number') {
      payload.top_p = runtime.topP;
    }
    if (typeof runtime.frequencyPenalty === 'number') {
      payload.frequency_penalty = runtime.frequencyPenalty;
    }
    if (typeof runtime.presencePenalty === 'number') {
      payload.presence_penalty = runtime.presencePenalty;
    }
    if (typeof runtime.maxTokens === 'number') {
      payload.max_tokens = runtime.maxTokens;
    }

    return payload;
  }

  private resolveGenerateEndpoint(): string {
    return appConfig.sillyTavern.generateEndpoint;
  }

  private async getFirstStatusModel(chatCompletionSource: string): Promise<string> {
    try {
      const response = await this.postJson(appConfig.sillyTavern.statusEndpoint, {
        chat_completion_source: chatCompletionSource,
      });

      if (!response.ok) {
        return '';
      }

      const payload = await parseJsonSafe(response);
      if (!payload || typeof payload !== 'object') {
        return '';
      }

      const data = (payload as Record<string, unknown>).data;
      if (!Array.isArray(data) || data.length === 0) {
        return '';
      }

      const first = data[0];
      if (!first || typeof first !== 'object') {
        return '';
      }

      return asString((first as Record<string, unknown>).id) || '';
    } catch {
      return '';
    }
  }

  private async postJson(endpoint: string, payload: unknown, options: { signal?: AbortSignal } = {}): Promise<Response> {
    await this.ensureCsrfToken();

    const url = normalizeUrl(getSillyTavernBaseUrl(), endpoint);
    const body = JSON.stringify(payload);

    let response = await fetch(url, {
      method: 'POST',
      headers: this.buildHeaders({ includeContentType: true, includeCsrfToken: true }),
      body,
      signal: options.signal,
    });

    this.captureCookies(response);

    if (response.status === 403) {
      await this.ensureCsrfToken({ forceRefresh: true });
      response = await fetch(url, {
        method: 'POST',
        headers: this.buildHeaders({ includeContentType: true, includeCsrfToken: true }),
        body,
        signal: options.signal,
      });
      this.captureCookies(response);
    }

    return response;
  }

  private buildHeaders(options: {
    includeContentType: boolean;
    includeCsrfToken: boolean;
  }): Headers {
    const headers = new Headers();

    if (options.includeContentType) {
      headers.set('Content-Type', 'application/json');
    }

    if (this.cookieHeader) {
      headers.set('Cookie', this.cookieHeader);
    }

    if (options.includeCsrfToken && this.csrfToken) {
      headers.set('X-CSRF-Token', this.csrfToken);
    }

    Object.entries(appConfig.sillyTavern.headers).forEach(([key, value]) => {
      headers.set(key, value);
    });

    return headers;
  }

  private async ensureCsrfToken(options?: { forceRefresh?: boolean }): Promise<void> {
    if (this.csrfToken && !options?.forceRefresh) {
      return;
    }

    const response = await fetch(normalizeUrl(getSillyTavernBaseUrl(), CSRF_TOKEN_ENDPOINT), {
      method: 'GET',
      headers: this.buildHeaders({ includeContentType: false, includeCsrfToken: false }),
    });

    this.captureCookies(response);

    if (!response.ok) {
      throw new Error(`Failed to fetch SillyTavern CSRF token (${response.status}).`);
    }

    const payload = (await parseJsonSafe(response)) as { token?: unknown } | null;
    const token = payload && typeof payload.token === 'string' ? payload.token : '';

    if (!token) {
      throw new Error('SillyTavern CSRF token response was missing a token value.');
    }

    this.csrfToken = token;
  }

  private captureCookies(response: Response): void {
    const setCookieHeaders = getSetCookieHeaders(response.headers);

    if (setCookieHeaders.length === 0) {
      return;
    }

    const currentCookies = parseCookieHeader(this.cookieHeader);

    for (const setCookie of setCookieHeaders) {
      const firstPart = setCookie.split(';')[0];
      const equalIndex = firstPart.indexOf('=');
      if (equalIndex <= 0) {
        continue;
      }

      const name = firstPart.slice(0, equalIndex).trim();
      const value = firstPart.slice(equalIndex + 1).trim();
      if (!name) {
        continue;
      }

      currentCookies.set(name, value);
    }

    this.cookieHeader = Array.from(currentCookies.entries())
      .map(([name, value]) => `${name}=${value}`)
      .join('; ');
  }
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function parseSettingsPayload(rawSettings: unknown): Record<string, unknown> {
  if (rawSettings && typeof rawSettings === 'object') {
    return rawSettings as Record<string, unknown>;
  }

  if (typeof rawSettings === 'string') {
    const parsed = JSON.parse(rawSettings);
    if (parsed && typeof parsed === 'object') {
      return parsed as Record<string, unknown>;
    }
  }

  throw new Error('`settings` field was not a JSON object.');
}

function getSetCookieHeaders(headers: Headers): string[] {
  const compatibleHeaders = headers as Headers & {
    getSetCookie?: () => string[];
  };

  if (typeof compatibleHeaders.getSetCookie === 'function') {
    return compatibleHeaders.getSetCookie();
  }

  const single = headers.get('set-cookie');
  return single ? [single] : [];
}

const META_SCAFFOLD_LINE_PATTERN =
  /^\s*(?:analysis|script outline|response|thinking|reasoning|plan|internal monologue|chain of thought)\s*:.*$/i;
const META_CONTEXT_LINE_PATTERN = /^\s*(?:previous event|current action|goal)\s*:.*$/i;
const FIRST_TAG_PATTERN = /\[(?:LOCATION(?:\s+CHANGING)?:[^[\]]{1,120}|[A-Z][A-Z _-]{1,80})\]/i;

function sanitizeAssistantOutput(text: string): string {
  if (!text.trim()) {
    return '';
  }

  const filteredLines = text
    .replace(/\r\n/g, '\n')
    .split('\n')
    .filter((line) => !META_SCAFFOLD_LINE_PATTERN.test(line) && !META_CONTEXT_LINE_PATTERN.test(line));
  let cleaned = filteredLines.join('\n').trim();

  const firstTagMatch = FIRST_TAG_PATTERN.exec(cleaned);
  if (firstTagMatch && firstTagMatch.index > 0) {
    const prefix = cleaned.slice(0, firstTagMatch.index);
    if (/(analysis|script outline|response|thinking|reasoning|plan|previous event|current action|goal)/i.test(prefix)) {
      cleaned = cleaned.slice(firstTagMatch.index).trim();
    }
  }

  return cleaned.replace(/\n{3,}/g, '\n\n').trim();
}

function parseCookieHeader(cookieHeader: string): Map<string, string> {
  const map = new Map<string, string>();
  if (!cookieHeader) {
    return map;
  }

  const parts = cookieHeader.split(';');
  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed) {
      continue;
    }

    const equalIndex = trimmed.indexOf('=');
    if (equalIndex <= 0) {
      continue;
    }

    const key = trimmed.slice(0, equalIndex).trim();
    const value = trimmed.slice(equalIndex + 1).trim();
    if (!key) {
      continue;
    }

    map.set(key, value);
  }

  return map;
}

function shouldFallbackFromSessionEndpoint(status: number, bodyText: string): boolean {
  if (status < 400 || !bodyText) {
    return false;
  }

  const text = bodyText.toLowerCase();
  return (
    text.includes('this chat completion source is not supported yet') ||
    text.includes('file not found') ||
    text.includes('chat does not exist or is empty')
  );
}

function applySavedSillyTavernSettings(
  payload: Record<string, unknown>,
  settings: Record<string, unknown> | undefined,
  source: string,
): void {
  if (!settings) {
    return;
  }

  setIfNumber(payload, 'temperature', settings.temp_openai);
  setIfNumber(payload, 'top_p', settings.top_p_openai);
  setIfNumber(payload, 'frequency_penalty', settings.freq_pen_openai);
  setIfNumber(payload, 'presence_penalty', settings.pres_pen_openai);
  setIfNumber(payload, 'max_tokens', settings.openai_max_tokens);
  setIfNumber(payload, 'top_k', settings.top_k_openai);
  setIfNumber(payload, 'min_p', settings.min_p_openai);
  setIfNumber(payload, 'top_a', settings.top_a_openai);
  setIfNumber(payload, 'repetition_penalty', settings.repetition_penalty_openai);
  setIfNumber(payload, 'n', settings.n);

  setIfString(payload, 'custom_prompt_post_processing', settings.custom_prompt_post_processing);
  setIfBoolean(payload, 'include_reasoning', settings.show_thoughts);
  setIfBoolean(payload, 'enable_web_search', settings.enable_web_search);
  setIfBoolean(payload, 'request_images', settings.request_images);
  setIfString(payload, 'request_image_resolution', settings.request_image_resolution);
  setIfString(payload, 'request_image_aspect_ratio', settings.request_image_aspect_ratio);

  const proxySupportedSources = new Set([
    'claude',
    'openai',
    'mistralai',
    'makersuite',
    'vertexai',
    'deepseek',
    'xai',
    'zai',
    'moonshot',
  ]);

  if (proxySupportedSources.has(source)) {
    setIfString(payload, 'reverse_proxy', settings.reverse_proxy);
    setIfString(payload, 'proxy_password', settings.proxy_password);
  }

  if (source === 'azure_openai') {
    setIfString(payload, 'azure_base_url', settings.azure_base_url);
    setIfString(payload, 'azure_deployment_name', settings.azure_deployment_name);
    setIfString(payload, 'azure_api_version', settings.azure_api_version);
  }

  if (source === 'openrouter') {
    setIfBoolean(payload, 'use_fallback', settings.openrouter_use_fallback);
    setIfBoolean(payload, 'allow_fallbacks', settings.openrouter_allow_fallbacks);
    setIfArray(payload, 'provider', settings.openrouter_providers);
    setIfArray(payload, 'quantizations', settings.openrouter_quantizations);
    setIfString(payload, 'middleout', settings.openrouter_middleout);
  }

  if (source === 'custom') {
    setIfString(payload, 'custom_url', settings.custom_url);
    setIfString(payload, 'custom_include_body', settings.custom_include_body);
    setIfString(payload, 'custom_include_headers', settings.custom_include_headers);
    setIfString(payload, 'custom_exclude_body', settings.custom_exclude_body);
  }
}

function setIfString(target: Record<string, unknown>, key: string, value: unknown): void {
  if (typeof value === 'string' && value.trim().length > 0) {
    target[key] = value;
  }
}

function setIfNumber(target: Record<string, unknown>, key: string, value: unknown): void {
  if (typeof value === 'number' && Number.isFinite(value)) {
    target[key] = value;
    return;
  }

  if (typeof value === 'string' && value.trim().length > 0 && !Number.isNaN(Number(value))) {
    target[key] = Number(value);
  }
}

function setIfBoolean(target: Record<string, unknown>, key: string, value: unknown): void {
  if (typeof value === 'boolean') {
    target[key] = value;
    return;
  }

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true' || normalized === 'false') {
      target[key] = normalized === 'true';
    }
  }
}

function setIfArray(target: Record<string, unknown>, key: string, value: unknown): void {
  if (Array.isArray(value)) {
    target[key] = value;
  }
}

function getObject(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : undefined;
}

function toNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string' && value.trim() && !Number.isNaN(Number(value))) {
    return Number(value);
  }

  return undefined;
}

function toBoolean(value: unknown): boolean | undefined {
  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true') {
      return true;
    }
    if (normalized === 'false') {
      return false;
    }
  }

  return undefined;
}

function replaceOriginalMacro(template: string, original: string): string {
  return template.replaceAll('{{original}}', original);
}

function getPowerUserSettings(globalSettings: Record<string, unknown> | undefined): Record<string, unknown> {
  return getObject(globalSettings?.power_user) ?? {};
}

function getGlobalSystemPrompt(globalSettings: Record<string, unknown> | undefined): string {
  const powerUser = getPowerUserSettings(globalSettings);
  const sysprompt = getObject(powerUser.sysprompt) ?? getObject(globalSettings?.sysprompt);
  return (
    asString((sysprompt as Record<string, unknown> | undefined)?.content) ||
    asString(globalSettings?.sysprompt_content) ||
    ''
  );
}

function getGlobalPostHistoryInstruction(globalSettings: Record<string, unknown> | undefined): string {
  const powerUser = getPowerUserSettings(globalSettings);
  const sysprompt = getObject(powerUser.sysprompt) ?? getObject(globalSettings?.sysprompt);
  return (
    asString((sysprompt as Record<string, unknown> | undefined)?.post_history) ||
    asString(globalSettings?.sysprompt_post_history) ||
    asString(globalSettings?.post_history_instructions) ||
    ''
  );
}

function getEffectiveSystemPrompt(
  globalSettings: Record<string, unknown> | undefined,
  character: GenerateRequestBody['character'] | undefined,
): string {
  const powerUser = getPowerUserSettings(globalSettings);
  const preferCharacterPrompt = toBoolean(powerUser.prefer_character_prompt) ?? true;
  const characterPrompt = character?.system_prompt?.trim() || '';
  const globalPrompt = getGlobalSystemPrompt(globalSettings).trim();

  if (preferCharacterPrompt && characterPrompt) {
    return replaceOriginalMacro(characterPrompt, globalPrompt).trim();
  }

  return globalPrompt;
}

function getEffectivePostHistoryInstruction(
  globalSettings: Record<string, unknown> | undefined,
  character: GenerateRequestBody['character'] | undefined,
  override?: string,
): string {
  const overrideText = override?.trim() || '';
  if (overrideText) {
    return overrideText;
  }

  const powerUser = getPowerUserSettings(globalSettings);
  const preferCharacterJailbreak = toBoolean(powerUser.prefer_character_jailbreak) ?? true;
  const characterPostHistory = character?.post_history_instructions?.trim() || '';
  const globalPostHistory = getGlobalPostHistoryInstruction(globalSettings).trim();

  if (preferCharacterJailbreak && characterPostHistory) {
    return replaceOriginalMacro(characterPostHistory, globalPostHistory).trim();
  }

  return globalPostHistory;
}

async function* readSseEventData(stream: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { value, done } = await reader.read();

    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });

    let separatorIndex = buffer.indexOf('\n\n');
    while (separatorIndex !== -1) {
      const eventBlock = buffer.slice(0, separatorIndex);
      buffer = buffer.slice(separatorIndex + 2);

      const dataLines = eventBlock
        .split(/\r?\n/)
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice(5).trimStart());

      if (dataLines.length > 0) {
        yield dataLines.join('\n');
      }

      separatorIndex = buffer.indexOf('\n\n');
    }
  }

  const tail = buffer.trim();
  if (tail) {
    const dataLines = tail
      .split(/\r?\n/)
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).trimStart());

    if (dataLines.length > 0) {
      yield dataLines.join('\n');
    }
  }
}
