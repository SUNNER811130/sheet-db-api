// src/routes/line.js
const express = require("express");
const crypto = require("crypto");

function safeEqual(a, b) {
  const ba = Buffer.from(String(a || ""), "utf8");
  const bb = Buffer.from(String(b || ""), "utf8");
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

function verifyLineSignature({ channelSecret, rawBody, signature }) {
  const computed = crypto
    .createHmac("sha256", channelSecret)
    .update(rawBody)       // 必須用 raw bytes
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
  const r = await fetchWithTimeout(
    `https://api.line.me/v2/bot/profile/${encodeURIComponent(userId)}`,
    { headers: { Authorization: `Bearer ${token}` } },
    900
  );
  if (!r.ok) return { displayName: "" };
  const j = await r.json().catch(() => ({}));
  return { displayName: j.displayName || "" };
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

function createLineRouter({ db }) {
  const router = express.Router();

  router.post("/webhook", async (req, res) => {
    const channelSecret = process.env.LINE_CHANNEL_SECRET || "";
    const accessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN || "";
    const signature = req.get("x-line-signature") || "";
    const rawBody = req.rawBody || Buffer.from("");

    if (!channelSecret || !signature || !rawBody.length) {
      return res.status(401).send("Missing signature prerequisites");
    }
    if (!verifyLineSignature({ channelSecret, rawBody, signature })) {
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

        let displayName = "";
        if (accessToken) {
          const prof = await getLineProfile({ token: accessToken, userId });
          displayName = prof.displayName || "";
        }

        await db.upsertMember({ uid: userId, display_name: displayName });

        // ✅ 可選：只在 follow 回覆（若你想要）
        // if (type === "follow" && accessToken) {
        //   await replyLine({ token: accessToken, replyToken: ev.replyToken, text: "歡迎加入！已建立會員資料 ✅" });
        // }
      }

      return res.status(200).send("OK");
    } catch (err) {
      console.error("LINE webhook processing error:", err);
      // 先回 200 避免 LINE 反覆重送把你打爆；之後你再加 Cloud Tasks 重試機制
      return res.status(200).send("OK");
    }
  });

  return router;
}

module.exports = { createLineRouter };