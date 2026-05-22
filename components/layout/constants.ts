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
import type { ErpHeaderIconKey, ErpHeaderItem, ERPMenuObject } from "./types";
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
export const DEFAULT_PRIMARY_MENU: ErpHeaderItem[] = [
  {
    label: "Sales",
    iconKey: "sales",
    children: [
      {label: "Customers", href: "/master/customer"},      
      { label: "Promotion Loyalty Points", href: "/sales/promotion-loyalty-points" },
      { label: "Sales Entry", href: "/dashboard" },
      { label: "Sales Return" },
      {
        label: "Master",
        children: [
          { label: "State Master", href: "/master/state-master" },
          { label: "City Master", href: "/master/city-master" },
          { label: "Area Master", href: "/master/area-master" },
          {label: "Customer Type master", href: "/master/customer-groups"},
        ],
      },
      {
        label: "SO Management",
        children: [
          { label: "Sales Orders" },
          { label: "Order Approvals" },
          { label: "Dispatch Planning" },
        
        ],
      },
      {
        label:"Loyalty schemes",
        children:[{label:"Loyalty Programs",href:"/sales/promotion-loyalty-points"}]
      },
      { label: "Cashier Screen" },
    ],
  },
  {
    label: "Purchase",
    iconKey: "purchase",
    children: [
      {
        label: "Suppliers",
        href: "/master/suppliers",
      },
      { label: "Purchase Entry" },
      { label: "Purchase Return" },
      { label: "Vendor Ledger" },
      {
        label: "Master",
        children: [
          { label: "supplier groups", href: "/master/supplier-groups" }        
        ],
      }
    ],
  },
 {
  label: "Inventory",
  iconKey: "inventory",
  children: [
    { label: "Item Master", href: "/master/item-master" },
    { label: "Change Selling" },
    { label: "Change Selling (Purchase)" },
    { label: "Item Group wise Discount" },
    { label: "Sticker Printing" },
    { label: "Product Kits" },
    { label: "Reorder" },
    { label: "Cost Price - Bulk Change" },
    {
      label: "Master",
      children: [
        { label: "Item Group Master", href: "/master/item-group-master" },
        { label: "Item Category Master", href: "/master/item-category-master" },
        { label: "Item Brand Master", href: "/master/item-brand-master" },
        { label: "Item Section Master", href: "/master/item-section-master" },
        { label: "Unit Master", href: "/master/unit-master" },
        { label: "Godown Master", href: "/master/godown-master" },
        { label: "Tax Master", href: "/master/tax-master" },

      ],
    },
    { label: "Allow to Change Master Price" },
  ],
  },
  {
    label: "Stock",
    iconKey: "stock",
    children: [
      { label: "Opening Stock", href: "/stock/opening-stock" },
      { label: "Physical Stock Update", href: "/stock/physical-stock" },
    ],
  },
  {
    label: "Accounts",
    iconKey: "accounts",
    children: [
      {
        label: " Ledger Group Master",
        href: "/master/account-ledger-groups-master",
      },
      { label: "Ledger Master", href: "/master/account-ledger-master" },
           {
        label:"GSP Service Master",href:"/master/gsp-service-master"
      },{
        label:"GSP Provider Master",href:"/master/gsp-provider-master"
      },{
        label:"Ledger Bank Account",href:"/master/ledger-bank-account-master"
      },
      {
        label:"Ledger Shipping Address",href:"/master/ledger-shipping-address-master"
      },
      {
        label:"Tender Master",href:"/master/tender-master"
      }
    ],
  },
  {
    label: "Reports",
    iconKey: "reports",
    children: [
      { label: "Day Book" },
      { label: "Sales Register" },
      {
        label: "Profit Reports",
        children: [
          { label: "Daily Profit & Loss" },
          { label: "Monthly Profit & Loss" },
          { label: "Yearly Summary" },
        ],
      },
    ],
  },
  { label: "Settings",
    iconKey: "settings",
    children:[
      {label:"Company Master",href:"/master/companies"},
      {label:"Branch Master",href:"/master/branches-master"},
      {label:"Employee Master",href:"/master/employee-master"},        
      {
        label:"GSP Company Service",href:"/master/gsp-company-service"
      },
      {
        label:"Grid Designer",href:"/master/grid-designer"
      },
      {
        label:"Widget Master",href:"/master/widget-master"
      },
      {
        label:"Dropdown Designer",href:"/master/dropdown-designer"
      },
      {
        label:"UI Table Designer",href:"/master/ui-table-designer"
      },
      {
        label:"Audit Logs",href:"/master/audit-logs"
      },
      {
        label:"master",
        children:[
           {
        label:"Department Master",href:"/master/employee-department-master"
      },
      {
        label:"Designation Master",href:"/master/employee-designation-master"
      }, 
          {label:"Device list master",href:"/master/device-list-master"}   
        ]
      },
      {label:"User Administration",href:"/master/user-administration"},
      {label:"Module Administration",href:"/master/module-administration"},
      {label:"Permissions",href:"/master/permissions"},
  
    ]
  },
  { label: "Transport", iconKey: "transport" },
];
export const DEFAULT_QUICK_TABS: ErpHeaderItem[] = [
  { label: "Sales Entry" },
  { label: "Sales Return" },
  {
    label: "SO Management",
    children: [
      { label: "SO Create" },
      { label: "SO Amend" },
      { label: "SO Dispatch" },
    ],
  },
  { label: "Cashier Screen" },
  {
    label: "Import Invoices",
    children: [
      { label: "Upload Excel" },
      { label: "Upload JSON" },
      { label: "Import History" },
    ],
  },
  { label: "Gate Inward Entry" },
  { label: "SO Stock Position" },
  {
    label: "Profit & Loss",
    children: [
      { label: "Daily Report" },
      { label: "Monthly Report" },
      { label: "Consolidated Report" },
    ],
  },
];
export const ERP_MENU_OBJECT: ERPMenuObject = {
  Sales: {
    Customers: null,
    "Promotion Loyalty Points": null,
    "Sales Entry": null,
    "Sales Return": null,
  },
  Accounts: {
    "Account Ledger Groups Master": null,
    "Account Ledger Master": null,
  },
  Stock: {
    "Opening Stock": null,
    "Physical Stock Update": null,
  },
  Inventory: {
    "Item Master": "Ctrl+I",
    "Change Selling": null,
    "Change Selling (Purchase)": null,
    "Item Group wise Discount": null,
    "Sticker Printing": null,
    "Product Kits": null,
    Reorder: null,
    "Cost Price - Bulk Change": null,
    Master: {
      "Item Group Master": null,
      "Item Category Master": null,
      "Item Brand Master": null,
      "Item Section Master": null,
      "Unit Master": null,
      "Godown Master": null,
      "Tax Master": null,
    },
    "Allow to Change Master Price": null,
  },
};
export const MENU_MASTERS_GET_ENDPOINT = "/menu-masters/get";
export type MenuMasterItem = {
  menuId?: number;
  menuName: string;
  menuSeparator?: boolean;
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
function buildMenuLookup(items: MenuMasterItem[]): Map<string, MenuMasterItem[]> {
  const lookup = new Map<string, MenuMasterItem[]>();
  for (const item of items) {
    const key = normalizeMenuLabel(item.menuName);
    if (!key) {
      continue;
    }
    const bucket = lookup.get(key);
    if (bucket) {
      bucket.push(item);
      continue;
    }
    lookup.set(key, [item]);
  }
  return lookup;
}
type MenuPresentation = {
  href?: string;
  iconKey?: ErpHeaderIconKey;
};
type MenuPresentationLookup = {
  byPath: Map<string, MenuPresentation>;
  byLabel: Map<string, MenuPresentation>;
};
function buildMenuPresentationLookup(baseItems: ErpHeaderItem[]): MenuPresentationLookup {
  const byPath = new Map<string, MenuPresentation>();
  const byLabel = new Map<string, MenuPresentation>();
  const visit = (items: ErpHeaderItem[], path: string[]) => {
    for (const item of items) {
      const normalized = normalizeMenuLabel(item.label);
      if (!normalized) {
        continue;
      }
      const nextPath = [...path, normalized];
      const pathKey = nextPath.join(" > ");
      if (item.href || item.iconKey) {
        const presentation: MenuPresentation = {};
        if (item.href) {
          presentation.href = item.href;
        }
        if (item.iconKey) {
          presentation.iconKey = item.iconKey;
        }
        byPath.set(pathKey, presentation);
        if (!byLabel.has(normalized)) {
          byLabel.set(normalized, presentation);
        }
      }
      if (item.children?.length) {
        visit(item.children, nextPath);
      }
    }
  };
  visit(baseItems, []);
  return { byPath, byLabel };
}
function toHeaderItemsFromApi(
  apiItems: MenuMasterItem[],
  presentationLookup: MenuPresentationLookup,
  path: string[] = [],
): ErpHeaderItem[] {
  return apiItems
    .map((apiItem) => {
      const label = sanitizeMenuLabel(apiItem.menuName);
      const normalized = normalizeMenuLabel(label);
      if (!normalized) {
        return null;
      }
      const nextPath = [...path, normalized];
      const pathKey = nextPath.join(" > ");
      const presentation =
        presentationLookup.byPath.get(pathKey) ??
        presentationLookup.byLabel.get(normalized);
      const children = toHeaderItemsFromApi(
        apiItem.children ?? [],
        presentationLookup,
        nextPath,
      );
      const nextItem: ErpHeaderItem = { label };
      if (presentation?.href) {
        nextItem.href = presentation.href;
      }
      if (presentation?.iconKey) {
        nextItem.iconKey = presentation.iconKey;
      }
      if (apiItem.menuSeparator) {
        nextItem.menuSeparator = true;
      }
      if (children.length > 0) {
        nextItem.children = children;
      }
      return nextItem;
    })
    .filter((item): item is ErpHeaderItem => item !== null);
}
export function applyMenuMasterLabels(
  baseMenu: ErpHeaderItem[],
  menuMasterItems: MenuMasterItem[],
): ErpHeaderItem[] {
  if (menuMasterItems.length === 0) {
    return [];
  }
  const labelLookup = buildMenuLookup(menuMasterItems);
  if (labelLookup.size === 0) {
    return [];
  }
  const presentationLookup = buildMenuPresentationLookup(baseMenu);
  return toHeaderItemsFromApi(menuMasterItems, presentationLookup);
}
export const DEFAULT_BRANCH_OPTIONS: ERPDynamicSelectOption[] = [
  { value: "", label: "Select Branch" },
];
export const DEFAULT_COMPANY_OPTIONS: ERPDynamicSelectOption[] = [
  { value: "", label: "Select Company" },
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
