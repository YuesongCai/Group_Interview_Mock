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
import { generateEvaluation } from '@/lib/agents/evaluator';
import { DEFAULT_SESSION_CONFIG, AVATAR_COLORS } from './types';
import type { SessionState } from './types';

// In-memory session store (replace with Redis in production)
const sessions = new Map<string, SessionState>();

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

  state.participants = [humanParticipant, ...aiParticipants];
  state.session.status = 'ready';

  return state;
}

/**
 * Start the session (opening phase).
 */
export async function startSession(sessionId: string): Promise<{
  systemMessage: string;
  aiResponses: { participant: Participant; content: string; delay_ms: number }[];
}> {
  const state = sessions.get(sessionId);
  if (!state || !state.topic) throw new Error('Session not ready');

  state.session.status = 'opening';
  state.session.phase = 'opening';
  state.session.started_at = new Date().toISOString();
  state.startedAt = Date.now();
  state.phaseStartedAt = Date.now();

  const openingDecision = getOpeningInstructions(state.participants, state.topic);

  // Generate AI opening statements in parallel
  const aiResponses = await Promise.all(
    openingDecision.responders.map(async (r) => {
      const participant = state.participants.find(p => p.id === r.participant_id);
      if (!participant?.persona_card) return null;

      const content = await generateParticipantResponse(
        participant.persona_card,
        [],
        'opening',
        r.instruction
      );

      // Store message
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

      return { participant, content, delay_ms: r.delay_ms };
    })
  );

  return {
    systemMessage: openingDecision.system_message || '',
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
  sessionEnded?: boolean;
}> {
  const state = sessions.get(sessionId);
  if (!state || !state.topic) throw new Error('Session not found');

  const humanParticipant = state.participants.find(p => p.type === 'human');
  if (!humanParticipant) throw new Error('Human participant not found');

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
    return { aiResponses: [], sessionEnded: true };
  }

  if (newPhase) {
    state.session.phase = newPhase;
    state.phaseStartedAt = Date.now();
  }

  // Get orchestrator decision
  const decision = await getOrchestratorDecision(
    state.messages,
    state.participants,
    state.topic,
    state.session.config,
    state.session.phase || 'discussion',
    elapsedMinutes
  );

  // Apply phase change from orchestrator
  if (decision.phase_change) {
    state.session.phase = decision.phase_change;
    state.phaseStartedAt = Date.now();
  }

  // Generate AI responses
  const aiResponses = await Promise.all(
    decision.responders.map(async (r) => {
      const participant = state.participants.find(p => p.id === r.participant_id);
      if (!participant?.persona_card) return null;

      const aiContent = await generateParticipantResponse(
        participant.persona_card,
        state.messages,
        state.session.phase || 'discussion',
        r.instruction
      );

      // Store AI message
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

      return {
        participant,
        content: aiContent,
        delay_ms: r.delay_ms,
        is_interrupt: r.is_interrupt,
      };
    })
  );

  return {
    aiResponses: aiResponses.filter((r): r is NonNullable<typeof r> => r !== null),
    phaseChange: decision.phase_change || newPhase || undefined,
    systemMessage: decision.system_message || undefined,
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
