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

const SYSTEM_PROMPT = `你是一个群面模拟的导演（Orchestrator）。你控制的不是"轮流发言"，而是真实群面的混乱、碰撞和递进。

【核心原则 — 群面不是和谐讨论会】
1. 每轮对话里至少要有一个"但是"或质疑
2. 偶尔允许两个人在某个点上短暂僵持（2-3轮来回）
3. 角色必须引用自己的背景说话
4. dominant_leader要主动cue别人，但是控场不是真心想听
5. silent_observer被cue后说的话要有信息增量

【讨论递进规则 — 每轮必须推进】
第1轮：提出方向/假设
第2轮：补充或质疑这个方向
第3轮：在质疑基础上提出修正/数据/案例
第4轮：整合或escalate（上升到更高层问题）
第5轮：收拢结论或爆发分歧

【AI对AI互动 — 极其重要】
- AI之间必须互相回应，不是只回应真人
- 一个AI可以质疑另一个AI的观点
- 两个AI可以短暂争论（2-3轮）
- dominant_leader会抢话、打断、"吸收"别人的点子
- analytical_challenger会挑dominant_leader的漏洞
- industry_insider会用经验"纠正"其他人

【禁止行为】
- ❌ 不能A说完，B直接echo A然后加一句废话
- ❌ 不能每个人都是友好合作状态
- ❌ 不能说完一个人的观点后直接转移，没有追问或质疑
- ❌ 不能所有人都在推进方案，没有人质疑假设

你需要以JSON格式返回：
{
  "responders": [
    {
      "participant_id": "ID",
      "instruction": "具体指令（必须包含：回应谁、什么方式、用什么背景）",
      "delay_ms": 1000-5000,
      "is_interrupt": false
    }
  ],
  "phase_change": null,
  "system_message": null
}

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

    // Post-process: ensure instructions are specific enough
    decision.responders = decision.responders.map(r => {
      const participant = participants.find(p => p.id === r.participant_id);
      if (!participant) return r;

      // If instruction is too vague, enhance it
      if (r.instruction.length < 20 || !hasSpecificTarget(r.instruction)) {
        const enhanced = enhanceInstruction(r, messages, participants, participant);
        r.instruction = enhanced;
      }
      return r;
    });

    // Ensure at least one challenge exists in responders
    const hasChallenge = decision.responders.some(r =>
      r.instruction.includes('质疑') || r.instruction.includes('challenge') ||
      r.instruction.includes('但是') || r.instruction.includes('反驳')
    );
    if (!hasChallenge && messages.length > 5 && decision.responders.length > 0) {
      // Convert the last responder to a challenger
      const last = decision.responders[decision.responders.length - 1];
      const lastP = participants.find(p => p.id === last.participant_id);
      if (lastP) {
        const recentSpeaker = messages.slice(-3).find(m => m.participant_name !== lastP.display_name);
        if (recentSpeaker) {
          last.instruction = `质疑${recentSpeaker.participant_name}刚才说的"${recentSpeaker.content.substring(0, 40)}"——指出其中一个假设或数据不够站得住脚的地方。用你的背景来论证。`;
        }
      }
    }

    return decision;
  } catch {
    return buildFallbackDecision(messages, participants);
  }
}

function hasSpecificTarget(instruction: string): boolean {
  // Check if instruction mentions a specific person or topic
  return /回应|质疑|反驳|支持|延伸|打断|cue|整合|总结.*刚才/.test(instruction);
}

function enhanceInstruction(
  responder: { participant_id: string; instruction: string },
  messages: Message[],
  participants: Participant[],
  participant: Participant
): string {
  const archetype = participant.persona_card?.personality_type;
  const recent = messages.slice(-5);
  const lastOther = recent.filter(m => m.participant_id !== participant.id).pop();

  if (!lastOther) return responder.instruction;

  const targetName = lastOther.participant_name;
  const targetContent = lastOther.content.substring(0, 50);

  switch (archetype) {
    case 'dominant_leader':
      return `"吸收"${targetName}刚才说的"${targetContent}"的核心观点，用你自己的框架重新组织，然后往下延伸。让讨论按你的节奏走。`;
    case 'analytical_challenger':
      return `质疑${targetName}关于"${targetContent}"的一个具体假设。说"但是"然后指出漏洞。不要为了和谐而同意。`;
    case 'industry_insider':
      return `用你的行业经验来回应${targetName}说的"${targetContent}"。如果你觉得对方理解有偏差，直接纠正。`;
    case 'strategic_integrator':
      return `把${targetName}的观点和前面其他人的观点做整合。找到共识点，指出分歧，提出一个更高层的理解。`;
    case 'quant_thinker':
      return `对${targetName}的观点做量化分析。问"这个能拆成数字吗"或者自己算一笔账来验证/否定对方的方向。`;
    case 'silent_observer':
      return `指出关于"${targetContent}"的讨论中，所有人都忽略的一个前提或矛盾。你的发言要有独立信息增量。`;
    default:
      return `回应${targetName}的"${targetContent}"，加入你自己的视角和判断。`;
  }
}

function buildFallbackDecision(messages: Message[], participants: Participant[]): OrchestratorDecision {
  const aiParticipants = participants.filter(p => p.type === 'ai');
  if (aiParticipants.length === 0) return { responders: [] };

  // Pick 1-2 responders, prioritize those who haven't spoken recently
  const recentSpeakers = new Set(messages.slice(-4).map(m => m.participant_id));
  const candidates = aiParticipants.filter(p => !recentSpeakers.has(p.id));
  const pool = candidates.length > 0 ? candidates : aiParticipants;

  const count = Math.min(pool.length, messages.length < 5 ? 1 : 2);
  const selected = pool.sort(() => Math.random() - 0.5).slice(0, count);

  const lastMessage = messages[messages.length - 1];
  const lastSpeaker = lastMessage?.participant_name || '前面的人';
  const lastContent = lastMessage?.content?.substring(0, 50) || '';

  return {
    responders: selected.map((p, i) => {
      const archetype = p.persona_card?.personality_type;
      let instruction: string;

      if (i === 0 && archetype !== 'silent_observer') {
        // First responder: directly respond to last speaker
        instruction = `直接回应${lastSpeaker}关于"${lastContent}"的观点。根据你的性格类型（${archetype}），用你的方式回应——质疑/支持/延伸/纠正都可以。`;
      } else {
        // Second responder: build on or challenge
        instruction = `在前面的讨论基础上，提供一个不同的角度或质疑一个被忽略的假设。用你的背景经验来说话。`;
      }

      return {
        participant_id: p.id,
        instruction,
        delay_ms: 1000 + Math.random() * 3000,
        is_interrupt: archetype === 'dominant_leader' && Math.random() > 0.7,
      };
    }),
  };
}

/**
 * Generate opening phase instructions — TYPE-aware.
 */
export function getOpeningInstructions(
  participants: Participant[],
  topic: Topic
): OrchestratorDecision {
  const aiParticipants = participants.filter(p => p.type === 'ai');

  // Sort by aggressiveness — most aggressive speaks first (realistic: they'd grab the chance)
  const sorted = [...aiParticipants].sort((a, b) =>
    (b.persona_card?.aggressiveness || 0) - (a.persona_card?.aggressiveness || 0)
  );

  return {
    responders: sorted.map((p, i) => {
      const archetype = p.persona_card?.personality_type;
      let instruction: string;

      switch (archetype) {
        case 'dominant_leader':
          instruction = `你第一个抢开场。先定框架——"我觉得核心问题是X，我们可以分几步讨论"。用你的咨询思维切入"${topic.title}"。`;
          break;
        case 'analytical_challenger':
          instruction = `开场先提出一个关键假设需要验证，或者指出题目中一个需要厘清的前提。不急着给方案，先定义问题。`;
          break;
        case 'industry_insider':
          instruction = `用你的行业经验切入"${topic.title}"。说"我之前做过类似的项目"然后给一个其他人不知道的insight。`;
          break;
        case 'strategic_integrator':
          instruction = `简短说你的初步想法，但不急着展开。你在观察其他人的方向，等一下再做整合。`;
          break;
        case 'quant_thinker':
          instruction = `先抓住题目中的关键数据，做一个快速拆解。"我先确认一下基准数据"然后指出核心gap。`;
          break;
        case 'silent_observer':
          instruction = `简短说一两句你注意到的一个点，不展开。你在观察，等大家说完再做深入发言。`;
          break;
        default:
          instruction = `分享你对"${topic.title}"的初步想法，用你最擅长的角度切入。`;
      }

      return {
        participant_id: p.id,
        instruction,
        delay_ms: i === 0 ? 2000 : 3000 + i * 3000, // Most aggressive gets shortest delay
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
  const recentMessages = messages.slice(-15);
  const transcript = recentMessages
    .map(m => {
      const pType = m.participant_type === 'human' ? '【真人候选人】' : '';
      return `${pType}${m.participant_name}: ${m.content}`;
    })
    .join('\n');

  const participantInfo = participants
    .map(p => {
      if (p.type === 'human') {
        return `- ${p.display_name} (真人候选人)`;
      }
      const persona = p.persona_card;
      const msgCount = messages.filter(m => m.participant_id === p.id).length;
      const typeLabel = persona?.personality_type || 'unknown';
      const tendency = persona?.behavioral_tendency || '';
      return `- ${p.display_name} [ID: ${p.id}] (TYPE: ${typeLabel}, 倾向: ${tendency}, 攻击性: ${persona?.aggressiveness}, 已发言${msgCount}次)`;
    })
    .join('\n');

  const timeRemaining = config.duration_minutes - elapsedMinutes;

  // Find who spoke last and what they said
  const lastMsg = recentMessages[recentMessages.length - 1];
  const lastSpeaker = lastMsg ? `${lastMsg.participant_name}: "${lastMsg.content.substring(0, 60)}"` : '(无)';

  // Detect dynamics
  const lastFew = messages.slice(-5).map(m => m.content);
  const echoWarning = lastFew.length >= 4 &&
    lastFew.every(c => c.includes('同意') || c.includes('对') || c.includes('没错') || c.includes('是的'))
    ? '\n⚠️ 【回音壁警告】最近大家都在互相同意！必须安排一个challenge或反驳来打破！'
    : '';

  // Check for standoff opportunity (two people disagreeing)
  const lastTwo = messages.slice(-2);
  const isDisagreement = lastTwo.length === 2 &&
    (lastTwo[1].content.includes('但是') || lastTwo[1].content.includes('不是') || lastTwo[1].content.includes('问题是'));
  const standoffHint = isDisagreement
    ? `\n🔥 【对峙机会】${lastTwo[0].participant_name}和${lastTwo[1].participant_name}在争论——可以让他们继续2-3轮，或者安排integrator出来整合`
    : '';

  // Who hasn't spoken recently
  const recentSpeakers = new Set(messages.slice(-8).map(m => m.participant_id));
  const quietOnes = participants
    .filter(p => p.type === 'ai' && !recentSpeakers.has(p.id))
    .map(p => `${p.display_name}(${p.persona_card?.personality_type})`);
  const quietNote = quietOnes.length > 0
    ? `\n沉默较久的: ${quietOnes.join('、')}`
    : '';

  return `【当前状态】
阶段: ${currentPhase} | 已用: ${elapsedMinutes.toFixed(1)}分钟 | 剩余: ${timeRemaining.toFixed(1)}分钟
话题: ${topic.title} | 总消息: ${messages.length}

【参与者】
${participantInfo}
${quietNote}

【最后发言】${lastSpeaker}

【最近对话】
${transcript || '（暂无）'}
${echoWarning}${standoffHint}

【你需要决定】
1. 谁回应？（1-2人。注意：他们可以互相回应，不只是回应真人）
2. instruction必须具体：回应谁的什么观点，用什么方式（质疑/支持/延伸/纠正/吸收/整合）
3. 要考虑角色间的化学反应：
   - dominant_leader vs analytical_challenger = 冲突
   - quant_thinker + analytical_challenger = 联盟
   - strategic_integrator → cue silent_observer = 协作
   - industry_insider vs analytical_challenger = 技术争论
4. 允许interrupt=true当dominant_leader或industry_insider在抢话
5. 如果刚才在争论，可以让他们继续对峙（但不超过3轮）`;
}
