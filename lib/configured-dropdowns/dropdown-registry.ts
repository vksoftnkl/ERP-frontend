/**
 * Which row of `fixed.dropdown_details` — the Dropdown Master screen's list —
 * backs each configured dropdown this app opens.
 *
 * The third of the same story as `lib/configured-grids` and `lib/ui-tables`:
 * `dropdown_id` is a per-deployment surrogate key, and Dropdown Master lists the
 * Desktop rows only (its grid's SQL ends `WHERE dropdown_device_type =
 * 'Desktop'`). Every screen still pointing at one of the old un-typed rows — 8
 * "company", 5 "branch", 9 "state code", 10 "Area", 3/28 customer groups, 6
 * "items" — was reading a dropdown nobody could see or edit, and the Desktop row
 * beside it (22 COMPANYS, 32 BRANCHES, 21 GST - STATE CODES, 13 AREA LIST, 33
 * CUSTOMER GROUPS, 42 ITEMS) is the one an admin actually maintains.
 *
 * So a screen names the DROPDOWN, and the id is resolved at runtime
 * (`useDropdownId`, or `getDropdownId` off React). `fallbackId` is only what a
 * screen uses until the list arrives, or if the lookup finds nothing.
 */
/** One row of the Dropdown Master list, whatever the payload spelled its keys. */
export type DropdownDirectoryRow = {
  dropdownId: string;
  dropdownName: string;
  deviceType: string;
};
/**
 * The device type every dropdown here reads. Dropdown Master's list filters to
 * it server-side; filtered again here so a re-authored grid cannot hand a screen
 * a `Web` row that happens to share a name.
 */
export const CONFIGURED_DROPDOWN_DEVICE_TYPE = "desktop";
/**
 * Every configured dropdown, by the `dropdown_name` it is stored under.
 *
 * `paramBound` marks the ones whose SQL binds a token: they 400 unless the
 * caller sends `dropdown_param`, which is a property of the dropdown rather than
 * of the screen, so it is recorded here next to the name.
 */
export const CONFIGURED_DROPDOWNS = {
  area: { name: "AREA LIST", fallbackId: "13", paramBound: false },
  itemUnit: { name: "ITEM UNITS", fallbackId: "15", paramBound: false },
  itemGroup: { name: "ITEM GROUPS", fallbackId: "17", paramBound: false },
  itemBrand: { name: "ITEM BRANDS", fallbackId: "18", paramBound: false },
  itemSection: { name: "ITEM SECTIONS", fallbackId: "19", paramBound: false },
  itemCategory: { name: "ITEM CATEGORIES", fallbackId: "20", paramBound: false },
  /** The 2-char GST `state_code`, not the `state_master` uuid — see `customerState`. */
  gstStateCode: { name: "GST - STATE CODES", fallbackId: "21", paramBound: false },
  company: { name: "COMPANYS", fallbackId: "22", paramBound: false },
  accountGroup: { name: "ACCOUNT GROUPS", fallbackId: "23", paramBound: false },
  branchActive: { name: "BRANCH - ACTIVE LIST", fallbackId: "24", paramBound: false },
  godown: { name: "GODOWNS", fallbackId: "26", paramBound: false },
  appTheme: { name: "APP THEMES", fallbackId: "27", paramBound: false },
  /** `state_master` rows (uuid keyed), unlike `gstStateCode`. */
  customerState: { name: "CUSTOMER STATES", fallbackId: "29", paramBound: false },
  supplierGroup: { name: "SUPPLIER GROUP", fallbackId: "31", paramBound: false },
  branch: { name: "BRANCHES", fallbackId: "32", paramBound: false },
  customerGroup: { name: "CUSTOMER GROUPS", fallbackId: "33", paramBound: false },
  priceLevel: { name: "PRICE LEVELS", fallbackId: "34", paramBound: false },
  supplier: { name: "SUPPLIERS", fallbackId: "35", paramBound: false },
  tax: { name: "TAXES", fallbackId: "36", paramBound: false },
  /** Salesmen and agents alike. Its SQL binds a company token — send `dropdown_param`. */
  employee: { name: "EMPLOYEES", fallbackId: "38", paramBound: true },
  customer: { name: "CUSTOMERS", fallbackId: "39", paramBound: false },
  item: { name: "ITEMS", fallbackId: "42", paramBound: false },
  bank: { name: "INDIAN BANKS LIST", fallbackId: "46", paramBound: false },
  ledgerForPostingRole: { name: "LEDGERS FOR POSTING ROLE", fallbackId: "51", paramBound: true },
  postingRoleRateWise: { name: "POSTING ROLES - RATE WISE", fallbackId: "52", paramBound: false },
  gstRate: { name: "GST RATES", fallbackId: "53", paramBound: false },
} as const;
export type ConfiguredDropdownKey = keyof typeof CONFIGURED_DROPDOWNS;
const ID_KEYS = ["dropdown_id", "dropdownId", "id"] as const;
const NAME_KEYS = ["dropdown_name", "dropdownName", "name"] as const;
const DEVICE_TYPE_KEYS = ["dropdown_device_type", "dropdownDeviceType", "deviceType"] as const;
const ROW_ARRAY_KEYS = ["items", "data", "rows", "results", "list"] as const;
const resolvedIds = new Map<ConfiguredDropdownKey, string>();
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
function toDirectoryRow(value: unknown): DropdownDirectoryRow | null {
  if (!isRecord(value)) {
    return null;
  }
  const dropdownId = toText(firstDefined(value, ID_KEYS));
  const dropdownName = toText(firstDefined(value, NAME_KEYS));
  if (!dropdownId || !dropdownName) {
    return null;
  }
  return {
    dropdownId,
    dropdownName,
    deviceType: toText(firstDefined(value, DEVICE_TYPE_KEYS)),
  };
}
/** The rows out of whatever `/configured-grid-sql/run` answered with. */
export function normalizeDropdownDirectoryPayload(payload: unknown): DropdownDirectoryRow[] {
  if (Array.isArray(payload)) {
    return payload.map(toDirectoryRow).filter((row): row is DropdownDirectoryRow => row !== null);
  }
  if (!isRecord(payload)) {
    return [];
  }
  for (const key of ROW_ARRAY_KEYS) {
    const value = payload[key];
    if (Array.isArray(value) || isRecord(value)) {
      const rows = normalizeDropdownDirectoryPayload(value);
      if (rows.length > 0) {
        return rows;
      }
    }
  }
  return [];
}
/** The id of the Desktop dropdown configured under `name`, or null when there is none. */
export function findDropdownIdByName(
  name: string,
  rows: readonly DropdownDirectoryRow[],
): string | null {
  const wanted = name.trim().toLowerCase();
  if (!wanted) {
    return null;
  }
  const candidates = rows.filter((row) => {
    if (row.dropdownName.toLowerCase() !== wanted) {
      return false;
    }
    // A row with no device type at all is taken at face value: the list it came
    // from is Dropdown Master's, and that list is Desktop.
    const deviceType = row.deviceType.toLowerCase();
    return deviceType === "" || deviceType === CONFIGURED_DROPDOWN_DEVICE_TYPE;
  });
  if (candidates.length === 0) {
    return null;
  }
  // Two rows under one name: the lower id is the older, established one.
  return [...candidates]
    .sort((left, right) => {
      const leftId = Number(left.dropdownId);
      const rightId = Number(right.dropdownId);
      if (Number.isFinite(leftId) && Number.isFinite(rightId) && leftId !== rightId) {
        return leftId - rightId;
      }
      return left.dropdownId.localeCompare(right.dropdownId);
    })[0].dropdownId;
}
/**
 * Remembers what Dropdown Master's list says, so code that cannot hold a React
 * hook still reads an id synchronously. Called on every successful fetch.
 */
export function primeDropdownDirectory(rows: readonly DropdownDirectoryRow[]): void {
  for (const key of Object.keys(CONFIGURED_DROPDOWNS) as ConfiguredDropdownKey[]) {
    const id = findDropdownIdByName(CONFIGURED_DROPDOWNS[key].name, rows);
    if (id) {
      resolvedIds.set(key, id);
    } else {
      // Gone from Dropdown Master: drop what we knew rather than keep serving an
      // id nothing stands behind.
      resolvedIds.delete(key);
    }
  }
}
/**
 * This dropdown's id as best we know it — Dropdown Master's own answer once the
 * list has been fetched, the registry's fallback until then.
 */
export function getDropdownId(key: ConfiguredDropdownKey): string {
  return resolvedIds.get(key) ?? CONFIGURED_DROPDOWNS[key].fallbackId;
}
/** As `getDropdownId`, reading `rows` first when a caller already holds the list. */
export function resolveDropdownId(
  key: ConfiguredDropdownKey,
  rows?: readonly DropdownDirectoryRow[],
): string {
  if (rows) {
    const id = findDropdownIdByName(CONFIGURED_DROPDOWNS[key].name, rows);
    if (id) {
      return id;
    }
  }
  return getDropdownId(key);
}
export function resetDropdownDirectoryForTests(): void {
  resolvedIds.clear();
}
