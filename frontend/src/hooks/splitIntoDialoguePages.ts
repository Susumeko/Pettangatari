import type { SpriteExpression } from '../types';

const TARGET_CHARS_PER_PAGE = 230;
const HIDDEN_TAG_TOKEN_PATTERN = /^[A-Z][A-Z _-]*$/;
const HIDDEN_MECHANIC_TAG_PATTERN = /^\[(?:AFFINITY\s*:\s*[+-]?\d{1,3}|LUST\s*:\s*\+?\d{1,3})\]/i;
const IGNORED_DIALOGUE_TAGS = new Set(['NARRATE', 'NARRATIVE']);
const META_SCAFFOLD_LINE_PATTERN =
  /^\s*(?:analysis|script outline|response|thinking|reasoning|plan|internal monologue|chain of thought)\s*:.*$/i;
const META_CONTEXT_LINE_PATTERN = /^\s*(?:previous event|current action|goal)\s*:.*$/i;
const FIRST_TAG_PATTERN = /\[(?:LOCATION(?:\s+CHANGING)?:[^[\]]{1,120}|SITUATION:[^[\]]{1,120}|[A-Z][A-Z _-]{1,80})\]/i;
const OPTIONAL_STEP_ADJECTIVES = '(?:\\w+\\s+){0,3}';
const ROLEPLAY_MOVE_AWAY_PATTERN =
  new RegExp(
    `\\b(?:takes?|taking)\\s+(?:a\\s+)?${OPTIONAL_STEP_ADJECTIVES}step\\s+back\\b|\\b(?:steps?|stepping)\\s+back\\b|\\b(?:moves?|moving)\\s+back(?:ward)?s?\\b|\\b(?:backs?|backing)\\s+away\\b|\\b(?:retreats?|retreating)\\b|\\b(?:pulls?|pulling)\\s+back\\b|\\b(?:shuffles?|shuffling)\\s+back\\b|\\b(?:stumbles?|stumbling)\\s+back\\b`,
    'gi',
  );
const ROLEPLAY_MOVE_CLOSER_PATTERN =
  new RegExp(
    `\\b(?:takes?|taking)\\s+(?:a\\s+)?${OPTIONAL_STEP_ADJECTIVES}step\\s+closer\\b|\\b(?:steps?|stepping)\\s+closer\\b|\\b(?:moves?|moving)\\s+closer\\b|\\b(?:comes?|coming)\\s+closer\\b|\\b(?:approaches?|approaching)\\b|\\b(?:leans?|leaning)\\s+in\\b|\\b(?:edges?|edging)\\s+closer\\b|\\b(?:draws?|drawing)\\s+near\\b|\\b(?:gets?|getting)\\s+near(?:er)?\\b|\\b(?:closes?|closing)\\s+the\\s+distance\\b`,
    'gi',
  );

const TAG_TO_EXPRESSION: Record<string, SpriteExpression> = {
  DEFAULT: 'DEFAULT',
  NEUTRAL: 'DEFAULT',
  HAPPY: 'HAPPY',
  SAD: 'SAD',
  ANGRY: 'ANGRY',
  ANNOYED: 'ANNOYED',
  POUTING: 'POUTING',
  POUT: 'POUTING',
  THINKING: 'THINKING',
  CONFUSED: 'CONFUSED',
  FLIRTATIOUS: 'FLIRTATIOUS',
  KINKY: 'FLIRTATIOUS',
  NAUGHTY: 'NAUGHTY',
  EMBARRASSED: 'EMBARRASSED',
  SHOCKED: 'SHOCKED',
  SCARED: 'SCARED',
};

export type DialogueTone = 'neutral' | 'roleplay' | 'dialogue';

export interface DialogueExpressionCue {
  at: number;
  expression: SpriteExpression;
}

export interface DialogueLocationCue {
  at: number;
  location: string;
}

export type DialoguePortraitPosition = 'center' | 'left' | 'right';

export interface DialoguePortraitPositionCue {
  at: number;
  position: DialoguePortraitPosition;
}

export type DialoguePortraitDistance = 'far' | 'away' | 'normal' | 'close' | 'closer';

export interface DialoguePortraitDistanceCue {
  at: number;
  distance: DialoguePortraitDistance;
}

export interface DialogueTagCue {
  at: number;
  tag: string;
}

export interface DialogueSituationCue {
  at: number;
  tag: string;
}

export interface DialoguePage {
  text: string;
  tone: DialogueTone;
  baseExpression?: SpriteExpression;
  expressionCues?: DialogueExpressionCue[];
  baseTag?: string;
  tagCues?: DialogueTagCue[];
  baseSituation?: string;
  situationCues?: DialogueSituationCue[];
  locationCues?: DialogueLocationCue[];
  basePortraitPosition?: DialoguePortraitPosition;
  portraitPositionCues?: DialoguePortraitPositionCue[];
  basePortraitDistance?: DialoguePortraitDistance;
  portraitDistanceCues?: DialoguePortraitDistanceCue[];
}

function normalizeDialogueText(text: string): string {
  const normalized = text.replace(/\\"/g, '"');
  const filteredLines = normalized
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

export function splitNeutralDialoguePages(text: string, tone: DialogueTone = 'neutral'): DialoguePage[] {
  const chunks = splitTextIntoChunks(normalizeDialogueText(text));
  if (chunks.length === 0) {
    return [{ text: '', tone }];
  }

  return chunks.map((chunk) => ({ text: chunk, tone }));
}

export function splitAssistantDialoguePages(text: string): DialoguePage[] {
  const normalized = normalizeDialogueText(text).replace(/\r\n/g, '\n').trim();
  if (!normalized) {
    return [{ text: '', tone: 'neutral' }];
  }

  const parsed = stripExpressionTags(normalized);
  const segments = splitByQuoteBoundaries(parsed.text);
  const naturalRoleplayDistanceCues = detectRoleplayDistanceCues(segments);
  const allDistanceCues =
    parsed.distanceCues.length > 0 ? parsed.distanceCues : mergeDistanceCues(parsed.distanceCues, naturalRoleplayDistanceCues);
  const pages: Array<{
    text: string;
    tone: DialogueTone;
    start: number;
    end: number;
    baseExpression?: SpriteExpression;
    expressionCues?: DialogueExpressionCue[];
    baseTag?: string;
    tagCues?: DialogueTagCue[];
    baseSituation?: string;
    situationCues?: DialogueSituationCue[];
    locationCues?: DialogueLocationCue[];
    basePortraitPosition?: DialoguePortraitPosition;
    portraitPositionCues?: DialoguePortraitPositionCue[];
    basePortraitDistance?: DialoguePortraitDistance;
    portraitDistanceCues?: DialoguePortraitDistanceCue[];
  }> = [];

  for (const segment of segments) {
    const chunks = splitSegmentIntoChunks(segment);
    for (const chunk of chunks) {
      const expressionMeta = getPageExpressionMeta(parsed.cues, chunk.start, chunk.end);
      const tagMeta = getPageTagMeta(parsed.tagCues, chunk.start, chunk.end);
      const situationMeta = getPageSituationMeta(parsed.situationCues, chunk.start, chunk.end);
      const portraitMeta = getPagePortraitMeta(parsed.portraitCues, chunk.start, chunk.end);
      const portraitDistanceMeta = getPagePortraitDistanceMeta(allDistanceCues, chunk.start, chunk.end);
      pages.push({
        text: chunk.text,
        tone: segment.tone,
        start: chunk.start,
        end: chunk.end,
        baseExpression: expressionMeta.baseExpression,
        expressionCues: expressionMeta.expressionCues,
        baseTag: tagMeta.baseTag,
        tagCues: tagMeta.tagCues,
        baseSituation: situationMeta.baseSituation,
        situationCues: situationMeta.situationCues,
        basePortraitPosition: portraitMeta.basePortraitPosition,
        portraitPositionCues: portraitMeta.portraitPositionCues,
        basePortraitDistance: portraitDistanceMeta.basePortraitDistance,
        portraitDistanceCues: portraitDistanceMeta.portraitDistanceCues,
      });
    }
  }

  assignLocationCuesToPages(pages, parsed.locationCues);

  if (pages.length === 0) {
    return [{ text: '', tone: 'neutral' }];
  }

  return pages.map((page) => ({
    text: page.text,
    tone: page.tone,
    baseExpression: page.baseExpression,
    expressionCues: page.expressionCues,
    baseTag: page.baseTag,
    tagCues: page.tagCues,
    baseSituation: page.baseSituation,
    situationCues: page.situationCues,
    locationCues: page.locationCues,
    basePortraitPosition: page.basePortraitPosition,
    portraitPositionCues: page.portraitPositionCues,
    basePortraitDistance: page.basePortraitDistance,
    portraitDistanceCues: page.portraitDistanceCues,
  }));
}

function stepPortraitDistance(
  current: DialoguePortraitDistance,
  direction: Extract<DialoguePortraitDistance, 'closer' | 'away'>,
): DialoguePortraitDistance {
  const steps: DialoguePortraitDistance[] = ['far', 'away', 'normal', 'close', 'closer'];
  const currentIndex = steps.indexOf(current);
  const safeIndex = currentIndex >= 0 ? currentIndex : steps.indexOf('normal');
  const nextIndex =
    direction === 'closer'
      ? Math.min(safeIndex + 1, steps.length - 1)
      : Math.max(safeIndex - 1, 0);

  return steps[nextIndex];
}

function detectRoleplayDistanceCues(
  segments: Array<{ text: string; tone: 'roleplay' | 'dialogue'; start: number }>,
): Array<{ index: number; distance: DialoguePortraitDistance }> {
  const cues: Array<{ index: number; distance: DialoguePortraitDistance }> = [];

  for (const segment of segments) {
    if (segment.tone !== 'roleplay') {
      continue;
    }

    for (const match of segment.text.matchAll(ROLEPLAY_MOVE_AWAY_PATTERN)) {
      if (typeof match.index !== 'number') {
        continue;
      }

      cues.push({
        index: segment.start + match.index,
        distance: 'away',
      });
    }

    for (const match of segment.text.matchAll(ROLEPLAY_MOVE_CLOSER_PATTERN)) {
      if (typeof match.index !== 'number') {
        continue;
      }

      cues.push({
        index: segment.start + match.index,
        distance: 'closer',
      });
    }
  }

  return cues;
}

function mergeDistanceCues(
  baseCues: Array<{ index: number; distance: DialoguePortraitDistance }>,
  additionalCues: Array<{ index: number; distance: DialoguePortraitDistance }>,
): Array<{ index: number; distance: DialoguePortraitDistance }> {
  const merged = [...baseCues, ...additionalCues].sort((left, right) => left.index - right.index);
  const unique: Array<{ index: number; distance: DialoguePortraitDistance }> = [];
  const seen = new Set<string>();

  for (const cue of merged) {
    const signature = `${cue.index}:${cue.distance}`;
    if (seen.has(signature)) {
      continue;
    }

    seen.add(signature);
    unique.push(cue);
  }

  return unique;
}

function splitByQuoteBoundaries(input: string): Array<{ text: string; tone: 'roleplay' | 'dialogue'; start: number }> {
  const segments: Array<{ text: string; tone: 'roleplay' | 'dialogue'; start: number }> = [];
  let segmentStart = 0;
  let inQuote = false;
  const quoteCharacters = new Set(['"', '\u201C', '\u201D']);

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];
    const prev = index > 0 ? input[index - 1] : '';
    const isQuote = quoteCharacters.has(char) && prev !== '\\';

    if (!isQuote) {
      continue;
    }

    if (!inQuote) {
      pushRangeIfNotEmpty(segments, input, segmentStart, index, 'roleplay');
      segmentStart = index;
      inQuote = true;
      continue;
    }

    pushRangeIfNotEmpty(segments, input, segmentStart, index + 1, 'dialogue');
    segmentStart = index + 1;
    inQuote = false;
  }

  pushRangeIfNotEmpty(segments, input, segmentStart, input.length, inQuote ? 'dialogue' : 'roleplay');
  return segments;
}

function pushRangeIfNotEmpty(
  target: Array<{ text: string; tone: 'roleplay' | 'dialogue'; start: number }>,
  source: string,
  start: number,
  end: number,
  tone: 'roleplay' | 'dialogue',
): void {
  const segment = source.slice(start, end);
  const leadingWhitespace = segment.match(/^\s*/)?.[0].length ?? 0;
  const trailingWhitespace = segment.match(/\s*$/)?.[0].length ?? 0;
  const trimmedStart = start + leadingWhitespace;
  const trimmedEnd = end - trailingWhitespace;

  if (trimmedStart >= trimmedEnd) {
    return;
  }

  target.push({
    text: source.slice(trimmedStart, trimmedEnd),
    tone,
    start: trimmedStart,
  });
}

function splitSegmentIntoChunks(
  segment: { text: string; tone: 'roleplay' | 'dialogue'; start: number },
): Array<{ text: string; start: number; end: number }> {
  const chunks = splitTextIntoChunks(segment.text);
  const pages: Array<{ text: string; start: number; end: number }> = [];
  let cursor = 0;

  for (const chunk of chunks) {
    const localStart = segment.text.indexOf(chunk, cursor);
    const safeStart = localStart >= 0 ? localStart : cursor;
    const safeEnd = safeStart + chunk.length;
    cursor = safeEnd;

    pages.push({
      text: chunk,
      start: segment.start + safeStart,
      end: segment.start + safeEnd,
    });
  }

  return pages;
}

function getPageExpressionMeta(
  cues: Array<{ index: number; expression: SpriteExpression }>,
  pageStart: number,
  pageEnd: number,
): {
  baseExpression?: SpriteExpression;
  expressionCues?: DialogueExpressionCue[];
} {
  let baseExpression: SpriteExpression | undefined;
  const expressionCues: DialogueExpressionCue[] = [];

  for (const cue of cues) {
    if (cue.index <= pageStart) {
      baseExpression = cue.expression;
      continue;
    }

    if (cue.index >= pageEnd) {
      break;
    }

    expressionCues.push({
      at: cue.index - pageStart,
      expression: cue.expression,
    });
  }

  return {
    baseExpression,
    expressionCues: expressionCues.length > 0 ? expressionCues : undefined,
  };
}

function getPagePortraitMeta(
  cues: Array<{ index: number; position: DialoguePortraitPosition }>,
  pageStart: number,
  pageEnd: number,
): {
  basePortraitPosition?: DialoguePortraitPosition;
  portraitPositionCues?: DialoguePortraitPositionCue[];
} {
  let basePortraitPosition: DialoguePortraitPosition | undefined;
  const portraitPositionCues: DialoguePortraitPositionCue[] = [];

  for (const cue of cues) {
    if (cue.index <= pageStart) {
      basePortraitPosition = cue.position;
      continue;
    }

    if (cue.index >= pageEnd) {
      break;
    }

    portraitPositionCues.push({
      at: cue.index - pageStart,
      position: cue.position,
    });
  }

  return {
    basePortraitPosition,
    portraitPositionCues: portraitPositionCues.length > 0 ? portraitPositionCues : undefined,
  };
}

function getPageTagMeta(
  cues: Array<{ index: number; tag: string }>,
  pageStart: number,
  pageEnd: number,
): {
  baseTag?: string;
  tagCues?: DialogueTagCue[];
} {
  let baseTag: string | undefined;
  const tagCues: DialogueTagCue[] = [];

  for (const cue of cues) {
    if (cue.index <= pageStart) {
      baseTag = cue.tag;
      continue;
    }

    if (cue.index >= pageEnd) {
      break;
    }

    tagCues.push({
      at: cue.index - pageStart,
      tag: cue.tag,
    });
  }

  return {
    baseTag,
    tagCues: tagCues.length > 0 ? tagCues : undefined,
  };
}

function getPageSituationMeta(
  cues: Array<{ index: number; tag: string }>,
  pageStart: number,
  pageEnd: number,
): {
  baseSituation?: string;
  situationCues?: DialogueSituationCue[];
} {
  const situationCues: DialogueSituationCue[] = [];

  for (const cue of cues) {
    if (cue.index < pageStart) {
      continue;
    }

    if (cue.index >= pageEnd) {
      break;
    }

    situationCues.push({
      at: cue.index - pageStart,
      tag: cue.tag,
    });
  }

  return {
    baseSituation: undefined,
    situationCues: situationCues.length > 0 ? situationCues : undefined,
  };
}

function getPagePortraitDistanceMeta(
  cues: Array<{ index: number; distance: DialoguePortraitDistance }>,
  pageStart: number,
  pageEnd: number,
): {
  basePortraitDistance?: DialoguePortraitDistance;
  portraitDistanceCues?: DialoguePortraitDistanceCue[];
} {
  let basePortraitDistance: DialoguePortraitDistance = 'normal';
  let hasBasePortraitDistance = false;
  const portraitDistanceCues: DialoguePortraitDistanceCue[] = [];

  for (const cue of cues) {
    if (cue.index <= pageStart) {
      basePortraitDistance =
        cue.distance === 'closer' || cue.distance === 'away'
          ? stepPortraitDistance(basePortraitDistance, cue.distance)
          : cue.distance;
      hasBasePortraitDistance = true;
      continue;
    }

    if (cue.index >= pageEnd) {
      break;
    }

    portraitDistanceCues.push({
      at: cue.index - pageStart,
      distance: cue.distance,
    });
  }

  return {
    basePortraitDistance: hasBasePortraitDistance ? basePortraitDistance : undefined,
    portraitDistanceCues: portraitDistanceCues.length > 0 ? portraitDistanceCues : undefined,
  };
}

function assignLocationCuesToPages(
  pages: Array<{
    text: string;
    start: number;
    end: number;
    locationCues?: DialogueLocationCue[];
  }>,
  cues: Array<{ index: number; location: string }>,
): void {
  if (pages.length === 0 || cues.length === 0) {
    return;
  }

  for (const cue of cues) {
    let targetIndex = pages.findIndex((page) => cue.index >= page.start && cue.index < page.end);
    if (targetIndex < 0) {
      targetIndex = pages.findIndex((page) => cue.index < page.start);
    }
    if (targetIndex < 0) {
      targetIndex = pages.length - 1;
    }

    const targetPage = pages[targetIndex];
    const at = Math.max(0, Math.min(targetPage.text.length, cue.index - targetPage.start));
    const nextCue: DialogueLocationCue = { at, location: cue.location };

    if (!targetPage.locationCues) {
      targetPage.locationCues = [nextCue];
    } else {
      targetPage.locationCues.push(nextCue);
    }
  }
}

function stripExpressionTags(input: string): {
  text: string;
  cues: Array<{ index: number; expression: SpriteExpression }>;
  tagCues: Array<{ index: number; tag: string }>;
  situationCues: Array<{ index: number; tag: string }>;
  locationCues: Array<{ index: number; location: string }>;
  portraitCues: Array<{ index: number; position: DialoguePortraitPosition }>;
  distanceCues: Array<{ index: number; distance: DialoguePortraitDistance }>;
} {
  const cues: Array<{ index: number; expression: SpriteExpression }> = [];
  const tagCues: Array<{ index: number; tag: string }> = [];
  const situationCues: Array<{ index: number; tag: string }> = [];
  const locationCues: Array<{ index: number; location: string }> = [];
  const portraitCues: Array<{ index: number; position: DialoguePortraitPosition }> = [];
  const distanceCues: Array<{ index: number; distance: DialoguePortraitDistance }> = [];
  let activePortraitPosition: DialoguePortraitPosition = 'center';
  let output = '';
  let index = 0;

  while (index < input.length) {
    if (input[index] !== '[') {
      output += input[index];
      index += 1;
      continue;
    }

    const rest = input.slice(index);

    const hiddenMechanicMatch = rest.match(HIDDEN_MECHANIC_TAG_PATTERN);
    if (hiddenMechanicMatch) {
      index += hiddenMechanicMatch[0].length;
      continue;
    }

    const locationMatch = rest.match(/^\[LOCATION(?:\s+CHANGING)?\s*:\s*([^[\]]{1,120})\]/i);
    if (locationMatch) {
      const location = locationMatch[1].trim();
      if (location) {
        locationCues.push({ index: output.length, location });
      }
      index += locationMatch[0].length;
      continue;
    }

    const situationMatch = rest.match(/^\[SITUATION\s*:\s*([^[\]]{1,120})\]/i);
    if (situationMatch) {
      const tag = situationMatch[1].trim();
      if (tag) {
        situationCues.push({ index: output.length, tag });
      }
      index += situationMatch[0].length;
      continue;
    }

    const moveMatch = rest.match(/^\[MOVE\s+(LEFT|RIGHT)\]/i);
    if (moveMatch) {
      const position = moveMatch[1].toLowerCase() as Extract<DialoguePortraitPosition, 'left' | 'right'>;
      portraitCues.push({ index: output.length, position });
      activePortraitPosition = position;
      index += moveMatch[0].length;
      continue;
    }

    const distanceMatch = rest.match(/^\[MOVE\s+(CLOSER|AWAY)\]/i);
    if (distanceMatch) {
      const requested = distanceMatch[1].toLowerCase() as Extract<DialoguePortraitDistance, 'closer' | 'away'>;
      distanceCues.push({ index: output.length, distance: requested });

      index += distanceMatch[0].length;
      continue;
    }

    const tagMatch = rest.match(/^\[([^[\]]{1,40})\]/);
    if (!tagMatch) {
      output += input[index];
      index += 1;
      continue;
    }

    const rawToken = tagMatch[1].trim();
    const normalized = rawToken.toUpperCase().replace(/[\s-]+/g, '_');
    if (IGNORED_DIALOGUE_TAGS.has(normalized)) {
      index += tagMatch[0].length;
      continue;
    }

    const expression = TAG_TO_EXPRESSION[normalized];

    if (expression) {
      cues.push({ index: output.length, expression });
      if (activePortraitPosition !== 'center') {
        portraitCues.push({ index: output.length, position: 'center' });
        activePortraitPosition = 'center';
      }
      index += tagMatch[0].length;
      continue;
    }

    if (rawToken === '0') {
      index += tagMatch[0].length;
      continue;
    }

    if (HIDDEN_TAG_TOKEN_PATTERN.test(rawToken)) {
      const customExpression = rawToken.toUpperCase().replace(/\s+/g, ' ').trim();
      if (customExpression) {
        cues.push({ index: output.length, expression: customExpression });
        tagCues.push({ index: output.length, tag: customExpression });
        if (activePortraitPosition !== 'center') {
          portraitCues.push({ index: output.length, position: 'center' });
          activePortraitPosition = 'center';
        }
      }
      index += tagMatch[0].length;
      continue;
    }

    output += input[index];
    index += 1;
  }

  return { text: output, cues, tagCues, situationCues, locationCues, portraitCues, distanceCues };
}

function splitTextIntoChunks(input: string): string[] {
  const trimmed = input.replace(/\r\n/g, '\n').trim();
  if (!trimmed) {
    return [];
  }

  // Treat each written line as a hard dialogue step boundary.
  const lines = trimmed
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);

  const chunks: string[] = [];

  for (const line of lines) {
    if (line.length <= TARGET_CHARS_PER_PAGE) {
      chunks.push(line);
      continue;
    }

    const sentenceSplit = line
      .split(/(?<=[.!?])\s+/)
      .map((sentence) => sentence.trim())
      .filter(Boolean);

    if (sentenceSplit.length === 0) {
      chunks.push(...splitByLength(line));
      continue;
    }

    let current = '';

    for (const sentence of sentenceSplit) {
      const candidate = current ? `${current} ${sentence}` : sentence;
      if (candidate.length <= TARGET_CHARS_PER_PAGE) {
        current = candidate;
        continue;
      }

      if (current) {
        chunks.push(current);
      }

      if (sentence.length > TARGET_CHARS_PER_PAGE) {
        chunks.push(...splitByLength(sentence));
        current = '';
      } else {
        current = sentence;
      }
    }

    if (current) {
      chunks.push(current);
    }
  }

  return chunks;
}

function splitByLength(input: string): string[] {
  const words = input.split(/\s+/).filter(Boolean);
  const chunks: string[] = [];
  let chunk = '';

  for (const word of words) {
    const candidate = chunk ? `${chunk} ${word}` : word;
    if (candidate.length <= TARGET_CHARS_PER_PAGE) {
      chunk = candidate;
      continue;
    }

    if (chunk) {
      chunks.push(chunk);
    }

    if (word.length > TARGET_CHARS_PER_PAGE) {
      const hardChunks = word.match(new RegExp(`.{1,${TARGET_CHARS_PER_PAGE}}`, 'g')) ?? [word];
      chunks.push(...hardChunks);
      chunk = '';
      continue;
    }

    chunk = word;
  }

  if (chunk) {
    chunks.push(chunk);
  }

  return chunks;
}
