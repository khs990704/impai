/**
 * Domain message types.
 *
 * Canonical definition per _workspace/03_db_schema.md §2.1.
 * Touch this file with care: it is part of the 1.0 type freeze surface.
 */

export type Role = 'user' | 'assistant' | 'system';

export type ContentPart =
  | { type: 'text'; text: string }
  | { type: 'image'; url: string; mimeType?: string }
  | { type: 'file'; name: string; mimeType: string; size: number };

export interface Message {
  /** nanoid(21). Unique within a sessionId. */
  id: string;
  role: Role;
  /** 0.1.0 typically uses `string`; ContentPart[] is reserved for P1/P2. */
  content: string | ContentPart[];
  /** epoch ms */
  createdAt: number;
  status?: 'pending' | 'streaming' | 'complete' | 'error';
  /** Human-readable error text when `status === 'error'`. */
  error?: string;
  /** Free-form metadata, persisted alongside the message. */
  metadata?: Record<string, unknown>;
}
