import { describe, expect, it } from "vitest";
import type { UiTableColumnRow } from "@/features/sales/quotation/quotation.types";
import {
  FALLBACK_COUNT_LAYOUT,
  canOpenPicker,
  cellText,
  isCellEditable,
  isEntryStop,
  nextStop,
  previousStop,
  resolveCountLayout,
  rowStops,
  varianceTone,
  visibleCountColumns,
} from "./physical-stock.columns";
import { PhysicalStockCols as Cols } from "./physical-stock.constants";
import { blankLine, recalcLine } from "./physical-stock.state";
import type { CountLine } from "./physical-stock.types";

function row(no: number, overrides: Partial<UiTableColumnRow> = {}): UiTableColumnRow {
  return {
    uiTblClmId: `id-${no}`,
    uiTblClmNo: String(no),
    uiTblClmName: `Col ${no}`,
    uiTblClmColumnWidth: 5,
    uiTblClmPx: null,
    uiTblClmColumnVisibility: true,
    uiTblClmColumnFocus: false,
    uiTblClmColumnPosition: no,
    uiTblClmColumnNecessity: false,
    ...overrides,
  };
}

const holding: CountLine = recalcLine({
  ...blankLine("h"),
  lineNo: 4,
  itemName: "MILK",
  lotId: "lot-1",
  bucket: "SALEABLE",
  bookQty: 10,
  avgCostRate: 2.5,
  mrp: 1234.5,
  expiryDate: "2026-12-31",
  countedText: "7",
});

describe("resolveCountLayout — joined by column NUMBER, ordered by position", () => {
  it("takes the heading, width, visibility and focus from the row with that number", () => {
    const layout = resolveCountLayout([
      row(Cols.CountedQty, { uiTblClmName: "Found", uiTblClmColumnFocus: true, uiTblClmColumnPosition: 1 }),
      row(Cols.Barcode, { uiTblClmName: "Scan", uiTblClmColumnPosition: 0 }),
      row(Cols.Description, { uiTblClmColumnVisibility: false, uiTblClmColumnPosition: 2 }),
    ]);
    const visible = visibleCountColumns(layout, false);
    expect(visible.map((column) => column.no)).toEqual([Cols.Barcode, Cols.CountedQty]);
    expect(visible[1].label).toBe("Found");
    expect(visible[1].focus).toBe(true);
    expect(visible[1].kind).toBe("counted");
  });

  it("hides a column the layout carries no row for", () => {
    const layout = resolveCountLayout([row(Cols.CountedQty)]);
    expect(visibleCountColumns(layout, false).map((column) => column.no)).toEqual([Cols.CountedQty]);
  });

  it("falls back to the shipped layout when there is none", () => {
    const visible = visibleCountColumns(resolveCountLayout(undefined), false);
    expect(visible[0].no).toBe(Cols.Barcode);
    expect(visible.map((column) => column.label)).toContain("Counted Qty");
    expect(visible.some((column) => column.no === Cols.LotId)).toBe(false);
    expect(FALLBACK_COUNT_LAYOUT).toHaveLength(30);
  });

  it("prefers a dragged pixel width over the percentage", () => {
    const [column] = visibleCountColumns(
      resolveCountLayout([row(Cols.Remarks, { uiTblClmPx: "180px" })]),
      false,
    );
    expect(column.widthPx).toBe(180);
    expect(column.widthPct).toBe(5);
  });

  it("a blind count drops Book Qty, Difference and Diff Value", () => {
    const layout = resolveCountLayout(undefined);
    const blind = visibleCountColumns(layout, true).map((column) => column.no);
    expect(blind).not.toContain(Cols.BookQty);
    expect(blind).not.toContain(Cols.DiffQty);
    expect(blind).not.toContain(Cols.DiffValue);
    expect(blind).toContain(Cols.CountedQty);
  });
});

describe("the Enter walk — Qt setFocusStops + setFocusCellFilter", () => {
  const visible = visibleCountColumns(resolveCountLayout(undefined), false);
  const blank = blankLine("blank");
  const second = { ...holding, key: "h2", lotId: "lot-2" };

  it("a blank row stops at Barcode then Item; a holding at Counted Qty only", () => {
    expect(rowStops(visible, blank)).toEqual([Cols.Barcode, Cols.Description]);
    expect(rowStops(visible, holding)).toEqual([Cols.CountedQty]);
    // Reason and Remarks stay editable by click, but are never a stop.
    expect(isEntryStop(Cols.ReasonName, holding)).toBe(false);
    expect(isEntryStop(Cols.Remarks, holding)).toBe(false);
  });

  it("runs down Counted Qty, then into the blank row's Barcode", () => {
    const lines = [holding, second, blank];
    expect(nextStop(visible, lines, { row: 0, col: Cols.CountedQty })).toEqual({ row: 1, col: Cols.CountedQty });
    expect(nextStop(visible, lines, { row: 1, col: Cols.CountedQty })).toEqual({ row: 2, col: Cols.Barcode });
    expect(nextStop(visible, lines, { row: 2, col: Cols.Barcode })).toEqual({ row: 2, col: Cols.Description });
    expect(nextStop(visible, lines, { row: 2, col: Cols.Description })).toBeNull();
    // From a Reason cell (clicked into): on to the next line's count, never Remarks.
    expect(nextStop(visible, lines, { row: 0, col: Cols.ReasonName })).toEqual({ row: 1, col: Cols.CountedQty });
  });

  it("walks back the same way", () => {
    const lines = [holding, blank];
    expect(previousStop(visible, lines, { row: 1, col: Cols.Description })).toEqual({ row: 1, col: Cols.Barcode });
    expect(previousStop(visible, lines, { row: 1, col: Cols.Barcode })).toEqual({ row: 0, col: Cols.CountedQty });
    expect(previousStop(visible, lines, { row: 0, col: Cols.CountedQty })).toBeNull();
  });

  it("a hidden column is not a stop", () => {
    const noBarcode = visibleCountColumns(
      resolveCountLayout([row(Cols.Description), row(Cols.CountedQty), row(Cols.Remarks)]),
      false,
    );
    expect(rowStops(noBarcode, blank)).toEqual([Cols.Description]);
  });
});

describe("cellText", () => {
  it("paints each format the Qt grid's way", () => {
    expect(cellText(holding, Cols.Description)).toBe("MILK");
    expect(cellText(holding, Cols.ExpiryDate)).toBe("31/12/2026");
    expect(cellText(holding, Cols.Mrp)).toBe("1,234.50");
    expect(cellText(holding, Cols.BookQty)).toBe("10");
    expect(cellText(holding, Cols.CountedQty)).toBe("7");
    expect(cellText(holding, Cols.DiffQty)).toBe("-3");
    expect(cellText(holding, Cols.DiffValue)).toBe("-7.50");
    expect(cellText(holding, Cols.LineNo)).toBe("4");
  });

  it("a Number cell paints zero blank; Counted Qty keeps its 0", () => {
    const exact = recalcLine({ ...holding, countedText: "10" });
    expect(cellText(exact, Cols.DiffQty)).toBe("");
    const empty = recalcLine({ ...holding, countedText: "0" });
    expect(cellText(empty, Cols.CountedQty)).toBe("0");
  });

  it("Book Qty paints a book of 0 as 0 — a figure, not a gap; a blank row stays blank", () => {
    expect(cellText({ ...holding, bookQty: 0 }, Cols.BookQty)).toBe("0");
    expect(cellText({ ...holding, bookQty: 2.5 }, Cols.BookQty)).toBe("2.5");
    expect(cellText(blankLine("b"), Cols.BookQty)).toBe("");
  });

  it("Item carries a textile batch's size, colour and model after the name", () => {
    expect(
      cellText({ ...holding, itemName: "Shirt", sizeName: "XL", colourName: "Maroon", model: "Slim fit" }, Cols.Description),
    ).toBe("Shirt · XL · Maroon · Slim fit");
    expect(cellText({ ...holding, sizeName: "", colourName: "", model: "" }, Cols.Description)).toBe("MILK");
  });
});

describe("what the delegate opens", () => {
  const blank = blankLine("blank");

  it("Counted Qty and Remarks on a holding; Barcode only on the blank row", () => {
    expect(isCellEditable("counted", holding, true)).toBe(true);
    expect(isCellEditable("remarks", holding, true)).toBe(true);
    expect(isCellEditable("barcode", holding, true)).toBe(false);
    expect(isCellEditable("barcode", blank, true)).toBe(true);
    expect(isCellEditable("counted", blank, true)).toBe(false);
    expect(isCellEditable("readonly", holding, true)).toBe(false);
  });

  it("nothing at all on a read-only sheet", () => {
    expect(isCellEditable("counted", holding, false)).toBe(false);
    expect(canOpenPicker("reason", holding, false)).toBe(false);
  });

  it("the item picker on the blank row, the reason picker on a holding", () => {
    expect(canOpenPicker("item", blank, true)).toBe(true);
    expect(canOpenPicker("item", holding, true)).toBe(false);
    expect(canOpenPicker("reason", holding, true)).toBe(true);
    expect(canOpenPicker("reason", blank, true)).toBe(false);
  });
});

describe("varianceTone", () => {
  it("tints short and over, never an uncounted or a blind row", () => {
    expect(varianceTone(holding, false)).toBe("short");
    expect(varianceTone(recalcLine({ ...holding, countedText: "11" }), false)).toBe("over");
    expect(varianceTone(recalcLine({ ...holding, countedText: "10" }), false)).toBeNull();
    expect(varianceTone(recalcLine({ ...holding, countedText: "" }), false)).toBeNull();
    expect(varianceTone(holding, true)).toBeNull();
  });
});
