import { llmComplete } from '@/lib/llm/gateway';
import type { PersonaCard, PersonalityArchetype, Difficulty } from '@/lib/types';

const SYSTEM_PROMPT = `你是一个群面AI候选人角色生成器。你需要生成多个性格各异、背景不同、有真实感的面试候选人角色。

每个角色不是一个"类型标签"，而是一个活生生的人。他们有：
1. 具体的教育背景和工作经历（包含具体公司名、具体项目、具体数字）
2. 鲜明的说话习惯（口头禅、句式偏好、论证风格）
3. 认知偏差（每个人都有盲区，比如数据控忽视情感、理想主义者低估执行难度）
4. 明确的优势和弱点（不是抽象的，而是在群面中会具体表现出来的行为）

你必须以JSON数组格式返回：
[
  {
    "name": "姓名",
    "background": "详细背景（教育+具体工作经历+具体项目数据，80-120字）",
    "personality_type": "assertive_leader | analytical_thinker | collaborative_mediator | quiet_observer | devils_advocate",
    "aggressiveness": 0.0到1.0,
    "knowledge_depth": "擅长领域 vs 明确短板",
    "speaking_style": "具体的说话方式描述，包含2-3个口头禅或句式习惯",
    "bias_tendency": "核心思维倾向",
    "cognitive_bias": "具体的认知偏差名称+在讨论中的表现",
    "verbal_habits": ["口头禅1", "习惯句式2", "论证方式3"],
    "strength_blindspot": "最大优势的盲区（如：逻辑很强但忽略人的因素）",
    "weakness": "在群面中会暴露的具体弱点",
    "cv_highlights": ["具体成就1（含数据）", "具体成就2（含数据）"]
  }
]

【重要】
- background必须包含具体公司名和具体数字（如"负责过日均UV 200万的产品线"）
- verbal_habits至少3个，要具体到可以直接用在对话里
- cv_highlights至少2个，每个都要有数据（如"主导XX项目，3个月内DAU提升40%"）
- 每个角色的说话风格必须明显不同，让人一看就知道是谁在说话

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

    // Validate and fix fields
    return personas.map((p, i) => {
      const rawAgg = typeof p.aggressiveness === 'number' ? p.aggressiveness : parseFloat(String(p.aggressiveness));
      const safeAgg = isNaN(rawAgg) ? 0.5 : rawAgg;
      return {
        ...p,
        aggressiveness: adjustAggressiveness(safeAgg, difficulty),
        personality_type: p.personality_type || selectedArchetypes[i],
        // Ensure new fields have defaults
        cognitive_bias: p.cognitive_bias || '确认偏误 - 倾向于寻找支持自己观点的证据',
        verbal_habits: Array.isArray(p.verbal_habits) && p.verbal_habits.length > 0
          ? p.verbal_habits
          : ['我觉得...', '从我的经验来看...', '换个角度想...'],
        strength_blindspot: p.strength_blindspot || '专注自身领域，对跨领域问题关注不够',
        weakness: p.weakness || '在压力下容易重复自己的观点',
        cv_highlights: Array.isArray(p.cv_highlights) && p.cv_highlights.length > 0
          ? p.cv_highlights
          : ['有相关实习经验', '参与过团队项目'],
      };
    });
  } catch {
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
    easy: '候选人整体水平一般，给用户留出较多发挥空间。背景以实习和初级经验为主。',
    medium: '候选人水平参差不齐，有1-2个较强的。有的有大厂经历，有的是非对口专业转行。',
    hard: '候选人整体水平很高，都有名校+大厂背景，竞争激烈。',
  };

  let prompt = `请生成${count}个群面AI候选人角色。\n\n`;
  prompt += `【职位描述】\n${jdText.substring(0, 500)}\n\n`;
  prompt += `【难度设定】${difficultyDesc[difficulty]}\n\n`;
  prompt += `【角色类型分配】\n`;
  archetypes.forEach((a, i) => {
    const labels: Record<PersonalityArchetype, string> = {
      assertive_leader: '强势领导型 — 喜欢定框架、抢先发言、用"我们应该分三步走"开头',
      analytical_thinker: '分析思考型 — 爱用数据说话、会说"从数据来看"、喜欢质疑假设的合理性',
      collaborative_mediator: '协作调和型 — 善于总结别人观点、会说"刚才XX和YY的观点其实可以结合"',
      quiet_observer: '沉稳观察型 — 话不多但一针见血、常在关键时刻发言、喜欢说"我注意到大家都忽略了一个点"',
      devils_advocate: '挑战质疑型 — 专门唱反调、会说"但是这里有个问题"、喜欢压力测试别人的方案',
    };
    prompt += `  角色${i + 1}: ${labels[a]} (personality_type: ${a})\n`;
  });

  prompt += `\n【关键要求】\n`;
  prompt += `- 每个人的verbal_habits要完全不同，不能有重叠的口头禅\n`;
  prompt += `- background里要有具体公司名+具体数字（如"在美团做过半年外卖商家运营，负责300+商家"）\n`;
  prompt += `- cv_highlights每个要带数字（如"主导用户增长项目，3个月新增用户12万"）\n`;
  prompt += `- weakness要具体到群面场景（如"容易打断别人"而不是"沟通能力有待提高"）\n`;

  if (resumeBackground) {
    prompt += `\n【真人候选人背景】${resumeBackground.substring(0, 200)}\n`;
    prompt += `请确保AI候选人的背景与真人不同，但要形成互补和碰撞。\n`;
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
      background: '北大光华MBA，曾在麦肯锡做过2年咨询顾问，主导过3个消费品行业的市场进入策略项目，其中一个帮客户实现了首年营收1.2亿',
      personality_type: 'assertive_leader',
      aggressiveness: 0.8,
      knowledge_depth: '战略咨询和框架搭建极强，但对技术实现细节和一线执行几乎没概念',
      speaking_style: '说话快、有力，喜欢上来先定框架再讨论。常用"我们先拉齐一下""本质上这是个XX问题"',
      bias_tendency: '万事先看ROI，用商业价值衡量一切',
      cognitive_bias: '锤子思维 - 手里有咨询框架这把锤子，看什么都是钉子，所有问题都想套MECE',
      verbal_habits: ['我们先把框架定下来', '本质上这是一个...的问题', '从ROI角度来看'],
      strength_blindspot: '框架能力强但容易过于模板化，忽略具体情境的特殊性',
      weakness: '太强势，容易抢话和打断别人，让团队觉得没有参与感',
      cv_highlights: ['麦肯锡2年，主导消费品市场进入策略，帮客户实现首年1.2亿营收', '北大光华案例大赛冠军'],
    },
    {
      name: '林雨桐',
      background: '清华计算机本科+经管双学位，在字节跳动做了2年数据分析师，负责抖音电商商家数据看板，日均处理PV超8000万的数据pipeline',
      personality_type: 'analytical_thinker',
      aggressiveness: 0.4,
      knowledge_depth: '数据分析和量化论证很强，但对品牌调性、用户情感这类软性因素理解薄弱',
      speaking_style: '发言前有明显思考停顿，说话条理清晰，常用"从数据来看""我们可以量化一下"',
      bias_tendency: '数据至上主义，没有数据支撑的观点她都持怀疑态度',
      cognitive_bias: '量化偏执 - 认为不能量化的东西就不重要，忽视定性分析的价值',
      verbal_habits: ['从数据来看...', '这个能量化吗？', '我们拆解一下这个数字'],
      strength_blindspot: '数据能力强但容易陷入分析瘫痪，在需要快速决策时犹豫不决',
      weakness: '过于依赖数据，面对模糊问题时容易沉默，错过发言窗口',
      cv_highlights: ['字节跳动2年，负责日均8000万PV数据pipeline', '主导商家分层模型，提升高价值商家留存率18%'],
    },
    {
      name: '王嘉琪',
      background: '复旦社会学硕士，在联合利华做了1.5年品牌管理MT，参与过多芬和力士的social campaign策划，其中一个抖音挑战赛播放量破2亿',
      personality_type: 'collaborative_mediator',
      aggressiveness: 0.5,
      knowledge_depth: '消费者洞察和品牌传播强，但财务模型和供应链几乎不懂',
      speaking_style: '善于倾听和衔接，常先肯定别人再补充。说话温和但有自己的坚持。',
      bias_tendency: '以消费者为中心，总想着"用户怎么想"',
      cognitive_bias: '共情陷阱 - 过度代入消费者视角，有时忽略商业可行性',
      verbal_habits: ['我觉得XX说的很有道理，而且...', '从用户的角度来看...', '我们可以把这两个观点结合一下'],
      strength_blindspot: '团队协作意识好但缺乏魄力，在需要做取舍决策时容易两边讨好',
      weakness: '太在意团队和谐，不敢直接反对别人，观点容易被模糊化',
      cv_highlights: ['联合利华品牌MT，策划抖音挑战赛播放量破2亿', '主导多芬品牌年轻化调研，覆盖5000+样本'],
    },
    {
      name: '张浩然',
      background: '中山大学金融学硕士，在中金做过8个月投行实习，参与了2个IPO项目和1个并购案的尽调，处理过超50亿规模的交易文档',
      personality_type: 'devils_advocate',
      aggressiveness: 0.7,
      knowledge_depth: '财务分析和风险评估强，但对运营执行和用户增长不太了解',
      speaking_style: '直来直去，喜欢挑战别人的假设。说话有攻击性但不失礼貌。',
      bias_tendency: '风险厌恶 - 第一反应永远是找问题和风险点',
      cognitive_bias: '否定偏差 - 总能看到方案的漏洞但很少贡献建设性方案',
      verbal_habits: ['但是这里有个问题...', '这个假设成立吗？', '万一...怎么办？'],
      strength_blindspot: '批判性思维强但容易只破不立，团队需要方案时他只能指出问题',
      weakness: '质疑太多会让团队气氛紧张，有时候显得不配合',
      cv_highlights: ['中金投行8个月，参与2个IPO+1个并购，涉及50亿+交易规模', '金融建模大赛全国前10'],
    },
    {
      name: '刘诗涵',
      background: '浙大工业工程本科，在华为做了1年供应链管理，负责过手机配件的供应商管理，管理15家供应商的交付和质量',
      personality_type: 'quiet_observer',
      aggressiveness: 0.2,
      knowledge_depth: '运营管理和流程优化强，但宏观战略和创意营销不太行',
      speaking_style: '话不多但一针见血，喜欢在大家讨论充分后做关键总结。语速慢但精准。',
      bias_tendency: '实操导向，关注"这个方案真的能落地吗"',
      cognitive_bias: '可行性偏执 - 过度关注执行难度，可能扼杀有创意但看似激进的好方案',
      verbal_habits: ['我注意到大家都忽略了一个点...', '这个方案落地的话，具体怎么执行？', '我补充一个细节'],
      strength_blindspot: '执行视角独到但容易被更强势的人淹没，好观点可能因为声音小而被忽视',
      weakness: '前期太沉默，容易在讨论前半段存在感过低',
      cv_highlights: ['华为供应链1年，管理15家供应商，将交付准时率从82%提升到95%', '浙大工业工程系优秀毕业设计'],
    },
  ];

  return fallbacks.slice(0, count).map(p => ({
    ...p,
    aggressiveness: adjustAggressiveness(p.aggressiveness, difficulty),
  }));
}
