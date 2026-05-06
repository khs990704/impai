# react-impai

> Headless React components and hooks for streaming AI features. **One import, AI-ready in 5 minutes.**

[![npm version](https://img.shields.io/npm/v/react-impai.svg)](https://www.npmjs.com/package/react-impai)
[![bundle size](https://img.shields.io/bundlephobia/minzip/react-impai)](https://bundlephobia.com/package/react-impai)
[![license](https://img.shields.io/npm/l/react-impai.svg)](./LICENSE)
[![CI](https://github.com/khs990704/impai/actions/workflows/ci.yml/badge.svg)](https://github.com/khs990704/impai/actions/workflows/ci.yml)

`react-impai` provides production-ready, accessible, headless React components for AI features — chat, summarisation, and more — backed by pluggable adapters for OpenAI and locally hosted models (Ollama). Streaming, cancellation, persistence, and a11y are handled for you. Visual styling is yours.

- **Headless** — components ship logic + ARIA + `data-*` attributes only. Bring your own CSS / Tailwind / shadcn.
- **Zero-config** — `localStorage` persistence, sensible defaults, optional Tailwind preset via `react-impai/preset`.
- **Streaming-first** — Server-Sent Events (OpenAI) and NDJSON (Ollama) parsed into a uniform `StreamChunk` async-iterable.
- **Type-safe** — TypeScript strict, discriminated `engine` unions, full `.d.ts` exports (ESM + CJS dual).
- **Tree-shakeable** — `sideEffects: false`, gzip < 15 KB core.

---

## Table of contents

- [Install](#install)
- [Quickstart (5 minutes)](#quickstart-5-minutes)
- [Usage guide](#usage-guide)
  - [1. Wrap your app with `<AiProvider>`](#1-wrap-your-app-with-aiprovider)
  - [2. Drop in `<AiChat>`](#2-drop-in-aichat)
  - [3. Add a `<AiSummaryButton>`](#3-add-a-aisummarybutton)
  - [4. Build your own UI with hooks](#4-build-your-own-ui-with-hooks)
  - [5. Run against a local Ollama model](#5-run-against-a-local-ollama-model)
  - [6. Style with the Tailwind preset](#6-style-with-the-tailwind-preset)
  - [7. Persist chat history](#7-persist-chat-history)
  - [8. Cancel a streaming response](#8-cancel-a-streaming-response)
  - [9. Handle errors](#9-handle-errors)
- [Security](#security)
- [Backend proxy example](#backend-proxy-example)
- [What's included (0.1.0)](#whats-included-010)
- [API surface](#api-surface)
- [Compatibility](#compatibility)
- [Development](#development)
- [License](#license)

---

## Install

```bash
npm install react-impai @tanstack/react-query
# or
pnpm add react-impai @tanstack/react-query
# or
yarn add react-impai @tanstack/react-query
```

`react`, `react-dom` (>=18) and `@tanstack/react-query` (>=5) are peer dependencies — bring your own.

## Quickstart (5 minutes)

```tsx
import { AiProvider, AiChat } from 'react-impai';

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

That's it — `<AiChat>` renders a streaming chat surface, persists history to `localStorage`, and exposes ARIA roles + `data-*` hooks for styling.

> Need a quick demo without a backend? Use `dangerouslyAllowBrowser: true` (see [Security](#security) — **dev only**).

---

## Usage guide

### 1. Wrap your app with `<AiProvider>`

`<AiProvider>` is the root that selects the engine (OpenAI or local Ollama), wires up a `QueryClient`, and validates security gates.

```tsx
import { AiProvider } from 'react-impai';

<AiProvider
  engine="openai"
  config={{ proxyUrl: '/api/ai', model: 'gpt-4o-mini' }}
  // Optional defaults below
  systemPrompt="You are a concise assistant."
>
  {children}
</AiProvider>
```

| Prop | Type | Description |
|------|------|-------------|
| `engine` | `'openai' \| 'local'` | Selects the adapter. Discriminates `config`. |
| `config` | `OpenAIConfig \| LocalConfig` | Engine-specific settings. See `src/types/config.ts`. |
| `storage?` | `StorageAdapter` | Custom persistence. Default: `localStorageAdapter`. |
| `queryClient?` | `QueryClient` | Reuse your app's React Query client. Default: an internal one. |
| `systemPrompt?` | `string` | Default system prompt applied to all hooks/components. |

### 2. Drop in `<AiChat>`

Headless streaming chat. Renders a list of messages, a composer, and an error banner — no colours, fonts, or spacing baked in.

```tsx
import { AiChat } from 'react-impai';

<AiChat
  sessionId="support"             // separate persistence bucket
  placeholder="What's on your mind?"
  systemPrompt="Reply in Korean."
  maxMessages={50}
  onComplete={(msg) => console.log('assistant said:', msg)}
  onError={(err) => console.error(err)}
/>
```

Common props:

| Prop | Type | Default | Notes |
|------|------|---------|-------|
| `sessionId` | `string` | `'default'` | Used as the `localStorage` key suffix. |
| `persist` | `boolean` | `true` | Disable to keep chat in memory only. |
| `initialMessages` | `Message[]` | `[]` | Hydrate from the server, etc. |
| `systemPrompt` | `string` | — | Per-instance override. |
| `maxMessages` | `number` | `100` | Tail-trims when exceeded; preserves `system`. |
| `placeholder` | `string` | — | Composer textarea hint. |
| `emptyState` | `ReactNode` | — | Shown when there are no messages. |
| `renderMessage` | `(m: Message) => ReactNode` | — | Custom message renderer. |
| `composerSlot` | `ReactNode` | — | Replace the default composer. |
| `classNames` | `{ root, list, message, composer, error }` | — | Per-slot class names. |

Style hooks (the headless contract):

- Root: `[data-aireact-chat][data-state="idle|streaming|error"]`
- Message: `[data-aireact-message][data-role="user|assistant|system"]`, plus `data-streaming="true"` while a chunk is appending.
- Composer / error / popover: `[data-aireact-composer]`, `[data-aireact-error][role="alert"]`, `[data-aireact-popover]`.

### 3. Add a `<AiSummaryButton>`

Click → summarise → popover with the result. Supports Copy and Re-summarise out of the box.

```tsx
import { AiSummaryButton } from 'react-impai';

<AiSummaryButton
  input={selectedText}
  prompt="Summarise the following in 3 bullet points:"
  onResult={(text) => track('summary', text)}
>
  Summarise
</AiSummaryButton>
```

Use the `render` prop to fully replace the popover:

```tsx
<AiSummaryButton
  input={text}
  render={({ result, loading, error }) =>
    loading ? <Spinner /> : error ? <Alert>{error.message}</Alert> : <Card>{result}</Card>
  }
/>
```

### 4. Build your own UI with hooks

Components are thin wrappers over hooks. If you want full control, drop the components and use the hooks directly.

```tsx
import { useAiChat } from 'react-impai';

function MyChat() {
  const { messages, send, cancel, isStreaming, error } = useAiChat({
    sessionId: 'my-feature',
    systemPrompt: 'Be terse.',
  });

  return (
    <>
      {messages.map((m) => (
        <div key={m.id} data-role={m.role}>{stringify(m.content)}</div>
      ))}
      <Composer disabled={isStreaming} onSubmit={send} onCancel={cancel} />
      {error && <Alert>{error.message}</Alert>}
    </>
  );
}
```

```tsx
import { useAiSummary } from 'react-impai';

const { summarize, loading, error, result } = useAiSummary({
  prompt: 'Three sentences.',
});

await summarize(article); // returns string; also sets `result`
```

### 5. Run against a local Ollama model

Switch the provider — same components, same hooks.

```tsx
import { AiProvider, AiChat } from 'react-impai';

<AiProvider
  engine="local"
  config={{
    baseUrl: 'http://localhost:11434', // default
    model: 'llama3',                    // required
    keepAlive: '5m',
  }}
>
  <AiChat />
</AiProvider>
```

> Ollama runs on the user's machine. CORS for browser → `localhost:11434` is your responsibility (start Ollama with `OLLAMA_ORIGINS=*` in dev, or proxy via your backend in prod).

### 6. Style with the Tailwind preset

The preset is **opt-in**. Without it, you style components by writing CSS against the `data-*` selectors yourself.

```ts
// tailwind.config.ts
import preset from 'react-impai/preset';

export default {
  presets: [preset],
  content: [
    './src/**/*.{ts,tsx}',
    './node_modules/react-impai/dist/**/*.{mjs,cjs}',
  ],
};
```

Theme by overriding the CSS variables:

```css
:root {
  --aireact-color-accent: #6366f1;
  --aireact-color-user-bg: #eef2ff;
}
[data-theme='dark'] {
  --aireact-color-bg: #0b0b0c;
}
```

### 7. Persist chat history

By default, `<AiChat>` (and `useAiChat`) persist to `localStorage` under a key derived from `sessionId`. Customise persistence by swapping the storage adapter:

```tsx
import { AiProvider, memoryStorageAdapter } from 'react-impai';

<AiProvider engine="openai" config={cfg} storage={memoryStorageAdapter}>
  {/* …in-memory only — useful for tests / SSR */}
</AiProvider>
```

Implement `StorageAdapter` to plug into IndexedDB, server-side persistence, or anything else.

### 8. Cancel a streaming response

`useAiChat().cancel()` (or the inline cancel inside `<AiChat>`'s composer while streaming) aborts the in-flight request and ends the stream cleanly. The partial message is preserved with `status: 'canceled'`.

```tsx
const { cancel, isStreaming } = useAiChat();
return <button onClick={cancel} disabled={!isStreaming}>Stop</button>;
```

### 9. Handle errors

All adapter errors extend `AiError`:

```tsx
import { AiError, AuthError, RateLimitError, NetworkError, AbortError } from 'react-impai';

try {
  await summarize(text);
} catch (e) {
  if (e instanceof RateLimitError) showToast('Slow down a bit.');
  else if (e instanceof AuthError)  showToast('Check your API key / proxy.');
  else if (e instanceof AbortError) {/* user cancelled — ignore */}
  else if (e instanceof NetworkError) showToast('Offline?');
  else throw e;
}
```

`<AiChat>` and `<AiSummaryButton>` surface errors via an `[role="alert"]` banner and the `onError` callback.

---

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

## Backend proxy example

Minimal Express endpoint that forwards a Chat Completions-compatible body to OpenAI. The browser sends to `/api/ai`; the server holds the key.

```ts
// server/ai.ts (Node 18+)
import express from 'express';

const app = express();
app.use(express.json());

app.post('/api/ai', async (req, res) => {
  const upstream = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify(req.body),
  });
  // Stream the SSE/JSON body straight through to the browser.
  res.status(upstream.status);
  upstream.headers.forEach((v, k) => res.setHeader(k, v));
  upstream.body?.pipe(res);
});

app.listen(3000);
```

That's the entire backend contract — `react-impai` already speaks the OpenAI Chat Completions wire format.

## What's included (0.1.0)

| Surface | Items |
|---------|-------|
| Components | `<AiProvider>`, `<AiChat>`, `<AiSummaryButton>` |
| Hooks | `useAiChat`, `useAiSummary` |
| Adapters | `OpenAIAdapter` (Chat Completions / SSE), `LocalModelAdapter` (Ollama / NDJSON) |
| Storage | `localStorageAdapter` (default), `memoryStorageAdapter`, custom `StorageAdapter` plug-in |
| Errors | `AiError`, `AuthError`, `RateLimitError`, `UpstreamError`, `NetworkError`, `LocalEngineUnavailable`, `AbortError` |
| Types | `Message`, `StreamChunk`, `Adapter`, `OpenAIConfig`, `LocalConfig`, `Engine`, `ChatSession`, `StorageAdapter` |

P1 (`<AiRewriteButton>`, `<AiFileQaPanel>`) ships in 0.2.0. Vision/multimodal lands in 1.0.0.

## API surface

Everything is exported from the package root:

```ts
import {
  // components
  AiProvider, AiChat, AiSummaryButton,
  // hooks
  useAiChat, useAiSummary,
  // adapters & storage
  OpenAIAdapter, LocalModelAdapter,
  localStorageAdapter, memoryStorageAdapter,
  // errors
  AiError, AuthError, RateLimitError, UpstreamError,
  NetworkError, LocalEngineUnavailable, AbortError,
} from 'react-impai';

import type {
  Message, Role, ContentPart,
  StreamChunk, BaseResponse, TokenUsage,
  Adapter, ChatRequest,
  Engine, EngineConfig, OpenAIConfig, LocalConfig,
  ChatSession, StorageAdapter,
} from 'react-impai';
```

The Tailwind preset has its own subpath:

```ts
import preset from 'react-impai/preset';
```

## Compatibility

- React **18 or 19**
- Node **18+** (development)
- ESM + CJS dual output, `.d.ts` rolled up via `vite-plugin-dts`

## Development

```bash
npm install
npm run dev          # vite library build in watch mode
npm test             # vitest run
npm run storybook    # storybook on :6006
npm run build        # produces ./dist
npm run size         # size-limit gate
```

Project planning artifacts live alongside the code:

- [`idea.md`](./idea.md) — original concept
- [`spec/`](./spec/) — pre-implementation planning (PRD, architecture preview, API preview, DB preview, wireframes, milestones)
- [`_workspace/`](./_workspace/) — confirmed implementation contracts (architecture, API spec, schema, test plan, deploy guide)

## License

[MIT](./LICENSE) © 2026 react-impai contributors
