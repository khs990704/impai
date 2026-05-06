/**
 * Adapter-layer type re-exports.
 *
 * The single source of truth for these types is `src/types/` (per
 * `_workspace/03_db_schema.md` §2). This module re-exports the relevant subset
 * so that adapter implementations and downstream consumers can import from
 * `@/adapters/types` without crossing layer boundaries explicitly.
 *
 * Adapter-specific helper types that do NOT belong in the public domain
 * surface (e.g. internal `AdapterContext` — see below) live here too.
 */

import type { OpenAIConfig, LocalConfig } from '@/types/config';
import type { AiReactError } from '@/utils/errors';

export type {
  Role,
  ContentPart,
  Message,
} from '@/types/message';

export type {
  TokenUsage,
  StreamChunk,
  BaseResponse,
} from '@/types/stream';

export type {
  ChatRequest,
  AdapterStreamOptions,
  Adapter,
} from '@/types/adapter';

export type {
  OpenAIConfig,
  LocalConfig,
  Engine,
  EngineConfig,
} from '@/types/config';

/**
 * Union type for adapter-construction config. The discriminator field is
 * `engine`. AiProvider uses this when instantiating the right adapter class.
 */
export type AdapterConfig =
  | { engine: 'openai'; config: OpenAIConfig }
  | { engine: 'local'; config: LocalConfig };

/**
 * Internal context passed into adapter methods that need cross-cutting
 * concerns (e.g. a custom `fetch`). Not part of the public surface — only
 * the AiProvider populates this. Currently only used for tests / advanced
 * users who want to inject a mocked fetch.
 */
export interface AdapterContext {
  /** Custom fetch implementation. Defaults to global `fetch`. */
  fetch?: typeof globalThis.fetch;
}

/**
 * Streaming-error surface. Re-exports the AbortError class so tests and the
 * hook layer can `catch (err) { if (err instanceof StreamingError) ... }`.
 *
 * Currently `StreamingError` is just `AiReactError` — it exists as a typed
 * alias for ergonomics, since "anything thrown by `adapter.stream()`" is the
 * mental model.
 */
export type StreamingError = AiReactError;
