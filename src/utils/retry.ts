/**
 * Adapter-level retry policy.
 *
 * Spec source: `_workspace/02_api_spec.md` §B.6.
 *
 * Policy (0.1.0):
 *  - 429 → exactly one retry. Honour `Retry-After` header in milliseconds; if
 *    absent, sleep 250-500ms with jitter.
 *  - 5xx / 4xx (other) / network → no retry. Caller surfaces the error.
 *  - AbortError → no retry. Always propagated immediately.
 *
 * The helper is decoupled from the adapter so it can be tested with a fake
 * `attempt()` and a fake `sleep()`.
 */

import { AbortError, RateLimitError } from './errors';

export interface RetryOptions {
  /** Hard cap on retry attempts after the first try. Default 1 (per §B.6). */
  maxRetries?: number;
  /** Inject for tests. Defaults to `setTimeout`. */
  sleep?: (ms: number) => Promise<void>;
  /** Inject for tests. Defaults to `Math.random`. */
  random?: () => number;
  /** Optional abort signal — if aborted while sleeping we throw AbortError. */
  signal?: AbortSignal;
}

const DEFAULT_JITTER_MIN_MS = 250;
const DEFAULT_JITTER_MAX_MS = 500;

function defaultSleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new AbortError());
      return;
    }
    const t = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(t);
      reject(new AbortError());
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

function jitterMs(random: () => number): number {
  const span = DEFAULT_JITTER_MAX_MS - DEFAULT_JITTER_MIN_MS;
  return Math.floor(DEFAULT_JITTER_MIN_MS + random() * span);
}

/**
 * Run `attempt` once. On `RateLimitError`, wait and retry up to `maxRetries`
 * times. Any other error is rethrown without retry.
 *
 * The caller is responsible for translating HTTP status codes into the
 * appropriate error class; this helper reacts only to error classes.
 */
export async function withRateLimitRetry<T>(
  attempt: () => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const maxRetries = options.maxRetries ?? 1;
  const random = options.random ?? Math.random;
  const sleep =
    options.sleep ??
    ((ms: number) => defaultSleep(ms, options.signal));

  let attemptNo = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      return await attempt();
    } catch (err) {
      if (AbortError.is(err)) throw err;
      if (!(err instanceof RateLimitError)) throw err;
      if (attemptNo >= maxRetries) throw err;
      attemptNo += 1;

      const waitMs =
        err.retryAfter !== undefined && Number.isFinite(err.retryAfter)
          ? Math.max(0, err.retryAfter)
          : jitterMs(random);
      await sleep(waitMs);
      // Loop and try again. If the second attempt also throws RateLimit,
      // the maxRetries check above will surface it.
    }
  }
}

/**
 * Parse a `Retry-After` header to milliseconds. Spec allows seconds (delta
 * integer) or an HTTP-date. Unknown formats return `undefined`.
 */
export function parseRetryAfter(headerValue: string | null): number | undefined {
  if (!headerValue) return undefined;
  const trimmed = headerValue.trim();
  if (trimmed === '') return undefined;

  // Numeric: seconds.
  const seconds = Number(trimmed);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.round(seconds * 1000);
  }

  // HTTP-date: difference from now.
  const date = Date.parse(trimmed);
  if (!Number.isNaN(date)) {
    const diff = date - Date.now();
    return diff > 0 ? diff : 0;
  }

  return undefined;
}
