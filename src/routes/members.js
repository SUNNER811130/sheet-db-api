const express = require("express");

function createMembersRouter({ db }) {
  const router = express.Router();

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