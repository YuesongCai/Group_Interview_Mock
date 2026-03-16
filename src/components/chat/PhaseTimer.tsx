'use client';

import { useState, useEffect } from 'react';
import styles from './PhaseTimer.module.css';

interface PhaseTimerProps {
  phase: string;
  totalMinutes: number;
  startedAt: number; // timestamp ms
  onTimeUp?: () => void;
}

const PHASE_LABELS: Record<string, string> = {
  opening: '开场发言',
  discussion: '自由讨论',
  summary: '总结陈述',
};

export default function PhaseTimer({
  phase,
  totalMinutes,
  startedAt,
  onTimeUp,
}: PhaseTimerProps) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      const elapsedSec = Math.floor((now - startedAt) / 1000);
      setElapsed(elapsedSec);

      if (elapsedSec >= totalMinutes * 60) {
        onTimeUp?.();
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [startedAt, totalMinutes, onTimeUp]);

  const totalSeconds = totalMinutes * 60;
  const remaining = Math.max(0, totalSeconds - elapsed);
  const minutes = Math.floor(remaining / 60);
  const seconds = remaining % 60;
  const progress = Math.min(100, (elapsed / totalSeconds) * 100);
  const isWarning = remaining < 120 && remaining > 0; // < 2 min
  const isDanger = remaining < 30 && remaining > 0; // < 30 sec

  return (
    <div className={styles.timer}>
      <div className={styles.phaseLabel}>{PHASE_LABELS[phase] || phase}</div>
      <div className={styles.progressBar}>
        <div
          className={`${styles.progress} ${isDanger ? styles.danger : isWarning ? styles.warning : ''}`}
          style={{ width: `${progress}%` }}
        />
      </div>
      <div className={`${styles.timeDisplay} ${isDanger ? styles.dangerText : isWarning ? styles.warningText : ''}`}>
        {String(minutes).padStart(2, '0')}:{String(seconds).padStart(2, '0')}
      </div>
    </div>
  );
}
