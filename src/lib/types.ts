// ============================================================
// GroupMock Core Types
// ============================================================

// --- Session ---

export type SessionStatus =
  | 'created'
  | 'parsing'
  | 'generating'
  | 'ready'
  | 'opening'
  | 'discussion'
  | 'summary'
  | 'evaluating'
  | 'completed'
  | 'paused'
  | 'abandoned';

export type SessionPhase = 'opening' | 'discussion' | 'summary';

export type Difficulty = 'easy' | 'medium' | 'hard';

export interface SessionConfig {
  duration_minutes: number;
  phases: {
    opening: number;   // minutes
    discussion: number;
    summary: number;
  };
  difficulty: Difficulty;
  participant_count: number;
  language: 'zh' | 'en';
}

export interface Session {
  id: string;
  user_id: string;
  jd_text: string;
  resume_text?: string;
  topic?: Topic;
  status: SessionStatus;
  phase?: SessionPhase;
  config: SessionConfig;
  started_at?: string;
  ended_at?: string;
  created_at: string;
}

// --- Topic ---

export type TopicType = 'case_study' | 'debate' | 'prioritization';

export interface Topic {
  title: string;
  description: string;
  type: TopicType;
  background_material?: string;
  key_questions?: string[];
}

// --- Participants ---

export type ParticipantType = 'human' | 'ai';

export type PersonalityArchetype =
  | 'assertive_leader'
  | 'analytical_thinker'
  | 'collaborative_mediator'
  | 'quiet_observer'
  | 'devils_advocate';

export interface PersonaCard {
  name: string;
  background: string;
  personality_type: PersonalityArchetype;
  aggressiveness: number; // 0.0 - 1.0
  knowledge_depth: string;
  speaking_style: string;
  bias_tendency: string;
}

export interface Participant {
  id: string;
  session_id: string;
  type: ParticipantType;
  display_name: string;
  persona_card?: PersonaCard;
  avatar_color: string;
  created_at: string;
}

// --- Messages ---

export interface Message {
  id: string;
  session_id: string;
  participant_id: string;
  participant_name?: string;
  participant_type?: ParticipantType;
  content: string;
  phase: SessionPhase;
  is_interrupt: boolean;
  timestamp: string;
}

// --- WebSocket ---

export type WSMessageType =
  | 'user_message'
  | 'ai_message'
  | 'system_event'
  | 'phase_change'
  | 'interrupt'
  | 'typing_indicator'
  | 'session_end';

export interface WSMessage {
  type: WSMessageType;
  payload: {
    content?: string;
    participant_id?: string;
    participant_name?: string;
    phase?: SessionPhase;
    event?: string;
    metadata?: Record<string, unknown>;
  };
  timestamp: string;
  participant_id?: string;
}

// --- Evaluation ---

export interface DimensionScore {
  score: number; // 0-100
  weight: number;
  evidence: {
    description: string;
    timestamp: string;
    quote: string;
  }[];
  improvement: string;
}

export interface Evaluation {
  id: string;
  session_id: string;
  user_id: string;
  overall_score: number;
  percentile: number;
  dimensions: {
    leadership_initiative: DimensionScore;
    logical_reasoning: DimensionScore;
    collaboration_eq: DimensionScore;
    communication_clarity: DimensionScore;
    innovation_insight: DimensionScore;
  };
  strengths: string[];
  improvement_areas: string[];
  comparison_narrative: string;
  replay_highlights: {
    type: 'strongest_argument' | 'missed_opportunity' | 'best_collaboration';
    timestamp: string;
    description: string;
  }[];
  created_at: string;
}

// --- LLM ---

export type LLMProvider = 'minimax' | 'deepseek' | 'glm';

export type AgentRole = 'orchestrator' | 'participant' | 'evaluator' | 'topic_generator' | 'persona_generator';

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LLMRequestOptions {
  provider?: LLMProvider;
  model?: string;
  temperature?: number;
  max_tokens?: number;
  stream?: boolean;
}

export interface LLMResponse {
  content: string;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}
