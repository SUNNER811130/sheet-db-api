const AI_TECH_THEME = {
  BG: "#04101E",
  SURFACE: "#071A2C",
  SURFACE_2: "#061427",
  BORDER: "#2E8BFF",
  ACCENT: "#2EDCFF",
  TEXT: "#EAF6FF",
  MUTED: "#A7C4DD",
  BTN_PRIMARY: "#1E88FF",
  BTN_SECONDARY: "#0E2A44",
};

function makeButtonPrimary(action) {
  return {
    type: "button",
    style: "primary",
    color: AI_TECH_THEME.BTN_PRIMARY,
    action,
  };
}

function makeButtonSecondary(action) {
  return {
    type: "button",
    style: "primary",
    color: AI_TECH_THEME.BTN_SECONDARY,
    action,
  };
}

module.exports = {
  AI_TECH_THEME,
  makeButtonPrimary,
  makeButtonSecondary,
};
