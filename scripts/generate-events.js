// 批量生成历史上的今天事件
// 用法: node scripts/generate-events.js [月份]
// 例: node scripts/generate-events.js 5   → 只生成5月
//     node scripts/generate-events.js     → 生成所有月份

require("dotenv").config();
const OpenAI = require("openai");
const fs = require("fs");
const path = require("path");

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  baseURL: process.env.OPENAI_BASE_URL,
});

const MODEL = "doubao-seed-2-0-lite-260215";
const DATA_FILE = path.join(__dirname, "..", "data", "history-events.json");

function loadExisting() {
  try { return JSON.parse(fs.readFileSync(DATA_FILE, "utf8")); }
  catch { return []; }
}

function save(events) {
  // 按 month, day 排序
  events.sort((a, b) => a.month - b.month || a.day - b.day || a.year - b.year);
  fs.writeFileSync(DATA_FILE, JSON.stringify(events, null, 2), "utf8");
  console.log(`  已保存 ${events.length} 条事件`);
}

function isDuplicate(existing, evt) {
  return existing.some(e =>
    e.month === evt.month && e.day === evt.day &&
    (e.text === evt.text || e.year === evt.year)
  );
}

async function generateChunk(month, startDay, endDay) {
  const count = endDay - startDay + 1;
  console.log(`  生成 ${month}月${startDay}-${endDay}日（${count}天）...`);

  const prompt = `你是中国古代史学者。请为${month}月${startDay}日到${endDay}日提供历史事件。

## 要求
- 公元1500年以前，公元前用负数（-221=公元前221年）
- 优先中国史，每天至少1个中国史事件
- 不能是虚构/传说（不要女娲补天、牛郎织女之类）
- 事件描述15-25字
- summary 控制在60-100字

## 输出
纯JSON数组，不要markdown块：
[
  {"month":${month},"day":${startDay},"year":1206,"text":"铁木真被推举为成吉思汗","summary":"1206年春，蒙古各部落在斡难河源头召开忽里台大会，铁木真被推举为全蒙古大汗，尊号成吉思汗。蒙古帝国正式建立，一个将改写欧亚大陆的帝国崛起。"}
]

为${month}月${startDay}-${endDay}日，每天生成2-3个事件。`;

  const completion = await openai.chat.completions.create({
    model: MODEL,
    messages: [
      { role: "system", content: "你是严谨的中国古代史学者。只输出真实事件，年份准确。输出纯JSON数组。" },
      { role: "user", content: prompt },
    ],
    temperature: 0.6,
    max_tokens: 4000,
  });

  const raw = completion.choices[0]?.message?.content || "";
  const json = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();

  try {
    const events = JSON.parse(json);
    if (!Array.isArray(events)) throw new Error("返回不是数组");
    const valid = events.filter(e => e.month && e.day && e.year != null && e.text && e.summary);
    console.log(`    ✓ ${valid.length} 条`);
    return valid;
  } catch (e) {
    console.error(`    JSON 解析失败: ${e.message.slice(0, 60)}`);
    // 尝试修复截断的 JSON
    try {
      const lastBracket = json.lastIndexOf("}");
      const fixed = json.slice(0, lastBracket + 1) + "]";
      const events = JSON.parse(fixed);
      if (Array.isArray(events) && events.length > 0) {
        const valid = events.filter(e => e.month && e.day && e.year != null && e.text && e.summary);
        console.log(`    ✓ 修复后获得 ${valid.length} 条`);
        return valid;
      }
    } catch {}
    return [];
  }
}

async function main() {
  const argMonth = parseInt(process.argv[2]);
  const months = argMonth && argMonth >= 1 && argMonth <= 12
    ? [argMonth]
    : Array.from({ length: 12 }, (_, i) => i + 1);

  const existing = loadExisting();
  console.log(`已有 ${existing.length} 条本地事件`);

  for (const month of months) {
    const daysInMonth = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    const maxDays = daysInMonth[month - 1];
    console.log(`\n📅 ${month}月（${maxDays}天）`);

    let monthAdded = 0;

    // 按10天一批生成
    for (let startDay = 1; startDay <= maxDays; startDay += 10) {
      const endDay = Math.min(startDay + 9, maxDays);
      const newEvents = await generateChunk(month, startDay, endDay);

      for (const evt of newEvents) {
        if (!isDuplicate(existing, evt)) {
          existing.push(evt);
          monthAdded++;
        }
      }

      // 批次间短暂等待
      if (startDay + 10 <= maxDays) {
        console.log("    等待1秒...");
        await new Promise(r => setTimeout(r, 1000));
      }
    }

    save(existing);
    console.log(`  ✅ ${month}月 新增 ${monthAdded} 条（共 ${existing.length} 条）`);

    if (months.length > 1) {
      await new Promise(r => setTimeout(r, 2000));
    }
  }

  const final = loadExisting();
  const coverage = new Set(final.map(e => `${e.month}-${e.day}`));
  const withData = coverage.size;
  console.log(`\n🎉 完成！共 ${final.length} 条事件，覆盖 ${withData}/366 天（${(withData/366*100).toFixed(0)}%）`);

  // 列出覆盖最多的月份
  const byMonth = {};
  final.forEach(e => { const k = e.month; byMonth[k] = (byMonth[k]||0)+1; });
  console.log("各月事件数:", Object.entries(byMonth).sort((a,b)=>a[0]-b[0]).map(([m,c])=>`${m}月:${c}条`).join(", "));
}

main().catch(e => { console.error(e); process.exit(1); });
