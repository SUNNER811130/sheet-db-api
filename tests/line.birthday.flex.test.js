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

describe("LINE birthday flex flow", () => {
  const OLD_ENV = process.env;

  beforeEach(() => {
    jest.resetAllMocks();
    process.env = { ...OLD_ENV };
    process.env.LINE_CHANNEL_SECRET = "test-channel-secret";
    process.env.LINE_CHANNEL_ACCESS_TOKEN = "test-access-token";
    global.fetch = jest.fn();
  });

  afterEach(() => {
    process.env = OLD_ENV;
    delete global.fetch;
  });

  test("LINE_REPLY_MODE=on: calls /v2/bot/message/reply and sends flex message", async () => {
    process.env.LINE_REPLY_MODE = "on";
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
          replyToken: "birthday-reply-token",
          source: { userId: "U_BIRTHDAY_1" },
          message: { type: "text", text: "1990-11-30" },
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
    const body = JSON.parse(options.body);
    expect(body.messages[0].type).toBe("flex");

    const appendCalls = db.appendEvent.mock.calls.map((args) => args[0]);
    expect(appendCalls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ action: "line_birthday_calc_ok" }),
        expect.objectContaining({ action: "line_reply_ok" }),
      ])
    );

    expect(db.upsertMember).toHaveBeenCalledWith(
      expect.objectContaining({
        uid: "U_BIRTHDAY_1",
        display_name: "Mock User",
        birthday: "1990-11-30",
        flow: expect.any(Number),
      })
    );
  });

  test("LINE_REPLY_MODE=off: does not call reply endpoint and writes line_reply_skipped", async () => {
    process.env.LINE_REPLY_MODE = "off";
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
          replyToken: "birthday-reply-token",
          source: { userId: "U_BIRTHDAY_2" },
          message: { type: "text", text: "1990-11-30" },
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

    const appendCalls = db.appendEvent.mock.calls.map((args) => args[0]);
    expect(appendCalls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ action: "line_birthday_calc_ok" }),
        expect.objectContaining({
          action: "line_reply_skipped",
          payload: expect.objectContaining({ reason: "reply_mode_off" }),
        }),
      ])
    );

    expect(db.upsertMember).toHaveBeenCalledWith(
      expect.objectContaining({
        uid: "U_BIRTHDAY_2",
        display_name: "Mock User",
        birthday: "1990-11-30",
        flow: expect.any(Number),
      })
    );
  });
});
