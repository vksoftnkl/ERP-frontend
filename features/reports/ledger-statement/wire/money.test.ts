import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { formatAmount, formatBal, formatCell, isZeroAmount, sameBal } from "./money";

describe("formatAmount", () => {
  it.each([
    ["0.00", "0.00"],
    ["5.00", "5.00"],
    ["999.99", "999.99"],
    ["1000.00", "1,000.00"],
    ["100000.00", "1,00,000.00"],
    ["176300.00", "1,76,300.00"],
    ["12345678.90", "1,23,45,678.90"],
    ["1000000000.05", "1,00,00,00,000.05"],
  ])("%s → %s", (input, expected) => {
    expect(formatAmount(input)).toBe(expected);
  });

  it("keeps the decimals byte-for-byte as sent", () => {
    expect(formatAmount("176300.10")).toBe("1,76,300.10");
    expect(formatAmount("5.5")).toBe("5.5");
    expect(formatAmount("5")).toBe("5");
    // A float would have rounded this; a string does not.
    expect(formatAmount("176300.00000001")).toBe("1,76,300.00000001");
  });

  it("returns a non-amount unchanged instead of guessing", () => {
    expect(formatAmount("2400,50")).toBe("2400,50");
    expect(formatAmount("abc")).toBe("abc");
  });

  it("drops the sign of a negative zero", () => {
    expect(formatAmount("-0.00")).toBe("0.00");
    expect(formatAmount("-1500.00")).toBe("-1,500.00");
  });
});

describe("formatBal", () => {
  it("prints the side from `side`, never from a sign", () => {
    expect(formatBal({ amount: "176300.00", side: "DR" })).toBe("1,76,300.00 Dr");
    expect(formatBal({ amount: "12345678.90", side: "CR" })).toBe("1,23,45,678.90 Cr");
  });

  it("prints a zero with no side, whether the server sent null or DR", () => {
    expect(formatBal({ amount: "0.00", side: null })).toBe("0.00");
    expect(formatBal({ amount: "0.00", side: "DR" })).toBe("0.00");
  });
});

describe("formatCell / isZeroAmount / sameBal", () => {
  it("blanks a zero Debit or Credit cell", () => {
    expect(formatCell("0.00")).toBe("");
    expect(formatCell("15000.00")).toBe("15,000.00");
  });

  it("recognises zero on the digits", () => {
    expect(isZeroAmount("0")).toBe(true);
    expect(isZeroAmount("000.000")).toBe(true);
    expect(isZeroAmount("0.01")).toBe(false);
    expect(isZeroAmount("x")).toBe(false);
  });

  it("compares balances by figure and side", () => {
    expect(sameBal({ amount: "5.00", side: "DR" }, { amount: "5.00", side: "DR" })).toBe(true);
    expect(sameBal({ amount: "5.00", side: "DR" }, { amount: "5.00", side: "CR" })).toBe(false);
    expect(sameBal({ amount: "0.00", side: null }, { amount: "0.00", side: "DR" })).toBe(true);
  });
});

describe("money.ts never leaves the string domain", () => {
  const source = readFileSync(fileURLToPath(new URL("./money.ts", import.meta.url)), "utf8")
    // Comments may name the forbidden calls; code may not.
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "");

  it.each(["Number(", "parseFloat(", "parseInt(", "Intl.NumberFormat", "toFixed(", "toLocaleString("])(
    "does not call %s",
    (call) => {
      expect(source).not.toContain(call);
    },
  );
});
