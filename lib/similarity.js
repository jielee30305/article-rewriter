// 原创度检测 — 原文 vs 改文逐句相似度比对
const OpenAI = require("openai");

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  baseURL: process.env.OPENAI_BASE_URL,
});

async function checkSimilarity(originalText, rewrittenText) {
  const completion = await openai.chat.completions.create({
    model: process.env.CHAT_MODEL || "doubao-seed-2-0-lite-260215",
    messages: [
      {
        role: "system",
        content: `你是版权检测专家。对比原文和改文，找出内容相似度高的段落。

分析标准：
- 连续10字以上相同 → 高度相似
- 同义改写但结构相近 → 中度相似
- 完全不同的表达 → 通过

返回纯JSON：
{
  "score": 85,
  "level": "安全",
  "summary": "整体原创度较高，2处需要注意",
  "issues": [
    {"type": "high|medium", "original": "原文片段", "rewritten": "改文片段", "suggestion": "修改建议"}
  ]
}

score: 0-100，低于30为安全，30-50需注意，50以上高风险
level: "安全" / "需注意" / "高风险"`,
      },
      {
        role: "user",
        content: `## 原文（片段）\n${originalText.slice(0, 2000)}\n\n## 改文\n${rewrittenText.slice(0, 2000)}\n\n请检测原创度。`,
      },
    ],
    response_format: { type: "json_object" },
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
