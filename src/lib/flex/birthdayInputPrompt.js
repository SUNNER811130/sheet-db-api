const {
  AI_TECH_THEME,
  makeButtonPrimary,
  makeButtonSecondary,
} = require("./theme.aiTech");

function todayISO() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function createBirthdayInputPrompt({
  header = "請輸入生日",
  manualMsg = "請輸入生日（YYYY-MM-DD）",
  initial = "1990-01-01",
  min = "1920-01-01",
  max = todayISO(),
} = {}) {
  const altText = String(`${header}：可手動輸入或使用快速選單`).slice(0, 400);

  return {
    type: "flex",
    altText,
    contents: {
      type: "bubble",
      styles: {
        body: { backgroundColor: AI_TECH_THEME.SURFACE },
        footer: { backgroundColor: AI_TECH_THEME.SURFACE_2, separator: true },
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
        contents: [
          {
            type: "text",
            text: String(header || "請輸入生日"),
            weight: "bold",
            size: "xl",
            align: "center",
            color: AI_TECH_THEME.TEXT,
            wrap: true,
          },
          { type: "separator", color: AI_TECH_THEME.ACCENT },
          {
            type: "box",
            layout: "vertical",
            spacing: "xs",
            paddingAll: "12px",
            backgroundColor: AI_TECH_THEME.SURFACE_2,
            borderColor: AI_TECH_THEME.ACCENT,
            borderWidth: "1px",
            cornerRadius: "12px",
            contents: [
              { type: "text", text: "重要提醒", weight: "bold", color: AI_TECH_THEME.ACCENT, size: "sm" },
              { type: "text", text: "資料庫龐大", color: AI_TECH_THEME.TEXT, size: "sm" },
              { type: "text", text: "點按後請稍等幾秒", color: AI_TECH_THEME.TEXT, size: "sm" },
            ],
          },
          {
            type: "text",
            text: "（可手動輸入或使用快速選單）",
            size: "xs",
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
        separator: true,
        contents: [
          makeButtonPrimary({
            type: "datetimepicker",
            label: "快速選單",
            data: "action=birthday_quick",
            mode: "date",
            initial,
            min,
            max,
          }),
          makeButtonSecondary({
            type: "message",
            label: "手動輸入生日",
            text: manualMsg,
          }),
        ],
      },
    },
  };
}

module.exports = { createBirthdayInputPrompt };
