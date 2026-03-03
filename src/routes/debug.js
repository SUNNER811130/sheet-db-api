const express = require("express");

const EVENTS_SHEET = "events";
const EVENT_HEADERS = ["ts", "source", "action", "payload_json"];

const SHEET_SCHEMA_SPECS = [
  {
    envKey: "SHEET_MAIN_PAID",
    defaultSheetName: "主性格付費表單",
    keyHeader: "主數",
    requiredHeaders: ["主數內容", "溫柔提醒", "戀愛建議", "工作建議", "財富建議"],
  },
  {
    envKey: "SHEET_ICE_HEART",
    defaultSheetName: "破冰與交心內容表單",
    keyHeader: "數字",
    requiredHeaders: ["破冰內容", "交心內容"],
  },
  {
    envKey: "SHEET_FLOW",
    defaultSheetName: "流年內容表單",
    keyHeader: "流年數",
    requiredHeaders: ["內容說明", "流年建議事項", "職場建議", "感情建議", "財富建議", "流年總覽"],
  },
  {
    envKey: "SHEET_WUXING",
    defaultSheetName: "五行內容表單",
    keyHeader: "數字",
    requiredHeaders: ["五行", "五行內容", "工作建議", "溫柔提醒"],
  },
  {
    envKey: "SHEET_EMOTION",
    defaultSheetName: "情緒內容表單",
    keyHeader: "數字",
    requiredHeaders: ["情緒觸發點", "情緒彰顯", "典型場景表現", "溫柔提醒"],
  },
  {
    envKey: "SHEET_LUCK20",
    defaultSheetName: "20年大運表單",
    keyHeader: "數字",
    requiredHeaders: [
      "第一階段運勢說明",
      "第一階段運勢建議",
      "第二階段運勢說明",
      "第二階段運勢建議",
      "第三階段運勢說明",
      "第三階段運勢建議",
    ],
  },
];

function readApiKeyFromHeader(req) {
  const direct = String(req.headers["x-api-key"] || "").trim();
  if (direct) return direct;

  const auth = String(req.headers.authorization || "").trim();
  const m = auth.match(/^Bearer\s+(.+)$/i);
  if (!m) return "";
  return String(m[1] || "").trim();
}

function requireApiKey(req, res, next) {
  const expected = String(process.env.API_KEY || "").trim();
  if (!expected) {
    return res.status(500).json({ ok: false, error: "API_KEY not configured" });
  }

  const got = readApiKeyFromHeader(req);
  if (!got || got !== expected) {
    return res.status(401).json({ ok: false, error: "unauthorized" });
  }
  return next();
}

function sheetNameFromSpec(spec) {
  return String(process.env[spec.envKey] || spec.defaultSheetName).trim();
}

function eventSheetExists(sheets) {
  return sheets.some((item) => String(item?.properties?.title || "").trim() === EVENTS_SHEET);
}

function isAlreadyExistsSheetError(err) {
  const msg = String(err && (err.message || err)).toLowerCase();
  return msg.includes("already exists");
}

function toQuotedSheetName(sheetName) {
  return `'${String(sheetName || "").replace(/'/g, "''")}'`;
}

function buildHeaderPayload(header) {
  const idx = {};
  header.forEach((h, i) => {
    idx[String(h).trim()] = i;
  });
  return { header, idx };
}

async function readHeaderWithFallback(db, sheetName) {
  if (!db || typeof db.getTableHeader !== "function") {
    throw new Error("db.getTableHeader not available");
  }

  try {
    return await db.getTableHeader(sheetName);
  } catch (primaryErr) {
    if (!db.spreadsheetId || typeof db.sheets !== "function") {
      throw primaryErr;
    }

    const sheetsClient = await db.sheets();
    const res = await sheetsClient.spreadsheets.values.get({
      spreadsheetId: db.spreadsheetId,
      range: `${toQuotedSheetName(sheetName)}!1:1`,
    });

    const header = res?.data?.values?.[0] || [];
    if (!header.length) throw primaryErr;
    return buildHeaderPayload(header);
  }
}

function createDebugRouter({ db }) {
  const router = express.Router();
  router.use(requireApiKey);

  router.get("/sheets/validate", async (req, res) => {
    const sheets = [];

    for (const spec of SHEET_SCHEMA_SPECS) {
      const sheetName = sheetNameFromSpec(spec);
      const required = [spec.keyHeader, ...spec.requiredHeaders];
      const item = { envKey: spec.envKey, sheetName, required, missing: [] };

      try {
        const { idx = {} } = await readHeaderWithFallback(db, sheetName);
        item.missing = required.filter((header) => idx[header] == null);
      } catch (err) {
        item.missing = required.slice();
        item.error = err && err.message ? err.message : String(err);
      }

      sheets.push(item);
    }

    const ok = sheets.every((item) => item.missing.length === 0 && !item.error);
    if (ok) {
      return res.status(200).json({ ok: true, sheets });
    }

    return res.status(200).json({ ok: false, error: "schema_invalid", sheets });
  });

  router.post("/sheets/ensure-events", async (req, res) => {
    try {
      if (!db || typeof db.sheets !== "function" || !db.spreadsheetId) {
        throw new Error("db.sheets/spreadsheetId not available");
      }

      const sheetsClient = await db.sheets();
      const spreadsheetId = db.spreadsheetId;

      const readSheetList = async () => {
        const result = await sheetsClient.spreadsheets.get({
          spreadsheetId,
          fields: "sheets.properties.title",
        });
        return Array.isArray(result?.data?.sheets) ? result.data.sheets : [];
      };

      let currentSheets = await readSheetList();
      if (eventSheetExists(currentSheets)) {
        return res.status(200).json({ ok: true, created: false });
      }

      try {
        await sheetsClient.spreadsheets.batchUpdate({
          spreadsheetId,
          requestBody: {
            requests: [
              {
                addSheet: {
                  properties: { title: EVENTS_SHEET },
                },
              },
            ],
          },
        });
      } catch (err) {
        if (!isAlreadyExistsSheetError(err)) throw err;
      }

      currentSheets = await readSheetList();
      if (!eventSheetExists(currentSheets)) {
        throw new Error("failed to ensure events sheet");
      }

      await sheetsClient.spreadsheets.values.update({
        spreadsheetId,
        range: `${EVENTS_SHEET}!A1:D1`,
        valueInputOption: "RAW",
        requestBody: {
          values: [EVENT_HEADERS],
        },
      });

      return res.status(200).json({ ok: true, created: true });
    } catch (err) {
      return res.status(500).json({
        ok: false,
        error: "ensure_events_failed",
        message: err && err.message ? err.message : String(err),
      });
    }
  });

  return router;
}

module.exports = { createDebugRouter };
