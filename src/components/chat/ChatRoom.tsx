'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import MessageBubble from './MessageBubble';
import MessageInput from './MessageInput';
import ParticipantList from './ParticipantList';
import PhaseTimer from './PhaseTimer';
import styles from './ChatRoom.module.css';

interface ParticipantInfo {
  id: string;
  display_name: string;
  type: 'human' | 'ai';
  avatar_color: string;
  background_summary?: string | null;
}

interface ChatMessage {
  id: string;
  participant_id: string;
  participant_name: string;
  participant_type: 'human' | 'ai';
  content: string;
  is_interrupt: boolean;
  is_system: boolean;
  avatar_color: string;
  timestamp: string;
}

interface ChatRoomProps {
  sessionId: string;
  topic: {
    title: string;
    description: string;
  };
  participants: ParticipantInfo[];
  config: {
    duration_minutes: number;
    phases: { opening: number; discussion: number; summary: number };
  };
  initialMessages?: ChatMessage[];
  onSessionEnd: () => void;
}

export default function ChatRoom({
  sessionId,
  topic,
  participants,
  config,
  initialMessages = [],
  onSessionEnd,
}: ChatRoomProps) {
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [phase, setPhase] = useState<string>('opening');
  const [isLoading, setIsLoading] = useState(false);
  const [typingIds, setTypingIds] = useState<string[]>([]);
  const [sessionEnded, setSessionEnded] = useState(false);
  const [startedAt] = useState(Date.now());
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const humanParticipant = participants.find(p => p.type === 'human');

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const addMessage = useCallback((msg: ChatMessage) => {
    setMessages(prev => [...prev, msg]);
  }, []);

  // Simulate delayed AI responses
  const deliverAiResponses = useCallback(
    async (responses: { participant_id: string; participant_name: string; content: string; delay_ms: number; is_interrupt: boolean }[]) => {
      for (const r of responses) {
        const participant = participants.find(p => p.id === r.participant_id);

        // Show typing indicator
        setTypingIds(prev => [...prev, r.participant_id]);
        await new Promise(resolve => setTimeout(resolve, Math.min(r.delay_ms, 3000)));
        setTypingIds(prev => prev.filter(id => id !== r.participant_id));

        addMessage({
          id: crypto.randomUUID(),
          participant_id: r.participant_id,
          participant_name: r.participant_name,
          participant_type: 'ai',
          content: r.content,
          is_interrupt: r.is_interrupt,
          is_system: false,
          avatar_color: participant?.avatar_color || '#666',
          timestamp: new Date().toISOString(),
        });
      }
    },
    [participants, addMessage]
  );

  // Send user message
  const handleSend = useCallback(async (content: string) => {
    if (!humanParticipant || isLoading || sessionEnded) return;

    // Add user message immediately
    addMessage({
      id: crypto.randomUUID(),
      participant_id: humanParticipant.id,
      participant_name: humanParticipant.display_name,
      participant_type: 'human',
      content,
      is_interrupt: false,
      is_system: false,
      avatar_color: humanParticipant.avatar_color,
      timestamp: new Date().toISOString(),
    });

    setIsLoading(true);

    try {
      const res = await fetch(`/api/sessions/${sessionId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      });

      const data = await res.json();

      if (data.system_message) {
        addMessage({
          id: crypto.randomUUID(),
          participant_id: 'system',
          participant_name: '系统',
          participant_type: 'ai',
          content: data.system_message,
          is_interrupt: false,
          is_system: true,
          avatar_color: '#666',
          timestamp: new Date().toISOString(),
        });
      }

      if (data.phase_change) {
        const phaseLabels: Record<string, string> = {
          discussion: '进入自由讨论环节',
          summary: '进入总结陈述环节',
        };
        setPhase(data.phase_change);
        if (phaseLabels[data.phase_change]) {
          addMessage({
            id: crypto.randomUUID(),
            participant_id: 'system',
            participant_name: '系统',
            participant_type: 'ai',
            content: phaseLabels[data.phase_change],
            is_interrupt: false,
            is_system: true,
            avatar_color: '#666',
            timestamp: new Date().toISOString(),
          });
        }
      }

      if (data.session_ended) {
        setSessionEnded(true);
        addMessage({
          id: crypto.randomUUID(),
          participant_id: 'system',
          participant_name: '系统',
          participant_type: 'ai',
          content: '讨论时间到！正在生成评估报告...',
          is_interrupt: false,
          is_system: true,
          avatar_color: '#666',
          timestamp: new Date().toISOString(),
        });
        onSessionEnd();
        return;
      }

      if (data.ai_responses?.length > 0) {
        await deliverAiResponses(data.ai_responses);
      }
    } catch (error) {
      console.error('Failed to send message:', error);
    } finally {
      setIsLoading(false);
    }
  }, [sessionId, humanParticipant, isLoading, sessionEnded, addMessage, deliverAiResponses, onSessionEnd]);

  const handleTimeUp = useCallback(() => {
    if (!sessionEnded) {
      setSessionEnded(true);
      addMessage({
        id: crypto.randomUUID(),
        participant_id: 'system',
        participant_name: '系统',
        participant_type: 'ai',
        content: '讨论时间到！',
        is_interrupt: false,
        is_system: true,
        avatar_color: '#666',
        timestamp: new Date().toISOString(),
      });
      onSessionEnd();
    }
  }, [sessionEnded, addMessage, onSessionEnd]);

  return (
    <div className={styles.chatRoom}>
      {/* Header */}
      <div className={styles.header}>
        <div className={styles.topicInfo}>
          <h2 className={styles.topicTitle}>{topic.title}</h2>
        </div>
        <button
          className="btn btn-danger"
          onClick={onSessionEnd}
          style={{ fontSize: '13px', padding: '6px 14px' }}
        >
          结束讨论
        </button>
      </div>

      {/* Timer */}
      <PhaseTimer
        phase={phase}
        totalMinutes={config.duration_minutes}
        startedAt={startedAt}
        onTimeUp={handleTimeUp}
      />

      {/* Main area */}
      <div className={styles.mainArea}>
        {/* Messages */}
        <div className={styles.messagesArea}>
          <div className={styles.messagesList}>
            {messages.map(msg => (
              <MessageBubble
                key={msg.id}
                participantName={msg.participant_name}
                content={msg.content}
                isUser={msg.participant_type === 'human'}
                isInterrupt={msg.is_interrupt}
                isSystem={msg.is_system}
                avatarColor={msg.avatar_color}
                timestamp={msg.timestamp}
              />
            ))}
            <div ref={messagesEndRef} />
          </div>

          <MessageInput
            onSend={handleSend}
            disabled={isLoading || sessionEnded}
            placeholder={
              sessionEnded
                ? '讨论已结束'
                : isLoading
                ? '等待其他候选人发言...'
                : '输入你的观点...'
            }
          />
        </div>

        {/* Participant sidebar */}
        <ParticipantList
          participants={participants}
          typingParticipantIds={typingIds}
        />
      </div>
    </div>
  );
}
