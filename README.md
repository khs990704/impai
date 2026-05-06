# @org/ai-react

> Headless React components and hooks for streaming AI features. **One import, AI-ready in 5 minutes.**

[![npm version](https://img.shields.io/npm/v/@org/ai-react.svg)](https://www.npmjs.com/package/@org/ai-react)
[![bundle size](https://img.shields.io/bundlephobia/minzip/@org/ai-react)](https://bundlephobia.com/package/@org/ai-react)
[![license](https://img.shields.io/npm/l/@org/ai-react.svg)](./LICENSE)
[![CI](https://github.com/org/ai-react/actions/workflows/ci.yml/badge.svg)](https://github.com/org/ai-react/actions/workflows/ci.yml)

`@org/ai-react` provides production-ready, accessible, headless React components for AI features — chat, summarisation, and more — backed by pluggable adapters for OpenAI and locally hosted models (Ollama). Streaming, cancellation, persistence, and a11y are handled for you. Visual styling is yours.

- **Headless** — components ship logic + ARIA + `data-*` attributes only. Bring your own CSS / Tailwind / shadcn.
- **Zero-config** — `localStorage` persistence, sensible defaults, optional Tailwind preset via `@org/ai-react/preset`.
- **Streaming-first** — Server-Sent Events (OpenAI) and NDJSON (Ollama) parsed into a uniform `StreamChunk` async-iterable.
- **Type-safe** — TypeScript strict, discriminated `engine` unions, full `.d.ts` exports (ESM + CJS dual).
- **Tree-shakeable** — `sideEffects: false`, gzip < 15 KB core.

## Quickstart (5 minutes)

```bash
npm install @org/ai-react @tanstack/react-query
```

```tsx
import { AiProvider, AiChat } from '@org/ai-react';

export default function App() {
  return (
    <AiProvider
      engine="openai"
      config={{
        // RECOMMENDED: route via your backend (no key in browser)
        proxyUrl: '/api/ai',
        model: 'gpt-4o-mini',
      }}
    >
      <AiChat placeholder="Ask anything..." />
    </AiProvider>
  );
}
```

Need a quick demo without a backend? Use `dangerouslyAllowBrowser: true` (see [Security](#security) — **dev only**).

## Security

> Sending an OpenAI API key from the browser exposes it to anyone who opens DevTools.

| Mode | Required config | Allowed environment |
|------|-----------------|---------------------|
| **Proxy (recommended)** | `proxyUrl` (your backend forwards to OpenAI) | Production, dev |
| **Direct (dangerous)** | `apiKey` + `dangerouslyAllowBrowser: true` | Internal tools / personal demos only |
| **Local (Ollama)** | `engine: 'local'`, `baseUrl`, `model` | Any (calls `localhost:11434` directly; CORS is your responsibility) |

In production builds (`process.env.NODE_ENV === 'production'`):

- Missing `proxyUrl` **and** missing `apiKey` → throws.
- `apiKey` set without `dangerouslyAllowBrowser: true` → throws `AuthError`.

A minimal Express proxy is shown in [`docs/proxy.md`](https://github.com/org/ai-react#proxy) — your backend simply forwards the OpenAI Chat Completions envelope.

## What's included (0.1.0)

| Surface | Items |
|---------|-------|
| Components | `<AiProvider>`, `<AiChat>`, `<AiSummaryButton>` |
| Hooks | `useAiChat`, `useAiSummary` |
| Adapters | `OpenAIAdapter` (Chat Completions / SSE), `LocalModelAdapter` (Ollama / NDJSON) |
| Storage | `localStorageAdapter` (default), `memoryStorageAdapter`, custom `StorageAdapter` plug-in |
| Types | `Message`, `StreamChunk`, `Adapter`, `OpenAIConfig`, `LocalConfig`, `Engine`, ... |

P1 (`<AiRewriteButton>`, `<AiFileQaPanel>`) ships in 0.2.0. Vision/multimodal lands in 1.0.0.

## Tailwind preset (optional)

```ts
// tailwind.config.ts
import preset from '@org/ai-react/preset';
export default { presets: [preset], content: ['./src/**/*.{ts,tsx}'] };
```

The preset is opt-in. Without it, components render with `data-*` hooks for any styling solution.

## Documentation

- **Storybook** — interactive demos of every component (https://org.github.io/ai-react)
- [`idea.md`](./idea.md) — original concept
- [`spec/`](./spec/) — pre-implementation planning (PRD, architecture preview, API preview, DB preview, wireframes, milestones)
- [`_workspace/`](./_workspace/) — confirmed implementation contracts (architecture, API spec, schema, test plan, deploy guide)

## Compatibility

- React **18 or 19**
- Node **18+** (development)
- ESM + CJS dual output, `.d.ts` rolled up via `vite-plugin-dts`

## Contributing

```bash
npm install
npm run dev          # vite library build in watch mode
npm test             # vitest run
npm run storybook    # storybook on :6006
npm run build        # produces ./dist
npm run size         # size-limit gate
```

PRs welcome. See [`CONTRIBUTING.md`](./CONTRIBUTING.md).

## License

[MIT](./LICENSE) © 2026 ai-react contributors
