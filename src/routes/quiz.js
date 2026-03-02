// src/routes/quiz.js
const express = require("express");

/**
 * Expected db interface (minimum):
 *   db.upsertByUid({ sheetName, uid, valuesByHeader }) -> Promise<void>
 *   db.getByUid({ sheetName, uid }) -> Promise<object|null>
 *
 * Optional:
 *   db.appendEvent({ ts, source, action, payload }) -> Promise<void>
 */

const SHEET_CALC = "運算紀錄表";
const SHEET_UNION = "聯合碼紀錄表";

// -------------------- auth --------------------
function requireApiKey(req, res, next) {
  const expected = process.env.API_KEY;
  if (!expected) {
    return res.status(500).json({ ok: false, error: "API_KEY not configured" });
  }
  const got = req.headers["x-api-key"];
  if (!got || got !== expected) {
    return res.status(401).json({ ok: false, error: "unauthorized" });
  }
  next();
}

// -------------------- validators --------------------
function isValidBirthday(birthday) {
  if (typeof birthday !== "string") return false;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(birthday)) return false;

  const d = new Date(`${birthday}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return false;

  // strict check (avoid 2026-02-31 becoming Mar 3)
  const [y, m, day] = birthday.split("-").map((x) => Number(x));
  return (
    d.getUTCFullYear() === y &&
    d.getUTCMonth() + 1 === m &&
    d.getUTCDate() === day
  );
}

// -------------------- calc core (ported from GAS rules) --------------------
function compressNumber(num) {
  let n = Number(num);
  while (n > 9) {
    n = String(n)
      .split("")
      .reduce((sum, d) => sum + Number(d), 0);
  }
  return n;
}

function calculateSevenNumbers(birthday) {
  const [yStr, mStr, dStr] = birthday.split("-");
  const y = Number(yStr);
  const m = Number(mStr);
  const d = Number(dStr);

  const n1 = compressNumber(d);
  const n2 = compressNumber(m);
  const n3 = compressNumber(Number(yStr.slice(0, 2))); // 年份前兩碼

  let ySuffix = Number(yStr.slice(2)); // 年份後兩碼
  let n4Raw = ySuffix;
  if (ySuffix === 0) n4Raw = 5; // 00 -> 5 特例
  const n4 = compressNumber(n4Raw);

  const n5 = compressNumber(n1 + n2);
  const n6 = compressNumber(n3 + n4);
  const n7 = compressNumber(n5 + n6);

  return { n1, n2, n3, n4, n5, n6, n7 };
}

function calculateSixteenNumbers(birthday) {
  const base = calculateSevenNumbers(birthday);
  const { n1, n2, n3, n4, n5, n6, n7 } = base;

  const n8 = compressNumber(n1 + n5);
  const n9 = compressNumber(n2 + n5);
  const n10 = compressNumber(n8 + n9);
  const n11 = compressNumber(n6 + n7);
  const n12 = compressNumber(n5 + n7);
  const n13 = compressNumber(n11 + n12);
  const n14 = compressNumber(n3 + n6);
  const n15 = compressNumber(n4 + n6);
  const n16 = compressNumber(n14 + n15);

  return { ...base, n8, n9, n10, n11, n12, n13, n14, n15, n16 };
}

function calculateUnion12(sixteen) {
  const combos = [
    ["n1", "n2", "n5"], // 1
    ["n3", "n4", "n6"], // 2
    ["n5", "n6", "n7"], // 3
    ["n1", "n5", "n8"], // 4
    ["n2", "n5", "n9"], // 5
    ["n8", "n9", "n10"], // 6
    ["n6", "n7", "n11"], // 7
    ["n5", "n7", "n12"], // 8
    ["n11", "n12", "n13"], // 9
    ["n3", "n6", "n14"], // 10
    ["n4", "n6", "n15"], // 11
    ["n14", "n15", "n16"], // 12
  ];
  return combos.map(([a, b, c]) => `${sixteen[a]}${sixteen[b]}${sixteen[c]}`);
}

// -------------------- db adapters --------------------
async function dbUpsertByUid(db, { sheetName, uid, valuesByHeader }) {
  if (db?.upsertByUid) return db.upsertByUid({ sheetName, uid, valuesByHeader });
  if (db?.sheets?.upsertByUid)
    return db.sheets.upsertByUid({ sheetName, uid, valuesByHeader });

  throw new Error(
    `db missing upsertByUid. Need db.upsertByUid({ sheetName, uid, valuesByHeader }). sheetName=${sheetName}`
  );
}

async function dbGetByUid(db, { sheetName, uid }) {
  if (db?.getByUid) return db.getByUid({ sheetName, uid });
  if (db?.sheets?.getByUid) return db.sheets.getByUid({ sheetName, uid });

  throw new Error(
    `db missing getByUid. Need db.getByUid({ sheetName, uid }). sheetName=${sheetName}`
  );
}

async function tryAppendEvent(db, { source, action, payload }) {
  try {
    if (!db?.appendEvent) return;
    const ts = new Date().toISOString();
    await db.appendEvent({ ts, source, action, payload });
  } catch (_) {
    // ignore event logging errors (observability must not break main flow)
  }
}

// -------------------- router --------------------
function createQuizRouter({ db }) {
  const router = express.Router();

  // POST /quiz/calc
  router.post("/calc", requireApiKey, async (req, res) => {
    try {
      const { uid, birthday } = req.body || {};
      if (!uid || typeof uid !== "string") {
        return res.status(400).json({ ok: false, error: "uid_required" });
      }
      if (!isValidBirthday(birthday)) {
        return res.status(400).json({ ok: false, error: "birthday_invalid" });
      }

      const sixteen = calculateSixteenNumbers(birthday);
      const union12 = calculateUnion12(sixteen);

      // build rows by header (match your sheets exactly)
      const calcRow = { UID: uid };
      for (let i = 1; i <= 16; i++) calcRow[`n${i}`] = sixteen[`n${i}`];

      const unionRow = { UID: uid };
      for (let i = 1; i <= 12; i++) unionRow[`聯合碼${i}`] = union12[i - 1];

      await dbUpsertByUid(db, {
        sheetName: SHEET_CALC,
        uid,
        valuesByHeader: calcRow,
      });
      await dbUpsertByUid(db, {
        sheetName: SHEET_UNION,
        uid,
        valuesByHeader: unionRow,
      });

      await tryAppendEvent(db, {
        source: "api",
        action: "quiz_calc",
        payload: { uid, birthday },
      });

      return res.json({
        ok: true,
        uid,
        birthday,
        sixteen,
        union12,
      });
    } catch (err) {
      console.error("POST /quiz/calc failed:", err);
      return res.status(500).json({ 
        ok: false, 
        error: "internal_error",
        message: err?.message || String(err),
     });
    }
  });

  // GET /quiz/:uid
  router.get("/:uid", requireApiKey, async (req, res) => {
    try {
      const { uid } = req.params;
      if (!uid) return res.status(400).json({ ok: false, error: "uid_required" });

      const calc = await dbGetByUid(db, { sheetName: SHEET_CALC, uid });
      const union = await dbGetByUid(db, { sheetName: SHEET_UNION, uid });

      if (!calc && !union) {
        return res.status(404).json({ ok: false, error: "not_found" });
      }

      return res.json({
        ok: true,
        uid,
        calc: calc || null,
        union: union || null,
      });
    } catch (err) {
      console.error("GET /quiz/:uid failed:", err);
      return res.status(500).json({ ok: false, error: "internal_error" });
    }
  });

  return router;
}

module.exports = { createQuizRouter };