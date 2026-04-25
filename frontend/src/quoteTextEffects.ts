export type DialogueQuoteAnimationPreset = 'disabled' | 'glowing' | 'crawlies' | 'wave' | 'flicker' | 'glitch' | 'echo';

export interface DialogueQuoteAnimationOption {
  id: DialogueQuoteAnimationPreset;
  label: string;
}

export const DIALOGUE_QUOTE_ANIMATION_OPTIONS: DialogueQuoteAnimationOption[] = [
  { id: 'disabled', label: 'Disabled' },
  { id: 'glowing', label: 'Glowing' },
  { id: 'crawlies', label: 'Crawlies' },
  { id: 'wave', label: 'Wave' },
  { id: 'flicker', label: 'Flicker' },
  { id: 'glitch', label: 'Glitch' },
  { id: 'echo', label: 'Echo' },
];

export const DEFAULT_DIALOGUE_QUOTE_ANIMATION_PRESET: DialogueQuoteAnimationPreset = 'disabled';
export const DEFAULT_DIALOGUE_QUOTE_ANIMATION_SPEED = 1;
export const DEFAULT_DIALOGUE_QUOTE_ANIMATION_COLOR = '#F6F0E6';

export function normalizeDialogueQuoteAnimationPreset(value: unknown): DialogueQuoteAnimationPreset {
  const normalized = `${value || ''}`.trim().toLowerCase() as DialogueQuoteAnimationPreset;
  return DIALOGUE_QUOTE_ANIMATION_OPTIONS.some((entry) => entry.id === normalized)
    ? normalized
    : DEFAULT_DIALOGUE_QUOTE_ANIMATION_PRESET;
}

export function normalizeDialogueQuoteAnimationSpeed(value: unknown): number {
  const numeric = typeof value === 'number' ? value : Number.parseFloat(`${value || ''}`);
  if (!Number.isFinite(numeric)) {
    return DEFAULT_DIALOGUE_QUOTE_ANIMATION_SPEED;
  }

  return Math.min(Math.max(numeric, 0.25), 3);
}

export function normalizeDialogueQuoteAnimationColor(value: unknown): string {
  const raw = `${value || ''}`.trim();
  return /^#[0-9a-fA-F]{6}$/.test(raw) ? raw.toUpperCase() : DEFAULT_DIALOGUE_QUOTE_ANIMATION_COLOR;
}

export function getDialogueQuoteAnimationClass(preset: DialogueQuoteAnimationPreset): string {
  return preset === 'disabled' ? '' : `quote-animation-${preset}`;
}
