import { llmComplete } from '@/lib/llm/gateway';
import type {
  Message,
  Participant,
  SessionPhase,
  SessionConfig,
  Topic,
  LLMMessage,
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

const SYSTEM_PROMPT = `你是一个群面模拟的协调者（Orchestrator）。你不参与讨论内容，你的职责是：

1. 管理发言顺序，确保讨论流畅自然
2. 决定哪些AI候选人应该回应最新的发言
3. 控制节奏，避免讨论停滞或偏离主题
4. 在适当时候推动讨论进入下一阶段

你需要以JSON格式返回决策：
{
  "responders": [
    {
      "participant_id": "候选人ID",
      "instruction": "给这个候选人的具体指令，必须要求回应真人候选人的具体发言内容",
      "delay_ms": 模拟思考时间（毫秒，1000-5000）,
      "is_interrupt": false
    }
  ],
  "phase_change": null 或 "discussion" 或 "summary",
  "system_message": null 或 "系统消息内容"
}

【核心规则】
- 每轮至少1-2个、最多3个候选人回应
- 攻击性高的候选人回应概率更高，delay更短
- 如果【真人候选人】刚刚发言，至少安排1个候选人直接回应真人的观点（在instruction中要求引用真人的具体内容）
- 开场阶段按顺序，自由讨论阶段可以打断和抢话
- 总结阶段每人总结一次

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
    return JSON.parse(cleaned) as OrchestratorDecision;
  } catch {
    const aiParticipants = participants.filter(p => p.type === 'ai');
    const responder = aiParticipants[Math.floor(Math.random() * aiParticipants.length)];
    return {
      responders: responder ? [{
        participant_id: responder.id,
        instruction: '回应最新的讨论内容，特别是真人候选人的观点，引用其具体发言',
        delay_ms: 2000,
        is_interrupt: false,
      }] : [],
    };
  }
}

/**
 * Generate the opening phase instructions.
 */
export function getOpeningInstructions(
  participants: Participant[],
  topic: Topic
): OrchestratorDecision {
  const aiParticipants = participants.filter(p => p.type === 'ai');

  return {
    responders: aiParticipants.map((p, i) => ({
      participant_id: p.id,
      instruction: `这是开场发言。请简要介绍你对"${topic.title}"这个话题的初步看法。保持简短（2-3句话），抛出你的核心观点。`,
      delay_ms: 3000 + i * 4000,
      is_interrupt: false,
    })),
  };
}

/**
 * Check if phase should transition based on elapsed time.
 * Updated for new 6-phase system.
 */
export function checkPhaseTransition(
  config: SessionConfig,
  currentPhase: SessionPhase,
  elapsedMinutes: number
): SessionPhase | null {
  const { phases } = config;

  // Calculate cumulative phase end times
  const introEnd = phases.intro;
  const briefingEnd = introEnd + phases.briefing;
  const openingEnd = briefingEnd + phases.opening;
  const discussionEnd = openingEnd + phases.discussion;
  const summaryEnd = discussionEnd + phases.summary;

  if (currentPhase === 'intro' && elapsedMinutes >= introEnd) {
    return 'briefing';
  }
  if (currentPhase === 'briefing' && elapsedMinutes >= briefingEnd) {
    return 'opening';
  }
  if (currentPhase === 'opening' && elapsedMinutes >= openingEnd) {
    return 'discussion';
  }
  if (currentPhase === 'discussion' && elapsedMinutes >= discussionEnd) {
    return 'summary';
  }
  if (currentPhase === 'summary' && elapsedMinutes >= summaryEnd) {
    return 'qa';
  }

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
        return `- ${p.display_name} (真人候选人 - 所有AI必须积极回应此人的发言)`;
      }
      const persona = p.persona_card;
      return `- ${p.display_name} [ID: ${p.id}] (AI, 性格: ${persona?.personality_type}, 攻击性: ${persona?.aggressiveness})`;
    })
    .join('\n');

  const timeRemaining = config.duration_minutes - elapsedMinutes;

  // Find last human message
  const lastHumanMsg = [...recentMessages].reverse().find(m => m.participant_type === 'human');
  const echoReminder = lastHumanMsg
    ? `\n\n【重要】真人候选人"${lastHumanMsg.participant_name}"刚说了："${lastHumanMsg.content.substring(0, 100)}"。请在instruction中要求至少一个AI候选人直接回应这段话的具体内容。`
    : '';

  return `【当前状态】
阶段: ${currentPhase}
已用时: ${elapsedMinutes.toFixed(1)}分钟
剩余时间: ${timeRemaining.toFixed(1)}分钟
话题: ${topic.title}

【参与者】
${participantInfo}

【最近对话记录】
${transcript || '（暂无对话）'}

【总消息数】${messages.length}
${echoReminder}

请决定接下来谁应该发言，给出什么样的指令。instruction中必须要求AI回应真人候选人的具体观点。`;
}
