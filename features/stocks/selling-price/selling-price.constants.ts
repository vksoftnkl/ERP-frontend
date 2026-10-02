/**
 * Change Selling Price (bulk), menu 30 — Qt binds Ctrl+G.
 *
 * Ported from the Qt screen `inventory/stock/sellingprice/`
 * (`change_selling_price_entry`, `_entity`, `_delegate`, `_dialogs`). The
 * column slots below are the Qt entity's `ChangeSellingPriceCols` enum: ui
 * table 44 numbers its columns (`ui_tbl_clm_no`) by exactly those slots, and
 * several of its names repeat ("Mkup%" ×4, "Net Rate" ×4, "Base Rate" ×4), so
 * the layout is joined to these meanings by NUMBER, the way NexTable does it.
 */
import type { ConfiguredDropdownKey } from "@/lib/configured-dropdowns";
import type { ConfiguredGridKey } from "@/lib/configured-grids";
import type { UiTableKey } from "@/lib/ui-tables";

// ---------------------------------------------------------------- endpoints
// Without `/api/v1` — the base query adds it.
export const SELLING_PRICE_GRID_ENDPOINT = "/stock/price-bulk";
export const SELLING_PRICE_SAVE_ENDPOINT = "/stock/price-bulk";
export const SELLING_PRICE_BUCKETS_ENDPOINT = "/stock/price-buckets";
export const PRICE_LEVEL_MASTERS_ENDPOINT = "/price-level-masters/get";
export const BRANCH_MASTER_GET_ENDPOINT = "/branch-masters/get";
export const ITEM_BY_BARCODE_ENDPOINT = "/master-lookups/item-by-barcode";
/** The opening-stock item lookup: the only route that answers an item's track signature. */
export const ITEM_TRACK_LOOKUP_ENDPOINT = "/stock/opening/item-lookup";
export const CONFIGURED_GRID_RUN_ENDPOINT = "/configured-grid-sql/run";

// ---------------------------------------------------------------- registries
export const SELLING_PRICE_MENU_ID = 30;
export const SELLING_PRICE_UI_TABLE_KEY: UiTableKey = "sellingPriceRows"; // ui table 44
export const ITEM_PICKER_GRID_KEY: ConfiguredGridKey = "itemPickerPopup"; // grid 71

/** Grid 71's SQL binds these two tokens; Qt's PopupConfig sends both. */
export const ITEM_PICKER_COMPANY_TOKEN = "iitem_company_id";
export const ITEM_PICKER_BRANCH_TOKEN = "iitem_branch_id";

// ---------------------------------------------------------------- paging
/** Qt pages the grid 1000 rows at a time (the server's maximum)… */
export const GRID_PAGE_SIZE = 1000;
/** …and stops once this many rows are in. */
export const GRID_ROW_CEILING = 20000;

// ---------------------------------------------------------------- levels
export const LEVEL_COUNT = 4;
export const LEVEL_LETTERS = ["A", "B", "C", "D"] as const;
export const DEFAULT_LEVEL_NAMES = ["Level A", "Level B", "Level C", "Level D"] as const;
export const DEFAULT_LEVEL_SHORTS = ["A", "B", "C", "D"] as const;

/** The band colours over each level's columns (Qt's PriceBandHeader). */
export const LEVEL_BAND_COLOURS: ReadonlyArray<{ fg: string; bg: string }> = [
  { fg: "#1d4ed8", bg: "#e8eefc" },
  { fg: "#15803d", bg: "#e8f5ea" },
  { fg: "#b45309", bg: "#fef3e2" },
  { fg: "#6d28d9", bg: "#f1eafd" },
];

// ---------------------------------------------------------------- columns
/**
 * The grid's columns, by the Qt slot each one is (`uiTblClmNo`). Slots 17-34
 * and 41 are the hidden ids and baselines — they live on the row object here,
 * never in a column.
 */
export const COLUMN_SLOT = {
  lineNo: 0,
  itemName: 1,
  uomName: 2,
  stockQty: 3,
  mrpShown: 4,
  salePx: 5,
  srcChip: 6,
  costRate: 7,
  mkupA: 8,
  priceA: 9,
  mkupB: 10,
  priceB: 11,
  mkupC: 12,
  priceC: 13,
  mkupD: 14,
  priceD: 15,
  minPrice: 16,
  branchName: 35,
  costWot: 36,
  rateA: 37,
  rateB: 38,
  rateC: 39,
  rateD: 40,
  barcodeText: 42,
} as const;

export type ColumnKey = keyof typeof COLUMN_SLOT;

export const MKUP_KEYS = ["mkupA", "mkupB", "mkupC", "mkupD"] as const;
export const PRICE_KEYS = ["priceA", "priceB", "priceC", "priceD"] as const;
export const RATE_KEYS = ["rateA", "rateB", "rateC", "rateD"] as const;

export type MkupKey = (typeof MKUP_KEYS)[number];
export type PriceKey = (typeof PRICE_KEYS)[number];
export type RateKey = (typeof RATE_KEYS)[number];

export function isMkupKey(key: string): key is MkupKey {
  return (MKUP_KEYS as readonly string[]).includes(key);
}
export function isPriceKey(key: string): key is PriceKey {
  return (PRICE_KEYS as readonly string[]).includes(key);
}
export function isRateKey(key: string): key is RateKey {
  return (RATE_KEYS as readonly string[]).includes(key);
}

/** The level (0..3) a markup, base-rate or price column belongs to, or -1. */
export function levelOfColumn(key: string): number {
  const groups: ReadonlyArray<readonly string[]> = [MKUP_KEYS, PRICE_KEYS, RATE_KEYS];
  for (const group of groups) {
    const index = group.indexOf(key);
    if (index >= 0) {
      return index;
    }
  }
  return -1;
}

/** The grid name the Enter walker (`grid-focus.ts`) keys its cells by. */
export const SELLING_PRICE_GRID_NAME = "selling-price-rows";

// ---------------------------------------------------------------- filter dialog
/**
 * The seven dropdown filters of the F8 dialog, in Qt's order (two columns,
 * the item entry's own fields). The value / label keys are the column names
 * of each configured dropdown's SQL.
 */
export type FilterFieldKey =
  | "group"
  | "category"
  | "brand"
  | "section"
  | "supplier"
  | "preset"
  | "tax";

export type FilterFieldSpec = {
  key: FilterFieldKey;
  caption: string;
  dropdownKey: ConfiguredDropdownKey;
  valueKey: string;
  labelKey: string;
  metaKey?: string;
};

export const FILTER_FIELDS: readonly FilterFieldSpec[] = [
  { key: "group", caption: "Group", dropdownKey: "itemGroup", valueKey: "itg_id", labelKey: "itg_name" },
  {
    key: "category",
    caption: "Category",
    dropdownKey: "itemCategory",
    valueKey: "category_id",
    labelKey: "category_name",
  },
  { key: "brand", caption: "Brand", dropdownKey: "itemBrand", valueKey: "brand_id", labelKey: "brand_name" },
  { key: "section", caption: "Section", dropdownKey: "itemSection", valueKey: "sec_id", labelKey: "sec_name" },
  { key: "supplier", caption: "Supplier", dropdownKey: "supplier", valueKey: "sup_id", labelKey: "sup_name" },
  {
    key: "preset",
    caption: "Tracked as",
    dropdownKey: "stockTrackPreset",
    valueKey: "spt_id",
    labelKey: "spt_name",
    metaKey: "spt_code",
  },
  { key: "tax", caption: "Tax", dropdownKey: "tax", valueKey: "tax_id", labelKey: "tax_name" },
];

/**
 * The filter keys the server added with notes 76 — a 400 that names one of
 * them means the server in front of this screen does not know it yet.
 */
export const NOTES_76_FILTER_KEYS = [
  "search",
  "itemCategoryId",
  "trackPresetId",
  "taxId",
  "activeOnly",
] as const;

// ---------------------------------------------------------------- user types
/**
 * The user types the server's `HQ_USER_TYPES` lets save a CHAIN row —
 * mirrored only to grey the switch; the server's 403 is still the rule.
 */
export const HQ_USER_TYPES = ["HQ", "ADMIN", "SUPERADMIN"] as const;

export function isHqUserType(userType: string | null | undefined): boolean {
  const normalized = (userType ?? "").replace(/\s+/g, "").toUpperCase();
  return (HQ_USER_TYPES as readonly string[]).includes(normalized);
}

// ---------------------------------------------------------------- chips
export type SrcChipText = "NEW" | "BUCKET·CH" | "BUCKET·BR" | "MASTER";

/** The Src chip's colours — the grid's chips, the legend card and F12's list. */
export function chipColours(text: string): { fg: string; bg: string } {
  if (text === "NEW") {
    return { fg: "#15803d", bg: "#e8f5ea" };
  }
  if (text.endsWith("CH")) {
    return { fg: "#6d28d9", bg: "#f1eafd" };
  }
  if (text.startsWith("BUCKET")) {
    return { fg: "#1d4ed8", bg: "#e8eefc" };
  }
  return { fg: "#475569", bg: "#f1f5f9" };
}
