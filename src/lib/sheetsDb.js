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

function pickFirst(obj, keys, fallback = "") {
  for (const k of keys) {
    const v = obj?.[k];
    if (v == null) continue;
    const s = String(v).trim();
    if (s !== "") return v;
  }
  return fallback;
}

function normalizeMember(obj, source) {
  if (!obj) return null;
  const uid = String(pickFirst(obj, ["uid", "UID", "userId", "user_id"]) || "").trim();
  if (!uid) return null;

  const display_name = String(
    pickFirst(obj, ["display_name", "displayName", "LINE名稱", "line_name"]) || ""
  );
  const level = String(pickFirst(obj, ["level", "會員等級", "membership_level"], "free") || "free");

  const expire_at = String(
    pickFirst(obj, ["expire_at", "權限到期時間", "到期日", "expireAt", "expires_at"]) || ""
  );
  const created_at = String(
    pickFirst(obj, ["created_at", "created_at (ISO)", "createdAt", "建立時間"]) || ""
  );
  const updated_at = String(
    pickFirst(obj, ["updated_at", "updated_at (ISO)", "updatedAt", "更新時間"]) || ""
  );
  const birthday = String(pickFirst(obj, ["birthday", "生日A", "生日", "生日B"]) || "");
  const flow = pickFirst(obj, ["flow", "流年"], "");

  return {
    uid,
    display_name,
    level,
    expire_at,
    created_at,
    updated_at,
    birthday,
    flow,
    _source: source,
  };
}

class SheetsDb {
  constructor({ spreadsheetId, membersTab, memberRosterSheet, dualWriteMembers = false }) {
    this.spreadsheetId = spreadsheetId;
    this.membersTab = membersTab;
    this.memberRosterSheet = memberRosterSheet;
    this.dualWriteMembers = Boolean(dualWriteMembers);
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
    this._rowCache = new Map();
    this._rowCacheTtlMs = 5 * 60 * 1000;
  }

  _makeRowCacheKey({ sheetName, uidHeader, uid }) {
    return `${sheetName}::${uidHeader}::${uid}`;
  }

  _shouldUseRowCache(sheetName) {
    if (!sheetName) return false;
    if (sheetName === this.memberRosterSheet) return false;
    if (sheetName === this.membersTab) return false;
    return true;
  }

  _clearRowCacheForSheet(sheetName) {
    if (!sheetName) return;
    for (const key of this._rowCache.keys()) {
      if (key.startsWith(`${sheetName}::`)) this._rowCache.delete(key);
    }
  }

  static fromEnv() {
    const dualWriteMembers = String(process.env.DUAL_WRITE_MEMBERS || "off").toLowerCase() === "on";
    return new SheetsDb({
      spreadsheetId: mustEnv("SPREADSHEET_ID"),
      membersTab: process.env.SHEETS_MEMBERS_TAB || "members",
      memberRosterSheet: process.env.MEMBER_ROSTER_SHEET || "會員清單",
      dualWriteMembers,
    });
  }

  async sheets() {
    if (this._sheets) return this._sheets;
    this._sheets = await getSheetsClient();
    return this._sheets;
  }

  // -----------------------------
  // Members (legacy membersTab)
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

  async getMemberLegacy(uid) {
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

  async getMemberFromRoster(uid) {
    const u = String(uid || "").trim();
    if (!u) return null;

    const sheetName = this.memberRosterSheet || "會員清單";

    // Preferred path: use roster header map (uidHeader="uid") for cached lookups.
    try {
      const raw = await this.getByUid({ sheetName, uid: u, uidHeader: "uid" });
      if (raw) return normalizeMember(raw, "roster");
    } catch (_) {
      // fall back to fixed-column scan below
    }

    // Fallback path: scan B col and read row A:S (fixed columns).
    const sheets = await this.sheets();
    const uidColRes = await sheets.spreadsheets.values.get({
      spreadsheetId: this.spreadsheetId,
      range: `${sheetName}!B2:B`,
      majorDimension: "COLUMNS",
    });
    const uidCol = uidColRes.data.values?.[0] || [];
    let rowNum = null;
    uidCol.forEach((v, i) => {
      if (rowNum) return;
      if (String(v || "").trim() === u) rowNum = i + 2;
    });
    if (!rowNum) return null;

    const rowRes = await sheets.spreadsheets.values.get({
      spreadsheetId: this.spreadsheetId,
      range: `${sheetName}!A${rowNum}:S${rowNum}`,
    });
    const row = rowRes.data.values?.[0] || [];

    const obj = {
      expire_at: row[0] ?? "",
      uid: row[1] ?? "",
      display_name: row[2] ?? "",
      level: row[3] ?? "",
      birthday: row[4] ?? "",
      flow: row[7] ?? "",
      created_at: row[17] ?? "",
      updated_at: row[18] ?? "",
    };
    return normalizeMember(obj, "roster");
  }

  // Transition-safe read: roster first, fallback to legacy members tab
  async getMember(uid) {
    const roster = await this.getMemberFromRoster(uid);
    if (roster) return roster;

    const legacyRaw = await this.getMemberLegacy(uid);
    if (!legacyRaw) return null;

    return normalizeMember(legacyRaw, "members");
  }

  async upsertMember(input) {
    return this.upsertMemberToRoster(input);
  }

  async upsertMemberToRoster(input) {
    const uid = String(input?.uid || "").trim();
    if (!uid) throw new Error("uid is required");

    const rosterSheet = this.memberRosterSheet || "會員清單";
    const sheets = await this.sheets();
    let rowNum = null;
    try {
      const { map } = await this.getTableUidRowMap(rosterSheet, { uidHeader: "uid" });
      rowNum = map[uid] || null;
    } catch (_) {
      const uidColRes = await sheets.spreadsheets.values.get({
        spreadsheetId: this.spreadsheetId,
        range: `${rosterSheet}!B2:B`,
        majorDimension: "COLUMNS",
      });
      const uidCol = uidColRes.data.values?.[0] || [];
      uidCol.forEach((v, i) => {
        if (rowNum) return;
        if (String(v || "").trim() === uid) rowNum = i + 2;
      });
    }

    let existingRow = [];
    if (rowNum) {
      const rowRes = await sheets.spreadsheets.values.get({
        spreadsheetId: this.spreadsheetId,
        range: `${rosterSheet}!A${rowNum}:S${rowNum}`,
      });
      existingRow = rowRes.data.values?.[0] || [];
    }

    const existing = {
      expire_at: existingRow[0] ?? "",
      uid: existingRow[1] ?? "",
      display_name: existingRow[2] ?? "",
      level: existingRow[3] ?? "",
      birthday: existingRow[4] ?? "",
      flow: existingRow[7] ?? "",
      created_at: existingRow[17] ?? "",
      updated_at: existingRow[18] ?? "",
    };

    const merged = {
      uid,
      display_name: input?.display_name ?? existing?.display_name ?? "",
      level: input?.level ?? existing?.level ?? "free",
      expire_at: input?.expire_at ?? existing?.expire_at ?? "",
      birthday: input?.birthday ?? existing?.birthday ?? "",
      flow: input?.flow ?? existing?.flow ?? "",
      created_at: existing?.created_at || nowISO(),
      updated_at: nowISO(),
    };

    // roster A:S has 19 columns (A..S)
    const rowValues = Array.from({ length: 19 }, (_, i) => existingRow[i] ?? "");
    rowValues[0] = merged.expire_at; // A
    rowValues[1] = merged.uid; // B
    rowValues[2] = merged.display_name; // C
    rowValues[3] = merged.level; // D
    rowValues[4] = merged.birthday; // E
    rowValues[7] = merged.flow; // H
    rowValues[17] = merged.created_at; // R
    rowValues[18] = merged.updated_at; // S

    if (!rowNum) {
      await sheets.spreadsheets.values.append({
        spreadsheetId: this.spreadsheetId,
        range: `${rosterSheet}!A:S`,
        valueInputOption: "RAW",
        insertDataOption: "INSERT_ROWS",
        requestBody: { values: [rowValues] },
      });
    } else {
      await sheets.spreadsheets.values.update({
        spreadsheetId: this.spreadsheetId,
        range: `${rosterSheet}!A${rowNum}:S${rowNum}`,
        valueInputOption: "RAW",
        requestBody: { values: [rowValues] },
      });
    }

    // Invalidate roster uid-map cache (roster reads use getByUid -> uid map)
    delete this._tableUidMapCache[rosterSheet];
    delete this._tableUidMapAt[rosterSheet];
    this._clearRowCacheForSheet(rosterSheet);

    if (this.dualWriteMembers) {
      await this.upsertMemberLegacy(input);
    }

    return { ...merged, _op: rowNum ? "update" : "insert" };
  }

  async upsertMemberLegacy(input) {
    const uid = String(input?.uid || "").trim();
    if (!uid) throw new Error("uid is required");

    const { header } = await this.getHeader();
    const headerLen = header.length;
    const endCol = colToLetter(headerLen);

    const { map } = await this.getUidRowMap();
    const rowNum = map[uid];

    const existing = rowNum ? await this.getMemberLegacy(uid) : null;

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
    const useRowCache = this._shouldUseRowCache(sheetName);
    const cacheKey = this._makeRowCacheKey({ sheetName, uidHeader, uid: u });
    if (useRowCache) {
      const cached = this._rowCache.get(cacheKey);
      if (cached && Date.now() - cached.at < this._rowCacheTtlMs) return cached.value;
      if (cached) this._rowCache.delete(cacheKey);
    }

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
    if (useRowCache) this._rowCache.set(cacheKey, { at: Date.now(), value: obj });
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
      this._clearRowCacheForSheet(sheetName);
      return { ...merged, _op: "insert" };
    }

    await sheets.spreadsheets.values.update({
      spreadsheetId: this.spreadsheetId,
      range: `${sheetName}!A${rowNum}:${endCol}${rowNum}`,
      valueInputOption: "RAW",
      requestBody: { values: [rowValues] },
    });

    delete this._tableUidMapCache[sheetName];
    this._clearRowCacheForSheet(sheetName);
    return { ...merged, _op: "update" };
  }

  // -----------------------------
  // Optional: events logging
  // Sheet columns expected: ts, source, action, payload_json
  // -----------------------------
  async appendEvent({ ts, source, action, payload, sheetName = "events" }) {
    const sheets = await this.sheets();

    // We don't require strict header alignment here; append as 4 cells.
    const row = [ts || nowISO(), String(source || ""), String(action || ""), JSON.stringify(payload ?? {})];

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
