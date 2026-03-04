const BORDER_WIDTH_PATTERN = /^(\d+px|none|light|normal|medium|semi-bold|bold)$/;
const CORNER_RADIUS_PATTERN = /^(\d+px|none|xs|sm|md|lg|xl|xxl)$/;
const SPACING_PATTERN = /^(\d+px|\d+%|none|xs|sm|md|lg|xl|xxl)$/;

const SPACING_KEYS = new Set([
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

function extractMessages(payload) {
  if (!payload) return [];
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload.messages)) return payload.messages;
  return [payload];
}

function validateStringField(node, key, path, errors) {
  const shouldValidate = key === "borderWidth" || key === "cornerRadius" || SPACING_KEYS.has(key);
  if (!shouldValidate) return;
  if (!Object.prototype.hasOwnProperty.call(node, key)) return;
  const value = node[key];
  const fieldPath = `${path}.${key}`;

  if (typeof value !== "string") {
    errors.push(`${fieldPath} must be a string`);
    return;
  }

  if (key === "borderWidth" && !BORDER_WIDTH_PATTERN.test(value)) {
    errors.push(`${fieldPath} has invalid value: ${value}`);
  }
  if (key === "cornerRadius" && !CORNER_RADIUS_PATTERN.test(value)) {
    errors.push(`${fieldPath} has invalid value: ${value}`);
  }
  if (SPACING_KEYS.has(key) && !SPACING_PATTERN.test(value)) {
    errors.push(`${fieldPath} has invalid value: ${value}`);
  }
}

function validateFlexMessage(msg) {
  const errors = [];

  if (!msg || typeof msg !== "object") {
    throw new Error("Flex message must be an object");
  }
  if (msg.type !== "flex") {
    throw new Error("$.type must be \"flex\"");
  }
  if (typeof msg.altText !== "string") {
    errors.push("$.altText must be a string");
  } else if (msg.altText.length > 400) {
    errors.push("$.altText must be <= 400 characters");
  }

  function walk(node, path) {
    if (!node || typeof node !== "object") return;

    if (Array.isArray(node)) {
      for (let i = 0; i < node.length; i += 1) {
        walk(node[i], `${path}[${i}]`);
      }
      return;
    }

    if (node.type === "box" && Object.prototype.hasOwnProperty.call(node, "separator")) {
      errors.push(`${path}.separator is not allowed on type:"box"`);
    }

    for (const key of Object.keys(node)) {
      validateStringField(node, key, path, errors);

      if (key === "separator") {
        const keyPath = `${path}.separator`;
        if (keyPath.includes(".footer.separator") && !keyPath.includes(".styles.footer.separator")) {
          errors.push(`${keyPath} is not allowed; use component {type:"separator"} or styles.footer.separator`);
        }
      }

      walk(node[key], `${path}.${key}`);
    }
  }

  walk(msg, "$");

  if (errors.length > 0) {
    throw new Error(errors.join("\n"));
  }
}

module.exports = { extractMessages, validateFlexMessage };
