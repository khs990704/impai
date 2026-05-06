/**
 * useAiSummary — single-shot summarization helper.
 *
 * Per _workspace/02_api_spec.md §A.6. Wraps `adapter.chat()` (non-streaming)
 * with a useMutation. Suitable for one-off Q&A flows like AiSummaryButton.
 */

import { useCallback, useRef, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { nanoid } from 'nanoid';
import { useAiContext } from '@/provider/AiContext';
import type { Message } from '@/types/message';
import type { ChatRequest } from '@/types/adapter';

export interface UseAiSummaryOptions {
  /** default: '다음 텍스트를 3줄로 요약해줘.' */
  prompt?: string;
}

export interface UseAiSummaryReturn {
  summarize: (input: string) => Promise<string>;
  loading: boolean;
  error: Error | null;
  result: string | null;
}

const DEFAULT_PROMPT = '다음 텍스트를 3줄로 요약해줘.';

export function useAiSummary(opts: UseAiSummaryOptions = {}): UseAiSummaryReturn {
  const { prompt = DEFAULT_PROMPT } = opts;
  const ctx = useAiContext();
  const abortRef = useRef<AbortController | null>(null);
  const [result, setResult] = useState<string | null>(null);

  const mutation = useMutation<string, Error, string>({
    mutationKey: ['ai-react', 'summary', ctx.adapter.id],
    mutationFn: async (input: string) => {
      const ac = new AbortController();
      abortRef.current = ac;

      const userMsg: Message = {
        id: nanoid(21),
        role: 'user',
        content: `${prompt}\n\n${input}`,
        createdAt: Date.now(),
        status: 'complete',
      };
      const req: ChatRequest = { messages: [userMsg] };
      try {
        const res = await ctx.adapter.chat(req, { signal: ac.signal });
        const content = res.message.content;
        return typeof content === 'string'
          ? content
          : content.map((p) => ('text' in p ? p.text : '')).join('');
      } finally {
        if (abortRef.current === ac) abortRef.current = null;
      }
    },
    onSuccess: (text) => {
      setResult(text);
    },
  });

  const summarize = useCallback(
    async (input: string): Promise<string> => {
      if (!input || input.length === 0) return '';
      const text = await mutation.mutateAsync(input);
      return text;
    },
    [mutation],
  );

  return {
    summarize,
    loading: mutation.isPending,
    error: (mutation.error as Error | null) ?? null,
    result,
  };
}
