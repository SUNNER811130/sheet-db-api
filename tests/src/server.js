// src/server.js
require("dotenv").config();

const { createApp } = require("./app");
const { SheetsDb } = require("./lib/sheetsDb");

const db = SheetsDb.fromEnv();
const app = createApp({ db });

const port = Number(process.env.PORT || 3000);
app.listen(port, () => {
  console.log(`[sheet-db-api] listening on :${port}`);
});