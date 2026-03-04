const { AI_PREMIUM_THEME, px, makeActionBoxButton } = require("./theme.aiPremium");

function todayISO() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function createBirthdayInputPrompt({
  header = "個人解析：請先輸入生日",
  manualMsg = "請輸入生日（格式：YYYY-MM-DD）",
  initial = "1990-01-01",
  min = "1920-01-01",
  max = todayISO(),
} = {}) {
  const altText = String(`${header}，請輸入生日`).slice(0, 400);

  return {
    type: "flex",
    altText,
    contents: {
      type: "bubble",
      styles: {
        body: { backgroundColor: AI_PREMIUM_THEME.SURFACE },
        footer: { backgroundColor: AI_PREMIUM_THEME.SURFACE_2 },
      },
      body: {
        type: "box",
        layout: "vertical",
        spacing: "md",
        paddingAll: px(16),
        backgroundColor: AI_PREMIUM_THEME.SURFACE,
        borderColor: AI_PREMIUM_THEME.BORDER,
        borderWidth: px(1),
        cornerRadius: px(16),
        contents: [
          {
            type: "text",
            text: String(header || "個人解析"),
            weight: "bold",
            size: "xl",
            align: "center",
            color: AI_PREMIUM_THEME.TEXT,
            wrap: true,
          },
          { type: "separator", color: AI_PREMIUM_THEME.ACCENT },
          {
            type: "box",
            layout: "vertical",
            spacing: "xs",
            paddingAll: px(12),
            backgroundColor: AI_PREMIUM_THEME.BADGE_BG,
            borderColor: AI_PREMIUM_THEME.ACCENT,
            borderWidth: px(1),
            cornerRadius: px(12),
            contents: [
              {
                type: "text",
                text: "輸入提示",
                weight: "bold",
                color: AI_PREMIUM_THEME.TEXT,
                size: "sm",
                align: "center",
              },
              {
                type: "text",
                text: "可用快速選單選生日",
                color: AI_PREMIUM_THEME.TEXT,
                size: "sm",
                align: "center",
                wrap: true,
              },
              {
                type: "text",
                text: "或手動輸入 YYYY-MM-DD",
                color: AI_PREMIUM_THEME.TEXT,
                size: "sm",
                align: "center",
                wrap: true,
              },
            ],
          },
          {
            type: "text",
            text: "完成後會顯示主性格、破冰、交心、流年等入口",
            size: "xs",
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
          makeActionBoxButton({
            label: "快速選單",
            action: {
              type: "datetimepicker",
              label: "快速選單",
              data: "action=birthday_quick",
              mode: "date",
              initial,
              min,
              max,
            },
            variant: "primary",
          }),
          makeActionBoxButton({
            label: "手動輸入生日",
            action: {
              type: "message",
              label: "手動輸入生日",
              text: manualMsg,
            },
          }),
        ],
      },
    },
  };
}

module.exports = { createBirthdayInputPrompt };
