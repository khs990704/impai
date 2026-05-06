import { describe, expect, it, vi } from 'vitest';
import { parseRetryAfter, withRateLimitRetry } from './retry';
import {
  AbortError,
  AuthError,
  RateLimitError,
} from './errors';

describe('parseRetryAfter', () => {
  it('parses numeric seconds', () => {
    expect(parseRetryAfter('1')).toBe(1000);
    expect(parseRetryAfter('2.5')).toBe(2500);
    expect(parseRetryAfter('0')).toBe(0);
  });

  it('parses HTTP-date as a positive offset from now', () => {
    const future = new Date(Date.now() + 2000).toUTCString();
    const ms = parseRetryAfter(future);
    expect(ms).toBeGreaterThan(0);
    expect(ms).toBeLessThanOrEqual(2500);
  });

  it('returns 0 for past HTTP-date', () => {
    const past = new Date(Date.now() - 5000).toUTCString();
    expect(parseRetryAfter(past)).toBe(0);
  });

  it('returns undefined for null/empty/garbage', () => {
    expect(parseRetryAfter(null)).toBeUndefined();
    expect(parseRetryAfter('')).toBeUndefined();
    expect(parseRetryAfter('garbage-not-a-date')).toBeUndefined();
  });
});

describe('withRateLimitRetry', () => {
  it('returns the value on first success', async () => {
    const attempt = vi.fn().mockResolvedValue(42);
    const out = await withRateLimitRetry(attempt);
    expect(out).toBe(42);
    expect(attempt).toHaveBeenCalledTimes(1);
  });

  it('rethrows non-RateLimit errors immediately', async () => {
    const attempt = vi.fn().mockRejectedValue(new AuthError('nope'));
    await expect(withRateLimitRetry(attempt)).rejects.toBeInstanceOf(AuthError);
    expect(attempt).toHaveBeenCalledTimes(1);
  });

  it('retries once on RateLimitError, honouring retryAfter', async () => {
    let n = 0;
    const attempt = vi.fn().mockImplementation(async () => {
      n += 1;
      if (n === 1) throw new RateLimitError('slow', 100);
      return 'ok';
    });
    const sleep = vi.fn().mockResolvedValue(undefined);
    const out = await withRateLimitRetry(attempt, { sleep });
    expect(out).toBe('ok');
    expect(attempt).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(100);
  });

  it('uses jitter when retryAfter is undefined', async () => {
    let n = 0;
    const attempt = vi.fn().mockImplementation(async () => {
      n += 1;
      if (n === 1) throw new RateLimitError('slow');
      return 'ok';
    });
    const sleep = vi.fn().mockResolvedValue(undefined);
    const random = vi.fn().mockReturnValue(0.5);
    await withRateLimitRetry(attempt, { sleep, random });
    expect(sleep).toHaveBeenCalledTimes(1);
    const wait = sleep.mock.calls[0]?.[0] as number;
    expect(wait).toBeGreaterThanOrEqual(250);
    expect(wait).toBeLessThanOrEqual(500);
  });

  it('throws after exhausting maxRetries', async () => {
    const attempt = vi
      .fn()
      .mockRejectedValue(new RateLimitError('slow', 0));
    const sleep = vi.fn().mockResolvedValue(undefined);
    await expect(
      withRateLimitRetry(attempt, { sleep, maxRetries: 1 }),
    ).rejects.toBeInstanceOf(RateLimitError);
    expect(attempt).toHaveBeenCalledTimes(2);
  });

  it('passes AbortError through without retry', async () => {
    const attempt = vi.fn().mockRejectedValue(new AbortError());
    await expect(withRateLimitRetry(attempt)).rejects.toBeInstanceOf(
      AbortError,
    );
    expect(attempt).toHaveBeenCalledTimes(1);
  });
});
