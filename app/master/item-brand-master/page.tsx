"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import DeleteConfirmModal from "@/components/ui/delete-confirm-modal";
import ReusableTable, { type ReusableTableColumn } from "@/components/ui/table";
import { useApi } from "@/hooks/useApi";
import styles from "../state-master/page.module.scss";
import {
  ERPDynamicModalForm,
  type ERPDynamicModalController,
  type ERPDynamicModalField,
  type ERPDynamicModalSubmitPayload,
  type ERPDynamicModalVariant,
} from "@/components/library/ui/dynamic-modal-form";

const API_ENDPOINTS = {
  LIST: "/item-brands/list",
  GET_BY_ID: "/item-brands/get",
  CREATE: "/item-brands/create",
  DELETE: "/item-brands/delete",
} as const;

const DEBOUNCE_MS = 300;
const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 20;
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
} as const;

const ARRAY_KEYS = [
  "data",
  "items",
  "results",
  "rows",
  "list",
  "brands",
  "itemBrands",
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

const BRAND_ID_KEYS = [
  "brand_id",
  "brandId",
  "id",
  "_id",
  "itb_id",
  "itembrandid",
  "item_brand_id",
  "itemBrandId",
] as const;
const BRAND_CODE_KEYS = [
  "brand_code",
  "brandCode",
  "code",
  "itb_alias",
  "itb_short",
  "brandalias",
  "brandshort",
] as const;
const BRAND_NAME_KEYS = [
  "brand_name",
  "brandName",
  "name",
  "itb_name",
  "itembrandname",
  "item_brand_name",
  "itemBrandName",
] as const;
const BRAND_SHORT_KEYS = [
  "itb_short",
  "short_name",
  "shortName",
  "short",
  "brandshort",
  "itembrandshort",
  "item_brand_short",
] as const;
const BRAND_ALIAS_KEYS = [
  "itb_alias",
  "alias",
  "brand_alias",
  "brandalias",
  "itembrandalias",
  "item_brand_alias",
] as const;
const BRAND_ACTIVE_KEYS = [
  "itb_active",
  "active",
  "is_active",
  "isActive",
  "isactive",
  "status",
] as const;
const BRAND_POSITION_KEYS = ["position", "itb_sort", "sort"] as const;
const BRAND_DESCRIPTION_KEYS = [
  "itb_description",
  "description",
  "desc",
] as const;

const INITIAL_FORM_STATE = {
  itemBrandName: "",
  searchCode: "",
  itemAlias: "",
  itemShortName: "",
  itemDescription: "",
  position: "",
} as const;

type ItemBrandTableRow = {
  __rowId: string | number;
  __recordId: string | number;
  __source: Record<string, unknown> | null;
  serialNo: number;
  brandId: string;
  brandCode: string;
  brandName: string;
  brandShort: string;
  brandAlias: string;
  brandActive: string;
  position: string;
};

type ItemBrandFormState = {
  itemBrandName: string;
  searchCode: string;
  itemAlias: string;
  itemShortName: string;
  itemDescription: string;
  position: string;
};

type CreateItemBrandRequest = {
  brand_name: string;
  brand_alias: string;
  brand_short: string;
  brand_description: string;
  brand_parent_id: Record<string, unknown>;
  brand_sort: number;
  brand_level: number;
  brand_photo: Record<string, unknown>;
  brand_photo_url: string;
  brand_id?: string | number;
};

const DEFAULT_ITEM_BRAND_COLUMNS: ReusableTableColumn<ItemBrandTableRow>[] = [
  {
    key: "serialNo",
    header: "S.No",
    accessor: "serialNo",
    align: "left",
    width: "56px",
    sortable: false,
  },
  {
    key: "brandCode",
    header: "Brand Code",
    accessor: "brandCode",
    align: "left",
    width: "210px",
  },
  {
    key: "brandName",
    header: "Brand Name",
    accessor: "brandName",
    align: "left",
    width: "280px",
  },
  {
    key: "brandShort",
    header: "Short Name",
    accessor: "brandShort",
    align: "left",
    width: "160px",
  },
  {
    key: "position",
    header: "Position",
    accessor: "position",
    align: "left",
    width: "100px",
    sortAccessor: (row) => Number(row.position || 0),
  },
  {
    key: "brandActive",
    header: "Status",
    accessor: "brandActive",
    align: "left",
    width: "120px",
  },
];

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
      nestedValue.brand_id ??
      nestedValue.itb_id ??
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

function buildItemBrandRows(
  payload: unknown,
  serialOffset = 0,
): ItemBrandTableRow[] {
  return extractRows(payload).map((item, index) => {
    const serialNo = serialOffset + index + 1;

    if (item && typeof item === "object" && !Array.isArray(item)) {
      const row = item as Record<string, unknown>;
      const brandIdValue = getFirstDefinedValue(row, BRAND_ID_KEYS);
      const brandCodeValue = getFirstDefinedValue(row, BRAND_CODE_KEYS);
      const brandNameValue = getFirstDefinedValue(row, BRAND_NAME_KEYS);
      const brandShortValue = getFirstDefinedValue(row, BRAND_SHORT_KEYS);
      const brandAliasValue = getFirstDefinedValue(row, BRAND_ALIAS_KEYS);
      const brandActiveValue = getFirstDefinedValue(row, BRAND_ACTIVE_KEYS);
      const positionValue = getFirstDefinedValue(row, BRAND_POSITION_KEYS);

      const preferredKey =
        brandIdValue ??
        row.id ??
        row._id ??
        row.brandId ??
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
        brandId: toDisplayValue(brandIdValue) || String(serialNo),
        brandCode: toDisplayValue(brandCodeValue),
        brandName: toDisplayValue(brandNameValue),
        brandShort: toDisplayValue(brandShortValue),
        brandAlias: toDisplayValue(brandAliasValue),
        brandActive: toDisplayValue(brandActiveValue),
        position: toDisplayValue(positionValue),
      };
    }

    return {
      __rowId: serialNo,
      __recordId: serialNo,
      __source: null,
      serialNo,
      brandId: String(serialNo),
      brandCode: "",
      brandName: toDisplayValue(item),
      brandShort: "",
      brandAlias: "",
      brandActive: "",
      position: "",
    };
  });
}
function mapRowToFormState(row: ItemBrandTableRow): ItemBrandFormState {
  if (!row.__source) {
    return {
      itemBrandName: row.brandName,
      searchCode: row.brandCode,
      itemAlias: row.brandAlias,
      itemShortName: row.brandShort,
      itemDescription: "",
      position: row.position,
    };
  }
  const source = row.__source;
  return {
    itemBrandName:
      toDisplayValue(getFirstDefinedValue(source, BRAND_NAME_KEYS)) ||
      row.brandName,
    searchCode:
      toDisplayValue(getFirstDefinedValue(source, BRAND_CODE_KEYS)) ||
      row.brandCode,
    itemAlias:
      toDisplayValue(getFirstDefinedValue(source, BRAND_ALIAS_KEYS)) ||
      row.brandAlias,
    itemShortName:
      toDisplayValue(getFirstDefinedValue(source, BRAND_SHORT_KEYS)) ||
      row.brandShort,
    itemDescription: toDisplayValue(
      getFirstDefinedValue(source, BRAND_DESCRIPTION_KEYS),
    ),
    position:
      toDisplayValue(getFirstDefinedValue(source, BRAND_POSITION_KEYS)) ||
      row.position,
  };
}
function extractItemBrandDetailSource(
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
function mergeRowWithItemBrandDetail(
  row: ItemBrandTableRow,
  source: Record<string, unknown>,
): ItemBrandTableRow {
  const brandIdValue = getFirstDefinedValue(source, BRAND_ID_KEYS);
  const recordId =
    typeof brandIdValue === "string" || typeof brandIdValue === "number"
      ? brandIdValue
      : row.__recordId;
  return {
    ...row,
    __recordId: recordId,
    __source: source,
    brandId: toDisplayValue(brandIdValue) || row.brandId,
    brandCode:
      toDisplayValue(getFirstDefinedValue(source, BRAND_CODE_KEYS)) ||
      row.brandCode,
    brandName:
      toDisplayValue(getFirstDefinedValue(source, BRAND_NAME_KEYS)) ||
      row.brandName,
    brandShort:
      toDisplayValue(getFirstDefinedValue(source, BRAND_SHORT_KEYS)) ||
      row.brandShort,
    brandAlias:
      toDisplayValue(getFirstDefinedValue(source, BRAND_ALIAS_KEYS)) ||
      row.brandAlias,
    brandActive:
      toDisplayValue(getFirstDefinedValue(source, BRAND_ACTIVE_KEYS)) ||
      row.brandActive,
    position:
      toDisplayValue(getFirstDefinedValue(source, BRAND_POSITION_KEYS)) ||
      row.position,
  };
}
function resolveItbId(row: ItemBrandTableRow): string | number {
  if (row.__source) {
    const sourceItbId =
      row.__source.brand_id ?? row.__source.brandId ?? row.__source.itb_id;
    if (typeof sourceItbId === "string" || typeof sourceItbId === "number") {
      return sourceItbId;
    }
    const displayItbId = toDisplayValue(sourceItbId);
    if (displayItbId) {
      return displayItbId;
    }
  }
  return row.__recordId;
}
function useItemBrandData() {
  const { data, error, loading, getAll } = useApi<unknown>(API_ENDPOINTS.LIST);
  const {
    run: getItemBrandById,
    loading: detailsLoading,
    error: detailsError,
    reset: resetDetailsState,
  } = useApi<unknown>(API_ENDPOINTS.GET_BY_ID);
  const {
    run: upsertItemBrand,
    loading: saveLoading,
    error: saveError,
    reset: resetSaveState,
  } = useApi<unknown, CreateItemBrandRequest>(API_ENDPOINTS.CREATE, {
    method: "POST",
  });
  const {
    run: deleteItemBrand,
    loading: deleteLoading,
    error: deleteError,
  } = useApi<unknown>(API_ENDPOINTS.DELETE, { method: "DELETE" });
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(DEFAULT_PAGE);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [totalEntries, setTotalEntries] = useState(0);
  const loadItemBrands = useCallback(
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
      void loadItemBrands(searchTerm, currentPage, pageSize);
    }, DEBOUNCE_MS);
    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [currentPage, loadItemBrands, pageSize, searchTerm]);
  const serialOffset = Math.max(0, (currentPage - 1) * pageSize);
  const rows = useMemo(
    () => buildItemBrandRows(data, serialOffset),
    [data, serialOffset],
  );
  return {
    data,
    error,
    loading,
    detailsLoading,
    detailsError,
    saveLoading,
    saveError,
    deleteLoading,
    deleteError,
    searchTerm,
    setSearchTerm,
    currentPage,
    setCurrentPage,
    pageSize,
    setPageSize,
    totalEntries,
    loadItemBrands,
    getItemBrandById,
    upsertItemBrand,
    deleteItemBrand,
    resetDetailsState,
    resetSaveState,
    rows,
  };
}
export default function ItemBrandMasterPage() {
  const modalControllerRef = useRef<ERPDynamicModalController | null>(null);
  const {
    error,
    loading,
    detailsLoading,
    detailsError,
    saveLoading,
    saveError,
    deleteLoading,
    deleteError,
    searchTerm,
    setSearchTerm,
    currentPage,
    setCurrentPage,
    pageSize,
    setPageSize,
    totalEntries,
    loadItemBrands,
    getItemBrandById,
    upsertItemBrand,
    deleteItemBrand,
    resetDetailsState,
    resetSaveState,
    rows,
  } = useItemBrandData();
  const [selectedRowId, setSelectedRowId] = useState<string | number | null>(
    null,
  );
  const [editingItemId, setEditingItemId] = useState<string | number | null>(
    null,
  );
  const [pendingDeleteRow, setPendingDeleteRow] =
    useState<ItemBrandTableRow | null>(null);
  const selectedRow = useMemo(
    () => rows.find((row) => row.__rowId === selectedRowId) ?? null,
    [rows, selectedRowId],
  );
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
      pendingDeleteRow.brandName ||
      pendingDeleteRow.brandCode ||
      pendingDeleteRow.brandId
    );
  }, [pendingDeleteRow]);
  const openCreateModal = useCallback(() => {
    resetSaveState();
    resetDetailsState();
    setEditingItemId(null);
    modalControllerRef.current?.openModal("item-brand-create", {
      values: INITIAL_FORM_STATE,
    });
  }, [resetDetailsState, resetSaveState]);
  const openUpdateModalForRow = useCallback(
    (row: ItemBrandTableRow) => {
      resetSaveState();
      resetDetailsState();
      setSelectedRowId(row.__rowId);
      const updateItbId = resolveItbId(row);
      setEditingItemId(updateItbId);
      void (async () => {
        try {
          const payload = await getItemBrandById({
            query: {
              brand_id: String(updateItbId),
            },
          });
          const detailSource = extractItemBrandDetailSource(payload);
          const detailRow = detailSource
            ? mergeRowWithItemBrandDetail(row, detailSource)
            : row;
          setEditingItemId(resolveItbId(detailRow));
          modalControllerRef.current?.openModal("item-brand-update", {
            values: mapRowToFormState(detailRow),
          });
        } catch {
          // Error UI is driven by detailsError from useApi.
        }
      })();
    },
    [getItemBrandById, resetDetailsState, resetSaveState],
  );
  const openViewModalForRow = useCallback(
    (row: ItemBrandTableRow) => {
      resetSaveState();
      resetDetailsState();
      setSelectedRowId(row.__rowId);
      setEditingItemId(null);
      const viewItbId = resolveItbId(row);
      void (async () => {
        try {
          const payload = await getItemBrandById({
            query: {
              brand_id: String(viewItbId),
            },
          });
          const detailSource = extractItemBrandDetailSource(payload);
          const detailRow = detailSource
            ? mergeRowWithItemBrandDetail(row, detailSource)
            : row;

          modalControllerRef.current?.openModal("item-brand-view", {
            values: mapRowToFormState(detailRow),
          });
        } catch {
          // Error UI is driven by detailsError from useApi.
        }
      })();
    },
    [getItemBrandById, resetDetailsState, resetSaveState],
  );
  const handleModalSubmit = useCallback(
    async ({ variantKey, values }: ERPDynamicModalSubmitPayload) => {
      if (variantKey === "item-brand-view") {
        return;
      }
      const itemBrandName = (values.itemBrandName ?? "").trim();
      const searchCode = (values.searchCode ?? "").trim();
      const itemAlias = (values.itemAlias ?? "").trim();
      const itemShortName = (values.itemShortName ?? "").trim();
      const itemDescription = (values.itemDescription ?? "").trim();
      const parsedSort = Number.parseInt((values.position ?? "").trim(), 10);
      const brandSort = Number.isFinite(parsedSort) ? parsedSort : 0;
      const aliasValue = itemAlias || searchCode;
      const shortValue = itemShortName || searchCode || aliasValue;
      const shouldUpdate = variantKey === "item-brand-update";
      const payload: CreateItemBrandRequest = {
        brand_name: itemBrandName,
        brand_alias: aliasValue,
        brand_short: shortValue,
        brand_description: itemDescription,
        brand_parent_id: {},
        brand_sort: brandSort,
        brand_level: 0,
        brand_photo: {},
        brand_photo_url: "",
        ...(shouldUpdate && editingItemId !== null
          ? { brand_id: editingItemId }
          : {}),
      };
      await upsertItemBrand({ body: payload });
      setEditingItemId(null);
      await loadItemBrands(searchTerm, currentPage, pageSize);
    },
    [
      currentPage,
      editingItemId,
      loadItemBrands,
      pageSize,
      searchTerm,
      upsertItemBrand,
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
    (row: ItemBrandTableRow) => {
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
        const deleteItbId = resolveItbId(row);
        await deleteItemBrand({
          query: {
            brand_id: String(deleteItbId),
          },
        });
        setSelectedRowId((current) =>
          current === row.__rowId ? null : current,
        );
        if (editingItemId === deleteItbId) {
          setEditingItemId(null);
          modalControllerRef.current?.closeModal();
        }
        setPendingDeleteRow(null);
        await loadItemBrands(searchTerm, currentPage, pageSize);
      } catch {
        // Error UI is driven by deleteError from useApi.
      }
    })();
  }, [
    currentPage,
    deleteItemBrand,
    deleteLoading,
    detailsLoading,
    editingItemId,
    loadItemBrands,
    pageSize,
    pendingDeleteRow,
    saveLoading,
    searchTerm,
  ]);
  const itemBrandFields = useMemo<ERPDynamicModalField[]>(
    () => [
      {
        name: "itemBrandName",
        label: "Item Brand Name",
        required: true,
        colSpan: 2,
        validation: {
          minLength: 2,
          minLengthMessage: "Item Brand Name must be at least 2 characters.",
        },
      },
      {
        name: "itemAlias",
        label: "Alias",
        colSpan: 2,
      },
      {
        name: "itemShortName",
        label: "Short Name",
        colSpan: 2,
      },
      {
        name: "position",
        label: "Position",
        type: "number",
        colSpan: 1,
        min: 0,
        step: 1,
        validation: {
          minMessage: "Position must be 0 or greater.",
        },
      },

      {
        name: "itemDescription",
        label: "Description",
        colSpan: 2,
      },
      {
        name: "brandPhoto",
        label: "Image",
        type: "file",
        accept: "image/*",
        maxFileSizeBytes: FILE_CONSTRAINTS.MAX_UPLOAD_IMAGE_BYTES,
        allowedMimeTypes: [...FILE_CONSTRAINTS.ALLOWED_MIME_TYPES],
        helperText: "Optional. Sent as base64 in sec_photo.",
        colSpan: 2,
      },
    ],
    [],
  );
  const itemBrandViewFields = useMemo<ERPDynamicModalField[]>(
    () =>
      itemBrandFields.map((field) => ({
        ...field,
        disabled: true,
        required: false,
        validation: undefined,
      })),
    [itemBrandFields],
  );
  const modalVariants = useMemo<ERPDynamicModalVariant[]>(
    () => [
      {
        key: "item-brand-view",
        cardTitle: "View Item Brand",
        cardDescription: "View selected item brand details.",
        cardButtonLabel: "View",
        modalTitle: "Item Brand Details",
        modalDescription: "Read-only view of selected item brand data.",
        submitLabel: "Close",
        accent: "indigo",
        fields: itemBrandViewFields,
      },
      {
        key: "item-brand-create",
        cardTitle: "Create Item Brand",
        cardDescription: "Create a new brand for items.",
        cardButtonLabel: "Create",
        modalTitle: "New Item Brand",
        modalDescription: "Configure item brand details.",
        submitLabel: saveLoading ? "Saving..." : "Save",
        accent: "blue",
        fields: itemBrandFields,
      },
      {
        key: "item-brand-update",
        cardTitle: "Update Item Brand",
        cardDescription: "Update an existing brand.",
        cardButtonLabel: "Update",
        modalTitle: "Edit Item Brand",
        modalDescription: "Update selected item brand details.",
        submitLabel: saveLoading ? "Updating..." : "Update",
        accent: "emerald",
        fields: itemBrandFields,
      },
    ],
    [itemBrandFields, itemBrandViewFields, saveLoading],
  );
  const handleRowUpdate = useCallback(
    (row: ItemBrandTableRow) => {
      setSelectedRowId(row.__rowId);
      openUpdateModalForRow(row);
    },
    [openUpdateModalForRow],
  );
  const handleRowView = useCallback(
    (row: ItemBrandTableRow) => {
      openViewModalForRow(row);
    },
    [openViewModalForRow],
  );
  const handleRowDelete = useCallback(
    (row: ItemBrandTableRow) => {
      setSelectedRowId(row.__rowId);
      handleDeleteRow(row);
    },
    [handleDeleteRow],
  );
  const handleSearchChange = useCallback(
    (query: string) => {
      setCurrentPage(DEFAULT_PAGE);
      setSearchTerm(query);
    },
    [setCurrentPage, setSearchTerm],
  );
  return (
    <main className={styles.page}>
      <div className={styles.viewport}>
        <div className={styles.board}>
          <section className={styles.content}>
            {error ? (
              <div className={styles.errorBox}>
                <p className={styles.errorText}>
                  Unable to load brand data: {error}
                </p>
                <button
                  type="button"
                  className={styles.retryButton}
                  onClick={() =>
                    void loadItemBrands(searchTerm, currentPage, pageSize)
                  }
                >
                  Retry
                </button>
              </div>
            ) : null}
            {deleteError ? (
              <div className={styles.errorBox}>
                <p className={styles.errorText}>
                  Unable to delete selected brand: {deleteError}
                </p>
              </div>
            ) : null}
            {detailsError ? (
              <div className={styles.errorBox}>
                <p className={styles.errorText}>
                  Unable to load selected brand details: {detailsError}
                </p>
              </div>
            ) : null}
            <section className={styles.tableSection}>
              <ReusableTable
                columns={DEFAULT_ITEM_BRAND_COLUMNS}
                rows={rows}
                rowKey="__rowId"
                title="Item Brand List"
                minWidth="980px"
                wrapperClassName={styles.tableWrapper}
                tableClassName={styles.listTable}
                activeRowKey={selectedRowId}
                onRowClick={(row) => setSelectedRowId(row.__rowId)}
                onCreate={openCreateModal}
                createLabel="Add Item Brand"
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
                  loading ? "Loading brand data..." : "No brand data found"
                }
              />
            </section>
          </section>
        </div>
      </div>
      <ERPDynamicModalForm
        title="Item Brand Form"
        description="Create and update item brands."
        variants={modalVariants}
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
        title="Delete Item Brand?"
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
