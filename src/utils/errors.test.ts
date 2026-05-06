import { describe, expect, it } from 'vitest';
import {
  AbortError,
  AiError,
  AiReactError,
  AuthError,
  LocalEngineUnavailable,
  NetworkError,
  RateLimitError,
  UpstreamError,
} from './errors';

describe('AiReactError hierarchy', () => {
  it('exposes code, message, and class name on subclasses', () => {
    const err = new AuthError('bad key');
    expect(err).toBeInstanceOf(AiReactError);
    expect(err).toBeInstanceOf(AuthError);
    expect(err.code).toBe('AUTH');
    expect(err.message).toBe('bad key');
    expect(err.name).toBe('AuthError');
  });

  it('AiError is an alias for AiReactError', () => {
    expect(AiError).toBe(AiReactError);
    const err = new AuthError('x');
    expect(err instanceof AiError).toBe(true);
  });

  it('preserves cause when supplied', () => {
    const root = new TypeError('root');
    const err = new NetworkError('failed', { cause: root });
    expect(err.cause).toBe(root);
  });

  it('omits cause when none supplied (no key written)', () => {
    const err = new NetworkError('failed');
    // exactOptionalPropertyTypes — must not have an undefined `cause` key.
    expect('cause' in err && err.cause === undefined).toBe(false);
  });

  it('RateLimitError exposes retryAfter', () => {
    const err = new RateLimitError('slow down', 1500);
    expect(err.code).toBe('RATE_LIMIT');
    expect(err.retryAfter).toBe(1500);
  });

  it('UpstreamError carries status + body', () => {
    const err = new UpstreamError(503, { reason: 'oops' });
    expect(err.code).toBe('UPSTREAM');
    expect(err.status).toBe(503);
    expect(err.body).toEqual({ reason: 'oops' });
  });

  it('LocalEngineUnavailable has its own code', () => {
    const err = new LocalEngineUnavailable('start ollama');
    expect(err.code).toBe('LOCAL_UNAVAILABLE');
  });
});

describe('AbortError', () => {
  it('sets name to AbortError per cross-runtime convention', () => {
    const err = new AbortError();
    expect(err.name).toBe('AbortError');
    expect(err.code).toBe('ABORT');
  });

  it('AbortError.is recognises itself and DOMException AbortError', () => {
    expect(AbortError.is(new AbortError())).toBe(true);
    const native = new Error('aborted');
    native.name = 'AbortError';
    expect(AbortError.is(native)).toBe(true);
    expect(AbortError.is(new TypeError('x'))).toBe(false);
    expect(AbortError.is(undefined)).toBe(false);
  });
});
