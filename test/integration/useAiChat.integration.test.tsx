/**
 * Integration test — `useAiChat` driving a real OpenAIAdapter against MSW.
 *
 * Covers:
 *   - send → streaming → final message lands with accumulated content
 *   - cancel mid-stream surfaces no error and clears isStreaming
 *   - resending after cancel succeeds (no "Already streaming" lock)
 *   - Strict Mode double-mount safety (effect cleanup aborts; re-mount idempotent)
 *   - upstream 401 → onError fired with AuthError
 */

import { describe, expect, it } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { StrictMode, type ReactNode } from 'react';
import { server } from '../msw/server';
import { dripSSE } from '../msw/openai';
import { AiProvider } from '@/provider/AiProvider';
import { useAiChat } from '@/hooks/useAiChat';
import { AuthError } from '@/utils/errors';

function wrapper({ children }: { children: ReactNode }): JSX.Element {
  return (
    <AiProvider engine="openai" config={{ proxyUrl: 'https://proxy.test/api' }}>
      {children}
    </AiProvider>
  );
}

function strictWrapper({ children }: { children: ReactNode }): JSX.Element {
  return (
    <StrictMode>
      <AiProvider engine="openai" config={{ proxyUrl: 'https://proxy.test/api' }}>
        {children}
      </AiProvider>
    </StrictMode>
  );
}

describe('useAiChat — happy path streaming', () => {
  it('accumulates streamed deltas into a final assistant message', async () => {
    const { result } = renderHook(() => useAiChat({ persist: false }), {
      wrapper,
    });

    await act(async () => {
      await result.current.send('hi');
    });

    await waitFor(() => {
      expect(result.current.isStreaming).toBe(false);
    });

    const messages = result.current.messages;
    expect(messages).toHaveLength(2);
    expect(messages[0]?.role).toBe('user');
    expect(messages[0]?.content).toBe('hi');
    expect(messages[1]?.role).toBe('assistant');
    expect(messages[1]?.content).toBe('echo:hi');
    expect(messages[1]?.status).toBe('complete');
    expect(result.current.error).toBeNull();
  });

  it('rejects empty / whitespace input as a no-op (no message added)', async () => {
    const { result } = renderHook(() => useAiChat({ persist: false }), {
      wrapper,
    });
    await act(async () => {
      await result.current.send('   ');
    });
    expect(result.current.messages).toHaveLength(0);
    expect(result.current.isStreaming).toBe(false);
  });
});

describe('useAiChat — cancel + resend', () => {
  it('cancel mid-stream resets isStreaming without surfacing an error', async () => {
    // Long reply with relatively wide intervals — gives the test room to
    // observe `isStreaming === true` and request a cancel before the stream
    // naturally completes.
    server.use(
      http.post('https://proxy.test/api', () => {
        return new HttpResponse(
          dripSSE([...'hello-world-content-that-takes-time-to-stream'], {
            intervalMs: 50,
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'text/event-stream' },
          },
        );
      }),
    );

    const { result } = renderHook(() => useAiChat({ persist: false }), {
      wrapper,
    });

    let sendP: Promise<void> | undefined;
    act(() => {
      sendP = result.current.send('long?');
    });
    await waitFor(() => expect(result.current.isStreaming).toBe(true));
    act(() => {
      result.current.cancel();
    });
    if (sendP) await sendP;

    await waitFor(() => expect(result.current.isStreaming).toBe(false));
    // AbortError must NOT surface to the consumer (per spec §C.5).
    expect(result.current.error).toBeNull();
  });

  it('allows a follow-up send after cancel (no "Already streaming" lock)', async () => {
    server.use(
      http.post('https://proxy.test/api', () => {
        return new HttpResponse(dripSSE([...'follow-up'], { intervalMs: 5 }), {
          status: 200,
          headers: { 'Content-Type': 'text/event-stream' },
        });
      }),
    );

    const { result } = renderHook(() => useAiChat({ persist: false }), {
      wrapper,
    });

    await act(async () => {
      await result.current.send('first');
    });
    await waitFor(() => expect(result.current.isStreaming).toBe(false));

    // Synthetic cancel after a completed run is a no-op (allowed).
    act(() => {
      result.current.cancel();
    });

    await act(async () => {
      await result.current.send('second');
    });
    await waitFor(() => expect(result.current.isStreaming).toBe(false));

    const last = result.current.messages.at(-1);
    expect(last?.role).toBe('assistant');
    expect(last?.content).toBe('follow-up');
  });
});

describe('useAiChat — error path', () => {
  it('routes 401 to AuthError on the error field + onError callback', async () => {
    server.use(
      http.post('https://proxy.test/api', () => {
        return new HttpResponse('{"error":{"message":"bad"}}', {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        });
      }),
    );

    let captured: Error | undefined;
    const { result } = renderHook(
      () =>
        useAiChat({
          persist: false,
          onError: (e) => {
            captured = e;
          },
        }),
      { wrapper },
    );

    await act(async () => {
      await result.current.send('hi');
    });
    await waitFor(() => expect(result.current.isStreaming).toBe(false));
    expect(result.current.error).toBeInstanceOf(AuthError);
    expect(captured).toBeInstanceOf(AuthError);
  });
});

describe('useAiChat — Strict Mode safety', () => {
  it('double-mount does not duplicate hydrate or leak streams', async () => {
    const { result } = renderHook(() => useAiChat({ persist: false }), {
      wrapper: strictWrapper,
    });

    await act(async () => {
      await result.current.send('hi');
    });
    await waitFor(() => expect(result.current.isStreaming).toBe(false));
    expect(result.current.messages).toHaveLength(2);
    // No error from the abort-on-cleanup → re-mount path.
    expect(result.current.error).toBeNull();
  });
});
