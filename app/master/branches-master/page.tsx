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
  toDisplayValue,
  toNullableString,
  toSelectBoolean,
  toUpdateId,
  toUpper,
  DEFAULT_LOOKUP_ARRAY_KEYS,
} from "../_shared/crud-utils";

const API_ENDPOINTS = {
  list: "/branch-masters/list",
  getById: "/branch-masters/get",
  create: "/branch-masters/create",
  delete: "/branch-masters/delete",
} as const;

const LOOKUP_ENDPOINT = "/master-lookups/name-id/all-accounts-and-masters";

const LOOKUP_QUERY_COMPANIES = {
  module: "companies",
  limit: "100",
} as const;

const LOOKUP_KEYS = {
  id: ["brId", "br_id", "id", "_id"],
  code: ["brCode", "br_code", "code"],
  name: ["brName", "br_name", "name"],
  short: ["brShort", "br_short", "short", "shortName"],
  alias: ["brAlias", "br_alias", "alias"],
  active: ["brIsActive", "br_is_active", "isActive", "is_active", "status"],
  position: ["position", "sort"],
  description: ["brTerms", "br_terms", "description", "remarks"],
  array: ["data", "items", "results", "rows", "list", "branches", "branch_masters"],
} as const;

const REQUEST_PAYLOAD_KEYS = {
  id: "brId",
  name: "brName",
  alias: "brAlias",
  short: "brShort",
  description: "brTerms",
  sort: "position",
} as const;

const BRANCH_COMPANY_ID_KEYS = ["compId", "comp_id", "brCompanyId", "br_company_id"] as const;
const BRANCH_STATE_CODE_KEYS = ["brStateCode", "br_state_code", "stateCode", "state_code"] as const;
const BRANCH_TYPE_KEYS = ["brType", "br_type", "type"] as const;
const BRANCH_IS_DEFAULT_KEYS = ["brIsDefault", "br_is_default", "isDefault", "is_default"] as const;
const BRANCH_IS_ACTIVE_KEYS = ["brIsActive", "br_is_active", "isActive", "is_active", "status"] as const;

const DEFAULT_COMPANY_OPTION: ERPDynamicSelectOption = {
  value: "",
  label: "Select Company",
};

const BRANCH_INITIAL_FORM_VALUES = {
  masterName: "",
  brCode: "",
  masterAlias: "",
  masterShortName: "",
  compId: "",
  brStateCode: "",
  brType: "",
  brIsDefault: "false",
  brIsActive: "true",
  masterDescription: "",
} as const;

function buildBranchFormFields(companyOptions: ERPDynamicSelectOption[]): ERPDynamicModalField[] {
  return [
    {
      name: "masterName",
      label: "Branch Name",
      required: true,
      validation: {
        minLength: 2,
        minLengthMessage: "Branch Name must be at least 2 characters.",
      },
    },
    {
      name: "brCode",
      label: "Branch Code",
    },
    {
      name: "masterAlias",
      label: "Alias",
    },
    {
      name: "masterShortName",
      label: "Short Name",
    },
    {
      name: "compId",
      label: "Company",
      type: "select",
      searchable: true,
      required: true,
      options: companyOptions,
      validation: {
        requiredMessage: "Company is required.",
      },
    },
    {
      name: "brStateCode",
      label: "State Code",
      required: true,
      placeholder: "GJ",
      validation: {
        minLength: 2,
        maxLength: 2,
        minLengthMessage: "State Code must be exactly 2 characters.",
        maxLengthMessage: "State Code must be exactly 2 characters.",
      },
    },
    {
      name: "brType",
      label: "Branch Type",
      placeholder: "MAIN",
    },
    {
      name: "brIsDefault",
      label: "Default Branch",
      type: "checkbox",
      options: [
        { label: "Yes", value: "true" },
        { label: "No", value: "false" },
      ],
    },
    {
      name: "brIsActive",
      label: "Status",
      type: "checkbox",
      options: [
        { label: "Active", value: "true" },
        { label: "Inactive", value: "false" },
      ],
    },
    {
      name: "masterDescription",
      label: "Terms / Notes",
      type: "textarea",
      colSpan: 2,
    },
  ];
}

export default function BranchesMasterPage() {
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

  const branchFormFields = useMemo(() => buildBranchFormFields(companyOptions), [companyOptions]);

  return (
    <CrudMasterPage
      title="Branch"
      entityLabel="branch"
      entityLabelPlural="branches"
      apiEndpoints={API_ENDPOINTS}
      lookupKeys={LOOKUP_KEYS}
      requestPayloadKeys={REQUEST_PAYLOAD_KEYS}
      styles={styles}
      listTitle="Branch List"
      createLabel="Add Branch"
      codeColumnHeader="Branch Code"
      nameColumnHeader="Branch Name"
      nameFieldLabel="Branch Name"
      nameFieldPlaceholder="Main Branch"
      formTitle="Branch Form"
      formDescription="Create and update branches."
      customFields={branchFormFields}
      createInitialValues={BRANCH_INITIAL_FORM_VALUES}
      mapFormValues={({ source, defaults }) => {
        const rowSource = source ?? {};
        const mergedDefaults = { ...BRANCH_INITIAL_FORM_VALUES, ...defaults };

        return {
          ...BRANCH_INITIAL_FORM_VALUES,
          masterName:
            toDisplayValue(getFirstDefinedValue(rowSource, LOOKUP_KEYS.name)) || mergedDefaults.masterName,
          brCode: toDisplayValue(getFirstDefinedValue(rowSource, LOOKUP_KEYS.code)) || mergedDefaults.brCode,
          masterAlias:
            toDisplayValue(getFirstDefinedValue(rowSource, LOOKUP_KEYS.alias)) || mergedDefaults.masterAlias,
          masterShortName:
            toDisplayValue(getFirstDefinedValue(rowSource, LOOKUP_KEYS.short)) ||
            mergedDefaults.masterShortName,
          compId:
            toDisplayValue(getFirstDefinedValue(rowSource, BRANCH_COMPANY_ID_KEYS)) || mergedDefaults.compId,
          brStateCode:
            toDisplayValue(getFirstDefinedValue(rowSource, BRANCH_STATE_CODE_KEYS)) ||
            mergedDefaults.brStateCode,
          brType:
            toDisplayValue(getFirstDefinedValue(rowSource, BRANCH_TYPE_KEYS)) || mergedDefaults.brType,
          brIsDefault: toSelectBoolean(getFirstDefinedValue(rowSource, BRANCH_IS_DEFAULT_KEYS), "false"),
          brIsActive: toSelectBoolean(getFirstDefinedValue(rowSource, BRANCH_IS_ACTIVE_KEYS), "true"),
          masterDescription:
            toDisplayValue(getFirstDefinedValue(rowSource, LOOKUP_KEYS.description)) ||
            mergedDefaults.masterDescription,
        };
      }}
      buildRequestPayload={({ values, shouldUpdate, editingItemId }) => {
        const payload: Record<string, unknown> = {
          compId: (values.compId ?? "").trim(),
          brCode: toNullableString(values.brCode ?? ""),
          brName: (values.masterName ?? "").trim(),
          brAlias: toNullableString(values.masterAlias ?? ""),
          brShort: toNullableString(values.masterShortName ?? ""),
          brType: toNullableString(values.brType ?? ""),
          brStateCode: toUpper(values.brStateCode ?? ""),
          brIsDefault: (values.brIsDefault ?? "false") === "true",
          brIsActive: (values.brIsActive ?? "true") === "true",
          brTerms: toNullableString(values.masterDescription ?? ""),
        };

        if (shouldUpdate && editingItemId !== null) {
          payload.brId = toUpdateId(editingItemId);
        }

        return payload;
      }}
    />
  );
}
