"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import CrudMasterPage from "@/components/master/crud-master-page";
import WidgetVisibilityTree, {
  type WidgetTreeSectionView,
} from "@/features/masters/shared/widget-visibility-tree";
import { useVisibleSettingsContextMenu } from "@/features/masters/shared/use-visible-settings-context-menu";
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
import {
  extractRows,
  getFirstDefinedValue,
  toDisplayValue,
  toNullableString,
  toUpdateId,
} from "@/app/master/_shared/crud-utils";
import {
  resolveStoredPhotoName,
  resolveStoredPhotoPreview,
} from "@/features/masters/shared/stored-photo";
import { useDataRefresh } from "@/lib/data-freshness";
const API_ENDPOINTS = {
  list: "/configured-grid-sql/run?grid_id=7",
  getById: "/item-brands/get",
  create: "/item-brands/create",
  delete: "/item-brands/delete",
} as const;
const GRID_TABLE_NAME = "item_brand_master";
// The form fields below are re-labelled, re-ordered, and shown/hidden from the
// backend widget-masters config (fixed.form_section / form_field) for this
// screen's menu id. Only those three properties come from the API — validation,
// state shape, and submit logic stay defined locally.
const WIDGET_CONFIG_ENDPOINT = "/widget-masters/get";
const WIDGET_SECTION_MENU_ID = 36;
// Platform filter for widget sections. The server validates it against its
// WidgetPlatform enum (Mobile | Desktop | Web) case-sensitively AND matches the
// stored section_platform exactly — the brand fields live on the "Web" section.
const WIDGET_SECTION_PLATFORM = "Web";
// Bridge each hardcoded form field `name` (camelCase aliases used by form state
// and the submit payload) to the backend `fieldName` it is configured under
// (the item_* keys on menu 36's brand section, matched case-insensitively). Form
// fields with no mapping — or no matching response entry — keep their hardcoded
// label and render after all configured fields.
const WIDGET_FIELD_NAME_BY_FORM_FIELD: Record<string, string> = {
  masterName: "item_brand_name",
  masterShortName: "item_short",
  position: "item_position",
  parentBrandId: "item_parent",
  masterDescription: "item_description",
  brandPhoto: "item_image",
};
// Right-clicking inside the open create/update modal opens a tree popup of this
// menu's configured sections/fields (GET /widget-masters/config?menu_id=…).
// Ticking a field toggles its live visibility in the form via the same config map.
const WIDGET_CONFIG_TREE_ENDPOINT = "/widget-masters/config";
// Persists the tree's section/field visibility back to the server (PATCH).
const WIDGET_VISIBILITY_ENDPOINT = "/widget-masters/visibility";
// Backend fieldNames (lowercased) that map to a real form field, so their popup
// checkbox can actually show/hide something. Others are left out of the popup.
const WIDGET_CONTROLLABLE_FIELD_NAMES = buildControllableFieldNames(WIDGET_FIELD_NAME_BY_FORM_FIELD);
// Parent Brand is a lazy, server-side searchable configured dropdown
// (fixed.dropdown_details id 18 -> item_brand_master active rows). Loaded on open + on
// debounced server-side search via /dropdown-details/run; nothing is fetched up front
// and dropdown_param is never sent.
const DROPDOWN_RUN_ENDPOINT = "/dropdown-details/run";
const PARENT_BRAND_DROPDOWN_ID = "18";
const PARENT_BRAND_DROPDOWN_ID_KEYS = ["brand_id", "brandId"] as const;
const PARENT_BRAND_DROPDOWN_LABEL_KEYS = ["brand_name", "brandName"] as const;
const PARENT_BRAND_SEARCH_DEBOUNCE_MS = 250;
const LOOKUP_KEYS = {
  id: ["brand_id", "brandId", "id", "_id", "itb_id", "item_brand_id", "itemBrandId"],
  code: ["brand_alias", "brandAlias", "brand_short", "brandShort", "code", "itb_alias", "itb_short"],
  name: ["brand_name", "brandName", "name", "itb_name", "itembrandname", "item_brand_name", "itemBrandName"],
  short: ["brand_short", "brandShort", "itb_short", "short_name", "shortName", "short"],
  alias: ["brand_alias", "brandAlias", "itb_alias", "alias", "item_brand_alias"],
  active: ["brand_is_active", "brandIsActive", "itb_active", "active", "is_active", "isActive", "status"],
  position: ["brand_sort", "brandSort", "position", "itb_sort", "sort"],
  description: ["brand_description", "brandDescription", "itb_description", "description", "desc"],
  array: ["data", "items", "results", "rows", "list", "brands", "itemBrands"],
} as const;
const REQUEST_PAYLOAD_KEYS = {
  id: "brand_id",
  name: "brand_name",
  alias: "brand_alias",
  short: "brand_short",
  description: "brand_description",
  sort: "brand_sort",
} as const;
const BRAND_PARENT_ID_KEYS = ["brand_parent_id", "brandParentId", "parent_id", "parentId", "parent_brand_id", "parentBrandId"] as const;
const BRAND_PARENT_NAME_KEYS = ["brand_parent_name", "brandParentName", "parent_name", "parentName", "parent_brand_name"] as const;
const BRAND_LEVEL_KEYS = ["brand_level", "brandLevel", "level"] as const;
const BRAND_PHOTO_URL_KEYS = ["brand_photo_url", "brandPhotoUrl", "photo_url", "photoUrl"] as const;
const BRAND_PHOTO_KEYS = ["brand_photo", "brandPhoto"] as const;
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
const DEFAULT_PARENT_OPTION: ERPDynamicSelectOption = {
  value: "",
  label: "None",
};
// Map dropdown-run rows ({ data: { items: [...] } }) for dropdown 18 to <id,name>
// options. The "None" head is prepended so the parent can be cleared (top-level brand).
function buildParentOptions(payload: unknown): ERPDynamicSelectOption[] {
  const optionMap = new Map<string, string>();
  for (const row of extractRows(payload)) {
    if (!row || typeof row !== "object" || Array.isArray(row)) {
      continue;
    }
    const source = row as Record<string, unknown>;
    const id = toDisplayValue(getFirstDefinedValue(source, PARENT_BRAND_DROPDOWN_ID_KEYS));
    if (!id) {
      continue;
    }
    const label = toDisplayValue(getFirstDefinedValue(source, PARENT_BRAND_DROPDOWN_LABEL_KEYS));
    if (!optionMap.has(id)) {
      optionMap.set(id, label || id);
    }
  }
  const options = Array.from(optionMap.entries())
    .map(([value, label]) => ({ value, label }))
    .sort((left, right) => left.label.localeCompare(right.label));
  return [DEFAULT_PARENT_OPTION, ...options];
}
// Build the run query. An empty search is omitted so the server returns the first page;
// dropdown_param is never sent.
function buildParentRunQuery(search: string): Record<string, string> {
  const query: Record<string, string> = {
    dropdown_id: PARENT_BRAND_DROPDOWN_ID,
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
const INITIAL_FORM_VALUES = {
  masterName: "",
  searchCode: "",
  masterAlias: "",
  masterShortName: "",
  masterDescription: "",
  position: "0",
  parentBrandId: "",
  brandLevel: "0",
  brandPhotoUrl: "",
  brandPhoto: "",
  brandPhotoPreview: "",
} as const;
type LazyParentHandlers = {
  onSearchOpenChange: (open: boolean) => void;
  onSearchQueryChange: ERPDynamicSearchQueryChangeHandler;
  onValueChange: ERPDynamicFieldValueChangeHandler;
};
function buildItemBrandFormFields(
  parentOptions: ERPDynamicSelectOption[],
  lazyParent: LazyParentHandlers,
): ERPDynamicModalField[] {
  return [
    {
      name: "masterName",
      label: "Item Brand Name",
      required: true,
      colSpan: 2,
      validation: {
        minLength: 2,
        minLengthMessage: "Item Brand Name must be at least 2 characters.",
      },
    },
    {
      name: "masterShortName",
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
      name: "parentBrandId",
      label: "Parent Brand",
      type: "select",
      colSpan: 2,
      searchable: true,
      serverSearch: true,
      options: parentOptions,
      onSearchOpenChange: lazyParent.onSearchOpenChange,
      onSearchQueryChange: lazyParent.onSearchQueryChange,
      onValueChange: lazyParent.onValueChange,
    },
    {
      name: "masterDescription",
      label: "Description",
      type: "textarea",
      colSpan: 2,
    },
    {
      name: "brandPhoto",
      label: "Image",
      type: "file",
      accept: "image/*",
      maxFileSizeBytes: FILE_CONSTRAINTS.MAX_UPLOAD_IMAGE_BYTES,
      allowedMimeTypes: [...FILE_CONSTRAINTS.ALLOWED_MIME_TYPES],
      previewImageValueKey: "brandPhotoPreview",
      helperText: "Optional. Sent as base64 in brand_photo.",
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
export default function ItemBrandMasterPage() {
  // Lazy server-side Parent Brand dropdown (configured dropdown 18 via
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
  const [parentOptions, setParentOptions] = useState<ERPDynamicSelectOption[]>([
    DEFAULT_PARENT_OPTION,
  ]);
  const [widgetFieldConfig, setWidgetFieldConfig] = useState<Map<string, ResolvedFieldConfig>>(
    () => new Map(),
  );
  // Mirror of the latest options + the pinned selection so the value handler can resolve
  // a picked label and the selection stays visible after a fetch replaces the list.
  const parentOptionsRef = useRef<ERPDynamicSelectOption[]>([DEFAULT_PARENT_OPTION]);
  const pinnedParentOptionRef = useRef<ERPDynamicSelectOption | null>(null);
  const parentSearchTimeoutRef = useRef<number | null>(null);
  // Toggles the `wantdelete` grid param; ticking it re-runs the list so the user
  // can see soft-deleted item brands. Lives beside the list search input.
  const [wantDelete, setWantDelete] = useState(false);
  // Loaded on mount and again on every data-refresh signal, so a field config
  // changed in the database reaches this form without a reload.
  const loadWidgetFieldConfig = useCallback(() => {
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
  useEffect(() => loadWidgetFieldConfig(), [loadWidgetFieldConfig]);
  useDataRefresh(() => {
    loadWidgetFieldConfig();
  });
  const applyParentOptions = useCallback((options: ERPDynamicSelectOption[]) => {
    parentOptionsRef.current = options;
    setParentOptions(options);
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
          withPinnedOption(buildParentOptions(payload), pinnedParentOptionRef.current),
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
        const delay = query.trim() ? PARENT_BRAND_SEARCH_DEBOUNCE_MS : 0;
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
        applyParentOptions([DEFAULT_PARENT_OPTION]);
        return;
      }
      const option: ERPDynamicSelectOption = { value, label: parentName.trim() || value };
      pinnedParentOptionRef.current = option;
      applyParentOptions([DEFAULT_PARENT_OPTION, option]);
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
  const formFields = useMemo(
    () =>
      applyWidgetFieldConfig(
        buildItemBrandFormFields(parentOptions, lazyParentHandlers),
        widgetFieldConfig,
        WIDGET_FIELD_NAME_BY_FORM_FIELD,
      ),
    [parentOptions, lazyParentHandlers, widgetFieldConfig],
  );
  // Adds the `grid_param` payload to the default page/limit/search list query.
  // The server JSON-parses it and binds each key into the matching named token in
  // grid 7's stored SQL; keys with no matching token are ignored. `wantdelete` is
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
  // "Web" platform so the legacy non-Web section on this menu stays out of the tree.
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
  // Right-clicking inside the open create/update modal opens the Visible Settings
  // modal (an ERPDynamicModalForm) on top via its controller; right-clicks
  // elsewhere keep the browser's native context menu.
  useVisibleSettingsContextMenu({
    loadConfigTree,
    openVisibilitySettings: () => visibilityControllerRef.current?.openModal("visibility"),
  });
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
      title="Brand"
      iconName="item_brand_master_entry"
      auditHistory={{ screenName: "Item Brand Master" }}
      entityLabel="item brand"
      entityLabelPlural="item brands"
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
      lookupKeys={LOOKUP_KEYS}
      requestPayloadKeys={REQUEST_PAYLOAD_KEYS}
      styles={styles}
      listTitle="Brand List"
      listTitleOverride="Brand List"
      createLabel="Add Item Brand"
      codeColumnHeader="Brand Code"
      nameColumnHeader="Brand Name"
      nameFieldLabel="Item Brand Name"
      nameFieldPlaceholder="Enter item brand name"
      formTitle="Item Brand Form"
      formDescription="Manage item brands and thier display order."
      customFields={formFields}
      createInitialValues={INITIAL_FORM_VALUES}
      createModalTitle="Brand Entry"
      editModalTitle="Edit Brand Entry"
      viewModalTitle="Brand Details"
      modalPanelStyle={{ width: "min(52rem, calc(100vw - 2rem))", maxHeight: "min(82vh, 42rem)" }}
      onModalOpenChange={(open, variantKey) => {
        // Clear the lazy parent dropdown when the create modal opens so no stale
        // selection from a previously edited brand lingers (it reloads on open).
        if (open && variantKey === "master-create") {
          seedSelectedParent("", "");
        }
      }}
      mapFormValues={({ source, defaults }) => {
        const rowSource = source ?? {};
        const brandPhotoUrl = toDisplayValue(getFirstDefinedValue(rowSource, BRAND_PHOTO_URL_KEYS));
        const brandPhotoBase64 = toDisplayValue(getFirstDefinedValue(rowSource, BRAND_PHOTO_KEYS));
        const parentBrandId = toDisplayValue(getFirstDefinedValue(rowSource, BRAND_PARENT_ID_KEYS));
        // Seed the lazy Parent Brand dropdown with the saved selection so the trigger
        // shows the parent name on edit/view before the field is opened (and loaded).
        seedSelectedParent(
          parentBrandId,
          toDisplayValue(getFirstDefinedValue(rowSource, BRAND_PARENT_NAME_KEYS)),
        );
        return {
          ...INITIAL_FORM_VALUES,
          masterName:
            toDisplayValue(getFirstDefinedValue(rowSource, LOOKUP_KEYS.name)) || defaults.masterName,
          searchCode:
            toDisplayValue(getFirstDefinedValue(rowSource, LOOKUP_KEYS.code)) || defaults.searchCode,
          masterAlias:
            toDisplayValue(getFirstDefinedValue(rowSource, LOOKUP_KEYS.alias)) || defaults.masterAlias,
          masterShortName:
            toDisplayValue(getFirstDefinedValue(rowSource, LOOKUP_KEYS.short)) || defaults.masterShortName,
          masterDescription:
            toDisplayValue(getFirstDefinedValue(rowSource, LOOKUP_KEYS.description)) || defaults.masterDescription,
          position:
            toDisplayValue(getFirstDefinedValue(rowSource, LOOKUP_KEYS.position)) || defaults.position,
          parentBrandId,
          brandLevel: toDisplayValue(getFirstDefinedValue(rowSource, BRAND_LEVEL_KEYS)) || "0",
          brandPhotoUrl,
          // Stored file name + preview image for the file field on edit/view.
          brandPhoto: resolveStoredPhotoName(brandPhotoUrl, brandPhotoBase64.length > 0),
          brandPhotoPreview: resolveStoredPhotoPreview(brandPhotoBase64, brandPhotoUrl),
        };
      }}
      buildRequestPayload={async ({ values, shouldUpdate, editingItemId, files }) => {
        const brandName = (values.masterName ?? "").trim();
        const brandCode = (values.searchCode ?? "").trim();
        const brandAlias = (values.masterAlias ?? "").trim() || brandCode;
        const brandShort = (values.masterShortName ?? "").trim() || brandCode || brandAlias;
        const brandDescription = toNullableString(values.masterDescription ?? "");
        const uploadedImage = files.brandPhoto;
        const brandPhoto =
          uploadedImage && uploadedImage.size > 0
            ? getBase64FromDataUrl(await readFileAsDataUrl(uploadedImage))
            : undefined;
        return {
          brand_name: brandName,
          brand_alias: brandAlias || null,
          brand_short: brandShort || null,
          brand_description: brandDescription,
          brand_parent_id: toNullableReference(values.parentBrandId ?? ""),
          brand_sort: toInteger(values.position ?? "0", 0),
          brand_level: Math.max(0, toInteger(values.brandLevel ?? "0", 0)),
          // Persist the uploaded file's name in brand_photo_url so edit/view can
          // show it later (an explicit URL is kept when no new file is chosen).
          brand_photo_url: brandPhoto
            ? uploadedImage!.name
            : (values.brandPhotoUrl ?? "").trim(),
          ...(brandPhoto ? { brand_photo: brandPhoto } : {}),
          ...(shouldUpdate && editingItemId !== null ? { brand_id: toUpdateId(editingItemId) } : {}),
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