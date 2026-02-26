"use client";

import CrudMasterPage from "@/components/master/crud-master-page";
import type { ERPDynamicModalField } from "@/components/library/ui/dynamic-modal-form";
import styles from "../state-master/page.module.scss";
import {
  getFirstDefinedValue,
  toDisplayValue,
  toSelectBoolean,
  toNonNegativeInteger,
  toNullableString,
  toUpdateId,
  toUpper,
} from "../_shared/crud-utils";

const API_ENDPOINTS = {
  list: "/company-masters/list",
  getById: "/company-masters/get",
  create: "/company-masters/create",
  delete: "/company-masters/delete",
} as const;

const LOOKUP_KEYS = {
  id: ["compId", "comp_id", "id", "_id"],
  code: ["compCode", "comp_code", "code"],
  name: ["compName", "comp_name", "name"],
  short: ["compShort", "comp_short", "short", "short_name", "shortName"],
  alias: ["compLegalName", "comp_legal_name", "alias", "legal_name"],
  active: ["compIsActive", "comp_is_active", "isActive", "is_active", "status"],
  position: ["compStylesheetId", "comp_stylesheet_id", "position", "sort"],
  description: ["compRemarks", "comp_remarks", "description", "remarks"],
  array: ["data", "items", "results", "rows", "list", "companies"],
} as const;

const REQUEST_PAYLOAD_KEYS = {
  id: "compId",
  name: "compName",
  alias: "compLegalName",
  short: "compShort",
  description: "compRemarks",
  sort: "compStylesheetId",
} as const;

const COMPANY_STATE_CODE_KEYS = ["compStateCode", "comp_state_code", "stateCode", "state_code"] as const;
const COMPANY_IS_ACTIVE_KEYS = ["compIsActive", "comp_is_active", "isActive", "is_active", "status"] as const;
const COMPANY_CODE_KEYS = ["compCode", "comp_code", "code"] as const;
const COMPANY_LEGAL_NAME_KEYS = ["compLegalName", "comp_legal_name", "legalName", "legal_name"] as const;

const COMPANY_INITIAL_FORM_VALUES = {
  masterName: "",
  compCode: "",
  masterShortName: "",
  compLegalName: "",
  compStateCode: "",
  position: "0",
  compIsActive: "true",
  masterDescription: "",
} as const;

const COMPANY_FORM_FIELDS: ERPDynamicModalField[] = [
  {
    name: "masterName",
    label: "Company Name",
    required: true,
    validation: {
      minLength: 2,
      minLengthMessage: "Company Name must be at least 2 characters.",
    },
  },
  {
    name: "compCode",
    label: "Company Code",
  },
  {
    name: "masterShortName",
    label: "Short Name",
  },
  {
    name: "compLegalName",
    label: "Legal Name",
  },
  {
    name: "compStateCode",
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
    name: "position",
    label: "Stylesheet Id",
    type: "number",
    min: 0,
    step: 1,
    required: true,
    validation: {
      requiredMessage: "Stylesheet Id is required.",
      minMessage: "Stylesheet Id must be 0 or greater.",
    },
  },
  {
    name: "compIsActive",
    label: "Status",
    type: "checkbox",
    options: [
      { label: "Active", value: "true" },
      { label: "Inactive", value: "false" },
    ],
  },
  {
    name: "masterDescription",
    label: "Remarks",
    type: "textarea",
    colSpan: 2,
  },
];

export default function CompaniesMasterPage() {
  return (
    <CrudMasterPage
      title="Company"
      entityLabel="company"
      entityLabelPlural="companies"
      apiEndpoints={API_ENDPOINTS}
      lookupKeys={LOOKUP_KEYS}
      requestPayloadKeys={REQUEST_PAYLOAD_KEYS}
      styles={styles}
      listTitle="Company List"
      createLabel="Add Company"
      codeColumnHeader="Company Code"
      nameColumnHeader="Company Name"
      nameFieldLabel="Company Name"
      nameFieldPlaceholder="ABC Traders Pvt Ltd"
      formTitle="Company Form"
      formDescription="Create and update companies."
      customFields={COMPANY_FORM_FIELDS}
      createInitialValues={COMPANY_INITIAL_FORM_VALUES}
      mapFormValues={({ source, defaults }) => {
        const rowSource = source ?? {};
        const mergedDefaults = { ...COMPANY_INITIAL_FORM_VALUES, ...defaults };

        return {
          ...COMPANY_INITIAL_FORM_VALUES,
          masterName:
            toDisplayValue(getFirstDefinedValue(rowSource, LOOKUP_KEYS.name)) || mergedDefaults.masterName,
          compCode:
            toDisplayValue(getFirstDefinedValue(rowSource, COMPANY_CODE_KEYS)) || mergedDefaults.compCode,
          masterShortName:
            toDisplayValue(getFirstDefinedValue(rowSource, LOOKUP_KEYS.short)) ||
            mergedDefaults.masterShortName,
          compLegalName:
            toDisplayValue(getFirstDefinedValue(rowSource, COMPANY_LEGAL_NAME_KEYS)) ||
            mergedDefaults.compLegalName,
          compStateCode:
            toDisplayValue(getFirstDefinedValue(rowSource, COMPANY_STATE_CODE_KEYS)) ||
            mergedDefaults.compStateCode,
          position:
            toDisplayValue(getFirstDefinedValue(rowSource, LOOKUP_KEYS.position)) || mergedDefaults.position,
          compIsActive: toSelectBoolean(getFirstDefinedValue(rowSource, COMPANY_IS_ACTIVE_KEYS), "true"),
          masterDescription:
            toDisplayValue(getFirstDefinedValue(rowSource, LOOKUP_KEYS.description)) ||
            mergedDefaults.masterDescription,
        };
      }}
      buildRequestPayload={({ values, shouldUpdate, editingItemId }) => {
        const payload: Record<string, unknown> = {
          compName: (values.masterName ?? "").trim(),
          compCode: toNullableString(values.compCode ?? ""),
          compShort: toNullableString(values.masterShortName ?? ""),
          compLegalName: toNullableString(values.compLegalName ?? ""),
          compStateCode: toUpper(values.compStateCode ?? ""),
          compStylesheetId: toNonNegativeInteger(values.position ?? "0", 0),
          compIsActive: (values.compIsActive ?? "true") === "true",
          compRemarks: toNullableString(values.masterDescription ?? ""),
        };

        if (shouldUpdate && editingItemId !== null) {
          payload.compId = toUpdateId(editingItemId);
        }

        return payload;
      }}
    />
  );
}
