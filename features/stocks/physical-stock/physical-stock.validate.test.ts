import { describe, expect, it } from "vitest";
import { blankLine, createDraft, lineFromSheet } from "./physical-stock.state";
import type { CountSheetRow, PhysicalStockDraft } from "./physical-stock.types";
import { validateBeforeSave } from "./physical-stock.validate";

const ROW: CountSheetRow = {
  lineNo: 1,
  splitNo: 1,
  itemId: "item-a",
  itemCode: null,
  itemName: "MILK",
  lotId: "lot-1",
  godownId: "g1",
  godownName: null,
  bucket: "SALEABLE",
  baseUomId: "u1",
  unitName: null,
  batchNo: null,
  mfgDate: null,
  expiryDate: null,
  mrp: null,
  salePrice: null,
  serialNo: null,
  supplierId: null,
  bookQty: 5,
  avgCostRate: 2,
  stockValue: 10,
  countedQty: null,
};

function ready(overrides: Partial<PhysicalStockDraft> = {}): PhysicalStockDraft {
  return {
    ...createDraft({
      scope: { companyId: "c1", branchId: "b1", accYear: "2026-2027", deviceId: "d1" },
      today: "2026-10-02",
      now: "2026-10-02T09:00",
    }),
    godownId: "g1",
    lines: [{ ...lineFromSheet(ROW, "a"), countedText: "5" }, blankLine("blank")],
    ...overrides,
  };
}

describe("validateBeforeSave — same order, same words as the Qt screen", () => {
  it("passes a sheet with one walked line", () => {
    expect(validateBeforeSave(ready())).toBeNull();
  });

  it("wants the godown first", () => {
    expect(validateBeforeSave(ready({ godownId: "" }))).toEqual({
      title: "Godown required",
      message: "A count is of one godown's holdings.",
      focus: "godown",
    });
  });

  it("wants a real count date", () => {
    expect(validateBeforeSave(ready({ docDate: "2026-02-30" }))?.title).toBe("Date required");
    expect(validateBeforeSave(ready({ docDate: "" }))?.focus).toBe("docDate");
  });

  it("refuses a session with no registered device", () => {
    expect(validateBeforeSave(ready({ deviceId: "" }))?.title).toBe("No device");
  });

  it("refuses a freeze window that does not end after it starts", () => {
    const refusal = validateBeforeSave(
      ready({ freezeStock: true, freezeFrom: "2026-10-02T12:00", freezeTo: "2026-10-02T12:00" }),
    );
    expect(refusal?.title).toBe("Freeze window");
    expect(refusal?.focus).toBe("freezeTo");
    // An off freeze is not checked at all.
    expect(
      validateBeforeSave(
        ready({ freezeStock: false, freezeFrom: "2026-10-02T12:00", freezeTo: "2026-10-02T11:00" }),
      ),
    ).toBeNull();
  });

  it("tells 'nothing counted yet' from 'no lines'", () => {
    const uncounted = ready({ lines: [lineFromSheet(ROW, "a"), blankLine("blank")] });
    expect(validateBeforeSave(uncounted)?.title).toBe("Nothing counted yet");
    const empty = ready({ lines: [blankLine("blank")] });
    expect(validateBeforeSave(empty)).toEqual({
      title: "No lines",
      message: "Add the holdings to count — pick an item or scan a barcode.",
    });
  });
});
