"use client";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import ErpHeader, { type ErpHeaderItem } from "@/components/layout/erp-header";
import ReusableTable, { type ReusableTableColumn } from "@/components/ui/table";
import { useApi } from "@/hooks/useApi";
import styles from "./page.module.scss";
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
  CREATE: "/item-groups/create",
  DELETE: "/item-groups/delete",
} as const;
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
const ARRAY_KEYS = ["data", "items", "results", "rows", "list", "groups", "itemGroups"] as const;
const GROUP_ID_KEYS = ["group_id", "groupId", "id", "_id", "itg_id"] as const;
const GROUP_CODE_KEYS = ["group_code", "groupCode", "code", "itg_alias", "itg_short"] as const;
const GROUP_NAME_KEYS = ["group_name", "groupName", "name", "itg_name"] as const;
const GROUP_POSITION_KEYS = ["position", "itg_sort", "sort"] as const;
const GROUP_ALIAS_KEYS = ["itg_alias", "alias", "group_alias"] as const;
const GROUP_SHORT_KEYS = ["itg_short", "short_name", "shortName", "short"] as const;
const GROUP_DESCRIPTION_KEYS = ["itg_description", "description", "desc"] as const;
const GROUP_PARENT_ID_KEYS = ["itg_parent_id", "parent_id", "parentId", "parent_group_id"] as const;
const HEADER_QUICK_TABS: ErpHeaderItem[] = [
  { label: "Sales Entry" },
  { label: "Sales Return" },
  { label: "SO Management" },
  { label: "Cashier Screen" },
  { label: "Import Invoices" },
  { label: "Item Group Master" },
  { label: "Gate Inward Entry" },
  { label: "SO Stock Position" },
  { label: "Profit & Loss" },
];
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
  itg_parent_id: Record<string, unknown>;
  itg_sort: number;
  itg_photo: Record<string, unknown>;
  itg_id?: string | number;
};
// Utility functions
function toReferenceObject(value: string): Record<string, unknown> {
  const normalizedValue = value.trim();
  return normalizedValue ? { id: normalizedValue } : {};
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
  }
  const firstArray = Object.values(objectPayload).find((value) => Array.isArray(value));
  return Array.isArray(firstArray) ? firstArray : [];
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
  const itemGroupName = toDisplayValue(getFirstDefinedValue(source, GROUP_NAME_KEYS)) || row.groupName;
  const searchCode = toDisplayValue(getFirstDefinedValue(source, GROUP_CODE_KEYS)) || row.groupCode;
  return {
    itemGroupName,
    searchCode,
    itemAlias: toDisplayValue(getFirstDefinedValue(source, GROUP_ALIAS_KEYS)),
    itemShortName: toDisplayValue(getFirstDefinedValue(source, GROUP_SHORT_KEYS)),
    itemDescription: toDisplayValue(getFirstDefinedValue(source, GROUP_DESCRIPTION_KEYS)),
    position: toDisplayValue(getFirstDefinedValue(source, GROUP_POSITION_KEYS)) || row.position,
    parentGroupId: toDisplayValue(getFirstDefinedValue(source, GROUP_PARENT_ID_KEYS)),
  };
}
function buildItemGroupRows(payload: unknown): ItemGroupTableRow[] {
  return extractRows(payload).map((item, index) => {
    if (item && typeof item === "object" && !Array.isArray(item)) {
      const row = item as Record<string, unknown>;
      const groupIdValue = getFirstDefinedValue(row, GROUP_ID_KEYS);
      const groupCodeValue = getFirstDefinedValue(row, GROUP_CODE_KEYS);
      const groupNameValue = getFirstDefinedValue(row, GROUP_NAME_KEYS);
      const positionValue = getFirstDefinedValue(row, GROUP_POSITION_KEYS);
      const preferredKey = groupIdValue ?? row.id ?? row._id ?? row.groupId ?? row.code ?? index + 1;
      const rowId =
        typeof preferredKey === "string" || typeof preferredKey === "number"
          ? preferredKey
          : index + 1;
      return {
        __rowId: rowId,
        __recordId: rowId,
        __source: row,
        serialNo: index + 1,
        groupId: toDisplayValue(groupIdValue) || String(index + 1),
        groupCode: toDisplayValue(groupCodeValue),
        groupName: toDisplayValue(groupNameValue),
        position: toDisplayValue(positionValue),
      };
    }
    return {
      __rowId: index + 1,
      __recordId: index + 1,
      __source: null,
      serialNo: index + 1,
      groupId: String(index + 1),
      groupCode: "",
      groupName: toDisplayValue(item),
      position: "",
    };
  });
}
// Custom hooks
function useItemGroupData() {
  const { data, error, loading, getAll } = useApi<unknown>(API_ENDPOINTS.LIST);
  const {
    run: createItemGroup,
    loading: createLoading,
    error: createError,
    reset: resetCreateState,
  } = useApi<unknown, CreateItemGroupRequest>(API_ENDPOINTS.CREATE, { method: "POST" });
  const { run: deleteItemGroup, loading: deleteLoading, error: deleteError } =
    useApi<unknown>(API_ENDPOINTS.DELETE, { method: "DELETE" });
  const [searchTerm, setSearchTerm] = useState("");
  const loadItemGroups = useCallback(
    async (term: string) => {
      const normalizedTerm = term.trim();
      if (normalizedTerm) {
        await getAll({ search: normalizedTerm });
        return;
      }
      await getAll();
    },
    [getAll],
  );
  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void loadItemGroups(searchTerm);
    }, FILE_CONSTRAINTS.DEBOUNCE_MS);
    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [loadItemGroups, searchTerm]);
  const rows = useMemo(() => buildItemGroupRows(data), [data]);
  return {
    data,
    error,
    loading,
    createLoading,
    createError,
    deleteLoading,
    deleteError,
    searchTerm,
    setSearchTerm,
    loadItemGroups,
    createItemGroup,
    deleteItemGroup,
    resetCreateState,
    rows,
  };
}
function useItemGroupSelection(rows: ItemGroupTableRow[]) {
  const [selectedRowId, setSelectedRowId] = useState<string | number | null>(null);
  const [editingItemId, setEditingItemId] = useState<string | number | null>(null);
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
  // Custom hooks
  const {
    data,
    error,
    loading,
    createLoading,
    createError,
    deleteLoading,
    deleteError,
    searchTerm,
    setSearchTerm,
    loadItemGroups,
    createItemGroup,
    deleteItemGroup,
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
  const parentGroupOptions = useMemo(() => {
    const editingId = editingItemId === null ? null : String(editingItemId);
    const currentParentId = selectedRow ? mapRowToFormState(selectedRow).parentGroupId.trim() : "";
    const optionMap = new Map<string, string>();
    for (const row of rows) {
      const optionId = String(resolveItgId(row)).trim();
      if (!optionId || optionId === editingId || optionMap.has(optionId)) {
        continue;
      }
      const optionLabel = [row.groupCode, row.groupName].filter(Boolean).join(" - ") || optionId;
      optionMap.set(optionId, optionLabel);
    }
    const options = Array.from(optionMap, ([value, label]) => ({ value, label }));
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
    setEditingItemId(null);
    modalControllerRef.current?.openModal("item-group-create", { values: INITIAL_FORM_STATE });
  }, [resetCreateState]);
  const openUpdateModalForRow = useCallback(
    (row: ItemGroupTableRow) => {
      resetCreateState();
      setSelectedRowId(row.__rowId);
      setEditingItemId(resolveItgId(row));
      modalControllerRef.current?.openModal("item-group-update", {
        values: mapRowToFormState(row),
      });
    },
    [resetCreateState],
  );
  const openViewModalForRow = useCallback(
    (row: ItemGroupTableRow) => {
      resetCreateState();
      setSelectedRowId(row.__rowId);
      setEditingItemId(null);
      modalControllerRef.current?.openModal("item-group-view", {
        values: mapRowToFormState(row),
      });
    },
    [resetCreateState],
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
        ...(shouldUpdate && editingItemId !== null ? { itg_id: editingItemId } : {}),
      };
      await createItemGroup({ body: createPayload });
      setEditingItemId(null);
      await loadItemGroups(searchTerm);
    },
    [createItemGroup, editingItemId, loadItemGroups, searchTerm],
  );
  const handleModalCancel = useCallback(() => {
    if (createLoading) {
      return;
    }
    resetCreateState();
    setEditingItemId(null);
  }, [createLoading, resetCreateState]);
  const handleDeleteRow = useCallback(
    (row: ItemGroupTableRow) => {
      if (deleteLoading || createLoading) {
        return;
      }
      const recordLabel = row.groupName || row.groupCode || row.groupId;
      const allowDelete = window.confirm(`Delete selected item group "${recordLabel}"?`);
      if (!allowDelete) {
        return;
      }
      void (async () => {
        try {
          const deleteItgId = resolveItgId(row);
          await deleteItemGroup({
            url: `${API_ENDPOINTS.DELETE}/${encodeURIComponent(String(deleteItgId))}`,
          });

          setSelectedRowId((current) => (current === row.__rowId ? null : current));
          if (editingItemId === deleteItgId) {
            setEditingItemId(null);
            modalControllerRef.current?.closeModal();
          }

          await loadItemGroups(searchTerm);
        } catch {
          // Error UI is driven by deleteError from useApi.
        }
      })();
    },
    [
      createLoading,
      deleteItemGroup,
      deleteLoading,
      editingItemId,
      loadItemGroups,
      searchTerm,
    ],
  );
  const itemGroupFields = useMemo<ERPDynamicModalField[]>(
    () => [
      {
        name: "itemGroupName",
        label: "Item Group Name",
        required: true,
        placeholder: "Frozen Products",
        validation: {
          minLength: 2,
          minLengthMessage: "Item Group Name must be at least 2 characters.",
        },
      },
      {
        name: "searchCode",
        label: "Search Code",
        placeholder: "Code for quick search",
      },
      {
        name: "itemAlias",
        label: "Alias",
        placeholder: "Alternate name",
      },
      {
        name: "itemShortName",
        label: "Short Name",
        placeholder: "Short label for prints",
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
        name: "parentGroupId",
        label: "Parent Group",
        type: "select",
        options: parentGroupOptions,
        placeholder: "Select parent group (optional)",
      },
      {
        name: "itemDescription",
        label: "Description",
        type: "textarea",
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
        cardTitle: "View Item Group",
        cardDescription: "View selected item group details.",
        cardButtonLabel: "View",
        modalTitle: "Item Group Details",
        modalDescription: "Read-only view of selected item group data.",
        submitLabel: "Close",
        accent: "indigo",
        fields: itemGroupViewFields,
      },
      {
        key: "item-group-create",
        cardTitle: "Create Item Group",
        cardDescription: "Create a new group for billing workflows.",
        cardButtonLabel: "Create",
        modalTitle: "New Item Group",
        modalDescription: "Configure group details and hierarchy.",
        submitLabel: createLoading ? "Saving..." : "Save",
        accent: "blue",
        fields: itemGroupFields,
      },
      {
        key: "item-group-update",
        cardTitle: "Update Item Group",
        cardDescription: "Update an existing group.",
        cardButtonLabel: "Update",
        modalTitle: "Edit Item Group",
        modalDescription: "Update selected item group details.",
        submitLabel: createLoading ? "Updating..." : "Update",
        accent: "emerald",
        fields: itemGroupFields,
      },
    ],
    [createLoading, itemGroupFields, itemGroupViewFields],
  );
  const columns = useMemo<ReusableTableColumn<ItemGroupTableRow>[]>(
    () => [
      {
        key: "serialNo",
        header: "S.No",
        accessor: "serialNo",
        align: "left",
        width: "46px",
        sortable: false,
      },
      // {
      //   key: "groupId",
      //   header: "Group ID",
      //   accessor: "groupId",
      //   align: "left",
      //   width: "160px",
      // },
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
    ],
    [],
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
          <ErpHeader
            searchMenuCount={0}
            cartCount={6}
            goLabel="K Go"
            quickTabs={HEADER_QUICK_TABS}
            selectedCustomer="Customers"
            billPlaceholder="Enter Bill No"
          />
          <section className={styles.content}>            
            {error ? (
              <div className={styles.errorBox}>
                <p className={styles.errorText}>Unable to load group data: {error}</p>
                <button
                  type="button"
                  className={styles.retryButton}
                  onClick={() => void loadItemGroups(searchTerm)}
                >
                  Retry
                </button>
              </div>
            ) : null}
            {deleteError ? (
              <div className={styles.errorBox}>
                <p className={styles.errorText}>Unable to delete selected group: {deleteError}</p>
              </div>
            ) : null}
            <section>
              <ReusableTable
                columns={columns}
                rows={rows}
                rowKey="__rowId"
                title="Item Group List"
                minWidth="980px"
                wrapperClassName={styles.tableWrapper}
                tableClassName={styles.listTable}
                activeRowKey={selectedRowId}
                onRowClick={(row) => setSelectedRowId(row.__rowId)}
                onCreate={openCreateModal}
                createLabel="Add Item Group"
                onView={handleRowView}
                onUpdate={handleRowUpdate}
                onDelete={handleRowDelete}
                isViewDisabled={() => createLoading}
                isUpdateDisabled={() => createLoading}
                isDeleteDisabled={() => deleteLoading || createLoading}
                actionsAsIcons
                updateLabel="Update"
                deleteLabel={deleteLoading ? "Deleting..." : "Delete"}
                searchable
                searchQuery={searchTerm}
                onSearchQueryChange={setSearchTerm}
                searchPlaceholder="Search..."
                sortable
                paginated
                defaultPageSize={10}
                pageSizeOptions={[5, 10, 25, 50]}
                tableMaxHeight="500px"
                stickyHeader
                emptyText={loading ? "Loading group data..." : "No group data found"}
              />
            </section>
          </section>
          
        </div>
      </div>
      <ERPDynamicModalForm
        title="Item Group Form"
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
    </main>
  );
}
