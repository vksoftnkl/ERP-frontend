import { describe, expect, it } from "vitest";
import {
  barcodeRun,
  firstBarcodeOf,
  labelsFor,
  listKindOfColumn,
  listKindOfField,
  num,
  rawNum,
  rawOf,
  seedSizes,
  sizeSetOf,
  sizeSets,
  TAG_COL,
  TAG_COLUMN_COUNT,
  TAG_COLUMN_FIELDS,
  tagColumnAlign,
} from "./textile-tag-entity";

describe("barcodeRun", () => {
  it("T1004127..T1004131 reads as the first in full, then the last's digits", () => {
    expect(barcodeRun(["T1004127", "T1004128", "T1004131"])).toBe("T1004127…131");
  });

  it("keeps at least three trailing digits so the tail reads as a number", () => {
    expect(barcodeRun(["T1004127", "T1004128"])).toBe("T1004127…128");
  });

  it("one barcode is itself, none is blank", () => {
    expect(barcodeRun(["T1004127"])).toBe("T1004127");
    expect(barcodeRun([])).toBe("");
  });

  it("a run previews its first label", () => {
    expect(firstBarcodeOf("T1004128…129")).toBe("T1004128");
    expect(firstBarcodeOf("")).toBe("");
  });
});

describe("sizeSetOf", () => {
  it("L = ALPHA, 32 = WAIST, 7-8Y = KIDS, odd = FREE", () => {
    expect(sizeSetOf("l")).toBe("ALPHA");
    expect(sizeSetOf("32")).toBe("WAIST");
    expect(sizeSetOf("7-8Y")).toBe("KIDS");
    expect(sizeSetOf("Bespoke")).toBe("FREE");
  });

  it("seeds the four sets in the plan's order", () => {
    expect(sizeSets()).toEqual(["ALPHA", "WAIST", "KIDS", "FREE"]);
    expect(seedSizes("WAIST")).toEqual(["26", "28", "30", "32", "34", "36", "38", "40", "42", "44"]);
    expect(seedSizes("FREE")).toEqual(["FREE"]);
    expect(seedSizes("NOPE")).toEqual([]);
  });
});

describe("labelsFor", () => {
  it("one label per whole piece, one for a cut length (G4)", () => {
    expect(labelsFor(3)).toBe(3);
    expect(labelsFor(2.25)).toBe(1);
    expect(labelsFor(1)).toBe(1);
  });

  it("nothing for no quantity", () => {
    expect(labelsFor(0)).toBe(0);
    expect(labelsFor(-2)).toBe(0);
  });
});

describe("figures", () => {
  it("reads a cell's raw text, commas and blanks included", () => {
    expect(num("1,999")).toBe(1999);
    expect(num("")).toBe(0);
    expect(num("abc")).toBe(0);
  });

  it("writes an answered number without trailing zeros", () => {
    expect(rawNum(1999.5)).toBe("1999.5");
    expect(rawNum(2199)).toBe("2199");
    expect(rawOf("2450.00")).toBe("2450");
    expect(rawOf(null)).toBe("");
  });
});

describe("the column layout", () => {
  it("names all 29 slots of ui_table 53", () => {
    expect(Object.keys(TAG_COLUMN_FIELDS)).toHaveLength(TAG_COLUMN_COUNT);
    expect(TAG_COLUMN_FIELDS[TAG_COL.Barcode]).toBe("barcode");
    expect(TAG_COLUMN_FIELDS[TAG_COL.State]).toBe("state");
  });

  it("aligns by meaning: money and qty right, #, Src and Labels centred", () => {
    expect(tagColumnAlign(TAG_COL.Price)).toBe("right");
    expect(tagColumnAlign(TAG_COL.Qty)).toBe("right");
    expect(tagColumnAlign(TAG_COL.PriceSrc)).toBe("center");
    expect(tagColumnAlign(TAG_COL.ItemName)).toBe("left");
  });

  it("knows which columns name a list row", () => {
    expect(listKindOfColumn(TAG_COL.SizeName)).toBe("size");
    expect(listKindOfColumn(TAG_COL.SeasonName)).toBe("season");
    expect(listKindOfColumn(TAG_COL.Model)).toBe("");
    expect(listKindOfField("colourName")).toBe("colour");
    expect(listKindOfField("model")).toBeNull();
  });
});
