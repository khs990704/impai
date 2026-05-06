import { describe, expect, it } from 'vitest';
import {
  extractDataPayload,
  parseSSE,
  splitSSEEvents,
} from './parseSSE';
import type { StreamChunk } from '@/types/stream';

/**
 * Build a ReadableStream<Uint8Array> from a list of string chunks. Each chunk
 * arrives as one read on the consumer side, letting us simulate boundary
 * conditions where SSE events straddle a network packet.
 */
function streamOf(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  let i = 0;
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (i >= chunks.length) {
        controller.close();
        return;
      }
      const piece = chunks[i++];
      if (piece !== undefined) {
        controller.enqueue(encoder.encode(piece));
      }
    },
  });
}

async function collect(
  iter: AsyncIterable<StreamChunk>,
): Promise<StreamChunk[]> {
  const out: StreamChunk[] = [];
  for await (const c of iter) out.push(c);
  return out;
}

describe('splitSSEEvents', () => {
  it('separates events on blank lines', () => {
    const { events, rest } = splitSSEEvents('data: a\n\ndata: b\n\nremain');
    expect(events).toEqual(['data: a', 'data: b']);
    expect(rest).toBe('remain');
  });

  it('returns no events when buffer has no blank line', () => {
    const { events, rest } = splitSSEEvents('data: partial');
    expect(events).toEqual([]);
    expect(rest).toBe('data: partial');
  });

  it('handles CRLF line endings', () => {
    const { events, rest } = splitSSEEvents('data: a\r\n\r\nleftover');
    expect(events).toEqual(['data: a']);
    expect(rest).toBe('leftover');
  });
});

describe('extractDataPayload', () => {
  it('strips data: prefix and optional space', () => {
    expect(extractDataPayload('data: hello')).toBe('hello');
    expect(extractDataPayload('data:no-space')).toBe('no-space');
  });

  it('joins multiple data lines with newline', () => {
    expect(extractDataPayload('data: a\ndata: b')).toBe('a\nb');
  });

  it('ignores comments and other field types', () => {
    expect(extractDataPayload(': heartbeat')).toBeNull();
    expect(extractDataPayload('event: foo')).toBeNull();
  });
});

describe('parseSSE — happy path', () => {
  it('emits incremental deltas then the [DONE] sentinel', async () => {
    const stream = streamOf([
      'data: {"choices":[{"delta":{"content":"Hel"}}]}\n\n',
      'data: {"choices":[{"delta":{"content":"lo"}}]}\n\n',
      'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\n',
      'data: [DONE]\n\n',
    ]);
    const chunks = await collect(parseSSE(stream));
    expect(chunks).toEqual([
      { delta: 'Hel', done: false },
      { delta: 'lo', done: false },
      { delta: '', done: true, finishReason: 'stop' },
    ]);
  });

  it('handles event boundaries split across reads', async () => {
    const stream = streamOf([
      'data: {"choices":[{"delta":{"content":"a"}}]}\n',
      '\ndata: {"choices":[{"delta":{"content":"b"}}]}\n\n',
      'data: [DONE]\n\n',
    ]);
    const chunks = await collect(parseSSE(stream));
    expect(chunks.map((c) => c.delta)).toEqual(['a', 'b', '']);
    expect(chunks[chunks.length - 1]?.done).toBe(true);
  });

  it('skips JSON-malformed events without throwing', async () => {
    const stream = streamOf([
      'data: not-json\n\n',
      'data: {"choices":[{"delta":{"content":"ok"}}]}\n\n',
      'data: [DONE]\n\n',
    ]);
    const chunks = await collect(parseSSE(stream));
    expect(chunks.map((c) => c.delta)).toEqual(['ok', '']);
  });

  it('synthesises a done chunk when [DONE] is missing', async () => {
    const stream = streamOf([
      'data: {"choices":[{"delta":{"content":"x"}}]}\n\n',
    ]);
    const chunks = await collect(parseSSE(stream));
    expect(chunks[0]).toEqual({ delta: 'x', done: false });
    expect(chunks[chunks.length - 1]?.done).toBe(true);
  });

  it('drops pure heartbeat events (empty delta, no finish_reason)', async () => {
    const stream = streamOf([
      'data: {"choices":[{"delta":{}}]}\n\n',
      'data: {"choices":[{"delta":{"content":"x"}}]}\n\n',
      'data: [DONE]\n\n',
    ]);
    const chunks = await collect(parseSSE(stream));
    expect(chunks.map((c) => c.delta)).toEqual(['x', '']);
  });
});
