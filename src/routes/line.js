// src/routes/line.js
const express = require("express");
const crypto = require("crypto");

// -------------------- helpers --------------------
function safeEqual(a, b) {
  const ba = Buffer.from(String(a || ""), "utf8");
  const bb = Buffer.from(String(b || ""), "utf8");
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

function verifyLineSignature({ channelSecret, rawBody, signature }) {
  const computed = crypto
    .createHmac("sha256", channelSecret)
    .update(rawBody) // 必須用 raw bytes
    .digest("base64");
  return safeEqual(signature, computed);
}

async function fetchWithTimeout(url, options, ms) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), ms);
  try {
    return await fetch(url, { ...options, signal: ac.signal });
  } finally {
    clearTimeout(t);
  }
}

async function getLineProfile({ token, userId }) {
  try {
    const r = await fetchWithTimeout(
      `https://api.line.me/v2/bot/profile/${encodeURIComponent(userId)}`,
      { headers: { Authorization: `Bearer ${token}` } },
      900
    );
    if (!r.ok) return { displayName: "", ok: false, status: r.status || 0 };
    const j = await r.json().catch(() => ({}));
    return { displayName: j.displayName || "", ok: true };
  } catch (err) {
    return { displayName: "", ok: false, status: 0, error: err };
  }
}

// 可選：回覆訊息（預設不使用，避免卡時間）
async function replyLine({ token, replyToken, text }) {
  if (!replyToken) return;
  await fetchWithTimeout(
    "https://api.line.me/v2/bot/message/reply",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        replyToken,
        messages: [{ type: "text", text }],
      }),
    },
    900
  ).catch(() => {});
}

function safeStr(v, maxLen = 500) {
  const s = String(v ?? "");
  return s.length > maxLen ? s.slice(0, maxLen) + "…" : s;
}

function pickLineEventPayload(ev) {
  // 只挑必要欄位，避免 events tab 爆肥
  const type = String(ev?.type || "");
  const userId = ev?.source?.userId || "";
  const timestamp = ev?.timestamp || "";
  const replyToken = ev?.replyToken || "";

  const messageType = ev?.message?.type || "";
  const messageId = ev?.message?.id || "";
  const text =
    typeof ev?.message?.text === "string" ? safeStr(ev.message.text, 200) : "";

  const postbackData =
    typeof ev?.postback?.data === "string" ? safeStr(ev.postback.data, 300) : "";

  return {
    type,
    userId,
    timestamp,
    replyToken: safeStr(replyToken, 80),
    messageType,
    messageId,
    text,
    postbackData,
  };
}

async function tryAppendEvent(db, { action, payload }) {
  try {
    if (!db?.appendEvent) return;
    await db.appendEvent({
      ts: new Date().toISOString(),
      source: "line",
      action,
      payload,
    });
  } catch (_) {
    // ignore
  }
}

// -------------------- router --------------------
function createLineRouter({ db }) {
  const router = express.Router();

  router.post("/webhook", async (req, res) => {
    const channelSecret = process.env.LINE_CHANNEL_SECRET || "";
    const accessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN || "";
    const signature = req.get("x-line-signature") || "";
    const rawBody = req.rawBody || Buffer.from("");

    // basic guard
    if (!channelSecret || !signature || !rawBody.length) {
      await tryAppendEvent(db, {
        action: "line_event_error",
        payload: {
          reason: "missing_signature_prerequisites",
          hasSecret: !!channelSecret,
          hasSignature: !!signature,
          rawLen: rawBody.length || 0,
        },
      });
      return res.status(401).send("Missing signature prerequisites");
    }

    // signature verify
    if (!verifyLineSignature({ channelSecret, rawBody, signature })) {
      await tryAppendEvent(db, {
        action: "line_event_error",
        payload: { reason: "invalid_signature" },
      });
      return res.status(401).send("Invalid signature");
    }

    const events = Array.isArray(req.body?.events) ? req.body.events : [];

    // 盡量在 2 秒內處理完再回 200（LINE guideline）
    try {
      for (const ev of events) {
        const userId = ev?.source?.userId;
        if (!userId) continue;

        const type = String(ev?.type || "");
        if (!["follow", "message", "postback", "join"].includes(type)) continue;

        // 先記錄收到事件（可觀測性）
        await tryAppendEvent(db, {
          action: "line_event",
          payload: pickLineEventPayload(ev),
        });

        // 取 displayName（可失敗，不影響主流程）
        let displayName = "";
        if (accessToken) {
          const prof = await getLineProfile({ token: accessToken, userId });
          displayName = prof.displayName || "";
          if (prof.ok === false) {
            await tryAppendEvent(db, {
              action: "line_event_error",
              payload: {
                reason: "profile_fetch_failed",
                userId,
                status: prof.status || 0,
                message: safeStr(prof.error?.message || "", 300),
              },
            });
          }
        }

        // 寫入 members
        await db.upsertMember({ uid: userId, display_name: displayName });

        // ✅ 可選：只在 follow 回覆（若你想要）
        // if (type === "follow" && accessToken) {
        //   await replyLine({
        //     token: accessToken,
        //     replyToken: ev.replyToken,
        //     text: "歡迎加入！已建立會員資料 ✅",
        //   });
        // }
      }

      return res.status(200).send("OK");
    } catch (err) {
      console.error("LINE webhook processing error:", err);

      await tryAppendEvent(db, {
        action: "line_event_error",
        payload: {
          reason: "handler_exception",
          message: safeStr(err?.message || String(err), 800),
        },
      });

      // 先回 200 避免 LINE 反覆重送把你打爆；之後你再加 Cloud Tasks 重試機制
      return res.status(200).send("OK");
    }
  });

  return router;
}

module.exports = { createLineRouter };
