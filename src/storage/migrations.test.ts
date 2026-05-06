import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  _resetFutureWarnedForTests,
  migrators,
  migrateValue,
  probeSchemaVersion,
  type MigrationStorage,
} from './migrations';
import { CURRENT_SCHEMA_VERSION } from '@/types/session';

function makeStorage(): {
  storage: MigrationStorage;
  store: Map<string, string>;
} {
  const store = new Map<string, string>();
  return {
    store,
    storage: {
      readRaw: (k) => store.get(k) ?? null,
      writeRaw: (k, v) => {
        store.set(k, v);
      },
    },
  };
}

beforeEach(() => {
  _resetFutureWarnedForTests();
  // Wipe any test-injected migrators.
  for (const k of Object.keys(migrators)) {
    delete migrators[Number(k)];
  }
});

afterEach(() => vi.restoreAllMocks());

describe('probeSchemaVersion', () => {
  it('returns missing for null/undefined', () => {
    expect(probeSchemaVersion(null).kind).toBe('missing');
    expect(probeSchemaVersion(undefined).kind).toBe('missing');
  });

  it('returns unparseable for non-objects or missing schemaVersion', () => {
    expect(probeSchemaVersion(7).kind).toBe('unparseable');
    expect(probeSchemaVersion({}).kind).toBe('unparseable');
    expect(probeSchemaVersion({ schemaVersion: 'one' }).kind).toBe(
      'unparseable',
    );
  });

  it('returns ok with version for valid envelopes', () => {
    const r = probeSchemaVersion({ schemaVersion: 1 });
    expect(r).toEqual({ kind: 'ok', version: 1 });
  });
});

describe('migrateValue', () => {
  it('returns null for missing rawText without backup', () => {
    const { storage, store } = makeStorage();
    const r = migrateValue('aireact:v1:session:default', null, storage);
    expect(r.value).toBeNull();
    expect(r.migrated).toBe(false);
    expect(store.size).toBe(0);
  });

  it('passes through a value already at current version', () => {
    const { storage, store } = makeStorage();
    const value = { schemaVersion: CURRENT_SCHEMA_VERSION, payload: 'ok' };
    const r = migrateValue<typeof value>(
      'aireact:v1:session:s',
      JSON.stringify(value),
      storage,
    );
    expect(r.value).toEqual(value);
    expect(r.migrated).toBe(false);
    expect(store.size).toBe(0);
  });

  it('warns and ignores higher schemaVersion (v=v+1) without backup', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { storage, store } = makeStorage();
    const value = { schemaVersion: CURRENT_SCHEMA_VERSION + 1 };
    const r = migrateValue(
      'aireact:v1:session:s',
      JSON.stringify(value),
      storage,
    );
    expect(r.value).toBeNull();
    expect(store.size).toBe(0);
    expect(warn).toHaveBeenCalledTimes(1);
    // Second probe should not re-warn for the same key+version.
    migrateValue('aireact:v1:session:s', JSON.stringify(value), storage);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('runs registered migrator from v0 to v1 and writes backup', () => {
    const now = vi.fn().mockReturnValue(1700000000);
    migrators[0] = (raw): unknown => {
      const obj = raw as { foo?: string };
      return { schemaVersion: 1, foo: obj.foo, migrated: true };
    };
    const { storage, store } = makeStorage();
    const value = { schemaVersion: 0, foo: 'bar' };
    const r = migrateValue<{ schemaVersion: number; migrated: boolean }>(
      'aireact:v1:session:s',
      JSON.stringify(value),
      storage,
      { now },
    );
    expect(r.migrated).toBe(true);
    expect(r.value?.migrated).toBe(true);
    expect(r.backupKey).toBe(
      'aireact:v1:backup:1700000000:aireact:v1:session:s',
    );
    expect(r.backupKey).toBeDefined();
    if (r.backupKey) expect(store.has(r.backupKey)).toBe(true);
  });

  it('backs up unparseable JSON and returns null', () => {
    const { storage, store } = makeStorage();
    const r = migrateValue('aireact:v1:session:s', '{not json', storage, {
      now: () => 1,
    });
    expect(r.value).toBeNull();
    expect(store.size).toBe(1);
    const first = store.entries().next();
    expect(first.done).toBe(false);
    const entry = first.value as [string, string] | undefined;
    expect(entry).toBeDefined();
    if (entry) {
      const [backupKey, val] = entry;
      expect(backupKey).toBe('aireact:v1:backup:1:aireact:v1:session:s');
      expect(val).toBe('{not json');
    }
  });

  it('backs up and returns null when no migrator is registered for v=0', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { storage, store } = makeStorage();
    const value = { schemaVersion: 0 };
    const r = migrateValue(
      'aireact:v1:session:s',
      JSON.stringify(value),
      storage,
      { now: () => 99 },
    );
    expect(r.value).toBeNull();
    expect(r.migrated).toBe(true);
    expect(r.backupKey).toBe('aireact:v1:backup:99:aireact:v1:session:s');
    expect(r.backupKey).toBeDefined();
    if (r.backupKey) expect(store.has(r.backupKey)).toBe(true);
    expect(warn).toHaveBeenCalled();
  });
});
