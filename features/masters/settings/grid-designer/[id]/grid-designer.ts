import type {
  Alignment,
  GridColumnPayload,
  GridColumnRow,
  GridDesignerForm,
  GridDeviceType,
  SaveGridColumnRequest,
  SortOrder,
} from "./type";
export const DEFAULT_DEVICE_TYPE: GridDeviceType = "desktop";
export const HEX_COLOR_CODE_PATTERN = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;
export const INITIAL_FORM: GridDesignerForm = {
  gridId: "",
  gridName: "",
  gridDescription: "",
  sortColumn: "",
  sortOrder: "Ascending",
  gridSql: "",
  gridStatus: true,
  gridDeviceType: DEFAULT_DEVICE_TYPE,
};
export function createLocalColumnId(): string {
  return `column-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
export function createColumnDraft(
  columnNumber: number,
  overrides: Partial<GridColumnRow> = {},
): GridColumnRow {
  return {
    id: createLocalColumnId(),
    gridColumnId: null,
    columnNumber,
    columnName: "",
    sqlFieldName: "",
    width: "",
    position: String(columnNumber),
    alignment: "Left",
    visible: true,
    filter: false,
    condition: "",
    conditionColor: "",
    grouping: false,
    total: false,
    dataType: "Text",
    columnColor: "",
    notes: "",
    ...overrides,
  };
}
export function normalizeSortOrder(value: string | null | undefined): SortOrder {
  const normalized = value?.trim().toLowerCase();
  if (normalized === "descending" || normalized === "desc") {
    return "Descending";
  }
  return "Ascending";
}
export function normalizeAlignment(value: string | null | undefined): Alignment {
  const normalized = value?.trim().toLowerCase();
  if (normalized === "center") {
    return "Center";
  }
  if (normalized === "right") {
    return "Right";
  }
  return "Left";
}
export function resequenceColumns(columns: GridColumnRow[]): GridColumnRow[] {
  return columns.map((column, index) => ({
    ...column,
    columnNumber: index + 1,
  }));
}
export function toNullableString(value: string): string | null {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}
export function toNullableNumber(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}
export function formatNullableNumber(value: number | null): string {
  return value === null ? "" : String(value);
}
export function compareGridColumnsByPosition(left: GridColumnPayload, right: GridColumnPayload): number {
  const leftPosition = left.grid_column_position ?? left.grid_column_number;
  const rightPosition = right.grid_column_position ?? right.grid_column_number;
  if (leftPosition !== rightPosition) {
    return leftPosition - rightPosition;
  }
  return left.grid_column_number - right.grid_column_number;
}
export function resolveColorPickerValue(value: string): string {
  const normalized = value.trim();
  if (!HEX_COLOR_CODE_PATTERN.test(normalized)) {
    return "#000000";
  }
  if (normalized.length === 4) {
    return `#${normalized[1]}${normalized[1]}${normalized[2]}${normalized[2]}${normalized[3]}${normalized[3]}`;
  }
  return normalized;
}
export function mapGridColumnPayloadToRow(payload: GridColumnPayload): GridColumnRow {
  return {
    id: createLocalColumnId(),
    gridColumnId: payload.grid_column_id,
    columnNumber: payload.grid_column_number,
    columnName: payload.grid_column_name ?? "",
    sqlFieldName: payload.grid_column_sql_field_name ?? "",
    width: formatNullableNumber(payload.grid_column_width),
    position: formatNullableNumber(payload.grid_column_position),
    alignment: normalizeAlignment(payload.grid_column_alignment),
    visible: payload.grid_column_visibility,
    filter: payload.grid_column_filter,
    condition: payload.grid_column_condition ?? "",
    conditionColor: payload.grid_column_condition_color ?? "",
    grouping: payload.grid_column_group,
    total: payload.grid_column_total,
    dataType: payload.grid_column_data_type ?? "",
    columnColor: payload.grid_column_color ?? "",
    notes: payload.grid_column_notes ?? "",
  };
}
export function buildGridColumnRequest(
  column: GridColumnRow,
  rowIndex: number,
): SaveGridColumnRequest {
  return {
    ...(column.gridColumnId ? { grid_column_id: column.gridColumnId } : {}),
    grid_column_number: rowIndex + 1,
    grid_column_name: column.columnName.trim() || `Column ${rowIndex + 1}`,
    grid_column_width: toNullableNumber(column.width),
    grid_column_position: toNullableNumber(column.position),
    grid_column_alignment: column.alignment,
    grid_column_visibility: column.visible,
    grid_column_filter: column.filter,
    grid_column_condition: toNullableString(column.condition),
    grid_column_condition_color: toNullableString(column.conditionColor),
    grid_column_group: column.grouping,
    grid_column_total: column.total,
    grid_column_data_type: toNullableString(column.dataType),
    grid_column_color: toNullableString(column.columnColor),
    grid_column_notes: toNullableString(column.notes),
    grid_column_sql_field_name: toNullableString(column.sqlFieldName),
  };
}
export function createBlankForm(): GridDesignerForm {
  return {
    gridId: "",
    gridName: "",
    gridDescription: "",
    sortColumn: "",
    sortOrder: "Ascending",
    gridSql: "",
    gridStatus: true,
    gridDeviceType: DEFAULT_DEVICE_TYPE,
  };
}
export function normalizeGridDeviceType(value: string | null | undefined): GridDeviceType {
  if (value === "web" || value === "mobile" || value === "desktop") return value;
  return DEFAULT_DEVICE_TYPE;
}
