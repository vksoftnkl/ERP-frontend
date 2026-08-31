"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import CrudMasterPage from "@/components/master/crud-master-page";
import {
  ERPDynamicModalForm,
  type ERPDynamicModalController,
  type ERPDynamicModalField,
  type ERPDynamicModalVariant,
} from "@/components/design-system/ui/dynamic-modal-form";
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
import styles from "@/app/master/state-master/page.module.scss";
import {
  getFirstDefinedValue,
  toDisplayValue,
  toNonNegativeInteger,
  toNonNegativeNumber,
  toNullableString,
  toSelectBoolean,
  toUpdateId,
} from "@/features/masters/shared/value-mappers";
const API_ENDPOINTS = {
  list: "/configured-grid-sql/run?grid_id=19",
  getById: "/customer-groups/get",
  create: "/customer-groups/create",
  delete: "/customer-groups/delete",
} as const;
const GRID_TABLE_NAME = "cust_groups";
// The form fields below are re-labelled, re-ordered, and shown/hidden from the
// backend widget-masters config (fixed.form_section / form_field) for this
// screen's menu id. Only those three properties come from the API — validation,
// state shape, and submit logic stay defined locally.
const WIDGET_CONFIG_ENDPOINT = "/widget-masters/get";
const WIDGET_SECTION_MENU_ID = 21;
// Matches the section_platform stored for this menu (case-sensitive equality on
// the server), so the config actually resolves rather than silently no-opping.
const WIDGET_SECTION_PLATFORM = "Web";
// Bridge each hardcoded form field `name` (camelCase aliases used by form state
// and the submit payload) to the backend `fieldName` it is configured under
// (cus_* column-style keys, matched case-insensitively). Form fields with no
// mapping — or no matching response entry — keep their hardcoded label and
// render after all configured fields. (The Alias field is not configured for
// this menu, so it has no mapping and always renders last.)
const WIDGET_FIELD_NAME_BY_FORM_FIELD: Record<string, string> = {
  cgrName: "cus_group_name",
  cgrShort: "cus_short_name",
  cgrOrder: "cus_sort_order",
  cgrDiscPerc: "cus_dis",
  cgrCollectionDays: "cus_collection_days",
  cgrDebitDays: "cus_debit_days",
  cgrDebitLimit: "cus_debit_limit",
  cgrBillsLimit: "cus_bills_limit",
  cgrDebitAllowed: "cus_debit_allowed",
  cgrOverdueBilling: "cus_overdue_billing",
  cgrIsActive: "cus_is_active",
  cgrNarration: "cus_narration",
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
const LOOKUP_KEYS = {
  id: ["cgrId", "cgr_id", "id", "_id"],
  code: ["cgrAlias", "cgr_alias", "cgrShort", "cgr_short", "code"],
  name: ["cgrName", "cgr_name", "name"],
  short: ["cgrShort", "cgr_short", "short", "shortName"],
  alias: ["cgrAlias", "cgr_alias", "alias"],
  active: ["cgrIsActive", "cgr_is_active", "isActive", "is_active", "status"],
  position: ["cgrOrder", "cgr_order", "position", "sort"],
  description: ["cgrNarration", "cgr_narration", "description", "desc"],
  array: ["data", "items", "results", "rows", "list", "customerGroups", "customer_groups"],
} as const;
const REQUEST_PAYLOAD_KEYS = {
  id: "cgrId",
  name: "cgrName",
  alias: "cgrAlias",
  short: "cgrShort",
  description: "cgrNarration",
  sort: "cgrOrder",
} as const;
const GROUP_ALIAS_KEYS = ["cgrAlias", "cgr_alias", "alias"] as const;
const GROUP_SHORT_KEYS = ["cgrShort", "cgr_short", "short", "shortName"] as const;
const GROUP_NARRATION_KEYS = ["cgrNarration", "cgr_narration", "narration", "description", "desc"] as const;
const GROUP_ORDER_KEYS = ["cgrOrder", "cgr_order", "order", "position", "sort"] as const;
const GROUP_DISC_PERC_KEYS = ["cgrDiscPerc", "cgr_disc_perc", "discPerc", "discount"] as const;
const GROUP_COLLECTION_DAYS_KEYS = ["cgrCollectionDays", "cgr_collection_days", "collectionDays"] as const;
const GROUP_DEBIT_ALLOWED_KEYS = ["cgrDebitAllowed", "cgr_debit_allowed", "debitAllowed"] as const;
const GROUP_DEBIT_DAYS_KEYS = ["cgrDebitDays", "cgr_debit_days", "debitDays"] as const;
const GROUP_DEBIT_LIMIT_KEYS = ["cgrDebitLimit", "cgr_debit_limit", "debitLimit"] as const;
const GROUP_BILLS_LIMIT_KEYS = ["cgrBillsLimit", "cgr_bills_limit", "billsLimit"] as const;
const GROUP_OVERDUE_BILLING_KEYS = ["cgrOverdueBilling", "cgr_overdue_billing", "overdueBilling"] as const;
const GROUP_IS_ACTIVE_KEYS = ["cgrIsActive", "cgr_is_active", "isActive", "is_active", "status"] as const;
const INITIAL_FORM_VALUES = {
  cgrName: "",
  cgrAlias: "",
  cgrShort: "",
  cgrNarration: "",
  cgrOrder: "0",
  cgrDiscPerc: "0",
  cgrCollectionDays: "",
  cgrDebitAllowed: "false",
  cgrDebitDays: "0",
  cgrDebitLimit: "0",
  cgrBillsLimit: "0",
  cgrOverdueBilling: "false",
  cgrIsActive: "true",
} as const;
const CUSTOMER_GROUP_FORM_FIELDS: ERPDynamicModalField[] = [
  {
    name: "cgrName",
    label: "Group Name",
    required: true,
    colSpan: 2,
    validation: {
      minLength: 2,
      maxLength: 200,
      minLengthMessage: "Group Name must be at least 2 characters.",
      maxLengthMessage: "Group Name must be at most 200 characters.",
    },
  },
  // {
  //   name: "cgrAlias",
  //   label: "Alias",
  //   colSpan: 2,
  // },
  {
    name: "cgrShort",
    label: "Short Name",
    colSpan: 2,
  },
  {
    name: "cgrOrder",
    label: "Sort Order",
    type: "number",
  
    min: 0,
    step: 1,
    validation: {
      minMessage: "Sort Order must be 0 or greater.",
    },
  },
  {
    name: "cgrDiscPerc",
    label: "Discount %",
    type: "number",
    
    min: 0,
    step: 0.001,
    validation: {
      minMessage: "Discount % must be 0 or greater.",
    },
  },
  {
    name: "cgrCollectionDays",
    label: "Collection Days",
    colSpan: 2,
    placeholder: "1,7,15",
    helperText: "Comma-separated day numbers.",
  },
  {
    name: "cgrDebitDays",
    label: "Debit Days",
    type: "number",
    min: 0,
    step: 1,
    validation: {
      minMessage: "Debit Days must be 0 or greater.",
    },
  },
  {
    name: "cgrDebitLimit",
    label: "Debit Limit",
    type: "number",
    min: 0,
    step: 0.01,
    validation: {
      minMessage: "Debit Limit must be 0 or greater.",
    },
  },
  {
    name: "cgrBillsLimit",
    label: "Bills Limit",
    type: "number",
    min: 0,
    step: 1,
    validation: {
      minMessage: "Bills Limit must be 0 or greater.",
    },
  },
  {
    name: "cgrDebitAllowed",
    label: "Debit Allowed",
    type: "checkbox",
    colSpan:1,
    options: [
      { label: "Yes", value: "true" },
      { label: "No", value: "false" },
    ],
  },
  {
    name: "cgrOverdueBilling",
    label: "Overdue Billing",
    type: "checkbox",
      colSpan:1,
    options: [
      { label: "Yes", value: "true" },
      { label: "No", value: "false" },
    ],
  },
  {
    name: "cgrIsActive",
    label: "Status",
    type: "checkbox",
      colSpan:1,
    options: [
      { label: "Active", value: "true" },
      { label: "Inactive", value: "false" },
    ],
  },
  {
    name: "cgrNarration",
    label: "Narration",
    colSpan: 2,
  },
];
function toCollectionDaysInput(value: unknown): string {
  if (!Array.isArray(value)) {
    return "";
  }
  return value
    .filter((entry) => typeof entry === "number" && Number.isFinite(entry))
    .map((entry) => String(entry))
    .join(",");
}
function parseCollectionDays(value: string): number[] {
  const normalized = value.trim();
  if (!normalized) {
    return [];
  }
  const parsed = normalized
    .split(",")
    .map((token) => token.trim())
    .filter(Boolean)
    .map((token) => Number.parseInt(token, 10))
    .filter((token) => Number.isFinite(token) && token >= 0);
  return Array.from(new Set(parsed));
}
export default function CustomerGroupsPage() {
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

  const formFields = useMemo(
    () =>
      applyWidgetFieldConfig(
        CUSTOMER_GROUP_FORM_FIELDS,
        widgetFieldConfig,
        WIDGET_FIELD_NAME_BY_FORM_FIELD,
      ),
    [widgetFieldConfig],
  );

  // Toggles the `wantdelete` grid param; ticking it re-runs the list so the user
  // can see soft-deleted customer groups. Lives beside the list search input.
  const [wantDelete, setWantDelete] = useState(false);
  // Adds the `grid_param` payload to the default page/limit/search list query.
  // The server JSON-parses it and binds each key into the matching named token in
  // grid 19's stored SQL; keys with no matching token are ignored. `wantdelete` is
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
      title="Customer Group"
      iconName="customer_classification"
      auditHistory={{ screenName: "Customer Group Master" }}
      entityLabel="customer group"
      entityLabelPlural="customer groups"
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
        gridDetailId={19}
      lookupKeys={LOOKUP_KEYS}
      requestPayloadKeys={REQUEST_PAYLOAD_KEYS}
      styles={styles}
      listTitle="Customer Group List"
      createLabel="Add Customer Group"
      codeColumnHeader="Alias"
      nameColumnHeader="Group Name"
      nameFieldLabel="Group Name"
      listSubtitleOverride="Manage customer groups"
      nameFieldPlaceholder="Retail"
      createModalTitle="Customer Group Entry"
      editModalTitle="Edit Customer Group Entry"
      formTitle="Customer Group Form"
      formDescription="Create and update customer groups."
        modalPanelStyle={{ width: "min(40rem, calc(calc(100vw/var(--erp-ui-scale)) - 2.4rem))" }}
      customFields={formFields}
      createInitialValues={INITIAL_FORM_VALUES}
      mapFormValues={({ source, defaults }) => {
        const rowSource = source ?? {};
        const mergedDefaults = { ...INITIAL_FORM_VALUES, ...defaults };
        return {
          ...INITIAL_FORM_VALUES,
          cgrName:
            toDisplayValue(getFirstDefinedValue(rowSource, LOOKUP_KEYS.name)) || mergedDefaults.cgrName,
          cgrAlias:
            toDisplayValue(getFirstDefinedValue(rowSource, GROUP_ALIAS_KEYS)) || mergedDefaults.cgrAlias,
          cgrShort:
            toDisplayValue(getFirstDefinedValue(rowSource, GROUP_SHORT_KEYS)) || mergedDefaults.cgrShort,
          cgrNarration:
            toDisplayValue(getFirstDefinedValue(rowSource, GROUP_NARRATION_KEYS)) ||
            mergedDefaults.cgrNarration,
          cgrOrder:
            toDisplayValue(getFirstDefinedValue(rowSource, GROUP_ORDER_KEYS)) || mergedDefaults.cgrOrder,
          cgrDiscPerc:
            toDisplayValue(getFirstDefinedValue(rowSource, GROUP_DISC_PERC_KEYS)) ||
            mergedDefaults.cgrDiscPerc,
          cgrCollectionDays: toCollectionDaysInput(
            getFirstDefinedValue(rowSource, GROUP_COLLECTION_DAYS_KEYS),
          ),
          cgrDebitAllowed: toSelectBoolean(
            getFirstDefinedValue(rowSource, GROUP_DEBIT_ALLOWED_KEYS),
            "false",
          ),
          cgrDebitDays:
            toDisplayValue(getFirstDefinedValue(rowSource, GROUP_DEBIT_DAYS_KEYS)) ||
            mergedDefaults.cgrDebitDays,
          cgrDebitLimit:
            toDisplayValue(getFirstDefinedValue(rowSource, GROUP_DEBIT_LIMIT_KEYS)) ||
            mergedDefaults.cgrDebitLimit,
          cgrBillsLimit:
            toDisplayValue(getFirstDefinedValue(rowSource, GROUP_BILLS_LIMIT_KEYS)) ||
            mergedDefaults.cgrBillsLimit,
          cgrOverdueBilling: toSelectBoolean(
            getFirstDefinedValue(rowSource, GROUP_OVERDUE_BILLING_KEYS),
            "false",
          ),
          cgrIsActive: toSelectBoolean(
            getFirstDefinedValue(rowSource, GROUP_IS_ACTIVE_KEYS),
            "true",
          ),
        };
      }}
      buildRequestPayload={({ values, shouldUpdate, editingItemId }) => {
        const payload: Record<string, unknown> = {
          cgrName: (values.cgrName ?? "").trim(),
          cgrAlias: toNullableString(values.cgrAlias ?? ""),
          cgrShort: toNullableString(values.cgrShort ?? ""),
          cgrNarration: toNullableString(values.cgrNarration ?? ""),
          cgrOrder: toNonNegativeNumber(values.cgrOrder ?? "0", 0),
          cgrDiscPerc: toNonNegativeNumber(values.cgrDiscPerc ?? "0", 0),
          cgrCollectionDays: parseCollectionDays(values.cgrCollectionDays ?? ""),
          cgrDebitAllowed: (values.cgrDebitAllowed ?? "false") === "true",
          cgrDebitDays: toNonNegativeInteger(values.cgrDebitDays ?? "0", 0),
          cgrDebitLimit: toNonNegativeNumber(values.cgrDebitLimit ?? "0", 0),
          cgrBillsLimit: toNonNegativeInteger(values.cgrBillsLimit ?? "0", 0),
          cgrOverdueBilling: (values.cgrOverdueBilling ?? "false") === "true",
          cgrIsActive: (values.cgrIsActive ?? "true") === "true",
        };
        if (shouldUpdate && editingItemId !== null) {
          payload.cgrId = toUpdateId(editingItemId);
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
