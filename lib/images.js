// 配图推荐 — AI 提取关键词 → Pixabay API 搜真实图片
const OpenAI = require("openai");

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  baseURL: process.env.OPENAI_BASE_URL,
});

const PIXABAY_KEY = process.env.PIXABAY_API_KEY || "55784975-851dcaee20d6cc51b12c8a17b";

async function searchPixabay(keyword, { minWidth = 800, perPage = 5 } = {}) {
  const params = new URLSearchParams({
    key: PIXABAY_KEY,
    q: keyword,
    per_page: perPage,
    image_type: "photo",
    min_width: minWidth,
    safesearch: "true",
  });
  const res = await fetch(`https://pixabay.com/api/?${params}`);
  if (!res.ok) throw new Error(`Pixabay API ${res.status}`);
  const data = await res.json();
  return data.hits || [];
}

function pickBest(hits, preferHorizontal = true, excludeUrls = new Set()) {
  if (!hits.length) return null;
  const horizontal = hits.filter(h => h.webformatWidth > h.webformatHeight);
  const candidates = (horizontal.length ? horizontal : hits)
    .filter(h => !excludeUrls.has(h.webformatURL));
  return candidates[0] || null;
}

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
- 关键词用英文，简洁精准，适合图片库搜索
- 场景描述用中文`,
      },
      {
        role: "user",
        content: `标题：${title}\n\n内容：${content.slice(0, 2500)}`,
      },
    ],
    temperature: 0.7,
    max_tokens: 1000,
  });

  const raw = completion.choices[0]?.message?.content || "";
  let keywords;
  try {
    const json = raw.replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, "").trim();
    keywords = JSON.parse(json);
  } catch {
    keywords = { cover: { keyword: "technology", scene: "科技" }, body: [] };
  }

  // Step 2: Pixabay 搜图
  async function searchAndPick(keyword, scene, excludeUrls, preferHorizontal = true) {
    try {
      const hits = await searchPixabay(keyword, { perPage: 15 });
      const usedUrls = excludeUrls || new Set();
      let best = pickBest(hits, preferHorizontal, usedUrls);
      // 如果最佳被占用，逐个尝试
      if (!best) {
        for (const h of hits) {
          if (!usedUrls.has(h.webformatURL)) { best = h; break; }
        }
      }
      if (best) {
        return {
          imageUrl: best.webformatURL,
          largeUrl: best.largeImageURL,
          sourceUrl: best.pageURL,
          photographer: best.user,
          tags: best.tags,
        };
      }
    } catch (e) {
      console.log(`  Pixabay 搜图失败 (${keyword}):`, e.message);
    }
    return null;
  }

  const coverResult = await searchAndPick(
    keywords.cover?.keyword || "technology",
    keywords.cover?.scene || "封面"
  );

  const usedUrls = new Set();
  if (coverResult?.imageUrl) usedUrls.add(coverResult.imageUrl);

  const bodyResults = [];
  for (const item of (keywords.body || []).slice(0, 6)) {
    const result = await searchAndPick(item.keyword, item.scene, usedUrls, false);
    if (result) usedUrls.add(result.imageUrl);
    bodyResults.push(result);
  }

  const cover = coverResult
    ? { ...keywords.cover, ...coverResult }
    : { keyword: "technology", scene: "科技", imageUrl: "", sourceUrl: "" };

  const body = (keywords.body || []).map((item, i) => {
    const result = bodyResults[i];
    return result
      ? { ...item, ...result }
      : { ...item, imageUrl: "", sourceUrl: "" };
  });

  return { cover, body };
}

module.exports = { recommendImages };
