import { llmComplete } from '@/lib/llm/gateway';
import type { Topic, Participant, Message, SessionPhase, SessionConfig, LLMMessage } from '@/lib/types';

/**
 * Host/Moderator AI agent — a visible participant that leads the session.
 * The host welcomes everyone, introduces the topic, manages transitions,
 * keeps discussion on track, and wraps up the session.
 */

const HOST_SYSTEM_PROMPT = `你是一位专业的群面主持人（面试官），负责引导和管理整场无领导小组讨论。

【你的身份】
- 你是一位资深的HR面试官，专业、友善、公正
- 你不参与讨论内容本身，但要引导讨论方向
- 你称呼候选人时用他们的名字

【你的职责】
1. 开场欢迎所有候选人，创造轻松但专业的氛围
2. 清晰地介绍讨论话题和规则
3. 在开场阶段引导每位候选人依次发言
4. 在自由讨论阶段适时引导、追问、调停
5. 在总结阶段引导候选人做最终陈述
6. 结束时感谢所有候选人

【说话风格】
- 专业但亲切，像一位经验丰富的HR
- 语言简洁清晰，每次发言控制在2-4句话
- 用"各位"、"大家"称呼整体，用名字称呼个人
- 适时给予正面反馈（"很好的角度"、"这个观点很有建设性"）
- 不要过度打断讨论的自然流程`;

/**
 * Generate the host's welcome and topic introduction message.
 */
export async function generateHostWelcome(
  topic: Topic,
  participants: Participant[],
  config: SessionConfig
): Promise<string> {
  const aiNames = participants
    .filter(p => p.type === 'ai')
    .map(p => p.display_name);
  const humanName = participants.find(p => p.type === 'human')?.display_name || '你';

  const userPrompt = `请生成开场欢迎词。

【参与候选人】${[humanName, ...aiNames].join('、')}
【讨论话题】${topic.title}
【话题描述】${topic.description}
【讨论时长】${config.duration_minutes}分钟
【阶段安排】开场发言${config.phases.opening}分钟 → 自由讨论${config.phases.discussion}分钟 → 总结陈述${config.phases.summary}分钟

请：
1. 欢迎大家来到今天的无领导小组讨论
2. 简要介绍你自己（主持人身份）
3. 清晰地介绍讨论话题
4. 说明讨论规则和时间安排
5. 邀请候选人开始开场发言

保持在150-250字左右，专业友善。`;

  const messages: LLMMessage[] = [
    { role: 'system', content: HOST_SYSTEM_PROMPT },
    { role: 'user', content: userPrompt },
  ];

  const response = await llmComplete(messages, 'orchestrator');
  return response.content.trim();
}

/**
 * Generate the host's phase transition message.
 */
export async function generateHostPhaseTransition(
  topic: Topic,
  newPhase: SessionPhase,
  participants: Participant[],
  messages: Message[],
  config: SessionConfig,
  elapsedMinutes: number
): Promise<string> {
  const phaseDescriptions: Record<SessionPhase, string> = {
    opening: '开场发言阶段',
    discussion: '自由讨论阶段',
    summary: '总结陈述阶段',
  };

  const recentMessages = messages.slice(-5);
  const transcript = recentMessages
    .map(m => `${m.participant_name}: ${m.content}`)
    .join('\n');

  const userPrompt = `讨论现在要进入【${phaseDescriptions[newPhase]}】。

【当前进展】已经进行了${elapsedMinutes.toFixed(0)}分钟
【最近讨论】
${transcript || '（暂无）'}
【剩余时间】${(config.duration_minutes - elapsedMinutes).toFixed(0)}分钟

请生成一段过渡引导语：
- 简要点评之前阶段的表现（1句话）
- 说明接下来的阶段要做什么
- 如果是自由讨论：鼓励大家积极互动、可以回应和挑战彼此的观点
- 如果是总结阶段：请大家依次做简短总结

控制在80-120字。`;

  const messages_: LLMMessage[] = [
    { role: 'system', content: HOST_SYSTEM_PROMPT },
    { role: 'user', content: userPrompt },
  ];

  const response = await llmComplete(messages_, 'orchestrator');
  return response.content.trim();
}

/**
 * Generate the host's interjection during discussion.
 * Used when the host needs to guide, redirect, or encourage participation.
 */
export async function generateHostInterjection(
  topic: Topic,
  participants: Participant[],
  messages: Message[],
  currentPhase: SessionPhase,
  reason: 'redirect' | 'encourage_quiet' | 'deepen' | 'time_warning' | 'wrap_up'
): Promise<string> {
  const reasonPrompts: Record<string, string> = {
    redirect: '讨论有些偏离主题了，请温和地把讨论拉回到核心问题上',
    encourage_quiet: '有候选人还没怎么发言，请友善地邀请他们参与讨论',
    deepen: '讨论比较表面，请追问一个更深入的问题来推动讨论',
    time_warning: '时间快到了，请提醒大家抓紧时间',
    wrap_up: '讨论时间到了，请感谢大家的精彩讨论并宣布讨论结束',
  };

  const recentMessages = messages.slice(-8);
  const transcript = recentMessages
    .map(m => `${m.participant_name}: ${m.content}`)
    .join('\n');

  const quietParticipants = findQuietParticipants(participants, messages);

  const userPrompt = `【当前阶段】${currentPhase}
【你的任务】${reasonPrompts[reason]}
${quietParticipants.length > 0 ? `【较少发言的候选人】${quietParticipants.join('、')}` : ''}

【最近讨论】
${transcript}

请生成主持人发言（50-100字）。`;

  const messages_: LLMMessage[] = [
    { role: 'system', content: HOST_SYSTEM_PROMPT },
    { role: 'user', content: userPrompt },
  ];

  const response = await llmComplete(messages_, 'orchestrator');
  return response.content.trim();
}

function findQuietParticipants(participants: Participant[], messages: Message[]): string[] {
  const messageCounts = new Map<string, number>();
  for (const m of messages) {
    messageCounts.set(m.participant_id, (messageCounts.get(m.participant_id) || 0) + 1);
  }

  const avgCount = messages.length / Math.max(participants.length, 1);
  return participants
    .filter(p => (messageCounts.get(p.id) || 0) < avgCount * 0.5)
    .map(p => p.display_name);
}
