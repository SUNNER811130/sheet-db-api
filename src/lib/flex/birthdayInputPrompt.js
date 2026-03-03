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
  const softWait = "資料量較大，載入約 2–3 秒";
  const text = `${header}\n${softWait}\n（可手動輸入或快速選單）`;

  return {
    type: "template",
    altText: header,
    template: {
      type: "buttons",
      text: String(text || "").slice(0, 160),
      actions: [
        {
          type: "datetimepicker",
          label: "快速選單",
          data: "action=birthday_quick",
          mode: "date",
          initial,
          min,
          max,
        },
        {
          type: "message",
          label: "手動輸入生日",
          text: manualMsg,
        },
      ],
    },
  };
}

module.exports = { createBirthdayInputPrompt };
