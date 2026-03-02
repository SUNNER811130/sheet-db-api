const crypto = require("crypto");
const request = require("supertest");
const { createApp } = require("../src/app");

function signRawBody(channelSecret, rawBody) {
  return crypto.createHmac("sha256", channelSecret).update(rawBody).digest("base64");
}

function createDb() {
  return {
    appendEvent: jest.fn().mockResolvedValue(undefined),
    upsertMember: jest.fn().mockResolvedValue(undefined),
  };
}

describe("LINE reply behavior", () => {
  const OLD_ENV = process.env;

  beforeEach(() => {
    jest.resetAllMocks();
    process.env = { ...OLD_ENV };
    process.env.LINE_CHANNEL_SECRET = "test-channel-secret";
    process.env.LINE_CHANNEL_ACCESS_TOKEN = "test-access-token";
    process.env.LINE_REPLY_MODE = "on";
    global.fetch = jest.fn();
  });

  afterEach(() => {
    process.env = OLD_ENV;
    delete global.fetch;
  });

  test("follow: calls /v2/bot/message/reply with bearer token and payload", async () => {
    const db = createDb();
    const app = createApp({ db });

    global.fetch
      .mockResolvedValueOnce({ ok: true, json: async () => ({ displayName: "Mock User" }) })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({}) });

    const rawBody = JSON.stringify({
      destination: "U_DEST",
      events: [
        {
          type: "follow",
          timestamp: 1730000000000,
          replyToken: "follow-reply-token",
          source: { userId: "U_FOLLOW_1" },
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

    const replyCall = global.fetch.mock.calls.find(([url]) =>
      String(url).includes("/v2/bot/message/reply")
    );

    expect(replyCall).toBeTruthy();
    const [, options] = replyCall;
    expect(options.headers.Authorization).toBe("Bearer test-access-token");

    const body = JSON.parse(options.body);
    expect(body).toEqual(
      expect.objectContaining({
        replyToken: "follow-reply-token",
        messages: expect.any(Array),
      })
    );
    expect(body.messages[0]).toEqual(
      expect.objectContaining({
        type: "text",
      })
    );
  });

  test("message=menu: calls /v2/bot/message/reply with bearer token and payload", async () => {
    const db = createDb();
    const app = createApp({ db });

    global.fetch
      .mockResolvedValueOnce({ ok: true, json: async () => ({ displayName: "Mock User" }) })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({}) });

    const rawBody = JSON.stringify({
      destination: "U_DEST",
      events: [
        {
          type: "message",
          timestamp: 1730000000000,
          replyToken: "menu-reply-token",
          source: { userId: "U_MENU_1" },
          message: { type: "text", text: "menu" },
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

    const replyCall = global.fetch.mock.calls.find(([url]) =>
      String(url).includes("/v2/bot/message/reply")
    );

    expect(replyCall).toBeTruthy();
    const [, options] = replyCall;
    expect(options.headers.Authorization).toBe("Bearer test-access-token");

    const body = JSON.parse(options.body);
    expect(body).toEqual(
      expect.objectContaining({
        replyToken: "menu-reply-token",
        messages: expect.any(Array),
      })
    );
  });

  test("message=other: does not call /v2/bot/message/reply", async () => {
    const db = createDb();
    const app = createApp({ db });

    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ displayName: "Mock User" }),
    });

    const rawBody = JSON.stringify({
      destination: "U_DEST",
      events: [
        {
          type: "message",
          timestamp: 1730000000000,
          replyToken: "other-reply-token",
          source: { userId: "U_OTHER_1" },
          message: { type: "text", text: "random" },
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

    const replyCalls = global.fetch.mock.calls.filter(([url]) =>
      String(url).includes("/v2/bot/message/reply")
    );
    expect(replyCalls).toHaveLength(0);
  });
});
