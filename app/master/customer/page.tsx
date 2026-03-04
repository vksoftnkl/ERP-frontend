"use client";

import { type CSSProperties, useEffect, useMemo, useState } from "react";
import CrudMasterPage from "@/components/master/crud-master-page";
import { useApi } from "@/hooks/useApi";
import type {
  ERPDynamicModalField,
  ERPDynamicSelectOption,
} from "@/components/library/ui/dynamic-modal-form";
import styles from "../state-master/page.module.scss";
import {
  buildLookupOptions,
  DEFAULT_LOOKUP_ARRAY_KEYS,
  extractRows,
  getFirstDefinedValue,
  toDateInputValue,
  toDisplayValue,
  toNonNegativeInteger,
  toNonNegativeNumber,
  toNullableDate,
  toNullableString,
  toSelectBoolean,
  toUpdateId,
  toUpper,
} from "../_shared/crud-utils";

const API_ENDPOINTS = {
  list: "/customers/list",
  getById: "/customers/get",
  create: "/customers/create",
  delete: "/customers/delete",
} as const;

const GRID_TABLE_NAME = "customers";

const STATE_LOOKUP_ENDPOINT = "/states/list";
const AREA_LOOKUP_ENDPOINT = "/areas/list";
const CUSTOMER_GROUP_LOOKUP_ENDPOINT = "/customer-groups/list";
const COMPANY_LOOKUP_ENDPOINT = "/company-masters/list";
const BRANCH_LOOKUP_ENDPOINT = "/branch-masters/list";
const PRICE_LEVEL_LOOKUP_ENDPOINT = "/price-level-masters/get";

const LOOKUP_REQUEST_QUERY = {
  page: "1",
  limit: "20",
} as const;

const BRANCH_LOOKUP_REQUEST_QUERY = {
  page: "1",
  limit: "100",
  brIsActive: "true",
} as const;

const COMPANY_LOOKUP_REQUEST_QUERY = {
  page: "1",
  limit: "100",
  compIsActive: "true",
} as const;

const PRICE_LEVEL_LOOKUP_REQUEST_QUERY = {
  activeOnly: "true",
  includeDeleted: "false",
} as const;

const LOOKUP_KEYS = {
  id: ["cusId", "cus_id", "customer_id", "customerId", "id", "_id"],
  code: ["cusCode", "cus_code", "customer_code", "customerCode", "code"],
  name: ["cusName", "cus_name", "customer_name", "customerName", "name"],
  short: ["cusShort", "cus_short", "customer_short", "short_name", "shortName", "short"],
  alias: ["cusTitle", "cus_title", "customer_title", "alias", "cusCode", "cus_code"],
  active: ["cusIsActive", "cus_is_active", "active", "is_active", "isActive", "status"],
  position: ["cusSortOrder", "cus_sort_order", "sort", "position"],
  description: ["cusNotes", "cus_notes", "notes", "description", "desc"],
  array: ["data", "items", "results", "rows", "list", "customers"],
} as const;

const REQUEST_PAYLOAD_KEYS = {
  id: "cusId",
  name: "cusName",
  alias: "cusTitle",
  short: "cusShort",
  description: "cusNotes",
  sort: "cusSortOrder",
} as const;

const STATE_LOOKUP_KEYS = {
  code: ["stmAlias", "stm_alias", "stmShort", "stm_short", "state_code", "stateCode", "code"],
  name: ["stmName", "stm_name", "state_name", "stateName", "name"],
  array: [...DEFAULT_LOOKUP_ARRAY_KEYS, "states"],
} as const;

const DEFAULT_STATE_OPTION: ERPDynamicSelectOption = {
  value: "",
  label: "Select State",
};

const DEFAULT_AREA_OPTION: ERPDynamicSelectOption = {
  value: "",
  label: "Select Area",
};

const DEFAULT_GROUP_OPTION: ERPDynamicSelectOption = {
  value: "",
  label: "Select Customer Group",
};

const DEFAULT_BRANCH_OPTION: ERPDynamicSelectOption = {
  value: "",
  label: "Select Branch",
};

const DEFAULT_COMPANY_OPTION: ERPDynamicSelectOption = {
  value: "",
  label: "Select Company",
};

const DEFAULT_PRICE_LEVEL_OPTION: ERPDynamicSelectOption = {
  value: "",
  label: "Select Price Level",
};

const CUSTOMER_BOOLEAN_FIELD_NAMES = [
  "cusCreditAllowed",
  "cusEnableSms",
  "cusOverdueSms",
  "cusOverdueBilling",
  "cusAllowPromotion",
  "cusAllowLoyalty",
  "cusAllowDiscount",
  "cusFreightCharge",
  "cusLoadingCharge",
  "cusUnloadingCharge",
  "cusTcsApplicable",
  "cusItcollExempted",
  "cusIsActive",
] as const;

const CUSTOMER_DATE_FIELD_NAMES = [
  "cusBirthDate",
  "cusMarriageDate",
  "cusBilledDate",
] as const;

const CUSTOMER_TEXT_FIELD_NAMES = [
  "cusTitle",
  "cusShort",
  "cusCode",
  "cusName",
  "cusAddr1",
  "cusAddr2",
  "cusAddr3",
  "cusCity",
  "cusDistrict",
  "cusCountry",
  "cusLandmark",
  "cusPin",
  "cusTel",
  "cusPhone1",
  "cusPhone2",
  "cusWhatsappNo",
  "cusEmail",
  "cusAadharNo",
  "cusContactPerson",
  "cusDistanceKm",
  "cusCreditBillLimit",
  "cusCreditAmtLimit",
  "cusCreditDays",
  "cusDebitBalance",
  "cusDiscPerc",
  "cusDebitGraceDays",
  "cusSortOrder",
  "cusRegionName",
  "cusRegionAddr1",
  "cusRegionAddr2",
  "cusRegionAddr3",
  "cusRegionCity",
  "cusRegionDistrict",
  "cusRegionStateName",
  "cusRegionCountry",
  "cusTransportName",
  "cusGstNo",
  "cusPanNo",
  "cusGstType",
  "cusEcommerceGstin",
  "cusItcollType",
  "cusGeoLocation",
  "cusDefaultSalesman",
  "cusPriceLevelId",
  "cusCompanyId",
  "cusBilledCount",
  "cusNotes",
  "cusBranchId",
  "cusAreaId",
  "cusGroupId",
] as const;

const CUSTOMER_INITIAL_FORM_VALUES: Record<string, string> = {
  cusName: "",
  cusCode: "",
  cusShort: "",
  cusTitle: "",
  cusAreaId: "",
  cusGroupId: "",
  cusStateCode: "",
  cusPriceLevelId: "",
  cusCompanyId: "",
  cusBranchId: "",
  cusDefaultSalesman: "",

  cusContactPerson: "",
  cusPhone1: "",
  cusPhone2: "",
  cusTel: "",
  cusWhatsappNo: "",
  cusEmail: "",
  cusAadharNo: "",
  cusDistanceKm: "0",

  cusAddr1: "",
  cusAddr2: "",
  cusAddr3: "",
  cusCity: "",
  cusDistrict: "",
  cusCountry: "India",
  cusLandmark: "",
  cusPin: "",
  cusGeoLocation: "",

  cusCreditAllowed: "false",
  cusCreditBillLimit: "0",
  cusCreditAmtLimit: "0",
  cusCreditDays: "0",
  cusDebitBalance: "0",
  cusDiscPerc: "0",
  cusDebitGraceDays: "0",
  cusEnableSms: "false",
  cusOverdueSms: "false",
  cusOverdueBilling: "false",
  cusAllowPromotion: "false",
  cusAllowLoyalty: "false",
  cusAllowDiscount: "true",

  cusCollectionDays: "",

  cusGstNo: "",
  cusPanNo: "",
  cusGstType: "",
  cusEcommerceGstin: "",
  cusTcsApplicable: "false",
  cusItcollExempted: "false",
  cusItcollType: "",

  cusRegionName: "",
  cusRegionAddr1: "",
  cusRegionAddr2: "",
  cusRegionAddr3: "",
  cusRegionCity: "",
  cusRegionDistrict: "",
  cusRegionStateName: "",
  cusRegionCountry: "India",

  cusBirthDate: "",
  cusMarriageDate: "",
  cusBilledDate: "",
  cusBilledCount: "0",
  cusTransportName: "",
  cusFreightCharge: "false",
  cusLoadingCharge: "false",
  cusUnloadingCharge: "false",

  cusSortOrder: "0",
  cusIsActive: "true",
  cusNotes: "",
};

const CUSTOMER_MODAL_PANEL_STYLE: CSSProperties = {
  width: "min(62vw, 62rem)",
  maxHeight: "75vh",
};

function buildCustomerFormFields(
  stateOptions: ERPDynamicSelectOption[],
  areaOptions: ERPDynamicSelectOption[],
  groupOptions: ERPDynamicSelectOption[],
  companyOptions: ERPDynamicSelectOption[],
  branchOptions: ERPDynamicSelectOption[],
  priceLevelOptions: ERPDynamicSelectOption[],
): ERPDynamicModalField[] {
  return [
    {
      name: "scopeHeadingPrimary",
      label: "Primary details",
      type: "heading",
    },   
    {
      name: "cusGroupId",
      label: "Customer Group",
      type: "select",
      searchable: true,
      required: true,
      options: groupOptions,
      validation: {
        requiredMessage: "Customer Group is required.",
      },
    },
    {
      name: "cusAreaId",
      label: "Area",
      type: "select",
      searchable: true,
      required: true,
      options: areaOptions,
      validation: {
        requiredMessage: "Area is required.",
      },
    },   
    {
      name: "cusBranchId",
      label: "Branch",
      type: "select",
      searchable: true,
      options: branchOptions,
    },
    {
      name: "cusCompanyId",
      label: "Company",
      type: "select",
      searchable: true,
      options: companyOptions,
    },
       {
      name: "scopeHeadingBasic",
      label: "Basic details",
      type: "heading",
    },
   {
      name: "cusName",
      label: "Customer Name",
      required: true,
      validation: {
        minLength: 2,
        minLengthMessage: "Customer Name must be at least 2 characters.",
      },
    },
    {
      name: "cusCode",
      label: "Customer Code",
    },
    {
      name: "cusShort",
      label: "Short Name",
    },
    {
      name: "cusTitle",
      label: "Title",
    },    
    {
      name: "cusContactPerson",
      label: "Contact Person",
    },
    {
      name: "cusPhone1",
      label: "Phone 1",
      type: "tel",
    },
    {
      name: "cusPhone2",
      label: "Phone 2",
      type: "tel",
    },
    {
      name: "cusTel",
      label: "Tel",
      type: "tel",
    },
    {
      name: "cusWhatsappNo",
      label: "WhatsApp No",
      type: "tel",
    },
    {
      name: "cusEmail",
      label: "Email",
      type: "email",
    },
     {
      name: "cusPriceLevelId",
      label: "Price Level",
      type: "select",
      searchable: true,
      required: true,
      options: priceLevelOptions,
      validation: {
        requiredMessage: "Price Level is required.",
      },
    },

    {
      name: "cusDefaultSalesman",
      label: "Default Salesman Id (UUID)",
      validation: {
        pattern: "^[0-9a-fA-F-]{36}$",
        patternMessage: "Default Salesman Id must be a valid UUID.",
      },
    },
    {
      name: "cusAadharNo",
      label: "Aadhar No",
      validation: {
        pattern: "^[0-9]{12}$",
        patternMessage: "Aadhar must be 12 digits.",
      },
    },
    {
      name: "cusDistanceKm",
      label: "Distance (Km)",
      type: "number",
      min: 0,
      step: 1,
      validation: {
        minMessage: "Distance must be 0 or greater.",
      },
    },
    {
      name: "cusAddr1",
      label: "Address Line 1",
    },
    {
      name: "cusAddr2",
      label: "Address Line 2",
    },
    {
      name: "cusAddr3",
      label: "Address Line 3",
    },
    {
      name: "cusCity",
      label: "City",
    },
    {
      name: "cusDistrict",
      label: "District",
    },
    {
      name: "cusStateCode",
      label: "State",
      type: "select",
      searchable: true,
      required: true,
      options: stateOptions,
      validation: {
        requiredMessage: "State is required.",
      },
    },
    {
      name: "cusCountry",
      label: "Country",
    },
    {
      name: "cusLandmark",
      label: "Landmark",
    },
    {
      name: "cusPin",
      label: "PIN",
    },
    {
      name: "cusGeoLocation",
      label: "Geo Location",
    },
    {
      name: "creditHeading",
      label: "Credit Details",
      type: "heading",
    },
   
    {
      name: "cusCreditBillLimit",
      label: "Credit Bill Limit",
      type: "number",
      min: 0,
      step: 1,
      validation: {
        minMessage: "Credit Bill Limit must be 0 or greater.",
      },
    },
    {
      name: "cusCreditAmtLimit",
      label: "Credit Amount Limit",
      type: "number",
      min: 0,
      step: "0.01",
      validation: {
        minMessage: "Credit Amount Limit must be 0 or greater.",
      },
    },
    {
      name: "cusCreditDays",
      label: "Credit Days",
      type: "number",
      min: 0,
      step: 1,
      validation: {
        minMessage: "Credit Days must be 0 or greater.",
      },
    },
    {
      name: "cusDebitBalance",
      label: "Debit Balance",
      type: "number",
      min: 0,
      step: "0.01",
      validation: {
        minMessage: "Debit Balance must be 0 or greater.",
      },
    },
    {
      name: "cusDiscPerc",
      label: "Discount %",
      type: "number",
      min: 0,
      step: "0.001",
      validation: {
        minMessage: "Discount % must be 0 or greater.",
      },
    },
    {
      name: "cusDebitGraceDays",
      label: "Debit Grace Days",
      type: "number",
      min: 0,
      step: 1,
      validation: {
        minMessage: "Debit Grace Days must be 0 or greater.",
      },
    },
    {
      name: "cusCollectionDays",
      label: "Collection Days",
      helperText: "Comma-separated day numbers (example: 1,3,7).",
    },
    {
      name: "cusEnableSms",
      label: "Enable SMS",
      type: "checkbox",
    },
    {
      name: "cusOverdueSms",
      label: "Overdue SMS",
      type: "checkbox",
    },
    {
      name: "cusOverdueBilling",
      label: "Overdue Billing",
      type: "checkbox",
    },
    {
      name: "cusAllowPromotion",
      label: "Allow Promotion",
      type: "checkbox",
    },
    {
      name: "cusAllowLoyalty",
      label: "Allow Loyalty",
      type: "checkbox",
    },
     {
      name: "cusCreditAllowed",
      label: "Credit Allowed",
      type: "checkbox",
    },
    {
      name: "cusAllowDiscount",
      label: "Allow Discount",
      type: "checkbox",
    },

    {
      name: "taxHeading",
      label: "Tax Details",
      type: "heading",
    },
    {
      name: "cusGstNo",
      label: "GST No",
      validation: {
        maxLength: 15,
        maxLengthMessage: "GST No must be at most 15 characters.",
      },
    },
    {
      name: "cusPanNo",
      label: "PAN No",
      validation: {
        pattern: "^[A-Z]{5}[0-9]{4}[A-Z]{1}$",
        patternMessage: "PAN must be 10 characters (e.g., ABCDE1234F).",
      },
    },
    {
      name: "cusGstType",
      label: "GST Type",
    },
    {
      name: "cusEcommerceGstin",
      label: "Ecommerce GSTIN",
      validation: {
        maxLength: 15,
        maxLengthMessage: "Ecommerce GSTIN must be at most 15 characters.",
      },
    },
    {
      name: "cusTcsApplicable",
      label: "TCS Applicable",
      type: "checkbox",
    },
    {
      name: "cusItcollExempted",
      label: "IT Collection Exempted",
      type: "checkbox",
    },
    {
      name: "cusItcollType",
      label: "IT Collection Type",
    },

    {
      name: "regionHeading",
      label: "Region Details",
      type: "heading",
      defaultExpanded: false,
    },
    {
      name: "cusRegionName",
      label: "Region Name",
    },
    {
      name: "cusRegionAddr1",
      label: "Region Address 1",
    },
    {
      name: "cusRegionAddr2",
      label: "Region Address 2",
    },
    {
      name: "cusRegionAddr3",
      label: "Region Address 3",
    },
    {
      name: "cusRegionCity",
      label: "Region City",
    },
    {
      name: "cusRegionDistrict",
      label: "Region District",
    },
    {
      name: "cusRegionStateName",
      label: "Region State Name",
    },
    {
      name: "cusRegionCountry",
      label: "Region Country",
    },

    {
      name: "logisticsHeading",
      label: "Logistics Details",
      type: "heading",
    },
    {
      name: "cusBirthDate",
      label: "Birth Date",
      type: "date",
    },
    {
      name: "cusMarriageDate",
      label: "Marriage Date",
      type: "date",
    },
    {
      name: "cusBilledDate",
      label: "Billed Date",
      type: "date",
    },
    {
      name: "cusBilledCount",
      label: "Billed Count",
      type: "number",
      min: 0,
      step: 1,
      validation: {
        minMessage: "Billed Count must be 0 or greater.",
      },
    },
    {
      name: "cusTransportName",
      label: "Transport Name",
      colSpan: 1,
    },
    {
      name: "cusFreightCharge",
      label: "Freight Charge",
      type: "checkbox",
    },
    {
      name: "cusLoadingCharge",
      label: "Loading Charge",
      type: "checkbox",
    },
    {
      name: "cusUnloadingCharge",
      label: "Unloading Charge",
      type: "checkbox",
    },

    {
      name: "statusHeading",
      label: "Status and Notes",
      type: "heading",
    },
    {
      name: "cusSortOrder",
      label: "Sort Order",
      type: "number",
      min: 0,
      step: 1,
      validation: {
        minMessage: "Sort Order must be 0 or greater.",
      },
    },
    {
      name: "cusIsActive",
      label: "Is Active",
      type: "checkbox",
    },
    {
      name: "cusNotes",
      label: "Notes",
      colSpan: 2,
      rows: 3,
    },
  ];
}
function toSnakeCase(value: string): string {
  return value.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase();
}
function getFieldValue(source: Record<string, unknown>, fieldName: string): unknown {
  return getFirstDefinedValue(source, [fieldName, toSnakeCase(fieldName)]);
}
function toNullableInteger(value: string): number | null {
  const normalized = value.trim();
  if (!normalized) {
    return null;
  }
  const parsed = Number.parseInt(normalized, 10);
  if (!Number.isFinite(parsed)) {
    return null;
  }
  return parsed;
}
function toUpperNullable(value: string): string | null {
  const normalized = value.trim();
  return normalized ? normalized.toUpperCase() : null;
}
function parseCollectionDays(value: string): number[] {
  const normalized = value.trim();
  if (!normalized) {
    return [];
  }
  const parsedValues = normalized
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => Number.parseInt(entry, 10))
    .filter((entry) => Number.isInteger(entry) && entry >= 0);

  return Array.from(new Set(parsedValues));
}
function toCollectionDaysInput(value: unknown): string {
  if (!Array.isArray(value)) {
    return "";
  }
  const normalized = value
    .map((entry) => (typeof entry === "number" ? entry : Number(entry)))
    .filter((entry) => Number.isInteger(entry) && entry >= 0)
    .map((entry) => String(entry));

  return Array.from(new Set(normalized)).join(",");
}
function buildStateLookupData(payload: unknown): {
  options: ERPDynamicSelectOption[];
  stateNameByCode: Record<string, string>;
  stateCodeByName: Record<string, string>;
} {
  const codeToName = new Map<string, string>();
  const rows = extractRows(payload, STATE_LOOKUP_KEYS.array);
  for (const row of rows) {
    if (!row || typeof row !== "object" || Array.isArray(row)) {
      continue;
    }
    const source = row as Record<string, unknown>;
    const stateCode = toDisplayValue(getFirstDefinedValue(source, STATE_LOOKUP_KEYS.code))
      .trim()
      .toUpperCase();
    const stateName = toDisplayValue(getFirstDefinedValue(source, STATE_LOOKUP_KEYS.name));
    if (!stateCode || !stateName) {
      continue;
    }
    if (!codeToName.has(stateCode)) {
      codeToName.set(stateCode, stateName);
    }
  }
  const options = Array.from(codeToName.entries())
    .map(([value, name]) => ({
      value,
      label: `${name} (${value})`,
    }))
    .sort((left, right) => left.label.localeCompare(right.label));
  const stateNameByCode: Record<string, string> = {};
  const stateCodeByName: Record<string, string> = {};
  for (const [code, name] of codeToName.entries()) {
    stateNameByCode[code] = name;
    if (!(name in stateCodeByName)) {
      stateCodeByName[name] = code;
    }
  }
  return {
    options: [DEFAULT_STATE_OPTION, ...options],
    stateNameByCode,
    stateCodeByName,
  };
}
export default function CustomerPage() {
  const { getAll: getStateLookup } = useApi<unknown>(STATE_LOOKUP_ENDPOINT);
  const { getAll: getAreaLookup } = useApi<unknown>(AREA_LOOKUP_ENDPOINT);
  const { getAll: getCustomerGroupLookup } = useApi<unknown>(CUSTOMER_GROUP_LOOKUP_ENDPOINT);
  const { getAll: getCompanyLookup } = useApi<unknown>(COMPANY_LOOKUP_ENDPOINT);
  const { getAll: getBranchLookup } = useApi<unknown>(BRANCH_LOOKUP_ENDPOINT);
  const { getAll: getPriceLevelLookup } = useApi<unknown>(PRICE_LEVEL_LOOKUP_ENDPOINT);
  const [stateOptions, setStateOptions] = useState<ERPDynamicSelectOption[]>([DEFAULT_STATE_OPTION]);
  const [areaOptions, setAreaOptions] = useState<ERPDynamicSelectOption[]>([DEFAULT_AREA_OPTION]);
  const [groupOptions, setGroupOptions] = useState<ERPDynamicSelectOption[]>([DEFAULT_GROUP_OPTION]);
  const [companyOptions, setCompanyOptions] = useState<ERPDynamicSelectOption[]>([
    DEFAULT_COMPANY_OPTION,
  ]);
  const [branchOptions, setBranchOptions] = useState<ERPDynamicSelectOption[]>([DEFAULT_BRANCH_OPTION]);
  const [priceLevelOptions, setPriceLevelOptions] = useState<ERPDynamicSelectOption[]>([
    DEFAULT_PRICE_LEVEL_OPTION,
  ]);
  const [stateNameByCode, setStateNameByCode] = useState<Record<string, string>>({});
  const [stateCodeByName, setStateCodeByName] = useState<Record<string, string>>({});
  useEffect(() => {
    let mounted = true;
    void (async () => {
      try {
        const [statePayload, areaPayload, groupPayload, companyPayload, branchPayload, priceLevelPayload] =
          await Promise.all([
            getStateLookup(LOOKUP_REQUEST_QUERY),
            getAreaLookup(LOOKUP_REQUEST_QUERY),
            getCustomerGroupLookup(LOOKUP_REQUEST_QUERY),
            getCompanyLookup(COMPANY_LOOKUP_REQUEST_QUERY),
            getBranchLookup(BRANCH_LOOKUP_REQUEST_QUERY),
            getPriceLevelLookup(PRICE_LEVEL_LOOKUP_REQUEST_QUERY),
          ]);
        if (!mounted) {
          return;
        }
        const stateLookupData = buildStateLookupData(statePayload);
        setStateOptions(stateLookupData.options);
        setStateNameByCode(stateLookupData.stateNameByCode);
        setStateCodeByName(stateLookupData.stateCodeByName);
        setAreaOptions(
          buildLookupOptions(areaPayload, DEFAULT_AREA_OPTION, {
            arrayKeys: [...DEFAULT_LOOKUP_ARRAY_KEYS, "areas"],
            idKeys: ["armId", "arm_id", "area_id", "areaId", "id", "_id", "value"],
            labelKeys: ["armName", "arm_name", "area_name", "areaName", "name", "label"],
          }),
        );
        setGroupOptions(
          buildLookupOptions(groupPayload, DEFAULT_GROUP_OPTION, {
            arrayKeys: [...DEFAULT_LOOKUP_ARRAY_KEYS, "customerGroups", "customer_groups"],
            idKeys: ["cgrId", "cgr_id", "group_id", "groupId", "id", "_id", "value"],
            labelKeys: ["cgrName", "cgr_name", "group_name", "groupName", "name", "label"],
          }),
        );
        setCompanyOptions(
          buildLookupOptions(companyPayload, DEFAULT_COMPANY_OPTION, {
            arrayKeys: [...DEFAULT_LOOKUP_ARRAY_KEYS, "companies", "companys"],
            idKeys: ["compId", "comp_id", "company_id", "companyId", "id", "_id", "value"],
            labelKeys: ["compName", "comp_name", "company_name", "companyName", "name", "label"],
          }),
        );
        setBranchOptions(
          buildLookupOptions(branchPayload, DEFAULT_BRANCH_OPTION, {
            arrayKeys: [...DEFAULT_LOOKUP_ARRAY_KEYS, "branches", "branch_masters"],
            idKeys: ["brId", "br_id", "branch_id", "branchId", "id", "_id", "value"],
            labelKeys: ["brName", "br_name", "branch_name", "branchName", "name", "label"],
          }),
        );
        setPriceLevelOptions(
          buildLookupOptions(priceLevelPayload, DEFAULT_PRICE_LEVEL_OPTION, {
            arrayKeys: [...DEFAULT_LOOKUP_ARRAY_KEYS, "priceLevels", "price_levels"],
            idKeys: ["priceLvlId", "price_lvl_id", "id", "value"],
            labelKeys: ["priceLvlName", "price_lvl_name", "name", "label"],
          }),
        );
      } catch {
        if (!mounted) {
          return;
        }
        setStateOptions([DEFAULT_STATE_OPTION]);
        setStateNameByCode({});
        setStateCodeByName({});
        setAreaOptions([DEFAULT_AREA_OPTION]);
        setGroupOptions([DEFAULT_GROUP_OPTION]);
        setCompanyOptions([DEFAULT_COMPANY_OPTION]);
        setBranchOptions([DEFAULT_BRANCH_OPTION]);
        setPriceLevelOptions([DEFAULT_PRICE_LEVEL_OPTION]);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [
    getAreaLookup,
    getBranchLookup,
    getCompanyLookup,
    getCustomerGroupLookup,
    getPriceLevelLookup,
    getStateLookup,
  ]);
  const customerFormFields = useMemo(
    () =>
      buildCustomerFormFields(
        stateOptions,
        areaOptions,
        groupOptions,
        companyOptions,
        branchOptions,
        priceLevelOptions,
      ),
    [areaOptions, branchOptions, companyOptions, groupOptions, priceLevelOptions, stateOptions],
  );
  return (
    <CrudMasterPage
      title="Customer"
      entityLabel="customer"
      entityLabelPlural="customers"
      apiEndpoints={API_ENDPOINTS}
      gridTableName={GRID_TABLE_NAME}
      lookupKeys={LOOKUP_KEYS}
      requestPayloadKeys={REQUEST_PAYLOAD_KEYS}
      styles={styles}
      listTitle="Customer List"
      createLabel="Add Customer"
      codeColumnHeader="Customer Code"
      nameColumnHeader="Customer Name"
      formTitle="Customer Form"
      formDescription="Create and update customers."
      customFields={customerFormFields}
      createInitialValues={CUSTOMER_INITIAL_FORM_VALUES}
      modalPanelStyle={CUSTOMER_MODAL_PANEL_STYLE}
      modalFormGridColumns={3}
      modalStackLabels
      mapFormValues={({ source, defaults }) => {
        const rowSource = source ?? {};
        const mappedValues: Record<string, string> = {
          ...CUSTOMER_INITIAL_FORM_VALUES,
        };
        for (const fieldName of CUSTOMER_TEXT_FIELD_NAMES) {
          const value = toDisplayValue(getFieldValue(rowSource, fieldName));
          mappedValues[fieldName] = value || CUSTOMER_INITIAL_FORM_VALUES[fieldName];
        }
        for (const fieldName of CUSTOMER_BOOLEAN_FIELD_NAMES) {
          const fallback =
            CUSTOMER_INITIAL_FORM_VALUES[fieldName] === "true" ? "true" : "false";
          mappedValues[fieldName] = toSelectBoolean(
            getFieldValue(rowSource, fieldName),
            fallback,
          );
        }
        for (const fieldName of CUSTOMER_DATE_FIELD_NAMES) {
          mappedValues[fieldName] = toDateInputValue(getFieldValue(rowSource, fieldName));
        }
        const stateCode = toUpper(
          toDisplayValue(getFieldValue(rowSource, "cusStateCode")),
        );
        const stateName = toDisplayValue(getFieldValue(rowSource, "cusStateName"));
        mappedValues.cusStateCode =
          stateCode || stateCodeByName[stateName] || CUSTOMER_INITIAL_FORM_VALUES.cusStateCode;
        mappedValues.cusCollectionDays = toCollectionDaysInput(
          getFieldValue(rowSource, "cusCollectionDays"),
        );
        mappedValues.cusName =
          toDisplayValue(getFieldValue(rowSource, "cusName")) ||
          toDisplayValue(getFirstDefinedValue(rowSource, LOOKUP_KEYS.name)) ||
          defaults.masterName ||
          CUSTOMER_INITIAL_FORM_VALUES.cusName;
        mappedValues.cusCode =
          toDisplayValue(getFieldValue(rowSource, "cusCode")) ||
          toDisplayValue(getFirstDefinedValue(rowSource, LOOKUP_KEYS.code)) ||
          defaults.searchCode ||
          CUSTOMER_INITIAL_FORM_VALUES.cusCode;
        mappedValues.cusShort =
          toDisplayValue(getFieldValue(rowSource, "cusShort")) ||
          toDisplayValue(getFirstDefinedValue(rowSource, LOOKUP_KEYS.short)) ||
          defaults.masterShortName ||
          CUSTOMER_INITIAL_FORM_VALUES.cusShort;
        mappedValues.cusSortOrder =
          toDisplayValue(getFieldValue(rowSource, "cusSortOrder")) ||
          toDisplayValue(getFirstDefinedValue(rowSource, LOOKUP_KEYS.position)) ||
          defaults.position ||
          CUSTOMER_INITIAL_FORM_VALUES.cusSortOrder;
        mappedValues.cusNotes =
          toDisplayValue(getFieldValue(rowSource, "cusNotes")) ||
          toDisplayValue(getFirstDefinedValue(rowSource, LOOKUP_KEYS.description)) ||
          defaults.masterDescription ||
          CUSTOMER_INITIAL_FORM_VALUES.cusNotes;
        return mappedValues;
      }}
      buildRequestPayload={({ values, shouldUpdate, editingItemId }) => {
        const cusStateCode = toUpper(values.cusStateCode ?? "");
        const cusStateName = stateNameByCode[cusStateCode] ?? "";
        const payload: Record<string, unknown> = {
          cusTitle: toNullableString(values.cusTitle ?? ""),
          cusShort: toNullableString(values.cusShort ?? ""),
          cusCode: toNullableString(values.cusCode ?? ""),
          cusName: toNullableString(values.cusName ?? ""),
          cusAddr1: toNullableString(values.cusAddr1 ?? ""),
          cusAddr2: toNullableString(values.cusAddr2 ?? ""),
          cusAddr3: toNullableString(values.cusAddr3 ?? ""),
          cusCity: toNullableString(values.cusCity ?? ""),
          cusDistrict: toNullableString(values.cusDistrict ?? ""),
          cusStateName,
          cusCountry: toNullableString(values.cusCountry ?? ""),
          cusStateCode,
          cusLandmark: toNullableString(values.cusLandmark ?? ""),
          cusPin: toNullableString(values.cusPin ?? ""),
          cusTel: toNullableString(values.cusTel ?? ""),
          cusPhone1: toNullableString(values.cusPhone1 ?? ""),
          cusPhone2: toNullableString(values.cusPhone2 ?? ""),
          cusWhatsappNo: toNullableString(values.cusWhatsappNo ?? ""),
          cusEmail: toNullableString(values.cusEmail ?? ""),
          cusAadharNo: toNullableString(values.cusAadharNo ?? ""),
          cusContactPerson: toNullableString(values.cusContactPerson ?? ""),
          cusDistanceKm: toNullableInteger(values.cusDistanceKm ?? ""),
          cusCreditAllowed: (values.cusCreditAllowed ?? "false") === "true",
          cusCreditBillLimit: toNonNegativeInteger(values.cusCreditBillLimit ?? "0", 0),
          cusCreditAmtLimit: toNonNegativeNumber(values.cusCreditAmtLimit ?? "0", 0),
          cusCreditDays: toNonNegativeInteger(values.cusCreditDays ?? "0", 0),
          cusDebitBalance: toNonNegativeNumber(values.cusDebitBalance ?? "0", 0),
          cusDiscPerc: toNonNegativeNumber(values.cusDiscPerc ?? "0", 0),
          cusDebitGraceDays: toNonNegativeInteger(values.cusDebitGraceDays ?? "0", 0),
          cusEnableSms: (values.cusEnableSms ?? "false") === "true",
          cusOverdueSms: (values.cusOverdueSms ?? "false") === "true",
          cusOverdueBilling: (values.cusOverdueBilling ?? "false") === "true",
          cusAllowPromotion: (values.cusAllowPromotion ?? "false") === "true",
          cusAllowLoyalty: (values.cusAllowLoyalty ?? "false") === "true",
          cusAllowDiscount: (values.cusAllowDiscount ?? "true") === "true",
          cusSortOrder: toNonNegativeInteger(values.cusSortOrder ?? "0", 0),
          cusRegionName: toNullableString(values.cusRegionName ?? ""),
          cusRegionAddr1: toNullableString(values.cusRegionAddr1 ?? ""),
          cusRegionAddr2: toNullableString(values.cusRegionAddr2 ?? ""),
          cusRegionAddr3: toNullableString(values.cusRegionAddr3 ?? ""),
          cusRegionCity: toNullableString(values.cusRegionCity ?? ""),
          cusRegionDistrict: toNullableString(values.cusRegionDistrict ?? ""),
          cusRegionStateName: toNullableString(values.cusRegionStateName ?? ""),
          cusRegionCountry: toNullableString(values.cusRegionCountry ?? ""),
          cusBirthDate: toNullableDate(values.cusBirthDate ?? ""),
          cusMarriageDate: toNullableDate(values.cusMarriageDate ?? ""),
          cusTransportName: toNullableString(values.cusTransportName ?? ""),
          cusFreightCharge: (values.cusFreightCharge ?? "false") === "true",
          cusLoadingCharge: (values.cusLoadingCharge ?? "false") === "true",
          cusUnloadingCharge: (values.cusUnloadingCharge ?? "false") === "true",
          cusGstNo: toUpperNullable(values.cusGstNo ?? ""),
          cusPanNo: toUpperNullable(values.cusPanNo ?? ""),
          cusGstType: toNullableString(values.cusGstType ?? ""),
          cusEcommerceGstin: toUpperNullable(values.cusEcommerceGstin ?? ""),
          cusTcsApplicable: (values.cusTcsApplicable ?? "false") === "true",
          cusItcollExempted: (values.cusItcollExempted ?? "false") === "true",
          cusItcollType: toNullableString(values.cusItcollType ?? ""),
          cusGeoLocation: toNullableString(values.cusGeoLocation ?? ""),
          cusCollectionDays: parseCollectionDays(values.cusCollectionDays ?? ""),
          cusDefaultSalesman: toNullableString(values.cusDefaultSalesman ?? ""),
          cusPriceLevelId: toNonNegativeInteger(values.cusPriceLevelId ?? "0", 0),
          cusBilledDate: toNullableDate(values.cusBilledDate ?? ""),
          cusBilledCount: toNonNegativeInteger(values.cusBilledCount ?? "0", 0),
          cusNotes: toNullableString(values.cusNotes ?? ""),
          cusCompanyId: toNullableString(values.cusCompanyId ?? ""),
          cusBranchId: toNullableString(values.cusBranchId ?? ""),
          cusAreaId: (values.cusAreaId ?? "").trim(),
          cusGroupId: (values.cusGroupId ?? "").trim(),
          cusIsActive: (values.cusIsActive ?? "true") === "true",
        };

        if (shouldUpdate && editingItemId !== null) {
          payload.cusId = toUpdateId(editingItemId);
        }

        return payload;
      }}
    />
  );
}
