const { createBirthdayInputPrompt } = require("../src/lib/flex/birthdayInputPrompt");
const { createPersonalAnalysisFlex } = require("../src/lib/flex/personalAnalysisFlex");
const { createSectionFlex } = require("../src/lib/flex/contentSectionFlex");
const { extractMessages, validateFlexMessage } = require("./helpers/flexSchemaGuard");

describe("flex schema guard", () => {
  test("birthdayInputPrompt flex payloads pass guard", () => {
    const messages = extractMessages(createBirthdayInputPrompt());
    messages
      .filter((msg) => msg && msg.type === "flex")
      .forEach((msg) => expect(() => validateFlexMessage(msg)).not.toThrow());
  });

  test("personalAnalysisFlex payloads pass guard", () => {
    const messages = extractMessages(
      createPersonalAnalysisFlex({
        userId: "u123",
        displayName: "Tester",
        birthday: "1990-01-01",
        n7: 7,
        n1: 1,
        n4: 4,
        flow: 5,
      })
    );
    messages
      .filter((msg) => msg && msg.type === "flex")
      .forEach((msg) => expect(() => validateFlexMessage(msg)).not.toThrow());
  });

  test("contentSectionFlex payloads pass guard when flex is present", () => {
    const payload = createSectionFlex({
      title: "Section title",
      subtitle: "Section subtitle",
      sections: [
        { heading: "H1", text: "T1" },
        { heading: "H2", text: "T2" },
      ],
    });
    const messages = extractMessages(payload);
    messages
      .filter((msg) => msg && msg.type === "flex")
      .forEach((msg) => expect(() => validateFlexMessage(msg)).not.toThrow());
  });
});
