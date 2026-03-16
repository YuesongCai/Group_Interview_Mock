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

// Fallback chain: GLM-only for initial bring-up (only GLM API key available)
const FALLBACK_CHAIN: LLMProvider[] = ['glm'];

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

  // Sanitize parameters — prevent NaN/invalid values from reaching the API.
  // Temperature ceiling 0.99: some providers (e.g. GLM) reject temperature >= 1.0.
  // max_tokens floor 10: some providers enforce a minimum token count.
  const safeTemperature = (typeof temperature === 'number' && !isNaN(temperature))
    ? Math.max(0.01, Math.min(0.99, temperature))
    : 0.7;
  const safeMaxTokens = (typeof max_tokens === 'number' && !isNaN(max_tokens) && max_tokens > 0)
    ? Math.max(10, Math.floor(max_tokens))
    : 1024;

  // Try primary provider, then fallback chain
  const providers = [provider, ...FALLBACK_CHAIN.filter(p => p !== provider)];

  for (const p of providers) {
    try {
      const client = getClient(p);
      // When falling back to a different provider, use that provider's default model
      const configs = getProviderConfigs();
      const actualModel = p === provider ? model : configs[p].defaultModel;

      console.log(`[LLM Gateway] Calling ${p}/${actualModel} for role=${role}, temp=${safeTemperature}, max_tokens=${safeMaxTokens}`);

      const completion = await client.chat.completions.create({
        model: actualModel,
        messages: messages.map(m => ({
          role: m.role,
          content: m.content,
        })),
        temperature: safeTemperature,
        max_tokens: safeMaxTokens,
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
      console.error(`LLM call failed for provider ${p} (role=${role}, model=${model}):`, error);
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

  const rawTemp = options?.temperature ?? routing.temperature;
  const rawMaxTokens = options?.max_tokens ?? routing.max_tokens;
  const safeTemp = (typeof rawTemp === 'number' && !isNaN(rawTemp))
    ? Math.max(0.01, Math.min(0.99, rawTemp))
    : 0.7;
  const safeMax = (typeof rawMaxTokens === 'number' && !isNaN(rawMaxTokens) && rawMaxTokens > 0)
    ? Math.max(10, Math.floor(rawMaxTokens))
    : 1024;

  const stream = await client.chat.completions.create({
    model,
    messages: messages.map(m => ({
      role: m.role,
      content: m.content,
    })),
    temperature: safeTemp,
    max_tokens: safeMax,
    stream: true,
  });

  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta?.content;
    if (delta) {
      yield delta;
    }
  }
}
