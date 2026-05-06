/**
 * MSW server wired into vitest setup.
 *
 * Composes the OpenAI + Ollama handler bundles so integration tests can call
 * `import { server } from 'test/msw/server'` and `server.use(...)` to layer
 * test-local handlers over the defaults.
 *
 * Lifecycle is owned by `vitest.setup.ts`:
 *   beforeAll → server.listen({ onUnhandledRequest: 'error' })
 *   afterEach → server.resetHandlers()
 *   afterAll  → server.close()
 */

import { setupServer } from 'msw/node';
import { openaiHandlers } from './openai';
import { ollamaHandlers } from './ollama';

export const server = setupServer(...openaiHandlers, ...ollamaHandlers);
