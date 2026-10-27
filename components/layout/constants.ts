import type { IconType } from "react-icons";
import {
  FiBarChart2,
  FiBox,
  FiCreditCard,
  FiPackage,
  FiSettings,
  FiShoppingBag,
  FiShoppingCart,
  FiTruck,
} from "react-icons/fi";
import type {
  ErpHeaderIconKey,
  ErpHeaderItem,
  ErpMenuPermissionFlags,
  MenuRoute,
} from "./types";
import type { ERPDynamicSelectOption } from "@/components/design-system/ui";
export const ERP_HEADER_ICON_COMPONENTS: Record<ErpHeaderIconKey, IconType> = {
  sales: FiShoppingBag,
  purchase: FiShoppingCart,
  inventory: FiBox,
  stock: FiPackage,
  accounts: FiCreditCard,
  reports: FiBarChart2,
  settings: FiSettings,
  transport: FiTruck,
};
/**
 * Where each `fixed.menu_master` row leads, keyed by `menu_id`. Everything the
 * header SHOWS comes from the DB — names, order, nesting, visibility — so
 * nothing here carries a label: renaming or moving a menu in the DB changes the
 * header and keeps the route. A DB row with no entry here shows as a plain
 * label. Top-level rows map to their icon.
 *
 * Binding an href also makes the route GOVERNED: the permission gate refuses it
 * to anyone whose usermenu lacks that menu (lib/permissions/menu-permissions.ts).
 * So bind an href only once its menu row is seeded and granted.
 */
export const MENU_ROUTES: Readonly<Record<number, MenuRoute>> = {
  // Sales
  1: { iconKey: "sales" },
  10: { href: "/master/customer" },
  14: { href: "/sales/quotation" },
  11: { href: "/sales/sale-order" },
  // The sale bill (Ctrl+S).
  12: { href: "/sales/sale-bill" },
  // The two registers the sale bill owns (plan-react-sale-bill §24): grid 113
  // and grid 114.
  226: { href: "/sales/bill-delivery" },
  257: { href: "/sales/temp-credits" },
  67: { href: "/sales/promotion-loyalty-points" },
  18: { href: "/master/state-master" },
  19: { href: "/master/city-master" },
  20: { href: "/master/area-master" },
  21: { href: "/master/customer-groups" },
  95: { href: "/master/tender-master" },
  130: { href: "/master/freight-charges-master" },
  177: { href: "/master/loading-charges-master" },
  // Till (Qt NexERP d5c3637). The keyed cockpit
  // /sales/till/sessions/:company/:branch/:year/:id inherits 273 by prefix.
  272: { href: "/sales/till/open" },
  273: { href: "/sales/till/sessions" },
  // Notes 133, Qt 1d3e203: read-only variance / exceptions / approvers / safe book.
  288: { href: "/sales/till/reports" },
  // Notes 134, Qt 3b5069d: head office's every-store page and its HO reviews.
  289: { href: "/sales/till/cash-position" },
  274: { href: "/sales/till/business-day" },
  // Notes 118: the safe — balance, count, remittance. Not the retired 286.
  287: { href: "/sales/till/cash-office" },
  275: { href: "/sales/till/counters" },
  280: { href: "/sales/till/safes" },
  281: { href: "/sales/till/reasons" },
  282: { href: "/sales/till/denominations" },
  276: { href: "/sales/till/approval-rules" },
  285: { href: "/sales/till/approval-authority" },

  // Purchase
  2: { iconKey: "purchase" },
  22: { href: "/master/suppliers" },
  27: { href: "/master/supplier-groups" },

  // Inventory
  3: { iconKey: "inventory" },
  29: { href: "/master/item-master" },
  30: { href: "/stock/change-selling-price" },
  244: { href: "/master/item-qty-price-master" },
  35: { href: "/master/item-group-master" },
  240: { href: "/master/item-category-master" },
  36: { href: "/master/item-brand-master" },
  37: { href: "/master/item-section-master" },
  38: { href: "/master/unit-master" },
  // Textile, server notes 147.
  291: { href: "/master/item-size-master" },
  292: { href: "/master/item-colour-master" },
  39: { href: "/master/godown-master" },
  40: { href: "/master/tax-master" },
  // Under Item Masters (34). Qt NexERP 97a8e59 / d27045b, server notes 159.
  249: { href: "/master/tracking-presets" },
  293: { href: "/master/stock-reasons" },
  294: { href: "/master/ageing-slabs" },

  // Stock
  4: { iconKey: "stock" },
  44: { href: "/stock/opening-stock" },
  45: { href: "/stock/physical-stock" },
  264: { href: "/stock/stock-adjustment" },
  // Transfers (Qt NexERP 62d1d87, server notes 153–156 / 160).
  41: { href: "/stock/godown-transfer" },
  192: { href: "/stock/branch-outward" },
  193: { href: "/stock/branch-inward" },

  // Accounts
  5: { iconKey: "accounts" },
  54: { href: "/master/account-ledger-groups-master" },
  53: { href: "/master/account-ledger-master" },
  55: { href: "/accounts/opening-balance" },
  99: { href: "/accounts/receipt" },
  100: { href: "/accounts/payment" },
  51: { href: "/accounts/received-cheques" },
  52: { href: "/accounts/issued-cheques" },
  263: { href: "/accounts/cheque-books" },
  104: { href: "/accounts/contra" },
  260: { href: "/accounts/receipt-voucher" },
  261: { href: "/accounts/payment-voucher" },
  103: { href: "/accounts/journal" },
  259: { href: "/accounts/sales-accounting" },
  163: { href: "/accounts/purchase-accounting" },
  // Qt NexERP d5c3637; the keyed voucher route
  // /accounts/expense-voucher/:company/:branch/:year/:id inherits it.
  277: { href: "/accounts/expense-voucher" },
  278: { href: "/accounts/settlement-reconciliation" },
  101: { href: "/accounts/debit-note" },
  102: { href: "/accounts/credit-note" },
  262: { href: "/accounts/voucher-register" },

  // Reports
  6: { iconKey: "reports" },
  // Grant it in User Administration.
  279: { href: "/reports/party-outstanding" },
  // Server notes 144. Its VIEW right is the report's access: every
  // /item-price-log route 403s without it.
  290: { href: "/reports/price-change-log" },
  106: { href: "/master/audit-logs" },
  258: { href: "/reports/ledger-statement" },
  // 181, hidden, opens the same screen on the Vouchers tab; the guard strips
  // the query, so either grant opens the route.
  284: { href: "/reports/day-summary" },
  181: { href: "/reports/day-summary?tab=vouchers" },

  // Settings
  7: { iconKey: "settings" },
  56: { href: "/master/companies" },
  191: { href: "/master/branches-master" },
  57: { href: "/master/employee-master" },
  58: { href: "/master/user-administration" },
  59: { href: "/master/module-administration" },
  73: { href: "/master/grid-master" },
  77: { href: "/master/dropdown-master" },
  242: { href: "/master/ui-table-master" },
  70: { href: "/master/employee-department-master" },
  71: { href: "/master/employee-designation-master" },
  239: { href: "/master/device-list-master" },
  160: { href: "/master/customer-template" },
  161: { href: "/master/item-template" },
  // It used to point at /settings/print-templates, the print-designer's own
  // list. That screen is a `/reports/*` client and the server has no reporting
  // module at all, so every one of its calls answered 404 — the list, the
  // designer it opened, and that designer's Preview (`POST /reports/preview`).
  // It now points at the 17_printing engine, which is the same job over tables
  // that exist. Repointing kept the route governed by a grant users have.
  62: { href: "/settings/printing/templates" },
  248: { href: "/settings/printing/assignments" },
  246: { href: "/settings/app-settings" },
  // Seeded by the server's 20260930190000_app_theme_tokens migration, so the
  // row exists wherever the theme tables do.
  266: { href: "/settings/app-themes" },
  174: { href: "/master/price-level-configuration" },
  245: { href: "/master/charge-master" },
  243: { href: "/master/widget-master" },
  // The Posting Ledger Map.
  250: { href: "/settings/ledger-map" },
  // Seeded by the server's 20261002150000_gst_menus migration.
  269: { href: "/settings/gst-providers" },
  270: { href: "/settings/gst-credentials" },

  // Transport
  8: { iconKey: "transport" },
};
export const MENU_MASTERS_GET_ENDPOINT = "/menu-masters/get";
export const MENU_MASTERS_USERMENU_ENDPOINT = "/menu-masters/usermenu";
export type MenuMasterItem = {
  menuId?: number;
  menuName: string;
  menuSeparator?: boolean;
  permissions?: ErpMenuPermissionFlags;
  children?: MenuMasterItem[];
};
type MenuMasterResponse = {
  data?: unknown;
};
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function sanitizeMenuLabel(label: string): string {
  const sanitized = label
    .trim()
    .replace(/^&+/, "")
    .replace(/^\d+\s+/, "")
    .replace(/\s+/g, " ");
  return sanitized || label;
}
function toBooleanFlag(value: unknown): boolean | undefined {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    if (value === 1) {
      return true;
    }
    if (value === 0) {
      return false;
    }
    return undefined;
  }
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true" || normalized === "1") {
      return true;
    }
    if (normalized === "false" || normalized === "0") {
      return false;
    }
  }
  return undefined;
}
function normalizeMenuLabel(label: string): string {
  return label
    .trim()
    .replace(/^&+/, "")
    .toLowerCase()
    .replace(/&/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .replace(/^\d+\s+/, "")
    .trim();
}
/**
 * Reads the `permissions` block of one `/menu-masters/usermenu` node. A flag the
 * payload omits counts as NOT granted: a menu row that reached the client is
 * readable, but nothing beyond reading is assumed from a missing field.
 */
function toMenuPermissionFlags(value: unknown): ErpMenuPermissionFlags | null {
  if (!isRecord(value)) {
    return null;
  }
  const read = (...keys: string[]): boolean => {
    for (const key of keys) {
      const flag = toBooleanFlag(value[key]);
      if (flag !== undefined) {
        return flag;
      }
    }
    return false;
  };
  return {
    canCreate: read("canCreate", "can_create"),
    canEdit: read("canEdit", "can_edit"),
    canDelete: read("canDelete", "can_delete"),
    canPrint: read("canPrint", "can_print"),
    canExport: read("canExport", "can_export"),
    canPost: read("canPost", "can_post"),
    canCancel: read("canCancel", "can_cancel"),
    canAmend: read("canAmend", "can_amend"),
    canOverride: read("canOverride", "can_override"),
    // Visibility is the one flag that defaults to granted — the server only
    // returns menus the user may open, so an absent field is not a denial.
    isVisible: toBooleanFlag(value.isVisible) ?? toBooleanFlag(value.is_visible) ?? true,
  };
}

function toMenuMasterItem(value: unknown): MenuMasterItem | null {
  if (!isRecord(value)) {
    return null;
  }
  const rawName = value.menuName;
  if (typeof rawName !== "string" || rawName.trim().length === 0) {
    return null;
  }
  const rawChildren = Array.isArray(value.children) ? value.children : [];
  const children = rawChildren
    .map((child) => toMenuMasterItem(child))
    .filter((child): child is MenuMasterItem => child !== null);
  const item: MenuMasterItem = {
    menuName: rawName,
  };
  if (typeof value.menuId === "number" && Number.isFinite(value.menuId)) {
    item.menuId = value.menuId;
  }
  const separator =
    toBooleanFlag(value.menuSeparator) ??
    toBooleanFlag(value.menu_separator) ??
    toBooleanFlag(value.menuSeperator) ??
    toBooleanFlag(value.menu_seperator);
  if (separator === true) {
    item.menuSeparator = true;
  }
  const permissions = toMenuPermissionFlags(value.permissions);
  if (permissions) {
    item.permissions = permissions;
  }
  if (children.length > 0) {
    item.children = children;
  }
  return item;
}
export function extractMenuMasterItems(payload: unknown): MenuMasterItem[] {
  if (!isRecord(payload)) {
    return [];
  }
  const data = (payload as MenuMasterResponse).data;
  if (!Array.isArray(data)) {
    return [];
  }
  return data
    .map((row) => toMenuMasterItem(row))
    .filter((row): row is MenuMasterItem => row !== null);
}
/**
 * The header menu, straight from `/menu-masters/usermenu`: the DB's labels,
 * order and nesting, with each row's route and icon looked up by menu id.
 */
export function buildPrimaryMenu(apiItems: MenuMasterItem[]): ErpHeaderItem[] {
  return apiItems
    .map((apiItem) => {
      const label = sanitizeMenuLabel(apiItem.menuName);
      if (!normalizeMenuLabel(label)) {
        return null;
      }
      if (apiItem.permissions?.isVisible === false) {
        return null;
      }
      const route =
        typeof apiItem.menuId === "number" ? MENU_ROUTES[apiItem.menuId] : undefined;
      const children = buildPrimaryMenu(apiItem.children ?? []);
      const nextItem: ErpHeaderItem = { label };
      if (route?.href) {
        nextItem.href = route.href;
      }
      if (route?.iconKey) {
        nextItem.iconKey = route.iconKey;
      }
      if (apiItem.menuSeparator) {
        nextItem.menuSeparator = true;
      }
      if (typeof apiItem.menuId === "number") {
        nextItem.menuId = apiItem.menuId;
      }
      if (apiItem.permissions) {
        nextItem.permissions = apiItem.permissions;
      }
      if (children.length > 0) {
        nextItem.children = children;
      }
      return nextItem;
    })
    .filter((item): item is ErpHeaderItem => item !== null);
}
export const DEFAULT_BRANCH_OPTIONS: ERPDynamicSelectOption[] = [
  { value: "", label: "Select Branch" },
];
export const DEFAULT_COMPANY_OPTIONS: ERPDynamicSelectOption[] = [
  { value: "", label: "Select Company" },
];
export const DEFAULT_FISCAL_YEAR_OPTIONS: ERPDynamicSelectOption[] = [
  { value: "", label: "Select Fiscal Year" },
];
export const DEFAULT_DATE_FORMAT_OPTIONS: Intl.DateTimeFormatOptions = {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
};
export const ARIA_LABELS = {
  MAIN_MENU: "Main ERP modules",
  RECENT_PAGES_SELECT: "Recent pages",
  COMPANY_SELECT: "Company selection",
  BRANCH_SELECT: "Branch selection",
  CART_BUTTON: (count: number) => `Cart items: ${count}`,
  BILL_INPUT: "Bill number",
} as const;
