const express = require("express");
const request = require("supertest");
const { createDebugRouter } = require("../src/routes/debug");

function createTestApp(db) {
  const app = express();
  app.use(express.json({ limit: "1mb" }));
  app.use("/debug", createDebugRouter({ db }));
  return app;
}

describe("debug routes", () => {
  const oldEnv = process.env;

  beforeEach(() => {
    process.env = { ...oldEnv };
    delete process.env.API_KEY;
  });

  afterEach(() => {
    process.env = oldEnv;
    jest.clearAllMocks();
  });

  test("API_KEY not configured -> 500", async () => {
    const db = { getTableHeader: jest.fn() };
    const app = createTestApp(db);

    const res = await request(app).get("/debug/sheets/validate");

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ ok: false, error: "API_KEY not configured" });
  });

  test("API_KEY configured but missing auth header -> 401", async () => {
    process.env.API_KEY = "test-key";
    const db = { getTableHeader: jest.fn() };
    const app = createTestApp(db);

    const res = await request(app).get("/debug/sheets/validate");

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ ok: false, error: "unauthorized" });
  });

  test("validate: missing headers -> 200 ok=false", async () => {
    process.env.API_KEY = "test-key";

    const db = {
      getTableHeader: jest.fn(async () => ({ header: [], idx: {} })),
    };
    const app = createTestApp(db);

    const res = await request(app).get("/debug/sheets/validate").set("x-api-key", "test-key");

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(false);
    expect(res.body.error).toBe("schema_invalid");
    expect(Array.isArray(res.body.sheets)).toBe(true);
    expect(res.body.sheets.length).toBeGreaterThan(0);
    expect(res.body.sheets.some((item) => Array.isArray(item.missing) && item.missing.length > 0)).toBe(true);
  });

  test("validate: headers complete -> 200 ok=true", async () => {
    process.env.API_KEY = "test-key";

    const fullIdx = new Proxy(
      {},
      {
        get() {
          return 0;
        },
      }
    );

    const db = {
      getTableHeader: jest.fn(async () => ({ header: ["dummy"], idx: fullIdx })),
    };
    const app = createTestApp(db);

    const res = await request(app)
      .get("/debug/sheets/validate")
      .set("Authorization", "Bearer test-key");

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(Array.isArray(res.body.sheets)).toBe(true);
    expect(res.body.sheets.every((item) => item.missing.length === 0)).toBe(true);
  });

  test("ensure-events: first call creates sheet and writes header", async () => {
    process.env.API_KEY = "test-key";

    const state = { hasEvents: false };
    const spreadsheetsGet = jest.fn(async () => ({
      data: {
        sheets: state.hasEvents ? [{ properties: { title: "events" } }] : [],
      },
    }));
    const batchUpdate = jest.fn(async () => {
      state.hasEvents = true;
      return {};
    });
    const valuesUpdate = jest.fn(async () => ({}));

    const db = {
      spreadsheetId: "spreadsheet-123",
      sheets: jest.fn(async () => ({
        spreadsheets: {
          get: spreadsheetsGet,
          batchUpdate,
          values: { update: valuesUpdate },
        },
      })),
    };
    const app = createTestApp(db);

    const res = await request(app)
      .post("/debug/sheets/ensure-events")
      .set("x-api-key", "test-key")
      .send({});

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, created: true });
    expect(batchUpdate).toHaveBeenCalledTimes(1);
    expect(valuesUpdate).toHaveBeenCalledTimes(1);
    expect(valuesUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        spreadsheetId: "spreadsheet-123",
        range: "events!A1:D1",
      })
    );
  });

  test("ensure-events: second call is idempotent (created=false)", async () => {
    process.env.API_KEY = "test-key";

    const spreadsheetsGet = jest.fn(async () => ({
      data: {
        sheets: [{ properties: { title: "events" } }],
      },
    }));
    const batchUpdate = jest.fn(async () => ({}));
    const valuesUpdate = jest.fn(async () => ({}));

    const db = {
      spreadsheetId: "spreadsheet-123",
      sheets: jest.fn(async () => ({
        spreadsheets: {
          get: spreadsheetsGet,
          batchUpdate,
          values: { update: valuesUpdate },
        },
      })),
    };
    const app = createTestApp(db);

    const res = await request(app)
      .post("/debug/sheets/ensure-events")
      .set("x-api-key", "test-key")
      .send({});

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, created: false });
    expect(batchUpdate).not.toHaveBeenCalled();
    expect(valuesUpdate).not.toHaveBeenCalled();
  });
});
