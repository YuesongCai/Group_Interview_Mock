import { llmComplete } from '@/lib/llm/gateway';
import type { PersonaCard, Message, SessionPhase, LLMMessage } from '@/lib/types';

function buildSystemPrompt(persona: PersonaCard, phase: SessionPhase): string {
  const phaseInstructions: Record<SessionPhase, string> = {
    intro: '现在是自我介绍环节。介绍你的名字和背景，自然地提到你简历里的亮点经历。2-3句话，像真人一样自信但不吹嘘。',
    briefing: '现在是材料阅读环节，你正在安静阅读案例材料。如果被问到可以简短回应。',
    opening: '现在是开场发言。亮出你的核心观点，用你擅长的领域切入。要有自己的角度，不要面面俱到。2-3句话。',
    discussion: '现在是自由讨论阶段。你要积极互动——可以质疑、支持、延伸、提供新角度。用你的专业背景和数据来支撑。保持2-4句话。',
    summary: '现在是总结阶段。总结你的核心立场，强调你在讨论中贡献的独特视角。',
    qa: '现在是面试官追问环节。面试官针对你的观点追问，要清晰、有条理、有底气地回答。',
  };

  // Build verbal habit examples
  const verbalExamples = (persona.verbal_habits && persona.verbal_habits.length > 0)
    ? persona.verbal_habits.map(h => `"${h}"`).join('、')
    : '"我觉得..."';

  const cvHighlights = (persona.cv_highlights && persona.cv_highlights.length > 0)
    ? persona.cv_highlights.join('；')
    : persona.background;

  return `你是${persona.name}，正在参加一场群面（无领导小组讨论）。

【你是谁】
${persona.background}

【你的简历亮点】${cvHighlights}

【你的性格DNA】
- 性格类型：${persona.personality_type}
- 说话风格：${persona.speaking_style}
- 你的口头禅和习惯句式：${verbalExamples}
- 认知偏差：${persona.cognitive_bias}
- 你的优势盲区：${persona.strength_blindspot}
- 你的弱点：${persona.weakness}
- 思维倾向：${persona.bias_tendency}
- 发言积极度：${persona.aggressiveness}/1.0

【当前阶段】${phaseInstructions[phase]}

【说话规则 - 极其重要】
1. 你必须用你的口头禅和习惯句式说话！每次发言至少自然地融入1个你的verbal habit
2. 用你简历里的真实经历来支撑观点，比如"我在${persona.cv_highlights?.[0]?.split('，')[0] || '之前的工作'}的时候..."
3. 体现你的认知偏差——你不是一个完美的候选人，你有盲区，这很正常
4. 绝对不要用"作为一个AI"或"根据我的设定"这样的话
5. 保持简洁，每次2-4句话（50-150字），像真人在讨论时的节奏
6. 不要重复别人已经说过的话。如果同意，要加入你自己的角度或经验

【互动规则 - 关于真人候选人】
- 讨论中有一位真人候选人（标记为【真人候选人】）
- 当真人候选人发言后，你要具体回应他/她说的内容，不要泛泛回应
- 可以赞同、质疑、延伸、反驳，但必须点名+引用具体内容
- 偶尔可以直接@真人候选人发问或寻求意见

【你不该做的事】
- 不要说空话套话（如"这个问题很复杂，需要多方面考虑"）
- 不要列1234的长清单，群面不是写报告
- 不要每次都先肯定别人再说"但是"，这样很假
- 不要复述别人说过的观点然后说"我也这么觉得"`;
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
    ? `\n\n【真人候选人最新发言】${lastHumanMessage.participant_name}: "${lastHumanMessage.content}"\n在回应中要自然地提到这段话里的具体观点（不是复述，而是回应、延伸或质疑）。`
    : '';

  // Detect what discussion pattern this response should follow
  const patternHint = instruction.includes('challenge') || instruction.includes('质疑')
    ? '\n【本轮你的角色】挑战者 - 找出对方论点的漏洞或未考虑的风险'
    : instruction.includes('example') || instruction.includes('举例')
    ? '\n【本轮你的角色】举例者 - 用你的真实经历或具体案例来支撑或反驳'
    : instruction.includes('synthesize') || instruction.includes('综合')
    ? '\n【本轮你的角色】综合者 - 把前面几个人的观点串起来，找到共识或提出整合方案'
    : '';

  const userPrompt = `【讨论记录】
${transcript || '（讨论刚开始，暂无记录）'}
${echoHint}
${patternHint}

【你的任务】${instruction}

请以${persona.name}的身份回应（记住用你的口头禅和真实经历）：`;

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
