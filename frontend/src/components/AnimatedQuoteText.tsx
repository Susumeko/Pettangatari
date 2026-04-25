import type { CSSProperties, ReactNode } from 'react';

const PER_LETTER_QUOTE_ANIMATIONS = new Set(['crawlies', 'wave']);

function normalizeQuoteAnimationPreset(value: unknown): string {
  return `${value || ''}`.trim().toLowerCase();
}

function normalizeQuoteAnimationSpeed(value: unknown): number {
  const numeric = typeof value === 'number' ? value : Number.parseFloat(`${value || ''}`);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : 1;
}

function getLetterSeed(text: string, index: number, char: string): number {
  const seedBase = `${text.length}:${index}:${char}`;
  let hash = 2166136261;

  for (let i = 0; i < seedBase.length; i += 1) {
    hash ^= seedBase.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

function getCrawliesLetterStyle(text: string, index: number, char: string, speed: number): CSSProperties {
  const hash = getLetterSeed(text, index, char);
  const randomA = (hash % 1000) / 1000;
  const randomB = (((hash >>> 8) % 1000) / 1000);
  const randomC = (((hash >>> 16) % 1000) / 1000);
  const randomD = (((hash >>> 24) % 1000) / 1000);
  const duration = 0.18 + randomA * 0.24;
  const delay = randomB * 0.24;

  return {
    animationDelay: `${(-delay / speed).toFixed(3)}s`,
    animationDuration: `${(duration / speed).toFixed(3)}s`,
    '--crawlies-x-1': `${(-1.35 + randomC * 2.7).toFixed(2)}px`,
    '--crawlies-y-1': `${(-1.2 + randomD * 2.4).toFixed(2)}px`,
    '--crawlies-x-2': `${(-1.35 + randomB * 2.7).toFixed(2)}px`,
    '--crawlies-y-2': `${(-1.2 + randomA * 2.4).toFixed(2)}px`,
    '--crawlies-rot-1': `${(-0.8 + randomD * 1.6).toFixed(3)}deg`,
    '--crawlies-rot-2': `${(-0.8 + randomC * 1.6).toFixed(3)}deg`,
  } as CSSProperties;
}

function getWaveLetterStyle(index: number, speed: number): CSSProperties {
  return {
    animationDelay: `${(-(index * 0.075) / speed).toFixed(3)}s`,
    animationDuration: `${(1.05 / speed).toFixed(3)}s`,
  };
}

export function shouldRenderPerLetterQuoteAnimation(preset: unknown): boolean {
  return PER_LETTER_QUOTE_ANIMATIONS.has(normalizeQuoteAnimationPreset(preset));
}

export function renderPerLetterQuoteAnimationText(
  text: string,
  preset: unknown,
  speedValue: unknown,
): ReactNode[] {
  const normalizedPreset = normalizeQuoteAnimationPreset(preset);
  const speed = normalizeQuoteAnimationSpeed(speedValue);
  const parts: ReactNode[] = [];
  const chars = Array.from(text);

  for (let index = 0; index < chars.length; index += 1) {
    const char = chars[index];

    if (char === '\n') {
      parts.push(<br key={`br-${index}`} />);
      continue;
    }

    if (char === ' ') {
      parts.push(' ');
      continue;
    }

    const motionStyle =
      normalizedPreset === 'crawlies'
        ? getCrawliesLetterStyle(text, index, char, speed)
        : getWaveLetterStyle(index, speed);

    parts.push(
      <span key={`quote-letter-${index}-${char}`} className="quote-letter" style={motionStyle}>
        {char}
      </span>,
    );
  }

  return parts;
}
