// src/app.js
const express = require("express");

const { createMembersRouter } = require("./routes/members");
const { createLineRouter } = require("./routes/line");
const { createQuizRouter } = require("./routes/quiz");

function createApp({ db }) {
  const app = express();

  app.use(express.json({ limit: "1mb" }));

  // Public
  app.get("/health", (req, res) => res.json({ ok: true }));

  // Protected routes (each router can enforce its own middleware)
  app.use("/members", createMembersRouter({ db }));
  app.use("/line", createLineRouter({ db }));
  app.use("/quiz", createQuizRouter({ db }));

  return app;
}

module.exports = { createApp };