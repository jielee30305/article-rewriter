// 历史题材改写引擎 — Wikipedia API 获取 + AI 深度叙事 + 大师文风
const OpenAI = require("openai");
const { injectMasterStyle } = require("./masters");

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  baseURL: process.env.OPENAI_BASE_URL,
});

const HISTORY_SYSTEM = `你是资深历史科普作家，专为微信公众号创作历史题材长文。你的文字像"明朝那些事儿"——把尘封的史料写成活生生的人间故事。

## 风格要求
1. 生动叙事，拒绝教科书腔调。把历史人物当"人"来写——有性格、有情绪、有不得已
2. 用现代人能理解的比喻解释古代事物和制度
3. 段落节奏变化：场景描写可以多句铺陈，议论收束时短句有力
4. 关键时间、人名、数字加粗
5. 偶尔插入现代视角的会心一笑——但不过度，不损历史厚重感

## ⚠️ 安全红线
- 只创作公元1500年以前的古代史内容
- 如果有人要求写鸦片战争、二战、文革等近现代史，一律拒绝："抱歉，我只创作古代史内容"
- 不涉及政治制度比较、民族冲突、宗教争端、领土争议
- 保持历史科普的客观中立，不输出当代价值观判断

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
- 比喻要突兀有趣，禁止"历史长河""岁月如梭"等老套比喻

## 输出格式
- Markdown
- 标题有吸引力（可用设问、悬念），不做论文式标题
- 关键年代、人名、结论加粗`;

const HISTORY_VERSIONS = {
  A: {
    label: "深度叙事",
    prompt: `## 版本A要求：深度叙事
- 像"明朝那些事儿"风格的历史叙事——有场景还原、人物刻画、细节描摹
- 把历史切片展开，让读者身临其境
- 开篇用画面感强的场景抓人——"贞观十七年的长安城，一位中年人站在刑部大牢门口…"
- 用现代人能理解的类比解释古代制度/器物——"汉代的驿站，相当于今天的高速公路服务区"
- 关键人物要有性格，不扁平化
- 目标字数：1500字左右`,
  },
  B: {
    label: "轻松科普",
    prompt: `## 版本B要求：轻松科普
- 像朋友在饭桌上分享历史冷知识，轻松有趣不枯燥
- 聚焦一个最有趣的知识点，围绕它展开
- 允许"你猜怎么着""说真的，这事放到今天…"这类口语化点缀（3-5处）
- 句子短，段落小，适合手机快速浏览
- 偶尔穿插现代视角的调侃——但不过度，不为搞笑损害历史准确
- 目标字数：1500字左右`,
  },
  C: {
    label: "观点史评",
    prompt: `## 版本C要求：观点史评
- 不只是讲故事，要有"史识"——对这段历史有独立判断
- 开头亮观点："很多事，翻翻史书才发现太阳底下没有新鲜事"
- 用现代视角回望古代，找出今天仍然在重复的模式
- 不端水，有棱角——但保持对历史的敬畏
- 善用对比制造张力："你以为他只是个诗人，其实他是剑客"
- 结尾一声叹息或一句金句，让人掩卷沉思
- 目标字数：1500字左右`,
  },
  D: {
    label: "头条爆款",
    prompt: `## 版本D要求：头条爆款
- 适合今日头条信息流推荐的内容——前三句决定生死
- **开头必须是钩子**：用悬念、冲突、反常事件开篇，第一句话就让读者想"然后呢？"
- **段落极短**：手机一屏不超过4段，每段最多3句话，多留白
- **节奏快**：像讲故事一样推进，别铺垫，也别总结，直接开场
- **观点有棱角**：不端水、不模棱两可，给出清晰的判断
- **画面感强**：多用场景和细节，少用概念和概括
- **互动钩子**：结尾留一个开放式问题或信息缺口，引导评论
- **禁止**：长段学术描述、背景铺垫超过3句、教科书式总结
- 目标字数：1200字左右`,
  },
  E: {
    label: "正野史对撞",
    prompt: `## 版本E要求：正野史对撞
你是擅长比较正史与野史冲突的叙事者。你的任务是制造"认知颠覆"——让读者发现，他们以为的那个历史人物，和真实历史可能完全不同。

## 5段式结构（严格按此顺序）
1. **钩子开头**：一句话制造冲突——"所有人都知道XXX，但真实的XXX根本不是那样"（1-2句，制造悬念和颠覆感）
2. **民间/影视说的**：简短概括大众从电视剧、小说、民间传说里得到的印象——来自哪部剧/哪本小说/哪个传说（80-120字）
3. **正史记载的**：用史料说话，呈现真实的记载——这个人到底是什么样的人，做了什么（120-180字）
4. **碰撞点**：为什么会这样？谁在说谎/神化/丑化？小说为什么这么写？写这些的人有什么目的？（引发思考，80-120字）
5. **收尾**：留一句有冲击力的结语或开放式问题，让读者忍不住想评论——不要总结，要刺人（1-2句）

## 风格要求
- 语言像在跟朋友聊天揭秘，有"你猜怎么着""说真的"的松弛感，但不轻浮
- 不端水，给明确的判断——谁在歪曲就说谁在歪曲
- 句子短，节奏快，适合手机拇指滑动阅读
- 标题不用"你所不知道的""真相揭秘"这类陈词滥调，直接用人名+冲突点
- 目标字数：800-1000字`,
  },
};

function buildHistoryVersionPrompt(title, content, targetLength, version) {
  const ver = HISTORY_VERSIONS[version];
  return `## 历史事件
${title}

## 史料内容
${content}

---

${ver.prompt}
目标字数：**${targetLength}字左右**`;
}

// ── 人物素材组装 ──

function buildFigureContent(figure) {
  return `## 历史人物：${figure.name}（${figure.dynasty}）
## 人物类型：${figure.type}

### 正史记载
${figure.official}

### 民间传说 / 影视形象
${figure.folk}

### 核心冲突
${figure.conflict}`;
}

function buildFigureClashPrompt(figure) {
  return `## 人物信息
- 姓名：${figure.name}
- 朝代：${figure.dynasty}
- 冲突类型：${figure.type}

## 正史记载
${figure.official}

## 民间传说/影视形象
${figure.folk}

## 核心冲突
${figure.conflict}

---
请按正野史对撞5段式结构（钩子→民间说→正史记→碰撞点→收尾）创作，制造认知颠覆。800-1000字。`;
}

async function rewriteHistory(article, options = {}) {
  const { targetLength = 1500, stylePrompt = "", figure, master } = options;
  let systemPrompt = master ? injectMasterStyle(HISTORY_SYSTEM, master) : HISTORY_SYSTEM;
  if (stylePrompt) systemPrompt += `\n\n## 风格要求\n${stylePrompt}`;

  let content = article.content;
  if (figure && figure.official && figure.folk) {
    content = buildFigureContent(figure);
  }
  const maxInput = 8000;
  if (content.length > maxInput) {
    content = content.slice(0, maxInput);
    const lastPeriod = Math.max(content.lastIndexOf("。"), content.lastIndexOf("！"), content.lastIndexOf("？"));
    if (lastPeriod > maxInput * 0.7) content = content.slice(0, lastPeriod + 1);
    content += "\n\n[史料后续内容已省略，按现有内容完成叙事]";
  }

  const versionKeys = figure ? ["A", "B", "C", "D", "E"] : ["A", "B", "C", "D"];

  const versions = await Promise.all(
    versionKeys.map((ver) => {
      const userContent = (ver === "E" && figure)
        ? buildFigureClashPrompt(figure)
        : buildHistoryVersionPrompt(article.title, content, targetLength, ver);

      return openai.chat.completions.create({
        model: process.env.CHAT_MODEL || "doubao-seed-2-0-lite-260215",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userContent },
        ],
        temperature: 1.0,
        top_p: 0.92,
        max_tokens: 4000,
      });
    })
  );

  return versions.map((c, i) => ({
    version: String.fromCharCode(65 + i),
    label: HISTORY_VERSIONS[String.fromCharCode(65 + i)].label,
    content: c.choices[0]?.message?.content || "",
  }));
}

// ── Wikipedia API + 本地数据回退 ──

const WIKI_UA = "ArticleRewriter/1.0 (history-topic)";
const WIKI_BASE = process.env.WIKIPEDIA_API_BASE || "https://zh.wikipedia.org";
const WIKI_TIMEOUT = parseInt(process.env.WIKIPEDIA_TIMEOUT) || 10000;

// 加载本地历史事件数据作为回退
const path = require("path");
const fs = require("fs");
let localEvents = [];
try {
  const dataFile = path.join(__dirname, "..", "data", "history-events.json");
  localEvents = JSON.parse(fs.readFileSync(dataFile, "utf8"));
} catch (e) {
  // 本地数据不可用时忽略
}

// ── 历史人物数据库 ──
let _figuresCache = null;
function loadHistoryFigures() {
  if (_figuresCache) return _figuresCache;
  try {
    const figFile = path.join(__dirname, "..", "data", "history-figures.json");
    _figuresCache = JSON.parse(fs.readFileSync(figFile, "utf8"));
    return _figuresCache;
  } catch (e) {
    console.warn("加载历史人物库失败:", e.message);
    return [];
  }
}

function getAllFigureTypes() {
  const figures = loadHistoryFigures();
  return [...new Set(figures.map(f => f.type))];
}

function getFiguresByType(type) {
  const figures = loadHistoryFigures();
  if (!type) return figures;
  return figures.filter(f => f.type === type);
}

async function fetchOnThisDay(month, day) {
  // 尝试 Wikipedia API
  try {
    const url = `${WIKI_BASE}/api/rest_v1/feed/onthisday/events/${month}/${day}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), WIKI_TIMEOUT);
    const res = await fetch(url, {
      headers: { "User-Agent": WIKI_UA, "Accept": "application/json" },
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (res.ok) {
      const data = await res.json();
      const events = filterAncientEvents(data.events || []);
      if (events.length > 0) return events;
    }
  } catch (e) {
    // Wikipedia 不可达，回退到本地数据
    console.log(`  Wikipedia 不可达，使用本地历史数据 (${e.message?.slice(0,50)})`);
  }

  // 回退：使用本地数据
  return localEvents
    .filter(e => e.month === month && e.day === day)
    .map(e => ({ year: e.year, text: e.text, pages: [], summary: e.summary }));
}

const UNSAFE_KEYWORDS = [
  "战争", "屠杀", "暴力", "种族", "民族", "宗教", "领土",
  "冲突", "侵略", "殖民", "压迫", "革命", "独立", "分裂",
  "共产党", "国民党", "政治", "主义", "运动", "起义",
];

function filterAncientEvents(events) {
  return events.filter(event => {
    if (!event.year || event.year < 0) return true; // BCE OK
    if (event.year > 1500) return false;
    if (event.year > 1000) {
      const text = (event.text || "").toLowerCase();
      const hasUnsafe = UNSAFE_KEYWORDS.some(kw => text.includes(kw));
      if (hasUnsafe) return false;
    }
    return true;
  });
}

async function fetchArticleSummary(title) {
  const encoded = encodeURIComponent(title);
  const url = `${WIKI_BASE}/api/rest_v1/page/summary/${encoded}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), WIKI_TIMEOUT);
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": WIKI_UA, "Accept": "application/json" },
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) throw new Error(`Wikipedia 页面不存在 (${res.status})`);
    const data = await res.json();
    return {
      title: data.title,
      extract: data.extract || "",
      thumbnail: data.thumbnail?.source || null,
      url: data.content_urls?.desktop?.page || "",
    };
  } finally {
    clearTimeout(timer);
  }
}

const CATEGORY_PAGES = {
  "中国古代科技": ["四大发明", "指南针", "造纸术", "火药", "印刷术", "张衡", "祖冲之", "梦溪笔谈"],
  "世界古代史": ["古埃及", "古巴比伦", "古希腊", "古罗马", "玛雅文明", "苏美尔"],
  "古罗马": ["罗马共和国", "罗马帝国", "凯撒", "奥古斯都", "罗马斗兽场", "庞贝古城", "君士坦丁大帝"],
  "古希腊": ["雅典", "斯巴达", "苏格拉底", "柏拉图", "亚里士多德", "亚历山大大帝"],
  "丝绸之路": ["丝绸之路", "张骞", "西域", "敦煌", "楼兰", "大秦", "班超"],
  "古代文明": ["美索不达米亚", "古埃及金字塔", "印度河流域文明", "殷墟", "空中花园", "阿育王"],
};

// 本地分类数据：每篇有预写摘要，Wikipedia 不可用时使用
const CATEGORY_LOCAL = {
  "中国古代科技": [
    { title: "四大发明", extract: "中国古代四项伟大发明——造纸术、印刷术、火药和指南针——深刻改变了世界文明进程。造纸术和印刷术让知识得以传播，火药改写了战争形态，指南针开启了大航海时代。弗朗西斯·培根说它们'改变了整个世界的面貌和状态'。" },
    { title: "指南针", extract: "战国时期中国人发现了磁石指极性，最早的指南工具是'司南'——一把放在光滑地盘上的磁勺。到了宋代，指南针被用于航海，让中国商船率先驰骋于印度洋和南海。这项发明传入欧洲后，直接催生了哥伦布的远航。" },
    { title: "造纸术", extract: "公元105年，蔡伦改进了造纸术，用树皮、麻头、破布和渔网造出了轻便便宜的纸。此前中国用竹简和缣帛写字——'学富五车'说的其实是五车竹简，信息量只相当于今天一本书。造纸术通过阿拉伯传到欧洲，让文艺复兴成为可能。" },
    { title: "火药", extract: "火药是炼丹术士意外发现的产物——他们想炼长生不老药，却炼出了爆炸物。最早的军用火药配方记载于《武经总要》（1044年）。火药传到欧洲后，把骑士阶层炸成了历史——城堡不再是不可攻克的，贵族不再能垄断武力。" },
    { title: "印刷术", extract: "北宋毕昇发明了活字印刷术，用胶泥刻字烧硬后排成活版。虽然中文汉字数量庞大限制了活字印刷的早期应用，但这项思想传入欧洲后，谷登堡在15世纪发明了金属活字印刷机，直接引爆了宗教改革和科学革命。" },
  ],
  "古罗马": [
    { title: "凯撒", extract: "盖乌斯·尤利乌斯·凯撒（公元前100-前44年），罗马共和国末期的军事统帅和政治家。他征服了高卢全境，率军渡过卢比孔河发动内战，最终成为罗马的终身独裁官——却被元老院在他最辉煌的时刻刺杀。他的名字后来成为'皇帝'的代名词（德语的Kaiser、俄语的Tsar都源于Caesar）。" },
    { title: "奥古斯都", extract: "奥古斯都原名屋大维，凯撒的甥孙和养子。公元前27年，他宣布'恢复共和'，实际上却建立了一套隐蔽的君主制——元首制。他统治罗马41年，开创了长达200年的'罗马和平'。他临终说自己接手的是一座砖城，留下的是一座大理石城——这句话是他的帝国遗产最精炼的总结。" },
    { title: "罗马帝国", extract: "罗马帝国延续了约500年（公元前27年-公元476年西罗马），疆域极盛时横跨欧亚非三洲。它不只是一支军队或一套行政体系——罗马留下的法律、道路、水道和拉丁语，构成了西方文明的底层架构。没有罗马法就没有现代民法，没有罗马大道就没有欧洲的交通网络。" },
  ],
  "古希腊": [
    { title: "苏格拉底", extract: "苏格拉底（公元前470-前399年）一生没有写过任何著作，却被认为奠定了西方哲学的基础。他在雅典街头用提问法追问他遇到的每一个人——这种'产婆术'式追问最终激怒了雅典人。70岁时他被判死刑，饮下毒芹汁。他说'未经审视的生活不值得过'，这句话2500年后仍然掷地有声。" },
    { title: "亚里士多德", extract: "亚里士多德（公元前384-前322年），柏拉图的学生、亚历山大大帝的老师。他几乎研究了当时所知的所有学科——逻辑学、物理学、生物学、伦理学、政治学、诗学。他的著作是中世纪欧洲大学的教科书，直到17世纪科学革命前，'哲学家'三个字在中世纪指的就是他一个人。" },
  ],
  "丝绸之路": [
    { title: "张骞", extract: "公元前138年，汉武帝派遣张骞出使西域，目的是联合大月氏夹击匈奴。张骞一去就是13年，被匈奴俘虏两次，娶了匈奴妻子，最终只带了一个随从回到长安。他虽然没能完成军事任务，却带回了关于西域各国的详尽信息——'凿空'西域，丝绸之路由此开启。" },
  ],
  "古代文明": [
    { title: "古埃及金字塔", extract: "埃及吉萨金字塔群建于约公元前2600-2500年，其中最著名的是胡夫金字塔——高146米，使用了约230万块巨石，每块均重2.5吨。它是古代世界七大奇迹中唯一保存至今的。古希腊人看到它时已经是2500年前的'古董'——它有多古老？对古希腊人来说，金字塔比古希腊对现代人来说还要古老。" },
  ],
};

async function checkWikiAccess() {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(`${WIKI_BASE}/api/rest_v1/feed/onthisday/events/1/1`, {
      headers: { "User-Agent": WIKI_UA, "Accept": "application/json" },
      signal: controller.signal,
    });
    clearTimeout(timer);
    return res.ok;
  } catch { return false; }
}

async function fetchCategoryArticles(category) {
  const pages = CATEGORY_PAGES[category];
  if (!pages) throw new Error(`未知分类: ${category}`);

  // 快速检测 Wikipedia 是否可达
  const wikiUp = await checkWikiAccess();

  if (wikiUp) {
    const results = [];
    for (const page of pages.slice(0, 4)) { // 限制并发请求数
      try {
        const summary = await fetchArticleSummary(page);
        results.push(summary);
      } catch (e) { /* 跳过 */ }
    }
    if (results.length > 0) return results;
  }

  // 回退到本地数据
  const localArticles = CATEGORY_LOCAL[category] || [];
  console.log(`  Wikipedia 不可达，使用本地 ${localArticles.length} 篇"${category}"分类文章`);
  return localArticles.map(a => ({
    title: a.title,
    extract: a.extract || "",
    thumbnail: a.thumbnail || null,
    url: "",
  }));
}

// ── 历史标题工厂（三段式） ──

async function generateHistoryHeadlines(title, content) {
  const text = content.slice(0, 2000);
  const completion = await openai.chat.completions.create({
    model: process.env.CHAT_MODEL || "doubao-seed-2-0-lite-260215",
    messages: [
      {
        role: "system",
        content: `你是头部历史自媒体标题专家。生成13个标题，分4类。

## 标题铁律
- 15-22字，手机信息流两行内显示完整
- 必须有"刺"——让读者产生愤怒、好奇、不服、想反驳的情绪
- 用冲突制造点击欲：身份反转 / 命运反差 / 正野史对撞 / 历史定论的颠覆
- 卖关子但不说谎，"这个皇帝救了整个大明"可以，"科学家不敢公布的秘密"不行
- 禁止："你所不知道的""真相揭秘""震惊了""居然"这类陈词滥调

## 四类标题
- toutiao（头条爆款型，5个）：最狠的情绪钩子，2秒出反应
  - 像在跟熟人爆料的语气，不端着
  - 例："课本不会告诉你，郑和七下西洋根本不是去搞外交"
  - 例："比哥伦布早了87年，他的船队碾压全世界，死后中国却再不下海"
  - 例："明朝最惨皇帝：他救了整个大明，死后被踢出皇陵"
- opinion（态度型，3个）：有立场有棱角，适合评论区站队吵架
  - 例："别骂他软弱，换你去当末代皇帝，可能跑得比他还快"
  - 例："说他是千古暴君的人，可能不知道他做的这些事"
- clickbait（数字悬念型，3个）：数字+冲突+信息缺口
  - 例："明朝十六帝只有十三陵，缺的那位救了大明却被当叛徒"
  - 例："当了41年皇帝却被骂两千年，真实的历史可能完全相反"
- gongzhonghao（精品长文型，2个）：信息密度高，适合收藏转发
  - 例："327年、5次流放、17年逃亡——他赢了所有人，却输给了自己"

返回纯JSON，不要markdown代码块：
{"headlines":{"toutiao":[],"opinion":[],"clickbait":[],"gongzhonghao":[]}}`,
      },
      { role: "user", content: `历史事件：${title}\n\n史料：${text}` },
    ],
    temperature: 1.1,
    max_tokens: 1500,
  });
  try {
    const raw = completion.choices[0]?.message?.content || "";
    const json = raw.replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, "").trim();
    return JSON.parse(json).headlines;
  } catch {
    return { toutiao: [], gongzhonghao: [], clickbait: [], opinion: [] };
  }
}

// ── 去重检查 ──

async function checkHistoryDedup(articles) {
  if (articles.length <= 1) return { unique: articles, duplicates: [] };

  const unique = [];
  const duplicates = [];

  for (let i = 0; i < articles.length; i++) {
    let isDup = false;
    for (let j = 0; j < unique.length; j++) {
      try {
        const result = await compareHistoryPair(articles[i], unique[j]);
        if (result.tooSimilar) {
          duplicates.push({
            article: { title: articles[i].title, snippet: articles[i].content.slice(0, 200) },
            similarTo: { title: unique[j].title, snippet: unique[j].content.slice(0, 200) },
            confidence: result.confidence,
            reason: result.reason,
          });
          isDup = true;
          break;
        }
      } catch (e) {
        // 单次比较失败跳过
      }
    }
    if (!isDup) unique.push(articles[i]);
  }

  return { unique, duplicates };
}

async function compareHistoryPair(a1, a2) {
  const t1 = (a1.title || "").slice(0, 100);
  const t2 = (a2.title || "").slice(0, 100);
  const c1 = (a1.content || "").slice(0, 600);
  const c2 = (a2.content || "").slice(0, 600);

  const completion = await openai.chat.completions.create({
    model: process.env.CHAT_MODEL || "doubao-seed-2-0-lite-260215",
    messages: [
      {
        role: "system",
        content: `你是内容去重专家。判断两篇历史题材文章是否用了太相似的叙事结构、措辞或开头方式。

注意：讲不同历史事件不等于重复。只有叙事腔调、结构、用词高度雷同时才算重复。

返回纯JSON，不要markdown：
{"tooSimilar":true/false,"confidence":0-100,"reason":"简短说明相似点或差异点"}

阈值：confidence>=75 才标 tooSimilar:true`,
      },
      { role: "user", content: `文章A标题：${t1}\n文章A开头：${c1}\n\n文章B标题：${t2}\n文章B开头：${c2}` },
    ],
    temperature: 0.1,
    max_tokens: 300,
  });

  try {
    const raw = completion.choices[0]?.message?.content || "{}";
    const json = raw.replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, "").trim();
    const r = JSON.parse(json);
    return {
      tooSimilar: r.tooSimilar && (r.confidence || 0) >= 75,
      confidence: (r.confidence || 0) / 100,
      reason: r.reason || "",
    };
  } catch {
    return { tooSimilar: false, confidence: 0, reason: "" };
  }
}

module.exports = {
  HISTORY_SYSTEM,
  HISTORY_VERSIONS,
  rewriteHistory,
  generateHistoryHeadlines,
  checkHistoryDedup,
  fetchOnThisDay,
  fetchArticleSummary,
  fetchCategoryArticles,
  filterAncientEvents,
  CATEGORY_PAGES,
  loadHistoryFigures,
  getAllFigureTypes,
  getFiguresByType,
  buildFigureContent,
};
