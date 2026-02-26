import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import axios from "axios";
import { getAuthSession } from "@/lib/auth/session";
import type { RootState } from "@/store/store";

const DEFAULT_API_PORT = "3010";

function resolveDefaultApiBase(): string {
  if (typeof window === "undefined") {
    return `https://localhost:${DEFAULT_API_PORT}/api/v1`;
  }

  return `https://${window.location.hostname}:${DEFAULT_API_PORT}/api/v1`;
}

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? resolveDefaultApiBase();
const GRID_COLUMNS_LIST_ENDPOINT = "/grid-columns/list";

const ARRAY_KEYS = [
  "data",
  "items",
  "results",
  "rows",
  "list",
  "columns",
  "gridColumns",
  "grid_columns",
] as const;
const COLUMN_KEY_KEYS = [
  "key",
  "column_key",
  "columnKey",
  "grid_column_key",
  "gridColumnKey",
  "field",
  "field_name",
  "fieldName",
  "grid_column_name",
  "gridColumnName",
  "name",
  "column_name",
  "columnName",
] as const;
const COLUMN_ACCESSOR_KEYS = [
  "accessor",
  "accessor_key",
  "accessorKey",
  "grid_column_key",
  "gridColumnKey",
  "grid_column_name",
  "gridColumnName",
  "db_column",
  "dbColumn",
  "value",
  "value_key",
  "valueKey",
] as const;
const COLUMN_HEADER_KEYS = [
  "header",
  "label",
  "title",
  "caption",
  "column_title",
  "columnTitle",
  "grid_column_name",
  "gridColumnName",
  "display_name",
  "displayName",
  "name",
] as const;
const COLUMN_ORDER_KEYS = [
  "order",
  "grid_column_number",
  "gridColumnNumber",
  "position",
  "index",
  "sequence",
  "seq",
  "sort_order",
  "sortOrder",
] as const;
const COLUMN_WIDTH_KEYS = [
  "width",
  "size",
  "column_width",
  "columnWidth",
  "grid_column_width",
  "gridColumnWidth",
] as const;
const COLUMN_ALIGN_KEYS = [
  "align",
  "alignment",
  "text_align",
  "textAlign",
  "grid_column_alignment",
  "gridColumnAlignment",
] as const;
const COLUMN_COLOR_KEYS = [
  "color",
  "column_color",
  "columnColor",
  "grid_column_color",
  "gridColumnColor",
] as const;
const COLUMN_VISIBLE_KEYS = [
  "visible",
  "is_visible",
  "isVisible",
  "show",
  "is_show",
  "isShow",
  "grid_column_visibility",
  "gridColumnVisibility",
] as const;
const COLUMN_HIDDEN_KEYS = [
  "hidden",
  "is_hidden",
  "isHidden",
  "hide",
  "grid_column_is_deleted",
  "gridColumnIsDeleted",
] as const;
const COLUMN_SORTABLE_KEYS = [
  "sortable",
  "is_sortable",
  "isSortable",
  "allow_sort",
  "allowSort",
  "grid_column_filter",
  "gridColumnFilter",
] as const;

type GridColumnAlign = "left" | "center" | "right";

export type GridColumnConfig = {
  key: string;
  accessorKey: string;
  header: string;
  order: number;
  visible: boolean;
  sortable?: boolean;
  align?: GridColumnAlign;
  width?: string;
  color?: string;
};

type GridColumnsEntry = {
  items: GridColumnConfig[];
  loading: boolean;
  error: string | null;
  requested: boolean;
};

type GridColumnsState = {
  byGridId: Record<number, GridColumnsEntry>;
};

const EMPTY_ENTRY: GridColumnsEntry = {
  items: [],
  loading: false,
  error: null,
  requested: false,
};

const initialState: GridColumnsState = {
  byGridId: {},
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function getFirstDefinedValue(
  row: Record<string, unknown>,
  keys: readonly string[],
): unknown {
  for (const key of keys) {
    const value = row[key];
    if (value !== undefined && value !== null && value !== "") {
      return value;
    }
  }
  return undefined;
}

function toBoolean(value: unknown): boolean | null {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    if (value === 1) return true;
    if (value === 0) return false;
    return null;
  }
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "1", "yes", "y"].includes(normalized)) {
      return true;
    }
    if (["false", "0", "no", "n"].includes(normalized)) {
      return false;
    }
  }
  return null;
}

function normalizeKey(value: unknown): string {
  if (typeof value === "string") {
    return value.trim();
  }
  if (typeof value === "number" || typeof value === "bigint") {
    return String(value);
  }
  return "";
}

function formatHeaderFromKey(key: string): string {
  const normalized = key
    .replace(/[_-]+/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim();

  if (!normalized) {
    return "Value";
  }

  return normalized.replace(/\b\w/g, (char) => char.toUpperCase());
}

function normalizeHeader(value: unknown, fallbackKey: string): string {
  const normalized = normalizeKey(value);
  return normalized || formatHeaderFromKey(fallbackKey);
}

function normalizeOrder(value: unknown, fallbackOrder: number): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.max(0, Math.floor(value));
  }
  if (typeof value === "string") {
    const parsed = Number.parseInt(value.trim(), 10);
    if (Number.isFinite(parsed)) {
      return Math.max(0, parsed);
    }
  }
  return fallbackOrder;
}

function normalizeWidth(value: unknown): string | undefined {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return `${Math.floor(value)}px`;
  }
  if (typeof value === "string") {
    const normalized = value.trim();
    if (!normalized) {
      return undefined;
    }
    if (/^\d+(\.\d+)?$/.test(normalized)) {
      return `${Math.floor(Number(normalized))}px`;
    }
    return normalized;
  }
  return undefined;
}

function normalizeAlign(value: unknown): GridColumnAlign | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const normalized = value.trim().toLowerCase();
  if (normalized === "left" || normalized === "center" || normalized === "right") {
    return normalized;
  }
  return undefined;
}

function normalizeColor(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const normalized = value.trim();
  return normalized || undefined;
}

function extractColumnRows(payload: unknown): Record<string, unknown>[] {
  if (Array.isArray(payload)) {
    return payload.filter(isRecord);
  }

  if (!isRecord(payload)) {
    return [];
  }

  for (const key of ARRAY_KEYS) {
    const value = payload[key];
    if (Array.isArray(value)) {
      return value.filter(isRecord);
    }
    if (isRecord(value)) {
      for (const nestedKey of ARRAY_KEYS) {
        const nestedValue = value[nestedKey];
        if (Array.isArray(nestedValue)) {
          return nestedValue.filter(isRecord);
        }
      }
    }
  }

  const firstArray = Object.values(payload).find((value) => Array.isArray(value));
  if (Array.isArray(firstArray)) {
    return firstArray.filter(isRecord);
  }

  return [];
}

function normalizeGridColumnAdjustmentRow(
  row: Record<string, unknown>,
  fallbackOrder: number,
): GridColumnConfig | null {
  const columnName = normalizeKey(row.grid_column_name);
  if (!columnName) {
    return null;
  }

  return {
    key: columnName,
    accessorKey: columnName,
    header: columnName,
    order: normalizeOrder(row.grid_column_number, fallbackOrder),
    visible: true,
    align: normalizeAlign(row.grid_column_alignment),
    width: normalizeWidth(row.grid_column_width),
    color: normalizeColor(row.grid_column_color),
  };
}

function normalizeColumnRow(
  row: Record<string, unknown>,
  fallbackOrder: number,
): GridColumnConfig | null {
  const directAdjustment = normalizeGridColumnAdjustmentRow(row, fallbackOrder);
  if (directAdjustment) {
    return directAdjustment;
  }

  const rawKey = getFirstDefinedValue(row, COLUMN_KEY_KEYS);
  const rawAccessor = getFirstDefinedValue(row, COLUMN_ACCESSOR_KEYS);
  const rawHeader = getFirstDefinedValue(row, COLUMN_HEADER_KEYS);

  const key = normalizeKey(rawKey || rawAccessor || rawHeader);
  if (!key) {
    return null;
  }

  const accessorKey = normalizeKey(rawAccessor || rawKey || rawHeader) || key;
  const header = normalizeHeader(rawHeader || rawKey || rawAccessor, key);
  const order = normalizeOrder(getFirstDefinedValue(row, COLUMN_ORDER_KEYS), fallbackOrder);
  const width = normalizeWidth(getFirstDefinedValue(row, COLUMN_WIDTH_KEYS));
  const align = normalizeAlign(getFirstDefinedValue(row, COLUMN_ALIGN_KEYS));
  const color = normalizeColor(getFirstDefinedValue(row, COLUMN_COLOR_KEYS));
  const sortable = toBoolean(getFirstDefinedValue(row, COLUMN_SORTABLE_KEYS));
  const hidden = toBoolean(getFirstDefinedValue(row, COLUMN_HIDDEN_KEYS));
  const visibleValue = toBoolean(getFirstDefinedValue(row, COLUMN_VISIBLE_KEYS));
  const visible = hidden !== null ? !hidden : visibleValue ?? true;

  return {
    key,
    accessorKey,
    header,
    order,
    visible,
    sortable: sortable ?? undefined,
    align,
    width,
    color,
  };
}

function normalizeGridColumnsPayload(payload: unknown): GridColumnConfig[] {
  const rows = extractColumnRows(payload);
  const candidateRows = rows.length > 0 ? rows : isRecord(payload) ? [payload] : [];
  const dedupedByKey = new Map<string, GridColumnConfig>();

  candidateRows.forEach((row, index) => {
    const normalized = normalizeColumnRow(row, index);
    if (!normalized) {
      return;
    }

    const dedupeKey = normalized.key.trim().toLowerCase();
    const existing = dedupedByKey.get(dedupeKey);
    if (!existing || normalized.order < existing.order) {
      dedupedByKey.set(dedupeKey, normalized);
    }
  });

  return Array.from(dedupedByKey.values()).sort((left, right) => left.order - right.order);
}

function getErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const responseData = error.response?.data as { message?: string } | string | undefined;
    if (typeof responseData === "string" && responseData.trim()) {
      return responseData;
    }
    if (
      responseData &&
      typeof responseData === "object" &&
      typeof responseData.message === "string" &&
      responseData.message.trim()
    ) {
      return responseData.message;
    }
    return error.message || "Unable to load grid columns.";
  }

  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  return "Unable to load grid columns.";
}

export const fetchGridColumns = createAsyncThunk<
  { gridId: number; columns: GridColumnConfig[] },
  { gridId: number; page?: number; limit?: number },
  { rejectValue: { gridId: number; message: string } }
>("gridColumns/fetch", async ({ gridId, page = 1, limit = 20 }, { rejectWithValue }) => {
  try {
    const token = getAuthSession()?.trim();
    const headers: Record<string, string> = {};
    
    if (token) {
      headers.Authorization = token.startsWith("Bearer ") ? token : `Bearer ${token}`;
    }

    const response = await axios.request<unknown>({
      url: GRID_COLUMNS_LIST_ENDPOINT,
      method: "GET",
      baseURL: API_BASE || undefined,
      headers,
      params: {
        grid_id: gridId,
        page,
        limit,
      },
    });

    return {
      gridId,
      columns: normalizeGridColumnsPayload(response.data),
    };
  } catch (error) {
    return rejectWithValue({
      gridId,
      message: getErrorMessage(error),
    });
  }
});

const gridColumnsSlice = createSlice({
  name: "gridColumns",
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder.addCase(fetchGridColumns.pending, (state, action) => {
      const { gridId } = action.meta.arg;
      const entry = state.byGridId[gridId] ?? { ...EMPTY_ENTRY };
      entry.loading = true;
      entry.error = null;
      entry.requested = true;
      state.byGridId[gridId] = entry;
    });

    builder.addCase(fetchGridColumns.fulfilled, (state, action) => {
      const { gridId, columns } = action.payload;
      const entry = state.byGridId[gridId] ?? { ...EMPTY_ENTRY };
      entry.loading = false;
      entry.error = null;
      entry.items = columns;
      entry.requested = true;
      state.byGridId[gridId] = entry;
    });

    builder.addCase(fetchGridColumns.rejected, (state, action) => {
      const gridId = action.payload?.gridId ?? action.meta.arg.gridId;
      const entry = state.byGridId[gridId] ?? { ...EMPTY_ENTRY };
      entry.loading = false;
      entry.error = action.payload?.message ?? action.error.message ?? "Unable to load grid columns.";
      entry.requested = true;
      state.byGridId[gridId] = entry;
    });
  },
});

function selectGridColumnsEntry(state: RootState, gridId: number): GridColumnsEntry {
  return state.gridColumns.byGridId[gridId] ?? EMPTY_ENTRY;
}

export function selectGridColumns(state: RootState, gridId: number): GridColumnConfig[] {
  return selectGridColumnsEntry(state, gridId).items;
}

export function selectGridColumnsLoading(state: RootState, gridId: number): boolean {
  return selectGridColumnsEntry(state, gridId).loading;
}

export function selectGridColumnsRequested(state: RootState, gridId: number): boolean {
  return selectGridColumnsEntry(state, gridId).requested;
}

export function selectGridColumnsError(state: RootState, gridId: number): string | null {
  return selectGridColumnsEntry(state, gridId).error;
}

export default gridColumnsSlice.reducer;
