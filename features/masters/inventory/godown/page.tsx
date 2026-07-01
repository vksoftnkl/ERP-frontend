"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import CrudMasterPage, { type CrudMasterPageController } from "@/components/master/crud-master-page";
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
} from "@/components/design-system/ui/dynamic-modal-form";
import styles from "@/app/master/state-master/page.module.scss";
import { extractRows } from "@/features/masters/shared/normalizers";
import { getFirstDefinedValue, toDisplayValue } from "@/features/masters/shared/value-mappers";

const API_ENDPOINTS = {
list: "/configured-grid-sql/run?grid_id=9",
  getById: "/godowns",
  create: "/godowns/create",
  delete: "/godowns/delete",
} as const;

const GRID_TABLE_NAME = "godown_locations";

// The form fields below are re-labelled, re-ordered, and shown/hidden from the
// backend widget-masters config (fixed.form_section / form_field) for this
// screen's menu id. Only those three properties come from the API — validation,
// state shape, and submit logic stay defined locally.
const WIDGET_CONFIG_ENDPOINT = "/widget-masters/get";
const WIDGET_SECTION_MENU_ID = 39;
// Platform filter for widget sections. The server validates it against its
// WidgetPlatform enum (Mobile | Desktop | Web) case-sensitively AND matches the
// stored section_platform exactly — the godown fields live on the "Web" section.
const WIDGET_SECTION_PLATFORM = "Web";
// Bridge each hardcoded form field `name` to the backend `fieldName` it is
// configured under on menu 39's "Web" section (matched case-insensitively). The
// `__heading_location` / `__heading_attributes` headings have no configured field,
// so they keep their hardcoded labels and stay pinned with the group they introduce.
const WIDGET_FIELD_NAME_BY_FORM_FIELD: Record<string, string> = {
  masterName: "gdl_name",
  masterShortName: "gdl_short",
  branchReferenceId: "gdl_branch",
  parentLocationId: "gdl_parent",
  delSheet: "gdl_delivery",
  splitStock: "gdl_split",
  negativeStock: "gdl_negative_stock",
  volume: "gdl_volume",
  isActive: "gdl_active",
  masterDescription: "gdl_remarks",
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

const BRANCH_LOOKUP_ENDPOINT = "/master-lookups/name-id/all-accounts-and-masters";
const PARENT_LOOKUP_ENDPOINT = "/master-lookups/name-id/all-accounts-and-masters";

const BRANCH_LOOKUP_QUERY = {
  module: "branches",
  limit: "20",
} as const;

const PARENT_LOOKUP_QUERY = {
  module: "godownLocations",
  limit: "20",
} as const;

const LOOKUP_KEYS = {
  id: [
    "gdl_id",
    "gdlId",
    "gdl_location_id",
    "godown_id",
    "godownId",
    "id",
    "_id",
    "itgd_id",
    "godownid",
    "storage_id",
    "warehouse_id",
  ],
  code: [
    "gdl_code",
    "gdlCode",
    "godown_code",
    "godownCode",
    "code",
    "itgd_alias",
    "itgd_short",
    "godownalias",
    "godownshort",
    "warehouse_code",
    "storage_code",
  ],
  name: [
    "gdl_name",
    "gdlName",
    "godown_name",
    "godownName",
    "name",
    "itgd_name",
    "warehouse_name",
    "storage_name",
  ],
  short: [
    "gdl_short",
    "gdlShort",
    "itgd_short",
    "short_name",
    "shortName",
    "short",
    "godownshort",
    "warehouse_short",
  ],
  alias: [
    "gdl_short",
    "gdlShort",
    "itgd_alias",
    "alias",
    "godown_alias",
    "godownalias",
    "warehouse_alias",
  ],
  active: [
    "gdl_is_active",
    "gdlIsActive",
    "itgd_active",
    "active",
    "is_active",
    "isActive",
    "isactive",
    "status",
  ],
  position: ["gdl_sort", "gdlSort", "position", "itgd_sort", "sort"],
  description: [
    "gdl_remarks",
    "gdlRemarks",
    "itgd_description",
    "godown_description",
    "description",
    "desc",
  ],
  array: [
    "data",
    "items",
    "results",
    "rows",
    "list",
    "godowns",
    "godown_locations",
    "locations",
    "warehouses",
  ],
} as const;

const BRANCH_LOOKUP_KEYS = {
  id: ["brId", "br_id", "branch_id", "branchId", "id", "_id"],
  name: ["brName", "br_name", "branch_name", "branchName", "name"],
  code: ["brCode", "br_code", "branch_code", "branchCode", "code"],
  array: ["data", "items", "results", "rows", "list", "branches", "branch_masters"],
} as const;

const REQUEST_PAYLOAD_KEYS = {
  id: "gdl_id",
  name: "gdl_name",
  alias: "gdl_short",
  short: "gdl_short",
  description: "gdl_remarks",
  sort: "gdl_sort",
} as const;

const GODOWN_CODE_FORM_KEYS = [
  "gdl_code",
  "gdlCode",
  "godown_code",
  "godownCode",
  "code",
  "itgd_code",
  "warehouse_code",
  "storage_code",
] as const;

const GODOWN_ID_FORM_KEYS = [
  "gdl_godown_id",
  "gdlGodownId",
  "godown_id",
  "godownId",
  "warehouse_id",
  "storage_id",
] as const;

const BRANCH_ID_FORM_KEYS = ["gdl_branch_id", "gdlBranchId", "branch_id", "branchId"] as const;
const PARENT_ID_FORM_KEYS = ["gdl_parent_id", "gdlParentId", "parent_id", "parentId"] as const;
const TYPE_FORM_KEYS = ["gdl_type", "gdlType", "godown_type", "type"] as const;
const LEVEL_FORM_KEYS = ["gdl_level", "gdlLevel", "level"] as const;
const DEL_SHEET_FORM_KEYS = ["gdl_del_sheet", "gdlDelSheet", "del_sheet", "delSheet"] as const;
const SPLIT_STOCK_FORM_KEYS = [
  "gdl_split_stock",
  "gdlSplitStock",
  "split_stock",
  "splitStock",
] as const;
const NEGATIVE_STOCK_FORM_KEYS = [
  "gdl_negative_stock",
  "gdlNegativeStock",
  "negative_stock",
  "negativeStock",
] as const;
const VOLUME_FORM_KEYS = ["gdl_volume", "gdlVolume", "volume"] as const;

const DEFAULT_BRANCH_OPTION: ERPDynamicSelectOption = {
  value: "",
  label: "Select Branch",
};

const DEFAULT_PARENT_OPTION: ERPDynamicSelectOption = {
  value: "",
  label: "No Parent",
};

const GODOWN_INITIAL_FORM_VALUES = {
  godownReferenceId: "",
  branchReferenceId: "",
  parentLocationId: "",
  masterName: "",
  searchCode: "",
  masterShortName: "",
  locationType: "BIN",
  position: "0",
  level: "0",
  delSheet: "false",
  splitStock: "false",
  negativeStock: "false",
  volume: "0",
  isActive: "true",
  masterDescription: "",
} as const;

type GodownMasterPageContentProps = {
  inlineModalOnly?: boolean;
  onCrudControllerReady?: (controller: CrudMasterPageController | null) => void;
  onModalOpenChange?: (open: boolean, variantKey: string | null) => void;
  onGodownSaved?: (params: {
    godownId: string;
    shouldUpdate: boolean;
    values: Record<string, string>;
  }) => void | Promise<void>;
};

function buildGodownFormFields(
  branchOptions: ERPDynamicSelectOption[],
  parentOptions: ERPDynamicSelectOption[],
): ERPDynamicModalField[] {
  return [
    {
      name: "godownReferenceId",
      label: "Godown Id",
      visibleWhen: () => false,
    },   
    {
      name: "__heading_location",
      label: "Location Details",
      type: "heading",
    },
    {
      name: "masterName",
      label: "Godown Name",
      required: true,
      validation: {
        minLength: 2,
        minLengthMessage: "godown Name must be at least 2 characters.",
      },
    },
    {
      name: "masterShortName",
      label: "Short Name",
    },
     {
      name: "branchReferenceId",
      label: "Branch Id",
      type: "select",
      searchable: true,
      required: true,
      options: branchOptions,
      placeholder: "Search branch",
      validation: {
        requiredMessage: "Branch Id is required.",
      },
    },
    {
      name: "parentLocationId",
      label: "Parent Location Id",
      type: "select",
      searchable: true,
      options: parentOptions,
      placeholder: "Search parent location",
    },
    {
      name: "__heading_attributes",
      label: "Stock Settings",
      type: "heading",
    },
    {
      name: "delSheet",
      label: "Delivery Sheet",
      type: "checkbox",
    },
    {
      name: "splitStock",
      label: "Split Stock",
      type: "checkbox",
    },
    {
      name: "negativeStock",
      label: "Allow Negative Stock",
      type: "checkbox",
    },
    {
      name: "volume",
      label: "Volume",
      type: "number",
      min: 0,
      step: "0.0001",
      validation: {
        minMessage: "Volume must be 0 or greater.",
      },
    },
    {
      name: "isActive",
      label: "Active",
      type: "checkbox",
    },
    {
      name: "masterDescription",
      label: "Remarks",
      colSpan: 2,
    },
  ];
}



function toInteger(value: string, fallback: number): number {
  const parsed = Number.parseInt(value.trim(), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toDecimal(value: string, fallback: number): number {
  const parsed = Number.parseFloat(value.trim());
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value === "true") {
    return true;
  }

  if (value === "false") {
    return false;
  }

  return fallback;
}

function toNullableTrimmedString(value: string | undefined): string | null {
  const normalized = value?.trim() ?? "";
  return normalized ? normalized : null;
}


function extractResponseRecord(payload: unknown): Record<string, unknown> | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return null;
  }

  const root = payload as Record<string, unknown>;
  if (root.data && typeof root.data === "object" && !Array.isArray(root.data)) {
    return root.data as Record<string, unknown>;
  }

  return root;
}

function buildBranchOptions(payload: unknown): ERPDynamicSelectOption[] {
  const optionMap = new Map<string, string>();
  const rows = extractRows(payload, BRANCH_LOOKUP_KEYS.array);

  for (const row of rows) {
    if (!row || typeof row !== "object" || Array.isArray(row)) {
      continue;
    }

    const source = row as Record<string, unknown>;
    const branchId = toDisplayValue(getFirstDefinedValue(source, BRANCH_LOOKUP_KEYS.id));
    if (!branchId) {
      continue;
    }

    const branchName = toDisplayValue(getFirstDefinedValue(source, BRANCH_LOOKUP_KEYS.name));
    if (!branchName) {
      continue;
    }

    const branchCode = toDisplayValue(getFirstDefinedValue(source, BRANCH_LOOKUP_KEYS.code));
    const label = branchCode ? `${branchName} (${branchCode})` : branchName;

    if (!optionMap.has(branchId)) {
      optionMap.set(branchId, label);
    }
  }

  const sortedOptions = Array.from(optionMap.entries())
    .map(([value, label]) => ({ value, label }))
    .sort((left, right) => left.label.localeCompare(right.label));

  return [DEFAULT_BRANCH_OPTION, ...sortedOptions];
}

function buildParentOptions(payload: unknown): ERPDynamicSelectOption[] {
  const optionMap = new Map<string, string>();
  const rows = extractRows(payload, LOOKUP_KEYS.array);

  for (const row of rows) {
    if (!row || typeof row !== "object" || Array.isArray(row)) {
      continue;
    }

    const source = row as Record<string, unknown>;
    const parentId = toDisplayValue(getFirstDefinedValue(source, LOOKUP_KEYS.id));
    if (!parentId) {
      continue;
    }

    const parentName = toDisplayValue(getFirstDefinedValue(source, LOOKUP_KEYS.name));
    if (!parentName) {
      continue;
    }

    const parentCode = toDisplayValue(getFirstDefinedValue(source, LOOKUP_KEYS.code));
    const label = parentCode ? `${parentName} (${parentCode})` : parentName;

    if (!optionMap.has(parentId)) {
      optionMap.set(parentId, label);
    }
  }

  const sortedOptions = Array.from(optionMap.entries())
    .map(([value, label]) => ({ value, label }))
    .sort((left, right) => left.label.localeCompare(right.label));

  return [DEFAULT_PARENT_OPTION, ...sortedOptions];
}

function toUpdateGodownId(editingItemId: string | number | null): string | number {
  if (typeof editingItemId === "number" && Number.isFinite(editingItemId)) {
    return editingItemId;
  }

  if (typeof editingItemId === "string") {
    const normalized = editingItemId.trim();
    if (!normalized) {
      return "";
    }

    if (/^\d+$/.test(normalized)) {
      const parsed = Number.parseInt(normalized, 10);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }

    return normalized;
  }

  return "";
}

export default function GodownMasterPageContent({
  inlineModalOnly,
  onCrudControllerReady,
  onModalOpenChange,
  onGodownSaved,
}: GodownMasterPageContentProps = {}) {
  const { getAll: getBranchLookup } = useApi<unknown>(BRANCH_LOOKUP_ENDPOINT);
  const { getAll: getParentLookup } = useApi<unknown>(PARENT_LOOKUP_ENDPOINT);
  // Silent progressive enhancement: a failed config fetch leaves the form on its
  // hardcoded labels/order (empty map), so don't nag the user with an error toast.
  const { getAll: getWidgetConfig } = useApi<WidgetMastersResponse>(WIDGET_CONFIG_ENDPOINT, {
    toast: { error: false },
  });
  const [branchOptions, setBranchOptions] = useState<ERPDynamicSelectOption[]>([
    DEFAULT_BRANCH_OPTION,
  ]);
  const [parentOptions, setParentOptions] = useState<ERPDynamicSelectOption[]>([
    DEFAULT_PARENT_OPTION,
  ]);
  const [widgetFieldConfig, setWidgetFieldConfig] = useState<Map<string, ResolvedFieldConfig>>(
    () => new Map(),
  );
  // Toggles the `wantdelete` grid param; ticking it re-runs the list so the user
  // can see soft-deleted godown locations. Lives beside the list search input.
  const [wantDelete, setWantDelete] = useState(false);

  useEffect(() => {
    let mounted = true;

    void (async () => {
      try {
        const [branchPayload, parentPayload] = await Promise.all([
          getBranchLookup(BRANCH_LOOKUP_QUERY),
          getParentLookup(PARENT_LOOKUP_QUERY),
        ]);

        if (!mounted) {
          return;
        }

        setBranchOptions(buildBranchOptions(branchPayload));
        setParentOptions(buildParentOptions(parentPayload));
      } catch {
        if (mounted) {
          setBranchOptions([DEFAULT_BRANCH_OPTION]);
          setParentOptions([DEFAULT_PARENT_OPTION]);
        }
      }
    })();

    return () => {
      mounted = false;
    };
  }, [getBranchLookup, getParentLookup]);

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

  const godownFormFields = useMemo(
    () =>
      applyWidgetFieldConfig(
        buildGodownFormFields(branchOptions, parentOptions),
        widgetFieldConfig,
        WIDGET_FIELD_NAME_BY_FORM_FIELD,
      ),
    [branchOptions, parentOptions, widgetFieldConfig],
  );

  // Adds the `grid_param` payload to the default page/limit/search list query.
  // The server JSON-parses it and binds each key into the matching named token in
  // grid 9's stored SQL; keys with no matching token are ignored. `wantdelete` is
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
  // "Web" platform to match the configured godown section.
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
      title="Godown Location"
      iconName="godown_master_entry"
      auditHistory={{ screenName: "Godown Location Master" }}
      entityLabel="godown location"
      entityLabelPlural="godown locations"
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
        gridDetailId={9}
      lookupKeys={LOOKUP_KEYS}
      requestPayloadKeys={REQUEST_PAYLOAD_KEYS}
      styles={styles}
      listTitle="Godown Location List"
      listTitleOverride="Location List"
      createLabel="Add Location"
      codeColumnHeader="Location Code"
      nameColumnHeader="Location Name"
      nameFieldLabel="Location Name"
      nameFieldPlaceholder="Main Bin"
      formTitle="Godown Location Form"
      formDescription="Create and update godown locations."
      customFields={godownFormFields}
      createInitialValues={GODOWN_INITIAL_FORM_VALUES}
      viewModalTitle="Location Details"
      createModalTitle="Location Entry"
      editModalTitle="Edit Location Entry"
        modalPanelStyle={{ width: "min(40rem, calc(100vw - 2.4rem))" }}
      onCrudControllerReady={onCrudControllerReady}
      onModalOpenChange={onModalOpenChange}
      hideListPage={inlineModalOnly}
      buildGetByIdRequest={({ recordId }) => ({
        query: {
          gdl_id: String(recordId),
        },
      })}
      mapFormValues={({ source, defaults }) => {
        const rowSource = source ?? {};

        return {
          ...GODOWN_INITIAL_FORM_VALUES,
          godownReferenceId: toDisplayValue(getFirstDefinedValue(rowSource, GODOWN_ID_FORM_KEYS)),
          branchReferenceId: toDisplayValue(getFirstDefinedValue(rowSource, BRANCH_ID_FORM_KEYS)),
          parentLocationId: toDisplayValue(getFirstDefinedValue(rowSource, PARENT_ID_FORM_KEYS)),
          masterName:
            toDisplayValue(getFirstDefinedValue(rowSource, LOOKUP_KEYS.name)) ||
            defaults.masterName,
          searchCode:
            toDisplayValue(getFirstDefinedValue(rowSource, GODOWN_CODE_FORM_KEYS)) ||
            defaults.searchCode,
          masterShortName:
            toDisplayValue(getFirstDefinedValue(rowSource, LOOKUP_KEYS.short)) ||
            defaults.masterShortName,
          locationType:
            toDisplayValue(getFirstDefinedValue(rowSource, TYPE_FORM_KEYS)) ||
            GODOWN_INITIAL_FORM_VALUES.locationType,
          position:
            toDisplayValue(getFirstDefinedValue(rowSource, LOOKUP_KEYS.position)) ||
            defaults.position,
          level:
            toDisplayValue(getFirstDefinedValue(rowSource, LEVEL_FORM_KEYS)) ||
            GODOWN_INITIAL_FORM_VALUES.level,
          delSheet:
            toDisplayValue(getFirstDefinedValue(rowSource, DEL_SHEET_FORM_KEYS)) ||
            GODOWN_INITIAL_FORM_VALUES.delSheet,
          splitStock:
            toDisplayValue(getFirstDefinedValue(rowSource, SPLIT_STOCK_FORM_KEYS)) ||
            GODOWN_INITIAL_FORM_VALUES.splitStock,
          negativeStock:
            toDisplayValue(getFirstDefinedValue(rowSource, NEGATIVE_STOCK_FORM_KEYS)) ||
            GODOWN_INITIAL_FORM_VALUES.negativeStock,
          volume:
            toDisplayValue(getFirstDefinedValue(rowSource, VOLUME_FORM_KEYS)) ||
            GODOWN_INITIAL_FORM_VALUES.volume,
          isActive:
            toDisplayValue(getFirstDefinedValue(rowSource, LOOKUP_KEYS.active)) ||
            GODOWN_INITIAL_FORM_VALUES.isActive,
          masterDescription:
            toDisplayValue(getFirstDefinedValue(rowSource, LOOKUP_KEYS.description)) ||
            defaults.masterDescription,
        };
      }}
      buildRequestPayload={({ values, shouldUpdate, editingItemId }) => {
        const gdlName = (values.masterName ?? "").trim();
        const gdlGodownId = (values.godownReferenceId ?? "").trim();
        const gdlBranchId = (values.branchReferenceId ?? "").trim();
        const gdlParentId = toNullableTrimmedString(values.parentLocationId);
        const gdlCode = toNullableTrimmedString(values.searchCode);
        const gdlShort = toNullableTrimmedString(values.masterShortName);
        const gdlType = (values.locationType ?? "").trim() || "BIN";
        const gdlSort = toInteger(values.position ?? "0", 0);
        const gdlLevel = toInteger(values.level ?? "0", 0);
        const gdlDelSheet = toBoolean(values.delSheet, false);
        const gdlSplitStock = toBoolean(values.splitStock, false);
        const gdlNegativeStock = toBoolean(values.negativeStock, false);
        const gdlVolume = toDecimal(values.volume ?? "0", 0);
        const gdlIsActive = toBoolean(values.isActive, true);
        const gdlRemarks = toNullableTrimmedString(values.masterDescription);

        return {
          ...(shouldUpdate ? { gdl_id: toUpdateGodownId(editingItemId) } : {}),
          ...(shouldUpdate ? { gdl_godown_id: gdlGodownId || undefined } : {}),
          gdl_branch_id: gdlBranchId || undefined,
          gdl_name: gdlName,
          gdl_short: gdlShort,
          gdl_code: gdlCode,
          gdl_type: gdlType,
          gdl_parent_id: gdlParentId,
          gdl_sort: gdlSort,
          gdl_level: gdlLevel,
          gdl_del_sheet: gdlDelSheet,
          gdl_split_stock: gdlSplitStock,
          gdl_negative_stock: gdlNegativeStock,
          gdl_volume: gdlVolume,
          gdl_is_active: gdlIsActive,
          gdl_remarks: gdlRemarks,
        };
      }}
      afterSubmitSuccess={async ({ response, payload, values, editingItemId, shouldUpdate }) => {
        const responseSource = extractResponseRecord(response);
        const savedGodownId =
          toDisplayValue(getFirstDefinedValue(responseSource ?? {}, LOOKUP_KEYS.id)) ||
          toDisplayValue(payload.gdl_id) ||
          (editingItemId !== null ? String(editingItemId) : "");
        if (!savedGodownId) {
          return;
        }

        await onGodownSaved?.({
          godownId: savedGodownId,
          shouldUpdate,
          values,
        });
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
