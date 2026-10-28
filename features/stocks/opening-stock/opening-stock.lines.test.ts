import { describe, expect, it } from "vitest";
import {
  blankLine,
  choiceNames,
  computeTotals,
  distinctChoices,
  dateFromWire,
  dateToWire,
  isUnparsableDate,
  isLockedBatchDetail,
  isUntrackedIdentityField,
  lineNumbersOf,
  normalizeGridDate,
  normalizeModel,
  normalizeSignature,
  parseGridNumber,
  ratePrecision,
  recalcLine,
  resolveChoice,
  takesBatchDetail,
  trackedBy,
  tracks,
  withBatchNoEdited,
  withFetchedModels,
  withTrailingBlank,
  withTypedModel,
} from "./opening-stock.lines";
import type { OpeningStockLine } from "./opening-stock.types";

function line(overrides: Partial<OpeningStockLine> = {}): OpeningStockLine {
  return { ...blankLine(), itemId: "item-1", toBaseFactor: 1, trackSignature: "N", ...overrides };
}

describe("tracking signature", () => {
  it("reads one facet letter at a time; empty tracks nothing", () => {
    expect(tracks("BME", "B")).toBe(true);
    expect(tracks("BME", "R")).toBe(false);
    expect(tracks("", "B")).toBe(false);
    expect(tracks(null, "B")).toBe(false);
  });

  it("labels the Tracked by column in the Qt order", () => {
    expect(trackedBy("BMEP")).toBe("batch + expiry + MRP + supplier");
    expect(trackedBy("SR")).toBe("sale price + serial");
    expect(trackedBy("N")).toBe("nothing");
    expect(trackedBy("")).toBe("nothing");
  });

  it("stores a blank signature as N", () => {
    expect(normalizeSignature(null)).toBe("N");
    expect(normalizeSignature("  ")).toBe("N");
    expect(normalizeSignature("BE")).toBe("BE");
  });

  it("greys exactly the identity cells the item does not track", () => {
    const row = line({ trackSignature: "BE" });
    expect(isUntrackedIdentityField(row, "batchNo")).toBe(false);
    expect(isUntrackedIdentityField(row, "expiryDate")).toBe(false);
    expect(isUntrackedIdentityField(row, "mfgDate")).toBe(false);
    expect(isUntrackedIdentityField(row, "mrp")).toBe(true);
    expect(isUntrackedIdentityField(row, "serialNo")).toBe(true);
    expect(isUntrackedIdentityField(row, "supplierName")).toBe(true);
    // Not an identity cell at all.
    expect(isUntrackedIdentityField(row, "qty")).toBe(false);
  });
});

describe("recalcLine", () => {
  it("values a BOX line per BASE unit — 10 boxes of 12 at 240 a box is 2,400, not 28,800", () => {
    const result = recalcLine(line({ qty: 10, toBaseFactor: 12, costPerUnit: 240 }));
    expect(result.baseQty).toBe(120);
    expect(result.costRate).toBe(20);
    expect(result.value).toBe(2400);
  });

  it("counts free goods into the base quantity's value", () => {
    const result = recalcLine(line({ qty: 2, freeQty: 1, toBaseFactor: 12, costPerUnit: 120 }));
    expect(result.freeBaseQty).toBe(12);
    expect(result.value).toBe((24 + 12) * 10);
  });

  it("derives the without-tax rate only while it is blank", () => {
    const derived = recalcLine(line({ qty: 1, costPerUnit: 105, taxPerc: 5 }));
    expect(derived.costRateWot).toBeCloseTo(100, 6);
    expect(derived.valueWot).toBeCloseTo(100, 6);

    const typed = recalcLine(line({ qty: 1, costPerUnit: 105, taxPerc: 5, costRateWot: 90 }));
    expect(typed.costRateWot).toBe(90);
    expect(typed.valueWot).toBe(90);
  });

  it("takes the cost itself as the without-tax rate when there is no tax", () => {
    expect(recalcLine(line({ qty: 3, costPerUnit: 10 })).costRateWot).toBe(10);
  });

  it("treats a factor of 0 as 1", () => {
    const result = recalcLine(line({ qty: 4, toBaseFactor: 0, costPerUnit: 5 }));
    expect(result.baseQty).toBe(4);
    expect(result.value).toBe(20);
  });

  it("leaves a row with no item alone", () => {
    const row = { ...blankLine(), qty: 5, costPerUnit: 10 };
    expect(recalcLine(row)).toBe(row);
  });
});

describe("totals and line numbers — Qt lineNumbers(), the one rule", () => {
  it("counts LINES, not rows, and sums base quantities", () => {
    const rows = [
      line({ key: "a", splitNo: 1, baseQty: 10, value: 100, valueWot: 90 }),
      line({ key: "b", splitNo: 2, baseQty: 5, freeBaseQty: 1, value: 50, valueWot: 45 }),
      line({ key: "c", splitNo: 0, baseQty: 2, value: 20, valueWot: 20 }),
      blankLine("d"),
    ];
    expect(computeTotals(rows)).toEqual({ lines: 2, qty: 18, value: 170, valueWot: 155 });
    const numbers = lineNumbersOf(rows);
    expect(numbers.get("a")).toEqual({ lineNo: 1, splitNo: 1 });
    expect(numbers.get("b")).toEqual({ lineNo: 1, splitNo: 2 });
    expect(numbers.get("c")).toEqual({ lineNo: 2, splitNo: 1 });
    expect(numbers.has("d")).toBe(false);
  });

  it("continues a line only under the SAME item — a split under another item is its own line", () => {
    const rows = [
      line({ key: "a", itemId: "item-1", splitNo: 1 }),
      line({ key: "b", itemId: "item-2", splitNo: 2 }),
      line({ key: "c", itemId: "item-2", splitNo: 3 }),
    ];
    const numbers = lineNumbersOf(rows);
    expect(numbers.get("a")).toEqual({ lineNo: 1, splitNo: 1 });
    // Used to be counted as split 2 of item-1's line.
    expect(numbers.get("b")).toEqual({ lineNo: 2, splitNo: 1 });
    expect(numbers.get("c")).toEqual({ lineNo: 2, splitNo: 2 });
    expect(computeTotals(rows).lines).toBe(2);
  });

  it("starts a line on a split with nothing above it (its first row was removed)", () => {
    const numbers = lineNumbersOf([line({ key: "a", splitNo: 2 }), line({ key: "b", splitNo: 3 })]);
    expect(numbers.get("a")).toEqual({ lineNo: 1, splitNo: 1 });
    expect(numbers.get("b")).toEqual({ lineNo: 1, splitNo: 2 });
  });

  it("renumbers splits 1, 2, 3 in row order, so a (line, split) is never sent twice", () => {
    const numbers = lineNumbersOf([
      line({ key: "a", splitNo: 1 }),
      line({ key: "b", splitNo: 3 }),
      line({ key: "c", splitNo: 2 }),
      line({ key: "d", splitNo: 2 }),
    ]);
    expect([...numbers.values()]).toEqual([
      { lineNo: 1, splitNo: 1 },
      { lineNo: 1, splitNo: 2 },
      { lineNo: 1, splitNo: 3 },
      { lineNo: 1, splitNo: 4 },
    ]);
  });

  it("is not broken by a blank row between two splits", () => {
    const numbers = lineNumbersOf([line({ key: "a", splitNo: 1 }), blankLine("x"), line({ key: "b", splitNo: 2 })]);
    expect(numbers.get("b")).toEqual({ lineNo: 1, splitNo: 2 });
  });

  it("keeps exactly one trailing row with no item", () => {
    const withItem = [line({ key: "a" })];
    expect(withTrailingBlank(withItem)).toHaveLength(2);
    const already = [line({ key: "a" }), blankLine("b")];
    expect(withTrailingBlank(already)).toHaveLength(2);
    expect(withTrailingBlank([])).toHaveLength(1);
  });
});

describe("grid numbers", () => {
  it("lets through what QDoubleValidator(0, 999999999, n) would", () => {
    expect(parseGridNumber("", 3)).toBe(0);
    expect(parseGridNumber("1,250.5", 3)).toBe(1250.5);
    expect(parseGridNumber("2.123456789", 6)).toBe(2.123457);
    expect(parseGridNumber("-3", 3)).toBeNull();
    expect(parseGridNumber("abc", 3)).toBeNull();
    expect(parseGridNumber("12", 0)).toBe(12);
  });

  it("shows a rate to as many places as it carries, two to six", () => {
    expect(ratePrecision(20)).toBe(2);
    expect(ratePrecision(19.047619)).toBe(6);
    expect(ratePrecision(1.5)).toBe(2);
    expect(ratePrecision(1.125)).toBe(3);
  });
});

describe("dates", () => {
  it("turns the cell's dd/mm/yyyy into ISO and back", () => {
    expect(dateToWire("31/03/2027")).toBe("2027-03-31");
    expect(dateToWire("31-03-2027")).toBe("2027-03-31");
    expect(dateToWire("2027-03-31T00:00:00.000Z")).toBe("2027-03-31");
    expect(dateFromWire("2027-03-31T00:00:00")).toBe("31/03/2027");
    expect(dateFromWire("")).toBe("");
  });

  it("drops anything that is not a real date, and says so", () => {
    expect(dateToWire("31/02/2027")).toBe("");
    expect(dateToWire("31-03-20")).toBe("");
    expect(isUnparsableDate("31-03-20")).toBe(true);
    expect(isUnparsableDate("")).toBe(false);
    expect(isUnparsableDate("31/03/2027")).toBe(false);
  });

  it("normalises what the mask would have filled in", () => {
    expect(normalizeGridDate("31032027")).toBe("31/03/2027");
    expect(normalizeGridDate("1/3/2027")).toBe("01/03/2027");
    expect(normalizeGridDate("31.03.2027")).toBe("31/03/2027");
    expect(normalizeGridDate("31-03-2027")).toBe("31/03/2027");
    expect(normalizeGridDate("31/13/2027")).toBe("31/13/2027");
    expect(normalizeGridDate("  ")).toBe("");
  });
});

describe("textile — size / colour / model (Qt 74b755c)", () => {
  const batch = line({ trackSignature: "BE" });

  it("a line takes them only when the company numbers its batches AND the item tracks batch", () => {
    expect(takesBatchDetail(true, "BE")).toBe(true);
    expect(takesBatchDetail(false, "BE")).toBe(false);
    expect(takesBatchDetail(true, "ME")).toBe(false);
    expect(takesBatchDetail(true, "")).toBe(false);
  });

  it("locks the three on a typed batch number, and on any line that does not take them", () => {
    expect(isLockedBatchDetail(batch, true)).toBe(false);
    expect(isLockedBatchDetail({ ...batch, batchTyped: true }, true)).toBe(true);
    expect(isLockedBatchDetail(batch, false)).toBe(true);
    expect(isLockedBatchDetail(line({ trackSignature: "N" }), true)).toBe(true);
    // The same answer greys the cell and refuses its editor.
    expect(isUntrackedIdentityField(batch, "sizeName", true)).toBe(false);
    expect(isUntrackedIdentityField({ ...batch, batchTyped: true }, "model", true)).toBe(true);
    expect(isUntrackedIdentityField(batch, "colourName")).toBe(true);
  });

  it("a fresh row carries none of them, and no typed batch", () => {
    const blank = blankLine();
    expect([blank.sizeId, blank.sizeName, blank.colourId, blank.colourName, blank.model]).toEqual(["", "", "", "", ""]);
    expect(blank.batchTyped).toBe(false);
  });

  describe("a batch number committed — onBatchNoEdited()", () => {
    const keyed = { ...batch, sizeId: "isz-1", sizeName: "XL", colourId: "icl-1", colourName: "Red", model: "Slim" };

    it("typed: marks it, clears the five and says so when there was something to clear", () => {
      const { line: edited, cleared } = withBatchNoEdited(keyed, "ZT-1", true);
      expect(edited.batchNo).toBe("ZT-1");
      expect(edited.batchTyped).toBe(true);
      expect([edited.sizeId, edited.sizeName, edited.colourId, edited.colourName, edited.model]).toEqual([
        "",
        "",
        "",
        "",
        "",
      ]);
      expect(cleared).toBe(true);
      // Nothing to clear, nothing to say.
      expect(withBatchNoEdited(batch, "ZT-1", true).cleared).toBe(false);
      // A model alone is enough to be worth a word.
      expect(withBatchNoEdited({ ...batch, model: "Slim" }, "ZT-1", true).cleared).toBe(true);
    });

    it("blank: not typed — the server gives one", () => {
      const { line: edited, cleared } = withBatchNoEdited({ ...keyed, batchTyped: true }, "  ", true);
      expect(edited.batchTyped).toBe(false);
      expect(edited.sizeId).toBe("isz-1");
      expect(cleared).toBe(false);
    });

    it("with the setting off, still marks it typed but clears nothing", () => {
      const { line: edited, cleared } = withBatchNoEdited(keyed, "B1", false);
      expect(edited.batchTyped).toBe(true);
      expect(edited.sizeName).toBe("XL");
      expect(cleared).toBe(false);
    });
  });

  describe("a Size / Colour name committed", () => {
    const sizes = [
      { id: "isz-xl", name: "XL" },
      { id: "isz-xl-own", name: "xl" },
      { id: "isz-free", name: "Free Size" },
    ];

    it("a name equal to a row, ignoring case, takes that row's id and spelling — the first one", () => {
      expect(resolveChoice(sizes, "Xl")).toEqual({ id: "isz-xl", name: "XL" });
      expect(resolveChoice(sizes, "  free   size ")).toEqual({ id: "isz-free", name: "Free Size" });
    });

    it("any other name keeps the id blank (the screen offers to add it); blank is none", () => {
      expect(resolveChoice(sizes, "XXL")).toEqual({ id: "", name: "XXL" });
      expect(resolveChoice(sizes, "fr")).toEqual({ id: "", name: "fr" });
      expect(resolveChoice(sizes, "   ")).toEqual({ id: "", name: "" });
      expect(resolveChoice([], "XL")).toEqual({ id: "", name: "XL" });
    });

    it("offers a name shared by two rows once, in list order", () => {
      expect(choiceNames(sizes)).toEqual(["XL", "Free Size"]);
    });

    it("the pick-list keeps the rows (ids), one per name, first wins", () => {
      expect(distinctChoices(sizes).map((choice) => choice.name)).toEqual(["XL", "Free Size"]);
      expect(distinctChoices(sizes)[0]).toEqual(sizes[0]);
    });
  });

  describe("the Model cell", () => {
    it("collapses whitespace and holds sbd_model's 100", () => {
      expect(normalizeModel("  ZT  Slim fit ")).toBe("ZT Slim fit");
      expect(normalizeModel("x".repeat(120))).toHaveLength(100);
    });

    it("puts a typed model in front of the item's suggestions unless it is there (ignoring case)", () => {
      expect(withTypedModel(["Regular"], "Slim fit")).toEqual(["Slim fit", "Regular"]);
      expect(withTypedModel(["Slim Fit", "Regular"], "slim fit")).toEqual(["Slim Fit", "Regular"]);
      expect(withTypedModel(["Regular"], "")).toEqual(["Regular"]);
    });

    it("keeps models typed meanwhile in front of the server's", () => {
      expect(withFetchedModels(["Typed"], ["Older", "typed", " ", "Oldest"])).toEqual(["Typed", "Older", "Oldest"]);
    });
  });
});
