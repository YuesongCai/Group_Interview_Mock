import type { LLMProvider, AgentRole } from '@/lib/types';

export interface ProviderConfig {
  apiKey: string;
  baseURL: string;
  defaultModel: string;
  models: Record<string, string>; // alias -> actual model name
}

export interface ModelRouting {
  provider: LLMProvider;
  model: string;
  temperature: number;
  max_tokens: number;
}

// Default model routing per agent role
// Currently all agents route to GLM for initial bring-up
export const MODEL_ROUTING: Record<AgentRole, ModelRouting> = {
  orchestrator: {
    provider: 'glm',
    model: 'glm-4-flash',
    temperature: 0.3,
    max_tokens: 500,
  },
  participant: {
    provider: 'glm',
    model: 'glm-4-flash',
    temperature: 0.8,
    max_tokens: 200,
  },
  evaluator: {
    provider: 'glm',
    model: 'glm-4-flash',
    temperature: 0.2,
    max_tokens: 3000,
  },
  topic_generator: {
    provider: 'glm',
    model: 'glm-4-flash',
    temperature: 0.7,
    max_tokens: 800,
  },
  persona_generator: {
    provider: 'glm',
    model: 'glm-4-flash',
    temperature: 0.9,
    max_tokens: 1500,
  },
};

// Provider configurations loaded from env
export function getProviderConfigs(): Record<LLMProvider, ProviderConfig> {
  return {
    minimax: {
      apiKey: process.env.MINIMAX_API_KEY || '',
      baseURL: process.env.MINIMAX_BASE_URL || 'https://api.minimax.chat/v1',
      defaultModel: 'MiniMax-Text-01',
      models: {
        'default': 'MiniMax-Text-01',
        'fast': 'MiniMax-Text-01',
      },
    },
    deepseek: {
      apiKey: process.env.DEEPSEEK_API_KEY || '',
      baseURL: process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com/v1',
      defaultModel: 'deepseek-chat',
      models: {
        'default': 'deepseek-chat',
        'reasoning': 'deepseek-reasoner',
      },
    },
    glm: {
      apiKey: process.env.GLM_API_KEY || '',
      baseURL: process.env.GLM_BASE_URL || 'https://open.bigmodel.cn/api/paas/v4',
      defaultModel: 'glm-4-flash',
      models: {
        'default': 'glm-4-flash',
        'strong': 'glm-4',
      },
    },
  };
}
