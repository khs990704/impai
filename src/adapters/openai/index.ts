/**
 * OpenAI adapter barrel.
 *
 * The class is the primary export. Note that 0.1.0 does NOT publish a deep
 * import path (`impai/adapters/openai`) — see
 * `_workspace/01_architecture.md` §8. Tree-shaking from the main barrel is
 * sufficient.
 */

export { OpenAIAdapter } from './OpenAIAdapter';
