"use client";
import { type CSSProperties, useCallback, useMemo, useState } from "react";
import type {
  ERPDynamicFieldValueChangeHandler,
  ERPDynamicModalField,
  ERPDynamicSelectOption,
} from "@/components/design-system/ui/dynamic-modal-form";
import CrudMasterPage from "@/components/master/crud-master-page";
import { useMasterOptions } from "@/features/masters/shared";
import { useApi } from "@/hooks/useApi";
import styles from "@/app/master/state-master/page.module.scss";
import {
  getFirstDefinedValue,
  toDisplayValue,
  toNonNegativeNumber,
  toNullableString,
  toSelectBoolean,
  toUpdateId,
  toUpper,
} from "@/app/master/_shared/crud-utils";
const API_ENDPOINTS = {
  list: "/configured-grid-sql/run?grid_id=5",
  getById: "/item-taxes/get",
  create: "/item-taxes/create",
  delete: "/item-taxes/delete",
} as const;
const LOOKUP_ENDPOINT = "/master-lookups/name-id/all-accounts-and-masters";
const GRID_TABLE_NAME = "item_tax_master";
const LOOKUP_QUERY_ACCOUNT_LEDGERS = {
  module: "accountLedgers",
  limit: "100",
} as const;
const LOOKUP_KEYS = {
  id: ["tax_id", "taxId", "id", "_id"],
  code: ["tax_code", "taxCode", "code"],
  name: ["tax_name", "taxName", "name"],
  short: ["tax_taxability_type", "taxTaxabilityType", "short"],
  alias: ["tax_cess_type", "taxCessType", "alias"],
  active: [
    "tax_is_active",
    "taxIsActive",
    "active",
    "is_active",
    "isActive",
    "status",
  ],
  position: ["tax_gst_rate_total", "taxGstRateTotal", "position", "sort"],
  description: ["tax_code", "taxCode", "description", "desc"],
  array: ["data", "items", "results", "rows", "list", "taxes", "itemTaxes"],
} as const;
const REQUEST_PAYLOAD_KEYS = {
  id: "tax_id",
  name: "tax_name",
  alias: "tax_taxability_type",
  short: "tax_code",
  description: "tax_cess_type",
  sort: "tax_gst_rate_total",
} as const;
const TAXABILITY_TYPE_OPTIONS: ERPDynamicSelectOption[] = [
  { label: "Taxable", value: "TAXABLE" },
  { label: "Exempt", value: "EXEMPT" },
  { label: "Nil Rated", value: "NIL_RATED" },
  { label: "Non GST", value: "NON_GST" },
];
const CESS_TYPE_OPTIONS: ERPDynamicSelectOption[] = [
  { label: "None", value: "NONE" },
  { label: "Percent", value: "PERCENT" },
  { label: "Unit", value: "UNIT" },
];
const DEFAULT_LEDGER_OPTION: ERPDynamicSelectOption = {
  value: "",
  label: "Select Account Ledger",
};
const ACCOUNT_LEDGER_LOOKUP_DEFINITION = {
  query: LOOKUP_QUERY_ACCOUNT_LEDGERS,
  defaultOption: DEFAULT_LEDGER_OPTION,
  idKeys: ["id", "value"],
  labelKeys: ["name", "label"],
} as const;
const TAX_INITIAL_FORM_VALUES: Record<string, string> = {
  tax_name: "",
  tax_code: "",
  tax_taxability_type: "TAXABLE",
  tax_is_reverse_charge: "false",
  tax_cgst_perc: "0",
  tax_sgst_perc: "0",
  tax_igst_perc: "0",
  tax_cgst_pur_perc: "0",
  tax_sgst_pur_perc: "0",
  tax_igst_pur_perc: "0",
  tax_cess_type: "NONE",
  tax_cess_perc: "0",
  tax_cess_unit: "0",
  tax_cess_pur_perc: "0",
  tax_cess_pur_unit: "0",
  tax_gst_rate_total: "0",
  tax_sales_ledger_id: "",
  tax_sales_return_ledger_id: "",
  tax_purchase_ledger_id: "",
  tax_purchase_return_ledger_id: "",
  tax_cgst_output_ledger_id: "",
  tax_sgst_output_ledger_id: "",
  tax_igst_output_ledger_id: "",
  tax_cess_output_ledger_id: "",
  tax_cgst_input_ledger_id: "",
  tax_sgst_input_ledger_id: "",
  tax_igst_input_ledger_id: "",
  tax_cess_input_ledger_id: "",
  tax_is_active: "true",
};
const TAX_MODAL_PANEL_STYLE: CSSProperties = {
  width: "min(68vw, 72rem)",
  maxHeight: "78vh",
};
const TAX_TEXT_FIELD_NAMES = [
  "tax_name",
  "tax_code",
  "tax_taxability_type",
  "tax_cess_type",
  "tax_sales_ledger_id",
  "tax_sales_return_ledger_id",
  "tax_purchase_ledger_id",
  "tax_purchase_return_ledger_id",
  "tax_cgst_output_ledger_id",
  "tax_sgst_output_ledger_id",
  "tax_igst_output_ledger_id",
  "tax_cess_output_ledger_id",
  "tax_cgst_input_ledger_id",
  "tax_sgst_input_ledger_id",
  "tax_igst_input_ledger_id",
  "tax_cess_input_ledger_id",
] as const;
const TAX_NUMERIC_FIELD_NAMES = [
  "tax_cgst_perc",
  "tax_sgst_perc",
  "tax_igst_perc",
  "tax_cgst_pur_perc",
  "tax_sgst_pur_perc",
  "tax_igst_pur_perc",
  "tax_cess_perc",
  "tax_cess_unit",
  "tax_cess_pur_perc",
  "tax_cess_pur_unit",
  "tax_gst_rate_total",
] as const;
const TAX_BOOLEAN_FIELD_NAMES = ["tax_is_reverse_charge", "tax_is_active"] as const;
const GST_RATE_PRECISION = 3;
const GST_RATE_SCALE = 10 ** GST_RATE_PRECISION;
function toCamelCase(value: string): string {
  return value.replace(/_([a-z])/g, (_, char: string) => char.toUpperCase());
}
function getFieldValue(source: Record<string, unknown>, fieldName: string): unknown {
  return getFirstDefinedValue(source, [fieldName, toCamelCase(fieldName)]);
}
function toNullableUuid(value: string): string | null {
  const normalized = value.trim();
  return normalized ? normalized : null;
}
function normalizeTaxabilityType(value: string): string {
  const normalized = toUpper(value);
  return normalized || "TAXABLE";
}
function normalizeCessType(value: string): string {
  const normalized = toUpper(value);
  return normalized || "NONE";
}
function formatDecimal(value: number, precision: number): string {
  const fixed = value.toFixed(precision);
  return fixed.replace(/\.?0+$/, "") || "0";
}
function formatGstRateUnits(units: number): string {
  return formatDecimal(units / GST_RATE_SCALE, GST_RATE_PRECISION);
}
function deriveIntrastateGstRate(
  values: Record<string, string>,
  cgstFieldName: string,
  sgstFieldName: string,
): number {
  return (
    toNonNegativeNumber(values[cgstFieldName] ?? "0", 0) +
    toNonNegativeNumber(values[sgstFieldName] ?? "0", 0)
  );
}
function deriveComponentGstRateTotal(
  values: Record<string, string>,
  fieldNames: {
    cgst: string;
    sgst: string;
    igst: string;
  },
): number {
  const igst = toNonNegativeNumber(values[fieldNames.igst] ?? "0", 0);
  return igst > 0
    ? igst
    : deriveIntrastateGstRate(values, fieldNames.cgst, fieldNames.sgst);
}
function deriveGstRateTotal(values: Record<string, string>): string {
  const total =
    deriveComponentGstRateTotal(values, {
      cgst: "tax_cgst_perc",
      sgst: "tax_sgst_perc",
      igst: "tax_igst_perc",
    }) ||
    deriveComponentGstRateTotal(values, {
      cgst: "tax_cgst_pur_perc",
      sgst: "tax_sgst_pur_perc",
      igst: "tax_igst_pur_perc",
    });
  return formatDecimal(total, GST_RATE_PRECISION);
}
function deriveGstRateUnitsFromTotal(totalValue: string): {
  totalUnits: number;
  cgstUnits: number;
  sgstUnits: number;
} {
  const totalUnits = Math.round(
    toNonNegativeNumber(totalValue, 0) * GST_RATE_SCALE,
  );
  const cgstUnits = Math.floor(totalUnits / 2);
  const sgstUnits = totalUnits - cgstUnits;
  return {
    totalUnits,
    cgstUnits,
    sgstUnits,
  };
}
function deriveGstRatePayloadValues(totalValue: string): {
  total: number;
  cgst: number;
  sgst: number;
  igst: number;
} {
  const { totalUnits, cgstUnits, sgstUnits } =
    deriveGstRateUnitsFromTotal(totalValue);
  return {
    total: Number(formatGstRateUnits(totalUnits)),
    cgst: Number(formatGstRateUnits(cgstUnits)),
    sgst: Number(formatGstRateUnits(sgstUnits)),
    igst: Number(formatGstRateUnits(totalUnits)),
  };
}
function showPercentCessFields(values: Record<string, string>): boolean {
  return normalizeCessType(values.tax_cess_type ?? "") === "PERCENT";
}
function showUnitCessFields(values: Record<string, string>): boolean {
  return normalizeCessType(values.tax_cess_type ?? "") === "UNIT";
}
const handleCessTypeChange: ERPDynamicFieldValueChangeHandler = ({ value }) => {
  const cessType = normalizeCessType(value);
  const nextValues: Record<string, string> = {};
  if (cessType === "PERCENT") {
    nextValues.tax_cess_unit = "0";
    nextValues.tax_cess_pur_unit = "0";
  } else if (cessType === "UNIT") {
    nextValues.tax_cess_perc = "0";
    nextValues.tax_cess_pur_perc = "0";
  } else {
    nextValues.tax_cess_perc = "0";
    nextValues.tax_cess_unit = "0";
    nextValues.tax_cess_pur_perc = "0";
    nextValues.tax_cess_pur_unit = "0";
  }
  return {
    values: nextValues,
  };
};
function buildLedgerField(
  name: string,
  label: string,
  ledgerOptions: ERPDynamicSelectOption[],
): ERPDynamicModalField {
  return {
    name,
    label,
    type: "select",
    searchable: true,
    options: ledgerOptions,
  };
}
function buildTaxFormFields(
  ledgerOptions: ERPDynamicSelectOption[],
): ERPDynamicModalField[] {
  return [
    {
      name: "taxCoreHeading",
      label: "Tax Core",
      type: "heading",  
    },
    {
      name: "tax_name",
      label: "Tax Name",
      required: true,
      validation: {
        minLength: 2,
        maxLength: 100,
        minLengthMessage: "Tax Name must be at least 2 characters.",
        maxLengthMessage: "Tax Name must be at most 100 characters.",
      },
    },
    {
      name: "tax_code",
      label: "Tax Code",
      validation: {
        maxLength: 30,
        maxLengthMessage: "Tax Code must be at most 30 characters.",
      },
    },
    {
      name: "tax_taxability_type",
      label: "Taxability Type",
      type: "select",
      searchable: true,
      required: true,
      options: TAXABILITY_TYPE_OPTIONS,
      validation: {
        requiredMessage: "Taxability Type is required.",
      },
    },
    {
      name: "tax_gst_rate_total",
      label: "GST Rate Total %",
      type: "number",
      min: 0,
      step: "0.001",
      inputMode: "decimal",
    },
    {
      name: "tax_cess_type",
      label: "Cess Type",
      type: "select",
      searchable: false,
      options: CESS_TYPE_OPTIONS,
      onValueChange: handleCessTypeChange,
    },
    {
      name: "tax_cess_perc",
      label: "Cess %",
      type: "number",
      min: 0,
      step: "0.001",
      inputMode: "decimal",
      visibleWhen: showPercentCessFields,
    },
    {
      name: "tax_cess_unit",
      label: "Cess Unit",
      type: "number",
      min: 0,
      step: "0.0001",
      inputMode: "decimal",
      visibleWhen: showUnitCessFields,
    },
    {
      name: "tax_is_reverse_charge",
      label: "Reverse Charge",
      type: "checkbox",
    },
    {
      name: "tax_is_active",
      label: "Active",
      type: "checkbox",
    },    
    {
      name: "taxLedgerBaseHeading",
      label: "Taxable Value Ledgers",
      type: "heading",
      defaultExpanded: true,
    },
    buildLedgerField(
      "tax_sales_ledger_id",
      "Sales Ledger",
      ledgerOptions,
    ),
    buildLedgerField(
      "tax_sales_return_ledger_id",
      "Sales Return Ledger",
      ledgerOptions,
    ),
    buildLedgerField(
      "tax_purchase_ledger_id",
      "Purchase Ledger",
      ledgerOptions,
    ),
    buildLedgerField(
      "tax_purchase_return_ledger_id",
      "Purchase Return Ledger",
      ledgerOptions,
    ),
    {
      name: "taxLedgerOutputHeading",
      label: "Output Tax Ledgers (Sales)",
      type: "heading",
      defaultExpanded: true,
    },
    buildLedgerField(
      "tax_cgst_output_ledger_id",
      "CGST Output Ledger",
      ledgerOptions,
    ),
    buildLedgerField(
      "tax_sgst_output_ledger_id",
      "SGST Output Ledger",
      ledgerOptions,
    ),
    buildLedgerField(
      "tax_igst_output_ledger_id",
      "IGST Output Ledger",
      ledgerOptions,
    ),
    buildLedgerField(
      "tax_cess_output_ledger_id",
      "Cess Output Ledger",
      ledgerOptions,
    ),
    {
      name: "taxLedgerInputHeading",
      label: "Input Tax Ledgers (Purchase)",
      type: "heading",
      defaultExpanded: true,
    },
    buildLedgerField(
      "tax_cgst_input_ledger_id",
      "CGST Input Ledger",
      ledgerOptions,
    ),
    buildLedgerField(
      "tax_sgst_input_ledger_id",
      "SGST Input Ledger",
      ledgerOptions,
    ),
    buildLedgerField(
      "tax_igst_input_ledger_id",
      "IGST Input Ledger",
      ledgerOptions,
    ),
    buildLedgerField(
      "tax_cess_input_ledger_id",
      "Cess Input Ledger",
      ledgerOptions,
    ),
  ];
}
export default function TaxMasterPage() {
  const { getAll: getAccountLedgerLookup } = useApi<unknown>(LOOKUP_ENDPOINT);
  const { options: ledgerOptions } = useMasterOptions({
    definition: ACCOUNT_LEDGER_LOOKUP_DEFINITION,
    load: getAccountLedgerLookup,
  });
  const taxFormFields = useMemo(
    () => buildTaxFormFields(ledgerOptions),
    [ledgerOptions],
  );
  // Toggles the `wantdelete` grid param; ticking it re-runs the list so the user
  // can see soft-deleted taxes. Lives beside the list search input.
  const [wantDelete, setWantDelete] = useState(false);
  // Adds the `grid_param` payload to the default page/limit/search list query.
  // The server JSON-parses it and binds each key into the matching named token in
  // grid 5's stored SQL; keys with no matching token are ignored. `wantdelete` is
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
  return (
    <CrudMasterPage
      title="Tax"
      auditHistory={{ screenName: "Item Tax Master" }}
      entityLabel="tax"
      entityLabelPlural="taxes"
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
        listResponseStyleArrayKey=""
      lookupKeys={LOOKUP_KEYS}
      requestPayloadKeys={REQUEST_PAYLOAD_KEYS}
      styles={styles}
      listTitle="Tax List"
      listTitleOverride="Tax List"
      createLabel="Add Tax"
      codeColumnHeader="Tax Code"
      nameColumnHeader="Tax Name"
      nameFieldLabel="Tax Name"
      nameFieldPlaceholder="GST 18%"
      formTitle="Tax Form"
      formDescription="Create and update taxes."
      viewModalTitle="Tax Details"
      createModalTitle="Tax Entry"
      editModalTitle="Edit Tax Entry"
      customFields={taxFormFields}
      createInitialValues={TAX_INITIAL_FORM_VALUES}
      modalPanelStyle={TAX_MODAL_PANEL_STYLE}
      modalFormGridColumns={3}
      modalStackLabels
      mapFormValues={({ source, defaults }) => {
        const rowSource = source ?? {};
        const mappedValues: Record<string, string> = {
          ...TAX_INITIAL_FORM_VALUES,
        };
        for (const fieldName of TAX_TEXT_FIELD_NAMES) {
          const value = toDisplayValue(getFieldValue(rowSource, fieldName));
          mappedValues[fieldName] = value || TAX_INITIAL_FORM_VALUES[fieldName];
        }
        for (const fieldName of TAX_NUMERIC_FIELD_NAMES) {
          const value = toDisplayValue(getFieldValue(rowSource, fieldName));
          mappedValues[fieldName] = value || TAX_INITIAL_FORM_VALUES[fieldName];
        }
        for (const fieldName of TAX_BOOLEAN_FIELD_NAMES) {
          const fallback =
            TAX_INITIAL_FORM_VALUES[fieldName] === "true" ? "true" : "false";
          mappedValues[fieldName] = toSelectBoolean(
            getFieldValue(rowSource, fieldName),
            fallback,
          );
        }
        mappedValues.tax_name =
          toDisplayValue(getFieldValue(rowSource, "tax_name")) ||
          toDisplayValue(getFirstDefinedValue(rowSource, LOOKUP_KEYS.name)) ||
          defaults.masterName ||
          TAX_INITIAL_FORM_VALUES.tax_name;
        mappedValues.tax_code =
          toDisplayValue(getFieldValue(rowSource, "tax_code")) ||
          toDisplayValue(getFirstDefinedValue(rowSource, LOOKUP_KEYS.code)) ||
          defaults.searchCode ||
          TAX_INITIAL_FORM_VALUES.tax_code;
        mappedValues.tax_taxability_type = normalizeTaxabilityType(
          toDisplayValue(getFieldValue(rowSource, "tax_taxability_type")) ||
            defaults.masterAlias ||
            mappedValues.tax_taxability_type,
        );
        mappedValues.tax_cess_type = normalizeCessType(
          toDisplayValue(getFieldValue(rowSource, "tax_cess_type")) ||
            defaults.masterDescription ||
            mappedValues.tax_cess_type,
        );
        mappedValues.tax_gst_rate_total =
          toDisplayValue(getFieldValue(rowSource, "tax_gst_rate_total")) ||
          toDisplayValue(getFirstDefinedValue(rowSource, LOOKUP_KEYS.position)) ||
          deriveGstRateTotal(mappedValues);
        return mappedValues;
      }}
      buildRequestPayload={({ values, shouldUpdate, editingItemId }) => {
        const cessType = normalizeCessType(values.tax_cess_type ?? "");
        const gstRatePayload = deriveGstRatePayloadValues(
          values.tax_gst_rate_total ?? deriveGstRateTotal(values),
        );
        const cessPerc =
          cessType === "PERCENT"
            ? toNonNegativeNumber(values.tax_cess_perc ?? "0", 0)
            : 0;
        const cessPurPerc = cessPerc;
        const cessUnit =
          cessType === "UNIT"
            ? toNonNegativeNumber(values.tax_cess_unit ?? "0", 0)
            : 0;
        const cessPurUnit = cessUnit;
        const payload: Record<string, unknown> = {
          tax_name: (values.tax_name ?? "").trim(),
          tax_code: toNullableString(values.tax_code ?? ""),
          tax_taxability_type: normalizeTaxabilityType(
            values.tax_taxability_type ?? "",
          ),
          tax_is_reverse_charge:
            (values.tax_is_reverse_charge ?? "false") === "true",
          tax_cgst_perc: gstRatePayload.cgst,
          tax_sgst_perc: gstRatePayload.sgst,
          tax_igst_perc: gstRatePayload.igst,
          tax_cgst_pur_perc: gstRatePayload.cgst,
          tax_sgst_pur_perc: gstRatePayload.sgst,
          tax_igst_pur_perc: gstRatePayload.igst,
          tax_cess_type: cessType,
          tax_cess_perc: cessPerc,
          tax_cess_unit: cessUnit,
          tax_cess_pur_perc: cessPurPerc,
          tax_cess_pur_unit: cessPurUnit,
          tax_gst_rate_total: gstRatePayload.total,
          tax_sales_ledger_id: toNullableUuid(values.tax_sales_ledger_id ?? ""),
          tax_sales_return_ledger_id: toNullableUuid(
            values.tax_sales_return_ledger_id ?? "",
          ),
          tax_purchase_ledger_id: toNullableUuid(
            values.tax_purchase_ledger_id ?? "",
          ),
          tax_purchase_return_ledger_id: toNullableUuid(
            values.tax_purchase_return_ledger_id ?? "",
          ),
          tax_cgst_output_ledger_id: toNullableUuid(
            values.tax_cgst_output_ledger_id ?? "",
          ),
          tax_sgst_output_ledger_id: toNullableUuid(
            values.tax_sgst_output_ledger_id ?? "",
          ),
          tax_igst_output_ledger_id: toNullableUuid(
            values.tax_igst_output_ledger_id ?? "",
          ),
          tax_cess_output_ledger_id: toNullableUuid(
            values.tax_cess_output_ledger_id ?? "",
          ),
          tax_cgst_input_ledger_id: toNullableUuid(
            values.tax_cgst_input_ledger_id ?? "",
          ),
          tax_sgst_input_ledger_id: toNullableUuid(
            values.tax_sgst_input_ledger_id ?? "",
          ),
          tax_igst_input_ledger_id: toNullableUuid(
            values.tax_igst_input_ledger_id ?? "",
          ),
          tax_cess_input_ledger_id: toNullableUuid(
            values.tax_cess_input_ledger_id ?? "",
          ),
          tax_is_active: (values.tax_is_active ?? "true") === "true",
        };
        if (shouldUpdate && editingItemId !== null) {
          payload.tax_id = toUpdateId(editingItemId);
        }
        return payload;
      }}
    />
  );
}