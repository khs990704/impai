/**
 * MSW handlers for Ollama `/api/chat` (NDJSON streaming).
 *
 * Mirrors `test/msw/openai.ts` — drips JSON lines at ~50ms intervals so the
 * `parseNdjson` parser sees realistic chunk boundaries. The `done: true`
 * trailer carries `prompt_eval_count` / `eval_count` so the TokenUsage
 * mapping suite can verify the wire-to-domain conversion.
 *
 * Endpoints:
 *  - `http://localhost:11434/api/chat` — happy path
 *  - `http://ollama-down.test/api/chat` — simulates ECONNREFUSED via
 *    `HttpResponse.error()` so the LocalEngineUnavailable mapping gets exercised
 *  - `http://ollama-error.test/api/chat` — configurable HTTP status (`?status=`)
 */

import { http, HttpResponse, delay } from 'msw';

interface OllamaRequest {
  messages?: Array<{ role: string; content: string }>;
  model?: string;
}

function dripNDJSON(
  parts: string[],
  opts: {
    intervalMs?: number;
    promptEvalCount?: number;
    evalCount?: number;
    doneReason?: 'stop' | 'length';
  } = {},
): ReadableStream<Uint8Array> {
  const intervalMs = opts.intervalMs ?? 50;
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
        const line = JSON.stringify({
          model: 'mock-llama',
          created_at: new Date().toISOString(),
          message: { role: 'assistant', content: parts[i] },
          done: false,
        });
        controller.enqueue(encoder.encode(`${line}\n`));
        i += 1;
        await delay(intervalMs);
        return;
      }
      const trailer: Record<string, unknown> = {
        model: 'mock-llama',
        created_at: new Date().toISOString(),
        done: true,
        done_reason: opts.doneReason ?? 'stop',
      };
      if (opts.promptEvalCount !== undefined) {
        trailer['prompt_eval_count'] = opts.promptEvalCount;
      }
      if (opts.evalCount !== undefined) {
        trailer['eval_count'] = opts.evalCount;
      }
      controller.enqueue(encoder.encode(`${JSON.stringify(trailer)}\n`));
      controller.close();
    },
    cancel() {
      cancelled = true;
    },
  });
}

async function buildReply(req: Request): Promise<string[]> {
  let body: OllamaRequest = {};
  try {
    body = (await req.clone().json()) as OllamaRequest;
  } catch {
    /* tolerate */
  }
  const lastUser = body.messages
    ?.filter((m) => m.role === 'user')
    .at(-1)?.content;
  const reply = lastUser && lastUser.length > 0 ? `local:${lastUser}` : 'hi';
  return [...reply];
}

const happyHandler = http.post(
  'http://localhost:11434/api/chat',
  async ({ request }) => {
    const parts = await buildReply(request);
    return new HttpResponse(
      dripNDJSON(parts, { promptEvalCount: 7, evalCount: parts.length }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/x-ndjson' },
      },
    );
  },
);

const downHandler = http.post('http://ollama-down.test/api/chat', () => {
  // Network-level failure surfaces as fetch rejection in the adapter — which
  // we then translate to LocalEngineUnavailable.
  return HttpResponse.error();
});

const errorHandler = http.post('http://ollama-error.test/api/chat', ({ request }) => {
  const url = new URL(request.url);
  const status = Number(url.searchParams.get('status') ?? '500');
  const body = url.searchParams.get('body') ?? `{"error":"status ${status}"}`;
  return new HttpResponse(body, {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
});

export const ollamaHandlers = [happyHandler, downHandler, errorHandler];

export { dripNDJSON };
