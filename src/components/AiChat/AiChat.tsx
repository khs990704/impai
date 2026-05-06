/**
 * <AiChat> — Headless chat UI.
 *
 * Per _workspace/02_api_spec.md §A.2 + spec/05_wireframe.md §1.
 *
 * Visual rules:
 *   - No colours/fonts/spacing inside this file. Style via Tailwind preset
 *     selectors (`[data-aireact-message][data-role="user"]` etc) or the
 *     `classNames` slot prop.
 *   - `data-state` on root: `'idle' | 'streaming' | 'error'`.
 *   - Last message exposes `data-streaming="true"` while a chunk is being
 *     appended.
 *
 * Behaviour:
 *   - Wires `useAiChat` for state.
 *   - Surfaces error banner with `role="alert"` (per §D).
 *   - Composer disables itself during streaming and offers an inline cancel.
 */

import { useEffect, type ReactNode } from 'react';
import type { Message } from '@/types/message';
import { useAiChat, type UseAiChatOptions } from '@/hooks/useAiChat';
import { MessageList } from './parts/MessageList';
import { Composer } from './parts/Composer';

export interface AiChatProps {
  // ── Data
  initialMessages?: Message[];
  systemPrompt?: string;

  // ── Persistence
  /** Storage key suffix. default: 'default'. SSR auto-disables persist. */
  sessionId?: string;
  /** default: true */
  persist?: boolean;

  // ── UX slots
  placeholder?: string;
  emptyState?: ReactNode;
  renderMessage?: (m: Message) => ReactNode;
  composerSlot?: ReactNode;

  // ── Callbacks
  onMessageSent?: (m: Message) => void;
  onComplete?: (m: Message) => void;
  onError?: (e: Error) => void;

  // ── Styling
  className?: string;
  classNames?: {
    root?: string;
    list?: string;
    message?: string;
    composer?: string;
    error?: string;
  };

  // ── Limits
  /** default: 100 */
  maxMessages?: number;

  /** Hook for tests. */
  'data-testid'?: string;
}

export function AiChat(props: AiChatProps): JSX.Element {
  const {
    initialMessages,
    systemPrompt,
    sessionId,
    persist,
    placeholder,
    emptyState,
    renderMessage,
    composerSlot,
    onMessageSent,
    onComplete,
    onError,
    className,
    classNames,
    maxMessages = 100,
    'data-testid': testId,
  } = props;

  const hookOpts: UseAiChatOptions = { maxMessages };
  if (sessionId !== undefined) hookOpts.sessionId = sessionId;
  if (systemPrompt !== undefined) hookOpts.systemPrompt = systemPrompt;
  if (initialMessages !== undefined) hookOpts.initialMessages = initialMessages;
  if (persist !== undefined) hookOpts.persist = persist;
  if (onComplete !== undefined) hookOpts.onComplete = onComplete;
  if (onError !== undefined) hookOpts.onError = onError;

  const { messages, send, cancel, isStreaming, error } = useAiChat(hookOpts);

  // onMessageSent fires for the user message, not assistant. Watch the last
  // user message identity.
  useEffect(() => {
    if (!onMessageSent) return;
    const last = messages[messages.length - 1];
    // user message lands immediately before streaming starts; surface that.
    const lastUser = [...messages].reverse().find((m) => m.role === 'user');
    if (lastUser && last && (last.role === 'user' || last.status === 'streaming')) {
      onMessageSent(lastUser);
    }
    // Intentionally excluding onMessageSent from deps (consumer can memoise).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages]);

  const dataState = error ? 'error' : isStreaming ? 'streaming' : 'idle';
  const composerProps: {
    isStreaming: boolean;
    onSend: (text: string) => void;
    onCancel: () => void;
    classNames?: { composer?: string };
    slot?: ReactNode;
    placeholder?: string;
  } = {
    isStreaming,
    onSend: (text) => {
      void send(text);
    },
    onCancel: cancel,
  };
  if (classNames?.composer !== undefined) {
    composerProps.classNames = { composer: classNames.composer };
  }
  if (composerSlot !== undefined) composerProps.slot = composerSlot;
  if (placeholder !== undefined) composerProps.placeholder = placeholder;

  return (
    <div
      data-aireact-chat="true"
      data-state={dataState}
      className={[className, classNames?.root].filter(Boolean).join(' ') || undefined}
      data-testid={testId ?? 'aireact-chat'}
    >
      <MessageList
        messages={messages}
        isStreaming={isStreaming}
        {...(emptyState !== undefined ? { emptyState } : {})}
        {...(renderMessage !== undefined ? { renderMessage } : {})}
        {...(classNames
          ? {
              classNames: {
                ...(classNames.list !== undefined ? { list: classNames.list } : {}),
                ...(classNames.message !== undefined ? { message: classNames.message } : {}),
              },
            }
          : {})}
      />
      {error ? (
        <div
          role="alert"
          data-aireact-error="true"
          className={classNames?.error}
          data-testid="aireact-error"
        >
          {error.message}
        </div>
      ) : null}
      <Composer {...composerProps} />
    </div>
  );
}
