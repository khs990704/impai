/**
 * StorageAdapter contract.
 *
 * Canonical interface per _workspace/02_api_spec.md §A.8 + 03_db_schema.md §5.
 * Implementations (LocalStorageAdapter, MemoryStorageAdapter) live in this
 * folder and are owned by backend-dev. The frontend imports the type-only
 * `StorageAdapter` to type Provider props.
 */

export interface StorageAdapter {
  /** Returns null when key absent or JSON parse fails (with console.warn). */
  get<T>(key: string): Promise<T | null>;
  /** Overwrites at `key`. Implementations may debounce writes. */
  set<T>(key: string, value: T): Promise<void>;
  remove(key: string): Promise<void>;
  /** Optional. localStorage filters by prefix; consumers must tolerate undefined. */
  keys?(prefix?: string): Promise<string[]>;
  /** Optional. Force flush of any pending debounced writes. */
  flush?(): Promise<void>;
}
