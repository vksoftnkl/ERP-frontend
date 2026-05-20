"use client";
import { useEffect, useMemo, useState } from "react";
import CrudMasterPage, { type CrudMasterTableRow } from "@/components/master/crud-master-page";
import type { ReusableTableColumn } from "@/components/ui/table";
import { useApi } from "@/hooks/useApi";
import type {
  ERPDynamicModalField,
  ERPDynamicSelectOption,
} from "@/components/design-system/ui/dynamic-modal-form";
import styles from "@/app/master/state-master/page.module.scss";
import {
  buildLookupOptions,
  getFirstDefinedValue,
  toDisplayValue,
  toNullableString,
  toSelectBoolean,
  toUpdateId,
  DEFAULT_LOOKUP_ARRAY_KEYS,
} from "@/app/master/_shared/crud-utils";

const API_ENDPOINTS = {
  list: "/device-list-masters/list",
  getById: "/device-list-masters/get",
  create: "/device-list-masters/create",
  delete: "/device-list-masters/delete",
} as const;

const GRID_TABLE_NAME = "device_master";
const LOOKUP_ENDPOINT = "/master-lookups/name-id/all-accounts-and-masters";

const LOOKUP_QUERY_COMPANIES = { module: "companies", limit: "100" } as const;
const LOOKUP_QUERY_BRANCHES = { module: "branches", limit: "100" } as const;

const DEVICE_TYPE_OPTIONS: ERPDynamicSelectOption[] = [
  { value: "", label: "Select Type" },
  { value: "Desktop", label: "Desktop" },
  { value: "Laptop", label: "Laptop" },
  { value: "Mobile", label: "Mobile" },
  { value: "Tablet", label: "Tablet" },
  { value: "Server", label: "Server" },
  { value: "Kiosk", label: "Kiosk" },
  { value: "POS", label: "POS Terminal" },
  { value: "Other", label: "Other" },
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

const INITIAL_FORM_VALUES = {
  devCompanyId: "",
  devBranchId: "",
  devDeviceUid: "",
  devDeviceName: "",
  devDeviceType: "Desktop",
  devPlatform: "",
  devMacAddress: "",
  devIsBlocked: "false",
  devBlockReason: "",
  devLastIp: "",
  devIsActive: "true",
} as const;

function buildFormFields(
  companyOptions: ERPDynamicSelectOption[],
  branchOptions: ERPDynamicSelectOption[],
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
      name: "devCompanyId",
      label: "Company",
      type: "select",
      colSpan: 2,
      searchable: true,
      options: companyOptions,
    },
    {
      name: "devBranchId",
      label: "Branch",
      type: "select",
      colSpan: 2,
      searchable: true,
      options: branchOptions,
    },
    {
      name: "devMacAddress",
      label: "MAC Address",
      colSpan: 2,
      placeholder: "e.g. A1:B2:C3:D4:E5:F6",
    },
    {
      name: "devLastIp",
      label: "Last IP",
      colSpan: 2,
      placeholder: "e.g. 192.168.1.100",
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
  const { getAll: getCompanyLookup } = useApi<unknown>(LOOKUP_ENDPOINT);
  const { getAll: getBranchLookup } = useApi<unknown>(LOOKUP_ENDPOINT);

  const [companyOptions, setCompanyOptions] = useState<ERPDynamicSelectOption[]>([DEFAULT_COMPANY_OPTION]);
  const [branchOptions, setBranchOptions] = useState<ERPDynamicSelectOption[]>([DEFAULT_BRANCH_OPTION]);

  useEffect(() => {
    let mounted = true;
    void (async () => {
      try {
        const [companiesPayload, branchesPayload] = await Promise.all([
          getCompanyLookup(LOOKUP_QUERY_COMPANIES),
          getBranchLookup(LOOKUP_QUERY_BRANCHES),
        ]);
        if (!mounted) return;
        setCompanyOptions(
          buildLookupOptions(companiesPayload, DEFAULT_COMPANY_OPTION, {
            arrayKeys: DEFAULT_LOOKUP_ARRAY_KEYS,
            idKeys: ["id", "value"],
            labelKeys: ["name", "label"],
          }),
        );
        setBranchOptions(
          buildLookupOptions(branchesPayload, DEFAULT_BRANCH_OPTION, {
            arrayKeys: DEFAULT_LOOKUP_ARRAY_KEYS,
            idKeys: ["id", "value"],
            labelKeys: ["name", "label"],
          }),
        );
      } catch {
        if (!mounted) return;
        setCompanyOptions([DEFAULT_COMPANY_OPTION]);
        setBranchOptions([DEFAULT_BRANCH_OPTION]);
      }
    })();
    return () => { mounted = false; };
  }, [getCompanyLookup, getBranchLookup]);

  const companyLabelMap = useMemo(
    () => new Map(companyOptions.map((o) => [o.value, o.label])),
    [companyOptions],
  );
  const branchLabelMap = useMemo(
    () => new Map(branchOptions.map((o) => [o.value, o.label])),
    [branchOptions],
  );

  const formFields = useMemo(
    () => buildFormFields(companyOptions, branchOptions),
    [companyOptions, branchOptions],
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

  return (
    <CrudMasterPage
      title="Device List"
      auditHistory={{ screenName: "Device List Master" }}
      entityLabel="device"
      entityLabelPlural="devices"
      apiEndpoints={API_ENDPOINTS}
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
      formDescription="Register and manage devices."
      customFields={formFields}
      customTableColumns={customTableColumns}
      createInitialValues={INITIAL_FORM_VALUES}
      mapFormValues={({ source }) => {
        const rowSource = source ?? {};
        return {
          ...INITIAL_FORM_VALUES,
          devCompanyId: toDisplayValue(getFirstDefinedValue(rowSource, DEV_COMPANY_ID_KEYS)) || INITIAL_FORM_VALUES.devCompanyId,
          devBranchId: toDisplayValue(getFirstDefinedValue(rowSource, DEV_BRANCH_ID_KEYS)) || INITIAL_FORM_VALUES.devBranchId,
          devDeviceUid: toDisplayValue(getFirstDefinedValue(rowSource, DEV_DEVICE_UID_KEYS)) || INITIAL_FORM_VALUES.devDeviceUid,
          devDeviceName: toDisplayValue(getFirstDefinedValue(rowSource, DEV_DEVICE_NAME_KEYS)) || INITIAL_FORM_VALUES.devDeviceName,
          devDeviceType: toDisplayValue(getFirstDefinedValue(rowSource, DEV_DEVICE_TYPE_KEYS)) || INITIAL_FORM_VALUES.devDeviceType,
          devPlatform: toDisplayValue(getFirstDefinedValue(rowSource, DEV_PLATFORM_KEYS)) || INITIAL_FORM_VALUES.devPlatform,
          devMacAddress: toDisplayValue(getFirstDefinedValue(rowSource, DEV_MAC_ADDRESS_KEYS)) || INITIAL_FORM_VALUES.devMacAddress,
          devIsBlocked: toSelectBoolean(getFirstDefinedValue(rowSource, DEV_IS_BLOCKED_KEYS), "false"),
          devBlockReason: toDisplayValue(getFirstDefinedValue(rowSource, DEV_BLOCK_REASON_KEYS)) || INITIAL_FORM_VALUES.devBlockReason,
          devLastIp: toDisplayValue(getFirstDefinedValue(rowSource, DEV_LAST_IP_KEYS)) || INITIAL_FORM_VALUES.devLastIp,
          devIsActive: toSelectBoolean(getFirstDefinedValue(rowSource, DEV_IS_ACTIVE_KEYS), "true"),
        };
      }}
      buildRequestPayload={({ values, shouldUpdate, editingItemId }) => {
        const payload: Record<string, unknown> = {
          devDeviceUid: (values.devDeviceUid ?? "").trim(),
          devDeviceName: toNullableString(values.devDeviceName ?? ""),
          devDeviceType: (values.devDeviceType ?? "Desktop").trim(),
          devPlatform: toNullableString(values.devPlatform ?? ""),
          devCompanyId: toNullableString(values.devCompanyId ?? ""),
          devBranchId: toNullableString(values.devBranchId ?? ""),
          devMacAddress: toNullableString(values.devMacAddress ?? ""),
          devIsBlocked: (values.devIsBlocked ?? "false") === "true",
          devBlockReason: toNullableString(values.devBlockReason ?? ""),
          devLastIp: toNullableString(values.devLastIp ?? ""),
          devIsActive: (values.devIsActive ?? "true") === "true",
        };
        if (shouldUpdate && editingItemId !== null) {
          payload.devId = toUpdateId(editingItemId);
        }
        return payload;
      }}
    />
  );
}
