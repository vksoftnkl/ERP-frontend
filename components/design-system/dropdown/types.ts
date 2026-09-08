/**
 * The server-configured dropdown (`fixed.dropdown_details` + `fixed.dropdown_columns`).
 *
 * A dropdown id names a stored SQL statement plus a column layout. The rows that
 * come back are opaque objects keyed by each column's `dropdown_columns_sql_name`,
 * so nothing here may assume a `value`/`label` shape: which column is the id, which
 * one fills the input after a pick, how each is formatted, aligned and sized are all
 * decisions the configuration makes.
 *
 * Raw payload types mirror the API exactly, misspellings included
 * (`dropdown_columns_visiblity`, `dropdown_columns_allignment`). They are corrected
 * only on our side of the boundary, in `normalizeDropdownConfig`.
 */

/** `dropdown_columns_data_type`, normalized. Anything unrecognised becomes `Text`. */
export type DropdownDataType =
  | "Text"
  | "Number"
  | "NumberTS"
  | "NumericTS"
  | "Date"
  | "DateTime";

export type DropdownAlign = "left" | "center" | "right";

export type DropdownSortOrder = "asc" | "desc";

export type DropdownColumn = {
  /** The key this column has in a row object: `sql_name` if set, else `name`. */
  jsonKey: string;
  /** Header text: `alias` if set, else `name`. */
  heading: string;
  dataType: DropdownDataType;
  align: DropdownAlign;
  /**
   * `dropdown_columns_width`, as configured. NOT a percentage of anything in
   * particular — the configured widths across this deployment sum to 80, 100 and
   * 110 depending on the dropdown — so treat them as relative weights and
   * normalize at render time with `dropdownColumnWidths`.
   */
  width: number;
  visible: boolean;
  filterable: boolean;
};

export type DropdownConfig = {
  dropdownId: string;
  name: string;
  /**
   * The column whose value fills the input after a pick, resolved to a `jsonKey`.
   *
   * `dropdown_completion` is null on 9 of the 46 configured dropdowns — including
   * company (8), branch (5), state code (9), customer group (3/28) and area (10),
   * i.e. most of what the master screens use — so the fallback is a normal path,
   * not an edge case. See `resolveCompletionKey`.
   */
  completionKey: string;
  sortColumn: string;
  sortOrder: DropdownSortOrder;
  /** How many rows the popup shows before scrolling. Default 10. */
  maxVisibleItems: number;
  showHeader: boolean;
  /** Percent of the viewport for the popup. `0` means "match the input's width". */
  widthPercent: number;
  /** In configured order. Column 0 is the id — see `dropdownIdKey`. */
  columns: DropdownColumn[];
};

/** One row of `/dropdown-details/run`, keyed by the stored SQL's own column names. */
export type DropdownRow = Record<string, unknown>;

/** What a dropdown holds: the id it stores and the text it shows. */
export type DropdownSelection = {
  id: string;
  text: string;
};

/**
 * Values bound into a dropdown's SQL placeholders.
 *
 * The substitution is textual and the placeholders are bare identifiers
 * (`emp_branch_id = iemp_branch_id::uuid`), so a dropdown that declares one and is
 * run without it does not fall back to "unfiltered" — the statement fails to
 * execute and the whole call 400s. Dropdowns 38 (EMPLOYEES, `iemp_branch_id`) and
 * 45 (SALES AGENTS, `isa_branch_id`) are the two that need this today.
 */
export type DropdownParams = Record<string, string | number | boolean | null | undefined>;

// -- raw API payloads ---------------------------------------------------------

export type DropdownColumnPayload = {
  dropdown_columns_id?: string;
  dropdown_columns_dropdown_id?: string;
  dropdown_columns_no?: number | string | null;
  dropdown_columns_data_type?: string | null;
  dropdown_columns_name?: string | null;
  dropdown_columns_alias?: string | null;
  dropdown_columns_width?: number | string | null;
  dropdown_columns_visiblity?: boolean | null;
  dropdown_columns_allignment?: string | null;
  dropdown_columns_filter?: boolean | null;
  dropdown_columns_sql_name?: string | null;
};

export type DropdownDetailPayload = {
  dropdown_id?: string | number | null;
  dropdown_name?: string | null;
  dropdown_description?: string | null;
  dropdown_sql?: string | null;
  dropdown_sort_order?: string | null;
  dropdown_sort_column?: string | null;
  dropdown_completion?: string | null;
  dropdown_max_visible_items?: number | string | null;
  dropdown_show_header?: boolean | null;
  dropdown_width?: number | string | null;
  columns?: DropdownColumnPayload[] | null;
};

/** `/dropdown-details/run` — a page of rows plus a real total. */
export type DropdownRowsPage = {
  items: DropdownRow[];
  meta: { page: number; limit: number; total: number };
};
