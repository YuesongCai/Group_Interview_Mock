'use client';

import { useEffect, useRef } from 'react';
import styles from './PersonaCardModal.module.css';

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

interface PersonaCardModalProps {
  persona: PersonaCard;
  avatarColor: string;
  onClose: () => void;
}

const PERSONALITY_LABELS: Record<string, string> = {
  assertive_leader: '强势领导型',
  analytical_thinker: '分析思考型',
  collaborative_mediator: '协作调和型',
  quiet_observer: '沉稳观察型',
  devils_advocate: '挑战质疑型',
};

export default function PersonaCardModal({ persona, avatarColor, onClose }: PersonaCardModalProps) {
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  return (
    <div
      ref={overlayRef}
      className={styles.overlay}
      onClick={(e) => { if (e.target === overlayRef.current) onClose(); }}
    >
      <div className={styles.modal}>
        <button className={styles.closeBtn} onClick={onClose}>×</button>

        <div className={styles.header}>
          <div className={styles.avatar} style={{ backgroundColor: avatarColor }}>
            {persona.name[0]}
          </div>
          <div>
            <h3 className={styles.name}>{persona.name}</h3>
            <span className={styles.typeBadge}>
              {PERSONALITY_LABELS[persona.personality_type] || persona.personality_type}
            </span>
          </div>
        </div>

        <div className={styles.section}>
          <div className={styles.sectionTitle}>背景</div>
          <p className={styles.sectionContent}>{persona.background}</p>
        </div>

        <div className={styles.section}>
          <div className={styles.sectionTitle}>知识领域</div>
          <p className={styles.sectionContent}>{persona.knowledge_depth}</p>
        </div>

        <div className={styles.section}>
          <div className={styles.sectionTitle}>说话风格</div>
          <p className={styles.sectionContent}>{persona.speaking_style}</p>
        </div>

        <div className={styles.section}>
          <div className={styles.sectionTitle}>思维倾向</div>
          <p className={styles.sectionContent}>{persona.bias_tendency}</p>
        </div>

        {persona.cv_highlights && persona.cv_highlights.length > 0 && (
          <div className={styles.section}>
            <div className={styles.sectionTitle}>核心经历</div>
            <ul className={styles.highlightList}>
              {persona.cv_highlights.map((h, i) => (
                <li key={i} className={styles.sectionContent}>{h}</li>
              ))}
            </ul>
          </div>
        )}

        {persona.cognitive_bias && (
          <div className={styles.section}>
            <div className={styles.sectionTitle}>认知偏差</div>
            <p className={styles.sectionContent}>{persona.cognitive_bias}</p>
          </div>
        )}

        {persona.verbal_habits && persona.verbal_habits.length > 0 && (
          <div className={styles.section}>
            <div className={styles.sectionTitle}>口头禅</div>
            <div className={styles.tagList}>
              {persona.verbal_habits.map((h, i) => (
                <span key={i} className={styles.tag}>&ldquo;{h}&rdquo;</span>
              ))}
            </div>
          </div>
        )}

        <div className={styles.section}>
          <div className={styles.sectionTitle}>发言积极度</div>
          <div className={styles.aggBar}>
            <div
              className={styles.aggFill}
              style={{ width: `${Math.round(persona.aggressiveness * 100)}%` }}
            />
          </div>
          <span className={styles.aggLabel}>
            {persona.aggressiveness >= 0.7 ? '高' : persona.aggressiveness >= 0.4 ? '中' : '低'}
          </span>
        </div>
      </div>
    </div>
  );
}
