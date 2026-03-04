const AI_PREMIUM_THEME = {
  BG: "#FFFFFF",
  SURFACE: "#FFFFFF",
  SURFACE_2: "#F5FAFF",
  BORDER: "#2E8BFF",
  ACCENT: "#2EDCFF",
  TEXT: "#0B1B2B",
  MUTED: "#4A647A",
  BTN_BG: "#FFFFFF",
  BTN_BORDER: "#2E8BFF",
  BTN_TEXT: "#0B1B2B",
  BADGE_BG: "#EAF6FF",
};

function px(n) {
  return `${Number(n)}px`;
}

function makeActionBoxButton({ label, action, variant = "secondary" }) {
  const isPrimary = String(variant) === "primary";
  return {
    type: "box",
    layout: "vertical",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: isPrimary ? AI_PREMIUM_THEME.ACCENT : AI_PREMIUM_THEME.BTN_BG,
    borderColor: AI_PREMIUM_THEME.BTN_BORDER,
    borderWidth: px(1),
    cornerRadius: px(14),
    paddingAll: px(14),
    action,
    contents: [
      {
        type: "text",
        text: String(label || "查看"),
        align: "center",
        color: AI_PREMIUM_THEME.BTN_TEXT,
        weight: "bold",
        wrap: true,
      },
    ],
  };
}

module.exports = {
  AI_PREMIUM_THEME,
  px,
  makeActionBoxButton,
};
