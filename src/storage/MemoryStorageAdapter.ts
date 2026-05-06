/**
 * STUB — owned by backend-dev. See _workspace/03_db_schema.md §5.2.
 *
 * In-memory Map-backed adapter. Used as SSR fallback and by tests.
 * The exported `memoryStorageAdapter` is a singleton instance.
 */

import type { StorageAdapter } from './StorageAdapter';

class MemoryStorageAdapter implements StorageAdapter {
  private readonly store = new Map<string, string>();

  async get<T>(key: string): Promise<T | null> {
    const raw = this.store.get(key);
    if (raw === undefined) return null;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  }

  async set<T>(key: string, value: T): Promise<void> {
    try {
      this.store.set(key, JSON.stringify(value));
    } catch {
      // intentionally swallow per StorageAdapter contract
    }
  }

  async remove(key: string): Promise<void> {
    this.store.delete(key);
  }

  async keys(prefix?: string): Promise<string[]> {
    const all = Array.from(this.store.keys());
    return prefix ? all.filter((k) => k.startsWith(prefix)) : all;
  }
}

export const memoryStorageAdapter: StorageAdapter = new MemoryStorageAdapter();
