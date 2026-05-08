// 风格克隆 — 分析文章提取风格特征，存入风格档案
const OpenAI = require("openai");
const fs = require("fs");
const path = require("path");

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  baseURL: process.env.OPENAI_BASE_URL,
});

const STYLES_DIR = path.join(__dirname, "..", "data", "styles");

function ensureStylesDir() {
  if (!fs.existsSync(STYLES_DIR)) {
    fs.mkdirSync(STYLES_DIR, { recursive: true });
  }
}

// 分析文章风格
async function analyzeStyle(name, articles) {
  const combined = articles.map((a, i) => `文章${i + 1}：${a.content.slice(0, 1500)}`).join("\n\n---\n\n");

  const completion = await openai.chat.completions.create({
    model: process.env.CHAT_MODEL || "doubao-seed-2-0-lite-260215",
    messages: [
      {
        role: "system",
        content: `你是写作风格分析师。分析以下文章，提取作者的风格特征。

返回纯JSON：
{
  "name": "风格名称",
  "features": {
    "avgSentenceLength": "短/中/长",
    "tone": "严肃/轻松/犀利/温暖/幽默",
    "vocabulary": "口语化/书面化/混合",
    "paragraphStyle": "长段落/短段落/参差",
    "openingStyle": "直入主题/场景引入/设问开头/数据开头",
    "transitionStyle": "逻辑连接词/自然过渡/跳跃式",
    "signaturePhrases": ["常用词1", "常用词2"],
    "metaphorType": "文学比喻/生活比喻/不用比喻",
    "personaDescription": "一句话描述这个人设"
  },
  "systemPrompt": "一段可直接用于AI system prompt的风格描述，200字以内"
}`,
      },
      { role: "user", content: combined },
    ],
    response_format: { type: "json_object" },
    temperature: 0.5,
    max_tokens: 1500,
  });

  const raw = completion.choices[0]?.message?.content || "";
  const profile = JSON.parse(raw);

  // 持久化
  ensureStylesDir();
  const filePath = path.join(STYLES_DIR, `${name.replace(/[<>:"/\\|?*]/g, "_")}.json`);
  fs.writeFileSync(filePath, JSON.stringify(profile, null, 2));

  return profile;
}

// 列出所有风格
function listStyles() {
  ensureStylesDir();
  if (!fs.existsSync(STYLES_DIR)) return [];
  return fs.readdirSync(STYLES_DIR)
    .filter(f => f.endsWith(".json"))
    .map(f => {
      const data = JSON.parse(fs.readFileSync(path.join(STYLES_DIR, f), "utf-8"));
      return { id: f.replace(".json", ""), name: data.name, features: data.features };
    });
}

// 获取风格
function getStyle(id) {
  const filePath = path.join(STYLES_DIR, `${id}.json`);
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, "utf-8"));
}

module.exports = { analyzeStyle, listStyles, getStyle };
