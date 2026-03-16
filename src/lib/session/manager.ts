import { v4 as uuidv4 } from 'uuid';
import type {
  Session,
  Participant,
  Message,
  Topic,
  SessionConfig,
  SessionPhase,
  SessionStatus,
  Difficulty,
  PersonaCard,
} from '@/lib/types';
import { generateTopic } from '@/lib/agents/topic-generator';
import { generatePersonas } from '@/lib/agents/persona-generator';
import { getOrchestratorDecision, getOpeningInstructions, checkPhaseTransition } from '@/lib/agents/orchestrator';
import { generateParticipantResponse } from '@/lib/agents/participant';
import { generateHostWelcome, generateHostPhaseTransition, generateHostInterjection } from '@/lib/agents/host';
import { generateEvaluation } from '@/lib/agents/evaluator';
import { DEFAULT_SESSION_CONFIG, AVATAR_COLORS } from './types';
import type { SessionState } from './types';

// In-memory session store (replace with Redis in production)
// Use globalThis to persist across Next.js dev mode module reloads
const globalForSessions = globalThis as unknown as { __sessions: Map<string, SessionState> };
if (!globalForSessions.__sessions) {
  globalForSessions.__sessions = new Map<string, SessionState>();
}
const sessions = globalForSessions.__sessions;

const HOST_COLOR = '#10B981'; // emerald green for host

export function getSession(sessionId: string): SessionState | undefined {
  return sessions.get(sessionId);
}

export function getAllSessions(): SessionState[] {
  return Array.from(sessions.values());
}

/**
 * Create a new session.
 */
export function createSession(
  userId: string,
  jdText: string,
  resumeText?: string,
  config?: Partial<SessionConfig>
): Session {
  const id = uuidv4();
  const sessionConfig: SessionConfig = {
    ...DEFAULT_SESSION_CONFIG,
    ...config,
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

  // Update status to generating
  state.session.status = 'generating';

  // Generate topic and personas in parallel
  const [topic, personas] = await Promise.all([
    generateTopic(state.session.jd_text, state.session.resume_text),
    generatePersonas(
      state.session.jd_text,
      state.session.config.participant_count - 1, // minus the human user
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
    type: 'human', // stored as 'human' in DB type, but rendered as 'host' on client
    display_name: '面试官',
    avatar_color: HOST_COLOR,
    created_at: new Date().toISOString(),
  };
  // Tag it so we can identify it later
  (hostParticipant as Participant & { is_host: boolean }).is_host = true;

  // Create human participant
  const humanParticipant: Participant = {
    id: uuidv4(),
    session_id: sessionId,
    type: 'human',
    display_name: '你',
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

/**
 * Start the session (opening phase).
 * The host welcomes everyone, then AI candidates give opening statements.
 */
export async function startSession(sessionId: string): Promise<{
  hostWelcome: string;
  aiResponses: { participant: Participant; content: string; delay_ms: number }[];
}> {
  const state = sessions.get(sessionId);
  if (!state || !state.topic) throw new Error('Session not ready');

  state.session.status = 'opening';
  state.session.phase = 'opening';
  state.session.started_at = new Date().toISOString();
  state.startedAt = Date.now();
  state.phaseStartedAt = Date.now();

  const hostParticipant = state.participants.find(p => (p as Participant & { is_host?: boolean }).is_host);

  // Generate host welcome message
  let hostWelcome = '';
  try {
    hostWelcome = await generateHostWelcome(
      state.topic,
      state.participants.filter(p => !(p as Participant & { is_host?: boolean }).is_host),
      state.session.config
    );
  } catch (error) {
    console.error('Failed to generate host welcome:', error);
    hostWelcome = `各位候选人好！欢迎来到今天的无领导小组讨论。我是今天的面试官。\n\n今天我们讨论的话题是：**${state.topic.title}**\n\n${state.topic.description}\n\n讨论总时长${state.session.config.duration_minutes}分钟，请大家先依次做简短的开场发言。`;
  }

  // Store host welcome message
  if (hostParticipant) {
    const hostMessage: Message = {
      id: uuidv4(),
      session_id: sessionId,
      participant_id: hostParticipant.id,
      participant_name: hostParticipant.display_name,
      participant_type: 'human',
      content: hostWelcome,
      phase: 'opening',
      is_interrupt: false,
      timestamp: new Date().toISOString(),
    };
    state.messages.push(hostMessage);
  }

  // Get opening instructions for AI participants
  const nonHostParticipants = state.participants.filter(
    p => !(p as Participant & { is_host?: boolean }).is_host
  );
  const openingDecision = getOpeningInstructions(nonHostParticipants, state.topic);

  // Generate AI opening statements sequentially to respect provider QPS limits
  const aiResponses: ({ participant: Participant; content: string; delay_ms: number } | null)[] = [];
  for (const r of openingDecision.responders) {
    const participant = state.participants.find(p => p.id === r.participant_id);
    if (!participant?.persona_card) {
      aiResponses.push(null);
      continue;
    }

    const content = await generateParticipantResponse(
      participant.persona_card,
      [],
      'opening',
      r.instruction
    );

    const message: Message = {
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
    state.messages.push(message);

    aiResponses.push({ participant, content, delay_ms: r.delay_ms });
  }

  return {
    hostWelcome,
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
  aiResponses: { participant: Participant; content: string; delay_ms: number; is_interrupt: boolean }[];
  phaseChange?: SessionPhase;
  systemMessage?: string;
  hostMessage?: string;
  sessionEnded?: boolean;
}> {
  const state = sessions.get(sessionId);
  if (!state || !state.topic) throw new Error('Session not found');

  const humanParticipant = state.participants.find(
    p => p.type === 'human' && !(p as Participant & { is_host?: boolean }).is_host
  );
  if (!humanParticipant) throw new Error('Human participant not found');

  const hostParticipant = state.participants.find(
    p => (p as Participant & { is_host?: boolean }).is_host
  );

  // Store user message
  const userMessage: Message = {
    id: uuidv4(),
    session_id: sessionId,
    participant_id: humanParticipant.id,
    participant_name: humanParticipant.display_name,
    participant_type: 'human',
    content,
    phase: state.session.phase || 'discussion',
    is_interrupt: false,
    timestamp: new Date().toISOString(),
  };
  state.messages.push(userMessage);

  // Check phase transition
  const elapsedMinutes = state.startedAt
    ? (Date.now() - state.startedAt) / 60000
    : 0;

  const newPhase = checkPhaseTransition(
    state.session.config,
    state.session.phase || 'discussion',
    elapsedMinutes
  );

  // Check if session should end
  if (state.session.phase === 'summary' && elapsedMinutes >= state.session.config.duration_minutes) {
    state.session.status = 'evaluating';

    // Generate host wrap-up message
    let hostMessage: string | undefined;
    if (hostParticipant) {
      try {
        hostMessage = await generateHostInterjection(
          state.topic, state.participants, state.messages,
          'summary', 'wrap_up'
        );
      } catch {
        hostMessage = '讨论时间到！感谢各位候选人的精彩表现，现在进入评估环节。';
      }
    }

    return { aiResponses: [], sessionEnded: true, hostMessage };
  }

  // Handle phase transition with host message
  let hostMessage: string | undefined;
  if (newPhase) {
    state.session.phase = newPhase;
    state.phaseStartedAt = Date.now();

    if (hostParticipant) {
      try {
        hostMessage = await generateHostPhaseTransition(
          state.topic, newPhase, state.participants, state.messages,
          state.session.config, elapsedMinutes
        );
        // Store host message
        const hostMsg: Message = {
          id: uuidv4(),
          session_id: sessionId,
          participant_id: hostParticipant.id,
          participant_name: hostParticipant.display_name,
          participant_type: 'human',
          content: hostMessage,
          phase: newPhase,
          is_interrupt: false,
          timestamp: new Date().toISOString(),
        };
        state.messages.push(hostMsg);
      } catch (error) {
        console.error('Failed to generate host transition:', error);
      }
    }
  }

  // Get orchestrator decision (for AI candidate responses)
  const nonHostParticipants = state.participants.filter(
    p => !(p as Participant & { is_host?: boolean }).is_host
  );
  const decision = await getOrchestratorDecision(
    state.messages,
    nonHostParticipants,
    state.topic,
    state.session.config,
    state.session.phase || 'discussion',
    elapsedMinutes
  );

  // Apply phase change from orchestrator
  if (decision.phase_change && !newPhase) {
    state.session.phase = decision.phase_change;
    state.phaseStartedAt = Date.now();
  }

  // Generate AI responses sequentially to respect provider QPS limits
  const aiResponses: ({ participant: Participant; content: string; delay_ms: number; is_interrupt: boolean } | null)[] = [];
  for (const r of decision.responders) {
    const participant = state.participants.find(p => p.id === r.participant_id);
    if (!participant?.persona_card) {
      aiResponses.push(null);
      continue;
    }

    const aiContent = await generateParticipantResponse(
      participant.persona_card,
      state.messages,
      state.session.phase || 'discussion',
      r.instruction
    );

    const message: Message = {
      id: uuidv4(),
      session_id: sessionId,
      participant_id: participant.id,
      participant_name: participant.display_name,
      participant_type: 'ai',
      content: aiContent,
      phase: state.session.phase || 'discussion',
      is_interrupt: r.is_interrupt,
      timestamp: new Date().toISOString(),
    };
    state.messages.push(message);

    aiResponses.push({
      participant,
      content: aiContent,
      delay_ms: r.delay_ms,
      is_interrupt: r.is_interrupt,
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
