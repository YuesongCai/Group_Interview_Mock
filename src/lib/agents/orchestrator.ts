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
    delay_ms: number; // simulated think time
    is_interrupt: boolean;
  }[];
  phase_change?: SessionPhase;
  system_message?: string; // message from orchestrator to all
}

const SYSTEM_PROMPT = `你是一个群面模拟的主持人/协调者（Orchestrator）。你不参与讨论内容，你的职责是：

1. 管理发言顺序，确保讨论流畅自然
2. 决定哪些AI候选人应该回应最新的发言
3. 控制节奏，避免讨论停滞或偏离主题
4. 在适当时候推动讨论进入下一阶段

你需要以JSON格式返回决策：
{
  "responders": [
    {
      "participant_id": "候选人ID",
      "instruction": "给这个候选人的具体指令，如：回应用户关于成本的观点，提出不同看法",
      "delay_ms": 模拟思考时间（毫秒，1000-5000）,
      "is_interrupt": false
    }
  ],
  "phase_change": null 或 "discussion" 或 "summary",
  "system_message": null 或 "系统消息内容"
}

规则：
- 每轮最多2-3个候选人回应，避免所有人同时说话
- 攻击性高的候选人回应概率更高，delay更短
- 如果用户沉默太久（看消息间隔），让一个候选人主动发言引导
- 开场阶段按顺序发言，自由讨论阶段可以打断
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
    // Fallback: pick a random AI participant to respond
    const aiParticipants = participants.filter(p => p.type === 'ai');
    const responder = aiParticipants[Math.floor(Math.random() * aiParticipants.length)];
    return {
      responders: responder ? [{
        participant_id: responder.id,
        instruction: '回应最新的讨论内容，提出你的看法',
        delay_ms: 2000,
        is_interrupt: false,
      }] : [],
    };
  }
}

/**
 * Generate the opening phase messages (topic announcement + round-robin introductions).
 */
export function getOpeningInstructions(
  participants: Participant[],
  topic: Topic
): OrchestratorDecision {
  const aiParticipants = participants.filter(p => p.type === 'ai');

  return {
    system_message: `📋 今天的讨论话题：\n\n**${topic.title}**\n\n${topic.description}\n\n请每位候选人先简要阐述自己的初步想法，每人30秒左右。`,
    responders: aiParticipants.map((p, i) => ({
      participant_id: p.id,
      instruction: `这是开场发言。请简要介绍你对"${topic.title}"这个话题的初步看法。保持简短（2-3句话），抛出你的核心观点。`,
      delay_ms: 3000 + i * 4000, // stagger responses
      is_interrupt: false,
    })),
  };
}

/**
 * Check if phase should transition based on elapsed time.
 */
export function checkPhaseTransition(
  config: SessionConfig,
  currentPhase: SessionPhase,
  elapsedMinutes: number
): SessionPhase | null {
  const { phases } = config;

  if (currentPhase === 'opening' && elapsedMinutes >= phases.opening) {
    return 'discussion';
  }
  if (currentPhase === 'discussion' && elapsedMinutes >= phases.opening + phases.discussion) {
    return 'summary';
  }
  if (currentPhase === 'summary' && elapsedMinutes >= config.duration_minutes) {
    return null; // session ends
  }

  return null; // no transition
}

function buildPrompt(
  messages: Message[],
  participants: Participant[],
  topic: Topic,
  config: SessionConfig,
  currentPhase: SessionPhase,
  elapsedMinutes: number
): string {
  // Build recent transcript (sliding window: last 15 messages)
  const recentMessages = messages.slice(-15);
  const transcript = recentMessages
    .map(m => {
      const pName = m.participant_name || '未知';
      const pType = m.participant_type === 'human' ? '【用户】' : '';
      return `${pType}${pName}: ${m.content}`;
    })
    .join('\n');

  // Build participant info
  const participantInfo = participants
    .map(p => {
      if (p.type === 'human') {
        return `- ${p.display_name} (用户/真人候选人)`;
      }
      const persona = p.persona_card;
      return `- ${p.display_name} [ID: ${p.id}] (AI, 性格: ${persona?.personality_type}, 攻击性: ${persona?.aggressiveness})`;
    })
    .join('\n');

  // Calculate time remaining
  const timeRemaining = config.duration_minutes - elapsedMinutes;

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

请决定接下来谁应该发言，给出什么样的指令。`;
}
