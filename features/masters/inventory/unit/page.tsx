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
} from "@/components/design-system/ui/dynamic-modal-form";
import styles from "@/app/master/state-master/page.module.scss";
import { extractRows } from "@/features/masters/shared/normalizers";
import { getFirstDefinedValue, toDisplayValue, toSelectBoolean } from "@/features/masters/shared/value-mappers";
const API_ENDPOINTS = {
 list: "/configured-grid-sql/run?grid_id=4",
  getById: "/units/get",
  create: "/units/create",
  delete: "/units/delete",
} as const;
const GRID_TABLE_NAME = "units";
// The form fields below are re-labelled, re-ordered, and shown/hidden from the
// backend widget-masters config (fixed.form_section / form_field) for this
// screen's menu id. Only those three properties come from the API — validation,
// state shape, and submit logic stay defined locally.
const WIDGET_CONFIG_ENDPOINT = "/widget-masters/get";
const WIDGET_SECTION_MENU_ID = 38;
// Platform filter for widget sections. The server validates it against its
// WidgetPlatform enum (Mobile | Desktop | Web) case-sensitively AND matches the
// stored section_platform exactly — the unit fields live on the "Web" section
// (menu 38 also has a Desktop-only section that this scoping avoids).
const WIDGET_SECTION_PLATFORM = "Web";
// Bridge each hardcoded form field `name` to the backend `fieldName` it is
// configured under on menu 38's "Web" section (matched case-insensitively). The
// `__heading_pack_unit` heading has no configured field, so it keeps its hardcoded
// label and renders after all configured fields.
const WIDGET_FIELD_NAME_BY_FORM_FIELD: Record<string, string> = {
  unitName: "item_unit_name",
  unitAlias: "item_unit_alias",
  unitDecimalCount: "item_decimal_count",
  unitCode: "iten_unit_gst_code",
  unitWeight: "item_unit_weight",
  unitIsPackUnit: "item_pack_unit",
  unitBaseUnitId: "item_base_unit",
  unitConversion: "item_unit_conversion",
  unitLoading: "item_unit_loading_charge",
  unitUnloading: "item_unloading_charge",
  unitAttachCharge: "item_attach_charge",
  unitDescription: "item_unit_Description",
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
const BASE_UNIT_LOOKUP_ENDPOINT = "/master-lookups/name-id/all-masters";
const BASE_UNIT_LOOKUP_QUERY = {
  module: "units",
} as const;
const LOOKUP_KEYS = {
  id: [
    "unit_id",
    "unitId",
    "id",
    "_id",
    "itu_id",
    "itemunitid",
    "item_unit_id",
    "itemUnitId",
    "uom_id",
  ],
  code: [
    "unit_code",
    "unitCode",
    "code",
    "itu_alias",
    "itu_short",
    "unitalias",
    "unitshort",
    "uom_code",
  ],
  name: [
    "unit_name",
    "unitName",
    "name",
    "itu_name",
    "itemunitname",
    "item_unit_name",
    "itemUnitName",
    "uom_name",
  ],
  short: [
    "itu_short",
    "short_name",
    "shortName",
    "short",
    "unitshort",
    "itemunitshort",
    "item_unit_short",
    "uom_short",
  ],
  alias: [
    "itu_alias",
    "alias",
    "unit_alias",
    "unitalias",
    "itemunitalias",
    "item_unit_alias",
  ],
  active: ["itu_active", "active", "is_active", "isActive", "isactive", "status"],
  position: ["position", "itu_sort", "sort"],
  description: ["itu_description", "unit_description", "description", "desc"],
  array: ["data", "items", "results", "rows", "list", "units", "itemUnits"],
} as const;
const REQUEST_PAYLOAD_KEYS = {
  id: "unit_id",
  name: "unit_name",
  alias: "unit_alias",
  short: "unit_short",
  description: "unit_description",
  sort: "unit_sort",
} as const;
const UNIT_CODE_FORM_KEYS = ["unit_code", "unitCode", "code", "uom_code"] as const;
const UNIT_DECIMAL_COUNT_KEYS = [
  "unit_decimal_count",
  "unitDecimalCount",
  "decimal_count",
  "decimalCount",
] as const;
const UNIT_WEIGHT_KEYS = ["unit_weight", "unitWeight", "weight"] as const;
const UNIT_LOADING_KEYS = ["unit_loading", "unitLoading", "loading"] as const;
const UNIT_UNLOADING_KEYS = ["unit_unloading", "unitUnloading", "unloading"] as const;
const UNIT_ATTACH_CHARGE_KEYS = ["unit_attach_charge", "unitAttachCharge", "attach_charge"] as const;
const UNIT_IS_PACK_UNIT_KEYS = [
  "unit_is_pack_unit",
  "unitIsPackUnit",
  "is_pack_unit",
  "isPackUnit",
] as const;
const UNIT_BASE_UNIT_ID_KEYS = [
  "unit_base_unit_id",
  "unitBaseUnitId",
  "base_unit_id",
  "baseUnitId",
] as const;
const UNIT_CONVERSION_KEYS = ["unit_conversion", "unitConversion", "conversion"] as const;
const UNIT_IS_ACTIVE_KEYS = ["unit_is_active", "unitIsActive", "is_active", "isActive", "status"] as const;
const UNIT_INITIAL_FORM_VALUES = {
  unitName: "",
  unitCode: "",
  unitAlias: "",
  unitDescription: "",
  unitDecimalCount: "1",
  unitWeight: "",
  unitLoading: "",
  unitUnloading: "",
  unitAttachCharge: "",
  unitIsPackUnit: "false",
  unitBaseUnitId: "",
  unitConversion: "",
  unitIsActive: "true",
} as const;
const GST_UNIT_LOOKUP_ENDPOINT = "/item-gst-units/get";
const GST_UNIT_LOOKUP_KEYS = {
  code: ["item_gst_unit_code", "itemGstUnitCode", "uqc", "code"],
  name: ["item_gst_unit_name", "itemGstUnitName", "unit", "name"],
} as const;
function buildUnitCodeOptions(payload: unknown): ERPDynamicSelectOption[] {
  const optionMap = new Map<string, string>();
  const rows = extractRows(payload);
  for (const row of rows) {
    if (!row || typeof row !== "object" || Array.isArray(row)) {
      continue;
    }
    const source = row as Record<string, unknown>;
    const code = toDisplayValue(getFirstDefinedValue(source, GST_UNIT_LOOKUP_KEYS.code));
    if (!code) {
      continue;
    }
    const name = toDisplayValue(getFirstDefinedValue(source, GST_UNIT_LOOKUP_KEYS.name));
    if (!optionMap.has(code)) {
      optionMap.set(code, name ? `${code} - ${name}` : code);
    }
  }
  return Array.from(optionMap.entries()).map(([value, label]) => ({ value, label }));
}
function buildUnitFormFields(
  baseUnitOptions: ERPDynamicSelectOption[],
  unitCodeOptions: ERPDynamicSelectOption[],
): ERPDynamicModalField[] {
  return [
    {
      name: "unitName",
      label: "Unit Name",
      required: true,
      colSpan: 1,
      validation: {
        minLength: 2,
        minLengthMessage: "Unit Name must be at least 2 characters.",
      },
    },
    {
      name: "unitCode",
      label: "Gst Unit Code",
      type: "select",
      required: true,
      searchable: true,
      options: unitCodeOptions,
      placeholder: "Search unit code or unit name",
      colSpan: 1,
    },
    { name: "unitAlias", label: "Unit Alias", colSpan: 1 },
    {
      name: "unitWeight",
      label: "Weight",
      type: "number",
      min: 0,
      step: "0.01",
      colSpan: 1,
    },
    {
      name: "unitDecimalCount",
      label: "Decimal Count",
      type: "number",
      min: 1,
      max:3,
      step: 1,
      colSpan: 1,
    },
    {
      name: "__heading_pack_unit",
      label: "Pack Unit Details",
      type: "heading",
     
    },
    {
      name: "unitIsPackUnit",
      label: "Pack Unit",
      type: "checkbox",
      options: [
        { label: "Yes", value: "true" },
        { label: "No", value: "false" },
      ],
      colSpan: 1,
    },
    {
      name: "unitBaseUnitId",
      label: "Base Unit",
      type: "select",
      searchable: true,
      options: baseUnitOptions,
      placeholder: "Search base unit",
      visibleWhen: (values) => (values.unitIsPackUnit ?? "false") === "true",
      colSpan: 1,
    },
    {
      name: "unitConversion",
      label: "Conversion",
      requiredWhen: (values) => (values.unitIsPackUnit ?? "false") === "true",
      colSpan: 1,
      visibleWhen: (values) => (values.unitIsPackUnit ?? "false") === "true",
    },
    {
      name: "unitLoading",
      label: "Loading charge",
      type: "number",
      min: 0,
      step: "0.01",
      colSpan: 1,
    },
    {
      name: "unitUnloading",
      label: "Unloading charge",
      type: "number",
      min: 0,
      step: "0.01",
      colSpan: 1,
    },
    {
      name: "unitAttachCharge",
      label: "Attach Charge",
      type: "number",
      min: 0,
      step: "0.01",
      colSpan: 1,
    },
    {
      name: "unitDescription",
      label: "Unit Description",
      colSpan: 2,
    },
  ];
}
function toInteger(value: string, fallback: number): number {
  const parsed = Number.parseInt(value.trim(), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}
function toOptionalValue(value: string): string | number | null {
  const normalized = value.trim();
  if (!normalized) {
    return null;
  }
  const parsed = Number(normalized);
  if (Number.isFinite(parsed)) {
    return parsed;
  }
  return normalized;
}
function toUpdateUnitId(editingItemId: string | number | null): string | number {
  if (typeof editingItemId === "number" && Number.isFinite(editingItemId)) {
    return editingItemId;
  }
  if (typeof editingItemId === "string") {
    return editingItemId.trim();
  }
  return 0;
}
function buildBaseUnitOptions(payload: unknown): ERPDynamicSelectOption[] {
  const optionMap = new Map<string, string>();
  const rows = extractRows(payload, LOOKUP_KEYS.array);
  for (const row of rows) {
    if (!row || typeof row !== "object" || Array.isArray(row)) {
      continue;
    }
    const source = row as Record<string, unknown>;
    const unitId = toDisplayValue(getFirstDefinedValue(source, LOOKUP_KEYS.id));
    if (!unitId) {
      continue;
    }
    const unitName = toDisplayValue(getFirstDefinedValue(source, LOOKUP_KEYS.name));
    const optionLabel = unitName;
    if (!optionLabel) {
      continue;
    }
    if (!optionMap.has(unitId)) {
      optionMap.set(unitId, optionLabel);
    }
  }
  const baseOption = [{ value: "", label: "None" }];
  const dynamicOptions = Array.from(optionMap.entries())
    .map(([value, label]) => ({ value, label }))
    .sort((left, right) => left.label.localeCompare(right.label));
  return [...baseOption, ...dynamicOptions];
}
export default function UnitMasterPage() {
  const { getAll: getBaseUnitList } = useApi<unknown>(BASE_UNIT_LOOKUP_ENDPOINT);
  const { getAll: getGstUnitList } = useApi<unknown>(GST_UNIT_LOOKUP_ENDPOINT);
  // Silent progressive enhancement: a failed config fetch leaves the form on its
  // hardcoded labels/order (empty map), so don't nag the user with an error toast.
  const { getAll: getWidgetConfig } = useApi<WidgetMastersResponse>(WIDGET_CONFIG_ENDPOINT, {
    toast: { error: false },
  });
  const [baseUnitOptions, setBaseUnitOptions] = useState<ERPDynamicSelectOption[]>([
    { value: "", label: "None" },
  ]);
  const [unitCodeOptions, setUnitCodeOptions] = useState<ERPDynamicSelectOption[]>([]);
  const [widgetFieldConfig, setWidgetFieldConfig] = useState<Map<string, ResolvedFieldConfig>>(
    () => new Map(),
  );
  // Toggles the `wantdelete` grid param; ticking it re-runs the list so the user
  // can see soft-deleted units. Lives beside the list search input.
  const [wantDelete, setWantDelete] = useState(false);
  useEffect(() => {
    let mounted = true;
    void (async () => {
      try {
        const payload = await getBaseUnitList(BASE_UNIT_LOOKUP_QUERY);
        if (mounted) {
          setBaseUnitOptions(buildBaseUnitOptions(payload));
        }
      } catch {
        if (mounted) {
          setBaseUnitOptions([{ value: "", label: "None" }]);
        }
      }
    })();
    return () => {
      mounted = false;
    };
  }, [getBaseUnitList]);
  useEffect(() => {
    let mounted = true;
    void (async () => {
      try {
        const payload = await getGstUnitList();
        if (mounted) {
          setUnitCodeOptions(buildUnitCodeOptions(payload));
        }
      } catch {
        if (mounted) {
          setUnitCodeOptions([]);
        }
      }
    })();
    return () => {
      mounted = false;
    };
  }, [getGstUnitList]);
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
  const unitFormFields = useMemo(
    () =>
      applyWidgetFieldConfig(
        buildUnitFormFields(baseUnitOptions, unitCodeOptions),
        widgetFieldConfig,
        WIDGET_FIELD_NAME_BY_FORM_FIELD,
      ),
    [baseUnitOptions, unitCodeOptions, widgetFieldConfig],
  );
  // Adds the `grid_param` payload to the default page/limit/search list query.
  // The server JSON-parses it and binds each key into the matching named token in
  // grid 4's stored SQL; keys with no matching token are ignored. `wantdelete` is
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
  // "Web" platform so the menu's Desktop-only section stays out of the tree.
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
      title="Unit"
      iconName="item_unit_master_entry"
      auditHistory={{ screenName: "Units Master" }}
      entityLabel="unit"
      entityLabelPlural="units"
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
      listTitle="Unit List"
      listTitleOverride="Unit List"
      createLabel="Add Unit"
      codeColumnHeader="Unit Code"
      nameColumnHeader="Unit Name"
      nameFieldLabel="Unit Name"
      nameFieldPlaceholder="Kilogram"
      formTitle="Unit Form"
      formDescription="Create and update units."
      createModalTitle="Unit Entry"
      editModalTitle="Edit Unit Entry"
      modalPanelStyle={{ width: "min(52rem, calc(calc(100vw/var(--erp-ui-scale)) - 2rem))", maxHeight: "min(calc(82vh/var(--erp-ui-scale)), 42rem)" }}
      customFields={unitFormFields}
      createInitialValues={UNIT_INITIAL_FORM_VALUES}
      mapFormValues={({ source, defaults }) => {
        const rowSource = source ?? {};
        return {
          ...UNIT_INITIAL_FORM_VALUES,
          unitName:
            toDisplayValue(getFirstDefinedValue(rowSource, LOOKUP_KEYS.name)) || defaults.masterName,
          unitCode:
            toDisplayValue(getFirstDefinedValue(rowSource, UNIT_CODE_FORM_KEYS)) ||
            defaults.searchCode,
          unitAlias:
            toDisplayValue(getFirstDefinedValue(rowSource, LOOKUP_KEYS.alias)) ||
            defaults.masterAlias,
          unitDescription:
            toDisplayValue(getFirstDefinedValue(rowSource, LOOKUP_KEYS.description)) ||
            defaults.masterDescription,
          unitDecimalCount:
            toDisplayValue(getFirstDefinedValue(rowSource, UNIT_DECIMAL_COUNT_KEYS)) || "0",
          unitWeight: toDisplayValue(getFirstDefinedValue(rowSource, UNIT_WEIGHT_KEYS)),
          unitLoading: toDisplayValue(getFirstDefinedValue(rowSource, UNIT_LOADING_KEYS)),
          unitUnloading: toDisplayValue(getFirstDefinedValue(rowSource, UNIT_UNLOADING_KEYS)),
          unitAttachCharge: toDisplayValue(
            getFirstDefinedValue(rowSource, UNIT_ATTACH_CHARGE_KEYS),
          ),
          unitIsPackUnit: toSelectBoolean(
            getFirstDefinedValue(rowSource, UNIT_IS_PACK_UNIT_KEYS),
            "false",
          ),
          unitBaseUnitId:
            toDisplayValue(getFirstDefinedValue(rowSource, UNIT_BASE_UNIT_ID_KEYS)) || "",
          unitConversion: toDisplayValue(getFirstDefinedValue(rowSource, UNIT_CONVERSION_KEYS)),
          unitIsActive: toSelectBoolean(
            getFirstDefinedValue(rowSource, UNIT_IS_ACTIVE_KEYS),
            "true",
          ),
        };
      }}
      buildRequestPayload={({ values, shouldUpdate, editingItemId }) => {
        const unitName = (values.unitName ?? "").trim();
        const unitAlias = (values.unitAlias ?? "").trim();
        const unitCode = (values.unitCode ?? "").trim();
        const unitDescription = (values.unitDescription ?? "").trim();
        const unitDecimalCount = toInteger(values.unitDecimalCount ?? "0", 0);
        const unitIsPackUnit = (values.unitIsPackUnit ?? "false") === "true";
        const rawBaseUnitId = (values.unitBaseUnitId ?? "").trim();
        const unitBaseUnitId = unitIsPackUnit && rawBaseUnitId ? rawBaseUnitId : null;
        const unitIsActive = (values.unitIsActive ?? "true") !== "false";
        return {
          unit_id: shouldUpdate ? toUpdateUnitId(editingItemId) : "",
          unit_name: unitName,
          unit_alias: unitAlias || null,
          unit_code: unitCode || null,
          unit_description: unitDescription || null,
          unit_decimal_count: unitDecimalCount,
          unit_weight: toOptionalValue(values.unitWeight ?? ""),
          unit_loading: toOptionalValue(values.unitLoading ?? ""),
          unit_unloading: toOptionalValue(values.unitUnloading ?? ""),
          unit_attach_charge: toOptionalValue(values.unitAttachCharge ?? ""),
          unit_is_pack_unit: unitIsPackUnit,
          unit_base_unit_id: unitBaseUnitId,
          unit_conversion: toOptionalValue(values.unitConversion ?? ""),
          unit_is_active: unitIsActive,
        };
      }}
    />
    <ERPDynamicModalForm
      title="Visible Settings"
      variants={[visibilityVariant]}
      showDefaultCards={false}
      hideSectionHeader
      resetOnSubmit={false}
      panelStyle={{ width: "min(680px, calc(calc(100vw/var(--erp-ui-scale)) - 2rem))", maxHeight: "min(calc(82vh/var(--erp-ui-scale)), 620px)" }}
      onControllerReady={(controller) => {
        visibilityControllerRef.current = controller;
      }}
      onOpenChange={(open) => setVisibilityModalOpen(open)}
      onSubmit={() => handleVisibilitySubmit()}
    />
    </>
  );
}