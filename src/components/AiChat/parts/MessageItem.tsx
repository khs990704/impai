/**
 * MessageItem — single message renderer.
 *
 * Headless. data-attributes drive any visual styling via Tailwind preset.
 */

import { type ReactNode } from 'react';
import type { Message } from '@/types/message';

export interface MessageItemProps {
  message: Message;
  streaming: boolean;
  renderMessage?: (m: Message) => ReactNode;
  className?: string;
}

function defaultRender(m: Message): ReactNode {
  if (typeof m.content === 'string') return m.content;
  // ContentPart[] fallback — text only. Image/file are rendered as placeholders
  // so the user can override via `renderMessage` prop.
  return m.content
    .map((p) => {
      if (p.type === 'text') return p.text;
      if (p.type === 'image') return `[image:${p.url}]`;
      return `[file:${p.name}]`;
    })
    .join('');
}

export function MessageItem({
  message,
  streaming,
  renderMessage,
  className,
}: MessageItemProps): JSX.Element {
  return (
    <li
      data-aireact-message="true"
      data-role={message.role}
      data-status={message.status ?? 'complete'}
      data-streaming={streaming ? 'true' : 'false'}
      className={className}
    >
      {renderMessage ? renderMessage(message) : defaultRender(message)}
    </li>
  );
}
