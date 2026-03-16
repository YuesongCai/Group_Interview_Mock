'use client';

import { useState, useEffect, useMemo } from 'react';
import styles from './CoachingHints.module.css';

interface CoachingHintsProps {
  phase: string;
  messageCount: number;
  userMessageCount: number;
  totalParticipants: number;
  elapsedMinutes: number;
  totalMinutes: number;
}

interface Hint {
  type: 'rhythm' | 'omission' | 'collaboration';
  icon: string;
  text: string;
  priority: number; // higher = more important
}

export default function CoachingHints({
  phase,
  messageCount,
  userMessageCount,
  totalParticipants,
  elapsedMinutes,
  totalMinutes,
}: CoachingHintsProps) {
  const [collapsed, setCollapsed] = useState(true);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  // Reset dismissed hints when phase changes
  useEffect(() => {
    setDismissed(new Set());
  }, [phase]);

  const hints = useMemo(() => {
    const result: Hint[] = [];
    const timeRatio = elapsedMinutes / totalMinutes;
    const userRatio = messageCount > 0 ? userMessageCount / messageCount : 0;
    const expectedRatio = 1 / totalParticipants;

    // --- Rhythm hints ---
    if (phase === 'intro' && userMessageCount === 0) {
      result.push({
        type: 'rhythm',
        icon: '👋',
        text: '还没自我介绍？先简洁说下你的名字和背景吧',
        priority: 10,
      });
    }

    if (phase === 'opening' && userMessageCount === 0) {
      result.push({
        type: 'rhythm',
        icon: '🎯',
        text: '开场发言阶段，先亮出你的核心观点，用最擅长的角度切入',
        priority: 10,
      });
    }

    if (phase === 'discussion' && messageCount > 8 && userMessageCount < 2) {
      result.push({
        type: 'rhythm',
        icon: '⏰',
        text: '讨论已经过半，你的发言偏少。找个好的切入点加入讨论吧',
        priority: 9,
      });
    }

    if (phase === 'discussion' && timeRatio > 0.7) {
      result.push({
        type: 'rhythm',
        icon: '⏳',
        text: '剩余时间不多了，如果有重要观点还没说，抓紧时间',
        priority: 8,
      });
    }

    if (phase === 'summary' && userMessageCount === 0) {
      result.push({
        type: 'rhythm',
        icon: '📝',
        text: '总结阶段记得发言——简明扼要总结你的核心观点和在讨论中的贡献',
        priority: 10,
      });
    }

    // --- Omission detection ---
    if (phase === 'discussion' && userRatio < expectedRatio * 0.5 && messageCount > 5) {
      result.push({
        type: 'omission',
        icon: '📊',
        text: `你的发言占比偏低（${(userRatio * 100).toFixed(0)}%），试着更主动地参与讨论`,
        priority: 7,
      });
    }

    if (phase === 'discussion' && userMessageCount > 0 && messageCount > 10) {
      // Check if user hasn't spoken in a while
      result.push({
        type: 'omission',
        icon: '💡',
        text: '群面不只是说观点——也可以总结别人的讨论、提出新角度、或对某人的观点追问',
        priority: 5,
      });
    }

    // --- Collaboration hints ---
    if (phase === 'discussion' && messageCount > 3 && messageCount <= 8) {
      result.push({
        type: 'collaboration',
        icon: '🤝',
        text: '试着点名回应某个候选人的观点——"我同意XX说的...但我觉得还需要考虑..."',
        priority: 6,
      });
    }

    if (phase === 'discussion' && messageCount > 12) {
      result.push({
        type: 'collaboration',
        icon: '🔗',
        text: '讨论到了中后期——可以尝试做综合："刚才大家提到了A和B两个方向，我觉得..."',
        priority: 6,
      });
    }

    if (phase === 'qa') {
      result.push({
        type: 'rhythm',
        icon: '🎤',
        text: 'Q&A环节：回答要有条理（先结论后原因），用你的经历来证明你的观点',
        priority: 7,
      });
    }

    // Filter out dismissed hints and sort by priority
    return result
      .filter(h => !dismissed.has(h.text))
      .sort((a, b) => b.priority - a.priority)
      .slice(0, 3);
  }, [phase, messageCount, userMessageCount, totalParticipants, elapsedMinutes, totalMinutes, dismissed]);

  if (hints.length === 0) return null;

  return (
    <div className={styles.container}>
      <button
        className={styles.toggle}
        onClick={() => setCollapsed(!collapsed)}
        title={collapsed ? '展开教练提示' : '收起教练提示'}
      >
        <span className={styles.toggleIcon}>{collapsed ? '💡' : '×'}</span>
        {collapsed && <span className={styles.toggleBadge}>{hints.length}</span>}
      </button>

      {!collapsed && (
        <div className={styles.panel}>
          <div className={styles.panelHeader}>
            <span>教练提示</span>
            <span className={styles.panelSubtext}>仅过程提示，不涉及内容</span>
          </div>
          <div className={styles.hintList}>
            {hints.map((hint, i) => (
              <div key={i} className={`${styles.hint} ${styles[`hint_${hint.type}`]}`}>
                <span className={styles.hintIcon}>{hint.icon}</span>
                <span className={styles.hintText}>{hint.text}</span>
                <button
                  className={styles.hintDismiss}
                  onClick={() => setDismissed(prev => new Set([...prev, hint.text]))}
                  title="知道了"
                >
                  ✓
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
