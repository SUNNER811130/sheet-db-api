const express = require("express");
const request = require("supertest");
const { createMembersRouter } = require("../src/routes/members");

function createTestApp(db) {
  const app = express();
  app.use(express.json({ limit: "1mb" }));
  app.use("/members", createMembersRouter({ db }));
  return app;
}

describe("members routes", () => {
  const originalApiKey = process.env.API_KEY;

  afterEach(() => {
    process.env.API_KEY = originalApiKey;
    jest.clearAllMocks();
  });

  test("POST /members/upsert -> 401 without api key when API_KEY is configured", async () => {
    process.env.API_KEY = "test-key";
    const db = { upsertMember: jest.fn(), getMember: jest.fn() };
    const app = createTestApp(db);

    const res = await request(app).post("/members/upsert").send({
      uid: "U1",
      display_name: "Alice",
    });

    expect(res.status).toBe(401);
    expect(res.body.ok).toBe(false);
    expect(res.body.error).toBe("unauthorized");
    expect(res.body.hint).toMatch(/x-api-key/i);
    expect(res.body.hint).toMatch(/Authorization/i);
    expect(db.upsertMember).not.toHaveBeenCalled();
  });

  test("POST /members/upsert -> 200 with correct x-api-key", async () => {
    process.env.API_KEY = "test-key";
    const db = {
      upsertMember: jest.fn().mockImplementation(async (input) => ({ ...input, _op: "insert" })),
      getMember: jest.fn(),
    };
    const app = createTestApp(db);

    const res = await request(app).post("/members/upsert").set("x-api-key", "test-key").send({
      uid: "U2",
      display_name: "Bob",
      level: "vip",
      expire_at: "2030-01-01",
    });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(db.upsertMember).toHaveBeenCalledWith({
      uid: "U2",
      display_name: "Bob",
      level: "vip",
      expire_at: "2030-01-01",
      birthday: undefined,
      flow: undefined,
    });
  });

  test("POST /members/upsert supports camelCase body via Authorization: Bearer", async () => {
    process.env.API_KEY = "test-key";
    const db = {
      upsertMember: jest.fn().mockImplementation(async (input) => ({ ...input, _op: "insert" })),
      getMember: jest.fn(),
    };
    const app = createTestApp(db);

    const res = await request(app)
      .post("/members/upsert")
      .set("Authorization", "Bearer test-key")
      .send({
        uid: "U3",
        displayName: "Carol",
        level: "free",
        expireAt: "2031-02-02",
        birthday: "1990-01-24",
      });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(db.upsertMember).toHaveBeenCalledWith({
      uid: "U3",
      display_name: "Carol",
      level: "free",
      expire_at: "2031-02-02",
      birthday: "1990-01-24",
      flow: undefined,
    });
  });

  test("POST /members/upsert supports snake_case body", async () => {
    process.env.API_KEY = "test-key";
    const db = {
      upsertMember: jest.fn().mockImplementation(async (input) => ({ ...input, _op: "insert" })),
      getMember: jest.fn(),
    };
    const app = createTestApp(db);

    const res = await request(app).post("/members/upsert").set("x-api-key", "test-key").send({
      uid: "U4",
      display_name: "Dave",
      level: "pro",
      expire_at: "2032-03-03",
      birthday: "1989-12-31",
    });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(db.upsertMember).toHaveBeenCalledWith({
      uid: "U4",
      display_name: "Dave",
      level: "pro",
      expire_at: "2032-03-03",
      birthday: "1989-12-31",
      flow: undefined,
    });
  });
});
