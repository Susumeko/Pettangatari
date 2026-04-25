export interface SillyTavernCharacter {
  [key: string]: unknown;
  name: string;
  avatar?: string;
  data?: {
    [key: string]: unknown;
    name?: string;
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
}

export interface RuntimeGenerationSettings {
  mainApi?: string;
  chatCompletionSource: string;
  model: string;
  temperature?: number;
  topP?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
  maxTokens?: number;
  rawSettings?: Record<string, unknown>;
  globalSettings?: Record<string, unknown>;
}

export interface TurnMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface GenerateRequestBody {
  messages: TurnMessage[];
  stream: boolean;
  sessionId?: string;
  thinkingTurn?: boolean;
  continueTurn?: boolean;
  describeTurn?: boolean;
  turnInstruction?: string;
  character?: {
    name?: string;
    description?: string;
    personality?: string;
    scenario?: string;
    first_mes?: string;
    mes_example?: string;
    system_prompt?: string;
    post_history_instructions?: string;
  };
}

export interface GenerateResult {
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
