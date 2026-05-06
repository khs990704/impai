/**
 * Storage barrel.
 *
 * Spec source: `_workspace/03_db_schema.md` §5.2.
 *
 * Two singletons are exported for use as the `storage` prop of `<AiProvider>`:
 *  - `localStorageAdapter`  — SSR-safe, debounced, runs migrations on read.
 *  - `memoryStorageAdapter` — Map-backed, used as SSR fallback / in tests.
 *
 * The `StorageAdapter` interface is re-exported as a type so consumers can
 * implement their own adapter (e.g. IndexedDB) and pass it to the provider.
 *
 * `createLocalStorageAdapter` is exposed for tests and advanced consumers
 * who need a fresh instance with custom debounce / clock injection.
 *
 * Migration helpers (`migrateValue`, `probeSchemaVersion`, `migrators`) are
 * also re-exported for the rare consumer who wants to register a v0→v1-style
 * migrator from outside the library.
 */

export type { StorageAdapter } from './StorageAdapter';
export type {
  StoredSession,
  StoredMeta,
  StorageEnvelope,
  SchemaProbeResult,
} from './types';

export { localStorageAdapter, createLocalStorageAdapter } from './localStorage';
export { LocalStorageAdapter } from './localStorage';
export { memoryStorageAdapter } from './MemoryStorageAdapter';

export { STORAGE_PREFIX, k as storageKeys } from './keys';

export {
  migrateValue,
  probeSchemaVersion,
  migrators,
  MigrationFailedError,
} from './migrations';
export type { Migrator, MigrationOutcome } from './migrations';
