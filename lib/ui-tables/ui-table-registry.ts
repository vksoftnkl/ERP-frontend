/**
 * Which row of `fixed.ui_tables` — the UI Table Master screen's list — lays out
 * each grid this app renders.
 *
 * Screens used to name that row by its numeric `ui_tbl_id`. That id is a
 * per-deployment surrogate key: reseed the master, or author the grids on a
 * fresh database, and every id moves. A screen left pointing at a moved id does
 * not fail loudly — `/ui-table-masters/get?uiTableId=…` simply answers with no
 * table, and the grid falls back to its hardcoded columns, so a screen can run
 * for months on the wrong layout. Half the ids in this app had drifted that way
 * before this registry existed.
 *
 * So a screen names the TABLE, and the id is resolved at runtime from the
 * master's own Desktop rows (`useUiTableId`, or `getUiTableId` off React).
 * `fallbackId` is only what a screen uses until that list arrives — or if the
 * lookup finds nothing at all.
 */
/** One row of the UI Table Master list, whatever the payload spelled its keys. */
export type UiTableDirectoryRow = {
  uiTblId: string;
  uiTblName: string;
  deviceType: string;
  isActive: boolean;
};
/**
 * The device type these layouts are kept under. Every grid the web client
 * renders reads the Desktop row, because that is the one the UI Table Master
 * screen lists and the one an admin edits — the web-only duplicates this app
 * once carried (a second "QUOTATION - CHARGES", a second quotation item grid)
 * are gone, and a save from the browser now edits the layout everyone sees.
 *
 * The master's list (grid 35) already filters to it server-side; the filter is
 * applied again here so a re-authored grid cannot quietly hand a screen a Web
 * or Mobile row that happens to share a name.
 */
export const UI_TABLE_DEVICE_TYPE = "desktop";
/**
 * Every grid, by the `ui_tbl_name` it is configured under.
 *
 * The name is matched case-insensitively and must be the WHOLE name — these are
 * near-misses of each other ("ITEM MASTER - PRICE" vs "ITEM QTY WISE PRICE"), so
 * a prefix match would be a silent mix-up.
 */
export const UI_TABLES = {
  /** Item Master → Price rows. */
  itemPrice: { name: "ITEM MASTER - PRICE", fallbackId: "17" },
  /** Item Master → Reorder rows. */
  itemReorder: { name: "ITEM MASTER - REORDER", fallbackId: "16" },
  /** Item Master → alternate barcodes (EAN) rows. */
  itemAltBarcode: { name: "ITEM MASTER - ALT BARCODES", fallbackId: "15" },
  /** Item Qty Wise Price entry grid. */
  itemQtyPrice: { name: "ITEM QTY WISE PRICE", fallbackId: "19" },
  /** Opening Stock entry grid. */
  openingStockLines: { name: "OPENING STOCK - LINES", fallbackId: "27" },
  /** Opening Balance (menu 55) → the ledger set. */
  openingBalanceLedgers: { name: "OPENING BALANCE - LEDGERS", fallbackId: "30" },
  /** Opening Balance (menu 55) → the selected party's bill-wise breakup. */
  openingBalanceBills: { name: "OPENING BALANCE - BILLS", fallbackId: "31" },
  /** Receipt Entry (menu 99) → the bills grid: this party's bills AND credits. */
  receiptBills: { name: "RECEIPT - BILLS", fallbackId: "32" },
  /** Receipt Entry (menu 99) → the instruments grid: tenders AND role lines. */
  receiptTenders: { name: "RECEIPT - TENDERS", fallbackId: "33" },
  /** Physical Stock entry grid. */
  physicalStockLines: { name: "PHYSICAL STOCK - LINES", fallbackId: "28" },
  /** Quotation Entry item grid. */
  quotationLines: { name: "QUOTATION - LINES", fallbackId: "18" },
  /** Sale Bill Entry item grid. */
  saleBillLines: { name: "SALE BILL - LINES", fallbackId: "22" },
  /** The bill's adjust panel (§14.2): Credit · Date · Kind · Pending · Adjust · Remarks. */
  advanceAdj: { name: "ADVANCE ADJ", fallbackId: "25" },
  /** Sale Order Entry item grid. */
  saleOrderLines: { name: "SO - ITEM", fallbackId: "24" },
  /**
   * The additional-charges grid, shared by Quotation, Sale Bill and Sale Order:
   * one layout, one set of widths, whichever screen opens it.
   */
  charges: { name: "CHARGES", fallbackId: "21" },
} as const;
export type UiTableKey = keyof typeof UI_TABLES;
const ID_KEYS = ["ui_tbl_id", "uiTblId", "uiTableId", "id"] as const;
const NAME_KEYS = ["ui_tbl_name", "uiTblName", "name"] as const;
const DEVICE_TYPE_KEYS = ["ui_tbl_device_type", "uiTblDeviceType", "deviceType"] as const;
const IS_ACTIVE_KEYS = ["ui_tbl_is_active", "uiTblIsActive", "isActive", "status"] as const;
const ROW_ARRAY_KEYS = ["items", "data", "rows", "results", "list"] as const;
const resolvedIds = new Map<UiTableKey, string>();
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function firstDefined(
  source: Record<string, unknown>,
  keys: readonly string[],
): unknown {
  for (const key of keys) {
    const value = source[key];
    if (value !== undefined && value !== null && value !== "") {
      return value;
    }
  }
  return undefined;
}
function toText(value: unknown): string {
  if (typeof value === "string") {
    return value.trim();
  }
  if (typeof value === "number" || typeof value === "bigint") {
    return String(value);
  }
  return "";
}
function toBoolean(value: unknown, fallback: boolean): boolean {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    return value !== 0;
  }
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "t", "1", "yes", "y", "active"].includes(normalized)) {
      return true;
    }
    if (["false", "f", "0", "no", "n", "inactive"].includes(normalized)) {
      return false;
    }
  }
  return fallback;
}
function toDirectoryRow(value: unknown): UiTableDirectoryRow | null {
  if (!isRecord(value)) {
    return null;
  }
  const uiTblId = toText(firstDefined(value, ID_KEYS));
  const uiTblName = toText(firstDefined(value, NAME_KEYS));
  if (!uiTblId || !uiTblName) {
    return null;
  }
  return {
    uiTblId,
    uiTblName,
    deviceType: toText(firstDefined(value, DEVICE_TYPE_KEYS)),
    // A list that does not report the flag at all is a list of live tables.
    isActive: toBoolean(firstDefined(value, IS_ACTIVE_KEYS), true),
  };
}
/**
 * The rows out of whatever `/configured-grid-sql/run` (or the UI Table Master
 * module endpoint) answered with — `{ data: { items: [] } }` today, a bare array
 * or a `{ data: [] }` on other shapes of the same call.
 */
export function normalizeUiTableDirectoryPayload(payload: unknown): UiTableDirectoryRow[] {
  if (Array.isArray(payload)) {
    return payload.map(toDirectoryRow).filter((row): row is UiTableDirectoryRow => row !== null);
  }
  if (!isRecord(payload)) {
    return [];
  }
  for (const key of ROW_ARRAY_KEYS) {
    const value = payload[key];
    if (Array.isArray(value) || isRecord(value)) {
      const rows = normalizeUiTableDirectoryPayload(value);
      if (rows.length > 0) {
        return rows;
      }
    }
  }
  return [];
}
function compareCandidates(left: UiTableDirectoryRow, right: UiTableDirectoryRow): number {
  // An inactive table is still a match — it is what the master would show once
  // someone ticks it live again — but a live one always wins.
  if (left.isActive !== right.isActive) {
    return left.isActive ? -1 : 1;
  }
  const leftId = Number(left.uiTblId);
  const rightId = Number(right.uiTblId);
  if (Number.isFinite(leftId) && Number.isFinite(rightId) && leftId !== rightId) {
    return leftId - rightId;
  }
  return left.uiTblId.localeCompare(right.uiTblId);
}
/** The id of the Desktop table configured under `name`, or null when the list has none. */
export function findUiTableIdByName(
  name: string,
  rows: readonly UiTableDirectoryRow[],
): string | null {
  const wanted = name.trim().toLowerCase();
  if (!wanted) {
    return null;
  }
  const candidates = rows.filter((row) => {
    if (row.uiTblName.toLowerCase() !== wanted) {
      return false;
    }
    // A row with no device type at all is taken at face value: the list it came
    // from is the one the master screen shows, and that list is Desktop.
    const deviceType = row.deviceType.toLowerCase();
    return deviceType === "" || deviceType === UI_TABLE_DEVICE_TYPE;
  });
  if (candidates.length === 0) {
    return null;
  }
  return [...candidates].sort(compareCandidates)[0].uiTblId;
}
/**
 * Remembers what the master's list says, so code that cannot hold a React hook
 * (the column-settings builders, the grid save payloads) can still read an id
 * synchronously. Called for every successful fetch of the list.
 */
export function primeUiTableDirectory(rows: readonly UiTableDirectoryRow[]): void {
  for (const key of Object.keys(UI_TABLES) as UiTableKey[]) {
    const id = findUiTableIdByName(UI_TABLES[key].name, rows);
    if (id) {
      resolvedIds.set(key, id);
    } else {
      // The table is gone from the master (renamed, deleted, never seeded here):
      // drop what we knew rather than keep serving an id nothing stands behind.
      resolvedIds.delete(key);
    }
  }
}
/**
 * This grid's table id as best we know it — the master's own answer once the
 * list has been fetched, the registry's fallback until then.
 */
export function getUiTableId(key: UiTableKey): string {
  return resolvedIds.get(key) ?? UI_TABLES[key].fallbackId;
}
/** As `getUiTableId`, reading `rows` first when a caller already holds the list. */
export function resolveUiTableId(
  key: UiTableKey,
  rows?: readonly UiTableDirectoryRow[],
): string {
  if (rows) {
    const id = findUiTableIdByName(UI_TABLES[key].name, rows);
    if (id) {
      return id;
    }
  }
  return getUiTableId(key);
}
export function resetUiTableDirectoryForTests(): void {
  resolvedIds.clear();
}
