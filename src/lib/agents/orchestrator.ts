import { llmComplete } from '@/lib/llm/gateway';
import type {
  Message,
  Participant,
  SessionPhase,
  SessionConfig,
  Topic,
} from '@/lib/types';

export interface OrchestratorDecision {
  responders: {
    participant_id: string;
    instruction: string;
    delay_ms: number;
    is_interrupt: boolean;
  }[];
  phase_change?: SessionPhase;
  system_message?: string;
}

const SYSTEM_PROMPT = `你是群面模拟的导演。你的工作是让讨论像真实群面一样：短句对话、有来有回、有碰撞。

${'='.repeat(50)}
【最重要的规则 — 必须严格执行】
${'='.repeat(50)}

规则1：每个AI的instruction必须指定"回应谁的什么具体内容"
❌ 错误："回应讨论，分享你的观点"
✅ 正确："质疑陈思远说的'东南亚利润率更高'——追问供应链成本是否被低估"

规则2：前一轮提出的具体问题/分歧，这一轮必须有人正面回应，不能绕开
❌ 错误：A提了个问题，B完全无视，开始说自己的新话题
✅ 正确：A问"ROI怎么量"，B必须回应这个问题，然后才能延伸

规则3：每3-4轮AI对话后，必须有一个角色留下开放性问题给用户
不是生硬的"XX你怎么看"，而是：
"我这个判断是基于B端经验，你们有没有看过WEF自己的数据？成员参与度现在什么状态？"
给用户一个"可以接、也可以不接"的钩子。

规则4：instruction必须告诉AI"你的发言不超过80字/4句话"

规则5：每个instruction必须包含发言类型标签
- [表达判断] — 说出你的结论，不问问题。适用于：dominant_leader, industry_insider, silent_observer
- [反驳追问] — 质疑对方，但结尾必须是你自己的替代方案，不是开放性问题。适用于：analytical_challenger, quant_thinker
- [整合收尾] — 综合前面讨论，给出方向，可选问句结尾。适用于：strategic_integrator
- [提问推进] — 问一个关键问题（每人每3轮只能用1次）

如果最近3条消息里已经有2条以问句结尾，禁止再给[提问推进]类型，必须用[表达判断]或[反驳追问]。

${'='.repeat(50)}

你需要以JSON格式返回：
{
  "responders": [
    {
      "participant_id": "ID",
      "instruction": "具体指令（必须包含：回应谁的什么话、用什么方式、字数限制）",
      "delay_ms": 1000-3000,
      "is_interrupt": false
    }
  ],
  "phase_change": null,
  "system_message": null
}

【决策规则】
1. 每轮1-2人回应
2. 每轮至少1人的instruction包含"质疑/追问/反驳"
3. 不允许两个人都在"支持"或"延伸"——至少一个要challenge
4. 如果前面有未回答的问题，第一个responder必须回答那个问题
5. 每个instruction必须带发言类型标签（[表达判断]/[反驳追问]/[整合收尾]/[提问推进]），根据角色type选择
6. 大部分instruction应该是[表达判断]或[反驳追问]，只有在需要用户入口时才用[提问推进]
7. dominant_leader可以interrupt=true（抢话）
8. 不要连续2轮选同一个人

只返回JSON，不要其他内容。`;

export async function getOrchestratorDecision(
  messages: Message[],
  participants: Participant[],
  topic: Topic,
  config: SessionConfig,
  currentPhase: SessionPhase,
  elapsedMinutes: number
): Promise<OrchestratorDecision> {
  const userPrompt = buildPrompt(messages, participants, topic, config, currentPhase, elapsedMinutes);

  const response = await llmComplete(
    [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userPrompt },
    ],
    'orchestrator'
  );

  try {
    const cleaned = response.content.replace(/```json\n?|\n?```/g, '').trim();
    const decision = JSON.parse(cleaned) as OrchestratorDecision;

    // Post-process all instructions
    decision.responders = decision.responders.map(r => {
      const participant = participants.find(p => p.id === r.participant_id);
      if (!participant) return r;

      // Ensure instruction has a specific target
      if (!hasSpecificTarget(r.instruction)) {
        r.instruction = enhanceInstruction(messages, participants, participant);
      }

      // Append length constraint if not present
      if (!r.instruction.includes('80字') && !r.instruction.includes('4句') && !r.instruction.includes('短句')) {
        r.instruction += ' 不超过80字/4句短句。';
      }

      // Ensure speech type label is present
      if (!r.instruction.includes('[表达判断]') && !r.instruction.includes('[反驳追问]') &&
          !r.instruction.includes('[整合收尾]') && !r.instruction.includes('[提问推进]')) {
        const archetype = participant.persona_card?.personality_type || '';
        const speechType = getSpeechTypeForArchetype(archetype);
        r.instruction = `${speechType} ${r.instruction}`;
      }

      return r;
    });

    // Ensure at least one challenge
    const hasChallenge = decision.responders.some(r =>
      /质疑|追问|反驳|但是|challenge|不对/.test(r.instruction)
    );
    if (!hasChallenge && messages.length > 3 && decision.responders.length > 0) {
      const last = decision.responders[decision.responders.length - 1];
      const lastP = participants.find(p => p.id === last.participant_id);
      if (lastP) {
        const target = messages.slice(-3).find(m => m.participant_name !== lastP.display_name);
        if (target) {
          last.instruction = `追问${target.participant_name}："${target.content.substring(0, 40)}"中的一个具体假设——这个成立吗？用你的背景来反驳或追问。不超过80字/4句。`;
        }
      }
    }

    // Check if we need a user entry point — use speech type, not forced question
    const msgsSinceLastHuman = countMessagesSinceLastHuman(messages);
    if (msgsSinceLastHuman >= 4 && decision.responders.length > 0) {
      const lastResponder = decision.responders[decision.responders.length - 1];
      // Only the last responder gets [提问推进], and only if recent messages aren't already question-heavy
      const recentQuestions = messages.slice(-4).filter(m =>
        m.content.includes('？') || m.content.includes('?')
      ).length;
      if (recentQuestions < 2) {
        // Replace speech type with [提问推进] for user entry
        lastResponder.instruction = lastResponder.instruction
          .replace(/\[表达判断\]|\[反驳追问\]|\[整合收尾\]/, '[提问推进]');
        if (!lastResponder.instruction.includes('[提问推进]')) {
          lastResponder.instruction += ' [提问推进] 最后一句自然地留一个钩子给其他候选人。';
        }
      }
    }

    return decision;
  } catch {
    return buildFallbackDecision(messages, participants);
  }
}

function countMessagesSinceLastHuman(messages: Message[]): number {
  let count = 0;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].participant_type === 'human') break;
    count++;
  }
  return count;
}

function getSpeechTypeForArchetype(archetype: string): string {
  switch (archetype) {
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
 * Tension pairs — which personality types create the most productive conflict.
 * Used to ensure diverse, high-contrast responder selection.
 */
const TENSION_PAIRS: Record<string, string[]> = {
  'dominant_leader': ['analytical_challenger', 'silent_observer'],
  'analytical_challenger': ['dominant_leader', 'industry_insider'],
  'industry_insider': ['quant_thinker', 'analytical_challenger'],
  'strategic_integrator': ['dominant_leader', 'industry_insider'],
  'quant_thinker': ['industry_insider', 'dominant_leader'],
  'silent_observer': ['dominant_leader', 'strategic_integrator'],
};

/**
 * Select responders that maximize dialogue tension (Insight 4).
 * First pick: highest willingness. Second pick: highest tension with first.
 */
function selectDiverseResponders(
  candidates: Participant[],
  count: number,
  messages: Message[]
): Participant[] {
  if (candidates.length <= count) return candidates;

  // Sort by willingness to speak (heuristic gate)
  const scored = candidates.map(p => ({
    participant: p,
    willingness: computeSpeakingWillingness(p, messages),
  })).sort((a, b) => b.willingness - a.willingness);

  // First pick: highest willingness
  const first = scored[0].participant;
  if (count === 1) return [first];

  // Second pick: prioritize tension with first
  const firstType = first.persona_card?.personality_type || '';
  const highTensionTypes = TENSION_PAIRS[firstType] || [];

  const secondCandidates = scored
    .slice(1) // exclude first
    .sort((a, b) => {
      const aType = a.participant.persona_card?.personality_type || '';
      const bType = b.participant.persona_card?.personality_type || '';
      const aTension = highTensionTypes.includes(aType) ? 2 : 0;
      const bTension = highTensionTypes.includes(bType) ? 2 : 0;
      // Combine tension bonus with willingness
      return (bTension + b.willingness) - (aTension + a.willingness);
    });

  const second = secondCandidates[0]?.participant;
  return second ? [first, second] : [first];
}

/**
 * Heuristic speech gate — compute how much a participant "wants" to speak (Insight 1).
 * Returns 0-1 score. No LLM call — pure heuristics to avoid QPS issues.
 */
function computeSpeakingWillingness(participant: Participant, messages: Message[]): number {
  const persona = participant.persona_card;
  if (!persona) return 0.3;

  let score = 0.5; // base

  const recent = messages.slice(-6);
  const lastMsg = messages[messages.length - 1];

  // Was this person directly addressed or challenged?
  if (lastMsg) {
    const mentionsMe = lastMsg.content.includes(persona.name);
    const challengesMe = mentionsMe && (
      lastMsg.content.includes('但是') || lastMsg.content.includes('不对') ||
      lastMsg.content.includes('？') || lastMsg.content.includes('?')
    );
    if (challengesMe) score += 0.4; // strong urge to respond
    else if (mentionsMe) score += 0.25; // was addressed
  }

  // Did I speak recently? Suppress if yes
  const myRecentMsgs = recent.filter(m => m.participant_id === participant.id);
  if (myRecentMsgs.length >= 2) score -= 0.3; // spoke too much recently
  else if (myRecentMsgs.length === 1) score -= 0.1;

  // Aggressiveness drives willingness
  score += (persona.aggressiveness - 0.5) * 0.3;

  // Type-specific adjustments
  if (persona.personality_type === 'dominant_leader') score += 0.15;
  if (persona.personality_type === 'silent_observer') score -= 0.2;
  if (persona.personality_type === 'analytical_challenger') {
    // Wants to speak when someone makes a claim without evidence
    const lastContent = lastMsg?.content || '';
    if (lastContent.includes('应该') || lastContent.includes('一定') || lastContent.includes('肯定')) {
      score += 0.2;
    }
  }
  if (persona.personality_type === 'quant_thinker') {
    // Wants to speak when numbers are mentioned or missing
    const lastContent = lastMsg?.content || '';
    if (/\d+%|\d+倍|ROI|成本|利润|数据/.test(lastContent)) {
      score += 0.2;
    }
  }

  // Haven't spoken at all yet? Slight boost
  const totalMsgs = messages.filter(m => m.participant_id === participant.id).length;
  if (totalMsgs === 0 && messages.length > 5) score += 0.15;

  return Math.max(0, Math.min(1, score));
}

function hasSpecificTarget(instruction: string): boolean {
  return /回应|质疑|反驳|追问|支持|延伸|打断|cue|整合|纠正|说的|提到/.test(instruction);
}

function enhanceInstruction(
  messages: Message[],
  participants: Participant[],
  participant: Participant
): string {
  const archetype = participant.persona_card?.personality_type;
  const lastOther = [...messages].reverse().find(m => m.participant_id !== participant.id);

  if (!lastOther) return '分享你的核心观点，不超过80字。';

  const targetName = lastOther.participant_name;
  const targetContent = lastOther.content.substring(0, 50);

  switch (archetype) {
    case 'dominant_leader':
      return `[表达判断] 接过${targetName}说的"${targetContent}"，用你的框架重新组织，给出你的结论。不超过80字/4句。`;
    case 'analytical_challenger':
      return `[反驳追问] 追问${targetName}说的"${targetContent}"中的一个具体假设——给出你的理由和替代判断。不超过80字/4句。`;
    case 'industry_insider':
      return `[表达判断] 用你的行业经验反驳或验证${targetName}关于"${targetContent}"的判断。给出一个具体数据或案例结论。不超过80字/4句。`;
    case 'strategic_integrator':
      return `[整合收尾] 把${targetName}的观点和之前的讨论做整合——共识在哪？分歧在哪？给出你的方向判断。不超过80字/4句。`;
    case 'quant_thinker':
      return `[反驳追问] 对${targetName}的"${targetContent}"做量化质疑——给出你的数据拆解和结论。不超过80字/4句。`;
    case 'silent_observer':
      return `[表达判断] 指出关于"${targetContent}"的讨论中所有人忽略的一个矛盾或前提错误。不超过80字/4句。`;
    default:
      return `[表达判断] 直接回应${targetName}的"${targetContent}"，加入你自己的判断。不超过80字/4句。`;
  }
}

function buildFallbackDecision(messages: Message[], participants: Participant[]): OrchestratorDecision {
  const aiParticipants = participants.filter(p => p.type === 'ai');
  if (aiParticipants.length === 0) return { responders: [] };

  // Filter out very recent speakers, then use tension-based selection
  const recentSpeakers = new Set(messages.slice(-3).map(m => m.participant_id));
  const candidates = aiParticipants.filter(p => !recentSpeakers.has(p.id));
  const pool = candidates.length > 0 ? candidates : aiParticipants;

  const count = Math.min(pool.length, messages.length < 5 ? 1 : 2);
  const selected = selectDiverseResponders(pool, count, messages);

  const needsUserHook = countMessagesSinceLastHuman(messages) >= 4;
  const recentQs = messages.slice(-4).filter(m =>
    m.content.includes('？') || m.content.includes('?')
  ).length;

  return {
    responders: selected.map((p, i) => {
      let instruction = enhanceInstruction(messages, participants, p);
      // Only add user hook if not already question-heavy
      if (needsUserHook && i === selected.length - 1 && recentQs < 2) {
        instruction = instruction.replace(/\[表达判断\]|\[反驳追问\]|\[整合收尾\]/, '[提问推进]');
      }

      return {
        participant_id: p.id,
        instruction,
        delay_ms: 800 + Math.random() * 2000,
        is_interrupt: p.persona_card?.personality_type === 'dominant_leader' && Math.random() > 0.7,
      };
    }),
  };
}

/**
 * Opening phase instructions — TYPE-aware.
 */
export function getOpeningInstructions(
  participants: Participant[],
  topic: Topic
): OrchestratorDecision {
  const aiParticipants = participants.filter(p => p.type === 'ai');

  const sorted = [...aiParticipants].sort((a, b) =>
    (b.persona_card?.aggressiveness || 0) - (a.persona_card?.aggressiveness || 0)
  );

  return {
    responders: sorted.map((p, i) => {
      const archetype = p.persona_card?.personality_type;
      let instruction: string;

      switch (archetype) {
        case 'dominant_leader':
          instruction = `抢先开场。定框架——"核心问题是X，我建议分两步讨论"。不超过3句话/60字。`;
          break;
        case 'analytical_challenger':
          instruction = `指出题目中一个关键假设需要验证。不给方案，先追问前提。2-3句。`;
          break;
        case 'industry_insider':
          instruction = `用行业经验给一个其他人不知道的insight。"我做过类似项目，有个坑是——"。2-3句。`;
          break;
        case 'strategic_integrator':
          instruction = `简短说初步想法，不展开。在观察。1-2句。`;
          break;
        case 'quant_thinker':
          instruction = `抓住题目数据做快速拆解。"基准数据是X，gap是Y"。2句。`;
          break;
        case 'silent_observer':
          instruction = `说一句你注意到的点，不展开。1句。`;
          break;
        default:
          instruction = `分享初步想法。2-3句。`;
      }

      return {
        participant_id: p.id,
        instruction,
        delay_ms: i === 0 ? 1500 : 2500 + i * 2500,
        is_interrupt: false,
      };
    }),
  };
}

/**
 * Check time-based phase transition.
 */
export function checkPhaseTransition(
  config: SessionConfig,
  currentPhase: SessionPhase,
  elapsedMinutes: number
): SessionPhase | null {
  const { phases } = config;
  const introEnd = phases.intro;
  const briefingEnd = introEnd + phases.briefing;
  const openingEnd = briefingEnd + phases.opening;
  const discussionEnd = openingEnd + phases.discussion;
  const summaryEnd = discussionEnd + phases.summary;

  if (currentPhase === 'intro' && elapsedMinutes >= introEnd) return 'briefing';
  if (currentPhase === 'briefing' && elapsedMinutes >= briefingEnd) return 'opening';
  if (currentPhase === 'opening' && elapsedMinutes >= openingEnd) return 'discussion';
  if (currentPhase === 'discussion' && elapsedMinutes >= discussionEnd) return 'summary';
  if (currentPhase === 'summary' && elapsedMinutes >= summaryEnd) return 'qa';
  return null;
}

function buildPrompt(
  messages: Message[],
  participants: Participant[],
  topic: Topic,
  config: SessionConfig,
  currentPhase: SessionPhase,
  elapsedMinutes: number
): string {
  const recentMessages = messages.slice(-12);
  const transcript = recentMessages
    .map(m => {
      const pType = m.participant_type === 'human' ? '【真人】' : '';
      return `${pType}${m.participant_name}: ${m.content}`;
    })
    .join('\n');

  const participantInfo = participants
    .map(p => {
      if (p.type === 'human') return `- ${p.display_name} (真人)`;
      const persona = p.persona_card;
      const msgCount = messages.filter(m => m.participant_id === p.id).length;
      const willingness = computeSpeakingWillingness(p, messages);
      const willingnessLabel = willingness > 0.7 ? '🔥想说' : willingness > 0.4 ? '—' : '😶克制';
      return `- ${p.display_name} [${p.id}] (${persona?.personality_type}, ${msgCount}次, ${willingnessLabel})`;
    })
    .join('\n');

  const timeRemaining = config.duration_minutes - elapsedMinutes;

  // Find unresolved question/disagreement
  const openIssue = findOpenIssue(recentMessages);
  const openIssueNote = openIssue
    ? `\n🔴 【未解决的问题】${openIssue}\n→ 这一轮第一个responder必须正面回应这个问题，不能跳过！`
    : '';

  // Echo chamber detection
  const lastFew = messages.slice(-4).map(m => m.content);
  const allAgreeing = lastFew.length >= 3 && lastFew.every(c =>
    c.includes('同意') || c.includes('认同') || c.includes('对') || c.includes('没错') || c.includes('是的')
  );
  const echoWarning = allAgreeing
    ? '\n⚠️ 【回音壁】大家都在互相同意！这一轮必须有人说"但是"！'
    : '';

  // User entry point check
  const msgsSinceHuman = countMessagesSinceLastHuman(messages);
  const userHookNote = msgsSinceHuman >= 4
    ? `\n💡 【用户入口】已经${msgsSinceHuman}条AI对话没有用户发言了。最后一个responder用[提问推进]类型。`
    : '';

  // Question frequency tracking
  const recentQuestionCount = messages.slice(-4).filter(m =>
    m.content.includes('？') || m.content.includes('?')
  ).length;
  const questionOverload = recentQuestionCount >= 2
    ? `\n🔴 【提问过多】最近${recentQuestionCount}条消息以问句结尾！所有instruction必须用[表达判断]或[反驳追问]，禁止[提问推进]！`
    : '';

  // Discussion progress tracking
  const discussionRound = Math.floor(messages.filter(m => m.phase === 'discussion').length / 3) + 1;
  const progressNote = getProgressNote(discussionRound);

  return `【状态】阶段:${currentPhase} | 已用:${elapsedMinutes.toFixed(0)}分 | 剩:${timeRemaining.toFixed(0)}分 | 第${discussionRound}轮

【参与者】
${participantInfo}

【最近对话】
${transcript || '（暂无）'}
${openIssueNote}${echoWarning}${userHookNote}${questionOverload}

【第${discussionRound}轮应该做什么】${progressNote}

【决定】选1-2人回应。instruction必须：
1. 以发言类型标签开头：[表达判断]/[反驳追问]/[整合收尾]/[提问推进]
2. 指定"回应谁说的什么"（必须引用前面某人的具体话）
3. 指定方式（追问/反驳/量化/整合/纠正）
4. 包含"不超过80字/4句"
5. 至少1人要challenge/追问
6. 大部分用[表达判断]或[反驳追问]，[提问推进]每3-4轮最多1次`;
}

function findOpenIssue(messages: Message[]): string | null {
  for (let i = messages.length - 1; i >= Math.max(0, messages.length - 6); i--) {
    const msg = messages[i];
    // Find unanswered questions
    if (msg.content.includes('？') || msg.content.includes('?')) {
      const laterMsgs = messages.slice(i + 1);
      const directlyAnswered = laterMsgs.some(m =>
        m.content.includes(msg.participant_name || '') ||
        m.participant_name !== msg.participant_name
      );
      if (!directlyAnswered || i >= messages.length - 2) {
        const q = msg.content.match(/[^。！？]*[？?]/);
        return q ? `${msg.participant_name}问："${q[0]}"` : null;
      }
    }
    // Find unresolved challenges
    if (i === messages.length - 1 &&
        (msg.content.includes('但是') || msg.content.includes('不对') || msg.content.includes('问题是'))) {
      return `${msg.participant_name}提出质疑："${msg.content.substring(0, 50)}"——需要有人正面回应`;
    }
  }
  return null;
}

function getProgressNote(round: number): string {
  if (round <= 1) return '提出方向/假设。各人亮核心观点，不需要达成共识。';
  if (round <= 2) return '补充或质疑。针对第1轮的方向进行追问和碰撞。';
  if (round <= 3) return '深化。用数据/案例/经验来解决具体分歧。';
  if (round <= 4) return '整合。综合前面的讨论，收拢方向。有人该做总结了。';
  return '收尾。必须有人做最终整合，不能还在发散。';
}
