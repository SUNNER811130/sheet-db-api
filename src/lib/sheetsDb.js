const { getSheetsClient } = require("./googleAuth");

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

    // members cache
    this._headerCache = null;
    this._headerAt = 0;
    this._uidMapCache = null;
    this._uidMapAt = 0;

    // generic uid-table caches: { [sheetName]: { header, idx } }
    this._tableHeaderCache = {};
    this._tableHeaderAt = {};
    // { [sheetName]: { map, headerLen } }
    this._tableUidMapCache = {};
    this._tableUidMapAt = {};
  }

  static fromEnv() {
    return new SheetsDb({
      spreadsheetId: mustEnv("SPREADSHEET_ID"),
      membersTab: mustEnv("SHEETS_MEMBERS_TAB"),
    });
  }

  async sheets() {
    if (this._sheets) return this._sheets;
    this._sheets = await getSheetsClient();
    return this._sheets;
  }

  // -----------------------------
  // Members (existing behavior)
  // -----------------------------
  async getHeader({ ttlMs = 5 * 60 * 1000 } = {}) {
    const now = Date.now();
    if (this._headerCache && now - this._headerAt < ttlMs) return this._headerCache;

    const sheets = await this.sheets();
    const range = `${this.membersTab}!1:1`;
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: this.spreadsheetId,
      range,
    });

    const header = res.data.values?.[0] || [];
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

    const colValues = res.data.values?.[0] || [];
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

    const row = res.data.values?.[0] || [];
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

  // -----------------------------
  // Generic UID table ops
  // For sheets with header "UID" (uppercase) by default
  // -----------------------------
  async getTableHeader(sheetName, { ttlMs = 5 * 60 * 1000 } = {}) {
    const now = Date.now();
    const cached = this._tableHeaderCache[sheetName];
    const at = this._tableHeaderAt[sheetName] || 0;
    if (cached && now - at < ttlMs) return cached;

    const sheets = await this.sheets();
    const range = `${sheetName}!1:1`;
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: this.spreadsheetId,
      range,
    });

    const header = res.data.values?.[0] || [];
    if (!header.length) throw new Error(`Sheet has no header row: ${sheetName}`);

    const idx = {};
    header.forEach((h, i) => (idx[String(h).trim()] = i));

    const payload = { header, idx };
    this._tableHeaderCache[sheetName] = payload;
    this._tableHeaderAt[sheetName] = now;
    return payload;
  }

  async getTableUidRowMap(sheetName, { uidHeader = "UID", ttlMs = 10 * 1000 } = {}) {
    const now = Date.now();
    const cached = this._tableUidMapCache[sheetName];
    const at = this._tableUidMapAt[sheetName] || 0;
    if (cached && now - at < ttlMs) return cached;

    const { header, idx } = await this.getTableHeader(sheetName);
    const uidCol0 = idx[uidHeader];
    if (uidCol0 == null) throw new Error(`Header missing "${uidHeader}" in ${sheetName}`);

    const uidCol1 = uidCol0 + 1;
    const colLetter = colToLetter(uidCol1);

    const sheets = await this.sheets();
    const range = `${sheetName}!${colLetter}2:${colLetter}`;
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: this.spreadsheetId,
      range,
      majorDimension: "COLUMNS",
    });

    const colValues = res.data.values?.[0] || [];
    const map = {};
    colValues.forEach((v, i) => {
      const uid = String(v || "").trim();
      if (uid) map[uid] = i + 2;
    });

    const payload = { map, headerLen: header.length };
    this._tableUidMapCache[sheetName] = payload;
    this._tableUidMapAt[sheetName] = now;
    return payload;
  }

  async getByUid({ sheetName, uid, uidHeader = "UID" }) {
    const u = String(uid || "").trim();
    if (!u) return null;

    const { map, headerLen } = await this.getTableUidRowMap(sheetName, { uidHeader });
    const rowNum = map[u];
    if (!rowNum) return null;

    const sheets = await this.sheets();
    const endCol = colToLetter(headerLen);
    const range = `${sheetName}!A${rowNum}:${endCol}${rowNum}`;
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: this.spreadsheetId,
      range,
    });

    const row = res.data.values?.[0] || [];
    const { header } = await this.getTableHeader(sheetName);

    const obj = {};
    header.forEach((h, i) => {
      obj[String(h).trim()] = row[i] ?? "";
    });
    return obj;
  }

  async upsertByUid({ sheetName, uid, valuesByHeader, uidHeader = "UID" }) {
    const u = String(uid || "").trim();
    if (!u) throw new Error("uid is required");

    const { header } = await this.getTableHeader(sheetName);
    const headerLen = header.length;
    const endCol = colToLetter(headerLen);

    const { map } = await this.getTableUidRowMap(sheetName, { uidHeader });
    const rowNum = map[u];

    // Existing row (for merge)
    const existing = rowNum ? await this.getByUid({ sheetName, uid: u, uidHeader }) : null;

    // Ensure UID column is always set
    const merged = { ...(existing || {}), ...(valuesByHeader || {}) };
    merged[uidHeader] = u;

    const rowValues = header.map((h) => merged[String(h).trim()] ?? "");

    const sheets = await this.sheets();

    if (!rowNum) {
      await sheets.spreadsheets.values.append({
        spreadsheetId: this.spreadsheetId,
        range: `${sheetName}!A:${endCol}`,
        valueInputOption: "RAW",
        insertDataOption: "INSERT_ROWS",
        requestBody: { values: [rowValues] },
      });

      // invalidate uid map for that sheet
      delete this._tableUidMapCache[sheetName];
      return { ...merged, _op: "insert" };
    }

    await sheets.spreadsheets.values.update({
      spreadsheetId: this.spreadsheetId,
      range: `${sheetName}!A${rowNum}:${endCol}${rowNum}`,
      valueInputOption: "RAW",
      requestBody: { values: [rowValues] },
    });

    delete this._tableUidMapCache[sheetName];
    return { ...merged, _op: "update" };
  }

  // -----------------------------
  // Optional: events logging
  // Sheet columns expected: ts, source, action, payload_json
  // -----------------------------
  async appendEvent({ ts, source, action, payload, sheetName = "events" }) {
    const sheets = await this.sheets();

    // We don't require strict header alignment here; append as 4 cells.
    const row = [
      ts || nowISO(),
      String(source || ""),
      String(action || ""),
      JSON.stringify(payload ?? {}),
    ];

    await sheets.spreadsheets.values.append({
      spreadsheetId: this.spreadsheetId,
      range: `${sheetName}!A:D`,
      valueInputOption: "RAW",
      insertDataOption: "INSERT_ROWS",
      requestBody: { values: [row] },
    });
  }
}

module.exports = { SheetsDb };