"use client";

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
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
} from "@/components/design-system/ui/dynamic-modal-form";
import styles from "@/app/master/state-master/page.module.scss";
import { buildLookupOptions } from "@/features/masters/shared/normalizers";
import {
  getFirstDefinedValue,
  toDisplayValue,
  toSelectBoolean,
  toUpdateId,
} from "@/app/master/_shared/crud-utils";

// The GSP company service master writes to the dedicated /gsp-company-services
// backend; the list comes from configured grid 27. (The previous version of this
// page was a tender-type-master placeholder that did not match menu 241's config.)
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
// `isActive` field has no configured entry, so it keeps its hardcoded label and
// renders after all configured fields.
const WIDGET_FIELD_NAME_BY_FORM_FIELD: Record<string, string> = {
  company: "gsp_company",
  gspProvider: "gsp_provide",
  serviceType: "gsp_service_type",
  euserName: "gsp_service_euser_name",
  euserPassword: "gsp_user_password",
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
const COMPANY_LOOKUP_QUERY = { module: "companies", limit: "50" } as const;
const PROVIDER_LOOKUP_QUERY = { module: "gspProviders", limit: "50" } as const;

const COMPANY_OPTION_CONFIG = {
  arrayKeys: ["companies", "data", "items", "results", "rows", "list"],
  idKeys: ["id", "value", "compId", "comp_id"],
  labelKeys: ["name", "label", "compName", "comp_name"],
} as const;
const PROVIDER_OPTION_CONFIG = {
  arrayKeys: ["gspProviders", "data", "items", "results", "rows", "list"],
  idKeys: ["id", "value", "gspProviderId", "gsp_provider_id"],
  labelKeys: ["name", "label", "gspProviderName", "gsp_provider_name"],
} as const;

const DEFAULT_COMPANY_OPTION: ERPDynamicSelectOption = { value: "", label: "Select Company" };
const DEFAULT_PROVIDER_OPTION: ERPDynamicSelectOption = { value: "", label: "Select Provider" };

const LOOKUP_KEYS = {
  id: ["csgCompanyServiceId", "csg_company_service_id", "id", "_id"],
  code: ["csgServiceType", "csg_service_type", "code"],
  name: ["csgServiceType", "csg_service_type", "name"],
  short: ["csgServiceType", "csg_service_type", "short", "shortName"],
  alias: ["csgServiceType", "csg_service_type", "alias"],
  active: ["csgIsActive", "csg_is_active", "isActive", "is_active", "status"],
  position: ["position", "sort"],
  description: ["csgEuserName", "csg_euser_name", "description"],
  array: ["data", "items", "results", "rows", "list", "gspCompanyServices", "gsp_company_service"],
} as const;

const REQUEST_PAYLOAD_KEYS = {
  id: "csgCompanyServiceId",
  name: "csgServiceType",
  alias: "csgServiceType",
  short: "csgServiceType",
  description: "csgEuserName",
  sort: "position",
} as const;

const COMPANY_ID_KEYS = ["csgCompanyId", "csg_company_id"] as const;
const PROVIDER_ID_KEYS = ["csgGspProviderId", "csg_gsp_provider_id"] as const;
const SERVICE_TYPE_KEYS = ["csgServiceType", "csg_service_type"] as const;
const EUSER_NAME_KEYS = ["csgEuserName", "csg_euser_name"] as const;
const EUSER_PASSWORD_KEYS = ["csgEuserPassword", "csg_euser_password"] as const;
const IS_ACTIVE_KEYS = ["csgIsActive", "csg_is_active", "isActive", "is_active", "status"] as const;

const INITIAL_FORM_VALUES = {
  company: "",
  gspProvider: "",
  serviceType: "",
  euserName: "",
  euserPassword: "",
  isActive: "true",
} as const;

function buildGspFormFields(
  companyOptions: ERPDynamicSelectOption[],
  providerOptions: ERPDynamicSelectOption[],
): ERPDynamicModalField[] {
  return [
    {
      name: "company",
      label: "Company",
      type: "select",
      searchable: true,
      required: true,
      options: companyOptions,
      placeholder: "Search company",
      colSpan: 2,
      validation: {
        requiredMessage: "Company is required.",
      },
    },
    {
      name: "gspProvider",
      label: "GSP Provider",
      type: "select",
      searchable: true,
      required: true,
      options: providerOptions,
      placeholder: "Search provider",
      colSpan: 2,
      validation: {
        requiredMessage: "GSP Provider is required.",
      },
    },
    {
      name: "serviceType",
      label: "Service Type",
      required: true,
      colSpan: 1,
      validation: {
        maxLength: 20,
        maxLengthMessage: "Service Type must be 20 characters or fewer.",
      },
    },
    {
      name: "euserName",
      label: "E-User Name",
      required: true,
      colSpan: 1,
    },
    {
      name: "euserPassword",
      label: "E-User Password",
      type: "password",
      required: true,
      autoComplete: "new-password",
      colSpan: 1,
    },
    {
      name: "isActive",
      label: "Active",
      type: "checkbox",
      options: [
        { label: "Active", value: "true" },
        { label: "Inactive", value: "false" },
      ],
      colSpan: 1,
    },
  ];
}

export default function GspServiceMasterPage() {
  const { getAll: getCompanyLookup } = useApi<unknown>(LOOKUP_ENDPOINT);
  const { getAll: getProviderLookup } = useApi<unknown>(LOOKUP_ENDPOINT);
  // Silent progressive enhancement: a failed config fetch leaves the form on its
  // hardcoded labels/order (empty map), so don't nag the user with an error toast.
  const { getAll: getWidgetConfig } = useApi<WidgetMastersResponse>(WIDGET_CONFIG_ENDPOINT, {
    toast: { error: false },
  });
  const [companyOptions, setCompanyOptions] = useState<ERPDynamicSelectOption[]>([
    DEFAULT_COMPANY_OPTION,
  ]);
  const [providerOptions, setProviderOptions] = useState<ERPDynamicSelectOption[]>([
    DEFAULT_PROVIDER_OPTION,
  ]);
  const [widgetFieldConfig, setWidgetFieldConfig] = useState<Map<string, ResolvedFieldConfig>>(
    () => new Map(),
  );

  useEffect(() => {
    let mounted = true;

    void (async () => {
      try {
        const [companyPayload, providerPayload] = await Promise.all([
          getCompanyLookup(COMPANY_LOOKUP_QUERY),
          getProviderLookup(PROVIDER_LOOKUP_QUERY),
        ]);

        if (!mounted) {
          return;
        }

        setCompanyOptions(buildLookupOptions(companyPayload, DEFAULT_COMPANY_OPTION, COMPANY_OPTION_CONFIG));
        setProviderOptions(
          buildLookupOptions(providerPayload, DEFAULT_PROVIDER_OPTION, PROVIDER_OPTION_CONFIG),
        );
      } catch {
        if (mounted) {
          setCompanyOptions([DEFAULT_COMPANY_OPTION]);
          setProviderOptions([DEFAULT_PROVIDER_OPTION]);
        }
      }
    })();

    return () => {
      mounted = false;
    };
  }, [getCompanyLookup, getProviderLookup]);

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

  const gspFormFields = useMemo(
    () =>
      applyWidgetFieldConfig(
        buildGspFormFields(companyOptions, providerOptions),
        widgetFieldConfig,
        WIDGET_FIELD_NAME_BY_FORM_FIELD,
      ),
    [companyOptions, providerOptions, widgetFieldConfig],
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
        title="GSP Service"
        entityLabel="gsp service"
        entityLabelPlural="gsp services"
        apiEndpoints={API_ENDPOINTS}
        gridTableName={GRID_TABLE_NAME}
        listResponseStyleArrayKey=""
        gridDetailId={27}
        lookupKeys={LOOKUP_KEYS}
        requestPayloadKeys={REQUEST_PAYLOAD_KEYS}
        styles={styles}
        listTitle="GSP Service List"
        createLabel="Add GSP Service"
        codeColumnHeader="Service Type"
        nameColumnHeader="Service Type"
        nameFieldLabel="Service Type"
        nameFieldPlaceholder="EINV"
        formTitle="GSP Service Form"
        formDescription="Create and update GSP company services."
        viewModalTitle="GSP Service Details"
        createModalTitle="GSP Service Entry"
        editModalTitle="Edit GSP Service Entry"
        modalPanelStyle={{ width: "min(44rem, calc(100vw - 2.4rem))" }}
        customFields={gspFormFields}
        createInitialValues={INITIAL_FORM_VALUES}
        buildGetByIdRequest={({ recordId }) => ({
          query: {
            csgCompanyServiceId: String(recordId),
          },
        })}
        mapFormValues={({ source }) => {
          const rowSource = source ?? {};

          return {
            ...INITIAL_FORM_VALUES,
            company: toDisplayValue(getFirstDefinedValue(rowSource, COMPANY_ID_KEYS)),
            gspProvider: toDisplayValue(getFirstDefinedValue(rowSource, PROVIDER_ID_KEYS)),
            serviceType: toDisplayValue(getFirstDefinedValue(rowSource, SERVICE_TYPE_KEYS)),
            euserName: toDisplayValue(getFirstDefinedValue(rowSource, EUSER_NAME_KEYS)),
            euserPassword: toDisplayValue(getFirstDefinedValue(rowSource, EUSER_PASSWORD_KEYS)),
            isActive: toSelectBoolean(getFirstDefinedValue(rowSource, IS_ACTIVE_KEYS), "true"),
          };
        }}
        buildRequestPayload={({ values, shouldUpdate, editingItemId }) => {
          const payload: Record<string, unknown> = {
            csgCompanyId: (values.company ?? "").trim(),
            csgGspProviderId: (values.gspProvider ?? "").trim(),
            csgServiceType: (values.serviceType ?? "").trim().toUpperCase(),
            csgEuserName: (values.euserName ?? "").trim(),
            csgEuserPassword: values.euserPassword ?? "",
            csgIsActive: (values.isActive ?? "true") === "true",
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
