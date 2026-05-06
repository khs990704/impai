/**
 * Integration test — `LocalModelAdapter` driving the Ollama MSW handlers.
 *
 * Covers:
 *   - happy path: NDJSON streaming → StreamChunks with delta + final usage
 *   - LocalEngineUnavailable on connection failure (HttpResponse.error())
 *   - UpstreamError mapping for non-2xx (`http://ollama-error.test/api/chat`)
 *   - Body shape: messages + options.temperature + keep_alive
 */

import { describe, expect, it } from 'vitest';
import { LocalModelAdapter } from '@/adapters/LocalModelAdapter';
import { LocalEngineUnavailable, UpstreamError } from '@/utils/errors';
import type { Message } from '@/types/message';
import type { StreamChunk } from '@/types/stream';

const REQ_MSG: Message = {
  id: 'm1',
  role: 'user',
  content: 'hi',
  createdAt: 0,
};

async function collect<T>(iter: AsyncIterable<T>): Promise<T[]> {
  const out: T[] = [];
  for await (const c of iter) out.push(c);
  return out;
}

describe('LocalModelAdapter — happy path via MSW', () => {
  it('streams Ollama NDJSON and surfaces TokenUsage on the final chunk', async () => {
    const a = new LocalModelAdapter({ model: 'mock-llama' });
    const chunks: StreamChunk[] = await collect(a.stream({ messages: [REQ_MSG] }));
    // Drip handler echoes "local:hi" — 8 chars → 8 deltas + 1 trailer.
    const deltas = chunks.filter((c) => !c.done).map((c) => c.delta);
    expect(deltas.join('')).toBe('local:hi');
    const last = chunks.at(-1);
    expect(last?.done).toBe(true);
    expect(last?.finishReason).toBe('stop');
    expect(last?.usage?.promptTokens).toBe(7);
    expect(last?.usage?.completionTokens).toBe(8);
    expect(last?.usage?.totalTokens).toBe(15);
  });

  it('puts temperature inside the options object (Ollama convention)', () => {
    const a = new LocalModelAdapter({
      model: 'llama3',
      temperature: 0.42,
      keepAlive: '5m',
    });
    const built = a._buildRequestForTests({ messages: [REQ_MSG] });
    const body = JSON.parse(built.body) as Record<string, unknown>;
    expect(body['model']).toBe('llama3');
    expect(body['stream']).toBe(true);
    expect(body['options']).toEqual({ temperature: 0.42 });
    expect(body['keep_alive']).toBe('5m');
  });
});

describe('LocalModelAdapter — error mapping', () => {
  it('maps a network-level failure to LocalEngineUnavailable', async () => {
    const a = new LocalModelAdapter({
      model: 'llama3',
      baseUrl: 'http://ollama-down.test',
    });
    await expect(collect(a.stream({ messages: [REQ_MSG] }))).rejects.toBeInstanceOf(
      LocalEngineUnavailable,
    );
  });

  it('maps a 503 to UpstreamError', async () => {
    // Layer a one-shot handler that forces a 503 against the default Ollama
    // endpoint — keeps `baseUrl` clean and avoids URL-suffix shenanigans.
    const { server: srv } = await import('../msw/server');
    const { http, HttpResponse } = await import('msw');
    srv.use(
      http.post('http://localhost:11434/api/chat', () => {
        return new HttpResponse('{"error":"oops"}', {
          status: 503,
          headers: { 'Content-Type': 'application/json' },
        });
      }),
    );
    const a = new LocalModelAdapter({ model: 'llama3' });
    await expect(collect(a.stream({ messages: [REQ_MSG] }))).rejects.toBeInstanceOf(
      UpstreamError,
    );
  });
});
