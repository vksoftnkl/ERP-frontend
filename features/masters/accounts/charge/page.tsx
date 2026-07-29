"use client";
import { useEffect, useMemo, useState } from "react";
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
  toNullableInteger,
  toNullableNumber,
  toNullableString,
  toSelectBoolean,
  toUpdateId,
  toUpper,
  toUpperNullable,
  DEFAULT_LOOKUP_ARRAY_KEYS,
} from "@/app/master/_shared/crud-utils";
const GRID_DETAIL_ID = 81;
const API_ENDPOINTS = {
  list: `/configured-grid-sql/run?grid_id=${GRID_DETAIL_ID}`,
  getById: "/charges/get",
  create: "/charges/create",
  delete: "/charges/delete",
} as const;
const GRID_TABLE_NAME = "charge_master";
const LOOKUP_ENDPOINT = "/master-lookups/name-id/all-masters";
const LOOKUP_QUERY_ACCOUNT_LEDGERS = { module: "accountLedgers" } as const;
const LOOKUP_KEYS = {
  id: ["chgId", "chg_id", "id", "_id"],
  code: ["chgCode", "chg_code", "code"],
  name: ["chgName", "chg_name", "name"],
  // Grid 81 (CHARGES MAIN LIST) renders every other column through its own
  // sql-field accessor, so short/alias are only fallbacks. They deliberately
  // point at columns the grid does NOT select (chg_apply_on / chg_ledger_code)
  // so CrudMasterPage's accessor heuristic can't claim a configured column for
  // them and push the real one out of the table.
  short: ["chgApplyOn", "chg_apply_on", "short"],
  alias: ["chgLedgerCode", "chg_ledger_code", "alias"],
  active: ["chgIsActive", "chg_is_active", "isActive", "is_active", "active", "status"],
  position: ["chgDispOrder", "chg_disp_order", "position", "sort"],
  array: ["data", "items", "results", "rows", "list", "charges", "charge_master"],
} as const;
// requestPayloadKeys.id is load-bearing (used as the literal getById/delete
// query-param name); the rest are only consumed by CrudMasterPage's default
// buildRequestPayload, which this page overrides, so they're inert filler.
const REQUEST_PAYLOAD_KEYS = {
  id: "chgId",
  name: "chgName",
  alias: "chgCode",
  short: "chgApplyOn",
  description: "chgName",
  sort: "chgDispOrder",
} as const;
const CHG_NAME_KEYS = ["chgName", "chg_name"] as const;
const CHG_CODE_KEYS = ["chgCode", "chg_code"] as const;
const CHG_MODULE_KEYS = ["chgModule", "chg_module"] as const;
const CHG_ROLE_KEYS = ["chgRole", "chg_role"] as const;
const CHG_METHOD_KEYS = ["chgMethod", "chg_method"] as const;
const CHG_TYPE_KEYS = ["chgType", "chg_type"] as const;
const CHG_APPLY_ON_KEYS = ["chgApplyOn", "chg_apply_on"] as const;
const CHG_DEFAULT_RATE_KEYS = ["chgDefaultRate", "chg_default_rate"] as const;
const CHG_LANDING_COST_KEYS = ["chgLandingCost", "chg_landing_cost"] as const;
const CHG_COST_ALLOC_KEYS = ["chgCostAlloc", "chg_cost_alloc"] as const;
const CHG_LEDGER_CODE_KEYS = ["chgLedgerCode", "chg_ledger_code"] as const;
const CHG_TAX_APL_KEYS = ["chgTaxApl", "chg_tax_apl"] as const;
const CHG_BEFORE_TAX_KEYS = ["chgBeforeTax", "chg_before_tax"] as const;
const CHG_SEP_POST_KEYS = ["chgSepPost", "chg_sep_post"] as const;
const CHG_MAN_PARTY_KEYS = ["chgManParty", "chg_man_party"] as const;
const CHG_DISP_ORDER_KEYS = ["chgDispOrder", "chg_disp_order"] as const;
const CHG_AUTO_APPLY_KEYS = ["chgAutoApply", "chg_auto_apply"] as const;
const CHG_IS_ACTIVE_KEYS = ["chgIsActive", "chg_is_active", "isActive", "is_active", "status"] as const;
// Value sets mirror the DB CHECK constraints on charge_master and the server DTO
// (CHARGE_MODULES / CHARGE_ROLES / ... in charge-master-api.types.ts).
const MODULE_OPTIONS: ERPDynamicSelectOption[] = [
  { value: "S", label: "Sales" },
  { value: "P", label: "Purchase" },
  { value: "B", label: "Both" },
];
const ROLE_OPTIONS: ERPDynamicSelectOption[] = [
  { value: "", label: "None" },
  { value: "FREIGHT", label: "Freight" },
  { value: "LOADING", label: "Loading" },
  { value: "UNLOADING", label: "Unloading" },
  { value: "CASH_DISC", label: "Cash Discount" },
  { value: "OTHERS", label: "Others" },
];
const METHOD_OPTIONS: ERPDynamicSelectOption[] = [
  { value: "FIXED", label: "Fixed" },
  { value: "PERCENT", label: "Percent" },
  { value: "QTY", label: "Quantity" },
  { value: "NET_QTY", label: "Net Quantity" },
  { value: "KG", label: "Kg" },
  { value: "QTL", label: "Quintal" },
  { value: "TON", label: "Ton" },
];
const TYPE_OPTIONS: ERPDynamicSelectOption[] = [
  { value: "ADD", label: "Add" },
  { value: "DEDUCT", label: "Deduct" },
];
const APPLY_ON_OPTIONS: ERPDynamicSelectOption[] = [
  { value: "FLAT", label: "Flat" },
  { value: "QTY", label: "Quantity" },
  { value: "VALUE", label: "Value" },
  { value: "WEIGHT", label: "Weight" },
];
const COST_ALLOC_OPTIONS: ERPDynamicSelectOption[] = [
  { value: "", label: "None" },
  { value: "VALUE", label: "Value" },
  { value: "QTY", label: "Quantity" },
  { value: "WEIGHT", label: "Weight" },
];
const DEFAULT_LEDGER_OPTION: ERPDynamicSelectOption = {
  value: "",
  label: "Select Account Ledger",
};
const CHARGE_INITIAL_FORM_VALUES = {
  chgName: "",
  chgCode: "",
  chgModule: "S",
  chgRole: "",
  chgMethod: "FIXED",
  chgType: "ADD",
  chgApplyOn: "FLAT",
  chgDefaultRate: "0",
  chgLedgerCode: "",
  chgLandingCost: "false",
  chgCostAlloc: "",
  chgTaxApl: "false",
  chgBeforeTax: "false",
  chgSepPost: "false",
  chgManParty: "false",
  chgAutoApply: "false",
  chgDispOrder: "0",
  chgIsActive: "true",
} as const;
// chg_cost_alloc is only meaningful for landing-cost (purchase) charges; the DB
// CHECK constraint expects it empty otherwise.
function isLandingCost(values: Record<string, string>): boolean {
  return (values.chgLandingCost ?? "false") === "true";
}
function buildChargeFormFields(
  ledgerOptions: ERPDynamicSelectOption[],
): ERPDynamicModalField[] {
  return [
    { name: "__subheading_identity", label: "Charge Identity", type: "subheading" },
    {
      name: "chgName",
      label: "Charge Name",
      required: true,
      validation: {
        requiredMessage: "Charge Name is required.",
        maxLength: 100,
        maxLengthMessage: "Charge Name cannot exceed 100 characters.",
      },
    },
    {
      name: "chgCode",
      label: "Charge Code",
      placeholder: "Unique short code",
      validation: {
        maxLength: 50,
        maxLengthMessage: "Charge Code cannot exceed 50 characters.",
      },
    },
    {
      name: "chgModule",
      label: "Module",
      type: "select",
      required: true,
      options: MODULE_OPTIONS,
      validation: { requiredMessage: "Module is required." },
    },
    {
      name: "chgRole",
      label: "Role",
      type: "select",
      options: ROLE_OPTIONS,
      helperText: "One charge per role, per module.",
    },
    { name: "__subheading_calculation", label: "Calculation", type: "subheading" },
    {
      name: "chgMethod",
      label: "Method",
      type: "select",
      required: true,
      options: METHOD_OPTIONS,
      validation: { requiredMessage: "Method is required." },
    },
    {
      name: "chgType",
      label: "Type",
      type: "select",
      required: true,
      options: TYPE_OPTIONS,
      validation: { requiredMessage: "Type is required." },
    },
    {
      name: "chgApplyOn",
      label: "Apply On",
      type: "select",
      required: true,
      options: APPLY_ON_OPTIONS,
      validation: { requiredMessage: "Apply On is required." },
    },
    {
      name: "chgDefaultRate",
      label: "Default Rate / %",
      type: "number",
      min: 0,
      step: "0.0001",
      validation: { minMessage: "Default Rate must be 0 or greater." },
    },
    { name: "__subheading_posting", label: "Posting", type: "subheading" },
    {
      name: "chgLedgerCode",
      label: "Ledger",
      type: "select",
      searchable: true,
      required: true,
      options: ledgerOptions,
      placeholder: "Search ledger",
      validation: { requiredMessage: "Ledger is required." },
    },
    { name: "chgTaxApl", label: "Charge Is Taxable", type: "checkbox" },
    { name: "chgBeforeTax", label: "Apply Before Tax", type: "checkbox" },
    { name: "chgSepPost", label: "Post Separately", type: "checkbox" },
    { name: "chgManParty", label: "Party Mandatory", type: "checkbox" },
    { name: "__subheading_landing_cost", label: "Landing Cost (Purchase)", type: "subheading" },
    { name: "chgLandingCost", label: "Include In Landing Cost", type: "checkbox" },
    {
      name: "chgCostAlloc",
      label: "Cost Allocation",
      type: "select",
      options: COST_ALLOC_OPTIONS,
      visibleWhen: isLandingCost,
      requiredWhen: isLandingCost,
      validation: { requiredMessage: "Cost Allocation is required for landing-cost charges." },
    },
    { name: "__subheading_behaviour", label: "Behaviour", type: "subheading" },
    {
      name: "chgDispOrder",
      label: "Display Order",
      type: "number",
      min: 0,
      step: 1,
      validation: { minMessage: "Display Order must be 0 or greater." },
    },
    { name: "chgAutoApply", label: "Auto Apply On New Entry", type: "checkbox" },
    { name: "chgIsActive", label: "Active", type: "checkbox" },
  ];
}
export default function ChargeMasterPage() {
  const { getAll: getLedgerLookup } = useApi<unknown>(LOOKUP_ENDPOINT);
  const [ledgerOptions, setLedgerOptions] = useState<ERPDynamicSelectOption[]>([
    DEFAULT_LEDGER_OPTION,
  ]);
  useEffect(() => {
    let mounted = true;
    void (async () => {
      try {
        const ledgersPayload = await getLedgerLookup(LOOKUP_QUERY_ACCOUNT_LEDGERS);
        if (!mounted) {
          return;
        }
        setLedgerOptions(
          buildLookupOptions(ledgersPayload, DEFAULT_LEDGER_OPTION, {
            arrayKeys: DEFAULT_LOOKUP_ARRAY_KEYS,
            idKeys: ["id", "value"],
            labelKeys: ["name", "label"],
          }),
        );
      } catch {
        if (!mounted) {
          return;
        }
        setLedgerOptions([DEFAULT_LEDGER_OPTION]);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [getLedgerLookup]);
  const formFields = useMemo(() => buildChargeFormFields(ledgerOptions), [ledgerOptions]);
  return (
    <CrudMasterPage
      title="Charge Master"
      auditHistory={{
        screenName: "Charge Master",
        getDisplayName: (row) =>
          toDisplayValue(getFirstDefinedValue(row.__source ?? {}, CHG_NAME_KEYS)) || null,
      }}
      entityLabel="charge"
      entityLabelPlural="charges"
      apiEndpoints={API_ENDPOINTS}
      gridTableName={GRID_TABLE_NAME}
      gridDetailId={GRID_DETAIL_ID}
      listResponseStyleArrayKey=""
      lookupKeys={LOOKUP_KEYS}
      requestPayloadKeys={REQUEST_PAYLOAD_KEYS}
      styles={styles}
      listTitle="Charges List"
      listTitleOverride="Charges List"
      createLabel="Add Charge"
      codeColumnHeader="Code"
      nameColumnHeader="Charge Name"
      formTitle="Charge Form"
      formDescription="Create and update additional charges shared by Sales and Purchase."
      createModalTitle="Charge Entry"
      editModalTitle="Edit Charge Entry"
      modalFormGridColumns={2}
      modalFormDenseGrid={false}
      modalPanelStyle={{ width: "min(46rem, calc(100vw - 2rem))" }}
      customFields={formFields}
      createInitialValues={CHARGE_INITIAL_FORM_VALUES}
      mapFormValues={({ source }) => {
        const rowSource = source ?? {};
        return {
          ...CHARGE_INITIAL_FORM_VALUES,
          chgName: toDisplayValue(getFirstDefinedValue(rowSource, CHG_NAME_KEYS)),
          chgCode: toDisplayValue(getFirstDefinedValue(rowSource, CHG_CODE_KEYS)),
          chgModule: toUpper(toDisplayValue(getFirstDefinedValue(rowSource, CHG_MODULE_KEYS))),
          chgRole: toUpper(toDisplayValue(getFirstDefinedValue(rowSource, CHG_ROLE_KEYS))),
          chgMethod: toUpper(toDisplayValue(getFirstDefinedValue(rowSource, CHG_METHOD_KEYS))),
          chgType: toUpper(toDisplayValue(getFirstDefinedValue(rowSource, CHG_TYPE_KEYS))),
          chgApplyOn: toUpper(toDisplayValue(getFirstDefinedValue(rowSource, CHG_APPLY_ON_KEYS))),
          chgDefaultRate: toDisplayValue(getFirstDefinedValue(rowSource, CHG_DEFAULT_RATE_KEYS)),
          chgLedgerCode: toDisplayValue(getFirstDefinedValue(rowSource, CHG_LEDGER_CODE_KEYS)),
          chgLandingCost: toSelectBoolean(
            getFirstDefinedValue(rowSource, CHG_LANDING_COST_KEYS),
            "false",
          ),
          chgCostAlloc: toUpper(toDisplayValue(getFirstDefinedValue(rowSource, CHG_COST_ALLOC_KEYS))),
          chgTaxApl: toSelectBoolean(getFirstDefinedValue(rowSource, CHG_TAX_APL_KEYS), "false"),
          chgBeforeTax: toSelectBoolean(
            getFirstDefinedValue(rowSource, CHG_BEFORE_TAX_KEYS),
            "false",
          ),
          chgSepPost: toSelectBoolean(getFirstDefinedValue(rowSource, CHG_SEP_POST_KEYS), "false"),
          chgManParty: toSelectBoolean(
            getFirstDefinedValue(rowSource, CHG_MAN_PARTY_KEYS),
            "false",
          ),
          chgAutoApply: toSelectBoolean(
            getFirstDefinedValue(rowSource, CHG_AUTO_APPLY_KEYS),
            "false",
          ),
          chgDispOrder: toDisplayValue(getFirstDefinedValue(rowSource, CHG_DISP_ORDER_KEYS)),
          chgIsActive: toSelectBoolean(getFirstDefinedValue(rowSource, CHG_IS_ACTIVE_KEYS), "true"),
        };
      }}
      buildRequestPayload={({ values, shouldUpdate, editingItemId }) => {
        const landingCost = isLandingCost(values);
        return {
          chgName: (values.chgName ?? "").trim(),
          chgCode: toNullableString(values.chgCode ?? ""),
          chgModule: toUpper(values.chgModule ?? "S"),
          // The server DTO nulls the role via SkipOnNullish, so an empty select
          // must go out as null rather than "" (which would fail the IsIn check).
          chgRole: toUpperNullable(values.chgRole ?? ""),
          chgMethod: toUpper(values.chgMethod ?? "FIXED"),
          chgType: toUpper(values.chgType ?? "ADD"),
          chgApplyOn: toUpper(values.chgApplyOn ?? "FLAT"),
          chgDefaultRate: toNullableNumber(values.chgDefaultRate ?? ""),
          chgLedgerCode: (values.chgLedgerCode ?? "").trim(),
          chgLandingCost: landingCost,
          chgCostAlloc: landingCost ? toUpperNullable(values.chgCostAlloc ?? "") : null,
          chgTaxApl: (values.chgTaxApl ?? "false") === "true",
          chgBeforeTax: (values.chgBeforeTax ?? "false") === "true",
          chgSepPost: (values.chgSepPost ?? "false") === "true",
          chgManParty: (values.chgManParty ?? "false") === "true",
          chgDispOrder: toNullableInteger(values.chgDispOrder ?? ""),
          chgAutoApply: (values.chgAutoApply ?? "false") === "true",
          chgIsActive: (values.chgIsActive ?? "true") !== "false",
          ...(shouldUpdate && editingItemId !== null ? { chgId: toUpdateId(editingItemId) } : {}),
        };
      }}
    />
  );
}