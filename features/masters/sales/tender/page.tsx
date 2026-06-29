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
  list: "/configured-grid-sql/run?grid_id=44",
  getById: "/tender-masters/get",
  create: "/tender-masters/create",
  delete: "/tender-masters/delete",
} as const;
const GRID_TABLE_NAME = "tender_master";
const GRID_DETAIL_ID = 44;
// The form fields below are re-labelled, re-ordered, and shown/hidden from the
// backend widget-masters config (fixed.form_section / form_field) for this
// screen's menu id. Only those three properties come from the API — validation,
// state shape, and submit logic stay defined locally.
const WIDGET_CONFIG_ENDPOINT = "/widget-masters/get";
const WIDGET_SECTION_MENU_ID = 95;
// Matches the section_platform stored for this menu (case-sensitive equality on
// the server), so the config actually resolves rather than silently no-opping.
const WIDGET_SECTION_PLATFORM = "Web";
// Bridge each hardcoded form field `name` (camelCase aliases used by form state
// and the submit payload) to the backend `fieldName` it is configured under
// (tnd_*/tender_* keys, matched case-insensitively). Form fields with no mapping
// — or no matching response entry — keep their hardcoded label and render after
// all configured fields. (Display Position is not configured for this menu, so
// `position` has no mapping and always renders last.)
const WIDGET_FIELD_NAME_BY_FORM_FIELD: Record<string, string> = {
  masterName: "tender_name",
  tndTypeId: "tender_type",
  tndLedgerId: "tnd_acc_ldger",
  tndMinAmount: "tnd_min_amount",
  tndMaxAmount: "tnd_max_amount",
  tndSurchargePerc: "tnd_Surcharge",
  tndEditSurcharge: "tnd_allow_edit_surcharge",
  tndEditLedger: "tnd_allow_edit_ledger",
  masterDescription: "tnd_remarks",
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
const LOOKUP_ENDPOINT = "/master-lookups/name-id/all-accounts-and-masters";
const LOOKUP_QUERY_TENDER_TYPES = {
  module: "tenderTypes",
  limit: "20",
} as const;
const LOOKUP_QUERY_ACCOUNT_LEDGERS = {
  module: "accountLedgers",
  limit: "20",
} as const;
const LOOKUP_KEYS = {
  id: ["tndId", "tnd_id", "id", "_id"],
  code: ["tndDisplayPosition", "tnd_display_position", "position", "sort"],
  name: ["tndName", "tnd_name", "name"],
  short: ["tndMinAmount", "tnd_min_amount", "minAmount", "min_amount"],
  alias: ["tndName", "tnd_name", "name", "alias"],
  active: ["tndIsActive", "tnd_is_active", "isActive", "is_active", "status"],
  position: ["tndDisplayPosition", "tnd_display_position", "position", "sort"],
  description: ["tndRemarks", "tnd_remarks", "description", "remarks"],
  array: ["data", "items", "results", "rows", "list", "tenders", "tenderMasters"],
} as const;
const REQUEST_PAYLOAD_KEYS = {
  id: "tndId",
  name: "tndName",
  alias: "tndName",
  short: "tndName",
  description: "tndRemarks",
  sort: "tndDisplayPosition",
} as const;
const TENDER_TYPE_ID_KEYS = ["tndTypeId", "tnd_type_id", "typeId", "type_id"] as const;
const TENDER_LEDGER_ID_KEYS = ["tndLedgerId", "tnd_ledger_id", "ledgerId", "ledger_id"] as const;
const TENDER_MIN_AMOUNT_KEYS = ["tndMinAmount", "tnd_min_amount", "minAmount", "min_amount"] as const;
const TENDER_MAX_AMOUNT_KEYS = ["tndMaxAmount", "tnd_max_amount", "maxAmount", "max_amount"] as const;
const TENDER_SURCHARGE_KEYS = ["tndSurchargePerc", "tnd_surcharge_perc", "surchargePerc"] as const;
const TENDER_IS_ACTIVE_KEYS = ["tndIsActive", "tnd_is_active", "isActive", "is_active"] as const;
const TENDER_EDIT_SURCHARGE_KEYS = [
  "tndEditSurcharge",
  "tnd_edit_surcharge",
  "editSurcharge",
] as const;
const TENDER_EDIT_LEDGER_KEYS = ["tndEditLedger", "tnd_edit_ledger", "editLedger"] as const;
const LOOKUP_ARRAY_KEYS = ["items", "data", "results", "rows", "list"] as const;
const DEFAULT_TENDER_TYPE_OPTION: ERPDynamicSelectOption = {
  value: "",
  label: "Select Tender Type",
};
const DEFAULT_LEDGER_OPTION: ERPDynamicSelectOption = {
  value: "",
  label: "Select Account Ledger",
};
const STATUS_OPTIONS: ERPDynamicSelectOption[] = [
  { label: "Active", value: "true" },
  { label: "Inactive", value: "false" },
];
const YES_NO_OPTIONS: ERPDynamicSelectOption[] = [
  { label: "Yes", value: "true" },
  { label: "No", value: "false" },
];
const TENDER_INITIAL_FORM_VALUES = {
  masterName: "",
  tndTypeId: "",
  tndLedgerId: "",
  tndMinAmount: "0",
  tndMaxAmount: "",
  position: "0",
  tndSurchargePerc: "0",
  tndIsActive: "true",
  tndEditSurcharge: "false",
  tndEditLedger: "false",
  masterDescription: "",
} as const;
function buildTenderFormFields(
  tenderTypeOptions: ERPDynamicSelectOption[],
  ledgerOptions: ERPDynamicSelectOption[],
): ERPDynamicModalField[] {
  return [
    {
      name: "masterName",
      label: "Tender Name",
      required: true,
      validation: {
        minLength: 2,
        minLengthMessage: "Tender Name must be at least 2 characters.",
      },
    },
    {
      name: "tndTypeId",
      label: "Tender Type",
      type: "select",
      searchable: true,
      required: true,
      options: tenderTypeOptions,
      validation: {
        requiredMessage: "Tender Type is required.",
      },
    },
    {
      name: "tndLedgerId",
      label: "Account Ledger",
      type: "select",
      searchable: true,
      required: true,
      options: ledgerOptions,
      validation: {
        requiredMessage: "Account Ledger is required.",
      },
    },
    {
      name: "tndMinAmount",
      label: "Min Amount",
      type: "number",
      required: true,
      min: 0,
      step: "0.01",
      validation: {
        requiredMessage: "Min Amount is required.",
        minMessage: "Min Amount must be 0 or greater.",
      },
    },
    {
      name: "tndMaxAmount",
      label: "Max Amount",
      type: "number",
      min: 0,
      step: "0.01",
      validation: {
        minMessage: "Max Amount must be 0 or greater.",
        custom: (value, values) => {
          const trimmedValue = value.trim();
          if (!trimmedValue) {
            return null;
          }
          const maxAmount = Number(trimmedValue);
          if (!Number.isFinite(maxAmount)) {
            return "Max Amount must be a valid number.";
          }
          const minAmount = Number((values.tndMinAmount ?? "").trim());
          if (!Number.isFinite(minAmount)) {
            return null;
          }
          if (maxAmount < minAmount) {
            return "Max Amount must be greater than or equal to Min Amount.";
          }
          return null;
        },
      },
    },
    {
      name: "position",
      label: "Display Position",
      type: "number",
      min: 0,
      step: 1,
      validation: {
        minMessage: "Display Position must be 0 or greater.",
      },
    },
    {
      name: "tndSurchargePerc",
      label: "Surcharge %",
      type: "number",
      min: 0,
      step: "0.001",
      validation: {
        minMessage: "Surcharge % must be 0 or greater.",
      },
    },
    {
      name: "tndIsActive",
      label: "Status",
      type: "checkbox",
      options: STATUS_OPTIONS,
    },
    {
      name: "tndEditSurcharge",
      label: "Allow Edit Surcharge",
      type: "checkbox",
      options: YES_NO_OPTIONS,
    },
    {
      name: "tndEditLedger",
      label: "Allow Edit Ledger",
      type: "checkbox",
      options: YES_NO_OPTIONS,
    },
    {
      name: "masterDescription",
      label: "Remarks",
      type: "textarea",
      colSpan: 2,
    },
  ];
}
function toNonNegativeInteger(value: string, fallback: number): number {
  const parsed = Number.parseInt(value.trim(), 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return fallback;
  }
  return Math.floor(parsed);
}
function toNonNegativeNumber(value: string, fallback: number): number {
  const parsed = Number(value.trim());
  if (!Number.isFinite(parsed) || parsed < 0) {
    return fallback;
  }
  return parsed;
}
function toNullableNumber(value: string): number | null {
  const normalized = value.trim();
  if (!normalized) {
    return null;
  }
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return null;
  }
  return parsed;
}
function toNullableString(value: string): string | null {
  const normalized = value.trim();
  return normalized ? normalized : null;
}
function toUpdateTenderId(editingItemId: string | number | null): string {
  if (typeof editingItemId === "number" && Number.isFinite(editingItemId)) {
    return String(editingItemId);
  }
  if (typeof editingItemId === "string") {
    return editingItemId.trim();
  }
  return "";
}
function buildLookupOptions(
  payload: unknown,
  defaultOption: ERPDynamicSelectOption,
): ERPDynamicSelectOption[] {
  const optionMap = new Map<string, string>();
  const rows = extractRows(payload, LOOKUP_ARRAY_KEYS);
  for (const row of rows) {
    if (!row || typeof row !== "object" || Array.isArray(row)) {
      continue;
    }
    const source = row as Record<string, unknown>;
    const id = toDisplayValue(getFirstDefinedValue(source, ["id", "value"]));
    if (!id) {
      continue;
    }
    const name = toDisplayValue(getFirstDefinedValue(source, ["name", "label"]));
    if (!name) {
      continue;
    }
    if (!optionMap.has(id)) {
      optionMap.set(id, name);
    }
  }
  const options = Array.from(optionMap.entries())
    .map(([value, label]) => ({ value, label }))
    .sort((left, right) => left.label.localeCompare(right.label));
  return [defaultOption, ...options];
}
export default function TenderMasterPage() {
  const { getAll: getTenderTypeLookup } = useApi<unknown>(LOOKUP_ENDPOINT);
  const { getAll: getLedgerLookup } = useApi<unknown>(LOOKUP_ENDPOINT);
  const [tenderTypeOptions, setTenderTypeOptions] = useState<ERPDynamicSelectOption[]>([
    DEFAULT_TENDER_TYPE_OPTION,
  ]);
  const [ledgerOptions, setLedgerOptions] = useState<ERPDynamicSelectOption[]>([
    DEFAULT_LEDGER_OPTION,
  ]);
  useEffect(() => {
    let mounted = true;
    void (async () => {
      try {
        const [tenderTypesPayload, ledgersPayload] = await Promise.all([
          getTenderTypeLookup(LOOKUP_QUERY_TENDER_TYPES),
          getLedgerLookup(LOOKUP_QUERY_ACCOUNT_LEDGERS),
        ]);
        if (!mounted) {
          return;
        }
        setTenderTypeOptions(buildLookupOptions(tenderTypesPayload, DEFAULT_TENDER_TYPE_OPTION));
        setLedgerOptions(buildLookupOptions(ledgersPayload, DEFAULT_LEDGER_OPTION));
      } catch {
        if (!mounted) {
          return;
        }
        setTenderTypeOptions([DEFAULT_TENDER_TYPE_OPTION]);
        setLedgerOptions([DEFAULT_LEDGER_OPTION]);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [getLedgerLookup, getTenderTypeLookup]);

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

  // Re-label/re-order/show-hide the dynamically-built fields (the Tender Type +
  // Account Ledger select options come from lookups) from the resolved config.
  const tenderFormFields = useMemo(
    () =>
      applyWidgetFieldConfig(
        buildTenderFormFields(tenderTypeOptions, ledgerOptions),
        widgetFieldConfig,
        WIDGET_FIELD_NAME_BY_FORM_FIELD,
      ),
    [ledgerOptions, tenderTypeOptions, widgetFieldConfig],
  );
  // Toggles the `wantdelete` grid param; ticking it re-runs the list so the user
  // can see soft-deleted tenders. Lives beside the list search input.
  const [wantDelete, setWantDelete] = useState(false);
  // Adds the `grid_param` payload to the default page/limit/search list query.
  // The server JSON-parses it and binds each key into the matching named token in
  // grid 44's stored SQL; keys with no matching token are ignored. `wantdelete` is
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
      title="Tender"
      auditHistory={{ screenName: "Tender Master" }}
      entityLabel="tender"
      entityLabelPlural="tenders"
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
      listTitle="Tender List"
      createLabel="Add"
      nameFieldLabel="Tender Name"
      nameFieldPlaceholder="Cash"
      formTitle="Tender Form"
      formDescription="Create and update tenders."
      customFields={tenderFormFields}
      createInitialValues={TENDER_INITIAL_FORM_VALUES}
      mapFormValues={({ source, defaults }) => {
        const rowSource = source ?? {};
        const mergedDefaults = { ...TENDER_INITIAL_FORM_VALUES, ...defaults };
        return {
          ...TENDER_INITIAL_FORM_VALUES,
          masterName:
            toDisplayValue(getFirstDefinedValue(rowSource, LOOKUP_KEYS.name)) || mergedDefaults.masterName,
          tndTypeId:
            toDisplayValue(getFirstDefinedValue(rowSource, TENDER_TYPE_ID_KEYS)) ||
            mergedDefaults.tndTypeId,
          tndLedgerId:
            toDisplayValue(getFirstDefinedValue(rowSource, TENDER_LEDGER_ID_KEYS)) ||
            mergedDefaults.tndLedgerId,
          tndMinAmount:
            toDisplayValue(getFirstDefinedValue(rowSource, TENDER_MIN_AMOUNT_KEYS)) ||
            mergedDefaults.tndMinAmount,
          tndMaxAmount: toDisplayValue(getFirstDefinedValue(rowSource, TENDER_MAX_AMOUNT_KEYS)),
          position:
            toDisplayValue(getFirstDefinedValue(rowSource, LOOKUP_KEYS.position)) || mergedDefaults.position,
          tndSurchargePerc:
            toDisplayValue(getFirstDefinedValue(rowSource, TENDER_SURCHARGE_KEYS)) ||
            mergedDefaults.tndSurchargePerc,
          tndIsActive: toSelectBoolean(getFirstDefinedValue(rowSource, TENDER_IS_ACTIVE_KEYS), "true"),
          tndEditSurcharge: toSelectBoolean(
            getFirstDefinedValue(rowSource, TENDER_EDIT_SURCHARGE_KEYS),
            "false",
          ),
          tndEditLedger: toSelectBoolean(
            getFirstDefinedValue(rowSource, TENDER_EDIT_LEDGER_KEYS),
            "false",
          ),
          masterDescription:
            toDisplayValue(getFirstDefinedValue(rowSource, LOOKUP_KEYS.description)) ||
            mergedDefaults.masterDescription,
        };
      }}
      buildRequestPayload={({ values, shouldUpdate, editingItemId }) => {
        const payload: Record<string, unknown> = {
          tndTypeId: (values.tndTypeId ?? "").trim(),
          tndName: (values.masterName ?? "").trim(),
          tndLedgerId: (values.tndLedgerId ?? "").trim(),
          tndMinAmount: toNonNegativeNumber(values.tndMinAmount ?? "0", 0),
          tndMaxAmount: toNullableNumber(values.tndMaxAmount ?? ""),
          tndDisplayPosition: toNonNegativeInteger(values.position ?? "0", 0),
          tndSurchargePerc: toNonNegativeNumber(values.tndSurchargePerc ?? "0", 0),
          tndIsActive: (values.tndIsActive ?? "true") === "true",
          tndRemarks: toNullableString(values.masterDescription ?? ""),
          tndEditSurcharge: (values.tndEditSurcharge ?? "false") === "true",
          tndEditLedger: (values.tndEditLedger ?? "false") === "true",
        };
        if (shouldUpdate && editingItemId !== null) {
          payload.tndId = toUpdateTenderId(editingItemId);
        }
        return payload;
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