import type { SupplierTableRow } from "./types";
import { LOOKUP_KEYS } from "./constants";
import { toDisplayValue, toUpdateId, getFirstDefinedValue } from "@/app/master/_shared/crud-utils";

// Build Supplier Table Rows
export function buildSupplierRows(payload: unknown): SupplierTableRow[] {
  if (!Array.isArray(payload)) {
    return [];
  }
  return payload.map((item) => toSupplierTableRow(item));
}

// Convert Item to Supplier Table Row
function toSupplierTableRow(item: unknown): SupplierTableRow {
  if (!item || typeof item !== "object") {
    return {};
  }
  const row = item as Record<string, unknown>;
  return {
    supId: toDisplayValue(getFirstDefinedValue(row, LOOKUP_KEYS.id as readonly string[])),
    supName: toDisplayValue(getFirstDefinedValue(row, LOOKUP_KEYS.name as readonly string[])),
    supPurchaseType: toDisplayValue(getFirstDefinedValue(row, LOOKUP_KEYS.code as readonly string[])),
    supGroupId: toDisplayValue(row.supGroupId),
    supGstNo: toDisplayValue(row.supGstNo),
    supCity: toDisplayValue(row.supCity),
    supStateName: toDisplayValue(row.supStateName),
    supIsActive: typeof row.supIsActive === "boolean" ? row.supIsActive : toDisplayValue(row.supIsActive),
    supSortOrder: typeof row.supSortOrder === "number" ? row.supSortOrder : toDisplayValue(row.supSortOrder),
    ...row,
  };
}

// Resolve Supplier Record ID
export function resolveSupplierRecordId(record: unknown): string | null {
  if (!record || typeof record !== "object") {
    return null;
  }
  const id = toDisplayValue(
    getFirstDefinedValue(record as Record<string, unknown>, LOOKUP_KEYS.id as readonly string[]),
  );
  return id.length > 0 ? id : null;
}

// Build Columns from Grid Columns Definition
export function buildColumnsFromGridColumns(gridColumns: unknown): string[] {
  if (!Array.isArray(gridColumns)) {
    return [];
  }
  return gridColumns
    .map((col) => {
      if (col && typeof col === "object" && "accessor" in col) {
        return (col as Record<string, unknown>).accessor as string;
      }
      return "";
    })
    .filter((accessor) => accessor.length > 0);
}

// Default Supplier Columns
export const DEFAULT_SUPPLIER_COLUMNS = [
  "supPurchaseType",
  "supName",
  "supCity",
  "supStateName",
  "supGstNo",
  "supIsActive",
] as const;
