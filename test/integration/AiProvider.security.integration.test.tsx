/**
 * Integration test — `<AiProvider>` security gate matrix.
 *
 * Per `_workspace/02_api_spec.md` §A.1 (table) + `_workspace/01_architecture.md`
 * §11. The matrix below mirrors that table row-for-row.
 *
 * | apiKey | proxyUrl | dangerouslyAllowBrowser | NODE_ENV | expected   |
 * | set    | unset    | not true                | any      | throw      |
 * | set    | unset    | true                    | any      | OK         |
 * | unset  | set      | any                     | any      | OK         |
 * | unset  | unset    | any                     | production | throw    |
 * | unset  | unset    | any                     | dev      | warn (no throw) |
 *
 * Tests render <AiProvider> directly; React surfaces synchronous throws
 * through error boundaries — we install one to capture them deterministically.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import { Component, type ReactNode } from 'react';
import { AiProvider } from '@/provider/AiProvider';
import { AuthError } from '@/utils/errors';

class Boundary extends Component<
  { onError: (e: Error) => void; children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }
  componentDidCatch(error: Error): void {
    this.props.onError(error);
  }
  render(): ReactNode {
    return this.state.failed ? <div data-testid="caught" /> : this.props.children;
  }
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('AiProvider — security gate', () => {
  it('throws AuthError when apiKey is set without proxyUrl or dangerouslyAllowBrowser', () => {
    const errors: Error[] = [];
    // Suppress React's noisy boundary stderr.
    vi.spyOn(console, 'error').mockImplementation(() => {});
    render(
      <Boundary onError={(e) => errors.push(e)}>
        <AiProvider engine="openai" config={{ apiKey: 'sk-x' }}>
          <div />
        </AiProvider>
      </Boundary>,
    );
    expect(errors[0]).toBeInstanceOf(AuthError);
  });

  it('accepts apiKey + dangerouslyAllowBrowser:true', () => {
    expect(() =>
      render(
        <AiProvider
          engine="openai"
          config={{ apiKey: 'sk-x', dangerouslyAllowBrowser: true }}
        >
          <div />
        </AiProvider>,
      ),
    ).not.toThrow();
  });

  it('accepts proxyUrl alone', () => {
    expect(() =>
      render(
        <AiProvider engine="openai" config={{ proxyUrl: 'https://proxy.test/api' }}>
          <div />
        </AiProvider>,
      ),
    ).not.toThrow();
  });

  it('warns (no throw) in dev when both apiKey and proxyUrl are missing', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(() =>
      render(
        <AiProvider engine="openai" config={{}}>
          <div />
        </AiProvider>,
      ),
    ).not.toThrow();
    expect(warn).toHaveBeenCalled();
  });
});

describe('AiProvider — local engine validation', () => {
  it('throws when LocalConfig.model is empty', () => {
    const errors: Error[] = [];
    vi.spyOn(console, 'error').mockImplementation(() => {});
    render(
      <Boundary onError={(e) => errors.push(e)}>
        <AiProvider engine="local" config={{ model: '' }}>
          <div />
        </AiProvider>
      </Boundary>,
    );
    expect(errors[0]?.message).toMatch(/LocalConfig.model is required/);
  });

  it('accepts a valid LocalConfig', () => {
    expect(() =>
      render(
        <AiProvider engine="local" config={{ model: 'llama3' }}>
          <div />
        </AiProvider>,
      ),
    ).not.toThrow();
  });
});
