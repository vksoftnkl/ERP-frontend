"use client";
import {
  type CSSProperties,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import DeleteConfirmModal from "@/components/ui/delete-confirm-modal";
import ReusableTable, { type ReusableTableColumn } from "@/components/ui/table";
import { resolveRecordHistoryDisplayName } from "@/features/masters/audit-logs/record-history-route";
import { RecordHistoryModal } from "@/features/masters/record-history/page";
import { useApi } from "@/hooks/useApi";
import { useMasterCrud } from "@/features/masters/shared";
import { getConfiguredModuleGridId } from "@/features/masters/shared/configured-grid-detail-ids";
import { getApiErrorMessage } from "@/store/api/baseApi";
import { useGetGridColumnsQuery } from "@/store/api/metadataApi";
import type { GridColumnConfig } from "@/store/slices/gridColumnsSlice";
import {
  ERPDynamicModalForm,
  type ERPDynamicModalController,
  type ERPDynamicModalField,
  type ERPDynamicModalSubmitPayload,
  type ERPDynamicModalVariant,
} from "@/components/library/ui/dynamic-modal-form";
const DEBOUNCE_MS = 300;
const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 20;
const GRID_DETAILS_ENDPOINT = "/grid-details/list";
const GRID_DETAIL_GET_ENDPOINT = "/grid-details/get";
const GRID_COLUMNS_PAGE = 1;
const GRID_COLUMNS_LIMIT = 20;
const GRID_DETAIL_ID_KEYS = ["grid_id", "gridId", "id"] as const;
const GRID_DETAIL_SQL_KEYS = ["grid_sql", "gridSql", "sql"] as const;
const GRID_DETAIL_NAME_KEYS = ["grid_name", "gridName", "name"] as const;
const DEFAULT_ARRAY_KEYS = [
  "data",
  "items",
  "results",
  "rows",
  "list",
] as const;
const PAGINATION_CONTAINER_KEYS = [
  "meta",
  "pagination",
  "pageInfo",
  "pager",
] as const;
const TOTAL_ENTRIES_KEYS = [
  "total",
  "totalCount",
  "total_count",
  "totalRecords",
  "total_records",
  "count",
  "recordsTotal",
  "totalItems",
  "total_items",
] as const;
const CURRENT_PAGE_KEYS = [
  "page",
  "currentPage",
  "current_page",
  "pageNo",
  "page_no",
] as const;
const PAGE_SIZE_KEYS = [
  "limit",
  "pageSize",
  "page_size",
  "perPage",
  "per_page",
] as const;

const DEFAULT_ACTIVE_KEYS = [
  "active",
  "is_active",
  "isActive",
  "isactive",
  "status",
] as const;
const DEFAULT_POSITION_KEYS = ["position", "sort"] as const;
const DEFAULT_DESCRIPTION_KEYS = ["description", "desc"] as const;
const LIST_RESPONSE_STYLE_HEADER_KEYS = [
  "grid_column_name",
  "gridColumnName",
  "column_name",
  "columnName",
  "header",
  "label",
  "title",
] as const;
const LIST_RESPONSE_STYLE_ORDER_KEYS = [
  "grid_column_number",
  "gridColumnNumber",
  "order",
  "position",
  "index",
] as const;
const LIST_RESPONSE_STYLE_WIDTH_KEYS = [
  "grid_column_width",
  "gridColumnWidth",
  "width",
] as const;
const LIST_RESPONSE_STYLE_NOTES_KEYS = [
  "grid_column_notes",
  "gridColumnNotes",
  "notes",
] as const;
const LIST_RESPONSE_STYLE_ALIGN_KEYS = [
  "grid_column_alignment",
  "gridColumnAlignment",
  "align",
  "alignment",
] as const;
const LIST_RESPONSE_STYLE_VISIBLE_KEYS = [
  "grid_column_visibility",
  "gridColumnVisibility",
  "visible",
  "isVisible",
] as const;
const LIST_RESPONSE_STYLE_FILTER_KEYS = [
  "grid_column_filter",
  "gridColumnFilter",
  "sortable",
  "isSortable",
] as const;
const LIST_RESPONSE_STYLE_COLOR_KEYS = [
  "grid_column_color",
  "gridColumnColor",
  "color",
] as const;
const INITIAL_FORM_STATE = {
  masterName: "",
  searchCode: "",
  masterAlias: "",
  masterShortName: "",
  masterDescription: "",
  position: "",
} as const;
type MasterTableRow = {
  __rowId: string | number;
  __recordId: string | number;
  __source: Record<string, unknown> | null;
  serialNo: number;
  masterId: string;
  masterCode: string;
  masterName: string;
  masterShort: string;
  masterAlias: string;
  masterActive: string;
  position: string;
};
export type CrudMasterTableRow = MasterTableRow;
type MasterColumnAccessor =
  | "serialNo"
  | "masterCode"
  | "masterName"
  | "masterAlias"
  | "masterShort"
  | "position"
  | "masterActive";
type MasterFormState = {
  masterName: string;
  searchCode: string;
  masterAlias: string;
  masterShortName: string;
  masterDescription: string;
  position: string;
};
type CrudMasterFormValues = MasterFormState & Record<string, string>;

type PaginationInfo = {
  totalEntries: number | null;
  currentPage: number | null;
  pageSize: number | null;
};
export type CrudMasterApiEndpoints = {
  list: string;
  getById: string;
  create: string;
  delete: string;
};
export type CrudMasterLookupKeys = {
  id: readonly string[];
  code: readonly string[];
  name: readonly string[];
  short: readonly string[];
  alias: readonly string[];
  active?: readonly string[];
  position?: readonly string[];
  description?: readonly string[];
  array?: readonly string[];
};
export type CrudMasterRequestPayloadKeys = {
  id: string;
  name: string;
  alias: string;
  short: string;
  description: string;
  sort: string;
};
export type CrudMasterTableColumnHeaders = {
  serialNo?: string;
  masterCode?: string;
  masterName?: string;
  masterAlias?: string;
  masterShort?: string;
  position?: string;
  masterActive?: string;
};
export type CrudMasterTableColumnLayout = {
  serialNo?: {
    width?: string;
    align?: ReusableTableColumn<Record<string, unknown>>["align"];
  };
  masterCode?: {
    width?: string;
    align?: ReusableTableColumn<Record<string, unknown>>["align"];
  };
  masterName?: {
    width?: string;
    align?: ReusableTableColumn<Record<string, unknown>>["align"];
  };
  masterAlias?: {
    width?: string;
    align?: ReusableTableColumn<Record<string, unknown>>["align"];
  };
  masterShort?: {
    width?: string;
    align?: ReusableTableColumn<Record<string, unknown>>["align"];
  };
  masterActive?: {
    width?: string;
    align?: ReusableTableColumn<Record<string, unknown>>["align"];
  };
};
type CrudMasterListResponseStyleColumn = {
  accessor: MasterColumnAccessor;
  styleIndex: number;
  fallbackHeader?: string;
};
export type CrudMasterAuditHistoryConfig = {
  screenName: string;
  getRecordId?: (row: MasterTableRow) => string | number | null;
  getDisplayName?: (row: MasterTableRow) => string | null;
};
export type CrudMasterPageController = {
  closeModal: () => void;
  openCreate: (options?: { values?: Record<string, string> }) => void;
  openUpdateById: (recordId: string | number) => Promise<void>;
};
export type CrudMasterPageProps = {
  title: string;
  entityLabel: string;
  entityLabelPlural: string;
  apiEndpoints: CrudMasterApiEndpoints;
  lookupKeys: CrudMasterLookupKeys;
  requestPayloadKeys: CrudMasterRequestPayloadKeys;
  requestPayloadExtra?: Record<string, unknown>;
  styles: Record<string, string>;
  listTitle?: string;
  createLabel?: string;
  codeColumnHeader?: string;
  nameColumnHeader?: string;
  tableColumnHeaders?: CrudMasterTableColumnHeaders;
  tableColumnLayout?: CrudMasterTableColumnLayout;
  customTableColumns?: ReusableTableColumn<MasterTableRow>[];
  toolbarContent?: ReactNode;
  listResponseStyleColumns?: CrudMasterListResponseStyleColumn[];
  listResponseStyleArrayKey?: string;
  nameFieldLabel?: string;
  nameFieldPlaceholder?: string;
  formTitle?: string;
  formDescription?: string;
  customFields?: ERPDynamicModalField[];
  createInitialValues?: Record<string, string>;
  modalPanelStyle?: CSSProperties;
  modalFormGridColumns?: number;
  modalFormDenseGrid?: boolean;
  modalStackLabels?: boolean;
  modalSectionNavigationMode?: "accordion" | "tabs";
  modalHideFieldHelperText?: boolean;
  modalHideFieldErrorText?: boolean;
  modalFocusFirstInvalidFieldOnValidationError?: boolean;
  modalEnableArrowKeyFieldNavigation?: boolean;
  auditHistory?: CrudMasterAuditHistoryConfig;
  gridDetailId?: number;
  gridTableName?: string;
  gridTableNameAliases?: readonly string[];
  getByIdMethod?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  buildListQuery?: (params: {
    searchTerm: string;
    currentPage: number;
    pageSize: number;
  }) => Record<string, string>;
  listStateResetKey?: string | number | null;
  buildGetByIdRequest?: (params: {
    recordId: string | number;
    action: "view" | "update";
    rowSource: Record<string, unknown> | null;
  }) => {
    url?: string;
    query?: Record<string, string>;
    body?: Record<string, unknown>;
  };
  mapFormValues?: (params: {
    source: Record<string, unknown> | null;
    defaults: MasterFormState;
  }) => Record<string, string>;
  augmentDetailSource?: (params: {
    recordId: string | number;
    action: "view" | "update";
    source: Record<string, unknown> | null;
    rowSource: Record<string, unknown> | null;
  }) =>
    | Record<string, unknown>
    | null
    | Promise<Record<string, unknown> | null>;
  buildRequestPayload?: (params: {
    values: CrudMasterFormValues;
    shouldUpdate: boolean;
    editingItemId: string | number | null;
    files: Record<string, File | null>;
    sectionExpandedState: Record<string, boolean>;
  }) => Record<string, unknown> | Promise<Record<string, unknown>>;
  afterSubmitSuccess?: (params: {
    response: unknown;
    payload: Record<string, unknown>;
    values: CrudMasterFormValues;
    shouldUpdate: boolean;
    editingItemId: string | number | null;
    files: Record<string, File | null>;
    sectionExpandedState: Record<string, boolean>;
  }) => void | Promise<void>;
  afterDeleteSuccess?: (params: {
    deleteId: string | number;
    rowSource: Record<string, unknown> | null;
  }) => void | Promise<void>;
  onCrudControllerReady?: (
    controller: CrudMasterPageController | null,
  ) => void;
  hideListPage?: boolean;
  onModalOpenChange?: (open: boolean, variantKey: string | null) => void;
};
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
function toDisplayValue(value: unknown): string {
  if (value === undefined || value === null) {
    return "";
  }
  if (typeof value === "string") {
    return value.trim();
  }
  if (
    typeof value === "number" ||
    typeof value === "bigint" ||
    typeof value === "boolean"
  ) {
    return String(value);
  }
  if (typeof value === "object") {
    const nestedValue = value as Record<string, unknown>;
    const nested =
      nestedValue.id ??
      nestedValue._id ??
      nestedValue.value ??
      nestedValue.code ??
      nestedValue.name ??
      nestedValue.label;
    if (
      typeof nested === "string" ||
      typeof nested === "number" ||
      typeof nested === "bigint" ||
      typeof nested === "boolean"
    ) {
      return String(nested);
    }
  }
  return "";
}
function toNonNegativeInt(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    const normalized = Math.floor(value);
    return normalized >= 0 ? normalized : null;
  }
  if (typeof value === "string") {
    const parsed = Number.parseInt(value.trim(), 10);
    if (Number.isFinite(parsed) && parsed >= 0) {
      return parsed;
    }
  }
  return null;
}
function toPositiveInt(value: unknown): number | null {
  const normalized = toNonNegativeInt(value);
  if (normalized === null || normalized < 1) {
    return null;
  }
  return normalized;
}
function findPaginationNumber(
  candidates: Record<string, unknown>[],
  keys: readonly string[],
  allowZero: boolean,
): number | null {
  for (const candidate of candidates) {
    for (const key of keys) {
      const value = candidate[key];
      const normalized = allowZero
        ? toNonNegativeInt(value)
        : toPositiveInt(value);
      if (normalized !== null) {
        return normalized;
      }
    }
  }

  return null;
}

function extractRows(
  payload: unknown,
  arrayKeys: readonly string[],
): unknown[] {
  if (Array.isArray(payload)) {
    return payload;
  }

  if (!payload || typeof payload !== "object") {
    return [];
  }

  const objectPayload = payload as Record<string, unknown>;

  for (const key of arrayKeys) {
    const value = objectPayload[key];

    if (Array.isArray(value)) {
      return value;
    }

    if (value && typeof value === "object") {
      const nestedObject = value as Record<string, unknown>;

      for (const nestedKey of arrayKeys) {
        const nestedValue = nestedObject[nestedKey];
        if (Array.isArray(nestedValue)) {
          return nestedValue;
        }
      }

      const nestedArray = Object.values(nestedObject).find((entry) =>
        Array.isArray(entry),
      );
      if (Array.isArray(nestedArray)) {
        return nestedArray;
      }
    }
  }

  const firstArray = Object.values(objectPayload).find((value) =>
    Array.isArray(value),
  );
  return Array.isArray(firstArray) ? firstArray : [];
}

function extractPaginationInfo(payload: unknown): PaginationInfo {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return {
      totalEntries: null,
      currentPage: null,
      pageSize: null,
    };
  }

  const root = payload as Record<string, unknown>;
  const candidates: Record<string, unknown>[] = [root];

  for (const key of PAGINATION_CONTAINER_KEYS) {
    const value = root[key];
    if (value && typeof value === "object" && !Array.isArray(value)) {
      candidates.push(value as Record<string, unknown>);
    }
  }

  if (root.data && typeof root.data === "object" && !Array.isArray(root.data)) {
    candidates.push(root.data as Record<string, unknown>);
  }

  return {
    totalEntries: findPaginationNumber(candidates, TOTAL_ENTRIES_KEYS, true),
    currentPage: findPaginationNumber(candidates, CURRENT_PAGE_KEYS, false),
    pageSize: findPaginationNumber(candidates, PAGE_SIZE_KEYS, false),
  };
}

function buildMasterRows(
  payload: unknown,
  serialOffset: number,
  lookupKeys: CrudMasterLookupKeys,
): MasterTableRow[] {
  const activeKeys = lookupKeys.active ?? DEFAULT_ACTIVE_KEYS;
  const positionKeys = lookupKeys.position ?? DEFAULT_POSITION_KEYS;

  return extractRows(payload, lookupKeys.array ?? DEFAULT_ARRAY_KEYS).map(
    (item, index) => {
      const serialNo = serialOffset + index + 1;

      if (item && typeof item === "object" && !Array.isArray(item)) {
        const row = item as Record<string, unknown>;
        const idValue = getFirstDefinedValue(row, lookupKeys.id);
        const codeValue = getFirstDefinedValue(row, lookupKeys.code);
        const nameValue = getFirstDefinedValue(row, lookupKeys.name);
        const shortValue = getFirstDefinedValue(row, lookupKeys.short);
        const aliasValue = getFirstDefinedValue(row, lookupKeys.alias);
        const activeValue = getFirstDefinedValue(row, activeKeys);
        const positionValue = getFirstDefinedValue(row, positionKeys);

        const preferredKey =
          idValue ?? row.id ?? row._id ?? row.code ?? serialNo;
        const rowId =
          typeof preferredKey === "string" || typeof preferredKey === "number"
            ? preferredKey
            : serialNo;

        return {
          __rowId: rowId,
          __recordId: rowId,
          __source: row,
          serialNo,
          masterId: toDisplayValue(idValue) || String(serialNo),
          masterCode: toDisplayValue(codeValue),
          masterName: toDisplayValue(nameValue),
          masterShort: toDisplayValue(shortValue),
          masterAlias: toDisplayValue(aliasValue),
          masterActive: toDisplayValue(activeValue),
          position: toDisplayValue(positionValue),
        };
      }

      return {
        __rowId: serialNo,
        __recordId: serialNo,
        __source: null,
        serialNo,
        masterId: String(serialNo),
        masterCode: "",
        masterName: toDisplayValue(item),
        masterShort: "",
        masterAlias: "",
        masterActive: "",
        position: "",
      };
    },
  );
}

function mapRowToFormState(
  row: MasterTableRow,
  lookupKeys: CrudMasterLookupKeys,
): MasterFormState {
  const descriptionKeys = lookupKeys.description ?? DEFAULT_DESCRIPTION_KEYS;
  const positionKeys = lookupKeys.position ?? DEFAULT_POSITION_KEYS;

  if (!row.__source) {
    return {
      masterName: row.masterName,
      searchCode: row.masterCode,
      masterAlias: row.masterAlias,
      masterShortName: row.masterShort,
      masterDescription: "",
      position: row.position,
    };
  }

  const source = row.__source;
  return {
    masterName:
      toDisplayValue(getFirstDefinedValue(source, lookupKeys.name)) ||
      row.masterName,
    searchCode:
      toDisplayValue(getFirstDefinedValue(source, lookupKeys.code)) ||
      row.masterCode,
    masterAlias:
      toDisplayValue(getFirstDefinedValue(source, lookupKeys.alias)) ||
      row.masterAlias,
    masterShortName:
      toDisplayValue(getFirstDefinedValue(source, lookupKeys.short)) ||
      row.masterShort,
    masterDescription: toDisplayValue(
      getFirstDefinedValue(source, descriptionKeys),
    ),
    position:
      toDisplayValue(getFirstDefinedValue(source, positionKeys)) ||
      row.position,
  };
}

function createFallbackRowFromSource(
  recordId: string | number,
  source: Record<string, unknown> | null,
  lookupKeys: CrudMasterLookupKeys,
): MasterTableRow {
  return {
    __rowId: String(recordId),
    __recordId: recordId,
    __source: source,
    serialNo: 0,
    masterId:
      source
        ? toDisplayValue(getFirstDefinedValue(source, lookupKeys.id))
        : String(recordId),
    masterCode: source
      ? toDisplayValue(getFirstDefinedValue(source, lookupKeys.code))
      : "",
    masterName: source
      ? toDisplayValue(getFirstDefinedValue(source, lookupKeys.name))
      : "",
    masterShort: source
      ? toDisplayValue(getFirstDefinedValue(source, lookupKeys.short))
      : "",
    masterAlias: source
      ? toDisplayValue(getFirstDefinedValue(source, lookupKeys.alias))
      : "",
    masterActive: source
      ? toDisplayValue(
          getFirstDefinedValue(source, lookupKeys.active ?? DEFAULT_ACTIVE_KEYS),
        )
      : "",
    position: source
      ? toDisplayValue(
          getFirstDefinedValue(source, lookupKeys.position ?? DEFAULT_POSITION_KEYS),
        )
      : "",
  };
}

function extractDetailSource(payload: unknown): Record<string, unknown> | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return null;
  }

  const objectPayload = payload as Record<string, unknown>;
  const nestedData = objectPayload.data;

  if (
    nestedData &&
    typeof nestedData === "object" &&
    !Array.isArray(nestedData)
  ) {
    return nestedData as Record<string, unknown>;
  }

  return objectPayload;
}

function mergeRowWithDetail(
  row: MasterTableRow,
  source: Record<string, unknown>,
  lookupKeys: CrudMasterLookupKeys,
): MasterTableRow {
  const idValue = getFirstDefinedValue(source, lookupKeys.id);
  const activeKeys = lookupKeys.active ?? DEFAULT_ACTIVE_KEYS;
  const positionKeys = lookupKeys.position ?? DEFAULT_POSITION_KEYS;

  const recordId =
    typeof idValue === "string" || typeof idValue === "number"
      ? idValue
      : row.__recordId;

  return {
    ...row,
    __recordId: recordId,
    __source: source,
    masterId: toDisplayValue(idValue) || row.masterId,
    masterCode:
      toDisplayValue(getFirstDefinedValue(source, lookupKeys.code)) ||
      row.masterCode,
    masterName:
      toDisplayValue(getFirstDefinedValue(source, lookupKeys.name)) ||
      row.masterName,
    masterShort:
      toDisplayValue(getFirstDefinedValue(source, lookupKeys.short)) ||
      row.masterShort,
    masterAlias:
      toDisplayValue(getFirstDefinedValue(source, lookupKeys.alias)) ||
      row.masterAlias,
    masterActive:
      toDisplayValue(getFirstDefinedValue(source, activeKeys)) ||
      row.masterActive,
    position:
      toDisplayValue(getFirstDefinedValue(source, positionKeys)) ||
      row.position,
  };
}

function resolveRecordId(
  row: MasterTableRow,
  idKeys: readonly string[],
): string | number {
  if (row.__source) {
    const sourceId = getFirstDefinedValue(row.__source, idKeys);

    if (typeof sourceId === "string" || typeof sourceId === "number") {
      return sourceId;
    }

    const displayId = toDisplayValue(sourceId);
    if (displayId) {
      return displayId;
    }
  }

  return row.__recordId;
}

function resolveAuditHistoryRecordId(row: MasterTableRow): string | number | null {
  if (typeof row.__recordId === "string" || typeof row.__recordId === "number") {
    return row.__recordId;
  }

  return null;
}

function resolveAuditHistoryDisplayName(row: MasterTableRow): string | null {
  if (row.__source) {
    return resolveRecordHistoryDisplayName(
      row.masterName,
      row.masterCode,
      row.masterAlias,
      row.masterShort,
      row.masterId,
      row.__source.name,
      row.__source.title,
      row.__source.label,
      row.__source.code,
    );
  }

  return resolveRecordHistoryDisplayName(
    row.masterName,
    row.masterCode,
    row.masterAlias,
    row.masterShort,
    row.masterId,
  );
}

function toSafePageNumber(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : DEFAULT_PAGE;
}

function toSafePageSize(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : DEFAULT_PAGE_SIZE;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function toBoolean(value: unknown): boolean | null {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "number") {
    if (value === 1) {
      return true;
    }
    if (value === 0) {
      return false;
    }
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

function normalizeColumnToken(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9_]+/g, "");
}

function resolveNumericId(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.floor(value);
  }

  if (typeof value === "string") {
    const normalized = value.trim();
    if (!normalized) {
      return null;
    }

    const parsed = Number.parseInt(normalized, 10);
    return Number.isFinite(parsed) ? parsed : null;
  }

  if (typeof value === "bigint") {
    return Number(value);
  }

  return null;
}

type ResolvedGridDetails = {
  gridId: number | null;
  gridName: string | null;
};

function resolveGridDetailsByTableName(
  payload: unknown,
  tableNames: readonly string[],
): ResolvedGridDetails {
  const rows = extractRows(payload, DEFAULT_ARRAY_KEYS);

  for (const row of rows) {
    if (!row || typeof row !== "object" || Array.isArray(row)) {
      continue;
    }

    const source = row as Record<string, unknown>;
    const gridId = resolveNumericId(getFirstDefinedValue(source, GRID_DETAIL_ID_KEYS));
    if (gridId === null) {
      continue;
    }

    const gridSql = toDisplayValue(getFirstDefinedValue(source, GRID_DETAIL_SQL_KEYS)).toLowerCase();
    if (!gridSql || tableNames.some((tableName) => gridSql.includes(tableName))) {
      const gridName = toDisplayValue(
        getFirstDefinedValue(source, GRID_DETAIL_NAME_KEYS),
      );
      return {
        gridId,
        gridName: gridName || null,
      };
    }
  }

  for (const row of rows) {
    if (!row || typeof row !== "object" || Array.isArray(row)) {
      continue;
    }

    const source = row as Record<string, unknown>;
    const gridId = resolveNumericId(getFirstDefinedValue(source, GRID_DETAIL_ID_KEYS));
    if (gridId !== null) {
      const gridName = toDisplayValue(
        getFirstDefinedValue(source, GRID_DETAIL_NAME_KEYS),
      );
      return {
        gridId,
        gridName: gridName || null,
      };
    }
  }

  return {
    gridId: null,
    gridName: null,
  };
}

function extractGridDetailSource(payload: unknown): Record<string, unknown> | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return null;
  }

  const source = payload as Record<string, unknown>;
  const nestedData = source.data;
  if (nestedData && typeof nestedData === "object" && !Array.isArray(nestedData)) {
    return nestedData as Record<string, unknown>;
  }

  return source;
}

function resolveGridDetailsByIdPayload(
  payload: unknown,
  fallbackGridId: number,
): ResolvedGridDetails {
  const source = extractGridDetailSource(payload);
  if (!source) {
    return {
      gridId: fallbackGridId,
      gridName: null,
    };
  }

  const gridId =
    resolveNumericId(getFirstDefinedValue(source, GRID_DETAIL_ID_KEYS)) ?? fallbackGridId;
  const gridName = toDisplayValue(getFirstDefinedValue(source, GRID_DETAIL_NAME_KEYS));

  return {
    gridId,
    gridName: gridName || null,
  };
}

function normalizeListStyleOrder(value: unknown, fallbackOrder: number): number {
  const normalized = toNonNegativeInt(value);
  return normalized ?? fallbackOrder;
}

function normalizeListStyleWidth(value: unknown): string | undefined {
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

function normalizeListStyleAlign(
  value: unknown,
): ReusableTableColumn<Record<string, unknown>>["align"] | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const normalized = value.trim().toLowerCase();
  if (normalized === "left" || normalized === "center" || normalized === "right") {
    return normalized;
  }

  return undefined;
}

function extractListResponseStyleRows(
  payload: unknown,
  styleArrayKey: string,
): Record<string, unknown>[] {
  if (!isRecord(payload)) {
    return [];
  }

  const candidates: unknown[] = [payload[styleArrayKey]];
  if (isRecord(payload.data)) {
    candidates.push(payload.data[styleArrayKey]);
  }

  const styleRows = candidates.find((candidate) => Array.isArray(candidate));
  if (!Array.isArray(styleRows)) {
    return [];
  }

  return styleRows
    .filter(isRecord)
    .sort(
      (left, right) =>
        normalizeListStyleOrder(
          getFirstDefinedValue(left, LIST_RESPONSE_STYLE_ORDER_KEYS),
          Number.MAX_SAFE_INTEGER,
        ) -
        normalizeListStyleOrder(
          getFirstDefinedValue(right, LIST_RESPONSE_STYLE_ORDER_KEYS),
          Number.MAX_SAFE_INTEGER,
        ),
    );
}

type BuildMasterColumnArgs = {
  accessor: MasterColumnAccessor;
  title: string;
  codeColumnHeader?: string;
  nameColumnHeader?: string;
  tableColumnHeaders?: CrudMasterTableColumnHeaders;
  tableColumnLayout?: CrudMasterTableColumnLayout;
  header?: ReactNode;
  width?: string;
  align?: ReusableTableColumn<Record<string, unknown>>["align"];
  sortable?: boolean;
};

function buildMasterColumn({
  accessor,
  title,
  codeColumnHeader,
  nameColumnHeader,
  tableColumnHeaders,
  tableColumnLayout,
  header,
  width,
  align,
  sortable,
}: BuildMasterColumnArgs): ReusableTableColumn<MasterTableRow> {
  if (accessor === "serialNo") {
    return {
      key: "serialNo",
      header: header ?? tableColumnHeaders?.serialNo ?? "S.No",
      accessor: "serialNo",
      align: align ?? tableColumnLayout?.serialNo?.align,
      width: width ?? tableColumnLayout?.serialNo?.width,
      sortable: sortable ?? false,
    };
  }

  if (accessor === "masterCode") {
    return {
      key: "masterCode",
      header:
        header ??
        tableColumnHeaders?.masterCode ??
        codeColumnHeader ??
        `${title} Code`,
      accessor: "masterCode",
      align: align ?? tableColumnLayout?.masterCode?.align,
      width: width ?? tableColumnLayout?.masterCode?.width,
      sortable,
    };
  }

  if (accessor === "masterName") {
    return {
      key: "masterName",
      header:
        header ??
        tableColumnHeaders?.masterName ??
        nameColumnHeader ??
        `${title} Name`,
      accessor: "masterName",
      align: align ?? tableColumnLayout?.masterName?.align,
      width: width ?? tableColumnLayout?.masterName?.width,
      sortable,
    };
  }

  if (accessor === "masterAlias") {
    return {
      key: "masterAlias",
      header: header ?? tableColumnHeaders?.masterAlias ?? "Alias",
      accessor: "masterAlias",
      align: align ?? tableColumnLayout?.masterAlias?.align,
      width: width ?? tableColumnLayout?.masterAlias?.width,
      sortable,
    };
  }

  if (accessor === "masterShort") {
    return {
      key: "masterShort",
      header: header ?? tableColumnHeaders?.masterShort ?? "Short Name",
      accessor: "masterShort",
      align: align ?? tableColumnLayout?.masterShort?.align,
      width: width ?? tableColumnLayout?.masterShort?.width,
      sortable,
    };
  }

  if (accessor === "position") {
    return {
      key: "position",
      header: header ?? tableColumnHeaders?.position ?? "Position",
      accessor: "position",
      sortable,
    };
  }

  return {
    key: "masterActive",
    header: header ?? tableColumnHeaders?.masterActive ?? "Status",
    accessor: "masterActive",
    align: align ?? tableColumnLayout?.masterActive?.align,
    width: width ?? tableColumnLayout?.masterActive?.width,
    sortable,
  };
}

function buildMasterFallbackColumns(
  title: string,
  codeColumnHeader: string | undefined,
  nameColumnHeader: string | undefined,
  tableColumnHeaders: CrudMasterTableColumnHeaders | undefined,
  tableColumnLayout: CrudMasterTableColumnLayout | undefined,
): ReusableTableColumn<MasterTableRow>[] {
  return [
    buildMasterColumn({
      accessor: "serialNo",
      title,
      codeColumnHeader,
      nameColumnHeader,
      tableColumnHeaders,
      tableColumnLayout,
    }),
    buildMasterColumn({
      accessor: "masterCode",
      title,
      codeColumnHeader,
      nameColumnHeader,
      tableColumnHeaders,
      tableColumnLayout,
    }),
    buildMasterColumn({
      accessor: "masterName",
      title,
      codeColumnHeader,
      nameColumnHeader,
      tableColumnHeaders,
      tableColumnLayout,
    }),
    buildMasterColumn({
      accessor: "masterShort",
      title,
      codeColumnHeader,
      nameColumnHeader,
      tableColumnHeaders,
      tableColumnLayout,
    }),
    buildMasterColumn({
      accessor: "masterActive",
      title,
      codeColumnHeader,
      nameColumnHeader,
      tableColumnHeaders,
      tableColumnLayout,
    }),
  ];
}

function resolveMasterAccessorFromGridColumn(
  column: GridColumnConfig,
  lookupKeys: CrudMasterLookupKeys,
): MasterColumnAccessor | null {
  const candidates = [column.accessorKey, column.key, column.header];
  const activeKeys = lookupKeys.active ?? DEFAULT_ACTIVE_KEYS;
  const positionKeys = lookupKeys.position ?? DEFAULT_POSITION_KEYS;
  const normalizedCodeKeys = new Set(lookupKeys.code.map(normalizeColumnToken));
  const normalizedNameKeys = new Set(lookupKeys.name.map(normalizeColumnToken));
  const normalizedShortKeys = new Set(lookupKeys.short.map(normalizeColumnToken));
  const normalizedAliasKeys = new Set(lookupKeys.alias.map(normalizeColumnToken));
  const normalizedActiveKeys = new Set(activeKeys.map(normalizeColumnToken));
  const normalizedPositionKeys = new Set(positionKeys.map(normalizeColumnToken));

  for (const candidate of candidates) {
    if (!candidate) {
      continue;
    }

    const normalized = normalizeColumnToken(candidate);
    if (!normalized) {
      continue;
    }

    if (
      normalized === "sno" ||
      normalized === "srno" ||
      normalized === "serialno" ||
      normalized === "serialnumber"
    ) {
      return "serialNo";
    }

    if (
      normalized === "status" ||
      normalized === "active" ||
      normalized === "isactive" ||
      normalized === "is_active" ||
      normalizedActiveKeys.has(normalized)
    ) {
      return "masterActive";
    }

    if (
      normalized === "position" ||
      normalized === "sort" ||
      normalized === "order" ||
      normalizedPositionKeys.has(normalized)
    ) {
      return "position";
    }

    if (
      normalized === "short" ||
      normalized === "shortname" ||
      normalized === "short_name" ||
      normalizedShortKeys.has(normalized)
    ) {
      return "masterShort";
    }

    if (
      normalized === "name" ||
      normalized.endsWith("name") ||
      normalizedNameKeys.has(normalized)
    ) {
      return "masterName";
    }

    if (
      normalized === "code" ||
      normalized.endsWith("code") ||
      normalizedCodeKeys.has(normalized)
    ) {
      return "masterCode";
    }

    if (
      normalized === "alias" ||
      normalized.endsWith("alias") ||
      normalizedAliasKeys.has(normalized)
    ) {
      return "masterAlias";
    }

    const compact = normalized.replace(/_/g, "");
    if (!compact) {
      continue;
    }
    if (
      normalizedCodeKeys.has(compact) ||
      compact.endsWith("code")
    ) {
      return "masterCode";
    }
    if (normalizedAliasKeys.has(compact) || compact.endsWith("alias")) {
      return "masterAlias";
    }
    if (
      normalizedNameKeys.has(compact) ||
      compact.endsWith("name")
    ) {
      return "masterName";
    }
    if (normalizedShortKeys.has(compact) || compact.includes("short")) {
      return "masterShort";
    }
    if (normalizedActiveKeys.has(compact) || compact.includes("active")) {
      return "masterActive";
    }
    if (normalizedPositionKeys.has(compact) || compact.includes("sort")) {
      return "position";
    }
  }

  return null;
}

function buildColumnsFromGridColumns(
  gridColumns: GridColumnConfig[],
  lookupKeys: CrudMasterLookupKeys,
  fallbackColumns: ReusableTableColumn<MasterTableRow>[],
): ReusableTableColumn<MasterTableRow>[] {
  const visibleColumns = gridColumns
    .filter((column) => column.visible)
    .sort((left, right) => left.order - right.order);

  const columns: ReusableTableColumn<MasterTableRow>[] = [];
  const seenAccessors = new Set<MasterColumnAccessor>();

  for (const column of visibleColumns) {
    const accessor = resolveMasterAccessorFromGridColumn(column, lookupKeys);
    if (!accessor || seenAccessors.has(accessor)) {
      continue;
    }
    seenAccessors.add(accessor);

    columns.push({
      key: normalizeColumnToken(column.key || column.accessorKey || column.header || accessor),
      header: column.header,
      accessor,
      align: column.align,
      width: column.width,
      sortable: column.sortable ?? accessor !== "serialNo",
      headerStyle: column.color ? { backgroundColor: column.color } : undefined,
      cellStyle: column.color ? { backgroundColor: column.color } : undefined,
    });
  }

  if (columns.length === 0) {
    return fallbackColumns;
  }

  const serialIndex = columns.findIndex((column) => column.accessor === "serialNo");
  if (serialIndex < 0) {
    const serialFallback = fallbackColumns.find((column) => column.accessor === "serialNo");
    if (serialFallback) {
      columns.unshift(serialFallback);
    }
    return columns;
  }

  if (serialIndex > 0) {
    const [serialColumn] = columns.splice(serialIndex, 1);
    columns.unshift({
      ...serialColumn,
      accessor: "serialNo",
      sortable: false,
    });
  }

  return columns;
}

function buildColumnsFromListResponseStyles(
  payload: unknown,
  styleArrayKey: string,
  styleColumns: CrudMasterListResponseStyleColumn[],
  title: string,
  codeColumnHeader: string | undefined,
  nameColumnHeader: string | undefined,
  tableColumnHeaders: CrudMasterTableColumnHeaders | undefined,
  tableColumnLayout: CrudMasterTableColumnLayout | undefined,
): ReusableTableColumn<MasterTableRow>[] {
  const styleRows = extractListResponseStyleRows(payload, styleArrayKey);
  if (styleRows.length === 0) {
    return [];
  }

  const columns: ReusableTableColumn<MasterTableRow>[] = [];
  const seenAccessors = new Set<MasterColumnAccessor>();

  for (const styleColumn of styleColumns) {
    const styleRow = styleRows[styleColumn.styleIndex];
    if (!styleRow || seenAccessors.has(styleColumn.accessor)) {
      continue;
    }

    const isVisible = toBoolean(
      getFirstDefinedValue(styleRow, LIST_RESPONSE_STYLE_VISIBLE_KEYS),
    );
    if (isVisible === false) {
      continue;
    }

    seenAccessors.add(styleColumn.accessor);
    columns.push(
      buildMasterColumn({
        accessor: styleColumn.accessor,
        title,
        codeColumnHeader,
        nameColumnHeader,
        tableColumnHeaders,
        tableColumnLayout,
        header:
          toDisplayValue(
            getFirstDefinedValue(styleRow, LIST_RESPONSE_STYLE_HEADER_KEYS),
          ) || styleColumn.fallbackHeader,
        width: normalizeListStyleWidth(
          getFirstDefinedValue(styleRow, LIST_RESPONSE_STYLE_WIDTH_KEYS),
        ),
        align: normalizeListStyleAlign(
          getFirstDefinedValue(styleRow, LIST_RESPONSE_STYLE_ALIGN_KEYS),
        ),
        sortable: styleColumn.accessor === "serialNo" ? false : true,
      }),
    );
  }

  if (columns.length === 0) {
    return [];
  }

  if (!columns.some((column) => column.accessor === "serialNo")) {
    columns.unshift(
      buildMasterColumn({
        accessor: "serialNo",
        title,
        codeColumnHeader,
        nameColumnHeader,
        tableColumnHeaders,
        tableColumnLayout,
      }),
    );
  }

  return columns;
}

function normalizeListResponseStyleGridColumn(
  row: Record<string, unknown>,
  fallbackOrder: number,
): GridColumnConfig | null {
  const header = toDisplayValue(
    getFirstDefinedValue(row, LIST_RESPONSE_STYLE_HEADER_KEYS),
  );
  if (!header) {
    return null;
  }

  const accessorKey =
    toDisplayValue(getFirstDefinedValue(row, LIST_RESPONSE_STYLE_NOTES_KEYS)) ||
    header;
  const visible = toBoolean(
    getFirstDefinedValue(row, LIST_RESPONSE_STYLE_VISIBLE_KEYS),
  );
  const sortable = toBoolean(
    getFirstDefinedValue(row, LIST_RESPONSE_STYLE_FILTER_KEYS),
  );
  const color =
    toDisplayValue(getFirstDefinedValue(row, LIST_RESPONSE_STYLE_COLOR_KEYS)) ||
    undefined;

  return {
    key: accessorKey,
    accessorKey,
    header,
    order: normalizeListStyleOrder(
      getFirstDefinedValue(row, LIST_RESPONSE_STYLE_ORDER_KEYS),
      fallbackOrder,
    ),
    visible: visible ?? true,
    sortable: sortable ?? undefined,
    align: normalizeListStyleAlign(
      getFirstDefinedValue(row, LIST_RESPONSE_STYLE_ALIGN_KEYS),
    ),
    width: normalizeListStyleWidth(
      getFirstDefinedValue(row, LIST_RESPONSE_STYLE_WIDTH_KEYS),
    ),
    color,
  };
}

function buildColumnsFromDynamicListResponseStyles(
  payload: unknown,
  styleArrayKey: string,
  lookupKeys: CrudMasterLookupKeys,
  fallbackColumns: ReusableTableColumn<MasterTableRow>[],
): ReusableTableColumn<MasterTableRow>[] {
  const styleRows = extractListResponseStyleRows(payload, styleArrayKey);
  if (styleRows.length === 0) {
    return [];
  }

  const styleGridColumns = styleRows
    .map((row, index) => normalizeListResponseStyleGridColumn(row, index))
    .filter((column): column is GridColumnConfig => column !== null);

  if (styleGridColumns.length === 0) {
    return [];
  }

  return buildColumnsFromGridColumns(styleGridColumns, lookupKeys, fallbackColumns);
}

export default function CrudMasterPage({
  title,
  entityLabel,
  entityLabelPlural,
  apiEndpoints,
  lookupKeys,
  requestPayloadKeys,
  requestPayloadExtra,
  styles,
  listTitle,
  createLabel,
  codeColumnHeader,
  nameColumnHeader,
  tableColumnHeaders,
  tableColumnLayout,
  customTableColumns,
  toolbarContent,
  listResponseStyleColumns,
  listResponseStyleArrayKey,
  nameFieldLabel,
  nameFieldPlaceholder,
  formTitle,
  formDescription,
  customFields,
  createInitialValues,
  modalPanelStyle,
  modalFormGridColumns,
  modalFormDenseGrid,
  modalStackLabels,
  modalSectionNavigationMode,
  modalHideFieldHelperText,
  modalHideFieldErrorText,
  modalFocusFirstInvalidFieldOnValidationError,
  modalEnableArrowKeyFieldNavigation,
  auditHistory,
  gridDetailId,
  gridTableName,
  gridTableNameAliases,
  getByIdMethod,
  buildListQuery,
  listStateResetKey,
  buildGetByIdRequest,
  mapFormValues,
  augmentDetailSource,
  buildRequestPayload,
  afterSubmitSuccess,
  afterDeleteSuccess,
  onCrudControllerReady,
  hideListPage = false,
  onModalOpenChange,
}: CrudMasterPageProps) {
  const modalControllerRef = useRef<ERPDynamicModalController | null>(null);
  const [auditHistoryModal, setAuditHistoryModal] = useState<{
    displayName: string | null;
    recordPk: string;
    screenName: string;
  } | null>(null);

  const { getAll: getGridDetails } = useApi<unknown>(GRID_DETAILS_ENDPOINT);
  const { getAll: getGridDetailById } = useApi<unknown>(GRID_DETAIL_GET_ENDPOINT);
  const {
    list: {
      data,
      error,
      loading,
      currentPage,
      pageSize,
      searchTerm,
      totalEntries,
      setCurrentPage,
      setPageSize,
      setSearchTerm,
      loadRecords,
    },
    details: {
      run: getById,
      loading: detailsLoading,
      error: detailsError,
      reset: resetDetailsState,
    },
    save: {
      run: upsertRecord,
      loading: saveLoading,
      error: saveError,
      reset: resetSaveState,
    },
    remove: {
      run: deleteRecord,
      loading: deleteLoading,
      error: deleteError,
    },
  } = useMasterCrud({
    apiEndpoints,
    listArrayKeys: lookupKeys.array ?? DEFAULT_ARRAY_KEYS,
    getByIdMethod: getByIdMethod ?? "GET",
    buildListQuery,
    debounceMs: DEBOUNCE_MS,
    defaultPage: DEFAULT_PAGE,
    defaultPageSize: DEFAULT_PAGE_SIZE,
  });
  const [gridId, setGridId] = useState<number | null>(null);
  const [gridDisplayName, setGridDisplayName] = useState<string | null>(null);
  const selectedGridId = gridId ?? -1;
  const {
    data: gridColumnsData,
    error: gridColumnsQueryError,
    isFetching: gridColumnsLoading,
    refetch: refetchGridColumns,
  } = useGetGridColumnsQuery(
    {
      gridId: selectedGridId,
      page: GRID_COLUMNS_PAGE,
      limit: GRID_COLUMNS_LIMIT,
    },
    {
      skip: gridId === null,
    },
  );
  const gridColumns = gridColumnsData ?? [];
  const gridColumnsError = getApiErrorMessage(gridColumnsQueryError);

  const normalizedGridTableNames = useMemo(() => {
    const base = gridTableName?.trim().toLowerCase();
    if (!base) {
      return [] as string[];
    }

    const merged = [
      base,
      ...(gridTableNameAliases ?? []),
    ]
      .map((name) => name.trim().toLowerCase())
      .filter(Boolean);

    return Array.from(new Set(merged));
  }, [gridTableName, gridTableNameAliases]);

  const configuredGridDetailId = useMemo(() => {
    if (typeof gridDetailId === "number" && Number.isFinite(gridDetailId)) {
      return Math.floor(gridDetailId);
    }

    return getConfiguredModuleGridId(gridTableName);
  }, [gridDetailId, gridTableName]);

  useEffect(() => {
    if (
      configuredGridDetailId === undefined &&
      normalizedGridTableNames.length === 0
    ) {
      setGridId(null);
      setGridDisplayName(null);
      return;
    }

    let mounted = true;

    void (async () => {
      try {
        const resolvedGrid =
          configuredGridDetailId !== undefined
            ? resolveGridDetailsByIdPayload(
                await getGridDetailById({
                  grid_id: String(configuredGridDetailId),
                }),
                configuredGridDetailId,
              )
            : resolveGridDetailsByTableName(
                await getGridDetails({
                  grid_status: "true",
                  search: normalizedGridTableNames[0],
                  page: "1",
                  limit: "20",
                }),
                normalizedGridTableNames,
              );

        if (!mounted) {
          return;
        }

        setGridId(resolvedGrid.gridId);
        setGridDisplayName(resolvedGrid.gridName);
      } catch {
        if (mounted) {
          setGridId(configuredGridDetailId ?? null);
          setGridDisplayName(null);
        }
      }
    })();

    return () => {
      mounted = false;
    };
  }, [
    configuredGridDetailId,
    getGridDetailById,
    getGridDetails,
    normalizedGridTableNames,
  ]);

  const effectiveTitle = useMemo(() => {
    const normalized = gridDisplayName?.trim();
    return normalized || title;
  }, [gridDisplayName, title]);

  const serialOffset = Math.max(0, (currentPage - 1) * pageSize);

  const rows = useMemo(
    () => buildMasterRows(data, serialOffset, lookupKeys),
    [data, lookupKeys, serialOffset],
  );

  const fallbackColumns = useMemo(
    () =>
      buildMasterFallbackColumns(
        effectiveTitle,
        codeColumnHeader,
        nameColumnHeader,
        tableColumnHeaders,
        tableColumnLayout,
      ),
    [
      codeColumnHeader,
      effectiveTitle,
      nameColumnHeader,
      tableColumnHeaders,
      tableColumnLayout,
    ],
  );

  const listResponseColumns = useMemo<ReusableTableColumn<MasterTableRow>[]>(
    () => {
      if (!listResponseStyleArrayKey) {
        return [];
      }

      if (listResponseStyleColumns && listResponseStyleColumns.length > 0) {
        return buildColumnsFromListResponseStyles(
          data,
          listResponseStyleArrayKey,
          listResponseStyleColumns,
          effectiveTitle,
          codeColumnHeader,
          nameColumnHeader,
          tableColumnHeaders,
          tableColumnLayout,
        );
      }

      return buildColumnsFromDynamicListResponseStyles(
        data,
        listResponseStyleArrayKey,
        lookupKeys,
        fallbackColumns,
      );
    },
    [
      codeColumnHeader,
      data,
      effectiveTitle,
      fallbackColumns,
      listResponseStyleArrayKey,
      listResponseStyleColumns,
      lookupKeys,
      nameColumnHeader,
      tableColumnHeaders,
      tableColumnLayout,
    ],
  );

  const columns = useMemo<ReusableTableColumn<MasterTableRow>[]>(
    () =>
      customTableColumns && customTableColumns.length > 0
        ? customTableColumns
        : listResponseColumns.length > 0
          ? listResponseColumns
          : normalizedGridTableNames.length > 0
            ? buildColumnsFromGridColumns(gridColumns, lookupKeys, fallbackColumns)
            : fallbackColumns,
    [
      customTableColumns,
      fallbackColumns,
      gridColumns,
      listResponseColumns,
      lookupKeys,
      normalizedGridTableNames.length,
    ],
  );

  const [selectedRowId, setSelectedRowId] = useState<string | number | null>(
    null,
  );
  const [editingItemId, setEditingItemId] = useState<string | number | null>(
    null,
  );
  const [pendingDeleteRow, setPendingDeleteRow] =
    useState<MasterTableRow | null>(null);
  const previousListStateResetKeyRef = useRef<string | number | null | undefined>(undefined);

  useEffect(() => {
    if (listStateResetKey === undefined) {
      previousListStateResetKeyRef.current = undefined;
      return;
    }

    if (previousListStateResetKeyRef.current === undefined) {
      previousListStateResetKeyRef.current = listStateResetKey;
      return;
    }

    if (previousListStateResetKeyRef.current !== listStateResetKey) {
      previousListStateResetKeyRef.current = listStateResetKey;
      setCurrentPage(DEFAULT_PAGE);
    }
  }, [listStateResetKey, setCurrentPage]);

  useEffect(() => {
    if (selectedRowId === null) {
      return;
    }

    if (!rows.some((row) => row.__rowId === selectedRowId)) {
      setSelectedRowId(null);
    }
  }, [rows, selectedRowId]);

  const pendingDeleteLabel = useMemo(() => {
    if (!pendingDeleteRow) {
      return "";
    }

    return (
      pendingDeleteRow.masterName ||
      pendingDeleteRow.masterCode ||
      pendingDeleteRow.masterId
    );
  }, [pendingDeleteRow]);

  const openCreateModal = useCallback((overrideValues?: Record<string, string>) => {
    resetSaveState();
    resetDetailsState();
    setEditingItemId(null);
    modalControllerRef.current?.openModal("master-create", {
      values: overrideValues ?? createInitialValues ?? INITIAL_FORM_STATE,
    });
  }, [createInitialValues, resetDetailsState, resetSaveState]);

  const openUpdateModalById = useCallback(
    async (
      recordId: string | number,
      rowSource: Record<string, unknown> | null = null,
    ) => {
      resetSaveState();
      resetDetailsState();
      setSelectedRowId(null);
      setEditingItemId(recordId);

      try {
        const request = buildGetByIdRequest?.({
          recordId,
          action: "update",
          rowSource,
        }) ?? {
          query: {
            [requestPayloadKeys.id]: String(recordId),
          },
        };

        const payload = await getById(request);
        const detailSource = extractDetailSource(payload);
        const supplementalSource =
          (await Promise.resolve(
            augmentDetailSource?.({
              recordId,
              action: "update",
              source: detailSource,
              rowSource,
            }),
          )) ?? null;
        const mergedSource =
          detailSource || rowSource || supplementalSource
            ? {
                ...(detailSource ?? rowSource ?? {}),
                ...(supplementalSource ?? {}),
              }
            : null;
        const detailRow = mergedSource
          ? mergeRowWithDetail(
              createFallbackRowFromSource(recordId, mergedSource, lookupKeys),
              mergedSource,
              lookupKeys,
            )
          : createFallbackRowFromSource(recordId, rowSource, lookupKeys);
        setEditingItemId(resolveRecordId(detailRow, lookupKeys.id));
        const defaultValues = mapRowToFormState(detailRow, lookupKeys);
        modalControllerRef.current?.openModal("master-update", {
          values: mapFormValues
            ? mapFormValues({
                source: detailRow.__source,
                defaults: defaultValues,
              })
            : defaultValues,
        });
      } catch {
        // Error UI is driven by detailsError from useApi.
      }
    },
    [
      augmentDetailSource,
      buildGetByIdRequest,
      getById,
      lookupKeys,
      mapFormValues,
      requestPayloadKeys.id,
      resetDetailsState,
      resetSaveState,
    ],
  );

  const openUpdateModalForRow = useCallback(
    (row: MasterTableRow) => {
      resetSaveState();
      resetDetailsState();
      setSelectedRowId(row.__rowId);
      const updateId = resolveRecordId(row, lookupKeys.id);
      setEditingItemId(updateId);

      void (async () => {
        try {
          const request = buildGetByIdRequest?.({
            recordId: updateId,
            action: "update",
            rowSource: row.__source,
          }) ?? {
            query: {
              [requestPayloadKeys.id]: String(updateId),
            },
          };

          const payload = await getById(request);
          const detailSource = extractDetailSource(payload);
          const supplementalSource =
            (await Promise.resolve(
              augmentDetailSource?.({
                recordId: updateId,
                action: "update",
                source: detailSource,
                rowSource: row.__source,
              }),
            )) ?? null;
          const mergedSource =
            detailSource || row.__source || supplementalSource
              ? {
                  ...(detailSource ?? row.__source ?? {}),
                  ...(supplementalSource ?? {}),
                }
              : null;
          const detailRow = mergedSource
            ? mergeRowWithDetail(row, mergedSource, lookupKeys)
            : row;
          setEditingItemId(resolveRecordId(detailRow, lookupKeys.id));
          const defaultValues = mapRowToFormState(detailRow, lookupKeys);
          modalControllerRef.current?.openModal("master-update", {
            values: mapFormValues
              ? mapFormValues({
                  source: detailRow.__source,
                  defaults: defaultValues,
                })
              : defaultValues,
          });
        } catch {
          // Error UI is driven by detailsError from useApi.
        }
      })();
    },
    [
      apiEndpoints.getById,
      buildGetByIdRequest,
      getById,
      lookupKeys,
      mapFormValues,
      augmentDetailSource,
      requestPayloadKeys.id,
      resetDetailsState,
      resetSaveState,
    ],
  );

  const crudController = useMemo<CrudMasterPageController>(
    () => ({
      closeModal: () => {
        modalControllerRef.current?.closeModal();
      },
      openCreate: (options) => {
        openCreateModal(options?.values);
      },
      openUpdateById: async (recordId) => {
        await openUpdateModalById(recordId);
      },
    }),
    [openCreateModal, openUpdateModalById],
  );

  useEffect(() => {
    onCrudControllerReady?.(crudController);
    return () => {
      onCrudControllerReady?.(null);
    };
  }, [crudController, onCrudControllerReady]);

  const openViewModalForRow = useCallback(
    (row: MasterTableRow) => {
      resetSaveState();
      resetDetailsState();
      setSelectedRowId(row.__rowId);
      setEditingItemId(null);
      const viewId = resolveRecordId(row, lookupKeys.id);

      void (async () => {
        try {
          const request = buildGetByIdRequest?.({
            recordId: viewId,
            action: "view",
            rowSource: row.__source,
          }) ?? {
            query: {
              [requestPayloadKeys.id]: String(viewId),
            },
          };

          const payload = await getById(request);
          const detailSource = extractDetailSource(payload);
          const supplementalSource =
            (await Promise.resolve(
              augmentDetailSource?.({
                recordId: viewId,
                action: "view",
                source: detailSource,
                rowSource: row.__source,
              }),
            )) ?? null;
          const mergedSource =
            detailSource || row.__source || supplementalSource
              ? {
                  ...(detailSource ?? row.__source ?? {}),
                  ...(supplementalSource ?? {}),
                }
              : null;
          const detailRow = mergedSource
            ? mergeRowWithDetail(row, mergedSource, lookupKeys)
            : row;
          const defaultValues = mapRowToFormState(detailRow, lookupKeys);
          modalControllerRef.current?.openModal("master-view", {
            values: mapFormValues
              ? mapFormValues({
                  source: detailRow.__source,
                  defaults: defaultValues,
                })
              : defaultValues,
          });
        } catch {
          // Error UI is driven by detailsError from useApi.
        }
      })();
    },
    [
      apiEndpoints.getById,
      buildGetByIdRequest,
      getById,
      lookupKeys,
      mapFormValues,
      augmentDetailSource,
      requestPayloadKeys.id,
      resetDetailsState,
      resetSaveState,
    ],
  );

  const handleModalSubmit = useCallback(
    async ({
      variantKey,
      values,
      files,
      sectionExpandedState,
    }: ERPDynamicModalSubmitPayload) => {
      if (variantKey === "master-view") {
        return;
      }

      const masterName = (values.masterName ?? "").trim();
      const searchCode = (values.searchCode ?? "").trim();
      const masterAlias = (values.masterAlias ?? "").trim();
      const masterShortName = (values.masterShortName ?? "").trim();
      const masterDescription = (values.masterDescription ?? "").trim();
      const parsedSort = Number.parseInt((values.position ?? "").trim(), 10);

      const sortValue = Number.isFinite(parsedSort) ? parsedSort : 0;
      const aliasValue = masterAlias || searchCode;
      const shortValue = masterShortName || searchCode || aliasValue;
      const shouldUpdate = variantKey === "master-update";

      const defaultPayload: Record<string, unknown> = {
        [requestPayloadKeys.name]: masterName,
        [requestPayloadKeys.alias]: aliasValue,
        [requestPayloadKeys.short]: shortValue,
        [requestPayloadKeys.description]: masterDescription,
        [requestPayloadKeys.sort]: sortValue,
        ...(requestPayloadExtra ?? {}),
        ...(shouldUpdate && editingItemId !== null
          ? { [requestPayloadKeys.id]: editingItemId }
          : {}),
      };

      const formValues: CrudMasterFormValues = {
        masterName,
        searchCode,
        masterAlias,
        masterShortName,
        masterDescription,
        position: values.position ?? "",
        ...values,
      };

      const payload = await Promise.resolve(
        buildRequestPayload?.({
          values: formValues,
          shouldUpdate,
          editingItemId,
          files,
          sectionExpandedState,
        }) ?? defaultPayload,
      );

      const response = await upsertRecord({ body: payload });
      await Promise.resolve(
        afterSubmitSuccess?.({
          response,
          payload,
          values: formValues,
          shouldUpdate,
          editingItemId,
          files,
          sectionExpandedState,
        }),
      );
      setEditingItemId(null);
      await loadRecords(searchTerm, currentPage, pageSize);
    },
    [
      currentPage,
      editingItemId,
      loadRecords,
      pageSize,
      requestPayloadExtra,
      requestPayloadKeys.alias,
      requestPayloadKeys.description,
      requestPayloadKeys.id,
      requestPayloadKeys.name,
      requestPayloadKeys.short,
      requestPayloadKeys.sort,
      searchTerm,
      upsertRecord,
      buildRequestPayload,
      afterSubmitSuccess,
    ],
  );

  const handleModalCancel = useCallback(() => {
    if (saveLoading) {
      return;
    }

    resetSaveState();
    resetDetailsState();
    setEditingItemId(null);
  }, [resetDetailsState, resetSaveState, saveLoading]);

  const handleDeleteRow = useCallback(
    (row: MasterTableRow) => {
      if (deleteLoading || saveLoading || detailsLoading) {
        return;
      }

      setPendingDeleteRow(row);
    },
    [deleteLoading, detailsLoading, saveLoading],
  );

  const handleDeleteCancel = useCallback(() => {
    if (deleteLoading) {
      return;
    }

    setPendingDeleteRow(null);
  }, [deleteLoading]);

  const handleDeleteConfirm = useCallback(() => {
    if (!pendingDeleteRow || deleteLoading || saveLoading || detailsLoading) {
      return;
    }

    void (async () => {
      try {
        const row = pendingDeleteRow;
        const deleteId = resolveRecordId(row, lookupKeys.id);

        await deleteRecord({
          query: {
            [requestPayloadKeys.id]: String(deleteId),
          },
        });

        setSelectedRowId((current) =>
          current === row.__rowId ? null : current,
        );
        if (editingItemId === deleteId) {
          setEditingItemId(null);
          modalControllerRef.current?.closeModal();
        }
        setPendingDeleteRow(null);
        await Promise.resolve(
          afterDeleteSuccess?.({
            deleteId,
            rowSource: row.__source,
          }),
        );
        await loadRecords(searchTerm, currentPage, pageSize);
      } catch {
        // Error UI is driven by deleteError from useApi.
      }
    })();
  }, [
    apiEndpoints.delete,
    currentPage,
    deleteLoading,
    deleteRecord,
    detailsLoading,
    editingItemId,
    loadRecords,
    lookupKeys.id,
    pageSize,
    pendingDeleteRow,
    requestPayloadKeys.id,
    saveLoading,
    searchTerm,
    afterDeleteSuccess,
  ]);

  const fields = useMemo<ERPDynamicModalField[]>(
    () =>
      customFields ?? [
        {
          name: "masterName",
          label: nameFieldLabel ?? `${title} Name`,
          required: true,
          placeholder: nameFieldPlaceholder ?? `Enter ${entityLabel} name`,
          validation: {
            minLength: 2,
            minLengthMessage: `${nameFieldLabel ?? `${title} Name`} must be at least 2 characters.`,
          },
        },
        {
          name: "searchCode",
          label: "Search Code",
          placeholder: "Code for quick search",
        },
        {
          name: "masterAlias",
          label: "Alias",
          placeholder: "Alternate name",
        },
        {
          name: "masterShortName",
          label: "Short Name",
          placeholder: "Short label for printouts",
        },
        {
          name: "position",
          label: "Position",
          type: "number",
          min: 0,
          step: 1,
          placeholder: "0",
          validation: {
            minMessage: "Position must be 0 or greater.",
          },
        },
        {
          name: "masterDescription",
          label: "Description",
          type: "textarea",
          placeholder: `Add notes about this ${entityLabel}`,
          colSpan: 2,
        },
      ],
    [customFields, entityLabel, nameFieldLabel, nameFieldPlaceholder, title],
  );

  const viewFields = useMemo<ERPDynamicModalField[]>(
    () =>
      fields.map((field) => ({
        ...field,
        disabled: true,
        required: false,
        validation: undefined,
      })),
    [fields],
  );

  const variants = useMemo<ERPDynamicModalVariant[]>(
    () => [
      {
        key: "master-view",
        cardTitle: `View ${effectiveTitle}`,
        cardDescription: `View selected ${entityLabel} details.`,
        cardButtonLabel: "View",
        modalTitle: `${effectiveTitle} Details`,
        modalDescription: `Read-only view of selected ${entityLabel} data.`,
        submitLabel: "Close",
        accent: "indigo",
        fields: viewFields,
      },
      {
        key: "master-create",
        cardTitle: `Create ${effectiveTitle}`,
        cardDescription: `Create a new ${entityLabel}.`,
        cardButtonLabel: "Create",
        modalTitle: `New ${effectiveTitle}`,
        modalDescription: `Configure ${entityLabel} details.`,
        submitLabel: saveLoading ? "Saving..." : "Save",
        accent: "blue",
        fields,
      },
      {
        key: "master-update",
        cardTitle: `Update ${effectiveTitle}`,
        cardDescription: `Update an existing ${entityLabel}.`,
        cardButtonLabel: "Update",
        modalTitle: `Edit ${effectiveTitle}`,
        modalDescription: `Update selected ${entityLabel} details.`,
        submitLabel: saveLoading ? "Updating..." : "Update",
        accent: "emerald",
        fields,
      },
    ],
    [effectiveTitle, entityLabel, fields, saveLoading, viewFields],
  );
  const handleRowUpdate = useCallback(
    (row: MasterTableRow) => {
      setSelectedRowId(row.__rowId);
      openUpdateModalForRow(row);
    },
    [openUpdateModalForRow],
  );

  const handleRowView = useCallback(
    (row: MasterTableRow) => {
      openViewModalForRow(row);
    },
    [openViewModalForRow],
  );

  const handleRowDelete = useCallback(
    (row: MasterTableRow) => {
      setSelectedRowId(row.__rowId);
      handleDeleteRow(row);
    },
    [handleDeleteRow],
  );

  const handleRowLogs = useCallback(
    (row: MasterTableRow) => {
      if (!auditHistory) {
        return;
      }

      const recordId =
        auditHistory.getRecordId?.(row) ?? resolveAuditHistoryRecordId(row);
      const normalizedRecordId =
        recordId === null || recordId === undefined ? "" : String(recordId).trim();
      if (!normalizedRecordId) {
        return;
      }

      setAuditHistoryModal({
        screenName: auditHistory.screenName,
        recordPk: normalizedRecordId,
        displayName:
          auditHistory.getDisplayName?.(row) ?? resolveAuditHistoryDisplayName(row),
      });
    },
    [auditHistory],
  );

  const handleSearchChange = useCallback((query: string) => {
    setCurrentPage(DEFAULT_PAGE);
    setSearchTerm(query);
  }, []);

  return (
    <>
      {!hideListPage ? (
        <main className={styles.page}>
          <div className={styles.viewport}>
            <div className={styles.board}>
              <section className={styles.content}>
                {error ? (
                  <div className={styles.errorBox}>
                    <p className={styles.errorText}>
                      Unable to load {entityLabel} data: {error}
                    </p>
                    <button
                      type="button"
                      className={styles.retryButton}
                      onClick={() =>
                        void loadRecords(searchTerm, currentPage, pageSize)
                      }
                    >
                      Retry
                    </button>
                  </div>
                ) : null}
                {deleteError ? (
                  <div className={styles.errorBox}>
                    <p className={styles.errorText}>
                      Unable to delete selected {entityLabel}: {deleteError}
                    </p>
                  </div>
                ) : null}
                {detailsError ? (
                  <div className={styles.errorBox}>
                    <p className={styles.errorText}>
                      Unable to load selected {entityLabel} details: {detailsError}
                    </p>
                  </div>
                ) : null}
                {normalizedGridTableNames.length > 0 && gridColumnsError ? (
                  <div className={styles.errorBox}>
                    <p className={styles.errorText}>
                      Unable to load table headers: {gridColumnsError}. Showing
                      default headers.
                    </p>
                    <button
                      type="button"
                      className={styles.retryButton}
                      onClick={() => {
                        if (gridId === null) {
                          return;
                        }
                        void refetchGridColumns();
                      }}
                      disabled={gridColumnsLoading || gridId === null}
                    >
                      {gridColumnsLoading ? "Loading..." : "Retry Headers"}
                    </button>
                  </div>
                ) : null}
                <ReusableTable
                  columns={columns}
                  rows={rows}
                  rowKey="__rowId"
                  title={
                    gridDisplayName
                      ? `${gridDisplayName} List`
                      : listTitle ?? `${title} List`
                  }
                  toolbarContent={toolbarContent}
                  minWidth="980px"
                  activeRowKey={selectedRowId}
                  onRowClick={(row) => setSelectedRowId(row.__rowId)}
                  onCreate={openCreateModal}
                  createLabel={createLabel ?? "Add"}
                  onView={handleRowView}
                  onUpdate={handleRowUpdate}
                  onDelete={handleRowDelete}
                  onLogs={auditHistory ? handleRowLogs : undefined}
                  isViewDisabled={() => saveLoading || detailsLoading}
                  isUpdateDisabled={() => saveLoading || detailsLoading}
                  isDeleteDisabled={() =>
                    deleteLoading || saveLoading || detailsLoading
                  }
                  isLogsDisabled={(row) => {
                    if (!auditHistory) {
                      return true;
                    }

                    const recordId =
                      auditHistory.getRecordId?.(row) ?? resolveAuditHistoryRecordId(row);
                    return recordId === null || recordId === undefined || `${recordId}`.trim().length === 0;
                  }}
                  actionsAsIcons
                  updateLabel="Update"
                  deleteLabel={deleteLoading ? "Deleting..." : "Delete"}
                  searchable
                  searchQuery={searchTerm}
                  onSearchQueryChange={handleSearchChange}
                  searchPlaceholder="Search..."
                  sortable
                  paginated
                  manualPagination
                  totalEntries={totalEntries}
                  currentPage={currentPage}
                  onCurrentPageChange={setCurrentPage}
                  pageSize={pageSize}
                  onPageSizeChange={setPageSize}
                  pageSizeOptions={[10, 20, 25, 50]}
                  fullViewHeight={false}
                  stickyHeader
                  emptyText={
                    loading
                      ? `Loading ${entityLabel} data...`
                      : `No ${entityLabel} data found`
                  }
                />
              </section>
            </div>
          </div>
        </main>
      ) : null}
      <ERPDynamicModalForm
        title={
          gridDisplayName
            ? `${gridDisplayName} Form`
            : formTitle ?? `${title} Form`
        }
        description={
          formDescription ?? `Create and update ${entityLabelPlural}.`
        }
        variants={variants}
        showDefaultCards={false}
        hideSectionHeader
        submitError={saveError}
        panelStyle={modalPanelStyle}
        formGridColumns={modalFormGridColumns}
        denseGrid={modalFormDenseGrid}
        stackLabels={modalStackLabels}
        sectionNavigationMode={modalSectionNavigationMode}
        hideFieldHelperText={modalHideFieldHelperText}
        hideFieldErrorText={modalHideFieldErrorText}
        focusFirstInvalidFieldOnValidationError={
          modalFocusFirstInvalidFieldOnValidationError
        }
        enableArrowKeyFieldNavigation={modalEnableArrowKeyFieldNavigation}
        onControllerReady={(controller) => {
          modalControllerRef.current = controller;
        }}
        onOpenChange={onModalOpenChange}
        onSubmit={handleModalSubmit}
        onCancel={handleModalCancel}
      />
      {!hideListPage ? (
        <DeleteConfirmModal
          isOpen={pendingDeleteRow !== null}
          itemName={pendingDeleteLabel}
          title={`Delete ${effectiveTitle}?`}
          confirmLabel="Delete"
          cancelLabel="Cancel"
          loading={deleteLoading}
          loadingLabel="Deleting..."
          onConfirm={handleDeleteConfirm}
          onCancel={handleDeleteCancel}
        />
      ) : null}
      {!hideListPage ? (
        <RecordHistoryModal
          isOpen={auditHistoryModal !== null}
          screenName={auditHistoryModal?.screenName}
          recordPk={auditHistoryModal?.recordPk}
          displayName={auditHistoryModal?.displayName}
          onClose={() => setAuditHistoryModal(null)}
        />
      ) : null}
    </>
  );
}
