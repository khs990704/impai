/**
 * useAiChat — Public hook backing <AiChat>.
 *
 * Per _workspace/02_api_spec.md §A.6 + 03_db_schema.md §3.2/§3.3.
 *
 * Architecture:
 *   - State: useReducer (action types frozen by 03_db_schema.md §3.2).
 *   - Async: TanStack Query `useMutation` for the streaming send loop.
 *   - Cancel: internal AbortController ref; raw signal NOT exposed (architect §C).
 *   - Persist: hydrate from `storage.get(k.session(...))` once, write on every
 *     mutation (storage layer is responsible for debouncing).
 *
 * Strict Mode: cleanup aborts in-flight stream and flushes storage. Hydrate is
 * idempotent (only runs once per sessionId).
 */

import { useCallback, useEffect, useMemo, useReducer, useRef } from 'react';
import { useMutation } from '@tanstack/react-query';
import { nanoid } from 'nanoid';
import { useAiContext } from '@/provider/AiContext';
import { k } from '@/storage/keys';
import { CURRENT_SCHEMA_VERSION } from '@/types/session';
import type { Message } from '@/types/message';
import type { StreamChunk, TokenUsage } from '@/types/stream';
import type { ChatSession } from '@/types/session';
import type { ChatRequest } from '@/types/adapter';

/* ──────────────────────────────────────────────────────────────────────────
 * Types
 * ────────────────────────────────────────────────────────────────────────── */

export interface UseAiChatOptions {
  sessionId?: string;
  systemPrompt?: string;
  initialMessages?: Message[];
  persist?: boolean;
  maxMessages?: number;
  onChunk?: (c: StreamChunk) => void;
  onComplete?: (m: Message, usage?: TokenUsage) => void;
  onError?: (e: Error) => void;
}

export interface UseAiChatReturn {
  messages: Message[];
  send: (text: string) => Promise<void>;
  cancel: () => void;
  clear: () => void;
  isStreaming: boolean;
  error: Error | null;
}

/* ──────────────────────────────────────────────────────────────────────────
 * Reducer (03_db_schema.md §3.2)
 * ────────────────────────────────────────────────────────────────────────── */

interface State {
  messages: Message[];
  isStreaming: boolean;
  error: Error | null;
}

type Action =
  | { type: 'add_user'; message: Message }
  | { type: 'start_stream'; message: Message }
  | { type: 'append_delta'; delta: string }
  | { type: 'complete'; finalMessage: Message }
  | { type: 'error'; error: Error }
  | { type: 'cancel' }
  | { type: 'clear' }
  | { type: 'hydrate'; messages: Message[] };

function trim(messages: Message[], maxMessages: number | undefined): Message[] {
  if (maxMessages === undefined || messages.length <= maxMessages) return messages;
  // Preserve system messages at the front.
  const system = messages.filter((m) => m.role === 'system');
  const others = messages.filter((m) => m.role !== 'system');
  const keep = others.slice(others.length - (maxMessages - system.length));
  return [...system, ...keep];
}

function makeReducer(
  maxMessages: number | undefined,
): (state: State, action: Action) => State {
  return (state, action) => {
    switch (action.type) {
      case 'add_user':
        return {
          ...state,
          messages: trim([...state.messages, action.message], maxMessages),
          error: null,
        };
      case 'start_stream':
        return {
          ...state,
          messages: trim([...state.messages, action.message], maxMessages),
          isStreaming: true,
          error: null,
        };
      case 'append_delta': {
        // Mutate the LAST streaming message reference for render perf.
        const last = state.messages[state.messages.length - 1];
        if (!last || last.status !== 'streaming') return state;
        const nextLast: Message = {
          ...last,
          content:
            typeof last.content === 'string' ? last.content + action.delta : last.content,
        };
        const next = state.messages.slice(0, -1);
        next.push(nextLast);
        return { ...state, messages: next };
      }
      case 'complete': {
        const next = state.messages.slice(0, -1);
        next.push(action.finalMessage);
        return { ...state, messages: trim(next, maxMessages), isStreaming: false };
      }
      case 'error': {
        const last = state.messages[state.messages.length - 1];
        let messages = state.messages;
        if (last && last.status === 'streaming') {
          messages = state.messages.slice(0, -1);
          messages.push({ ...last, status: 'error', error: action.error.message });
        }
        return { ...state, messages, isStreaming: false, error: action.error };
      }
      case 'cancel': {
        const last = state.messages[state.messages.length - 1];
        let messages = state.messages;
        if (last && last.status === 'streaming') {
          messages = state.messages.slice(0, -1);
          messages.push({ ...last, status: 'complete' });
        }
        return { ...state, messages, isStreaming: false };
      }
      case 'clear':
        return { messages: [], isStreaming: false, error: null };
      case 'hydrate':
        return { ...state, messages: trim(action.messages, maxMessages) };
      default:
        return state;
    }
  };
}

/* ──────────────────────────────────────────────────────────────────────────
 * Hook
 * ────────────────────────────────────────────────────────────────────────── */

const DEFAULT_SESSION_ID = 'default';

export function useAiChat(opts: UseAiChatOptions = {}): UseAiChatReturn {
  const {
    sessionId = DEFAULT_SESSION_ID,
    systemPrompt: optsSystemPrompt,
    initialMessages,
    persist = true,
    maxMessages,
    onChunk,
    onComplete,
    onError,
  } = opts;

  const ctx = useAiContext();
  const systemPrompt = optsSystemPrompt ?? ctx.systemPrompt;

  const reducer = useMemo(() => makeReducer(maxMessages), [maxMessages]);
  const initialState: State = useMemo(
    () => ({
      messages: initialMessages ? [...initialMessages] : [],
      isStreaming: false,
      error: null,
    }),
    // initial state intentionally captured once
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  const [state, dispatch] = useReducer(reducer, initialState);

  // Keep latest callbacks in refs to avoid invalidating mutation closure.
  const callbacksRef = useRef({ onChunk, onComplete, onError });
  callbacksRef.current = { onChunk, onComplete, onError };

  // Snapshot of latest messages for the mutation closure (avoids stale state).
  const messagesRef = useRef<Message[]>(state.messages);
  messagesRef.current = state.messages;

  // Mirror of streaming flag for synchronous gate inside `send()`.
  const streamingRef = useRef<boolean>(false);
  streamingRef.current = state.isStreaming;

  // AbortController ref — never exposed to consumers.
  const abortRef = useRef<AbortController | null>(null);

  // Hydrate once per (storage, sessionId) per 03_db_schema.md §9.1.
  const hydratedKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (!persist) return;
    const hydrationKey = `${ctx.adapter.id}:${sessionId}`;
    if (hydratedKeyRef.current === hydrationKey) return;
    hydratedKeyRef.current = hydrationKey;

    let cancelled = false;
    void (async () => {
      try {
        const stored = await ctx.storage.get<ChatSession>(k.session(sessionId));
        if (cancelled || stored === null) return;
        if (stored.schemaVersion !== CURRENT_SCHEMA_VERSION) {
          // Mismatch is handled by the storage layer; treat as empty here.
          return;
        }
        if (Array.isArray(stored.messages) && stored.messages.length > 0) {
          dispatch({ type: 'hydrate', messages: stored.messages });
        }
      } catch {
        // best-effort hydration only
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [persist, sessionId, ctx.storage, ctx.adapter.id]);

  // Persist on mutations. Storage adapter handles debouncing internally.
  useEffect(() => {
    if (!persist) return;
    const session: ChatSession = {
      id: sessionId,
      messages: state.messages,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      schemaVersion: CURRENT_SCHEMA_VERSION,
    };
    if (systemPrompt !== undefined) session.systemPrompt = systemPrompt;
    if (maxMessages !== undefined) session.maxMessages = maxMessages;
    void ctx.storage.set(k.session(sessionId), session);
  }, [persist, sessionId, state.messages, systemPrompt, maxMessages, ctx.storage]);

  // Build the request "messages" array, prepending system prompt if needed.
  const buildRequestMessages = useCallback(
    (next: Message[]): Message[] => {
      if (!systemPrompt) return next;
      const hasSystem = next.some((m) => m.role === 'system');
      if (hasSystem) return next;
      const sys: Message = {
        id: nanoid(21),
        role: 'system',
        content: systemPrompt,
        createdAt: Date.now(),
        status: 'complete',
      };
      return [sys, ...next];
    },
    [systemPrompt],
  );

  /* ── Streaming mutation ────────────────────────────────────────────────── */

  const streamMutation = useMutation<
    { final: Message; usage?: TokenUsage },
    Error,
    string
  >({
    mutationKey: ['impai', 'chat', ctx.adapter.id, sessionId],
    mutationFn: async (text: string) => {
      // Build user + assistant placeholder messages.
      const userMsg: Message = {
        id: nanoid(21),
        role: 'user',
        content: text,
        createdAt: Date.now(),
        status: 'complete',
      };
      const assistantMsg: Message = {
        id: nanoid(21),
        role: 'assistant',
        content: '',
        createdAt: Date.now(),
        status: 'streaming',
      };

      dispatch({ type: 'add_user', message: userMsg });
      dispatch({ type: 'start_stream', message: assistantMsg });

      const ac = new AbortController();
      abortRef.current = ac;

      const reqMessages = buildRequestMessages([
        ...messagesRef.current,
        userMsg,
      ]);

      const req: ChatRequest = { messages: reqMessages };
      if (systemPrompt !== undefined) req.systemPrompt = systemPrompt;

      let acc = '';
      let usage: TokenUsage | undefined;
      let finishReason: StreamChunk['finishReason'] | undefined;

      try {
        for await (const chunk of ctx.adapter.stream(req, { signal: ac.signal })) {
          callbacksRef.current.onChunk?.(chunk);
          if (chunk.delta) {
            acc += chunk.delta;
            dispatch({ type: 'append_delta', delta: chunk.delta });
          }
          if (chunk.usage) usage = chunk.usage;
          if (chunk.finishReason) finishReason = chunk.finishReason;
          if (chunk.done) break;
        }
      } catch (err) {
        // AbortError = cancellation, treated as success-ish (no error state).
        if (isAbortError(err)) {
          throw new AbortError();
        }
        throw err instanceof Error ? err : new Error(String(err));
      } finally {
        if (abortRef.current === ac) abortRef.current = null;
      }

      const final: Message = {
        ...assistantMsg,
        content: acc,
        status: 'complete',
      };
      if (usage !== undefined) final.metadata = { usage, finishReason };
      else if (finishReason !== undefined) final.metadata = { finishReason };
      const result: { final: Message; usage?: TokenUsage } = { final };
      if (usage !== undefined) result.usage = usage;
      return result;
    },
    onSuccess: ({ final, usage }) => {
      dispatch({ type: 'complete', finalMessage: final });
      callbacksRef.current.onComplete?.(final, usage);
    },
    onError: (err: Error) => {
      if (err instanceof AbortError) {
        dispatch({ type: 'cancel' });
        return;
      }
      dispatch({ type: 'error', error: err });
      callbacksRef.current.onError?.(err);
    },
  });

  /* ── Public API ────────────────────────────────────────────────────────── */

  const send = useCallback(
    async (text: string): Promise<void> => {
      if (streamingRef.current) {
        throw new Error('Already streaming. Call cancel() first.');
      }
      if (!text || text.trim().length === 0) return;
      streamingRef.current = true;
      await streamMutation.mutateAsync(text).catch(() => {
        // errors already routed through onError; resolving void is fine.
      });
    },
    [streamMutation],
  );

  const cancel = useCallback((): void => {
    abortRef.current?.abort();
    abortRef.current = null;
  }, []);

  const clear = useCallback((): void => {
    abortRef.current?.abort();
    abortRef.current = null;
    dispatch({ type: 'clear' });
  }, []);

  // Cleanup on unmount — abort any in-flight stream.
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      abortRef.current = null;
    };
  }, []);

  return {
    messages: state.messages,
    send,
    cancel,
    clear,
    isStreaming: state.isStreaming,
    error: state.error,
  };
}

/* ──────────────────────────────────────────────────────────────────────────
 * Internal helpers
 * ────────────────────────────────────────────────────────────────────────── */

class AbortError extends Error {
  constructor() {
    super('Aborted');
    this.name = 'AbortError';
  }
}

function isAbortError(err: unknown): boolean {
  if (err instanceof Error) {
    if (err.name === 'AbortError') return true;
    // DOM AbortError shows up as DOMException
    if (typeof DOMException !== 'undefined' && err instanceof DOMException) {
      return err.name === 'AbortError';
    }
  }
  return false;
}
