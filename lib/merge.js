// 多源缝合 — 多篇同主题文章融合成一篇全新文章
const OpenAI = require("openai");

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  baseURL: process.env.OPENAI_BASE_URL,
});

async function mergeSources(sources, options = {}) {
  const { targetLength = 1500, level = "pro", stylePrompt = "" } = options;

  const sourceTexts = sources.map((s, i) =>
    `### 来源${i + 1}：${s.title}\n${s.content.slice(0, 2500)}`
  ).join("\n\n---\n\n");

  const styleExtra = stylePrompt ? `\n## 风格要求\n${stylePrompt}` : "";

  const completion = await openai.chat.completions.create({
    model: process.env.CHAT_MODEL || "doubao-seed-2-0-lite-260215",
    messages: [
      {
        role: "system",
        content: `你是资深编辑。将以下${sources.length}篇同主题文章融合成一篇全新原创文章。

铁律：
- 取各篇核心素材，不照抄任何一篇的表达
- 结构重新设计，用自己的逻辑串起来
- 信息互补——A篇有B篇没有的数据，用上；重复的信息，合并
- 读起来像一个人写的，不是拼凑的
- 控制字数${targetLength}字左右
- 输出Markdown格式${styleExtra}`,
      },
      { role: "user", content: sourceTexts },
    ],
    temperature: 0.9,
    max_tokens: 4000,
  });

  return completion.choices[0]?.message?.content || "";
}

module.exports = { mergeSources };
