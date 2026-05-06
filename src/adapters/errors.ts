/**
 * Re-export shim. The canonical error class hierarchy lives in
 * `src/utils/errors.ts` (per parent-agent layout). This file is preserved so
 * legacy imports such as `@/adapters/errors` continue to resolve.
 *
 * Spec source: `_workspace/02_api_spec.md` §B.5.
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
} from '@/utils/errors';
export type { AiReactErrorCode } from '@/utils/errors';
