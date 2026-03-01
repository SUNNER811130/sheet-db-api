const express = require("express");
const request = require("supertest");
const { createQuizRouter } = require("../src/routes/quiz");

function createInMemoryDb() {
  const store = new Map(); // sheetName -> Map(uid -> rowObj)
  const events = [];

  function sheetMap(sheetName) {
    if (!store.has(sheetName)) store.set(sheetName, new Map());
    return store.get(sheetName);
  }

  return {
    upsertByUid: async ({ sheetName, uid, valuesByHeader }) => {
      sheetMap(sheetName).set(uid, { ...valuesByHeader });
    },
    getByUid: async ({ sheetName, uid }) => {
      return sheetMap(sheetName).get(uid) || null;
    },
    appendEvent: async ({ ts, source, action, payload }) => {
      events.push({ ts, source, action, payload });
    },
    __debug: { store, events },
  };
}

function createTestApp(db) {
  const app = express();
  app.use(express.json({ limit: "1mb" }));
  app.use("/quiz", createQuizRouter({ db }));
  return app;
}

describe("quiz routes", () => {
  beforeEach(() => {
    process.env.API_KEY = "test-key";
  });

  test("POST /quiz/calc -> 401 without x-api-key", async () => {
    const db = createInMemoryDb();
    const app = createTestApp(db);

    const res = await request(app).post("/quiz/calc").send({
      uid: "U1",
      birthday: "1990-01-24",
    });

    expect(res.status).toBe(401);
  });

  test("POST /quiz/calc -> 400 on invalid birthday", async () => {
    const db = createInMemoryDb();
    const app = createTestApp(db);

    const res = await request(app)
      .post("/quiz/calc")
      .set("x-api-key", "test-key")
      .send({ uid: "U1", birthday: "1990-02-31" });

    expect(res.status).toBe(400);
    expect(res.body.ok).toBe(false);
  });

  test("POST /quiz/calc -> 200 and writes calc + union sheets", async () => {
    const db = createInMemoryDb();
    const app = createTestApp(db);

    const res = await request(app)
      .post("/quiz/calc")
      .set("x-api-key", "test-key")
      .send({ uid: "U_TEST", birthday: "1990-01-24" });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.uid).toBe("U_TEST");
    expect(res.body.sixteen).toBeTruthy();
    expect(res.body.union12).toHaveLength(12);

    const calc = await db.getByUid({ sheetName: "運算紀錄表", uid: "U_TEST" });
    const union = await db.getByUid({ sheetName: "聯合碼紀錄表", uid: "U_TEST" });

    expect(calc).toBeTruthy();
    expect(calc.UID).toBe("U_TEST");
    expect(calc.n16).toBeDefined();

    expect(union).toBeTruthy();
    expect(union.UID).toBe("U_TEST");
    expect(union["聯合碼12"]).toBeDefined();
  });

  test("GET /quiz/:uid -> 200 after calc", async () => {
    const db = createInMemoryDb();
    const app = createTestApp(db);

    await request(app)
      .post("/quiz/calc")
      .set("x-api-key", "test-key")
      .send({ uid: "U2", birthday: "1990-01-24" });

    const res = await request(app).get("/quiz/U2").set("x-api-key", "test-key");

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.calc).toBeTruthy();
    expect(res.body.union).toBeTruthy();
  });

  test("Year suffix 00 -> n4 should be 5", async () => {
    const db = createInMemoryDb();
    const app = createTestApp(db);

    const res = await request(app)
      .post("/quiz/calc")
      .set("x-api-key", "test-key")
      .send({ uid: "U3", birthday: "2000-01-01" });

    expect(res.status).toBe(200);
    expect(res.body.sixteen.n4).toBe(5);
  });
});