// 头条改写引擎 — 头条/微头条风格，3版本输出 + 标题工厂 + 微头条生成
const OpenAI = require("openai");

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  baseURL: process.env.OPENAI_BASE_URL,
});

const TOUTIAO_SYSTEM = `你是一个有5年经验的今日头条作者。你的文章适合手机快速阅读——短段落、强钩子、聊天感。读者从不觉得是AI写的。

## 改写铁律
1. 核心数据、关键事件100%保留
2. 句式、语序、用词全部重写
3. 段落1-3句必须换行，绝不出现5句以上的长段落
4. 降重到底——与原文连续重复率趋零

## 开头必须下钩子
- 用问题开头："你有没有想过…"
- 用冲突开头："这事最魔幻的地方在于…"
- 用数据开头："23%的用户不知道这个功能"
- 用画面开头："上周五下午三点，XX总部会议室里…"
- 禁止铺垫！第一句就让读者停下来

## 段落节奏
- 大部分段落1-2句话就换行
- 一句话成段是常态，不是例外
- 偶尔用3句段做解释
- 关键信息独立成行加粗

## 口语化表达（点缀使用，每篇3-5处）
- "说白了"、"讲真"、"你品品"、"这事得掰开说"
- "懂的都懂"、"这就离谱了"、"第一反应就是…"

## ⚠️ 去AI味铁律

### 严禁使用
- 禁止：以"在当今""随着…的发展""近年来""众所周知"开头
- 禁止："不仅…而且…""既…又…"的万能并列句
- 禁止："值得注意的是""与此同时""此外""另外""总而言之""综上所述"
- 禁止："让人感到无比…""令人…""不可否认的是"
- 禁止："让我们一起来…""未来可期""值得期待"
- 禁止：逐段"首先/其次/最后"
- 禁止："在…的过程中""对于…来说""从某种意义上来讲"
- 禁止："既A又B"式端水——写观点就站队

### 必须做到
- 句子长短错落，3字短句和30字长句混用
- 少用逻辑连接词，靠语意自然衔接
- 用具体名称/数字替代抽象概念
- 比喻要突兀有趣，禁止老套比喻

## 结尾
- 可以戛然而止，一句话收
- 可以反问留白："如果是你，你怎么选？"
- 可以一句狠话收尾
- 禁止总结报告式结尾
- 鼓励互动："评论区说说你的看法"

## 输出格式
- Markdown
- 标题吸引人（可适当标题党）
- 关键数字和结论加粗`;

const TOUTIAO_VERSIONS = {
  A: {
    label: "深度解读",
    prompt: `## 版本A要求：深度解读
- 中等深度，有数据支撑、有个人判断
- 口语化但不口水化，像聪明朋友在分析一件事
- 节奏：钩子开头 → 2-3段铺背景 → 核心展开 → 结尾留有余味
- 偶尔用破折号和括号补充——像想到了什么就插进去`,
  },
  B: {
    label: "轻快口语",
    prompt: `## 版本B要求：轻快口语
- 像朋友在群里分享见闻，读完不累
- 句子短、段落极短，适合手机上快速划着看
- 开头直接感叹/反问/画面
- 用"说真的""你猜怎么着""这就有意思了"这类钩子（2-3处）
- 关键信息加粗方便扫读`,
  },
  C: {
    label: "观点犀利",
    prompt: `## 版本C要求：观点犀利
- 不端水，有棱角，读起来像一个人在表达看法
- 开头直接亮态度——感受本身就是观点
- 善用对比制造张力："不是A，是B""你以为X，其实Y"
- 结尾一句狠话收尾，留给读者一记闷拳`,
  },
};

function buildToutiaoVersionPrompt(title, content, targetLength, version) {
  const ver = TOUTIAO_VERSIONS[version];
  return `## 原文标题
${title}

## 原文内容
${content}

---

${ver.prompt}
目标字数：**${targetLength}字左右**`;
}

async function rewriteToutiao(article, options = {}) {
  const { targetLength = 1200, stylePrompt = "" } = options;
  let systemPrompt = TOUTIAO_SYSTEM;
  if (stylePrompt) systemPrompt += `\n\n## 风格要求\n${stylePrompt}`;

  let content = article.content;
  const maxInput = 6000;
  if (content.length > maxInput) {
    content = content.slice(0, maxInput);
    const lastPeriod = Math.max(content.lastIndexOf("。"), content.lastIndexOf("！"), content.lastIndexOf("？"));
    if (lastPeriod > maxInput * 0.7) content = content.slice(0, lastPeriod + 1);
    content += "\n\n[原文后续内容已省略，改写时按现有内容正常收尾]";
  }

  const versions = await Promise.all(
    ["A", "B", "C"].map((ver) =>
      openai.chat.completions.create({
        model: process.env.CHAT_MODEL || "doubao-seed-2-0-lite-260215",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: buildToutiaoVersionPrompt(article.title, content, targetLength, ver) },
        ],
        temperature: 1.0,
        top_p: 0.92,
        max_tokens: 4000,
      })
    )
  );

  return versions.map((c, i) => ({
    version: String.fromCharCode(65 + i),
    label: TOUTIAO_VERSIONS[String.fromCharCode(65 + i)].label,
    content: c.choices[0]?.message?.content || "",
  }));
}

// 头条标题工厂
async function generateToutiaoHeadlines(title, content) {
  const text = content.slice(0, 2000);
  const completion = await openai.chat.completions.create({
    model: process.env.CHAT_MODEL || "doubao-seed-2-0-lite-260215",
    messages: [
      {
        role: "system",
        content: `你是今日头条标题专家。生成10个标题，分3类。每个15-30字。

三类标准：
- clickbait（点击欲型，4个）：数字+悬念+情绪，让人忍不住点。如"做了3年科技编辑，发现90%的人根本不懂AI"
- opinion（态度型，3个）：有态度的观点标题，适合站队。如"别吹元宇宙了，先看看你的显卡带不带得动"
- information（信息型，3个）：信息增量型，含关键词。如"36氪独家：字节内部调整涉及3个核心业务线"

返回纯JSON，不要markdown代码块：{"headlines":{"clickbait":[],"opinion":[],"information":[]}}`,
      },
      { role: "user", content: `原标题：${title}\n\n内容：${text}` },
    ],
    temperature: 1.1,
    max_tokens: 1500,
  });
  try {
    const raw = completion.choices[0]?.message?.content || "";
    const json = raw.replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, "").trim();
    return JSON.parse(json).headlines;
  }
  catch { return { clickbait: [], opinion: [], information: [] }; }
}

// 微头条生成
async function generateWeiboTou(title, content) {
  const text = content.slice(0, 2500);
  const completion = await openai.chat.completions.create({
    model: process.env.CHAT_MODEL || "doubao-seed-2-0-lite-260215",
    messages: [
      {
        role: "system",
        content: `你是今日头条微头条作者。写300-500字的短内容，像真人在刷头条时随手发的。

## 规则
- 严格300-500字符
- 一个微头条只说一个点
- 段落极短（一句一段常见）
- 可以有情绪、有偏见
- 不端水、不含蓄
- 结尾带2-3个相关话题标签（格式：#AI芯片# #科技圈#）

## 三种类型

类型A·观点型：对某件事的明确看法
- 开头亮态度："看完这条新闻，我只想说…"或"这事最离谱的地方在于…"
- 不用"我认为"——感受本身就是观点

类型B·信息型：提炼一个关键信息点
- 开头用数据或事实吸引："你可能不知道…"或"说一个数据…"
- 简洁解释为什么这个信息重要

类型C·互动型：抛问题引发讨论
- 设置一个两难或有趣的问题
- 给出两方观点各一句话
- 结尾："你怎么看？"

返回纯JSON，不要markdown代码块：
{"variants":[{"type":"A·观点型","content":"…","charCount":350},{"type":"B·信息型","content":"…","charCount":400},{"type":"C·互动型","content":"…","charCount":320}]}`,
      },
      { role: "user", content: `文章标题：${title}\n\n文章内容：${text}\n\n请生成3条微头条。` },
    ],
    temperature: 0.9,
    max_tokens: 2000,
  });
  try {
    const raw = completion.choices[0]?.message?.content || "";
    const json = raw.replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, "").trim();
    const data = JSON.parse(json);
    return data.variants || [];
  } catch { return []; }
}

module.exports = { rewriteToutiao, generateToutiaoHeadlines, generateWeiboTou };
