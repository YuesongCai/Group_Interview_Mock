'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import styles from './SessionCreator.module.css';

type DurationPreset = '20min' | '30min' | '45min' | '60min';
type TopicStyle = 'case_study' | 'debate' | 'prioritization';
type Difficulty = 'easy' | 'medium' | 'hard';
type Language = 'zh' | 'en';

const DURATION_OPTIONS: { value: DurationPreset; label: string; desc: string }[] = [
  { value: '20min', label: '20分钟', desc: '快速体验' },
  { value: '30min', label: '30分钟', desc: '标准流程' },
  { value: '45min', label: '45分钟', desc: '深度讨论' },
  { value: '60min', label: '60分钟', desc: '完整模拟' },
];

const TOPIC_STYLE_OPTIONS: { value: TopicStyle; label: string; desc: string }[] = [
  { value: 'case_study', label: '商业案例', desc: '给出具体情境，制定方案' },
  { value: 'debate', label: '辩论型', desc: '对立观点，论证立场' },
  { value: 'prioritization', label: '排序取舍', desc: '多选项排序，论证决策' },
];

export default function SessionCreator() {
  const router = useRouter();
  const [jdText, setJdText] = useState('');
  const [resumeText, setResumeText] = useState('');
  const [userName, setUserName] = useState('');
  const [difficulty, setDifficulty] = useState<Difficulty>('medium');
  const [participantCount, setParticipantCount] = useState(4);
  const [duration, setDuration] = useState<DurationPreset>('30min');
  const [language, setLanguage] = useState<Language>('zh');
  const [topicStyle, setTopicStyle] = useState<TopicStyle>('case_study');
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
          language,
          duration_preset: duration,
          topic_style: topicStyle,
          user_name: userName.trim() || undefined,
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
      <h1 className={styles.title}>群面模拟</h1>
      <p className={styles.subtitle}>
        输入目标岗位JD，AI将为你生成案例题目和竞争对手，模拟真实无领导小组讨论
      </p>

      <div className={styles.form}>
        {/* User Name */}
        <div className={styles.field}>
          <label className={styles.label}>
            你的名字 <span className={styles.optional}>(面试中的称呼)</span>
          </label>
          <input
            className={styles.input}
            type="text"
            value={userName}
            onChange={e => setUserName(e.target.value)}
            placeholder="输入你的名字，其他候选人和面试官会用这个名字称呼你"
            maxLength={20}
          />
        </div>

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
            个人简历 <span className={styles.optional}>(可选，AI会根据你的背景调整候选人)</span>
          </label>
          <textarea
            className={styles.textarea}
            value={resumeText}
            onChange={e => setResumeText(e.target.value)}
            placeholder="粘贴你的简历内容..."
            rows={4}
          />
        </div>

        {/* Duration Selection */}
        <div className={styles.field}>
          <label className={styles.label}>面试时长</label>
          <div className={styles.cardGrid}>
            {DURATION_OPTIONS.map(opt => (
              <button
                key={opt.value}
                className={`${styles.card} ${duration === opt.value ? styles.activeCard : ''}`}
                onClick={() => setDuration(opt.value)}
              >
                <div className={styles.cardLabel}>{opt.label}</div>
                <div className={styles.cardDesc}>{opt.desc}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Topic Style */}
        <div className={styles.field}>
          <label className={styles.label}>题目风格</label>
          <div className={styles.cardGrid3}>
            {TOPIC_STYLE_OPTIONS.map(opt => (
              <button
                key={opt.value}
                className={`${styles.card} ${topicStyle === opt.value ? styles.activeCard : ''}`}
                onClick={() => setTopicStyle(opt.value)}
              >
                <div className={styles.cardLabel}>{opt.label}</div>
                <div className={styles.cardDesc}>{opt.desc}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Options row: difficulty, count, language */}
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
            <label className={styles.label}>AI候选人</label>
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

          {/* Language */}
          <div className={styles.field}>
            <label className={styles.label}>语言</label>
            <div className={styles.segmentedControl}>
              {[
                { value: 'zh' as Language, label: '中文' },
                { value: 'en' as Language, label: 'English' },
              ].map(opt => (
                <button
                  key={opt.value}
                  className={`${styles.segment} ${language === opt.value ? styles.activeSegment : ''}`}
                  onClick={() => setLanguage(opt.value)}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Flow Preview */}
        <div className={styles.flowPreview}>
          <div className={styles.flowTitle}>面试流程预览</div>
          <div className={styles.flowSteps}>
            <FlowStep label="自我介绍" icon="👋" active />
            <FlowArrow />
            <FlowStep label="主持人介绍 + 阅读材料" icon="📋" active />
            <FlowArrow />
            <FlowStep label="开场发言" icon="💬" active />
            <FlowArrow />
            <FlowStep label="自由讨论" icon="🔥" active />
            <FlowArrow />
            <FlowStep label="总结陈述" icon="📝" active />
            <FlowArrow />
            <FlowStep label="面试官追问" icon="🎯" active />
          </div>
        </div>

        {error && <div className={styles.error}>{error}</div>}

        <button
          className={`btn btn-primary ${styles.submitBtn}`}
          onClick={handleSubmit}
          disabled={isLoading || !jdText.trim()}
        >
          {isLoading ? '正在生成题目和候选人...' : '开始群面模拟'}
        </button>
      </div>
    </div>
  );
}

function FlowStep({ label, icon, active }: { label: string; icon: string; active: boolean }) {
  return (
    <div className={styles.flowStep}>
      <span className={styles.flowIcon}>{icon}</span>
      <span className={styles.flowLabel}>{label}</span>
    </div>
  );
}

function FlowArrow() {
  return <span className={styles.flowArrow}>→</span>;
}
