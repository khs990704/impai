/**
 * Re-export shim. The full implementation now lives in `./localStorage.ts`
 * (lower-case, matches the parent-agent brief's directory layout). The
 * upper-case file path is kept so existing imports — including the public
 * barrel — continue to resolve.
 *
 * Spec source: `_workspace/03_db_schema.md` §4-§6.
 */

export {
  LocalStorageAdapter,
  createLocalStorageAdapter,
  localStorageAdapter,
} from './localStorage';
