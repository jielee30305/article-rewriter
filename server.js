require("dotenv").config();
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

const app = express();
app.use(express.json({ limit: "10mb" }));
app.use(express.static("public"));

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

const PORT = process.env.PORT || 3006;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`文章改写工具: http://localhost:${PORT}`);
});
