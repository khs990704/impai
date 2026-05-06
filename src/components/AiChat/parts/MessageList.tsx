/**
 * MessageList — internal list with role="log" + aria-live polite.
 *
 * Headless: only structural classNames + data-attributes are applied.
 * Visual styling lives in the Tailwind preset.
 */

import { useEffect, useRef, type ReactNode } from 'react';
import type { Message } from '@/types/message';
import { MessageItem } from './MessageItem';

export interface MessageListProps {
  messages: Message[];
  /** When true, the last message is a streaming assistant message. */
  isStreaming: boolean;
  emptyState?: ReactNode;
  renderMessage?: (m: Message) => ReactNode;
  classNames?: { list?: string; message?: string };
  'data-testid'?: string;
}

export function MessageList({
  messages,
  isStreaming,
  emptyState,
  renderMessage,
  classNames,
  'data-testid': testId,
}: MessageListProps): JSX.Element {
  const ref = useRef<HTMLOListElement | null>(null);

  // Auto-scroll to bottom when messages or streaming state changes.
  // Respects prefers-reduced-motion via `behavior: auto`.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages, isStreaming]);

  if (messages.length === 0 && emptyState !== undefined) {
    return (
      <div
        data-aireact-empty="true"
        data-testid={testId ? `${testId}-empty` : undefined}
        className={classNames?.list}
      >
        {emptyState}
      </div>
    );
  }

  // role="log" lives on the wrapping <section> so it does NOT conflict with
  // the implicit `list` role of <ol>. axe-core flags <li> children whose
  // direct ancestor's role is overridden away from `list`; keeping role="log"
  // off the ol element keeps both list semantics and live-region announcements
  // working. (Matches WAI-ARIA Authoring Practices for chat logs.)
  return (
    <section
      role="log"
      aria-live="polite"
      aria-atomic="false"
      aria-relevant="additions"
      aria-label="대화 로그"
      data-aireact-log="true"
    >
      <ol
        ref={ref}
        data-aireact-list="true"
        className={classNames?.list}
        data-testid={testId ?? 'aireact-message-list'}
      >
        {messages.map((m, i) => {
          const isLast = i === messages.length - 1;
          const streaming = isLast && isStreaming && m.status === 'streaming';
          return (
            <MessageItem
              key={m.id}
              message={m}
              streaming={streaming}
              {...(renderMessage !== undefined ? { renderMessage } : {})}
              {...(classNames?.message !== undefined
                ? { className: classNames.message }
                : {})}
            />
          );
        })}
      </ol>
    </section>
  );
}
