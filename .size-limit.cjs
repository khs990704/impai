/**
 * Bundle-size budget — enforced in CI.
 *
 * Targets come from _workspace/01_architecture.md §9 (NFR-1):
 *   - core (Provider + useAiChat + types)         < 15 KB gzip
 *   - core + OpenAIAdapter (tree-shaken)          < 23 KB gzip
 *   - core + LocalModelAdapter (tree-shaken)      < 22 KB gzip
 *
 * The `import` field tells size-limit which named exports to keep —
 * everything else is dropped, which simulates a real consumer's
 * tree-shaking behaviour.
 */
module.exports = [
  {
    name: 'core (AiProvider + useAiChat)',
    path: 'dist/index.mjs',
    import: '{ AiProvider, useAiChat }',
    limit: '15 KB',
    gzip: true,
    ignore: ['react', 'react-dom', 'react/jsx-runtime', '@tanstack/react-query'],
  },
  {
    name: 'core + OpenAIAdapter',
    path: 'dist/index.mjs',
    import: '{ AiProvider, AiChat, useAiChat, OpenAIAdapter }',
    limit: '23 KB',
    gzip: true,
    ignore: ['react', 'react-dom', 'react/jsx-runtime', '@tanstack/react-query'],
  },
  {
    name: 'core + LocalModelAdapter',
    path: 'dist/index.mjs',
    import: '{ AiProvider, AiChat, useAiChat, LocalModelAdapter }',
    limit: '22 KB',
    gzip: true,
    ignore: ['react', 'react-dom', 'react/jsx-runtime', '@tanstack/react-query'],
  },
  {
    name: 'all components + both adapters',
    path: 'dist/index.mjs',
    import: '*',
    limit: '30 KB',
    gzip: true,
    ignore: ['react', 'react-dom', 'react/jsx-runtime', '@tanstack/react-query'],
  },
];
