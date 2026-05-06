/**
 * Server-Sent Events parser for OpenAI Chat Completions streaming.
 *
 * Spec source: `_workspace/02_api_spec.md` §B.1 (`parseSSE` normalisation rules
 * 1-5). This parser is intentionally decoupled from `fetch()` — it accepts a
 * `ReadableStream<Uint8Array>` (the body of any Response) so it can be tested
 * with hand-built streams.
 *
 * Wire format (one event per `\n\n`-delimited block):
 *
 *   data: {"id":"chatcmpl-...","choices":[{"delta":{"content":"안"}}]}
 *
 *   data: [DONE]
 *
 * Output: `AsyncIterable<StreamChunk>` per the domain type in
 * `src/types/stream.ts`.
 *
 * Robustness rules (per §B.1):
 *  - JSON parse failures on a single event are NOT thrown. We `console.debug`
 *    and skip — the upstream may emit keep-alive comments or partial garbage.
 *  - `[DONE]` produces a final `{ delta: '', done: true }` chunk and ends the
 *    iteration; any text after `[DONE]` is ignored.
 *  - We carry a buffer across reads so multi-byte UTF-8 codepoints are not
 *    split (TextDecoder handles this when `stream: true` is used).
 */

import type { StreamChunk } from '@/types/stream';

/** Subset of the OpenAI Chat Completions chunk shape we care about. */
interface OpenAIChunkShape {
  choices?: Array<{
    delta?: { content?: string | null };
    finish_reason?: StreamChunk['finishReason'] | null;
  }>;
}

/** Split `buffer` into complete events + leftover. SSE delimits by blank line. */
export function splitSSEEvents(buffer: string): {
  events: string[];
  rest: string;
} {
  // SSE spec: events are separated by a blank line. We accept both `\n\n`
  // and `\r\n\r\n` (some proxies normalise to CRLF).
  const events: string[] = [];
  let rest = buffer;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const re = /(\r?\n){2}/;
    const m = re.exec(rest);
    if (!m) break;
    const matched = m[0];
    const end = m.index;
    events.push(rest.slice(0, end));
    rest = rest.slice(end + matched.length);
  }
  return { events, rest };
}

/**
 * Extract the `data:` payload from a single SSE event block. Multiple `data:`
 * lines in one event are concatenated with `\n` per the SSE spec.
 */
export function extractDataPayload(eventBlock: string): string | null {
  const lines = eventBlock.split(/\r?\n/);
  const datas: string[] = [];
  for (const line of lines) {
    if (line.startsWith('data:')) {
      // Strip the `data:` prefix plus a single optional space.
      datas.push(line.slice(5).replace(/^ /, ''));
    }
    // Comment lines start with ':' — ignore. event:/id:/retry: also ignored.
  }
  return datas.length === 0 ? null : datas.join('\n');
}

/**
 * Convert a parsed OpenAI chunk shape to our normalised `StreamChunk`.
 * Returns `null` when there is nothing user-visible (e.g. a heartbeat).
 */
function chunkFromOpenAI(parsed: OpenAIChunkShape): StreamChunk | null {
  const choice = parsed.choices?.[0];
  if (!choice) return null;
  const delta = choice.delta?.content ?? '';
  const finishReason = choice.finish_reason ?? undefined;
  // Per §B.1 rule 4: empty delta with a finish_reason still goes through as
  // non-done — the [DONE] sentinel is what flips `done` true.
  const chunk: StreamChunk = { delta, done: false };
  if (finishReason) {
    chunk.finishReason = finishReason;
  }
  return chunk;
}

/**
 * Parse an OpenAI SSE stream into normalised `StreamChunk`s.
 *
 * @param stream the response body (`Response.body`)
 */
export async function* parseSSE(
  stream: ReadableStream<Uint8Array>,
): AsyncGenerator<StreamChunk, void, void> {
  const reader = stream.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';
  let lastFinishReason: StreamChunk['finishReason'] | undefined;

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const { events, rest } = splitSSEEvents(buffer);
      buffer = rest;

      for (const ev of events) {
        const payload = extractDataPayload(ev);
        if (payload === null) continue;

        // The OpenAI sentinel ends the stream.
        if (payload === '[DONE]') {
          const finalChunk: StreamChunk = {
            delta: '',
            done: true,
          };
          if (lastFinishReason) {
            finalChunk.finishReason = lastFinishReason;
          } else {
            finalChunk.finishReason = 'stop';
          }
          yield finalChunk;
          return;
        }

        let parsed: OpenAIChunkShape;
        try {
          parsed = JSON.parse(payload) as OpenAIChunkShape;
        } catch (err) {
          // Per §B.1 rule 5 — skip malformed chunks; do not throw.
          // eslint-disable-next-line no-console
          console.debug('[parseSSE] JSON parse failed, skipping chunk', err);
          continue;
        }

        const chunk = chunkFromOpenAI(parsed);
        if (!chunk) continue;
        if (chunk.finishReason) {
          lastFinishReason = chunk.finishReason;
        }
        // Per §B.1 rule 4: empty delta with a finish_reason waits for the
        // [DONE] sentinel to surface as a single completion chunk; we do
        // NOT emit a separate finish_reason-only chunk here (otherwise
        // consumers receive two terminal events for the same stream).
        if (chunk.delta === '') continue;
        yield chunk;
      }
    }

    // Stream ended without a [DONE] sentinel. Flush whatever the decoder has
    // pending and emit a synthetic completion so the consumer can finalise.
    buffer += decoder.decode();
    if (buffer.trim().length > 0) {
      const { events } = splitSSEEvents(buffer + '\n\n');
      for (const ev of events) {
        const payload = extractDataPayload(ev);
        if (!payload || payload === '[DONE]') continue;
        try {
          const parsed = JSON.parse(payload) as OpenAIChunkShape;
          const chunk = chunkFromOpenAI(parsed);
          if (chunk && (chunk.delta !== '' || chunk.finishReason)) {
            if (chunk.finishReason) lastFinishReason = chunk.finishReason;
            yield chunk;
          }
        } catch {
          /* swallow per rule 5 */
        }
      }
    }
    const tail: StreamChunk = { delta: '', done: true };
    if (lastFinishReason) tail.finishReason = lastFinishReason;
    yield tail;
  } finally {
    // Always release the reader so the underlying body can be GC'd.
    try {
      reader.releaseLock();
    } catch {
      /* lock may already be released if the stream errored */
    }
  }
}
