/**
 * Turning `/dropdown-details/get` into something the popup can render.
 *
 * Pure: no React, no network. Everything the popup decides about columns comes
 * from here, so this is the file to read before changing how a dropdown looks.
 */
import type {
  DropdownAlign,
  DropdownColumn,
  DropdownColumnPayload,
  DropdownConfig,
  DropdownDataType,
  DropdownDetailPayload,
  DropdownRow,
  DropdownSortOrder,
} from "./types";

const DEFAULT_MAX_VISIBLE_ITEMS = 10;

const DATA_TYPES: Record<string, DropdownDataType> = {
  text: "Text",
  number: "Number",
  numberts: "NumberTS",
  numericts: "NumericTS",
  date: "Date",
  datetime: "DateTime",
};

const ALIGNMENTS: Record<string, DropdownAlign> = {
  left: "left",
  center: "center",
  centre: "center",
  right: "right",
};

function trimmed(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function toNumber(value: unknown, fallback: number): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return fallback;
}

/**
 * Pull the detail object out of whatever the caller had.
 *
 * `/dropdown-details/get` is a *list* endpoint filtered by `dropdownId`, so even a
 * single dropdown arrives as `{ data: [detail] }`. Accepting the envelope, the bare
 * array and the object itself keeps the callers from each re-deriving that.
 */
export function extractDropdownDetail(payload: unknown): DropdownDetailPayload | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }
  if (Array.isArray(payload)) {
    return (payload[0] as DropdownDetailPayload | undefined) ?? null;
  }
  const source = payload as Record<string, unknown>;
  if ("data" in source) {
    return extractDropdownDetail(source.data);
  }
  return source as DropdownDetailPayload;
}

function normalizeColumn(payload: DropdownColumnPayload): DropdownColumn {
  const name = trimmed(payload.dropdown_columns_name);
  const sqlName = trimmed(payload.dropdown_columns_sql_name);
  const alias = trimmed(payload.dropdown_columns_alias);
  const dataType = DATA_TYPES[trimmed(payload.dropdown_columns_data_type).toLowerCase()] ?? "Text";
  const align = ALIGNMENTS[trimmed(payload.dropdown_columns_allignment).toLowerCase()] ?? "left";
  return {
    jsonKey: sqlName || name,
    heading: alias || name,
    dataType,
    align,
    width: Math.max(0, toNumber(payload.dropdown_columns_width, 0)),
    visible: payload.dropdown_columns_visiblity !== false,
    filterable: payload.dropdown_columns_filter === true,
  };
}

/**
 * Order columns by `dropdown_columns_no`.
 *
 * The numbering is NOT consistently zero-based: dropdowns 21, 38 and 39 start at 0,
 * dropdown 8 (company) starts at 1. So "column 0" throughout this module means the
 * first column *in this order*, never `dropdown_columns_no === 0`. Reading the
 * number literally puts `comp_name` in the id position for every company field in
 * the app.
 */
function orderColumns(payloads: readonly DropdownColumnPayload[]): DropdownColumnPayload[] {
  return payloads
    .map((payload, index) => ({ payload, index }))
    .sort((left, right) => {
      const leftNo = toNumber(left.payload.dropdown_columns_no, left.index);
      const rightNo = toNumber(right.payload.dropdown_columns_no, right.index);
      return leftNo === rightNo ? left.index - right.index : leftNo - rightNo;
    })
    .map((entry) => entry.payload);
}

/**
 * Resolve `dropdown_completion` to a column key.
 *
 * It is configured as a name, and which name is not guaranteed — the SQL alias,
 * the display name and the column alias are the same string for most dropdowns but
 * nothing enforces it — so try all three before giving up.
 */
function resolveConfiguredCompletion(
  columns: readonly DropdownColumn[],
  raw: string,
  payloads: readonly DropdownColumnPayload[],
): string {
  const wanted = raw.toLowerCase();
  if (!wanted) {
    return "";
  }
  const byJsonKey = columns.find((column) => column.jsonKey.toLowerCase() === wanted);
  if (byJsonKey) {
    return byJsonKey.jsonKey;
  }
  const byHeading = columns.find((column) => column.heading.toLowerCase() === wanted);
  if (byHeading) {
    return byHeading.jsonKey;
  }
  const payloadIndex = payloads.findIndex(
    (payload) => trimmed(payload.dropdown_columns_name).toLowerCase() === wanted,
  );
  return payloadIndex >= 0 ? (columns[payloadIndex]?.jsonKey ?? "") : "";
}

/**
 * What fills the input when `dropdown_completion` is unset or names nothing.
 *
 * The first visible column that is not the id — a dropdown whose input echoes a
 * uuid back at the operator is worse than one that echoes the wrong column.
 */
function fallbackCompletionKey(columns: readonly DropdownColumn[]): string {
  const idKey = columns[0]?.jsonKey ?? "";
  const visible = columns.find((column) => column.visible && column.jsonKey !== idKey);
  if (visible) {
    return visible.jsonKey;
  }
  const named = columns.find((column) => column.jsonKey !== idKey);
  return named?.jsonKey ?? idKey;
}

/**
 * A definition where every column is hidden is not a request for an empty popup;
 * it is a dropdown nobody finished configuring, and it renders as a list of blank
 * rows that looks exactly like "no results".
 *
 * The rule (ported from `nex_dropdown_config.h:116`): force the completion column
 * visible; if that is not found, force the column at index 1 — index 1, not 0,
 * because column 0 is the id; if there is only one column, force that one.
 *
 * No dropdown in this deployment is currently shipped all-hidden (dropdown 38, the
 * one the Qt comment names, has `emp_code` and `emp_name` visible here), so this
 * guards against the designer screen rather than against known data.
 */
function ensureSomethingVisible(columns: DropdownColumn[], completionKey: string): DropdownColumn[] {
  if (columns.length === 0 || columns.some((column) => column.visible)) {
    return columns;
  }
  const completionIndex = columns.findIndex((column) => column.jsonKey === completionKey);
  const forcedIndex =
    completionIndex >= 0 ? completionIndex : Math.min(1, columns.length - 1);
  return columns.map((column, index) =>
    index === forcedIndex ? { ...column, visible: true } : column,
  );
}

export function normalizeDropdownConfig(payload: unknown): DropdownConfig | null {
  const detail = extractDropdownDetail(payload);
  if (!detail) {
    return null;
  }
  const payloads = orderColumns(Array.isArray(detail.columns) ? detail.columns : []);
  const columns = payloads.map(normalizeColumn);
  const configuredCompletion = resolveConfiguredCompletion(
    columns,
    trimmed(detail.dropdown_completion),
    payloads,
  );
  const withVisibility = ensureSomethingVisible(columns, configuredCompletion);
  const completionKey = configuredCompletion || fallbackCompletionKey(withVisibility);
  const sortOrder: DropdownSortOrder =
    trimmed(detail.dropdown_sort_order).toLowerCase() === "desc" ? "desc" : "asc";
  return {
    dropdownId: String(detail.dropdown_id ?? "").trim(),
    name: trimmed(detail.dropdown_name),
    completionKey,
    sortColumn: trimmed(detail.dropdown_sort_column),
    sortOrder,
    maxVisibleItems: Math.max(
      1,
      Math.round(toNumber(detail.dropdown_max_visible_items, DEFAULT_MAX_VISIBLE_ITEMS)),
    ),
    showHeader: detail.dropdown_show_header !== false,
    widthPercent: Math.max(0, toNumber(detail.dropdown_width, 0)),
    columns: withVisibility,
  };
}

/**
 * The column that holds the value a selection stores: the first configured column,
 * visible or not. Every dropdown in this deployment hides it (it is a uuid), which
 * is exactly why visibility must not enter into this.
 */
export function dropdownIdKey(config: DropdownConfig | null | undefined): string {
  return config?.columns[0]?.jsonKey ?? "";
}

/**
 * The columns the popup should actually draw for this result set.
 *
 * A configured column need not exist in the rows: dropdown 8 (company) configures
 * four columns over a `SELECT comp_name, comp_id` that returns two, and the two
 * extras have no `sql_name`, so their `jsonKey` falls back to a display name
 * ("company code") that no row will ever carry. Drawn as configured they are two
 * permanently empty columns with headings.
 *
 * With no rows to check yet, every visible column is kept — absence cannot be
 * distinguished from "not loaded". If the check would empty the popup entirely,
 * the configured set is kept instead: a wrong-looking column beats no column.
 */
export function visibleDropdownColumns(
  config: DropdownConfig | null | undefined,
  rows: readonly DropdownRow[],
): DropdownColumn[] {
  const visible = (config?.columns ?? []).filter((column) => column.visible);
  if (rows.length === 0) {
    return visible;
  }
  const present = visible.filter((column) =>
    rows.some((row) => row != null && Object.prototype.hasOwnProperty.call(row, column.jsonKey)),
  );
  return present.length > 0 ? present : visible;
}

/**
 * Column widths as fractions of the popup, summing to 1.
 *
 * The configured numbers are weights, not percentages — they sum to 80 for company,
 * 100 for customers and 110 for employees — so they are normalized rather than used
 * directly. All-zero (or a single column) means an even split.
 */
export function dropdownColumnWidths(columns: readonly DropdownColumn[]): number[] {
  if (columns.length === 0) {
    return [];
  }
  const total = columns.reduce((sum, column) => sum + Math.max(0, column.width), 0);
  if (total <= 0) {
    return columns.map(() => 1 / columns.length);
  }
  return columns.map((column) => Math.max(0, column.width) / total);
}
