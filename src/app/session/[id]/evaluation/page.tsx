'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import EvaluationReport from '@/components/evaluation/EvaluationReport';
import type { Evaluation } from '@/lib/types';

export default function EvaluationPage() {
  const router = useRouter();
  const params = useParams();
  const sessionId = params.id as string;

  const [evaluation, setEvaluation] = useState<Evaluation | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    async function fetchEvaluation() {
      try {
        setLoading(true);
        const res = await fetch(`/api/sessions/${sessionId}/evaluation`);

        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error?.message || 'Failed to generate evaluation');
        }

        const data = await res.json();
        setEvaluation(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : '评估生成失败');
      } finally {
        setLoading(false);
      }
    }

    fetchEvaluation();
  }, [sessionId]);

  if (loading) {
    return (
      <div style={{
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 16,
      }}>
        <div className="animate-pulse" style={{
          width: 48,
          height: 48,
          borderRadius: '50%',
          background: 'var(--accent)',
        }} />
        <p style={{ color: 'var(--text-secondary)' }}>正在生成评估报告...</p>
        <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>
          AI评估专家正在分析你的群面表现
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 16,
      }}>
        <p style={{ color: 'var(--danger)', fontSize: 16 }}>{error}</p>
        <button
          className="btn btn-secondary"
          onClick={() => router.push('/session/new')}
        >
          重新开始
        </button>
      </div>
    );
  }

  if (!evaluation) return null;

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-primary)' }}>
      {/* Header */}
      <div style={{
        padding: '16px 24px',
        borderBottom: '1px solid var(--border)',
        background: 'var(--bg-secondary)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        <h1 style={{ fontSize: 18, fontWeight: 600 }}>群面评估报告</h1>
        <div style={{ display: 'flex', gap: 12 }}>
          <button
            className="btn btn-secondary"
            onClick={() => router.push('/session/new')}
            style={{ fontSize: 13, padding: '8px 16px' }}
          >
            再来一次
          </button>
          <button
            className="btn btn-primary"
            onClick={() => router.push('/')}
            style={{ fontSize: 13, padding: '8px 16px' }}
          >
            返回首页
          </button>
        </div>
      </div>

      <EvaluationReport evaluation={evaluation} />
    </div>
  );
}
