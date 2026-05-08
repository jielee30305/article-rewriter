// 标题工厂 — 基于文章内容生成10个标题，三维度分类
const OpenAI = require("openai");

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  baseURL: process.env.OPENAI_BASE_URL,
});

async function generateHeadlines(title, content) {
  const text = content.slice(0, 2000);
  const completion = await openai.chat.completions.create({
    model: process.env.CHAT_MODEL || "doubao-seed-2-0-lite-260215",
    messages: [
      {
        role: "system",
        content: `你是公众号标题专家。根据文章内容生成10个标题，分3类输出。每个标题15-30字，不要用书名号。
返回纯JSON，格式：{"headlines":{"clickbait":[],"seo":[],"social":[]}}

三类标准：
- clickbait（点击欲型，4个）：制造悬念、反差、数字冲击，让人忍不住点。如"我做了3年公众号，发现90%的人死在第一步"
- seo（搜索匹配型，3个）：包含明确关键词，容易被搜到。如"公众号新手入门：从注册到变现完整指南"
- social（社交传播型，3个）：有态度、适合转发，像金句。如"别再说公众号已死，是你写得太无聊"`,
      },
      {
        role: "user",
        content: `原标题：${title}\n\n内容：${text}\n\n请生成10个标题。`,
      },
    ],
    response_format: { type: "json_object" },
    temperature: 1.1,
    max_tokens: 1500,
  });

  const raw = completion.choices[0]?.message?.content || "";
  try {
    return JSON.parse(raw).headlines;
  } catch {
    // 容错：从文本中提取
    return { clickbait: [], seo: [], social: [] };
  }
}

module.exports = { generateHeadlines };
