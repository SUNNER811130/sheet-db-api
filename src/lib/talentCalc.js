function sumDigits(input) {
  return String(Math.abs(Number(input) || 0))
    .split("")
    .reduce((acc, ch) => acc + Number(ch || 0), 0);
}

function compressNumber(input) {
  let n = Math.abs(Number(input) || 0);
  while (n > 9) n = sumDigits(n);
  return n;
}

function parseBirthdayInput(raw) {
  const text = String(raw || "").trim();
  const m = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return { matched: false, ok: false, reason: "format_not_matched" };

  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  const dt = new Date(Date.UTC(year, month - 1, day));
  const valid =
    Number.isInteger(year) &&
    Number.isInteger(month) &&
    Number.isInteger(day) &&
    month >= 1 &&
    month <= 12 &&
    day >= 1 &&
    day <= 31 &&
    dt.getUTCFullYear() === year &&
    dt.getUTCMonth() + 1 === month &&
    dt.getUTCDate() === day;

  if (!valid) {
    return {
      matched: true,
      ok: false,
      reason: "invalid_date",
      text,
      year,
      month,
      day,
    };
  }

  return {
    matched: true,
    ok: true,
    birthday: `${m[1]}-${m[2]}-${m[3]}`,
    year,
    month,
    day,
  };
}

function calculateSevenNumbers(birthday) {
  const parsed = parseBirthdayInput(birthday);
  if (!parsed.ok) throw new Error("invalid_birthday");

  const n1 = compressNumber(parsed.day);
  const n2 = compressNumber(parsed.month);
  const n3 = compressNumber(Number(String(parsed.year).slice(0, 2)));
  const yearSuffix = Number(String(parsed.year).slice(2));
  const n4 = compressNumber(yearSuffix === 0 ? 5 : yearSuffix);
  const n5 = compressNumber(n1 + n2);
  const n6 = compressNumber(n3 + n4);
  const n7 = compressNumber(n5 + n6);

  return { n1, n2, n3, n4, n5, n6, n7 };
}

function calculateSixteenNumbers(birthday) {
  const seven = calculateSevenNumbers(birthday);
  const n8 = compressNumber(seven.n1 + seven.n5);
  const n9 = compressNumber(seven.n2 + seven.n5);
  const n10 = compressNumber(n8 + n9);
  const n11 = compressNumber(seven.n6 + seven.n7);
  const n12 = compressNumber(seven.n5 + seven.n7);
  const n13 = compressNumber(n11 + n12);
  const n14 = compressNumber(seven.n3 + seven.n6);
  const n15 = compressNumber(seven.n4 + seven.n6);
  const n16 = compressNumber(n14 + n15);

  return { ...seven, n8, n9, n10, n11, n12, n13, n14, n15, n16 };
}

function calculateUnionCodes16Map(numbers16) {
  const n = numbers16 || {};
  return [
    `${n.n1}${n.n2}${n.n5}`,
    `${n.n3}${n.n4}${n.n6}`,
    `${n.n5}${n.n6}${n.n7}`,
    `${n.n1}${n.n5}${n.n8}`,
    `${n.n2}${n.n5}${n.n9}`,
    `${n.n8}${n.n9}${n.n10}`,
    `${n.n6}${n.n7}${n.n11}`,
    `${n.n5}${n.n7}${n.n12}`,
    `${n.n11}${n.n12}${n.n13}`,
    `${n.n3}${n.n6}${n.n14}`,
    `${n.n4}${n.n6}${n.n15}`,
    `${n.n14}${n.n15}${n.n16}`,
  ];
}

function computeFlowNumFromBirthday(birthday, now = new Date()) {
  const parsed = parseBirthdayInput(birthday);
  if (!parsed.ok) throw new Error("invalid_birthday");

  const thisYear = now.getFullYear();
  const y = String(thisYear);
  const n1 = compressNumber(parsed.day);
  const n2 = compressNumber(parsed.month);
  const n3 = compressNumber(Number(y.slice(0, 2)));
  const ySuffix = Number(y.slice(2));
  const n4 = compressNumber(ySuffix === 0 ? 5 : ySuffix);
  const n5 = compressNumber(n1 + n2);
  const n6 = compressNumber(n3 + n4);
  return compressNumber(n5 + n6);
}

module.exports = {
  compressNumber,
  parseBirthdayInput,
  calculateSevenNumbers,
  calculateSixteenNumbers,
  calculateUnionCodes16Map,
  computeFlowNumFromBirthday,
};
