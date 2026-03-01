const express = require("express");
const { createMembersRouter } = require("./routes/members");

function createApp({ db }) {
  const app = express();
  app.use(express.json({ limit: "1mb" }));

  app.use((req, res, next) => {
    const apiKey = process.env.API_KEY;
    if (!apiKey) return next(); // not enabled

    const got = req.header("x-api-key");
    if (got !== apiKey) {
      return res.status(401).json({ ok: false, error: "UNAUTHORIZED" });
    }
    next();
  });

  app.get("/health", (req, res) => res.json({ ok: true }));

  app.use("/members", createMembersRouter({ db }));

  return app;
}

module.exports = { createApp };