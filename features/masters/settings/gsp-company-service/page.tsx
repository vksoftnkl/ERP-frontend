"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import CrudMasterPage from "@/components/master/crud-master-page";
import { useApi } from "@/hooks/useApi";
import {
  useLazyConfiguredDropdown,
  type LazyDropdownHandlers,
} from "@/features/masters/shared/use-lazy-configured-dropdown";
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
import {
  ERPDynamicModalForm,
  type ERPDynamicModalController,
  type ERPDynamicModalField,
  type ERPDynamicModalVariant,
  type ERPDynamicSelectOption,
} from "@/components/design-system/ui/dynamic-modal-form";
import styles from "@/app/master/state-master/page.module.scss";
import {
  buildLookupOptions,
  getFirstDefinedValue,
  toDateInputValue,
  toDisplayValue,
  toNullableDate,
  toNullableString,
  toSelectBoolean,
  toUpdateId,
  toUpper,
  DEFAULT_LOOKUP_ARRAY_KEYS,
} from "@/app/master/_shared/crud-utils";
import { useDataRefresh } from "@/lib/data-freshness";
const API_ENDPOINTS = {
  list: "/configured-grid-sql/run?grid_id=27",
  getById: "/gsp-company-services/get",
  create: "/gsp-company-services/create",
  delete: "/gsp-company-services/delete",
} as const;
const GRID_TABLE_NAME = "gsp_company_service";
// The form fields below are re-labelled, re-ordered, and shown/hidden from the
// backend widget-masters config (fixed.form_section / form_field) for this
// screen's menu id. Only those three properties come from the API — validation,
// state shape, and submit logic stay defined locally.
const WIDGET_CONFIG_ENDPOINT = "/widget-masters/get";
const WIDGET_SECTION_MENU_ID = 241;
// Platform filter for widget sections. The server validates it against its
// WidgetPlatform enum (Mobile | Desktop | Web) case-sensitively AND matches the
// stored section_platform exactly — the GSP fields live on the "Web" section.
const WIDGET_SECTION_PLATFORM = "Web";
// Bridge each hardcoded form field `name` to the backend `fieldName` it is
// configured under on menu 241's "Web" section (matched case-insensitively). The
// `csgIsActive` field has no configured entry, so it keeps its hardcoded label and
// renders after all configured fields.
const WIDGET_FIELD_NAME_BY_FORM_FIELD: Record<string, string> = {
  csgCompanyId: "gsp_company",
  csgGspProviderId: "gsp_provide",
  csgServiceType: "gsp_service_type",
  csgEuserName: "gsp_service_euser_name",
  csgEuserPassword: "gsp_user_password",
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
const LOOKUP_ENDPOINT = "/master-lookups/name-id/all-masters";
// Company is a lazy, server-side searchable configured dropdown (fixed.dropdown_details
// 8=company comp_id/comp_name). Loaded on open + on debounced server-side search via
// /dropdown-details/run; nothing up front and dropdown_param is never sent.
const COMPANY_DROPDOWN_CONFIG = {
  dropdownId: "8",
  idKeys: ["comp_id", "compId"] as const,
  labelKeys: ["comp_name", "compName"] as const,
  defaultOption: { value: "", label: "Select Company" } as ERPDynamicSelectOption,
} as const;
const LOOKUP_QUERY_PROVIDERS = {
  module: "gspProviders",
} as const;
const LOOKUP_KEYS = {
  id: ["csgCompanyServiceId", "csg_company_service_id", "id", "_id"],
  code: [
    "companyDisplay",
    "company_display",
    "companyName",
    "company_name",
    "compName",
    "comp_name",
    "csgCompanyId",
    "csg_company_id",
    "code",
  ],
  name: ["csgServiceType", "csg_service_type", "name"],
  short: ["csgEuserName", "csg_euser_name", "short", "shortName"],
  alias: [
    "providerDisplay",
    "provider_display",
    "providerName",
    "provider_name",
    "gspProviderName",
    "gsp_provider_name",
    "csgGspProviderId",
    "csg_gsp_provider_id",
    "alias",
  ],
  active: ["csgIsActive", "csg_is_active", "isActive", "is_active", "status"],
  position: ["position", "sort"],
  description: ["csgAuthToken", "csg_auth_token", "description", "remarks"],
  array: ["data", "items", "results", "rows", "list", "gspCompanyServices"],
} as const;
const REQUEST_PAYLOAD_KEYS = {
  id: "csgCompanyServiceId",
  name: "csgServiceType",
  alias: "csgCompanyId",
  short: "csgEuserName",
  description: "csgAuthToken",
  sort: "position",
} as const;
const CSG_COMPANY_ID_KEYS = ["csgCompanyId", "csg_company_id", "companyId", "company_id"] as const;
const CSG_COMPANY_NAME_KEYS = ["companyName", "company_name", "compName", "comp_name"] as const;
const CSG_PROVIDER_ID_KEYS = ["csgGspProviderId", "csg_gsp_provider_id", "providerId", "provider_id"] as const;
const CSG_SERVICE_TYPE_KEYS = ["csgServiceType", "csg_service_type", "serviceType", "service_type"] as const;
const CSG_EUSER_NAME_KEYS = ["csgEuserName", "csg_euser_name", "euserName"] as const;
const CSG_EUSER_PASSWORD_KEYS = ["csgEuserPassword", "csg_euser_password", "euserPassword"] as const;
const CSG_AUTH_TOKEN_KEYS = ["csgAuthToken", "csg_auth_token", "authToken"] as const;
const CSG_AUTH_TOKEN_VALID_TILL_KEYS = [
  "csgAuthTokenValidTill",
  "csg_auth_token_valid_till",
  "authTokenValidTill",
] as const;
const CSG_IS_ACTIVE_KEYS = ["csgIsActive", "csg_is_active", "isActive", "is_active", "status"] as const;
const DEFAULT_PROVIDER_OPTION: ERPDynamicSelectOption = {
  value: "",
  label: "Select GSP Provider",
};
const DEFAULT_SERVICE_TYPE_OPTION: ERPDynamicSelectOption = {
  value: "",
  label: "Select Service Type",
};
const SERVICE_TYPE_OPTIONS: ERPDynamicSelectOption[] = [
  DEFAULT_SERVICE_TYPE_OPTION,
  { value: "EINV", label: "EINV" },
  { value: "EWAY", label: "EWAY" },
  { value: "BOTH", label: "Both" },
];
const INITIAL_FORM_VALUES = {
  csgCompanyId: "",
  csgGspProviderId: "",
  csgServiceType: "",
  csgEuserName: "",
  csgEuserPassword: "",
  csgAuthToken: "",
  csgAuthTokenValidTill: "",
  csgIsActive: "true",
} as const;
function buildGspCompanyServiceFormFields(
  companyOptions: ERPDynamicSelectOption[],
  providerOptions: ERPDynamicSelectOption[],
  companyHandlers: LazyDropdownHandlers,
): ERPDynamicModalField[] {
  return [
    {
      name: "csgCompanyId",
      label: "Company",
      type: "select",
      colSpan:2,
      searchable: true,
      serverSearch: true,
      required: true,
      options: companyOptions,
      onSearchOpenChange: companyHandlers.onSearchOpenChange,
      onSearchQueryChange: companyHandlers.onSearchQueryChange,
      onValueChange: companyHandlers.onValueChange,
      validation: {
        requiredMessage: "Company is required.",
      },
    },
    {
      name: "csgGspProviderId",
      label: "GSP Provider",
      type: "select",
      searchable: true,
      colSpan:2,
      required: true,
      options: providerOptions,
      validation: {
        requiredMessage: "GSP Provider is required.",
      },
    },
    {
      name: "csgServiceType",
      label: "Service Type",
      type: "select",
      required: true,
      colSpan:2,
      options: SERVICE_TYPE_OPTIONS,
      searchable:false,
      validation: {
        requiredMessage: "Service Type is required.",
      },
    },
    {
      name: "csgEuserName",
      label: "E-User Name",
      required: true,
      colSpan:2,
      validation: {
        requiredMessage: "E-User Name is required.",
      },
    },
    {
      name: "csgEuserPassword",
      label: "E-User Password",
      type: "password",
      colSpan:2,
      required: true,
      validation: {
        requiredMessage: "E-User Password is required.",
      },
    },
    {
      name: "csgIsActive",
      label: "Status",
      type: "checkbox",
      options: [
        { label: "Active", value: "true" },
        { label: "Inactive", value: "false" },
      ],
    },
  ];
}
function normalizeServiceType(value: unknown): string {
  const normalizedValue = toDisplayValue(value).trim().toUpperCase();

  if (normalizedValue === "EINV" || normalizedValue === "EWAY" || normalizedValue === "BOTH") {
    return normalizedValue;
  }
  return "";
}
export default function GspCompanyServiceMasterPage() {
  // Company: lazy server-side configured dropdown 8. Provider stays eager (no configured
  // dropdown for GSP providers).
  const company = useLazyConfiguredDropdown(COMPANY_DROPDOWN_CONFIG);
  const { getAll: getProviderLookup } = useApi<unknown>(LOOKUP_ENDPOINT);
  // Silent progressive enhancement: a failed config fetch leaves the form on its
  // hardcoded labels/order (empty map), so don't nag the user with an error toast.
  const { getAll: getWidgetConfig } = useApi<WidgetMastersResponse>(WIDGET_CONFIG_ENDPOINT, {
    toast: { error: false },
  });
  const [providerOptions, setProviderOptions] = useState<ERPDynamicSelectOption[]>([
    DEFAULT_PROVIDER_OPTION,
  ]);
  const [widgetFieldConfig, setWidgetFieldConfig] = useState<Map<string, ResolvedFieldConfig>>(
    () => new Map(),
  );
  // Lookup options come from master tables that other users and other screens
  // change, so they are re-read on every data-refresh signal, not just on mount.
  const loadProviderOptions = useCallback(() => {
    let mounted = true;
    void (async () => {
      try {
        const providersPayload = await getProviderLookup(LOOKUP_QUERY_PROVIDERS);
        if (!mounted) {
          return;
        }
        setProviderOptions(
          buildLookupOptions(providersPayload, DEFAULT_PROVIDER_OPTION, {
            arrayKeys: DEFAULT_LOOKUP_ARRAY_KEYS,
            idKeys: ["id", "value"],
            labelKeys: ["name", "label"],
          }),
        );
      } catch {
        if (!mounted) {
          return;
        }
        setProviderOptions([DEFAULT_PROVIDER_OPTION]);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [getProviderLookup]);
  useEffect(() => loadProviderOptions(), [loadProviderOptions]);
  useDataRefresh(() => {
    loadProviderOptions();
  });
  // Field config comes from the database, so it is read on mount and again on
  // every data-refresh signal instead of only once per page load.
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
  const formFields = useMemo(
    () =>
      applyWidgetFieldConfig(
        buildGspCompanyServiceFormFields(company.options, providerOptions, company.handlers),
        widgetFieldConfig,
        WIDGET_FIELD_NAME_BY_FORM_FIELD,
      ),
    [company.options, providerOptions, company.handlers, widgetFieldConfig],
  );
  // Toggles the `wantdelete` grid param; ticking it re-runs the list so the user
  // can see soft-deleted GSP company services. Lives beside the list search input.
  const [wantDelete, setWantDelete] = useState(false);
  // Adds the `grid_param` payload to the default page/limit/search list query.
  // The server JSON-parses it and binds each key into the matching named token in
  // grid 27's stored SQL; keys with no matching token are ignored. `wantdelete` is
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
  // "Web" platform to match the configured GSP section.
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
      title="GSP Company Service"
      auditHistory={{ screenName: "GSP Company Service" }}
      entityLabel="gsp company service"
      entityLabelPlural="gsp company services"
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
        gridDetailId={27}
      responseTableColumnExcludeKeys={["csg_company_service_id", "csgCompanyServiceId"]}
      lookupKeys={LOOKUP_KEYS}
      requestPayloadKeys={REQUEST_PAYLOAD_KEYS}
      styles={styles}
      listTitle="GSP Company Service List"
      createLabel="Add GSP Company Service"
      codeColumnHeader="Company"
      nameColumnHeader="Service Type"
      tableColumnHeaders={{ masterShort: "E-User Name" }}
      nameFieldLabel="Service Type"
      nameFieldPlaceholder="Select Service Type"
      formTitle="GSP Company Service Form"
      formDescription="Create and update GSP company service mappings."
      createModalTitle="GSP Company Service Entry"
      editModalTitle="Edit GSP Company Service Entry"
      customFields={formFields}
      createInitialValues={INITIAL_FORM_VALUES}
      onModalOpenChange={(open, variantKey) => {
        // Clear the lazy Company dropdown when the create modal opens so no stale
        // selection from a previously edited row lingers (it reloads on open).
        if (open && variantKey === "master-create") {
          company.seedSelected("", "");
        }
      }}
      mapFormValues={({ source, defaults }) => {
        const rowSource = source ?? {};
        const mergedDefaults = { ...INITIAL_FORM_VALUES, ...defaults };
        const csgCompanyId =
          toDisplayValue(getFirstDefinedValue(rowSource, CSG_COMPANY_ID_KEYS)) ||
          mergedDefaults.csgCompanyId;
        // Seed the lazy Company dropdown so the trigger shows the company name on
        // edit/view before the field is opened (getById returns companyName).
        company.seedSelected(
          csgCompanyId,
          toDisplayValue(getFirstDefinedValue(rowSource, CSG_COMPANY_NAME_KEYS)),
        );
        return {
          ...INITIAL_FORM_VALUES,
          csgCompanyId,
          csgGspProviderId:
            toDisplayValue(getFirstDefinedValue(rowSource, CSG_PROVIDER_ID_KEYS)) ||
            mergedDefaults.csgGspProviderId,
          csgServiceType:
            normalizeServiceType(getFirstDefinedValue(rowSource, CSG_SERVICE_TYPE_KEYS)) ||
            mergedDefaults.csgServiceType,
          csgEuserName:
            toDisplayValue(getFirstDefinedValue(rowSource, CSG_EUSER_NAME_KEYS)) ||
            mergedDefaults.csgEuserName,
          csgEuserPassword:
            toDisplayValue(getFirstDefinedValue(rowSource, CSG_EUSER_PASSWORD_KEYS)) ||
            mergedDefaults.csgEuserPassword,
          csgAuthToken:
            toDisplayValue(getFirstDefinedValue(rowSource, CSG_AUTH_TOKEN_KEYS)) ||
            mergedDefaults.csgAuthToken,
          csgAuthTokenValidTill:
            toDateInputValue(getFirstDefinedValue(rowSource, CSG_AUTH_TOKEN_VALID_TILL_KEYS)) ||
            mergedDefaults.csgAuthTokenValidTill,
          csgIsActive: toSelectBoolean(getFirstDefinedValue(rowSource, CSG_IS_ACTIVE_KEYS), "true"),        
        };
      }}
      buildRequestPayload={({ values, shouldUpdate, editingItemId }) => {
        const payload: Record<string, unknown> = {
          csgCompanyId: (values.csgCompanyId ?? "").trim(),
          csgGspProviderId: (values.csgGspProviderId ?? "").trim(),
          csgServiceType: toUpper(values.csgServiceType ?? ""),
          csgEuserName: (values.csgEuserName ?? "").trim(),
          csgEuserPassword: (values.csgEuserPassword ?? "").trim(),
          csgAuthToken: toNullableString(values.csgAuthToken ?? ""),
          csgAuthTokenValidTill: toNullableDate(values.csgAuthTokenValidTill ?? ""),
          csgIsActive: (values.csgIsActive ?? "true") === "true",
        };
        if (shouldUpdate && editingItemId !== null) {
          payload.csgCompanyServiceId = toUpdateId(editingItemId);
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