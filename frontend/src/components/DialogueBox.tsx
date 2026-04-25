import { useEffect, useRef, type CSSProperties, type ReactNode } from 'react';
import { ScaleLoader } from 'react-spinners';
import { renderPerLetterQuoteAnimationText, shouldRenderPerLetterQuoteAnimation } from './AnimatedQuoteText';
import chatIcon from '../icons/chat.svg';
import emojiHappyIcon from '../icons/emoji-happy.svg';
import emojiSadIcon from '../icons/emoji-sad.svg';
import helpCircleIcon from '../icons/help-circle.svg';
import heartIcon from '../icons/heart.svg';
import stopIcon from '../icons/x-circle.svg';

interface DialogueBoxProps {
  text: string;
  textTone: 'neutral' | 'roleplay' | 'dialogue';
  speakerName?: string;
  accentColor?: string;
  speakerFontFamily?: string;
  speakerColor?: string;
  quoteFontFamily?: string;
  quoteAnimationPreset?: string;
  quoteAnimationSpeed?: number;
  quoteAnimationColor?: string;
  affinityValue?: number | null;
  lustValue?: number | null;
  isTextFullyRevealed: boolean;
  allowBoldEmphasis?: boolean;
  showContinueHint: boolean;
  isWaitingForReply: boolean;
  showStopButton?: boolean;
  canAdvance: boolean;
  showInput: boolean;
  inputValue: string;
  messageLog: Array<{
    role: 'user' | 'assistant';
    speaker: string;
    content: string;
  }>;
  logsOpen: boolean;
  onInputChange: (value: string) => void;
  onLogsToggle: () => void;
  onLogsClose: () => void;
  onSubmit: () => void;
  onStop?: () => void;
}

function renderBoldAsteriskText(value: string): ReactNode[] {
  const parts: ReactNode[] = [];
  const pattern = /\*([^*\n]+)\*/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(value)) !== null) {
    if (match.index > lastIndex) {
      parts.push(value.slice(lastIndex, match.index));
    }

    parts.push(<strong key={`bold-${match.index}`}>{match[1]}</strong>);
    lastIndex = pattern.lastIndex;
  }

  if (lastIndex < value.length) {
    parts.push(value.slice(lastIndex));
  }

  return parts;
}

export function DialogueBox({
  text,
  textTone,
  speakerName,
  accentColor,
  speakerFontFamily,
  speakerColor,
  quoteFontFamily,
  quoteAnimationPreset,
  quoteAnimationSpeed,
  quoteAnimationColor,
  affinityValue,
  lustValue,
  isTextFullyRevealed,
  allowBoldEmphasis = false,
  showContinueHint,
  isWaitingForReply,
  showStopButton = false,
  canAdvance,
  showInput,
  inputValue,
  messageLog,
  logsOpen,
  onInputChange,
  onLogsToggle,
  onLogsClose,
  onSubmit,
  onStop,
}: DialogueBoxProps) {
  const rootRef = useRef<HTMLElement | null>(null);
  const logListRef = useRef<HTMLDivElement | null>(null);
  const hasAccent = typeof accentColor === 'string' && accentColor.length > 0;
  const dialogueBoxClassName = hasAccent ? 'dialogue-box is-accented' : 'dialogue-box';
  const dialogueBoxStyle = hasAccent
    ? ({ '--dialogue-accent': accentColor } as CSSProperties)
    : undefined;
  const speakerStyle =
    speakerFontFamily || speakerColor
      ? ({
          fontFamily: speakerFontFamily,
          color: speakerColor,
        } as CSSProperties)
      : undefined;
  const dialogueLineStyle =
    textTone === 'dialogue'
      ? ({
          fontFamily: quoteFontFamily,
          color: quoteAnimationColor || '#F6F0E6',
          '--quote-animation-speed': `${quoteAnimationSpeed || 1}`,
          '--quote-animation-color': quoteAnimationColor || '#F6F0E6',
        } as CSSProperties)
      : undefined;
  const normalizedQuoteAnimationPreset = (quoteAnimationPreset || '').trim().toLowerCase();
  const quoteAnimationClass =
    textTone === 'dialogue' && normalizedQuoteAnimationPreset && normalizedQuoteAnimationPreset !== 'disabled'
      ? `quote-animation-${normalizedQuoteAnimationPreset}`
      : '';
  const shouldRenderPerLetterAnimation =
    textTone === 'dialogue' && shouldRenderPerLetterQuoteAnimation(normalizedQuoteAnimationPreset);
  const affinityIcon = typeof affinityValue === 'number' ? (affinityValue >= 0 ? emojiHappyIcon : emojiSadIcon) : null;
  const stateLabel = isWaitingForReply
    ? 'Generating'
    : showInput
      ? 'Your move'
      : canAdvance
        ? 'Ready'
        : 'Live';

  useEffect(() => {
    if (!logsOpen) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        onLogsClose();
      }
    };

    window.addEventListener('pointerdown', handlePointerDown);
    return () => window.removeEventListener('pointerdown', handlePointerDown);
  }, [logsOpen, onLogsClose]);

  useEffect(() => {
    if (!showInput && logsOpen) {
      onLogsClose();
    }
  }, [logsOpen, onLogsClose, showInput]);

  useEffect(() => {
    if (!logsOpen || !logListRef.current) {
      return;
    }

    const list = logListRef.current;
    list.scrollTop = list.scrollHeight;
  }, [logsOpen]);

  return (
    <section ref={rootRef} className={dialogueBoxClassName} style={dialogueBoxStyle} aria-live="polite">
      {logsOpen ? (
        <div
          className="dialogue-log-panel"
          role="dialog"
          aria-label="Previous messages"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => event.stopPropagation()}
          onWheel={(event) => event.stopPropagation()}
        >
          <div className="dialogue-log-head">
            <strong>Previous Messages</strong>
          </div>
          <div ref={logListRef} className="dialogue-log-list">
            {messageLog.length > 0 ? (
              messageLog.map((entry, index) => (
                <article key={`${entry.role}-${index}-${entry.content.slice(0, 24)}`} className={`dialogue-log-entry role-${entry.role}`}>
                  <div className="dialogue-log-meta">
                    <span>{entry.speaker}</span>
                  </div>
                  <p>{entry.content}</p>
                </article>
              ))
            ) : (
              <div className="dialogue-log-empty">No previous messages yet.</div>
            )}
          </div>
        </div>
      ) : null}
      <div className="dialogue-topline">
        {speakerName ? (
          <div className="dialogue-speaker" style={speakerStyle}>
            {speakerName}
          </div>
        ) : (
          <div className="dialogue-speaker is-muted">Narration</div>
        )}
        <div className="dialogue-topline-actions">
          {typeof affinityValue === 'number' ? (
            <div
              className={`dialogue-affinity-badge ${affinityValue < 0 ? 'is-negative' : ''}`.trim()}
              aria-label={`Affinity ${affinityValue}`}
              title={`Affinity ${affinityValue}`}
            >
              <img src={affinityIcon ?? emojiHappyIcon} alt="" aria-hidden="true" className="ui-icon" />
              <span>{affinityValue}</span>
            </div>
          ) : null}
          {typeof lustValue === 'number' ? (
            <div className="dialogue-affinity-badge dialogue-lust-badge" aria-label={`Lust ${lustValue}`} title={`Lust ${lustValue}`}>
              <img src={heartIcon} alt="" aria-hidden="true" className="ui-icon" />
              <span>{lustValue}</span>
            </div>
          ) : null}
          <div className="dialogue-state">{stateLabel}</div>
          {showStopButton && onStop ? (
            <button
              type="button"
              className="icon-button danger generation-stop-button"
              onClick={(event) => {
                event.stopPropagation();
                onStop();
              }}
              aria-label="Stop generation"
              data-tooltip="Stop generation"
            >
              <img src={stopIcon} alt="" aria-hidden="true" className="ui-icon" />
            </button>
          ) : null}
        </div>
      </div>
      <div className="dialogue-content">
        {isWaitingForReply ? (
          <div className="loader-row">
            <ScaleLoader
              height={32}
              width={4}
              radius={2}
              margin={3}
              color="#d4d8df"
              speedMultiplier={0.9}
              cssOverride={{ display: 'inline-block' }}
            />
          </div>
        ) : (
          <p className={`dialogue-line ${textTone} ${quoteAnimationClass}`.trim()} style={dialogueLineStyle}>
            {shouldRenderPerLetterAnimation
              ? renderPerLetterQuoteAnimationText(text, normalizedQuoteAnimationPreset, quoteAnimationSpeed)
              : allowBoldEmphasis
                ? renderBoldAsteriskText(text)
                : text}
            {!isTextFullyRevealed ? <span className="type-cursor">|</span> : null}
          </p>
        )}
      </div>

      {canAdvance && showContinueHint ? (
        <div className="continue-hint">
          Click, Enter, or Space to continue
        </div>
      ) : null}

      {showInput ? (
        <form
          className="player-input player-input-enter"
          onSubmit={(event) => {
            event.preventDefault();
            onSubmit();
          }}
        >
          <input
            value={inputValue}
            onChange={(event) => onInputChange(event.target.value)}
            placeholder="Type your action or dialogue..."
            autoComplete="off"
            autoFocus
          />
          <div className="player-input-actions">
            <button
              type="button"
              className="log-toggle-button"
              onClick={onLogsToggle}
              aria-haspopup="dialog"
              aria-expanded={logsOpen}
            >
              Logs
            </button>
            <div className="command-help-control">
              <button
                type="button"
                className="icon-button secondary-action command-help-button"
                aria-label="Slash commands"
                aria-describedby="slash-command-help"
              >
                <img src={helpCircleIcon} alt="" aria-hidden="true" className="ui-icon" />
              </button>
              <div id="slash-command-help" className="command-help-popover" role="tooltip">
                <div className="command-help-row">
                  <code>/undo</code>
                  <span>Undo the last turn.</span>
                </div>
                <div className="command-help-row">
                  <code>/continue</code>
                  <span>Continue a cut-off reply.</span>
                </div>
                <div className="command-help-row">
                  <code>/describe ...</code>
                  <span>Ask for a scene or character description.</span>
                </div>
                <div className="command-help-row">
                  <code>/think ...</code>
                  <span>Send an internal thought.</span>
                </div>
              </div>
            </div>
            <button type="submit" className="icon-button primary-action" disabled={!inputValue.trim()} aria-label="Send" data-tooltip="Send">
              <img src={chatIcon} alt="" aria-hidden="true" className="ui-icon" />
            </button>
          </div>
        </form>
      ) : null}
    </section>
  );
}
