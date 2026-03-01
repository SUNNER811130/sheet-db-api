const express = require("express");
const { createMembersRouter } = require("./routes/members");

function apiKeyGuard(req, res, next) {
  const apiKey = process.env.API_KEY;
  if (!apiKey) return next(); // not enabled

  const got = req.header("x-api-key");
  if (got !== apiKey) {
    return res.status(401).json({ ok: false, error: "UNAUTHORIZED" });
  }
  next();
}

function createApp({ db }) {
  const app = express();
  app.use(express.json({ limit: "1mb" }));

  app.get("/health", (req, res) => res.json({ ok: true }));

  // ✅ only protect /members (keep /health public)
  app.use("/members", apiKeyGuard, createMembersRouter({ db }));

  return app;
}

module.exports = { createApp };