/**
 * Storage key builder.
 *
 * Canonical per _workspace/03_db_schema.md §4.1. NEVER hard-code raw
 * `aireact:v1:...` strings elsewhere — always go through `k.*`.
 */

export const STORAGE_PREFIX = 'aireact:v1' as const;

export const k = {
  meta: (): string => `${STORAGE_PREFIX}:meta`,
  session: (sessionId: string): string =>
    `${STORAGE_PREFIX}:session:${sessionId}`,
  doc: (docId: string): string => `${STORAGE_PREFIX}:doc:${docId}`,
  backup: (ts: number, originalKey: string): string =>
    `${STORAGE_PREFIX}:backup:${ts}:${originalKey}`,
} as const;
