// 存档库 — 收集的链接 + 改写文章，表格化管理
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const DATA_DIR = path.join(__dirname, "..", "data");
const ARCHIVE_FILE = path.join(DATA_DIR, "archive.json");

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function readAll() {
  ensureDataDir();
  if (!fs.existsSync(ARCHIVE_FILE)) return [];
  try {
    return JSON.parse(fs.readFileSync(ARCHIVE_FILE, "utf-8"));
  } catch {
    return [];
  }
}

function writeAll(entries) {
  ensureDataDir();
  // 最多保留 500 条
  if (entries.length > 500) entries = entries.slice(0, 500);
  fs.writeFileSync(ARCHIVE_FILE, JSON.stringify(entries, null, 2), "utf-8");
}

// 保存一篇存档
function save({ originalTitle, originalUrl, originalContent, versions, level, targetLength, tags, notes }) {
  const entries = readAll();
  const entry = {
    id: crypto.randomUUID().slice(0, 8),
    originalTitle: originalTitle || "无标题",
    originalUrl: originalUrl || "",
    originalContent: (originalContent || "").slice(0, 3000), // 存前3000字
    versions: (versions || []).map(v => ({
      version: v.version,
      content: v.content || "",
      wordCount: (v.content || "").replace(/[#*\-\s\n`>|]/g, "").length,
    })),
    level: level || "pro",
    targetLength: targetLength || 1400,
    tags: tags || [],
    notes: notes || "",
    createdAt: new Date().toISOString(),
  };
  entries.unshift(entry);
  writeAll(entries);
  return entry;
}

// 更新存档
function update(id, patch) {
  const entries = readAll();
  const idx = entries.findIndex(e => e.id === id);
  if (idx === -1) return null;
  const allowed = ["originalTitle", "originalUrl", "tags", "notes"];
  for (const key of allowed) {
    if (patch[key] !== undefined) entries[idx][key] = patch[key];
  }
  entries[idx].updatedAt = new Date().toISOString();
  writeAll(entries);
  return entries[idx];
}

// 删除
function remove(id) {
  const entries = readAll();
  const filtered = entries.filter(e => e.id !== id);
  if (filtered.length === entries.length) return false;
  writeAll(filtered);
  return true;
}

// 获取单条
function getById(id) {
  return readAll().find(e => e.id === id) || null;
}

// 搜索 & 筛选 & 分页
function search({ keyword, tag, level, sort, page, limit } = {}) {
  let entries = readAll();
  const kw = (keyword || "").trim().toLowerCase();
  if (kw) {
    entries = entries.filter(e =>
      e.originalTitle.toLowerCase().includes(kw) ||
      (e.originalUrl || "").toLowerCase().includes(kw) ||
      (e.notes || "").toLowerCase().includes(kw) ||
      (e.versions || []).some(v => (v.content || "").toLowerCase().includes(kw))
    );
  }
  if (tag) {
    entries = entries.filter(e => (e.tags || []).includes(tag));
  }
  if (level && level !== "all") {
    entries = entries.filter(e => e.level === level);
  }
  // 排序
  const sortBy = sort || "newest";
  if (sortBy === "oldest") entries.reverse();
  else if (sortBy === "title") entries.sort((a, b) => a.originalTitle.localeCompare(b.originalTitle, "zh-CN"));

  const total = entries.length;
  const pageNum = parseInt(page) || 1;
  const limitNum = parseInt(limit) || 30;
  const start = (pageNum - 1) * limitNum;
  const items = entries.slice(start, start + limitNum);

  return { items, total, page: pageNum, limit: limitNum, totalPages: Math.ceil(total / limitNum) };
}

// 所有标签
function getAllTags() {
  const tagSet = new Set();
  readAll().forEach(e => (e.tags || []).forEach(t => tagSet.add(t)));
  return [...tagSet].sort();
}

// 导出 CSV
function exportCsv({ keyword, tag, level } = {}) {
  let entries = readAll();
  const kw = (keyword || "").trim().toLowerCase();
  if (kw) entries = entries.filter(e => e.originalTitle.toLowerCase().includes(kw));
  if (tag) entries = entries.filter(e => (e.tags || []).includes(tag));
  if (level && level !== "all") entries = entries.filter(e => e.level === level);

  const header = ["ID", "原标题", "来源链接", "水准", "目标字数", "版本数", "标签", "备注", "日期"];
  const rows = entries.map(e => [
    e.id,
    `"${(e.originalTitle || "").replace(/"/g, '""')}"`,
    e.originalUrl || "",
    e.level,
    e.targetLength,
    (e.versions || []).length,
    `"${(e.tags || []).join("、")}"`,
    `"${(e.notes || "").replace(/"/g, '""')}"`,
    e.createdAt?.slice(0, 10) || "",
  ]);
  return [header.join(","), ...rows.map(r => r.join(","))].join("\n");
}

module.exports = { save, update, remove, getById, search, getAllTags, exportCsv };
