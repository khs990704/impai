/**
 * Adapter contract.
 *
 * Canonical definition per _workspace/03_db_schema.md §2.3 / 02_api_spec.md §A.7.
 * Implemented by backend-dev in `src/adapters/`.
 */

import type { Message } from './message';
import type { BaseResponse, StreamChunk } from './stream';

export interface ChatRequest {
  messages: Message[];
  systemPrompt?: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  metadata?: Record<string, unknown>;
}

export interface AdapterStreamOptions {
  signal?: AbortSignal;
}

export interface Adapter {
  /** Stable identifier, e.g. `'openai'`, `'local'`. */
  readonly id: string;
  chat(req: ChatRequest, opts?: AdapterStreamOptions): Promise<BaseResponse>;
  stream(
    req: ChatRequest,
    opts?: AdapterStreamOptions,
  ): AsyncIterable<StreamChunk>;
}
