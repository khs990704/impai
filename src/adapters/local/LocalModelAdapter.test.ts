import { afterEach, describe, expect, it, vi } from 'vitest';
import { LocalModelAdapter } from './LocalModelAdapter';
import {
  AbortError,
  LocalEngineUnavailable,
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

function ndjsonStream(chunks: string[]): ReadableStream<Uint8Array> {
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
}): Response {
  const status = opts.status ?? 200;
  const body =
    typeof opts.body === 'string' ? new Blob([opts.body]) : (opts.body ?? null);
  return new Response(body as BodyInit | null, { status });
}

afterEach(() => vi.restoreAllMocks());

async function collect(
  iter: AsyncIterable<StreamChunk>,
): Promise<StreamChunk[]> {
  const out: StreamChunk[] = [];
  for await (const c of iter) out.push(c);
  return out;
}

describe('LocalModelAdapter — config validation', () => {
  it('throws when model is missing', () => {
    expect(() => new LocalModelAdapter({ model: '' })).toThrow(
      /model is required/,
    );
  });

  it('default URL is localhost:11434/api/chat', () => {
    const a = new LocalModelAdapter({ model: 'llama3' });
    const built = a._buildRequestForTests({ messages: [REQ_MSG] });
    expect(built.url).toBe('http://localhost:11434/api/chat');
  });

  it('honours custom baseUrl with trailing slash', () => {
    const a = new LocalModelAdapter({
      model: 'llama3',
      baseUrl: 'http://example.com:9999/',
    });
    const built = a._buildRequestForTests({ messages: [REQ_MSG] });
    expect(built.url).toBe('http://example.com:9999/api/chat');
  });
});

describe('LocalModelAdapter — request body', () => {
  it('serialises model + messages + stream:true', () => {
    const a = new LocalModelAdapter({ model: 'llama3', keepAlive: '5m' });
    const built = a._buildRequestForTests({ messages: [REQ_MSG] });
    const body = JSON.parse(built.body) as Record<string, unknown>;
    expect(body['model']).toBe('llama3');
    expect(body['stream']).toBe(true);
    expect(body['keep_alive']).toBe('5m');
  });

  it('translates maxTokens to options.num_predict', () => {
    const a = new LocalModelAdapter({ model: 'llama3' });
    const built = a._buildRequestForTests({
      messages: [REQ_MSG],
      maxTokens: 256,
    });
    const body = JSON.parse(built.body) as { options?: Record<string, number> };
    expect(body.options?.['num_predict']).toBe(256);
  });
});

describe('LocalModelAdapter — streaming', () => {
  it('yields parsed NDJSON chunks', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      fakeResponse({
        status: 200,
        body: ndjsonStream([
          '{"message":{"content":"Hi"},"done":false}\n',
          '{"done":true,"prompt_eval_count":3,"eval_count":1}\n',
        ]),
      }),
    );
    const a = new LocalModelAdapter(
      { model: 'llama3' },
      { fetch: fetchMock as typeof fetch },
    );
    const chunks = await collect(a.stream({ messages: [REQ_MSG] }));
    expect(chunks.map((c) => c.delta)).toEqual(['Hi', '']);
    expect(chunks.at(-1)?.usage?.totalTokens).toBe(4);
  });

  it('maps refused TypeError to LocalEngineUnavailable', async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValue(new TypeError('Failed to fetch'));
    const a = new LocalModelAdapter(
      { model: 'llama3' },
      { fetch: fetchMock as typeof fetch },
    );
    await expect(
      collect(a.stream({ messages: [REQ_MSG] })),
    ).rejects.toBeInstanceOf(LocalEngineUnavailable);
  });

  it('maps ECONNREFUSED cause to LocalEngineUnavailable', async () => {
    const err = Object.assign(new Error('connect ECONNREFUSED'), {
      cause: { code: 'ECONNREFUSED' },
    });
    const fetchMock = vi.fn().mockRejectedValue(err);
    const a = new LocalModelAdapter(
      { model: 'llama3' },
      { fetch: fetchMock as typeof fetch },
    );
    await expect(
      collect(a.stream({ messages: [REQ_MSG] })),
    ).rejects.toBeInstanceOf(LocalEngineUnavailable);
  });

  it('maps non-200 to UpstreamError', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(fakeResponse({ status: 500, body: 'oops' }));
    const a = new LocalModelAdapter(
      { model: 'llama3' },
      { fetch: fetchMock as typeof fetch },
    );
    await expect(
      collect(a.stream({ messages: [REQ_MSG] })),
    ).rejects.toBeInstanceOf(UpstreamError);
  });

  it('throws AbortError when signal is pre-aborted', async () => {
    const fetchMock = vi.fn();
    const a = new LocalModelAdapter(
      { model: 'llama3' },
      { fetch: fetchMock as typeof fetch },
    );
    const ac = new AbortController();
    ac.abort();
    await expect(
      collect(a.stream({ messages: [REQ_MSG] }, { signal: ac.signal })),
    ).rejects.toSatisfy((e) => AbortError.is(e));
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
