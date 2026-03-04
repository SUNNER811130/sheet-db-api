const {
  AI_TECH_THEME,
  makeButtonPrimary,
  makeButtonSecondary,
} = require("./theme.aiTech");

function createPersonalAnalysisFlex({
  userId,
  displayName,
  birthday,
  n7,
  n1,
  n4,
  flow,
  retestMessage = "重新輸入生日",
}) {
  const name = String(displayName || "朋友");
  const uid = String(userId || "").trim();

  const postback = (tag) => {
    // Keep GAS-compatible postback names so you can reuse old Flex payloads.
    // Example: PERSONAL_main_{uid}
    const base = `PERSONAL_${tag}_`;
    return {
      type: "postback",
      label: "查看",
      data: uid ? `${base}${uid}` : `${base}UNKNOWN`,
    };
  };

  const card = ({ title, emoji, desc, tag }) => ({
    type: "bubble",
    styles: {
      body: { backgroundColor: AI_TECH_THEME.SURFACE },
      footer: { backgroundColor: AI_TECH_THEME.SURFACE_2 },
    },
    body: {
      type: "box",
      layout: "vertical",
      spacing: "sm",
      paddingAll: "16px",
      backgroundColor: AI_TECH_THEME.SURFACE,
      borderColor: AI_TECH_THEME.BORDER,
      borderWidth: "1px",
      cornerRadius: "16px",
      contents: [
        {
          type: "text",
          text: `${emoji || ""}${title}`,
          weight: "bold",
          size: "xl",
          wrap: true,
          color: AI_TECH_THEME.TEXT,
        },
        {
          type: "text",
          text: String(desc || ""),
          size: "sm",
          wrap: true,
          color: AI_TECH_THEME.MUTED,
        },
      ],
    },
    footer: {
      type: "box",
      layout: "vertical",
      spacing: "sm",
      backgroundColor: AI_TECH_THEME.SURFACE_2,
      contents: [
        { type: "separator", color: AI_TECH_THEME.ACCENT },
        makeButtonPrimary(postback(tag)),
      ],
    },
  });

  return {
    type: "flex",
    altText: "個人解析",
    contents: {
      type: "carousel",
      contents: [
        {
          type: "bubble",
          styles: {
            body: { backgroundColor: AI_TECH_THEME.SURFACE },
            footer: { backgroundColor: AI_TECH_THEME.SURFACE_2 },
          },
          body: {
            type: "box",
            layout: "vertical",
            spacing: "sm",
            paddingAll: "16px",
            backgroundColor: AI_TECH_THEME.SURFACE,
            borderColor: AI_TECH_THEME.BORDER,
            borderWidth: "1px",
            cornerRadius: "16px",
            contents: [
              { type: "text", text: "解析完成", weight: "bold", size: "xl", color: AI_TECH_THEME.TEXT },
              { type: "text", text: `姓名：${name}`, size: "sm", wrap: true, color: AI_TECH_THEME.MUTED },
              { type: "text", text: `生日：${birthday}`, size: "sm", color: AI_TECH_THEME.MUTED },
              { type: "separator", color: AI_TECH_THEME.ACCENT },
              { type: "text", text: `主性格：${n7} 號`, size: "sm", color: AI_TECH_THEME.MUTED },
              { type: "text", text: `破冰：${n1} 號`, size: "sm", color: AI_TECH_THEME.MUTED },
              { type: "text", text: `交心：${n4} 號`, size: "sm", color: AI_TECH_THEME.MUTED },
              { type: "text", text: `流年：${flow} 號`, size: "sm", color: AI_TECH_THEME.MUTED },
            ],
          },
          footer: {
            type: "box",
            layout: "vertical",
            spacing: "sm",
            backgroundColor: AI_TECH_THEME.SURFACE_2,
            contents: [
              { type: "separator", color: AI_TECH_THEME.ACCENT },
              makeButtonSecondary({ type: "message", label: "再測一次", text: retestMessage }),
              makeButtonSecondary({ type: "message", label: "任務選單", text: "menu" }),
            ],
          },
        },

        card({
          title: "主性格",
          emoji: "🧩 ",
          desc: "本質核心、溫柔提醒、愛情／工作／財富建議",
          tag: "main",
        }),
        card({
          title: "破冰",
          emoji: "🧊 ",
          desc: "你在初識時最在意什麼？怎麼跟你聊會更舒服？",
          tag: "ice",
        }),
        card({
          title: "交心",
          emoji: "💗 ",
          desc: "你真正想被理解的地方，深聊的關鍵",
          tag: "heart",
        }),
        card({
          title: "流年",
          emoji: "🗓️ ",
          desc: "今年的運勢主軸：建議／職場／感情／財富",
          tag: "flow",
        }),
        card({
          title: "五行",
          emoji: "🌿 ",
          desc: "你的能量屬性與相處建議",
          tag: "element",
        }),
        card({
          title: "情緒",
          emoji: "🎭 ",
          desc: "情緒觸發點、情緒彰顯、常見場景與溫柔提醒",
          tag: "emotion",
        }),
        card({
          title: "20年大運",
          emoji: "🧧 ",
          desc: "三段人生大運主軸與提醒（20–40／40–60／60+）",
          tag: "luck20",
        }),
      ],
    },
  };
}

module.exports = { createPersonalAnalysisFlex };
