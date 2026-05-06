import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import dts from 'vite-plugin-dts';

/**
 * Vite library mode build for `react-impai`.
 *
 * - Two entrypoints: `src/index.ts` (main) + `src/preset/tailwind.ts` (Tailwind preset).
 * - Dual output: ESM (.mjs) + CJS (.cjs) per entry.
 * - `vite-plugin-dts` rolls up `.d.ts` per entry.
 * - All peer/runtime hosts (react, react-dom, jsx-runtime, react-query) are externalised
 *   so they are NOT bundled into the published artifact.
 * - sideEffects:false is enforced via package.json — keep imports tree-shake friendly.
 */
export default defineConfig({
  plugins: [
    react(),
    dts({
      entryRoot: 'src',
      include: ['src/**/*.ts', 'src/**/*.tsx'],
      exclude: [
        'src/**/*.test.ts',
        'src/**/*.test.tsx',
        'src/**/*.spec.ts',
        'src/**/*.spec.tsx',
        'src/**/*.stories.ts',
        'src/**/*.stories.tsx',
        'src/**/*.mdx',
        'src/**/__tests__/**',
      ],
      rollupTypes: true,
      tsconfigPath: 'tsconfig.build.json',
    }),
  ],
  build: {
    target: 'es2020',
    sourcemap: true,
    minify: 'esbuild',
    outDir: 'dist',
    emptyOutDir: true,
    lib: {
      entry: {
        index: resolve(__dirname, 'src/index.ts'),
        preset: resolve(__dirname, 'src/preset/tailwind.ts'),
      },
      formats: ['es', 'cjs'],
      fileName: (format, entryName) =>
        `${entryName}.${format === 'es' ? 'mjs' : 'cjs'}`,
    },
    rollupOptions: {
      // `nanoid` is intentionally NOT externalised: v5 is ESM-only, so
      // bundling it inline keeps the CJS output (`dist/index.cjs`) loadable
      // from consumer projects that still use `require()`.
      external: [
        'react',
        'react-dom',
        'react/jsx-runtime',
        'react/jsx-dev-runtime',
        '@tanstack/react-query',
      ],
      output: {
        globals: {
          react: 'React',
          'react-dom': 'ReactDOM',
          'react/jsx-runtime': 'jsxRuntime',
          '@tanstack/react-query': 'ReactQuery',
        },
        preserveModules: false,
      },
    },
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
});
