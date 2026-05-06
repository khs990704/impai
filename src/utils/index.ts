/**
 * Utils barrel — pure-TS, React-free helpers shared across the adapter layer.
 *
 * Files:
 *  - `errors.ts`     → AiReactError + subclasses (per `_workspace/02_api_spec.md` §B.5).
 *  - `parseSSE.ts`   → OpenAI SSE parser (§B.1).
 *  - `parseNdjson.ts` → Ollama NDJSON parser (§B.3).
 *  - `retry.ts`      → 429 single-shot backoff (§B.6).
 *
 * NOTE: this barrel is INTERNAL. The public surface in `src/index.ts`
 * re-exports only a curated subset (the error classes).
 */

export {
  AiReactError,
  AiError,
  AuthError,
  RateLimitError,
  UpstreamError,
  NetworkError,
  LocalEngineUnavailable,
  AbortError,
} from './errors';
export type { AiReactErrorCode, AiReactErrorOptions } from './errors';

export { parseSSE, splitSSEEvents, extractDataPayload } from './parseSSE';
export { parseNdjson } from './parseNdjson';
export { withRateLimitRetry, parseRetryAfter } from './retry';
export type { RetryOptions } from './retry';
