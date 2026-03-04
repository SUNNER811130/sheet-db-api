const crypto = require("crypto");
const request = require("supertest");
const { createApp } = require("../src/app");

function signRawBody(channelSecret, rawBody) {
  return crypto.createHmac("sha256", channelSecret).update(rawBody).digest("base64");
}

describe("LINE webhook", () => {
  const OLD_ENV = process.env;

  beforeEach(() => {
    jest.resetAllMocks();
    process.env = { ...OLD_ENV };
    process.env.LINE_CHANNEL_SECRET = "test-channel-secret";
    process.env.LINE_CHANNEL_ACCESS_TOKEN = "";
    global.fetch = jest.fn();
  });

  afterEach(() => {
    process.env = OLD_ENV;
    delete global.fetch;
  });

  test("returns error when signature prerequisites are missing (raw body length = 0), and writes line_event_error", async () => {
    const db = {
      appendEvent: jest.fn().mockResolvedValue(undefined),
      upsertMember: jest.fn().mockResolvedValue(undefined),
    };
    const app = createApp({ db });

    const res = await request(app)
      .post("/line/webhook")
      .set("x-line-signature", "any-signature")
      .set("content-type", "application/json");

    expect(res.status).toBe(401);
    expect(res.text).toMatch(/Missing signature prerequisites/i);

    expect(db.appendEvent).toHaveBeenCalledTimes(1);
    expect(db.appendEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        source: "line",
        action: "line_event_error",
        payload: expect.objectContaining({
          reason: "missing_signature_prerequisites",
          rawLen: 0,
        }),
      })
    );
    expect(db.upsertMember).not.toHaveBeenCalled();
  });

  test("returns 401/400 on invalid signature and writes line_event_error", async () => {
    const db = {
      appendEvent: jest.fn().mockResolvedValue(undefined),
      upsertMember: jest.fn().mockResolvedValue(undefined),
    };
    const app = createApp({ db });

    const rawBody = JSON.stringify({
      destination: "U_DEST",
      events: [{ type: "follow", source: { userId: "U123" } }],
    });

    const res = await request(app)
      .post("/line/webhook")
      .set("x-line-signature", "invalid-signature")
      .set("content-type", "application/json")
      .send(rawBody);

    expect([400, 401]).toContain(res.status);
    expect(db.appendEvent).toHaveBeenCalledTimes(1);
    expect(db.appendEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        source: "line",
        action: "line_event_error",
        payload: expect.objectContaining({
          reason: "invalid_signature",
        }),
      })
    );
    expect(db.upsertMember).not.toHaveBeenCalled();
  });

  test("returns 200 on valid signature, writes line_event, and calls members upsert with displayName", async () => {
    process.env.LINE_CHANNEL_ACCESS_TOKEN = "test-access-token";

    const db = {
      appendEvent: jest.fn().mockResolvedValue(undefined),
      upsertMember: jest.fn().mockResolvedValue(undefined),
    };
    const app = createApp({ db });

    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ displayName: "Mock User" }),
    });

    const rawBody = JSON.stringify({
      destination: "U_DEST",
      events: [
        {
          type: "follow",
          timestamp: 1730000000000,
          replyToken: "reply-token",
          source: { userId: "U_VALID_1" },
        },
      ],
    });
    const signature = signRawBody(process.env.LINE_CHANNEL_SECRET, rawBody);

    const res = await request(app)
      .post("/line/webhook")
      .set("x-line-signature", signature)
      .set("content-type", "application/json")
      .send(rawBody);

    expect(res.status).toBe(200);
    expect(res.text).toBe("OK");

    expect(db.appendEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        source: "line",
        action: "line_event",
      })
    );

    expect(db.upsertMember).toHaveBeenCalledTimes(1);
    expect(db.upsertMember).toHaveBeenCalledWith({
      uid: "U_VALID_1",
      display_name: "Mock User",
    });

    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(global.fetch.mock.calls[0][0]).toContain("/v2/bot/profile/U_VALID_1");
  });

  test("profile fetch failure (throw or ok:false) should not crash, writes line_event_error, and still upserts member", async () => {
    process.env.LINE_CHANNEL_ACCESS_TOKEN = "test-access-token";

    const cases = [
      {
        fetchResult: Promise.reject(new Error("network down")),
        expectedStatus: 0,
      },
      {
        fetchResult: Promise.resolve({
          ok: false,
          status: 503,
          json: async () => ({}),
        }),
        expectedStatus: 503,
      },
    ];

    for (const c of cases) {
      const db = {
        appendEvent: jest.fn().mockResolvedValue(undefined),
        upsertMember: jest.fn().mockResolvedValue(undefined),
      };
      const app = createApp({ db });
      global.fetch.mockReset();
      global.fetch.mockImplementation(() => c.fetchResult);

      const rawBody = JSON.stringify({
        destination: "U_DEST",
        events: [{ type: "follow", source: { userId: "U_PROFILE_FAIL" } }],
      });
      const signature = signRawBody(process.env.LINE_CHANNEL_SECRET, rawBody);

      const res = await request(app)
        .post("/line/webhook")
        .set("x-line-signature", signature)
        .set("content-type", "application/json")
        .send(rawBody);

      expect(res.status).toBe(200);
      expect(res.text).toBe("OK");

      const appendCalls = db.appendEvent.mock.calls.map((args) => args[0]);
      expect(appendCalls).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ action: "line_event" }),
          expect.objectContaining({
            action: "line_event_error",
            payload: expect.objectContaining({
              reason: "profile_fetch_failed",
              userId: "U_PROFILE_FAIL",
              status: c.expectedStatus,
            }),
          }),
        ])
      );
      expect(appendCalls).not.toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            action: "line_event_error",
            payload: expect.objectContaining({ reason: "handler_exception" }),
          }),
        ])
      );

      expect(db.upsertMember).toHaveBeenCalledTimes(1);
      expect(db.upsertMember).toHaveBeenCalledWith({
        uid: "U_PROFILE_FAIL",
      });
    }
  });

  test("when payload has multiple events, it writes one line_event per event and upserts each member", async () => {
    const db = {
      appendEvent: jest.fn().mockResolvedValue(undefined),
      upsertMember: jest.fn().mockResolvedValue(undefined),
    };
    const app = createApp({ db });

    const rawBody = JSON.stringify({
      destination: "U_DEST",
      events: [
        { type: "follow", source: { userId: "U_MULTI_1" } },
        {
          type: "message",
          source: { userId: "U_MULTI_2" },
          message: { type: "text", text: "hello" },
        },
      ],
    });
    const signature = signRawBody(process.env.LINE_CHANNEL_SECRET, rawBody);

    const res = await request(app)
      .post("/line/webhook")
      .set("x-line-signature", signature)
      .set("content-type", "application/json")
      .send(rawBody);

    expect(res.status).toBe(200);
    expect(res.text).toBe("OK");

    expect(db.appendEvent).toHaveBeenCalledTimes(2);
    const appendCalls = db.appendEvent.mock.calls.map((args) => args[0]);
    expect(appendCalls[0]).toEqual(expect.objectContaining({ action: "line_event" }));
    expect(appendCalls[1]).toEqual(expect.objectContaining({ action: "line_event" }));

    expect(db.upsertMember).toHaveBeenCalledTimes(2);
    expect(db.upsertMember).toHaveBeenNthCalledWith(1, {
      uid: "U_MULTI_1",
    });
    expect(db.upsertMember).toHaveBeenNthCalledWith(2, {
      uid: "U_MULTI_2",
    });
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
