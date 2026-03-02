function createPersonalAnalysisFlex({
  displayName,
  birthday,
  n7,
  n1,
  n4,
  flow,
  retestMessage = "重新輸入生日",
}) {
  const name = String(displayName || "朋友");

  return {
    type: "flex",
    altText: "個人解析",
    contents: {
      type: "bubble",
      body: {
        type: "box",
        layout: "vertical",
        spacing: "sm",
        contents: [
          { type: "text", text: "個人解析", weight: "bold", size: "xl" },
          { type: "text", text: `姓名：${name}`, size: "sm", wrap: true },
          { type: "text", text: `生日：${birthday}`, size: "sm" },
          { type: "text", text: `主性格 n7：${n7}`, size: "sm" },
          { type: "text", text: `破冰 n1：${n1}`, size: "sm" },
          { type: "text", text: `交心 n4：${n4}`, size: "sm" },
          { type: "text", text: `流年 flow：${flow}`, size: "sm" },
        ],
      },
      footer: {
        type: "box",
        layout: "vertical",
        spacing: "sm",
        contents: [
          {
            type: "button",
            style: "primary",
            action: { type: "message", label: "任務選單", text: "menu" },
          },
          {
            type: "button",
            style: "secondary",
            action: { type: "message", label: "再測一次", text: retestMessage },
          },
        ],
      },
    },
  };
}

module.exports = { createPersonalAnalysisFlex };
