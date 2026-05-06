/**
 * MSW handlers for OpenAI Chat Completions.
 *
 * Drips SSE chunks at ~50ms intervals (per parent-agent brief and
 * `_workspace/04_test_plan.md` §3) so integration tests can assert on
 * intermediate streaming state without running real OpenAI traffic.
 *
 * Three endpoints are handled:
 *  - `https://api.openai.com/v1/chat/completions` — direct mode
 *  - `https://proxy.test/api` / `https://proxy.test/api/ai` — proxy mode
 *  - `https://proxy.test/error` — forces specific HTTP statuses for the
 *     error-mapping suite
 *
 * Each handler reads the request body, derives a deterministic reply, and
 * writes it through a `ReadableStream` so the consuming `parseSSE` parser
 * sees realistic chunk boundaries.
 */

import { http, HttpResponse, delay } from 'msw';

const SSE_HEADERS = {
  'Content-Type': 'text/event-stream',
  'Cache-Control': 'no-cache',
} as const;

interface OpenAiRequest {
  messages?: Array<{ role: string; content: string }>;
  model?: string;
}

/**
 * Build a readable SSE stream that emits the supplied `parts` one at a time
 * with ~50ms between chunks (typical streaming cadence). Ends with `[DONE]`.
 */
function dripSSE(
  parts: string[],
  opts: { intervalMs?: number; finishReason?: string } = {},
): ReadableStream<Uint8Array> {
  const intervalMs = opts.intervalMs ?? 50;
  const finishReason = opts.finishReason ?? 'stop';
  const encoder = new TextEncoder();
  let i = 0;
  let cancelled = false;
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      if (cancelled) {
        controller.close();
        return;
      }
      if (i < parts.length) {
        const payload = JSON.stringify({
          id: 'chatcmpl-msw',
          choices: [{ index: 0, delta: { content: parts[i] }, finish_reason: null }],
        });
        controller.enqueue(encoder.encode(`data: ${payload}\n\n`));
        i += 1;
        await delay(intervalMs);
        return;
      }
      // Emit the finish_reason event then [DONE].
      const finPayload = JSON.stringify({
        id: 'chatcmpl-msw',
        choices: [{ index: 0, delta: {}, finish_reason: finishReason }],
      });
      controller.enqueue(encoder.encode(`data: ${finPayload}\n\n`));
      await delay(intervalMs);
      controller.enqueue(encoder.encode('data: [DONE]\n\n'));
      controller.close();
    },
    cancel() {
      cancelled = true;
    },
  });
}

/**
 * Default reply: echo the last user message back, character-by-character.
 * Tests that need a specific reply can override via `OPENAI_FIXED_REPLY`.
 */
async function buildReply(req: Request): Promise<string[]> {
  let body: OpenAiRequest = {};
  try {
    body = (await req.clone().json()) as OpenAiRequest;
  } catch {
    /* tolerate malformed input — drip an empty stream */
  }
  const lastUser = body.messages
    ?.filter((m) => m.role === 'user')
    .at(-1)?.content;
  const reply = lastUser && lastUser.length > 0 ? `echo:${lastUser}` : 'hello';
  return [...reply];
}

const directHandler = http.post(
  'https://api.openai.com/v1/chat/completions',
  async ({ request }) => {
    const parts = await buildReply(request);
    return new HttpResponse(dripSSE(parts), { status: 200, headers: SSE_HEADERS });
  },
);

const proxyHandler = http.post('https://proxy.test/api', async ({ request }) => {
  const parts = await buildReply(request);
  return new HttpResponse(dripSSE(parts), { status: 200, headers: SSE_HEADERS });
});

const proxyAltHandler = http.post(
  'https://proxy.test/api/ai',
  async ({ request }) => {
    const parts = await buildReply(request);
    return new HttpResponse(dripSSE(parts), {
      status: 200,
      headers: SSE_HEADERS,
    });
  },
);

/**
 * Configurable error endpoint. Tests pass `?status=429&body=...` style query
 * to drive the error-mapping suite without juggling separate handlers.
 */
const errorHandler = http.post('https://proxy.test/error', ({ request }) => {
  const url = new URL(request.url);
  const status = Number(url.searchParams.get('status') ?? '500');
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const retryAfter = url.searchParams.get('retry-after');
  if (retryAfter !== null) headers['Retry-After'] = retryAfter;
  const body = url.searchParams.get('body') ?? `{"error":{"message":"status ${status}"}}`;
  return new HttpResponse(body, { status, headers });
});

export const openaiHandlers = [
  directHandler,
  proxyHandler,
  proxyAltHandler,
  errorHandler,
];

/** Helper exported for tests that want to compose their own handlers. */
export { dripSSE };
