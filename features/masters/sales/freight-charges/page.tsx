"use client";
import { useEffect, useState } from "react";
import CrudMasterPage from "@/components/master/crud-master-page";
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
  toNonNegativeInteger,
  toNonNegativeNumber,
  toNullableString,
  toSelectBoolean,
  toUpdateId,
  DEFAULT_LOOKUP_ARRAY_KEYS,
} from "@/app/master/_shared/crud-utils";

const GRID_DETAIL_ID = 74;
const API_ENDPOINTS = {
  list: `/configured-grid-sql/run?grid_id=${GRID_DETAIL_ID}`,
  getById: "/sale-freight-charges/get",
  create: "/sale-freight-charges/create",
  delete: "/sale-freight-charges/delete",
} as const;
const GRID_TABLE_NAME = "sale_freight_charges";

const LOOKUP_ENDPOINT = "/master-lookups/name-id/all-masters";
const LOOKUP_QUERY_COMPANIES = { module: "companies" } as const;
const LOOKUP_QUERY_BRANCHES = { module: "branches" } as const;

const LOOKUP_KEYS = {
  id: ["frId", "fr_id", "id", "_id"],
  // This entity has no natural code/short/alias field; these map to the most
  // identifying numeric columns purely so the delete-confirmation fallback
  // chain (masterName || masterCode || masterId) and the defensive
  // fallback table (used only if the grid-columns config fetch fails) show
  // something meaningful instead of a blank cell.
  code: ["fr_from_km", "frFromKm", "code"],
  short: ["fr_to_km", "frToKm", "short"],
  alias: ["fr_freight_chrg", "frFreightChrg", "alias"],
  // Grid 74 (FREIGHT CHARGES MAIN LIST) lists Branch before Company, and both
  // SQL aliases end in "_name" — CrudMasterPage's grid-column accessor
  // heuristic assigns the first-encountered "_name" column to the masterName
  // slot. List br_name first so the Branch column (not just Company) renders.
  name: ["br_name", "comp_name", "frBranchName", "frCompanyName", "name"],
  active: ["frIsActive", "fr_is_active", "isActive", "is_active", "active", "status"],
  array: [
    "data",
    "items",
    "results",
    "rows",
    "list",
    "saleFreightCharges",
    "sale_freight_charges",
  ],
} as const;
// requestPayloadKeys.id is load-bearing (used as the literal getById/delete
// query-param name); the rest are only consumed by CrudMasterPage's default
// buildRequestPayload, which this page overrides, so they're inert filler.
const REQUEST_PAYLOAD_KEYS = {
  id: "frId",
  name: "frFreightChrg",
  alias: "frFromKm",
  short: "frToKm",
  description: "frFreightChrg",
  sort: "frFromKm",
} as const;

const FR_COMPANY_ID_KEYS = ["frCompanyId", "fr_company_id"] as const;
const FR_BRANCH_ID_KEYS = ["frBranchId", "fr_branch_id"] as const;
const FR_FROM_KM_KEYS = ["frFromKm", "fr_from_km"] as const;
const FR_TO_KM_KEYS = ["frToKm", "fr_to_km"] as const;
const FR_FROM_WEIGHT_KEYS = ["frFromWeight", "fr_from_weight"] as const;
const FR_TO_WEIGHT_KEYS = ["frToWeight", "fr_to_weight"] as const;
const FR_FREIGHT_CHRG_KEYS = ["frFreightChrg", "fr_freight_chrg"] as const;
const FR_IS_ACTIVE_KEYS = ["frIsActive", "fr_is_active", "isActive", "is_active", "status"] as const;

const DEFAULT_COMPANY_OPTION: ERPDynamicSelectOption = { value: "", label: "None" };
const DEFAULT_BRANCH_OPTION: ERPDynamicSelectOption = { value: "", label: "None" };

const FREIGHT_INITIAL_FORM_VALUES = {
  frCompanyId: "",
  frBranchId: "",
  frFromKm: "",
  frToKm: "",
  frFromWeight: "",
  frToWeight: "",
  frFreightChrg: "",
  frIsActive: "true",
} as const;

function buildFreightChargeFormFields(
  companyOptions: ERPDynamicSelectOption[],
  branchOptions: ERPDynamicSelectOption[],
): ERPDynamicModalField[] {
  return [
    { name: "__subheading_company_branch", label: "Company / Branch", type: "subheading" },
    {
      name: "frCompanyId",
      label: "Company",
      type: "select",
      searchable: true,
      options: companyOptions,
      placeholder: "Search company",
    },
    {
      name: "frBranchId",
      label: "Branch",
      type: "select",
      searchable: true,
      options: branchOptions,
      placeholder: "Search branch",
    },
    { name: "__subheading_distance_slab", label: "Distance Slab (Km)", type: "subheading" },
    {
      name: "frFromKm",
      label: "From Km",
      type: "number",
      required: true,
      min: 0,
      step: 1,
      validation: { minMessage: "From Km must be 0 or greater." },
    },
    {
      name: "frToKm",
      label: "To Km",
      type: "number",
      required: true,
      min: 0,
      step: 1,
      validation: { minMessage: "To Km must be 0 or greater." },
    },
    { name: "__subheading_weight_slab", label: "Weight Slab", type: "subheading" },
    {
      name: "frFromWeight",
      label: "From Weight (Kg)",
      type: "number",
      required: true,
      min: 0,
      step: "0.01",
      validation: { minMessage: "From Weight must be 0 or greater." },
    },
    {
      name: "frToWeight",
      label: "To Weight (Kg)",
      type: "number",
      required: true,
      min: 0,
      step: "0.01",
      validation: { minMessage: "To Weight must be 0 or greater." },
    },
    { name: "__subheading_charges", label: "Charges", type: "subheading" },
    {
      name: "frFreightChrg",
      label: "Freight Charge",
      type: "number",
      required: true,
      min: 0,
      step: "0.01",
      validation: { minMessage: "Freight Charge must be 0 or greater." },
    },
    { name: "__subheading_status", label: "Status", type: "subheading" },
    {
      name: "frIsActive",
      label: "Active",
      type: "checkbox",
    },
  ];
}

function getFreightDisplayName(source: Record<string, unknown> | null): string {
  const fromKm = source ? toDisplayValue(getFirstDefinedValue(source, FR_FROM_KM_KEYS)) : "";
  const toKm = source ? toDisplayValue(getFirstDefinedValue(source, FR_TO_KM_KEYS)) : "";
  return `FR-${fromKm || "0"}-${toKm || "0"}`;
}

export default function FreightChargesMasterPage() {
  const { getAll: getCompanyLookup } = useApi<unknown>(LOOKUP_ENDPOINT);
  const { getAll: getBranchLookup } = useApi<unknown>(LOOKUP_ENDPOINT);
  const [companyOptions, setCompanyOptions] = useState<ERPDynamicSelectOption[]>([
    DEFAULT_COMPANY_OPTION,
  ]);
  const [branchOptions, setBranchOptions] = useState<ERPDynamicSelectOption[]>([
    DEFAULT_BRANCH_OPTION,
  ]);

  useEffect(() => {
    let mounted = true;
    void (async () => {
      try {
        const [companiesPayload, branchesPayload] = await Promise.all([
          getCompanyLookup(LOOKUP_QUERY_COMPANIES),
          getBranchLookup(LOOKUP_QUERY_BRANCHES),
        ]);
        if (!mounted) {
          return;
        }
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
        if (!mounted) {
          return;
        }
        setCompanyOptions([DEFAULT_COMPANY_OPTION]);
        setBranchOptions([DEFAULT_BRANCH_OPTION]);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [getCompanyLookup, getBranchLookup]);

  const formFields = buildFreightChargeFormFields(companyOptions, branchOptions);

  return (
    <CrudMasterPage
      title="Freight Charges"
      auditHistory={{
        screenName: "Sale Freight Charges",
        getDisplayName: (row) => getFreightDisplayName(row.__source),
      }}
      entityLabel="freight charge"
      entityLabelPlural="freight charges"
      apiEndpoints={API_ENDPOINTS}
      gridTableName={GRID_TABLE_NAME}
      gridDetailId={GRID_DETAIL_ID}
      listResponseStyleArrayKey=""
      lookupKeys={LOOKUP_KEYS}
      requestPayloadKeys={REQUEST_PAYLOAD_KEYS}
      styles={styles}
      listTitle="Freight Charges List"
      listTitleOverride="Freight Charges List"
      createLabel="Add Freight Charge"
      codeColumnHeader="From Km"
      nameColumnHeader="Branch"
      formTitle="Freight Charge Form"
      formDescription="Create and update vehicle freight charge slabs."
      createModalTitle="Freight Charge Entry"
      editModalTitle="Edit Freight Charge Entry"
      modalFormGridColumns={1}
      modalPanelStyle={{ width: "min(30rem, calc(calc(100vw/var(--erp-ui-scale)) - 2rem))" }}
      customFields={formFields}
      createInitialValues={FREIGHT_INITIAL_FORM_VALUES}
      mapFormValues={({ source }) => {
        const rowSource = source ?? {};
        return {
          ...FREIGHT_INITIAL_FORM_VALUES,
          frCompanyId: toDisplayValue(getFirstDefinedValue(rowSource, FR_COMPANY_ID_KEYS)),
          frBranchId: toDisplayValue(getFirstDefinedValue(rowSource, FR_BRANCH_ID_KEYS)),
          frFromKm: toDisplayValue(getFirstDefinedValue(rowSource, FR_FROM_KM_KEYS)),
          frToKm: toDisplayValue(getFirstDefinedValue(rowSource, FR_TO_KM_KEYS)),
          frFromWeight: toDisplayValue(getFirstDefinedValue(rowSource, FR_FROM_WEIGHT_KEYS)),
          frToWeight: toDisplayValue(getFirstDefinedValue(rowSource, FR_TO_WEIGHT_KEYS)),
          frFreightChrg: toDisplayValue(getFirstDefinedValue(rowSource, FR_FREIGHT_CHRG_KEYS)),
          frIsActive: toSelectBoolean(getFirstDefinedValue(rowSource, FR_IS_ACTIVE_KEYS), "true"),
        };
      }}
      buildRequestPayload={({ values, shouldUpdate, editingItemId }) => ({
        frCompanyId: toNullableString(values.frCompanyId ?? ""),
        frBranchId: toNullableString(values.frBranchId ?? ""),
        frFromKm: toNonNegativeInteger(values.frFromKm ?? "0", 0),
        frToKm: toNonNegativeInteger(values.frToKm ?? "0", 0),
        frFromWeight: toNonNegativeNumber(values.frFromWeight ?? "0", 0),
        frToWeight: toNonNegativeNumber(values.frToWeight ?? "0", 0),
        frFreightChrg: toNonNegativeNumber(values.frFreightChrg ?? "0", 0),
        frIsActive: (values.frIsActive ?? "true") !== "false",
        ...(shouldUpdate && editingItemId !== null ? { frId: toUpdateId(editingItemId) } : {}),
      })}
    />
  );
}
