'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import ChatRoom from '@/components/chat/ChatRoom';

interface PersonaCard {
  name: string;
  background: string;
  personality_type: string;
  aggressiveness: number;
  knowledge_depth: string;
  speaking_style: string;
  bias_tendency: string;
}

interface ParticipantInfo {
  id: string;
  display_name: string;
  type: 'human' | 'ai' | 'host';
  avatar_color: string;
  background_summary?: string | null;
  persona_card?: PersonaCard | null;
}

interface SessionData {
  session_id: string;
  topic: {
    title: string;
    description: string;
    type?: string;
    background_material?: string;
    key_questions?: string[];
  };
  jd_text?: string;
  participants: ParticipantInfo[];
  config: {
    duration_minutes: number;
    phases: { opening: number; discussion: number; summary: number };
  };
  opening: {
    host_welcome?: string;
    host_participant?: {
      id: string;
      display_name: string;
      avatar_color: string;
    } | null;
    system_message?: string;
    ai_responses: {
      participant_id: string;
      participant_name: string;
      content: string;
      delay_ms: number;
    }[];
  };
}

interface ChatMessage {
  id: string;
  participant_id: string;
  participant_name: string;
  participant_type: 'human' | 'ai' | 'host';
  content: string;
  is_interrupt: boolean;
  is_system: boolean;
  avatar_color: string;
  timestamp: string;
}

export default function SessionPage() {
  const router = useRouter();
  const params = useParams();
  const sessionId = params.id as string;

  const [sessionData, setSessionData] = useState<SessionData | null>(null);
  const [initialMessages, setInitialMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    async function startSession() {
      try {
        setLoading(true);
        const res = await fetch(`/api/sessions/${sessionId}/start`, {
          method: 'POST',
        });

        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error?.message || 'Failed to start session');
        }

        const data: SessionData = await res.json();
        setSessionData(data);

        // Build initial messages
        const messages: ChatMessage[] = [];

        // Host welcome message
        if (data.opening.host_welcome && data.opening.host_participant) {
          messages.push({
            id: crypto.randomUUID(),
            participant_id: data.opening.host_participant.id,
            participant_name: data.opening.host_participant.display_name,
            participant_type: 'host',
            content: data.opening.host_welcome,
            is_interrupt: false,
            is_system: false,
            avatar_color: data.opening.host_participant.avatar_color,
            timestamp: new Date().toISOString(),
          });
        } else if (data.opening.system_message) {
          // Fallback to old system message format
          messages.push({
            id: crypto.randomUUID(),
            participant_id: 'system',
            participant_name: '系统',
            participant_type: 'ai',
            content: data.opening.system_message,
            is_interrupt: false,
            is_system: true,
            avatar_color: '#666',
            timestamp: new Date().toISOString(),
          });
        }

        // AI opening statements
        for (const r of data.opening.ai_responses) {
          const participant = data.participants.find(p => p.id === r.participant_id);
          messages.push({
            id: crypto.randomUUID(),
            participant_id: r.participant_id,
            participant_name: r.participant_name,
            participant_type: 'ai',
            content: r.content,
            is_interrupt: false,
            is_system: false,
            avatar_color: participant?.avatar_color || '#666',
            timestamp: new Date().toISOString(),
          });
        }

        setInitialMessages(messages);
      } catch (err) {
        setError(err instanceof Error ? err.message : '启动失败');
      } finally {
        setLoading(false);
      }
    }

    startSession();
  }, [sessionId]);

  const handleSessionEnd = useCallback(() => {
    router.push(`/session/${sessionId}/evaluation`);
  }, [router, sessionId]);

  if (loading) {
    return (
      <div style={{
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 16,
      }}>
        <div className="animate-pulse" style={{
          width: 48,
          height: 48,
          borderRadius: '50%',
          background: 'var(--accent)',
        }} />
        <p style={{ color: 'var(--text-secondary)' }}>正在生成话题和候选人...</p>
        <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>
          AI正在根据JD创建讨论话题和候选人角色
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 16,
      }}>
        <p style={{ color: 'var(--danger)', fontSize: 16 }}>{error}</p>
        <button
          className="btn btn-secondary"
          onClick={() => router.push('/session/new')}
        >
          返回重新创建
        </button>
      </div>
    );
  }

  if (!sessionData) return null;

  return (
    <ChatRoom
      sessionId={sessionId}
      topic={sessionData.topic}
      participants={sessionData.participants}
      config={sessionData.config}
      jdText={sessionData.jd_text}
      initialMessages={initialMessages}
      onSessionEnd={handleSessionEnd}
    />
  );
}
