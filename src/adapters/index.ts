/**
 * Adapters barrel.
 *
 * Spec sources:
 *  - `_workspace/02_api_spec.md` §A.0 (public surface).
 *  - `_workspace/02_api_spec.md` §A.7 (Adapter contract).
 *  - `_workspace/02_api_spec.md` §B.5 (error classes).
 *
 * Frontend imports adapter classes and types from this barrel; the public
 * `src/index.ts` file (frontend-owned) re-exports a curated subset.
 *
 * Layout note: 0.1.0 keeps adapters in nested folders (`./openai/`,
 * `./local/`). Top-level files (`./OpenAIAdapter.ts`, `./LocalModelAdapter.ts`)
 * exist as shims so older imports keep working.
 */

// ── Adapter classes
export { OpenAIAdapter } from './openai';
export { LocalModelAdapter } from './local';

// ── Adapter-layer types (re-exported through `./types`)
export type {
  Role,
  ContentPart,
  Message,
  TokenUsage,
  StreamChunk,
  BaseResponse,
  ChatRequest,
  AdapterStreamOptions,
  Adapter,
  OpenAIConfig,
  LocalConfig,
  Engine,
  EngineConfig,
  AdapterConfig,
  AdapterContext,
  StreamingError,
} from './types';

// ── Error classes (per §B.5).
export {
  AiReactError,
  AiError,
  AuthError,
  RateLimitError,
  UpstreamError,
  NetworkError,
  LocalEngineUnavailable,
  AbortError,
} from '@/utils/errors';
export type { AiReactErrorCode } from '@/utils/errors';
