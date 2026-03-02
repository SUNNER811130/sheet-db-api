const {
  parseBirthdayInput,
  calculateSevenNumbers,
  calculateSixteenNumbers,
  calculateUnionCodes16Map,
  computeFlowNumFromBirthday,
} = require("../src/lib/talentCalc");

describe("talentCalc", () => {
  test("parseBirthdayInput validates legal YYYY-MM-DD", () => {
    expect(parseBirthdayInput("1990-11-30")).toEqual(
      expect.objectContaining({
        matched: true,
        ok: true,
        birthday: "1990-11-30",
      })
    );
    expect(parseBirthdayInput("1990-02-31")).toEqual(
      expect.objectContaining({
        matched: true,
        ok: false,
      })
    );
  });

  test("fixed birthday returns complete fields n1..n16 and 12 union codes", () => {
    const birthday = "1990-11-30";
    const seven = calculateSevenNumbers(birthday);
    expect(seven).toEqual(
      expect.objectContaining({
        n1: expect.any(Number),
        n2: expect.any(Number),
        n3: expect.any(Number),
        n4: expect.any(Number),
        n5: expect.any(Number),
        n6: expect.any(Number),
        n7: expect.any(Number),
      })
    );

    const sixteen = calculateSixteenNumbers(birthday);
    for (let i = 1; i <= 16; i += 1) {
      expect(sixteen[`n${i}`]).toEqual(expect.any(Number));
    }

    const unionCodes = calculateUnionCodes16Map(sixteen);
    expect(Array.isArray(unionCodes)).toBe(true);
    expect(unionCodes).toHaveLength(12);
    unionCodes.forEach((code) => {
      expect(code).toEqual(expect.any(String));
    });
  });

  test("computeFlowNumFromBirthday returns a number for this year", () => {
    const flow = computeFlowNumFromBirthday("1990-11-30", new Date("2026-03-02T00:00:00Z"));
    expect(typeof flow).toBe("number");
    expect(flow).toBeGreaterThanOrEqual(0);
    expect(flow).toBeLessThanOrEqual(9);
  });
});
