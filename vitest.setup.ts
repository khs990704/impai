import '@testing-library/jest-dom/vitest';
import { afterAll, afterEach, beforeAll } from 'vitest';
import { server } from './test/msw/server';

/**
 * MSW server wired here so every test (unit + integration) can rely on the
 * default handler bundle. Tests that need bespoke responses can call
 * `server.use(...)` and the `afterEach` reset will restore the defaults.
 *
 * `onUnhandledRequest: 'warn'` is intentional — adapter unit tests inject
 * a mocked `fetch` that bypasses MSW; we don't want to fail them when MSW
 * sees an unrelated jsdom fetch (e.g. axe rule fetching aria docs).
 */
beforeAll(() => {
  server.listen({ onUnhandledRequest: 'warn' });
});

afterEach(() => {
  server.resetHandlers();
});

afterAll(() => {
  server.close();
});
