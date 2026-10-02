import { describe, expect, it } from "vitest";
import type { UiTableColumnRow } from "@/features/sales/quotation/quotation.types";
import {
  OPENING_STOCK_COLUMNS,
  isCellEditable,
  isCellGreyed,
  resolveOpeningStockColumns,
} from "./opening-stock.columns";
import { OS_COLUMN_COUNT, OS_COL } from "./opening-stock.constants";
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
  it("cover all 39 OpeningStockCols, once each", () => {
    expect(OPENING_STOCK_COLUMNS).toHaveLength(OS_COLUMN_COUNT);
    expect(new Set(OPENING_STOCK_COLUMNS.map((meaning) => meaning.number)).size).toBe(OS_COLUMN_COUNT);
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
    expect(fallback).toHaveLength(OS_COLUMN_COUNT);
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
