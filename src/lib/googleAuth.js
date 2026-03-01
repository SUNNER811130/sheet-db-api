const { GoogleAuth } = require("google-auth-library");

const SHEETS_SCOPE = "https://www.googleapis.com/auth/spreadsheets";

function getGoogleAuth() {
  // Railway：用 base64 JSON
  const b64 = process.env.GOOGLE_SA_JSON_B64;
  if (b64) {
    const jsonStr = Buffer.from(b64, "base64").toString("utf8");
    const credentials = JSON.parse(jsonStr);
    return new GoogleAuth({ credentials, scopes: [SHEETS_SCOPE] });
  }

  // Local：讀 GOOGLE_APPLICATION_CREDENTIALS（你已設）
  return new GoogleAuth({ scopes: [SHEETS_SCOPE] });
}

module.exports = { getGoogleAuth };