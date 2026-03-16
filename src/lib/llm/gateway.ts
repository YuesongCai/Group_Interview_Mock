import OpenAI from 'openai';
import type { LLMProvider, LLMMessage, LLMRequestOptions, LLMResponse, AgentRole } from '@/lib/types';
import { MODEL_ROUTING, getProviderConfigs } from './types';

// Cache OpenAI clients per provider
const clients = new Map<LLMProvider, OpenAI>();

function getClient(provider: LLMProvider): OpenAI {
  if (clients.has(provider)) {
    return clients.get(provider)!;
  }

  const configs = getProviderConfigs();
  const config = configs[provider];

  if (!config.apiKey) {
    throw new Error(`API key not configured for provider: ${provider}`);
  }

  const client = new OpenAI({
    apiKey: config.apiKey,
    baseURL: config.baseURL,
  });

  clients.set(provider, client);
  return client;
}

// Fallback chain: minimax -> deepseek -> glm
const FALLBACK_CHAIN: LLMProvider[] = ['minimax', 'deepseek', 'glm'];

/**
 * LLM Gateway - unified interface for all LLM providers.
 * All providers use OpenAI-compatible APIs.
 */
export async function llmComplete(
  messages: LLMMessage[],
  role: AgentRole,
  options?: LLMRequestOptions
): Promise<LLMResponse> {
  const routing = MODEL_ROUTING[role];
  const provider = options?.provider || routing.provider;
  const model = options?.model || routing.model;
  const temperature = options?.temperature ?? routing.temperature;
  const max_tokens = options?.max_tokens ?? routing.max_tokens;

  // Try primary provider, then fallback chain
  const providers = [provider, ...FALLBACK_CHAIN.filter(p => p !== provider)];

  for (const p of providers) {
    try {
      const client = getClient(p);
      const actualModel = p === provider ? model : MODEL_ROUTING[role].model;

      const completion = await client.chat.completions.create({
        model: actualModel,
        messages: messages.map(m => ({
          role: m.role,
          content: m.content,
        })),
        temperature,
        max_tokens,
      });

      const choice = completion.choices[0];
      return {
        content: choice?.message?.content || '',
        usage: completion.usage ? {
          prompt_tokens: completion.usage.prompt_tokens,
          completion_tokens: completion.usage.completion_tokens,
          total_tokens: completion.usage.total_tokens,
        } : undefined,
      };
    } catch (error) {
      console.error(`LLM call failed for provider ${p}:`, error);
      // Try next provider in fallback chain
      continue;
    }
  }

  throw new Error('All LLM providers failed');
}

/**
 * Stream LLM response for real-time delivery.
 */
export async function* llmStream(
  messages: LLMMessage[],
  role: AgentRole,
  options?: LLMRequestOptions
): AsyncGenerator<string> {
  const routing = MODEL_ROUTING[role];
  const provider = options?.provider || routing.provider;
  const model = options?.model || routing.model;

  const client = getClient(provider);

  const stream = await client.chat.completions.create({
    model,
    messages: messages.map(m => ({
      role: m.role,
      content: m.content,
    })),
    temperature: options?.temperature ?? routing.temperature,
    max_tokens: options?.max_tokens ?? routing.max_tokens,
    stream: true,
  });

  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta?.content;
    if (delta) {
      yield delta;
    }
  }
}
