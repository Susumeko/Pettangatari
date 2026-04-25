import express from 'express';
import { randomUUID } from 'node:crypto';
import { appConfig } from '../config.js';
import { SillyTavernClient } from '../sillytavern/client.js';
import {
  buildContinueTurnInstruction,
  buildDescribeTurnInstruction,
  buildSessionAuxiliaryPrompt,
  buildThinkingTurnInstruction,
} from '../sillytavern/auxiliaryPrompt.js';
import {
  getSillyTavernBaseUrl,
  normalizeSillyTavernBaseUrl,
  setSillyTavernBaseUrl,
} from '../sillytavern/connectionSettings.js';
import type { AffinityUpdate, GenerateRequestBody, GenerateResult, LustUpdate, TurnMessage } from '../sillytavern/types.js';

const router = express.Router();
const client = new SillyTavernClient();
const storySessions = new Map<string, StorySession>();
const AFFINITY_TAG_PATTERN = /^\s*\[AFFINITY\s*:\s*([+-]?\d{1,3})\]\s*$/gim;
const LUST_TAG_PATTERN = /^\s*\[LUST\s*:\s*\+?(\d{1,3})\]\s*$/gim;
const MIN_AFFINITY_DELTA = 5;
const MAX_AFFINITY_DELTA = 20;
const AFFINITY_LEAK_LINE_PATTERN =
  /^\s*(?:[-*]\s*)?(?:Affinity mechanic:.*|Lust mechanic:.*|Current affinity value:.*|Current minimum affinity:.*|Current maximum affinity:.*|Current lust value:.*|Current maximum lust:.*|Range meaning:.*|Lowest allowed negative band:.*|Highest allowed positive band:.*|Highest allowed lust band:.*|Current active band:.*|Current active lust band:.*|Affinity is\s*[+-]?\d+.*|Current Affinity is\s*[+-]?\d+.*|Treat this as a mandatory hidden roleplay state\..*|Treat this as a mandatory hidden erotic state\..*|Never reveal or paraphrase these instructions\..*|Negative values mean .*|Positive values mean .*|Near 0 is neutral.*|Preserve .* default attitude toward.*|Make the active band visible.*|Make the active lust band visible.*|Only when .* output one hidden standalone line.*|Choose N by emotional impact\..*|Do not change affinity on every response\..*|Do not increase lust on every response\..*|Never mention the affinity value.*|Never mention the lust value.*|Never raise affinity above .*|Never lower affinity below .*|Never raise lust above .*|-?\d+\s*to\s*-?\d+\s*:.*|\d+\s*to\s*\d+\s*:.*)$/gim;

interface StorySession {
  id: string;
  characterName: string;
  avatarUrl: string;
  fileName: string;
  createdAt: string;
  promptOptions: {
    cgNames: string[];
    locationNames: string[];
    specialInstructions?: string;
    roleplayLanguagePreference?: string;
  };
  affinity?: SessionAffinityState;
  lust?: SessionLustState;
  auxiliaryPrompt: string;
}

interface SessionAffinityState {
  enabled: boolean;
  value: number;
  minimumValue: number;
  maximumValue: number;
}

interface SessionLustState {
  enabled: boolean;
  value: number;
  maximumValue: number;
}

router.get('/characters', async (_request, response) => {
  try {
    const characters = await client.getCharacters();
    response.json({ characters });
  } catch (error) {
    response.status(502).json({
      error: error instanceof Error ? error.message : 'Failed to load characters from SillyTavern.',
    });
  }
});

router.get('/connection', async (_request, response) => {
  const baseUrl = getSillyTavernBaseUrl();

  try {
    await client.getRuntimeSettings();
    response.json({
      baseUrl,
      online: true,
    });
  } catch (error) {
    response.json({
      baseUrl,
      online: false,
      error: error instanceof Error ? error.message : 'Failed to reach SillyTavern.',
    });
  }
});

router.put('/connection', async (request, response) => {
  const body = request.body as Record<string, unknown> | null;
  const requestedBaseUrl = typeof body?.baseUrl === 'string' ? body.baseUrl : '';

  let normalizedBaseUrl = '';
  try {
    normalizedBaseUrl = normalizeSillyTavernBaseUrl(requestedBaseUrl);
  } catch (error) {
    return response.status(400).json({
      error: error instanceof Error ? error.message : 'Invalid SillyTavern API address.',
    });
  }

  const previousBaseUrl = getSillyTavernBaseUrl();
  setSillyTavernBaseUrl(normalizedBaseUrl, { persist: false });
  client.resetConnection();

  try {
    const [characters, runtime] = await Promise.all([client.getCharacters(), client.getRuntimeSettings()]);
    setSillyTavernBaseUrl(normalizedBaseUrl);

    return response.json({
      baseUrl: normalizedBaseUrl,
      online: true,
      characters,
      runtime,
      streamingDefault: appConfig.sillyTavern.streamingDefault,
    });
  } catch (error) {
    setSillyTavernBaseUrl(previousBaseUrl, { persist: false });
    client.resetConnection();

    return response.status(502).json({
      baseUrl: previousBaseUrl,
      online: false,
      error: error instanceof Error ? error.message : 'Failed to connect to SillyTavern.',
    });
  }
});

router.get('/runtime', async (_request, response) => {
  try {
    const runtime = await client.getRuntimeSettings();
    response.json({
      runtime,
      streamingDefault: appConfig.sillyTavern.streamingDefault,
      connectedBaseUrl: getSillyTavernBaseUrl(),
    });
  } catch (error) {
    response.status(502).json({
      error: error instanceof Error ? error.message : 'Failed to load runtime settings.',
      runtime: {
        chatCompletionSource: appConfig.sillyTavern.defaultChatCompletionSource,
        model: appConfig.sillyTavern.defaultModel,
      },
      streamingDefault: appConfig.sillyTavern.streamingDefault,
      connectedBaseUrl: getSillyTavernBaseUrl(),
    });
  }
});

router.post('/session/start', async (request, response) => {
  const body = parseSessionStartBody(request.body);
  if (!body) {
    return response.status(400).json({ error: 'Invalid session start body.' });
  }

  try {
    const promptOptions = {
      cgNames: body.cgNames || [],
      locationNames: body.locationNames || [],
      specialInstructions: body.specialInstructions,
      roleplayLanguagePreference: body.roleplayLanguagePreference,
    };
    const auxiliaryPrompt = buildSessionAuxiliaryPrompt({
      characterName: body.characterName,
      ...promptOptions,
      affinity: body.affinity,
      lust: body.lust,
    });

    const avatarUrl = await resolveAvatarUrl(body.characterName, body.avatarUrl);
    const fileName = `Pettangatari - ${new Date().toISOString().replace(/[:.]/g, '-')}`;
    const session: StorySession = {
      id: randomUUID(),
      characterName: body.characterName,
      avatarUrl,
      fileName,
      createdAt: new Date().toISOString(),
      promptOptions,
      affinity: body.affinity,
      lust: body.lust,
      auxiliaryPrompt,
    };

    await persistSessionChat(session, []);
    storySessions.set(session.id, session);

    return response.json({
      sessionId: session.id,
      chatFileName: session.fileName,
      characterName: session.characterName,
      avatarUrl: session.avatarUrl,
      firstMes: body.firstMes?.trim() || '',
    });
  } catch (error) {
    return response.status(502).json({
      error: error instanceof Error ? error.message : 'Failed to create SillyTavern chat session.',
    });
  }
});

router.post('/generate', async (request, response) => {
  const parsedBody = parseGenerateBody(request.body);
  if (!parsedBody) {
    return response.status(400).json({ error: 'Invalid request body.' });
  }

  const abortController = new AbortController();
  let responseFinished = false;
  response.on('close', () => {
    if (!responseFinished) {
      abortController.abort();
    }
  });

  const session = parsedBody.sessionId ? storySessions.get(parsedBody.sessionId) : undefined;
  if (parsedBody.sessionId && !session) {
    return response.status(400).json({ error: 'Story session not found. Start a new story from the main menu.' });
  }

  if (parsedBody.thinkingTurn) {
    parsedBody.turnInstruction = buildThinkingTurnInstruction({
      characterName: session?.characterName || parsedBody.character?.name,
    });
  }

  if (parsedBody.describeTurn) {
    parsedBody.turnInstruction = buildDescribeTurnInstruction({
      characterName: session?.characterName || parsedBody.character?.name,
    });
  }

  if (parsedBody.continueTurn) {
    parsedBody.turnInstruction = buildContinueTurnInstruction({
      characterName: session?.characterName || parsedBody.character?.name,
    });
  }

  if (session) {
    try {
      await persistSessionChat(session, parsedBody.messages);
    } catch (error) {
      return response.status(502).json({
        error: error instanceof Error ? error.message : 'Failed to persist chat state in SillyTavern.',
      });
    }
  }

  if (parsedBody.stream) {
    response.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    response.setHeader('Cache-Control', 'no-cache, no-transform');
    response.setHeader('Connection', 'keep-alive');
    response.flushHeaders();

    const sendSse = (event: string, data: Record<string, unknown>) => {
      response.write(`event: ${event}\n`);
      response.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    let generationStarted = false;

    try {
      const result = await client.streamGenerate(
        parsedBody,
        {
          onGenerationStarted: () => {
            generationStarted = true;
            sendSse('generation-start', {});
          },
          onToken: (_token, aggregate) => {
            sendSse('token', { text: stripAffinityMarkup(aggregate) });
          },
        },
        session
          ? {
              id: session.id,
              fileName: session.fileName,
              avatarUrl: session.avatarUrl,
              characterName: session.characterName,
              auxiliaryPrompt: getSessionAuxiliaryPrompt(session),
          }
        : undefined,
        { signal: abortController.signal },
      );

      const affinityAppliedResult = session ? applyAffinityUpdate(session, result) : result;
      const finalizedResult = session ? applyLustUpdate(session, affinityAppliedResult) : affinityAppliedResult;

      if (session) {
        await persistSessionChat(session, buildPersistedGeneratedMessages(parsedBody, finalizedResult.text));
      }

      sendSse('done', {
        text: finalizedResult.text,
        model: finalizedResult.model,
        responseMs: finalizedResult.responseMs,
        generationStarted,
        affinity: finalizedResult.affinity,
        lust: finalizedResult.lust,
      });
      responseFinished = true;
      response.end();
    } catch (error) {
      if (isAbortError(error)) {
        responseFinished = true;
        response.end();
        return;
      }
      sendSse('error', {
        error: error instanceof Error ? error.message : 'Streaming request failed.',
      });
      responseFinished = true;
      response.end();
    }

    return;
  }

  try {
    const result = await client.generate(
      parsedBody,
      session
        ? {
            id: session.id,
            fileName: session.fileName,
            avatarUrl: session.avatarUrl,
            characterName: session.characterName,
            auxiliaryPrompt: getSessionAuxiliaryPrompt(session),
        }
      : undefined,
      { signal: abortController.signal },
    );
    const affinityAppliedResult = session ? applyAffinityUpdate(session, result) : result;
    const finalizedResult = session ? applyLustUpdate(session, affinityAppliedResult) : affinityAppliedResult;
    if (session) {
      await persistSessionChat(session, buildPersistedGeneratedMessages(parsedBody, finalizedResult.text));
    }
    responseFinished = true;
    return response.json(finalizedResult);
  } catch (error) {
    if (isAbortError(error)) {
      responseFinished = true;
      return response.status(499).json({ error: 'Generation stopped.' });
    }
    return response.status(502).json({
      error: error instanceof Error ? error.message : 'Generation failed.',
    });
  }
});

async function persistSessionChat(session: StorySession, messages: TurnMessage[]): Promise<void> {
  const header = {
    chat_metadata: {
      pettangatari: true,
      pettangatari_session_id: session.id,
      pettangatari_created_at: session.createdAt,
      pettangatari_affinity: session.affinity?.enabled
        ? {
            value: session.affinity.value,
            minimumValue: session.affinity.minimumValue,
            maximumValue: session.affinity.maximumValue,
          }
        : undefined,
      pettangatari_lust: session.lust?.enabled
        ? {
            value: session.lust.value,
            maximumValue: session.lust.maximumValue,
          }
        : undefined,
    },
    user_name: 'unused',
    character_name: 'unused',
  };

  const now = Date.now();
  const body = messages.map((message, index) => ({
    name: message.role === 'user' ? 'User' : session.characterName,
    is_user: message.role === 'user',
    is_system: false,
    send_date: new Date(now + index).toISOString(),
    mes: message.content,
    extra: {
      source: 'pettangatari',
    },
  }));

  await client.saveCharacterChat(session.avatarUrl, session.fileName, [header, ...body]);
}

function buildPersistedGeneratedMessages(body: GenerateRequestBody, assistantText: string): TurnMessage[] {
  if (!body.continueTurn) {
    return [...body.messages, { role: 'assistant', content: assistantText }];
  }

  const lastAssistantIndex = findLastAssistantMessageIndex(body.messages);
  if (lastAssistantIndex < 0) {
    return [...body.messages, { role: 'assistant', content: assistantText }];
  }

  return body.messages.map((message, index) =>
    index === lastAssistantIndex
      ? { ...message, content: appendAssistantContinuation(message.content, assistantText) }
      : message,
  );
}

function findLastAssistantMessageIndex(messages: TurnMessage[]): number {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index].role === 'assistant') {
      return index;
    }
  }

  return -1;
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

function clampNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }

  return Math.min(max, Math.max(min, Math.round(value)));
}

function stripAffinityMarkup(text: string): string {
  AFFINITY_TAG_PATTERN.lastIndex = 0;
  LUST_TAG_PATTERN.lastIndex = 0;
  AFFINITY_LEAK_LINE_PATTERN.lastIndex = 0;
  return text
    .replace(AFFINITY_TAG_PATTERN, '')
    .replace(LUST_TAG_PATTERN, '')
    .replace(AFFINITY_LEAK_LINE_PATTERN, '')
    .replace(/<\/?relationship_state[^>]*>/gim, '')
    .replace(/\n?\s*\[AFFINITY\s*:\s*[+-]?\d{0,3}$/i, '')
    .replace(/\n?\s*\[LUST\s*:\s*\+?\d{0,3}$/i, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function getSessionAuxiliaryPrompt(session: StorySession): string {
  session.auxiliaryPrompt = buildSessionAuxiliaryPrompt({
    characterName: session.characterName,
    ...session.promptOptions,
    affinity: session.affinity,
    lust: session.lust,
  });

  return session.auxiliaryPrompt;
}

function applyAffinityUpdate(session: StorySession, result: GenerateResult): GenerateResult {
  if (!session.affinity?.enabled) {
    return {
      ...result,
      text: stripAffinityMarkup(result.text),
    };
  }

  let requestedDelta = 0;
  AFFINITY_TAG_PATTERN.lastIndex = 0;
  for (const match of result.text.matchAll(AFFINITY_TAG_PATTERN)) {
    requestedDelta = Number(match[1] || 0);
  }

  const previousValue = session.affinity.value;
  const safeDelta =
    requestedDelta === 0
      ? 0
      : Math.sign(requestedDelta) *
        clampNumber(Math.abs(Math.round(requestedDelta)), MIN_AFFINITY_DELTA, MAX_AFFINITY_DELTA);
  const nextValue = clampNumber(previousValue + safeDelta, session.affinity.minimumValue, session.affinity.maximumValue);
  const appliedDelta = nextValue - previousValue;
  session.affinity.value = nextValue;
  getSessionAuxiliaryPrompt(session);

  const affinity: AffinityUpdate | undefined =
    appliedDelta !== 0
      ? {
          enabled: true,
          value: nextValue,
          previousValue,
          delta: appliedDelta,
        }
      : undefined;

  return {
    ...result,
    text: stripAffinityMarkup(result.text),
    affinity,
  };
}

function applyLustUpdate(session: StorySession, result: GenerateResult): GenerateResult {
  if (!session.lust?.enabled) {
    return {
      ...result,
      text: stripAffinityMarkup(result.text),
    };
  }

  let requestedDelta = 0;
  LUST_TAG_PATTERN.lastIndex = 0;
  for (const match of result.text.matchAll(LUST_TAG_PATTERN)) {
    requestedDelta = Number(match[1] || 0);
  }

  const previousValue = session.lust.value;
  const safeDelta =
    requestedDelta <= 0 ? 0 : clampNumber(Math.abs(Math.round(requestedDelta)), MIN_AFFINITY_DELTA, MAX_AFFINITY_DELTA);
  const nextValue = clampNumber(previousValue + safeDelta, 0, session.lust.maximumValue);
  const appliedDelta = nextValue - previousValue;
  session.lust.value = nextValue;
  getSessionAuxiliaryPrompt(session);
  const lust: LustUpdate | undefined =
    appliedDelta !== 0
      ? {
          enabled: true,
          value: nextValue,
          previousValue,
          delta: appliedDelta,
        }
      : undefined;
  return {
    ...result,
    text: stripAffinityMarkup(result.text),
    lust,
  };
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

function parseSessionStartBody(
  body: unknown,
): {
  characterName: string;
  avatarUrl?: string;
  firstMes?: string;
  cgNames?: string[];
  locationNames?: string[];
  specialInstructions?: string;
  roleplayLanguagePreference?: string;
  affinity?: SessionAffinityState;
  lust?: SessionLustState;
} | null {
  if (!body || typeof body !== 'object') {
    return null;
  }

  const candidate = body as Record<string, unknown>;
  const characterName = asOptionalString(candidate.characterName)?.trim();
  if (!characterName) {
    return null;
  }

  const avatarUrl = asOptionalString(candidate.avatarUrl)?.trim() || undefined;
  const firstMes = asOptionalString(candidate.firstMes)?.trim() || undefined;
  const specialInstructions = asOptionalString(candidate.specialInstructions)?.trim() || undefined;
  const roleplayLanguagePreference = asOptionalString(candidate.roleplayLanguagePreference)?.trim() || undefined;
  const cgNames = Array.isArray(candidate.cgNames)
    ? candidate.cgNames
        .map((entry) => (typeof entry === 'string' ? normalizeReactionName(entry) : ''))
        .filter((entry): entry is string => Boolean(entry))
    : [];
  const locationNames = Array.isArray(candidate.locationNames)
    ? candidate.locationNames
        .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
        .filter((entry) => /^[^\[\]\n\r:]{1,80}$/.test(entry))
    : [];
  const uniqueCgNames = Array.from(new Set(cgNames));
  const uniqueLocationNames = Array.from(new Set(locationNames));
  const affinityRecord =
    candidate.affinity && typeof candidate.affinity === 'object' && !Array.isArray(candidate.affinity)
      ? (candidate.affinity as Record<string, unknown>)
      : null;
  const affinityEnabled = affinityRecord?.enabled === true;
  const minimumValue = clampNumber(Number(affinityRecord?.minimumValue ?? -100), -120, 0);
  const maximumValue = clampNumber(Number(affinityRecord?.maximumValue ?? 100), 0, 120);
  const affinity: SessionAffinityState | undefined = affinityEnabled
    ? {
        enabled: true,
        value: clampNumber(
          Number(affinityRecord?.startingValue ?? affinityRecord?.value ?? 1),
          minimumValue,
          Math.max(minimumValue, maximumValue),
        ),
        minimumValue,
        maximumValue: Math.max(minimumValue, maximumValue),
      }
    : undefined;
  const lustRecord =
    candidate.lust && typeof candidate.lust === 'object' && !Array.isArray(candidate.lust)
      ? (candidate.lust as Record<string, unknown>)
      : null;
  const lustEnabled = lustRecord?.enabled === true;
  const lustMaximumValue = clampNumber(Number(lustRecord?.maximumValue ?? 40), 0, 100);
  const lust: SessionLustState | undefined = lustEnabled
    ? {
        enabled: true,
        value: clampNumber(Number(lustRecord?.startingValue ?? lustRecord?.value ?? 0), 0, lustMaximumValue),
        maximumValue: lustMaximumValue,
      }
    : undefined;

  return {
    characterName,
    avatarUrl,
    firstMes,
    cgNames: uniqueCgNames,
    locationNames: uniqueLocationNames,
    specialInstructions,
    roleplayLanguagePreference,
    affinity,
    lust,
  };
}

async function resolveAvatarUrl(characterName: string, avatarUrl?: string): Promise<string> {
  if (avatarUrl) {
    return avatarUrl;
  }

  const characters = await client.getCharacters();
  const matched = characters.find((character) => character.name === characterName);
  if (matched?.avatar) {
    return matched.avatar;
  }

  return `${characterName}.png`;
}

function parseGenerateBody(body: unknown): GenerateRequestBody | null {
  if (!body || typeof body !== 'object') {
    return null;
  }

  const candidate = body as Record<string, unknown>;
  if (!Array.isArray(candidate.messages) || typeof candidate.stream !== 'boolean') {
    return null;
  }

  const validMessages: TurnMessage[] = [];

  for (const message of candidate.messages) {
    if (!message || typeof message !== 'object') {
      continue;
    }

    const record = message as Record<string, unknown>;
    const role = record.role;
    const content = record.content;

    if ((role === 'user' || role === 'assistant') && typeof content === 'string') {
      validMessages.push({ role, content });
    }
  }

  return {
    stream: candidate.stream,
    messages: validMessages,
    sessionId: asOptionalString(candidate.sessionId),
    thinkingTurn: candidate.thinkingTurn === true,
    continueTurn: candidate.continueTurn === true,
    describeTurn: candidate.describeTurn === true,
    turnInstruction: asOptionalString(candidate.turnInstruction)?.trim() || undefined,
    character:
      candidate.character && typeof candidate.character === 'object'
        ? {
            name: asOptionalString((candidate.character as Record<string, unknown>).name),
            description: asOptionalString((candidate.character as Record<string, unknown>).description),
            personality: asOptionalString((candidate.character as Record<string, unknown>).personality),
            scenario: asOptionalString((candidate.character as Record<string, unknown>).scenario),
            first_mes: asOptionalString((candidate.character as Record<string, unknown>).first_mes),
            mes_example: asOptionalString((candidate.character as Record<string, unknown>).mes_example),
            system_prompt: asOptionalString((candidate.character as Record<string, unknown>).system_prompt),
            post_history_instructions: asOptionalString(
              (candidate.character as Record<string, unknown>).post_history_instructions,
            ),
          }
        : undefined,
  };
}

function asOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function normalizeReactionName(value: string): string {
  return value
    .replace(/[\[\]]/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')
    .toUpperCase();
}

export { router as sillyTavernRouter };
