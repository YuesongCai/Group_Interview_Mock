import { llmComplete } from '@/lib/llm/gateway';
import type { PersonaCard, Message, SessionPhase, LLMMessage } from '@/lib/types';

function buildSystemPrompt(persona: PersonaCard, phase: SessionPhase): string {
  const phaseInstructions: Record<SessionPhase, string> = {
    intro: '现在是自我介绍环节。请简要介绍你的名字、教育背景和相关工作经验。2-3句话，自然大方。',
    briefing: '现在是材料阅读环节，你正在安静阅读案例材料。如果被问到可以简短回应。',
    opening: '现在是开场发言阶段，请简要阐述你对案例的初步分析和核心观点，2-3句话即可。',
    discussion: '现在是自由讨论阶段，你可以同意、反对、补充或提出新的角度。保持简洁有力，2-4句话。',
    summary: '现在是总结阶段，请简要总结你在这次讨论中的核心观点和立场。',
    qa: '现在是面试官追问环节。面试官可能会针对你的观点追问，请清晰有条理地回答。',
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
6. 不要重复别人已经说过的观点，而是延伸或挑战

【互动规则 - 极其重要】
- 讨论中有一位真人候选人（标记为【真人候选人】），你必须特别关注他/她的发言
- 当真人候选人发言后，你必须在回应中明确提到他/她的名字并引用他/她说的具体内容
- 例如："${persona.name === '陈思远' ? '刚才小明' : '刚才'}提到了XXX，我觉得这个角度很好，不过..."、"你说的YYY让我想到..."、"我同意你关于ZZZ的看法，但我想补充..."
- 不要泛泛回应，要让真人候选人感觉到你在认真听他/她说话
- 可以赞同、质疑、延伸、反驳真人候选人的观点，但必须具体点名内容
- 偶尔可以直接@真人候选人的名字发问或寻求意见`;
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

  // Extract the most recent human message for emphasis
  const lastHumanMessage = [...messages].reverse().find(m => m.participant_type === 'human');
  const echoHint = lastHumanMessage
    ? `\n\n【重要 - 真人候选人最新发言】${lastHumanMessage.participant_name}: "${lastHumanMessage.content}"\n你必须在回应中提到"${lastHumanMessage.participant_name}"的名字，并引用其中的具体观点或关键词。`
    : '';

  const userPrompt = `【讨论记录】
${transcript || '（讨论刚开始，暂无记录）'}
${echoHint}

【你的任务】${instruction}

请以${persona.name}的身份回应：`;

  const llmMessages: LLMMessage[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ];

  const response = await llmComplete(llmMessages, 'participant', {
    temperature: getTemperature(persona),
  });

  // Clean up response — remove any self-referential prefix
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
  const base = 0.7;
  const variation = persona.aggressiveness * 0.2;
  return base + variation;
}
