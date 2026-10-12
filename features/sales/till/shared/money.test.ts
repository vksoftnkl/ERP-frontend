import { describe, expect, it } from "vitest";
import {
  amountInputPaise,
  formatFigure,
  formatMoney,
  formatSignedMoney,
  isAmountDraft,
  paiseOf,
  paiseToAmount,
  paiseToInput,
  paiseToNumber,
  toPaise,
} from "./money";

describe("toPaise", () => {
  it("reads numbers and grid strings exactly", () => {
    expect(toPaise(500)).toBe(50000);
    expect(toPaise("500.00")).toBe(50000);
    expect(toPaise(0.1)).toBe(10);
    expect(toPaise(2000.5)).toBe(200050);
    expect(toPaise("1,23,456.50")).toBe(12345650);
  });

  it("rounds the third decimal half away from zero, as the number reads", () => {
    expect(toPaise(1.005)).toBe(101);
    expect(toPaise("1.004")).toBe(100);
    expect(toPaise("-2.555")).toBe(-256);
  });

  it("answers null for nothing and for words", () => {
    expect(toPaise(null)).toBeNull();
    expect(toPaise(undefined)).toBeNull();
    expect(toPaise("")).toBeNull();
    expect(toPaise("abc")).toBeNull();
    expect(toPaise(Number.NaN)).toBeNull();
    expect(paiseOf(null)).toBe(0);
  });
});

describe("formatting", () => {
  it("writes Indian grouping with two places", () => {
    expect(formatMoney(12345650)).toBe("1,23,456.50");
    expect(formatMoney(0)).toBe("0.00");
    expect(formatMoney(-100000)).toBe("-1,000.00");
    expect(paiseToAmount(5)).toBe("0.05");
    expect(paiseToNumber(200050)).toBe(2000.5);
  });

  it("signs a difference with a true minus", () => {
    expect(formatSignedMoney(-1000)).toBe("−10.00");
    expect(formatSignedMoney(1000)).toBe("+10.00");
    expect(formatSignedMoney(0)).toBe("0.00");
  });

  it("leaves a hidden figure blank", () => {
    expect(formatFigure(null)).toBe("");
    expect(formatFigure(2000)).toBe("2,000.00");
  });
});

describe("amount inputs", () => {
  it("accepts a draft of up to two decimals", () => {
    expect(isAmountDraft("")).toBe(true);
    expect(isAmountDraft("2000.")).toBe(true);
    expect(isAmountDraft("2000.55")).toBe(true);
    expect(isAmountDraft("2000.555")).toBe(false);
    expect(isAmountDraft("-1")).toBe(false);
  });

  it("reads blank as zero and writes zero as blank", () => {
    expect(amountInputPaise("")).toBe(0);
    expect(amountInputPaise("12.5")).toBe(1250);
    expect(paiseToInput(0)).toBe("");
    expect(paiseToInput(200000)).toBe("2000");
    expect(paiseToInput(200050)).toBe("2000.50");
  });
});
