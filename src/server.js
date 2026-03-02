// src/server.js
require("dotenv").config();

const express = require("express");
const { createApp } = require("./app");
const { SheetsDb } = require("./lib/sheetsDb");

const db = SheetsDb.fromEnv();
const app = createApp({ db });

// ✅ 1) 先捕捉 raw body（只針對 LINE webhook）
app.use("/line/webhook", express.raw({ type: "*/*" }));

// ✅ 2) 再把 raw body 解析成 JSON（但只針對 /line/webhook）
app.use("/line/webhook", (req, res, next) => {
  try {
    req.rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.from("");
    const text = req.rawBody.toString("utf8");
    req.body = text ? JSON.parse(text) : {};
    next();
  } catch (e) {
    req.rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.from("");
    req.body = {};
    next();
  }
});

// ✅ 3) 其他路由正常使用 json parser
app.use(express.json({ limit: "1mb" }));

const port = Number(process.env.PORT || 3000);
app.listen(port, () => {
  console.log(`[sheet-db-api] listening on :${port}`);
});