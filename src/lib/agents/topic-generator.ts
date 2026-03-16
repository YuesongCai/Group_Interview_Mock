import { llmComplete } from '@/lib/llm/gateway';
import type { Topic, TopicType } from '@/lib/types';

const SYSTEM_PROMPT = `你是一个群面话题生成专家。根据提供的职位描述（JD）和候选人简历，生成一个适合群面讨论的话题。

话题应该：
1. 与目标岗位相关，但不需要专业知识就能参与讨论
2. 有多个可能的立场和角度，能引发有建设性的辩论
3. 适合4-6人的小组讨论，时长15-25分钟
4. 难度适中，既能展示逻辑思维，也能展示协作能力

你必须以JSON格式返回，包含以下字段：
{
  "title": "话题标题（简短有力）",
  "description": "话题的详细描述和背景信息（200-400字）",
  "type": "case_study 或 debate 或 prioritization",
  "background_material": "补充的背景材料或数据（如有）",
  "key_questions": ["讨论中可以探讨的关键问题1", "关键问题2", "关键问题3"]
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
    return JSON.parse(cleaned) as Topic;
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
  let prompt = `请根据以下信息生成一个群面讨论话题。\n\n`;
  prompt += `【职位描述】\n${jdText}\n\n`;

  if (resumeText) {
    prompt += `【候选人简历摘要】\n${resumeText.substring(0, 500)}\n\n`;
  }

  if (topicType) {
    const typeMap: Record<TopicType, string> = {
      case_study: '案例分析型',
      debate: '辩论型',
      prioritization: '排序/取舍型',
    };
    prompt += `【话题类型要求】${typeMap[topicType]}\n`;
  }

  return prompt;
}
