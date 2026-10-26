import { describe, expect, it } from "vitest";
import type { UiTableColumnRow } from "@/features/sales/quotation/quotation.types";
import {
  OPENING_STOCK_COLUMNS,
  isCellEditable,
  isCellGreyed,
  isEnterStop,
  resolveOpeningStockColumns,
  withBatchDetailColumns,
} from "./opening-stock.columns";
import { OS_COLUMN_COUNT, OS_COL, OS_LINE_FIELD_SLOTS } from "./opening-stock.constants";
import { blankLine } from "./opening-stock.lines";

function layoutRow(no: number, name: string, overrides: Partial<UiTableColumnRow> = {}): UiTableColumnRow {
  return {
    uiTblClmId: String(1000 + no),
    uiTblClmNo: String(no),
    uiTblClmName: name,
    uiTblClmColumnWidth: 7,
    uiTblClmColumnVisibility: true,
    uiTblClmColumnFocus: false,
    uiTblClmColumnPosition: no,
    uiTblClmColumnNecessity: false,
    ...overrides,
  };
}

function column(number: number) {
  const meaning = OPENING_STOCK_COLUMNS.find((candidate) => candidate.number === number);
  if (!meaning) {
    throw new Error(`no column ${number}`);
  }
  return meaning;
}

describe("the column meanings", () => {
  it("cover all 45 OpeningStockCols once each, but the three the line holds as fields", () => {
    const columns = OS_COLUMN_COUNT - OS_LINE_FIELD_SLOTS.length;
    expect(OPENING_STOCK_COLUMNS).toHaveLength(columns);
    expect(new Set(OPENING_STOCK_COLUMNS.map((meaning) => meaning.number)).size).toBe(columns);
    for (const slot of OS_LINE_FIELD_SLOTS) {
      expect(OPENING_STOCK_COLUMNS.some((meaning) => meaning.number === slot)).toBe(false);
    }
  });

  it("align money right and counts centred, by meaning", () => {
    expect(column(OS_COL.CostRate).align).toBe("right");
    expect(column(OS_COL.CostRateWot).align).toBe("right");
    expect(column(OS_COL.Qty).align).toBe("center");
    expect(column(OS_COL.ExpiryDate).align).toBe("center");
    expect(column(OS_COL.Remarks).align).toBe("left");
  });
});

describe("resolveOpeningStockColumns", () => {
  it("joins the layout by column NUMBER, so a renamed column still lands on its meaning", () => {
    const resolved = resolveOpeningStockColumns([
      layoutRow(OS_COL.CostPerUnit, "Cost / Unit", { uiTblClmColumnPosition: 16 }),
      layoutRow(OS_COL.CostRate, "Cost Rate / base unit", { uiTblClmColumnPosition: 38 }),
      layoutRow(OS_COL.Description, "Item Name", { uiTblClmColumnPosition: 5, uiTblClmColumnFocus: true }),
      layoutRow(99, "Not a column"),
    ]);
    expect(resolved.map((entry) => entry.key)).toEqual(["itemName", "costPerUnit", "costRate"]);
    expect(resolved[0].header).toBe("Item Name");
    expect(resolved[0].focus).toBe(true);
  });

  it("sizes from a dragged width first, else the Qt fraction", () => {
    const [dragged] = resolveOpeningStockColumns([layoutRow(OS_COL.Qty, "Qty", { uiTblClmPx: "120px" })]);
    expect(dragged.widthPx).toBe(120);
    const [fraction] = resolveOpeningStockColumns([layoutRow(OS_COL.Qty, "Qty")]);
    expect(fraction.widthPx).toBe(77);
  });

  it("hides what the layout hides", () => {
    const [hidden] = resolveOpeningStockColumns([
      layoutRow(OS_COL.ItemId, "ItemId", { uiTblClmColumnVisibility: false }),
    ]);
    expect(hidden.visible).toBe(false);
  });

  it("falls back to the .ui's headings with the reference ids hidden", () => {
    const fallback = resolveOpeningStockColumns(undefined);
    expect(fallback).toHaveLength(OS_COLUMN_COUNT - OS_LINE_FIELD_SLOTS.length);
    // Size / Colour / Model sit straight after Batch No, as ui table 27 has them.
    const keys = fallback.map((entry) => entry.key);
    const batchAt = keys.indexOf("batchNo");
    expect(keys.slice(batchAt, batchAt + 4)).toEqual(["batchNo", "sizeName", "colourName", "model"]);
    expect(fallback.find((entry) => entry.number === OS_COL.Description)?.header).toBe("Item");
    expect(fallback.find((entry) => entry.number === OS_COL.ItemId)?.visible).toBe(false);
  });
});

describe("which cells open", () => {
  const tracked = { ...blankLine(), itemId: "item-1", trackSignature: "BE" };

  it("opens nothing on a frozen document", () => {
    expect(isCellEditable(column(OS_COL.Qty), tracked, false)).toBe(false);
    expect(isCellEditable(column(OS_COL.Description), tracked, false)).toBe(false);
  });

  it("opens only the picker and the barcode on a row with no item", () => {
    const blank = blankLine();
    expect(isCellEditable(column(OS_COL.Description), blank, true)).toBe(true);
    expect(isCellEditable(column(OS_COL.Barcode), blank, true)).toBe(true);
    expect(isCellEditable(column(OS_COL.Qty), blank, true)).toBe(false);
    // Once the row has its item, the barcode is history.
    expect(isCellEditable(column(OS_COL.Barcode), tracked, true)).toBe(false);
  });

  it("lets the ITEM decide the identity cells", () => {
    expect(isCellEditable(column(OS_COL.BatchNo), tracked, true)).toBe(true);
    expect(isCellEditable(column(OS_COL.ExpiryDate), tracked, true)).toBe(true);
    expect(isCellEditable(column(OS_COL.Mrp), tracked, true)).toBe(false);
    expect(isCellEditable(column(OS_COL.SupplierName), tracked, true)).toBe(false);
    expect(isCellGreyed(column(OS_COL.Mrp), tracked)).toBe(true);
    expect(isCellGreyed(column(OS_COL.BatchNo), tracked)).toBe(false);
    const pharma = { ...tracked, trackSignature: "BMEP" };
    expect(isCellEditable(column(OS_COL.SupplierName), pharma, true)).toBe(true);
  });

  it("never opens a derived figure", () => {
    expect(isCellEditable(column(OS_COL.CostRate), tracked, true)).toBe(false);
    expect(isCellEditable(column(OS_COL.Value), tracked, true)).toBe(false);
    expect(isCellEditable(column(OS_COL.TrackedBy), tracked, true)).toBe(false);
    expect(isCellEditable(column(OS_COL.CostPerUnit), tracked, true)).toBe(true);
    expect(isCellEditable(column(OS_COL.Bucket), tracked, true)).toBe(true);
  });
});

describe("where Enter stops — Qt setFocusCellFilter, per row", () => {
  const stopsOf = (line: ReturnType<typeof blankLine>) =>
    OPENING_STOCK_COLUMNS.filter((meaning) => isEnterStop(meaning, line)).map((meaning) => meaning.key);

  it("stops a blank row at Barcode, then Item", () => {
    expect(stopsOf(blankLine())).toEqual(["barcode", "itemName"]);
  });

  it("stops a row with an item at Qty, the cells its item is tracked by, then Cost / Unit", () => {
    const untracked = { ...blankLine(), itemId: "i", trackSignature: "N" };
    expect(stopsOf(untracked)).toEqual(["qty", "costPerUnit"]);
    const tracked = { ...blankLine(), itemId: "i", trackSignature: "BEMSRP" };
    expect(stopsOf(tracked)).toEqual([
      "qty",
      "batchNo",
      "mfgDate",
      "expiryDate",
      "mrp",
      "salePrice",
      "serialNo",
      "costPerUnit",
      "supplierName",
    ]);
    // Never a greyed cell: an item tracked by batch alone skips expiry and MRP.
    expect(stopsOf({ ...blankLine(), itemId: "i", trackSignature: "B" })).toEqual(["qty", "batchNo", "costPerUnit"]);
  });

  it("is never a cell the row is not keyed through (Free, Tax, Bucket stay click-only)", () => {
    const line = { ...blankLine(), itemId: "i", trackSignature: "B" };
    for (const number of [OS_COL.FreeQty, OS_COL.TaxPerc, OS_COL.Bucket, OS_COL.Barcode, OS_COL.Description]) {
      expect(isEnterStop(column(number), line)).toBe(false);
    }
  });
});

describe("textile — Size, Colour, Model (Qt 74b755c)", () => {
  const BATCH_DETAIL = [OS_COL.SizeName, OS_COL.ColourName, OS_COL.Model];
  const shirt = { ...blankLine(), itemId: "shirt", trackSignature: "B" };

  it("shows them exactly while the company numbers its own batches, whatever the layout says", () => {
    const layout = resolveOpeningStockColumns([
      layoutRow(OS_COL.BatchNo, "Batch No"),
      layoutRow(OS_COL.SizeName, "Size", { uiTblClmColumnVisibility: false, uiTblClmColumnPosition: 9.1 }),
      layoutRow(OS_COL.ColourName, "Colour", { uiTblClmColumnPosition: 9.2 }),
      layoutRow(OS_COL.Model, "Model", { uiTblClmColumnPosition: 9.3 }),
      layoutRow(OS_COL.MfgDate, "Mfg Date"),
    ]);
    const visibleOf = (autoBatchNo: boolean) =>
      withBatchDetailColumns(layout, autoBatchNo)
        .filter((entry) => entry.visible)
        .map((entry) => entry.key);
    expect(visibleOf(false)).toEqual(["batchNo", "mfgDate"]);
    expect(visibleOf(true)).toEqual(["batchNo", "sizeName", "colourName", "model", "mfgDate"]);
    // The layout's own heading stands.
    expect(withBatchDetailColumns(layout, true).find((entry) => entry.key === "sizeName")?.header).toBe("Size");
  });

  it("puts one the layout has no row for straight after Batch No (a deployment that predates them)", () => {
    const layout = resolveOpeningStockColumns([
      layoutRow(OS_COL.Qty, "Qty"),
      layoutRow(OS_COL.BatchNo, "Batch No"),
      layoutRow(OS_COL.Model, "Model No", { uiTblClmColumnPosition: 40 }),
      layoutRow(OS_COL.MfgDate, "Mfg Date"),
    ]);
    const shown = withBatchDetailColumns(layout, true);
    expect(shown.map((entry) => entry.key)).toEqual(["qty", "batchNo", "sizeName", "colourName", "mfgDate", "model"]);
    const added = shown.find((entry) => entry.key === "colourName");
    expect(added?.header).toBe("Colour");
    expect(added?.visible).toBe(true);
    expect(added?.columnId).toBeNull();
    // Off, nothing is added (and the one the layout has is hidden).
    const off = withBatchDetailColumns(layout, false);
    expect(off.map((entry) => entry.key)).toEqual(["qty", "batchNo", "mfgDate", "model"]);
    expect(off.find((entry) => entry.key === "model")?.visible).toBe(false);
  });

  it("open only on an item tracked by batch, under the setting, with a batch not typed by hand", () => {
    for (const number of BATCH_DETAIL) {
      expect(isCellEditable(column(number), shirt, true, true)).toBe(true);
      expect(isCellGreyed(column(number), shirt, true)).toBe(false);
      // The setting off.
      expect(isCellEditable(column(number), shirt, true, false)).toBe(false);
      // A typed batch number.
      expect(isCellEditable(column(number), { ...shirt, batchTyped: true }, true, true)).toBe(false);
      expect(isCellGreyed(column(number), { ...shirt, batchTyped: true }, true)).toBe(true);
      // An item not tracked by batch.
      expect(isCellEditable(column(number), { ...shirt, trackSignature: "ME" }, true, true)).toBe(false);
      // No item, or a frozen document.
      expect(isCellEditable(column(number), blankLine(), true, true)).toBe(false);
      expect(isCellEditable(column(number), shirt, false, true)).toBe(false);
    }
  });

  it("are Enter stops right after Batch No under the same rule", () => {
    const stopsOf = (line: typeof shirt, autoBatchNo: boolean) =>
      OPENING_STOCK_COLUMNS.filter((meaning) => isEnterStop(meaning, line, autoBatchNo)).map((meaning) => meaning.key);
    expect(stopsOf(shirt, true)).toEqual(["qty", "batchNo", "costPerUnit", "sizeName", "colourName", "model"]);
    expect(stopsOf(shirt, false)).toEqual(["qty", "batchNo", "costPerUnit"]);
    expect(stopsOf({ ...shirt, batchTyped: true }, true)).toEqual(["qty", "batchNo", "costPerUnit"]);
    expect(stopsOf({ ...shirt, trackSignature: "N" }, true)).toEqual(["qty", "costPerUnit"]);
  });
});
