import { describe, expect, it } from "vitest";
import { nextFieldName, RECEIPT_FIELD_ORDER } from "./focus-walk";

describe("the keying order", () => {
  it("starts on the receipt number", () => {
    expect(nextFieldName(null)).toBe("receiptNo");
    expect(RECEIPT_FIELD_ORDER[0]).toBe("receiptNo");
  });

  it("walks the header strip in the order it is read", () => {
    expect(nextFieldName("receiptNo")).toBe("date");
    expect(nextFieldName("date")).toBe("beat");
    expect(nextFieldName("beat")).toBe("collectedBy");
    expect(nextFieldName("narration")).toBe("party");
    // The party panel and the Amount box are below the strip in the DOM, so a
    // DOM-order walk would reach three buttons and a table first.
    expect(nextFieldName("party")).toBe("amount");
  });

  it("stops at the end rather than wrapping", () => {
    expect(nextFieldName("amount")).toBeNull();
  });

  it("ignores a name it does not know", () => {
    expect(nextFieldName("whatever")).toBeNull();
  });
});
