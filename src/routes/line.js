// src/routes/line.js
const express = require("express");
const crypto = require("crypto");
const {
  parseBirthdayInput,
  calculateSevenNumbers,
  calculateSixteenNumbers,
  calculateUnionCodes16Map,
  computeFlowNumFromBirthday,
} = require("../lib/talentCalc");
const { createPersonalAnalysisFlex } = require("../lib/flex/personalAnalysisFlex");
const { createBirthdayInputPrompt } = require("../lib/flex/birthdayInputPrompt");
const { createSectionFlex } = require("../lib/flex/contentSectionFlex");

// Content sheet defaults (can override by env)
const SHEET_MAIN_PAID = process.env.SHEET_MAIN_PAID || "主性格付費表單";
const SHEET_ICE_HEART = process.env.SHEET_ICE_HEART || "破冰與交心內容表單";
const SHEET_FLOW = process.env.SHEET_FLOW || "流年內容表單";
const SHEET_WUXING = process.env.SHEET_WUXING || "五行內容表單";
const SHEET_EMOTION = process.env.SHEET_EMOTION || "情緒內容表單";
const SHEET_LUCK20 = process.env.SHEET_LUCK20 || "20年大運表單";

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
    let responseBody = "";
    try {
      const contentType = String(r?.headers?.get?.("content-type") || "").toLowerCase();
      if (contentType.includes("application/json")) {
        const j = await r.json();
        responseBody = JSON.stringify(j);
      } else {
        responseBody = await r.text();
      }
    } catch (_) {
      responseBody = "";
    }
    const e = new Error("reply_api_non_2xx");
    e.status = r?.status || 0;
    e.body = safeStr(responseBody || "", 800);
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
  return ["menu", "任務選單", "help", "個人解析", "重新輸入生日"].includes(t);
}

function isPersonalAnalysisKeyword(text) {
  const t = String(text || "").trim().toLowerCase();
  return ["menu", "任務選單", "個人解析", "重新輸入生日"].includes(t);
}

function parsePostbackData(data) {
  const d = String(data || "").trim();
  if (!d) return { ok: false };

  // GAS-compatible postback patterns
  // PERSONAL_main_{uid}
  const m = d.match(/^PERSONAL_(main|ice|heart|flow|element|emotion|luck20)_(.+)$/);
  if (m) return { ok: true, kind: "personal", tab: m[1], uid: m[2] };

  // Birthday quick picker (GAS style)
  if (d.includes("action=birthday_quick")) return { ok: true, kind: "birthday_quick" };

  return { ok: false };
}

async function getRowByKey(db, { sheetName, keyHeader, key }) {
  if (!db?.getByUid) throw new Error("db_missing_getByUid");
  return await db.getByUid({ sheetName, uid: String(key), uidHeader: keyHeader });
}

async function getMemberForPersonal(db, userId) {
  if (db?.getMember) return await db.getMember(userId);
  // best-effort: roster-only impl
  if (db?.getMemberFromRoster) return await db.getMemberFromRoster(userId);
  return null;
}

function buildNotReadyMessage() {
  return [{ type: "text", text: "我還沒拿到你的生日～請先輸入生日（YYYY-MM-DD）" }];
}

async function buildPersonalModuleMessages({ db, userId, tab }) {
  const member = await getMemberForPersonal(db, userId);
  const birthday = String(member?.birthday || "").trim();
  if (!birthday) return buildNotReadyMessage();

  const seven = calculateSevenNumbers(birthday);
  const flow = computeFlowNumFromBirthday(birthday);

  if (tab === "main") {
    const row = await getRowByKey(db, { sheetName: SHEET_MAIN_PAID, keyHeader: "主數", key: seven.n7 });
    if (!row) return [{ type: "text", text: "查無主性格內容（請確認表單資料）" }];
    const { messages } = createSectionFlex({
      title: `主性格 ${seven.n7} 號`,
      subtitle: `生日：${birthday}`,
      sections: [
        { heading: "主數內容", text: row["主數內容"] || "" },
        { heading: "溫柔提醒", text: row["溫柔提醒"] || "" },
        { heading: "戀愛建議", text: row["戀愛建議"] || "" },
        { heading: "工作建議", text: row["工作建議"] || "" },
        { heading: "財富建議", text: row["財富建議"] || "" },
      ],
    });
    return messages;
  }

  if (tab === "ice") {
    const row = await getRowByKey(db, { sheetName: SHEET_ICE_HEART, keyHeader: "數字", key: seven.n1 });
    if (!row) return [{ type: "text", text: "查無破冰內容（請確認表單資料）" }];
    const { messages } = createSectionFlex({
      title: `破冰 ${seven.n1} 號`,
      subtitle: `生日：${birthday}`,
      sections: [{ heading: "破冰內容", text: row["破冰內容"] || "" }],
    });
    return messages;
  }

  if (tab === "heart") {
    const row = await getRowByKey(db, { sheetName: SHEET_ICE_HEART, keyHeader: "數字", key: seven.n4 });
    if (!row) return [{ type: "text", text: "查無交心內容（請確認表單資料）" }];
    const { messages } = createSectionFlex({
      title: `交心 ${seven.n4} 號`,
      subtitle: `生日：${birthday}`,
      sections: [{ heading: "交心內容", text: row["交心內容"] || "" }],
    });
    return messages;
  }

  if (tab === "flow") {
    const row = await getRowByKey(db, { sheetName: SHEET_FLOW, keyHeader: "流年數", key: flow });
    if (!row) return [{ type: "text", text: "查無流年內容（請確認表單資料）" }];
    const { messages } = createSectionFlex({
      title: `流年 ${flow} 號`,
      subtitle: `生日：${birthday}`,
      sections: [
        { heading: "內容說明", text: row["內容說明"] || "" },
        { heading: "流年建議事項", text: row["流年建議事項"] || "" },
        { heading: "職場建議", text: row["職場建議"] || "" },
        { heading: "感情建議", text: row["感情建議"] || "" },
        { heading: "財富建議", text: row["財富建議"] || "" },
        { heading: "流年總覽", text: row["流年總覽"] || "" },
      ],
    });
    return messages;
  }

  if (tab === "element") {
    const row = await getRowByKey(db, { sheetName: SHEET_WUXING, keyHeader: "數字", key: seven.n7 });
    if (!row) return [{ type: "text", text: "查無五行內容（請確認表單資料）" }];
    const wuxing = row["五行"] || "";
    const { messages } = createSectionFlex({
      title: `五行 ${seven.n7} 號`,
      subtitle: wuxing ? `屬性：${wuxing}` : `生日：${birthday}`,
      sections: [
        { heading: "五行內容", text: row["五行內容"] || "" },
        { heading: "工作建議", text: row["工作建議"] || "" },
        { heading: "溫柔提醒", text: row["溫柔提醒"] || "" },
      ],
    });
    return messages;
  }

  if (tab === "emotion") {
    const row = await getRowByKey(db, { sheetName: SHEET_EMOTION, keyHeader: "數字", key: seven.n7 });
    if (!row) return [{ type: "text", text: "查無情緒內容（請確認表單資料）" }];
    const { messages } = createSectionFlex({
      title: `情緒 ${seven.n7} 號`,
      subtitle: `生日：${birthday}`,
      sections: [
        { heading: "情緒觸發點", text: row["情緒觸發點"] || "" },
        { heading: "情緒彰顯", text: row["情緒彰顯"] || "" },
        { heading: "典型場景表現", text: row["典型場景表現"] || "" },
        { heading: "溫柔提醒", text: row["溫柔提醒"] || "" },
      ],
    });
    return messages;
  }

  if (tab === "luck20") {
    const n16 = calculateSixteenNumbers(birthday);
    const union12 = calculateUnionCodes16Map(n16);
    const code6 = union12[5];
    const code9 = union12[8];
    const code12 = union12[11];

    const row6 = await getRowByKey(db, { sheetName: SHEET_LUCK20, keyHeader: "數字", key: code6 });
    const row9 = await getRowByKey(db, { sheetName: SHEET_LUCK20, keyHeader: "數字", key: code9 });
    const row12 = await getRowByKey(db, { sheetName: SHEET_LUCK20, keyHeader: "數字", key: code12 });
    if (!row6 || !row9 || !row12) {
      return [{ type: "text", text: "查無 20 年大運內容（請確認表單資料）" }];
    }

    const { messages } = createSectionFlex({
      title: `20 年大運`,
      subtitle: `生日：${birthday}`,
      sections: [
        {
          heading: "🏃 20～40歲運勢",
          text: `${row6["第一階段運勢說明"] || ""}\n\n${row6["第一階段運勢建議"] || ""}`.trim(),
        },
        {
          heading: "🧧 40～60歲運勢",
          text: `${row9["第二階段運勢說明"] || ""}\n\n${row9["第二階段運勢建議"] || ""}`.trim(),
        },
        {
          heading: "🗽 60歲以後運勢",
          text: `${row12["第三階段運勢說明"] || ""}\n\n${row12["第三階段運勢建議"] || ""}`.trim(),
        },
      ],
    });
    return messages;
  }

  return [{ type: "text", text: "未知的選單項目" }];
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
        errBody: safeStr(err?.body || "", 800),
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
              userId,
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

          // Personal analysis entry (menu / 個人解析)
          if (isPersonalAnalysisKeyword(messageText)) {
            const prompt = createBirthdayInputPrompt({ header: "🔮 個人解析｜請輸入生日" });
            await handleLineReply({
              db,
              accessToken,
              eventType: "personal_menu",
              replyToken: ev.replyToken,
              messages: [prompt],
              payload: { userId, keyword: messageText.trim() },
            });
            continue;
          }

          await handleLineReply({
            db,
            accessToken,
            eventType: "message",
            replyToken: ev.replyToken,
            text: "任務選單：輸入『個人解析』開始，或直接輸入生日（YYYY-MM-DD）",
            payload: { userId, keyword: messageText.trim() },
          });
          continue;
        }

        if (type === "postback") {
          await db.upsertMember(upsertPayload);

          const data = String(ev?.postback?.data || "");
          const params = ev?.postback?.params || {};
          const parsed = parsePostbackData(data);

          // 1) Quick birthday picker
          if (parsed.ok && parsed.kind === "birthday_quick" && params?.date) {
            const b = parseBirthdayInput(params.date);
            if (b.ok) {
              const seven = calculateSevenNumbers(b.birthday);
              const flow = computeFlowNumFromBirthday(b.birthday);
              await db.upsertMember({
                ...upsertPayload,
                birthday: b.birthday,
                flow,
              });

              await tryAppendEvent(db, {
                action: "line_birthday_calc_ok",
                payload: { birthday: b.birthday, n7: seven.n7, n1: seven.n1, n4: seven.n4, flow },
              });

              const flexMessage = createPersonalAnalysisFlex({
                userId,
                displayName: displayName || userId,
                birthday: b.birthday,
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
                payload: { userId, birthday: b.birthday, n7: seven.n7, n1: seven.n1, n4: seven.n4, flow },
              });
            }
            continue;
          }

          // 2) Personal analysis tabs
          if (parsed.ok && parsed.kind === "personal" && parsed.uid === userId) {
            try {
              const messages = await buildPersonalModuleMessages({ db, userId, tab: parsed.tab });
              await tryAppendEvent(db, {
                action: "line_personal_tab_ok",
                payload: { userId, tab: parsed.tab },
              });
              await handleLineReply({
                db,
                accessToken,
                eventType: "personal_tab",
                replyToken: ev.replyToken,
                messages,
                payload: { userId, tab: parsed.tab },
              });
            } catch (err) {
              await tryAppendEvent(db, {
                action: "line_personal_tab_error",
                payload: { userId, tab: parsed.tab, message: safeStr(err?.message || String(err), 300) },
              });
              await handleLineReply({
                db,
                accessToken,
                eventType: "personal_tab_error",
                replyToken: ev.replyToken,
                text: "讀取內容時發生錯誤，請稍後再試或重新輸入生日",
                payload: { userId, tab: parsed.tab },
              });
            }
            continue;
          }

          // ignore other postbacks
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
