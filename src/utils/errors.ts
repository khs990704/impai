/**
 * Adapter error class hierarchy.
 *
 * Spec source: `_workspace/02_api_spec.md` §B.5 (mapping table) and §B.5 base
 * class definitions. Class names and `code` discriminants are part of the
 * public API surface — do not rename without a CHANGELOG entry.
 *
 * Design decisions:
 *  - `AiReactError` is the common ancestor (renamed from `AiError` in §B.5
 *    purely to namespace the library; `AiError` is re-exported as an alias
 *    for backwards compatibility with the spec sample code in §A.0).
 *  - `name` is set via `new.target.name` so subclasses get correct names
 *    for `error.name` introspection and stack traces.
 *  - `cause` is exposed both as a property and (when supported) via the
 *    standard `Error({ cause })` option.
 *  - We prefer DOMException('AbortError') in browsers; in Node we fall back
 *    to a constructed Error with `name: 'AbortError'`. The static helper
 *    `isAbortError()` recognises both.
 */

export type AiReactErrorCode =
  | 'AUTH'
  | 'RATE_LIMIT'
  | 'UPSTREAM'
  | 'NETWORK'
  | 'LOCAL_UNAVAILABLE'
  | 'ABORT'
  | 'UNKNOWN';

export interface AiReactErrorOptions {
  cause?: unknown;
}

/**
 * Base class for every error thrown out of the adapter layer.
 *
 * Consumers can `instanceof AiReactError` to detect any library error, or
 * narrow further by `code` / specific subclass.
 */
export class AiReactError extends Error {
  readonly code: AiReactErrorCode;
  /**
   * `declare` here so the field is a TYPE annotation only — we avoid the
   * `useDefineForClassFields` semantic where `readonly cause?: unknown` would
   * be lowered to `Object.defineProperty(this, 'cause', { value: undefined })`,
   * which writes an OWN `cause` property even when no cause was provided. The
   * test in `errors.test.ts` (`'cause' in err && err.cause === undefined`)
   * relies on us NOT writing the key when there is no cause.
   */
  declare readonly cause?: unknown;

  constructor(
    code: AiReactErrorCode,
    message: string,
    options?: AiReactErrorOptions,
  ) {
    super(message);
    this.code = code;
    if (options?.cause !== undefined) {
      // `defineProperty` keeps this assignment compatible with the `readonly`
      // declaration above and works with `declare`-only fields.
      Object.defineProperty(this, 'cause', {
        value: options.cause,
        writable: false,
        enumerable: true,
        configurable: true,
      });
    }
    // Preserve subclass name on `error.name` for clean stack traces.
    this.name = new.target.name;
  }
}

/** Alias preserved for compatibility with `_workspace/02_api_spec.md` §A.0. */
export const AiError = AiReactError;
export type AiError = AiReactError;

/** HTTP 401/403 from upstream, or local refusal to send an apiKey. */
export class AuthError extends AiReactError {
  constructor(message: string, options?: AiReactErrorOptions) {
    super('AUTH', message, options);
  }
}

/** HTTP 429. `retryAfter` is milliseconds, parsed from the Retry-After header. */
export class RateLimitError extends AiReactError {
  // `declare` so an absent retryAfter does NOT create an own property with
  // value `undefined` (would violate exactOptionalPropertyTypes contract).
  declare readonly retryAfter?: number;

  constructor(
    message: string,
    retryAfter?: number,
    options?: AiReactErrorOptions,
  ) {
    super('RATE_LIMIT', message, options);
    if (retryAfter !== undefined) {
      Object.defineProperty(this, 'retryAfter', {
        value: retryAfter,
        writable: false,
        enumerable: true,
        configurable: true,
      });
    }
  }
}

/** Any non-2xx that does not fit Auth / RateLimit. Includes 5xx. */
export class UpstreamError extends AiReactError {
  readonly status: number;
  declare readonly body?: unknown;

  constructor(status: number, body?: unknown, options?: AiReactErrorOptions) {
    super('UPSTREAM', `Upstream error ${status}`, options);
    this.status = status;
    if (body !== undefined) {
      Object.defineProperty(this, 'body', {
        value: body,
        writable: false,
        enumerable: true,
        configurable: true,
      });
    }
  }
}

/** fetch() rejected before producing a Response (DNS, CORS, offline). */
export class NetworkError extends AiReactError {
  constructor(message: string, options?: AiReactErrorOptions) {
    super('NETWORK', message, options);
  }
}

/** Ollama refused the connection. */
export class LocalEngineUnavailable extends AiReactError {
  constructor(message: string, options?: AiReactErrorOptions) {
    super('LOCAL_UNAVAILABLE', message, options);
  }
}

/**
 * AbortError. Mirrors the DOMException so both `error.name === 'AbortError'`
 * and `instanceof AbortError` work in tests.
 *
 * Per spec §C.5 the AbortError must NOT surface to user-supplied `onError`
 * callbacks — it represents a normal `cancel()` flow. The hook layer is
 * responsible for swallowing it.
 */
export class AbortError extends AiReactError {
  constructor(message = 'Aborted', options?: AiReactErrorOptions) {
    super('ABORT', message, options);
    // `error.name === 'AbortError'` is the cross-runtime convention.
    this.name = 'AbortError';
  }

  /**
   * Recognises both AbortError and the native DOMException 'AbortError'
   * thrown by `fetch()` when its AbortSignal is aborted.
   */
  static is(err: unknown): boolean {
    if (err instanceof AbortError) return true;
    if (err instanceof Error && err.name === 'AbortError') return true;
    if (
      typeof DOMException !== 'undefined' &&
      err instanceof DOMException &&
      err.name === 'AbortError'
    ) {
      return true;
    }
    return false;
  }
}
