// 公众号排版引擎 — Markdown → 公众号编辑器HTML，多套主题
// 输出直接粘贴到公众号后台即用

const THEMES = {
  clean: {
    name: "简约白",
    bg: "#ffffff",
    text: "#3d3d3d",
    textLight: "#888888",
    accent: "#6C5CE7",
    accentLight: "#f0eeff",
    titleColor: "#1a1a2e",
    h2Color: "#2d3436",
    h3Color: "#444",
    strongColor: "#2d3436",
    blockquoteBg: "#f8f9fa",
    blockquoteBorder: "#6C5CE7",
    highlightBg: "#f0eeff",
    highlightBorder: "#6C5CE7",
    dividerColor: "#e0e0e0",
    fontSize: "16px",
    lineHeight: "2",
    letterSpacing: "0.5px",
    paragraphMargin: "14px",
    h2FontSize: "20px",
    h3FontSize: "18px",
    imageRadius: "4px",
  },
  warm: {
    name: "暖色调",
    bg: "#fffdf7",
    text: "#4a3f35",
    textLight: "#9b8e82",
    accent: "#e8875b",
    accentLight: "#fef0e8",
    titleColor: "#3d2c1e",
    h2Color: "#5c3d2e",
    h3Color: "#6b4d3a",
    strongColor: "#3d2c1e",
    blockquoteBg: "#fdf6f0",
    blockquoteBorder: "#e8875b",
    highlightBg: "#fef0e8",
    highlightBorder: "#e8875b",
    dividerColor: "#e8d5c4",
    fontSize: "16px",
    lineHeight: "2",
    letterSpacing: "0.5px",
    paragraphMargin: "14px",
    h2FontSize: "20px",
    h3FontSize: "18px",
    imageRadius: "4px",
  },
  dark: {
    name: "暗夜黑",
    bg: "#1a1a24",
    text: "#d0d0d8",
    textLight: "#8888a0",
    accent: "#a29bfe",
    accentLight: "#1e1e38",
    titleColor: "#f0f0f8",
    h2Color: "#e0e0ec",
    h3Color: "#c8c8d8",
    strongColor: "#ffffff",
    blockquoteBg: "#222236",
    blockquoteBorder: "#6C5CE7",
    highlightBg: "#1e1e38",
    highlightBorder: "#a29bfe",
    dividerColor: "#333355",
    fontSize: "16px",
    lineHeight: "2.1",
    letterSpacing: "0.6px",
    paragraphMargin: "16px",
    h2FontSize: "20px",
    h3FontSize: "18px",
    imageRadius: "6px",
  },
  tech: {
    name: "科技蓝",
    bg: "#f6f8fb",
    text: "#2d3748",
    textLight: "#718096",
    accent: "#3182ce",
    accentLight: "#ebf4ff",
    titleColor: "#1a202c",
    h2Color: "#2d3748",
    h3Color: "#4a5568",
    strongColor: "#1a202c",
    blockquoteBg: "#edf2f7",
    blockquoteBorder: "#3182ce",
    highlightBg: "#ebf4ff",
    highlightBorder: "#3182ce",
    dividerColor: "#cbd5e0",
    fontSize: "15px",
    lineHeight: "1.9",
    letterSpacing: "0.4px",
    paragraphMargin: "12px",
    h2FontSize: "19px",
    h3FontSize: "17px",
    imageRadius: "4px",
  },
  literary: {
    name: "文艺风",
    bg: "#fdfcf9",
    text: "#4a4440",
    textLight: "#9b9590",
    accent: "#b8a088",
    accentLight: "#f5f0ea",
    titleColor: "#2d2822",
    h2Color: "#3d3832",
    h3Color: "#5c554a",
    strongColor: "#2d2822",
    blockquoteBg: "#f8f5f0",
    blockquoteBorder: "#b8a088",
    highlightBg: "#f5f0ea",
    highlightBorder: "#b8a088",
    dividerColor: "#d5cec4",
    fontSize: "16px",
    lineHeight: "2.1",
    letterSpacing: "0.6px",
    paragraphMargin: "16px",
    h2FontSize: "20px",
    h3FontSize: "18px",
    imageRadius: "3px",
  },
};

// 排版风格选项
const STYLES = {
  compact: { name: "紧凑", extraSpacing: false },
  comfortable: { name: "舒适", extraSpacing: true },
};

function formatArticle(md, options = {}) {
  const { themeKey = "clean", styleKey = "comfortable", title = "" } = options;
  const theme = THEMES[themeKey] || THEMES.clean;
  const style = STYLES[styleKey] || STYLES.comfortable;

  const lines = md.split("\n");
  const blocks = [];
  let i = 0;
  let firstH1 = null;

  while (i < lines.length) {
    const line = lines[i];

    // 空行跳过
    if (!line.trim()) { i++; continue; }

    // H1 — 作为文章大标题
    if (/^# (.+)$/.test(line)) {
      const text = line.replace(/^# /, "");
      if (!firstH1) firstH1 = text;
      blocks.push(renderTitle(text, theme));
      i++;
      continue;
    }

    // H2
    if (/^## (.+)$/.test(line)) {
      const text = line.replace(/^## /, "");
      blocks.push(renderH2(text, theme, style));
      i++;
      continue;
    }

    // H3
    if (/^### (.+)$/.test(line)) {
      const text = line.replace(/^### /, "");
      blocks.push(renderH3(text, theme));
      i++;
      continue;
    }

    // 分割线
    if (/^---$/.test(line.trim())) {
      blocks.push(renderDivider(theme));
      i++;
      continue;
    }

    // 引用块
    if (line.trim().startsWith("> ")) {
      const quoteLines = [];
      while (i < lines.length && lines[i].trim().startsWith("> ")) {
        quoteLines.push(lines[i].trim().replace(/^> ?/, ""));
        i++;
      }
      blocks.push(renderBlockquote(quoteLines.join("<br>"), theme));
      continue;
    }

    // 列表
    if (/^[\-\*]\s/.test(line.trim()) || /^\d+[\.\、]\s/.test(line.trim())) {
      const listItems = [];
      let isOrdered = /^\d+[\.\、]\s/.test(line.trim());
      while (i < lines.length && lines[i].trim()) {
        const item = lines[i].trim().replace(/^[\-\*]\s/, "").replace(/^\d+[\.\、]\s/, "");
        if (!item) { i++; continue; }
        listItems.push(item);
        i++;
        if (i < lines.length && !/^[\-\*]\s/.test(lines[i].trim()) && !/^\d+[\.\、]\s/.test(lines[i].trim())) break;
      }
      blocks.push(renderList(listItems, isOrdered, theme));
      continue;
    }

    // 高亮块（**包裹的整行）
    if (line.trim().startsWith("**") && line.trim().endsWith("**")) {
      const text = line.trim().replace(/^\*\*/, "").replace(/\*\*$/, "");
      blocks.push(renderHighlight(text, theme));
      i++;
      continue;
    }

    // 普通段落 — 合并连续的非空行
    const paraLines = [];
    while (i < lines.length && lines[i].trim() &&
           !/^#/.test(lines[i]) &&
           !/^---$/.test(lines[i].trim()) &&
           !lines[i].trim().startsWith("> ") &&
           !/^[\-\*]\s/.test(lines[i].trim()) &&
           !/^\d+[\.\、]\s/.test(lines[i].trim())) {
      paraLines.push(lines[i]);
      i++;
    }
    if (paraLines.length) {
      blocks.push(renderParagraph(paraLines.join("<br>"), theme, style));
    } else {
      i++; // 保底前进
    }
  }

  // 组装全文
  const bodyContent = blocks.join(style.extraSpacing ? "\n" : "");

  // 全文容器
  const wrapperStyle = [
    `background-color:${theme.bg}`,
    `padding:16px 0`,
    `max-width:100%`,
    `font-family:-apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei","Helvetica Neue",sans-serif`,
  ].join(";");

  return `<!-- 公众号排版 → 全选复制粘贴到公众号编辑器 -->
<section style="${wrapperStyle}">
${bodyContent}
</section>`;
}

// ── 渲染函数 ──

function renderTitle(text, t) {
  return `<h1 style="
font-size:22px;
font-weight:900;
color:${t.titleColor};
text-align:center;
line-height:1.4;
margin:24px 16px 20px;
letter-spacing:1px;
">${inlineFormat(text, t)}</h1>`;
}

function renderH2(text, t, style) {
  const topMargin = style.extraSpacing ? "36px" : "24px";
  return `<h2 style="
font-size:${t.h2FontSize};
font-weight:800;
color:${t.h2Color};
line-height:1.4;
margin:${topMargin} 16px 14px;
padding-left:14px;
border-left:4px solid ${t.accent};
">${inlineFormat(text, t)}</h2>`;
}

function renderH3(text, t) {
  return `<h3 style="
font-size:${t.h3FontSize};
font-weight:700;
color:${t.h3Color};
line-height:1.4;
margin:20px 16px 12px;
">${inlineFormat(text, t)}</h3>`;
}

function renderParagraph(html, t, style) {
  return `<p style="
font-size:${t.fontSize};
color:${t.text};
line-height:${t.lineHeight};
letter-spacing:${t.letterSpacing};
margin:0 16px ${t.paragraphMargin};
text-align:justify;
">${inlineFormat(html, t)}</p>`;
}

function renderBlockquote(text, t) {
  return `<blockquote style="
font-size:${t.fontSize};
color:${t.textLight};
line-height:1.9;
margin:16px 16px;
padding:14px 18px;
background:${t.blockquoteBg};
border-left:4px solid ${t.blockquoteBorder};
border-radius:0 6px 6px 0;
">${inlineFormat(text, t)}</blockquote>`;
}

function renderHighlight(text, t) {
  return `<section style="
margin:16px 16px;
padding:16px 20px;
background:${t.highlightBg};
border-left:4px solid ${t.highlightBorder};
border-radius:0 8px 8px 0;
font-size:${t.fontSize};
color:${t.text};
line-height:${t.lineHeight};
">${inlineFormat(text, t)}</section>`;
}

function renderDivider(t) {
  return `<hr style="
border:none;
height:1px;
background:${t.dividerColor};
margin:24px 32px;
" />`;
}

function renderList(items, ordered, t) {
  const tag = ordered ? "ol" : "ul";
  const itemsHtml = items.map(item =>
    `<li style="
font-size:${t.fontSize};
color:${t.text};
line-height:${t.lineHeight};
margin-bottom:8px;
padding-left:4px;
">${inlineFormat(item, t)}</li>`
  ).join("\n");

  return `<${tag} style="
margin:12px 16px 12px 36px;
padding:0;
">${itemsHtml}</${tag}>`;
}

// ── 行内格式化 ──
function inlineFormat(text, t) {
  return text
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    // 加粗
    .replace(/\*\*(.+?)\*\*/g,
      `<strong style="color:${t.strongColor};font-weight:700;">$1</strong>`)
    // 斜体
    .replace(/\*(.+?)\*/g,
      `<em style="color:${t.textLight};font-style:italic;">$1</em>`)
    // 行内代码
    .replace(/`(.+?)`/g,
      `<code style="background:${t.blockquoteBg};padding:2px 6px;border-radius:3px;font-size:0.9em;color:${t.accent};">$1</code>`);
}

module.exports = { formatArticle, THEMES };
