import { describe, expect, it } from "vitest";

import {
  DEFAULT_CAPITALIZATION_MODE,
  applyCapitalization,
  parseCapitalizationMode,
} from "./text-capitalization";

describe("parseCapitalizationMode", () => {
  it("takes the four modes the catalog allows", () => {
    expect(parseCapitalizationMode("TITLE")).toBe("TITLE");
    expect(parseCapitalizationMode("UPPER")).toBe("UPPER");
    expect(parseCapitalizationMode("LOWER")).toBe("LOWER");
    expect(parseCapitalizationMode("MIXED")).toBe("MIXED");
  });

  it("falls back to the catalog default rather than disabling the rewrite", () => {
    expect(parseCapitalizationMode(null)).toBe(DEFAULT_CAPITALIZATION_MODE);
    expect(parseCapitalizationMode("")).toBe(DEFAULT_CAPITALIZATION_MODE);
    expect(parseCapitalizationMode("SMALLCAPS")).toBe(DEFAULT_CAPITALIZATION_MODE);
  });

  it("reads a value however it was cased or padded when it was written", () => {
    expect(parseCapitalizationMode(" upper ")).toBe("UPPER");
  });
});

describe("applyCapitalization", () => {
  it("forces a case", () => {
    expect(applyCapitalization("acme foods pvt ltd", "UPPER")).toBe("ACME FOODS PVT LTD");
    expect(applyCapitalization("ACME Foods", "LOWER")).toBe("acme foods");
  });

  it("leaves MIXED exactly as typed", () => {
    expect(applyCapitalization("aCMe FoodS", "MIXED")).toBe("aCMe FoodS");
  });

  it("title-cases every word, lowering the rest of each", () => {
    expect(applyCapitalization("ACME foods pvt LTD", "TITLE")).toBe("Acme Foods Pvt Ltd");
    expect(applyCapitalization("o'brien & sons (chennai)", "TITLE")).toBe(
      "O'brien & Sons (Chennai)",
    );
  });

  it("keeps the spacing as typed, trailing space and all", () => {
    expect(applyCapitalization("  acme   foods ", "TITLE")).toBe("  Acme   Foods ");
  });

  it("starts a word after a digit boundary, not inside one", () => {
    expect(applyCapitalization("item2code", "TITLE")).toBe("Item2code");
  });

  it("leaves a Tamil word exactly as typed, in every mode", () => {
    const tamil = "கேரளா";
    expect(applyCapitalization(tamil, "UPPER")).toBe(tamil);
    expect(applyCapitalization(tamil, "TITLE")).toBe(tamil);
    expect(applyCapitalization(tamil, "LOWER")).toBe(tamil);
  });

  it("still rewrites the English words beside a Tamil one", () => {
    expect(applyCapitalization("கேரளா traders", "TITLE")).toBe("கேரளா Traders");
  });

  it("never changes the length, so the caret keeps its place", () => {
    const withEszett = "straße";
    expect(applyCapitalization(withEszett, "UPPER")).toHaveLength(withEszett.length);
    expect(applyCapitalization(withEszett, "UPPER")).toBe("STRAßE");
  });
});
