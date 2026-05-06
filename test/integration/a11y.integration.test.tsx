/**
 * Accessibility integration tests — runs axe-core directly against rendered
 * components. Per `_workspace/04_test_plan.md` § a11y matrix:
 *
 *  - AiChat: empty + populated + streaming states must have zero axe violations.
 *  - AiSummaryButton: trigger (closed) + dialog (open) must have zero violations.
 *
 * `vitest-axe` is not in the dep list (intentional — keeps the dev surface
 * lean); we drive `axe-core` directly with the WCAG 2 A/AA rule sets.
 */

import { describe, expect, it } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { http, HttpResponse } from 'msw';
import { server } from '../msw/server';
import { dripSSE } from '../msw/openai';
import { AiProvider } from '@/provider/AiProvider';
import { AiChat } from '@/components/AiChat/AiChat';
import { AiSummaryButton } from '@/components/AiSummaryButton/AiSummaryButton';

const AXE_OPTIONS: axe.RunOptions = {
  runOnly: {
    type: 'tag',
    values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'],
  },
};

async function runAxe(node: HTMLElement): Promise<axe.Result[]> {
  const results = await axe.run(node, AXE_OPTIONS);
  return results.violations;
}

function describeViolations(violations: axe.Result[]): string {
  return violations
    .map(
      (v) =>
        `[${v.id}] ${v.description} (impact=${v.impact}). Nodes: ${v.nodes
          .map((n) => n.html)
          .join(' | ')}`,
    )
    .join('\n');
}

describe('a11y — AiChat', () => {
  it('empty state has zero violations', async () => {
    const { container } = render(
      <AiProvider engine="openai" config={{ proxyUrl: 'https://proxy.test/api' }}>
        <AiChat
          persist={false}
          emptyState={<div>Start a conversation.</div>}
        />
      </AiProvider>,
    );
    const violations = await runAxe(container);
    expect(violations, describeViolations(violations)).toHaveLength(0);
    cleanup();
  });

  it('with seed messages has zero violations', async () => {
    const { container } = render(
      <AiProvider engine="openai" config={{ proxyUrl: 'https://proxy.test/api' }}>
        <AiChat
          persist={false}
          initialMessages={[
            {
              id: 'u1',
              role: 'user',
              content: 'hello',
              createdAt: 0,
              status: 'complete',
            },
            {
              id: 'a1',
              role: 'assistant',
              content: 'hi there',
              createdAt: 1,
              status: 'complete',
            },
          ]}
        />
      </AiProvider>,
    );
    const violations = await runAxe(container);
    expect(violations, describeViolations(violations)).toHaveLength(0);
    cleanup();
  });
});

describe('a11y — AiSummaryButton', () => {
  it('closed trigger has zero violations', async () => {
    const { container } = render(
      <AiProvider engine="openai" config={{ proxyUrl: 'https://proxy.test/api' }}>
        <AiSummaryButton input="some text" />
      </AiProvider>,
    );
    const violations = await runAxe(container);
    expect(violations, describeViolations(violations)).toHaveLength(0);
    cleanup();
  });

  it('open dialog has zero violations', async () => {
    server.use(
      http.post('https://proxy.test/api', () => {
        return new HttpResponse(dripSSE([...'a-summary'], { intervalMs: 5 }), {
          status: 200,
          headers: { 'Content-Type': 'text/event-stream' },
        });
      }),
    );
    const user = userEvent.setup();
    const { container } = render(
      <AiProvider engine="openai" config={{ proxyUrl: 'https://proxy.test/api' }}>
        <AiSummaryButton input="text" />
      </AiProvider>,
    );
    await user.click(screen.getByRole('button', { name: /요약하기/ }));
    await screen.findByRole('dialog', { name: '요약 결과' }, { timeout: 5000 });
    await waitFor(async () => {
      const v = await runAxe(container);
      expect(v, describeViolations(v)).toHaveLength(0);
    });
    cleanup();
  });
});
