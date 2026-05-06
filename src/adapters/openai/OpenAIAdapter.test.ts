import { afterEach, describe, expect, it, vi } from 'vitest';
import { OpenAIAdapter } from './OpenAIAdapter';
import {
  AbortError,
  AuthError,
  NetworkError,
  RateLimitError,
  UpstreamError,
} from '@/utils/errors';
import type { Message } from '@/types/message';
import type { StreamChunk } from '@/types/stream';

const REQ_MSG: Message = {
  id: 'm1',
  role: 'user',
  content: 'Hi',
  createdAt: 0,
};

function sseStream(chunks: string[]): ReadableStream<Uint8Array> {
  const enc = new TextEncoder();
  let i = 0;
  return new ReadableStream<Uint8Array>({
    pull(c) {
      if (i >= chunks.length) {
        c.close();
        return;
      }
      const piece = chunks[i++];
      if (piece !== undefined) c.enqueue(enc.encode(piece));
    },
  });
}

function fakeResponse(opts: {
  status?: number;
  body?: ReadableStream<Uint8Array> | string | null;
  headers?: Record<string, string>;
}): Response {
  const status = opts.status ?? 200;
  const body =
    typeof opts.body === 'string'
      ? new Blob([opts.body])
      : (opts.body ?? null);
  const init: ResponseInit = { status };
  if (opts.headers !== undefined) init.headers = opts.headers;
  return new Response(body as BodyInit | null, init);
}

afterEach(() => {
  vi.restoreAllMocks();
});

async function collect(
  iter: AsyncIterable<StreamChunk>,
): Promise<StreamChunk[]> {
  const out: StreamChunk[] = [];
  for await (const c of iter) out.push(c);
  return out;
}

describe('OpenAIAdapter — security validation', () => {
  it('throws AuthError when apiKey is set in browser without dangerouslyAllowBrowser', () => {
    expect(() => new OpenAIAdapter({ apiKey: 'sk-x' })).toThrow(AuthError);
  });

  it('allows apiKey when dangerouslyAllowBrowser is true', () => {
    expect(
      () =>
        new OpenAIAdapter({ apiKey: 'sk-x', dangerouslyAllowBrowser: true }),
    ).not.toThrow();
  });

  it('allows proxyUrl path without apiKey', () => {
    expect(
      () => new OpenAIAdapter({ proxyUrl: 'https://my.proxy/api' }),
    ).not.toThrow();
  });
});

describe('OpenAIAdapter — request shape', () => {
  it('sends Authorization header in direct mode', () => {
    const a = new OpenAIAdapter({
      apiKey: 'sk-test',
      dangerouslyAllowBrowser: true,
    });
    const built = a._buildRequestForTests({ messages: [REQ_MSG] });
    expect(built.url).toBe('https://api.openai.com/v1/chat/completions');
    expect(built.headers['Authorization']).toBe('Bearer sk-test');
    const body = JSON.parse(built.body) as Record<string, unknown>;
    expect(body['stream']).toBe(true);
    expect(body['model']).toBe('gpt-4o-mini');
  });

  it('omits Authorization when proxyUrl is set', () => {
    const a = new OpenAIAdapter({ proxyUrl: 'https://example.com/api' });
    const built = a._buildRequestForTests({ messages: [REQ_MSG] });
    expect(built.url).toBe('https://example.com/api');
    expect(built.headers['Authorization']).toBeUndefined();
  });

  it('prepends systemPrompt as a system message', () => {
    const a = new OpenAIAdapter({ proxyUrl: 'https://x' });
    const built = a._buildRequestForTests({
      messages: [REQ_MSG],
      systemPrompt: 'be helpful',
    });
    const body = JSON.parse(built.body) as { messages: Array<{ role: string }> };
    expect(body.messages[0]?.role).toBe('system');
    expect(body.messages[1]?.role).toBe('user');
  });
});

describe('OpenAIAdapter — streaming', () => {
  it('yields chunks parsed from the SSE body', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      fakeResponse({
        status: 200,
        body: sseStream([
          'data: {"choices":[{"delta":{"content":"Hi"}}]}\n\n',
          'data: [DONE]\n\n',
        ]),
      }),
    );
    const a = new OpenAIAdapter(
      { proxyUrl: 'https://example.com' },
      { fetch: fetchMock as typeof fetch },
    );
    const chunks = await collect(a.stream({ messages: [REQ_MSG] }));
    expect(chunks.map((c) => c.delta)).toEqual(['Hi', '']);
    expect(chunks.at(-1)?.done).toBe(true);
  });

  it('maps 401 to AuthError', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        fakeResponse({ status: 401, body: '{"error":{"message":"bad"}}' }),
      );
    const a = new OpenAIAdapter(
      { proxyUrl: 'https://x' },
      { fetch: fetchMock as typeof fetch },
    );
    await expect(collect(a.stream({ messages: [REQ_MSG] }))).rejects.toBeInstanceOf(
      AuthError,
    );
  });

  it('maps 5xx to UpstreamError', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(fakeResponse({ status: 503, body: 'oops' }));
    const a = new OpenAIAdapter(
      { proxyUrl: 'https://x' },
      { fetch: fetchMock as typeof fetch },
    );
    await expect(collect(a.stream({ messages: [REQ_MSG] }))).rejects.toBeInstanceOf(
      UpstreamError,
    );
  });

  it('retries once on 429 then succeeds', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        fakeResponse({
          status: 429,
          body: '{"error":{"message":"slow"}}',
          headers: { 'retry-after': '0' },
        }),
      )
      .mockResolvedValueOnce(
        fakeResponse({
          status: 200,
          body: sseStream([
            'data: {"choices":[{"delta":{"content":"ok"}}]}\n\n',
            'data: [DONE]\n\n',
          ]),
        }),
      );
    const a = new OpenAIAdapter(
      { proxyUrl: 'https://x' },
      { fetch: fetchMock as typeof fetch },
    );
    const chunks = await collect(a.stream({ messages: [REQ_MSG] }));
    expect(chunks.map((c) => c.delta)).toEqual(['ok', '']);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('throws RateLimitError after second 429', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      fakeResponse({
        status: 429,
        body: '{"error":{"message":"slow"}}',
        headers: { 'retry-after': '0' },
      }),
    );
    const a = new OpenAIAdapter(
      { proxyUrl: 'https://x' },
      { fetch: fetchMock as typeof fetch },
    );
    await expect(
      collect(a.stream({ messages: [REQ_MSG] })),
    ).rejects.toBeInstanceOf(RateLimitError);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('wraps fetch rejection into NetworkError', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError('net down'));
    const a = new OpenAIAdapter(
      { proxyUrl: 'https://x' },
      { fetch: fetchMock as typeof fetch },
    );
    await expect(
      collect(a.stream({ messages: [REQ_MSG] })),
    ).rejects.toBeInstanceOf(NetworkError);
  });

  it('propagates AbortError when signal is already aborted', async () => {
    const fetchMock = vi.fn();
    const a = new OpenAIAdapter(
      { proxyUrl: 'https://x' },
      { fetch: fetchMock as typeof fetch },
    );
    const ac = new AbortController();
    ac.abort();
    await expect(
      collect(a.stream({ messages: [REQ_MSG] }, { signal: ac.signal })),
    ).rejects.toSatisfy((e) => AbortError.is(e));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('translates fetch AbortError into AbortError class', async () => {
    const fetchMock = vi.fn().mockImplementation(() => {
      const e = new Error('aborted');
      e.name = 'AbortError';
      throw e;
    });
    const a = new OpenAIAdapter(
      { proxyUrl: 'https://x' },
      { fetch: fetchMock as typeof fetch },
    );
    await expect(
      collect(a.stream({ messages: [REQ_MSG] })),
    ).rejects.toSatisfy((e) => AbortError.is(e));
  });
});

describe('OpenAIAdapter — chat()', () => {
  it('collects deltas into a single assistant message', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      fakeResponse({
        status: 200,
        body: sseStream([
          'data: {"choices":[{"delta":{"content":"He"}}]}\n\n',
          'data: {"choices":[{"delta":{"content":"llo"}}]}\n\n',
          'data: [DONE]\n\n',
        ]),
      }),
    );
    const a = new OpenAIAdapter(
      { proxyUrl: 'https://x' },
      { fetch: fetchMock as typeof fetch },
    );
    const res = await a.chat({ messages: [REQ_MSG] });
    expect(res.message.content).toBe('Hello');
    expect(res.message.role).toBe('assistant');
    expect(res.message.status).toBe('complete');
  });
});
