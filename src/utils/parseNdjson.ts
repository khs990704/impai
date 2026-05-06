/**
 * Newline-delimited JSON parser for Ollama `/api/chat` streaming.
 *
 * Spec source: `_workspace/02_api_spec.md` §B.3.
 *
 * Wire format (one JSON object per line):
 *
 *   {"model":"llama3","message":{"role":"assistant","content":"안"},"done":false}
 *   {"model":"llama3","done":true,"prompt_eval_count":5,"eval_count":12}
 *
 * Output: `AsyncIterable<StreamChunk>` per `src/types/stream.ts`.
 *
 * Robustness:
 *  - Lines that fail to JSON.parse are skipped with a debug log (matches the
 *    SSE parser policy — never throw mid-stream).
 *  - The final `done: true` line carries token usage which we map to
 *    `TokenUsage`. If usage fields are absent we still emit `{ done: true }`.
 *  - The decoder is held in `stream: true` mode so multi-byte UTF-8 codepoints
 *    that straddle a chunk boundary are not corrupted.
 */

import type { StreamChunk, TokenUsage } from '@/types/stream';

interface OllamaLineShape {
  message?: { role?: string; content?: string };
  done?: boolean;
  done_reason?: string;
  prompt_eval_count?: number;
  eval_count?: number;
}

/**
 * Map an Ollama `done: true` payload to a normalised `TokenUsage`.
 * Returns `undefined` when neither count is present so we avoid emitting
 * `{ promptTokens: undefined }` which would violate
 * `exactOptionalPropertyTypes`.
 */
function usageFromOllama(line: OllamaLineShape): TokenUsage | undefined {
  const prompt = line.prompt_eval_count;
  const completion = line.eval_count;
  if (prompt === undefined && completion === undefined) return undefined;
  const usage: TokenUsage = {};
  if (prompt !== undefined) usage.promptTokens = prompt;
  if (completion !== undefined) usage.completionTokens = completion;
  if (prompt !== undefined && completion !== undefined) {
    usage.totalTokens = prompt + completion;
  }
  return usage;
}

/**
 * Map Ollama's `done_reason` to our `finishReason` enum. Ollama uses
 * 'stop' / 'length' which align with OpenAI; anything else is dropped.
 */
function finishReasonFromOllama(
  reason: string | undefined,
): StreamChunk['finishReason'] | undefined {
  if (reason === 'stop' || reason === 'length') return reason;
  return undefined;
}

export async function* parseNdjson(
  stream: ReadableStream<Uint8Array>,
): AsyncGenerator<StreamChunk, void, void> {
  const reader = stream.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';
  let emittedDone = false;

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      // Split on every newline. The last segment may be incomplete and goes
      // back into the buffer.
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const rawLine of lines) {
        const line = rawLine.trim();
        if (line.length === 0) continue;

        let parsed: OllamaLineShape;
        try {
          parsed = JSON.parse(line) as OllamaLineShape;
        } catch (err) {
          // eslint-disable-next-line no-console
          console.debug(
            '[parseNdjson] JSON parse failed, skipping line',
            err,
          );
          continue;
        }

        const delta = parsed.message?.content ?? '';
        const isDone = parsed.done === true;
        const chunk: StreamChunk = { delta, done: isDone };
        const fr = finishReasonFromOllama(parsed.done_reason);
        if (fr) chunk.finishReason = fr;
        if (isDone) {
          if (!chunk.finishReason) chunk.finishReason = 'stop';
          const usage = usageFromOllama(parsed);
          if (usage) chunk.usage = usage;
          emittedDone = true;
          yield chunk;
          return;
        }

        // Skip purely empty heartbeat lines (rare for Ollama but defensive).
        if (chunk.delta === '') continue;
        yield chunk;
      }
    }

    // End of stream. Flush remaining decoder bytes and the trailing buffer.
    const tail = buffer + decoder.decode();
    const remaining = tail.trim();
    if (remaining.length > 0) {
      try {
        const parsed = JSON.parse(remaining) as OllamaLineShape;
        const isDone = parsed.done === true;
        const delta = parsed.message?.content ?? '';
        if (isDone) {
          const chunk: StreamChunk = { delta, done: true };
          const fr = finishReasonFromOllama(parsed.done_reason) ?? 'stop';
          chunk.finishReason = fr;
          const usage = usageFromOllama(parsed);
          if (usage) chunk.usage = usage;
          emittedDone = true;
          yield chunk;
          return;
        } else if (delta) {
          yield { delta, done: false };
        }
      } catch {
        /* swallow */
      }
    }

    // Stream closed without a `done: true` marker — synthesise one so the
    // consumer can finalise its state machine.
    if (!emittedDone) {
      yield { delta: '', done: true, finishReason: 'stop' };
    }
  } finally {
    try {
      reader.releaseLock();
    } catch {
      /* may already be released */
    }
  }
}
