const { AI_PREMIUM_THEME, px, makeActionBoxButton } = require("./theme.aiPremium");

function createPersonalAnalysisFlex({
  userId,
  birthday,
  n7,
  n1,
  n4,
  flow,
  retestMessage = "我要重新輸入生日",
}) {
  const uid = String(userId || "").trim();

  const postback = (tag) => {
    const base = `PERSONAL_${tag}_`;
    return {
      type: "postback",
      label: "查看",
      data: uid ? `${base}${uid}` : `${base}UNKNOWN`,
    };
  };

  const card = ({ title, emoji, desc, tag }) => ({
    type: "bubble",
    size: "kilo",
    styles: {
      body: { backgroundColor: AI_PREMIUM_THEME.SURFACE },
      footer: { backgroundColor: AI_PREMIUM_THEME.SURFACE_2 },
    },
    body: {
      type: "box",
      layout: "vertical",
      spacing: "sm",
      paddingAll: px(16),
      backgroundColor: AI_PREMIUM_THEME.SURFACE,
      borderColor: AI_PREMIUM_THEME.BORDER,
      borderWidth: px(1),
      cornerRadius: px(16),
      contents: [
        {
          type: "text",
          text: `${emoji || ""}${title}`,
          weight: "bold",
          size: "xl",
          wrap: true,
          color: AI_PREMIUM_THEME.TEXT,
          align: "center",
        },
        {
          type: "text",
          text: String(desc || ""),
          size: "sm",
          wrap: true,
          color: AI_PREMIUM_THEME.MUTED,
          align: "center",
        },
      ],
    },
    footer: {
      type: "box",
      layout: "vertical",
      spacing: "sm",
      backgroundColor: AI_PREMIUM_THEME.SURFACE_2,
      contents: [
        { type: "separator", color: AI_PREMIUM_THEME.ACCENT },
        makeActionBoxButton({ label: "查看", action: postback(tag), variant: "primary" }),
      ],
    },
  });

  return {
    type: "flex",
    altText: "個人解析入口",
    contents: {
      type: "carousel",
      contents: [
        {
          type: "bubble",
          size: "kilo",
          styles: {
            body: { backgroundColor: AI_PREMIUM_THEME.SURFACE },
            footer: { backgroundColor: AI_PREMIUM_THEME.SURFACE_2 },
          },
          body: {
            type: "box",
            layout: "vertical",
            spacing: "sm",
            paddingAll: px(16),
            backgroundColor: AI_PREMIUM_THEME.SURFACE,
            borderColor: AI_PREMIUM_THEME.BORDER,
            borderWidth: px(1),
            cornerRadius: px(16),
            contents: [
              {
                type: "text",
                text: "解析完成",
                weight: "bold",
                size: "xl",
                color: AI_PREMIUM_THEME.TEXT,
                align: "center",
              },
              {
                type: "text",
                text: `生日：${birthday}`,
                size: "sm",
                color: AI_PREMIUM_THEME.MUTED,
                align: "center",
                wrap: true,
              },
              { type: "separator", color: AI_PREMIUM_THEME.ACCENT },
              {
                type: "text",
                text: `主性格：${n7} 號`,
                size: "sm",
                color: AI_PREMIUM_THEME.MUTED,
                align: "center",
              },
              {
                type: "text",
                text: `破冰：${n1} 號`,
                size: "sm",
                color: AI_PREMIUM_THEME.MUTED,
                align: "center",
              },
              {
                type: "text",
                text: `交心：${n4} 號`,
                size: "sm",
                color: AI_PREMIUM_THEME.MUTED,
                align: "center",
              },
              {
                type: "text",
                text: `流年：${flow} 號`,
                size: "sm",
                color: AI_PREMIUM_THEME.MUTED,
                align: "center",
              },
            ],
          },
          footer: {
            type: "box",
            layout: "vertical",
            spacing: "sm",
            backgroundColor: AI_PREMIUM_THEME.SURFACE_2,
            contents: [
              { type: "separator", color: AI_PREMIUM_THEME.ACCENT },
              makeActionBoxButton({
                label: "再測一次",
                action: { type: "message", label: "再測一次", text: retestMessage },
              }),
              makeActionBoxButton({
                label: "回到選單",
                action: { type: "message", label: "回到選單", text: "menu" },
              }),
            ],
          },
        },
        card({
          title: "主性格",
          emoji: "核心 ",
          desc: "理解你的核心天賦與優勢模式。",
          tag: "main",
        }),
        card({
          title: "破冰",
          emoji: "互動 ",
          desc: "初次互動時最自然的開場風格。",
          tag: "ice",
        }),
        card({
          title: "交心",
          emoji: "關係 ",
          desc: "進入深度關係時的信任與連結節奏。",
          tag: "heart",
        }),
        card({
          title: "流年",
          emoji: "年度 ",
          desc: "本年度課題與行動焦點。",
          tag: "flow",
        }),
        card({
          title: "五行",
          emoji: "元素 ",
          desc: "從五行視角看你的能量分布。",
          tag: "element",
        }),
        card({
          title: "情緒",
          emoji: "情緒 ",
          desc: "辨識情緒慣性與調節建議。",
          tag: "emotion",
        }),
        card({
          title: "20年大運",
          emoji: "長程 ",
          desc: "20-80歲三階段的大運主題與策略。",
          tag: "luck20",
        }),
      ],
    },
  };
}

module.exports = { createPersonalAnalysisFlex };
