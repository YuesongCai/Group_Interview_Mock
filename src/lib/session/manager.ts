import { v4 as uuidv4 } from 'uuid';
import type {
  Session,
  Participant,
  Message,
  Topic,
  SessionConfig,
  SessionPhase,
  SessionStatus,
  DurationPreset,
} from '@/lib/types';
import { generateTopic } from '@/lib/agents/topic-generator';
import { generatePersonas } from '@/lib/agents/persona-generator';
import { getOrchestratorDecision, getOpeningInstructions, checkPhaseTransition } from '@/lib/agents/orchestrator';
import { generateParticipantResponse, generateInnerMonologue, extractTopicKeyData } from '@/lib/agents/participant';
import { generateHostWelcome, generateHostPhaseTransition, generateHostInterjection } from '@/lib/agents/host';
import { generateEvaluation } from '@/lib/agents/evaluator';
import { DEFAULT_SESSION_CONFIG, DURATION_PRESETS, AVATAR_COLORS } from './types';
import type { SessionState } from './types';

// In-memory session store (replace with Redis in production)
const globalForSessions = globalThis as unknown as { __sessions: Map<string, SessionState> };
if (!globalForSessions.__sessions) {
  globalForSessions.__sessions = new Map<string, SessionState>();
}
const sessions = globalForSessions.__sessions;

const HOST_COLOR = '#10B981';

export function getSession(sessionId: string): SessionState | undefined {
  return sessions.get(sessionId);
}

export function getAllSessions(): SessionState[] {
  return Array.from(sessions.values());
}

/**
 * Create a new session with duration preset support.
 */
export function createSession(
  userId: string,
  jdText: string,
  resumeText?: string,
  config?: Partial<SessionConfig>,
  durationPreset?: DurationPreset
): Session {
  const id = uuidv4();

  // Apply duration preset if provided
  const preset = durationPreset ? DURATION_PRESETS[durationPreset] : null;
  const sessionConfig: SessionConfig = {
    ...DEFAULT_SESSION_CONFIG,
    ...config,
    ...(preset ? { duration_minutes: preset.duration, phases: preset.phases } : {}),
  };

  const session: Session = {
    id,
    user_id: userId,
    jd_text: jdText,
    resume_text: resumeText,
    status: 'created',
    config: sessionConfig,
    created_at: new Date().toISOString(),
  };

  sessions.set(id, {
    session,
    participants: [],
    messages: [],
    topic: null,
    startedAt: null,
    phaseStartedAt: null,
  });

  return session;
}

/**
 * Prepare session: generate topic and personas.
 */
export async function prepareSession(sessionId: string): Promise<SessionState> {
  const state = sessions.get(sessionId);
  if (!state) throw new Error('Session not found');

  state.session.status = 'generating';

  const [topic, personas] = await Promise.all([
    generateTopic(state.session.jd_text, state.session.resume_text, state.session.config.topic_style),
    generatePersonas(
      state.session.jd_text,
      state.session.config.participant_count - 1,
      state.session.config.difficulty,
      state.session.resume_text
    ),
  ]);

  state.topic = topic;
  state.session.topic = topic;

  // Create host participant (moderator)
  const hostParticipant: Participant = {
    id: uuidv4(),
    session_id: sessionId,
    type: 'human',
    display_name: '面试官',
    avatar_color: HOST_COLOR,
    created_at: new Date().toISOString(),
  };
  (hostParticipant as Participant & { is_host: boolean }).is_host = true;

  // Create human participant with user's chosen name
  const humanParticipant: Participant = {
    id: uuidv4(),
    session_id: sessionId,
    type: 'human',
    display_name: state.session.config.user_name || '你',
    avatar_color: AVATAR_COLORS[0],
    created_at: new Date().toISOString(),
  };

  // Create AI participants from personas
  const aiParticipants: Participant[] = personas.map((persona, i) => ({
    id: uuidv4(),
    session_id: sessionId,
    type: 'ai' as const,
    display_name: persona.name,
    persona_card: persona,
    avatar_color: AVATAR_COLORS[(i + 1) % AVATAR_COLORS.length],
    created_at: new Date().toISOString(),
  }));

  state.participants = [hostParticipant, humanParticipant, ...aiParticipants];
  state.session.status = 'ready';

  return state;
}

// Helper to check if participant is host
function isHost(p: Participant): boolean {
  return !!(p as Participant & { is_host?: boolean }).is_host;
}

function getHostParticipant(state: SessionState): Participant | undefined {
  return state.participants.find(isHost);
}

function getHumanParticipant(state: SessionState): Participant | undefined {
  return state.participants.find(p => p.type === 'human' && !isHost(p));
}

function getAiParticipants(state: SessionState): Participant[] {
  return state.participants.filter(p => p.type === 'ai' && !isHost(p));
}

function pushHostMessage(state: SessionState, host: Participant, content: string, phase: SessionPhase): Message {
  const msg: Message = {
    id: uuidv4(),
    session_id: state.session.id,
    participant_id: host.id,
    participant_name: host.display_name,
    participant_type: 'human',
    content,
    phase,
    is_interrupt: false,
    timestamp: new Date().toISOString(),
  };
  state.messages.push(msg);
  return msg;
}

/**
 * Start session — begins with intro phase.
 * Flow: Host welcome → Self-introductions → Briefing → Opening → Discussion → Summary → Q&A
 */
export async function startSession(sessionId: string): Promise<{
  hostWelcome: string;
  aiIntros: { participant: Participant; content: string; delay_ms: number }[];
  phase: SessionPhase;
}> {
  const state = sessions.get(sessionId);
  if (!state || !state.topic) throw new Error('Session not ready');

  state.session.status = 'opening';
  state.session.phase = 'intro';
  state.session.started_at = new Date().toISOString();
  state.startedAt = Date.now();
  state.phaseStartedAt = Date.now();

  const host = getHostParticipant(state);
  const human = getHumanParticipant(state);
  const userName = human?.display_name || '你';
  const aiNames = getAiParticipants(state).map(p => p.display_name);
  const allNames = [userName, ...aiNames];

  // Host welcome + introduce the interview flow
  let hostWelcome = '';
  try {
    hostWelcome = await generateHostWelcome(
      state.topic,
      state.participants.filter(p => !isHost(p)),
      state.session.config
    );
  } catch (error) {
    console.error('Failed to generate host welcome:', error);
    const lang = state.session.config.language;
    if (lang === 'en') {
      hostWelcome = `Welcome everyone! I'm the interviewer for today's group discussion.\n\nWe have ${allNames.length} candidates: ${allNames.join(', ')}.\n\nBefore we start, let's do a quick round of self-introductions. Please briefly share your name and background. ${userName}, would you like to go first?`;
    } else {
      hostWelcome = `各位候选人好！欢迎来到今天的无领导小组讨论。我是面试官。\n\n今天参加讨论的有${allNames.length}位候选人：${allNames.join('、')}。\n\n在正式开始之前，我们先做一轮简短的自我介绍。请大家简要介绍一下自己的姓名和背景。${userName}，你先来吧？`;
    }
  }

  if (host) {
    pushHostMessage(state, host, hostWelcome, 'intro');
  }

  // Generate AI self-introductions sequentially (QPS limit)
  const aiIntros: ({ participant: Participant; content: string; delay_ms: number } | null)[] = [];
  const aiParticipants = getAiParticipants(state);

  for (let i = 0; i < aiParticipants.length; i++) {
    const participant = aiParticipants[i];
    if (!participant.persona_card) continue;

    const lang = state.session.config.language;
    const instruction = lang === 'en'
      ? `This is the self-introduction phase. Briefly introduce yourself: your name, education background, and relevant experience. Keep it to 2-3 sentences. Be natural and confident.`
      : `这是自我介绍环节。请简要介绍你的名字、教育背景和相关经验。2-3句话，自然大方。`;

    const content = await generateParticipantResponse(
      participant.persona_card,
      state.messages,
      'intro',
      instruction
    );

    const message: Message = {
      id: uuidv4(),
      session_id: sessionId,
      participant_id: participant.id,
      participant_name: participant.display_name,
      participant_type: 'ai',
      content,
      phase: 'intro',
      is_interrupt: false,
      timestamp: new Date().toISOString(),
    };
    state.messages.push(message);

    aiIntros.push({ participant, content, delay_ms: 2000 + i * 3000 });
  }

  return {
    hostWelcome,
    aiIntros: aiIntros.filter((r): r is NonNullable<typeof r> => r !== null),
    phase: 'intro',
  };
}

/**
 * Advance to the next phase. Called by the client when ready to proceed.
 */
export async function advancePhase(sessionId: string): Promise<{
  phase: SessionPhase;
  hostMessage: string;
  aiResponses: { participant: Participant; content: string; delay_ms: number }[];
}> {
  const state = sessions.get(sessionId);
  if (!state || !state.topic) throw new Error('Session not found');

  const host = getHostParticipant(state);
  const currentPhase = state.session.phase || 'intro';
  const phaseOrder: SessionPhase[] = ['intro', 'briefing', 'opening', 'discussion', 'summary', 'qa'];
  const currentIdx = phaseOrder.indexOf(currentPhase);
  const nextPhase = phaseOrder[currentIdx + 1] || 'discussion';

  state.session.phase = nextPhase;
  state.session.status = nextPhase as SessionStatus;
  state.phaseStartedAt = Date.now();

  let hostMessage = '';
  const aiResponses: ({ participant: Participant; content: string; delay_ms: number } | null)[] = [];

  const lang = state.session.config.language;
  const isEn = lang === 'en';

  if (nextPhase === 'briefing') {
    // Host introduces topic and rules, starts reading time
    const topic = state.topic;
    const constraintBlock = topic.constraints && topic.constraints.length > 0
      ? (isEn
          ? `\n\n**Constraints:**\n${topic.constraints.map(c => `- ${c}`).join('\n')}`
          : `\n\n**约束条件：**\n${topic.constraints.map(c => `- ${c}`).join('\n')}`)
      : '';
    const taskBlock = topic.key_questions && topic.key_questions.length > 0
      ? (isEn
          ? `\n\n**Discussion Tasks:**\n${topic.key_questions.map((q, i) => `${i + 1}. ${q}`).join('\n')}`
          : `\n\n**讨论任务：**\n${topic.key_questions.map((q, i) => `${i + 1}. ${q}`).join('\n')}`)
      : '';
    if (isEn) {
      hostMessage = `Great, thank you all for the introductions!\n\nNow let me present today's case:\n\n**${topic.title}**\n\n${topic.description}\n\n${topic.background_material ? `**Background Material:**\n${topic.background_material}` : ''}${taskBlock}${constraintBlock}\n\nPlease take a moment to read through the material carefully. You'll have ${state.session.config.phases.briefing} minutes to prepare your thoughts before we begin the discussion.`;
    } else {
      hostMessage = `好的，感谢大家的自我介绍！\n\n现在我来介绍今天的讨论案例：\n\n**${topic.title}**\n\n${topic.description}\n\n${topic.background_material ? `**背景材料：**\n${topic.background_material}` : ''}${taskBlock}${constraintBlock}\n\n请大家仔细阅读左侧材料，你们有${state.session.config.phases.briefing}分钟的准备时间。准备好后我们开始正式讨论。`;
    }
    if (host) pushHostMessage(state, host, hostMessage, 'briefing');

  } else if (nextPhase === 'opening') {
    // Host invites opening statements
    if (isEn) {
      hostMessage = `Alright, reading time is up! Let's begin with opening statements. Each of you, please share your initial thoughts and key points on this case. Keep it brief — about 1-2 minutes each.`;
    } else {
      hostMessage = `好的，阅读时间到！现在请每位候选人依次做开场发言，分享你对这个案例的初步想法和关键观点。每人1-2分钟，简明扼要即可。`;
    }
    if (host) pushHostMessage(state, host, hostMessage, 'opening');

    // Generate AI opening statements
    const aiParticipants = getAiParticipants(state);
    for (let i = 0; i < aiParticipants.length; i++) {
      const participant = aiParticipants[i];
      if (!participant.persona_card) continue;

      const instruction = isEn
        ? `This is the opening statement phase. Share your initial analysis of the case. Present your key insight or proposed direction. Be concise (2-3 sentences).`
        : `这是开场发言阶段。分享你对案例的初步分析，提出你的核心观点或建议方向。保持简洁（2-3句话）。`;

      const content = await generateParticipantResponse(
        participant.persona_card,
        state.messages,
        'opening',
        instruction
      );

      const msg: Message = {
        id: uuidv4(),
        session_id: sessionId,
        participant_id: participant.id,
        participant_name: participant.display_name,
        participant_type: 'ai',
        content,
        phase: 'opening',
        is_interrupt: false,
        timestamp: new Date().toISOString(),
      };
      state.messages.push(msg);
      aiResponses.push({ participant, content, delay_ms: 2000 + i * 3000 });
    }

  } else if (nextPhase === 'discussion') {
    if (isEn) {
      hostMessage = `Excellent opening statements! Now let's move into free discussion. You have ${state.session.config.phases.discussion} minutes. Feel free to respond to each other, challenge ideas, and build on others' points. Remember: collaboration is key, but don't be afraid to disagree respectfully.`;
    } else {
      hostMessage = `很好的开场！现在进入自由讨论环节，时间${state.session.config.phases.discussion}分钟。大家可以自由回应彼此的观点，挑战不同意的想法，也可以在别人的基础上延伸。记住：合作很重要，但也不要怕提出不同意见。`;
    }
    if (host) pushHostMessage(state, host, hostMessage, 'discussion');

  } else if (nextPhase === 'summary') {
    if (isEn) {
      hostMessage = `We're entering the final ${state.session.config.phases.summary} minutes. Please start wrapping up. Each of you, give a brief summary of your position and the group's key conclusions.`;
    } else {
      hostMessage = `我们进入最后${state.session.config.phases.summary}分钟的总结阶段。请每位候选人简要总结你的核心立场和小组的主要结论。`;
    }
    if (host) pushHostMessage(state, host, hostMessage, 'summary');

    // Generate AI summary statements
    const aiParticipants = getAiParticipants(state);
    for (let i = 0; i < aiParticipants.length; i++) {
      const participant = aiParticipants[i];
      if (!participant.persona_card) continue;

      const instruction = isEn
        ? `This is the summary phase. Briefly summarize your key position, what the group agreed on, and your unique contribution to the discussion.`
        : `这是总结阶段。简要总结你的核心立场、小组达成的共识，以及你在讨论中的独特贡献。`;

      const content = await generateParticipantResponse(
        participant.persona_card,
        state.messages,
        'summary',
        instruction
      );

      const msg: Message = {
        id: uuidv4(),
        session_id: sessionId,
        participant_id: participant.id,
        participant_name: participant.display_name,
        participant_type: 'ai',
        content,
        phase: 'summary',
        is_interrupt: false,
        timestamp: new Date().toISOString(),
      };
      state.messages.push(msg);
      aiResponses.push({ participant, content, delay_ms: 2000 + i * 3000 });
    }

  } else if (nextPhase === 'qa') {
    const humanName = getHumanParticipant(state)?.display_name || '你';
    if (isEn) {
      hostMessage = `Thank you for the discussion! Now I have a few follow-up questions based on what I observed. ${humanName}, let me start with you — I noticed some interesting points you raised. I'll be asking each of you individually, so please answer on your own.`;
    } else {
      hostMessage = `感谢各位的讨论！现在是面试官追问环节。我会根据刚才观察到的内容，针对每位候选人提出个性化的问题。${humanName}，我先从你开始——我注意到你刚才提出了一些有意思的观点。每个问题请各自回答，不要互相帮忙。`;
    }
    if (host) pushHostMessage(state, host, hostMessage, 'qa');
  }

  return {
    phase: nextPhase,
    hostMessage,
    aiResponses: aiResponses.filter((r): r is NonNullable<typeof r> => r !== null),
  };
}

/**
 * Handle a user message and generate AI responses.
 */
export async function handleUserMessage(
  sessionId: string,
  content: string
): Promise<{
  aiResponses: { participant: Participant; content: string; delay_ms: number; is_interrupt: boolean; inner_monologue?: string }[];
  phaseChange?: SessionPhase;
  systemMessage?: string;
  hostMessage?: string;
  sessionEnded?: boolean;
}> {
  const state = sessions.get(sessionId);
  if (!state || !state.topic) throw new Error('Session not found');

  const human = getHumanParticipant(state);
  if (!human) throw new Error('Human participant not found');

  const host = getHostParticipant(state);
  const currentPhase = state.session.phase || 'discussion';

  // Store user message
  const userMessage: Message = {
    id: uuidv4(),
    session_id: sessionId,
    participant_id: human.id,
    participant_name: human.display_name,
    participant_type: 'human',
    content,
    phase: currentPhase,
    is_interrupt: false,
    timestamp: new Date().toISOString(),
  };
  state.messages.push(userMessage);

  const elapsedMinutes = state.startedAt
    ? (Date.now() - state.startedAt) / 60000
    : 0;

  // Handle intro phase: user just introduced themselves, host may comment
  if (currentPhase === 'intro') {
    let hostMessage: string | undefined;
    if (host) {
      const lang = state.session.config.language;
      const isEn = lang === 'en';
      hostMessage = isEn
        ? `Thank you, ${human.display_name}! Great introduction. Now that everyone has introduced themselves, let's move on to the case.`
        : `谢谢${human.display_name}！很好的自我介绍。大家都介绍完了，我们现在来看今天的案例。`;
      pushHostMessage(state, host, hostMessage, 'intro');
    }
    return { aiResponses: [], hostMessage };
  }

  // Handle Q&A phase: host follows up on user's answer
  if (currentPhase === 'qa') {
    let hostMessage: string | undefined;
    if (host) {
      try {
        hostMessage = await generateHostInterjection(
          state.topic, state.participants, state.messages,
          'qa', 'deepen'
        );
        pushHostMessage(state, host, hostMessage, 'qa');
      } catch {
        hostMessage = state.session.config.language === 'en'
          ? `Interesting perspective. Can you elaborate on that?`
          : `有意思的角度。能展开说说吗？`;
      }
    }
    return { aiResponses: [], hostMessage };
  }

  // Check if session should end (beyond total duration)
  if (elapsedMinutes >= state.session.config.duration_minutes) {
    state.session.status = 'evaluating';
    let hostMessage: string | undefined;
    if (host) {
      try {
        hostMessage = await generateHostInterjection(
          state.topic, state.participants, state.messages,
          currentPhase, 'wrap_up'
        );
      } catch {
        hostMessage = '讨论时间到！感谢各位候选人的精彩表现。';
      }
    }
    return { aiResponses: [], sessionEnded: true, hostMessage };
  }

  // Check time-based phase transition
  const newPhase = checkPhaseTransition(
    state.session.config,
    currentPhase,
    elapsedMinutes
  );

  let hostMessage: string | undefined;
  if (newPhase) {
    state.session.phase = newPhase;
    state.phaseStartedAt = Date.now();

    if (host) {
      try {
        hostMessage = await generateHostPhaseTransition(
          state.topic, newPhase, state.participants, state.messages,
          state.session.config, elapsedMinutes
        );
        pushHostMessage(state, host, hostMessage, newPhase);
      } catch (error) {
        console.error('Failed to generate host transition:', error);
      }
    }
  }

  // Occasional host interjection during discussion (every ~8 messages)
  const effectivePhase = newPhase || currentPhase;
  if (effectivePhase === 'discussion' && !hostMessage && host) {
    const messagesSinceLastHost = state.messages.slice(
      state.messages.findLastIndex(m => m.participant_id === host.id) + 1
    ).length;

    if (messagesSinceLastHost >= 8) {
      // Host chimes in
      try {
        const reasons: Array<'redirect' | 'encourage_quiet' | 'deepen' | 'time_warning'> = [];
        const timeLeft = state.session.config.duration_minutes - elapsedMinutes;
        if (timeLeft < 5) reasons.push('time_warning');
        reasons.push('deepen', 'encourage_quiet');
        const reason = reasons[Math.floor(Math.random() * reasons.length)];

        hostMessage = await generateHostInterjection(
          state.topic, state.participants, state.messages,
          effectivePhase, reason
        );
        pushHostMessage(state, host, hostMessage, effectivePhase);
      } catch {
        // Skip interjection on failure
      }
    }
  }

  // Deliver surprise info mid-discussion if threshold reached
  if (effectivePhase === 'discussion' && !state.surpriseDelivered &&
      state.topic.surprise_info && state.topic.surprise_trigger) {
    const discussionMsgCount = state.messages.filter(m => m.phase === 'discussion').length;
    if (discussionMsgCount >= state.topic.surprise_trigger && host) {
      state.surpriseDelivered = true;
      const lang = state.session.config.language;
      const surprisePrefix = lang === 'en' ? '**[Breaking Update]** ' : '**【最新消息】** ';
      const surpriseContent = surprisePrefix + state.topic.surprise_info;
      if (!hostMessage) {
        hostMessage = surpriseContent;
      } else {
        hostMessage += '\n\n' + surpriseContent;
      }
      pushHostMessage(state, host, surpriseContent, effectivePhase);
    }
  }

  // Get orchestrator decision for AI responses
  const nonHostParticipants = state.participants.filter(p => !isHost(p));
  const decision = await getOrchestratorDecision(
    state.messages,
    nonHostParticipants,
    state.topic,
    state.session.config,
    effectivePhase,
    elapsedMinutes
  );

  if (decision.phase_change && !newPhase) {
    state.session.phase = decision.phase_change;
    state.phaseStartedAt = Date.now();
  }

  // Generate AI responses sequentially (QPS limit)
  // Each response sees previous responder's message (already pushed to state.messages)
  const aiResponses: ({ participant: Participant; content: string; delay_ms: number; is_interrupt: boolean; inner_monologue?: string } | null)[] = [];
  if (!state.innerStates) state.innerStates = {};

  // Extract topic data for discussion-phase injection
  const topicKeyData = (effectivePhase === 'discussion' || effectivePhase === 'summary')
    ? extractTopicKeyData(state.topic)
    : undefined;

  for (const r of decision.responders) {
    const participant = state.participants.find(p => p.id === r.participant_id);
    if (!participant?.persona_card) {
      aiResponses.push(null);
      continue;
    }

    // Pass inner state from previous turn (if available)
    const innerState = state.innerStates[participant.id];

    const aiContent = await generateParticipantResponse(
      participant.persona_card,
      state.messages,
      effectivePhase,
      r.instruction,
      innerState,
      topicKeyData
    );

    const message: Message = {
      id: uuidv4(),
      session_id: sessionId,
      participant_id: participant.id,
      participant_name: participant.display_name,
      participant_type: 'ai',
      content: aiContent,
      phase: effectivePhase,
      is_interrupt: r.is_interrupt,
      timestamp: new Date().toISOString(),
    };
    state.messages.push(message);

    // Generate inner monologue — await it so we can return it to the frontend
    let monologue: string | undefined;
    try {
      monologue = await generateInnerMonologue(participant.persona_card, state.messages, aiContent) || undefined;
      if (monologue) {
        state.innerStates[participant.id] = monologue;
      }
    } catch {
      // Non-critical
    }

    aiResponses.push({
      participant,
      content: aiContent,
      delay_ms: r.delay_ms,
      is_interrupt: r.is_interrupt,
      inner_monologue: monologue,
    });
  }

  return {
    aiResponses: aiResponses.filter((r): r is NonNullable<typeof r> => r !== null),
    phaseChange: decision.phase_change || newPhase || undefined,
    systemMessage: decision.system_message || undefined,
    hostMessage,
  };
}

/**
 * Generate proactive AI messages without user input.
 */
export async function generateProactiveMessages(
  sessionId: string
): Promise<{
  aiResponses: { participant: Participant; content: string; delay_ms: number; is_interrupt: boolean; inner_monologue?: string }[];
  hostMessage?: string;
}> {
  const state = sessions.get(sessionId);
  if (!state || !state.topic) throw new Error('Session not found');

  const activePhases: SessionPhase[] = ['opening', 'discussion', 'summary'];
  const currentPhase = state.session.phase || 'discussion';
  if (!activePhases.includes(currentPhase)) {
    return { aiResponses: [] };
  }

  const aiParticipants = getAiParticipants(state);

  const sorted = [...aiParticipants].sort(
    (a, b) => (b.persona_card?.aggressiveness || 0) - (a.persona_card?.aggressiveness || 0)
  );

  const proactive = sorted.filter(p => (p.persona_card?.aggressiveness || 0) > 0.5);

  const speakers = proactive.filter(
    p => Math.random() < (p.persona_card?.aggressiveness || 0)
  ).slice(0, 2);

  if (speakers.length === 0 && proactive.length > 0) {
    speakers.push(proactive[0]);
  }

  if (speakers.length === 0) {
    return { aiResponses: [] };
  }

  const lastMessages = state.messages.slice(-5);
  const lastSpeakers = new Set(lastMessages.map(m => m.participant_id));

  const aiResponses: ({ participant: Participant; content: string; delay_ms: number; is_interrupt: boolean; inner_monologue?: string } | null)[] = [];

  if (!state.innerStates) state.innerStates = {};

  for (const speaker of speakers) {
    if (!speaker.persona_card) continue;
    if (lastSpeakers.has(speaker.id) && lastMessages.length > 2) continue;

    const instruction = buildProactiveInstruction(speaker, state.messages, currentPhase);
    const innerState = state.innerStates[speaker.id];
    const proactiveTopicData = (currentPhase === 'discussion' || currentPhase === 'summary')
      ? extractTopicKeyData(state.topic!)
      : undefined;

    const content = await generateParticipantResponse(
      speaker.persona_card,
      state.messages,
      currentPhase,
      instruction,
      innerState,
      proactiveTopicData
    );

    const message: Message = {
      id: uuidv4(),
      session_id: sessionId,
      participant_id: speaker.id,
      participant_name: speaker.display_name,
      participant_type: 'ai',
      content,
      phase: currentPhase,
      is_interrupt: true,
      timestamp: new Date().toISOString(),
    };
    state.messages.push(message);

    // Generate inner monologue — await for frontend display
    let monologue: string | undefined;
    try {
      monologue = await generateInnerMonologue(speaker.persona_card, state.messages, content) || undefined;
      if (monologue) {
        state.innerStates[speaker.id] = monologue;
      }
    } catch { /* non-critical */ }

    aiResponses.push({
      participant: speaker,
      content,
      delay_ms: 1000 + Math.random() * 2000,
      is_interrupt: true,
      inner_monologue: monologue,
    });
  }

  // Occasionally host chimes in during proactive messages
  let hostMessage: string | undefined;
  const host = getHostParticipant(state);
  if (host && currentPhase === 'discussion' && Math.random() < 0.3) {
    const elapsedMinutes = state.startedAt ? (Date.now() - state.startedAt) / 60000 : 0;
    const timeLeft = state.session.config.duration_minutes - elapsedMinutes;

    if (timeLeft < 3) {
      try {
        hostMessage = await generateHostInterjection(
          state.topic, state.participants, state.messages,
          currentPhase, 'time_warning'
        );
        pushHostMessage(state, host, hostMessage, currentPhase);
      } catch { /* skip */ }
    }
  }

  return {
    aiResponses: aiResponses.filter((r): r is NonNullable<typeof r> => r !== null),
    hostMessage,
  };
}

function buildProactiveInstruction(
  participant: Participant,
  messages: Message[],
  phase: SessionPhase
): string {
  const personality = participant.persona_card?.personality_type || '';
  const lastMessage = messages[messages.length - 1];

  if (messages.length <= 3) {
    return '讨论刚开始，主动抛出你对这个话题的一个新角度或者独特观点。';
  }

  if (personality === 'dominant_leader') {
    return lastMessage
      ? `抢先推进讨论方向。总结大家的共识然后带向你想去的方向。用你的框架思维主导节奏。`
      : '你来组织讨论，抛出框架和步骤。';
  }

  if (personality === 'analytical_challenger') {
    return lastMessage
      ? `找到刚才讨论中一个站不住脚的假设，直接质疑。说"但是"。`
      : '提出一个需要验证的关键假设。';
  }

  if (personality === 'industry_insider') {
    return lastMessage
      ? `用你的行业经验来回应刚才的讨论。如果觉得别人理解有偏差，直接纠正。`
      : '分享一个只有做过这个行业的人才知道的insight。';
  }

  if (personality === 'quant_thinker') {
    return lastMessage
      ? `对刚才讨论的方向做量化拆解。问"这个数怎么算"或者自己算一笔账。`
      : '抓住题目数据做一个快速拆解。';
  }

  if (personality === 'silent_observer') {
    return lastMessage
      ? `指出一个所有人都忽略的前提或矛盾。你的发言必须有独立信息增量。`
      : '提出一个你观察到的、别人没注意到的关键点。';
  }

  // strategic_integrator or default
  return lastMessage
    ? `整合前面几个人的观点，找到共识和分歧，提出一个更高层的理解。或者cue一个沉默的人。`
    : '简短分享你的初步想法。';
}

/**
 * End session and generate evaluation.
 */
export async function endSession(sessionId: string) {
  const state = sessions.get(sessionId);
  if (!state || !state.topic) throw new Error('Session not found');

  state.session.status = 'evaluating';
  state.session.ended_at = new Date().toISOString();

  const evaluation = await generateEvaluation(
    state.messages,
    state.participants,
    state.topic,
    state.session.user_id,
    sessionId
  );

  state.session.status = 'completed';
  return evaluation;
}

/**
 * Update session status.
 */
export function updateSessionStatus(sessionId: string, status: SessionStatus) {
  const state = sessions.get(sessionId);
  if (!state) throw new Error('Session not found');
  state.session.status = status;
}
