import type { ReusableTableRowReorderEdge } from "@/components/ui/table";
import type {
  UiTableApiErrorDetail,
  UiTableApiErrorResponse,
  SaveUiTableColumnRequest,
  SaveUiTableMasterRequest,
  UiTableColumnPayload,
  UiTableColumnRow,
  UiTableForm,
  UiTablePayload,
} from "./type";
export const NUMBER_STRING_PATTERN = /^\d+$/;
export const MAX_TABLE_NAME_LENGTH = 500;
export const MAX_COLUMN_NAME_LENGTH = 500;
export const MAX_DEVICE_TYPE_LENGTH = 255;
export function createLocalColumnId(): string {
  return `ui-column-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
export function createColumnDraft(
  columnNumber: number,
  overrides: Partial<UiTableColumnRow> = {},
): UiTableColumnRow {
  return {
    id: createLocalColumnId(),
    uiTblClmId: null,
    columnNumber,
    columnName: "",
    width: "100",
    visible: true,
    focus: false,
    position: String(columnNumber),
    necessity: false,
    nextColumn: "",
    previousColumn: "",
    isActive: true,
    ...overrides,
  };
}
export function createBlankForm(): UiTableForm {
  return {
    uiTblId: "",
    uiTblName: "",
    uiTblDeviceType: "",
    uiTblEditable: false,
    uiTblIsActive: true,
  };
}
export function resequenceColumns(columns: UiTableColumnRow[]): UiTableColumnRow[] {
  return columns.map((column, index) => ({
    ...column,
    columnNumber: index + 1,
    position: String(index + 1),
  }));
}
export function clampPosition(value: number, totalRows: number): number {
  if (totalRows <= 0) {
    return 1;
  }
  const normalizedValue = Number.isFinite(value) ? Math.trunc(value) : 1;
  return Math.min(Math.max(normalizedValue, 1), totalRows);
}
export function moveColumn(
  columns: UiTableColumnRow[],
  sourceId: string,
  targetId: string,
  edge: ReusableTableRowReorderEdge,
): UiTableColumnRow[] {
  const sourceIndex = columns.findIndex((column) => column.id === sourceId);
  const targetIndex = columns.findIndex((column) => column.id === targetId);
  if (
    sourceIndex < 0 ||
    targetIndex < 0 ||
    sourceIndex === targetIndex ||
    sourceId === targetId
  ) {
    return columns;
  }
  const nextColumns = [...columns];
  const [sourceColumn] = nextColumns.splice(sourceIndex, 1);
  const targetIndexAfterRemoval = sourceIndex < targetIndex ? targetIndex - 1 : targetIndex;
  const insertionIndex = edge === "before" ? targetIndexAfterRemoval : targetIndexAfterRemoval + 1;
  if (!sourceColumn || insertionIndex === sourceIndex) {
    return columns;
  }
  nextColumns.splice(insertionIndex, 0, sourceColumn);
  return resequenceColumns(nextColumns);
}
export function moveColumnToPosition(
  columns: UiTableColumnRow[],
  columnId: string,
  requestedPosition: number,
): UiTableColumnRow[] {
  const sourceIndex = columns.findIndex((column) => column.id === columnId);
  if (sourceIndex < 0) {
    return columns;
  }
  const targetIndex = clampPosition(requestedPosition, columns.length) - 1;
  if (targetIndex === sourceIndex) {
    return columns;
  }
  const nextColumns = [...columns];
  const [sourceColumn] = nextColumns.splice(sourceIndex, 1);
  if (!sourceColumn) {
    return columns;
  }
  nextColumns.splice(targetIndex, 0, sourceColumn);
  return resequenceColumns(nextColumns);
}
export function toNullableInteger(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  const parsed = Number(trimmed);
  return Number.isInteger(parsed) ? parsed : null;
}
export function toDisplayString(value: number | null): string {
  return value === null ? "" : String(value);
}
export function parseColumnNumber(value: string, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}
export function toNullableTrimmedString(value: string): string | null {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}
export function getUiTblId(payload: UiTablePayload): string {
  return payload.uiTblId.trim();
}
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
export function extractUnknownMessage(value: unknown): string {
  if (typeof value === "string") {
    return value.trim();
  }
  if (typeof value === "number" || typeof value === "bigint" || typeof value === "boolean") {
    return String(value);
  }
  if (Array.isArray(value)) {
    return value
      .map((entry) => extractUnknownMessage(entry))
      .filter(Boolean)
      .join(", ");
  }
  if (isRecord(value)) {
    for (const key of ["message", "error", "detail", "title"] as const) {
      const message = extractUnknownMessage(value[key]);
      if (message) {
        return message;
      }
    }
  }
  return "";
}
export function isUiTableApiErrorResponse(value: unknown): value is UiTableApiErrorResponse {
  return (
    isRecord(value) &&
    value.success === false &&
    typeof value.message === "string" &&
    Array.isArray(value.errors)
  );
}
export function getErrorResponseData(error: unknown): unknown {
  return isRecord(error) && isRecord(error.response) ? error.response.data : undefined;
}
export function getUiTableErrorInfo(
  error: unknown,
  fallbackMessage: string,
): { message: string; errors: UiTableApiErrorDetail[] } {
  const responseData = getErrorResponseData(error);
  if (isUiTableApiErrorResponse(responseData)) {
    return {
      message: responseData.message,
      errors: responseData.errors,
    };
  }
  return {
    message:
      extractUnknownMessage(responseData) || extractUnknownMessage(error) || fallbackMessage,
    errors: [],
  };
}
export function parseNullableNumberInput(
  field: string,
  value: string,
  errors: UiTableApiErrorDetail[],
): number | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed)) {
    errors.push({ field, message: `${field} must be a number` });
    return null;
  }
  return parsed;
}
export function parseNullableIntegerInput(
  field: string,
  value: string,
  errors: UiTableApiErrorDetail[],
): number | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  const parsed = Number(trimmed);
  if (!Number.isInteger(parsed)) {
    errors.push({ field, message: `${field} must be an integer` });
    return null;
  }
  return parsed;
}
export function mapUiTableColumnPayloadToRow(
  payload: UiTableColumnPayload,
  fallbackIndex: number,
): UiTableColumnRow {
  const fallbackColumnNumber = fallbackIndex + 1;
  return {
    id: createLocalColumnId(),
    uiTblClmId: payload.uiTblClmId,
    columnNumber: parseColumnNumber(payload.uiTblClmNo, fallbackColumnNumber),
    columnName: payload.uiTblClmName ?? "",
    width: toDisplayString(payload.uiTblClmColumnWidth),
    visible: payload.uiTblClmColumnVisibility ?? true,
    focus: payload.uiTblClmColumnFocus ?? false,
    position: String(payload.uiTblClmColumnPosition ?? fallbackColumnNumber),
    necessity: payload.uiTblClmColumnNecessity,
    nextColumn: toDisplayString(payload.uiTblClmNextColumn),
    previousColumn: toDisplayString(payload.uiTblClmPreviousColumn),
    isActive: payload.uiTblClmIsActive,
  };
}
export function buildUiTableColumnRequest(
  column: UiTableColumnRow,
  rowIndex: number,
  parentUiTblId: string,
  errors: UiTableApiErrorDetail[],
): SaveUiTableColumnRequest {
  const fallbackColumnNumber = rowIndex + 1;
  const fieldPrefix = `uiTblColumns[${rowIndex}].`;
  const uiTblClmId = column.uiTblClmId?.trim() ?? "";
  const uiTblClmName = column.columnName.trim();
  const uiTblClmColumnWidth = parseNullableNumberInput(
    `${fieldPrefix}uiTblClmColumnWidth`,
    column.width,
    errors,
  );
  const uiTblClmColumnPosition =
    parseNullableIntegerInput(`${fieldPrefix}uiTblClmColumnPosition`, column.position, errors) ??
    fallbackColumnNumber;
  const uiTblClmNextColumn = parseNullableIntegerInput(
    `${fieldPrefix}uiTblClmNextColumn`,
    column.nextColumn,
    errors,
  );
  const uiTblClmPreviousColumn = parseNullableIntegerInput(
    `${fieldPrefix}uiTblClmPreviousColumn`,
    column.previousColumn,
    errors,
  );

  if (uiTblClmId && !NUMBER_STRING_PATTERN.test(uiTblClmId)) {
    errors.push({
      field: `${fieldPrefix}uiTblClmId`,
      message: "uiTblClmId must be a numeric string",
    });
  }
  if (!uiTblClmName) {
    errors.push({
      field: `${fieldPrefix}uiTblClmName`,
      message: "uiTblClmName must not be empty",
    });
  } else if (uiTblClmName.length > MAX_COLUMN_NAME_LENGTH) {
    errors.push({
      field: `${fieldPrefix}uiTblClmName`,
      message: `uiTblClmName must be at most ${MAX_COLUMN_NAME_LENGTH} characters`,
    });
  }

  return {
    ...(uiTblClmId ? { uiTblClmId } : {}),
    uiTblClmNo: String(column.columnNumber || fallbackColumnNumber),
    uiTblClmName,
    uiTblClmTableId: parentUiTblId || null,
    uiTblClmColumnWidth,
    uiTblClmColumnVisibility: column.visible,
    uiTblClmColumnFocus: column.focus,
    uiTblClmColumnPosition,
    uiTblClmColumnNecessity: column.necessity,
    uiTblClmNextColumn,
    uiTblClmPreviousColumn,
    uiTblClmIsActive: column.isActive,
  };
}
export function buildSaveUiTableRequest(
  form: UiTableForm,
  columns: UiTableColumnRow[],
): { request: SaveUiTableMasterRequest | null; errors: UiTableApiErrorDetail[] } {
  const errors: UiTableApiErrorDetail[] = [];
  const uiTblId = form.uiTblId.trim();
  const uiTblName = form.uiTblName.trim();
  const uiTblDeviceType = toNullableTrimmedString(form.uiTblDeviceType);

  if (uiTblId && !NUMBER_STRING_PATTERN.test(uiTblId)) {
    errors.push({ field: "uiTblId", message: "uiTblId must be a numeric string" });
  }
  if (!uiTblName) {
    errors.push({ field: "uiTblName", message: "uiTblName must not be empty" });
  } else if (uiTblName.length > MAX_TABLE_NAME_LENGTH) {
    errors.push({
      field: "uiTblName",
      message: `uiTblName must be at most ${MAX_TABLE_NAME_LENGTH} characters`,
    });
  }
  if (uiTblDeviceType && uiTblDeviceType.length > MAX_DEVICE_TYPE_LENGTH) {
    errors.push({
      field: "uiTblDeviceType",
      message: `uiTblDeviceType must be at most ${MAX_DEVICE_TYPE_LENGTH} characters`,
    });
  }

  const uiTblColumns = columns.map((column, rowIndex) =>
    buildUiTableColumnRequest(column, rowIndex, uiTblId, errors),
  );
  if (errors.length > 0) {
    return { request: null, errors };
  }

  return {
    request: {
      ...(uiTblId ? { uiTblId } : {}),
      uiTblName,
      uiTblDeviceType,
      uiTblEditable: form.uiTblEditable,
      uiTblIsActive: form.uiTblIsActive,
      uiTblColumns,
      replaceColumns: true,
    },
    errors,
  };
}
