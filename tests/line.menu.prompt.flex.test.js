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

function hasBirthdayQuickDatetimepicker(node) {
  if (!node || typeof node !== "object") return false;
  if (
    node.type === "datetimepicker" &&
    String(node.data || "") === "action=birthday_quick"
  ) {
    return true;
  }
  for (const value of Object.values(node)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        if (hasBirthdayQuickDatetimepicker(item)) return true;
      }
      continue;
    }
    if (hasBirthdayQuickDatetimepicker(value)) return true;
  }
  return false;
}

describe("LINE menu prompt flex", () => {
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

  test("message=menu replies with flex prompt and keeps birthday quick picker action", async () => {
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
          replyToken: "menu-flex-reply-token",
          source: { userId: "U_MENU_FLEX_1" },
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
    const body = JSON.parse(options.body);
    expect(body.messages[0].type).toBe("flex");
    expect(hasBirthdayQuickDatetimepicker(body.messages[0])).toBe(true);
  });
});
