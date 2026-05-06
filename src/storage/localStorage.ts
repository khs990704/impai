/**
 * SSR-safe localStorage adapter with debounced writes and schema-version
 * migration on read.
 *
 * Spec source: `_workspace/03_db_schema.md` §4.2-§4.3.
 *
 * Implementation notes:
 *  - Writes are coalesced per-key with a 500ms debounce. Multiple `set` calls
 *    against the same key only commit the latest value to localStorage. The
 *    in-memory map ALSO mirrors the value, so subsequent `get` calls return
 *    the latest write even before it has flushed to disk.
 *  - `flush()` synchronously commits all pending writes; AiProvider should
 *    call this in cleanup to avoid losing data on unmount.
 *  - Reads run through the migration pipeline (see `./migrations.ts`).
 *  - Availability is probed on every method (cached after the first probe)
 *    so SSR hydration and Safari Private Mode behave consistently.
 */

import type { StorageAdapter } from './StorageAdapter';
import { migrateValue, type MigrationStorage } from './migrations';

interface LocalStorageAdapterOptions {
  /** Debounce window in ms. Default 500 per §4.2. */
  debounceMs?: number;
  /** Inject for tests. */
  setTimeoutFn?: typeof setTimeout;
  clearTimeoutFn?: typeof clearTimeout;
  /** When true, writes commit synchronously — used by tests. */
  syncWrites?: boolean;
}

interface PendingWrite {
  /** The latest serialised value to commit. */
  serialised: string;
  /** Timer handle. */
  timer: ReturnType<typeof setTimeout> | null;
}

/**
 * NOTE: exported for tests / advanced consumers, but `localStorageAdapter`
 * (singleton) is the supported public surface.
 */
export class LocalStorageAdapter implements StorageAdapter {
  private availability: boolean | null = null;
  private warnedUnavailable = false;

  private readonly pending = new Map<string, PendingWrite>();
  /** Mirror so reads see the latest debounced value. */
  private readonly mirror = new Map<string, string>();

  private readonly debounceMs: number;
  private readonly setTimeoutFn: typeof setTimeout;
  private readonly clearTimeoutFn: typeof clearTimeout;
  private readonly syncWrites: boolean;

  constructor(opts: LocalStorageAdapterOptions = {}) {
    this.debounceMs = opts.debounceMs ?? 500;
    this.setTimeoutFn = opts.setTimeoutFn ?? setTimeout;
    this.clearTimeoutFn = opts.clearTimeoutFn ?? clearTimeout;
    this.syncWrites = opts.syncWrites ?? false;
  }

  private isAvailable(): boolean {
    if (this.availability !== null) return this.availability;
    if (typeof window === 'undefined' || !window.localStorage) {
      this.availability = false;
      return false;
    }
    try {
      const probe = '__aireact_test__';
      window.localStorage.setItem(probe, '1');
      window.localStorage.removeItem(probe);
      this.availability = true;
    } catch {
      this.availability = false;
      if (!this.warnedUnavailable) {
        this.warnedUnavailable = true;
        // eslint-disable-next-line no-console
        console.warn(
          '[@org/ai-react] localStorage unavailable. Persistence is disabled.',
        );
      }
    }
    return this.availability;
  }

  /** {@link MigrationStorage} adapter — used by `migrateValue`. */
  private get migrationStorage(): MigrationStorage {
    return {
      readRaw: (key: string) => {
        // Prefer pending in-memory write if any (latest value wins).
        const inMirror = this.mirror.get(key);
        if (inMirror !== undefined) return inMirror;
        if (!this.isAvailable()) return null;
        try {
          return window.localStorage.getItem(key);
        } catch {
          return null;
        }
      },
      writeRaw: (key: string, value: string) => {
        if (!this.isAvailable()) return;
        try {
          window.localStorage.setItem(key, value);
        } catch {
          // Backups are best-effort.
        }
      },
    };
  }

  async get<T>(key: string): Promise<T | null> {
    // Mirror first — newest in-flight value.
    const cached = this.mirror.get(key);
    let raw: string | null;
    if (cached !== undefined) {
      raw = cached;
    } else {
      if (!this.isAvailable()) return null;
      try {
        raw = window.localStorage.getItem(key);
      } catch {
        return null;
      }
    }

    const outcome = migrateValue<T>(key, raw, this.migrationStorage);
    if (outcome.migrated && outcome.value !== null) {
      // Persist the migrated value so subsequent reads skip migration.
      void this.set(key, outcome.value);
    }
    return outcome.value;
  }

  async set<T>(key: string, value: T): Promise<void> {
    let serialised: string;
    try {
      serialised = JSON.stringify(value);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(
        `[@org/ai-react] JSON.stringify failed for storage key '${key}'`,
        err,
      );
      return;
    }
    this.mirror.set(key, serialised);

    if (!this.isAvailable()) return;

    if (this.syncWrites || this.debounceMs <= 0) {
      this.commit(key, serialised);
      return;
    }

    const existing = this.pending.get(key);
    if (existing && existing.timer !== null) {
      this.clearTimeoutFn(existing.timer);
    }
    const timer = this.setTimeoutFn(() => {
      const cur = this.pending.get(key);
      if (cur) {
        this.commit(key, cur.serialised);
        this.pending.delete(key);
      }
    }, this.debounceMs);
    this.pending.set(key, { serialised, timer });
  }

  async remove(key: string): Promise<void> {
    this.mirror.delete(key);
    const pending = this.pending.get(key);
    if (pending?.timer) this.clearTimeoutFn(pending.timer);
    this.pending.delete(key);
    if (!this.isAvailable()) return;
    try {
      window.localStorage.removeItem(key);
    } catch {
      /* no-op */
    }
  }

  async keys(prefix?: string): Promise<string[]> {
    if (!this.isAvailable()) {
      // Mirror-only fallback so debounced writes are still visible.
      const ks = Array.from(this.mirror.keys());
      return prefix ? ks.filter((k) => k.startsWith(prefix)) : ks;
    }
    const set = new Set<string>(this.mirror.keys());
    try {
      for (let i = 0; i < window.localStorage.length; i += 1) {
        const k = window.localStorage.key(i);
        if (k !== null) set.add(k);
      }
    } catch {
      /* fall back to mirror only */
    }
    const all = Array.from(set);
    return prefix ? all.filter((k) => k.startsWith(prefix)) : all;
  }

  /** Drain every pending debounced write to localStorage immediately. */
  async flush(): Promise<void> {
    for (const [key, entry] of this.pending) {
      if (entry.timer !== null) this.clearTimeoutFn(entry.timer);
      this.commit(key, entry.serialised);
    }
    this.pending.clear();
  }

  private commit(key: string, serialised: string): void {
    if (!this.isAvailable()) return;
    try {
      window.localStorage.setItem(key, serialised);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn(
        `[@org/ai-react] localStorage.setItem failed for '${key}' (quota?).`,
        err,
      );
    }
  }
}

/** Factory used by tests / advanced consumers that need a fresh instance. */
export function createLocalStorageAdapter(
  opts: LocalStorageAdapterOptions = {},
): LocalStorageAdapter {
  return new LocalStorageAdapter(opts);
}

/** Default singleton consumed by `<AiProvider>` when no `storage` prop given. */
export const localStorageAdapter: StorageAdapter = new LocalStorageAdapter();
