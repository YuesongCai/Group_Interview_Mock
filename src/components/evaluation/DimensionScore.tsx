'use client';

import { useState } from 'react';
import styles from './DimensionScore.module.css';

interface Evidence {
  description: string;
  timestamp: string;
  quote: string;
}

interface DimensionScoreProps {
  label: string;
  icon: string;
  score: number;
  weight: number;
  evidence: Evidence[];
  improvement: string;
}

export default function DimensionScore({
  label,
  icon,
  score,
  weight,
  evidence,
  improvement,
}: DimensionScoreProps) {
  const [expanded, setExpanded] = useState(false);

  const barColor = score >= 80
    ? 'var(--success)'
    : score >= 60
    ? 'var(--accent)'
    : score >= 40
    ? 'var(--warning)'
    : 'var(--danger)';

  return (
    <div className={styles.dimension}>
      <button className={styles.header} onClick={() => setExpanded(!expanded)}>
        <span className={styles.icon}>{icon}</span>
        <span className={styles.label}>{label}</span>
        <span className={styles.weight}>{(weight * 100).toFixed(0)}%</span>
        <div className={styles.barWrapper}>
          <div
            className={styles.bar}
            style={{ width: `${score}%`, backgroundColor: barColor }}
          />
        </div>
        <span className={styles.score} style={{ color: barColor }}>{score}</span>
        <span className={styles.expandIcon}>{expanded ? '▾' : '▸'}</span>
      </button>

      {expanded && (
        <div className={styles.details}>
          {evidence.length > 0 && (
            <div className={styles.evidenceSection}>
              <h4 className={styles.detailTitle}>行为证据</h4>
              {evidence.map((e, i) => (
                <div key={i} className={styles.evidence}>
                  <p className={styles.evidenceDesc}>{e.description}</p>
                  {e.quote && (
                    <blockquote className={styles.quote}>"{e.quote}"</blockquote>
                  )}
                </div>
              ))}
            </div>
          )}
          <div className={styles.improvementSection}>
            <h4 className={styles.detailTitle}>改进建议</h4>
            <p className={styles.improvementText}>{improvement}</p>
          </div>
        </div>
      )}
    </div>
  );
}
