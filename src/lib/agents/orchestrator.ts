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

// Discussion progression patterns
const DISCUSSION_PATTERNS = [
  'propose',    // A提出观点/框架
  'challenge',  // B质疑数据/假设
  'example',    // C用具体案例支撑或反驳
  'synthesize', // D综合整合，推进到下一层
] as const;

type DiscussionPattern = typeof DISCUSSION_PATTERNS[number];

const PATTERN_INSTRUCTIONS: Record<DiscussionPattern, string> = {
  propose: '提出一个新观点、框架或切入角度。用你自己的专业背景来支撑。不要重复前面说过的。',
  challenge: '质疑前面发言中的某个具体假设或数据。指出哪里站不住脚，为什么。用你的verbal habit说话。',
  example: '用你简历里的真实经历或一个具体案例来支撑或反驳前面的讨论。要有细节和数据。',
  synthesize: '把前面几个人的观点串起来。找到共识点，指出分歧点，提出一个整合方案或推进到更深一层的讨论。',
};

const SYSTEM_PROMPT = `你是一个群面模拟的协调者（Orchestrator）。你的核心职责是让讨论像真实群面一样自然推进，而不是轮流发言。

【核心原则】
讨论必须是递进式的，不是回音壁：
- A提出观点 → B用数据质疑 → C举实际案例反驳或支持 → D综合整合推到下一层
- 每一轮回应必须推进讨论，不能原地踏步

你需要以JSON格式返回决策：
{
  "responders": [
    {
      "participant_id": "候选人ID",
      "instruction": "具体指令（必须包含discussion_pattern和对真人候选人发言的回应要求）",
      "delay_ms": 模拟思考时间（毫秒，1000-5000）,
      "is_interrupt": false
    }
  ],
  "phase_change": null,
  "system_message": null
}

【决策规则】
1. 每轮1-2人回应（不要总是3人，真实群面不是每个人每轮都说话）
2. 选择回应者时考虑：
   - 谁的专业背景最适合回应当前话题？
   - 谁还没怎么说话？（但不要强迫quiet_observer频繁发言）
   - 当前讨论需要什么角色？（质疑者？举例者？综合者？）
3. instruction必须明确告诉AI要用什么pattern：
   - challenge: 质疑前面的某个具体假设
   - example: 用真实经历举例
   - synthesize: 综合前面的讨论
   - propose: 提出新角度
4. 如果真人候选人刚发言，至少1人必须直接回应真人的具体内容
5. 不要让同一个人连续发言（除非是被直接追问）
6. 讨论到了同一层面太久（3轮以上类似观点），要安排一个synthesize或一个全新的propose

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

    // Post-process: inject pattern-based instructions if missing
    decision.responders = decision.responders.map(r => {
      if (!r.instruction.includes('challenge') && !r.instruction.includes('example') &&
          !r.instruction.includes('synthesize') && !r.instruction.includes('propose') &&
          !r.instruction.includes('质疑') && !r.instruction.includes('举例') &&
          !r.instruction.includes('综合')) {
        // Assign a pattern based on discussion state
        const pattern = pickNextPattern(messages, r.participant_id, participants);
        r.instruction = `${PATTERN_INSTRUCTIONS[pattern]} 具体任务：${r.instruction}`;
      }
      return r;
    });

    return decision;
  } catch {
    // Fallback with pattern-aware logic
    return buildFallbackDecision(messages, participants);
  }
}

/**
 * Pick the next discussion pattern based on recent conversation flow.
 */
function pickNextPattern(messages: Message[], participantId: string, participants: Participant[]): DiscussionPattern {
  const recent = messages.slice(-6);
  const participant = participants.find(p => p.id === participantId);
  const archetype = participant?.persona_card?.personality_type;

  // Check what patterns were recently used (from instructions or content analysis)
  const recentHasPropose = recent.some(m => m.content.includes('我认为') || m.content.includes('框架'));
  const recentHasChallenge = recent.some(m => m.content.includes('但是') || m.content.includes('问题是'));

  // Archetype-aligned defaults
  if (archetype === 'devils_advocate') return 'challenge';
  if (archetype === 'analytical_thinker') return recentHasPropose ? 'challenge' : 'example';
  if (archetype === 'collaborative_mediator') return 'synthesize';
  if (archetype === 'quiet_observer') return recentHasChallenge ? 'synthesize' : 'example';
  if (archetype === 'assertive_leader') return recentHasPropose ? 'synthesize' : 'propose';

  // Generic progression
  if (!recentHasPropose) return 'propose';
  if (!recentHasChallenge) return 'challenge';
  return 'example';
}

/**
 * Build a fallback decision with pattern awareness.
 */
function buildFallbackDecision(messages: Message[], participants: Participant[]): OrchestratorDecision {
  const aiParticipants = participants.filter(p => p.type === 'ai');
  if (aiParticipants.length === 0) return { responders: [] };

  // Pick 1-2 responders based on who hasn't spoken recently
  const recentSpeakers = new Set(messages.slice(-4).map(m => m.participant_id));
  const candidates = aiParticipants.filter(p => !recentSpeakers.has(p.id));
  const pool = candidates.length > 0 ? candidates : aiParticipants;

  const count = Math.min(pool.length, messages.length < 5 ? 1 : 2);
  const selected = pool.sort(() => Math.random() - 0.5).slice(0, count);

  return {
    responders: selected.map(p => {
      const pattern = pickNextPattern(messages, p.id, participants);
      return {
        participant_id: p.id,
        instruction: PATTERN_INSTRUCTIONS[pattern] + ' 特别注意回应真人候选人的具体发言内容。',
        delay_ms: 1500 + Math.random() * 2000,
        is_interrupt: false,
      };
    }),
  };
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
      instruction: `这是开场发言。用你自己的专业视角切入"${topic.title}"这个话题。亮出你最擅长的角度，用你的口头禅和经历来说话。不要面面俱到，只说你最有底气的1个核心观点。`,
      delay_ms: 3000 + i * 4000,
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
      return `- ${p.display_name} [ID: ${p.id}] (${persona?.personality_type}, 攻击性:${persona?.aggressiveness}, 已发言${msgCount}次, 口头禅:${persona?.verbal_habits?.slice(0, 2).join('/')})`;
    })
    .join('\n');

  const timeRemaining = config.duration_minutes - elapsedMinutes;

  // Analyze discussion state
  const lastHumanMsg = [...recentMessages].reverse().find(m => m.participant_type === 'human');
  const echoReminder = lastHumanMsg
    ? `\n\n【重要】真人候选人"${lastHumanMsg.participant_name}"刚说了："${lastHumanMsg.content.substring(0, 100)}"。至少安排1人直接回应这段话的具体内容。`
    : '';

  // Check for echo chamber (too many similar sentiments)
  const lastFew = messages.slice(-5).map(m => m.content);
  const echoWarning = lastFew.length >= 4 && lastFew.every(c => c.includes('同意') || c.includes('对') || c.includes('没错'))
    ? '\n\n【警告】最近几轮讨论出现回音壁现象（大家都在互相同意）。安排一个challenge或propose来打破僵局！'
    : '';

  // Check who hasn't spoken recently
  const recentSpeakers = new Set(messages.slice(-8).map(m => m.participant_id));
  const quietOnes = participants
    .filter(p => p.type === 'ai' && !recentSpeakers.has(p.id))
    .map(p => p.display_name);
  const quietNote = quietOnes.length > 0
    ? `\n【较少发言的候选人】${quietOnes.join('、')}（可以考虑安排他们发言，但不要强迫）`
    : '';

  return `【当前状态】
阶段: ${currentPhase}
已用时: ${elapsedMinutes.toFixed(1)}分钟 | 剩余: ${timeRemaining.toFixed(1)}分钟
话题: ${topic.title}
总消息数: ${messages.length}

【参与者（含发言统计）】
${participantInfo}
${quietNote}

【最近对话】
${transcript || '（暂无对话）'}
${echoReminder}${echoWarning}

【你需要决定】
1. 谁应该回应？（1-2人，不要总是全员回应）
2. 用什么pattern？（propose/challenge/example/synthesize）
3. instruction要具体——不要说"回应讨论"，要说"质疑XX关于YY的假设"或"用你在ZZ的经历举例"`;
}
