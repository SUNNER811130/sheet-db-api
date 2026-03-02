// src/app.js
const express = require("express");

const { createMembersRouter } = require("./routes/members");
const { createLineRouter } = require("./routes/line");
const { createQuizRouter } = require("./routes/quiz");

function createApp({ db }) {
  const app = express();

  // ⚠️ 不在這裡用 express.json()（改到 server.js 統一處理 rawBody + json parser）

  app.get("/health", (req, res) => res.json({ ok: true }));

  app.use("/members", createMembersRouter({ db }));
  app.use("/line", createLineRouter({ db }));
  app.use("/quiz", createQuizRouter({ db }));

  return app;
}

module.exports = { createApp };