// src/app.js
const express = require("express");

const { createMembersRouter } = require("./routes/members");
const { createLineRouter } = require("./routes/line");
const { createQuizRouter } = require("./routes/quiz");

function createApp({ db }) {
  const app = express();

  // ✅ 1) LINE webhook：先用 raw 取得原始 bytes（驗簽要用）
  app.use("/line/webhook", express.raw({ type: "*/*" }));

  // ✅ 2) LINE webhook：把 raw bytes 存到 req.rawBody，再手動 JSON.parse 成 req.body
  app.use("/line/webhook", (req, res, next) => {
    try {
      req.rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.from("");
      const text = req.rawBody.toString("utf8");
      req.body = text ? JSON.parse(text) : {};
      next();
    } catch (_) {
      req.rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.from("");
      req.body = {};
      next();
    }
  });

  // ✅ 3) 其他路由：正常 JSON parser
  const jsonParser = express.json({ limit: "1mb" });
  app.use((req, res, next) => {
    // LINE webhook 已經自己 parse 過，這裡跳過避免重複解析
    if (req.originalUrl && req.originalUrl.startsWith("/line/webhook")) return next();
    return jsonParser(req, res, next);
  });

  // Public
  app.get("/health", (req, res) => res.json({ ok: true }));

  // Routes
  app.use("/members", createMembersRouter({ db }));
  app.use("/line", createLineRouter({ db }));
  app.use("/quiz", createQuizRouter({ db }));

  return app;
}

module.exports = { createApp };