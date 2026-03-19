"use client";

import {
  type CSSProperties,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import DeleteConfirmModal from "@/components/ui/delete-confirm-modal";
import ReusableTable, { type ReusableTableColumn } from "@/components/ui/table";
import { useApi } from "@/hooks/useApi";
import { useMasterCrud } from "@/features/masters/shared";
import { getConfiguredModuleGridId } from "@/features/masters/shared/configured-grid-detail-ids";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import {
  fetchGridColumns,
  selectGridColumns,
  selectGridColumnsError,
  selectGridColumnsLoading,
  selectGridColumnsRequested,
  type GridColumnConfig,
} from "@/store/slices/gridColumnsSlice";
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

type MasterColumnAccessor =
  | "serialNo"
  | "masterCode"
  | "masterName"
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
  masterShort?: {
    width?: string;
    align?: ReusableTableColumn<Record<string, unknown>>["align"];
  };
  masterActive?: {
    width?: string;
    align?: ReusableTableColumn<Record<string, unknown>>["align"];
  };
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
  gridDetailId?: number;
  gridTableName?: string;
  gridTableNameAliases?: readonly string[];
  getByIdMethod?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
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

function toSafePageNumber(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : DEFAULT_PAGE;
}

function toSafePageSize(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : DEFAULT_PAGE_SIZE;
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

function buildMasterFallbackColumns(
  title: string,
  codeColumnHeader: string | undefined,
  nameColumnHeader: string | undefined,
  tableColumnHeaders: CrudMasterTableColumnHeaders | undefined,
  tableColumnLayout: CrudMasterTableColumnLayout | undefined,
): ReusableTableColumn<MasterTableRow>[] {
  return [
    {
      key: "serialNo",
      header: tableColumnHeaders?.serialNo ?? "S.No",
      accessor: "serialNo",
      align: tableColumnLayout?.serialNo?.align,
      width: tableColumnLayout?.serialNo?.width,
      sortable: false,
    },
    {
      key: "masterCode",
      header:
        tableColumnHeaders?.masterCode ?? codeColumnHeader ?? `${title} Code`,
      accessor: "masterCode",
      align: tableColumnLayout?.masterCode?.align,
      width: tableColumnLayout?.masterCode?.width,
    },
    {
      key: "masterName",
      header:
        tableColumnHeaders?.masterName ?? nameColumnHeader ?? `${title} Name`,
      accessor: "masterName",
      align: tableColumnLayout?.masterName?.align,
      width: tableColumnLayout?.masterName?.width,
    },
    {
      key: "masterShort",
      header: tableColumnHeaders?.masterShort ?? "Short Name",
      accessor: "masterShort",
      align: tableColumnLayout?.masterShort?.align,
      width: tableColumnLayout?.masterShort?.width,
    },
    {
      key: "masterActive",
      header: tableColumnHeaders?.masterActive ?? "Status",
      accessor: "masterActive",
      align: tableColumnLayout?.masterActive?.align,
      width: tableColumnLayout?.masterActive?.width,
    },
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
      normalized.includes("alias") ||
      normalizedCodeKeys.has(normalized) ||
      normalizedAliasKeys.has(normalized)
    ) {
      return "masterCode";
    }

    const compact = normalized.replace(/_/g, "");
    if (!compact) {
      continue;
    }
    if (
      normalizedCodeKeys.has(compact) ||
      normalizedAliasKeys.has(compact) ||
      compact.endsWith("code") ||
      compact.includes("alias")
    ) {
      return "masterCode";
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
  gridDetailId,
  gridTableName,
  gridTableNameAliases,
  getByIdMethod,
  buildGetByIdRequest,
  mapFormValues,
  augmentDetailSource,
  buildRequestPayload,
  afterSubmitSuccess,
  afterDeleteSuccess,
}: CrudMasterPageProps) {
  const dispatch = useAppDispatch();
  const modalControllerRef = useRef<ERPDynamicModalController | null>(null);

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
    debounceMs: DEBOUNCE_MS,
    defaultPage: DEFAULT_PAGE,
    defaultPageSize: DEFAULT_PAGE_SIZE,
  });
  const [gridId, setGridId] = useState<number | null>(null);
  const [gridDisplayName, setGridDisplayName] = useState<string | null>(null);
  const selectedGridId = gridId ?? -1;
  const gridColumns = useAppSelector((state) =>
    selectGridColumns(state, selectedGridId),
  );
  const gridColumnsLoading = useAppSelector((state) =>
    selectGridColumnsLoading(state, selectedGridId),
  );
  const gridColumnsRequested = useAppSelector((state) =>
    selectGridColumnsRequested(state, selectedGridId),
  );
  const gridColumnsError = useAppSelector((state) =>
    selectGridColumnsError(state, selectedGridId),
  );

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

  useEffect(() => {
    if (
      gridId === null ||
      gridColumnsRequested ||
      gridColumnsLoading
    ) {
      return;
    }

    void dispatch(
      fetchGridColumns({
        gridId,
        page: GRID_COLUMNS_PAGE,
        limit: GRID_COLUMNS_LIMIT,
      }),
    );
  }, [dispatch, gridColumnsLoading, gridColumnsRequested, gridId]);

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

  const columns = useMemo<ReusableTableColumn<MasterTableRow>[]>(
    () =>
      normalizedGridTableNames.length > 0
        ? buildColumnsFromGridColumns(gridColumns, lookupKeys, fallbackColumns)
        : fallbackColumns,
    [fallbackColumns, gridColumns, lookupKeys, normalizedGridTableNames.length],
  );

  const [selectedRowId, setSelectedRowId] = useState<string | number | null>(
    null,
  );
  const [editingItemId, setEditingItemId] = useState<string | number | null>(
    null,
  );
  const [pendingDeleteRow, setPendingDeleteRow] =
    useState<MasterTableRow | null>(null);

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

  const openCreateModal = useCallback(() => {
    resetSaveState();
    resetDetailsState();
    setEditingItemId(null);
    modalControllerRef.current?.openModal("master-create", {
      values: createInitialValues ?? INITIAL_FORM_STATE,
    });
  }, [createInitialValues, resetDetailsState, resetSaveState]);

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

  const handleSearchChange = useCallback((query: string) => {
    setCurrentPage(DEFAULT_PAGE);
    setSearchTerm(query);
  }, []);

  return (
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

                    void dispatch(
                      fetchGridColumns({
                        gridId,
                        page: GRID_COLUMNS_PAGE,
                        limit: GRID_COLUMNS_LIMIT,
                      }),
                    );
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
              minWidth="980px"
              activeRowKey={selectedRowId}
              onRowClick={(row) => setSelectedRowId(row.__rowId)}
              onCreate={openCreateModal}
              createLabel="Add"
              onView={handleRowView}
              onUpdate={handleRowUpdate}
              onDelete={handleRowDelete}
              isViewDisabled={() => saveLoading || detailsLoading}
              isUpdateDisabled={() => saveLoading || detailsLoading}
              isDeleteDisabled={() =>
                deleteLoading || saveLoading || detailsLoading
              }
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
        onControllerReady={(controller) => {
          modalControllerRef.current = controller;
        }}
        onSubmit={handleModalSubmit}
        onCancel={handleModalCancel}
      />
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
    </main>
  );
}
