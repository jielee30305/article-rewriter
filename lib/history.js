// 改写历史 & 素材库 — JSON 文件存储，简单可靠
const fs = require("fs");
const path = require("path");

const DATA_DIR = path.join(__dirname, "..", "data");
const HISTORY_FILE = path.join(DATA_DIR, "history.json");

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function readHistory() {
  ensureDataDir();
  if (!fs.existsSync(HISTORY_FILE)) return [];
  try {
    return JSON.parse(fs.readFileSync(HISTORY_FILE, "utf-8"));
  } catch {
    return [];
  }
}

function writeHistory(entries) {
  ensureDataDir();
  fs.writeFileSync(HISTORY_FILE, JSON.stringify(entries, null, 2));
}

// 保存改写记录
function save(record) {
  const entries = readHistory();
  const entry = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    createdAt: new Date().toISOString(),
    originalTitle: record.originalTitle || "",
    originalUrl: record.originalUrl || "",
    versions: record.versions || [],
    tags: record.tags || [],
    notes: record.notes || "",
    level: record.level || "pro",
    targetLength: record.targetLength || 1400,
  };
  entries.unshift(entry);
  // 保留最近200条
  if (entries.length > 200) entries.length = 200;
  writeHistory(entries);
  return entry;
}

// 搜索
function search(query = {}) {
  let entries = readHistory();
  if (query.keyword) {
    const kw = query.keyword.toLowerCase();
    entries = entries.filter(e =>
      e.originalTitle.toLowerCase().includes(kw) ||
      e.tags.some(t => t.toLowerCase().includes(kw)) ||
      e.notes.toLowerCase().includes(kw) ||
      (e.versions || []).some(v => (v.content || "").toLowerCase().includes(kw))
    );
  }
  if (query.tag) {
    entries = entries.filter(e => e.tags.includes(query.tag));
  }
  if (query.level) {
    entries = entries.filter(e => e.level === query.level);
  }

  // 默认返回最近30条，不返回完整content（太大）
  return entries.slice(0, query.limit || 30).map(e => ({
    id: e.id,
    createdAt: e.createdAt,
    originalTitle: e.originalTitle,
    originalUrl: e.originalUrl,
    tags: e.tags,
    notes: e.notes,
    level: e.level,
    targetLength: e.targetLength,
    versionCount: (e.versions || []).length,
    previews: (e.versions || []).map(v => ({
      version: v.version,
      preview: (v.content || "").slice(0, 150) + "...",
    })),
  }));
}

// 获取单条完整记录
function getById(id) {
  const entries = readHistory();
  return entries.find(e => e.id === id) || null;
}

// 更新标签/备注
function update(id, updates) {
  const entries = readHistory();
  const idx = entries.findIndex(e => e.id === id);
  if (idx < 0) return null;
  if (updates.tags !== undefined) entries[idx].tags = updates.tags;
  if (updates.notes !== undefined) entries[idx].notes = updates.notes;
  writeHistory(entries);
  return entries[idx];
}

// 删除
function remove(id) {
  const entries = readHistory();
  const filtered = entries.filter(e => e.id !== id);
  writeHistory(filtered);
}

// 获取所有标签
function getAllTags() {
  const entries = readHistory();
  const tagSet = new Set();
  entries.forEach(e => (e.tags || []).forEach(t => tagSet.add(t)));
  return [...tagSet].sort();
}

module.exports = { save, search, getById, update, remove, getAllTags };
