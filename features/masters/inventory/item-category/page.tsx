"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import CrudMasterPage from "@/components/master/crud-master-page";
import WidgetVisibilityTree, {
  type WidgetTreeSectionView,
} from "@/features/masters/shared/widget-visibility-tree";
import {
  applyWidgetFieldConfig,
  buildControllableFieldNames,
  buildWidgetFieldConfig,
  type ResolvedFieldConfig,
  type WidgetMasterSectionConfig,
  type WidgetMastersResponse,
} from "@/features/masters/shared/widget-config";
import { useApi } from "@/hooks/useApi";
import {
  ERPDynamicModalForm,
  type ERPDynamicModalController,
  type ERPDynamicModalField,
  type ERPDynamicModalVariant,
  type ERPDynamicSelectOption,
  type ERPDynamicSearchQueryChangeHandler,
  type ERPDynamicFieldValueChangeHandler,
  type ERPDynamicFieldValueChangePayload,
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
// The form fields below are re-labelled, re-ordered, and shown/hidden from the
// backend widget-masters config (fixed.form_section / form_field) for this
// screen's menu id. Only those three properties come from the API — validation,
// state shape, and submit logic stay defined locally.
const WIDGET_CONFIG_ENDPOINT = "/widget-masters/get";
const WIDGET_SECTION_MENU_ID = 240;
// Platform filter for widget sections. The server validates it against its
// WidgetPlatform enum (Mobile | Desktop | Web) case-sensitively AND matches the
// stored section_platform exactly — the category fields live on the "Web" section.
const WIDGET_SECTION_PLATFORM = "Web";
// Bridge each hardcoded form field `name` (camelCase aliases used by form state
// and the submit payload) to the backend `fieldName` it is configured under (the
// keys on menu 240's category section, matched case-insensitively — the stored
// names mix casing). Form fields with no mapping — or no matching response entry —
// keep their hardcoded label and render after all configured fields.
const WIDGET_FIELD_NAME_BY_FORM_FIELD: Record<string, string> = {
  masterName: "iten_ctg_name",
  masterShortName: "Itg_ctg_short_name",
  position: "Itg_ctg_short_position",
  categoryParentId: "itg_parent_category",
  masterDescription: "itg_description",
  categoryPhoto: "itg_category_image",
};
// Right-clicking inside the open create/update modal opens a tree popup of this
// menu's configured sections/fields (GET /widget-masters/config?menu_id=…).
// Ticking a field toggles its live visibility in the form via the same config map.
const WIDGET_CONFIG_TREE_ENDPOINT = "/widget-masters/config";
// Persists the tree's section/field visibility back to the server (PATCH).
const WIDGET_VISIBILITY_ENDPOINT = "/widget-masters/visibility";
// Backend fieldNames (lowercased) that map to a real form field, so their popup
// checkbox can actually show/hide something. Others render read-only ("not on form").
const WIDGET_CONTROLLABLE_FIELD_NAMES = buildControllableFieldNames(WIDGET_FIELD_NAME_BY_FORM_FIELD);
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
  // Silent progressive enhancement: a failed config fetch leaves the form on its
  // hardcoded labels/order (empty map), so don't nag the user with an error toast.
  const { getAll: getWidgetConfig } = useApi<WidgetMastersResponse>(WIDGET_CONFIG_ENDPOINT, {
    toast: { error: false },
  });
  const [categoryOptions, setCategoryOptions] = useState<ERPDynamicSelectOption[]>([
    DEFAULT_SELECT_OPTION,
  ]);
  const [widgetFieldConfig, setWidgetFieldConfig] = useState<Map<string, ResolvedFieldConfig>>(
    () => new Map(),
  );
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
  useEffect(() => {
    let mounted = true;
    void (async () => {
      try {
        const payload = await getWidgetConfig({
          sectionMenuId: String(WIDGET_SECTION_MENU_ID),
          sectionPlatform: WIDGET_SECTION_PLATFORM,
        });
        if (!mounted) {
          return;
        }
        setWidgetFieldConfig(buildWidgetFieldConfig(payload ?? null));
      } catch {
        if (mounted) {
          setWidgetFieldConfig(new Map());
        }
      }
    })();
    return () => {
      mounted = false;
    };
  }, [getWidgetConfig]);
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
    () =>
      applyWidgetFieldConfig(
        buildCategoryFormFields(categoryOptions, taxOptions, unitOptions, lazyParentHandlers),
        widgetFieldConfig,
        WIDGET_FIELD_NAME_BY_FORM_FIELD,
      ),
    [categoryOptions, taxOptions, unitOptions, lazyParentHandlers, widgetFieldConfig],
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
  // Right-click config tree popup over the create/update modal.
  const { getAll: getWidgetConfigTree } = useApi<WidgetMastersResponse>(
    WIDGET_CONFIG_TREE_ENDPOINT,
    { toast: { error: false } },
  );
  const { run: saveVisibility, loading: savingVisibility } = useApi(WIDGET_VISIBILITY_ENDPOINT, {
    method: "PATCH",
  });
  const [configSections, setConfigSections] = useState<WidgetMasterSectionConfig[]>([]);
  // Section-level visibility overrides keyed by sectionId; falls back to the
  // fetched sectionVisibility until the user toggles a section.
  const [sectionVisibility, setSectionVisibility] = useState<Map<number, boolean>>(() => new Map());
  // Edited secondary text keyed by fieldId; falls back to the fetched value.
  const [secondaryTextById, setSecondaryTextById] = useState<Map<number, string>>(() => new Map());
  const [treeLoading, setTreeLoading] = useState(false);
  const [treeError, setTreeError] = useState<string | null>(null);
  const [visibilityModalOpen, setVisibilityModalOpen] = useState(false);
  const treeLoadedRef = useRef(false);
  const visibilityControllerRef = useRef<ERPDynamicModalController | null>(null);
  // Fetched lazily the first time the popup is opened, then cached. Scoped to the
  // "Web" platform so the tree mirrors the section the form actually configures from.
  const loadConfigTree = useCallback(async () => {
    if (treeLoadedRef.current) {
      return;
    }
    treeLoadedRef.current = true;
    setTreeLoading(true);
    setTreeError(null);
    try {
      const payload = await getWidgetConfigTree({
        menu_id: String(WIDGET_SECTION_MENU_ID),
        platform: WIDGET_SECTION_PLATFORM,
      });
      setConfigSections(Array.isArray(payload?.data) ? payload.data : []);
    } catch {
      treeLoadedRef.current = false;
      setTreeError("Unable to load field configuration.");
    } finally {
      setTreeLoading(false);
    }
  }, [getWidgetConfigTree]);
  // Hijack right-clicks that land inside the open create/update modal only; clicks
  // elsewhere keep the browser's native context menu. Opens the Visible Settings
  // modal (an ERPDynamicModalForm) on top via its controller.
  useEffect(() => {
    const handleContextMenu = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target?.closest('[role="dialog"][aria-modal="true"]')) {
        return;
      }
      event.preventDefault();
      void loadConfigTree();
      visibilityControllerRef.current?.openModal("visibility");
    };
    window.addEventListener("contextmenu", handleContextMenu);
    return () => window.removeEventListener("contextmenu", handleContextMenu);
  }, [loadConfigTree]);
  const handleToggleField = useCallback((backendName: string, checked: boolean) => {
    const key = backendName.toLowerCase();
    setWidgetFieldConfig((prev) => {
      const next = new Map(prev);
      const existing = next.get(key);
      next.set(
        key,
        existing
          ? { ...existing, visible: checked }
          : { label: "", order: Number.MAX_SAFE_INTEGER, visible: checked },
      );
      return next;
    });
  }, []);
  const handleToggleSection = useCallback((sectionId: number, checked: boolean) => {
    setSectionVisibility((prev) => {
      const next = new Map(prev);
      next.set(sectionId, checked);
      return next;
    });
  }, []);
  const handleChangeSecondaryText = useCallback((fieldId: number, value: string) => {
    setSecondaryTextById((prev) => {
      const next = new Map(prev);
      next.set(fieldId, value);
      return next;
    });
  }, []);
  // Build the tree view from the /config payload, deriving each checkbox from the
  // live form visibility map so the popup and the rendered form stay in sync.
  const treeSections = useMemo<WidgetTreeSectionView[]>(
    () =>
      configSections.map((section) => ({
        sectionId: section.sectionId,
        label: section.sectionGuiName?.trim() || section.sectionName || "Section",
        visible: sectionVisibility.get(section.sectionId) ?? section.sectionVisibility !== false,
        fields: (Array.isArray(section.fields) ? section.fields : []).map((field) => {
          const key = (field.fieldName ?? "").trim().toLowerCase();
          const configEntry = widgetFieldConfig.get(key);
          return {
            fieldId: field.fieldId,
            fieldName: field.fieldName,
            label: (field.fieldGuiName ?? "").trim() || field.fieldName,
            secondaryText: secondaryTextById.get(field.fieldId) ?? (field.fieldSecondaryText ?? ""),
            checked: configEntry ? configEntry.visible : field.fieldVisibility !== false,
            controllable: WIDGET_CONTROLLABLE_FIELD_NAMES.has(key),
          };
        }),
      })),
    [configSections, sectionVisibility, secondaryTextById, widgetFieldConfig],
  );
  // PATCH the current section/field visibility for every configured field back to
  // the server in the documented { data: [{ sectionId, sectionGuiName,
  // sectionVisibility, fields: [{ fieldId, fieldSecondaryText, fieldVisibility }] }] }
  // shape. Throws on failure so the hosting modal stays open (useApi toasts the error);
  // on success it resolves and the modal closes itself. sectionGuiName and
  // fieldSecondaryText are coerced to non-null strings — the server DTO requires a
  // string (sectionGuiName is also @IsNotEmpty) and rejects the null an unset config
  // value carries.
  const handleVisibilitySubmit = useCallback(async () => {
    const payload = {
      data: configSections.map((section) => ({
        sectionId: section.sectionId,
        sectionGuiName: section.sectionGuiName?.trim() || section.sectionName || "Section",
        sectionVisibility: sectionVisibility.get(section.sectionId) ?? section.sectionVisibility !== false,
        fields: (Array.isArray(section.fields) ? section.fields : []).map((field) => {
          const key = (field.fieldName ?? "").trim().toLowerCase();
          const configEntry = widgetFieldConfig.get(key);
          return {
            fieldId: field.fieldId,
            fieldSecondaryText: secondaryTextById.get(field.fieldId) ?? field.fieldSecondaryText ?? "",
            fieldVisibility: configEntry ? configEntry.visible : field.fieldVisibility !== false,
          };
        }),
      })),
    };
    await saveVisibility({ body: payload });
  }, [configSections, sectionVisibility, secondaryTextById, widgetFieldConfig, saveVisibility]);
  // While the Visible Settings modal is open, intercept Escape/F5 in the capture
  // phase so they act on it alone — without this, the underlying create/update
  // modal's window-level Escape would also fire and close both. F5 mirrors the
  // legacy "Save (F5)" shortcut.
  useEffect(() => {
    if (!visibilityModalOpen) {
      return;
    }
    const handleKeyDownCapture = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopImmediatePropagation();
        visibilityControllerRef.current?.closeModal();
      } else if (event.key === "F5") {
        event.preventDefault();
        event.stopImmediatePropagation();
        if (!savingVisibility) {
          void handleVisibilitySubmit()
            .then(() => visibilityControllerRef.current?.closeModal())
            .catch(() => {
              // Error toast handled by useApi; keep the modal open to retry.
            });
        }
      }
    };
    window.addEventListener("keydown", handleKeyDownCapture, true);
    return () => window.removeEventListener("keydown", handleKeyDownCapture, true);
  }, [visibilityModalOpen, savingVisibility, handleVisibilitySubmit]);
  // The Visible Settings modal hosts the whole tree as a single custom field so it
  // reuses the standard ERP modal chrome (header, backdrop, Save/Cancel footer).
  const visibilityVariant = useMemo<ERPDynamicModalVariant>(
    () => ({
      key: "visibility",
      cardTitle: "Visible Settings",
      cardDescription: "",
      cardButtonLabel: "Open",
      modalTitle: "Visible Settings",
      submitLabel: "Save (F5)",
      fields: [
        {
          name: "visibilityTree",
          label: "",
          type: "custom",
          colSpan: 2,
          render: () => (
            <WidgetVisibilityTree
              sections={treeSections}
              loading={treeLoading}
              error={treeError}
              disabled={savingVisibility}
              onToggleSection={handleToggleSection}
              onToggleField={handleToggleField}
              onChangeSecondaryText={handleChangeSecondaryText}
            />
          ),
        },
      ],
    }),
    [
      treeSections,
      treeLoading,
      treeError,
      savingVisibility,
      handleToggleSection,
      handleToggleField,
      handleChangeSecondaryText,
    ],
  );
  return (
    <>
    <CrudMasterPage
      title="Item Category"
      iconName="item_category_master_entry"
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
    <ERPDynamicModalForm
      title="Visible Settings"
      variants={[visibilityVariant]}
      showDefaultCards={false}
      hideSectionHeader
      resetOnSubmit={false}
      panelStyle={{ width: "min(680px, calc(100vw - 2rem))", maxHeight: "min(82vh, 620px)" }}
      onControllerReady={(controller) => {
        visibilityControllerRef.current = controller;
      }}
      onOpenChange={(open) => setVisibilityModalOpen(open)}
      onSubmit={() => handleVisibilitySubmit()}
    />
    </>
  );
}
