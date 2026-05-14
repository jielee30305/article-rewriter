// 原创度检测 — 原文 vs 改文逐句相似度比对
const OpenAI = require("openai");

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  baseURL: process.env.OPENAI_BASE_URL,
});

async function checkSimilarity(originalText, rewrittenText) {
  const completion = await openai.chat.completions.create({
    model: "doubao-seed-2-0-pro-260215",
    messages: [
      {
        role: "system",
        content: `你是原创度检测专家。对比原文和改文，判断改文是否构成真正的"洗稿"还是合理的"重新创作"。

## 检测原则
只关心**实质性抄袭**，不关心正常的信息重合：
- 连续20字以上完全一致 + 不是专有名词/固定表述 → 高度相似
- 叙事结构、案例、比喻、语序完全照搬（即使换了词）→ 中度相似
- 相同的事实/数据/引用，但表达方式、组织结构、分析角度不同 → 通过
- 专有名词、书名、人名、数字、固定术语等相同 → 通过（不算相似）

## 核心判断：改文读起来像"同一篇文章换了个说法"还是"不同的人用不同方式讲同一件事"？如果是后者，分数应低。

返回纯JSON：
{
  "score": 40,
  "level": "安全",
  "summary": "整体原创度良好，有1处可优化",
  "issues": [
    {"type": "high|medium", "original": "原文片段", "rewritten": "改文片段", "suggestion": "修改建议"}
  ]
}

score: 0-100（相似度分数，越低越原创）
- 0-35：安全（结构、表达、角度均有明显差异）
- 35-55：需注意（部分段落结构相近但整体可接受）
- 55-100：高风险（多处理同义替换或结构完全照搬）
level: "安全" / "需注意" / "高风险"`,
      },
      {
        role: "user",
        content: `## 原文（片段）\n${originalText.slice(0, 2000)}\n\n## 改文\n${rewrittenText.slice(0, 2000)}\n\n请检测原创度。`,
      },
    ],
    temperature: 0.3,
    max_tokens: 2000,
  });

  const raw = completion.choices[0]?.message?.content || "";
  try {
    return JSON.parse(raw);
  } catch {
    return { score: 0, level: "未知", summary: "检测异常", issues: [] };
  }
}

module.exports = { checkSimilarity };
