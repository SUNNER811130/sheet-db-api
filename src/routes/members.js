const express = require("express");

function readApiKeyFromHeader(req) {
  const direct = String(req.headers["x-api-key"] || "").trim();
  if (direct) return direct;

  const auth = String(req.headers.authorization || "").trim();
  const m = auth.match(/^Bearer\s+(.+)$/i);
  if (!m) return "";
  return String(m[1] || "").trim();
}

function requireApiKeyIfConfigured(req, res, next) {
  const expected = String(process.env.API_KEY || "").trim();
  if (!expected) return next();

  const got = readApiKeyFromHeader(req);
  if (!got || got !== expected) {
    return res.status(401).json({
      ok: false,
      error: "unauthorized",
      hint: "missing/invalid api key; expected header x-api-key or Authorization: Bearer <API_KEY>",
    });
  }
  return next();
}

function normalizeUpsertInput(body) {
  const payload = body || {};
  return {
    uid: payload.uid,
    display_name: payload.display_name ?? payload.displayName,
    level: payload.level,
    expire_at: payload.expire_at ?? payload.expireAt,
    birthday: payload.birthday,
    flow: payload.flow,
  };
}

function createMembersRouter({ db }) {
  const router = express.Router();

  // If API_KEY is configured, protect /members endpoints
  router.use(requireApiKeyIfConfigured);

  router.post("/upsert", async (req, res) => {
    try {
      const input = normalizeUpsertInput(req.body);
      const member = await db.upsertMember(input);
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
