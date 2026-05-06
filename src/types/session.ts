/**
 * Persistence schema types.
 *
 * Canonical definition per _workspace/03_db_schema.md §2.5.
 *
 * IMPORTANT: `CURRENT_SCHEMA_VERSION` is a runtime const — do not convert to a
 * type-only export. The build pipeline depends on it surviving tree-shaking.
 */

import type { Message } from './message';

export const CURRENT_SCHEMA_VERSION = 1 as const;

export interface ChatSession {
  /** 1:1 with `sessionId` prop. Defaults to 'default'. */
  id: string;
  systemPrompt?: string;
  messages: Message[];
  createdAt: number;
  updatedAt: number;
  /** Migration key, see storage/migrate.ts. */
  schemaVersion: number;
  /** Mirror of AiChatProps.maxMessages for trim invariant. */
  maxMessages?: number;
}

export interface SessionMeta {
  schemaVersion: number;
  /** Index of every persisted sessionId. */
  sessions: string[];
  /** Most recently active sessionId, if any. */
  activeSessionId?: string;
}
