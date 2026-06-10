import type { ERPDynamicSelectOption } from "@/components/design-system/ui";

// UI Table Column endpoints — shared by opening-stock and physical-stock
export const UI_TABLE_COLUMNS_LIST_ENDPOINT = "/ui-table-masters/get";
export const UI_TABLE_COLUMNS_CREATE_ENDPOINT = "/ui-table-masters/create";

// Batch/date tracking fields — same across both stock modules
export const DATE_FIELD_KEYS = ["batchdate", "mfgdate", "expirydate"] as const;

export const GODOWN_LIST_ENDPOINT = "/master-lookups/name-id/all-accounts-and-masters";
export const LOOKUP_SEARCH_DEBOUNCE_MS = 250;
export const DELETE_ACTION_COLUMN_WIDTH = "68px";
export const SERIAL_NUMBER_COLUMN_WIDTH = "112px";
export const MIN_RESIZABLE_COLUMN_WIDTH = 80;
export const GODOWN_LOOKUP_QUERY = {
  module: "godownLocations",
  limit: "100",
} as const;
export const DEFAULT_ITEM_OPTION: ERPDynamicSelectOption = {
  value: "",
  label: "",
};
export const DEFAULT_GODOWN_OPTION: ERPDynamicSelectOption = {
  value: "",
  label: "",
};
export const QUANTITY_FORMATTER = new Intl.NumberFormat("en-IN", {
  minimumFractionDigits: 3,
  maximumFractionDigits: 3,
});
export const VALUE_FORMATTER = new Intl.NumberFormat("en-IN", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});