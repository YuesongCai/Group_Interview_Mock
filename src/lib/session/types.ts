import type { Session, Participant, Message, Topic, SessionConfig, SessionPhase } from '@/lib/types';

export interface SessionState {
  session: Session;
  participants: Participant[];
  messages: Message[];
  topic: Topic | null;
  startedAt: number | null; // timestamp ms
  phaseStartedAt: number | null;
}

export const DEFAULT_SESSION_CONFIG: SessionConfig = {
  duration_minutes: 25,
  phases: {
    opening: 3,
    discussion: 18,
    summary: 4,
  },
  difficulty: 'medium',
  participant_count: 4,
  language: 'zh',
};

export const AVATAR_COLORS = [
  '#4F46E5', // indigo
  '#059669', // emerald
  '#D97706', // amber
  '#DC2626', // red
  '#7C3AED', // violet
  '#0891B2', // cyan
];
