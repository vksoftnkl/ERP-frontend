export { NexDropdownSingle, type NexDropdownSingleProps } from "./nex-dropdown-single";
export { NexDropdownMulti, type NexDropdownMultiProps } from "./nex-dropdown-multi";
export { DropdownPopup, type DropdownPopupProps } from "./dropdown-popup";
export { useDropdownSearch, type UseDropdownSearchResult } from "./use-dropdown-search";
export { useDropdownKeys, type DropdownKeys } from "./use-dropdown-keys";
export { useDropdownMaster, type DropdownMasterState } from "./use-dropdown-master";
// NOTE: ./masters is deliberately NOT re-exported here — a barrel would make every
// feature's registration eager. Import it directly where you register.
export {
  dropdownColumnWidths,
  dropdownIdKey,
  extractDropdownDetail,
  normalizeDropdownConfig,
  visibleDropdownColumns,
} from "./config";
export { formatDropdownValue, toRawText } from "./format";
export {
  buildDropdownConfigQuery,
  buildDropdownRunQuery,
  dropdownParamsKey,
  DROPDOWN_CONFIG_ENDPOINT,
  DROPDOWN_PAGE_SIZE,
  DROPDOWN_RUN_ENDPOINT,
  DROPDOWN_SEARCH_DEBOUNCE_MS,
} from "./api";
export type {
  DropdownAlign,
  DropdownColumn,
  DropdownConfig,
  DropdownDataType,
  DropdownParams,
  DropdownRow,
  DropdownRowsPage,
  DropdownSelection,
  DropdownSortOrder,
} from "./types";
