/**
 * Tailwind preset for `impai`.
 *
 * Usage (consumer's tailwind.config.{ts,js}):
 *
 *   import preset from 'impai/preset';
 *   export default {
 *     presets: [preset],
 *     content: ['./src/**\/*.{ts,tsx}', './node_modules/impai/dist/**\/*.{mjs,cjs}'],
 *   };
 *
 * Design notes:
 *   - All colours are CSS variables (`--aireact-color-*`) so consumers can
 *     theme by setting them on `:root` (light) or `[data-theme='dark']`.
 *   - Components are styled exclusively via `data-aireact-*` attribute
 *     selectors — never via class names from inside the library code.
 *   - Animations honour `prefers-reduced-motion` (set durations to 0ms).
 *
 * `tailwindcss` is a peer of the consumer (NOT bundled). The preset has no
 * runtime cost beyond what Tailwind generates for the matched selectors.
 *
 * IMPORTANT: this file uses no Tailwind type imports — it returns a plain
 * config object. Strict TS allows this without pulling in `tailwindcss` types.
 */

const preset = {
  // Optional dark-mode hook so consumers can flip via `[data-theme='dark']`.
  darkMode: ['selector', '[data-theme="dark"]'],

  theme: {
    extend: {
      colors: {
        'aireact-bg': 'var(--aireact-color-bg, #ffffff)',
        'aireact-fg': 'var(--aireact-color-fg, #0b0b0c)',
        'aireact-muted': 'var(--aireact-color-muted, #6b7280)',
        'aireact-border': 'var(--aireact-color-border, #e5e7eb)',
        'aireact-accent': 'var(--aireact-color-accent, #2563eb)',
        'aireact-danger': 'var(--aireact-color-danger, #dc2626)',
        'aireact-user-bg': 'var(--aireact-color-user-bg, #eff6ff)',
        'aireact-assistant-bg': 'var(--aireact-color-assistant-bg, #f9fafb)',
      },
      fontFamily: {
        aireact: 'var(--aireact-font, ui-sans-serif, system-ui, sans-serif)',
      },
    },
  },

  plugins: [
    /**
     * Adds component-level base styles using the data-attribute selectors
     * exposed by AiChat / AiSummaryButton. Implemented as a plugin function
     * so consumers don't need to write any CSS to get a sensible default
     * look. They can still override via their own utilities or by setting
     * the CSS variables.
     */
    function aireactBase({
      addBase,
      addComponents,
    }: {
      addBase: (rules: Record<string, unknown>) => void;
      addComponents: (rules: Record<string, unknown>) => void;
    }) {
      addBase({
        ':root': {
          '--aireact-color-bg': '#ffffff',
          '--aireact-color-fg': '#0b0b0c',
          '--aireact-color-muted': '#6b7280',
          '--aireact-color-border': '#e5e7eb',
          '--aireact-color-accent': '#2563eb',
          '--aireact-color-danger': '#dc2626',
          '--aireact-color-user-bg': '#eff6ff',
          '--aireact-color-assistant-bg': '#f9fafb',
        },
        '[data-theme="dark"]': {
          '--aireact-color-bg': '#0b0b0c',
          '--aireact-color-fg': '#f3f4f6',
          '--aireact-color-muted': '#9ca3af',
          '--aireact-color-border': '#1f2937',
          '--aireact-color-accent': '#60a5fa',
          '--aireact-color-danger': '#f87171',
          '--aireact-color-user-bg': '#1e3a8a',
          '--aireact-color-assistant-bg': '#111827',
        },
        '.aireact-sr-only': {
          position: 'absolute',
          width: '1px',
          height: '1px',
          padding: '0',
          margin: '-1px',
          overflow: 'hidden',
          clip: 'rect(0, 0, 0, 0)',
          whiteSpace: 'nowrap',
          borderWidth: '0',
        },
        '@media (prefers-reduced-motion: reduce)': {
          '[data-aireact-message]': { transitionDuration: '0ms !important' },
          '[data-aireact-popover]': { animationDuration: '0ms !important' },
        },
      });

      addComponents({
        '[data-aireact-chat]': {
          display: 'flex',
          flexDirection: 'column',
          gap: '0.5rem',
          padding: '0.75rem',
          background: 'var(--aireact-color-bg)',
          color: 'var(--aireact-color-fg)',
          border: '1px solid var(--aireact-color-border)',
          borderRadius: '0.5rem',
          fontFamily: 'var(--aireact-font, ui-sans-serif, system-ui, sans-serif)',
        },
        '[data-aireact-list]': {
          listStyle: 'none',
          margin: '0',
          padding: '0',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.5rem',
          maxHeight: '24rem',
          overflowY: 'auto',
        },
        '[data-aireact-message]': {
          padding: '0.5rem 0.75rem',
          borderRadius: '0.375rem',
          maxWidth: '90%',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
        },
        '[data-aireact-message][data-role="user"]': {
          background: 'var(--aireact-color-user-bg)',
          alignSelf: 'flex-end',
        },
        '[data-aireact-message][data-role="assistant"]': {
          background: 'var(--aireact-color-assistant-bg)',
          alignSelf: 'flex-start',
        },
        '[data-aireact-message][data-streaming="true"]::after': {
          content: '"▍"',
          marginLeft: '2px',
          animation: 'aireact-blink 1s steps(2, start) infinite',
        },
        '@keyframes aireact-blink': {
          to: { visibility: 'hidden' },
        },
        '[data-aireact-composer]': {
          display: 'flex',
          gap: '0.5rem',
          alignItems: 'stretch',
        },
        '[data-aireact-textarea]': {
          flex: '1 1 auto',
          padding: '0.5rem',
          border: '1px solid var(--aireact-color-border)',
          borderRadius: '0.375rem',
          background: 'var(--aireact-color-bg)',
          color: 'var(--aireact-color-fg)',
          resize: 'vertical',
          fontFamily: 'inherit',
        },
        '[data-aireact-button]': {
          padding: '0.5rem 0.75rem',
          border: '1px solid var(--aireact-color-border)',
          borderRadius: '0.375rem',
          background: 'var(--aireact-color-accent)',
          color: '#ffffff',
          cursor: 'pointer',
        },
        '[data-aireact-button][disabled]': {
          opacity: '0.5',
          cursor: 'not-allowed',
        },
        '[data-aireact-error]': {
          padding: '0.5rem 0.75rem',
          background: 'color-mix(in oklab, var(--aireact-color-danger) 12%, transparent)',
          color: 'var(--aireact-color-danger)',
          borderRadius: '0.375rem',
        },
        '[data-aireact-popover]': {
          marginTop: '0.5rem',
          padding: '0.75rem',
          border: '1px solid var(--aireact-color-border)',
          borderRadius: '0.5rem',
          background: 'var(--aireact-color-bg)',
          color: 'var(--aireact-color-fg)',
          minWidth: '16rem',
          maxWidth: '24rem',
          boxShadow: '0 10px 25px rgba(0,0,0,0.08)',
        },
        '[data-aireact-popover-header]': {
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '0.5rem',
          fontWeight: '600',
        },
        '[data-aireact-popover-actions]': {
          display: 'flex',
          gap: '0.5rem',
          marginTop: '0.5rem',
        },
      });
    },
  ],
};

export default preset;
