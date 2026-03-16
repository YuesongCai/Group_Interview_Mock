import { llmComplete } from '@/lib/llm/gateway';
import type { PersonaCard, Message, SessionPhase, LLMMessage } from '@/lib/types';

function buildSystemPrompt(persona: PersonaCard, phase: SessionPhase): string {
  const phaseInstructions: Record<SessionPhase, string> = {
    opening: '现在是开场阶段，请简要阐述你对话题的初步看法，2-3句话即可。',
    discussion: '现在是自由讨论阶段，你可以同意、反对、补充或提出新的角度。保持简洁有力，2-4句话。',
    summary: '现在是总结阶段，请简要总结你在这次讨论中的核心观点和立场。',
  };

  return `你是${persona.name}，正在参加一场群面（无领导小组讨论）。

【你的背景】${persona.background}
【性格类型】${persona.personality_type}
【说话风格】${persona.speaking_style}
【思维倾向】${persona.bias_tendency}
【知识特点】${persona.knowledge_depth}
【攻击性】${persona.aggressiveness}/1.0（数值越高越主动发言和打断）

【当前阶段】${phaseInstructions[phase]}

【角色扮演规则】
1. 始终保持角色一致性，用符合你性格的方式说话
2. 可以引用你背景中的经验来支撑观点
3. 回应要自然、口语化，像真人在讨论
4. 不要用"作为一个AI"或"根据我的设定"这样的话
5. 保持简洁，每次发言2-4句话（约50-150字）
6. 不要重复别人已经说过的观点，而是延伸或挑战`;
}

/**
 * Generate a response from an AI participant.
 */
export async function generateParticipantResponse(
  persona: PersonaCard,
  messages: Message[],
  phase: SessionPhase,
  instruction: string
): Promise<string> {
  const systemPrompt = buildSystemPrompt(persona, phase);

  // Build conversation context (sliding window: last 20 messages)
  const recentMessages = messages.slice(-20);
  const transcript = recentMessages
    .map(m => {
      const prefix = m.participant_type === 'human' ? '【真人候选人】' : '';
      return `${prefix}${m.participant_name}: ${m.content}`;
    })
    .join('\n');

  const userPrompt = `【讨论记录】
${transcript || '（讨论刚开始，暂无记录）'}

【你的任务】${instruction}

请以${persona.name}的身份回应：`;

  const llmMessages: LLMMessage[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ];

  const response = await llmComplete(llmMessages, 'participant', {
    temperature: getTemperature(persona),
  });

  // Clean up response - remove any self-referential prefix like "陈思远："
  let content = response.content.trim();
  const namePrefix = `${persona.name}：`;
  const namePrefixAlt = `${persona.name}:`;
  if (content.startsWith(namePrefix)) {
    content = content.slice(namePrefix.length).trim();
  } else if (content.startsWith(namePrefixAlt)) {
    content = content.slice(namePrefixAlt.length).trim();
  }

  return content;
}

function getTemperature(persona: PersonaCard): number {
  // Higher aggressiveness = slightly higher temperature for more varied responses
  const base = 0.7;
  const variation = persona.aggressiveness * 0.2;
  return base + variation;
}
