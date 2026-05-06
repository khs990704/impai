/**
 * Ollama `/api/chat` adapter (NDJSON streaming).
 *
 * Spec sources:
 *  - `_workspace/02_api_spec.md` §B.3 (wire), §B.5 (error mapping).
 *  - `_workspace/01_architecture.md` §11 (LocalConfig validation).
 *
 * Behaviour summary:
 *  - URL: `${config.baseUrl ?? 'http://localhost:11434'}/api/chat`.
 *  - Body matches Ollama's documented chat request: `{ model, messages,
 *    stream, options.temperature, keep_alive }`.
 *  - Stream parsing delegates to `parseNdjson`.
 *  - `ECONNREFUSED` / `TypeError: Failed to fetch` → `LocalEngineUnavailable`.
 *  - 429 retry policy is reused via `withRateLimitRetry`, even though Ollama
 *    rarely returns 429 — keeps adapters consistent.
 */

import type {
  Adapter,
  AdapterStreamOptions,
  ChatRequest,
} from '@/types/adapter';
import type { LocalConfig } from '@/types/config';
import type { Message } from '@/types/message';
import type { BaseResponse, StreamChunk } from '@/types/stream';
import { parseNdjson } from '@/utils/parseNdjson';
import {
  AbortError,
  LocalEngineUnavailable,
  NetworkError,
  RateLimitError,
  UpstreamError,
} from '@/utils/errors';
import { parseRetryAfter, withRateLimitRetry } from '@/utils/retry';
import type { AdapterContext } from '../types';

const DEFAULT_BASE_URL = 'http://localhost:11434';

function validateLocalConfig(config: LocalConfig): void {
  if (typeof config.model !== 'string' || config.model.length === 0) {
    throw new Error('LocalConfig.model is required');
  }
}

function looksLikeRefused(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const m = err.message ?? '';
  if (/ECONNREFUSED/i.test(m)) return true;
  if (/Failed to fetch/i.test(m)) return true;
  if (/NetworkError when attempting/i.test(m)) return true;
  // Node's undici fetch wraps the cause as a system error.
  const cause = (err as { cause?: { code?: string } }).cause;
  if (cause && typeof cause === 'object' && cause.code === 'ECONNREFUSED') {
    return true;
  }
  return false;
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

async function statusToError(res: Response): Promise<Error> {
  const body = await readBodySafely(res);
  if (res.status === 429) {
    return new RateLimitError(
      'Rate limit exceeded',
      parseRetryAfter(res.headers.get('retry-after')),
    );
  }
  return new UpstreamError(res.status, body);
}

export class LocalModelAdapter implements Adapter {
  readonly id = 'local' as const;
  private readonly config: LocalConfig;
  private readonly fetchImpl: typeof globalThis.fetch;

  constructor(config: LocalConfig, ctx?: AdapterContext) {
    validateLocalConfig(config);
    this.config = config;
    this.fetchImpl = ctx?.fetch ?? globalThis.fetch.bind(globalThis);
  }

  private url(): string {
    const base = this.config.baseUrl ?? DEFAULT_BASE_URL;
    // Trim trailing slash to keep `${base}/api/chat` clean.
    const trimmed = base.endsWith('/') ? base.slice(0, -1) : base;
    return `${trimmed}/api/chat`;
  }

  private body(req: ChatRequest): string {
    const messages: Array<{ role: string; content: string }> = [];
    if (req.systemPrompt && req.systemPrompt.length > 0) {
      messages.push({ role: 'system', content: req.systemPrompt });
    }
    for (const m of req.messages) {
      const content = typeof m.content === 'string' ? m.content : '';
      messages.push({ role: m.role, content });
    }
    const payload: Record<string, unknown> = {
      model: req.model ?? this.config.model,
      messages,
      stream: true,
    };
    const options: Record<string, unknown> = {};
    const temperature = req.temperature ?? this.config.temperature;
    if (typeof temperature === 'number') options['temperature'] = temperature;
    const maxTokens = req.maxTokens;
    if (typeof maxTokens === 'number') {
      // Ollama uses `num_predict` instead of `max_tokens`.
      options['num_predict'] = maxTokens;
    }
    if (Object.keys(options).length > 0) payload['options'] = options;
    if (this.config.keepAlive) payload['keep_alive'] = this.config.keepAlive;
    return JSON.stringify(payload);
  }

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
      id: 'pending',
      role: 'assistant',
      content: collected,
      createdAt: Date.now(),
      status: 'complete',
    };
    const result: BaseResponse = { id: 'local', message };
    if (finishReason) result.finishReason = finishReason;
    if (usage) result.usage = usage;
    const model = req.model ?? this.config.model;
    result.model = model;
    return result;
  }

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

  private streamInner(
    req: ChatRequest,
    opts?: AdapterStreamOptions,
  ): AsyncIterator<StreamChunk> {
    const signal = opts?.signal;

    const attempt = async (): Promise<AsyncIterator<StreamChunk>> => {
      let res: Response;
      try {
        res = await this.fetchImpl(this.url(), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: this.body(req),
          ...(signal ? { signal } : {}),
        });
      } catch (err) {
        if (AbortError.is(err)) throw new AbortError();
        if (looksLikeRefused(err)) {
          throw new LocalEngineUnavailable(
            'Ollama가 실행 중인지 확인하세요(`ollama serve`).',
            { cause: err },
          );
        }
        const msg = err instanceof Error ? err.message : 'Network failure';
        throw new NetworkError(msg, { cause: err });
      }

      if (!res.ok) {
        throw await statusToError(res);
      }
      if (!res.body) {
        throw new UpstreamError(res.status, 'Response had no body');
      }
      return parseNdjson(res.body)[Symbol.asyncIterator]();
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

  /** Test-only helper. */
  _buildRequestForTests(req: ChatRequest): { url: string; body: string } {
    return { url: this.url(), body: this.body(req) };
  }
}
