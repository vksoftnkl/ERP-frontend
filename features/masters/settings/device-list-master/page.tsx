"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useDeviceInfo } from "@/hooks/useDeviceInfo";
import CrudMasterPage, { type CrudMasterTableRow } from "@/components/master/crud-master-page";
import type { ReusableTableColumn } from "@/components/ui/table";
import {
  ERPDynamicModalForm,
  type ERPDynamicModalController,
  type ERPDynamicModalField,
  type ERPDynamicModalVariant,
  type ERPDynamicSelectOption,
} from "@/components/design-system/ui/dynamic-modal-form";
import styles from "@/app/master/state-master/page.module.scss";
import {
  getFirstDefinedValue,
  toDisplayValue,
  toNullableString,
  toSelectBoolean,
  toUpdateId,
} from "@/app/master/_shared/crud-utils";
import {
  useLazyConfiguredDropdown,
  type LazyDropdownHandlers,
} from "@/features/masters/shared/use-lazy-configured-dropdown";
import { getAuthUserId } from "@/lib/auth/session";
import {
  useGetCompanyOptionsQuery,
  useGetBranchOptionsQuery,
  useGetUserOptionsQuery,
} from "@/store/api/lookupsApi";
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
const API_ENDPOINTS = {
  list: "/configured-grid-sql/run?grid_id=28",
  getById: "/device-list-masters/get",
  create: "/device-list-masters/create",
  delete: "/device-list-masters/delete",
} as const;
const GRID_TABLE_NAME = "device_master";
// The form fields below are re-labelled, re-ordered, and shown/hidden from the
// backend widget-masters config (fixed.form_section / form_field) for this
// screen's menu id. Only those three properties come from the API — validation,
// state shape, and submit logic stay defined locally.
const WIDGET_CONFIG_ENDPOINT = "/widget-masters/get";
const WIDGET_SECTION_MENU_ID = 239;
// Platform filter for widget sections. The server validates it against its
// WidgetPlatform enum (Mobile | Desktop | Web) case-sensitively AND matches the
// stored section_platform exactly — the device fields live on the "Web" section.
const WIDGET_SECTION_PLATFORM = "Web";
// Bridge each hardcoded form field `name` to the backend `fieldName` it is
// configured under on menu 239's "Web" section (matched case-insensitively).
const WIDGET_FIELD_NAME_BY_FORM_FIELD: Record<string, string> = {
  devDeviceName: "device_name",
  devDeviceType: "device_type",
  devPlatform: "device_platform",
  devUserId: "device_user",
  devCompanyId: "device_company",
  devBranchId: "device_branch",
  devMacAddress: "device_mac_address",
  devIsBlocked: "device_blocked",
  devBlockReason: "device_block_reason",
  devIsActive: "device_status",
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
const DEVICE_TYPE_OPTIONS: ERPDynamicSelectOption[] = [
  { value: "", label: "Select Type" },
  { value: "Desktop", label: "Desktop" },
  { value: "Mobile", label: "Mobile" },
  { value: "Web", label: "Web" },
];
const PLATFORM_OPTIONS: ERPDynamicSelectOption[] = [
  { value: "", label: "Select Platform" },
  { value: "Windows", label: "Windows" },
  { value: "macOS", label: "macOS" },
  { value: "Linux", label: "Linux" },
  { value: "Android", label: "Android" },
  { value: "iOS", label: "iOS" },
  { value: "Other", label: "Other" },
];
const LOOKUP_KEYS = {
  id: ["devId", "dev_id", "id", "_id"],
  code: ["devDeviceName", "dev_device_name", "deviceName", "code"],
  name: ["devDeviceUid", "dev_device_uid", "deviceUid", "name"],
  short: ["devDeviceType", "dev_device_type", "deviceType", "short"],
  alias: ["devPlatform", "dev_platform", "platform", "alias"],
  active: ["devIsActive", "dev_is_active", "isActive", "is_active", "status"],
  position: ["position", "sort"],
  description: ["devMacAddress", "dev_mac_address", "macAddress", "description"],
  array: ["data", "items", "results", "rows", "list", "deviceMasters"],
} as const;
const REQUEST_PAYLOAD_KEYS = {
  id: "devId",
  name: "devDeviceUid",
  alias: "devPlatform",
  short: "devDeviceType",
  description: "devMacAddress",
  sort: "position",
} as const;
const DEV_COMPANY_ID_KEYS = ["devCompanyId", "dev_company_id", "companyId", "company_id"] as const;
const DEV_BRANCH_ID_KEYS = ["devBranchId", "dev_branch_id", "branchId", "branch_id"] as const;
const DEV_USER_ID_KEYS = ["devUserId", "dev_user_id", "userId", "user_id"] as const;
const DEV_DEVICE_UID_KEYS = ["devDeviceUid", "dev_device_uid", "deviceUid"] as const;
const DEV_DEVICE_NAME_KEYS = ["devDeviceName", "dev_device_name", "deviceName"] as const;
const DEV_DEVICE_TYPE_KEYS = ["devDeviceType", "dev_device_type", "deviceType"] as const;
const DEV_PLATFORM_KEYS = ["devPlatform", "dev_platform", "platform"] as const;
const DEV_MAC_ADDRESS_KEYS = ["devMacAddress", "dev_mac_address", "macAddress"] as const;
const DEV_IS_BLOCKED_KEYS = ["devIsBlocked", "dev_is_blocked", "isBlocked"] as const;
const DEV_BLOCK_REASON_KEYS = ["devBlockReason", "dev_block_reason", "blockReason"] as const;
const DEV_LAST_IP_KEYS = ["devLastIp", "dev_last_ip", "lastIp"] as const;
const DEV_IS_ACTIVE_KEYS = ["devIsActive", "dev_is_active", "isActive", "is_active"] as const;
const DEFAULT_COMPANY_OPTION: ERPDynamicSelectOption = { value: "", label: "Select Company" };
const DEFAULT_BRANCH_OPTION: ERPDynamicSelectOption = { value: "", label: "Select Branch" };
const DEFAULT_USER_OPTION: ERPDynamicSelectOption = { value: "", label: "Select User" };
// Form Company/Branch selects are lazy, server-side searchable configured dropdowns
// (fixed.dropdown_details 8=company comp_id/comp_name, 5=branch br_id/br_name). The eager
// RTK lists are still loaded to resolve names in the list table (grid 28 returns only ids).
const COMPANY_DROPDOWN_CONFIG = {
  dropdownId: "8",
  idKeys: ["comp_id", "compId"] as const,
  labelKeys: ["comp_name", "compName"] as const,
  defaultOption: DEFAULT_COMPANY_OPTION,
} as const;
const BRANCH_DROPDOWN_CONFIG = {
  dropdownId: "5",
  idKeys: ["br_id", "brId"] as const,
  labelKeys: ["br_name", "brName"] as const,
  defaultOption: DEFAULT_BRANCH_OPTION,
} as const;
// Source keys to seed the saved selection on edit/view (getById returns id + name).
const DEV_COMPANY_NAME_KEYS = ["devCompanyName", "dev_company_name", "compName", "comp_name"] as const;
const DEV_BRANCH_NAME_KEYS = ["devBranchName", "dev_branch_name", "brName", "br_name"] as const;
const INITIAL_FORM_VALUES = {
  devCompanyId: "",
  devBranchId: "",
  devUserId: "",
  devDeviceUid: "",
  devDeviceName: "",
  devDeviceType: "Desktop",
  devPlatform: "",
  devMacAddress: "",
  devIsBlocked: "false",
  devBlockReason: "",
  devIsActive: "true",
} as const;
function buildFormFields(
  companyOptions: ERPDynamicSelectOption[],
  branchOptions: ERPDynamicSelectOption[],
  userOptions: ERPDynamicSelectOption[],
  companyHandlers: LazyDropdownHandlers,
  branchHandlers: LazyDropdownHandlers,
): ERPDynamicModalField[] {
  return [
    // {
    //   name: "devDeviceUid",
    //   label: "Device UID",
    //   required: true,
    //   colSpan: 2,
    //   placeholder: "e.g. A1:B2:C3:D4:E5:F6",
    //   validation: {
    //     minLength: 2,
    //     minLengthMessage: "Device UID must be at least 2 characters.",
    //     requiredMessage: "Device UID is required.",
    //   },
    // },
    {
      name: "devDeviceName",
      label: "Device Name",
      colSpan: 2,
      placeholder: "e.g. Reception Desktop",
    },
    {
      name: "devDeviceType",
      label: "Device Type",
      type: "select",
      colSpan: 2,
      required: true,
      options: DEVICE_TYPE_OPTIONS,
      searchable: false,
      validation: {
        requiredMessage: "Device Type is required.",
      },
    },
    {
      name: "devPlatform",
      label: "Platform",
      type: "select",
      colSpan: 2,
      options: PLATFORM_OPTIONS,
      searchable: false,
    },
    {
      name: "devUserId",
      label: "User",
      type: "select",
      colSpan: 2,
      searchable: true,
      options: userOptions,
    },
    {
      name: "devCompanyId",
      label: "Company",
      type: "select",
      colSpan: 2,
      searchable: true,
      serverSearch: true,
      options: companyOptions,
      onSearchOpenChange: companyHandlers.onSearchOpenChange,
      onSearchQueryChange: companyHandlers.onSearchQueryChange,
      onValueChange: companyHandlers.onValueChange,
    },
    {
      name: "devBranchId",
      label: "Branch",
      type: "select",
      colSpan: 2,
      searchable: true,
      serverSearch: true,
      options: branchOptions,
      onSearchOpenChange: branchHandlers.onSearchOpenChange,
      onSearchQueryChange: branchHandlers.onSearchQueryChange,
      onValueChange: branchHandlers.onValueChange,
    },
    {
      name: "devMacAddress",
      label: "MAC Address",
      colSpan: 2,
      disabled: true,
      placeholder: "e.g. A1:B2:C3:D4:E5:F6",
    },
    {
      name: "devIsBlocked",
      label: "Blocked",
      type: "checkbox",
      options: [
        { label: "Blocked", value: "true" },
        { label: "Not Blocked", value: "false" },
      ],
    },
    {
      name: "devBlockReason",
      label: "Block Reason",
      colSpan: 2,
      placeholder: "Reason for blocking this device",
    },
    {
      name: "devIsActive",
      label: "Status",
      type: "checkbox",
      options: [
        { label: "Active", value: "true" },
        { label: "Inactive", value: "false" },
      ],
    },
  ];
}
function getSourceValue(row: CrudMasterTableRow, keys: readonly string[]): unknown {
  if (!row.__source) return undefined;
  return getFirstDefinedValue(row.__source as Record<string, unknown>, keys);
}
export default function DeviceListMasterPage() {
  const deviceInfo = useDeviceInfo();
  // Eager lists feed the list-table name resolution (grid 28 returns only ids) and the
  // User form select. Company/Branch FORM selects use lazy server-side dropdowns below.
  const { data: companyOptions = [DEFAULT_COMPANY_OPTION] } = useGetCompanyOptionsQuery();
  const { data: branchOptions = [DEFAULT_BRANCH_OPTION] } = useGetBranchOptionsQuery();
  const { data: userOptions = [DEFAULT_USER_OPTION] } = useGetUserOptionsQuery();
  const company = useLazyConfiguredDropdown(COMPANY_DROPDOWN_CONFIG);
  const branch = useLazyConfiguredDropdown(BRANCH_DROPDOWN_CONFIG);
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
  const companyLabelMap = useMemo(
    () => new Map(companyOptions.map((o) => [o.value, o.label])),
    [companyOptions],
  );
  const branchLabelMap = useMemo(
    () => new Map(branchOptions.map((o) => [o.value, o.label])),
    [branchOptions],
  );
  const userLabelMap = useMemo(
    () => new Map(userOptions.map((o) => [o.value, o.label])),
    [userOptions],
  );
  const formFields = useMemo(
    () =>
      applyWidgetFieldConfig(
        buildFormFields(
          company.options,
          branch.options,
          userOptions,
          company.handlers,
          branch.handlers,
        ),
        widgetFieldConfig,
        WIDGET_FIELD_NAME_BY_FORM_FIELD,
      ),
    [
      company.options,
      company.handlers,
      branch.options,
      branch.handlers,
      userOptions,
      widgetFieldConfig,
    ],
  );
  const customTableColumns = useMemo<ReusableTableColumn<CrudMasterTableRow>[]>(
    () => [
      {
        key: "serialNo",
        header: "S.No",
        accessor: "serialNo",
        width: "12px",
        sortable: false,
      },
      {
        key: "devDeviceUid",
        header: "Device UID",
        accessor: "masterName",
        width: "200px",
      },
      {
        key: "devDeviceName",
        header: "Device Name",
        accessor: "masterCode",
        width: "160px",
      },
      {
        key: "devDeviceType",
        header: "Type",
        width: "100px",
        render: (row) => toDisplayValue(getSourceValue(row, DEV_DEVICE_TYPE_KEYS)) || "-",
        sortAccessor: (row) => toDisplayValue(getSourceValue(row, DEV_DEVICE_TYPE_KEYS)),
        searchAccessor: (row) => toDisplayValue(getSourceValue(row, DEV_DEVICE_TYPE_KEYS)),
      },
      {
        key: "devPlatform",
        header: "Platform",
        width: "100px",
        render: (row) => toDisplayValue(getSourceValue(row, DEV_PLATFORM_KEYS)) || "-",
        sortAccessor: (row) => toDisplayValue(getSourceValue(row, DEV_PLATFORM_KEYS)),
        searchAccessor: (row) => toDisplayValue(getSourceValue(row, DEV_PLATFORM_KEYS)),
      },
      {
        key: "devCompany",
        header: "Company",
        width: "160px",
        render: (row) => {
          const id = toDisplayValue(getSourceValue(row, DEV_COMPANY_ID_KEYS));
          return companyLabelMap.get(id) || id || "-";
        },
        sortAccessor: (row) => {
          const id = toDisplayValue(getSourceValue(row, DEV_COMPANY_ID_KEYS));
          return companyLabelMap.get(id) || id;
        },
        searchAccessor: (row) => {
          const id = toDisplayValue(getSourceValue(row, DEV_COMPANY_ID_KEYS));
          return `${companyLabelMap.get(id) || ""} ${id}`.trim();
        },
      },
      {
        key: "devBranch",
        header: "Branch",
        width: "140px",
        render: (row) => {
          const id = toDisplayValue(getSourceValue(row, DEV_BRANCH_ID_KEYS));
          return branchLabelMap.get(id) || id || "-";
        },
        sortAccessor: (row) => {
          const id = toDisplayValue(getSourceValue(row, DEV_BRANCH_ID_KEYS));
          return branchLabelMap.get(id) || id;
        },
        searchAccessor: (row) => {
          const id = toDisplayValue(getSourceValue(row, DEV_BRANCH_ID_KEYS));
          return `${branchLabelMap.get(id) || ""} ${id}`.trim();
        },
      },
      {
        key: "devUser",
        header: "User",
        width: "140px",
        render: (row) => {
          const id = toDisplayValue(getSourceValue(row, DEV_USER_ID_KEYS));
          return userLabelMap.get(id) || id || "-";
        },
        sortAccessor: (row) => {
          const id = toDisplayValue(getSourceValue(row, DEV_USER_ID_KEYS));
          return userLabelMap.get(id) || id;
        },
        searchAccessor: (row) => {
          const id = toDisplayValue(getSourceValue(row, DEV_USER_ID_KEYS));
          return `${userLabelMap.get(id) || ""} ${id}`.trim();
        },
      },
      {
        key: "devMacAddress",
        header: "MAC Address",
        width: "140px",
        render: (row) => toDisplayValue(getSourceValue(row, DEV_MAC_ADDRESS_KEYS)) || "-",
        sortAccessor: (row) => toDisplayValue(getSourceValue(row, DEV_MAC_ADDRESS_KEYS)),
        searchAccessor: (row) => toDisplayValue(getSourceValue(row, DEV_MAC_ADDRESS_KEYS)),
      },
      {
        key: "devLastIp",
        header: "Last IP",
        width: "120px",
        render: (row) => toDisplayValue(getSourceValue(row, DEV_LAST_IP_KEYS)) || "-",
        sortAccessor: (row) => toDisplayValue(getSourceValue(row, DEV_LAST_IP_KEYS)),
        searchAccessor: (row) => toDisplayValue(getSourceValue(row, DEV_LAST_IP_KEYS)),
      },
      {
        key: "devIsBlocked",
        header: "Blocked",
        width: "80px",
        render: (row) => {
          const val = getSourceValue(row, DEV_IS_BLOCKED_KEYS);
          return val === true || val === "true" ? "Yes" : "No";
        },
        sortAccessor: (row) => {
          const val = getSourceValue(row, DEV_IS_BLOCKED_KEYS);
          return val === true || val === "true" ? "1" : "0";
        },
        searchAccessor: (row) => {
          const val = getSourceValue(row, DEV_IS_BLOCKED_KEYS);
          return val === true || val === "true" ? "blocked yes" : "not blocked no";
        },
      },
    ],
    [companyLabelMap, branchLabelMap],
  );
  // Toggles the `wantdelete` grid param; ticking it re-runs the list so the user
  // can see soft-deleted devices. Lives beside the list search input.
  const [wantDelete, setWantDelete] = useState(false);
  // Adds the `grid_param` payload to the default page/limit/search list query.
  // The server JSON-parses it and binds each key into the matching named token in
  // grid 28's stored SQL; keys with no matching token are ignored. `wantdelete` is
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
  // "Web" platform to match the configured device section.
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
      title="Device List"
      auditHistory={{ screenName: "Device List Master" }}
      entityLabel="device"
      entityLabelPlural="devices"
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
      lookupKeys={LOOKUP_KEYS}
      requestPayloadKeys={REQUEST_PAYLOAD_KEYS}
      styles={styles}
      listTitle="Device List"
      createLabel="Add Device"
      codeColumnHeader="Device Name"
      nameColumnHeader="Device UID"
      nameFieldLabel="Device UID"
      nameFieldPlaceholder="e.g. A1:B2:C3:D4:E5:F6"
      formTitle="Device Form"
       createModalTitle="Device Entry"
      editModalTitle="Edit Device Entry"
      formDescription="Register and manage devices."
      customFields={formFields}
      customTableColumns={customTableColumns}
      createInitialValues={useMemo(
        () => ({
          ...INITIAL_FORM_VALUES,
          devMacAddress: deviceInfo.macAddress,
          devPlatform: deviceInfo.platform,
          devDeviceType: deviceInfo.deviceType,
        }),
        [deviceInfo],
      )}
      onModalOpenChange={(open, variantKey) => {
        // Clear the lazy Company/Branch dropdowns when the create modal opens so no
        // stale selection from a previously edited device lingers (they reload on open).
        if (open && variantKey === "master-create") {
          company.seedSelected("", "");
          branch.seedSelected("", "");
        }
      }}
      mapFormValues={({ source }) => {
        const rowSource = source ?? {};
        const devCompanyId =
          toDisplayValue(getFirstDefinedValue(rowSource, DEV_COMPANY_ID_KEYS)) ||
          INITIAL_FORM_VALUES.devCompanyId;
        const devBranchId =
          toDisplayValue(getFirstDefinedValue(rowSource, DEV_BRANCH_ID_KEYS)) ||
          INITIAL_FORM_VALUES.devBranchId;
        // Seed the lazy Company/Branch dropdowns so the trigger shows the name on
        // edit/view. Prefer getById's resolved name, fall back to the eager label maps.
        company.seedSelected(
          devCompanyId,
          toDisplayValue(getFirstDefinedValue(rowSource, DEV_COMPANY_NAME_KEYS)) ||
            companyLabelMap.get(devCompanyId) ||
            "",
        );
        branch.seedSelected(
          devBranchId,
          toDisplayValue(getFirstDefinedValue(rowSource, DEV_BRANCH_NAME_KEYS)) ||
            branchLabelMap.get(devBranchId) ||
            "",
        );
        return {
          ...INITIAL_FORM_VALUES,
          devCompanyId,
          devBranchId,
          devUserId: toDisplayValue(getFirstDefinedValue(rowSource, DEV_USER_ID_KEYS)) || INITIAL_FORM_VALUES.devUserId,
          devDeviceUid: toDisplayValue(getFirstDefinedValue(rowSource, DEV_DEVICE_UID_KEYS)) || INITIAL_FORM_VALUES.devDeviceUid,
          devDeviceName: toDisplayValue(getFirstDefinedValue(rowSource, DEV_DEVICE_NAME_KEYS)) || INITIAL_FORM_VALUES.devDeviceName,
          devDeviceType: toDisplayValue(getFirstDefinedValue(rowSource, DEV_DEVICE_TYPE_KEYS)) || INITIAL_FORM_VALUES.devDeviceType,
          devPlatform: toDisplayValue(getFirstDefinedValue(rowSource, DEV_PLATFORM_KEYS)) || INITIAL_FORM_VALUES.devPlatform,
          devMacAddress: toDisplayValue(getFirstDefinedValue(rowSource, DEV_MAC_ADDRESS_KEYS)) || INITIAL_FORM_VALUES.devMacAddress,
          devIsBlocked: toSelectBoolean(getFirstDefinedValue(rowSource, DEV_IS_BLOCKED_KEYS), "false"),
          devBlockReason: toDisplayValue(getFirstDefinedValue(rowSource, DEV_BLOCK_REASON_KEYS)) || INITIAL_FORM_VALUES.devBlockReason,
          devIsActive: toSelectBoolean(getFirstDefinedValue(rowSource, DEV_IS_ACTIVE_KEYS), "true"),
        };
      }}
      buildRequestPayload={({ values, shouldUpdate, editingItemId }) => {
        const payload: Record<string, unknown> = {
          devDeviceUid: (values.devDeviceUid ?? "").trim(),
          devDeviceName: toNullableString(values.devDeviceName ?? ""),
          devDeviceType: (values.devDeviceType ?? "Desktop").trim(),
          devPlatform: toNullableString(values.devPlatform ?? ""),
          devUserId: toNullableString(values.devUserId ?? ""),
          devCompanyId: toNullableString(values.devCompanyId ?? ""),
          devBranchId: toNullableString(values.devBranchId ?? ""),
          devMacAddress: toNullableString(values.devMacAddress ?? ""),
          devIsBlocked: (values.devIsBlocked ?? "false") === "true",
          devBlockReason: toNullableString(values.devBlockReason ?? ""),
          devIsActive: (values.devIsActive ?? "true") === "true",
          devEntryBy: getAuthUserId(),
        };
        if (shouldUpdate && editingItemId !== null) {
          payload.devId = toUpdateId(editingItemId);
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