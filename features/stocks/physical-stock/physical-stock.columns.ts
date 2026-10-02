/**
 * The count grid's columns — `PhysicalStockCols` and the ui table 28 layout
 * joined the way NexTable::loadLayout joins them: by COLUMN NUMBER
 * (`ui_tbl_clm_no`), never by name. Ordered by `ui_tbl_clm_column_position`,
 * shown per `ui_tbl_clm_column_visibility`, sized as a percentage of the grid
 * (the Qt layout's own unit), with `ui_tbl_clm_column_focus` naming where
 * Enter stops.
 */
import type { UiTableColumnRow } from "@/features/sales/quotation/quotation.types";
import {
  BLIND_HIDDEN_COLUMNS,
  PHYSICAL_STOCK_COLUMN_COUNT,
  PhysicalStockCols as Cols,
} from "./physical-stock.constants";
import {
  displayDate,
  formatCurrencyCell,
  formatNumberCell,
} from "./physical-stock.format";
import type { CountLine } from "./physical-stock.types";

/** What a cell does when the operator reaches it. */
export type CountCellKind =
  /** The holding's own description — the delegate opens nothing. */
  | "readonly"
  /** THE editable cell: what was found. */
  | "counted"
  /** The one other cell the delegate opens. */
  | "remarks"
  /** Open only on the blank row — scanning is how a row GETS its holding. */
  | "barcode"
  /** Grid 71 — picks an item and resolves its holdings into rows. */
  | "item"
  /** Grid 102 — a reason for this line only. */
  | "reason";

export type CountColumnFormat = "text" | "number" | "date" | "currency";
export type CountColumnAlign = "left" | "center" | "right";

export type CountColumnMeta = {
  no: number;
  /** The .ui header — what shows when the layout names no heading. */
  header: string;
  format: CountColumnFormat;
  align: CountColumnAlign;
  kind: CountCellKind;
};

const RIGHT = new Set<number>([Cols.Mrp, Cols.SalePrice, Cols.AvgCostRate, Cols.DiffValue, Cols.StockValue]);
const CENTER = new Set<number>([
  Cols.LineNo,
  Cols.SplitNo,
  Cols.BookQty,
  Cols.CountedQty,
  Cols.DiffQty,
  Cols.ExpiryDate,
  Cols.MfgDate,
]);

/** `PhysicalStockCols::alignment` — money right, counts centred, the rest left. */
export function columnAlign(no: number): CountColumnAlign {
  if (RIGHT.has(no)) {
    return "right";
  }
  return CENTER.has(no) ? "center" : "left";
}

function meta(
  no: number,
  header: string,
  format: CountColumnFormat,
  kind: CountCellKind = "readonly",
): CountColumnMeta {
  return { no, header, format, align: columnAlign(no), kind };
}

/**
 * Every column, in enum order, with the format `PhysicalStockCols::formats()`
 * gives it. Counted Qty is TEXT, not Number, on purpose: a Number cell paints 0
 * as blank, and 0 ("walked, found nothing") must never look like blank ("not
 * walked yet").
 */
export const COUNT_COLUMN_META: readonly CountColumnMeta[] = [
  meta(Cols.Id, "Id", "text"),
  meta(Cols.LineNo, "#", "number"),
  meta(Cols.ItemCode, "Code", "text"),
  meta(Cols.Description, "Item", "text", "item"),
  meta(Cols.UomName, "Unit", "text"),
  meta(Cols.BatchNo, "Batch No", "text"),
  meta(Cols.ExpiryDate, "Expiry", "date"),
  meta(Cols.Mrp, "MRP", "currency"),
  meta(Cols.SerialNo, "Serial", "text"),
  meta(Cols.SupplierName, "Supplier", "text"),
  meta(Cols.Bucket, "Bucket", "text"),
  meta(Cols.BookQty, "Book Qty", "number"),
  meta(Cols.CountedQty, "Counted Qty", "text", "counted"),
  meta(Cols.DiffQty, "Difference", "number"),
  meta(Cols.AvgCostRate, "Avg Cost", "number"),
  meta(Cols.DiffValue, "Diff Value", "currency"),
  meta(Cols.ReasonName, "Reason", "text", "reason"),
  meta(Cols.Remarks, "Remarks", "text", "remarks"),
  meta(Cols.ItemId, "ItemId", "text"),
  meta(Cols.LotId, "LotId", "text"),
  meta(Cols.GodownId, "GodownId", "text"),
  meta(Cols.GodownName, "Godown", "text"),
  meta(Cols.BaseUomId, "BaseUomId", "text"),
  meta(Cols.SupplierId, "SupplierId", "text"),
  meta(Cols.ReasonId, "ReasonId", "text"),
  meta(Cols.SplitNo, "Split", "number"),
  meta(Cols.MfgDate, "Mfg Date", "date"),
  meta(Cols.SalePrice, "Sale Price", "currency"),
  meta(Cols.StockValue, "Stock Value", "currency"),
  meta(Cols.Barcode, "Barcode", "text", "barcode"),
];

/**
 * The shipped "PHYSICAL STOCK - LINES" rows, for when the layout cannot be
 * read — the same columns, widths, order and focus chain the table carries.
 */
export const FALLBACK_COUNT_LAYOUT: readonly UiTableColumnRow[] = (
  [
    // [no, width %, visible, focus, position]
    [0, 0, false, false, 0],
    [1, 3, false, false, 1],
    [2, 6, false, false, 3],
    [3, 12.8, true, false, 4],
    [4, 4.96, true, false, 5],
    [5, 6.86, true, false, 6],
    [6, 6.92, true, false, 7],
    [7, 4.96, true, false, 8],
    [8, 6, false, false, 9],
    [9, 7.9, true, false, 10],
    [10, 5.94, true, false, 11],
    [11, 6.92, true, false, 12],
    [12, 6.92, true, true, 13],
    [13, 6.92, true, false, 14],
    [14, 5.23, true, false, 15],
    [15, 6.92, true, false, 16],
    [16, 11.17, true, false, 17],
    [17, 8, false, false, 18],
    [18, 0, false, false, 19],
    [19, 0, false, false, 20],
    [20, 0, false, false, 21],
    [21, 0, false, false, 22],
    [22, 0, false, false, 23],
    [23, 0, false, false, 24],
    [24, 0, false, false, 25],
    [25, 0, false, false, 26],
    [26, 0, false, false, 27],
    [27, 0, false, false, 28],
    [28, 0, false, false, 29],
    [29, 4.3, true, false, 2],
  ] as const
).map(([no, width, visible, focus, position]) => ({
  uiTblClmId: "",
  uiTblClmNo: String(no),
  uiTblClmName: COUNT_COLUMN_META[no].header,
  uiTblClmColumnWidth: width,
  uiTblClmPx: null,
  uiTblClmColumnVisibility: visible,
  uiTblClmColumnFocus: focus,
  uiTblClmColumnPosition: position,
  uiTblClmColumnNecessity: false,
}));

export type CountColumn = CountColumnMeta & {
  /** The layout's heading, or the .ui one. */
  label: string;
  /** Percent of the grid's width — the Qt layout's unit. */
  widthPct: number | null;
  /** A dragged width (`ui_tbl_clm_px`), which wins wherever it is set. */
  widthPx: number | null;
  visible: boolean;
  focus: boolean;
  position: number;
};

function storedPx(value: string | null | undefined): number | null {
  const match = (value ?? "").trim().match(/^(\d+(?:\.\d+)?)(px)?$/i);
  if (!match) {
    return null;
  }
  const px = Number(match[1]);
  return Number.isFinite(px) && px > 0 ? Math.round(px) : null;
}

/**
 * Every column, joined to its layout row by number and sorted the way the
 * header will read. A column the layout carries no row for stays hidden —
 * loadLayout() hides everything first and shows only what is configured. No
 * layout at all falls back to the shipped one.
 */
export function resolveCountLayout(rows: readonly UiTableColumnRow[] | undefined): CountColumn[] {
  const source = rows && rows.length > 0 ? rows : FALLBACK_COUNT_LAYOUT;
  const byNumber = new Map<number, UiTableColumnRow>();
  for (const row of source) {
    const no = Number.parseInt(row.uiTblClmNo ?? "", 10);
    if (Number.isInteger(no) && no >= 0 && no < PHYSICAL_STOCK_COLUMN_COUNT && !byNumber.has(no)) {
      byNumber.set(no, row);
    }
  }
  return COUNT_COLUMN_META.map((column) => {
    const row = byNumber.get(column.no);
    const width = row?.uiTblClmColumnWidth;
    return {
      ...column,
      label: (row?.uiTblClmName ?? "").trim() || column.header,
      widthPct: typeof width === "number" && Number.isFinite(width) && width > 0 ? width : null,
      widthPx: storedPx(row?.uiTblClmPx),
      visible: row ? row.uiTblClmColumnVisibility !== false : false,
      focus: row?.uiTblClmColumnFocus === true,
      position: row?.uiTblClmColumnPosition ?? PHYSICAL_STOCK_COLUMN_COUNT + column.no,
    };
  }).sort((left, right) => left.position - right.position || left.no - right.no);
}

/**
 * The columns actually drawn. A blind count drops Book Qty, Difference and
 * Diff Value — one switch, and the screen's tint goes with it.
 */
export function visibleCountColumns(layout: readonly CountColumn[], blind: boolean): CountColumn[] {
  return layout.filter(
    (column) => column.visible && !(blind && BLIND_HIDDEN_COLUMNS.includes(column.no)),
  );
}

/**
 * Where Enter may land, in the order the header reads: the focus-flagged
 * visible columns, or every visible column on a layout that flags none
 * (NexTable::focusStops).
 */
export function focusStops(visible: readonly CountColumn[]): number[] {
  const flagged = visible.filter((column) => column.focus).map((column) => column.no);
  return flagged.length > 0 ? flagged : visible.map((column) => column.no);
}

export type CellAddress = { row: number; col: number };

/**
 * NexTable::focusNextEditableCell — the first stop to the RIGHT of the cursor
 * on this row, else the first stop of the next row. Null past the last row:
 * focus leaves the grid.
 */
export function nextStop(
  visible: readonly CountColumn[],
  from: CellAddress,
  rowCount: number,
): CellAddress | null {
  const stops = focusStops(visible);
  if (stops.length === 0) {
    return null;
  }
  const order = visible.map((column) => column.no);
  const current = order.indexOf(from.col);
  for (const stop of stops) {
    if (order.indexOf(stop) > current) {
      return { row: from.row, col: stop };
    }
  }
  return from.row < rowCount - 1 ? { row: from.row + 1, col: stops[0] } : null;
}

/** NexTable::focusPreviousEditableCell — the mirror of `nextStop`. */
export function previousStop(
  visible: readonly CountColumn[],
  from: CellAddress,
): CellAddress | null {
  const stops = focusStops(visible);
  if (stops.length === 0) {
    return null;
  }
  const order = visible.map((column) => column.no);
  const current = order.indexOf(from.col);
  for (let index = stops.length - 1; index >= 0; index -= 1) {
    if (order.indexOf(stops[index]) < current && order.indexOf(stops[index]) >= 0) {
      return { row: from.row, col: stops[index] };
    }
  }
  return from.row > 0 ? { row: from.row - 1, col: stops[stops.length - 1] } : null;
}

/** What one cell paints. */
export function cellText(line: CountLine, no: number): string {
  switch (no) {
    case Cols.Id:
      return line.sviId;
    case Cols.LineNo:
      return formatNumberCell(line.lineNo);
    case Cols.ItemCode:
      return line.itemCode;
    case Cols.Description:
      return line.itemName;
    case Cols.UomName:
      return line.unitName;
    case Cols.BatchNo:
      return line.batchNo;
    case Cols.ExpiryDate:
      return displayDate(line.expiryDate);
    case Cols.Mrp:
      return formatCurrencyCell(line.mrp);
    case Cols.SerialNo:
      return line.serialNo;
    case Cols.SupplierName:
      return line.supplierName;
    case Cols.Bucket:
      return line.bucket;
    case Cols.BookQty:
      return formatNumberCell(line.bookQty);
    case Cols.CountedQty:
      return line.countedText;
    case Cols.DiffQty:
      return formatNumberCell(line.diffQty);
    case Cols.AvgCostRate:
      return formatNumberCell(line.avgCostRate);
    case Cols.DiffValue:
      return formatCurrencyCell(line.diffValue);
    case Cols.ReasonName:
      return line.reasonName;
    case Cols.Remarks:
      return line.remarks;
    case Cols.ItemId:
      return line.itemId;
    case Cols.LotId:
      return line.lotId;
    case Cols.GodownId:
      return line.godownId;
    case Cols.GodownName:
      return line.godownName;
    case Cols.BaseUomId:
      return line.baseUomId;
    case Cols.SupplierId:
      return line.supplierId;
    case Cols.ReasonId:
      return line.reasonId;
    case Cols.SplitNo:
      return formatNumberCell(line.splitNo);
    case Cols.MfgDate:
      return displayDate(line.mfgDate);
    case Cols.SalePrice:
      return formatCurrencyCell(line.salePrice);
    case Cols.StockValue:
      return formatCurrencyCell(line.stockValue);
    case Cols.Barcode:
      return line.barcode;
    default:
      return "";
  }
}

/** A row is a holding once it carries a lot; the blank row does not. */
export function hasHolding(line: CountLine): boolean {
  return line.lotId.trim() !== "";
}

/**
 * Whether a cell takes typing, by the delegate's rules: nothing on a read-only
 * sheet; Barcode only BEFORE the row has a holding; Counted Qty and Remarks
 * only once it has one.
 */
export function isCellEditable(kind: CountCellKind, line: CountLine, editable: boolean): boolean {
  if (!editable) {
    return false;
  }
  switch (kind) {
    case "barcode":
      return !hasHolding(line);
    case "counted":
    case "remarks":
      return hasHolding(line);
    default:
      return false;
  }
}

/**
 * Whether a picker cell opens its popup: the item picker only on the blank row
 * (a pick ADDS holdings, it never re-points one), the reason picker only on a
 * holding — there is nothing to explain on a row that is not one yet.
 */
export function canOpenPicker(kind: CountCellKind, line: CountLine, editable: boolean): boolean {
  if (!editable) {
    return false;
  }
  if (kind === "item") {
    return !hasHolding(line);
  }
  if (kind === "reason") {
    return hasHolding(line);
  }
  return false;
}

/**
 * The variance tint for a row — none while blind, none while uncounted.
 * A shortage and an overage are different problems, so they read differently.
 */
export function varianceTone(line: CountLine, blind: boolean): "short" | "over" | null {
  if (blind || line.countedText.trim() === "") {
    return null;
  }
  const diff = line.diffQty ?? 0;
  if (diff < 0) {
    return "short";
  }
  return diff > 0 ? "over" : null;
}
