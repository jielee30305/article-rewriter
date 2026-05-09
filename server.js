require("dotenv").config();
const fs = require("fs");
const path = require("path");
const express = require("express");
const { extractFromUrl } = require("./lib/extract");
const { rewrite, humanize } = require("./lib/rewrite");
const { generateHeadlines } = require("./lib/headlines");
const { checkSimilarity } = require("./lib/similarity");
const { analyzeStyle, listStyles, getStyle } = require("./lib/styles");
const { mergeSources } = require("./lib/merge");
const history = require("./lib/history");
const { recommendImages } = require("./lib/images");
const { formatArticle, THEMES } = require("./lib/format");
const archive = require("./lib/archive");
const { scrapeFeeds, listFeeds } = require("./lib/rss");
const { rewriteToutiao, generateToutiaoHeadlines, generateWeiboTou } = require("./lib/toutiao");
const { groupByTopic, dedupRewrites } = require("./lib/dedup");
const { rewriteHistory, generateHistoryHeadlines, checkHistoryDedup, fetchOnThisDay, fetchCategoryArticles } = require("./lib/history-rewrite");

const app = express();
app.use(express.json({ limit: "10mb" }));
app.use(express.static("public"));

// 手机连通测试页
app.get("/test", (req, res) => {
  res.send(`<!DOCTYPE html><html lang="zh"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>连通测试</title><style>body{background:#fff;font-family:sans-serif;padding:40px 20px;text-align:center;color:#333}h1{color:#6C5CE7;font-size:2rem}p{font-size:1.2rem;margin:20px 0;color:#666}.ok{display:inline-block;padding:20px 40px;background:#00B894;color:#fff;border-radius:20px;font-size:3rem;margin:30px 0}</style></head><body><h1>连通成功 ✅</h1><div class="ok">🟢</div><p>服务器运行正常</p><p style="font-size:0.9rem;">IP: ${req.ip} · 时间: ${new Date().toLocaleString("zh-CN")}</p></body></html>`);
});

// API: 提取文章内容
app.post("/api/extract", async (req, res) => {
  try {
    const { url } = req.body;
    if (!url?.trim()) {
      return res.status(400).json({ error: "请提供文章链接" });
    }
    console.log(`提取文章: ${url}`);
    const article = await extractFromUrl(url.trim());
    console.log(`  → ${article.title} (${article.length} 字)`);
    res.json(article);
  } catch (err) {
    console.error("提取失败:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// API: 改写文章（3版本）
app.post("/api/rewrite", async (req, res) => {
  try {
    const { url, content: manualContent, targetLength, level, styleId } = req.body;

    let article;
    if (manualContent?.trim()) {
      // 手动输入模式
      article = {
        title: req.body.title || "手动输入",
        content: manualContent.trim(),
        length: manualContent.trim().length,
        siteName: "手动输入",
        url: "",
      };
      console.log(`改写流程: 手动输入 (${article.length} 字)`);
    } else if (url?.trim()) {
      // URL 提取模式
      console.log(`改写流程启动: ${url}`);
      article = await extractFromUrl(url.trim());
      console.log(`  → 原文: ${article.title} (${article.length} 字)`);
    } else {
      return res.status(400).json({ error: "请提供文章链接或手动输入内容" });
    }

    const wordCount = article.length;
    let actualTarget = targetLength || 1400;
    if (!targetLength) {
      if (wordCount > 3000) actualTarget = 1400;
      else if (wordCount > 1500) actualTarget = 1300;
      else actualTarget = Math.min(wordCount, 1500);
    }

    // 改写
    console.log(`  → 目标字数: ${actualTarget}`);
    // 风格嵌入
    let stylePrompt = "";
    if (styleId) {
      const style = getStyle(styleId);
      if (style?.systemPrompt) stylePrompt = style.systemPrompt;
    }
    const versions = await rewrite(article, { targetLength: actualTarget, level: level || "pro", stylePrompt });

    // 自动存档
    try {
      archive.save({
        originalTitle: article.title,
        originalUrl: article.url || "",
        originalContent: article.content,
        versions,
        level: level || "pro",
        targetLength: actualTarget,
        tags: [article.siteName || ""].filter(Boolean),
      });
    } catch (e) { /* 存档静默失败 */ }

    res.json({
      original: article,
      versions,
      targetLength: actualTarget,
    });
  } catch (err) {
    console.error("改写失败:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// API: 去AI味二次处理
app.post("/api/humanize", async (req, res) => {
  try {
    const { text } = req.body;
    if (!text?.trim()) {
      return res.status(400).json({ error: "请提供需要处理的文本" });
    }
    console.log("去AI味处理…");
    const result = await humanize(text.trim());
    console.log(`  → 完成 (${result.length} chars)`);
    res.json({ content: result });
  } catch (err) {
    console.error("去AI味失败:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── 标题工厂 ──
app.post("/api/headlines", async (req, res) => {
  try {
    const { title, content } = req.body;
    if (!content?.trim()) return res.status(400).json({ error: "请提供文章内容" });
    console.log(`标题工厂: ${title || "无标题"}`);
    const headlines = await generateHeadlines(title || "", content);
    res.json({ headlines });
  } catch (err) {
    console.error("标题生成失败:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── 原创度检测 ──
app.post("/api/similarity", async (req, res) => {
  try {
    const { original, rewritten } = req.body;
    if (!original?.trim() || !rewritten?.trim()) {
      return res.status(400).json({ error: "请提供原文和改文" });
    }
    console.log("原创度检测…");
    const result = await checkSimilarity(original, rewritten);
    res.json(result);
  } catch (err) {
    console.error("检测失败:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── 一键排版（公众号格式导出） ──
app.post("/api/export-format", (req, res) => {
  try {
    const { content, title, theme, style } = req.body;
    if (!content?.trim()) return res.status(400).json({ error: "请提供文章内容" });
    const formatted = formatArticle(content, { themeKey: theme || "clean", styleKey: style || "comfortable", title: title || "" });
    res.json({ formatted, themes: THEMES });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/themes", (req, res) => {
  res.json(THEMES);
});

// ── 风格克隆 ──
app.post("/api/styles/analyze", async (req, res) => {
  try {
    const { name, articles } = req.body;
    if (!name?.trim() || !articles?.length) {
      return res.status(400).json({ error: "请提供风格名称和至少1篇文章" });
    }
    console.log(`风格分析: ${name} (${articles.length}篇)`);
    const profile = await analyzeStyle(name.trim(), articles);
    res.json(profile);
  } catch (err) {
    console.error("风格分析失败:", err.message);
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/styles", (req, res) => {
  res.json(listStyles());
});

app.get("/api/styles/:id", (req, res) => {
  const style = getStyle(req.params.id);
  if (!style) return res.status(404).json({ error: "风格不存在" });
  res.json(style);
});

// ── 多源缝合 ──
app.post("/api/merge", async (req, res) => {
  try {
    const { urls, level, targetLength, styleId } = req.body;
    if (!urls?.length || urls.length < 2) {
      return res.status(400).json({ error: "请提供至少2个文章链接" });
    }

    console.log(`多源缝合: ${urls.length} 个来源`);
    const sources = [];
    for (const url of urls) {
      try {
        const article = await extractFromUrl(url.trim());
        sources.push(article);
        console.log(`  ✓ ${article.title}`);
      } catch (e) {
        console.log(`  ✗ ${url}: ${e.message}`);
      }
    }

    if (sources.length < 2) {
      return res.status(400).json({ error: "有效来源不足2个，无法缝合" });
    }

    let stylePrompt = "";
    if (styleId) {
      const style = getStyle(styleId);
      if (style?.systemPrompt) stylePrompt = style.systemPrompt;
    }

    const result = await mergeSources(sources, {
      targetLength: targetLength || 1500,
      level: level || "pro",
      stylePrompt,
    });

    // 自动存档
    try {
      archive.save({
        originalTitle: sources.map(s => s.title).join(" + "),
        originalUrl: urls.join(", "),
        originalContent: sources.map(s => s.content).join("\n\n---\n\n"),
        versions: [{ version: "A", content: result }],
        level: level || "pro",
        targetLength: targetLength || 1500,
        tags: sources.map(s => s.siteName).filter(Boolean),
      });
    } catch (e) { /* 静默 */ }

    res.json({ content: result, sources: sources.map(s => s.title) });
  } catch (err) {
    console.error("缝合失败:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── 改写历史 ──
app.post("/api/history", (req, res) => {
  try {
    const entry = history.save(req.body);
    res.json(entry);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/history", (req, res) => {
  const results = history.search(req.query);
  res.json(results);
});

app.get("/api/history/tags", (req, res) => {
  res.json(history.getAllTags());
});

app.get("/api/history/:id", (req, res) => {
  const entry = history.getById(req.params.id);
  if (!entry) return res.status(404).json({ error: "记录不存在" });
  res.json(entry);
});

app.patch("/api/history/:id", (req, res) => {
  const updated = history.update(req.params.id, req.body);
  if (!updated) return res.status(404).json({ error: "记录不存在" });
  res.json(updated);
});

app.delete("/api/history/:id", (req, res) => {
  history.remove(req.params.id);
  res.json({ ok: true });
});

// ── 存档库 ──
app.post("/api/archive", (req, res) => {
  try {
    const entry = archive.save(req.body);
    res.json(entry);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/archive", (req, res) => {
  const result = archive.search(req.query);
  res.json(result);
});

app.get("/api/archive/tags", (req, res) => {
  res.json(archive.getAllTags());
});

app.get("/api/archive/export", (req, res) => {
  const csv = archive.exportCsv(req.query);
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="archive-${new Date().toISOString().slice(0,10)}.csv"`);
  res.send("﻿" + csv); // BOM for Excel
});

app.get("/api/archive/:id", (req, res) => {
  const entry = archive.getById(req.params.id);
  if (!entry) return res.status(404).json({ error: "记录不存在" });
  res.json(entry);
});

app.patch("/api/archive/:id", (req, res) => {
  const updated = archive.update(req.params.id, req.body);
  if (!updated) return res.status(404).json({ error: "记录不存在" });
  res.json(updated);
});

app.delete("/api/archive/:id", (req, res) => {
  archive.remove(req.params.id);
  res.json({ ok: true });
});

// ── 配图推荐 ──
app.post("/api/images", async (req, res) => {
  try {
    const { title, content } = req.body;
    if (!content?.trim()) return res.status(400).json({ error: "请提供文章内容" });
    console.log(`配图推荐: ${title || "无标题"}`);
    const images = await recommendImages(title || "", content);
    res.json(images);
  } catch (err) {
    console.error("配图推荐失败:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── 头条模式 ──

const QUEUE_FILE = path.join(__dirname, "data", "toutiao-queue.json");

function readQueue() {
  try { return JSON.parse(fs.readFileSync(QUEUE_FILE, "utf8")); }
  catch { return []; }
}
function writeQueue(items) {
  fs.mkdirSync(path.dirname(QUEUE_FILE), { recursive: true });
  fs.writeFileSync(QUEUE_FILE, JSON.stringify(items, null, 2), "utf8");
}

// RSS 源列表
app.get("/api/toutiao/feeds", (req, res) => {
  res.json(listFeeds());
});

// RSS 抓取
app.post("/api/toutiao/scrape", async (req, res) => {
  try {
    const { feedIds, maxPerFeed, keywords } = req.body;
    console.log(`头条抓取: ${feedIds?.length ? feedIds.join(",") : "全部"}, 每源${maxPerFeed || 10}条`);
    const articles = await scrapeFeeds(feedIds, { maxItems: maxPerFeed || 10, keywords });
    console.log(`  → 抓到 ${articles.length} 篇文章`);
    res.json({ articles, count: articles.length });
  } catch (err) {
    console.error("抓取失败:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// AI 主题分组
app.post("/api/toutiao/group", async (req, res) => {
  try {
    const { articles } = req.body;
    if (!articles?.length) return res.status(400).json({ error: "请提供文章列表" });
    console.log(`主题分组: ${articles.length} 篇文章`);
    const groups = await groupByTopic(articles);
    console.log(`  → ${groups.length} 个主题组`);
    res.json({ groups });
  } catch (err) {
    console.error("分组失败:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// 头条风格改写
app.post("/api/toutiao/rewrite", async (req, res) => {
  try {
    const { url, content: manualContent, targetLength, styleId } = req.body;

    let article;
    if (manualContent?.trim()) {
      article = {
        title: req.body.title || "手动输入",
        content: manualContent.trim(),
        length: manualContent.trim().length,
        siteName: "手动输入",
        url: "",
      };
      console.log(`头条改写: 手动输入 (${article.length} 字)`);
    } else if (url?.trim()) {
      console.log(`头条改写: ${url}`);
      article = await extractFromUrl(url.trim());
      console.log(`  → ${article.title} (${article.length} 字)`);
    } else {
      return res.status(400).json({ error: "请提供文章链接或手动输入内容" });
    }

    let stylePrompt = "";
    if (styleId) {
      const style = getStyle(styleId);
      if (style?.systemPrompt) stylePrompt = style.systemPrompt;
    }

    // 改写 + 配图 并行
    const [versions, images] = await Promise.all([
      rewriteToutiao(article, {
        targetLength: targetLength || 1200,
        stylePrompt,
      }),
      recommendImages(article.title, article.content).catch(e => {
        console.log("  配图获取失败（非致命）:", e.message);
        return null;
      }),
    ]);

    // 自动存档
    try {
      archive.save({
        originalTitle: article.title,
        originalUrl: article.url || "",
        originalContent: article.content,
        versions,
        level: "toutiao",
        targetLength: targetLength || 1200,
        tags: ["头条", article.siteName || ""].filter(Boolean),
      });
    } catch (e) { /* 静默 */ }

    res.json({ original: article, versions, targetLength: targetLength || 1200, images });
  } catch (err) {
    console.error("头条改写失败:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// 头条标题工厂
app.post("/api/toutiao/headlines", async (req, res) => {
  try {
    const { title, content } = req.body;
    if (!content?.trim()) return res.status(400).json({ error: "请提供文章内容" });
    console.log(`头条标题工厂: ${title || "无标题"}`);
    const headlines = await generateToutiaoHeadlines(title || "", content);
    res.json({ headlines });
  } catch (err) {
    console.error("标题生成失败:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// 微头条生成
app.post("/api/toutiao/weibotou", async (req, res) => {
  try {
    const { title, content } = req.body;
    if (!content?.trim()) return res.status(400).json({ error: "请提供文章内容" });
    console.log(`微头条生成: ${title || "无标题"}`);
    const [variants, images] = await Promise.all([
      generateWeiboTou(title || "", content),
      recommendImages(title || "", content).catch(e => {
        console.log("  配图获取失败（非致命）:", e.message);
        return null;
      }),
    ]);
    res.json({ variants, images });
  } catch (err) {
    console.error("微头条生成失败:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// 一键批量全流程
app.post("/api/toutiao/batch", async (req, res) => {
  try {
    const { feedIds, maxPerFeed, targetLength } = req.body;
    console.log("=== 头条批量流程开始 ===");

    // 1. 抓取
    const articles = await scrapeFeeds(feedIds, { maxItems: maxPerFeed || 8 });
    console.log(`1. 抓取: ${articles.length} 篇`);

    if (articles.length < 2) {
      return res.status(400).json({ error: "抓取文章不足2篇，无法批量处理" });
    }

    // 2. 分组
    const groups = await groupByTopic(articles);
    console.log(`2. 分组: ${groups.length} 个主题`);

    // 3. 每组改写（取每组的文章融合改写）
    const allVersions = [];
    for (const group of groups) {
      if (group.articles.length === 0) continue;
      const mergedArticle = {
        title: group.topic,
        content: group.articles
          .map(a => `【${a.feedName || "来源"}】${a.title}\n${a.summary || ""}`)
          .join("\n\n"),
        siteName: group.articles.map(a => a.feedName).filter(Boolean).join(","),
        url: group.articles[0]?.sourceUrl || "",
      };
      try {
        const versions = await rewriteToutiao(mergedArticle, { targetLength: targetLength || 1200 });
        allVersions.push({ topic: group.topic, sourceArticles: group.articles, versions });
        console.log(`3. 改写 "${group.topic}": ${versions.length} 个版本`);
      } catch (e) {
        console.error(`改写 "${group.topic}" 失败:`, e.message);
      }
    }

    // 4. 去重
    const allContent = allVersions.flatMap(g =>
      g.versions.map(v => ({ topic: g.topic, ...v }))
    );
    const { unique, duplicates } = await dedupRewrites(allContent);
    console.log(`4. 去重: ${unique.length} 篇保留, ${duplicates.length} 篇重复`);

    // 5. 为每篇生成微头条
    for (const item of unique.slice(0, 5)) { // 限制数量
      try {
        item.weiboTou = await generateWeiboTou(item.title || item.topic, item.content);
      } catch (e) { /* 跳过 */ }
    }

    res.json({
      groups: allVersions.map(g => ({
        topic: g.topic,
        sourceCount: g.sourceArticles.length,
        versions: g.versions,
      })),
      duplicatesRemoved: duplicates.length,
      uniqueCount: unique.length,
      totalVersions: allContent.length,
    });
  } catch (err) {
    console.error("批量流程失败:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── 发布队列 CRUD ──

app.get("/api/toutiao/queue", (req, res) => {
  let items = readQueue();
  if (req.query.status) items = items.filter(i => i.status === req.query.status);
  res.json({ items, total: items.length });
});

app.post("/api/toutiao/queue", (req, res) => {
  const { type, title, content, sourceUrls, tags } = req.body;
  if (!title?.trim() || !content?.trim()) {
    return res.status(400).json({ error: "标题和内容不能为空" });
  }
  const items = readQueue();
  const entry = {
    id: Math.random().toString(36).slice(2, 10),
    type: type || "article",
    title: title.trim(),
    content: content.trim(),
    sourceUrls: sourceUrls || [],
    status: "draft",
    tags: tags || [],
    createdAt: new Date().toISOString(),
    publishedAt: null,
  };
  items.unshift(entry);
  writeQueue(items);
  res.json(entry);
});

app.patch("/api/toutiao/queue/:id", (req, res) => {
  const items = readQueue();
  const idx = items.findIndex(i => i.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: "条目不存在" });
  if (req.body.status) {
    items[idx].status = req.body.status;
    if (req.body.status === "published") items[idx].publishedAt = new Date().toISOString();
  }
  if (req.body.title) items[idx].title = req.body.title;
  writeQueue(items);
  res.json(items[idx]);
});

app.delete("/api/toutiao/queue/:id", (req, res) => {
  let items = readQueue();
  items = items.filter(i => i.id !== req.params.id);
  writeQueue(items);
  res.json({ ok: true });
});

// ── 历史题材 ──

app.post("/api/history-topic/fetch", async (req, res) => {
  try {
    const { date, category } = req.body;

    if (category) {
      console.log(`历史题材-分类: ${category}`);
      const articles = await fetchCategoryArticles(category);
      console.log(`  → 获取 ${articles.length} 篇文章`);
      return res.json({ source: "category", category, articles });
    }

    const today = new Date();
    const month = date ? parseInt(date.split("-")[1]) : today.getMonth() + 1;
    const day = date ? parseInt(date.split("-")[2]) : today.getDate();
    console.log(`历史题材-日期: ${month}月${day}日`);
    const events = await fetchOnThisDay(month, day);
    console.log(`  → 获取 ${events.length} 个历史事件（已过滤）`);
    res.json({ source: "onthisday", month, day, events });
  } catch (err) {
    console.error("历史题材获取失败:", err.message);
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/history-topic/rewrite", async (req, res) => {
  try {
    const { title, content, stylePrompt } = req.body;
    if (!title?.trim() || !content?.trim()) {
      return res.status(400).json({ error: "请提供历史事件的标题和内容" });
    }

    console.log(`历史改写: ${title}`);
    const article = { title: title.trim(), content: content.trim() };

    const [versions, images] = await Promise.all([
      rewriteHistory(article, { targetLength: 1500, stylePrompt }),
      recommendImages(title, content).catch(e => {
        console.log("  配图获取失败（非致命）:", e.message);
        return null;
      }),
    ]);

    try {
      archive.save({
        originalTitle: title,
        originalUrl: "",
        originalContent: content,
        versions,
        level: "history",
        targetLength: 1500,
        tags: ["历史题材"],
      });
    } catch (e) { /* 静默 */ }

    res.json({ original: article, versions, images, targetLength: 1500 });
  } catch (err) {
    console.error("历史改写失败:", err.message);
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/history-topic/merge", async (req, res) => {
  try {
    const { events, stylePrompt } = req.body;
    if (!events?.length || events.length < 2) {
      return res.status(400).json({ error: "请至少选择2个历史事件进行合并" });
    }

    const mergedTitle = events.map(e => e.title).join(" · ");
    const mergedContent = events.map(e =>
      `## ${e.title}\n${e.content || e.text || ""}`
    ).join("\n\n---\n\n");

    console.log(`历史合并: ${events.length} 个事件 → ${mergedTitle}`);

    const article = { title: mergedTitle, content: mergedContent };
    const [versions, images] = await Promise.all([
      rewriteHistory(article, { targetLength: 2000, stylePrompt }),
      recommendImages(mergedTitle, mergedContent).catch(e => {
        console.log("  配图获取失败（非致命）:", e.message);
        return null;
      }),
    ]);

    try {
      archive.save({
        originalTitle: mergedTitle,
        originalUrl: "",
        originalContent: mergedContent,
        versions,
        level: "history",
        targetLength: 2000,
        tags: ["历史题材", "多事件"],
      });
    } catch (e) { /* 静默 */ }

    res.json({ original: article, versions, images, targetLength: 2000 });
  } catch (err) {
    console.error("历史合并失败:", err.message);
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/history-topic/headlines", async (req, res) => {
  try {
    const { title, content } = req.body;
    if (!content?.trim()) return res.status(400).json({ error: "请提供历史事件内容" });
    console.log(`历史标题工厂: ${title || "无标题"}`);
    const headlines = await generateHistoryHeadlines(title || "", content);
    res.json({ headlines });
  } catch (err) {
    console.error("历史标题生成失败:", err.message);
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/history-topic/check-dedup", async (req, res) => {
  try {
    const { articles } = req.body;
    if (!articles?.length || articles.length < 2) {
      return res.status(400).json({ error: "请提供至少2篇文章" });
    }
    console.log(`历史去重: ${articles.length} 篇文章`);
    const result = await checkHistoryDedup(articles);
    console.log(`  → ${result.unique.length} 保留, ${result.duplicates.length} 重复`);
    res.json(result);
  } catch (err) {
    console.error("历史去重失败:", err.message);
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3006;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`文章改写工具: http://localhost:${PORT}`);
});
