"use client";

import { useEffect, useMemo, useState } from "react";
import CrudMasterPage from "@/components/master/crud-master-page";
import type { CrudMasterTableColumnHeaders } from "@/components/master/crud-master-page";
import { useApi } from "@/hooks/useApi";
import type {
  ERPDynamicModalField,
  ERPDynamicSelectOption,
} from "@/components/library/ui/dynamic-modal-form";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import {
  fetchGridColumns,
  selectGridColumns,
  selectGridColumnsLoading,
  selectGridColumnsRequested,
  type GridColumnConfig,
} from "@/store/slices/gridColumnsSlice";
import styles from "./page.module.scss";

const API_ENDPOINTS = {
  list: "/account-groups/list",
  getById: "/account-groups/get",
  create: "/account-groups/create",
  delete: "/account-groups/delete",
} as const;

const LOOKUP_ENDPOINT = "/master-lookups/name-id/all-accounts-and-masters";
const GRID_DETAILS_ENDPOINT = "/grid-details/list";

const LOOKUP_QUERY_ACCOUNT_GROUPS = {
  module: "accountGroups",
  limit: "20",
} as const;

const GRID_COLUMNS_PAGE = 1;
const GRID_COLUMNS_LIMIT = 20;
const ACCOUNT_GROUP_TABLE_NAME = "account_groups";

const GRID_DETAILS_QUERY = {
  grid_status: "true",
  search: ACCOUNT_GROUP_TABLE_NAME,
  page: "1",
  limit: "20",
} as const;

const LOOKUP_KEYS = {
  id: ["accGroupId", "acc_group_id", "id", "_id"],
  code: ["accGroupAlias", "acc_group_alias", "accGroupShort", "acc_group_short", "code"],
  name: ["accGroupName", "acc_group_name", "name"],
  short: ["accGroupShort", "acc_group_short", "short", "short_name", "shortName"],
  alias: ["accGroupAlias", "acc_group_alias", "alias"],
  active: ["accGroupIsActive", "acc_group_is_active", "isActive", "is_active", "status"],
  position: ["accGroupSort", "acc_group_sort", "position", "sort"],
  description: ["accGroupDescription", "acc_group_description", "description", "desc"],
  array: ["data", "items", "results", "rows", "list", "accountGroups", "account_groups"],
} as const;

const REQUEST_PAYLOAD_KEYS = {
  id: "accGroupId",
  name: "accGroupName",
  alias: "accGroupAlias",
  short: "accGroupShort",
  description: "accGroupDescription",
  sort: "accGroupSort",
} as const;

const GROUP_PARENT_ID_KEYS = ["accGroupParentId", "acc_group_parent_id"] as const;

const LOOKUP_ARRAY_KEYS = ["items", "data", "results", "rows", "list"] as const;
const GRID_DETAIL_ID_KEYS = ["grid_id", "gridId", "id"] as const;
const GRID_DETAIL_SQL_KEYS = ["grid_sql", "gridSql", "sql"] as const;
const TABLE_COLUMN_HEADER_ORDER = [
  "serialNo",
  "masterCode",
  "masterName",
  "masterShort",
  "position",
  "masterActive",
] as const;

type TableColumnHeaderKey = (typeof TABLE_COLUMN_HEADER_ORDER)[number];

const TABLE_COLUMN_TOKEN_MAP: Record<string, TableColumnHeaderKey> = {
  sno: "serialNo",
  srno: "serialNo",
  serialno: "serialNo",
  serialnumber: "serialNo",
  code: "masterCode",
  groupcode: "masterCode",
  groupalias: "masterCode",
  alias: "masterCode",
  accgroupalias: "masterCode",
  name: "masterName",
  groupname: "masterName",
  accgroupname: "masterName",
  short: "masterShort",
  shortname: "masterShort",
  groupshort: "masterShort",
  accgroupshort: "masterShort",
  position: "position",
  sort: "position",
  order: "position",
  accgroupsort: "position",
  status: "masterActive",
  active: "masterActive",
  isactive: "masterActive",
  accgroupisactive: "masterActive",
};

const DEFAULT_SELECT_OPTION: ERPDynamicSelectOption = {
  value: "",
  label: "None",
};

const ACCOUNT_GROUP_INITIAL_FORM_VALUES = {
  masterName: "",
  masterAlias: "",
  masterShortName: "",
  accGroupParentId: "",
  position: "0",
} as const;

function buildAccountGroupFormFields(
  parentGroupOptions: ERPDynamicSelectOption[],
): ERPDynamicModalField[] {
  return [
    {
      name: "masterName",
      label: "Group Name",
      required: true,
      colSpan: 2,
      validation: {
        minLength: 2,
        minLengthMessage: "Group Name must be at least 2 characters.",
      },
    },
    // {
    //   name: "masterAlias",
    //   label: "Group Alias",
    // },
    {
      name: "masterShortName",
      label: "Group Short",
      colSpan: 2,
    },
    {
      name: "accGroupParentId",
      label: "Group Parent",
      type: "select",
      colSpan: 2,
      searchable: true,
      options: parentGroupOptions,
      
    },
    {
      name: "position",
      label: "Group Sort",
      type: "number",
      colSpan: 1,
      min: 0,
      step: 1,
      validation: {
        minMessage: "Group Sort must be 0 or greater.",
      },
    },
    {
      name: "masterDescription",
      label: "Group Description",
       colSpan:2
    }
  ];
}

function getFirstDefinedValue(
  source: Record<string, unknown>,
  keys: readonly string[],
): unknown {
  for (const key of keys) {
    const value = source[key];
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

  if (typeof value === "number" || typeof value === "bigint") {
    return String(value);
  }

  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }

  if (typeof value === "object") {
    const nested = value as Record<string, unknown>;
    const fallback = nested.value ?? nested.id ?? nested.code ?? nested.name ?? nested.label;

    if (
      typeof fallback === "string" ||
      typeof fallback === "number" ||
      typeof fallback === "bigint" ||
      typeof fallback === "boolean"
    ) {
      return String(fallback);
    }
  }

  return "";
}

function toInteger(value: string, fallback: number): number {
  const parsed = Number.parseInt(value.trim(), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toNullableReference(value: string): string | null {
  const normalized = value.trim();
  return normalized ? normalized : null;
}

function extractRows(payload: unknown, arrayKeys: readonly string[]): unknown[] {
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

    if (value && typeof value === "object" && !Array.isArray(value)) {
      const nestedObject = value as Record<string, unknown>;
      for (const nestedKey of arrayKeys) {
        const nestedValue = nestedObject[nestedKey];
        if (Array.isArray(nestedValue)) {
          return nestedValue;
        }
      }
    }
  }

  const firstArray = Object.values(objectPayload).find((value) => Array.isArray(value));
  return Array.isArray(firstArray) ? firstArray : [];
}

function buildLookupOptions(payload: unknown, includeEmptyOption = false): ERPDynamicSelectOption[] {
  const optionMap = new Map<string, string>();
  const rows = extractRows(payload, LOOKUP_ARRAY_KEYS);

  for (const row of rows) {
    if (!row || typeof row !== "object" || Array.isArray(row)) {
      continue;
    }

    const source = row as Record<string, unknown>;
    const id = toDisplayValue(getFirstDefinedValue(source, ["id", "value"]));
    if (!id) {
      continue;
    }

    const name = toDisplayValue(getFirstDefinedValue(source, ["name", "label"]));
    const label = name || id;

    if (!optionMap.has(id)) {
      optionMap.set(id, label);
    }
  }

  const options = Array.from(optionMap.entries())
    .map(([value, label]) => ({ value, label }))
    .sort((left, right) => left.label.localeCompare(right.label));

  if (!includeEmptyOption) {
    return options;
  }

  return [DEFAULT_SELECT_OPTION, ...options];
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

function resolveAccountGroupGridId(payload: unknown): number | null {
  const rows = extractRows(payload, LOOKUP_ARRAY_KEYS);

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
    if (!gridSql || gridSql.includes(ACCOUNT_GROUP_TABLE_NAME)) {
      return gridId;
    }
  }

  for (const row of rows) {
    if (!row || typeof row !== "object" || Array.isArray(row)) {
      continue;
    }

    const source = row as Record<string, unknown>;
    const gridId = resolveNumericId(getFirstDefinedValue(source, GRID_DETAIL_ID_KEYS));
    if (gridId !== null) {
      return gridId;
    }
  }

  return null;
}

function resolveHeaderKeyFromGridColumn(column: GridColumnConfig): TableColumnHeaderKey | null {
  const candidates = [column.accessorKey, column.key, column.header];

  for (const candidate of candidates) {
    if (!candidate) {
      continue;
    }

    const normalized = normalizeColumnToken(candidate);
    if (!normalized) {
      continue;
    }

    const direct = TABLE_COLUMN_TOKEN_MAP[normalized];
    if (direct) {
      return direct;
    }

    const compact = normalized.replace(/_/g, "");
    const compactMatch = TABLE_COLUMN_TOKEN_MAP[compact];
    if (compactMatch) {
      return compactMatch;
    }
  }

  return null;
}

function buildTableColumnHeadersFromGridColumns(
  gridColumns: GridColumnConfig[],
): CrudMasterTableColumnHeaders {
  const headers: CrudMasterTableColumnHeaders = {};
  const fallbackHeaders: string[] = [];

  const visibleColumns = gridColumns
    .filter((column) => column.visible)
    .sort((left, right) => left.order - right.order);

  for (const column of visibleColumns) {
    const headerLabel = column.header.trim();
    if (!headerLabel) {
      continue;
    }

    const target = resolveHeaderKeyFromGridColumn(column);
    if (target && !headers[target]) {
      headers[target] = headerLabel;
      continue;
    }

    fallbackHeaders.push(headerLabel);
  }

  for (const target of TABLE_COLUMN_HEADER_ORDER) {
    if (headers[target]) {
      continue;
    }

    const fallbackHeader = fallbackHeaders.shift();
    if (fallbackHeader) {
      headers[target] = fallbackHeader;
    }
  }

  return headers;
}

export default function AccountLedgerGroupsMasterPage() {
  const dispatch = useAppDispatch();
  const { getAll: getParentGroupLookup } = useApi<unknown>(LOOKUP_ENDPOINT);
  const { getAll: getGridDetails } = useApi<unknown>(GRID_DETAILS_ENDPOINT);

  const [parentGroupOptions, setParentGroupOptions] = useState<ERPDynamicSelectOption[]>([
    DEFAULT_SELECT_OPTION,
  ]);
  const [accountGroupGridId, setAccountGroupGridId] = useState<number | null>(null);
  const selectedGridId = accountGroupGridId ?? -1;
  const gridColumns = useAppSelector((state) => selectGridColumns(state, selectedGridId));
  const gridColumnsLoading = useAppSelector((state) =>
    selectGridColumnsLoading(state, selectedGridId),
  );
  const gridColumnsRequested = useAppSelector((state) =>
    selectGridColumnsRequested(state, selectedGridId),
  );

  useEffect(() => {
    let mounted = true;

    void (async () => {
      try {
        const parentGroupsPayload = await getParentGroupLookup(LOOKUP_QUERY_ACCOUNT_GROUPS);

        if (!mounted) {
          return;
        }

        setParentGroupOptions(buildLookupOptions(parentGroupsPayload, true));
      } catch {
        if (!mounted) {
          return;
        }

        setParentGroupOptions([DEFAULT_SELECT_OPTION]);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [getParentGroupLookup]);

  useEffect(() => {
    let mounted = true;

    void (async () => {
      try {
        const gridDetailsPayload = await getGridDetails(GRID_DETAILS_QUERY);

        if (!mounted) {
          return;
        }

        setAccountGroupGridId(resolveAccountGroupGridId(gridDetailsPayload));
      } catch {
        if (!mounted) {
          return;
        }

        setAccountGroupGridId(null);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [getGridDetails]);

  useEffect(() => {
    if (accountGroupGridId === null || gridColumnsRequested || gridColumnsLoading) {
      return;
    }

    void dispatch(
      fetchGridColumns({
        gridId: accountGroupGridId,
        page: GRID_COLUMNS_PAGE,
        limit: GRID_COLUMNS_LIMIT,
      }),
    );
  }, [accountGroupGridId, dispatch, gridColumnsLoading, gridColumnsRequested]);

  const accountGroupFormFields = useMemo(
    () => buildAccountGroupFormFields(parentGroupOptions),
    [parentGroupOptions],
  );
  const tableColumnHeaders = useMemo(
    () => buildTableColumnHeadersFromGridColumns(gridColumns),
    [gridColumns],
  );

  return (
    <CrudMasterPage
      title="Account Group"
      entityLabel="account group"
      entityLabelPlural="account groups"
      apiEndpoints={API_ENDPOINTS}
      lookupKeys={LOOKUP_KEYS}
      requestPayloadKeys={REQUEST_PAYLOAD_KEYS}
      styles={styles}
      listTitle="Account Group List"
      createLabel="Add"
      codeColumnHeader="Group Code"
      nameColumnHeader="Group Name"
      tableColumnHeaders={tableColumnHeaders}
      nameFieldLabel="Group Name"
      nameFieldPlaceholder="Sundry Debtors"
      formTitle="Account Group Form"
      formDescription="Create and update account groups."
      customFields={accountGroupFormFields}
      createInitialValues={ACCOUNT_GROUP_INITIAL_FORM_VALUES}
      mapFormValues={({ source, defaults }) => {
        const rowSource = source ?? {};

        return {
          ...ACCOUNT_GROUP_INITIAL_FORM_VALUES,
          masterName:
            toDisplayValue(getFirstDefinedValue(rowSource, LOOKUP_KEYS.name)) || defaults.masterName,
          masterAlias:
            toDisplayValue(getFirstDefinedValue(rowSource, LOOKUP_KEYS.alias)) ||
            defaults.masterAlias,
          masterShortName:
            toDisplayValue(getFirstDefinedValue(rowSource, LOOKUP_KEYS.short)) ||
            defaults.masterShortName,
          accGroupParentId: toDisplayValue(
            getFirstDefinedValue(rowSource, GROUP_PARENT_ID_KEYS),
          ),
          position:
            toDisplayValue(getFirstDefinedValue(rowSource, LOOKUP_KEYS.position)) || defaults.position,
        };
      }}
      buildRequestPayload={({ values, shouldUpdate, editingItemId }) => {
        const groupName = (values.masterName ?? "").trim();
        const groupAlias = (values.masterAlias ?? "").trim();
        const groupShort = (values.masterShortName ?? "").trim();
        const groupSort = Math.max(0, toInteger(values.position ?? "0", 0));

        return {
          accGroupName: groupName,
          accGroupAlias: groupAlias || null,
          accGroupShort: groupShort || null,
          accGroupTypeCode: "AG",
          accGroupParentId: toNullableReference(values.accGroupParentId ?? ""),
          accGroupSort: groupSort,
          ...(shouldUpdate && editingItemId !== null
            ? { accGroupId: String(editingItemId) }
            : {}),
        };
      }}
    />
  );
}
