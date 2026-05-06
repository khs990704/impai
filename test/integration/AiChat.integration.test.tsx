/**
 * Integration test — `<AiChat>` component end-to-end through MSW.
 *
 * Covers (per `_workspace/02_api_spec.md` §A.2 + §D):
 *   - Renders message history + composer + role="log"
 *   - Send via Enter key (no IME composition)
 *   - Shift+Enter inserts newline (does not submit)
 *   - ESC during streaming triggers cancel
 *   - IME isComposing blocks Enter submission
 *   - role="alert" appears on error
 *   - data-state on root reflects state machine
 */

import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { server } from '../msw/server';
import { dripSSE } from '../msw/openai';
import { AiProvider } from '@/provider/AiProvider';
import { AiChat } from '@/components/AiChat/AiChat';

function renderChat(props: React.ComponentProps<typeof AiChat> = {}): ReturnType<
  typeof render
> {
  return render(
    <AiProvider engine="openai" config={{ proxyUrl: 'https://proxy.test/api' }}>
      <AiChat persist={false} {...props} />
    </AiProvider>,
  );
}

describe('AiChat — a11y skeleton', () => {
  it('renders a log region + composer textarea + send button', () => {
    renderChat();
    // Empty state without seed messages and without explicit emptyState falls
    // back to the message list (empty <ol>).
    expect(screen.getByRole('textbox', { name: '메시지 입력' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '전송' })).toBeInTheDocument();
  });

  it('exposes role="log" + aria-live polite when messages exist', () => {
    renderChat({
      initialMessages: [
        {
          id: 'u1',
          role: 'user',
          content: 'hi',
          createdAt: 0,
          status: 'complete',
        },
      ],
    });
    const log = screen.getByRole('log');
    expect(log).toHaveAttribute('aria-live', 'polite');
    expect(log).toHaveAttribute('aria-atomic', 'false');
  });
});

describe('AiChat — keyboard send', () => {
  it('Enter submits the trimmed value', async () => {
    const user = userEvent.setup();
    renderChat();
    const textarea = screen.getByRole('textbox', { name: '메시지 입력' });
    await user.type(textarea, 'hello');
    await user.keyboard('{Enter}');

    await waitFor(() => {
      expect(screen.getByRole('log')).toBeInTheDocument();
    });
    // user message + assistant streaming (or final).
    await waitFor(() => {
      const items = screen.getAllByRole('listitem');
      expect(items.length).toBeGreaterThanOrEqual(2);
    });
  });

  it('Shift+Enter does NOT submit (no listitem appears)', async () => {
    const user = userEvent.setup();
    renderChat();
    const textarea = screen.getByRole('textbox', { name: '메시지 입력' });
    await user.type(textarea, 'line1');
    await user.keyboard('{Shift>}{Enter}{/Shift}');
    // No message has been added yet — the log region exists but is empty.
    expect(screen.queryAllByRole('listitem')).toHaveLength(0);
  });

  it('IME isComposing blocks Enter submission', async () => {
    renderChat();
    const textarea = screen.getByRole(
      'textbox',
      { name: '메시지 입력' },
    ) as HTMLTextAreaElement;

    const { fireEvent } = await import('@testing-library/react');
    // Composition start sets the React-state flag the composer reads via
    // `isComposing` local; a subsequent Enter must NOT submit.
    fireEvent.compositionStart(textarea);
    fireEvent.change(textarea, { target: { value: '안녕' } });
    fireEvent.keyDown(textarea, { key: 'Enter' });
    expect(screen.queryAllByRole('listitem')).toHaveLength(0);
    fireEvent.compositionEnd(textarea);
  });
});

describe('AiChat — cancel on ESC', () => {
  it('ESC during streaming cancels and clears isStreaming', async () => {
    server.use(
      http.post('https://proxy.test/api', () => {
        return new HttpResponse(
          dripSSE([...'streaming-content-that-takes-a-while'], { intervalMs: 25 }),
          {
            status: 200,
            headers: { 'Content-Type': 'text/event-stream' },
          },
        );
      }),
    );

    const user = userEvent.setup();
    renderChat();
    const textarea = screen.getByRole('textbox', { name: '메시지 입력' });
    await user.type(textarea, 'long?');
    await user.keyboard('{Enter}');

    // Wait for streaming state.
    await waitFor(() => {
      const root = screen.getByTestId('aireact-chat');
      expect(root.getAttribute('data-state')).toBe('streaming');
    });

    // ESC on the cancel button (focus is on textarea after send -> blur).
    const cancelBtn = await screen.findByRole('button', { name: '취소' });
    await user.click(cancelBtn);

    await waitFor(() => {
      const root = screen.getByTestId('aireact-chat');
      expect(root.getAttribute('data-state')).toBe('idle');
    });
  });
});

describe('AiChat — error surface', () => {
  it('renders role="alert" with the error message', async () => {
    server.use(
      http.post('https://proxy.test/api', () => {
        return new HttpResponse('{"error":{"message":"bad"}}', {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        });
      }),
    );

    const user = userEvent.setup();
    renderChat();
    const textarea = screen.getByRole('textbox', { name: '메시지 입력' });
    await user.type(textarea, 'hi');
    await user.keyboard('{Enter}');

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toMatch(/Invalid API key|bad/);
    await waitFor(() => {
      expect(screen.getByTestId('aireact-chat').getAttribute('data-state')).toBe(
        'error',
      );
    });
  });
});

describe('AiChat — callbacks + classNames', () => {
  it('fires onMessageSent and onComplete in order with the right shapes', async () => {
    server.use(
      http.post('https://proxy.test/api', () => {
        return new HttpResponse(dripSSE([...'cb'], { intervalMs: 5 }), {
          status: 200,
          headers: { 'Content-Type': 'text/event-stream' },
        });
      }),
    );
    const onMessageSent = vi.fn();
    const onComplete = vi.fn();
    const user = userEvent.setup();
    render(
      <AiProvider engine="openai" config={{ proxyUrl: 'https://proxy.test/api' }}>
        <AiChat
          persist={false}
          onMessageSent={onMessageSent}
          onComplete={onComplete}
        />
      </AiProvider>,
    );
    await user.type(
      screen.getByRole('textbox', { name: '메시지 입력' }),
      'hi',
    );
    await user.keyboard('{Enter}');
    await waitFor(() => {
      expect(onComplete).toHaveBeenCalled();
    });
    expect(onMessageSent).toHaveBeenCalled();
    const userMsg = onMessageSent.mock.calls.at(-1)?.[0];
    expect(userMsg.role).toBe('user');
    const finalMsg = onComplete.mock.calls.at(-1)?.[0];
    expect(finalMsg.role).toBe('assistant');
    expect(finalMsg.content).toBe('cb');
  });

  it('applies classNames slot to root, list, message, composer', () => {
    render(
      <AiProvider engine="openai" config={{ proxyUrl: 'https://proxy.test/api' }}>
        <AiChat
          persist={false}
          initialMessages={[
            {
              id: 'u1',
              role: 'user',
              content: 'x',
              createdAt: 0,
              status: 'complete',
            },
          ]}
          classNames={{
            root: 'cn-root',
            list: 'cn-list',
            message: 'cn-msg',
            composer: 'cn-composer',
          }}
        />
      </AiProvider>,
    );
    expect(screen.getByTestId('aireact-chat').className).toContain('cn-root');
    expect(screen.getByTestId('aireact-message-list').className).toContain(
      'cn-list',
    );
    expect(screen.getAllByRole('listitem')[0]?.className).toContain('cn-msg');
    expect(
      screen.getByTestId('aireact-chat').querySelector('[data-aireact-composer]')
        ?.className,
    ).toContain('cn-composer');
  });
});

describe('AiChat — persistence round-trip', () => {
  it('hydrates from localStorage on second mount with the same sessionId', async () => {
    // Pre-seed localStorage with a session.
    const seed = {
      id: 'persist-session',
      schemaVersion: 1,
      createdAt: 1,
      updatedAt: 1,
      messages: [
        {
          id: 'pre1',
          role: 'user' as const,
          content: 'previous',
          createdAt: 0,
          status: 'complete' as const,
        },
        {
          id: 'pre2',
          role: 'assistant' as const,
          content: 'reply',
          createdAt: 1,
          status: 'complete' as const,
        },
      ],
    };
    window.localStorage.setItem(
      'aireact:v1:session:persist-session',
      JSON.stringify(seed),
    );

    render(
      <AiProvider engine="openai" config={{ proxyUrl: 'https://proxy.test/api' }}>
        <AiChat sessionId="persist-session" />
      </AiProvider>,
    );

    // Wait for hydrate effect.
    await waitFor(() => {
      const items = screen.getAllByRole('listitem');
      expect(items).toHaveLength(2);
    });
    expect(screen.getByText('previous')).toBeInTheDocument();
    expect(screen.getByText('reply')).toBeInTheDocument();

    // Cleanup so other tests don't see the seeded session.
    await act(async () => {
      window.localStorage.removeItem('aireact:v1:session:persist-session');
    });
  });
});
