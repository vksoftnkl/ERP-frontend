import { describe, expect, it } from "vitest";
import {
  MAX_AMOUNT_PAISE,
  formatMoney,
  formatPaise,
  paiseOfNumber,
  paiseOfText,
  paiseToDecimal,
  parseAmountText,
  sumPaise,
  tidyAmountText,
} from "./money";

describe("parseAmountText", () => {
  it.each([
    ["", 0],
    ["  ", 0],
    [".", 0],
    ["0", 0],
    ["1000", 100000],
    ["1,000.5", 100050],
    ["1,23,456.78", 12345678],
    [".5", 50],
    ["12.", 1200],
    ["0.01", 1],
  ])("reads %j as %i paise", (text, paise) => {
    expect(parseAmountText(text)).toBe(paise);
  });

  it.each(["-5", "1.234", "abc", "1e3", "12..3", "₹100"])("refuses %j rather than guessing", (text) => {
    expect(parseAmountText(text)).toBeNull();
  });

  it("refuses anything above the Qt spin box's maximum", () => {
    expect(parseAmountText("99999999.99")).toBe(MAX_AMOUNT_PAISE);
    expect(parseAmountText("100000000")).toBeNull();
  });

  it("paiseOfText counts an unreadable entry as zero", () => {
    expect(paiseOfText("abc")).toBe(0);
    expect(paiseOfText("2.50")).toBe(250);
  });
});

describe("server numbers", () => {
  it("rounds half-up to the paisa, absorbing float noise", () => {
    expect(paiseOfNumber(1.005)).toBe(101);
    expect(paiseOfNumber(1180)).toBe(118000);
    expect(paiseOfNumber("90.45")).toBe(9045);
    expect(paiseOfNumber(null)).toBe(0);
    expect(paiseOfNumber("x")).toBe(0);
  });

  it("sums 0.1 + 0.2 exactly once in paise", () => {
    expect(sumPaise([paiseOfNumber(0.1), paiseOfNumber(0.2)])).toBe(30);
  });
});

describe("formatting", () => {
  it("writes the wire's decimal string", () => {
    expect(paiseToDecimal(100050)).toBe("1000.50");
    expect(paiseToDecimal(5)).toBe("0.05");
    expect(paiseToDecimal(0)).toBe("0.00");
    expect(paiseToDecimal(-1999)).toBe("-19.99");
  });

  it("groups the Indian way", () => {
    expect(formatPaise(12345678)).toBe("1,23,456.78");
    expect(formatPaise(0)).toBe("0.00");
    expect(formatPaise(-1999)).toBe("-19.99");
    expect(formatMoney(1180)).toBe("1,180.00");
  });

  it("tidies a typed amount when the caret leaves it", () => {
    expect(tidyAmountText("1000.5")).toBe("1,000.50");
    expect(tidyAmountText("0")).toBe("");
    expect(tidyAmountText("")).toBe("");
    expect(tidyAmountText("12a")).toBe("12a");
  });
});
