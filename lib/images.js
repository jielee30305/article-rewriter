// 配图推荐 — 根据文章内容提取关键词，匹配 Unsplash 高质量图片
const OpenAI = require("openai");

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  baseURL: process.env.OPENAI_BASE_URL,
});

async function recommendImages(title, content) {
  // Step 1: AI 提取配图场景关键词
  const completion = await openai.chat.completions.create({
    model: process.env.CHAT_MODEL || "doubao-seed-2-0-lite-260215",
    messages: [
      {
        role: "system",
        content: `你是公众号配图专家。读完文章后，推荐配图关键词。

返回纯JSON：
{
  "cover": {"keyword": "封面图英文关键词", "scene": "中文描述"},
  "body": [
    {"keyword": "配图英文关键词1", "scene": "中文描述1"},
    {"keyword": "配图英文关键词2", "scene": "中文描述2"},
    ...
  ]
}

规则：
- cover: 1张封面图关键词，大气、有视觉冲击力
- body: 3-6个配图关键词，对应文章关键段落
- 关键词用英文（Unsplash搜索用），简洁精准
- 场景描述用中文`,
      },
      {
        role: "user",
        content: `标题：${title}\n\n内容：${content.slice(0, 2500)}`,
      },
    ],
    response_format: { type: "json_object" },
    temperature: 0.7,
    max_tokens: 1000,
  });

  const raw = completion.choices[0]?.message?.content || "";
  let keywords;
  try {
    keywords = JSON.parse(raw);
  } catch {
    keywords = { cover: { keyword: "writing", scene: "写作" }, body: [] };
  }

  // Step 2: 生成 Unsplash 图片URL
  const baseUrl = "https://images.unsplash.com";

  function makeImageUrl(keyword, width = 900, height = 600) {
    return `https://source.unsplash.com/${width}x${height}/?${encodeURIComponent(keyword)}`;
  }

  const cover = {
    ...keywords.cover,
    imageUrl: makeImageUrl(keywords.cover.keyword, 900, 383), // 公众号封面 2.35:1
    sourceUrl: `https://unsplash.com/s/photos/${encodeURIComponent(keywords.cover.keyword)}`,
  };

  const body = (keywords.body || []).map((item) => ({
    ...item,
    imageUrl: makeImageUrl(item.keyword, 800, 600),
    sourceUrl: `https://unsplash.com/s/photos/${encodeURIComponent(item.keyword)}`,
  }));

  return { cover, body };
}

module.exports = { recommendImages };
