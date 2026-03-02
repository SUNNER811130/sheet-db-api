// src/routes/line.js
const express = require("express");
const crypto = require("crypto");
const {
  parseBirthdayInput,
  calculateSevenNumbers,
  computeFlowNumFromBirthday,
} = require("../lib/talentCalc");
const { createPersonalAnalysisFlex } = require("../lib/flex/personalAnalysisFlex");

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
    .update(rawBody)
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

async function replyLine({ token, replyToken, text, messages }) {
  if (!replyToken) return;

  const outMessages =
    Array.isArray(messages) && messages.length
      ? messages
      : [{ type: "text", text: String(text || "") }];

  const r = await fetchWithTimeout(
    "https://api.line.me/v2/bot/message/reply",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        replyToken,
        messages: outMessages,
      }),
    },
    900
  );

  if (!r?.ok) {
    const e = new Error("reply_api_non_2xx");
    e.status = r?.status || 0;
    throw e;
  }
}

function safeStr(v, maxLen = 500) {
  const s = String(v ?? "");
  return s.length > maxLen ? `${s.slice(0, maxLen)}...` : s;
}

function pickLineEventPayload(ev) {
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

function isReplyModeOn() {
  return String(process.env.LINE_REPLY_MODE || "off").toLowerCase() === "on";
}

function shouldReplyToMessageKeyword(text) {
  const t = String(text || "").trim().toLowerCase();
  return ["menu", "任務選單", "help"].includes(t);
}

async function handleLineReply({
  db,
  accessToken,
  eventType,
  replyToken,
  text,
  messages,
  payload,
}) {
  if (!replyToken) return;

  if (!isReplyModeOn()) {
    await tryAppendEvent(db, {
      action: "line_reply_skipped",
      payload: { reason: "reply_mode_off", eventType, ...payload },
    });
    return;
  }

  if (!accessToken) {
    await tryAppendEvent(db, {
      action: "line_reply_error",
      payload: { reason: "missing_access_token", eventType, ...payload },
    });
    return;
  }

  try {
    await replyLine({ token: accessToken, replyToken, text, messages });
    await tryAppendEvent(db, {
      action: "line_reply_ok",
      payload: { eventType, ...payload },
    });
  } catch (err) {
    await tryAppendEvent(db, {
      action: "line_reply_error",
      payload: {
        reason: safeStr(err?.message || "reply_failed", 200),
        status: Number(err?.status || 0),
        eventType,
        ...payload,
      },
    });
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

    if (!verifyLineSignature({ channelSecret, rawBody, signature })) {
      await tryAppendEvent(db, {
        action: "line_event_error",
        payload: { reason: "invalid_signature" },
      });
      return res.status(401).send("Invalid signature");
    }

    const events = Array.isArray(req.body?.events) ? req.body.events : [];

    try {
      for (const ev of events) {
        const userId = ev?.source?.userId;
        if (!userId) continue;

        const type = String(ev?.type || "");
        if (!["follow", "message", "postback", "join"].includes(type)) continue;

        await tryAppendEvent(db, {
          action: "line_event",
          payload: pickLineEventPayload(ev),
        });

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

        const upsertPayload = { uid: userId, display_name: displayName };

        if (type === "follow") {
          await handleLineReply({
            db,
            accessToken,
            eventType: "follow",
            replyToken: ev.replyToken,
            text: "歡迎加入，輸入 menu 看功能",
            payload: { userId },
          });
        }

        if (type === "message" && ev?.message?.type === "text") {
          const messageText = String(ev?.message?.text || "");
          const birthday = parseBirthdayInput(messageText);

          // Birthday processing has higher priority than menu/help keywords.
          if (birthday.matched && !birthday.ok) {
            await tryAppendEvent(db, {
              action: "line_birthday_invalid",
              payload: {
                userId,
                input: messageText.trim(),
                reason: birthday.reason || "invalid_date",
              },
            });

            await handleLineReply({
              db,
              accessToken,
              eventType: "birthday_invalid",
              replyToken: ev.replyToken,
              text: "生日格式請用 YYYY-MM-DD，並確認日期合法",
              payload: { userId, input: messageText.trim() },
            });
            continue;
          }

          if (birthday.ok) {
            const seven = calculateSevenNumbers(birthday.birthday);
            const flow = computeFlowNumFromBirthday(birthday.birthday);

            await db.upsertMember({
              ...upsertPayload,
              birthday: birthday.birthday,
              flow,
            });

            await tryAppendEvent(db, {
              action: "line_birthday_calc_ok",
              payload: {
                birthday: birthday.birthday,
                n7: seven.n7,
                n1: seven.n1,
                n4: seven.n4,
                flow,
              },
            });

            const flexMessage = createPersonalAnalysisFlex({
              displayName: displayName || userId,
              birthday: birthday.birthday,
              n7: seven.n7,
              n1: seven.n1,
              n4: seven.n4,
              flow,
              retestMessage: "重新輸入生日",
            });

            await handleLineReply({
              db,
              accessToken,
              eventType: "birthday_calc",
              replyToken: ev.replyToken,
              messages: [flexMessage],
              payload: { userId, birthday: birthday.birthday, n7: seven.n7, n1: seven.n1, n4: seven.n4, flow },
            });
            continue;
          }

          await db.upsertMember(upsertPayload);

          if (!shouldReplyToMessageKeyword(messageText)) continue;

          await handleLineReply({
            db,
            accessToken,
            eventType: "message",
            replyToken: ev.replyToken,
            text: "任務選單：1. 輸入生日（YYYY-MM-DD）",
            payload: { userId, keyword: messageText.trim() },
          });
          continue;
        }

        await db.upsertMember(upsertPayload);
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

      return res.status(200).send("OK");
    }
  });

  return router;
}

module.exports = { createLineRouter };
