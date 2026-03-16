import { llmComplete } from '@/lib/llm/gateway';
import type { Message, Participant, Topic, Evaluation } from '@/lib/types';
import { v4 as uuidv4 } from 'uuid';

const SYSTEM_PROMPT = `你是一位资深的群面评估专家，拥有丰富的校招/社招评估中心经验。请分析以下群面讨论记录，对标记为【用户】的真人候选人进行全面评估。

评估维度及权重：
1. 领导力与主动性 (25%) — 提出框架、引导讨论方向、在讨论停滞时挺身而出、时间管理
2. 逻辑推理 (25%) — 论证结构、证据使用、因果关系清晰度、反驳质量
3. 协作与情商 (20%) — 在他人观点上延伸、认可他人贡献、建设性地解决分歧
4. 沟通清晰度 (15%) — 简洁性、结构化表达、用词得当、主动倾听信号
5. 创新与洞察 (15%) — 新颖视角、创造性方案、连接不同想法、建设性地挑战假设

你必须以JSON格式返回评估结果：
{
  "overall_score": 0-100的整数,
  "percentile": 0-100的整数（相对于一般群面表现的估计百分位）,
  "dimensions": {
    "leadership_initiative": {
      "score": 0-100,
      "weight": 0.25,
      "evidence": [
        {"description": "行为描述", "timestamp": "对应时间点", "quote": "原文引用"}
      ],
      "improvement": "具体可操作的改进建议"
    },
    "logical_reasoning": { 同上格式 },
    "collaboration_eq": { 同上格式 },
    "communication_clarity": { 同上格式 },
    "innovation_insight": { 同上格式 }
  },
  "strengths": ["优势1", "优势2"],
  "improvement_areas": ["改进方向1", "改进方向2"],
  "comparison_narrative": "与其他候选人的对比分析（200-300字）",
  "replay_highlights": [
    {"type": "strongest_argument 或 missed_opportunity 或 best_collaboration", "timestamp": "时间点", "description": "描述"}
  ]
}

评估要求：
1. 每个维度至少引用2个具体行为证据
2. 改进建议必须具体可操作，不要泛泛而谈
3. 对比分析要具体说明用户相对于其他候选人的表现差异
4. 评分要客观，不要给所有维度都打差不多的分数

只返回JSON，不要其他内容。`;

export async function generateEvaluation(
  messages: Message[],
  participants: Participant[],
  topic: Topic,
  userId: string,
  sessionId: string
): Promise<Evaluation> {
  const userPrompt = buildEvaluationPrompt(messages, participants, topic);

  const response = await llmComplete(
    [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userPrompt },
    ],
    'evaluator',
    { max_tokens: 3000 }
  );

  try {
    const cleaned = response.content.replace(/```json\n?|\n?```/g, '').trim();
    const result = JSON.parse(cleaned);

    return {
      id: uuidv4(),
      session_id: sessionId,
      user_id: userId,
      overall_score: result.overall_score ?? 65,
      percentile: result.percentile ?? 55,
      dimensions: {
        leadership_initiative: parseDimension(result.dimensions?.leadership_initiative, 0.25),
        logical_reasoning: parseDimension(result.dimensions?.logical_reasoning, 0.25),
        collaboration_eq: parseDimension(result.dimensions?.collaboration_eq, 0.20),
        communication_clarity: parseDimension(result.dimensions?.communication_clarity, 0.15),
        innovation_insight: parseDimension(result.dimensions?.innovation_insight, 0.15),
      },
      strengths: result.strengths || ['积极参与讨论'],
      improvement_areas: result.improvement_areas || ['可以更主动地引导讨论方向'],
      comparison_narrative: result.comparison_narrative || '整体表现中等',
      replay_highlights: result.replay_highlights || [],
      created_at: new Date().toISOString(),
    };
  } catch {
    return buildFallbackEvaluation(sessionId, userId);
  }
}

function buildEvaluationPrompt(
  messages: Message[],
  participants: Participant[],
  topic: Topic
): string {
  // Build participant list
  const participantInfo = participants
    .map(p => {
      const tag = p.type === 'human' ? '【用户/被评估者】' : '【AI候选人】';
      return `${tag} ${p.display_name}${p.persona_card ? ` (${p.persona_card.personality_type})` : ''}`;
    })
    .join('\n');

  // Build full transcript with timestamps
  const transcript = messages
    .map(m => {
      const tag = m.participant_type === 'human' ? '【用户】' : '';
      const interrupt = m.is_interrupt ? '[打断]' : '';
      return `[${m.timestamp}] ${tag}${interrupt}${m.participant_name}: ${m.content}`;
    })
    .join('\n');

  // Count user messages vs AI messages
  const userMessages = messages.filter(m => m.participant_type === 'human');
  const totalMessages = messages.length;

  return `【讨论话题】
${topic.title}
${topic.description}

【参与者】
${participantInfo}

【统计信息】
总发言数: ${totalMessages}
用户发言数: ${userMessages.length}
用户发言占比: ${totalMessages > 0 ? ((userMessages.length / totalMessages) * 100).toFixed(1) : 0}%

【完整讨论记录】
${transcript}

请对【用户】进行全面评估。`;
}

function parseDimension(raw: unknown, weight: number) {
  const d = raw as Record<string, unknown> | undefined;
  return {
    score: (d?.score as number) ?? 60,
    weight,
    evidence: Array.isArray(d?.evidence) ? d.evidence : [],
    improvement: (d?.improvement as string) ?? '继续保持并寻找更多机会展示此维度的能力。',
  };
}

function buildFallbackEvaluation(sessionId: string, userId: string): Evaluation {
  return {
    id: uuidv4(),
    session_id: sessionId,
    user_id: userId,
    overall_score: 65,
    percentile: 55,
    dimensions: {
      leadership_initiative: { score: 60, weight: 0.25, evidence: [], improvement: '尝试更主动地提出框架和引导讨论方向。' },
      logical_reasoning: { score: 70, weight: 0.25, evidence: [], improvement: '在论述时加入更多数据和证据支撑。' },
      collaboration_eq: { score: 65, weight: 0.20, evidence: [], improvement: '多在别人的观点上做延伸，表达认可。' },
      communication_clarity: { score: 68, weight: 0.15, evidence: [], improvement: '尝试使用"第一...第二...第三..."的结构化表达。' },
      innovation_insight: { score: 58, weight: 0.15, evidence: [], improvement: '尝试从不同角度思考问题，提出差异化的观点。' },
    },
    strengths: ['积极参与了讨论', '表达基本清晰'],
    improvement_areas: ['可以更主动地引导讨论', '论述需要更多证据支撑'],
    comparison_narrative: '评估数据解析失败，请重新生成评估报告。',
    replay_highlights: [],
    created_at: new Date().toISOString(),
  };
}
