// src/app.js
const express = require("express");
const { createMembersRouter } = require("./routes/members");
const { createLineRouter } = require("./routes/line");

function createApp({ db }) {
  const app = express();

  // 保留 raw body 供 LINE 驗簽
  app.use(express.json({
    limit: "1mb",
    verify: (req, _res, buf) => { req.rawBody = buf; }
  }));

  app.get("/health", (req, res) => res.json({ ok: true }));

  app.use("/members", createMembersRouter({ db }));
  app.use("/line", createLineRouter({ db }));

  return app;
}

module.exports = { createApp };