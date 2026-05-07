import type { ERPDynamicSelectOption } from "@/components/library/ui";
import type { ColumnSchema, LookupKind } from "./Types";
export const UI_TABLE_COLUMNS_LIST_ENDPOINT = "/ui-table-columns/list";
export const UI_TABLE_COLUMNS_CREATE_ENDPOINT = "/ui-table-columns/create";
export const ACCOUNT_LEDGER_LIST_ENDPOINT = "/account-ledger-masters/list";
export const GODOWN_LIST_ENDPOINT = "/master-lookups/name-id/all-accounts-and-masters";
export const UNIT_LIST_ENDPOINT = "/units/list";
export const OPENING_STOCK_SAVE_ENDPOINT = "/opening-stocks";
export const OPENING_STOCK_LIST_ENDPOINT = "/opening-stocks/list";
export const OPENING_STOCK_GET_ENDPOINT = "/opening-stocks/get";
export const OPENING_STOCK_DELETE_ENDPOINT = "/opening-stocks/delete";
export const UI_TABLE_COLUMNS_QUERY = {
  uiTblClmTableId: "5",
  page: "1",
  limit: "100",
} as const;
export const UI_TABLE_COLUMNS_TOAST_OPTIONS = {
  success: false,
  error: false,
} as const;
export const OPENING_STOCK_LEDGER_NAME = "opening stock";
export const LOOKUP_SEARCH_DEBOUNCE_MS = 250;
export const DELETE_ACTION_COLUMN_WIDTH = "68px";
export const SERIAL_NUMBER_COLUMN_WIDTH = "112px";
export const MIN_RESIZABLE_COLUMN_WIDTH = 80;
export const TRACKING_OPTIONS = ["0", "1", "2"] as const;
export const TRACKING_TYPE_OPTION_LABELS: Record<
  (typeof TRACKING_OPTIONS)[number],
  string
> = {
  "0": "NONE",
  "1": "MRP",
  "2": "BATCH",
};
export const TRACKING_REQUIRED_FIELD_KEYS: Partial<
  Record<(typeof TRACKING_OPTIONS)[number], readonly string[]>
> = {
  "1": ["mrp"],
  "2": ["batchno", "serialno", "mfgdate", "batchdate", "expirydate"],
};
export const TRACKING_REQUIRED_FIELD_LABELS: Record<string, string> = {
  mrp: "M.R.P",
  batchno: "Batch No",
  serialno: "Serial No",
  mfgdate: "Mfg Date",
  batchdate: "Batch Date",
  expirydate: "Expiry Date",
};
export const TRACKING_VALIDATION_FIELD_KEYS = Array.from(
  new Set(Object.values(TRACKING_REQUIRED_FIELD_KEYS).flatMap((fieldKeys) => fieldKeys ?? [])),
);
export const PROFIT_TYPE_OPTIONS = ["BY_PERCENT", "BY_AMOUNT", "MANUAL"] as const;
export const PROFIT_TYPE_OPTION_LABELS: Record<
  (typeof PROFIT_TYPE_OPTIONS)[number],
  string
> = {
  BY_PERCENT: "BY %",
  BY_AMOUNT: "BY RS",
  MANUAL: "BY USER",
};
export const ROUND_OFF_OPTIONS = ["0.01", "0.5", "1", "5", "10", "50", "100"] as const;
export const CESS_TYPE_OPTIONS = ["NONE", "PERCENT", "PER_UNIT"] as const;
export const GODOWN_LOOKUP_QUERY = {
  module: "godownLocations",
  limit: "100",
} as const;
export const UNIT_LIST_QUERY = {
  page: "1",
  limit: "100",
  unit_is_active: "true",
} as const;
export const BATCH_TRACKING_FIELD_KEYS = new Set([
  "batchno",
  "serialno",
  "batchdate",
  "mfgdate",
  "expirydate",
]);
export const DEFAULT_ITEM_OPTION: ERPDynamicSelectOption = {
  value: "",
  label: "",
};
export const DEFAULT_GODOWN_OPTION: ERPDynamicSelectOption = {
  value: "",
  label: "",
};
export const LOOKUP_FIELD_CONFIG: Record<
  LookupKind,
  {
    labelField: string;
    idField: string;
    emptyMessage: string;
  }
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
export const COLUMN_SCHEMA: Record<string, ColumnSchema> = {
  barcode: {
    header: "Barcode",
    defaultWidth: "100px",
    align: "left",
    kind: "text",    
  },
  code: {
    header: "Code",
    defaultWidth: "100px",
    align: "left",
    kind: "text",
  },
  itemname: {
    header: "Item Name",
    defaultWidth: "220px",
    align: "left",
    kind: "lookup",
    lookupKind: "item",
  },
  godown: {
    header: "Godown",
    defaultWidth: "150px",
    align: "left",
    kind: "lookup",
    lookupKind: "godown",
  },
  uom: {
    header: "Uom",
    defaultWidth: "100px",
    align: "left",
    kind: "text",
  },
  taxname: {
    header: "Tax Name",
    defaultWidth: "120px",
    align: "left",
    kind: "text",
  },
  openingqty: {
    header: "Opening Qty",
    defaultWidth: "110px",
    align: "right",
    kind: "number",
    defaultValue: "0.000",
  },
  freeqty: {
    header: "Free Qty",
    defaultWidth: "100px",
    align: "right",
    kind: "number",
    defaultValue: "0.000",
  },
  baseqty: {
    header: "Base Qty",
    defaultWidth: "100px",
    align: "right",
    kind: "number",
    defaultValue: "0.000",
  },
  freebaseqty: {
    header: "Free Base Qty",
    defaultWidth: "110px",
    align: "right",
    kind: "number",
    defaultValue: "0.000",
  },
  convfactor: {
    header: "Conv Factor",
    defaultWidth: "110px",
    align: "right",
    kind: "number",
    defaultValue: "1.000",
  },
  batchno: {
    header: "Batch No",
    defaultWidth: "120px",
    align: "left",
    kind: "text",
  },
  serialno: {
    header: "Serial No",
    defaultWidth: "12px",
    align: "left",
    kind: "text",
  },
  batchdate: {
    header: "Batch Date",
    defaultWidth: "120px",
    align: "left",
    kind: "date",
  },
  mfgdate: {
    header: "Mfg Date",
    defaultWidth: "120px",
    align: "left",
    kind: "date",
  },
  expirydate: {
    header: "Expiry Date",
    defaultWidth: "120px",
    align: "left",
    kind: "date",
  },
  costprice: {
    header: "Cost Price",
    defaultWidth: "110px",
    align: "right",
    kind: "number",
    defaultValue: "0.00",
  },
  costwot: {
    header: "Cost Wot",
    defaultWidth: "110px",
    align: "right",
    kind: "number",
    defaultValue: "0.00",
  },
  profittype: {
    header: "Profit Type",
    defaultWidth: "110px",
    align: "left",
    kind: "select",
    options: PROFIT_TYPE_OPTIONS,
    defaultValue: PROFIT_TYPE_OPTIONS[0],
  },
  roundoff: {
    header: "Round Off",
    defaultWidth: "100px",
    align: "right",
    kind: "select",
    options: ROUND_OFF_OPTIONS,
    defaultValue: "",
  },
  priceawot: {
    header: "Price A Wot",
    defaultWidth: "110px",
    align: "right",
    kind: "number",
    defaultValue: "0.00",
  },
  priceamarkup: {
    header: "Price A Markup",
    defaultWidth: "120px",
    align: "right",
    kind: "number",
    defaultValue: "0.00",
  },
  pricea: {
    header: "Price A",
    defaultWidth: "110px",
    align: "right",
    kind: "number",
    defaultValue: "0.00",
  },
  pricebwot: {
    header: "Price B Wot",
    defaultWidth: "110px",
    align: "right",
    kind: "number",
    defaultValue: "0.00",
  },
  pricebmarkup: {
    header: "Price B Markup",
    defaultWidth: "120px",
    align: "right",
    kind: "number",
    defaultValue: "0.00",
  },
  priceb: {
    header: "Price B",
    defaultWidth: "110px",
    align: "right",
    kind: "number",
    defaultValue: "0.00",
  },
  pricecwot: {
    header: "Price C Wot",
    defaultWidth: "110px",
    align: "right",
    kind: "number",
    defaultValue: "0.00",
  },
  pricecmarkup: {
    header: "Price C Markup",
    defaultWidth: "120px",
    align: "right",
    kind: "number",
    defaultValue: "0.00",
  },
  pricec: {
    header: "Price C",
    defaultWidth: "110px",
    align: "right",
    kind: "number",
    defaultValue: "0.00",
  },
  pricedwot: {
    header: "Price D Wot",
    defaultWidth: "110px",
    align: "right",
    kind: "number",
    defaultValue: "0.00",
  },
  pricedmarkup: {
    header: "Price D Markup",
    defaultWidth: "120px",
    align: "right",
    kind: "number",
    defaultValue: "0.00",
  },
  priced: {
    header: "Price D",
    defaultWidth: "110px",
    align: "right",
    kind: "number",
    defaultValue: "0.00",
  },
  mrp: {
    header: "M.R.P",
    defaultWidth: "100px",
    align: "right",
    kind: "number",
    defaultValue: "0.00",
  },
  msp: {
    header: "M.S.P",
    defaultWidth: "100px",
    align: "right",
    kind: "number",
    defaultValue: "0.00",
  },
  remarks: {
    header: "Remarks",
    defaultWidth: "220px",
    align: "left",
    kind: "text",
  },
  oslitemid: {
    header: "osl item id",
    defaultWidth: "120px",
    align: "left",
    kind: "text",
  },
  oslunitid: {
    header: "osl unit id",
    defaultWidth: "120px",
    align: "left",
    kind: "text",
  },
  oslbaseuomid: {
    header: "osl base uom id",
    defaultWidth: "130px",
    align: "left",
    kind: "text",
  },
  oslgodownid: {
    header: "osl godown id",
    defaultWidth: "130px",
    align: "left",
    kind: "text",
  },
  osltrackingtype: {
    header: "osl tracking type",
    defaultWidth: "130px",
    align: "left",
    kind: "select",
    options: TRACKING_OPTIONS,
    defaultValue: TRACKING_OPTIONS[0],
  },
  osltaxid: {
    header: "osl tax id",
    defaultWidth: "110px",
    align: "left",
    kind: "text",
  },
  osltaxperc: {
    header: "osl tax perc",
    defaultWidth: "110px",
    align: "right",
    kind: "number",
    defaultValue: "0.000",
  },
  oslcesstype: {
    header: "osl cess type",
    defaultWidth: "120px",
    align: "left",
    kind: "select",
    options: CESS_TYPE_OPTIONS,
    defaultValue: CESS_TYPE_OPTIONS[0],
  },
  oslcessperc: {
    header: "osl cess perc",
    defaultWidth: "110px",
    align: "right",
    kind: "number",
    defaultValue: "0.000",
  },
  oslcessperunit: {
    header: "osl cess per unit",
    defaultWidth: "120px",
    align: "right",
    kind: "number",
    defaultValue: "0.00",
  },
};
export const OPENING_STOCK_DATE_FIELD_KEYS = ["batchdate", "mfgdate", "expirydate"] as const;
export const OPENING_STOCK_NON_NEGATIVE_NUMBER_FIELD_KEYS = Object.entries(COLUMN_SCHEMA)
  .filter(([, schema]) => schema.kind === "number")
  .map(([fieldKey]) => fieldKey);
export const FALLBACK_COLUMN_KEYS = [
  "barcode",
  "code",
  "itemname",
  "oslitemid",
  "godown",
  "oslgodownid",
  "uom",
  "oslunitid",
  "oslbaseuomid",
  "taxname",
  "osltaxid",
  "openingqty",
  "freeqty",
  "baseqty",
  "freebaseqty",
  "convfactor",
  "batchno",
  "serialno",
  "costprice",
  "pricea",
  "mrp",
  "remarks",
] as const;
export const HIDDEN_INTERNAL_COLUMN_KEYS = new Set<string>();
export const ITEM_AUTOFILL_FIELD_KEYS = [
  "barcode",
  "code",
  "godown",
  "uom",
  "taxname",
  "baseqty",
  "freebaseqty",
  "convfactor",
  "costprice",
  "costwot",
  "profittype",
  "roundoff",
  "priceawot",
  "priceamarkup",
  "pricea",
  "pricebwot",
  "pricebmarkup",
  "priceb",
  "pricecwot",
  "pricecmarkup",
  "pricec",
  "pricedwot",
  "pricedmarkup",
  "priced",
  "mrp",
  "msp",
  "remarks",
  "oslunitid",
  "oslbaseuomid",
  "oslgodownid",
  "osltrackingtype",
  "osltaxid",
  "osltaxperc",
  "oslcesstype",
  "oslcessperc",
  "oslcessperunit",
] as const;
export const QUANTITY_FORMATTER = new Intl.NumberFormat("en-IN", {
  minimumFractionDigits: 3,
  maximumFractionDigits: 3,
});
export const VALUE_FORMATTER = new Intl.NumberFormat("en-IN", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
export const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
export const ISO_DATE_TIME_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T/;
export const DISPLAY_DATE_PATTERN = /^(\d{2})\/(\d{2})\/(\d{4})$/;
