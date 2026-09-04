import { describe, expect, it } from "vitest";

import {
  DEFAULT_CAPITALIZATION_MODE,
  applyCapitalization,
  diffEdit,
  parseCapitalizationMode,
  remapPinnedPositions,
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

describe("applyCapitalization with pinned offsets", () => {
  it("keeps a hand-cased letter the mode would have flattened", () => {
    expect(applyCapitalization("mcdonald", "TITLE")).toBe("Mcdonald");
    expect(applyCapitalization("mcDonald", "TITLE", new Set([2]))).toBe("McDonald");
  });

  it("lets a capital survive LOWER, and a small letter survive UPPER", () => {
    expect(applyCapitalization("iPhone case", "LOWER", new Set([1]))).toBe("iPhone case");
    expect(applyCapitalization("PhD holder", "UPPER", new Set([0, 1]))).toBe("PhD HOLDER");
  });

  it("ignores pins that fall outside the value", () => {
    expect(applyCapitalization("acme", "UPPER", new Set([-1, 9]))).toBe("ACME");
  });

  it("still does nothing in MIXED", () => {
    expect(applyCapitalization("aBc", "MIXED", new Set([1]))).toBe("aBc");
  });
});

describe("diffEdit", () => {
  it("reads a character typed at the end", () => {
    expect(diffEdit("hello", "hellow")).toEqual({ start: 5, removed: 0, inserted: 1 });
  });

  it("reads a character typed in the middle", () => {
    expect(diffEdit("helo", "hello")).toEqual({ start: 3, removed: 0, inserted: 1 });
  });

  it("reads a backspace", () => {
    expect(diffEdit("hello", "hell")).toEqual({ start: 4, removed: 1, inserted: 0 });
  });

  it("reads typing over a selection", () => {
    expect(diffEdit("hello world", "hello X")).toEqual({ start: 6, removed: 5, inserted: 1 });
  });

  it("reads no change as an empty edit", () => {
    expect(diffEdit("hello", "hello")).toEqual({ start: 5, removed: 0, inserted: 0 });
  });
});

describe("remapPinnedPositions", () => {
  it("leaves pins before the edit where they are", () => {
    const pinned = remapPinnedPositions(new Set([2]), { start: 6, removed: 0, inserted: 1 });
    expect([...pinned]).toEqual([2]);
  });

  it("slides pins after the edit by the change in length", () => {
    expect([...remapPinnedPositions(new Set([5]), { start: 2, removed: 0, inserted: 1 })]).toEqual([
      6,
    ]);
    expect([...remapPinnedPositions(new Set([5]), { start: 2, removed: 1, inserted: 0 })]).toEqual([
      4,
    ]);
  });

  it("drops a pin whose character was deleted", () => {
    expect([...remapPinnedPositions(new Set([3]), { start: 2, removed: 4, inserted: 0 })]).toEqual(
      [],
    );
  });
});
