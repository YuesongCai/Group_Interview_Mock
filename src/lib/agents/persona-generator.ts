import { llmComplete } from '@/lib/llm/gateway';
import type { PersonaCard, PersonalityArchetype, Difficulty } from '@/lib/types';

const SYSTEM_PROMPT = `你是一个群面AI候选人角色生成器。你需要生成多个性格各异、背景不同的面试候选人角色。

每个角色需要有：
1. 真实可信的中文姓名
2. 与目标岗位相关但各有侧重的背景
3. 明确的性格类型和沟通风格
4. 不同的"攻击性"水平（代表发言积极程度）

确保角色之间有足够的差异性，以产生有趣的群面动态。

你必须以JSON数组格式返回：
[
  {
    "name": "姓名",
    "background": "详细背景描述（教育、工作经历等，50-100字）",
    "personality_type": "assertive_leader 或 analytical_thinker 或 collaborative_mediator 或 quiet_observer 或 devils_advocate",
    "aggressiveness": 0.0到1.0之间的数字,
    "knowledge_depth": "擅长和不擅长的领域描述",
    "speaking_style": "说话风格描述",
    "bias_tendency": "思考偏好或倾向"
  }
]

只返回JSON数组，不要其他内容。`;

// Archetype configurations for ensuring diversity
const ARCHETYPE_CONFIGS: Record<PersonalityArchetype, { aggRange: [number, number] }> = {
  assertive_leader: { aggRange: [0.7, 0.9] },
  analytical_thinker: { aggRange: [0.3, 0.5] },
  collaborative_mediator: { aggRange: [0.4, 0.6] },
  quiet_observer: { aggRange: [0.1, 0.3] },
  devils_advocate: { aggRange: [0.6, 0.8] },
};

// Minimum archetype sets based on participant count
const ARCHETYPE_SETS: Record<number, PersonalityArchetype[]> = {
  3: ['assertive_leader', 'analytical_thinker', 'collaborative_mediator'],
  4: ['assertive_leader', 'analytical_thinker', 'collaborative_mediator', 'devils_advocate'],
  5: ['assertive_leader', 'analytical_thinker', 'collaborative_mediator', 'quiet_observer', 'devils_advocate'],
};

export async function generatePersonas(
  jdText: string,
  count: number,
  difficulty: Difficulty,
  resumeBackground?: string
): Promise<PersonaCard[]> {
  const archetypes = ARCHETYPE_SETS[Math.min(count, 5)] || ARCHETYPE_SETS[4];
  const selectedArchetypes = archetypes.slice(0, count);

  const userPrompt = buildUserPrompt(jdText, count, difficulty, selectedArchetypes, resumeBackground);

  const response = await llmComplete(
    [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userPrompt },
    ],
    'persona_generator'
  );

  try {
    const cleaned = response.content.replace(/```json\n?|\n?```/g, '').trim();
    const personas = JSON.parse(cleaned) as PersonaCard[];

    // Validate and fix fields — LLM output may have non-numeric aggressiveness
    return personas.map((p, i) => {
      const rawAgg = typeof p.aggressiveness === 'number' ? p.aggressiveness : parseFloat(String(p.aggressiveness));
      const safeAgg = isNaN(rawAgg) ? 0.5 : rawAgg;
      return {
        ...p,
        aggressiveness: adjustAggressiveness(safeAgg, difficulty),
        personality_type: p.personality_type || selectedArchetypes[i],
      };
    });
  } catch {
    // Fallback: generate deterministic personas
    return generateFallbackPersonas(count, difficulty);
  }
}

function buildUserPrompt(
  jdText: string,
  count: number,
  difficulty: Difficulty,
  archetypes: PersonalityArchetype[],
  resumeBackground?: string
): string {
  const difficultyDesc: Record<Difficulty, string> = {
    easy: '候选人整体水平一般，给用户留出较多发挥空间',
    medium: '候选人水平参差不齐，有较强的也有一般的',
    hard: '候选人整体水平很高，竞争激烈',
  };

  let prompt = `请生成${count}个群面AI候选人角色。\n\n`;
  prompt += `【职位描述】\n${jdText.substring(0, 500)}\n\n`;
  prompt += `【难度设定】${difficultyDesc[difficulty]}\n\n`;
  prompt += `【角色类型分配】\n`;
  archetypes.forEach((a, i) => {
    const labels: Record<PersonalityArchetype, string> = {
      assertive_leader: '强势领导型',
      analytical_thinker: '分析思考型',
      collaborative_mediator: '协作调和型',
      quiet_observer: '沉稳观察型',
      devils_advocate: '挑战质疑型',
    };
    prompt += `  角色${i + 1}: ${labels[a]} (personality_type: ${a})\n`;
  });

  if (resumeBackground) {
    prompt += `\n【注意】用户的背景是：${resumeBackground.substring(0, 200)}\n`;
    prompt += `请确保AI候选人的背景与用户不同，以增加讨论的多样性。\n`;
  }

  return prompt;
}

function adjustAggressiveness(value: number, difficulty: Difficulty): number {
  const multiplier: Record<Difficulty, number> = {
    easy: 0.7,
    medium: 1.0,
    hard: 1.3,
  };
  return Math.min(1.0, Math.max(0.0, value * multiplier[difficulty]));
}

function generateFallbackPersonas(count: number, difficulty: Difficulty): PersonaCard[] {
  const fallbacks: PersonaCard[] = [
    {
      name: '陈思远',
      background: '北大光华管理学院MBA，曾在麦肯锡工作3年，擅长战略分析和框架搭建',
      personality_type: 'assertive_leader',
      aggressiveness: 0.8,
      knowledge_depth: '战略咨询能力强，技术细节较弱',
      speaking_style: '语言简洁有力，喜欢用框架分析问题，偶尔引用案例',
      bias_tendency: '倾向于从商业价值和ROI角度分析问题',
    },
    {
      name: '林雨桐',
      background: '清华计算机本科+经管双学位，在字节跳动做过2年数据分析，逻辑严密',
      personality_type: 'analytical_thinker',
      aggressiveness: 0.4,
      knowledge_depth: '数据分析能力强，对传统行业了解有限',
      speaking_style: '发言前会思考，喜欢用数据支撑观点，表达条理清晰',
      bias_tendency: '过于依赖数据和定量分析，有时忽略定性因素',
    },
    {
      name: '王嘉琪',
      background: '复旦社会学硕士，在联合利华做过品牌管理，善于理解人的需求',
      personality_type: 'collaborative_mediator',
      aggressiveness: 0.5,
      knowledge_depth: '消费者洞察和品牌策略强，财务分析较弱',
      speaking_style: '善于倾听和总结，经常在别人观点上做延伸，语气温和',
      bias_tendency: '偏重从消费者和用户体验角度考虑问题',
    },
    {
      name: '张浩然',
      background: '中山大学金融学硕士，曾在中金做过投行实习，对数字敏感',
      personality_type: 'devils_advocate',
      aggressiveness: 0.7,
      knowledge_depth: '财务建模和估值能力强，对运营管理了解有限',
      speaking_style: '喜欢提出反面观点，直言不讳，有时显得比较尖锐',
      bias_tendency: '习惯性质疑别人的假设，关注风险和下行空间',
    },
    {
      name: '刘诗涵',
      background: '浙大工业工程本科，在华为做过1年供应链管理，执行力强',
      personality_type: 'quiet_observer',
      aggressiveness: 0.2,
      knowledge_depth: '运营和供应链管理强，宏观战略视角有限',
      speaking_style: '话不多但常一针见血，善于在关键时刻提出重要观点',
      bias_tendency: '关注可执行性和实施细节，对太理想化的方案持保留态度',
    },
  ];

  return fallbacks.slice(0, count).map(p => ({
    ...p,
    aggressiveness: adjustAggressiveness(p.aggressiveness, difficulty),
  }));
}
