/**
 * Stories for <AiSummaryButton>.
 *
 * Reuses a tiny mock adapter so the popover, copy, and re-summarise actions
 * can be exercised without network.
 */

import type { Meta, StoryObj } from '@storybook/react';
import { useRef } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AiContext, type AiContextValue } from '@/provider/AiContext';
import { memoryStorageAdapter } from '@/storage';
import type { Adapter, ChatRequest } from '@/types/adapter';
import type { StreamChunk, BaseResponse } from '@/types/stream';
import type { Message } from '@/types/message';
import { AiSummaryButton } from './AiSummaryButton';

interface MockOpts {
  result?: string;
  delayMs?: number;
  error?: Error;
}

function makeMockAdapter(opts: MockOpts = {}): Adapter {
  const { result = '• 핵심 1\n• 핵심 2\n• 핵심 3', delayMs = 250, error } = opts;
  return {
    id: 'mock-summary',
    async chat(_req: ChatRequest): Promise<BaseResponse> {
      await new Promise((r) => setTimeout(r, delayMs));
      if (error) throw error;
      const msg: Message = {
        id: 'mock-sum',
        role: 'assistant',
        content: result,
        createdAt: Date.now(),
        status: 'complete',
      };
      return { id: 'mock', message: msg };
    },
    async *stream(_req: ChatRequest): AsyncIterable<StreamChunk> {
      yield { delta: result, done: true, finishReason: 'stop' };
    },
  };
}

function MockProvider({
  adapter,
  children,
}: {
  adapter: Adapter;
  children: React.ReactNode;
}): JSX.Element {
  const clientRef = useRef<QueryClient | null>(null);
  if (clientRef.current === null) {
    clientRef.current = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
  }
  const value: AiContextValue = {
    engine: 'openai',
    adapter,
    storage: memoryStorageAdapter,
    queryClient: clientRef.current,
    config: { proxyUrl: '/mock' },
    _debug: { adapterId: adapter.id },
  };
  return (
    <QueryClientProvider client={clientRef.current}>
      <AiContext.Provider value={value}>{children}</AiContext.Provider>
    </QueryClientProvider>
  );
}

const meta: Meta<typeof AiSummaryButton> = {
  title: 'Components/AiSummaryButton',
  component: AiSummaryButton,
  parameters: { layout: 'centered' },
};
export default meta;

type Story = StoryObj<typeof AiSummaryButton>;

const SAMPLE = '이 라이브러리는 React 개발자가 백엔드 지식 없이도 AI 기능을 추가할 수 있게 해주는 헤드리스 컴포넌트 + 훅 모음입니다. 0.1.0은 OpenAI/Ollama를 지원합니다.';

export const Default: Story = {
  render: () => (
    <MockProvider adapter={makeMockAdapter()}>
      <AiSummaryButton input={SAMPLE} />
    </MockProvider>
  ),
};

export const EmptyDisabled: Story = {
  name: 'Empty (disabled)',
  render: () => (
    <MockProvider adapter={makeMockAdapter()}>
      <AiSummaryButton input="" />
    </MockProvider>
  ),
};

export const Loading: Story = {
  render: () => (
    <MockProvider adapter={makeMockAdapter({ delayMs: 5000 })}>
      <AiSummaryButton input={SAMPLE} />
    </MockProvider>
  ),
};

export const Streaming: Story = {
  name: 'Streaming (single-shot equivalent)',
  render: () => (
    <MockProvider adapter={makeMockAdapter({ delayMs: 800 })}>
      <AiSummaryButton input={SAMPLE} />
    </MockProvider>
  ),
};

export const ErrorState: Story = {
  name: 'Error',
  render: () => (
    <MockProvider adapter={makeMockAdapter({ error: new Error('429 Rate limited') })}>
      <AiSummaryButton input={SAMPLE} />
    </MockProvider>
  ),
};

export const Empty: Story = {
  name: 'Empty (no input prop)',
  render: () => (
    <MockProvider adapter={makeMockAdapter()}>
      <AiSummaryButton input="" />
    </MockProvider>
  ),
};

export const CustomRender: Story = {
  name: 'Custom (render prop)',
  render: () => (
    <MockProvider adapter={makeMockAdapter()}>
      <AiSummaryButton
        input={SAMPLE}
        render={({ result, loading, error }) => (
          <div style={{ marginTop: 8 }}>
            {loading && <em>요약 중…</em>}
            {error && <strong style={{ color: 'crimson' }}>{error.message}</strong>}
            {result && <pre style={{ whiteSpace: 'pre-wrap' }}>{result}</pre>}
          </div>
        )}
      />
    </MockProvider>
  ),
};
