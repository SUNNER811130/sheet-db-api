const { getSheetsClient } = require("../src/lib/googleAuth");
const { SheetsDb } = require("../src/lib/sheetsDb");

jest.mock("../src/lib/googleAuth", () => ({
  getSheetsClient: jest.fn(),
}));

describe("SheetsDb.upsertMember -> roster sheet", () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  test("insert: appends to MEMBER_ROSTER_SHEET and writes A/B/C/D/E/H/R/S", async () => {
    const values = {
      get: jest.fn(async ({ range }) => {
        if (range === "會員清單!B2:B") return { data: { values: [[]] } };
        throw new Error(`Unexpected range: ${range}`);
      }),
      append: jest.fn(async () => ({})),
      update: jest.fn(async () => ({})),
    };
    getSheetsClient.mockResolvedValue({ spreadsheets: { values } });

    const db = new SheetsDb({
      spreadsheetId: "sid",
      membersTab: "members",
      memberRosterSheet: "會員清單",
      dualWriteMembers: false,
    });

    await db.upsertMember({
      uid: "U_NEW_1",
      display_name: "Tester",
      level: "gold",
      expire_at: "2026-12-31",
      birthday: "1990-11-30",
      flow: 6,
    });

    expect(values.append).toHaveBeenCalledTimes(1);
    const appendArg = values.append.mock.calls[0][0];
    expect(appendArg.range).toBe("會員清單!A:S");

    const row = appendArg.requestBody.values[0];
    expect(row[0]).toBe("2026-12-31");
    expect(row[1]).toBe("U_NEW_1");
    expect(row[2]).toBe("Tester");
    expect(row[3]).toBe("gold");
    expect(row[4]).toBe("1990-11-30");
    expect(row[7]).toBe(6);
    expect(typeof row[17]).toBe("string");
    expect(typeof row[18]).toBe("string");
    expect(row[17].length).toBeGreaterThan(0);
    expect(row[18].length).toBeGreaterThan(0);

    expect(values.update).not.toHaveBeenCalled();
  });

  test("update: finds row by uid in B col and updates roster row with merged fields", async () => {
    const existingRow = [
      "2026-01-01",
      "U_EXIST_1",
      "Old Name",
      "free",
      "1988-08-08",
      "",
      "",
      5,
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "2026-01-02T00:00:00.000Z",
      "2026-01-03T00:00:00.000Z",
    ];
    const values = {
      get: jest.fn(async ({ range }) => {
        if (range === "會員清單!B2:B") return { data: { values: [["U_EXIST_1"]] } };
        if (range === "會員清單!A2:S2") return { data: { values: [existingRow] } };
        throw new Error(`Unexpected range: ${range}`);
      }),
      append: jest.fn(async () => ({})),
      update: jest.fn(async () => ({})),
    };
    getSheetsClient.mockResolvedValue({ spreadsheets: { values } });

    const db = new SheetsDb({
      spreadsheetId: "sid",
      membersTab: "members",
      memberRosterSheet: "會員清單",
      dualWriteMembers: false,
    });

    await db.upsertMember({
      uid: "U_EXIST_1",
      display_name: "New Name",
      birthday: "1990-11-30",
      flow: 6,
    });

    expect(values.update).toHaveBeenCalledTimes(1);
    const updateArg = values.update.mock.calls[0][0];
    expect(updateArg.range).toBe("會員清單!A2:S2");

    const row = updateArg.requestBody.values[0];
    expect(row[0]).toBe("2026-01-01");
    expect(row[1]).toBe("U_EXIST_1");
    expect(row[2]).toBe("New Name");
    expect(row[3]).toBe("free");
    expect(row[4]).toBe("1990-11-30");
    expect(row[7]).toBe(6);
    expect(row[17]).toBe("2026-01-02T00:00:00.000Z");
    expect(typeof row[18]).toBe("string");
    expect(row[18].length).toBeGreaterThan(0);

    expect(values.append).not.toHaveBeenCalled();
  });
});
