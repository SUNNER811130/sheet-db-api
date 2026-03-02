const { getSheetsClient } = require("../src/lib/googleAuth");
const { SheetsDb } = require("../src/lib/sheetsDb");

jest.mock("../src/lib/googleAuth", () => ({
  getSheetsClient: jest.fn(),
}));

function rosterHeader19() {
  // A..S (19 欄) - 你的「會員清單」header 大致長這樣，重點是要有 "uid" 這個欄名
  return [
    "權限到期時間", // A
    "uid",         // B
    "display_name",// C
    "level",       // D
    "生日A",        // E
    "生日B",        // F
    "路線",         // G
    "流年",         // H
    "抽卡紀錄",      // I
    "active_module",// J
    "insight_day",  // K
    "insight_last", // L
    "awaken_day",   // M
    "awaken_last",  // N
    "practice_day", // O
    "practice_last",// P
    "course_level", // Q
    "created_at (ISO)", // R
    "updated_at (ISO)", // S
  ];
}

describe("SheetsDb.getMember transition (roster-first, legacy fallback)", () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  test("roster-first: roster 找得到就直接回 roster，且不碰 legacy members", async () => {
    const header = rosterHeader19();
    const row = Array.from({ length: 19 }, () => "");
    row[0] = "2026-12-31"; // 權限到期時間
    row[1] = "U_ROSTER_1"; // uid
    row[2] = "Roster Name";
    row[3] = "free";
    row[4] = "1992-11-30";
    row[7] = 6;
    row[17] = "2026-03-02T00:00:00.000Z";
    row[18] = "2026-03-02T00:01:00.000Z";

    const values = {
      get: jest.fn(async ({ range }) => {
        // roster 的 getByUid 會依序打：
        // 1) 會員清單!1:1
        // 2) 會員清單!B2:B (majorDimension=COLUMNS)
        // 3) 會員清單!A2:S2
        if (range === "會員清單!1:1") return { data: { values: [header] } };
        if (range === "會員清單!B2:B") return { data: { values: [["U_ROSTER_1"]] } };
        if (range === "會員清單!A2:S2") return { data: { values: [row] } };

        // 如果這支測試中碰到 legacy members，直接讓它爆炸，確保 roster-first 生效
        if (String(range).startsWith("members!")) {
          throw new Error(`Should NOT read legacy in roster-first case. range=${range}`);
        }

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

    const member = await db.getMember("U_ROSTER_1");
    expect(member).toBeTruthy();
    expect(member.uid).toBe("U_ROSTER_1");
    expect(member.display_name).toBe("Roster Name");
    expect(member.level).toBe("free");
    expect(member.expire_at).toBe("2026-12-31");
    expect(member.birthday).toBe("1992-11-30");
    expect(member._source).toBe("roster");
  });

  test("fallback: roster 找不到就 fallback legacy members", async () => {
    const rosterHeader = rosterHeader19();

    const membersHeader = ["uid", "display_name", "level", "expire_at", "updated_at"];
    const membersRow = ["U_LEG_1", "Legacy Name", "free", "2027-01-01", "2026-03-02T00:00:00.000Z"];

    const values = {
      get: jest.fn(async ({ range }) => {
        // roster 會先打 header + B2:B，但 B2:B 沒有 uid -> map 空 -> getByUid 回 null
        if (range === "會員清單!1:1") return { data: { values: [rosterHeader] } };
        if (range === "會員清單!B2:B") return { data: { values: [[]] } };

        // legacy members 的流程：
        // 1) members!1:1
        // 2) members!A2:A (uid col，majorDimension=COLUMNS)
        // 3) members!A2:E2
        if (range === "members!1:1") return { data: { values: [membersHeader] } };
        if (range === "members!A2:A") return { data: { values: [["U_LEG_1"]] } };
        if (range === "members!A2:E2") return { data: { values: [membersRow] } };

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

    const member = await db.getMember("U_LEG_1");
    expect(member).toBeTruthy();
    expect(member.uid).toBe("U_LEG_1");
    expect(member.display_name).toBe("Legacy Name");
    expect(member.level).toBe("free");
    expect(member.expire_at).toBe("2027-01-01");
    expect(member._source).toBe("members");
  });
});