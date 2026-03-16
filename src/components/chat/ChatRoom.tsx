'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import MessageBubble from './MessageBubble';
import MessageInput from './MessageInput';
import ParticipantList from './ParticipantList';
import PersonaCardModal from './PersonaCardModal';
import PhaseTimer from './PhaseTimer';
import TopicSidebar from './TopicSidebar';
import CoachingHints from './CoachingHints';
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
  cognitive_bias?: string;
  verbal_habits?: string[];
  strength_blindspot?: string;
  weakness?: string;
  cv_highlights?: string[];
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

interface PhaseConfig {
  intro: number;
  briefing: number;
  opening: number;
  discussion: number;
  summary: number;
  qa: number;
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
    phases: PhaseConfig;
  };
  jdText?: string;
  initialMessages?: ChatMessage[];
  initialPhase?: string;
  onSessionEnd: () => void;
}

const PHASE_LABELS: Record<string, string> = {
  intro: '自我介绍',
  briefing: '材料阅读',
  opening: '开场发言',
  discussion: '自由讨论',
  summary: '总结陈述',
  qa: '面试官追问',
};

const PHASE_ORDER = ['intro', 'briefing', 'opening', 'discussion', 'summary', 'qa'];

export default function ChatRoom({
  sessionId,
  topic,
  participants,
  config,
  jdText,
  initialMessages = [],
  initialPhase = 'intro',
  onSessionEnd,
}: ChatRoomProps) {
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [phase, setPhase] = useState<string>(initialPhase);
  const [isLoading, setIsLoading] = useState(false);
  const [isAdvancing, setIsAdvancing] = useState(false);
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

  const voice = useVoice({ lang: 'zh-CN' });

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // TTS
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

  const deliverAiResponses = useCallback(
    async (responses: { participant_id: string; participant_name: string; content: string; delay_ms: number; is_interrupt: boolean; participant_type?: string }[]) => {
      for (const r of responses) {
        const participant = participants.find(p => p.id === r.participant_id);
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

  // Proactive AI speaking (only during active discussion phases)
  const triggerProactive = useCallback(async () => {
    if (isProactiveFetchingRef.current || sessionEnded || isLoading) return;
    if (!['opening', 'discussion', 'summary'].includes(phase)) return;

    isProactiveFetchingRef.current = true;
    try {
      const res = await fetch(`/api/sessions/${sessionId}/proactive`, { method: 'POST' });
      const data = await res.json();

      if (data.host_message) {
        const hostP = participants.find(p => p.type === 'host');
        if (hostP) {
          addMessage({
            id: crypto.randomUUID(),
            participant_id: hostP.id,
            participant_name: hostP.display_name,
            participant_type: 'host',
            content: data.host_message,
            is_interrupt: false,
            is_system: false,
            avatar_color: hostP.avatar_color,
            timestamp: new Date().toISOString(),
          });
        }
      }

      if (data.ai_responses?.length > 0) {
        await deliverAiResponses(data.ai_responses);
      }
    } catch (error) {
      console.error('Proactive message failed:', error);
    } finally {
      isProactiveFetchingRef.current = false;
    }
  }, [sessionId, sessionEnded, isLoading, phase, deliverAiResponses, addMessage, participants]);

  const resetProactiveTimer = useCallback(() => {
    if (proactiveTimerRef.current) clearTimeout(proactiveTimerRef.current);
    if (!sessionEnded && ['opening', 'discussion', 'summary'].includes(phase)) {
      const delay = 12000 + Math.random() * 8000;
      proactiveTimerRef.current = setTimeout(() => triggerProactive(), delay);
    }
  }, [sessionEnded, phase, triggerProactive]);

  useEffect(() => {
    resetProactiveTimer();
    return () => { if (proactiveTimerRef.current) clearTimeout(proactiveTimerRef.current); };
  }, [messages.length, resetProactiveTimer]);

  // Advance to next phase (button click)
  const handleAdvancePhase = useCallback(async () => {
    if (isAdvancing) return;
    setIsAdvancing(true);

    try {
      const res = await fetch(`/api/sessions/${sessionId}/advance`, { method: 'POST' });
      const data = await res.json();

      if (data.phase) setPhase(data.phase);

      if (data.host_message) {
        const hostP = participants.find(p => p.type === 'host');
        if (hostP) {
          addMessage({
            id: crypto.randomUUID(),
            participant_id: hostP.id,
            participant_name: hostP.display_name,
            participant_type: 'host',
            content: data.host_message,
            is_interrupt: false,
            is_system: false,
            avatar_color: hostP.avatar_color,
            timestamp: new Date().toISOString(),
          });
        }
      }

      if (data.ai_responses?.length > 0) {
        await deliverAiResponses(data.ai_responses);
      }
    } catch (error) {
      console.error('Failed to advance phase:', error);
    } finally {
      setIsAdvancing(false);
    }
  }, [sessionId, isAdvancing, participants, addMessage, deliverAiResponses]);

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

      if (data.host_message) {
        const hostP = participants.find(p => p.type === 'host');
        if (hostP) {
          addMessage({
            id: crypto.randomUUID(),
            participant_id: hostP.id,
            participant_name: hostP.display_name,
            participant_type: 'host',
            content: data.host_message,
            is_interrupt: false,
            is_system: false,
            avatar_color: hostP.avatar_color,
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

      if (data.phase_change) setPhase(data.phase_change);

      if (data.session_ended) {
        setSessionEnded(true);
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
      const hostP = participants.find(p => p.type === 'host');
      addMessage({
        id: crypto.randomUUID(),
        participant_id: hostP?.id || 'system',
        participant_name: hostP?.display_name || '系统',
        participant_type: hostP ? 'host' : 'ai',
        content: '讨论时间到！',
        is_interrupt: false,
        is_system: !hostP,
        avatar_color: hostP?.avatar_color || '#666',
        timestamp: new Date().toISOString(),
      });
      onSessionEnd();
    }
  }, [sessionEnded, addMessage, onSessionEnd, participants]);

  // Phase-specific placeholder text
  const getPlaceholder = () => {
    if (sessionEnded) return '讨论已结束';
    if (isLoading) return '等待其他候选人发言...';
    switch (phase) {
      case 'intro': return '输入你的自我介绍（姓名、背景、经验）...';
      case 'briefing': return '阅读材料中...准备好后点击"进入下一阶段"';
      case 'opening': return '分享你对案例的初步想法和核心观点...';
      case 'discussion': return '输入你的观点，回应其他候选人...';
      case 'summary': return '总结你的核心观点和讨论结论...';
      case 'qa': return '回答面试官的问题...';
      default: return '输入你的观点...';
    }
  };

  // Next phase button label
  const getNextPhaseLabel = () => {
    const idx = PHASE_ORDER.indexOf(phase);
    const next = PHASE_ORDER[idx + 1];
    if (!next) return null;
    return `进入${PHASE_LABELS[next] || '下一阶段'}`;
  };

  // Show advance button for certain phases
  const showAdvanceButton = ['intro', 'briefing'].includes(phase);
  const nextLabel = getNextPhaseLabel();

  return (
    <div className={styles.chatRoom}>
      {/* Header */}
      <div className={styles.header}>
        <div className={styles.topicInfo}>
          <h2 className={styles.topicTitle}>{topic.title}</h2>
        </div>
        <div className={styles.headerControls}>
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
            <button className={styles.stopSpeakBtn} onClick={voice.stopSpeaking} title="停止播放">
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

      {/* Phase indicator bar */}
      <div className={styles.phaseBar}>
        {PHASE_ORDER.map((p, i) => {
          const isCurrent = p === phase;
          const isPast = PHASE_ORDER.indexOf(phase) > i;
          return (
            <div
              key={p}
              className={`${styles.phaseStep} ${isCurrent ? styles.phaseStepActive : ''} ${isPast ? styles.phaseStepDone : ''}`}
            >
              <div className={styles.phaseStepDot} />
              <span className={styles.phaseStepLabel}>{PHASE_LABELS[p]}</span>
            </div>
          );
        })}
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
        <TopicSidebar topic={topic} jdText={jdText} />

        <div className={styles.messagesArea}>
          <div className={styles.messagesList}>
            {messages.map(msg => {
              const msgP = participants.find(p => p.id === msg.participant_id);
              const hasPersona = msgP?.type === 'ai' && msgP?.persona_card;
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
                    persona: msgP.persona_card!,
                    avatarColor: msgP.avatar_color,
                  }) : undefined}
                />
              );
            })}
            <div ref={messagesEndRef} />
          </div>

          {/* Advance phase button */}
          {showAdvanceButton && nextLabel && (
            <div className={styles.advanceBar}>
              <button
                className={`btn btn-primary ${styles.advanceBtn}`}
                onClick={handleAdvancePhase}
                disabled={isAdvancing}
              >
                {isAdvancing ? '正在进入...' : nextLabel}
              </button>
              {phase === 'briefing' && (
                <span className={styles.advanceHint}>仔细阅读左侧材料后，点击进入下一阶段</span>
              )}
            </div>
          )}

          <MessageInput
            onSend={handleSend}
            disabled={isLoading || sessionEnded || phase === 'briefing'}
            placeholder={getPlaceholder()}
            isListening={voice.isListening}
            sttSupported={voice.sttSupported}
            voiceTranscript={voice.transcript}
            interimTranscript={voice.interimTranscript}
            onStartListening={voice.startListening}
            onStopListening={voice.stopListening}
          />
        </div>

        <ParticipantList
          participants={participants}
          typingParticipantIds={typingIds}
        />
      </div>

      {/* Coaching hints */}
      {!sessionEnded && (
        <CoachingHints
          phase={phase}
          messageCount={messages.length}
          userMessageCount={messages.filter(m => m.participant_type === 'human').length}
          totalParticipants={participants.filter(p => p.type !== 'host').length}
          elapsedMinutes={(Date.now() - startedAt) / 60000}
          totalMinutes={config.duration_minutes}
        />
      )}

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
