// src/lib/googleAuth.js
const { google } = require("googleapis");

/**
 * ✅ Scheme A (ADC / Application Default Credentials)
 *
 * - Local: uses GOOGLE_APPLICATION_CREDENTIALS if set (points to a SA JSON key)
 * - Cloud Run: uses the Cloud Run runtime Service Account automatically
 */
const SCOPES = ["https://www.googleapis.com/auth/spreadsheets"];

let _authClient = null;
let _sheetsClient = null;

async function getAuthClient() {
  if (_authClient) return _authClient;

  const auth = new google.auth.GoogleAuth({ scopes: SCOPES });
  _authClient = await auth.getClient();
  return _authClient;
}

async function getSheetsClient() {
  if (_sheetsClient) return _sheetsClient;

  const authClient = await getAuthClient();
  _sheetsClient = google.sheets({ version: "v4", auth: authClient });
  return _sheetsClient;
}

module.exports = { getAuthClient, getSheetsClient };