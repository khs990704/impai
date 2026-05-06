/**
 * Compatibility shim — re-exports the preset so both `src/preset.ts` and
 * `src/preset/tailwind.ts` resolve to the same default export. The Vite
 * library entry uses `src/preset/tailwind.ts` (see vite.config.ts).
 */

export { default } from './preset/tailwind';
