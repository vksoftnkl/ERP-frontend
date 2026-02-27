import type { ErpHeaderItem, ERPMenuObject } from "./types";
export const DEFAULT_PRIMARY_MENU: ErpHeaderItem[] = [
  {
    label: "1 Sales",
    children: [
      {label: "Customers", href: "/master/customer"},
      { label: "Sales Entry", href: "/dashboard" },
      { label: "Sales Return" },
      {
        label: "Master",
        children: [
          { label: "State Master", href: "/master/state-master" },
          { label: "City Master", href: "/master/city-master" },
          { label: "Area Master", href: "/master/area-master" },
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
      { label: "Cashier Screen" },
    ],
  },
  {
    label: "2 Purchase",
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
  { label: "4 Stock" },
  {
    label: "5 Accounts",
    children: [
      {
        label: "Account Ledger Groups Master",
        href: "/master/account-ledger-groups-master",
      },
      { label: "Account Ledger Master", href: "/master/account-ledger-master" },
      {
        label:"Employee Designation Master",href:"/master/employee-designation-master"
      },      
      {
        label:"GSP Company Service",href:"/master/gsp-company-service"
      },
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
  { label: "7 Settings",
    children:[
      {label:"Company Master",href:"/master/companies"},
      {label:"Branch Master",href:"/master/branches-master"},
      {label:"Employee Master",href:"/master/employee-master"},
      {label:"Permissions",href:"/master/permissions"},
    ]
  },
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
  Accounts: {
    "Account Ledger Groups Master": null,
    "Account Ledger Master": null,
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
