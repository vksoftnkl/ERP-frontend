"use client";
import { type CSSProperties } from "react";
import type { ERPDynamicModalField } from "@/components/library/ui/dynamic-modal-form";
import CrudMasterPage from "@/components/master/crud-master-page";
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
  list: "/item-taxes/list",
  getById: "/item-taxes/get",
  create: "/item-taxes/create",
  delete: "/item-taxes/delete",
} as const;
const GRID_TABLE_NAME = "item_tax_master";
const UUID_PATTERN = "^[0-9a-fA-F-]{36}$";
const LOOKUP_KEYS = {
  id: ["tax_id", "taxId", "id", "_id"],
  code: ["tax_code", "taxCode", "code"],
  name: ["tax_name", "taxName", "name"],
  short: ["tax_taxability_type", "taxTaxabilityType", "short"],
  alias: ["tax_cess_type", "taxCessType", "alias"],
  active: ["tax_is_active", "taxIsActive", "active", "is_active", "isActive", "status"],
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
const TAX_BOOLEAN_FIELD_NAMES = [
  "tax_is_reverse_charge",
  "tax_is_active",
] as const;
function buildUuidField(name: string, label: string): ERPDynamicModalField {
  return {
    name,
    label,
    validation: {
      pattern: UUID_PATTERN,
      patternMessage: `${label} must be a valid UUID.`,
    },
  };
}
function buildTaxFormFields(): ERPDynamicModalField[] {
  return [
    {
      name: "taxCoreHeading",
      label: "Tax Core",
      type: "heading",
      helperText: "Basic tax slab identity and status.",
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
      required: true,
      validation: {
        maxLength: 30,
        maxLengthMessage: "Taxability Type must be at most 30 characters.",
      },
      helperText: "Examples: TAXABLE, EXEMPT, NIL_RATED, NON_GST.",
    },
    {
      name: "tax_is_reverse_charge",
      label: "Reverse Charge",
      type: "checkbox",
    },
    {
      name: "tax_is_active",
      label: "Is Active",
      type: "checkbox",
    },
    {
      name: "taxSalesRateHeading",
      label: "Sales Component Rates",
      type: "heading",
    },
    {
      name: "tax_cgst_perc",
      label: "CGST %",
      type: "number",
      min: 0,
      step: "0.001",
    },
    {
      name: "tax_sgst_perc",
      label: "SGST %",
      type: "number",
      min: 0,
      step: "0.001",
    },
    {
      name: "tax_igst_perc",
      label: "IGST %",
      type: "number",
      min: 0,
      step: "0.001",
    },
    {
      name: "tax_gst_rate_total",
      label: "GST Rate Total %",
      type: "number",
      min: 0,
      step: "0.001",
      helperText: "Convenience total; keep aligned with the component rates.",
    },
    {
      name: "taxPurchaseRateHeading",
      label: "Purchase Component Rates",
      type: "heading",
    },
    {
      name: "tax_cgst_pur_perc",
      label: "Purchase CGST %",
      type: "number",
      min: 0,
      step: "0.001",
    },
    {
      name: "tax_sgst_pur_perc",
      label: "Purchase SGST %",
      type: "number",
      min: 0,
      step: "0.001",
    },
    {
      name: "tax_igst_pur_perc",
      label: "Purchase IGST %",
      type: "number",
      min: 0,
      step: "0.001",
    },
    {
      name: "taxCessHeading",
      label: "Cess",
      type: "heading",
    },
    {
      name: "tax_cess_type",
      label: "Cess Type",
      validation: {
        maxLength: 20,
        maxLengthMessage: "Cess Type must be at most 20 characters.",
      },
      helperText: "Examples: NONE, PERCENT, UNIT.",
    },
    {
      name: "tax_cess_perc",
      label: "Cess %",
      type: "number",
      min: 0,
      step: "0.001",
    },
    {
      name: "tax_cess_unit",
      label: "Cess Unit",
      type: "number",
      min: 0,
      step: "0.0001",
    },
    {
      name: "tax_cess_pur_perc",
      label: "Purchase Cess %",
      type: "number",
      min: 0,
      step: "0.001",
    },
    {
      name: "tax_cess_pur_unit",
      label: "Purchase Cess Unit",
      type: "number",
      min: 0,
      step: "0.0001",
    },
    {
      name: "taxLedgerBaseHeading",
      label: "Taxable Value Ledgers",
      type: "heading",
      defaultExpanded: false,
    },
    buildUuidField("tax_sales_ledger_id", "Sales Ledger Id"),
    buildUuidField("tax_sales_return_ledger_id", "Sales Return Ledger Id"),
    buildUuidField("tax_purchase_ledger_id", "Purchase Ledger Id"),
    buildUuidField("tax_purchase_return_ledger_id", "Purchase Return Ledger Id"),
    {
      name: "taxLedgerOutputHeading",
      label: "Output Tax Ledgers (Sales)",
      type: "heading",
      defaultExpanded: false,
    },
    buildUuidField("tax_cgst_output_ledger_id", "CGST Output Ledger Id"),
    buildUuidField("tax_sgst_output_ledger_id", "SGST Output Ledger Id"),
    buildUuidField("tax_igst_output_ledger_id", "IGST Output Ledger Id"),
    buildUuidField("tax_cess_output_ledger_id", "Cess Output Ledger Id"),
    {
      name: "taxLedgerInputHeading",
      label: "Input Tax Ledgers (Purchase)",
      type: "heading",
      defaultExpanded: false,
    },
    buildUuidField("tax_cgst_input_ledger_id", "CGST Input Ledger Id"),
    buildUuidField("tax_sgst_input_ledger_id", "SGST Input Ledger Id"),
    buildUuidField("tax_igst_input_ledger_id", "IGST Input Ledger Id"),
    buildUuidField("tax_cess_input_ledger_id", "Cess Input Ledger Id"),
     ];
}
const TAX_FORM_FIELDS = buildTaxFormFields();
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
export default function TaxMasterPage() {
  return (
    <CrudMasterPage
      title="Tax"
      entityLabel="tax"
      entityLabelPlural="taxes"
      apiEndpoints={API_ENDPOINTS}
      gridTableName={GRID_TABLE_NAME}
      lookupKeys={LOOKUP_KEYS}
      requestPayloadKeys={REQUEST_PAYLOAD_KEYS}
      styles={styles}
      listTitle="Tax List"
      createLabel="Add Tax"
      codeColumnHeader="Tax Code"
      nameColumnHeader="Tax Name"
      nameFieldLabel="Tax Name"
      nameFieldPlaceholder="GST 18%"
      formTitle="Tax Form"
      formDescription="Create and update taxes."
      customFields={TAX_FORM_FIELDS}
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
          mappedValues.tax_gst_rate_total;
        return mappedValues;
      }}
      buildRequestPayload={({ values, shouldUpdate, editingItemId }) => {
        const payload: Record<string, unknown> = {
          tax_name: (values.tax_name ?? "").trim(),
          tax_code: toNullableString(values.tax_code ?? ""),
          tax_taxability_type: normalizeTaxabilityType(
            values.tax_taxability_type ?? "",
          ),
          tax_is_reverse_charge:
            (values.tax_is_reverse_charge ?? "false") === "true",
          tax_cgst_perc: toNonNegativeNumber(values.tax_cgst_perc ?? "0", 0),
          tax_sgst_perc: toNonNegativeNumber(values.tax_sgst_perc ?? "0", 0),
          tax_igst_perc: toNonNegativeNumber(values.tax_igst_perc ?? "0", 0),
          tax_cgst_pur_perc: toNonNegativeNumber(
            values.tax_cgst_pur_perc ?? "0",
            0,
          ),
          tax_sgst_pur_perc: toNonNegativeNumber(
            values.tax_sgst_pur_perc ?? "0",
            0,
          ),
          tax_igst_pur_perc: toNonNegativeNumber(
            values.tax_igst_pur_perc ?? "0",
            0,
          ),
          tax_cess_type: normalizeCessType(values.tax_cess_type ?? ""),
          tax_cess_perc: toNonNegativeNumber(values.tax_cess_perc ?? "0", 0),
          tax_cess_unit: toNonNegativeNumber(values.tax_cess_unit ?? "0", 0),
          tax_cess_pur_perc: toNonNegativeNumber(
            values.tax_cess_pur_perc ?? "0",
            0,
          ),
          tax_cess_pur_unit: toNonNegativeNumber(
            values.tax_cess_pur_unit ?? "0",
            0,
          ),
          tax_gst_rate_total: toNonNegativeNumber(
            values.tax_gst_rate_total ?? "0",
            0,
          ),
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
