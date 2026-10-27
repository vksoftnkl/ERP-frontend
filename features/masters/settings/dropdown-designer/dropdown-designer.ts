import type {
  Alignment,
  DropdownColumnPayload,
  DropdownColumnRow,
  DropdownDesignerForm,
  SaveDropdownColumnRequest,
  SortOrder,
} from "./type";
export const INITIAL_FORM: DropdownDesignerForm = {
  dropdownId: "",
  dropdownName: "",
  dropdownDescription: "",
  sortColumn: "",
  sortOrder: "ASC",
  dropdownCompletion: "",
  dropdownSql: "",
  dropdownSqlRegional: "",
  maxVisibleItems: "10",
  showHeader: true,
  dropdownWidth: "",
};
export function cx(...tokens: Array<string | undefined | false>): string {
  return tokens.filter(Boolean).join(" ");
}
export function createLocalColumnId(): string {
  return `dropdown-column-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
export function createColumnDraft(
  columnNumber: number,
  overrides: Partial<DropdownColumnRow> = {},
): DropdownColumnRow {
  return {
    id: createLocalColumnId(),
    serialId: null,
    columnNumber,
    columnName: "",
    columnAlias: "",
    sqlName: "",
    dataType: "Text",
    width: "",
    alignment: "Left",
    visible: true,
    filter: false,
    ...overrides,
  };
}
export function normalizeSortOrder(value: string | null | undefined): SortOrder {
  const normalized = value?.trim().toLowerCase();
  if (normalized === "desc" || normalized === "descending") {
    return "DESC";
  }
  return "ASC";
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
export function resequenceColumns(columns: DropdownColumnRow[]): DropdownColumnRow[] {
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
export function toPositiveInteger(value: string): number | undefined {
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }
  const parsed = Number(trimmed);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}
export function toNullablePositiveInteger(value: string): number | null {
  const parsed = toPositiveInteger(value);
  return parsed ?? null;
}
export function formatNullableNumber(value: number | null): string {
  return value === null ? "" : String(value);
}
export function mapDropdownColumnPayloadToRow(payload: DropdownColumnPayload): DropdownColumnRow {
  return {
    id: createLocalColumnId(),
    serialId: payload.dropdown_columns_id,
    columnNumber: payload.dropdown_columns_no,
    columnName: payload.dropdown_columns_name,
    columnAlias: payload.dropdown_columns_alias ?? "",
    sqlName: payload.dropdown_columns_sql_name ?? "",
    dataType: payload.dropdown_columns_data_type,
    width: formatNullableNumber(payload.dropdown_columns_width),
    alignment: normalizeAlignment(payload.dropdown_columns_allignment),
    visible: payload.dropdown_columns_visiblity,
    filter: payload.dropdown_columns_filter,
  };
}
export function buildDropdownColumnRequest(
  column: DropdownColumnRow,
  rowIndex: number,
): SaveDropdownColumnRequest {
  return {
    ...(column.serialId ? { dropdown_columns_id: column.serialId } : {}),
    dropdown_columns_no: rowIndex + 1,
    dropdown_columns_data_type: column.dataType.trim() || "Text",
    dropdown_columns_name: column.columnName.trim() || `Column ${rowIndex + 1}`,
    dropdown_columns_alias: toNullableString(column.columnAlias),
    dropdown_columns_sql_name: toNullableString(column.sqlName),
    dropdown_columns_width: toNullableNumber(column.width),
    dropdown_columns_visiblity: column.visible,
    dropdown_columns_allignment: column.alignment,
    dropdown_columns_filter: column.filter,
  };
}
export function createBlankForm(): DropdownDesignerForm {
  return {
    dropdownId: "",
    dropdownName: "",
    dropdownDescription: "",
    sortColumn: "",
    sortOrder: "ASC",
    dropdownCompletion: "",
    dropdownSql: "",
    dropdownSqlRegional: "",
    maxVisibleItems: "10",
    showHeader: true,
    dropdownWidth: "",
  };
}
