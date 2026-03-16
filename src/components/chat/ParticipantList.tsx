'use client';

import { useState } from 'react';
import PersonaCardModal from './PersonaCardModal';
import styles from './ParticipantList.module.css';

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

interface ParticipantListProps {
  participants: ParticipantInfo[];
  typingParticipantIds: string[];
}

export default function ParticipantList({
  participants,
  typingParticipantIds,
}: ParticipantListProps) {
  const [selectedPersona, setSelectedPersona] = useState<{
    persona: PersonaCard;
    avatarColor: string;
  } | null>(null);

  return (
    <div className={styles.container}>
      <h3 className={styles.title}>参与者</h3>
      <div className={styles.list}>
        {participants.map(p => {
          const hasPersona = p.type === 'ai' && p.persona_card;
          return (
            <div
              key={p.id}
              className={`${styles.participant} ${hasPersona ? styles.clickable : ''}`}
              onClick={() => {
                if (hasPersona && p.persona_card) {
                  setSelectedPersona({ persona: p.persona_card, avatarColor: p.avatar_color });
                }
              }}
            >
              <div
                className={styles.avatar}
                style={{ backgroundColor: p.avatar_color }}
              >
                {p.type === 'host' ? '🎙' : p.display_name[0]}
              </div>
              <div className={styles.info}>
                <div className={styles.name}>
                  {p.display_name}
                  {p.type === 'human' && <span className={styles.youBadge}>你</span>}
                  {p.type === 'host' && <span className={styles.hostBadge}>主持</span>}
                  {hasPersona && <span className={styles.viewBadge}>查看简历</span>}
                </div>
                {p.background_summary && (
                  <div className={styles.background}>{p.background_summary}</div>
                )}
                {p.type === 'host' && !p.background_summary && (
                  <div className={styles.background}>面试官 · 引导讨论</div>
                )}
                {typingParticipantIds.includes(p.id) && (
                  <div className={styles.typing}>
                    <span className="animate-pulse">正在思考...</span>
                  </div>
                )}
              </div>
            </div>
          );
        })}
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
