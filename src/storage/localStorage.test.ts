import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createLocalStorageAdapter } from './localStorage';
import { CURRENT_SCHEMA_VERSION } from '@/types/session';
import { _resetFutureWarnedForTests } from './migrations';

beforeEach(() => {
  window.localStorage.clear();
  _resetFutureWarnedForTests();
});

afterEach(() => vi.restoreAllMocks());

describe('LocalStorageAdapter — basic CRUD (sync writes for testability)', () => {
  it('round-trips a value', async () => {
    const a = createLocalStorageAdapter({ syncWrites: true });
    await a.set('aireact:v1:session:s', {
      schemaVersion: CURRENT_SCHEMA_VERSION,
      foo: 'bar',
    });
    const v = await a.get<{ foo: string }>('aireact:v1:session:s');
    expect(v?.foo).toBe('bar');
  });

  it('returns null for missing key', async () => {
    const a = createLocalStorageAdapter({ syncWrites: true });
    expect(await a.get('aireact:v1:session:absent')).toBeNull();
  });

  it('remove deletes both pending and persisted state', async () => {
    const a = createLocalStorageAdapter({ syncWrites: true });
    await a.set('aireact:v1:session:s', {
      schemaVersion: CURRENT_SCHEMA_VERSION,
    });
    await a.remove('aireact:v1:session:s');
    expect(await a.get('aireact:v1:session:s')).toBeNull();
  });

  it('keys filters by prefix', async () => {
    const a = createLocalStorageAdapter({ syncWrites: true });
    await a.set('aireact:v1:session:s', {
      schemaVersion: CURRENT_SCHEMA_VERSION,
    });
    await a.set('other:thing', { schemaVersion: CURRENT_SCHEMA_VERSION });
    const ks = (await a.keys?.('aireact:v1:')) ?? [];
    expect(ks).toContain('aireact:v1:session:s');
    expect(ks).not.toContain('other:thing');
  });
});

describe('LocalStorageAdapter — debounce + flush', () => {
  it('coalesces rapid writes into a single commit, flush forces it', async () => {
    vi.useFakeTimers();
    const a = createLocalStorageAdapter({ debounceMs: 100 });
    await a.set('aireact:v1:session:s', {
      schemaVersion: CURRENT_SCHEMA_VERSION,
      n: 1,
    });
    await a.set('aireact:v1:session:s', {
      schemaVersion: CURRENT_SCHEMA_VERSION,
      n: 2,
    });
    // Not yet committed — but the in-memory mirror should already serve it.
    const inFlight = await a.get<{ n: number }>('aireact:v1:session:s');
    expect(inFlight?.n).toBe(2);
    expect(window.localStorage.getItem('aireact:v1:session:s')).toBeNull();
    await a.flush?.();
    const persisted = window.localStorage.getItem('aireact:v1:session:s');
    expect(persisted).not.toBeNull();
    if (persisted) {
      expect((JSON.parse(persisted) as { n: number }).n).toBe(2);
    }
    vi.useRealTimers();
  });
});

describe('LocalStorageAdapter — migration on read', () => {
  it('passes-through current-version payloads', async () => {
    window.localStorage.setItem(
      'aireact:v1:session:s',
      JSON.stringify({ schemaVersion: CURRENT_SCHEMA_VERSION, marker: 'A' }),
    );
    const a = createLocalStorageAdapter({ syncWrites: true });
    const v = await a.get<{ marker: string }>('aireact:v1:session:s');
    expect(v?.marker).toBe('A');
  });

  it('ignores higher-version payloads and warns once', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    window.localStorage.setItem(
      'aireact:v1:session:s',
      JSON.stringify({ schemaVersion: CURRENT_SCHEMA_VERSION + 1 }),
    );
    const a = createLocalStorageAdapter({ syncWrites: true });
    const v = await a.get('aireact:v1:session:s');
    expect(v).toBeNull();
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('preserves a backup when the stored JSON is corrupt', async () => {
    window.localStorage.setItem('aireact:v1:session:s', '{ not json');
    const a = createLocalStorageAdapter({ syncWrites: true });
    const v = await a.get('aireact:v1:session:s');
    expect(v).toBeNull();
    const backupKeys = Object.keys(window.localStorage).filter((k) =>
      k.startsWith('aireact:v1:backup:'),
    );
    expect(backupKeys.length).toBe(1);
  });
});

describe('LocalStorageAdapter — quota / serialisation failure', () => {
  it('does not throw when JSON.stringify fails', async () => {
    const a = createLocalStorageAdapter({ syncWrites: true });
    const cyclic: Record<string, unknown> = {};
    cyclic['self'] = cyclic;
    await expect(a.set('aireact:v1:session:s', cyclic)).resolves.toBeUndefined();
  });

  it('does not throw when localStorage.setItem throws (quota)', async () => {
    const a = createLocalStorageAdapter({ syncWrites: true });
    const orig = window.localStorage.setItem.bind(window.localStorage);
    let threw = false;
    vi.spyOn(window.localStorage, 'setItem').mockImplementation(
      (k: string, v: string) => {
        if (k === 'aireact:v1:session:s' && !threw) {
          threw = true;
          throw new DOMException('Quota', 'QuotaExceededError');
        }
        orig(k, v);
      },
    );
    await expect(
      a.set('aireact:v1:session:s', { schemaVersion: CURRENT_SCHEMA_VERSION }),
    ).resolves.toBeUndefined();
  });
});
