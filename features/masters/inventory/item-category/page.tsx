"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import CrudMasterPage from "@/components/master/crud-master-page";
import { useApi } from "@/hooks/useApi";
import type {
  ERPDynamicModalField,
  ERPDynamicSelectOption,
  ERPDynamicSearchQueryChangeHandler,
  ERPDynamicFieldValueChangeHandler,
  ERPDynamicFieldValueChangePayload,
} from "@/components/design-system/ui/dynamic-modal-form";
import styles from "@/app/master/state-master/page.module.scss";
import { extractRows } from "@/features/masters/shared/normalizers";
import { getFirstDefinedValue, toDisplayValue, toSelectBoolean } from "@/features/masters/shared/value-mappers";
const API_ENDPOINTS = {
list: "/configured-grid-sql/run?grid_id=11",
  getById: "/item-categories/get",
  create: "/item-categories/create",
  delete: "/item-categories/delete",
} as const;
const GRID_TABLE_NAME = "category_master";
// Parent Category is a lazy, server-side searchable configured dropdown
// (fixed.dropdown_details id 20 -> item_category_master active rows). Loaded on open + on
// debounced server-side search via /dropdown-details/run; nothing is fetched up front
// and dropdown_param is never sent.
const DROPDOWN_RUN_ENDPOINT = "/dropdown-details/run";
const PARENT_CATEGORY_DROPDOWN_ID = "20";
const PARENT_CATEGORY_SEARCH_DEBOUNCE_MS = 250;
const LOOKUP_KEYS = {
  id: [
    "category_id",
    "categoryId",
    "id",
    "_id",
    "itc_id",
    "itemcategoryid",
    "item_category_id",
    "itemCategoryId",
  ],
  code: [
    "category_code",
    "categoryCode",
    "code",
    "category_alias",
    "categoryAlias",
    "category_short",
    "categoryShort",
  ],
  name: [
    "category_name",
    "categoryName",
    "name",
    "itc_name",
    "itemcategoryname",
    "item_category_name",
    "itemCategoryName",
  ],
  short: [
    "category_short",
    "itc_short",
    "short_name",
    "shortName",
    "short",
    "categoryshort",
    "itemcategoryshort",
    "item_category_short",
  ],
  alias: [
    "category_alias",
    "itc_alias",
    "alias",
    "itemcategoryalias",
    "item_category_alias",
  ],
  active: [
    "category_is_active",
    "categoryIsActive",
    "itc_active",
    "active",
    "is_active",
    "isActive",
    "isactive",
    "status",
  ],
  position: ["category_sort", "categorySort", "position", "itc_sort", "sort"],
  description: [
    "category_description",
    "categoryDescription",
    "itc_description",
    "description",
    "desc",
  ],
  array: [
    "data",
    "items",
    "results",
    "rows",
    "list",
    "categories",
    "itemCategories",
    "item_categories",
  ],
} as const;

const REQUEST_PAYLOAD_KEYS = {
  id: "category_id",
  name: "category_name",
  alias: "category_alias",
  short: "category_short",
  description: "category_description",
  sort: "category_sort",
} as const;
const CATEGORY_CODE_FORM_KEYS = [
  "category_code",
  "categoryCode",
  "code",
  "category_alias",
  "categoryAlias",
  "category_short",
  "categoryShort",
] as const;
const CATEGORY_PARENT_ID_KEYS = ["category_parent_id", "categoryParentId", "parent_id", "parentId"] as const;
const CATEGORY_PARENT_NAME_KEYS = ["category_parent_name", "categoryParentName", "parent_name", "parentName"] as const;
const CATEGORY_LEVEL_KEYS = ["category_level", "categoryLevel", "level"] as const;
const CATEGORY_TAX_CLAIM_KEYS = [
  "category_tax_claim",
  "categoryTaxClaim",
  "tax_claim",
  "taxClaim",
] as const;
const CATEGORY_DEFAULT_TAX_ID_KEYS = [
  "category_default_tax_id",
  "categoryDefaultTaxId",
  "default_tax_id",
  "defaultTaxId",
] as const;
const CATEGORY_DEFAULT_HSN_KEYS = [
  "category_default_hsn",
  "categoryDefaultHsn",
  "default_hsn",
  "defaultHsn",
  "hsn_code",
  "hsnCode",
] as const;
const CATEGORY_DEFAULT_UOM_ID_KEYS = [
  "category_default_uom_id",
  "categoryDefaultUomId",
  "default_uom_id",
  "defaultUomId",
] as const;
const CATEGORY_PHOTO_URL_KEYS = [
  "category_photo_url",
  "categoryPhotoUrl",
  "photo_url",
  "photoUrl",
] as const;

const TAX_LOOKUP_KEYS = {
  id: ["tax_id", "taxId", "id", "_id", "item_tax_id", "itemTaxId"],
  name: ["tax_name", "taxName", "name", "gst_name", "item_tax_name", "itemTaxName"],
  array: ["data", "items", "results", "rows", "list", "taxes", "itemTaxes"],
} as const;
const UNIT_LOOKUP_KEYS = {
  id: ["unit_id", "unitId", "id", "_id", "item_unit_id", "itemUnitId", "uom_id"],
  name: ["unit_name", "unitName", "name", "item_unit_name", "itemUnitName", "uom_name"],
  array: ["data", "items", "results", "rows", "list", "units", "itemUnits"],
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
} as const;
const CATEGORY_INITIAL_FORM_VALUES = {
  masterName: "",
  searchCode: "",
  masterAlias: "",
  masterShortName: "",
  position: "0",
  categoryParentId: "",
  categoryLevel: "0",
  categoryTaxClaim: "false",
  categoryDefaultTaxId: "",
  categoryDefaultHsn: "",
  categoryDefaultUomId: "",
  categoryPhotoUrl: "",
  masterDescription: "",
} as const;
const DEFAULT_SELECT_OPTION: ERPDynamicSelectOption = {
  value: "",
  label: "None",
};
type OptionLookupKeys = {
  id: readonly string[];
  name: readonly string[];
  array: readonly string[];
};
type LazyParentHandlers = {
  onSearchOpenChange: (open: boolean) => void;
  onSearchQueryChange: ERPDynamicSearchQueryChangeHandler;
  onValueChange: ERPDynamicFieldValueChangeHandler;
};
function buildCategoryFormFields(
  categoryOptions: ERPDynamicSelectOption[],
  taxOptions: ERPDynamicSelectOption[],
  unitOptions: ERPDynamicSelectOption[],
  lazyParent: LazyParentHandlers,
): ERPDynamicModalField[] {
  return [
    {
      name: "masterName",
      label: "Category Name",
      required: true,
      colSpan:2,
      validation: {
        minLength: 2,
        minLengthMessage: "Item Category Name must be at least 2 characters.",
      },
    },
    // {
    //   name: "masterAlias",
    //   label: "Category Alias",
    //   colSpan:2
    // },
    {
      name: "masterShortName",
      label: "Short Name",
      colSpan:2
    },
    {
      name: "position",
      label: "Position",
      type: "number",
      colSpan:1,
      min: 0,
      step: 1,
      validation: {
        minMessage: "Sort Order must be 0 or greater.",
      },
    },
    {
      name: "categoryParentId",
      label: "Parent Category",
      type: "select",
      colSpan:2,
      searchable: true,
      serverSearch: true,
      options: categoryOptions,
      onSearchOpenChange: lazyParent.onSearchOpenChange,
      onSearchQueryChange: lazyParent.onSearchQueryChange,
      onValueChange: lazyParent.onValueChange,
    },
    // {
    //   name: "categoryLevel",
    //   label: "Category Level",
    //   type: "number",
    //   min: 0,
    //   step: 1,
    //   validation: {
    //     minMessage: "Category Level must be 0 or greater.",
    //   },
    // },
    {
      name: "masterDescription",
      label: "Description",
      colSpan: 2,
    },
    {
      name: "categoryPhoto",
      label: "Image",
      type: "file",
      accept: "image/*",
      maxFileSizeBytes: FILE_CONSTRAINTS.MAX_UPLOAD_IMAGE_BYTES,
      allowedMimeTypes: [...FILE_CONSTRAINTS.ALLOWED_MIME_TYPES],
      helperText: "Optional. Sent as base64 in category_photo.",
      colSpan: 2,
    },
  ];
}
function toInteger(value: string, fallback: number): number {
  const parsed = Number.parseInt(value.trim(), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}
function toNullableReference(value: string): string | null {
  const normalized = value.trim();
  return normalized ? normalized : null;
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
function buildLookupOptions(
  payload: unknown,
  lookupKeys: OptionLookupKeys,
  includeEmptyOption = false,
): ERPDynamicSelectOption[] {
  const optionMap = new Map<string, string>();
  const rows = extractRows(payload, lookupKeys.array);
  for (const row of rows) {
    if (!row || typeof row !== "object" || Array.isArray(row)) {
      continue;
    }
    const source = row as Record<string, unknown>;
    const id = toDisplayValue(getFirstDefinedValue(source, lookupKeys.id));
    if (!id) {
      continue;
    }
    const name = toDisplayValue(getFirstDefinedValue(source, lookupKeys.name));
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
// Dropdown 20 rows expose category_id/category_name (camelCase aliases also accepted).
const PARENT_CATEGORY_LOOKUP_KEYS: OptionLookupKeys = {
  id: ["category_id", "categoryId"],
  name: ["category_name", "categoryName"],
  array: ["items", "data", "results", "rows", "list"],
};
// Build the run query. An empty search is omitted so the server returns the first page;
// dropdown_param is never sent.
function buildParentRunQuery(search: string): Record<string, string> {
  const query: Record<string, string> = {
    dropdown_id: PARENT_CATEGORY_DROPDOWN_ID,
    page: "1",
    limit: "20",
  };
  const trimmed = search.trim();
  if (trimmed) {
    query.search = trimmed;
  }
  return query;
}
// Keep the currently-selected option visible after a fetch replaces the option list.
function withPinnedOption(
  options: ERPDynamicSelectOption[],
  pinned: ERPDynamicSelectOption | null,
): ERPDynamicSelectOption[] {
  if (!pinned || !pinned.value) {
    return options;
  }
  if (options.some((option) => option.value === pinned.value)) {
    return options;
  }
  return [...options, pinned];
}
export default function ItemCategoryMasterPage() {
  // Lazy server-side Parent Category dropdown (configured dropdown 20 via
  // /dropdown-details/run). Errors aren't toasted — a failed dropdown fetch shouldn't
  // interrupt the form.
  const { run: runParentDropdown } = useApi<unknown>(DROPDOWN_RUN_ENDPOINT, {
    toast: { error: false },
  });
  const [categoryOptions, setCategoryOptions] = useState<ERPDynamicSelectOption[]>([
    DEFAULT_SELECT_OPTION,
  ]);
  // Tax/Unit selects are not currently rendered (fields are commented out), so their
  // options stay at the placeholder.
  const [taxOptions] = useState<ERPDynamicSelectOption[]>([DEFAULT_SELECT_OPTION]);
  const [unitOptions] = useState<ERPDynamicSelectOption[]>([DEFAULT_SELECT_OPTION]);
  // Mirror of the latest options + the pinned selection so the value handler can resolve
  // a picked label and the selection stays visible after a fetch replaces the list.
  const parentOptionsRef = useRef<ERPDynamicSelectOption[]>([DEFAULT_SELECT_OPTION]);
  const pinnedParentOptionRef = useRef<ERPDynamicSelectOption | null>(null);
  const parentSearchTimeoutRef = useRef<number | null>(null);
  // Toggles the `wantdelete` grid param; ticking it re-runs the list so the user
  // can see soft-deleted categories. Lives beside the list search input.
  const [wantDelete, setWantDelete] = useState(false);
  const applyParentOptions = useCallback((options: ERPDynamicSelectOption[]) => {
    parentOptionsRef.current = options;
    setCategoryOptions(options);
  }, []);
  // Fetch the dropdown's first page (open) or search results (typing). A superseded/
  // aborted request returns undefined and is skipped so it never wipes the latest list.
  const fetchParentOptions = useCallback(
    async (search: string) => {
      try {
        const payload = await runParentDropdown({ query: buildParentRunQuery(search) });
        if (payload === undefined) {
          return;
        }
        applyParentOptions(
          withPinnedOption(
            buildLookupOptions(payload, PARENT_CATEGORY_LOOKUP_KEYS, true),
            pinnedParentOptionRef.current,
          ),
        );
      } catch {
        // Keep whatever options are currently shown (e.g. the seeded selection).
      }
    },
    [applyParentOptions, runParentDropdown],
  );
  // Field handlers: fetch on open (immediate), on debounced typing, and pin the choice.
  const lazyParentHandlers = useMemo<LazyParentHandlers>(
    () => ({
      onSearchOpenChange: (open: boolean) => {
        if (parentSearchTimeoutRef.current != null) {
          window.clearTimeout(parentSearchTimeoutRef.current);
          parentSearchTimeoutRef.current = null;
        }
        if (open) {
          void fetchParentOptions("");
        }
      },
      onSearchQueryChange: (query: string) => {
        if (parentSearchTimeoutRef.current != null) {
          window.clearTimeout(parentSearchTimeoutRef.current);
        }
        const delay = query.trim() ? PARENT_CATEGORY_SEARCH_DEBOUNCE_MS : 0;
        parentSearchTimeoutRef.current = window.setTimeout(() => {
          parentSearchTimeoutRef.current = null;
          void fetchParentOptions(query);
        }, delay);
      },
      onValueChange: (payload: ERPDynamicFieldValueChangePayload) => {
        const option = parentOptionsRef.current.find((item) => item.value === payload.value);
        pinnedParentOptionRef.current = option && payload.value ? option : null;
      },
    }),
    [fetchParentOptions],
  );
  // Seed the trigger with the saved parent on edit/view before the field is opened
  // (and lazily loaded). On create, reset to just the "None" head.
  const seedSelectedParent = useCallback(
    (parentId: string, parentName: string) => {
      const value = parentId.trim();
      if (!value) {
        pinnedParentOptionRef.current = null;
        applyParentOptions([DEFAULT_SELECT_OPTION]);
        return;
      }
      const option: ERPDynamicSelectOption = { value, label: parentName.trim() || value };
      pinnedParentOptionRef.current = option;
      applyParentOptions([DEFAULT_SELECT_OPTION, option]);
    },
    [applyParentOptions],
  );
  useEffect(() => {
    return () => {
      if (parentSearchTimeoutRef.current != null) {
        window.clearTimeout(parentSearchTimeoutRef.current);
      }
    };
  }, []);
  const categoryFormFields = useMemo(
    () => buildCategoryFormFields(categoryOptions, taxOptions, unitOptions, lazyParentHandlers),
    [categoryOptions, taxOptions, unitOptions, lazyParentHandlers],
  );
  // Adds the `grid_param` payload to the default page/limit/search list query.
  // The server JSON-parses it and binds each key into the matching named token in
  // grid 11's stored SQL; keys with no matching token are ignored. `wantdelete` is
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
      title="Item Category"
      auditHistory={{ screenName: "Category Master" }}
      entityLabel="item category"
      entityLabelPlural="item categories"
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
        listResponseStyleArrayKey=""
        gridDetailId={11}
      lookupKeys={LOOKUP_KEYS}
      requestPayloadKeys={REQUEST_PAYLOAD_KEYS}
      styles={styles}
      listTitle="Item Category List"
      listTitleOverride="Category List"
      createLabel="Add Item Category"
      codeColumnHeader="Category Code"
      nameColumnHeader="Category Name"
      nameFieldLabel="Item Category Name"
      nameFieldPlaceholder="Dairy"
      formTitle="Item Category Form"
      formDescription="Create and update item categories."
      viewModalTitle="Category Details"
      createModalTitle="Category Entry"
      editModalTitle="Edit Category Entry"
      customFields={categoryFormFields}
      createInitialValues={CATEGORY_INITIAL_FORM_VALUES}
      onModalOpenChange={(open, variantKey) => {
        // Clear the lazy parent dropdown when the create modal opens so no stale
        // selection from a previously edited category lingers (it reloads on open).
        if (open && variantKey === "master-create") {
          seedSelectedParent("", "");
        }
      }}
      mapFormValues={({ source, defaults }) => {
        const rowSource = source ?? {};
        const categoryParentId = toDisplayValue(
          getFirstDefinedValue(rowSource, CATEGORY_PARENT_ID_KEYS),
        );
        // Seed the lazy Parent Category dropdown with the saved selection so the trigger
        // shows the parent name on edit/view before the field is opened (and loaded).
        seedSelectedParent(
          categoryParentId,
          toDisplayValue(getFirstDefinedValue(rowSource, CATEGORY_PARENT_NAME_KEYS)),
        );
        return {
          ...CATEGORY_INITIAL_FORM_VALUES,
          masterName:
            toDisplayValue(getFirstDefinedValue(rowSource, LOOKUP_KEYS.name)) || defaults.masterName,
          searchCode:
            toDisplayValue(getFirstDefinedValue(rowSource, CATEGORY_CODE_FORM_KEYS)) ||
            defaults.searchCode,
          masterAlias:
            toDisplayValue(getFirstDefinedValue(rowSource, LOOKUP_KEYS.alias)) ||
            defaults.masterAlias,
          masterShortName:
            toDisplayValue(getFirstDefinedValue(rowSource, LOOKUP_KEYS.short)) ||
            defaults.masterShortName,
          position:
            toDisplayValue(getFirstDefinedValue(rowSource, LOOKUP_KEYS.position)) ||
            defaults.position,
          categoryParentId,
          categoryLevel:
            toDisplayValue(getFirstDefinedValue(rowSource, CATEGORY_LEVEL_KEYS)) || "0",
          categoryTaxClaim: toSelectBoolean(
            getFirstDefinedValue(rowSource, CATEGORY_TAX_CLAIM_KEYS),
            "false",
          ),
          categoryDefaultTaxId: toDisplayValue(
            getFirstDefinedValue(rowSource, CATEGORY_DEFAULT_TAX_ID_KEYS),
          ),
          categoryDefaultHsn: toDisplayValue(
            getFirstDefinedValue(rowSource, CATEGORY_DEFAULT_HSN_KEYS),
          ),
          categoryDefaultUomId: toDisplayValue(
            getFirstDefinedValue(rowSource, CATEGORY_DEFAULT_UOM_ID_KEYS),
          ),
          categoryPhotoUrl: toDisplayValue(
            getFirstDefinedValue(rowSource, CATEGORY_PHOTO_URL_KEYS),
          ),
          masterDescription:
            toDisplayValue(getFirstDefinedValue(rowSource, LOOKUP_KEYS.description)) ||
            defaults.masterDescription,
        };
      }}
      buildRequestPayload={async ({ values, shouldUpdate, editingItemId, files }) => {
        const categoryName = (values.masterName ?? "").trim();
        const categoryCode = (values.searchCode ?? "").trim();
        const categoryAlias = (values.masterAlias ?? "").trim() || categoryCode;
        const categoryShort =
          (values.masterShortName ?? "").trim() || categoryCode || categoryAlias;
        const categoryDescription = (values.masterDescription ?? "").trim();
        const categorySort = toInteger(values.position ?? "0", 0);
        const categoryLevel = Math.max(0, toInteger(values.categoryLevel ?? "0", 0));
        const uploadedImage = files.categoryPhoto;
        const categoryPhoto =
          uploadedImage && uploadedImage.size > 0
            ? getBase64FromDataUrl(await readFileAsDataUrl(uploadedImage))
            : undefined;
        return {
          category_name: categoryName,
          category_alias: categoryAlias || null,
          category_short: categoryShort || null,
          category_description: categoryDescription || null,
          category_parent_id: toNullableReference(values.categoryParentId ?? ""),
          category_sort: categorySort,
          category_level: categoryLevel,
          category_tax_claim: (values.categoryTaxClaim ?? "false") === "true",
          category_default_tax_id: toNullableReference(values.categoryDefaultTaxId ?? ""),
          category_default_hsn: (values.categoryDefaultHsn ?? "").trim(),
          category_default_uom_id: toNullableReference(values.categoryDefaultUomId ?? ""),
          category_photo_url: (values.categoryPhotoUrl ?? "").trim(),
          ...(categoryPhoto ? { category_photo: categoryPhoto } : {}),
          ...(shouldUpdate && editingItemId !== null
            ? { category_id: String(editingItemId) }
            : {}),
        };
      }}
    />
  );
}
