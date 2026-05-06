import { describe, expect, it } from 'vitest';
import { parseNdjson } from './parseNdjson';
import type { StreamChunk } from '@/types/stream';

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
      if (piece !== undefined) controller.enqueue(encoder.encode(piece));
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

describe('parseNdjson — happy path', () => {
  it('emits per-line deltas and finalises on done:true', async () => {
    const stream = streamOf([
      '{"message":{"role":"assistant","content":"안"},"done":false}\n',
      '{"message":{"role":"assistant","content":"녕"},"done":false}\n',
      '{"done":true,"prompt_eval_count":5,"eval_count":12}\n',
    ]);
    const chunks = await collect(parseNdjson(stream));
    expect(chunks.length).toBe(3);
    expect(chunks[0]).toEqual({ delta: '안', done: false });
    expect(chunks[1]).toEqual({ delta: '녕', done: false });
    const last = chunks[2];
    expect(last).toBeDefined();
    if (!last) throw new Error('unreachable');
    expect(last.done).toBe(true);
    expect(last.finishReason).toBe('stop');
    expect(last.usage).toEqual({
      promptTokens: 5,
      completionTokens: 12,
      totalTokens: 17,
    });
  });

  it('handles a line that arrives split across reads', async () => {
    const stream = streamOf([
      '{"message":{"content":"a"},"done":false}\n{"message":{"con',
      'tent":"b"},"done":false}\n{"done":true}\n',
    ]);
    const chunks = await collect(parseNdjson(stream));
    expect(chunks.map((c) => c.delta)).toEqual(['a', 'b', '']);
    expect(chunks[chunks.length - 1]?.done).toBe(true);
  });

  it('skips malformed JSON lines', async () => {
    const stream = streamOf([
      'not-json\n',
      '{"message":{"content":"a"},"done":false}\n',
      '{"done":true}\n',
    ]);
    const chunks = await collect(parseNdjson(stream));
    expect(chunks.map((c) => c.delta)).toEqual(['a', '']);
  });

  it('synthesises a done chunk when stream closes without done:true', async () => {
    const stream = streamOf([
      '{"message":{"content":"a"},"done":false}\n',
    ]);
    const chunks = await collect(parseNdjson(stream));
    expect(chunks[chunks.length - 1]?.done).toBe(true);
  });

  it('reads done:true without trailing newline', async () => {
    const stream = streamOf([
      '{"message":{"content":"a"},"done":false}\n',
      '{"done":true,"prompt_eval_count":1,"eval_count":2}',
    ]);
    const chunks = await collect(parseNdjson(stream));
    const last = chunks[chunks.length - 1];
    expect(last?.done).toBe(true);
    expect(last?.usage?.totalTokens).toBe(3);
  });
});
