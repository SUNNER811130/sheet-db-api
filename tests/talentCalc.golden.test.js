const {
  calculateSevenNumbers,
  calculateSixteenNumbers,
  calculateUnionCodes16Map,
  computeFlowNumFromBirthday,
} = require("../src/lib/talentCalc");

describe("talentCalc golden tests (reference-aligned)", () => {
  const now = new Date("2026-07-01T12:00:00Z");

  const cases = [
    {
      birthday: "1990-11-30",
      seven: { n1: 3, n2: 2, n3: 1, n4: 9, n5: 5, n6: 1, n7: 6 },
      sixteen: {
        n1: 3, n2: 2, n3: 1, n4: 9, n5: 5, n6: 1, n7: 6, n8: 8,
        n9: 7, n10: 6, n11: 7, n12: 2, n13: 9, n14: 2, n15: 1, n16: 3,
      },
      union12: ["325", "191", "516", "358", "257", "876", "167", "562", "729", "112", "911", "213"],
      flow: 6,
    },
    {
      birthday: "2000-01-01",
      seven: { n1: 1, n2: 1, n3: 2, n4: 5, n5: 2, n6: 7, n7: 9 },
      sixteen: {
        n1: 1, n2: 1, n3: 2, n4: 5, n5: 2, n6: 7, n7: 9, n8: 3,
        n9: 3, n10: 6, n11: 7, n12: 2, n13: 9, n14: 9, n15: 3, n16: 3,
      },
      union12: ["112", "257", "279", "123", "123", "336", "797", "292", "729", "279", "573", "933"],
      flow: 3,
    },
    {
      birthday: "1984-02-29",
      seven: { n1: 2, n2: 2, n3: 1, n4: 3, n5: 4, n6: 4, n7: 8 },
      sixteen: {
        n1: 2, n2: 2, n3: 1, n4: 3, n5: 4, n6: 4, n7: 8, n8: 6,
        n9: 6, n10: 3, n11: 3, n12: 3, n13: 6, n14: 5, n15: 7, n16: 3,
      },
      union12: ["224", "134", "448", "246", "246", "663", "483", "483", "336", "145", "347", "573"],
      flow: 5,
    },
    {
      birthday: "1976-12-31",
      seven: { n1: 4, n2: 3, n3: 1, n4: 4, n5: 7, n6: 5, n7: 3 },
      sixteen: {
        n1: 4, n2: 3, n3: 1, n4: 4, n5: 7, n6: 5, n7: 3, n8: 2,
        n9: 1, n10: 3, n11: 8, n12: 1, n13: 9, n14: 6, n15: 9, n16: 6,
      },
      union12: ["437", "145", "753", "472", "371", "213", "538", "731", "819", "156", "459", "696"],
      flow: 8,
    },
    {
      birthday: "2012-06-15",
      seven: { n1: 6, n2: 6, n3: 2, n4: 3, n5: 3, n6: 5, n7: 8 },
      sixteen: {
        n1: 6, n2: 6, n3: 2, n4: 3, n5: 3, n6: 5, n7: 8, n8: 9,
        n9: 9, n10: 9, n11: 4, n12: 2, n13: 6, n14: 7, n15: 8, n16: 6,
      },
      union12: ["663", "235", "358", "639", "639", "999", "584", "382", "426", "257", "358", "786"],
      flow: 4,
    },
  ];

  test.each(cases)("birthday $birthday matches reference outputs", ({ birthday, seven, sixteen, union12, flow }) => {
    expect(calculateSevenNumbers(birthday)).toEqual(seven);
    expect(calculateSixteenNumbers(birthday)).toEqual(sixteen);
    expect(calculateUnionCodes16Map(sixteen)).toEqual(union12);
    expect(computeFlowNumFromBirthday(birthday, now)).toBe(flow);
  });
});
