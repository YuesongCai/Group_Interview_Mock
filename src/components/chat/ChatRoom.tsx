'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import MessageBubble from './MessageBubble';
import MessageInput from './MessageInput';
import ParticipantList from './ParticipantList';
import PersonaCardModal from './PersonaCardModal';
import PhaseTimer from './PhaseTimer';
import TopicSidebar from './TopicSidebar';
import { useVoice } from '@/hooks/useVoice';
import styles from './ChatRoom.module.css';

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

interface ChatRoomProps {
  sessionId: string;
  topic: {
    title: string;
    description: string;
    type?: string;
    background_material?: string;
    key_questions?: string[];
  };
  participants: ParticipantInfo[];
  config: {
    duration_minutes: number;
    phases: { opening: number; discussion: number; summary: number };
  };
  jdText?: string;
  initialMessages?: ChatMessage[];
  onSessionEnd: () => void;
}

export default function ChatRoom({
  sessionId,
  topic,
  participants,
  config,
  jdText,
  initialMessages = [],
  onSessionEnd,
}: ChatRoomProps) {
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [phase, setPhase] = useState<string>('opening');
  const [isLoading, setIsLoading] = useState(false);
  const [typingIds, setTypingIds] = useState<string[]>([]);
  const [sessionEnded, setSessionEnded] = useState(false);
  const [selectedPersona, setSelectedPersona] = useState<{
    persona: PersonaCard;
    avatarColor: string;
  } | null>(null);
  const [startedAt] = useState(Date.now());
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const humanParticipant = participants.find(p => p.type === 'human');
  const proactiveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isProactiveFetchingRef = useRef(false);

  // Voice I/O
  const voice = useVoice({ lang: 'zh-CN' });

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // TTS: speak new AI/host messages
  const lastMessageCountRef = useRef(initialMessages.length);
  useEffect(() => {
    if (!voice.ttsEnabled) return;
    const newMessages = messages.slice(lastMessageCountRef.current);
    lastMessageCountRef.current = messages.length;

    for (const msg of newMessages) {
      if (msg.participant_type !== 'human' && !msg.is_system) {
        voice.speak(msg.content, msg.participant_id);
      }
    }
  }, [messages]); // eslint-disable-line react-hooks/exhaustive-deps

  const addMessage = useCallback((msg: ChatMessage) => {
    setMessages(prev => [...prev, msg]);
  }, []);

  // Deliver AI responses with typing indicators and staggered delays
  const deliverAiResponses = useCallback(
    async (responses: { participant_id: string; participant_name: string; content: string; delay_ms: number; is_interrupt: boolean; participant_type?: string }[]) => {
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
          participant_type: (r.participant_type as 'ai' | 'host') || 'ai',
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

  // Proactive AI speaking: aggressive participants talk on their own
  const triggerProactive = useCallback(async () => {
    if (isProactiveFetchingRef.current || sessionEnded || isLoading) return;
    isProactiveFetchingRef.current = true;

    try {
      const res = await fetch(`/api/sessions/${sessionId}/proactive`, {
        method: 'POST',
      });
      const data = await res.json();

      if (data.ai_responses?.length > 0) {
        await deliverAiResponses(data.ai_responses);
      }
    } catch (error) {
      console.error('Proactive message failed:', error);
    } finally {
      isProactiveFetchingRef.current = false;
    }
  }, [sessionId, sessionEnded, isLoading, deliverAiResponses]);

  // Reset proactive timer whenever messages change or user sends
  const resetProactiveTimer = useCallback(() => {
    if (proactiveTimerRef.current) {
      clearTimeout(proactiveTimerRef.current);
    }
    if (!sessionEnded) {
      // After 12-20 seconds of user inactivity, AI speaks proactively
      const delay = 12000 + Math.random() * 8000;
      proactiveTimerRef.current = setTimeout(() => {
        triggerProactive();
      }, delay);
    }
  }, [sessionEnded, triggerProactive]);

  // Start/reset proactive timer when messages change
  useEffect(() => {
    resetProactiveTimer();
    return () => {
      if (proactiveTimerRef.current) clearTimeout(proactiveTimerRef.current);
    };
  }, [messages.length, resetProactiveTimer]);

  // Send user message
  const handleSend = useCallback(async (content: string) => {
    if (!humanParticipant || isLoading || sessionEnded) return;

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

      // Host message (phase transitions, interjections)
      if (data.host_message) {
        const hostParticipant = participants.find(p => p.type === 'host');
        if (hostParticipant) {
          addMessage({
            id: crypto.randomUUID(),
            participant_id: hostParticipant.id,
            participant_name: hostParticipant.display_name,
            participant_type: 'host',
            content: data.host_message,
            is_interrupt: false,
            is_system: false,
            avatar_color: hostParticipant.avatar_color,
            timestamp: new Date().toISOString(),
          });
        }
      }

      if (data.system_message && !data.host_message) {
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
        setPhase(data.phase_change);
      }

      if (data.session_ended) {
        setSessionEnded(true);
        const hostParticipant = participants.find(p => p.type === 'host');
        addMessage({
          id: crypto.randomUUID(),
          participant_id: hostParticipant?.id || 'system',
          participant_name: hostParticipant?.display_name || '系统',
          participant_type: hostParticipant ? 'host' : 'ai',
          content: '讨论时间到！感谢各位候选人的精彩讨论，现在进入评估环节...',
          is_interrupt: false,
          is_system: !hostParticipant,
          avatar_color: hostParticipant?.avatar_color || '#666',
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
  }, [sessionId, humanParticipant, isLoading, sessionEnded, addMessage, deliverAiResponses, onSessionEnd, participants]);

  const handleTimeUp = useCallback(() => {
    if (!sessionEnded) {
      setSessionEnded(true);
      const hostParticipant = participants.find(p => p.type === 'host');
      addMessage({
        id: crypto.randomUUID(),
        participant_id: hostParticipant?.id || 'system',
        participant_name: hostParticipant?.display_name || '系统',
        participant_type: hostParticipant ? 'host' : 'ai',
        content: '讨论时间到！',
        is_interrupt: false,
        is_system: !hostParticipant,
        avatar_color: hostParticipant?.avatar_color || '#666',
        timestamp: new Date().toISOString(),
      });
      onSessionEnd();
    }
  }, [sessionEnded, addMessage, onSessionEnd, participants]);

  return (
    <div className={styles.chatRoom}>
      {/* Header */}
      <div className={styles.header}>
        <div className={styles.topicInfo}>
          <h2 className={styles.topicTitle}>{topic.title}</h2>
        </div>
        <div className={styles.headerControls}>
          {/* TTS toggle */}
          {voice.ttsSupported && (
            <button
              className={`${styles.ttsToggle} ${voice.ttsEnabled ? styles.ttsActive : ''}`}
              onClick={() => {
                voice.setTtsEnabled(!voice.ttsEnabled);
                if (voice.isSpeaking) voice.stopSpeaking();
              }}
              title={voice.ttsEnabled ? '关闭语音播放' : '开启语音播放'}
            >
              {voice.ttsEnabled ? (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
                  <path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>
                  <path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>
                </svg>
              ) : (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
                  <line x1="23" y1="9" x2="17" y2="15"/>
                  <line x1="17" y1="9" x2="23" y2="15"/>
                </svg>
              )}
            </button>
          )}
          {voice.isSpeaking && (
            <button
              className={styles.stopSpeakBtn}
              onClick={voice.stopSpeaking}
              title="停止播放"
            >
              ■
            </button>
          )}
          <button
            className="btn btn-danger"
            onClick={onSessionEnd}
            style={{ fontSize: '13px', padding: '6px 14px' }}
          >
            结束讨论
          </button>
        </div>
      </div>

      {/* Timer */}
      <PhaseTimer
        phase={phase}
        totalMinutes={config.duration_minutes}
        startedAt={startedAt}
        onTimeUp={handleTimeUp}
      />

      {/* Main area: Topic Sidebar | Messages | Participants */}
      <div className={styles.mainArea}>
        {/* Topic sidebar (left) */}
        <TopicSidebar topic={topic} jdText={jdText} />

        {/* Messages */}
        <div className={styles.messagesArea}>
          <div className={styles.messagesList}>
            {messages.map(msg => {
              const msgParticipant = participants.find(p => p.id === msg.participant_id);
              const hasPersona = msgParticipant?.type === 'ai' && msgParticipant?.persona_card;
              return (
                <MessageBubble
                  key={msg.id}
                  participantName={msg.participant_name}
                  content={msg.content}
                  isUser={msg.participant_type === 'human'}
                  isHost={msg.participant_type === 'host'}
                  isInterrupt={msg.is_interrupt}
                  isSystem={msg.is_system}
                  avatarColor={msg.avatar_color}
                  timestamp={msg.timestamp}
                  onAvatarClick={hasPersona ? () => setSelectedPersona({
                    persona: msgParticipant.persona_card!,
                    avatarColor: msgParticipant.avatar_color,
                  }) : undefined}
                />
              );
            })}
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
                : '输入你的观点... (或点击麦克风语音输入)'
            }
            isListening={voice.isListening}
            sttSupported={voice.sttSupported}
            voiceTranscript={voice.transcript}
            interimTranscript={voice.interimTranscript}
            onStartListening={voice.startListening}
            onStopListening={voice.stopListening}
          />
        </div>

        {/* Participant sidebar (right) */}
        <ParticipantList
          participants={participants}
          typingParticipantIds={typingIds}
        />
      </div>

      {selectedPersona && (
        <PersonaCardModal
          persona={selectedPersona.persona}
          avatarColor={selectedPersona.avatarColor}
          onClose={() => setSelectedPersona(null)}
        />
      )}
    </div>
  );
}
