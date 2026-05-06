/**
 * Streaming + response types.
 *
 * Canonical definition per _workspace/03_db_schema.md §2.2.
 */

import type { Message } from './message';

export interface TokenUsage {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
}

export interface StreamChunk {
  /** Incremental delta text (NOT cumulative). */
  delta: string;
  done: boolean;
  finishReason?: 'stop' | 'length' | 'content_filter' | 'tool_calls';
  /** Populated only when `done === true` (when the upstream provider supplies it). */
  usage?: TokenUsage;
  /** Raw chunk for debugging. May be stripped in production builds (0.2.0+). */
  raw?: unknown;
}

export interface BaseResponse {
  id: string;
  message: Message;
  finishReason?: StreamChunk['finishReason'];
  usage?: TokenUsage;
  model?: string;
}
