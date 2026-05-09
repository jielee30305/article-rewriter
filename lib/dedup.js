// 去重引擎 — AI 主题聚类 + 改写后语义对比
const OpenAI = require("openai");

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  baseURL: process.env.OPENAI_BASE_URL,
  timeout: 60000, // 60s timeout for slow doubao responses
  maxRetries: 2,
});

async function groupByTopic(articles, options = {}) {
  if (articles.length <= 1) return [{ topic: articles[0]?.title || "单篇", articles }];

  const summaries = articles.map((a, i) =>
    `[${i}] ${a.title} (来源: ${a.feedName || a.sourceUrl || "未知"})`
  ).join("\n");

  let completion;
  try {
    completion = await openai.chat.completions.create({
      model: process.env.CHAT_MODEL || "doubao-seed-2-0-lite-260215",
      messages: [
        {
          role: "system",
          content: `你是信息聚合专家。将以下文章按主题分组。同一条新闻的不同报道归为一组，不同主题的各自成组。

返回纯JSON，不要markdown代码块，不要额外文字：
{"groups":[{"topic":"简短主题名","indices":[0,2,5]},{"topic":"另一主题","indices":[1,3]}]}

规则：
- 每篇文章必须归入一个组
- 如果一篇文章单独成组也没问题
- topic 用中文，3-8字`,
        },
        { role: "user", content: summaries },
      ],
      temperature: 0.3,
      max_tokens: 1000,
    });
  } catch (err) {
    console.error("[dedup] groupByTopic API error:", err.message);
    // fallback: each article is its own group
    return articles.map(a => ({ topic: a.title || "单篇", articles: [a] }));
  }

  try {
    const raw = completion.choices[0]?.message?.content || "{}";
    // strip markdown code fences if present
    const json = raw.replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, "").trim();
    const { groups } = JSON.parse(json);
    if (!groups || !Array.isArray(groups)) {
      return articles.map(a => ({ topic: a.title || "单篇", articles: [a] }));
    }
    return groups.map(g => ({
      topic: g.topic || "未分类",
      articles: (g.indices || []).map(i => articles[i]).filter(Boolean),
    }));
  } catch (e) {
    console.error("[dedup] groupByTopic parse error:", e.message);
    return articles.map(a => ({ topic: a.title || "单篇", articles: [a] }));
  }
}

async function dedupRewrites(articles) {
  if (articles.length <= 1) return { unique: articles, duplicates: [] };

  const unique = [];
  const duplicates = [];

  for (let i = 0; i < articles.length; i++) {
    let isDup = false;
    for (let j = 0; j < unique.length; j++) {
      try {
        const overlap = await checkPairwise(articles[i], unique[j]);
        if (overlap.sameTopic && overlap.confidence > 0.7) {
          duplicates.push({ article: articles[i], similarTo: unique[j], confidence: overlap.confidence, reason: overlap.reason });
          isDup = true;
          break;
        }
      } catch (e) {
        console.error("[dedup] pairwise check error:", e.message);
      }
    }
    if (!isDup) unique.push(articles[i]);
  }

  return { unique, duplicates };
}

async function checkPairwise(a1, a2) {
  const t1 = (a1.title || "").slice(0, 200);
  const t2 = (a2.title || "").slice(0, 200);
  const c1 = (a1.content || "").slice(0, 500);
  const c2 = (a2.content || "").slice(0, 500);

  // 快速标题 Jaccard 预筛
  const jaccard = titleJaccard(t1, t2);
  if (jaccard < 0.15) return { sameTopic: false, confidence: 0, reason: "标题不相似" };

  let completion;
  try {
    completion = await openai.chat.completions.create({
      model: process.env.CHAT_MODEL || "doubao-seed-2-0-lite-260215",
      messages: [
        {
          role: "system",
          content: `判断两篇文章是否在讲同一件事/同一条新闻。返回纯JSON，不要markdown代码块：{"sameTopic":true/false,"confidence":0-100,"reason":"简短说明"}`,
        },
        { role: "user", content: `文章1标题：${t1}\n文章1内容：${c1}\n\n文章2标题：${t2}\n文章2内容：${c2}` },
      ],
      temperature: 0.1,
      max_tokens: 300,
    });
  } catch (err) {
    console.error("[dedup] checkPairwise API error:", err.message);
    return { sameTopic: false, confidence: 0, reason: "API错误" };
  }

  try {
    const raw = completion.choices[0]?.message?.content || "{}";
    const json = raw.replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, "").trim();
    const r = JSON.parse(json);
    return {
      sameTopic: r.sameTopic || false,
      confidence: (r.confidence || 0) / 100,
      reason: r.reason || "",
    };
  } catch {
    return { sameTopic: false, confidence: 0, reason: "解析失败" };
  }
}

function titleJaccard(t1, t2) {
  const set1 = new Set([...t1]);
  const set2 = new Set([...t2]);
  const inter = new Set([...set1].filter(x => set2.has(x)));
  const union = new Set([...set1, ...set2]);
  return inter.size / (union.size || 1);
}

module.exports = { groupByTopic, dedupRewrites };
