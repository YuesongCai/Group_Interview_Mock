import type { Session, Participant, Message, Topic, SessionConfig, PhaseConfig, DurationPreset } from '@/lib/types';

export interface SessionState {
  session: Session;
  participants: Participant[];
  messages: Message[];
  topic: Topic | null;
  startedAt: number | null; // timestamp ms
  phaseStartedAt: number | null;
  surpriseDelivered?: boolean; // Whether mid-discussion surprise info has been delivered
  innerStates?: Record<string, string>; // participant_id → latest inner monologue
}

// Duration presets with phase breakdowns
export const DURATION_PRESETS: Record<DurationPreset, { duration: number; phases: PhaseConfig }> = {
  '20min': {
    duration: 20,
    phases: { intro: 2, briefing: 2, opening: 2, discussion: 10, summary: 2, qa: 2 },
  },
  '30min': {
    duration: 30,
    phases: { intro: 3, briefing: 3, opening: 3, discussion: 14, summary: 3, qa: 4 },
  },
  '45min': {
    duration: 45,
    phases: { intro: 3, briefing: 5, opening: 4, discussion: 22, summary: 4, qa: 7 },
  },
  '60min': {
    duration: 60,
    phases: { intro: 5, briefing: 5, opening: 5, discussion: 28, summary: 7, qa: 10 },
  },
};

export const DEFAULT_SESSION_CONFIG: SessionConfig = {
  duration_minutes: 30,
  phases: DURATION_PRESETS['30min'].phases,
  difficulty: 'medium',
  participant_count: 4,
  language: 'zh',
  topic_style: 'case_study',
  user_name: '你',
};

export const AVATAR_COLORS = [
  '#4F46E5', // indigo
  '#059669', // emerald
  '#D97706', // amber
  '#DC2626', // red
  '#7C3AED', // violet
  '#0891B2', // cyan
];
