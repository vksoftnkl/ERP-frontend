import type { ERPDynamicSelectOption } from "@/components/library/ui";
import type { ColumnSchema, LookupKind } from "./Types";

// ─── API endpoints ───────────────────────────────────────────────────────────

export const UI_TABLE_COLUMNS_LIST_ENDPOINT = "/ui-table-columns/list";
export const ACCOUNT_LEDGER_LIST_ENDPOINT = "/account-ledger-masters/list";
export const OPENING_STOCK_SAVE_ENDPOINT = "/opening-stocks";
export const OPENING_STOCK_LIST_ENDPOINT = "/opening-stocks/list";
export const OPENING_STOCK_GET_ENDPOINT = "/opening-stocks/get";

// ─── Query / config ───────────────────────────────────────────────────────────

export const UI_TABLE_COLUMNS_QUERY = {
  uiTblClmTableId: "5",
  page: "1",
  limit: "100",
} as const;

export const UI_TABLE_COLUMNS_TOAST_OPTIONS = {
  success: false,
  error: false,
} as const;

// ─── Domain constants ─────────────────────────────────────────────────────────

export const OPENING_STOCK_LEDGER_NAME = "opening stock";
export const LOOKUP_SEARCH_DEBOUNCE_MS = 250;
export const SERIAL_NUMBER_COLUMN_WIDTH = "112px";

// ─── DOM selectors ────────────────────────────────────────────────────────────

export const TABLE_FIELD_CONTAINER_SELECTOR =
  '[data-opening-stock-field-container="true"]';
export const TABLE_FIELD_CONTROL_SELECTOR =
  '[data-opening-stock-field-control="true"]';

// ─── Select options ───────────────────────────────────────────────────────────

export const TRACKING_OPTIONS = ["NONE","MRP", "BATCH"] as const;
export const PROFIT_TYPE_OPTIONS = ["PERCENT", "VALUE"] as const;
export const CESS_TYPE_OPTIONS = ["NONE", "PERCENT", "PER_UNIT"] as const;

// ─── Default lookup options ───────────────────────────────────────────────────

export const DEFAULT_ITEM_OPTION: ERPDynamicSelectOption = {
  value: "",
  label: "",
};

export const DEFAULT_GODOWN_OPTION: ERPDynamicSelectOption = {
  value: "",
  label: "",
};

// ─── Lookup field config ──────────────────────────────────────────────────────

export const LOOKUP_FIELD_CONFIG: Record<
  LookupKind,
  { labelField: string; idField: string; emptyMessage: string }
> = {
  item: {
    labelField: "itemname",
    idField: "oslitemid",
    emptyMessage: "No items found.",
  },
  godown: {
    labelField: "godown",
    idField: "oslgodownid",
    emptyMessage: "No godowns found.",
  },
};

// ─── Column schema ────────────────────────────────────────────────────────────

export const COLUMN_SCHEMA: Record<string, ColumnSchema> = {
  barcode: { header: "Barcode", defaultWidth: "100px", align: "left", kind: "text", placeholder: "Barcode" },
  code: { header: "Code", defaultWidth: "100px", align: "left", kind: "text", placeholder: "Item code" },
  itemname: { header: "Item Name", defaultWidth: "220px", align: "left", kind: "lookup", lookupKind: "item", placeholder: "Search item" },
  godown: { header: "Godown", defaultWidth: "150px", align: "left", kind: "lookup", lookupKind: "godown", placeholder: "Search godown" },
  uom: { header: "Uom", defaultWidth: "100px", align: "left", kind: "text", placeholder: "Uom" },
  taxname: { header: "Tax Name", defaultWidth: "120px", align: "left", kind: "text", placeholder: "Tax name" },
  openingqty: { header: "Opening Qty", defaultWidth: "110px", align: "right", kind: "number", placeholder: "0.000", defaultValue: "0.000" },
  freeqty: { header: "Free Qty", defaultWidth: "100px", align: "right", kind: "number", placeholder: "0.000", defaultValue: "0.000" },
  baseqty: { header: "Base Qty", defaultWidth: "100px", align: "right", kind: "number", placeholder: "0.000", defaultValue: "0.000" },
  convfactor: { header: "Conv Factor", defaultWidth: "110px", align: "right", kind: "number", placeholder: "1.000", defaultValue: "1.000" },
  batchno: { header: "Batch No", defaultWidth: "120px", align: "left", kind: "text", placeholder: "Batch no" },
  serialno: { header: "Serial No", defaultWidth: "120px", align: "left", kind: "text", placeholder: "Serial no" },
  batchdate: { header: "Batch Date", defaultWidth: "120px", align: "left", kind: "date" },
  mfgdate: { header: "Mfg Date", defaultWidth: "120px", align: "left", kind: "date" },
  expirydate: { header: "Expiry Date", defaultWidth: "120px", align: "left", kind: "date" },
  costprice: { header: "Cost Price", defaultWidth: "110px", align: "right", kind: "number", placeholder: "0.00", defaultValue: "0.00" },
  costwot: { header: "Cost Wot", defaultWidth: "110px", align: "right", kind: "number", placeholder: "0.00", defaultValue: "0.00" },
  profittype: { header: "Profit Type", defaultWidth: "110px", align: "left", kind: "select", options: PROFIT_TYPE_OPTIONS, defaultValue: PROFIT_TYPE_OPTIONS[0] },
  roundoff: { header: "Round Off", defaultWidth: "100px", align: "right", kind: "number", placeholder: "0.00", defaultValue: "0.00" },
  priceawot: { header: "Price A Wot", defaultWidth: "110px", align: "right", kind: "number", placeholder: "0.00", defaultValue: "0.00" },
  priceamarkup: { header: "Price A Markup", defaultWidth: "120px", align: "right", kind: "number", placeholder: "0.00", defaultValue: "0.00" },
  pricea: { header: "Price A", defaultWidth: "110px", align: "right", kind: "number", placeholder: "0.00", defaultValue: "0.00" },
  pricebwot: { header: "Price B Wot", defaultWidth: "110px", align: "right", kind: "number", placeholder: "0.00", defaultValue: "0.00" },
  pricebmarkup: { header: "Price B Markup", defaultWidth: "120px", align: "right", kind: "number", placeholder: "0.00", defaultValue: "0.00" },
  priceb: { header: "Price B", defaultWidth: "110px", align: "right", kind: "number", placeholder: "0.00", defaultValue: "0.00" },
  pricecwot: { header: "Price C Wot", defaultWidth: "110px", align: "right", kind: "number", placeholder: "0.00", defaultValue: "0.00" },
  pricecmarkup: { header: "Price C Markup", defaultWidth: "120px", align: "right", kind: "number", placeholder: "0.00", defaultValue: "0.00" },
  pricec: { header: "Price C", defaultWidth: "110px", align: "right", kind: "number", placeholder: "0.00", defaultValue: "0.00" },
  pricedwot: { header: "Price D Wot", defaultWidth: "110px", align: "right", kind: "number", placeholder: "0.00", defaultValue: "0.00" },
  pricedmarkup: { header: "Price D Markup", defaultWidth: "120px", align: "right", kind: "number", placeholder: "0.00", defaultValue: "0.00" },
  priced: { header: "Price D", defaultWidth: "110px", align: "right", kind: "number", placeholder: "0.00", defaultValue: "0.00" },
  mrp: { header: "M.R.P", defaultWidth: "100px", align: "right", kind: "number", placeholder: "0.00", defaultValue: "0.00" },
  msp: { header: "M.S.P", defaultWidth: "100px", align: "right", kind: "number", placeholder: "0.00", defaultValue: "0.00" },
  remarks: { header: "Remarks", defaultWidth: "220px", align: "left", kind: "text", placeholder: "Remarks" },
  oslitemid: { header: "osl item id", defaultWidth: "120px", align: "left", kind: "text", placeholder: "Item id" },
  oslunitid: { header: "osl unit id", defaultWidth: "120px", align: "left", kind: "text", placeholder: "Unit id" },
  oslbaseuomid: { header: "osl base uom id", defaultWidth: "130px", align: "left", kind: "text", placeholder: "Base uom id" },
  oslgodownid: { header: "osl godown id", defaultWidth: "130px", align: "left", kind: "text", placeholder: "Godown id" },
  osltrackingtype: { header: "osl tracking type", defaultWidth: "130px", align: "left", kind: "select", options: TRACKING_OPTIONS, defaultValue: TRACKING_OPTIONS[0] },
  osltaxid: { header: "osl tax id", defaultWidth: "110px", align: "left", kind: "text", placeholder: "Tax id" },
  osltaxperc: { header: "osl tax perc", defaultWidth: "110px", align: "right", kind: "number", placeholder: "0.000", defaultValue: "0.000" },
  oslcesstype: { header: "osl cess type", defaultWidth: "120px", align: "left", kind: "select", options: CESS_TYPE_OPTIONS, defaultValue: CESS_TYPE_OPTIONS[0] },
  oslcessperc: { header: "osl cess perc", defaultWidth: "110px", align: "right", kind: "number", placeholder: "0.000", defaultValue: "0.000" },
  oslcessperunit: { header: "osl cess per unit", defaultWidth: "120px", align: "right", kind: "number", placeholder: "0.00", defaultValue: "0.00" },
};

export const FALLBACK_COLUMN_KEYS = [
  "barcode", "code", "itemname", "godown", "uom", "taxname",
  "openingqty", "freeqty", "baseqty", "convfactor",
  "batchno", "serialno", "costprice", "pricea", "mrp", "remarks",
] as const;

export const HIDDEN_INTERNAL_COLUMN_KEYS = new Set([
  "oslitemid", "oslunitid", "oslbaseuomid", "oslgodownid", "osltaxid",
]);

export const ITEM_AUTOFILL_FIELD_KEYS = [
  "barcode", "code", "godown", "uom", "taxname", "baseqty", "convfactor",
  "costprice", "costwot", "profittype", "roundoff",
  "priceawot", "priceamarkup", "pricea",
  "pricebwot", "pricebmarkup", "priceb",
  "pricecwot", "pricecmarkup", "pricec",
  "pricedwot", "pricedmarkup", "priced",
  "mrp", "msp", "remarks",
  "oslunitid", "oslbaseuomid", "oslgodownid", "osltrackingtype",
  "osltaxid", "osltaxperc", "oslcesstype", "oslcessperc", "oslcessperunit",
] as const;

// ─── Formatters ───────────────────────────────────────────────────────────────

export const QUANTITY_FORMATTER = new Intl.NumberFormat("en-IN", {
  minimumFractionDigits: 3,
  maximumFractionDigits: 3,
});

export const VALUE_FORMATTER = new Intl.NumberFormat("en-IN", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});