/**
 * Public barrel — `@org/ai-react`.
 *
 * Per _workspace/02_api_spec.md §A.0. Keep this list in sync with that doc.
 * `useAdapter` and `AiContext` are intentionally internal.
 */

// ── Components ────────────────────────────────────────────────────────────
export { AiProvider } from './provider/AiProvider';
export type { AiProviderProps } from './provider/AiProvider';

export { AiChat } from './components/AiChat/AiChat';
export type { AiChatProps } from './components/AiChat/AiChat';

export { AiSummaryButton } from './components/AiSummaryButton/AiSummaryButton';
export type { AiSummaryButtonProps } from './components/AiSummaryButton/AiSummaryButton';

// ── Hooks ─────────────────────────────────────────────────────────────────
export { useAiChat } from './hooks/useAiChat';
export type { UseAiChatOptions, UseAiChatReturn } from './hooks/useAiChat';

export { useAiSummary } from './hooks/useAiSummary';
export type { UseAiSummaryOptions, UseAiSummaryReturn } from './hooks/useAiSummary';

// ── Adapters (owned by backend-dev) ───────────────────────────────────────
export { OpenAIAdapter } from './adapters/OpenAIAdapter';
export { LocalModelAdapter } from './adapters/LocalModelAdapter';

// ── Storage (owned by backend-dev) ────────────────────────────────────────
export { localStorageAdapter, memoryStorageAdapter } from './storage';

// ── Domain types (single source: src/types) ───────────────────────────────
export type {
  Message,
  Role,
  ContentPart,
  StreamChunk,
  BaseResponse,
  TokenUsage,
  Adapter,
  ChatRequest,
  Engine,
  EngineConfig,
  OpenAIConfig,
  LocalConfig,
  ChatSession,
  StorageAdapter,
} from './types';
export { CURRENT_SCHEMA_VERSION } from './types';

// ── Errors ────────────────────────────────────────────────────────────────
export {
  AiError,
  AuthError,
  RateLimitError,
  UpstreamError,
  NetworkError,
  LocalEngineUnavailable,
  AbortError,
} from './adapters/errors';
