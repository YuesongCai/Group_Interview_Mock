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

export type SessionPhase = 'intro' | 'briefing' | 'opening' | 'discussion' | 'summary' | 'qa';

export type Difficulty = 'easy' | 'medium' | 'hard';

export type TopicStyle = 'case_study' | 'debate' | 'prioritization';

export type DurationPreset = '20min' | '30min' | '45min' | '60min';

export interface PhaseConfig {
  intro: number;      // self-introductions
  briefing: number;   // host presents topic + silent reading
  opening: number;    // initial opinions
  discussion: number; // free discussion
  summary: number;    // summary statements
  qa: number;         // host Q&A challenges
}

export interface SessionConfig {
  duration_minutes: number;
  phases: PhaseConfig;
  difficulty: Difficulty;
  participant_count: number;
  language: 'zh' | 'en';
  topic_style: TopicStyle;
  user_name: string;  // user's display name for the session
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

// How closely the topic maps to the JD's actual industry
export type TopicMappingType = 'direct' | 'semi_direct' | 'indirect';

export interface Topic {
  title: string;
  description: string;  // Core question (1-2 sentences)
  type: TopicType;
  mapping_type?: TopicMappingType;
  background_material?: string;  // 2-3 paragraphs: company, challenge, market
  key_questions?: string[];      // 2-3 task requirements
  constraints?: string[];        // Budget, timeline, max options etc.
  surprise_info?: string;        // Mid-discussion twist (new info, email, data update)
  surprise_trigger?: number;     // Message count threshold to deliver surprise (e.g. 15)
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
  // Rich personality fields for natural conversation
  cognitive_bias: string;      // e.g. "幸存者偏差 - 总拿成功案例说事"
  verbal_habits: string[];     // e.g. ["先说结论再展开", "喜欢用'本质上'开头"]
  strength_blindspot: string;  // e.g. "数据分析很强但忽略用户情感"
  weakness: string;            // e.g. "容易在细节里迷失，忘记回归主线"
  cv_highlights: string[];     // e.g. ["字节跳动2年广告投放经验", "操盘过月GMV 500万的项目"]
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
