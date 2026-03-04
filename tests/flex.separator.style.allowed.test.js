const { validateFlexMessage } = require("./helpers/flexSchemaGuard");

describe("flex separator allowlist", () => {
  test("allows styles.footer.separator", () => {
    const message = {
      type: "flex",
      altText: "t",
      contents: {
        type: "bubble",
        styles: {
          footer: {
            separator: true,
            separatorColor: "#000000",
          },
        },
        footer: {
          type: "box",
          layout: "vertical",
          contents: [],
        },
      },
    };

    expect(() => validateFlexMessage(message)).not.toThrow();
  });
});
