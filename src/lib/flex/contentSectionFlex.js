const { AI_TECH_THEME, makeButtonSecondary } = require("./theme.aiTech");

function splitByParagraph(text, maxLen) {
  const raw = String(text || "");
  if (raw.length <= maxLen) return [raw];

  const parts = raw.split(/\n{2,}/g);
  const chunks = [];
  let buf = "";
  for (const p of parts) {
    const para = p.trim();
    if (!para) continue;

    const candidate = buf ? `${buf}\n\n${para}` : para;
    if (candidate.length <= maxLen) {
      buf = candidate;
      continue;
    }

    if (buf) chunks.push(buf);
    if (para.length <= maxLen) {
      buf = para;
      continue;
    }

    // Hard split for extremely long paragraphs
    for (let i = 0; i < para.length; i += maxLen) {
      chunks.push(para.slice(i, i + maxLen));
    }
    buf = "";
  }
  if (buf) chunks.push(buf);
  return chunks.length ? chunks : [raw.slice(0, maxLen)];
}

function buildSection({ heading, text }) {
  const blocks = [];
  if (heading) {
    blocks.push({
      type: "text",
      text: String(heading),
      weight: "bold",
      size: "sm",
      wrap: true,
      color: AI_TECH_THEME.ACCENT,
    });
  }

  const chunks = splitByParagraph(text, 900);
  for (const c of chunks) {
    blocks.push({
      type: "text",
      text: String(c || ""),
      size: "sm",
      wrap: true,
      color: AI_TECH_THEME.MUTED,
    });
  }

  return {
    type: "box",
    layout: "vertical",
    spacing: "xs",
    contents: blocks,
  };
}

function createSectionFlex({
  title,
  subtitle,
  sections,
  backToMenuText = "menu",
} = {}) {
  const bodyContents = [
    {
      type: "text",
      text: String(title || ""),
      weight: "bold",
      size: "xl",
      wrap: true,
      color: AI_TECH_THEME.TEXT,
    },
  ];
  if (subtitle) {
    bodyContents.push({
      type: "text",
      text: String(subtitle),
      size: "sm",
      wrap: true,
      color: AI_TECH_THEME.MUTED,
    });
  }
  bodyContents.push({ type: "separator", color: AI_TECH_THEME.ACCENT });

  const secList = Array.isArray(sections) ? sections : [];
  for (let i = 0; i < secList.length; i++) {
    const s = secList[i] || {};
    bodyContents.push(buildSection({ heading: s.heading, text: s.text }));
    if (i !== secList.length - 1) bodyContents.push({ type: "separator", color: AI_TECH_THEME.ACCENT });
  }

  const flex = {
    type: "flex",
    altText: String(title || "內容"),
    contents: {
      type: "bubble",
      styles: {
        body: { backgroundColor: AI_TECH_THEME.SURFACE },
        footer: { backgroundColor: AI_TECH_THEME.SURFACE_2 },
      },
      body: {
        type: "box",
        layout: "vertical",
        spacing: "md",
        paddingAll: "16px",
        backgroundColor: AI_TECH_THEME.SURFACE,
        borderColor: AI_TECH_THEME.BORDER,
        borderWidth: "1px",
        cornerRadius: "16px",
        contents: bodyContents,
      },
      footer: {
        type: "box",
        layout: "vertical",
        spacing: "sm",
        backgroundColor: AI_TECH_THEME.SURFACE_2,
        contents: [
          { type: "separator", color: AI_TECH_THEME.ACCENT },
          makeButtonSecondary({ type: "message", label: "回到選單", text: backToMenuText }),
        ],
      },
    },
  };

  // If the flex payload is too large, fall back to plain text(s)
  const bytes = Buffer.byteLength(JSON.stringify(flex), "utf8");
  if (bytes <= 45000) return { ok: true, messages: [flex] };

  const textParts = [];
  if (title) textParts.push(`【${title}】`);
  if (subtitle) textParts.push(String(subtitle));
  for (const s of secList) {
    if (!s) continue;
    if (s.heading) textParts.push(`\n${s.heading}`);
    if (s.text) textParts.push(String(s.text));
  }
  const text = textParts.join("\n");
  const chunks = splitByParagraph(text, 4500);
  return {
    ok: false,
    messages: chunks.slice(0, 5).map((t) => ({ type: "text", text: t })),
  };
}

module.exports = { createSectionFlex };
