/**
 * Public types barrel for `impai`.
 *
 * Domain types are owned by backend-dev (`src/adapters/**`, `src/storage/**`).
 * This file re-exports the canonical type signatures defined across the
 * library so consumers can `import type { Message } from 'impai'`.
 *
 * Source-of-truth files (per _workspace/03_db_schema.md §2):
 *   - message.ts          → Role, ContentPart, Message
 *   - stream.ts           → TokenUsage, StreamChunk, BaseResponse
 *   - adapter.ts          → ChatRequest, AdapterStreamOptions, Adapter
 *   - config.ts           → OpenAIConfig, LocalConfig, Engine, EngineConfig
 *   - session.ts          → ChatSession, SessionMeta, CURRENT_SCHEMA_VERSION
 *   - storage             → StorageAdapter (in `src/storage/StorageAdapter.ts`)
 */

export type { Role, ContentPart, Message } from './message';
export type { TokenUsage, StreamChunk, BaseResponse } from './stream';
export type {
  ChatRequest,
  AdapterStreamOptions,
  Adapter,
} from './adapter';
export type {
  OpenAIConfig,
  LocalConfig,
  Engine,
  EngineConfig,
} from './config';
export type { ChatSession, SessionMeta } from './session';
export { CURRENT_SCHEMA_VERSION } from './session';
// StorageAdapter lives under storage/ to keep its implementations co-located.
export type { StorageAdapter } from '@/storage/StorageAdapter';
