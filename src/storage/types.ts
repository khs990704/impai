/**
 * Storage payload types — the shapes actually persisted to the underlying
 * key-value store.
 *
 * Spec source: `_workspace/03_db_schema.md` §4 (localStorage schema) and §6
 * (migration policy).
 *
 * Layering:
 *  - `ChatSession` / `SessionMeta` (in `src/types/session.ts`) are the domain
 *    types. They already carry `schemaVersion` so they ARE the on-disk
 *    payloads in 0.1.0 — `StoredSession` is just an alias to make the read
 *    path's intent explicit.
 *  - `StorageEnvelope<T>` is the wrapper used during migration probing: when
 *    we read a raw value, we first inspect the `schemaVersion` field on the
 *    parsed object before trusting it as a `ChatSession`.
 */

import type { ChatSession, SessionMeta } from '@/types/session';

/** Alias for clarity — the on-disk shape of a session is the domain type. */
export type StoredSession = ChatSession;

/** Alias for clarity — the on-disk shape of the meta index. */
export type StoredMeta = SessionMeta;

/**
 * The minimum shape required to identify a storage payload's schemaVersion.
 *
 * The migration code reads raw values as `unknown`, narrows to this shape if
 * `schemaVersion` is a number, and then delegates to a migrator chain.
 */
export interface StorageEnvelope<T = unknown> {
  schemaVersion: number;
  data?: T;
}

/**
 * Reasons returned from {@link probeSchemaVersion} when a stored value is
 * inspected without committing to a particular type.
 */
export type SchemaProbeResult =
  | { kind: 'ok'; version: number }
  | { kind: 'missing' }
  | { kind: 'unparseable' };
