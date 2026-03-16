import { llmComplete } from '@/lib/llm/gateway';
import type { Topic, TopicType } from '@/lib/types';

const SYSTEM_PROMPT = `你是一个专业的群面题目设计师，擅长从职位描述中提炼出高质量的无领导小组讨论案例题。

你的题目风格应该模仿真实大厂群面题（如字节跳动、腾讯、欧莱雅等），具备以下特征：

1. **有具体的商业场景/情境**：给候选人一个具体的角色和客户/业务背景
2. **有详细的背景材料**：包含行业数据、客户信息、市场状况等，让候选人有素材可以分析
3. **有明确的核心问题**：一个需要团队讨论并给出方案的开放性问题
4. **有讨论要求**：如"需要数据驱动"、"说明商业逻辑"、"考虑可执行性"等

【参考案例1 - 字节广告销售】
背景材料：你是一个广告销售，10月份有一家传统银行客户找到你，想要在抖音等字节系平台上打造品牌正面形象，拓展线上获客渠道。客户是全国股份银行，之前只合作过硬广广告曝光，对线上营销渠道的新玩法了解较少。客户希望平台可以给到一份全年整合营销方案，实现银行在平台上内容阵地打造和正面宣传，同时实现线上获客赋能银行的信用卡、企业贷、财富管理等金融服务。
问题：请结合字节系产品的优势，帮助此银行客户设计一个字节系平台全年营销解决方案，完成线上业务的拓展。

【参考案例2 - 欧莱雅美妆】
背景材料：A beauty brand just plans to open its Douyin flagship store. There are several ways to kick off the business, from store live streaming, or from KOL live streaming, or from Douyin mall, or mix, etc.
问题：What is the way you recommend and what is the overall plan following the direction?
要求：Make reasonable hypothesis, Illustrate your understanding of the business model, Illustrate your solution in a logic way, Be data driven and list down all data needed to prove hypothesis
支撑信息：Brand positioning: international high-end makeup brand, with fashion background and long history. KOL live streaming sales weight in top 100 Douyin beauty brand: 45%

你必须以JSON格式返回，包含以下字段：
{
  "title": "简短有力的题目标题",
  "description": "核心问题描述（1-2句话，清晰说明要讨论什么）",
  "type": "case_study 或 debate 或 prioritization",
  "background_material": "详细的背景材料（200-500字），包含：角色设定、客户/业务背景、行业数据、市场状况等。要具体、有细节，让候选人有充分的讨论素材",
  "key_questions": ["讨论要求1（如：需要考虑的维度）", "讨论要求2", "讨论要求3"],
  "support_info": "补充的支撑数据或信息（可选，如行业数据、市场规模等）"
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

    // Merge support_info into background_material if present
    const topic: Topic = {
      title: parsed.title,
      description: parsed.description,
      type: parsed.type || topicType || 'case_study',
      background_material: parsed.background_material || undefined,
      key_questions: parsed.key_questions || undefined,
    };

    // Append support_info to background_material if it exists
    if (parsed.support_info) {
      topic.background_material = (topic.background_material || '') +
        '\n\n【补充数据】\n' + parsed.support_info;
    }

    return topic;
  } catch {
    // Fallback: create a basic topic if parsing fails
    return {
      title: '数字化转型战略讨论',
      description: `基于提供的职位描述，请讨论：在当前市场环境下，一家传统企业应该如何制定数字化转型战略？请从技术选型、组织变革、资源分配和风险管控等角度进行讨论。原始JD：${jdText.substring(0, 200)}...`,
      type: topicType || 'case_study',
      key_questions: [
        '数字化转型的优先级应该如何排序？',
        '如何平衡短期成本和长期收益？',
        '组织架构需要做出哪些调整？',
      ],
    };
  }
}

function buildUserPrompt(jdText: string, resumeText?: string, topicType?: TopicType): string {
  let prompt = `请根据以下职位描述，设计一道高质量的群面案例讨论题。

【关键要求】
- 题目必须从JD中提炼出与该岗位核心工作内容直接相关的商业场景
- 不要出泛泛的"数字化转型"类通用题目
- 要有具体的客户画像、行业数据、市场背景
- 背景材料要丰富（200-500字），让候选人有足够的分析素材
- 问题要开放，允许不同方案和立场

【职位描述】
${jdText}

`;

  if (resumeText) {
    prompt += `【候选人背景参考】
${resumeText.substring(0, 500)}
（注意：题目难度要略高于候选人当前水平，有一定挑战性）

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
