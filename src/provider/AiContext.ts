/**
 * Internal Context for AiProvider.
 *
 * NOT exported from `src/index.ts`. Consumers should compose with
 * `useAiChat`/`useAiSummary`. Direct access via `useAiContext` is reserved
 * for hook implementations inside this package.
 */

import { createContext, useContext } from 'react';
import type { QueryClient } from '@tanstack/react-query';
import type { Adapter } from '@/types/adapter';
import type { OpenAIConfig, LocalConfig, Engine } from '@/types/config';
import type { StorageAdapter } from '@/storage/StorageAdapter';

export interface AiContextValue {
  engine: Engine;
  adapter: Adapter;
  storage: StorageAdapter;
  queryClient: QueryClient;
  /** Active config, narrowed via `engine` discriminator at call sites. */
  config: OpenAIConfig | LocalConfig;
  /** Optional system prompt prepended to outgoing requests. */
  systemPrompt?: string;
  _debug?: { lastError?: Error; adapterId: string };
}

export const AiContext = createContext<AiContextValue | null>(null);

/**
 * Internal hook. Throws when called outside `<AiProvider>`.
 *
 * Public hooks (`useAiChat`, `useAiSummary`) should use this; consumers should
 * not import it directly (it is not re-exported from `src/index.ts`).
 */
export function useAiContext(): AiContextValue {
  const ctx = useContext(AiContext);
  if (ctx === null) {
    throw new Error(
      '`useAiChat`/`useAiSummary` must be used inside <AiProvider>. ' +
        'Wrap your tree with <AiProvider engine="openai" config={{...}}>.',
    );
  }
  return ctx;
}
