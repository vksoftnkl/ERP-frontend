"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import DeleteConfirmModal from "@/components/ui/delete-confirm-modal";
import ReusableTable, { type ReusableTableColumn } from "@/components/ui/table";
import { useApi } from "@/hooks/useApi";
import { getConfiguredModuleGridId } from "@/features/masters/shared/configured-grid-detail-ids";
import {
  fetchGridColumns,
  selectGridColumns,
  selectGridColumnsError,
  selectGridColumnsLoading,
  selectGridColumnsRequested,
  type GridColumnConfig,
} from "@/store/slices/gridColumnsSlice";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import styles from "@/app/master/state-master/page.module.scss";
import {
  ERPDynamicModalForm,
  type ERPDynamicModalController,
  type ERPDynamicModalField,
  type ERPDynamicModalSubmitPayload,
  type ERPDynamicModalVariant,
} from "@/components/library/ui/dynamic-modal-form";
// Constants
const API_ENDPOINTS = {
  LIST: "/item-groups/list",
  GET_BY_ID: "/item-groups/get",
  CREATE: "/item-groups/create",
  DELETE: "/item-groups/delete",
} as const;
const GRID_DETAILS_ENDPOINT = "/grid-details/list";
const GRID_DETAIL_GET_ENDPOINT = "/grid-details/get";
const ITEM_GROUP_TABLE_NAME = "item_group_master";
const ITEM_GROUP_GRID_DETAIL_ID = getConfiguredModuleGridId(ITEM_GROUP_TABLE_NAME);
const GRID_DETAILS_QUERY = {
  grid_status: "true",
  search: ITEM_GROUP_TABLE_NAME,
  page: "1",
  limit: "20",
} as const;
const GRID_COLUMNS_PAGE = 1;
const GRID_COLUMNS_LIMIT = 20;
const GRID_DETAIL_ID_KEYS = ["grid_id", "gridId", "id"] as const;
const GRID_DETAIL_SQL_KEYS = ["grid_sql", "gridSql", "sql"] as const;
const GRID_DETAIL_NAME_KEYS = ["grid_name", "gridName", "name"] as const;
const TABLE_MAX_HEIGHT = "calc(100dvh - 250px)";
const FILE_CONSTRAINTS = {
  MAX_UPLOAD_IMAGE_BYTES: 5 * 1024 * 1024,
  ALLOWED_MIME_TYPES: [
    "image/png",
    "image/jpeg",
    "image/jpg",
    "image/webp",
    "image/gif",
    "image/svg+xml",
  ] as const,
  DEBOUNCE_MS: 300,
} as const;
const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 20;
const ARRAY_KEYS = [
  "data",
  "items",
  "results",
  "rows",
  "list",
  "groups",
  "itemGroups",
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
const GROUP_ID_KEYS = [
  "group_id",
  "groupId",
  "id",
  "_id",
  "itg_id",
  "itemgroupid",
  "item_group_id",
  "itemGroupId",
] as const;
const GROUP_CODE_KEYS = [
  "group_code",
  "groupCode",
  "code",
  "itg_alias",
  "itg_short",
  "groupalias",
  "groupshort",
] as const;
const GROUP_NAME_KEYS = [
  "group_name",
  "groupName",
  "name",
  "itg_name",
  "itemgroupname",
  "item_group_name",
  "itemGroupName",
] as const;
const GROUP_POSITION_KEYS = ["position", "itg_sort", "sort"] as const;
const GROUP_ALIAS_KEYS = [
  "itg_alias",
  "alias",
  "group_alias",
  "groupalias",
  "itemgroupalias",
  "item_group_alias",
] as const;
const GROUP_SHORT_KEYS = [
  "itg_short",
  "short_name",
  "shortName",
  "short",
  "groupshort",
  "itemgroupshort",
  "item_group_short",
] as const;
const GROUP_ACTIVE_KEYS = [
  "itg_active",
  "active",
  "is_active",
  "isActive",
  "isactive",
  "status",
] as const;
const GROUP_DESCRIPTION_KEYS = [
  "itg_description",
  "description",
  "desc",
] as const;
const GROUP_PARENT_ID_KEYS = [
  "itg_parent_id",
  "parent_id",
  "parentId",
  "parent_group_id",
] as const;
const INITIAL_FORM_STATE = {
  itemGroupName: "",
  searchCode: "",
  itemAlias: "",
  itemShortName: "",
  itemDescription: "",
  position: "",
  parentGroupId: "",
} as const;
// Types
type ItemGroupTableRow = {
  __rowId: string | number;
  __recordId: string | number;
  __source: Record<string, unknown> | null;
  serialNo: number;
  groupId: string;
  groupCode: string;
  groupName: string;
  groupShort: string;
  groupAlias: string;
  groupActive: string;
  position: string;
};
type ItemGroupFormState = {
  itemGroupName: string;
  searchCode: string;
  itemAlias: string;
  itemShortName: string;
  itemDescription: string;
  position: string;
  parentGroupId: string;
};
type CreateItemGroupRequest = {
  itg_name: string;
  itg_alias: string;
  itg_short: string;
  itg_description: string;
  itg_parent_id: string;
  itg_sort: number;
  itg_photo: Record<string, unknown>;
  itg_id?: string | number;
};
type ItemGroupColumnAccessor = keyof Pick<
  ItemGroupTableRow,
  | "serialNo"
  | "groupId"
  | "groupCode"
  | "groupName"
  | "groupShort"
  | "groupAlias"
  | "groupActive"
  | "position"
>;
const DEFAULT_SERIAL_NO_COLUMN: ReusableTableColumn<ItemGroupTableRow> = {
  key: "serialNo",
  header: "S.No",
  accessor: "serialNo",
  align: "left",
  width: "46px",
  sortable: false,
};
const DEFAULT_ITEM_GROUP_COLUMNS: ReusableTableColumn<ItemGroupTableRow>[] = [
  DEFAULT_SERIAL_NO_COLUMN,
  {
    key: "groupCode",
    header: "Group Code",
    accessor: "groupCode",
    align: "left",
    width: "260px",
  },
  {
    key: "groupName",
    header: "Group Name",
    accessor: "groupName",
    align: "left",
    width: "360px",
  },
  {
    key: "position",
    header: "Position",
    accessor: "position",
    align: "left",
    width: "80px",
    sortAccessor: (row) => Number(row.position || 0),
  },
];
const ITEM_GROUP_COLUMN_ACCESSOR_MAP: Record<string, ItemGroupColumnAccessor> =
  {
    serialno: "serialNo",
    serialnumber: "serialNo",
    sno: "serialNo",
    srno: "serialNo",
    s_no: "serialNo",
    serial_no: "serialNo",
    groupid: "groupId",
    group_id: "groupId",
    groupcode: "groupCode",
    group_code: "groupCode",
    itgid: "groupId",
    itg_id: "groupId",
    code: "groupCode",
    itgalias: "groupCode",
    itg_alias: "groupCode",
    itgshort: "groupCode",
    itg_short: "groupCode",
    groupshort: "groupShort",
    group_short: "groupShort",
    short: "groupShort",
    shortname: "groupShort",
    short_name: "groupShort",
    itemgroupshort: "groupShort",
    item_group_short: "groupShort",
    itemgroupshortname: "groupShort",
    item_group_short_name: "groupShort",
    groupalias: "groupAlias",
    group_alias: "groupAlias",
    alias: "groupAlias",
    itemgroupalias: "groupAlias",
    item_group_alias: "groupAlias",
    active: "groupActive",
    isactive: "groupActive",
    is_active: "groupActive",
    status: "groupActive",
    itemgroupactive: "groupActive",
    item_group_active: "groupActive",
    groupname: "groupName",
    group_name: "groupName",
    name: "groupName",
    itgname: "groupName",
    itg_name: "groupName",
    itemgroupname: "groupName",
    item_group_name: "groupName",
    itemgroupid: "groupId",
    item_group_id: "groupId",
    position: "position",
    sort: "position",
    order: "position",
    itgsort: "position",
    itg_sort: "position",
  };
function normalizeColumnToken(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9_]+/g, "");
}

function normalizeGridColumnColor(
  value: string | undefined,
): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const normalized = value.trim();
  return normalized || undefined;
}

function resolveItemGroupAccessor(
  ...candidates: Array<string | undefined>
): ItemGroupColumnAccessor | null {
  for (const candidate of candidates) {
    if (!candidate) {
      continue;
    }
    const normalized = normalizeColumnToken(candidate);
    const mapped = ITEM_GROUP_COLUMN_ACCESSOR_MAP[normalized];
    if (mapped) {
      return mapped;
    }
    const compact = normalized.replace(/_/g, "");
    const compactMapped = ITEM_GROUP_COLUMN_ACCESSOR_MAP[compact];
    if (compactMapped) {
      return compactMapped;
    }
  }
  return null;
}
function buildColumnsFromGridColumns(
  gridColumns: GridColumnConfig[],
): ReusableTableColumn<ItemGroupTableRow>[] {
  const columns: ReusableTableColumn<ItemGroupTableRow>[] = [];
  const seenColumnKeys = new Set<string>();
  for (const gridColumn of gridColumns) {
    if (!gridColumn.visible) {
      continue;
    }
    const accessor = resolveItemGroupAccessor(
      gridColumn.accessorKey,
      gridColumn.key,
      gridColumn.header,
    );
    if (!accessor) {
      continue;
    }
    const keyBase =
      normalizeColumnToken(
        gridColumn.key ||
          gridColumn.accessorKey ||
          gridColumn.header ||
          accessor,
      ) || accessor;
    const uniqueKey = seenColumnKeys.has(keyBase)
      ? `${keyBase}-${columns.length + 1}`
      : keyBase;
    seenColumnKeys.add(uniqueKey);
    const columnColor = normalizeGridColumnColor(gridColumn.color);
    const tableColumn: ReusableTableColumn<ItemGroupTableRow> = {
      key: uniqueKey,
      header: gridColumn.header,
      accessor,
      align: gridColumn.align ?? "left",
      width: gridColumn.width ?? (accessor === "serialNo" ? "46px" : undefined),
      sortable: gridColumn.sortable ?? accessor !== "serialNo",
      headerStyle: columnColor ? { backgroundColor: columnColor } : undefined,
      cellStyle: columnColor ? { backgroundColor: columnColor } : undefined,
    };

    if (accessor === "position") {
      tableColumn.sortAccessor = (row) => Number(row.position || 0);
    }

    columns.push(tableColumn);
  }

  if (columns.length === 0) {
    return DEFAULT_ITEM_GROUP_COLUMNS;
  }

  const serialColumnIndex = columns.findIndex(
    (column) => column.accessor === "serialNo",
  );
  if (serialColumnIndex < 0) {
    columns.unshift({ ...DEFAULT_SERIAL_NO_COLUMN });
    return columns;
  }

  if (serialColumnIndex > 0) {
    const [serialColumn] = columns.splice(serialColumnIndex, 1);
    columns.unshift({
      ...serialColumn,
      accessor: "serialNo",
      sortable: false,
    });
  }

  return columns;
}
// Utility functions
function toReferenceObject(value: string): string {
  const normalizedValue = value.trim();
  return normalizedValue;
}
function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== "string") {
        reject(new Error("Unable to read selected image."));
        return;
      }
      resolve(reader.result);
    };
    reader.onerror = () => reject(new Error("Unable to read selected image."));
    reader.readAsDataURL(file);
  });
}
function getBase64FromDataUrl(dataUrl: string): string {
  const commaIndex = dataUrl.indexOf(",");
  return commaIndex >= 0 ? dataUrl.slice(commaIndex + 1) : dataUrl;
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
function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
function resolveNumericId(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const normalized = value.trim();
    if (/^\d+$/.test(normalized)) {
      return Number(normalized);
    }
  }
  return null;
}
function extractGridDetailsRows(payload: unknown): Record<string, unknown>[] {
  if (Array.isArray(payload)) {
    return payload.filter(isRecord);
  }
  if (!isRecord(payload)) {
    return [];
  }
  const directRows = getFirstDefinedValue(payload, [
    "items",
    "data",
    "results",
    "rows",
    "list",
  ]);
  if (Array.isArray(directRows)) {
    return directRows.filter(isRecord);
  }
  for (const containerKey of ["data", "result", "payload"] as const) {
    const nested = payload[containerKey];
    if (!isRecord(nested)) {
      continue;
    }
    const nestedRows = getFirstDefinedValue(nested, [
      "items",
      "data",
      "results",
      "rows",
      "list",
    ]);
    if (Array.isArray(nestedRows)) {
      return nestedRows.filter(isRecord);
    }
  }
  return [];
}
type ResolvedGridDetails = {
  gridId: number | null;
  gridName: string | null;
};

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

function resolveItemGroupGridDetailsById(
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

function resolveItemGroupGridDetails(payload: unknown): ResolvedGridDetails {
  const rows = extractGridDetailsRows(payload);
  for (const row of rows) {
    const gridId = resolveNumericId(getFirstDefinedValue(row, GRID_DETAIL_ID_KEYS));
    const gridSql = String(getFirstDefinedValue(row, GRID_DETAIL_SQL_KEYS) ?? "").toLowerCase();
    if (gridId !== null && gridSql.includes(ITEM_GROUP_TABLE_NAME)) {
      const gridName = toDisplayValue(
        getFirstDefinedValue(row, GRID_DETAIL_NAME_KEYS),
      );
      return {
        gridId,
        gridName: gridName || null,
      };
    }
  }
  for (const row of rows) {
    const gridId = resolveNumericId(getFirstDefinedValue(row, GRID_DETAIL_ID_KEYS));
    if (gridId !== null) {
      const gridName = toDisplayValue(
        getFirstDefinedValue(row, GRID_DETAIL_NAME_KEYS),
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
      nestedValue.itg_id ??
      nestedValue.parent_id ??
      nestedValue.id ??
      nestedValue._id ??
      nestedValue.code ??
      nestedValue.name ??
      nestedValue.value;
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
function extractRows(payload: unknown): unknown[] {
  if (Array.isArray(payload)) {
    return payload;
  }

  if (!payload || typeof payload !== "object") {
    return [];
  }
  const objectPayload = payload as Record<string, unknown>;
  for (const key of ARRAY_KEYS) {
    const value = objectPayload[key];
    if (Array.isArray(value)) {
      return value;
    }
    if (value && typeof value === "object") {
      const nestedObject = value as Record<string, unknown>;
      for (const nestedKey of ARRAY_KEYS) {
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
function extractPaginationInfo(payload: unknown): {
  totalEntries: number | null;
  currentPage: number | null;
  pageSize: number | null;
} {
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
function resolveItgId(row: ItemGroupTableRow): string | number {
  if (row.__source) {
    const sourceItgId = row.__source.itg_id;
    if (typeof sourceItgId === "string" || typeof sourceItgId === "number") {
      return sourceItgId;
    }
    const displayItgId = toDisplayValue(sourceItgId);
    if (displayItgId) {
      return displayItgId;
    }
  }
  return row.__recordId;
}
// Data transformation functions
function mapRowToFormState(row: ItemGroupTableRow): ItemGroupFormState {
  if (!row.__source) {
    return {
      itemGroupName: row.groupName,
      searchCode: row.groupCode,
      itemAlias: "",
      itemShortName: "",
      itemDescription: "",
      position: row.position,
      parentGroupId: "",
    };
  }
  const source = row.__source;
  const itemGroupName =
    toDisplayValue(getFirstDefinedValue(source, GROUP_NAME_KEYS)) ||
    row.groupName;
  const searchCode =
    toDisplayValue(getFirstDefinedValue(source, GROUP_CODE_KEYS)) ||
    row.groupCode;
  return {
    itemGroupName,
    searchCode,
    itemAlias: toDisplayValue(getFirstDefinedValue(source, GROUP_ALIAS_KEYS)),
    itemShortName: toDisplayValue(
      getFirstDefinedValue(source, GROUP_SHORT_KEYS),
    ),
    itemDescription: toDisplayValue(
      getFirstDefinedValue(source, GROUP_DESCRIPTION_KEYS),
    ),
    position:
      toDisplayValue(getFirstDefinedValue(source, GROUP_POSITION_KEYS)) ||
      row.position,
    parentGroupId: toDisplayValue(
      getFirstDefinedValue(source, GROUP_PARENT_ID_KEYS),
    ),
  };
}
function buildItemGroupRows(
  payload: unknown,
  serialOffset = 0,
): ItemGroupTableRow[] {
  return extractRows(payload).map((item, index) => {
    const serialNo = serialOffset + index + 1;
    if (item && typeof item === "object" && !Array.isArray(item)) {
      const row = item as Record<string, unknown>;
      const groupIdValue = getFirstDefinedValue(row, GROUP_ID_KEYS);
      const groupCodeValue = getFirstDefinedValue(row, GROUP_CODE_KEYS);
      const groupNameValue = getFirstDefinedValue(row, GROUP_NAME_KEYS);
      const groupShortValue = getFirstDefinedValue(row, GROUP_SHORT_KEYS);
      const groupAliasValue = getFirstDefinedValue(row, GROUP_ALIAS_KEYS);
      const groupActiveValue = getFirstDefinedValue(row, GROUP_ACTIVE_KEYS);
      const positionValue = getFirstDefinedValue(row, GROUP_POSITION_KEYS);
      const preferredKey =
        groupIdValue ??
        row.id ??
        row._id ??
        row.groupId ??
        row.code ??
        serialNo;
      const rowId =
        typeof preferredKey === "string" || typeof preferredKey === "number"
          ? preferredKey
          : serialNo;
      return {
        __rowId: rowId,
        __recordId: rowId,
        __source: row,
        serialNo,
        groupId: toDisplayValue(groupIdValue) || String(serialNo),
        groupCode: toDisplayValue(groupCodeValue),
        groupName: toDisplayValue(groupNameValue),
        groupShort: toDisplayValue(groupShortValue),
        groupAlias: toDisplayValue(groupAliasValue),
        groupActive: toDisplayValue(groupActiveValue),
        position: toDisplayValue(positionValue),
      };
    }
    return {
      __rowId: serialNo,
      __recordId: serialNo,
      __source: null,
      serialNo,
      groupId: String(serialNo),
      groupCode: "",
      groupName: toDisplayValue(item),
      groupShort: "",
      groupAlias: "",
      groupActive: "",
      position: "",
    };
  });
}

function extractItemGroupDetailSource(
  payload: unknown,
): Record<string, unknown> | null {
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

function mergeRowWithItemGroupDetail(
  row: ItemGroupTableRow,
  source: Record<string, unknown>,
): ItemGroupTableRow {
  const groupIdValue = getFirstDefinedValue(source, GROUP_ID_KEYS);
  const recordId =
    typeof groupIdValue === "string" || typeof groupIdValue === "number"
      ? groupIdValue
      : row.__recordId;

  return {
    ...row,
    __recordId: recordId,
    __source: source,
    groupId: toDisplayValue(groupIdValue) || row.groupId,
    groupCode:
      toDisplayValue(getFirstDefinedValue(source, GROUP_CODE_KEYS)) ||
      row.groupCode,
    groupName:
      toDisplayValue(getFirstDefinedValue(source, GROUP_NAME_KEYS)) ||
      row.groupName,
    groupShort:
      toDisplayValue(getFirstDefinedValue(source, GROUP_SHORT_KEYS)) ||
      row.groupShort,
    groupAlias:
      toDisplayValue(getFirstDefinedValue(source, GROUP_ALIAS_KEYS)) ||
      row.groupAlias,
    groupActive:
      toDisplayValue(getFirstDefinedValue(source, GROUP_ACTIVE_KEYS)) ||
      row.groupActive,
    position:
      toDisplayValue(getFirstDefinedValue(source, GROUP_POSITION_KEYS)) ||
      row.position,
  };
}
// Custom hooks
function useItemGroupData() {
  const { data, error, loading, getAll } = useApi<unknown>(API_ENDPOINTS.LIST);
  const {
    run: getItemGroupById,
    loading: detailsLoading,
    error: detailsError,
    reset: resetDetailsState,
  } = useApi<unknown>(API_ENDPOINTS.GET_BY_ID);
  const {
    run: createItemGroup,
    loading: createLoading,
    error: createError,
    reset: resetCreateState,
  } = useApi<unknown, CreateItemGroupRequest>(API_ENDPOINTS.CREATE, {
    method: "POST",
  });
  const {
    run: deleteItemGroup,
    loading: deleteLoading,
    error: deleteError,
  } = useApi<unknown>(API_ENDPOINTS.DELETE, { method: "DELETE" });
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(DEFAULT_PAGE);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [totalEntries, setTotalEntries] = useState(0);
  const loadItemGroups = useCallback(
    async (term: string, page: number, limit: number) => {
      const normalizedTerm = term.trim();
      const query: Record<string, string> = {
        page: String(Math.max(1, page)),
        limit: String(Math.max(1, limit)),
      };
      if (normalizedTerm) {
        query.search = normalizedTerm;
      }
      const payload = await getAll(query);
      const paginationInfo = extractPaginationInfo(payload);
      const fallbackTotal = extractRows(payload).length;
      const resolvedTotal = paginationInfo.totalEntries ?? fallbackTotal;
      setTotalEntries(Math.max(0, resolvedTotal));
    },
    [getAll],
  );
  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void loadItemGroups(searchTerm, currentPage, pageSize);
    }, FILE_CONSTRAINTS.DEBOUNCE_MS);
    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [currentPage, loadItemGroups, pageSize, searchTerm]);
  const serialOffset = Math.max(0, (currentPage - 1) * pageSize);
  const rows = useMemo(
    () => buildItemGroupRows(data, serialOffset),
    [data, serialOffset],
  );
  return {
    data,
    error,
    loading,
    detailsLoading,
    detailsError,
    createLoading,
    createError,
    deleteLoading,
    deleteError,
    searchTerm,
    setSearchTerm,
    currentPage,
    setCurrentPage,
    pageSize,
    setPageSize,
    totalEntries,
    loadItemGroups,
    getItemGroupById,
    createItemGroup,
    deleteItemGroup,
    resetDetailsState,
    resetCreateState,
    rows,
  };
}
function useItemGroupSelection(rows: ItemGroupTableRow[]) {
  const [selectedRowId, setSelectedRowId] = useState<string | number | null>(
    null,
  );
  const [editingItemId, setEditingItemId] = useState<string | number | null>(
    null,
  );
  const selectedRow = useMemo(
    () => rows.find((row) => row.__rowId === selectedRowId) ?? null,
    [rows, selectedRowId],
  );
  // Cleanup effects
  useEffect(() => {
    if (selectedRowId === null) {
      return;
    }
    if (!rows.some((row) => row.__rowId === selectedRowId)) {
      setSelectedRowId(null);
    }
  }, [rows, selectedRowId]);
  return {
    selectedRowId,
    setSelectedRowId,
    editingItemId,
    setEditingItemId,
    selectedRow,
  };
}
// Main component
export default function ItemGroupMasterPage() {
  const modalControllerRef = useRef<ERPDynamicModalController | null>(null);
  const dispatch = useAppDispatch();
  const { getAll: getGridDetails } = useApi<unknown>(GRID_DETAILS_ENDPOINT);
  const { getAll: getGridDetailById } = useApi<unknown>(GRID_DETAIL_GET_ENDPOINT);
  const [itemGroupGridId, setItemGroupGridId] = useState<number | null>(null);
  const [itemGroupGridName, setItemGroupGridName] = useState<string | null>(null);
  const selectedGridId = itemGroupGridId ?? -1;

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

  useEffect(() => {
    let isMounted = true;

    const loadGridId = async () => {
      try {
        const resolvedGrid =
          ITEM_GROUP_GRID_DETAIL_ID !== undefined
            ? resolveItemGroupGridDetailsById(
                await getGridDetailById({
                  grid_id: String(ITEM_GROUP_GRID_DETAIL_ID),
                }),
                ITEM_GROUP_GRID_DETAIL_ID,
              )
            : resolveItemGroupGridDetails(await getGridDetails(GRID_DETAILS_QUERY));
        if (!isMounted) {
          return;
        }
        setItemGroupGridId(resolvedGrid.gridId);
        setItemGroupGridName(resolvedGrid.gridName);
      } catch {
        if (isMounted) {
          setItemGroupGridId(ITEM_GROUP_GRID_DETAIL_ID ?? null);
          setItemGroupGridName(null);
        }
      }
    };

    void loadGridId();

    return () => {
      isMounted = false;
    };
  }, [getGridDetailById, getGridDetails]);

  const effectiveTitle = useMemo(() => {
    const normalized = itemGroupGridName?.trim();
    return normalized || "Item Group";
  }, [itemGroupGridName]);

  useEffect(() => {
    if (
      itemGroupGridId === null ||
      gridColumnsRequested ||
      gridColumnsLoading
    ) {
      return;
    }
    void dispatch(
      fetchGridColumns({
        gridId: itemGroupGridId,
        page: GRID_COLUMNS_PAGE,
        limit: GRID_COLUMNS_LIMIT,
      }),
    );
  }, [dispatch, gridColumnsLoading, gridColumnsRequested, itemGroupGridId]);

  // Custom hooks
  const {
    data,
    error,
    loading,
    detailsLoading,
    detailsError,
    createLoading,
    createError,
    deleteLoading,
    deleteError,
    searchTerm,
    setSearchTerm,
    currentPage,
    setCurrentPage,
    pageSize,
    setPageSize,
    totalEntries,
    loadItemGroups,
    getItemGroupById,
    createItemGroup,
    deleteItemGroup,
    resetDetailsState,
    resetCreateState,
    rows,
  } = useItemGroupData();
  const {
    selectedRowId,
    setSelectedRowId,
    editingItemId,
    setEditingItemId,
    selectedRow,
  } = useItemGroupSelection(rows);
  const [pendingDeleteRow, setPendingDeleteRow] =
    useState<ItemGroupTableRow | null>(null);

  const pendingDeleteLabel = useMemo(() => {
    if (!pendingDeleteRow) {
      return "";
    }
    return (
      pendingDeleteRow.groupName ||
      pendingDeleteRow.groupCode ||
      pendingDeleteRow.groupId
    );
  }, [pendingDeleteRow]);

  const parentGroupOptions = useMemo(() => {
    const editingId = editingItemId === null ? null : String(editingItemId);
    const currentParentId = selectedRow
      ? mapRowToFormState(selectedRow).parentGroupId.trim()
      : "";
    const optionMap = new Map<string, string>();
    for (const row of rows) {
      const optionId = String(resolveItgId(row)).trim();
      if (!optionId || optionId === editingId || optionMap.has(optionId)) {
        continue;
      }
      const optionLabel =
        [row.groupCode, row.groupName].filter(Boolean).join(" - ") || optionId;
      optionMap.set(optionId, optionLabel);
    }
    const options = Array.from(optionMap, ([value, label]) => ({
      value,
      label,
    }));
    if (currentParentId && !optionMap.has(currentParentId)) {
      options.unshift({
        value: currentParentId,
        label: `Current (${currentParentId})`,
      });
    }
    return options;
  }, [editingItemId, rows, selectedRow]);
  // Event handlers
  const openCreateModal = useCallback(() => {
    resetCreateState();
    resetDetailsState();
    setEditingItemId(null);
    modalControllerRef.current?.openModal("item-group-create", {
      values: INITIAL_FORM_STATE,
    });
  }, [resetCreateState, resetDetailsState]);
  const openUpdateModalForRow = useCallback(
    (row: ItemGroupTableRow) => {
      resetCreateState();
      resetDetailsState();
      setSelectedRowId(row.__rowId);
      const updateItgId = resolveItgId(row);
      setEditingItemId(updateItgId);
      void (async () => {
        try {
          const payload = await getItemGroupById({
            query: {
              itg_id: String(updateItgId),
            },
          });
          const detailSource = extractItemGroupDetailSource(payload);
          const detailRow = detailSource
            ? mergeRowWithItemGroupDetail(row, detailSource)
            : row;
          setEditingItemId(resolveItgId(detailRow));
          modalControllerRef.current?.openModal("item-group-update", {
            values: mapRowToFormState(detailRow),
          });
        } catch {
          // Error UI is driven by detailsError from useApi.
        }
      })();
    },
    [getItemGroupById, resetCreateState, resetDetailsState],
  );
  const openViewModalForRow = useCallback(
    (row: ItemGroupTableRow) => {
      resetCreateState();
      resetDetailsState();
      setSelectedRowId(row.__rowId);
      setEditingItemId(null);
      const viewItgId = resolveItgId(row);
      void (async () => {
        try {
          const payload = await getItemGroupById({
            query: {
              itg_id: String(viewItgId),
            },
          });
          const detailSource = extractItemGroupDetailSource(payload);
          const detailRow = detailSource
            ? mergeRowWithItemGroupDetail(row, detailSource)
            : row;
          modalControllerRef.current?.openModal("item-group-view", {
            values: mapRowToFormState(detailRow),
          });
        } catch {
          // Error UI is driven by detailsError from useApi.
        }
      })();
    },
    [getItemGroupById, resetCreateState, resetDetailsState],
  );
  const handleModalSubmit = useCallback(
    async ({ variantKey, values, files }: ERPDynamicModalSubmitPayload) => {
      if (variantKey === "item-group-view") {
        return;
      }
      const itemGroupName = (values.itemGroupName ?? "").trim();
      const searchCode = (values.searchCode ?? "").trim();
      const itemAlias = (values.itemAlias ?? "").trim();
      const itemShortName = (values.itemShortName ?? "").trim();
      const itemDescription = (values.itemDescription ?? "").trim();
      const parentGroupId = (values.parentGroupId ?? "").trim();
      const parsedSort = Number.parseInt((values.position ?? "").trim(), 10);
      const itgSort = Number.isFinite(parsedSort) ? parsedSort : 0;
      const aliasValue = itemAlias || searchCode;
      const shortValue = itemShortName || searchCode || aliasValue;
      const shouldUpdate = variantKey === "item-group-update";
      const uploadedImage = files.itemGroupPhoto;
      const imagePayload = uploadedImage
        ? {
            file_name: uploadedImage.name,
            mime_type: uploadedImage.type,
            file_size: uploadedImage.size,
            data_url: await readFileAsDataUrl(uploadedImage),
          }
        : null;
      const createPayload: CreateItemGroupRequest = {
        itg_name: itemGroupName,
        itg_alias: aliasValue,
        itg_short: shortValue,
        itg_description: itemDescription,
        itg_parent_id: toReferenceObject(parentGroupId),
        itg_sort: itgSort,
        itg_photo: imagePayload
          ? {
              ...imagePayload,
              data_base64: getBase64FromDataUrl(imagePayload.data_url),
            }
          : {},
        ...(shouldUpdate && editingItemId !== null
          ? { itg_id: editingItemId }
          : {}),
      };
      await createItemGroup({ body: createPayload });
      setEditingItemId(null);
      await loadItemGroups(searchTerm, currentPage, pageSize);
    },
    [
      createItemGroup,
      currentPage,
      editingItemId,
      loadItemGroups,
      pageSize,
      searchTerm,
    ],
  );
  const handleModalCancel = useCallback(() => {
    if (createLoading) {
      return;
    }
    resetCreateState();
    resetDetailsState();
    setEditingItemId(null);
  }, [createLoading, resetCreateState, resetDetailsState]);
  const handleDeleteRow = useCallback(
    (row: ItemGroupTableRow) => {
      if (deleteLoading || createLoading || detailsLoading) {
        return;
      }
      setPendingDeleteRow(row);
    },
    [createLoading, deleteLoading, detailsLoading],
  );

  const handleDeleteCancel = useCallback(() => {
    if (deleteLoading) {
      return;
    }
    setPendingDeleteRow(null);
  }, [deleteLoading]);

  const handleDeleteConfirm = useCallback(() => {
    if (!pendingDeleteRow || deleteLoading || createLoading || detailsLoading) {
      return;
    }
    void (async () => {
      try {
        const row = pendingDeleteRow;
        const deleteItgId = resolveItgId(row);
        await deleteItemGroup({
          query: {
            itg_id: String(deleteItgId),
          },
        });

        setSelectedRowId((current) =>
          current === row.__rowId ? null : current,
        );
        if (editingItemId === deleteItgId) {
          setEditingItemId(null);
          modalControllerRef.current?.closeModal();
        }
        setPendingDeleteRow(null);
        await loadItemGroups(searchTerm, currentPage, pageSize);
      } catch {
        // Error UI is driven by deleteError from useApi.
      }
    })();
  }, [
    createLoading,
    deleteItemGroup,
    deleteLoading,
    detailsLoading,
    editingItemId,
    loadItemGroups,
    currentPage,
    pageSize,
    pendingDeleteRow,
    searchTerm,
  ]);
  const itemGroupFields = useMemo<ERPDynamicModalField[]>(
    () => [
      {
        name: "itemGroupName",
        label: "Item Group Name",
        required: true,
        placeholder: "Frozen Products",
        colSpan: 2,
        validation: {
          minLength: 2,
          minLengthMessage: "Item Group Name must be at least 2 characters.",
        },
      },
      // {
      //   name: "itemAlias",
      //   label: "Alias",
      //   colSpan: 2,
      //   placeholder: "Alternate name",
      // },
      {
        name: "itemShortName",
        label: "Short Name",
        colSpan: 2,
        placeholder: "Short label for prints",
      },
      {
        name: "position",
        label: "Position",
        type: "number",
        colSpan: 1,
        min: 0,
        step: 1,
        placeholder: "0",
        validation: {
          minMessage: "Position must be 0 or greater.",
        },
      },
      {
        name: "parentGroupId",
        label: "Parent Group",
        type: "select",
        searchable: true,
        colSpan: 2,
        options: parentGroupOptions,
        placeholder: "Select parent group (optional)",
      },
      {
        name: "itemDescription",
        label: "Description",
        placeholder: "Add notes about this item group",
        colSpan: 2,
      },
      {
        name: "itemGroupPhoto",
        label: "Item Group Image",
        type: "file",
        accept: "image/*",
        maxFileSizeBytes: FILE_CONSTRAINTS.MAX_UPLOAD_IMAGE_BYTES,
        allowedMimeTypes: [...FILE_CONSTRAINTS.ALLOWED_MIME_TYPES],
        helperText: "Optional. Max 5 MB. Supported: PNG, JPG, WEBP, GIF, SVG.",
        colSpan: 2,
      },
    ],
    [parentGroupOptions],
  );
  const itemGroupViewFields = useMemo<ERPDynamicModalField[]>(
    () =>
      itemGroupFields
        .filter((field) => field.type !== "file")
        .map((field) => ({
          ...field,
          disabled: true,
          required: false,
          validation: undefined,
        })),
    [itemGroupFields],
  );
  const modalVariants = useMemo<ERPDynamicModalVariant[]>(
    () => [
      {
        key: "item-group-view",
        cardTitle: `View ${effectiveTitle}`,
        cardDescription: "View selected item group details.",
        cardButtonLabel: "View",
        modalTitle: `${effectiveTitle} Details`,
        modalDescription: "Read-only view of selected item group data.",
        submitLabel: "Close",
        accent: "indigo",
        fields: itemGroupViewFields,
      },
      {
        key: "item-group-create",
        cardTitle: `Create ${effectiveTitle}`,
        cardDescription: "Create a new group for billing workflows.",
        cardButtonLabel: "Create",
        modalTitle: `New ${effectiveTitle}`,
        modalDescription: "Configure group details and hierarchy.",
        submitLabel: createLoading ? "Saving..." : "Save",
        accent: "blue",
        fields: itemGroupFields,
      },
      {
        key: "item-group-update",
        cardTitle: `Update ${effectiveTitle}`,
        cardDescription: "Update an existing group.",
        cardButtonLabel: "Update",
        modalTitle: `Edit ${effectiveTitle}`,
        modalDescription: "Update selected item group details.",
        submitLabel: createLoading ? "Updating..." : "Update",
        accent: "emerald",
        fields: itemGroupFields,
      },
    ],
    [createLoading, effectiveTitle, itemGroupFields, itemGroupViewFields],
  );
  const columns = useMemo<ReusableTableColumn<ItemGroupTableRow>[]>(
    () => buildColumnsFromGridColumns(gridColumns),
    [gridColumns],
  );
  // Table event handlers
  const handleUpdate = useCallback(() => {
    if (!selectedRow) {
      return;
    }
    openUpdateModalForRow(selectedRow);
  }, [selectedRow, openUpdateModalForRow]);
  const handleDelete = useCallback(() => {
    if (!selectedRow) {
      return;
    }
    handleDeleteRow(selectedRow);
  }, [selectedRow, handleDeleteRow]);
  const handleRowUpdate = useCallback(
    (row: ItemGroupTableRow) => {
      setSelectedRowId(row.__rowId);
      openUpdateModalForRow(row);
    },
    [openUpdateModalForRow],
  );
  const handleRowView = useCallback(
    (row: ItemGroupTableRow) => {
      openViewModalForRow(row);
    },
    [openViewModalForRow],
  );
  const handleRowDelete = useCallback(
    (row: ItemGroupTableRow) => {
      setSelectedRowId(row.__rowId);
      handleDeleteRow(row);
    },
    [handleDeleteRow],
  );
  return (
    <main className={styles.page}>
      <div className={styles.viewport}>
        <div className={styles.board}>
          <section className={styles.content}>
            {error ? (
              <div className={styles.errorBox}>
                <p className={styles.errorText}>
                  Unable to load group data: {error}
                </p>
                <button
                  type="button"
                  className={styles.retryButton}
                  onClick={() =>
                    void loadItemGroups(searchTerm, currentPage, pageSize)
                  }
                >
                  Retry
                </button>
              </div>
            ) : null}
            {deleteError ? (
              <div className={styles.errorBox}>
                <p className={styles.errorText}>
                  Unable to delete selected group: {deleteError}
                </p>
              </div>
            ) : null}
            {detailsError ? (
              <div className={styles.errorBox}>
                <p className={styles.errorText}>
                  Unable to load selected group details: {detailsError}
                </p>
              </div>
            ) : null}
            {gridColumnsError ? (
              <div className={styles.errorBox}>
                <p className={styles.errorText}>
                  Unable to load table headers: {gridColumnsError}. Showing
                  default headers.
                </p>
                <button
                  type="button"
                  className={styles.retryButton}
                  onClick={() => {
                    if (itemGroupGridId === null) {
                      return;
                    }
                    void dispatch(
                      fetchGridColumns({
                        gridId: itemGroupGridId,
                        page: GRID_COLUMNS_PAGE,
                        limit: GRID_COLUMNS_LIMIT,
                      }),
                    );
                  }}
                  disabled={gridColumnsLoading || itemGroupGridId === null}
                >
                  {gridColumnsLoading ? "Loading..." : "Retry Headers"}
                </button>
              </div>
            ) : null}
            <ReusableTable
              columns={columns}
              rows={rows}
              rowKey="__rowId"
              title={`${effectiveTitle} List`}
              minWidth="980px"
              activeRowKey={selectedRowId}
              onRowClick={(row) => setSelectedRowId(row.__rowId)}
              onCreate={openCreateModal}
              createLabel={`Add ${effectiveTitle}`}
              onView={handleRowView}
              onUpdate={handleRowUpdate}
              onDelete={handleRowDelete}
              isViewDisabled={() => createLoading || detailsLoading}
              isUpdateDisabled={() => createLoading || detailsLoading}
              isDeleteDisabled={() =>
                deleteLoading || createLoading || detailsLoading
              }
              actionsAsIcons
              updateLabel="Update"
              deleteLabel={deleteLoading ? "Deleting..." : "Delete"}
              searchable
              searchQuery={searchTerm}
              onSearchQueryChange={setSearchTerm}
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
              tableMaxHeight={TABLE_MAX_HEIGHT}
              fullViewHeight={false}
              stickyHeader
              emptyText={
                loading ? "Loading group data..." : "No group data found"
              }
            />
          </section>
        </div>
      </div>
      <ERPDynamicModalForm
        title={`${effectiveTitle} Form`}
        description="Create and update item groups."
        variants={modalVariants}
        showDefaultCards={false}
        hideSectionHeader
        submitError={createError}
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
