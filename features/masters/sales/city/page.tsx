"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import CrudMasterPage from "@/components/master/crud-master-page";
import { useApi } from "@/hooks/useApi";
import {
  ERPDynamicModalForm,
  type ERPDynamicModalController,
  type ERPDynamicModalField,
  type ERPDynamicModalVariant,
  type ERPDynamicSelectOption,
} from "@/components/design-system/ui/dynamic-modal-form";
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
import styles from "@/app/master/state-master/page.module.scss";
import { extractRows } from "@/features/masters/shared/normalizers";
import { getFirstDefinedValue, toDisplayValue, toSelectBoolean } from "@/features/masters/shared/value-mappers";
const API_ENDPOINTS = {
  list: "/configured-grid-sql/run?grid_id=20",
  getById: "/cities/get",
  create: "/cities/create",
  delete: "/cities/delete",
} as const;
const GRID_TABLE_NAME = "city_master";
const STATE_LOOKUP_ENDPOINT = "/master-lookups/name-id/all-accounts-and-masters";
const LOOKUP_REQUEST_QUERY = {
  module: "states",
  limit: "20",
} as const;
// The form fields below are re-labelled, re-ordered, and shown/hidden from the
// backend widget-masters config (fixed.form_section / form_field) for this
// screen's menu id. Only those three properties come from the API — validation,
// state shape, and submit logic stay defined locally.
const WIDGET_CONFIG_ENDPOINT = "/widget-masters/get";
const WIDGET_SECTION_MENU_ID = 19;
// Matches the section_platform stored for this menu (case-sensitive equality on
// the server), so the config actually resolves rather than silently no-opping.
const WIDGET_SECTION_PLATFORM = "Web";
// Bridge each hardcoded form field `name` (camelCase aliases used by form state
// and the submit payload) to the backend `fieldName` it is configured under
// (cty_* column-style keys, matched case-insensitively). Form fields with no
// mapping — or no matching response entry — keep their hardcoded label and
// render after all configured fields.
const WIDGET_FIELD_NAME_BY_FORM_FIELD: Record<string, string> = {
  masterName: "cty_name",
  masterAlias: "cty_alias",
  masterShortName: "cty_short",
  cityStateId: "cty_state",
  position: "cty_order",
  cityIsActive: "cty_is_active",
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
const LOOKUP_KEYS = {
  id: ["ctmId", "ctm_id", "city_id", "cityId", "id", "_id"],
  code: ["ctmAlias", "ctm_alias", "ctmShort", "ctm_short", "city_code", "code"],
  name: ["ctmName", "ctm_name", "city_name", "cityName", "name"],
  short: ["ctmShort", "ctm_short", "city_short", "short_name", "shortName", "short"],
  alias: ["ctmAlias", "ctm_alias", "city_alias", "alias"],
  active: ["ctmIsActive", "ctm_is_active", "active", "is_active", "isActive", "status"],
  position: ["ctmOrder", "ctm_order", "city_order", "city_sort", "position", "sort"],
  description: ["ctmAlias", "ctm_alias"],
  array: ["data", "items", "results", "rows", "list", "cities"],
} as const;
const REQUEST_PAYLOAD_KEYS = {
  id: "ctmId",
  name: "ctmName",
  alias: "ctmAlias",
  short: "ctmShort",
  description: "ctmAlias",
  sort: "ctmOrder",
} as const;
const CITY_STATE_ID_KEYS = ["ctmStateId", "ctm_state_id", "state_id", "stateId"] as const;
const CITY_IS_ACTIVE_KEYS = ["ctmIsActive", "ctm_is_active", "isActive", "is_active", "status"] as const;
const STATE_LOOKUP_KEYS = {
  id: ["stmId", "stm_id", "state_id", "stateId", "id", "_id"],
  name: ["stmName", "stm_name", "state_name", "stateName", "name"],
  array: ["data", "items", "results", "rows", "list", "states"],
} as const;
const DEFAULT_STATE_OPTION: ERPDynamicSelectOption = {
  value: "",
  label: "Select State",
};
const CITY_INITIAL_FORM_VALUES = {
  masterName: "",
  masterAlias: "",
  masterShortName: "",
  cityStateId: "",
  position: "0",
  cityIsActive: "true",
} as const;
function buildCityFormFields(stateOptions: ERPDynamicSelectOption[]): ERPDynamicModalField[] {
  return [
    {
      name: "masterName",
      label: "City Name",
      colSpan: 2,
      required: true,
      validation: {
        minLength: 2,
        minLengthMessage: "City Name must be at least 2 characters.",
      },
    },
    {
      name: "masterAlias",
      label: "Alias",
      colSpan: 2,
    },
    {
      name: "masterShortName",
      label: "Short Name",
      colSpan: 2,
    },
    {
      name: "cityStateId",
      label: "State",
      type: "select",
      colSpan: 2,
      searchable: true,
      required: true,
      options: stateOptions,
      placeholder: "Search state",
      validation: {
        requiredMessage: "State is required.",
      },
    },
    {
      name: "position",
      label: "Order",
      type: "number",
      min: 0,
      step: 1,
      validation: {
        minMessage: "Order must be 0 or greater.",
      },
    },
    {
      name: "cityIsActive",
      label: "Status",
      type: "checkbox",
      options: [
        { label: "Active", value: "true" },
        { label: "Inactive", value: "false" },
      ],
    },
  ];
}
function toInteger(value: string, fallback: number): number {
  const parsed = Number.parseInt(value.trim(), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}
function toUpdateCityId(editingItemId: string | number | null): string {
  if (typeof editingItemId === "number" && Number.isFinite(editingItemId)) {
    return String(editingItemId);
  }
  if (typeof editingItemId === "string") {
    return editingItemId.trim();
  }
  return "";
}
function buildStateOptions(payload: unknown): ERPDynamicSelectOption[] {
  const optionMap = new Map<string, string>();
  const rows = extractRows(payload, STATE_LOOKUP_KEYS.array);
  for (const row of rows) {
    if (!row || typeof row !== "object" || Array.isArray(row)) {
      continue;
    }
    const source = row as Record<string, unknown>;
    const stateId = toDisplayValue(getFirstDefinedValue(source, STATE_LOOKUP_KEYS.id));
    if (!stateId) {
      continue;
    }
    const stateName = toDisplayValue(getFirstDefinedValue(source, STATE_LOOKUP_KEYS.name));
    if (!stateName) {
      continue;
    }
    if (!optionMap.has(stateId)) {
      optionMap.set(stateId, stateName);
    }
  }
  const sortedOptions = Array.from(optionMap.entries())
    .map(([value, label]) => ({ value, label }))
    .sort((left, right) => left.label.localeCompare(right.label));
  return [DEFAULT_STATE_OPTION, ...sortedOptions];
}
export default function CityMasterPage() {
  const { getAll: getStateLookup } = useApi<unknown>(STATE_LOOKUP_ENDPOINT);
  const [stateOptions, setStateOptions] = useState<ERPDynamicSelectOption[]>([DEFAULT_STATE_OPTION]);
  useEffect(() => {
    let mounted = true;
    void (async () => {
      try {
        const payload = await getStateLookup(LOOKUP_REQUEST_QUERY);
        if (!mounted) {
          return;
        }
        setStateOptions(buildStateOptions(payload));
      } catch {
        if (mounted) {
          setStateOptions([DEFAULT_STATE_OPTION]);
        }
      }
    })();
    return () => {
      mounted = false;
    };
  }, [getStateLookup]);

  // Silent progressive enhancement: a failed config fetch leaves the form on its
  // hardcoded labels/order (empty map), so don't nag the user with an error toast.
  const { getAll: getWidgetConfig } = useApi<WidgetMastersResponse>(WIDGET_CONFIG_ENDPOINT, {
    toast: { error: false },
  });
  const [widgetFieldConfig, setWidgetFieldConfig] = useState<Map<string, ResolvedFieldConfig>>(
    () => new Map(),
  );
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

  // Re-label/re-order/show-hide the dynamically-built fields (the State select
  // options come from the lookup) from the resolved widget config.
  const formFields = useMemo(
    () =>
      applyWidgetFieldConfig(
        buildCityFormFields(stateOptions),
        widgetFieldConfig,
        WIDGET_FIELD_NAME_BY_FORM_FIELD,
      ),
    [stateOptions, widgetFieldConfig],
  );

  // Toggles the `wantdelete` grid param; ticking it re-runs the list so the user
  // can see soft-deleted cities. Lives beside the list search input.
  const [wantDelete, setWantDelete] = useState(false);
  // Adds the `grid_param` payload to the default page/limit/search list query.
  // The server JSON-parses it and binds each key into the matching named token in
  // grid 20's stored SQL; keys with no matching token are ignored. `wantdelete` is
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

  // Fetched lazily the first time the popup is opened, then cached.
  const loadConfigTree = useCallback(async () => {
    if (treeLoadedRef.current) {
      return;
    }
    treeLoadedRef.current = true;
    setTreeLoading(true);
    setTreeError(null);
    try {
      const payload = await getWidgetConfigTree({ menu_id: String(WIDGET_SECTION_MENU_ID) });
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
  // on success it resolves and the modal closes itself.
  const handleVisibilitySubmit = useCallback(async () => {
    const payload = {
      data: configSections.map((section) => ({
        sectionId: section.sectionId,
        sectionGuiName: section.sectionGuiName,
        sectionVisibility: sectionVisibility.get(section.sectionId) ?? section.sectionVisibility !== false,
        fields: (Array.isArray(section.fields) ? section.fields : []).map((field) => {
          const key = (field.fieldName ?? "").trim().toLowerCase();
          const configEntry = widgetFieldConfig.get(key);
          return {
            fieldId: field.fieldId,
            fieldSecondaryText: secondaryTextById.get(field.fieldId) ?? field.fieldSecondaryText,
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
      title="City"
      auditHistory={{ screenName: "City Master" }}
      entityLabel="city"
      entityLabelPlural="cities"
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
        gridDetailId={20}
      lookupKeys={LOOKUP_KEYS}
      requestPayloadKeys={REQUEST_PAYLOAD_KEYS}
      styles={styles}
      listTitle="City List"
      createLabel="Add City"
      codeColumnHeader="City Code"
      nameColumnHeader="City Name"
      nameFieldLabel="City Name"
      nameFieldPlaceholder="Ahmedabad"
      formTitle="City Form"
      formDescription="Create and update cities."
      customFields={formFields}
      createInitialValues={CITY_INITIAL_FORM_VALUES}
      mapFormValues={({ source, defaults }) => {
        const rowSource = source ?? {};
        return {
          ...CITY_INITIAL_FORM_VALUES,
          masterName:
            toDisplayValue(getFirstDefinedValue(rowSource, LOOKUP_KEYS.name)) || defaults.masterName,
          masterAlias:
            toDisplayValue(getFirstDefinedValue(rowSource, LOOKUP_KEYS.alias)) ||
            defaults.masterAlias,
          masterShortName:
            toDisplayValue(getFirstDefinedValue(rowSource, LOOKUP_KEYS.short)) ||
            defaults.masterShortName,
          cityStateId: toDisplayValue(getFirstDefinedValue(rowSource, CITY_STATE_ID_KEYS)),
          position:
            toDisplayValue(getFirstDefinedValue(rowSource, LOOKUP_KEYS.position)) || defaults.position,
          cityIsActive: toSelectBoolean(
            getFirstDefinedValue(rowSource, CITY_IS_ACTIVE_KEYS),
            "true",
          ),
        };
      }}
      buildRequestPayload={({ values, shouldUpdate, editingItemId }) => {
        const cityName = (values.masterName ?? "").trim();
        const cityAlias = (values.masterAlias ?? "").trim();
        const cityShort = (values.masterShortName ?? "").trim();
        const cityStateId = (values.cityStateId ?? "").trim();
        const cityOrder = Math.max(0, toInteger(values.position ?? "0", 0));
        const cityIsActive = (values.cityIsActive ?? "true") !== "false";
        return {
          ctmName: cityName,
          ctmAlias: cityAlias || null,
          ctmShort: cityShort || null,
          ctmStateId: cityStateId,
          ctmOrder: cityOrder,
          ctmIsActive: cityIsActive,
          ...(shouldUpdate && editingItemId !== null
            ? { ctmId: toUpdateCityId(editingItemId) }
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
