import { llmComplete } from '@/lib/llm/gateway';
import type { Topic, Participant, Message, SessionPhase, SessionConfig, LLMMessage } from '@/lib/types';

const HOST_SYSTEM_PROMPT = `你是一位专业的群面主持人（面试官），负责引导和管理整场无领导小组讨论。

【你的身份】
- 你是一位资深的HR面试官，专业、友善、公正
- 你不参与讨论内容本身，但要引导讨论方向
- 你称呼候选人时用他们的名字

【你的职责】
1. 开场欢迎所有候选人，组织自我介绍
2. 清晰地介绍讨论话题和规则
3. 在自由讨论阶段适时引导、追问、调停
4. 在总结阶段引导候选人做最终陈述
5. 在Q&A阶段追问每位候选人的独特贡献
6. 特别关注真人候选人的参与度

【说话风格】
- 专业但亲切，像一位经验丰富的HR
- 语言简洁清晰，每次发言控制在2-4句话
- 用名字称呼候选人个人
- 适时给予正面反馈
- 对真人候选人要特别关注和回应`;

/**
 * Generate host welcome message with self-introduction invitation.
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
  const allNames = [humanName, ...aiNames];
  const isEn = config.language === 'en';

  const userPrompt = isEn
    ? `Generate a welcome message for a group discussion interview.

【Candidates】${allNames.join(', ')}
【Discussion Duration】${config.duration_minutes} minutes
【Flow】Self-introductions → Case briefing & reading → Opening statements → Free discussion → Summary → Q&A

Instructions:
1. Welcome everyone warmly and introduce yourself as the interviewer
2. List the candidates by name
3. Explain the flow briefly
4. Invite everyone to do a quick round of self-introductions (name + background)
5. Specifically ask ${humanName} to go first

Keep it 120-200 words. Professional and friendly.`
    : `请生成群面开场欢迎词。

【参与候选人】${allNames.join('、')}
【讨论时长】${config.duration_minutes}分钟
【流程安排】自我介绍 → 案例介绍+阅读 → 开场发言 → 自由讨论 → 总结陈述 → 面试官追问

请：
1. 欢迎大家，介绍你自己是面试官
2. 点名所有候选人
3. 简要介绍今天的流程
4. 邀请大家先做一轮简短的自我介绍（姓名+背景）
5. 特别点名请${humanName}先来

保持在150-250字左右，专业友善。`;

  const messages: LLMMessage[] = [
    { role: 'system', content: HOST_SYSTEM_PROMPT },
    { role: 'user', content: userPrompt },
  ];

  const response = await llmComplete(messages, 'orchestrator');
  return response.content.trim();
}

/**
 * Generate host's phase transition message.
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
    intro: '自我介绍',
    briefing: '案例介绍与阅读',
    opening: '开场发言',
    discussion: '自由讨论',
    summary: '总结陈述',
    qa: '面试官追问',
  };

  const recentMessages = messages.slice(-5);
  const transcript = recentMessages
    .map(m => `${m.participant_name}: ${m.content}`)
    .join('\n');

  const humanName = participants.find(
    p => p.type === 'human' && !(p as unknown as { is_host?: boolean }).is_host
  )?.display_name || '你';

  const userPrompt = `讨论现在进入【${phaseDescriptions[newPhase]}】阶段。

【当前进展】已经进行了${elapsedMinutes.toFixed(0)}分钟
【最近讨论】
${transcript || '（暂无）'}
【剩余时间】${(config.duration_minutes - elapsedMinutes).toFixed(0)}分钟
【真人候选人】${humanName}

请生成一段过渡引导语：
- 简要点评之前阶段（1句话）
- 说明接下来的阶段要做什么
- 如果是自由讨论：鼓励大家积极互动、点名${humanName}分享想法
- 如果是总结阶段：请大家依次总结
- 如果是Q&A：说明你会针对每个人的表现提问

控制在80-120字。`;

  const messages_: LLMMessage[] = [
    { role: 'system', content: HOST_SYSTEM_PROMPT },
    { role: 'user', content: userPrompt },
  ];

  const response = await llmComplete(messages_, 'orchestrator');
  return response.content.trim();
}

/**
 * Generate host interjection during discussion.
 */
export async function generateHostInterjection(
  topic: Topic,
  participants: Participant[],
  messages: Message[],
  currentPhase: SessionPhase,
  reason: 'redirect' | 'encourage_quiet' | 'deepen' | 'time_warning' | 'wrap_up'
): Promise<string> {
  const humanName = participants.find(
    p => p.type === 'human' && !(p as unknown as { is_host?: boolean }).is_host
  )?.display_name || '你';

  const reasonPrompts: Record<string, string> = {
    redirect: '讨论有些偏离主题了，请温和地把讨论拉回到核心问题上',
    encourage_quiet: `有候选人还没怎么发言（特别关注${humanName}），请友善地邀请他们参与讨论`,
    deepen: `讨论比较表面，请追问一个更深入的问题来推动讨论，特别是回应${humanName}提出的观点`,
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
【真人候选人】${humanName}

【最近讨论】
${transcript}

请生成主持人发言（50-100字）。要用候选人的名字来称呼他们。`;

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
