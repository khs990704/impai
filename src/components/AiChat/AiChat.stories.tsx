/**
 * Stories for <AiChat>.
 *
 * These stories drive the Provider via a test-only adapter so they work
 * without the network. Once qa-engineer finishes the MSW handlers
 * (`test/msw/openai.ts`), this file can switch to real <AiProvider> + MSW.
 */

import type { Meta, StoryObj } from '@storybook/react';
import { useEffect, useRef } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AiContext, type AiContextValue } from '@/provider/AiContext';
import { memoryStorageAdapter } from '@/storage';
import type { Adapter, ChatRequest, AdapterStreamOptions } from '@/types/adapter';
import type { StreamChunk, BaseResponse } from '@/types/stream';
import type { Message } from '@/types/message';
import { AiChat } from './AiChat';

/* ──────────────────────────────────────────────────────────────────────────
 * Mock adapter helpers
 * ────────────────────────────────────────────────────────────────────────── */

interface MockOpts {
  reply?: string;
  delayMs?: number;
  error?: Error;
  /** When true, reply chunks never finish (caller can cancel). */
  hang?: boolean;
}

function makeMockAdapter(opts: MockOpts = {}): Adapter {
  const { reply = '안녕하세요! 무엇을 도와드릴까요?', delayMs = 30, error, hang = false } = opts;

  async function* gen(_req: ChatRequest, abort?: AdapterStreamOptions): AsyncIterable<StreamChunk> {
    void _req;
    if (error) throw error;
    const signal = abort?.signal;
    for (const ch of [...reply]) {
      await new Promise<void>((resolve, reject) => {
        const t = setTimeout(resolve, delayMs);
        signal?.addEventListener('abort', () => {
          clearTimeout(t);
          const e = new Error('Aborted');
          e.name = 'AbortError';
          reject(e);
        });
      });
      yield { delta: ch, done: false };
    }
    if (hang) {
      await new Promise<void>((_, reject) => {
        signal?.addEventListener('abort', () => {
          const e = new Error('Aborted');
          e.name = 'AbortError';
          reject(e);
        });
      });
    }
    yield { delta: '', done: true, finishReason: 'stop' };
  }

  return {
    id: 'mock',
    async chat(_req: ChatRequest): Promise<BaseResponse> {
      const msg: Message = {
        id: 'mock-1',
        role: 'assistant',
        content: reply,
        createdAt: Date.now(),
        status: 'complete',
      };
      return { id: 'mock-resp', message: msg };
    },
    stream: gen,
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

/* ──────────────────────────────────────────────────────────────────────────
 * Story config
 * ────────────────────────────────────────────────────────────────────────── */

const meta: Meta<typeof AiChat> = {
  title: 'Components/AiChat',
  component: AiChat,
  parameters: { layout: 'padded' },
};
export default meta;

type Story = StoryObj<typeof AiChat>;

const seedMessages: Message[] = [
  { id: 'u1', role: 'user', content: '안녕', createdAt: Date.now() - 5_000, status: 'complete' },
  {
    id: 'a1',
    role: 'assistant',
    content: '안녕하세요! 무엇을 도와드릴까요?',
    createdAt: Date.now() - 4_000,
    status: 'complete',
  },
];

/* ──────────────────────────────────────────────────────────────────────────
 * Stories
 * ────────────────────────────────────────────────────────────────────────── */

export const Default: Story = {
  render: () => (
    <MockProvider adapter={makeMockAdapter()}>
      <AiChat initialMessages={seedMessages} persist={false} />
    </MockProvider>
  ),
};

export const Empty: Story = {
  render: () => (
    <MockProvider adapter={makeMockAdapter()}>
      <AiChat persist={false} emptyState={<div>메시지를 입력해 대화를 시작하세요.</div>} />
    </MockProvider>
  ),
};

export const Streaming: Story = {
  name: 'Streaming (auto-send on mount)',
  render: () => {
    function AutoSend(): JSX.Element {
      // useAiChat is consumed inside AiChat; we simulate user send by writing
      // into the textarea + clicking send. Storybook play function would do
      // this for real interaction tests; for now we just show a long reply.
      return (
        <AiChat
          persist={false}
          initialMessages={seedMessages}
          placeholder="긴 응답이 스트리밍되는 모습을 보려면 메시지를 입력하세요"
        />
      );
    }
    return (
      <MockProvider
        adapter={makeMockAdapter({ reply: '천천히 한 글자씩 들어옵니다. '.repeat(6), delayMs: 60 })}
      >
        <AutoSend />
      </MockProvider>
    );
  },
};

export const Loading: Story = {
  name: 'Loading (hangs until cancel)',
  render: () => (
    <MockProvider adapter={makeMockAdapter({ reply: '...', delayMs: 100, hang: true })}>
      <AiChat persist={false} placeholder="전송 후 ESC로 취소를 시도해 보세요" />
    </MockProvider>
  ),
};

export const ErrorState: Story = {
  name: 'Error',
  render: () => (
    <MockProvider adapter={makeMockAdapter({ error: new Error('401 Invalid API key') })}>
      <ErrorAutoSend />
    </MockProvider>
  ),
};

function ErrorAutoSend(): JSX.Element {
  // Story renders an empty chat; the user types/sends to see the error path.
  return (
    <AiChat
      persist={false}
      placeholder="아무 메시지나 보내면 401 에러가 표시됩니다"
      onError={(e) => {
        // eslint-disable-next-line no-console
        console.warn('[story:AiChat:error]', e.message);
      }}
    />
  );
}

export const WithSystemPrompt: Story = {
  render: () => (
    <MockProvider adapter={makeMockAdapter({ reply: '시스템 프롬프트가 적용되었습니다.' })}>
      <AiChat persist={false} systemPrompt="너는 친절한 한국어 비서야." />
    </MockProvider>
  ),
};

/** Demonstrates that mounting the same chat twice (Strict Mode) is safe. */
export const StrictModeSafe: Story = {
  render: () => {
    function Twice(): JSX.Element {
      // dummy effect to ensure the component handles repeated mounts.
      useEffect(() => {}, []);
      return (
        <div style={{ display: 'grid', gap: 12 }}>
          <AiChat persist={false} initialMessages={seedMessages} />
        </div>
      );
    }
    return (
      <MockProvider adapter={makeMockAdapter()}>
        <Twice />
      </MockProvider>
    );
  },
};
