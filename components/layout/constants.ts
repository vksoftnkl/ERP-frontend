import type { ErpHeaderItem, ERPMenuObject } from "./types";

export const DEFAULT_PRIMARY_MENU: ErpHeaderItem[] = [
  {
    label: "1 Sales",
    children: [
      { label: "Sales Entry", href: "/dashboard" },
      { label: "Sales Return" },
      {
        label: "SO Management",
        children: [
          { label: "Sales Orders" },
          { label: "Order Approvals" },
          { label: "Dispatch Planning" },
        ],
      },
      { label: "Cashier Screen" },
    ],
  },
  {
    label: "2 Purchase",
    children: [
      { label: "Purchase Entry" },
      { label: "Purchase Return" },
      { label: "Vendor Ledger" },
    ],
  },
 {
  label: "3 Inventory",
  children: [
    { label: "Item Master", href: "/item-master" },

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

  { label: "4 Stock" },
  { label: "5 Accounts" },
  {
    label: "6 Reports",
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
  { label: "7 Settings" },
  { label: "8 Transport" },
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
      "Item Brand Master": null,
      "Item Section Master": null,
      "Unit Master": null,
      "Godown Master": null,
      "Tax Master": null,
    },
    "Allow to Change Master Price": null,
  },
};

export const DEFAULT_CUSTOMER_OPTIONS = ["Customers"];

export const DEFAULT_DATE_FORMAT_OPTIONS: Intl.DateTimeFormatOptions = {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
};

export const ARIA_LABELS = {
  MAIN_MENU: "Main ERP modules",
  CUSTOMER_SELECT: "Customer selection",
  CART_BUTTON: (count: number) => `Cart items: ${count}`,
  BILL_INPUT: "Bill number",
} as const;
