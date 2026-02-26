"use client";

import { useEffect, useMemo, useState } from "react";
import CrudMasterPage from "@/components/master/crud-master-page";
import { useApi } from "@/hooks/useApi";
import type {
  ERPDynamicModalField,
  ERPDynamicSelectOption,
} from "@/components/library/ui/dynamic-modal-form";
import styles from "../state-master/page.module.scss";
import {
  buildLookupOptions,
  getFirstDefinedValue,
  toCsvFromArray,
  toDisplayValue,
  toSelectBoolean,
  toUniqueStringArrayFromCsv,
  toUpdateId,
  DEFAULT_LOOKUP_ARRAY_KEYS,
} from "../_shared/crud-utils";

const API_ENDPOINTS = {
  list: "/company-group-masters/list",
  getById: "/company-group-masters/get",
  create: "/company-group-masters/create",
  delete: "/company-group-masters/delete",
} as const;

const LOOKUP_ENDPOINT = "/master-lookups/name-id/all-accounts-and-masters";

const LOOKUP_QUERY_COMPANIES = {
  module: "companies",
  limit: "100",
} as const;

const LOOKUP_KEYS = {
  id: ["cogGroupId", "cog_group_id", "id", "_id"],
  code: ["cogGroupName", "cog_group_name", "name", "code"],
  name: ["cogGroupName", "cog_group_name", "name"],
  short: ["cogGroupName", "cog_group_name", "short", "shortName"],
  alias: ["cogGroupName", "cog_group_name", "alias"],
  active: ["cogIsActive", "cog_is_active", "isActive", "is_active", "status"],
  position: ["position", "sort"],
  description: ["cogGroupName", "cog_group_name", "description"],
  array: ["data", "items", "results", "rows", "list", "companyGroups", "company_group_masters"],
} as const;

const REQUEST_PAYLOAD_KEYS = {
  id: "cogGroupId",
  name: "cogGroupName",
  alias: "cogGroupName",
  short: "cogGroupName",
  description: "cogGroupName",
  sort: "position",
} as const;

const COMPANY_IDS_KEYS = ["cogCompanyIds", "cog_company_ids", "companyIds"] as const;
const GROUP_IS_ACTIVE_KEYS = ["cogIsActive", "cog_is_active", "isActive", "is_active"] as const;

const DEFAULT_COMPANY_OPTION: ERPDynamicSelectOption = {
  value: "",
  label: "Select Companies",
};

const GROUP_INITIAL_FORM_VALUES = {
  masterName: "",
  cogCompanyIds: "",
  cogIsActive: "true",
} as const;

function buildCompanyGroupFormFields(
  companyOptions: ERPDynamicSelectOption[],
): ERPDynamicModalField[] {
  return [
    {
      name: "masterName",
      label: "Group Name",
      required: true,
      validation: {
        minLength: 2,
        minLengthMessage: "Group Name must be at least 2 characters.",
      },
    },
    {
      name: "cogCompanyIds",
      label: "Mapped Companies",
      type: "select",
      searchable: true,
      multiple: true,
      options: companyOptions,
      helperText: "Select one or more companies.",
    },
    {
      name: "cogIsActive",
      label: "Status",
      type: "checkbox",
      options: [
        { label: "Active", value: "true" },
        { label: "Inactive", value: "false" },
      ],
    },
  ];
}

export default function CompanyGroupMasterPage() {
  const { getAll: getCompanyLookup } = useApi<unknown>(LOOKUP_ENDPOINT);
  const [companyOptions, setCompanyOptions] = useState<ERPDynamicSelectOption[]>([
    DEFAULT_COMPANY_OPTION,
  ]);

  useEffect(() => {
    let mounted = true;

    void (async () => {
      try {
        const payload = await getCompanyLookup(LOOKUP_QUERY_COMPANIES);
        if (!mounted) {
          return;
        }

        setCompanyOptions(
          buildLookupOptions(payload, DEFAULT_COMPANY_OPTION, {
            arrayKeys: DEFAULT_LOOKUP_ARRAY_KEYS,
            idKeys: ["id", "value"],
            labelKeys: ["name", "label"],
          }),
        );
      } catch {
        if (mounted) {
          setCompanyOptions([DEFAULT_COMPANY_OPTION]);
        }
      }
    })();

    return () => {
      mounted = false;
    };
  }, [getCompanyLookup]);

  const companyGroupFormFields = useMemo(
    () => buildCompanyGroupFormFields(companyOptions),
    [companyOptions],
  );

  return (
    <CrudMasterPage
      title="Company Group"
      entityLabel="company group"
      entityLabelPlural="company groups"
      apiEndpoints={API_ENDPOINTS}
      lookupKeys={LOOKUP_KEYS}
      requestPayloadKeys={REQUEST_PAYLOAD_KEYS}
      styles={styles}
      listTitle="Company Group List"
      createLabel="Add Company Group"
      codeColumnHeader="Group Code"
      nameColumnHeader="Group Name"
      nameFieldLabel="Group Name"
      nameFieldPlaceholder="Main Group"
      formTitle="Company Group Form"
      formDescription="Create and update company groups."
      customFields={companyGroupFormFields}
      createInitialValues={GROUP_INITIAL_FORM_VALUES}
      mapFormValues={({ source, defaults }) => {
        const rowSource = source ?? {};
        const mergedDefaults = { ...GROUP_INITIAL_FORM_VALUES, ...defaults };

        return {
          ...GROUP_INITIAL_FORM_VALUES,
          masterName:
            toDisplayValue(getFirstDefinedValue(rowSource, LOOKUP_KEYS.name)) || mergedDefaults.masterName,
          cogCompanyIds:
            toCsvFromArray(getFirstDefinedValue(rowSource, COMPANY_IDS_KEYS)) ||
            mergedDefaults.cogCompanyIds,
          cogIsActive: toSelectBoolean(getFirstDefinedValue(rowSource, GROUP_IS_ACTIVE_KEYS), "true"),
        };
      }}
      buildRequestPayload={({ values, shouldUpdate, editingItemId }) => {
        const payload: Record<string, unknown> = {
          cogGroupName: (values.masterName ?? "").trim(),
          cogCompanyIds: toUniqueStringArrayFromCsv(values.cogCompanyIds ?? ""),
          cogIsActive: (values.cogIsActive ?? "true") === "true",
        };

        if (shouldUpdate && editingItemId !== null) {
          payload.cogGroupId = toUpdateId(editingItemId);
        }

        return payload;
      }}
    />
  );
}
