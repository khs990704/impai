/**
 * Schema-version migration policy.
 *
 * Spec source: `_workspace/03_db_schema.md` §6.
 *
 * Rules implemented here:
 *  1. Compare the parsed payload's `schemaVersion` to `CURRENT_SCHEMA_VERSION`.
 *  2. Equal → return as-is.
 *  3. Lower → run migrators sequentially; before mutating, copy the original
 *     to a backup key (`aireact:v1:backup:{ts}:{originalKey}`). On any
 *     migrator error, write the backup and surface a `MigrationFailedError`
 *     so the caller can fall back to an empty session.
 *  4. Higher → DO NOT downgrade. Emit a one-time `console.warn` and ignore
 *     the value (treat as missing).
 *
 * Architect decision (per parent-agent brief):
 *  - "백업 키 생성 후 변환, 더 높은 버전 만나면 강제 다운그레이드 금지·warn"
 */

import { CURRENT_SCHEMA_VERSION } from '@/types/session';
import { k } from './keys';
import type { SchemaProbeResult } from './types';

export type Migrator = (raw: unknown) => unknown;

/**
 * Registered migrators. Key = source schemaVersion. Value = function that
 * returns the next-version payload. 0.1.0 ships with no migrators because
 * `CURRENT_SCHEMA_VERSION === 1` is the first version, but the registry is
 * exported so future versions can register without touching `migrate()`.
 */
export const migrators: Record<number, Migrator> = {};

export class MigrationFailedError extends Error {
  readonly fromVersion: number;
  readonly toVersion: number;
  readonly originalKey: string;
  readonly cause?: unknown;

  constructor(
    fromVersion: number,
    toVersion: number,
    originalKey: string,
    cause?: unknown,
  ) {
    super(
      `Failed to migrate schemaVersion ${fromVersion} → ${toVersion} for key '${originalKey}'`,
    );
    this.name = 'MigrationFailedError';
    this.fromVersion = fromVersion;
    this.toVersion = toVersion;
    this.originalKey = originalKey;
    if (cause !== undefined) this.cause = cause;
  }
}

/**
 * Inspect a parsed payload and report what schemaVersion (if any) it claims.
 * Used by adapters to decide whether to migrate, ignore, or accept.
 */
export function probeSchemaVersion(value: unknown): SchemaProbeResult {
  if (value === null || value === undefined) return { kind: 'missing' };
  if (typeof value !== 'object') return { kind: 'unparseable' };
  const v = (value as { schemaVersion?: unknown }).schemaVersion;
  if (typeof v !== 'number' || !Number.isFinite(v)) {
    return { kind: 'unparseable' };
  }
  return { kind: 'ok', version: v };
}

/**
 * Module-level memo so we only emit the higher-version warning once per
 * (originalKey, observedVersion) pair, even if the consumer reads repeatedly.
 */
const futureWarned = new Set<string>();

/**
 * Capabilities the adapter must expose for migration to do its work.
 * The local-storage adapter passes itself; tests can pass a stub.
 */
export interface MigrationStorage {
  /** Synchronous mirror of the underlying KV store. The adapter is expected
   *  to back this with `localStorage.getItem` / `setItem`. */
  readRaw(key: string): string | null;
  writeRaw(key: string, value: string): void;
}

export interface MigrationOutcome<T> {
  /** The migrated payload, or null when the value is missing/ignored. */
  value: T | null;
  /** True when a migration ran and a backup key was written. */
  migrated: boolean;
  /** Backup key, when `migrated` is true. */
  backupKey?: string;
}

/**
 * Read-and-migrate a raw payload at `originalKey`.
 *
 * The function does not throw; on any failure it returns `{ value: null }`
 * and ensures a backup of the original raw bytes was preserved.
 */
export function migrateValue<T>(
  originalKey: string,
  rawText: string | null,
  storage: MigrationStorage,
  options?: { now?: () => number },
): MigrationOutcome<T> {
  if (rawText === null) return { value: null, migrated: false };

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    // Stash the unparseable payload before declaring it missing so the user
    // can recover it manually if needed.
    backup(originalKey, rawText, storage, options);
    return { value: null, migrated: false };
  }

  const probe = probeSchemaVersion(parsed);

  if (probe.kind === 'missing' || probe.kind === 'unparseable') {
    // Treat as missing but preserve a backup of the original bytes.
    backup(originalKey, rawText, storage, options);
    return { value: null, migrated: false };
  }

  if (probe.version === CURRENT_SCHEMA_VERSION) {
    return { value: parsed as T, migrated: false };
  }

  if (probe.version > CURRENT_SCHEMA_VERSION) {
    const memoKey = `${originalKey}:${probe.version}`;
    if (!futureWarned.has(memoKey)) {
      futureWarned.add(memoKey);
      // eslint-disable-next-line no-console
      console.warn(
        `[@org/ai-react] Storage payload at '${originalKey}' has schemaVersion ${probe.version} which is newer than supported (${CURRENT_SCHEMA_VERSION}). The library will not downgrade — value ignored. Upgrade @org/ai-react to use this data.`,
      );
    }
    return { value: null, migrated: false };
  }

  // probe.version < CURRENT_SCHEMA_VERSION → migrate.
  const backupKey = backup(originalKey, rawText, storage, options);
  let cur: unknown = parsed;
  let v = probe.version;
  try {
    while (v < CURRENT_SCHEMA_VERSION) {
      const m = migrators[v];
      if (!m) {
        throw new MigrationFailedError(
          v,
          CURRENT_SCHEMA_VERSION,
          originalKey,
        );
      }
      cur = m(cur);
      const nextProbe = probeSchemaVersion(cur);
      v =
        nextProbe.kind === 'ok' && nextProbe.version > v
          ? nextProbe.version
          : v + 1;
    }
    return {
      value: cur as T,
      migrated: true,
      backupKey,
    };
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn(
      `[@org/ai-react] Migration failed for '${originalKey}'. Backup preserved at '${backupKey}'.`,
      err,
    );
    return { value: null, migrated: true, backupKey };
  }
}

function backup(
  originalKey: string,
  rawText: string,
  storage: MigrationStorage,
  options?: { now?: () => number },
): string {
  const ts = options?.now ? options.now() : Date.now();
  const backupKey = k.backup(ts, originalKey);
  try {
    storage.writeRaw(backupKey, rawText);
  } catch {
    // Backup is best-effort. Storage may be near quota; original data stays
    // in place so the user can still recover it manually.
  }
  return backupKey;
}

/** Test seam — clears the future-version warn memo. */
export function _resetFutureWarnedForTests(): void {
  futureWarned.clear();
}
