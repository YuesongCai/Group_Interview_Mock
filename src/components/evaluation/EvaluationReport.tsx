'use client';

import styles from './EvaluationReport.module.css';
import DimensionScore from './DimensionScore';
import type { Evaluation } from '@/lib/types';

interface EvaluationReportProps {
  evaluation: Evaluation;
}

const DIMENSION_LABELS: Record<string, string> = {
  leadership_initiative: '领导力与主动性',
  logical_reasoning: '逻辑推理',
  collaboration_eq: '协作与情商',
  communication_clarity: '沟通清晰度',
  innovation_insight: '创新与洞察',
};

const DIMENSION_ICONS: Record<string, string> = {
  leadership_initiative: '🎯',
  logical_reasoning: '🧠',
  collaboration_eq: '🤝',
  communication_clarity: '💬',
  innovation_insight: '💡',
};

export default function EvaluationReport({ evaluation }: EvaluationReportProps) {
  const scoreColor = (score: number) => {
    if (score >= 80) return 'var(--success)';
    if (score >= 60) return 'var(--accent)';
    if (score >= 40) return 'var(--warning)';
    return 'var(--danger)';
  };

  return (
    <div className={styles.report}>
      {/* Overall Score */}
      <div className={styles.overallSection}>
        <div className={styles.scoreCircle}>
          <svg viewBox="0 0 120 120" className={styles.scoreSvg}>
            <circle cx="60" cy="60" r="52" fill="none" stroke="var(--border)" strokeWidth="8" />
            <circle
              cx="60" cy="60" r="52"
              fill="none"
              stroke={scoreColor(evaluation.overall_score)}
              strokeWidth="8"
              strokeLinecap="round"
              strokeDasharray={`${(evaluation.overall_score / 100) * 327} 327`}
              transform="rotate(-90 60 60)"
            />
          </svg>
          <div className={styles.scoreValue}>{evaluation.overall_score}</div>
          <div className={styles.scoreLabel}>综合得分</div>
        </div>
        <div className={styles.overallInfo}>
          <div className={styles.percentile}>
            超过了 <strong>{evaluation.percentile}%</strong> 的候选人
          </div>
        </div>
      </div>

      {/* Dimension Scores */}
      <div className={styles.dimensionsSection}>
        <h3 className={styles.sectionTitle}>各维度评分</h3>
        <div className={styles.dimensions}>
          {Object.entries(evaluation.dimensions).map(([key, dim]) => (
            <DimensionScore
              key={key}
              label={DIMENSION_LABELS[key] || key}
              icon={DIMENSION_ICONS[key] || '📊'}
              score={dim.score}
              weight={dim.weight}
              evidence={dim.evidence}
              improvement={dim.improvement}
            />
          ))}
        </div>
      </div>

      {/* Strengths & Improvements */}
      <div className={styles.feedbackSection}>
        <div className={styles.feedbackColumn}>
          <h3 className={styles.sectionTitle} style={{ color: 'var(--success)' }}>
            优势表现
          </h3>
          <ul className={styles.feedbackList}>
            {evaluation.strengths.map((s, i) => (
              <li key={i} className={styles.feedbackItem}>{s}</li>
            ))}
          </ul>
        </div>
        <div className={styles.feedbackColumn}>
          <h3 className={styles.sectionTitle} style={{ color: 'var(--warning)' }}>
            改进方向
          </h3>
          <ul className={styles.feedbackList}>
            {evaluation.improvement_areas.map((s, i) => (
              <li key={i} className={styles.feedbackItem}>{s}</li>
            ))}
          </ul>
        </div>
      </div>

      {/* Comparison */}
      {evaluation.comparison_narrative && (
        <div className={styles.comparisonSection}>
          <h3 className={styles.sectionTitle}>与其他候选人对比</h3>
          <p className={styles.comparisonText}>{evaluation.comparison_narrative}</p>
        </div>
      )}

      {/* Replay Highlights */}
      {evaluation.replay_highlights.length > 0 && (
        <div className={styles.highlightsSection}>
          <h3 className={styles.sectionTitle}>精彩回顾</h3>
          <div className={styles.highlights}>
            {evaluation.replay_highlights.map((h, i) => {
              const typeLabels: Record<string, string> = {
                strongest_argument: '最佳论述',
                missed_opportunity: '错失机会',
                best_collaboration: '最佳协作',
              };
              const typeColors: Record<string, string> = {
                strongest_argument: 'var(--success)',
                missed_opportunity: 'var(--warning)',
                best_collaboration: 'var(--accent)',
              };
              return (
                <div key={i} className={styles.highlight}>
                  <span
                    className={styles.highlightType}
                    style={{ color: typeColors[h.type] || 'var(--text-secondary)' }}
                  >
                    {typeLabels[h.type] || h.type}
                  </span>
                  <p className={styles.highlightDesc}>{h.description}</p>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
