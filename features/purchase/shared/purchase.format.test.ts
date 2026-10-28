import { describe, expect, it } from "vitest";
import { isoFromTyped, money, num, purchaseRefusalText, qtyText } from "./purchase.format";

describe("purchase.format", () => {
  it("qtyText trims trailing zeros", () => {
    expect(qtyText(12.5)).toBe("12.5");
    expect(qtyText(3)).toBe("3");
    expect(qtyText(0)).toBe("0");
    expect(qtyText(1.2346)).toBe("1.235");
  });

  it("money groups the Indian way", () => {
    expect(money(123456.5)).toBe("1,23,456.50");
    expect(money(Number.NaN)).toBe("0.00");
  });

  it("num reads wire decimals", () => {
    expect(num("12.50")).toBe(12.5);
    expect(num("1,200")).toBe(1200);
    expect(num("")).toBe(0);
    expect(num(null, 7)).toBe(7);
  });

  it("isoFromTyped takes dd/MM/yyyy, d/M/yyyy and ISO", () => {
    expect(isoFromTyped("05/03/2026")).toBe("2026-03-05");
    expect(isoFromTyped("5/3/2026")).toBe("2026-03-05");
    expect(isoFromTyped("2026-03-05")).toBe("2026-03-05");
    expect(isoFromTyped("31/02/2026")).toBe("");
    expect(isoFromTyped("junk")).toBe("");
    expect(isoFromTyped("")).toBe("");
  });

  it("purchaseRefusalText lists errors[].message, else the message", () => {
    expect(
      purchaseRefusalText({ status: 409, data: { message: "Validation failed", errors: [{ message: "a" }, { message: "b" }] } }),
    ).toBe("a\nb");
    expect(purchaseRefusalText({ status: 409, data: { message: "Only a draft" } })).toBe("Only a draft");
  });
});
