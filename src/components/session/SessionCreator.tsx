'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import styles from './SessionCreator.module.css';

export default function SessionCreator() {
  const router = useRouter();
  const [jdText, setJdText] = useState('');
  const [resumeText, setResumeText] = useState('');
  const [difficulty, setDifficulty] = useState<'easy' | 'medium' | 'hard'>('medium');
  const [participantCount, setParticipantCount] = useState(4);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async () => {
    if (!jdText.trim()) {
      setError('请输入职位描述');
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      const res = await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jd_text: jdText,
          resume_text: resumeText || undefined,
          difficulty,
          participant_count: participantCount,
          language: 'zh',
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error?.message || 'Failed to create session');
      }

      const data = await res.json();
      router.push(`/session/${data.session_id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : '创建失败，请重试');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className={styles.creator}>
      <h1 className={styles.title}>创建群面模拟</h1>
      <p className={styles.subtitle}>
        上传你的简历和目标岗位JD，AI将为你生成讨论话题和候选人
      </p>

      <div className={styles.form}>
        {/* JD Input */}
        <div className={styles.field}>
          <label className={styles.label}>
            职位描述 (JD) <span className={styles.required}>*</span>
          </label>
          <textarea
            className={styles.textarea}
            value={jdText}
            onChange={e => setJdText(e.target.value)}
            placeholder="粘贴目标岗位的职位描述..."
            rows={6}
          />
        </div>

        {/* Resume Input */}
        <div className={styles.field}>
          <label className={styles.label}>
            个人简历 <span className={styles.optional}>(可选)</span>
          </label>
          <textarea
            className={styles.textarea}
            value={resumeText}
            onChange={e => setResumeText(e.target.value)}
            placeholder="粘贴你的简历内容，AI将根据你的背景生成差异化的候选人..."
            rows={4}
          />
        </div>

        {/* Options row */}
        <div className={styles.optionsRow}>
          {/* Difficulty */}
          <div className={styles.field}>
            <label className={styles.label}>难度</label>
            <div className={styles.segmentedControl}>
              {(['easy', 'medium', 'hard'] as const).map(d => (
                <button
                  key={d}
                  className={`${styles.segment} ${difficulty === d ? styles.activeSegment : ''}`}
                  onClick={() => setDifficulty(d)}
                >
                  {{ easy: '简单', medium: '中等', hard: '困难' }[d]}
                </button>
              ))}
            </div>
          </div>

          {/* Participant Count */}
          <div className={styles.field}>
            <label className={styles.label}>AI候选人数量</label>
            <div className={styles.segmentedControl}>
              {[3, 4, 5].map(n => (
                <button
                  key={n}
                  className={`${styles.segment} ${participantCount === n ? styles.activeSegment : ''}`}
                  onClick={() => setParticipantCount(n)}
                >
                  {n}人
                </button>
              ))}
            </div>
          </div>
        </div>

        {error && <div className={styles.error}>{error}</div>}

        <button
          className={`btn btn-primary ${styles.submitBtn}`}
          onClick={handleSubmit}
          disabled={isLoading || !jdText.trim()}
        >
          {isLoading ? '正在生成...' : '开始群面模拟'}
        </button>
      </div>
    </div>
  );
}
