/**
 * Composer — textarea + send/cancel button.
 *
 * Keyboard mapping per _workspace/02_api_spec.md §D:
 *   Enter           → send (no-op when empty / IME composing)
 *   Shift+Enter     → newline (browser default)
 *   ESC             → cancel when streaming, else blur
 */

import {
  useCallback,
  useId,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react';

export interface ComposerProps {
  isStreaming: boolean;
  disabled?: boolean;
  placeholder?: string;
  onSend: (text: string) => void;
  onCancel: () => void;
  classNames?: { composer?: string };
  /** Replaces the entire composer with a custom node when provided. */
  slot?: ReactNode;
  /** Optional ARIA label for the textarea. */
  ariaLabel?: string;
}

export function Composer({
  isStreaming,
  disabled = false,
  placeholder = '메시지를 입력하세요…',
  onSend,
  onCancel,
  classNames,
  slot,
  ariaLabel = '메시지 입력',
}: ComposerProps): JSX.Element {
  const id = useId();
  const [value, setValue] = useState('');
  const [isComposing, setIsComposing] = useState(false);

  const handleSend = useCallback(() => {
    const trimmed = value.trim();
    if (trimmed.length === 0) return;
    onSend(trimmed);
    setValue('');
  }, [value, onSend]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey && !isComposing && !e.nativeEvent.isComposing) {
        e.preventDefault();
        if (!isStreaming && !disabled) handleSend();
        return;
      }
      if (e.key === 'Escape') {
        if (isStreaming) {
          e.preventDefault();
          onCancel();
        } else {
          (e.target as HTMLTextAreaElement).blur();
        }
      }
    },
    [isComposing, isStreaming, disabled, handleSend, onCancel],
  );

  if (slot !== undefined) {
    return (
      <div data-aireact-composer="true" className={classNames?.composer}>
        {slot}
      </div>
    );
  }

  return (
    <div
      data-aireact-composer="true"
      data-state={isStreaming ? 'streaming' : disabled ? 'disabled' : 'idle'}
      className={classNames?.composer}
    >
      <label htmlFor={id} className="aireact-sr-only">
        {ariaLabel}
      </label>
      <textarea
        id={id}
        aria-label={ariaLabel}
        placeholder={placeholder}
        value={value}
        disabled={disabled || isStreaming}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        onCompositionStart={() => setIsComposing(true)}
        onCompositionEnd={() => setIsComposing(false)}
        rows={2}
        data-aireact-textarea="true"
      />
      {isStreaming ? (
        <button
          type="button"
          onClick={onCancel}
          aria-label="취소"
          data-aireact-button="cancel"
        >
          취소
        </button>
      ) : (
        <button
          type="button"
          onClick={handleSend}
          aria-label="전송"
          disabled={disabled || value.trim().length === 0}
          data-aireact-button="send"
        >
          전송
        </button>
      )}
    </div>
  );
}
