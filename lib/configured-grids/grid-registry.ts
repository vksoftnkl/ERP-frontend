/**
 * Which row of `fixed.grid_details` — the Grid Master screen's list — backs each
 * list this app renders.
 *
 * Same argument as `lib/ui-tables`, one table over: `grid_id` is a
 * per-deployment surrogate key, so a screen that names one by number is pointing
 * at whatever that database happened to number it. It also had a second problem
 * of its own — Grid Master only ever LISTS the Desktop grids (its own SQL ends
 * `WHERE grid_device_type = 'Desktop'`), so every screen still reading a legacy
 * `web` grid was reading a grid the user cannot see, let alone configure. Widths,
 * visibility, filters and totals set in Grid Master landed on a row nothing read.
 *
 * So a screen names the GRID, and the id is resolved at runtime from the Desktop
 * rows (`useGridId`, or `getGridId` off React). `fallbackId` is only what a
 * screen uses until that list arrives, or if the lookup finds nothing.
 */
/** One row of the Grid Master list, whatever the payload spelled its keys. */
export type GridDirectoryRow = {
  gridId: string;
  gridName: string;
  deviceType: string;
  isActive: boolean;
};
/**
 * The device type every list here reads. Grid Master's own list filters to it
 * server-side; the filter is applied again here so a re-authored grid cannot
 * quietly hand a screen a `web` row that happens to share a name.
 */
export const CONFIGURED_GRID_DEVICE_TYPE = "desktop";
/**
 * Every list, by the `grid_name` it is configured under.
 *
 * `deletedParam` is the name of the token the grid's SQL binds its
 * `*_is_deleted` filter to — what a screen's "Show deleted records" checkbox has
 * to be sent as (`grid_param`). `null` means the grid hardcodes `= false`: there
 * are no deleted rows to ask for, and a screen should not offer the checkbox.
 */
export const CONFIGURED_GRIDS = {
  itemList: { name: "MAIN LIST - ITEMS", fallbackId: "67", deletedParam: null },
  itemPickerPopup: { name: "POPUP - ITEMS", fallbackId: "71", deletedParam: null },
  itemGroupList: { name: "MAIN LIST - ITEM GROUPS", fallbackId: "48", deletedParam: "iitg_is_deleted" },
  itemBrandList: { name: "MAIN LIST - ITEM BRAND", fallbackId: "49", deletedParam: "ibrand_is_deleted" },
  itemCategoryList: { name: "MAIN LIST - ITEM CATEGORY", fallbackId: "51", deletedParam: "icategory_is_deleted" },
  godownList: { name: "MAIN LIST - GODOWNS", fallbackId: "55", deletedParam: "igdl_is_deleted" },
  stateList: { name: "MAIN LIST - CUSTOMER STATES", fallbackId: "57", deletedParam: "istm_is_deleted" },
  cityList: { name: "MAIN LIST - CUSTOMER CITES", fallbackId: "58", deletedParam: "ictm_is_deleted" },
  areaList: { name: "MAIN LIST - CUSTOMER AREAS", fallbackId: "59", deletedParam: "iarm_is_deleted" },
  customerList: { name: "MAIN LIST - CUSTOMERS", fallbackId: "65", deletedParam: null },
  customerGroupList: { name: "MAIN LIST - CUSTOMER GROUPS", fallbackId: "66", deletedParam: "icgr_is_deleted" },
  supplierList: { name: "MAIN LIST - SUPPLIERS", fallbackId: "63", deletedParam: "isup_is_deleted" },
  supplierGroupList: { name: "MAIN LIST - SUPPLIER GROUPS", fallbackId: "61", deletedParam: "ispg_is_deleted" },
  companyList: { name: "MAIN LIST - COMPANYS", fallbackId: "52", deletedParam: null },
  branchList: { name: "MAIN LIST - BRANCHES", fallbackId: "56", deletedParam: null },
  employeeList: { name: "MAIN LIST - EMPLOYEES", fallbackId: "77", deletedParam: null },
  employeeDepartmentList: { name: "MAIN LIST - EMP DEPARTMENTS", fallbackId: "73", deletedParam: null },
  employeeDesignationList: { name: "MAIN LIST - EMP DESIGNATIONS", fallbackId: "75", deletedParam: "ied_is_deleted" },
  accountGroupList: { name: "MAIN LIST - ACCOUNT GROUP", fallbackId: "53", deletedParam: null },
  accountLedgerList: { name: "MAIN LIST - LEDGERS", fallbackId: "54", deletedParam: "iled_is_deleted" },
  /**
   * The Opening Balance screen's ledger picker. Its SQL restricts to the two
   * balance-sheet natures on its own, which is why the screen adds no nature
   * filter of its own — an opening on an income ledger is a category error, and
   * the grid already refuses to offer one.
   */
  ledgerPickerPopup: { name: "POPUP - LEDGERS", fallbackId: "107", deletedParam: null },
  userList: { name: "MAIN LIST - COMPUTER USERS", fallbackId: "62", deletedParam: null },
  deviceList: { name: "DESKTOP - DEVICE MASTER LIST", fallbackId: "31", deletedParam: null },
  gridMasterList: { name: "GRID MASTER LIST", fallbackId: "34", deletedParam: null },
  uiTableMasterList: { name: "MAIN LIST - UI TABLES", fallbackId: "38", deletedParam: null },
  dropdownMasterList: { name: "MAIN LIST - DROPDOWN", fallbackId: "43", deletedParam: null },
  tenderList: { name: "MAIN LIST - TENDERS", fallbackId: "85", deletedParam: "itnd_is_deleted" },
  chargeList: { name: "CHARGES MAIN LIST", fallbackId: "81", deletedParam: null },
  freightChargeList: { name: "MAIN LIST - FREIGHT CHARGES", fallbackId: "74", deletedParam: null },
  loadingChargeList: { name: "MAIN LIST - LOADING CHARGES", fallbackId: "76", deletedParam: null },
  gstRateList: { name: "MAIN LIST - GST RATES", fallbackId: "103", deletedParam: null },
  openingStockList: { name: "MAIN LIST - OPENING STOCK", fallbackId: "99", deletedParam: null },
  quotationList: { name: "TXN MAIN LIST - QUOTATION", fallbackId: "83", deletedParam: null },
  billList: { name: "TXN MAIN LIST - BILLS", fallbackId: "86", deletedParam: null },
  saleOrderList: { name: "TXN MAIN LIST - SALES ORDER", fallbackId: "87", deletedParam: null },
  /**
   * Receipt Entry (menu 99) — the register behind F8.
   *
   * Its SQL names a bare `iavh_status` token, which the runner substitutes as
   * TEXT rather than binding: a call that omits it leaves the literal word in
   * the statement and the WHOLE query fails, not just the filter. So the screen
   * always sends it, empty string for "every status".
   */
  receiptList: { name: "MAIN LIST - RECEIPTS", fallbackId: "108", deletedParam: null },
  /**
   * Received Cheques (menu 51) — the register. Its SQL names NINE bare tokens
   * (`iapd_company_id` … `isearch`) and every one must be sent, empty string
   * for "no filter", or the whole query fails. The search is `isearch` inside
   * `grid_param`, never the runner's own `search` key.
   */
  receivedChequeList: { name: "MAIN LIST - RECEIVED CHEQUES", fallbackId: "109", deletedParam: null },
  /** Sale Bill (§24) — the delivery register, menu 226. Binds `idelivery_status` ('' = pending set). */
  billDeliveryList: { name: "MAIN LIST - BILL DELIVERY", fallbackId: "113", deletedParam: null },
  /** Sale Bill (§24) — the temp-credit follow-up list, menu 257. Binds `istatus` and `ioverdue_only`. */
  tempCreditList: { name: "MAIN LIST - TEMP CREDITS", fallbackId: "114", deletedParam: null },
  /** Sale Bill (§22) — Ctrl+F6's picker: this device's bills from today. Binds `idevice_id`. */
  retenderBillPopup: { name: "POPUP - RECENT BILLS FOR RE-TENDER", fallbackId: "115", deletedParam: null },
  /** Receipt Entry — the bank picker on a cheque row. Free text is allowed too. */
  bankPopup: { name: "POPUP - BANKS", fallbackId: "111", deletedParam: null },
  /** Receipt Entry — F7, everything that has ever settled the bill under the cursor. */
  billPaymentHistoryPopup: {
    name: "POPUP - BILL PAYMENT HISTORY",
    fallbackId: "112",
    deletedParam: null,
  },
} as const;
export type ConfiguredGridKey = keyof typeof CONFIGURED_GRIDS;
const ID_KEYS = ["grid_id", "gridId", "id"] as const;
const NAME_KEYS = ["grid_name", "gridName", "name"] as const;
const DEVICE_TYPE_KEYS = ["grid_device_type", "gridDeviceType", "deviceType"] as const;
const IS_ACTIVE_KEYS = ["grid_status", "gridStatus", "grid_is_active", "isActive", "status"] as const;
const ROW_ARRAY_KEYS = ["items", "data", "rows", "results", "list"] as const;
const resolvedIds = new Map<ConfiguredGridKey, string>();
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function firstDefined(source: Record<string, unknown>, keys: readonly string[]): unknown {
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
function toDirectoryRow(value: unknown): GridDirectoryRow | null {
  if (!isRecord(value)) {
    return null;
  }
  const gridId = toText(firstDefined(value, ID_KEYS));
  const gridName = toText(firstDefined(value, NAME_KEYS));
  if (!gridId || !gridName) {
    return null;
  }
  return {
    gridId,
    gridName,
    deviceType: toText(firstDefined(value, DEVICE_TYPE_KEYS)),
    // A list that does not report the flag at all is a list of live grids.
    isActive: toBoolean(firstDefined(value, IS_ACTIVE_KEYS), true),
  };
}
/** The rows out of whatever `/configured-grid-sql/run` answered with. */
export function normalizeGridDirectoryPayload(payload: unknown): GridDirectoryRow[] {
  if (Array.isArray(payload)) {
    return payload.map(toDirectoryRow).filter((row): row is GridDirectoryRow => row !== null);
  }
  if (!isRecord(payload)) {
    return [];
  }
  for (const key of ROW_ARRAY_KEYS) {
    const value = payload[key];
    if (Array.isArray(value) || isRecord(value)) {
      const rows = normalizeGridDirectoryPayload(value);
      if (rows.length > 0) {
        return rows;
      }
    }
  }
  return [];
}
function compareCandidates(left: GridDirectoryRow, right: GridDirectoryRow): number {
  // A disabled grid is still a match — it is what Grid Master would show once
  // someone ticks it live again — but a live one always wins.
  if (left.isActive !== right.isActive) {
    return left.isActive ? -1 : 1;
  }
  const leftId = Number(left.gridId);
  const rightId = Number(right.gridId);
  if (Number.isFinite(leftId) && Number.isFinite(rightId) && leftId !== rightId) {
    return leftId - rightId;
  }
  return left.gridId.localeCompare(right.gridId);
}
/** The id of the Desktop grid configured under `name`, or null when there is none. */
export function findGridIdByName(
  name: string,
  rows: readonly GridDirectoryRow[],
): string | null {
  const wanted = name.trim().toLowerCase();
  if (!wanted) {
    return null;
  }
  const candidates = rows.filter((row) => {
    if (row.gridName.toLowerCase() !== wanted) {
      return false;
    }
    // A row with no device type at all is taken at face value: the list it came
    // from is Grid Master's, and that list is Desktop.
    const deviceType = row.deviceType.toLowerCase();
    return deviceType === "" || deviceType === CONFIGURED_GRID_DEVICE_TYPE;
  });
  if (candidates.length === 0) {
    return null;
  }
  return [...candidates].sort(compareCandidates)[0].gridId;
}
/**
 * Remembers what Grid Master's list says, so code that cannot hold a React hook
 * can still read an id synchronously. Called on every successful fetch.
 */
export function primeGridDirectory(rows: readonly GridDirectoryRow[]): void {
  for (const key of Object.keys(CONFIGURED_GRIDS) as ConfiguredGridKey[]) {
    const id = findGridIdByName(CONFIGURED_GRIDS[key].name, rows);
    if (id) {
      resolvedIds.set(key, id);
    } else {
      // Gone from Grid Master (renamed, deleted, never seeded here): drop what we
      // knew rather than keep serving an id nothing stands behind.
      resolvedIds.delete(key);
    }
  }
}
/**
 * This list's grid id as best we know it — Grid Master's own answer once the
 * list has been fetched, the registry's fallback until then.
 */
export function getGridId(key: ConfiguredGridKey): string {
  return resolvedIds.get(key) ?? CONFIGURED_GRIDS[key].fallbackId;
}
/** As `getGridId`, reading `rows` first when a caller already holds the list. */
export function resolveGridId(
  key: ConfiguredGridKey,
  rows?: readonly GridDirectoryRow[],
): string {
  if (rows) {
    const id = findGridIdByName(CONFIGURED_GRIDS[key].name, rows);
    if (id) {
      return id;
    }
  }
  return getGridId(key);
}
/** `/configured-grid-sql/run` for this grid, ready for a master screen's `list`. */
export function gridRunEndpoint(gridId: string | number): string {
  return `/configured-grid-sql/run?grid_id=${gridId}`;
}
/**
 * Whether this grid's SQL lets a caller ask for soft-deleted rows. A grid that
 * hardcodes `x_is_deleted = false` cannot, and a screen should leave its "Show
 * deleted records" checkbox out rather than render one that does nothing.
 */
export function gridSupportsDeletedFilter(key: ConfiguredGridKey): boolean {
  return CONFIGURED_GRIDS[key].deletedParam !== null;
}
/**
 * The `grid_param` entry that asks this grid for live or deleted rows — `{}`
 * when it has no such token. `wantdelete` is sent alongside because the legacy
 * `web` grids bound their filter to that name, and an unmatched key is ignored,
 * so one call works against either grid.
 */
export function buildGridDeletedParam(
  key: ConfiguredGridKey,
  wantDeleted: boolean,
): Record<string, boolean> {
  const token = CONFIGURED_GRIDS[key].deletedParam;
  return token ? { wantdelete: wantDeleted, [token]: wantDeleted } : { wantdelete: wantDeleted };
}
export function resetGridDirectoryForTests(): void {
  resolvedIds.clear();
}
