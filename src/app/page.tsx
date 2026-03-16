import Link from 'next/link';

export default function Home() {
  return (
    <main style={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '48px 24px',
      textAlign: 'center',
    }}>
      <div style={{ maxWidth: 600 }}>
        <h1 style={{
          fontSize: 42,
          fontWeight: 800,
          marginBottom: 8,
          background: 'linear-gradient(135deg, #6366f1, #818cf8)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
        }}>
          GroupMock
        </h1>
        <p style={{
          fontSize: 20,
          color: 'var(--text-secondary)',
          marginBottom: 12,
        }}>
          AI群面模拟器
        </p>
        <p style={{
          fontSize: 15,
          color: 'var(--text-muted)',
          lineHeight: 1.8,
          marginBottom: 40,
        }}>
          与3-5位AI候选人进行真实的无领导小组讨论练习。
          AI根据你的目标岗位动态生成讨论话题和候选人，
          讨论结束后提供详细的多维度评估报告。
        </p>

        <div style={{ display: 'flex', gap: 16, justifyContent: 'center' }}>
          <Link
            href="/session/new"
            className="btn btn-primary"
            style={{ padding: '14px 32px', fontSize: 16, fontWeight: 600 }}
          >
            开始模拟群面
          </Link>
        </div>

        {/* Feature Cards */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 16,
          marginTop: 64,
          textAlign: 'left',
        }}>
          {[
            {
              title: 'AI候选人',
              desc: '每位AI候选人都有独特的背景、性格和沟通风格，模拟真实群面的多样化动态',
            },
            {
              title: '智能主持',
              desc: 'AI主持人管理发言顺序、控制节奏、在讨论停滞时引导方向',
            },
            {
              title: '全面评估',
              desc: '从领导力、逻辑、协作、沟通、创新5个维度给出详细评分和改进建议',
            },
          ].map((f, i) => (
            <div
              key={i}
              className="card"
              style={{ padding: 20 }}
            >
              <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 8 }}>{f.title}</h3>
              <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                {f.desc}
              </p>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
