/**
 * The line grid's columns — what each of `OpeningStockCols` MEANS on this screen
 * (kind, alignment, which field it reads and writes), joined to ui table 27's
 * layout (name, width, visibility, position, Enter stop).
 *
 * ── Joined by NUMBER, not by name ─────────────────────────────────────────
 * `ui_tbl_clm_no` is the slot `NexTable::setCellValue()` writes to and the key
 * `applyLayout()` joins on, so a deployment that renames "Cost / Unit" still
 * lands on the cost column. The name is only the heading.
 *
 * ── Who decides a cell is editable ────────────────────────────────────────
 * The ITEM, not the screen (`OpeningStockDelegate`): batch / expiry / MRP /
 * sale price / serial / supplier open only when the row's tracking signature
 * carries the letter, nothing opens on a row without an item, and the derived
 * figures (value, base quantities, the per-base-unit cost) never open at all.
 */
import type { UiTableColumnRow } from "@/features/sales/quotation/quotation.types";
import { OS_COL } from "./opening-stock.constants";
import { hasItem, isUntrackedIdentityField } from "./opening-stock.lines";
import type { OpeningStockLine, OpeningStockLineField } from "./opening-stock.types";

export type OpeningStockColumnKind =
  /** Shown, never keyed. */
  | "label"
  | "text"
  /** dd-mm-yyyy text. */
  | "date"
  /** Quantities, at the item's own precision. */
  | "qty"
  /** numeric(18,6) rates — six places in, as many as they carry out. */
  | "rate"
  /** Two-place money (MRP, sale price, value). */
  | "money"
  | "perc"
  | "int"
  /** The bucket combo. */
  | "bucket"
  /** The item picker cell (Description). */
  | "itemLookup"
  /** The supplier picker cell. */
  | "supplierLookup";

export type ColumnAlign = "left" | "center" | "right";

/** What a cell shows — a line field, or one of the two figures derived for display. */
export type OpeningStockColumnRead = keyof OpeningStockLine | "trackedBy" | "computedLineNo";

export type OpeningStockColumnMeaning = {
  number: number;
  /** Stable key — React's, and the Enter walker's `fieldKey`. */
  key: string;
  /** The .ui's heading, for a layout that names none (or a missing layout). */
  fallbackHeader: string;
  kind: OpeningStockColumnKind;
  align: ColumnAlign;
  read: OpeningStockColumnRead;
  /** The field an edit lands on. Absent = never keyed (a picker cell opens its picker instead). */
  write?: OpeningStockLineField;
  /** Without a layout: shown or not. The reference ids are hidden. */
  fallbackVisible: boolean;
  /** Editor precision for the numeric kinds (qty takes the item's own instead). */
  decimals?: number;
};

export type ResolvedOpeningStockColumn = OpeningStockColumnMeaning & {
  header: string;
  widthPx: number;
  visible: boolean;
  /** `ui_tbl_clm_column_focus` — an Enter stop. */
  focus: boolean;
  /** Layout config only — nothing here reads it. */
  necessity: boolean;
  position: number;
  columnNumber: number;
  /** `ui_tbl_clm_id`, what a resized width or the Admin settings save against; null on the fallback. */
  columnId: string | null;
};

const RIGHT: ColumnAlign = "right";
const CENTER: ColumnAlign = "center";
const LEFT: ColumnAlign = "left";

/**
 * Every column, in `OpeningStockCols` order. Alignment is by MEANING, as
 * `OpeningStockCols::alignment()` states it: money and rates right, counts and
 * measures (and the two dates) centred, everything else left.
 */
export const OPENING_STOCK_COLUMNS: readonly OpeningStockColumnMeaning[] = [
  { number: OS_COL.Id, key: "sviId", fallbackHeader: "Id", kind: "label", align: LEFT, read: "sviId", fallbackVisible: false },
  { number: OS_COL.LineNo, key: "lineNo", fallbackHeader: "#", kind: "label", align: CENTER, read: "computedLineNo", fallbackVisible: true },
  { number: OS_COL.SplitNo, key: "splitNo", fallbackHeader: "Split", kind: "int", align: CENTER, read: "splitNo", write: "splitNo", fallbackVisible: true, decimals: 0 },
  { number: OS_COL.Barcode, key: "barcode", fallbackHeader: "Barcode", kind: "text", align: LEFT, read: "barcode", write: "barcode", fallbackVisible: true },
  { number: OS_COL.ItemCode, key: "itemCode", fallbackHeader: "Code", kind: "label", align: LEFT, read: "itemCode", fallbackVisible: true },
  { number: OS_COL.Description, key: "itemName", fallbackHeader: "Item", kind: "itemLookup", align: LEFT, read: "itemName", fallbackVisible: true },
  { number: OS_COL.UomName, key: "unitName", fallbackHeader: "Unit", kind: "label", align: LEFT, read: "unitName", fallbackVisible: true },
  { number: OS_COL.Qty, key: "qty", fallbackHeader: "Qty", kind: "qty", align: CENTER, read: "qty", write: "qty", fallbackVisible: true },
  { number: OS_COL.FreeQty, key: "freeQty", fallbackHeader: "Free", kind: "qty", align: CENTER, read: "freeQty", write: "freeQty", fallbackVisible: true },
  { number: OS_COL.BatchNo, key: "batchNo", fallbackHeader: "Batch No", kind: "text", align: LEFT, read: "batchNo", write: "batchNo", fallbackVisible: true },
  { number: OS_COL.MfgDate, key: "mfgDate", fallbackHeader: "Mfg Date", kind: "date", align: CENTER, read: "mfgDate", write: "mfgDate", fallbackVisible: true },
  { number: OS_COL.ExpiryDate, key: "expiryDate", fallbackHeader: "Expiry", kind: "date", align: CENTER, read: "expiryDate", write: "expiryDate", fallbackVisible: true },
  { number: OS_COL.Mrp, key: "mrp", fallbackHeader: "MRP", kind: "money", align: RIGHT, read: "mrp", write: "mrp", fallbackVisible: true, decimals: 2 },
  { number: OS_COL.SalePrice, key: "salePrice", fallbackHeader: "Sale Price", kind: "money", align: RIGHT, read: "salePrice", write: "salePrice", fallbackVisible: true, decimals: 2 },
  { number: OS_COL.SerialNo, key: "serialNo", fallbackHeader: "Serial", kind: "text", align: LEFT, read: "serialNo", write: "serialNo", fallbackVisible: true },
  { number: OS_COL.Bucket, key: "bucket", fallbackHeader: "Bucket", kind: "bucket", align: LEFT, read: "bucket", write: "bucket", fallbackVisible: true },
  { number: OS_COL.CostPerUnit, key: "costPerUnit", fallbackHeader: "Cost / Unit", kind: "rate", align: RIGHT, read: "costPerUnit", write: "costPerUnit", fallbackVisible: true, decimals: 6 },
  { number: OS_COL.TaxPerc, key: "taxPerc", fallbackHeader: "Tax %", kind: "perc", align: CENTER, read: "taxPerc", write: "taxPerc", fallbackVisible: true, decimals: 3 },
  { number: OS_COL.CostRateWot, key: "costRateWot", fallbackHeader: "Cost w/o tax", kind: "rate", align: RIGHT, read: "costRateWot", write: "costRateWot", fallbackVisible: true, decimals: 6 },
  { number: OS_COL.LandedRate, key: "landedRate", fallbackHeader: "Landed Rate", kind: "rate", align: RIGHT, read: "landedRate", write: "landedRate", fallbackVisible: true, decimals: 6 },
  { number: OS_COL.WeightQty, key: "weightQty", fallbackHeader: "Weight", kind: "qty", align: CENTER, read: "weightQty", write: "weightQty", fallbackVisible: true },
  { number: OS_COL.Value, key: "value", fallbackHeader: "Value", kind: "money", align: RIGHT, read: "value", fallbackVisible: true, decimals: 2 },
  { number: OS_COL.ValueWot, key: "valueWot", fallbackHeader: "Value w/o tax", kind: "money", align: RIGHT, read: "valueWot", fallbackVisible: true, decimals: 2 },
  { number: OS_COL.TrackedBy, key: "trackedBy", fallbackHeader: "Tracked by", kind: "label", align: LEFT, read: "trackedBy", fallbackVisible: true },
  { number: OS_COL.Remarks, key: "remarks", fallbackHeader: "Remarks", kind: "text", align: LEFT, read: "remarks", write: "remarks", fallbackVisible: true },
  { number: OS_COL.ItemId, key: "itemId", fallbackHeader: "ItemId", kind: "label", align: LEFT, read: "itemId", fallbackVisible: false },
  { number: OS_COL.UomId, key: "uomId", fallbackHeader: "UomId", kind: "label", align: LEFT, read: "uomId", fallbackVisible: false },
  { number: OS_COL.BaseUomId, key: "baseUomId", fallbackHeader: "BaseUomId", kind: "label", align: LEFT, read: "baseUomId", fallbackVisible: false },
  { number: OS_COL.ToBaseFactor, key: "toBaseFactor", fallbackHeader: "ToBaseFactor", kind: "label", align: CENTER, read: "toBaseFactor", fallbackVisible: false },
  { number: OS_COL.BaseQty, key: "baseQty", fallbackHeader: "BaseQty", kind: "label", align: CENTER, read: "baseQty", fallbackVisible: false },
  { number: OS_COL.FreeBaseQty, key: "freeBaseQty", fallbackHeader: "FreeBaseQty", kind: "label", align: CENTER, read: "freeBaseQty", fallbackVisible: false },
  { number: OS_COL.GodownId, key: "godownId", fallbackHeader: "GodownId", kind: "label", align: LEFT, read: "godownId", fallbackVisible: false },
  { number: OS_COL.GodownName, key: "godownName", fallbackHeader: "Godown", kind: "label", align: LEFT, read: "godownName", fallbackVisible: true },
  { number: OS_COL.LotId, key: "lotId", fallbackHeader: "LotId", kind: "label", align: LEFT, read: "lotId", fallbackVisible: false },
  { number: OS_COL.SupplierId, key: "supplierId", fallbackHeader: "SupplierId", kind: "label", align: LEFT, read: "supplierId", fallbackVisible: false },
  { number: OS_COL.DecimalCount, key: "decimalCount", fallbackHeader: "Decimals", kind: "label", align: LEFT, read: "decimalCount", fallbackVisible: false },
  { number: OS_COL.TrackSignature, key: "trackSignature", fallbackHeader: "Signature", kind: "label", align: LEFT, read: "trackSignature", fallbackVisible: false },
  { number: OS_COL.SupplierName, key: "supplierName", fallbackHeader: "Supplier", kind: "supplierLookup", align: LEFT, read: "supplierName", fallbackVisible: true },
  { number: OS_COL.CostRate, key: "costRate", fallbackHeader: "Cost Rate / base unit", kind: "rate", align: RIGHT, read: "costRate", fallbackVisible: true, decimals: 6 },
];

const BY_NUMBER = new Map(OPENING_STOCK_COLUMNS.map((meaning) => [meaning.number, meaning]));

/**
 * Pixels per stored unit. ui table 27 is a Qt Desktop layout, so its widths are
 * the Qt grid's fractional percents (Cost / Unit is 7) — the same scale the
 * Sale Bill and Sale Order screens read their Desktop layouts at.
 */
const PX_PER_QT_UNIT = 11;
const MIN_COLUMN_PX = 34;
const DEFAULT_COLUMN_PX = 90;

function widthPxOf(row: UiTableColumnRow): number {
  // A width a drag saved (`ui_tbl_clm_px`) wins wherever it is set.
  const stored = row.uiTblClmPx?.trim().match(/^(\d+(?:\.\d+)?)(px)?$/i);
  if (stored) {
    const px = Number(stored[1]);
    if (Number.isFinite(px) && px > 0) {
      return Math.max(MIN_COLUMN_PX, Math.round(px));
    }
  }
  const fraction = row.uiTblClmColumnWidth;
  if (typeof fraction !== "number" || !Number.isFinite(fraction) || fraction <= 0) {
    return DEFAULT_COLUMN_PX;
  }
  return Math.max(MIN_COLUMN_PX, Math.round(fraction * PX_PER_QT_UNIT));
}

/**
 * Join the layout's rows to the column meanings by column number, ordered by
 * the layout's position (column number breaks a tie — the live data can carry a
 * duplicate position). A row with no meaning is dropped; with no layout at all,
 * every meaning is shown in `OpeningStockCols` order with the .ui's headings.
 */
export function resolveOpeningStockColumns(
  rows: readonly UiTableColumnRow[] | undefined,
): ResolvedOpeningStockColumn[] {
  if (!rows || rows.length === 0) {
    return OPENING_STOCK_COLUMNS.map((meaning, index) => ({
      ...meaning,
      header: meaning.fallbackHeader,
      widthPx: DEFAULT_COLUMN_PX,
      visible: meaning.fallbackVisible,
      focus: false,
      necessity: false,
      position: index,
      columnNumber: meaning.number,
      columnId: null,
    }));
  }
  const taken = new Set<number>();
  const resolved: ResolvedOpeningStockColumn[] = [];
  for (const row of rows) {
    const number = Number.parseInt(String(row.uiTblClmNo ?? ""), 10);
    const meaning = BY_NUMBER.get(number);
    if (!meaning || taken.has(number)) {
      continue;
    }
    taken.add(number);
    resolved.push({
      ...meaning,
      header: (row.uiTblClmName ?? "").trim() || meaning.fallbackHeader,
      widthPx: widthPxOf(row),
      visible: row.uiTblClmColumnVisibility !== false,
      focus: row.uiTblClmColumnFocus === true,
      necessity: row.uiTblClmColumnNecessity === true,
      position: Number.isFinite(row.uiTblClmColumnPosition) ? row.uiTblClmColumnPosition : number,
      columnNumber: number,
      columnId: row.uiTblClmId || null,
    });
  }
  return resolved.sort((left, right) => left.position - right.position || left.number - right.number);
}

/**
 * Whether a cell's editor opens — the delegate's `createEditor()` refusals, in
 * its order. `documentEditable` is the screen's own gate: a POSTED or CANCELLED
 * voucher, or a draft opened read-only, opens nothing.
 */
export function isCellEditable(
  column: Pick<OpeningStockColumnMeaning, "kind" | "write" | "read" | "number">,
  line: OpeningStockLine,
  documentEditable: boolean,
): boolean {
  if (!documentEditable) {
    return false;
  }
  // The item picker is how a row GETS its item, so it opens on any row.
  if (column.kind === "itemLookup") {
    return true;
  }
  // Barcode, too, is how a row gets its item — and only while it has none: a
  // re-typed barcode would not re-resolve an item that is already there.
  if (column.number === OS_COL.Barcode) {
    return !hasItem(line);
  }
  // Nothing else on a blank row means anything.
  if (!hasItem(line)) {
    return false;
  }
  // The item decides these, not the screen.
  if (column.read !== "trackedBy" && column.read !== "computedLineNo"
    && isUntrackedIdentityField(line, column.read)) {
    return false;
  }
  if (column.kind === "supplierLookup") {
    return true;
  }
  return column.write !== undefined;
}

/**
 * Greyed — an identity column the row's item does not track. Painted but not
 * blanked: a value keyed under a different policy stays visible.
 */
export function isCellGreyed(
  column: Pick<OpeningStockColumnMeaning, "read">,
  line: OpeningStockLine,
): boolean {
  if (!hasItem(line) || column.read === "trackedBy" || column.read === "computedLineNo") {
    return false;
  }
  return isUntrackedIdentityField(line, column.read);
}
