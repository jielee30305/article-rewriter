// RSS 抓取器 — 科技资讯源，jsdom 解析
const { JSDOM } = require("jsdom");

const RSS_FEEDS = [
  { id: "36kr", name: "36氪", url: "https://36kr.com/feed", category: "tech" },
  { id: "ithome", name: "IT之家", url: "https://www.ithome.com/rss/", category: "tech" },
  { id: "sspai", name: "少数派", url: "https://sspai.com/feed", category: "tech" },
  { id: "qbitai", name: "量子位", url: "https://www.qbitai.com/feed", category: "tech" },
  { id: "pingwest", name: "品玩", url: "https://www.pingwest.com/feed", category: "tech" },
];

const DEFAULT_TECH_KEYWORDS = [
  "AI", "人工智能", "芯片", "科技", "互联网", "手机", "新能源", "自动驾驶",
  "大模型", "OpenAI", "GPT", "机器人", "半导体", "云计算", "5G", "量子",
  "苹果", "华为", "小米", "特斯拉", "微软", "谷歌", "英伟达", "NVIDIA",
  "电动车", "电池", "卫星", "航天", "SpaceX", "区块链", "VR", "AR", "XR",
  "Python", "编程", "开源", "数据", "算法", "应用", "系统", "硬件", "软件",
];

// 从 HTML/XML 文本中提取所有图片 URL
function extractImages(text) {
  const urls = new Set();
  if (!text) return [];
  // 先还原 HTML 实体（RSS 可能把 <img> 编码成 &lt;img&gt;）
  const unescaped = text.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&amp;/g, "&");
  // <img src="...">
  for (const m of unescaped.matchAll(/<img[^>]+src=["']([^"']+)["']/gi)) {
    const url = m[1].trim();
    if (url && !url.startsWith("data:") && !url.includes("avatar") && !url.includes("icon")) {
      urls.add(url.replace(/^http:/, "https:"));
    }
  }
  // <media:content url="...">
  for (const m of text.matchAll(/<media:content[^>]+url=["']([^"']+)["']/gi)) {
    urls.add(m[1].trim().replace(/^http:/, "https:"));
  }
  // <media:thumbnail url="...">
  for (const m of text.matchAll(/<media:thumbnail[^>]+url=["']([^"']+)["']/gi)) {
    urls.add(m[1].trim().replace(/^http:/, "https:"));
  }
  // <enclosure url="..." type="image/...">
  for (const m of text.matchAll(/<enclosure[^>]+url=["']([^"']+)["'][^>]+type=["']image\//gi)) {
    urls.add(m[1].trim().replace(/^http:/, "https:"));
  }
  return [...urls];
}

function parseRSSItems(xmlText) {
  const items = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
  let match;
  while ((match = itemRegex.exec(xmlText)) !== null) {
    const itemXml = match[1];
    const title = (itemXml.match(/<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/i) || [])[1] || "";
    const link = (itemXml.match(/<link>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/link>/i) || [])[1] || "";
    const description = (itemXml.match(/<description>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/description>/i) || [])[1] || "";
    const pubDate = (itemXml.match(/<pubDate>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/pubDate>/i) || [])[1] || "";
    if (title && link) {
      items.push({
        title: title.trim(),
        url: link.trim(),
        summary: description.replace(/<[^>]*>/g, "").trim().slice(0, 300),
        pubDate: pubDate.trim(),
        images: extractImages(description).slice(0, 3),
      });
    }
  }
  return items;
}

function parseAtomItems(xmlText) {
  const items = [];
  const entryRegex = /<entry>([\s\S]*?)<\/entry>/gi;
  let match;
  while ((match = entryRegex.exec(xmlText)) !== null) {
    const entry = match[1];
    const title = (entry.match(/<title(?:[^>]*)>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/i) || [])[1] || "";
    const linkMatch = entry.match(/<link[^>]*href="([^"]*)"[^>]*\/?>/i) || entry.match(/<link>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/link>/i);
    const url = (linkMatch || [])[1] || "";
    const rawContent = (entry.match(/<summary(?:[^>]*)>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/summary>/i) || entry.match(/<content(?:[^>]*)>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/content>/i) || [])[1] || "";
    const published = (entry.match(/<published>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/published>/i) || entry.match(/<updated>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/updated>/i) || [])[1] || "";
    if (title && url) {
      items.push({
        title: title.trim(),
        url: url.trim(),
        summary: rawContent.replace(/<[^>]*>/g, "").trim().slice(0, 300),
        pubDate: published.trim(),
        images: extractImages(entry + rawContent).slice(0, 3),
      });
    }
  }
  return items;
}

function matchesKeywords(text, keywords) {
  if (!keywords || keywords.length === 0) return true;
  const lower = text.toLowerCase();
  return keywords.some(k => lower.includes(k.toLowerCase()));
}

async function scrapeFeed(feedConfig, options = {}) {
  const { maxItems = 10, keywords = DEFAULT_TECH_KEYWORDS, timeout = 15000 } = options;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  try {
    const res = await fetch(feedConfig.url, {
      signal: controller.signal,
      headers: { "User-Agent": "Mozilla/5.0 (compatible; ArticleRewriter/1.0)" },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const xml = await res.text();
    let items = xml.includes("<entry>") ? parseAtomItems(xml) : parseRSSItems(xml);
    items = items
      .filter(item => matchesKeywords(item.title + " " + item.summary, keywords))
      .slice(0, maxItems)
      .map(item => ({ ...item, feedId: feedConfig.id, feedName: feedConfig.name, sourceUrl: item.url }));
    return items;
  } catch (e) {
    console.error(`[rss] ${feedConfig.name} 抓取失败:`, e.message);
    return [];
  } finally {
    clearTimeout(timer);
  }
}

async function scrapeFeeds(feedIds, options = {}) {
  const feeds = feedIds && feedIds.length > 0
    ? RSS_FEEDS.filter(f => feedIds.includes(f.id))
    : RSS_FEEDS;
  const results = await Promise.all(feeds.map(f => scrapeFeed(f, options)));
  return results.flat().sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate));
}

function listFeeds() {
  return RSS_FEEDS.map(({ id, name, url, category }) => ({ id, name, url, category }));
}

module.exports = { scrapeFeeds, listFeeds, RSS_FEEDS };
