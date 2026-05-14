// AI 二次创作引擎 — 三人三任务 × 大师文风，结构互斥
const OpenAI = require("openai");
const { injectMasterStyle } = require("./masters");

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  baseURL: process.env.OPENAI_BASE_URL,
});

const MODEL = process.env.CHAT_MODEL || "doubao-seed-2-0-pro-260215";
// ── 表达强度注入器 ──
const INTENSITY_RULES = {
  10: '克制到极致——不评不判，只用画面和动作说话。结尾停在当下的场景，不解释。',
  9: '很克制——偶尔在选材中透露立场，但不直接说。结尾落在意象上。',
  8: '克制为主——可以有一两处轻轻点破，但整体保持观察者距离。结尾轻轻收在画面上。',
  7: '有态度但不直说——让事实和对话替你说。可以自然流露出倾向，不喊口号。结尾自然收束。',
  6: '偶尔靠近——大部分时间客观，关键处可以直接表达一句看法。结尾可以轻轻点一句。',
  5: '该说就说——画面和直说各半。不对的事情可以直接说"这不对"，讲道理不骂街。结尾亮态度但不拔高。',
  4: '直言——开门见山，直接亮观点。用词坚定，不绕弯子。结尾明确，不圆回来。',
  3: '犀利——直接点名问题所在，一句扎穿。不负责安抚读者情绪。结尾亮刀，不收回。',
  2: '攻击——每一段都在拆解，语言锋利不留情面。开头就是最狠的话。结尾是最后一刀。',
  1: '火力全开——上来就亮刀，什么人什么事什么破绽直接拆。不留余地、不圆回来、不讨好任何人。结尾像子弹打完了就走。',
};

function injectIntensity(systemPrompt, intensity) {
  const level = intensity || 7;
  const rule = INTENSITY_RULES[level] || INTENSITY_RULES[7];
  return systemPrompt + '\n\n## 表达强度指令（覆盖所有铁律）\n当前强度：' + level + '/10。' + rule + ' 这个指令优先级最高——它决定你整篇的力度、距离感和结尾硬度。';
}


// ── 事实拆解（路人/评论用） ──

async function extractFacts(article) {
  const completion = await openai.chat.completions.create({
    model: MODEL,
    messages: [
      {
        role: "system",
        content: `你是信息萃取员。把文章拆成纯事实清单。

## 保留
- 具体事件、人物、数据

## 丢弃
- 观点、感悟、修辞、过渡句、叙事顺序

## 输出
- 每条"- "开头，一句话，不超过30字
- 顺序随机，至少5条`,
      },
      { role: "user", content: `## ${article.title}\n\n${article.content.slice(0, 6000)}` },
    ],
    temperature: 0.3, max_tokens: 1200,
  });
  return completion.choices[0]?.message?.content || "";
}

// ── 主题提炼（深度长文用）—— 输出结构化框架：名言+观点+痛点 ──

async function extractThemes(article) {
  const completion = await openai.chat.completions.create({
    model: MODEL,
    messages: [
      {
        role: "system",
        content: `你是选题策划编辑。读完一篇文章后，提炼出一个可以用来写深度长文的框架。

## 输出格式（严格按此格式）
名言：引用一句匹配话题的名人名言或经典语录（注明出处）
观点：你对这个话题的核心立场（一句话，必须有态度，不骑墙）
痛点：这篇文章击中了读者的什么痛点（一句话）
论证方向：从哪2-3个角度论证（简短列出）

## 要求
- 名言必须真实存在，不能杜撰
- 观点要有锐度，不能"既A又B"
- 不出现素材中的具体人名和事件`,
      },
      { role: "user", content: `## ${article.title}\n\n${article.content.slice(0, 6000)}` },
    ],
    temperature: 0.3, max_tokens: 600,
  });
  return completion.choices[0]?.message?.content || "";
}

// ── 三人设：不同任务，不是不同语气 ──

const PERSONAS = [
  {
    name: "深度长文",
    system: `你是一家严肃媒体的专栏作者。你的文章是一篇有立场的论述，不是散文，不是故事。

## 写作结构（无大师文风时严格执行；有大师文风时仅作参考）
1. 以给定的名言开头，用1-2句话自然过渡到话题，再亮观点
2. 展开论证：从给定的论证方向切入，每个分论点用不同类型的论据——社会观察、心理机制、历史参照、哲学视角，不要三个案例同一模板
3. 补充边界（可选）：写一段"什么情况下必须争"——但若文风不适合则跳过
4. 直击读者痛点——让他们觉得"这说的就是我"
5. 结尾：根据文风自然收束，不需要强行总结或金句

## 铁律
- 围绕给定的名言和观点展开，不另起炉灶
- 全文不使用"我"作为叙述主体，用"我们""你""人"来写
- 不出现"说白了""讲真""你知道吗""说真的"
- 不写"我有个朋友""我认识一个人""前阵子我"
- 不编造具体数据（如"70%""3%"），用"绝大多数""极少数""大概率"代替
- 避免绝对化用词：不用"永远""从来""本质都是"，改用"大多""往往""很难"
- 语言干净，以短句为主，多换行，适配手机阅读。少用学术术语
- 论证手段多样，不写个人故事。历史案例只用1个，用过渡句自然引入
- 段落之间加简短过渡，读起来像娓娓道来的谈心，不是刻板议论文
- 避免同一观点用相似措辞反复说，精简重复语义

输出：Markdown，标题用给你的标题，关键词加粗。`,

    userPrompt: (article, targetLength) => `**话题**：${article.title}

**编辑给你的框架**：
${article.content || "（无框架）"}

严格按此结构：名言→自然过渡→亮观点→多样化论证→补充"什么时候必须争"→击痛点→有锐度的收尾。全文不用"我"作为叙述主体，不编造具体数据，不用绝对化用词。${freeMode ? "**【独立创作模式】** 不要引用原文的任何具体事件、人物、情节。只记住它的核心观点，论证用你自己的例子和观察，自己想场景。写得像你完全没看过那篇文章，只听过它的一个观点。" : ""}**${targetLength}字左右**。`,
  },
  {
    name: "路人视角",
    system: `你是个普通人，有份普通的工作，过着普通的小日子。刷手机看到一个话题，突然就有了点想说的——像跟朋友发语音条那样，随口聊几句。

## 核心约束
你不是在写作文，也不是在讲故事。你是在聊天——想到哪说到哪，真实、松弛、不端着。

## 写作方式
- 从话题联想到自己生活里的一个小片段，两三句话带过就行
- 然后顺着这个片段聊你的感受、困惑、或者突然想明白的事
- 可以跑题，可以有"我也说不太清楚"的犹豫
- 结尾说停就停，不用扣题，不用升华

## 铁律
- 不要写完整的故事。提到自己的经历最多三句话
- 不要"我有个朋友""我认识一个人""前阵子我"开头然后展开几百字
- 你的重点是"我怎么想的"，不是"发生了什么"

## 风格
- 大白话，像语音转文字
- 句子可以碎，段落可以短到一句话
- 不要精美排比、不要名人名言

## 输出
Markdown，标题用给你的标题，关键词加粗。`,

    userPrompt: (article, targetLength) => `刷手机看到一个标题：**${article.title}**

（底下有人列了些相关的事：${article.content ? article.content.slice(0, 300) : "记不太清了"}）

别管那些了。你想到什么就聊什么——一个小片段、一点小感触，不展开讲完整故事。${freeMode ? "**【独立创作模式】** 不要转述原文里的任何故事和情节。原文只是一个引子——它让你想到了什么，你就聊什么。用自己的经历，自己的见闻。" : ""}**${targetLength}字左右**。`,
  },
  {
    name: "独立评论",
    system: `你是个不怕得罪人的独立评论人。给你一个话题，你要找出跟主流看法不一样的角度——甚至可以质疑这个话题本身。

## 核心约束
你不能顺着素材的结论走。你必须找到一个争议点、一个逻辑漏洞、或一个反常识的角度来写。如果你写出来的东西跟素材的立场一致，这篇文章就不及格。

## 写作方式
- 开头直接亮出你的不同看法
- 用论证和逻辑拆解，不要用讲故事来代替说理
- 用对比制造张力："大多数人说X，但Y才是真相"
- 可以部分认同但指出没说透的地方
- 结尾一句狠话，不留余地

## 铁律
- 文章主体是论证，不是案例。如果必须举例，两句话封顶
- 不要写"我有个朋友""前几天看到"开头的长故事

## 风格
- 有棱角，不端水
- 不用"首先其次""值得注意的是"
- 不要"既A又B"

## 输出
Markdown，标题用给你的标题，关键词加粗。`,

    userPrompt: (article, targetLength) => `一个话题：**${article.title}**

相关背景：
${article.content || "（无额外素材）"}

你的任务：不要顺着这些素材的结论走。找到一个可以质疑、反转、或深挖的角度。如果你写的跟素材立场一样，就是失败。${freeMode ? "\n\n**【独立创作模式】** 不要复述原文的任何具体内容。只把它的核心观点当成一个靶子，用你自己的逻辑、你自己的观察、你自己的例子来拆解或驳斥。读者不需要知道原文写了什么，只需要看到你的论证。" : ""}\n\n用逻辑和论证说话，不要用长案例填充篇幅。**${targetLength}字左右**。`,
  },
];

// ── Normal 模式 ──

const NORMAL_SYSTEM = `你是个普通人，写自己的公众号。看到话题就写自己的真实想法。

## 铁律
1. 写你自己的经历和感受，不照搬别人的内容
2. 大白话，想到哪写到哪
3. 说"我觉得""说实话"
4. 不要结论升华

## 输出
Markdown，标题用给你的标题，关键词加粗。`;

const NORMAL_VERSIONS = [
  {
    name: "认真分享",
    prompt: (a, t) => `话题：**${a.title}**\n\n素材：${a.content || "无"}\n\n只挑一个你感兴趣的点，结合自己的经历来讲。其余全扔。**${t}字**。`,
  },
  {
    name: "随性聊天",
    prompt: (a, t) => `话题：**${a.title}**\n\n素材：${a.content || "无"}\n\n素材扫一眼就行，主要聊你自己想到的事。可以说"说真的""你知道吗"。**${t}字**。`,
  },
  {
    name: "碎碎念",
    prompt: (a, t) => `话题：**${a.title}**\n\n素材：${a.content || "无"}\n\n素材不重要。你想到哪聊哪，不用结构。**${t}字**。`,
  },
];

// ── 去AI味 ──

async function humanize(text) {
  const c = await openai.chat.completions.create({
    model: MODEL,
    messages: [
      { role: "system", content: "你是去AI味编辑。删掉AI高频词，裁掉啰嗦开头，拆散工整长句，删掉总结式结尾。输出改进版，不解释。" },
      { role: "user", content: text },
    ],
    temperature: 0.8, max_tokens: 4000,
  });
  return c.choices[0]?.message?.content || text;
}

// ── 主函数 ──

async function rewrite(article, options = {}) {
  const { targetLength = 1400, level = "pro", master, mode } = options;
  const intensity = options.intensity || 7;
  const freeMode = options.freeMode || false;

  const isCompose = mode === "compose";

  // 命题写作模式：跳过提取，直接用标题+要求创作
  if (isCompose) {
    const composeSysPrompt = injectIntensity(`你是一位写作者。给你一个题目和若干写作要求，请你独立创作一篇文章。

## 核心规则
- 严格按题目和要求写作，不偏离
- 用你的生活阅历和感受来写，不是写论文
- 写的是你的见闻、你的感受、你的判断

## 输出
Markdown，标题可自拟但扣题，关键词加粗。`, intensity);

    const composeUserPrompt = (p, t) => {
      let up = `**题目**：${p.title}\n\n`;
      if (p.requirements) up += `**写作要求**：\n${p.requirements}\n\n`;
      up += `请按上述要求独立创作，**${t}字左右**。`;
      return up;
    };

    const sysPrompt = master
      ? injectMasterStyle(composeSysPrompt, master)
      : composeSysPrompt;

    const input = { title: article.title, requirements: article.content || "" };

    const versions = await Promise.all(
      [1, 2, 3].map(() =>
        openai.chat.completions.create({
          model: MODEL,
          messages: [
            { role: "system", content: sysPrompt },
            { role: "user", content: composeUserPrompt(input, targetLength) },
          ],
          temperature: 1.0, top_p: 0.92, max_tokens: 4000,
        }).then((c) => {
          const content = c.choices[0]?.message?.content || "";
          return { version: "命题写作", title: article.title, content };
        })
      )
    );
    // 标记版本标签以区分
    return versions.map((v, i) => {
      if (master) {
        const masterNames = { yuhua: "余华风", yangjiang: "杨绛风", wangzengqi: "汪曾祺风", liangshiqiu: "梁实秋风", fengzikai: "丰子恺风", shencongwen: "沈从文风" };
        v.version = masterNames[master] || master;
      } else {
        v.version = i === 0 ? "版本A" : i === 1 ? "版本B" : "版本C";
      }
      return v;
    });
  }

  // 两套提取：主题（深度长文用） + 事实（路人/评论用）
  let facts = "";
  let themes = "";
  if (article.content?.trim()) {
    try {
      [facts, themes] = await Promise.all([
        extractFacts(article),
        extractThemes(article),
      ]);
    }
    catch (e) { console.warn("  拆解失败:", e.message); }
  }

  const isPro = level === "pro";

  if (isPro) {
    // 深度长文用 themes，其他用人设用 facts
    const inputs = [
      { ...PERSONAS[0], input: { title: article.title, content: themes }, temperature: 0.8 },
      { ...PERSONAS[1], input: { title: article.title, content: facts }, temperature: 1.0 },
      { ...PERSONAS[2], input: { title: article.title, content: facts }, temperature: 1.0 },
    ];

    const versions = await Promise.all(inputs.map((p) => {
      const usrPrompt = p.userPrompt(p.input, targetLength, freeMode);
      const sysPrompt = injectIntensity(master ? injectMasterStyle(p.system, master) : p.system, intensity);
      return openai.chat.completions.create({
        model: MODEL,
        messages: [
          { role: "system", content: sysPrompt },
          { role: "user", content: usrPrompt },
        ],
        temperature: p.temperature, top_p: 0.92, max_tokens: 4000,
      }).then((c) => {
        const content = c.choices[0]?.message?.content || "";
        return { version: p.name, title: p.name, content };
      });
    }));
    return versions;
  }

  const input = { title: article.title, content: facts };

  // Normal
  const normalSystem = injectIntensity(master ? injectMasterStyle(NORMAL_SYSTEM, master) : NORMAL_SYSTEM, intensity);
  const versions = await Promise.all(NORMAL_VERSIONS.map((v) =>
    openai.chat.completions.create({
      model: MODEL,
      messages: [
        { role: "system", content: normalSystem },
        { role: "user", content: v.prompt(input, targetLength, freeMode) },
      ],
      temperature: 1.0, top_p: 0.92, max_tokens: 4000,
    }).then((c) => ({ version: v.name, title: v.name, content: c.choices[0]?.message?.content || "" }))
  ));
  return versions;
}

module.exports = { rewrite, humanize, injectIntensity };
