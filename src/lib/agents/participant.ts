import { llmComplete } from '@/lib/llm/gateway';
import type { PersonaCard, Message, SessionPhase, LLMMessage } from '@/lib/types';

/**
 * TYPE-specific behavioral instructions.
 */
function getTypeInstructions(persona: PersonaCard): string {
  const type = persona.personality_type;

  switch (type) {
    case 'dominant_leader':
      return `【你的行为模式 — 抢占型Leader】
- 你习惯第一个开口，定框架、分步骤
- 别人的好点子你会"吸收"："对，这个跟我想说的一致——"
- 你会cue别人发言，但出发点是控场
- 被质疑时反驳但不搞僵关系`;

    case 'analytical_challenger':
      return `【你的行为模式 — 分析型反驳者】
- 听完别人说话沉默两秒然后说"但是"
- 你genuinely觉得别人不够严谨
- 社交温度低，说得对但让人不舒服
- 跟dominant_leader冲突最大`;

    case 'industry_insider':
      return `【你的行为模式 — 实战型行业派】
- 用"我之前在XX做过"开头
- 有真实insight但会离题
- 对没经验的人会轻描淡写地"纠正"
- 跟analytical_challenger容易爆发技术争论`;

    case 'strategic_integrator':
      return `【你的行为模式 — 整合协调型】
- 前期听和记录，不急着发言
- 适时出来整合升华，不是重复
- 会主动cue沉默的人
- 偶尔有独立判断让人惊喜`;

    case 'quant_thinker':
      return `【你的行为模式 — 数据量化型】
- 第一反应是"这个数怎么拆"
- 对定性分析天然怀疑
- 说话精确，不说"差不多"
- 对dominant_leader的宏观结论问"这个怎么验证"`;

    case 'silent_observer':
      return `【你的行为模式 — 佛系旁观者】
- 前半段沉默，观察和记录
- 被cue到时说的话有独立价值
- 能看出别人没注意到的矛盾
- 偶尔主动插话——通常是看到重大漏洞`;

    default:
      return '';
  }
}

function buildSystemPrompt(persona: PersonaCard, phase: SessionPhase): string {
  const phaseInstructions: Record<SessionPhase, string> = {
    intro: '自我介绍。名字+背景+一个亮点。2句话。',
    briefing: '安静阅读。被问可简短回应。',
    opening: '开场发言。1个核心观点，用擅长角度切入。2-3句。',
    discussion: '自由讨论。像真人一样互动——质疑、打断、追问。',
    summary: '总结你的核心立场。3句话以内。',
    qa: '面试官追问。清晰有底气地回答。',
  };

  const verbalExamples = (persona.verbal_habits?.length > 0)
    ? persona.verbal_habits.map(h => `"${h}"`).join('、')
    : '"我觉得..."';

  const typeInstructions = getTypeInstructions(persona);

  return `你是${persona.name}，正在参加群面。

【你是谁】${persona.background}
【简历亮点】${(persona.cv_highlights?.length > 0) ? persona.cv_highlights.join('；') : persona.background}
【核心视角】${persona.core_perspective || '从实际出发'}
【口头禅】${verbalExamples}
【认知偏差】${persona.cognitive_bias}
【弱点】${persona.weakness}
【失控表现】${persona.panic_behavior || '重复自己的观点'}

${typeInstructions}

【当前阶段】${phaseInstructions[phase]}

${'='.repeat(60)}
【发言格式 —— 这是最重要的规则，必须严格遵守】
${'='.repeat(60)}

你的发言必须是2-4句短句，总共不超过80字。结构如下：

第1句：直接回应上一个人说的具体内容（不是"我同意XX"，而是针对他说的具体观点追问/反驳/延伸）
第2-3句：你自己的新增点，必须包含具体信息（数字、案例结论、行业洞察）
最后1句：抛出一个问题或钩子，留给下一个人接

【示例——好的发言】
"林雨桐，你说社区互动ROI高——但ROI怎么量？conversion path是什么？我在宝洁做抖音时发现KOL用户留存比自播低30%，这里可能有类似的问题。"

【示例——坏的发言（绝对禁止）】
"我非常认同林雨桐的观点，社区互动确实很重要。作为技术专家，我认为我们可以通过技术手段来提升社区互动的效果。正如我在华为研发智能语音识别系统时的经验，技术对于用户体验至关重要......"

${'='.repeat(60)}

【绝对禁止 —— 违反任何一条都算失败】
❌ 发言超过80字或超过4句话
❌ 以"我非常认同XX的观点"开头（这是假echo）
❌ 提到自己的经历但没给出具体结论/数字/洞察（"我在华为深刻体会到技术的重要性"= 废话）
❌ 说完一大段没有问任何人任何问题
❌ 列1234清单
❌ 原封不动重复别人已经说过的观点
❌ 说"这个问题很复杂需要多方面考虑"

【CV引用规则——只有能产生具体洞察时才引用】
✅ 正确："我在字节看过类似数据——高端社区活跃度跟活动频率关系不大，跟议题相关性关系很大"
❌ 错误："我在华为做语音识别时，深刻体会到技术的重要性"
区别：正确的引用给出了一个具体结论，错误的引用只是在堆背景`;
}

export async function generateParticipantResponse(
  persona: PersonaCard,
  messages: Message[],
  phase: SessionPhase,
  instruction: string
): Promise<string> {
  const systemPrompt = buildSystemPrompt(persona, phase);

  // Sliding window: last 15 messages
  const recentMessages = messages.slice(-15);
  const transcript = recentMessages
    .map(m => {
      const prefix = m.participant_type === 'human' ? '【真人】' : '';
      return `${prefix}${m.participant_name}: ${m.content}`;
    })
    .join('\n');

  // Find the specific message this person should respond to
  const lastOtherMsg = [...messages].reverse().find(m => m.participant_name !== persona.name);
  const responseTarget = lastOtherMsg
    ? `\n【你必须回应的具体内容】${lastOtherMsg.participant_name}说："${lastOtherMsg.content.substring(0, 100)}"\n→ 你的第1句话必须直接针对这段话的某个具体观点（追问/反驳/延伸），不能跳过。`
    : '';

  // Detect the current "open question" — what hasn't been resolved yet
  const openQuestion = findOpenQuestion(messages);
  const progressHint = openQuestion
    ? `\n【当前未解决的分歧】${openQuestion}\n→ 你必须推进这个分歧（正面回应、提供数据、或者提出新角度），不能绕开说别的话题。`
    : '';

  const userPrompt = `【讨论记录】
${transcript || '（讨论刚开始）'}
${responseTarget}
${progressHint}

【你的任务】${instruction}

用2-4句短句回应（不超过80字），最后留一个问题或钩子：`;

  const llmMessages: LLMMessage[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ];

  const response = await llmComplete(llmMessages, 'participant', {
    temperature: getTemperature(persona),
    max_tokens: 256, // Hard cap to prevent long speeches
  });

  // Clean up — remove name prefix
  let content = response.content.trim();
  const prefixes = [`${persona.name}：`, `${persona.name}:`, `${persona.name}（`, `**${persona.name}**：`];
  for (const prefix of prefixes) {
    if (content.startsWith(prefix)) {
      content = content.slice(prefix.length).trim();
      break;
    }
  }

  // Truncate if still too long (over ~120 chars in Chinese ≈ too wordy)
  if (content.length > 200) {
    // Find the last sentence ending before 200 chars
    const truncated = content.substring(0, 200);
    const lastEnd = Math.max(
      truncated.lastIndexOf('。'),
      truncated.lastIndexOf('？'),
      truncated.lastIndexOf('！'),
      truncated.lastIndexOf('"'),
    );
    if (lastEnd > 80) {
      content = truncated.substring(0, lastEnd + 1);
    }
  }

  return content;
}

/**
 * Find the most recent unresolved disagreement or open question in the discussion.
 */
function findOpenQuestion(messages: Message[]): string | null {
  const recent = messages.slice(-8);

  // Look for questions that were asked but not answered
  for (let i = recent.length - 1; i >= 0; i--) {
    const msg = recent[i];
    if (msg.content.includes('？') || msg.content.includes('?')) {
      // Check if anyone answered after this
      const answered = recent.slice(i + 1).some(m =>
        m.participant_name !== msg.participant_name
      );
      if (!answered || i === recent.length - 1) {
        // Extract the question
        const qMatch = msg.content.match(/[^。！？]*[？?]/);
        if (qMatch) {
          return `${msg.participant_name}问："${qMatch[0]}"`;
        }
      }
    }
  }

  // Look for disagreements (someone said "但是" or "不是")
  for (let i = recent.length - 1; i >= 0; i--) {
    const msg = recent[i];
    if (msg.content.includes('但是') || msg.content.includes('不对') ||
        msg.content.includes('问题是') || msg.content.includes('不是')) {
      return `${msg.participant_name}提出质疑："${msg.content.substring(0, 60)}"`;
    }
  }

  return null;
}

function getTemperature(persona: PersonaCard): number {
  const base = 0.7;
  const variation = persona.aggressiveness * 0.2;
  return base + variation;
}
