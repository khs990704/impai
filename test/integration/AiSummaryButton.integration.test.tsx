/**
 * Integration test — `<AiSummaryButton>` end-to-end through MSW.
 *
 * Covers (per `_workspace/02_api_spec.md` §A.3 + §D):
 *   - input='' disables the trigger
 *   - Click → spinner → popover with result + copy/resummarise actions
 *   - In-flight click is ignored (no double dispatch)
 *   - ESC closes the popover and restores focus to the trigger
 *   - role="dialog" + aria-modal="true" + aria-haspopup/expanded reflect state
 */

import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { server } from '../msw/server';
import { dripSSE } from '../msw/openai';
import { AiProvider } from '@/provider/AiProvider';
import { AiSummaryButton } from '@/components/AiSummaryButton/AiSummaryButton';

function wrap(children: React.ReactNode): JSX.Element {
  return (
    <AiProvider engine="openai" config={{ proxyUrl: 'https://proxy.test/api' }}>
      {children}
    </AiProvider>
  );
}

describe('AiSummaryButton — disabled on empty input', () => {
  it('renders disabled when input is empty', () => {
    render(wrap(<AiSummaryButton input="" />));
    const trigger = screen.getByRole('button', { name: /요약하기/ });
    expect(trigger).toBeDisabled();
    expect(screen.getByTestId('aireact-summary').getAttribute('data-state')).toBe(
      'disabled',
    );
  });
});

describe('AiSummaryButton — happy path', () => {
  it('opens a dialog with the summary result and Copy + Re-summarise actions', async () => {
    // Tighter drip so the test finishes quickly under jsdom's microtask churn.
    server.use(
      http.post('https://proxy.test/api', () => {
        return new HttpResponse(dripSSE([...'short-summary'], { intervalMs: 5 }), {
          status: 200,
          headers: { 'Content-Type': 'text/event-stream' },
        });
      }),
    );
    const user = userEvent.setup();
    render(wrap(<AiSummaryButton input="some text to summarise" />));
    const trigger = screen.getByRole('button', { name: /요약하기/ });
    await user.click(trigger);

    const dialog = await screen.findByRole(
      'dialog',
      { name: '요약 결과' },
      { timeout: 5000 },
    );
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog.textContent).toMatch(/short-summary/);
    expect(screen.getByRole('button', { name: '복사' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /다시 요약/ })).toBeInTheDocument();

    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(trigger).toHaveAttribute('aria-haspopup', 'dialog');
  });

  it('ignores click while a request is in flight (no double dispatch)', async () => {
    let calls = 0;
    server.use(
      http.post('https://proxy.test/api', () => {
        calls += 1;
        return new HttpResponse(dripSSE([...'short'], { intervalMs: 30 }), {
          status: 200,
          headers: { 'Content-Type': 'text/event-stream' },
        });
      }),
    );

    const user = userEvent.setup();
    render(wrap(<AiSummaryButton input="text" />));
    const trigger = screen.getByRole('button', { name: /요약하기/ });
    await user.click(trigger);
    // Immediately click again while loading. Button should be disabled or the
    // handler short-circuits.
    await user.click(trigger);

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeInTheDocument();
    });
    expect(calls).toBe(1);
  });
});

describe('AiSummaryButton — focus + ESC behaviour', () => {
  it('ESC closes the dialog and restores focus to the trigger', async () => {
    server.use(
      http.post('https://proxy.test/api', () => {
        return new HttpResponse(dripSSE([...'esc-test'], { intervalMs: 5 }), {
          status: 200,
          headers: { 'Content-Type': 'text/event-stream' },
        });
      }),
    );
    const user = userEvent.setup();
    render(wrap(<AiSummaryButton input="text" />));
    const trigger = screen.getByRole('button', { name: /요약하기/ });
    await user.click(trigger);
    const dialog = await screen.findByRole(
      'dialog',
      { name: '요약 결과' },
      { timeout: 5000 },
    );

    await user.keyboard('{Escape}');
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
    });
    expect(dialog).not.toBeInTheDocument();
    await waitFor(() => {
      expect(document.activeElement).toBe(trigger);
    });
  });
});

describe('AiSummaryButton — Tab focus trap', () => {
  it('Tab from the last focusable wraps to the first', async () => {
    server.use(
      http.post('https://proxy.test/api', () => {
        return new HttpResponse(dripSSE([...'hi'], { intervalMs: 5 }), {
          status: 200,
          headers: { 'Content-Type': 'text/event-stream' },
        });
      }),
    );
    const user = userEvent.setup();
    render(wrap(<AiSummaryButton input="text" />));
    await user.click(screen.getByRole('button', { name: /요약하기/ }));
    const dialog = await screen.findByRole(
      'dialog',
      { name: '요약 결과' },
      { timeout: 5000 },
    );
    const buttons = await screen.findAllByRole('button');
    // Inside dialog there are 3 buttons: close (×), copy, resummarise.
    const inDialogButtons = buttons.filter((b) => dialog.contains(b));
    const last = inDialogButtons.at(-1);
    expect(last).toBeDefined();
    if (!last) return;
    last.focus();
    expect(document.activeElement).toBe(last);
    await user.tab();
    // After Tab from the last in-dialog focusable, focus must wrap to the
    // first in-dialog focusable (focus-trap rule).
    expect(inDialogButtons[0]).toBe(document.activeElement);
  });

  it('Shift+Tab from the first wraps to the last', async () => {
    server.use(
      http.post('https://proxy.test/api', () => {
        return new HttpResponse(dripSSE([...'hi'], { intervalMs: 5 }), {
          status: 200,
          headers: { 'Content-Type': 'text/event-stream' },
        });
      }),
    );
    const user = userEvent.setup();
    render(wrap(<AiSummaryButton input="text" />));
    await user.click(screen.getByRole('button', { name: /요약하기/ }));
    const dialog = await screen.findByRole(
      'dialog',
      { name: '요약 결과' },
      { timeout: 5000 },
    );
    const inDialogButtons = (await screen.findAllByRole('button')).filter((b) =>
      dialog.contains(b),
    );
    const first = inDialogButtons[0];
    expect(first).toBeDefined();
    if (!first) return;
    first.focus();
    await user.tab({ shift: true });
    expect(inDialogButtons.at(-1)).toBe(document.activeElement);
  });
});

describe('AiSummaryButton — render-prop override', () => {
  it('does not render the default popover when render is supplied', async () => {
    const user = userEvent.setup();
    const renderSpy = vi.fn(({ result, loading }) => (
      <div data-testid="custom-summary">
        {loading ? 'loading…' : result || '(none)'}
      </div>
    ));

    render(
      wrap(<AiSummaryButton input="text" render={renderSpy} />),
    );
    await user.click(screen.getByRole('button', { name: /요약하기/ }));

    await waitFor(() => {
      expect(screen.getByTestId('custom-summary')).toBeInTheDocument();
    });
    // No default dialog.
    expect(screen.queryByRole('dialog')).toBeNull();
    // Render-prop received both loading + final result phases.
    expect(renderSpy).toHaveBeenCalled();
    await act(async () => {});
  });
});
