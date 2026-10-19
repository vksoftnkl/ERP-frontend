/**
 * The line grid's columns — what each slot of `TAG_COL` MEANS on this screen
 * (kind, alignment, which field it shows), joined to ui_table 53's layout
 * (title, width, visibility, position, Enter stop).
 *
 * Joined by NUMBER, not by name: `ui_tbl_clm_no` is the slot the Qt grid's
 * `setCellValue()` writes to and the key `applyLayout()` joins on, so a
 * deployment that renames "Model / design" still lands on the model column.
 * The name is only the heading. Should a slot ever come twice (the dev DB
 * keeps a soft-deleted copy of each row from an earlier registration run,
 * which the route filters out), the first row of a number wins, as in Qt.
 */
import type { UiTableColumnRow } from "@/features/sales/quotation/quotation.types";
import {
  ATTR_NOTE_MAX_LENGTH,
  MODEL_MAX_LENGTH,
  SUPPLIER_ARTICLE_MAX_LENGTH,
} from "./textile-tags.constants";
import {
  TAG_COL,
  TAG_COLUMN_FIELDS,
  tagColumnAlign,
  type TagAlign,
  type TagLineField,
} from "./domain/textile-tag-entity";

export type TagColumnKind =
  /** The computed line number. */
  | "lineNo"
  /** The item picker cell (grid 71). */
  | "itemLookup"
  /** The brand picker cell (grid 91). */
  | "brandLookup"
  /** Typed; completed from its list. */
  | "listName"
  | "text"
  /** Two places. */
  | "money"
  /** Three places: a metre item's cut length (G4). */
  | "qty"
  /** The "auto" / "typed" chip. */
  | "srcChip"
  /** Read-only figure. */
  | "labels"
  /** Filled by reserve. */
  | "barcode"
  /** An id or state slot: shown only if a layout insists. */
  | "hidden";

export type TagColumnMeaning = {
  number: number;
  /** The field the cell shows — React's key and the Enter walker's `fieldKey`. */
  key: TagLineField | "lineNo";
  /** The .ui's heading, for a layout that names none (or a missing layout). */
  fallbackHeader: string;
  kind: TagColumnKind;
  align: TagAlign;
  /** Without a layout: shown or not. The chooser columns and the ids are hidden. */
  fallbackVisible: boolean;
  maxLength?: number;
};

export type ResolvedTagColumn = TagColumnMeaning & {
  header: string;
  widthPx: number;
  visible: boolean;
  /** `ui_tbl_clm_column_focus` — an Enter stop. */
  focus: boolean;
  necessity: boolean;
  position: number;
  columnNumber: number;
  /** `ui_tbl_clm_id`, what a resized width or the Admin settings save against; null on the fallback. */
  columnId: string | null;
};

const FALLBACK_HEADERS: Readonly<Record<number, string>> = {
  [TAG_COL.LineNo]: "#",
  [TAG_COL.ItemName]: "Item",
  [TAG_COL.BrandName]: "Brand",
  [TAG_COL.SizeName]: "Size",
  [TAG_COL.ColourName]: "Colour",
  [TAG_COL.FabricName]: "Fabric",
  [TAG_COL.Model]: "Model / design",
  [TAG_COL.SupplierArticle]: "Supplier art.",
  [TAG_COL.Cost]: "Cost",
  [TAG_COL.Mrp]: "MRP",
  [TAG_COL.PriceSrc]: "Src",
  [TAG_COL.Price]: "Price",
  [TAG_COL.Qty]: "Qty",
  [TAG_COL.Labels]: "Labels",
  [TAG_COL.Barcode]: "Barcode",
  [TAG_COL.SeasonName]: "Season",
  [TAG_COL.AttrNote]: "Label note",
  [TAG_COL.ItemId]: "ItemId",
  [TAG_COL.BrandId]: "BrandId",
  [TAG_COL.SizeId]: "SizeId",
  [TAG_COL.ColourId]: "ColourId",
  [TAG_COL.FabricId]: "FabricId",
  [TAG_COL.SeasonId]: "SeasonId",
  [TAG_COL.UomId]: "UomId",
  [TAG_COL.Signature]: "Signature",
  [TAG_COL.TagIds]: "TagIds",
  [TAG_COL.LotIds]: "LotIds",
  [TAG_COL.Rule]: "Rule",
  [TAG_COL.State]: "State",
};

function kindOf(number: number): TagColumnKind {
  switch (number) {
    case TAG_COL.LineNo:
      return "lineNo";
    case TAG_COL.ItemName:
      return "itemLookup";
    case TAG_COL.BrandName:
      return "brandLookup";
    case TAG_COL.SizeName:
    case TAG_COL.ColourName:
    case TAG_COL.FabricName:
    case TAG_COL.SeasonName:
      return "listName";
    case TAG_COL.Model:
    case TAG_COL.SupplierArticle:
    case TAG_COL.AttrNote:
      return "text";
    case TAG_COL.Cost:
    case TAG_COL.Mrp:
    case TAG_COL.Price:
      return "money";
    case TAG_COL.Qty:
      return "qty";
    case TAG_COL.PriceSrc:
      return "srcChip";
    case TAG_COL.Labels:
      return "labels";
    case TAG_COL.Barcode:
      return "barcode";
    default:
      return "hidden";
  }
}

function maxLengthOf(number: number): number | undefined {
  switch (number) {
    case TAG_COL.Model:
      return MODEL_MAX_LENGTH;
    case TAG_COL.SupplierArticle:
      return SUPPLIER_ARTICLE_MAX_LENGTH;
    case TAG_COL.AttrNote:
      return ATTR_NOTE_MAX_LENGTH;
    default:
      return undefined;
  }
}

/** Every column, in `TAG_COL` order. 0–14 shown by default; 15 on hidden. */
export const TAG_COLUMNS: readonly TagColumnMeaning[] = (
  Object.values(TAG_COL) as number[]
)
  .sort((left, right) => left - right)
  .map((number) => {
    const maxLength = maxLengthOf(number);
    return {
      number,
      key: TAG_COLUMN_FIELDS[number as keyof typeof TAG_COLUMN_FIELDS],
      fallbackHeader: FALLBACK_HEADERS[number],
      kind: kindOf(number),
      align: tagColumnAlign(number),
      fallbackVisible: number <= TAG_COL.Barcode,
      ...(maxLength !== undefined ? { maxLength } : {}),
    };
  });

const BY_NUMBER = new Map(TAG_COLUMNS.map((meaning) => [meaning.number, meaning]));

/** Titles by slot, for the Admin settings dialog's fallback. */
export const TAG_COLUMN_TITLES: Readonly<Record<number, string>> = FALLBACK_HEADERS;

/**
 * Pixels per stored unit. ui_table 53 is a Qt Desktop layout, so its widths
 * are the Qt grid's fractional percents (Item is 11, Cost is 6) — the scale
 * Opening Stock and the sales screens read their Desktop layouts at.
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
 * the layout's position (column number breaks a tie). A row with no meaning
 * is dropped; with no layout at all, every meaning is shown in `TAG_COL` order
 * with the .ui's headings and the ids hidden.
 */
export function resolveTextileTagColumns(
  rows: readonly UiTableColumnRow[] | undefined,
): ResolvedTagColumn[] {
  if (!rows || rows.length === 0) {
    return TAG_COLUMNS.map((meaning, index) => ({
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
  const resolved: ResolvedTagColumn[] = [];
  const ordered = [...rows].sort((left, right) => {
    const leftPosition = Number.isFinite(left.uiTblClmColumnPosition) ? left.uiTblClmColumnPosition : Number(left.uiTblClmNo);
    const rightPosition = Number.isFinite(right.uiTblClmColumnPosition) ? right.uiTblClmColumnPosition : Number(right.uiTblClmNo);
    return leftPosition - rightPosition || Number(left.uiTblClmNo) - Number(right.uiTblClmNo);
  });
  for (const row of ordered) {
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
  return resolved;
}
