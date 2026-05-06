/**
 * Engine configuration types.
 *
 * Canonical definition per _workspace/03_db_schema.md §2.4.
 */

export interface OpenAIConfig {
  /** Direct call mode only. Ignored when `proxyUrl` is set. */
  apiKey?: string;
  /** Recommended. Forwards a Chat Completions-compatible body to the user's backend. */
  proxyUrl?: string;
  /** Required `true` to allow direct browser calls with `apiKey`. */
  dangerouslyAllowBrowser?: boolean;
  /** default: 'gpt-4o-mini' */
  model?: string;
  /** default: 0.7 */
  temperature?: number;
  maxTokens?: number;
  /** Extra headers (e.g. proxy auth). */
  headers?: Record<string, string>;
}

export interface LocalConfig {
  /** default: 'http://localhost:11434' */
  baseUrl?: string;
  /** Ollama model tag (e.g. 'llama3', 'qwen2.5:7b'). Required. */
  model: string;
  temperature?: number;
  /** Ollama keep_alive parameter, e.g. '5m'. */
  keepAlive?: string;
}

export type Engine = 'openai' | 'local';

export type EngineConfig =
  | { engine: 'openai'; config: OpenAIConfig }
  | { engine: 'local'; config: LocalConfig };
