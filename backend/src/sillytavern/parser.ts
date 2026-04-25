const MODEL_KEYS_BY_SOURCE: Record<string, string> = {
  claude: 'claude_model',
  openai: 'openai_model',
  makersuite: 'google_model',
  vertexai: 'vertexai_model',
  openrouter: 'openrouter_model',
  ai21: 'ai21_model',
  mistralai: 'mistralai_model',
  custom: 'custom_model',
  cohere: 'cohere_model',
  perplexity: 'perplexity_model',
  groq: 'groq_model',
  siliconflow: 'siliconflow_model',
  electronhub: 'electronhub_model',
  chutes: 'chutes_model',
  nanogpt: 'nanogpt_model',
  deepseek: 'deepseek_model',
  aimlapi: 'aimlapi_model',
  xai: 'xai_model',
  pollinations: 'pollinations_model',
  cometapi: 'cometapi_model',
  moonshot: 'moonshot_model',
  fireworks: 'fireworks_model',
  azure_openai: 'azure_openai_model',
  zai: 'zai_model',
};

export function extractRuntimeFromSettings(
  settings: Record<string, unknown>,
  defaultSource: string,
  defaultModel: string,
): import('./types.js').RuntimeGenerationSettings {
  const mainApi = inferMainApi(settings);
  const oaiSettings = getObject(settings.oai_settings) ?? {};

  const source =
    toString(oaiSettings.chat_completion_source) ||
    toString(settings.chat_completion_source) ||
    defaultSource;
  const modelKey = MODEL_KEYS_BY_SOURCE[source];
  const model =
    (modelKey ? toString(oaiSettings[modelKey]) : '') ||
    toString(oaiSettings.model) ||
    toString(settings.model) ||
    defaultModel;

  return {
    mainApi,
    chatCompletionSource: source,
    model,
    temperature: toNumber(oaiSettings.temp_openai),
    topP: toNumber(oaiSettings.top_p_openai),
    frequencyPenalty: toNumber(oaiSettings.freq_pen_openai),
    presencePenalty: toNumber(oaiSettings.pres_pen_openai),
    maxTokens: toNumber(oaiSettings.openai_max_tokens),
    rawSettings: oaiSettings,
    globalSettings: settings,
  };
}

export function extractTextFromFinalResponse(payload: unknown): string {
  if (!payload || typeof payload !== 'object') {
    return '';
  }

  const data = payload as Record<string, unknown>;

  const openAiMessage = readOpenAiMessageContent(data.choices);
  if (openAiMessage) {
    return openAiMessage;
  }

  const candidates = data.candidates;
  if (Array.isArray(candidates)) {
    const textParts = candidates
      .flatMap((candidate) => {
        if (!candidate || typeof candidate !== 'object') {
          return [];
        }
        const content = (candidate as Record<string, unknown>).content;
        if (!content || typeof content !== 'object') {
          return [];
        }
        const parts = (content as Record<string, unknown>).parts;
        if (!Array.isArray(parts)) {
          return [];
        }

        return parts
          .map((part) => {
            if (!part || typeof part !== 'object') {
              return '';
            }
            return toString((part as Record<string, unknown>).text) || '';
          })
          .filter(Boolean);
      })
      .join('');

    if (textParts) {
      return textParts;
    }
  }

  const direct = toString(data.text) || toString(data.message) || toString(data.output_text) || toString(data.response);
  if (direct) {
    return direct;
  }

  const results = data.results;
  if (Array.isArray(results) && results.length > 0) {
    const first = results[0];
    if (first && typeof first === 'object') {
      const resultText =
        toString((first as Record<string, unknown>).text) ||
        toString((first as Record<string, unknown>).output_text);
      if (resultText) {
        return resultText;
      }
    }
  }

  const completion = data.completion;
  if (typeof completion === 'string') {
    return completion;
  }

  return direct || '';
}

export function extractTokenFromStreamPayload(payload: unknown, source: string): string {
  if (!payload || typeof payload !== 'object') {
    return '';
  }

  const data = payload as Record<string, unknown>;
  if (data.done === true || data.is_finished === true || data.finished === true) {
    return '';
  }

  if (source === 'claude') {
    return toString((data.delta as Record<string, unknown> | undefined)?.text) || '';
  }

  if (source === 'makersuite' || source === 'vertexai') {
    const candidates = data.candidates;
    if (!Array.isArray(candidates) || candidates.length === 0) {
      return '';
    }
    const first = candidates[0];
    if (!first || typeof first !== 'object') {
      return '';
    }
    const content = (first as Record<string, unknown>).content;
    if (!content || typeof content !== 'object') {
      return '';
    }
    const parts = (content as Record<string, unknown>).parts;
    if (!Array.isArray(parts)) {
      return '';
    }

    return parts
      .map((part) => {
        if (!part || typeof part !== 'object') {
          return '';
        }
        return toString((part as Record<string, unknown>).text) || '';
      })
      .join('');
  }

  if (source === 'textgenerationwebui' || source === 'kobold' || source === 'novel') {
    const choices = data.choices;
    if (Array.isArray(choices) && choices.length > 0) {
      const firstChoice = choices[0];
      if (firstChoice && typeof firstChoice === 'object') {
        const choiceObj = firstChoice as Record<string, unknown>;
        const choiceText = toString(choiceObj.text) || toString(choiceObj.content);
        if (choiceText) {
          return choiceText;
        }
      }
    }

    return (
      toString(data.token) ||
      toString(data.text) ||
      toString(data.response) ||
      toString(data.content) ||
      toString((data.delta as Record<string, unknown> | undefined)?.content) ||
      ''
    );
  }

  const choices = data.choices;
  if (Array.isArray(choices) && choices.length > 0) {
    const firstChoice = choices[0];
    if (!firstChoice || typeof firstChoice !== 'object') {
      return '';
    }

    const choiceObj = firstChoice as Record<string, unknown>;
    const delta = choiceObj.delta;
    if (delta && typeof delta === 'object') {
      const deltaObj = delta as Record<string, unknown>;
      const deltaContent = normalizeContentValue(deltaObj.content);
      if (deltaContent) {
        return deltaContent;
      }
      return toString(deltaObj.text) || '';
    }

    const text = normalizeContentValue(choiceObj.text);
    if (text) {
      return text;
    }

    const message = choiceObj.message;
    if (message && typeof message === 'object') {
      return normalizeContentValue((message as Record<string, unknown>).content) || '';
    }
  }

  return '';
}

function readOpenAiMessageContent(choices: unknown): string {
  if (!Array.isArray(choices) || choices.length === 0) {
    return '';
  }

  const firstChoice = choices[0];
  if (!firstChoice || typeof firstChoice !== 'object') {
    return '';
  }

  const message = (firstChoice as Record<string, unknown>).message;
  if (message && typeof message === 'object') {
    return normalizeContentValue((message as Record<string, unknown>).content) || '';
  }

  return normalizeContentValue((firstChoice as Record<string, unknown>).text) || '';
}

function normalizeContentValue(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }

  if (Array.isArray(value)) {
    return value
      .map((chunk) => {
        if (!chunk || typeof chunk !== 'object') {
          return '';
        }

        const text = (chunk as Record<string, unknown>).text;
        return typeof text === 'string' ? text : '';
      })
      .join('');
  }

  return '';
}

function toString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function inferMainApi(settings: Record<string, unknown>): string {
  const explicitMainApi = toString(settings.main_api);
  if (explicitMainApi) {
    return explicitMainApi === 'openai' ? 'chat completion' : explicitMainApi;
  }

  return 'chat completion';
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
