// src/lib/uidTable.js
function colToLetter(col) {
  let temp = col;
  let letter = "";
  while (temp > 0) {
    let rem = (temp - 1) % 26;
    letter = String.fromCharCode(65 + rem) + letter;
    temp = Math.floor((temp - 1) / 26);
  }
  return letter;
}

async function getHeaderRow(sheets, spreadsheetId, sheetName) {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${sheetName}!1:1`,
  });
  const headers = res.data.values?.[0] || [];
  if (!headers.length) throw new Error(`Sheet "${sheetName}" has no header row`);
  return headers;
}

async function findRowIndexByUid(sheets, spreadsheetId, sheetName, uidColLetter, uid) {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${sheetName}!${uidColLetter}2:${uidColLetter}`,
  });
  const colValues = res.data.values || [];
  for (let i = 0; i < colValues.length; i++) {
    const v = colValues[i]?.[0];
    if (v === uid) return i + 2; // row index in sheet
  }
  return null;
}

function rowToObject(headers, row) {
  const obj = {};
  for (let i = 0; i < headers.length; i++) obj[headers[i]] = row[i] ?? "";
  return obj;
}

function buildRow(headers, valuesByHeader, existingRow = []) {
  const row = [];
  for (let i = 0; i < headers.length; i++) {
    const h = headers[i];
    if (Object.prototype.hasOwnProperty.call(valuesByHeader, h)) row[i] = valuesByHeader[h];
    else row[i] = existingRow[i] ?? "";
  }
  return row;
}

function createUidTableOps({ sheets, spreadsheetId }) {
  async function getByUid({ sheetName, uid }) {
    const headers = await getHeaderRow(sheets, spreadsheetId, sheetName);
    const uidColIdx = headers.indexOf("UID");
    if (uidColIdx === -1) throw new Error(`Sheet "${sheetName}" missing header "UID"`);
    const uidColLetter = colToLetter(uidColIdx + 1);

    const rowIndex = await findRowIndexByUid(sheets, spreadsheetId, sheetName, uidColLetter, uid);
    if (!rowIndex) return null;

    const endLetter = colToLetter(headers.length);
    const rowRes = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${sheetName}!A${rowIndex}:${endLetter}${rowIndex}`,
    });
    const row = rowRes.data.values?.[0] || [];
    return rowToObject(headers, row);
  }

  async function upsertByUid({ sheetName, uid, valuesByHeader }) {
    const headers = await getHeaderRow(sheets, spreadsheetId, sheetName);
    const uidColIdx = headers.indexOf("UID");
    if (uidColIdx === -1) throw new Error(`Sheet "${sheetName}" missing header "UID"`);
    const uidColLetter = colToLetter(uidColIdx + 1);
    const endLetter = colToLetter(headers.length);

    const rowIndex = await findRowIndexByUid(sheets, spreadsheetId, sheetName, uidColLetter, uid);

    // Ensure UID always set
    const payload = { ...valuesByHeader, UID: uid };

    if (!rowIndex) {
      // append new row
      const newRow = buildRow(headers, payload);
      await sheets.spreadsheets.values.append({
        spreadsheetId,
        range: `${sheetName}!A1`,
        valueInputOption: "RAW",
        insertDataOption: "INSERT_ROWS",
        requestBody: { values: [newRow] },
      });
      return;
    }

    // update existing row (preserve other columns)
    const existingRes = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${sheetName}!A${rowIndex}:${endLetter}${rowIndex}`,
    });
    const existingRow = existingRes.data.values?.[0] || [];
    const mergedRow = buildRow(headers, payload, existingRow);

    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${sheetName}!A${rowIndex}:${endLetter}${rowIndex}`,
      valueInputOption: "RAW",
      requestBody: { values: [mergedRow] },
    });
  }

  return { getByUid, upsertByUid };
}

module.exports = { createUidTableOps };