import type { KeyboardShortcutDefinition } from "@/components/design-system/ui/keyboard-shortcut-hints";
import type { ERPDynamicSelectOption } from "@/components/design-system/ui";
import type { PhysicalStockColumn, PhysicalStockListMeta, PhysicalStockListFilters } from "./physical-stock.types";

export const PHYSICAL_STOCK_SAVE_ENDPOINT = "/physical-stock";
export const PHYSICAL_STOCK_LIST_ENDPOINT = "/physical-stock/list";
export const PHYSICAL_STOCK_GET_ENDPOINT = "/physical-stock/get";
export const PHYSICAL_STOCK_DELETE_ENDPOINT = "/physical-stock/delete";
export const ITEM_STOCK_BALANCE_GET_ENDPOINT = "/item-stock-balance/get";
export const ITEM_STOCK_BALANCE_BULK_LIST_ENDPOINT = "/item-stock-balance/bulk-list";
export const ITEM_BATCH_STOCK_OPTIONS_ENDPOINT = "/item-stock-balance/batch-options";
export const STOCK_ADJ_REASONS_ENDPOINT = "/stock-adj-reasons/get";
export const ITEM_STOCK_BALANCE_BUCKET = "SALEABLE";
export { UI_TABLE_COLUMNS_LIST_ENDPOINT, UI_TABLE_COLUMNS_CREATE_ENDPOINT } from "@/features/stocks/_shared/constants";
export const UI_TABLE_COLUMNS_QUERY = {
  uiTableId: "6",
  page: "1",
  limit: "100",
  uiTblClmIsActive: "true",
} as const;
export { LOOKUP_SEARCH_DEBOUNCE_MS } from "@/features/stocks/_shared/constants";
export const PHYSICAL_STOCK_TABLE_SHORTCUTS: readonly KeyboardShortcutDefinition[] = [
  { label: "Prev Cell", keys: ["Shift"] },
  { label: "Next Cell", keys: ["Enter"] },
  { label: "Close Lookup", keys: ["Escape"] },
  { label: "Open List", keys: ["F5"] },
];
export const TRACKING_OPTIONS = ["0", "1", "2", "3"] as const;
export const TRACKING_TYPE_OPTION_LABELS: Record<(typeof TRACKING_OPTIONS)[number], string> = {
  "0": "NONE",
  "1": "MRP",
  "2": "BATCH",
  "3": "SERIAL",
};
export const PHYSICAL_STOCK_COLUMNS: PhysicalStockColumn[] = [
  { key: "barcode", header: "Barcode", width: "110px", align: "left", kind: "text" },
  { key: "code", header: "Code", width: "100px", align: "left", kind: "text" },
  {
    key: "itemname",
    header: "Item name",
    width: "220px",
    align: "left",
    kind: "lookup",
    lookupKind: "item",
  },
  {
    key: "godown",
    header: "Godown",
    width: "160px",
    align: "left",
    kind: "lookup",
    lookupKind: "godown",
  },
  { key: "uom", header: "Uom", width: "105px", align: "left", kind: "text" },
  { key: "batchno", header: "Batch no", width: "120px", align: "left", kind: "text" },
  { key: "serialno", header: "Serial no", width: "120px", align: "left", kind: "text" },
  { key: "batchdate", header: "Batch date", width: "120px", align: "left", kind: "date" },
  { key: "mfgdate", header: "Mfg date", width: "120px", align: "left", kind: "date" },
  { key: "expirydate", header: "Expiry date", width: "120px", align: "left", kind: "date" },
  {
    key: "bookqty",
    header: "Book qty",
    width: "110px",
    align: "right",
    kind: "number",
    readOnly: true,
  },
  {
    key: "bookfreeqty",
    header: "Book Free qty",
    width: "120px",
    align: "right",
    kind: "number",
    readOnly: true,
  },
  {
    key: "bookbaseqty",
    header: "Book Base qty",
    width: "130px",
    align: "right",
    kind: "number",
    readOnly: true,
  },
  {
    key: "bookfreebaseqty",
    header: "Book free base qty",
    width: "150px",
    align: "right",
    kind: "number",
    readOnly: true,
  },
  {
    key: "physicalqty",
    header: "Physical qty",
    width: "120px",
    align: "right",
    kind: "number",
  },
  {
    key: "physicalfreeqty",
    header: "Physical Free qty",
    width: "140px",
    align: "right",
    kind: "number",
  },
  {
    key: "physicalbaseqty",
    header: "Physical Base qty",
    width: "150px",
    align: "right",
    kind: "number",
    readOnly: true,
  },
  {
    key: "physicalfreebaseqty",
    header: "Physical free base qty",
    width: "170px",
    align: "right",
    kind: "number",
    readOnly: true,
  },
  {
    key: "diffqty",
    header: "Diff Qty",
    width: "110px",
    align: "right",
    kind: "number",
    readOnly: true,
  },
  {
    key: "convfactor",
    header: "Conv factor",
    width: "120px",
    align: "right",
    kind: "number",
    defaultValue: "1.000",
    readOnly: true,
  },
  {
    key: "costprice",
    header: "Cost price",
    width: "115px",
    align: "right",
    kind: "number",
  },
  { key: "costwot", header: "Cost wot", width: "110px", align: "right", kind: "number" },
  { key: "mrp", header: "M.R.P", width: "100px", align: "right", kind: "number" },
  { key: "reason", header: "Reason", width: "180px", align: "left", kind: "lookup", lookupKind: "reason" },
  { key: "remarks", header: "Remarks", width: "220px", align: "left", kind: "text" },
  {
    key: "oslitemid",
    header: "osl item id",
    width: "130px",
    align: "left",
    kind: "text",
    readOnly: true,
  },
  {
    key: "oslunitid",
    header: "osl unit id",
    width: "130px",
    align: "left",
    kind: "text",
    readOnly: true,
  },
  {
    key: "oslbaseuomid",
    header: "osl base uom id",
    width: "145px",
    align: "left",
    kind: "text",
    readOnly: true,
  },
  {
    key: "oslgodownid",
    header: "osl godown id",
    width: "145px",
    align: "left",
    kind: "text",
    readOnly: true,
  },
  {
    key: "osltrackingtype",
    header: "osl tracking type",
    width: "140px",
    align: "left",
    kind: "select",
    options: TRACKING_OPTIONS,
    defaultValue: "0",
  },
  {
    key: "total",
    header: "Total",
    width: "120px",
    align: "right",
    kind: "number",
    readOnly: true,
  },
];
export const PHYSICAL_STOCK_COLUMN_SCHEMA = new Map(
  PHYSICAL_STOCK_COLUMNS.map((column) => [column.key, column]),
);
export const HIDDEN_ROW_VALUE_DEFAULTS: Record<string, string> = {
  baseunitid: "",
  batchid: "",
  mfgbatchno: "",
};
export const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const DATE_FIELD_KEYS = ["batchdate", "mfgdate", "expirydate"] as const;
export const QUANTITY_FIELD_KEYS = new Set([
  "bookqty",
  "bookfreeqty",
  "physicalqty",
  "physicalfreeqty",
]);
export const DERIVED_FIELD_KEYS = new Set([
  "bookbaseqty",
  "bookfreebaseqty",
  "physicalbaseqty",
  "physicalfreebaseqty",
  "diffqty",
  "total",
]);
export const NON_NEGATIVE_NUMBER_FIELD_KEYS = PHYSICAL_STOCK_COLUMNS.filter(
  (column) => column.kind === "number" && column.key !== "diffqty",
).map((column) => column.key);
export const DEFAULT_BATCH_OPTION: ERPDynamicSelectOption = { value: "", label: "None" };
export const DEFAULT_PHYSICAL_STOCK_LIST_FILTERS: PhysicalStockListFilters = {
  search: "",
  dateFrom: "",
  dateTo: "",
};
export const EMPTY_PHYSICAL_STOCK_LIST_META: PhysicalStockListMeta = {
  page: 1,
  limit: 20,
  total: 0,
  total_pages: 0,
};
