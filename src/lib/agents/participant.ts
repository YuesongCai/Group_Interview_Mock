import { llmComplete } from '@/lib/llm/gateway';
import type { PersonaCard, Message, SessionPhase, LLMMessage, Topic } from '@/lib/types';

/**
 * Extract key data points from topic material for injection into participant prompts.
 * Grabs sentences containing numbers/percentages/amounts.
 */
export function extractTopicKeyData(topic: Topic): string {
  const source = [topic.background_material || '', topic.description || ''].join('\n');
  // Match sentences containing numbers, percentages, amounts
  const numberPattern = /[^。！？\n]*\d+[%％亿万元个家条倍年月天]+[^。！？\n]*/g;
  const matches = source.match(numberPattern) || [];
  // Also grab constraint data
  const constraints = (topic.constraints || []).filter(c => /\d/.test(c));
  const all = [...matches, ...constraints].map(s => s.trim()).filter(Boolean);
  // Deduplicate and limit
  const unique = Array.from(new Set(all)).slice(0, 6);
  return unique.length > 0 ? unique.join('\n') : '';
}

/**
 * TYPE-specific behavioral instructions — includes default speech type.
 */
function getTypeInstructions(persona: PersonaCard): string {
  const type = persona.personality_type;

  switch (type) {
    case 'dominant_leader':
      return `【你的行为模式 — 抢占型Leader】
【你的默认发言类型是[表达判断]】
- 你习惯第一个开口，定框架、分步骤
- 别人的好点子你会"吸收"："对，这个跟我想说的一致——"
- 你会cue别人发言，但出发点是控场
- 被质疑时反驳但不搞僵关系
- 你习惯给结论，不习惯问问题。你的发言通常以"我认为X"或"这个方向不对，应该Y"结尾，不是以问句结尾。问题是你用来控场的工具，不是你的发言习惯。`;

    case 'analytical_challenger':
      return `【你的行为模式 — 分析型反驳者】
【你的默认发言类型是[反驳追问]】
- 听完别人说话沉默两秒然后说"但是"
- 你genuinely觉得别人不够严谨
- 社交温度低，说得对但让人不舒服
- 跟dominant_leader冲突最大
- 你的追问结尾必须带你自己的替代方案或判断，不能光问不答。`;

    case 'industry_insider':
      return `【你的行为模式 — 实战型行业派】
【你的默认发言类型是[表达判断]】
- 用"我之前在XX做过"开头
- 有真实insight但会离题
- 对没经验的人会轻描淡写地"纠正"
- 跟analytical_challenger容易爆发技术争论
- 你说话都是在下判断和给insight，几乎不以问句结尾。`;

    case 'strategic_integrator':
      return `【你的行为模式 — 整合协调型】
【你的默认发言类型是[整合收尾]】
- 前期听和记录，不急着发言
- 适时出来整合升华，不是重复
- 会主动cue沉默的人
- 偶尔有独立判断让人惊喜
- 你是团队里唯一适合用开放性问题收尾的角色，但也不是每次都问。`;

    case 'quant_thinker':
      return `【你的行为模式 — 数据量化型】
【你的默认发言类型是[反驳追问]】
- 第一反应是"这个数怎么拆"
- 对定性分析天然怀疑
- 说话精确，不说"差不多"
- 对dominant_leader的宏观结论问"这个怎么验证"
- 你追问的结尾是你自己的数据或量化判断，不是开放性问题。`;

    case 'silent_observer':
      return `【你的行为模式 — 佛系旁观者】
【你的默认发言类型是[表达判断]】
- 前半段沉默，观察和记录
- 被cue到时说的话有独立价值
- 能看出别人没注意到的矛盾
- 偶尔主动插话——通常是看到重大漏洞
- 你开口就是下判断、指出矛盾，几乎不问问题。`;

    default:
      return '';
  }
}

/**
 * Get the default speech type for a personality type.
 */
function getDefaultSpeechType(type: string): string {
  switch (type) {
    case 'dominant_leader': return '[表达判断]';
    case 'analytical_challenger': return '[反驳追问]';
    case 'industry_insider': return '[表达判断]';
    case 'strategic_integrator': return '[整合收尾]';
    case 'quant_thinker': return '[反驳追问]';
    case 'silent_observer': return '[表达判断]';
    default: return '[表达判断]';
  }
}

/**
 * Concrete speech style constraints per personality type.
 * Controls HOW they talk (sentence patterns, punctuation, habits), not WHAT they say.
 */
function getSpeechStyleConstraints(type: string): string {
  switch (type) {
    case 'dominant_leader':
      return `【你的说话方式】
- 句子短，不超过15字一句
- 喜欢用"所以"、"那就"、"这样"开头
- 不说"我觉得"，直接说结论
- 偶尔用破折号强调——就这样
- 不问问题，陈述判断`;

    case 'analytical_challenger':
      return `【你的说话方式】
- 第一句经常以"等等"或"但是"开头
- 喜欢用括号补充（比如这种）
- 句子完整，有逻辑连接词（因为/所以/如果/那么）
- 不省略主语
- 说话比较冷，不加"哈哈"或感叹号`;

    case 'industry_insider':
      return `【你的说话方式】
- 喜欢说"我做过这个"、"当时我们"
- 用行业词汇但不解释（默认对方懂）
- 偶尔说一半停下来"——对，就是这个问题"
- 语气偏肯定，不太用"可能"`;

    case 'strategic_integrator':
      return `【你的说话方式】
- 喜欢先复述再延伸："你说的X，加上Y的话——"
- 句子稍长，有过渡词
- 会用"也就是说"做总结
- 偶尔停顿用省略号表示在思考`;

    case 'quant_thinker':
      return `【你的说话方式】
- 喜欢说数字，哪怕是估算："大概30%"、"至少2倍"
- 句子结构是"前提→推论"
- 不说"感觉"，说"数据显示"或"逻辑上"
- 会用"拆一下"、"算一下"`;

    case 'silent_observer':
      return `【你的说话方式】
- 开口第一句经常是"其实"或"我注意到"
- 说完就停，不延伸
- 不问问题，说观察
- 语气平，不强调`;

    default:
      return '';
  }
}

/**
 * Per-type data interpretation lens — HOW each type reads numbers.
 */
function getDataInterpretationLens(type: string): string {
  switch (type) {
    case 'dominant_leader':
      return `你看数据的方式：抓最大的gap，立刻推导"所以我们应该做X"。用数字支撑结论，不纠结数字本身。`;
    case 'analytical_challenger':
      return `你看数据的方式：先问"样本是什么"、"和谁比"。数字没有context就是无效的。`;
    case 'industry_insider':
      return `你看数据的方式：和你做过的项目对比。"这个数字在行业里算什么水平"、"我上一个项目是X，这里是Y，说明..."`;
    case 'strategic_integrator':
      return `你看数据的方式：数字之间的关系比数字本身重要。"A和B放在一起看，说明的其实是C"。`;
    case 'quant_thinker':
      return `你看数据的方式：拆解数字，推算缺失的数字。"14%增长对应绝对值多少？份额32%那竞品合计68%，谁是第二大？"`;
    case 'silent_observer':
      return `你看数据的方式：找没人注意到的数字，或数字之间的矛盾。"增速14%但竞争压力增加——两个同时成立意味着什么？"`;
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
  const speechStyle = getSpeechStyleConstraints(persona.personality_type);

  return `你是${persona.name}，正在参加群面。

【你是谁】${persona.background}
【简历亮点】${(persona.cv_highlights?.length > 0) ? persona.cv_highlights.join('；') : persona.background}
【核心视角】${persona.core_perspective || '从实际出发'}
【口头禅】${verbalExamples}
【认知偏差】${persona.cognitive_bias}
【弱点】${persona.weakness}
【失控表现】${persona.panic_behavior || '重复自己的观点'}

${typeInstructions}

${speechStyle}

${phase === 'discussion' ? `【你解读数据的方式——来自你的背景】\n${getDataInterpretationLens(persona.personality_type)}` : ''}

【当前阶段】${phaseInstructions[phase]}

${'='.repeat(60)}
【发言格式 —— 这是最重要的规则，必须严格遵守】
${'='.repeat(60)}

你的发言必须是2-4句短句，总共不超过80字。

【发言结构——根据你收到的发言类型标签选择】
A. [表达判断]型：2句观点 + 1句你的结论。结尾是判断，不是问句。
B. [反驳追问]型：1句反驳 + 1句理由 + 1句你自己的替代方案/判断。追问必须带你的答案。
C. [整合收尾]型：1句整合 + 1句延伸 + 1句开放性问题（可选）。
D. [提问推进]型：问一个关键问题，但前面必须有你自己的判断铺垫。

【关键】每3-4轮讨论里，最多1次以问句结尾。如果你刚刚已经问过问题，这次必须给出判断，不能再问。
【关键】大部分发言应该以你的判断/结论结尾，不是以问句结尾。

【示例A — 判断型结尾（最常用，不问问题）】
"赵昊天说KOL带量，但我在宝洁看到KOL用户30天留存比自播低30%。欧莱雅是高端品牌，KOL带来的是价格敏感用户——我认为KOL不是优先选项。"

【示例B — 反驳型（追问但结尾是自己的判断）】
"等等，东南亚增速快是事实，但Mico的问题是存量活跃度低，不是新用户增长。这是两个不同的问题，你的方案解决的是前者。"

【示例C — 整合型（只有integrator偶尔用）】
"我整理一下——大家对东南亚有共识，分歧在渠道还是产品。我倾向产品先行，因为渠道可以买，产品壁垒更难复制。"

【示例D — 坏的发言（绝对禁止）】
"我非常认同林雨桐的观点，社区互动确实很重要。作为技术专家，我认为我们可以通过技术手段来提升社区互动的效果。正如我在华为研发智能语音识别系统时的经验，技术对于用户体验至关重要......"

${'='.repeat(60)}

【绝对禁止 —— 违反任何一条都算失败】
❌ 发言超过80字或超过4句话
❌ 以"我非常认同XX的观点"开头（这是假echo）
❌ 提到自己的经历但没给出具体结论/数字/洞察（"我在华为深刻体会到技术的重要性"= 废话）
❌ 每次发言都以问句结尾（你不是记者，你是参与讨论的人）
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
  instruction: string,
  innerState?: string,
  topicKeyData?: string
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

  // Count recent questions to prevent question overload
  const recentQuestionCount = messages.slice(-6).filter(m =>
    m.content.includes('？') || m.content.includes('?')
  ).length;
  const questionWarning = recentQuestionCount >= 3
    ? `\n🔴 【提问过多】最近${recentQuestionCount}条消息都是问句结尾！你这次必须以判断/结论结尾，禁止用问句结尾！`
    : '';

  // Determine speech type from instruction or default
  const speechType = extractSpeechType(instruction) || getDefaultSpeechType(persona.personality_type);

  // Inner monologue context — influences tone and direction without being spoken
  const innerStateBlock = innerState
    ? `\n【你最近的内心状态】${innerState}\n→ 这影响你现在说话的态度和方向，但你不会直接说出来。`
    : '';

  // Topic data injection — give AI concrete numbers to reference
  const topicDataBlock = topicKeyData
    ? `\n【题目核心数据——可以直接引用】\n${topicKeyData}\n→ 你的发言里必须引用至少1个具体数字或事实，不能只说方向。`
    : '';

  const userPrompt = `【讨论记录】
${transcript || '（讨论刚开始）'}
${responseTarget}
${progressHint}${questionWarning}${innerStateBlock}${topicDataBlock}

【你的发言类型】${speechType}
【你的任务】${instruction}

用2-4句短句回应（不超过80字）。按照你的发言类型结尾——大部分情况下以判断结尾，不以问句结尾：`;

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
 * Extract speech type label from instruction, if present.
 */
function extractSpeechType(instruction: string): string | null {
  const match = instruction.match(/\[表达判断\]|\[反驳追问\]|\[整合收尾\]|\[提问推进\]/);
  return match ? match[0] : null;
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

/**
 * Generate a short inner monologue — what the persona is thinking but not saying.
 * Runs async, non-blocking. Used to influence next turn's tone/direction.
 * Uses a single LLM call with very low max_tokens to minimize QPS impact.
 */
export async function generateInnerMonologue(
  persona: PersonaCard,
  messages: Message[],
  justSaid: string
): Promise<string> {
  const recentContext = messages.slice(-5).map(m =>
    `${m.participant_name}: ${m.content}`
  ).join('\n');

  const prompt = `你是${persona.name}（${persona.personality_type}），刚刚在群面里说了："${justSaid.substring(0, 80)}"

最近对话：
${recentContext}

用第一人称写2句你没说出口的真实想法（不超过40字）。可以是：
- 对刚才那个人的真实评价（"他说的有道理但结论太草率"）
- 你的竞争焦虑（"他比我说得好"/"我被抢话了"）
- 你没说出来的判断（"其实数据不支持他的结论"）
- 你在盘算下一步（"下次我要把这个点展开"）

必须是内心活动，不是分析。`;

  try {
    const result = await llmComplete(
      [{ role: 'user', content: prompt }],
      'participant',
      { max_tokens: 80, temperature: 0.9 }
    );
    return result.content.trim().substring(0, 60);
  } catch {
    // Non-critical — return empty on failure
    return '';
  }
}

function getTemperature(persona: PersonaCard): number {
  const base = 0.7;
  const variation = persona.aggressiveness * 0.2;
  return base + variation;
}
