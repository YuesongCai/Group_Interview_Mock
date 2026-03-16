import { llmComplete } from '@/lib/llm/gateway';
import type { Topic, TopicType, TopicMappingType } from '@/lib/types';

/**
 * Step 1: Analyze JD to extract role type and core competencies.
 * This determines the topic mapping strategy.
 */
const JD_ANALYSIS_PROMPT = `你是一位群面题目设计专家。请分析以下职位描述，提取关键信息。

你必须以JSON格式返回：
{
  "role_category": "operations_management | commercial_retail | sales_bd | marketing_brand | tech_product | finance_consulting | general_management",
  "core_competencies": ["核心能力1", "核心能力2", "核心能力3"],
  "industry": "所属行业（如：物流、电商、快消、金融、科技）",
  "company_hint": "公司名或类型（如有）",
  "seniority": "intern | junior | mid | senior",
  "recommended_topic_type": "case_study | debate | prioritization",
  "recommended_mapping": "direct | semi_direct | indirect",
  "mapping_rationale": "为什么推荐这种映射方式（一句话）"
}

【映射规则】
- operations/supply_chain/general_management 岗 → 推荐 indirect（跨行业题目，考通用商业判断）
- sales/bd 岗 → 推荐 direct（角色扮演，你是销售帮客户解决问题）
- marketing/brand 岗 → 推荐 semi_direct（同行业但换角度）
- commercial/retail 岗 → 推荐 semi_direct（业务模式理解+战略执行）
- tech/product 岗 → 推荐 indirect（用非技术场景考商业判断）
- finance/consulting 岗 → 推荐 semi_direct（相关行业的投资/咨询场景）

【topic_type规则】
- 管培/综合岗 → prioritization（排优先级、做取舍）
- 销售/商务岗 → case_study（角色扮演解决客户问题）
- 市场/品牌岗 → case_study（营销策略制定）
- 如果JD强调"分析能力" → 任何类型都可以，但需要有数据

只返回JSON，不要其他内容。`;

/**
 * Step 2: Generate the actual topic based on JD analysis.
 */
function buildTopicGenerationPrompt(jdAnalysis: JDAnalysis): string {
  return `你是一个专业的群面题目设计师。请基于以下JD分析结果，设计一道高质量的群面案例讨论题。

【JD分析结果】
- 岗位类型: ${jdAnalysis.role_category}
- 核心能力考察: ${jdAnalysis.core_competencies.join('、')}
- 行业: ${jdAnalysis.industry}
- 题目类型: ${jdAnalysis.recommended_topic_type}
- 映射方式: ${jdAnalysis.recommended_mapping}（${jdAnalysis.mapping_rationale}）

【映射方式说明】
${getMappingInstructions(jdAnalysis.recommended_mapping)}

【题目结构要求 - 严格遵循】

一、背景铺垫（2-3段，200-400字）
必须包含：
- 第1段：公司基本情况（行业、规模、现状、用化名如"H集团""T品牌"）
- 第2段：已取得的成果 + 当前面临的核心挑战/瓶颈
- 第3段：市场或竞争格局简述
${jdAnalysis.recommended_mapping === 'direct' ? '- 因为是direct映射，给候选人一个明确角色（如"你是XX团队的负责人"）' : ''}

二、核心数据（必须有2-3个具体数字）
- 数字是用来锚定判断方向的，不是用来精确计算的
- 例：用户留存率从42%降至31%、竞品市场份额从15%增长到28%、预算2000万/年
- 【绝对禁止】XX万、约XX%、某某公司 — 每个数字必须是具体的

三、任务要求（2-3个，有递进关系）
- 第1个：做判断/选方向/排优先级（"以下三个方向，你认为应该优先推进哪个？"）
- 第2个：针对选定方向，给具体行动计划
- 第3个（可选）：风险识别或替代方案

四、约束条件（1-2个）
让讨论有边界，不能什么都说：
- 预算约束（"在X万预算内"）
- 时间约束（"需要在6个月内见到效果"）
- 资源约束（"团队只有X人"）

五、内在矛盾（题目的灵魂）
好的题目必须有至少一个内在矛盾/张力：
- 例：海外市场利润率更高但执行复杂
- 例：KOL带货GMV高但损害品牌形象
- 例：降价能提量但影响品牌定位
- 这个矛盾让不同立场的候选人都有理有据

六、意外信息（mid-discussion twist）
设计一条"讨论进行到一半时"的新信息，模拟真实群面中的突发事件：
- 可以是一封email（"刚收到消息，竞品X刚宣布..."）
- 可以是新数据（"最新季度数据显示..."）
- 可以是约束变化（"管理层刚通知预算削减30%"）
- 这条信息应该让之前的讨论方向需要重新审视

【隐性标准 checklist】
✅ 有明确的"选择"压力（不是"做什么"而是"先做什么/怎么取舍"）
✅ 数据真实且具体（不是"增速较快"而是"YoY增长67%"）
✅ 有内在矛盾（让讨论有张力）
✅ 允许不同背景的人切入（数据/市场/运营/战略 各有切入角度）

${getReferenceCases(jdAnalysis)}

你必须以JSON格式返回：
{
  "title": "简短有力的题目标题（如：丰茗茶饮增长战略 / J集团采销升级方案）",
  "description": "核心问题（1-2句话，清晰说明要讨论和决策什么）",
  "type": "${jdAnalysis.recommended_topic_type}",
  "mapping_type": "${jdAnalysis.recommended_mapping}",
  "background_material": "完整背景材料（按上述结构，200-400字，必须包含具体数字）",
  "key_questions": ["任务1：做判断/选方向", "任务2：给具体行动计划", "任务3：风险或替代方案"],
  "constraints": ["约束条件1", "约束条件2"],
  "surprise_info": "讨论中途的意外信息（50-100字，模拟突发事件或新数据）",
  "internal_tension": "这道题的核心矛盾是什么（给自己看的，不展示给候选人）"
}

只返回JSON，不要其他内容。`;
}

interface JDAnalysis {
  role_category: string;
  core_competencies: string[];
  industry: string;
  company_hint: string;
  seniority: string;
  recommended_topic_type: TopicType;
  recommended_mapping: TopicMappingType;
  mapping_rationale: string;
}

function getMappingInstructions(mapping: TopicMappingType): string {
  switch (mapping) {
    case 'direct':
      return `直接映射：题目场景 ≈ JD实际工作场景。
候选人扮演该岗位角色，处理真实工作中会遇到的问题。
例：字节广告销售JD → 候选人扮演广告销售帮银行客户做方案。
注意：需要给足够背景信息，不让非行业背景的人完全无法参与。`;
    case 'semi_direct':
      return `半直接映射：题目行业 ≈ JD行业，但换了角度或场景。
候选人需要有基本行业认知，但不需要深度经验。
例：京东电商管培 → J集团采销战略升级（同行业不同角色）。`;
    case 'indirect':
      return `间接映射：题目行业 ≠ JD行业，考察通用商业判断。
刻意去行业化，更公平地考查候选人的分析和决策能力。
例：顺丰物流管培 → 茶饮品牌扩张策略。
用JD要求的核心能力（如资源统筹、ROI判断）来选题。`;
    default:
      return '';
  }
}

function getReferenceCases(analysis: JDAnalysis): string {
  // Provide the most relevant reference case based on role category
  if (analysis.role_category === 'sales_bd') {
    return `【参考案例 - 字节广告销售（direct映射）】
背景：你是广告销售，10月有一家传统银行找到你，想在字节系平台打造品牌形象+线上获客。客户是全国股份银行，管理资产8.5万亿，零售客户超6000万，之前只做过硬广（年预算800万）。
数据：银行App月活1200万，信用卡获客成本180元/人，招商银行抖音粉丝380万。
任务：设计全年整合营销方案。
矛盾：客户预算有限但期望覆盖品牌+获客两个目标。`;
  }

  if (analysis.role_category === 'marketing_brand') {
    return `【参考案例 - 欧莱雅SeedZ管培（semi_direct映射）】
背景：高端国际美妆品牌要开抖音旗舰店。天猫年GMV 5亿、粉丝200万。抖音粉丝5万、GMV仅800万（KOL导流为主）。
数据：客单价350元，KOL直播占比45%，抖音美妆品类YoY增长78%。
任务：选择启动模式（自播/KOL/商城/混合），给出整体计划。
矛盾：KOL带量快但伤品牌调性，自播控品牌但起量慢。`;
  }

  if (analysis.role_category === 'commercial_retail') {
    return `【参考案例 - 京东TET管培（semi_direct映射）】
背景：J集团采销团队面临角色升级，从"卖货者"到三个方向——专家智囊、谈判代表、购物助理。618直播订单增长200%，GMV超百亿。
任务：三个方向排序 + Top 2方向行动计划。
矛盾：三个方向都有价值但资源只够重点投入1-2个。`;
  }

  // Default: indirect mapping case
  return `【参考案例 - 顺丰管培（indirect映射）】
背景：丰茗茶饮面临增长瓶颈。国内市场增速放缓（YoY 8%），东南亚市场增速快（YoY 35%）但执行复杂。年营收60亿，利润率12%，目标提升至15%。
数据：国内门店2800家、东南亚试点50家，国内客单价28元、东南亚22元。
任务：选重点市场 + 制定行动计划 + 预算分配。
矛盾：国内稳但增长慢，东南亚快但风险高。
注意：JD是物流管培但用了消费品题——考通用商业判断。`;
}

export async function generateTopic(
  jdText: string,
  resumeText?: string,
  topicType?: TopicType
): Promise<Topic> {
  // Step 1: Analyze JD
  const jdAnalysis = await analyzeJD(jdText, topicType);

  // Step 2: Generate topic based on analysis
  const topicPrompt = buildTopicGenerationPrompt(jdAnalysis);

  const response = await llmComplete(
    [
      { role: 'system', content: topicPrompt },
      { role: 'user', content: buildUserPrompt(jdText, resumeText, jdAnalysis) },
    ],
    'topic_generator'
  );

  try {
    const cleaned = response.content.replace(/```json\n?|\n?```/g, '').trim();
    const parsed = JSON.parse(cleaned);

    // Validate no placeholder patterns
    const hasPlaceholder = /[XxＸ]{2,}|某某|约\s*$/.test(
      (parsed.background_material || '') + (parsed.surprise_info || '')
    );
    if (hasPlaceholder) {
      console.warn('Topic contains placeholder patterns, using fallback');
      return buildFallbackTopic(jdAnalysis, topicType);
    }

    const topic: Topic = {
      title: parsed.title,
      description: parsed.description,
      type: parsed.type || jdAnalysis.recommended_topic_type || topicType || 'case_study',
      mapping_type: parsed.mapping_type || jdAnalysis.recommended_mapping,
      background_material: parsed.background_material || undefined,
      key_questions: parsed.key_questions || undefined,
      constraints: Array.isArray(parsed.constraints) ? parsed.constraints : undefined,
      surprise_info: parsed.surprise_info || undefined,
      surprise_trigger: 15, // Default: deliver surprise after ~15 messages
    };

    return topic;
  } catch {
    return buildFallbackTopic(jdAnalysis, topicType);
  }
}

async function analyzeJD(jdText: string, topicType?: TopicType): Promise<JDAnalysis> {
  try {
    const response = await llmComplete(
      [
        { role: 'system', content: JD_ANALYSIS_PROMPT },
        { role: 'user', content: `请分析以下JD：\n\n${jdText.substring(0, 800)}` },
      ],
      'orchestrator' // Use orchestrator role for this lightweight task
    );

    const cleaned = response.content.replace(/```json\n?|\n?```/g, '').trim();
    const analysis = JSON.parse(cleaned) as JDAnalysis;

    // Override topic type if user specified one
    if (topicType) {
      analysis.recommended_topic_type = topicType;
    }

    return analysis;
  } catch {
    // Fallback JD analysis
    return {
      role_category: 'general_management',
      core_competencies: ['逻辑分析', '团队协作', '商业判断'],
      industry: '综合',
      company_hint: '',
      seniority: 'junior',
      recommended_topic_type: topicType || 'case_study',
      recommended_mapping: 'indirect',
      mapping_rationale: '无法解析JD，使用通用间接映射',
    };
  }
}

function buildUserPrompt(jdText: string, resumeText?: string, analysis?: JDAnalysis): string {
  let prompt = `请基于以下信息，设计群面题目。

【原始JD】
${jdText.substring(0, 600)}

`;

  if (analysis) {
    prompt += `【JD分析摘要】
岗位类型: ${analysis.role_category}
核心能力: ${analysis.core_competencies.join('、')}
行业: ${analysis.industry}
推荐映射: ${analysis.recommended_mapping}

`;
  }

  if (resumeText) {
    prompt += `【候选人背景参考】
${resumeText.substring(0, 400)}
（题目难度要略高于候选人水平，有挑战但不至于完全无法参与）

`;
  }

  prompt += `【最终检查】
生成后请自检：
1. background_material里是否有具体数字？（至少3个）
2. 是否有明确的"选择"压力？（不是"做什么"而是"先做什么"）
3. 是否有内在矛盾？（两个合理但对立的方向）
4. constraints是否让讨论有边界？
5. surprise_info是否会让之前的讨论方向需要重新审视？`;

  return prompt;
}

function buildFallbackTopic(analysis: JDAnalysis, topicType?: TopicType): Topic {
  // Choose fallback based on role category
  if (analysis.role_category === 'sales_bd') {
    return {
      title: '新能源车企品牌焕新方案',
      description: '一家传统车企的新能源子品牌在社交媒体上品牌认知度低迷，需要制定下半年的整合传播方案，在预算有限的情况下实现品牌声量突破。',
      type: topicType || 'case_study',
      mapping_type: 'direct',
      background_material: '你是T集团新能源品牌事业部的营销顾问。T集团是国内Top 5车企（年销量180万台），去年推出的新能源子品牌"T-EV"首年销量4.2万台，低于目标的6万台。\n\nT-EV的核心问题：品牌认知度仅18%（竞品蔚来52%、小鹏38%），抖音官号粉丝仅8.7万（蔚来320万），线索转化率2.1%（行业平均3.5%）。产品力不差——续航650km、售价16.9-22.9万——但消费者"知道但不考虑"。\n\n竞争格局：15-25万纯电市场增速放缓至YoY 23%（去年是58%），头部5个品牌占据72%份额，T-EV排第8。经销商反馈：到店客流中仅12%是主动搜索T-EV来的，其余都是看其他品牌顺便看看。\n\n【补充数据】\n下半年营销预算：1500万元。当前获客成本：约4200元/条有效线索（行业均值2800元）。25-35岁男性是核心用户画像（占比68%）。用户调研显示：58%的潜在客户认为"不了解这个品牌的技术实力"。',
      key_questions: [
        '在1500万预算内，应该优先投入品牌认知提升还是线索转化效率？请给出你的判断和理由',
        '针对你选择的优先方向，设计具体的3个月行动计划',
        '如果竞品在Q3发起价格战（降价2万），你的方案需要做哪些调整？',
      ],
      constraints: ['总预算不超过1500万', '需要在6个月内将品牌认知度从18%提升到30%以上'],
      surprise_info: '【紧急更新】刚收到消息：竞品品牌"零跑"宣布与抖音达成独家年度战略合作，将获得抖音汽车频道首页推荐位3个月。这意味着T-EV在抖音的自然流量获取难度将显著增加。团队需要重新评估渠道策略。',
      surprise_trigger: 15,
    };
  }

  // Default: indirect mapping, prioritization type
  return {
    title: '云味轩餐饮连锁扩张战略',
    description: '云味轩面临增长瓶颈，需要在三个战略方向中做出优先级排序并制定行动计划：加密一线城市、下沉三四线、拓展海外东南亚市场。',
    type: topicType || 'prioritization',
    mapping_type: 'indirect',
    background_material: '云味轩是一家主打"新中式轻食"的连锁餐饮品牌，成立6年，目前在全国拥有420家门店（直营180家、加盟240家）。去年营收约14.8亿元，净利润率8.3%。\n\n增长瓶颈：过去三年营收增速从YoY 45%降至YoY 12%，一线城市门店密度接近饱和（北京68家、上海52家、广深43家），单店日均营收从1.8万降至1.5万。但品牌在二三线城市有较强认知度（品牌好感度调研得分78/100）。\n\n三个战略方向摆在管理层面前：\nA. 加密一线城市：在现有城市开更多门店，主攻写字楼和购物中心，预计单店投入80万；\nB. 下沉三四线：进入50个三四线城市，以加盟模式为主，单店投入35万，但管理难度大；\nC. 海外东南亚：在新加坡和曼谷开设旗舰店，单店投入200万，利润率预计可达15%（国内8.3%），但运营复杂度高。\n\n【补充数据】\n年度可用扩张预算：8000万。一线城市新店回本周期约14个月，三四线约10个月，海外约20个月。三四线城市加盟商流失率约22%/年。东南亚中式餐饮市场规模约120亿元，YoY增长31%。消费者调研：一线城市对"新中式轻食"搜索量YoY下降8%，三四线YoY上升45%。',
    key_questions: [
      '三个方向请排出优先级，并说明判断依据（需要用到背景数据）',
      '针对你选的Top 1方向，制定未来12个月的具体行动计划（包括资源分配）',
      '如果8000万预算需要砍掉30%（只剩5600万），你的优先级排序是否会改变？',
    ],
    constraints: ['总扩张预算8000万', '管理层要求12个月内新增至少60家门店', '需要维持整体净利润率不低于7%'],
    surprise_info: '【最新消息】团队刚收到市场情报：主要竞品"沙野轻食"刚完成B轮融资2.5亿元，宣布将在未来一年内在二三线城市新开200家门店，主打"比云味轩便宜20%"的定价策略。这可能会显著影响云味轩的下沉市场计划。',
    surprise_trigger: 15,
  };
}
