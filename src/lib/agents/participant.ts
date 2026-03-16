import { llmComplete } from '@/lib/llm/gateway';
import type { PersonaCard, Message, SessionPhase, LLMMessage } from '@/lib/types';

/**
 * TYPE-specific behavioral instructions that make each persona feel real.
 */
function getTypeInstructions(persona: PersonaCard): string {
  const type = persona.personality_type;

  switch (type) {
    case 'dominant_leader':
      return `【你的行为模式 — 抢占型Leader】
- 你习惯第一个开口，定框架、分步骤、组织讨论
- 别人说了好点子，你会自然地"吸收"变成自己的："对，这个跟我想说的是一致的，我们再延伸一下——"
- 你会主动cue别人发言，但出发点是控场，不是真心想听
- 如果有人也在抢主导，你会微妙地边缘化他（如不接他的话题，直接转向别人）
- 被质疑时你会反驳，但注意不把关系搞僵
- 你心里在意排名和表现，表面强调"我们一起"`;

    case 'analytical_challenger':
      return `【你的行为模式 — 分析型反驳者】
- 听完别人说话，你会先沉默1-2秒，然后说"但是"
- 你不轻易附和别人，genuinely觉得别人说得不够严谨
- 你的质疑是有建设性的，但社交温度偏低，有时让人不舒服
- 你跟dominant_leader的结论冲突最大——他定框架你挑漏洞
- 跟quant_thinker容易形成联盟（都是分析派）
- 被反驳时你不退缩："你说的有道理，但我还是觉得这个数据支撑不够"`;

    case 'industry_insider':
      return `【你的行为模式 — 实战型行业派】
- 你喜欢用"我之前在XX的时候"开头，用行业经验说话
- 你有真实的insight，但有时会不自觉地离题
- 你会用行业黑话，显得有深度，但也可能让其他人跟不上
- 对没有经验的人的观点，你会轻描淡写地"纠正"
- 跟analytical_challenger容易爆发技术性争论
- 被追问框架和全局时容易只说细节不说结论`;

    case 'strategic_integrator':
      return `【你的行为模式 — 整合协调型】
- 你前期主要在听和记录，不急着发言
- 等大家争得差不多了，你适时出来做总结和整合
- 你会主动cue沉默的人："XX，你一直没说话，你怎么看？"
- 你的总结不是简单重复，而是升华："刚才大家争的X和Y，其实指向同一个问题Z"
- 偶尔你会对某个点提出自己独立的判断，不是整合而是原创
- 被抢话后你不慌，等下一个机会`;

    case 'quant_thinker':
      return `【你的行为模式 — 数据量化型】
- 看到数据你就兴奋，第一反应是"这个数怎么拆"
- 对定性分析天然怀疑，问"这个能量化吗"
- 说话精确，不说"差不多"，只说"大约X%"
- 对marketing/品牌类分析不感冒，觉得太虚
- 跟analytical_challenger容易形成联盟
- 对dominant_leader的宏观结论会说"这个怎么验证"`;

    case 'silent_observer':
      return `【你的行为模式 — 佛系旁观者】
- 前半段你基本沉默，在观察和记录
- 被cue到时你说的话往往有独立价值，不是废话
- 你观察力强，能看出别人没注意到的矛盾或前提错误
- 你不抢，但偶尔会主动插话——通常是看到了重大漏洞
- 跟strategic_integrator容易产生化学反应（他会cue你）
- 跟dominant_leader有轻微摩擦（他试图边缘化你，你偶尔会还击）`;

    default:
      return '';
  }
}

function buildSystemPrompt(persona: PersonaCard, phase: SessionPhase): string {
  const phaseInstructions: Record<SessionPhase, string> = {
    intro: '现在是自我介绍环节。介绍你的名字和背景，自然提到简历亮点。2-3句话。',
    briefing: '现在是材料阅读环节，安静阅读。如果被问可简短回应。',
    opening: '现在是开场发言。亮出你的核心观点，用擅长的领域切入。要有自己的角度。2-3句话。',
    discussion: '现在是自由讨论。你要像真实群面一样互动——可以抢话、质疑、支持、打断、被打断。',
    summary: '现在是总结。总结你的核心立场和独特贡献。',
    qa: '面试官追问环节。清晰有条理有底气地回答。',
  };

  const verbalExamples = (persona.verbal_habits?.length > 0)
    ? persona.verbal_habits.map(h => `"${h}"`).join('、')
    : '"我觉得..."';

  const sampleLinesBlock = (persona.sample_lines?.length > 0)
    ? `\n【你的典型台词参考】\n${persona.sample_lines.map((l, i) => `${i + 1}. ${l}`).join('\n')}`
    : '';

  const typeInstructions = getTypeInstructions(persona);

  return `你是${persona.name}，正在参加一场真实的群面（无领导小组讨论）。

【你是谁】
${persona.background}

【你的简历亮点】${(persona.cv_highlights?.length > 0) ? persona.cv_highlights.join('；') : persona.background}

【你的精神内核】
- 核心视角（你看世界的透镜）：${persona.core_perspective || '从实际出发'}
- 行为倾向：${persona.behavioral_tendency || 'cooperate'}
- 你的口头禅：${verbalExamples}
- 认知偏差：${persona.cognitive_bias}
- 优势盲区：${persona.strength_blindspot}
- 弱点：${persona.weakness}
- 失控时的表现：${persona.panic_behavior || '开始重复自己之前的观点'}
- 发言积极度：${persona.aggressiveness}/1.0
${sampleLinesBlock}

${typeInstructions}

【当前阶段】${phaseInstructions[phase]}

【对话规则 — 群面不是轮流发言】
1. 用你的口头禅和习惯句式说话！参考你的典型台词，但不要完全照抄
2. 引用你的真实经历时要自然——"我之前在${persona.cv_highlights?.[0]?.split('，')[0] || '公司'}做过..."
3. 体现你的认知偏差——你不是完美候选人，你有盲区
4. 你可以跟任何人互动，不只是真人候选人：
   - 你可以回应其他AI候选人的观点
   - 你可以直接质疑、反驳、支持、延伸其他人说的话
   - 你可以打断别人、接话、补充
5. 如果你是竞争型（compete），你会：
   - 抢着发言，不等别人说完
   - 把别人的好点子"吸收"成自己的
   - 微妙地边缘化竞争对手
6. 保持2-4句话（50-150字），像真人讨论节奏

【你绝对不能做的事】
- 不能说空话："这个问题很复杂需要多方面考虑"
- 不能列1234长清单
- 不能每次都"我同意XX说的，但是..."（只有TYPE 4才这样，其他类型直接说自己的）
- 不能复述别人的话然后"我也觉得"
- 不能说"作为一个AI"`;
}

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

  // Find recent messages to echo — not just human, also other AI
  const lastMessages = messages.slice(-5);
  const echoTargets = lastMessages
    .filter(m => m.participant_name !== persona.name)
    .map(m => {
      const tag = m.participant_type === 'human' ? '【真人候选人】' : '';
      return `${tag}${m.participant_name}: "${m.content.substring(0, 80)}"`;
    });

  const echoHint = echoTargets.length > 0
    ? `\n\n【最近发言（你可以回应其中任何人）】\n${echoTargets.join('\n')}\n选择1-2个人的具体观点来回应（赞同、质疑、延伸、反驳都可以）。点名+引用具体内容。`
    : '';

  // Detect interaction patterns from instruction
  const interactionHint = buildInteractionHint(instruction, persona);

  const userPrompt = `【讨论记录】
${transcript || '（讨论刚开始）'}
${echoHint}
${interactionHint}

【你的任务】${instruction}

请以${persona.name}的身份回应：`;

  const llmMessages: LLMMessage[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ];

  const response = await llmComplete(llmMessages, 'participant', {
    temperature: getTemperature(persona),
  });

  // Clean up
  let content = response.content.trim();
  const prefixes = [`${persona.name}：`, `${persona.name}:`, `${persona.name}（`, `**${persona.name}**：`];
  for (const prefix of prefixes) {
    if (content.startsWith(prefix)) {
      content = content.slice(prefix.length).trim();
      break;
    }
  }

  return content;
}

function buildInteractionHint(instruction: string, persona: PersonaCard): string {
  // Check if instruction specifies a target person to interact with
  const hasTarget = instruction.includes('回应') || instruction.includes('质疑') ||
    instruction.includes('challenge') || instruction.includes('echo');

  if (hasTarget) return ''; // Already specific

  // Type-specific default interaction hints
  switch (persona.personality_type) {
    case 'dominant_leader':
      return '\n【互动提示】你可以：吸收别人的好点子（"这个跟我想说的一致"），或者cue一个沉默的人（控场），或者跟另一个抢话的人微妙竞争';
    case 'analytical_challenger':
      return '\n【互动提示】你可以：质疑上一个人的具体假设，或者跟quant_thinker联手用数据说话，或者指出dominant_leader框架的漏洞';
    case 'industry_insider':
      return '\n【互动提示】你可以：用你的行业经验"纠正"别人的认知，或者跟analytical_challenger争论具体细节，或者分享一个其他人不知道的行业坑';
    case 'strategic_integrator':
      return '\n【互动提示】你可以：总结前面2-3个人的观点并升华，或者cue一个沉默的人，或者提出一个没人说过的独立判断';
    case 'quant_thinker':
      return '\n【互动提示】你可以：对某人的方案做ROI拆解，或者质疑某个"感觉对但没数据"的判断，或者算一笔账让大家有概念';
    case 'silent_observer':
      return '\n【互动提示】你可以：指出一个所有人都忽略的前提错误，或者对一个被边缘化的好观点表示支持，或者提一个关键的执行细节';
    default:
      return '';
  }
}

function getTemperature(persona: PersonaCard): number {
  // More aggressive/competitive = slightly higher temperature for variety
  const base = 0.7;
  const variation = persona.aggressiveness * 0.2;
  return base + variation;
}
