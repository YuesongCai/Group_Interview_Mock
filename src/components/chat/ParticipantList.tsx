'use client';

import styles from './ParticipantList.module.css';

interface ParticipantInfo {
  id: string;
  display_name: string;
  type: 'human' | 'ai' | 'host';
  avatar_color: string;
  background_summary?: string | null;
}

interface ParticipantListProps {
  participants: ParticipantInfo[];
  typingParticipantIds: string[];
}

export default function ParticipantList({
  participants,
  typingParticipantIds,
}: ParticipantListProps) {
  return (
    <div className={styles.container}>
      <h3 className={styles.title}>参与者</h3>
      <div className={styles.list}>
        {participants.map(p => (
          <div key={p.id} className={styles.participant}>
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
        ))}
      </div>
    </div>
  );
}
