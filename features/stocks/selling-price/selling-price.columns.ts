/**
 * The grid's columns — ui table 44 ("CHANGE SELLING PRICE - ROWS") joined to
 * the screen's meanings, the way the Sale Order / Sale Bill grids do it
 * (`resolveItemColumnsWith`).
 *
 * The join is by `ui_tbl_clm_no`, never by name: the layout repeats "Mkup%",
 * "Net Rate" and "Base Rate" once per level, and the number IS the Qt entity's
 * slot (NexTable writes a value to the column its number names). Every key
 * below carries an upper-case letter so no normalised layout name can ever
 * match one by name — the number is the only way in.
 *
 * The layout owns titles, widths (Qt percents, `qtPercent`), order,
 * visibility and the Enter stops. The hidden ids and baselines (slots 17-34
 * and 41) have no meaning here at all — they live on the row object — so they
 * can never be shown, which is what Qt re-asserts when its layout lands.
 *
 * Until the layout answers (or when it cannot be read) the grid shows the Qt
 * screen's own seed (`seedLocalLayout`): its widths, Branch second, Barcode
 * before Item, Cost before tax after Cost, each base rate just before its
 * level's price.
 */
import type { ItemColumnMeaning } from "@/features/sales/quotation/quotation.constants";
import type { UiTableColumnRow } from "@/features/sales/quotation/quotation.types";
import {
  resolveItemColumnsWith,
  type ColumnWidthUnit,
  type ResolvedItemColumn,
} from "@/features/sales/quotation/quotation.utils";
import { levelBandText } from "./selling-price.cards";
import {
  COLUMN_SLOT,
  LEVEL_BAND_COLOURS,
  LEVEL_LETTERS,
  levelOfColumn,
  type ColumnKey,
} from "./selling-price.constants";

/** ui table 44 is the Qt client's Desktop layout: its widths are percents. */
export const SELLING_PRICE_WIDTH_UNIT: ColumnWidthUnit = "qtPercent";

function meaning(
  key: ColumnKey,
  token: string,
  kind: ItemColumnMeaning["kind"],
  align: ItemColumnMeaning["align"],
): ItemColumnMeaning {
  return { key, token, kind, align };
}

/** Every shown slot, with the Qt `.ui`'s own header for it. */
export const SELLING_PRICE_MEANINGS: ItemColumnMeaning[] = [
  meaning("lineNo", "#", "serial", "center"),
  meaning("itemName", "Item", "itemLookup", "left"),
  meaning("uomName", "Uom", "label", "left"),
  meaning("stockQty", "Stock", "qty", "right"),
  meaning("mrpShown", "MRP", "currency", "right"),
  meaning("salePx", "Sale Px", "currency", "right"),
  meaning("srcChip", "Src", "label", "center"),
  meaning("costRate", "Cost", "currency", "right"),
  meaning("mkupA", "Mkup%", "perc", "right"),
  meaning("priceA", "Net Rate", "currency", "right"),
  meaning("mkupB", "Mkup%", "perc", "right"),
  meaning("priceB", "Net Rate", "currency", "right"),
  meaning("mkupC", "Mkup%", "perc", "right"),
  meaning("priceC", "Net Rate", "currency", "right"),
  meaning("mkupD", "Mkup%", "perc", "right"),
  meaning("priceD", "Net Rate", "currency", "right"),
  meaning("minPrice", "Min", "currency", "right"),
  meaning("branchName", "Branch", "label", "left"),
  meaning("costWot", "Cost B.Tax", "currency", "right"),
  meaning("rateA", "Base Rate", "currency", "right"),
  meaning("rateB", "Base Rate", "currency", "right"),
  meaning("rateC", "Base Rate", "currency", "right"),
  meaning("rateD", "Base Rate", "currency", "right"),
  meaning("barcodeText", "Barcode", "text", "left"),
];

/** meaning key → `ui_tbl_clm_no`. */
export const SELLING_PRICE_COLUMN_NUMBERS: Record<string, number> = { ...COLUMN_SLOT };

const COLUMN_KEYS = new Set<string>(Object.keys(COLUMN_SLOT));

export function isColumnKey(key: string): key is ColumnKey {
  return COLUMN_KEYS.has(key);
}

export type SellingPriceColumn = ResolvedItemColumn;

/** The Qt seed's order. */
const SEED_ORDER: readonly ColumnKey[] = [
  "lineNo",
  "branchName",
  "barcodeText",
  "itemName",
  "uomName",
  "stockQty",
  "mrpShown",
  "salePx",
  "srcChip",
  "costRate",
  "costWot",
  "mkupA",
  "rateA",
  "priceA",
  "mkupB",
  "rateB",
  "priceB",
  "mkupC",
  "rateC",
  "priceC",
  "mkupD",
  "rateD",
  "priceD",
  "minPrice",
];

/** The Qt seed's pixel widths. */
function seedWidth(key: ColumnKey): number {
  switch (key) {
    case "lineNo":
      return 36;
    case "itemName":
      return 230;
    case "uomName":
      return 60;
    case "stockQty":
      return 70;
    case "mrpShown":
    case "salePx":
    case "costRate":
    case "costWot":
      return 80;
    case "srcChip":
      return 104;
    case "minPrice":
      return 84;
    case "branchName":
      return 180;
    case "barcodeText":
      return 120;
    default:
      if (key.startsWith("mkup")) return 64;
      if (key.startsWith("rate")) return 84;
      return 92;
  }
}

/**
 * The seed layout. Its Enter stops are the layout's (the four markup / base
 * rate / price runs and Min) — the chain ui table 44 carries.
 */
export function seedColumns(): SellingPriceColumn[] {
  const byKey = new Map(SELLING_PRICE_MEANINGS.map((entry) => [entry.key, entry]));
  return SEED_ORDER.map((key, position) => {
    const entry = byKey.get(key) as ItemColumnMeaning;
    const focus =
      levelOfColumn(key) >= 0 || key === "minPrice";
    return {
      ...entry,
      header: entry.token,
      widthPx: seedWidth(key),
      visible: true,
      focus,
      necessity: false,
      position,
      columnNumber: COLUMN_SLOT[key],
      columnId: null,
    };
  });
}

/**
 * The columns to draw: the configured layout when it has been read and
 * places at least one column, the seed otherwise.
 */
export function resolveSellingPriceColumns(
  rows: UiTableColumnRow[] | undefined,
): SellingPriceColumn[] {
  if (!rows || rows.length === 0) {
    return seedColumns();
  }
  const resolved = resolveItemColumnsWith(
    rows,
    SELLING_PRICE_MEANINGS,
    SELLING_PRICE_WIDTH_UNIT,
    SELLING_PRICE_COLUMN_NUMBERS,
  ).filter((column) => isColumnKey(column.key));
  // The resolver's own fallback (no configured row placed at all) carries no
  // column ids — the Qt seed is the better stand-in for it.
  if (resolved.length === 0 || resolved.every((column) => column.columnId === null)) {
    return seedColumns();
  }
  return resolved;
}

// ---------------------------------------------------------------- band header
export type PriceBand = {
  key: string;
  span: number;
  text: string;
  fg: string;
  bg: string;
  align: "left" | "center";
};

const LEAD_TEXT = "one row = one row of the item price table";

/**
 * The strip above the header that names the four price levels over their
 * columns (Qt `PriceBandHeader`): one band per run of a level's markup / base
 * rate / price columns, a grey one over Min, and the lead band over the rest.
 */
export function priceBands(
  visible: readonly SellingPriceColumn[],
  levelNames: readonly string[],
): PriceBand[] {
  const bands: PriceBand[] = [];
  let leadNamed = false;
  for (const column of visible) {
    const level = levelOfColumn(column.key);
    const id = level >= 0 ? `level-${level}` : column.key === "minPrice" ? "min" : "lead";
    const last = bands[bands.length - 1];
    if (last && last.key.startsWith(`${id}:`)) {
      last.span += 1;
      continue;
    }
    if (level >= 0) {
      const colours = LEVEL_BAND_COLOURS[level];
      bands.push({
        key: `${id}:${bands.length}`,
        span: 1,
        text: levelBandText(levelNames[level], LEVEL_LETTERS[level]),
        fg: colours.fg,
        bg: colours.bg,
        align: "center",
      });
    } else if (id === "min") {
      bands.push({ key: `${id}:${bands.length}`, span: 1, text: "", fg: "#6b7280", bg: "#f3f4f6", align: "center" });
    } else {
      bands.push({
        key: `${id}:${bands.length}`,
        span: 1,
        text: leadNamed ? "" : LEAD_TEXT,
        fg: "#6b7280",
        bg: "#f3f4f6",
        align: "left",
      });
      leadNamed = true;
    }
  }
  return bands;
}
