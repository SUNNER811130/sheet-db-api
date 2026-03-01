const express = require("express");
const { createMembersRouter } = require("./routes/members");

function createApp({ db }) {
  const app = express();
  app.use(express.json({ limit: "1mb" }));

  app.get("/health", (req, res) => res.json({ ok: true }));

  app.use("/members", createMembersRouter({ db }));

  return app;
}

module.exports = { createApp };