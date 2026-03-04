const { createBirthdayInputPrompt } = require("../src/lib/flex/birthdayInputPrompt");

const PX_KEYS = new Set([
  "cornerRadius",
  "borderWidth",
  "paddingAll",
  "paddingTop",
  "paddingBottom",
  "paddingStart",
  "paddingEnd",
  "margin",
  "marginTop",
  "marginBottom",
  "marginStart",
  "marginEnd",
]);

function collectNonStringPxFields(node, path = "root", issues = []) {
  if (!node || typeof node !== "object") return issues;

  if (Array.isArray(node)) {
    for (let i = 0; i < node.length; i += 1) {
      collectNonStringPxFields(node[i], `${path}[${i}]`, issues);
    }
    return issues;
  }

  for (const [key, value] of Object.entries(node)) {
    const nextPath = `${path}.${key}`;
    if (PX_KEYS.has(key) && value !== undefined && value !== null && typeof value !== "string") {
      issues.push({ path: nextPath, type: typeof value });
    }
    collectNonStringPxFields(value, nextPath, issues);
  }

  return issues;
}

describe("flex px guard", () => {
  test("birthdayInputPrompt uses string values for px-like sizing fields", () => {
    const bubbleFlex = createBirthdayInputPrompt();
    const issues = collectNonStringPxFields(bubbleFlex);
    expect(issues).toEqual([]);
  });
});
