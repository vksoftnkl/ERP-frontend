"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import DeleteConfirmModal from "@/components/ui/delete-confirm-modal";
import ReusableTable, { type ReusableTableColumn } from "@/components/ui/table";
import { useApi } from "@/hooks/useApi";
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

const DEFAULT_ARRAY_KEYS = ["data", "items", "results", "rows", "list"] as const;
const PAGINATION_CONTAINER_KEYS = ["meta", "pagination", "pageInfo", "pager"] as const;
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
const CURRENT_PAGE_KEYS = ["page", "currentPage", "current_page", "pageNo", "page_no"] as const;
const PAGE_SIZE_KEYS = ["limit", "pageSize", "page_size", "perPage", "per_page"] as const;

const DEFAULT_ACTIVE_KEYS = ["active", "is_active", "isActive", "isactive", "status"] as const;
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
  mapFormValues?: (params: {
    source: Record<string, unknown> | null;
    defaults: MasterFormState;
  }) => Record<string, string>;
  buildRequestPayload?: (params: {
    values: CrudMasterFormValues;
    shouldUpdate: boolean;
    editingItemId: string | number | null;
    files: Record<string, File | null>;
  }) => Record<string, unknown> | Promise<Record<string, unknown>>;
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

  if (typeof value === "number" || typeof value === "bigint" || typeof value === "boolean") {
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
      const normalized = allowZero ? toNonNegativeInt(value) : toPositiveInt(value);
      if (normalized !== null) {
        return normalized;
      }
    }
  }

  return null;
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

    if (value && typeof value === "object") {
      const nestedObject = value as Record<string, unknown>;

      for (const nestedKey of arrayKeys) {
        const nestedValue = nestedObject[nestedKey];
        if (Array.isArray(nestedValue)) {
          return nestedValue;
        }
      }

      const nestedArray = Object.values(nestedObject).find((entry) => Array.isArray(entry));
      if (Array.isArray(nestedArray)) {
        return nestedArray;
      }
    }
  }

  const firstArray = Object.values(objectPayload).find((value) => Array.isArray(value));
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

  return extractRows(payload, lookupKeys.array ?? DEFAULT_ARRAY_KEYS).map((item, index) => {
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

      const preferredKey = idValue ?? row.id ?? row._id ?? row.code ?? serialNo;
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
  });
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
    masterName: toDisplayValue(getFirstDefinedValue(source, lookupKeys.name)) || row.masterName,
    searchCode: toDisplayValue(getFirstDefinedValue(source, lookupKeys.code)) || row.masterCode,
    masterAlias: toDisplayValue(getFirstDefinedValue(source, lookupKeys.alias)) || row.masterAlias,
    masterShortName:
      toDisplayValue(getFirstDefinedValue(source, lookupKeys.short)) || row.masterShort,
    masterDescription: toDisplayValue(getFirstDefinedValue(source, descriptionKeys)),
    position: toDisplayValue(getFirstDefinedValue(source, positionKeys)) || row.position,
  };
}

function extractDetailSource(payload: unknown): Record<string, unknown> | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return null;
  }

  const objectPayload = payload as Record<string, unknown>;
  const nestedData = objectPayload.data;

  if (nestedData && typeof nestedData === "object" && !Array.isArray(nestedData)) {
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
    typeof idValue === "string" || typeof idValue === "number" ? idValue : row.__recordId;

  return {
    ...row,
    __recordId: recordId,
    __source: source,
    masterId: toDisplayValue(idValue) || row.masterId,
    masterCode: toDisplayValue(getFirstDefinedValue(source, lookupKeys.code)) || row.masterCode,
    masterName: toDisplayValue(getFirstDefinedValue(source, lookupKeys.name)) || row.masterName,
    masterShort: toDisplayValue(getFirstDefinedValue(source, lookupKeys.short)) || row.masterShort,
    masterAlias: toDisplayValue(getFirstDefinedValue(source, lookupKeys.alias)) || row.masterAlias,
    masterActive:
      toDisplayValue(getFirstDefinedValue(source, activeKeys)) || row.masterActive,
    position: toDisplayValue(getFirstDefinedValue(source, positionKeys)) || row.position,
  };
}

function resolveRecordId(row: MasterTableRow, idKeys: readonly string[]): string | number {
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
  mapFormValues,
  buildRequestPayload,
}: CrudMasterPageProps) {
  const modalControllerRef = useRef<ERPDynamicModalController | null>(null);

  const { data, error, loading, getAll } = useApi<unknown>(apiEndpoints.list);
  const {
    run: getById,
    loading: detailsLoading,
    error: detailsError,
    reset: resetDetailsState,
  } = useApi<unknown>(apiEndpoints.getById);
  const {
    run: upsertRecord,
    loading: saveLoading,
    error: saveError,
    reset: resetSaveState,
  } = useApi<unknown, Record<string, unknown>>(apiEndpoints.create, { method: "POST" });
  const { run: deleteRecord, loading: deleteLoading, error: deleteError } = useApi<unknown>(
    apiEndpoints.delete,
    { method: "DELETE" },
  );

  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(DEFAULT_PAGE);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [totalEntries, setTotalEntries] = useState(0);

  const loadRecords = useCallback(
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
      const fallbackTotal = extractRows(payload, lookupKeys.array ?? DEFAULT_ARRAY_KEYS).length;
      const resolvedTotal = paginationInfo.totalEntries ?? fallbackTotal;

      setTotalEntries(Math.max(0, resolvedTotal));

      if (paginationInfo.currentPage !== null) {
        const nextPage = paginationInfo.currentPage;
        setCurrentPage((existingPage) =>
          existingPage === nextPage ? existingPage : toSafePageNumber(nextPage),
        );
      }

      if (paginationInfo.pageSize !== null) {
        const nextPageSize = paginationInfo.pageSize;
        setPageSize((existingPageSize) =>
          existingPageSize === nextPageSize ? existingPageSize : toSafePageSize(nextPageSize),
        );
      }
    },
    [getAll, lookupKeys.array],
  );

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void loadRecords(searchTerm, currentPage, pageSize);
    }, DEBOUNCE_MS);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [currentPage, loadRecords, pageSize, searchTerm]);

  const serialOffset = Math.max(0, (currentPage - 1) * pageSize);

  const rows = useMemo(
    () => buildMasterRows(data, serialOffset, lookupKeys),
    [data, lookupKeys, serialOffset],
  );

  const columns = useMemo<ReusableTableColumn<MasterTableRow>[]>(
    () => [
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
        header: tableColumnHeaders?.masterCode ?? codeColumnHeader ?? `${title} Code`,
        accessor: "masterCode",
        align: tableColumnLayout?.masterCode?.align,
        width: tableColumnLayout?.masterCode?.width,
      },
      {
        key: "masterName",
        header: tableColumnHeaders?.masterName ?? nameColumnHeader ?? `${title} Name`,
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
    ],
    [codeColumnHeader, nameColumnHeader, tableColumnHeaders, tableColumnLayout, title],
  );

  const [selectedRowId, setSelectedRowId] = useState<string | number | null>(null);
  const [editingItemId, setEditingItemId] = useState<string | number | null>(null);
  const [pendingDeleteRow, setPendingDeleteRow] = useState<MasterTableRow | null>(null);

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

    return pendingDeleteRow.masterName || pendingDeleteRow.masterCode || pendingDeleteRow.masterId;
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
          const payload = await getById({
            url: `${apiEndpoints.getById}/${encodeURIComponent(String(updateId))}`,
          });
          const detailSource = extractDetailSource(payload);
          const detailRow = detailSource ? mergeRowWithDetail(row, detailSource, lookupKeys) : row;
          setEditingItemId(resolveRecordId(detailRow, lookupKeys.id));
          const defaultValues = mapRowToFormState(detailRow, lookupKeys);
          modalControllerRef.current?.openModal("master-update", {
            values: mapFormValues
              ? mapFormValues({ source: detailRow.__source, defaults: defaultValues })
              : defaultValues,
          });
        } catch {
          // Error UI is driven by detailsError from useApi.
        }
      })();
    },
    [
      apiEndpoints.getById,
      getById,
      lookupKeys,
      mapFormValues,
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
          const payload = await getById({
            url: `${apiEndpoints.getById}/${encodeURIComponent(String(viewId))}`,
          });
          const detailSource = extractDetailSource(payload);
          const detailRow = detailSource ? mergeRowWithDetail(row, detailSource, lookupKeys) : row;
          const defaultValues = mapRowToFormState(detailRow, lookupKeys);
          modalControllerRef.current?.openModal("master-view", {
            values: mapFormValues
              ? mapFormValues({ source: detailRow.__source, defaults: defaultValues })
              : defaultValues,
          });
        } catch {
          // Error UI is driven by detailsError from useApi.
        }
      })();
    },
    [
      apiEndpoints.getById,
      getById,
      lookupKeys,
      mapFormValues,
      resetDetailsState,
      resetSaveState,
    ],
  );

  const handleModalSubmit = useCallback(
    async ({ variantKey, values, files }: ERPDynamicModalSubmitPayload) => {
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

      const payload = await Promise.resolve(
        buildRequestPayload?.({
          values: {
            masterName,
            searchCode,
            masterAlias,
            masterShortName,
            masterDescription,
            position: values.position ?? "",
            ...values,
          },
          shouldUpdate,
          editingItemId,
          files,
        }) ?? defaultPayload,
      );

      await upsertRecord({ body: payload });
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
          url: `${apiEndpoints.delete}/${encodeURIComponent(String(deleteId))}`,
        });

        setSelectedRowId((current) => (current === row.__rowId ? null : current));
        if (editingItemId === deleteId) {
          setEditingItemId(null);
          modalControllerRef.current?.closeModal();
        }
        setPendingDeleteRow(null);
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
    saveLoading,
    searchTerm,
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
        cardTitle: `View ${title}`,
        cardDescription: `View selected ${entityLabel} details.`,
        cardButtonLabel: "View",
        modalTitle: `${title} Details`,
        modalDescription: `Read-only view of selected ${entityLabel} data.`,
        submitLabel: "Close",
        accent: "indigo",
        fields: viewFields,
      },
      {
        key: "master-create",
        cardTitle: `Create ${title}`,
        cardDescription: `Create a new ${entityLabel}.`,
        cardButtonLabel: "Create",
        modalTitle: `New ${title}`,
        modalDescription: `Configure ${entityLabel} details.`,
        submitLabel: saveLoading ? "Saving..." : "Save",
        accent: "blue",
        fields,
      },
      {
        key: "master-update",
        cardTitle: `Update ${title}`,
        cardDescription: `Update an existing ${entityLabel}.`,
        cardButtonLabel: "Update",
        modalTitle: `Edit ${title}`,
        modalDescription: `Update selected ${entityLabel} details.`,
        submitLabel: saveLoading ? "Updating..." : "Update",
        accent: "emerald",
        fields,
      },
    ],
    [entityLabel, fields, saveLoading, title, viewFields],
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
                <p className={styles.errorText}>Unable to load {entityLabel} data: {error}</p>
                <button
                  type="button"
                  className={styles.retryButton}
                  onClick={() => void loadRecords(searchTerm, currentPage, pageSize)}
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
            <section className={styles.tableSection}>
              <ReusableTable
                columns={columns}
                rows={rows}
                rowKey="__rowId"
                title={listTitle ?? `${title} List`}
                minWidth="980px"
                wrapperClassName={styles.tableWrapper}
                tableClassName={styles.listTable}
                activeRowKey={selectedRowId}
                onRowClick={(row) => setSelectedRowId(row.__rowId)}
                onCreate={openCreateModal}
                createLabel={createLabel ?? `Add ${title}`}
                onView={handleRowView}
                onUpdate={handleRowUpdate}
                onDelete={handleRowDelete}
                isViewDisabled={() => saveLoading || detailsLoading}
                isUpdateDisabled={() => saveLoading || detailsLoading}
                isDeleteDisabled={() => deleteLoading || saveLoading || detailsLoading}
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
                emptyText={loading ? `Loading ${entityLabel} data...` : `No ${entityLabel} data found`}
              />
            </section>
          </section>
        </div>
      </div>
      <ERPDynamicModalForm
        title={formTitle ?? `${title} Form`}
        description={formDescription ?? `Create and update ${entityLabelPlural}.`}
        variants={variants}
        showDefaultCards={false}
        hideSectionHeader
        submitError={saveError}
        onControllerReady={(controller) => {
          modalControllerRef.current = controller;
        }}
        onSubmit={handleModalSubmit}
        onCancel={handleModalCancel}
      />
      <DeleteConfirmModal
        isOpen={pendingDeleteRow !== null}
        itemName={pendingDeleteLabel}
        title={`Delete ${title}?`}
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
