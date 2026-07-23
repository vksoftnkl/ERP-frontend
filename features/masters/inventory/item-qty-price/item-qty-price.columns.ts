import type { UiTableColumnConfigRow } from "@/store/api/itemQtyPriceApi";
// Dynamic (config-driven) columns. "index" and "item" are always pinned first
// by the page itself — the admin-configured "Item Qty Wise Price web" table
// (fixed.ui_tables id 20) has no friendly label for Item, only the raw
// `item_id` id-echo row, so it's intentionally excluded from this map and
// handled as a pinned column instead. See erp-item-qty-price-page memory.
export type DynamicColumnKey =
  | "company"
  | "branch"
  | "party"
  | "priceLevel"
  | "unit"
  | "fromQty"
  | "toQty"
  | "priceMode"
  | "discPct"
  | "flatOff"
  | "price"
  | "effectiveFrom"
  | "effectiveTo"
  | "isActive"
  | "isTaxIncl";
// Keyed by the normalized (alphanumeric-lowercased) `ui_tbl_clm_name`. The
// table also carries raw id-echo duplicates (company_id, branch_id, party_id,
// price_level_id, item_unit_id) alongside their friendly counterparts —
// mapping both variants onto the same key lets resolveConfiguredColumns
// dedupe them (first occurrence by position wins, see stock-utils-derived
// convention in item-master-page.utils.ts applyConfiguredLinkedTableColumnConfig).
const COLUMN_NAME_TO_KEY: Record<string, DynamicColumnKey> = {
  company: "company",
  companyid: "company",
  branch: "branch",
  branchid: "branch",
  customer: "party",
  partyid: "party",
  pricelevel: "priceLevel",
  pricelevelid: "priceLevel",
  uom: "unit",
  itemunitid: "unit",
  fromqty: "fromQty",
  toqty: "toQty",
  mode: "priceMode",
  disc: "discPct", // "Disc %" strips to "disc"
  discpct: "discPct",
  discrs: "flatOff",
  price: "price",
  fromdate: "effectiveFrom",
  todate: "effectiveTo",
  active: "isActive",
  incltax: "isTaxIncl",
};
// "Notes" is configured but item_qty_price has no backing column for it —
// deliberately unmapped so it's dropped rather than rendered as a dead field.
export type ResolvedColumn = {
  key: DynamicColumnKey;
  header: string;
};
function normalizeColumnName(value: string): string {
  return value.replace(/[^a-zA-Z0-9]+/g, "").toLowerCase();
}
export function resolveConfiguredColumns(
  configRows: UiTableColumnConfigRow[],
): ResolvedColumn[] {
  const seenKeys = new Set<DynamicColumnKey>();
  const sortedRows = [...configRows].sort(
    (left, right) => left.uiTblClmColumnPosition - right.uiTblClmColumnPosition,
  );
  const resolved: ResolvedColumn[] = [];
  for (const row of sortedRows) {
    if (!row.uiTblClmColumnVisibility) continue;
    const key = COLUMN_NAME_TO_KEY[normalizeColumnName(row.uiTblClmName)];
    if (!key || seenKeys.has(key)) continue;
    seenKeys.add(key);
    resolved.push({ key, header: row.uiTblClmName });
  }
  return resolved;
}
// Fallback order (matches the current admin config) used until the config
// loads, or if it ever comes back empty.
export const DEFAULT_DYNAMIC_COLUMNS: ResolvedColumn[] = [
  { key: "company", header: "Company" },
  { key: "branch", header: "Branch" },
  { key: "party", header: "Customer" },
  { key: "priceLevel", header: "Price Level" },
  { key: "unit", header: "Uom" },
  { key: "fromQty", header: "From Qty" },
  { key: "toQty", header: "To Qty" },
  { key: "priceMode", header: "Mode" },
  { key: "discPct", header: "Disc %" },
  { key: "flatOff", header: "Disc Rs" },
  { key: "price", header: "Price" },
  { key: "effectiveFrom", header: "From Date" },
  { key: "effectiveTo", header: "To Date" },
  { key: "isActive", header: "Active" },
  { key: "isTaxIncl", header: "Incl Tax" },
];