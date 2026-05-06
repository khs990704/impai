/**
 * <AiProvider> — root Context provider.
 *
 * Responsibilities (per _workspace/02_api_spec.md §A.1):
 *   1. Construct the right Adapter via discriminated union (`engine`).
 *   2. Inject a StorageAdapter (default: `localStorageAdapter`).
 *   3. Inject a QueryClient (default: a private one created lazily).
 *   4. Run security checks for OpenAI direct mode (NFR-5).
 *   5. Memoise the Context value so consumers re-render only when shape changes.
 */

import { useEffect, useMemo, useRef, type ReactNode } from 'react';
import {
  QueryClient,
  QueryClientProvider,
  useQueryClient,
} from '@tanstack/react-query';
import { OpenAIAdapter, LocalModelAdapter } from '@/adapters';
import { localStorageAdapter } from '@/storage';
import type { StorageAdapter } from '@/storage/StorageAdapter';
import type { OpenAIConfig, LocalConfig } from '@/types/config';
import type { Adapter } from '@/types/adapter';
import { AuthError } from '@/adapters/errors';
import { AiContext, type AiContextValue } from './AiContext';

export type AiProviderProps =
  | {
      engine: 'openai';
      config: OpenAIConfig;
      storage?: StorageAdapter;
      queryClient?: QueryClient;
      /** Default system prompt applied to all sessions under this provider. */
      systemPrompt?: string;
      children: ReactNode;
    }
  | {
      engine: 'local';
      config: LocalConfig;
      storage?: StorageAdapter;
      queryClient?: QueryClient;
      systemPrompt?: string;
      children: ReactNode;
    };

/**
 * Validate OpenAI security gate — see 02_api_spec.md §A.1 + NFR-5.
 * Throws synchronously so React surfaces the error in the nearest boundary.
 */
function assertOpenAiSecurity(config: OpenAIConfig): void {
  const hasApiKey = typeof config.apiKey === 'string' && config.apiKey.length > 0;
  const hasProxy = typeof config.proxyUrl === 'string' && config.proxyUrl.length > 0;
  const allowDirect = config.dangerouslyAllowBrowser === true;

  if (hasApiKey && !hasProxy && !allowDirect) {
    throw new AuthError(
      'Refusing to send apiKey from browser. Set proxyUrl or dangerouslyAllowBrowser:true.',
    );
  }

  if (!hasApiKey && !hasProxy) {
    const isProd =
      typeof process !== 'undefined' &&
      process.env !== undefined &&
      process.env['NODE_ENV'] === 'production';
    if (isProd) {
      throw new AuthError(
        'OpenAIConfig requires either apiKey + dangerouslyAllowBrowser:true, or proxyUrl.',
      );
    }
    // dev: warn so demos still work but the user is alerted.
    // eslint-disable-next-line no-console
    console.warn(
      '[@org/ai-react] OpenAIConfig has neither apiKey nor proxyUrl. Requests will fail.',
    );
  }
}

function assertLocalConfig(config: LocalConfig): void {
  if (!config.model || config.model.length === 0) {
    throw new Error('LocalConfig.model is required');
  }
}

/**
 * Inner provider — runs INSIDE the QueryClientProvider so it can pull the
 * (possibly user-supplied) client from context.
 */
function AiProviderInner(props: AiProviderProps): JSX.Element {
  const queryClient = useQueryClient();

  // Validate config eagerly. Cache the result by ref so we only throw once
  // per (engine, config) identity change.
  const validatedRef = useRef<AiProviderProps['config'] | null>(null);
  if (validatedRef.current !== props.config) {
    if (props.engine === 'openai') {
      assertOpenAiSecurity(props.config);
    } else {
      assertLocalConfig(props.config);
    }
    validatedRef.current = props.config;
  }

  // Memoise adapter — a new instance only when config object identity changes.
  // Consumers should pass a stable config (useMemo or module-level const).
  const adapter = useMemo<Adapter>(() => {
    if (props.engine === 'openai') {
      return new OpenAIAdapter(props.config);
    }
    return new LocalModelAdapter(props.config);
  }, [props.engine, props.config]);

  const storage = props.storage ?? localStorageAdapter;

  const contextValue = useMemo<AiContextValue>(() => {
    const value: AiContextValue = {
      engine: props.engine,
      adapter,
      storage,
      queryClient,
      config: props.config,
      _debug: { adapterId: adapter.id },
    };
    if (props.systemPrompt !== undefined) {
      value.systemPrompt = props.systemPrompt;
    }
    return value;
  }, [props.engine, adapter, storage, queryClient, props.config, props.systemPrompt]);

  // Flush pending storage writes on unmount (per 03_db_schema.md §9.2).
  useEffect(() => {
    return () => {
      void storage.flush?.();
    };
  }, [storage]);

  return <AiContext.Provider value={contextValue}>{props.children}</AiContext.Provider>;
}

/**
 * Public entry. Auto-creates a QueryClient when none is provided.
 * The created client lives for the Provider's lifetime.
 */
export function AiProvider(props: AiProviderProps): JSX.Element {
  const internalClientRef = useRef<QueryClient | null>(null);
  if (props.queryClient === undefined && internalClientRef.current === null) {
    internalClientRef.current = new QueryClient({
      defaultOptions: {
        // Streaming mutations should not retry by default — adapters handle 429.
        mutations: { retry: false },
        queries: { retry: false, refetchOnWindowFocus: false },
      },
    });
  }
  const client = props.queryClient ?? internalClientRef.current;
  if (client === null) {
    throw new Error('Failed to initialise QueryClient.');
  }

  return (
    <QueryClientProvider client={client}>
      <AiProviderInner {...props} />
    </QueryClientProvider>
  );
}
