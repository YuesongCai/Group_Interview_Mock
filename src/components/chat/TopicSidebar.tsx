'use client';

import { useState } from 'react';
import styles from './TopicSidebar.module.css';

interface TopicSidebarProps {
  topic: {
    title: string;
    description: string;
    type?: string;
    background_material?: string;
    key_questions?: string[];
  };
  jdText?: string;
}

export default function TopicSidebar({ topic, jdText }: TopicSidebarProps) {
  const [collapsed, setCollapsed] = useState(false);

  const typeLabels: Record<string, string> = {
    case_study: '案例分析',
    debate: '辩论讨论',
    prioritization: '优先级排序',
  };

  if (collapsed) {
    return (
      <button className={styles.expandBtn} onClick={() => setCollapsed(false)} title="展开题目">
        <span className={styles.expandIcon}>📋</span>
      </button>
    );
  }

  return (
    <div className={styles.sidebar}>
      <div className={styles.header}>
        <h3 className={styles.headerTitle}>讨论题目</h3>
        <button className={styles.collapseBtn} onClick={() => setCollapsed(true)}>
          ✕
        </button>
      </div>

      <div className={styles.content}>
        {topic.type && (
          <span className={styles.typeBadge}>
            {typeLabels[topic.type] || topic.type}
          </span>
        )}

        <h4 className={styles.topicTitle}>{topic.title}</h4>
        <p className={styles.description}>{topic.description}</p>

        {topic.background_material && (
          <div className={styles.section}>
            <h5 className={styles.sectionTitle}>背景材料</h5>
            <p className={styles.sectionText}>{topic.background_material}</p>
          </div>
        )}

        {topic.key_questions && topic.key_questions.length > 0 && (
          <div className={styles.section}>
            <h5 className={styles.sectionTitle}>关键问题</h5>
            <ul className={styles.questionList}>
              {topic.key_questions.map((q, i) => (
                <li key={i} className={styles.questionItem}>{q}</li>
              ))}
            </ul>
          </div>
        )}

        {jdText && (
          <div className={styles.section}>
            <h5 className={styles.sectionTitle}>职位描述 (JD)</h5>
            <p className={styles.sectionText}>{jdText}</p>
          </div>
        )}
      </div>
    </div>
  );
}
