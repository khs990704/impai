/**
 * OpenAI Chat Completions adapter (SSE streaming).
 *
 * Spec sources:
 *  - `_workspace/02_api_spec.md` §B.1 (wire), §B.2 (proxy envelope), §B.5
 *    (error mapping), §B.6 (retry policy), §A.7 (Adapter shape).
 *  - `_workspace/01_architecture.md` §11 (security model).
 *
 * Behaviour summary:
 *  - URL: `proxyUrl` if provided, else `https://api.openai.com/v1/chat/completions`.
 *  - Direct mode (`apiKey` set, no `proxyUrl`) requires `dangerouslyAllowBrowser:
 *    true` AND a browser environment; otherwise throws `AuthError` on the
 *    first call. Production builds without any auth source also throw.
 *  - Body matches OpenAI Chat Completions verbatim — proxies are expected to
 *    forward unchanged (per architect decision: 100% OpenAI-compatible).
 *  - Stream parsing delegates to `parseSSE`.
 *  - 429 retried once with backoff; all other errors propagate.
 */

import type {
  Adapter,
  AdapterStreamOptions,
  ChatRequest,
} from '@/types/adapter';
import type { Message } from '@/types/message';
import type { OpenAIConfig } from '@/types/config';
import type { BaseResponse, StreamChunk } from '@/types/stream';
import { parseSSE } from '@/utils/parseSSE';
import {
  AbortError,
  AuthError,
  NetworkError,
  RateLimitError,
  UpstreamError,
} from '@/utils/errors';
import { parseRetryAfter, withRateLimitRetry } from '@/utils/retry';
import type { AdapterContext } from '../types';

const OPENAI_DIRECT_URL = 'https://api.openai.com/v1/chat/completions';
const DEFAULT_MODEL = 'gpt-4o-mini';
const DEFAULT_TEMPERATURE = 0.7;

function isBrowser(): boolean {
  return typeof window !== 'undefined' && typeof document !== 'undefined';
}

function nodeEnv(): string | undefined {
  if (typeof process !== 'undefined' && process.env) {
    return process.env['NODE_ENV'];
  }
  return undefined;
}

/**
 * Static assertions for the OpenAI security model. Throws on first violation
 * so callers see the failure at construction or first call instead of when
 * a request is mid-flight.
 */
function validateOpenAIConfig(config: OpenAIConfig): void {
  const hasProxy = typeof config.proxyUrl === 'string' && config.proxyUrl.length > 0;
  const hasKey = typeof config.apiKey === 'string' && config.apiKey.length > 0;
  if (hasProxy) return;

  if (hasKey) {
    if (config.dangerouslyAllowBrowser !== true && isBrowser()) {
      throw new AuthError(
        'Refusing to send apiKey from browser. Set proxyUrl or dangerouslyAllowBrowser:true.',
      );
    }
    return;
  }

  // No key, no proxy.
  if (nodeEnv() === 'production') {
    throw new AuthError(
      'OpenAIConfig requires either `proxyUrl` or `apiKey`. Provide one.',
    );
  }
  // dev: warn but do not throw — first call will fail with 401 from upstream.
  // eslint-disable-next-line no-console
  console.warn(
    '[@org/ai-react] OpenAIConfig has neither proxyUrl nor apiKey. Calls will fail.',
  );
}

/** Convert our domain `Message[]` into the OpenAI wire shape. */
function toOpenAIMessages(
  req: ChatRequest,
): Array<{ role: string; content: string }> {
  const out: Array<{ role: string; content: string }> = [];
  if (req.systemPrompt && req.systemPrompt.length > 0) {
    out.push({ role: 'system', content: req.systemPrompt });
  }
  for (const m of req.messages) {
    // 0.1.0: strings only on the wire. ContentPart[] is reserved for P1/P2.
    const content = typeof m.content === 'string' ? m.content : '';
    out.push({ role: m.role, content });
  }
  return out;
}

async function readBodySafely(res: Response): Promise<unknown> {
  try {
    const text = await res.text();
    if (text.length === 0) return undefined;
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  } catch {
    return undefined;
  }
}

/**
 * Translate a non-2xx Response into the appropriate library error class.
 * Caller awaits this *before* attempting to read the streaming body.
 */
async function statusToError(res: Response): Promise<Error> {
  const body = await readBodySafely(res);
  const messageFromBody = (() => {
    if (body && typeof body === 'object' && body !== null && 'error' in body) {
      const err = (body as { error?: { message?: string } }).error;
      if (err && typeof err.message === 'string') return err.message;
    }
    return undefined;
  })();

  if (res.status === 401) {
    return new AuthError('Invalid API key. Check apiKey or proxyUrl.');
  }
  if (res.status === 403) {
    return new AuthError(
      `Forbidden: ${messageFromBody ?? 'request rejected by upstream'}`,
    );
  }
  if (res.status === 429) {
    const retryAfterMs = parseRetryAfter(res.headers.get('retry-after'));
    return new RateLimitError(
      messageFromBody ?? 'Rate limit exceeded',
      retryAfterMs,
    );
  }
  return new UpstreamError(res.status, body);
}

export class OpenAIAdapter implements Adapter {
  readonly id = 'openai' as const;
  private readonly config: OpenAIConfig;
  private readonly fetchImpl: typeof globalThis.fetch;

  constructor(config: OpenAIConfig, ctx?: AdapterContext) {
    validateOpenAIConfig(config);
    this.config = config;
    this.fetchImpl = ctx?.fetch ?? globalThis.fetch.bind(globalThis);
  }

  private url(): string {
    if (this.config.proxyUrl && this.config.proxyUrl.length > 0) {
      return this.config.proxyUrl;
    }
    return OPENAI_DIRECT_URL;
  }

  private headers(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
    };
    // Direct mode only — proxy mode lets the user inject auth via config.headers.
    const usingProxy =
      typeof this.config.proxyUrl === 'string' && this.config.proxyUrl.length > 0;
    if (!usingProxy && this.config.apiKey) {
      headers['Authorization'] = `Bearer ${this.config.apiKey}`;
    }
    if (this.config.headers) {
      Object.assign(headers, this.config.headers);
    }
    return headers;
  }

  private body(req: ChatRequest, stream: boolean): string {
    const payload: Record<string, unknown> = {
      model: req.model ?? this.config.model ?? DEFAULT_MODEL,
      messages: toOpenAIMessages(req),
      temperature: req.temperature ?? this.config.temperature ?? DEFAULT_TEMPERATURE,
      stream,
    };
    const maxTokens = req.maxTokens ?? this.config.maxTokens;
    if (typeof maxTokens === 'number') {
      payload['max_tokens'] = maxTokens;
    }
    return JSON.stringify(payload);
  }

  /**
   * Non-streaming chat. Implementation simply collects the streamed deltas
   * into a single message — keeps the adapter shape uniform without
   * doubling the wire surface.
   */
  async chat(
    req: ChatRequest,
    opts?: AdapterStreamOptions,
  ): Promise<BaseResponse> {
    let collected = '';
    let finishReason: StreamChunk['finishReason'] | undefined;
    let usage: BaseResponse['usage'];
    for await (const chunk of this.stream(req, opts)) {
      collected += chunk.delta;
      if (chunk.finishReason) finishReason = chunk.finishReason;
      if (chunk.usage) usage = chunk.usage;
    }
    const message: Message = {
      id: 'pending', // Hook layer assigns the real nanoid id.
      role: 'assistant',
      content: collected,
      createdAt: Date.now(),
      status: 'complete',
    };
    const result: BaseResponse = { id: 'openai', message };
    if (finishReason) result.finishReason = finishReason;
    if (usage) result.usage = usage;
    const model = req.model ?? this.config.model;
    if (model) result.model = model;
    return result;
  }

  /** Streaming entry point. */
  stream(
    req: ChatRequest,
    opts?: AdapterStreamOptions,
  ): AsyncIterable<StreamChunk> {
    const inner = this.streamInner.bind(this);
    return {
      [Symbol.asyncIterator]() {
        return inner(req, opts);
      },
    };
  }

  /**
   * Returns an async iterator that performs the fetch + retry loop and then
   * delegates to `parseSSE` for the actual chunk decoding.
   */
  private streamInner(
    req: ChatRequest,
    opts?: AdapterStreamOptions,
  ): AsyncIterator<StreamChunk> {
    const signal = opts?.signal;

    /** Performs one HTTP attempt and returns the response body's reader iterator. */
    const attempt = async (): Promise<AsyncIterator<StreamChunk>> => {
      let res: Response;
      try {
        res = await this.fetchImpl(this.url(), {
          method: 'POST',
          headers: this.headers(),
          body: this.body(req, true),
          ...(signal ? { signal } : {}),
        });
      } catch (err) {
        if (AbortError.is(err)) throw new AbortError();
        const message = err instanceof Error ? err.message : 'Network failure';
        const usingProxy =
          typeof this.config.proxyUrl === 'string' &&
          this.config.proxyUrl.length > 0;
        const hint = usingProxy
          ? ''
          : ' CORS preflight may be blocking the request — proxyUrl recommended.';
        throw new NetworkError(message + hint, { cause: err });
      }

      if (!res.ok) {
        throw await statusToError(res);
      }
      if (!res.body) {
        throw new UpstreamError(res.status, 'Response had no body');
      }
      return parseSSE(res.body)[Symbol.asyncIterator]();
    };

    let inner: AsyncIterator<StreamChunk> | null = null;
    let done = false;

    return {
      next: async (): Promise<IteratorResult<StreamChunk>> => {
        if (done) return { value: undefined, done: true };
        if (signal?.aborted) {
          done = true;
          throw new AbortError();
        }
        if (!inner) {
          inner = await withRateLimitRetry(attempt, signal ? { signal } : {});
        }
        try {
          const r = await inner.next();
          if (r.done) {
            done = true;
            return { value: undefined, done: true };
          }
          return r;
        } catch (err) {
          done = true;
          if (AbortError.is(err)) throw new AbortError();
          throw err;
        }
      },
      return: async (): Promise<IteratorResult<StreamChunk>> => {
        done = true;
        try {
          await inner?.return?.(undefined);
        } catch {
          /* ignore */
        }
        return { value: undefined, done: true };
      },
      throw: async (err: unknown): Promise<IteratorResult<StreamChunk>> => {
        done = true;
        try {
          await inner?.throw?.(err);
        } catch {
          /* ignore */
        }
        throw err;
      },
    };
  }

  /** Test-only helper. Exposed so unit tests can assert request shape. */
  _buildRequestForTests(req: ChatRequest): {
    url: string;
    headers: Record<string, string>;
    body: string;
  } {
    return {
      url: this.url(),
      headers: this.headers(),
      body: this.body(req, true),
    };
  }
}

