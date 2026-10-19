import { describe, expect, it } from "vitest";
import { code128B, code128Modules } from "./code128";

describe("code128B", () => {
  it("T1004127 = start + 8 data + check + stop = 10×11 + 13 modules", () => {
    const widths = code128B("T1004127");
    expect(code128Modules(widths)).toBe(123);
    // Every symbol is six elements; the stop is seven.
    expect(widths.length).toBe(10 * 6 + 7);
  });

  it("refuses a non-ASCII character", () => {
    expect(code128B("Té")).toEqual([]);
    expect(code128B("T\u0001")).toEqual([]);
  });

  it("starts with the set B start symbol and ends with the stop", () => {
    const widths = code128B("A");
    expect(widths.slice(0, 6)).toEqual([2, 1, 1, 2, 1, 4]);
    expect(widths.slice(-7)).toEqual([2, 3, 3, 1, 1, 1, 2]);
  });

  it("computes the check symbol from the weighted sum", () => {
    // "A" = value 33: (104 + 33·1) % 103 = 34 → pattern "131123".
    const widths = code128B("A");
    expect(widths.slice(12, 18)).toEqual([1, 3, 1, 1, 2, 3]);
  });

  it("an empty text still encodes start, check and stop", () => {
    const widths = code128B("");
    expect(code128Modules(widths)).toBe(11 + 11 + 13);
  });
});
