require("dotenv").config();

const { createApp } = require("./app");
const { SheetsDb } = require("./lib/sheetsDb");

async function main() {
  const port = Number(process.env.PORT || 3000);

  const db = SheetsDb.fromEnv();
  const app = createApp({ db });

  app.listen(port, () => console.log(`[sheet-db-api] listening on :${port}`));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});