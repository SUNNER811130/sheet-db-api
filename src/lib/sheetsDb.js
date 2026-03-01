const { google } = require("googleapis");
const { getGoogleAuth } = require("./googleAuth");

function mustEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

function colToLetter(col1) {
  let n = col1;
  let s = "";
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

function nowISO() {
  return new Date().toISOString();
}

class SheetsDb {
  constructor({ spreadsheetId, membersTab }) {
    this.spreadsheetId = spreadsheetId;
    this.membersTab = membersTab;
    this._sheets = null;

    this._headerCache = null;
    this._headerAt = 0;
    this._uidMapCache = null;
    this._uidMapAt = 0;
  }

  static fromEnv() {
    return new SheetsDb({
      spreadsheetId: mustEnv("SPREADSHEET_ID"),
      membersTab: mustEnv("SHEETS_MEMBERS_TAB"),
    });
  }

  async sheets() {
    if (this._sheets) return this._sheets;
    const auth = getGoogleAuth();
    this._sheets = google.sheets({ version: "v4", auth });
    return this._sheets;
  }

  async getHeader({ ttlMs = 5 * 60 * 1000 } = {}) {
    const now = Date.now();
    if (this._headerCache && now - this._headerAt < ttlMs) return this._headerCache;

    const sheets = await this.sheets();
    const range = `${this.membersTab}!1:1`;
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: this.spreadsheetId,
      range,
    });

    const header = (res.data.values && res.data.values[0]) ? res.data.values[0] : [];
    if (!header.length) throw new Error(`Members sheet has no header row: ${this.membersTab}`);

    const idx = {};
    header.forEach((h, i) => (idx[String(h).trim()] = i));

    this._headerCache = { header, idx };
    this._headerAt = now;
    return this._headerCache;
  }

  async getUidRowMap({ ttlMs = 10 * 1000 } = {}) {
    const now = Date.now();
    if (this._uidMapCache && now - this._uidMapAt < ttlMs) return this._uidMapCache;

    const { header, idx } = await this.getHeader();
    const uidCol0 = idx["uid"];
    if (uidCol0 == null) throw new Error(`Header missing "uid" in ${this.membersTab}`);

    const uidCol1 = uidCol0 + 1;
    const colLetter = colToLetter(uidCol1);

    const sheets = await this.sheets();
    const range = `${this.membersTab}!${colLetter}2:${colLetter}`;
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: this.spreadsheetId,
      range,
      majorDimension: "COLUMNS",
    });

    const colValues = (res.data.values && res.data.values[0]) ? res.data.values[0] : [];
    const map = {};
    colValues.forEach((v, i) => {
      const uid = String(v || "").trim();
      if (uid) map[uid] = i + 2;
    });

    this._uidMapCache = { map, headerLen: header.length };
    this._uidMapAt = now;
    return this._uidMapCache;
  }

  async getMember(uid) {
    const u = String(uid || "").trim();
    if (!u) return null;

    const { map, headerLen } = await this.getUidRowMap();
    const rowNum = map[u];
    if (!rowNum) return null;

    const sheets = await this.sheets();
    const endCol = colToLetter(headerLen);
    const range = `${this.membersTab}!A${rowNum}:${endCol}${rowNum}`;
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: this.spreadsheetId,
      range,
    });

    const row = (res.data.values && res.data.values[0]) ? res.data.values[0] : [];
    const { header } = await this.getHeader();

    const obj = {};
    header.forEach((h, i) => {
      obj[String(h).trim()] = row[i] ?? "";
    });
    return obj;
  }

  async upsertMember(input) {
    const uid = String(input?.uid || "").trim();
    if (!uid) throw new Error("uid is required");

    const { header } = await this.getHeader();
    const headerLen = header.length;
    const endCol = colToLetter(headerLen);

    const { map } = await this.getUidRowMap();
    const rowNum = map[uid];

    const existing = rowNum ? await this.getMember(uid) : null;

    const merged = {
      uid,
      display_name: input.display_name ?? existing?.display_name ?? "",
      level: input.level ?? existing?.level ?? "free",
      expire_at: input.expire_at ?? existing?.expire_at ?? "",
      updated_at: nowISO(),
    };

    const rowValues = header.map((h) => merged[String(h).trim()] ?? "");

    const sheets = await this.sheets();

    if (!rowNum) {
      await sheets.spreadsheets.values.append({
        spreadsheetId: this.spreadsheetId,
        range: `${this.membersTab}!A:${endCol}`,
        valueInputOption: "RAW",
        insertDataOption: "INSERT_ROWS",
        requestBody: { values: [rowValues] },
      });
      this._uidMapCache = null;
      return { ...merged, _op: "insert" };
    }

    await sheets.spreadsheets.values.update({
      spreadsheetId: this.spreadsheetId,
      range: `${this.membersTab}!A${rowNum}:${endCol}${rowNum}`,
      valueInputOption: "RAW",
      requestBody: { values: [rowValues] },
    });

    this._uidMapCache = null;
    return { ...merged, _op: "update" };
  }
}

module.exports = { SheetsDb };