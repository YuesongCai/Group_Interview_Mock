import { llmComplete } from '@/lib/llm/gateway';
import type { Topic, TopicType } from '@/lib/types';

const SYSTEM_PROMPT = `你是一个专业的群面题目设计师，擅长从职位描述中提炼出高质量的无领导小组讨论案例题。

你的题目风格应该模仿真实大厂群面题（如字节跳动、腾讯、欧莱雅等），具备以下特征：

1. **有具体的商业场景**：给候选人一个具体的角色和客户/业务背景
2. **有详细的背景材料（含真实感的数据）**：行业数据、客户信息、市场状况等
3. **有明确的核心问题**：开放性问题，允许不同方案和立场
4. **补充数据必须有具体数字**：不能写"月GMV约XX万"这种占位符，必须给出具体数字

【参考案例1 - 字节广告销售】
背景材料：你是一个广告销售，10月份有一家传统银行客户找到你，想要在抖音等字节系平台上打造品牌正面形象，拓展线上获客渠道。客户是全国股份银行，管理资产规模约8.5万亿，零售客户超6000万。之前只合作过硬广广告曝光（年预算约800万），对线上营销渠道的新玩法了解较少。客户希望平台可以给到一份全年整合营销方案。
补充数据：银行App月活约1200万，信用卡新客获取成本约180元/人，同行业标杆（招商银行）抖音粉丝380万，年度抖音投放预算约3000万。
问题：请结合字节系产品的优势，帮助此银行客户设计一个全年营销解决方案。

【参考案例2 - 欧莱雅美妆】
背景材料：A high-end international beauty brand plans to open its Douyin flagship store. Currently the brand's Tmall GMV is about ¥500M/year with 2M followers. On Douyin, the brand has 50K followers and ¥8M GMV mainly from KOL seeding.
补充数据：Brand avg ticket price: ¥350. Top 100 beauty brand KOL live streaming weight: 45%. Douyin beauty category growth rate: 78% YoY. Brand's target customer: female 25-35, tier 1-2 cities.
问题：What is the recommended approach to kick off the Douyin flagship store business?

【关键规则 - 数据必须具体】
- 写"月GMV约3000万"，不要写"月GMV约XX万"
- 写"日均UV 200万"，不要写"日均UV较高"
- 写"获客成本约150元/人"，不要写"获客成本较高"
- 所有数字都应该看起来合理，符合行业实际水平
- 数字不需要100%真实，但要符合数量级和行业常识

你必须以JSON格式返回：
{
  "title": "简短有力的题目标题",
  "description": "核心问题（1-2句话）",
  "type": "case_study | debate | prioritization",
  "background_material": "详细背景材料（200-500字），必须包含具体数字",
  "key_questions": ["讨论维度1", "讨论维度2", "讨论维度3"],
  "support_info": "补充数据（必须全部是具体数字，不能有XX/某某等占位符）"
}

只返回JSON，不要其他内容。`;

export async function generateTopic(
  jdText: string,
  resumeText?: string,
  topicType?: TopicType
): Promise<Topic> {
  const userPrompt = buildUserPrompt(jdText, resumeText, topicType);

  const response = await llmComplete(
    [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userPrompt },
    ],
    'topic_generator'
  );

  try {
    const cleaned = response.content.replace(/```json\n?|\n?```/g, '').trim();
    const parsed = JSON.parse(cleaned);

    const topic: Topic = {
      title: parsed.title,
      description: parsed.description,
      type: parsed.type || topicType || 'case_study',
      background_material: parsed.background_material || undefined,
      key_questions: parsed.key_questions || undefined,
    };

    // Append support_info — validate it has actual numbers
    if (parsed.support_info) {
      const hasPlaceholder = /[XxＸ]{2,}|某某|约\s*$/.test(parsed.support_info);
      if (!hasPlaceholder) {
        topic.background_material = (topic.background_material || '') +
          '\n\n【补充数据】\n' + parsed.support_info;
      }
    }

    return topic;
  } catch {
    return {
      title: '新零售渠道拓展策略',
      description: '一家传统快消品牌希望拓展线上DTC渠道，请为其制定进入抖音电商的整体方案。',
      type: topicType || 'case_study',
      background_material: '你是某国际快消集团的中国区数字营销负责人。集团旗下有一个定位中高端的个护品牌，目前主要依赖线下商超渠道（占总销售额的72%）和天猫旗舰店（年GMV约1.8亿，粉丝数120万）。\n\n品牌在抖音的现状：官方账号粉丝仅3.2万，过去半年通过达人带货产生了约600万GMV，但退货率高达35%。品牌核心产品均价在89-169元区间，目标消费者为25-40岁女性。\n\n管理层计划明年投入800万预算用于抖音渠道建设，目标是1年内抖音GMV达到5000万，同时品牌搜索指数提升50%。\n\n【补充数据】\n行业参考：同品类头部品牌抖音月均GMV约4000万，自播占比55%，达人分销占比45%。抖音个护品类平均客单价68元，退货率约22%。品牌当前抖音广告ROI约1:2.3，行业平均约1:3.5。',
      key_questions: [
        '如何平衡自播和达人分销的比例？',
        '800万预算应该如何分配（内容制作/广告投放/达人合作/店铺运营）？',
        '如何解决当前35%的高退货率问题？',
      ],
    };
  }
}

function buildUserPrompt(jdText: string, resumeText?: string, topicType?: TopicType): string {
  let prompt = `请根据以下职位描述，设计一道高质量的群面案例讨论题。

【关键要求】
- 题目必须从JD中提炼出与该岗位核心工作内容直接相关的商业场景
- 不要出泛泛的"数字化转型"类通用题目
- 背景材料必须包含具体的数字（GMV、用户数、预算、增长率等）
- 补充数据（support_info）里的每一条都必须有具体数字
- 数字要符合行业实际水平，看起来可信

【职位描述】
${jdText}

`;

  if (resumeText) {
    prompt += `【候选人背景参考】
${resumeText.substring(0, 500)}
（注意：题目难度要略高于候选人当前水平）

`;
  }

  if (topicType) {
    const typeMap: Record<TopicType, string> = {
      case_study: '案例分析型（给出具体商业情境，要求制定方案）',
      debate: '辩论型（给出两个或多个对立立场，要求论证）',
      prioritization: '排序取舍型（给出多个选项，要求排序并论证）',
    };
    prompt += `【话题类型要求】${typeMap[topicType]}\n`;
  }

  return prompt;
}
