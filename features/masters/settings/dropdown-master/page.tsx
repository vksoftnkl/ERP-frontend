"use client";
import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type {
  ERPDynamicModalField,
  ERPDynamicSelectOption,
} from "@/components/design-system/ui/dynamic-modal-form";
import CrudMasterPage, { type CrudMasterTableRow } from "@/components/master/crud-master-page";
import type { ReusableTableColumn } from "@/components/ui/table";
import styles from "@/app/master/state-master/page.module.scss";
import {
  getFirstDefinedValue,
  toDisplayValue,
  toNullableInteger,
  toNullableString,
  toSelectBoolean,
  toUpdateId,
} from "@/features/masters/shared";
const API_ENDPOINTS = {
  list:"/configured-grid-sql/run?grid_id=41",
  getById: "/dropdown-details/get",
  create: "/dropdown-details/create",
  delete: "/dropdown-details/delete",
} as const;
const GRID_TABLE_NAME = "dropdown_details";
const GRID_DETAIL_ID = 41;
const LOOKUP_KEYS = {
  id: ["dropdown_id", "dropdownId", "id", "_id"],
  code: ["dropdown_id", "dropdownId"],
  name: ["dropdown_name", "dropdownName", "name"],
  short: ["dropdown_sort_column", "dropdownSortColumn"],
  alias: ["dropdown_sort_order", "dropdownSortOrder"],
  active: ["dropdown_show_header", "dropdownShowHeader"],
  position: ["dropdown_width", "dropdownWidth"],
  description: ["dropdown_description", "dropdownDescription"],
  array: ["data", "items", "results", "rows", "list"],
} as const;
const REQUEST_PAYLOAD_KEYS = {
  id: "dropdown_id",
  name: "dropdown_name",
  alias: "dropdown_sort_order",
  short: "dropdown_sort_column",
  description: "dropdown_description",
  sort: "dropdown_width",
} as const;
const DROPDOWN_NAME_KEYS = ["dropdown_name", "dropdownName"] as const;
const DROPDOWN_DESCRIPTION_KEYS = ["dropdown_description", "dropdownDescription"] as const;
const DROPDOWN_SQL_KEYS = ["dropdown_sql", "dropdownSql"] as const;
const DROPDOWN_SQL_REGIONAL_KEYS = ["dropdown_sql_regional", "dropdownSqlRegional"] as const;
const DROPDOWN_SORT_COLUMN_KEYS = ["dropdown_sort_column", "dropdownSortColumn"] as const;
const DROPDOWN_SORT_ORDER_KEYS = ["dropdown_sort_order", "dropdownSortOrder"] as const;
const DROPDOWN_COMPLETION_KEYS = ["dropdown_completion", "dropdownCompletion"] as const;
const DROPDOWN_VISIBLE_ITEMS_KEYS = [
  "dropdown_max_visible_items",
  "dropdownMaxVisibleItems",
] as const;
const DROPDOWN_SHOW_HEADER_KEYS = ["dropdown_show_header", "dropdownShowHeader"] as const;
const DROPDOWN_WIDTH_KEYS = ["dropdown_width", "dropdownWidth"] as const;
const SORT_ORDER_OPTIONS: ERPDynamicSelectOption[] = [
  { value: "", label: "No Sort" },
  { value: "ASC", label: "Ascending" },
  { value: "DESC", label: "Descending" },
];
const INITIAL_FORM_VALUES = {
  dropdownName: "",
  dropdownDescription: "",
  sortColumn: "",
  sortOrder: "",
  dropdownSql: "",
  dropdownSqlRegional: "",
  dropdownCompletion: "",
  maxVisibleItems: "10",
  showHeader: "true",
  dropdownWidth: "",
} as const;
const FORM_FIELDS: ERPDynamicModalField[] = [
  {
    name: "dropdownName",
    label: "Dropdown Name",
    required: true,
    colSpan: 2,
    placeholder: "e.g. Item Lookup",
    validation: {
      minLength: 2,
      minLengthMessage: "Dropdown Name must be at least 2 characters.",
      requiredMessage: "Dropdown Name is required.",
    },
  },
  {
    name: "sortColumn",
    label: "Sort Column",
    colSpan: 2,
    placeholder: "e.g. item_name",
  },
  {
    name: "sortOrder",
    label: "Sort Order",
    type: "select",
    colSpan: 2,
    options: SORT_ORDER_OPTIONS,
    searchable: false,
  },
  {
    name: "maxVisibleItems",
    label: "Visible Items",
    type: "number",
    min: 1,
    step: 1,
    validation: {
      minMessage: "Visible Items must be 1 or greater.",
    },
  },
  {
    name: "dropdownWidth",
    label: "Dropdown Width",
    type: "number",
    min: 1,
    step: 1,
    validation: {
      minMessage: "Dropdown Width must be 1 or greater.",
    },
  },
  {
    name: "showHeader",
    label: "Show Header Row",
    type: "checkbox",
  },
  {
    name: "dropdownDescription",
    label: "Description",
    type: "textarea",
    colSpan: 2,
    rows: 3,
    placeholder: "Describe where this dropdown is used",
  },
  {
    name: "dropdownSql",
    label: "Primary SQL",
    type: "textarea",
    required: true,
    colSpan: 2,
    rows: 6,
    placeholder: "SELECT ... FROM ...",
    validation: {
      requiredMessage: "Primary SQL is required.",
    },
  },
  {
    name: "dropdownSqlRegional",
    label: "Regional SQL",
    type: "textarea",
    colSpan: 2,
    rows: 4,
    placeholder: "Optional regional-language SQL",
  },
  {
    name: "dropdownCompletion",
    label: "Completion Logic",
    type: "textarea",
    colSpan: 2,
    rows: 3,
    placeholder: "Optional completion logic",
  },
];
function normalizeSortOrder(value: unknown): string {
  const normalized = toDisplayValue(value).trim().toLowerCase();
  if (normalized === "desc" || normalized === "descending") {
    return "DESC";
  }
  if (normalized === "asc" || normalized === "ascending") {
    return "ASC";
  }
  return "";
}
function toPositiveInteger(value: string, fallback: number): number {
  const parsed = Number.parseInt(value.trim(), 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return fallback;
  }
  return Math.floor(parsed);
}
function toNullablePositiveInteger(value: string): number | null {
  const parsed = toNullableInteger(value);
  return parsed !== null && parsed > 0 ? parsed : null;
}
export default function DropdownMasterPage() {
  const router = useRouter();
  const openDesignerForRow = useCallback(
    (row: CrudMasterTableRow) => {
      const dropdownId = row.masterId.trim();
      router.push(
        dropdownId
          ? `/master/dropdown-designer/${encodeURIComponent(dropdownId)}`
          : "/master/dropdown-designer",
      );
    },
    [router],
  );
  const openDesignerForCreate = useCallback(() => {
    router.push("/master/dropdown-designer?mode=new");
  }, [router]);
  const designerColumns = useMemo<ReusableTableColumn<CrudMasterTableRow>[]>(
    () => [
      {
        key: "actions",
        header: "Designer",
        width: "100px",
        align: "center",
        mobileLabel: "Designer",
        sortable: false,
        render: (row) => (
          <button
            type="button"
            style={{
              background: "none",
              border: "none",
              color: "var(--erp-link-color, #2563eb)",
              cursor: "pointer",
              font: "inherit",
              textDecoration: "underline",
            }}
            onClick={(event) => {
              event.stopPropagation();
              openDesignerForRow(row);
            }}
          >
            Open
          </button>
        ),
      },
    ],
    [openDesignerForRow],
  );

  // Toggles the `wantdelete` grid param; ticking it re-runs the list so the user
  // can see soft-deleted dropdowns. Lives beside the list search input.
  const [wantDelete, setWantDelete] = useState(false);
  // Adds the `grid_param` payload to the default page/limit/search list query.
  // The server JSON-parses it and binds each key into the matching named token in
  // grid 41's stored SQL; keys with no matching token are ignored. `wantdelete` is
  // driven by the "Show deleted records" checkbox beside the list search input.
  const buildListQuery = useCallback(
    ({
      searchTerm,
      currentPage,
      pageSize,
    }: {
      searchTerm: string;
      currentPage: number;
      pageSize: number;
    }): Record<string, string> => ({
      page: String(currentPage),
      limit: String(pageSize),
      ...(searchTerm ? { search: searchTerm } : {}),
      grid_param: JSON.stringify({ wantdelete: wantDelete }),
    }),
    [wantDelete],
  );
  return (
    <CrudMasterPage
      title="Dropdown Master"
      auditHistory={{ screenName: "Dropdown Details" }}
      entityLabel="dropdown"
      entityLabelPlural="dropdowns"
      apiEndpoints={API_ENDPOINTS}
      buildListQuery={buildListQuery}
      toolbarContent={
        <div className={styles.filterCheckGroup}>
          <label className={styles.filterCheckLabel}>
            <input
              type="checkbox"
              checked={wantDelete}
              onChange={(event) => setWantDelete(event.target.checked)}
            />
            Show deleted records
          </label>
        </div>
      }
      gridTableName={GRID_TABLE_NAME}
      gridDetailId={GRID_DETAIL_ID}
      useConfiguredGridColumnsOnly
      listResponseStyleArrayKey=""
      lookupKeys={LOOKUP_KEYS}
      requestPayloadKeys={REQUEST_PAYLOAD_KEYS}
      styles={styles}
      listTitle="Dropdown List"
      createLabel="Add Dropdown"
      nameFieldLabel="Dropdown Name"
      nameFieldPlaceholder="e.g. Item Lookup"
      formTitle="Dropdown Form"
      createModalTitle="Dropdown Entry"
      editModalTitle="Edit Dropdown Entry"
      formDescription="Create and manage dropdown definitions. Use the designer to edit dropdown columns."
      customFields={FORM_FIELDS}
      createInitialValues={INITIAL_FORM_VALUES}
      appendTableColumns={designerColumns}
      onCreateAction={openDesignerForCreate}
      onEditAction={openDesignerForRow}

      mapFormValues={({ source }) => {
        const rowSource = source ?? {};
        return {
          ...INITIAL_FORM_VALUES,
          dropdownName:
            toDisplayValue(getFirstDefinedValue(rowSource, DROPDOWN_NAME_KEYS)) ||
            INITIAL_FORM_VALUES.dropdownName,
          dropdownDescription:
            toDisplayValue(getFirstDefinedValue(rowSource, DROPDOWN_DESCRIPTION_KEYS)) ||
            INITIAL_FORM_VALUES.dropdownDescription,
          sortColumn:
            toDisplayValue(getFirstDefinedValue(rowSource, DROPDOWN_SORT_COLUMN_KEYS)) ||
            INITIAL_FORM_VALUES.sortColumn,
          sortOrder: normalizeSortOrder(getFirstDefinedValue(rowSource, DROPDOWN_SORT_ORDER_KEYS)),
          dropdownSql:
            toDisplayValue(getFirstDefinedValue(rowSource, DROPDOWN_SQL_KEYS)) ||
            INITIAL_FORM_VALUES.dropdownSql,
          dropdownSqlRegional:
            toDisplayValue(getFirstDefinedValue(rowSource, DROPDOWN_SQL_REGIONAL_KEYS)) ||
            INITIAL_FORM_VALUES.dropdownSqlRegional,
          dropdownCompletion:
            toDisplayValue(getFirstDefinedValue(rowSource, DROPDOWN_COMPLETION_KEYS)) ||
            INITIAL_FORM_VALUES.dropdownCompletion,
          maxVisibleItems:
            toDisplayValue(getFirstDefinedValue(rowSource, DROPDOWN_VISIBLE_ITEMS_KEYS)) ||
            INITIAL_FORM_VALUES.maxVisibleItems,
          showHeader: toSelectBoolean(
            getFirstDefinedValue(rowSource, DROPDOWN_SHOW_HEADER_KEYS),
            INITIAL_FORM_VALUES.showHeader,
          ),
          dropdownWidth:
            toDisplayValue(getFirstDefinedValue(rowSource, DROPDOWN_WIDTH_KEYS)) ||
            INITIAL_FORM_VALUES.dropdownWidth,
        };
      }}
      buildRequestPayload={({ values, shouldUpdate, editingItemId }) => {
        const sortColumn = toNullableString(values.sortColumn ?? "");
        const payload: Record<string, unknown> = {
          dropdown_name: (values.dropdownName ?? "").trim(),
          dropdown_description: toNullableString(values.dropdownDescription ?? ""),
          dropdown_sql: (values.dropdownSql ?? "").trim(),
          dropdown_sort_order: sortColumn ? normalizeSortOrder(values.sortOrder) || "ASC" : null,
          dropdown_sort_column: sortColumn,
          dropdown_completion: toNullableString(values.dropdownCompletion ?? ""),
          dropdown_sql_regional: toNullableString(values.dropdownSqlRegional ?? ""),
          dropdown_max_visible_items: toPositiveInteger(values.maxVisibleItems ?? "10", 10),
          dropdown_show_header: (values.showHeader ?? "true") === "true",
          dropdown_width: toNullablePositiveInteger(values.dropdownWidth ?? ""),
        };
        if (shouldUpdate && editingItemId !== null) {
          payload.dropdown_id = String(toUpdateId(editingItemId));
        }
        return payload;
      }}
    />
  );
}
