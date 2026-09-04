"use client";
import { useCallback, useEffect, useState } from "react";
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
  toNonNegativeNumber,
  toNullableString,
  toSelectBoolean,
  toUpdateId,
  DEFAULT_LOOKUP_ARRAY_KEYS,
} from "@/app/master/_shared/crud-utils";
import { useDataRefresh } from "@/lib/data-freshness";

const GRID_DETAIL_ID = 76;
const API_ENDPOINTS = {
  list: `/configured-grid-sql/run?grid_id=${GRID_DETAIL_ID}`,
  getById: "/sale-loading-charges/get",
  create: "/sale-loading-charges/create",
  delete: "/sale-loading-charges/delete",
} as const;
const GRID_TABLE_NAME = "sale_loading_charges";

const LOOKUP_ENDPOINT = "/master-lookups/name-id/all-masters";
const LOOKUP_QUERY_COMPANIES = { module: "companies" } as const;
const LOOKUP_QUERY_BRANCHES = { module: "branches" } as const;

const LOOKUP_KEYS = {
  id: ["ilcId", "ilc_id", "id", "_id"],
  // This entity has no natural code/short/alias field; these map to the most
  // identifying numeric columns purely so the delete-confirmation fallback
  // chain (masterName || masterCode || masterId) and the defensive
  // fallback table (used only if the grid-columns config fetch fails) show
  // something meaningful instead of a blank cell.
  code: ["ilc_from_weight", "ilcFromWeight", "code"],
  short: ["ilc_to_weight", "ilcToWeight", "short"],
  alias: ["ilc_load_chrg", "ilcLoadChrg", "alias"],
  // Grid 76 (LOADING CHARGES MAIN LIST) lists Company before Branch, and both
  // SQL aliases end in "_name" — CrudMasterPage's grid-column accessor
  // heuristic assigns the first-encountered "_name" column to the masterName
  // slot. List comp_name first so the Company column (not just Branch) renders.
  name: ["comp_name", "br_name", "ilcCompanyName", "ilcBranchName", "name"],
  active: ["ilcIsActive", "ilc_is_active", "isActive", "is_active", "active", "status"],
  array: [
    "data",
    "items",
    "results",
    "rows",
    "list",
    "saleLoadingCharges",
    "sale_loading_charges",
  ],
} as const;
// requestPayloadKeys.id is load-bearing (used as the literal getById/delete
// query-param name); the rest are only consumed by CrudMasterPage's default
// buildRequestPayload, which this page overrides, so they're inert filler.
const REQUEST_PAYLOAD_KEYS = {
  id: "ilcId",
  name: "ilcLoadChrg",
  alias: "ilcFromWeight",
  short: "ilcToWeight",
  description: "ilcLoadChrg",
  sort: "ilcFromWeight",
} as const;

const ILC_COMP_ID_KEYS = ["ilcCompId", "ilc_comp_id"] as const;
const ILC_BRANCH_ID_KEYS = ["ilcBranchId", "ilc_branch_id"] as const;
const ILC_FROM_WEIGHT_KEYS = ["ilcFromWeight", "ilc_from_weight"] as const;
const ILC_TO_WEIGHT_KEYS = ["ilcToWeight", "ilc_to_weight"] as const;
const ILC_LOAD_CHRG_KEYS = ["ilcLoadChrg", "ilc_load_chrg"] as const;
const ILC_UNLOAD_CHRG_KEYS = ["ilcUnloadChrg", "ilc_unload_chrg"] as const;
const ILC_IS_ACTIVE_KEYS = ["ilcIsActive", "ilc_is_active", "isActive", "is_active", "status"] as const;

const DEFAULT_COMPANY_OPTION: ERPDynamicSelectOption = { value: "", label: "None" };
const DEFAULT_BRANCH_OPTION: ERPDynamicSelectOption = { value: "", label: "None" };

const LOADING_INITIAL_FORM_VALUES = {
  ilcCompId: "",
  ilcBranchId: "",
  ilcFromWeight: "",
  ilcToWeight: "",
  ilcLoadChrg: "",
  ilcUnloadChrg: "",
  ilcIsActive: "true",
} as const;

function buildLoadingChargeFormFields(
  companyOptions: ERPDynamicSelectOption[],
  branchOptions: ERPDynamicSelectOption[],
): ERPDynamicModalField[] {
  return [
    { name: "__subheading_company_branch", label: "Company / Branch", type: "subheading" },
    {
      name: "ilcCompId",
      label: "Company",
      type: "select",
      searchable: true,
      options: companyOptions,
      placeholder: "Search company",
    },
    {
      name: "ilcBranchId",
      label: "Branch",
      type: "select",
      searchable: true,
      options: branchOptions,
      placeholder: "Search branch",
    },
    { name: "__subheading_weight_slab", label: "Weight Slab", type: "subheading" },
    {
      name: "ilcFromWeight",
      label: "From Weight (Kg)",
      type: "number",
      required: true,
      min: 0,
      step: "0.01",
      validation: { minMessage: "From Weight must be 0 or greater." },
    },
    {
      name: "ilcToWeight",
      label: "To Weight (Kg)",
      type: "number",
      required: true,
      min: 0,
      step: "0.01",
      validation: { minMessage: "To Weight must be 0 or greater." },
    },
    { name: "__subheading_charges", label: "Charges", type: "subheading" },
    {
      name: "ilcLoadChrg",
      label: "Loading Charge",
      type: "number",
      required: true,
      min: 0,
      step: "0.01",
      validation: { minMessage: "Loading Charge must be 0 or greater." },
    },
    {
      name: "ilcUnloadChrg",
      label: "Unloading Charge",
      type: "number",
      required: true,
      min: 0,
      step: "0.01",
      validation: { minMessage: "Unloading Charge must be 0 or greater." },
    },
    { name: "__subheading_status", label: "Status", type: "subheading" },
    {
      name: "ilcIsActive",
      label: "Active",
      type: "checkbox",
    },
  ];
}

function getLoadingChargeDisplayName(source: Record<string, unknown> | null): string {
  const fromWeight = source ? toDisplayValue(getFirstDefinedValue(source, ILC_FROM_WEIGHT_KEYS)) : "";
  const toWeight = source ? toDisplayValue(getFirstDefinedValue(source, ILC_TO_WEIGHT_KEYS)) : "";
  return `ILC-${fromWeight || "0"}-${toWeight || "0"}`;
}

export default function LoadingChargesMasterPage() {
  const { getAll: getCompanyLookup } = useApi<unknown>(LOOKUP_ENDPOINT);
  const { getAll: getBranchLookup } = useApi<unknown>(LOOKUP_ENDPOINT);
  const [companyOptions, setCompanyOptions] = useState<ERPDynamicSelectOption[]>([
    DEFAULT_COMPANY_OPTION,
  ]);
  const [branchOptions, setBranchOptions] = useState<ERPDynamicSelectOption[]>([
    DEFAULT_BRANCH_OPTION,
  ]);

  // Lookup options come from master tables that other users and other screens
  // change, so they are re-read on every data-refresh signal, not just on mount.
  const loadLookupOptions = useCallback(() => {
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
  useEffect(() => loadLookupOptions(), [loadLookupOptions]);
  useDataRefresh(() => {
    loadLookupOptions();
  });

  const formFields = buildLoadingChargeFormFields(companyOptions, branchOptions);

  return (
    <CrudMasterPage
      title="Loading Charges"
      auditHistory={{
        screenName: "Sale Loading Charges",
        getDisplayName: (row) => getLoadingChargeDisplayName(row.__source),
      }}
      entityLabel="loading charge"
      entityLabelPlural="loading charges"
      apiEndpoints={API_ENDPOINTS}
      gridTableName={GRID_TABLE_NAME}
      gridDetailId={GRID_DETAIL_ID}
      listResponseStyleArrayKey=""
      lookupKeys={LOOKUP_KEYS}
      requestPayloadKeys={REQUEST_PAYLOAD_KEYS}
      styles={styles}
      listTitle="Loading Charges List"
      listTitleOverride="Loading Charges List"
      createLabel="Add Loading Charge"
      codeColumnHeader="From Weight"
      nameColumnHeader="Company"
      formTitle="Loading Charge Form"
      formDescription="Create and update loading/unloading charge slabs."
      createModalTitle="Loading Charge Entry"
      editModalTitle="Edit Loading Charge Entry"
      modalFormGridColumns={1}
      modalPanelStyle={{ width: "min(30rem, calc(calc(100vw/var(--erp-ui-scale)) - 2rem))" }}
      customFields={formFields}
      createInitialValues={LOADING_INITIAL_FORM_VALUES}
      mapFormValues={({ source }) => {
        const rowSource = source ?? {};
        return {
          ...LOADING_INITIAL_FORM_VALUES,
          ilcCompId: toDisplayValue(getFirstDefinedValue(rowSource, ILC_COMP_ID_KEYS)),
          ilcBranchId: toDisplayValue(getFirstDefinedValue(rowSource, ILC_BRANCH_ID_KEYS)),
          ilcFromWeight: toDisplayValue(getFirstDefinedValue(rowSource, ILC_FROM_WEIGHT_KEYS)),
          ilcToWeight: toDisplayValue(getFirstDefinedValue(rowSource, ILC_TO_WEIGHT_KEYS)),
          ilcLoadChrg: toDisplayValue(getFirstDefinedValue(rowSource, ILC_LOAD_CHRG_KEYS)),
          ilcUnloadChrg: toDisplayValue(getFirstDefinedValue(rowSource, ILC_UNLOAD_CHRG_KEYS)),
          ilcIsActive: toSelectBoolean(getFirstDefinedValue(rowSource, ILC_IS_ACTIVE_KEYS), "true"),
        };
      }}
      buildRequestPayload={({ values, shouldUpdate, editingItemId }) => ({
        ilcCompId: toNullableString(values.ilcCompId ?? ""),
        ilcBranchId: toNullableString(values.ilcBranchId ?? ""),
        ilcFromWeight: toNonNegativeNumber(values.ilcFromWeight ?? "0", 0),
        ilcToWeight: toNonNegativeNumber(values.ilcToWeight ?? "0", 0),
        ilcLoadChrg: toNonNegativeNumber(values.ilcLoadChrg ?? "0", 0),
        ilcUnloadChrg: toNonNegativeNumber(values.ilcUnloadChrg ?? "0", 0),
        ilcIsActive: (values.ilcIsActive ?? "true") !== "false",
        ...(shouldUpdate && editingItemId !== null ? { ilcId: toUpdateId(editingItemId) } : {}),
      })}
    />
  );
}
