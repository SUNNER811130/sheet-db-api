const express = require("express");

function requireApiKeyIfConfigured(req, res, next) {
  const expected = process.env.API_KEY;
  if (!expected) return next();
  const got = req.headers["x-api-key"];
  if (!got || got !== expected) {
    return res.status(401).json({ ok: false, error: "unauthorized" });
  }
  return next();
}

function createMembersRouter({ db }) {
  const router = express.Router();

  // If API_KEY is configured, protect /members endpoints
  router.use(requireApiKeyIfConfigured);

  router.post("/upsert", async (req, res) => {
    try {
      const { uid, display_name, level, expire_at } = req.body || {};
      const member = await db.upsertMember({ uid, display_name, level, expire_at });
      res.json({ ok: true, member });
    } catch (err) {
      res.status(400).json({ ok: false, error: err.message || String(err) });
    }
  });

  router.get("/:uid", async (req, res) => {
    try {
      const member = await db.getMember(req.params.uid);
      if (!member) return res.status(404).json({ ok: false, error: "NOT_FOUND" });
      res.json({ ok: true, member });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message || String(err) });
    }
  });

  return router;
}

module.exports = { createMembersRouter };