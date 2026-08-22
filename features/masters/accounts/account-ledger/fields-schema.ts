import type { ERPDynamicSelectOption } from "@/components/design-system/ui/dynamic-modal-form";
import { GST_LOOKUP_HELPER_TEXT } from "./constants";
import type { LedgerFormBuildField, LedgerFormSection } from "./types";

// Marker name for the inline bank-accounts grid (rendered as <BankAccountsEditor>).
export const BANK_EDITOR_FIELD_NAME = "__bank_accounts_editor";

const BOOLEAN_OPTIONS: ERPDynamicSelectOption[] = [
  { label: "Enable", value: "true" },
  { label: "Disable", value: "false" },
];

const STATUS_OPTIONS: ERPDynamicSelectOption[] = [
  { label: "Active", value: "true" },
  { label: "Inactive", value: "false" },
];

const OB_TYPE_OPTIONS: ERPDynamicSelectOption[] = [
  { label: "Dr", value: "DR" },
  { label: "Cr", value: "CR" },
];

// Ledger Type is derived from the group profile and shown read-only; the options
// keep the control a labelled combo even when locked.
const LEDGER_TYPE_OPTIONS: ERPDynamicSelectOption[] = [
  { label: "PARTY", value: "PARTY" },
  { label: "BANK", value: "BANK" },
  { label: "CASH", value: "CASH" },
  { label: "TAX", value: "TAX" },
  { label: "ROUNDOFF", value: "ROUNDOFF" },
  { label: "DISCOUNT", value: "DISCOUNT" },
  { label: "EXPENSE", value: "EXPENSE" },
  { label: "INCOME", value: "INCOME" },
  { label: "GENERAL", value: "GENERAL" },
];

// -- GST & Tax option sets (mirror the C++ staticCombo lists) ----------------
const TYPE_OF_SUPPLY_OPTIONS: ERPDynamicSelectOption[] = [
  { label: "", value: "" },
  { label: "Goods", value: "Goods" },
  { label: "Services", value: "Services" },
];

const TAXABILITY_OPTIONS: ERPDynamicSelectOption[] = [
  { label: "", value: "" },
  { label: "Taxable", value: "Taxable" },
  { label: "Exempt", value: "Exempt" },
  { label: "Nil Rated", value: "Nil Rated" },
  { label: "Non-GST", value: "Non-GST" },
];

const GST_PARTY_REG_TYPE_OPTIONS: ERPDynamicSelectOption[] = [
  { label: "Regular", value: "REGULAR" },
  { label: "Composition", value: "COMPOSITION" },
  { label: "Unregistered", value: "UNREGISTERED" },
];

const GST_PARTY_TYPE_OPTIONS: ERPDynamicSelectOption[] = [
  { label: "", value: "" },
  { label: "Regular", value: "Regular" },
  { label: "SEZ", value: "SEZ" },
  { label: "Deemed Export", value: "Deemed Export" },
  { label: "Embassy/UN Body", value: "Embassy/UN Body" },
];

const GST_DUTY_HEAD_OPTIONS: ERPDynamicSelectOption[] = [
  { label: "", value: "" },
  { label: "Central Tax", value: "Central Tax" },
  { label: "State Tax", value: "State Tax" },
  { label: "Integrated Tax", value: "Integrated Tax" },
  { label: "Cess", value: "Cess" },
  { label: "State Cess", value: "State Cess" },
];

const ROUNDING_METHOD_OPTIONS: ERPDynamicSelectOption[] = [
  { label: "", value: "" },
  { label: "Not Applicable", value: "Not Applicable" },
  { label: "Upward", value: "Upward" },
  { label: "Downward", value: "Downward" },
  { label: "Normal", value: "Normal" },
];

const MSME_TYPE_OPTIONS: ERPDynamicSelectOption[] = [
  { label: "", value: "" },
  { label: "Micro", value: "Micro" },
  { label: "Small", value: "Small" },
  { label: "Medium", value: "Medium" },
];

// Build the flat field list for the Account Ledger modal. The layout mirrors the
// desktop LedgerEntry form (ledger_entry.cpp): four tabs (heading rows) — Identity,
// GST & Tax, Address & Contact, Regional Details — each with inline sub-headings
// (subheading rows). `sectionKey` is stamped per field by toLedgerFormSections so
// the renderer can show/hide each sub-section by the group's ledger profile.
export function buildLedgerFormFields(
  companyOptions: ERPDynamicSelectOption[],
  branchOptions: ERPDynamicSelectOption[],
  accountGroupOptions: ERPDynamicSelectOption[],
  stateNameOptions: ERPDynamicSelectOption[],
): LedgerFormBuildField[] {
  return [
    // ===== Tab: Identity =====================================================
    { name: "identity", label: "Identity", type: "heading" },
    {
      name: "masterName",
      label: "Name",
      required: true,
      validation: {
        minLength: 2,
        minLengthMessage: "Ledger Name must be at least 2 characters.",
      },
    },
    { name: "masterAlias", label: "Alias" },
    {
      name: "ledGroupId",
      label: "Under (Group)",
      type: "select",
      searchable: true,
      required: true,
      options: accountGroupOptions,
    },
    {
      name: "ledLedgerType",
      label: "Ledger Type",
      type: "select",
      options: LEDGER_TYPE_OPTIONS,
    },
    { name: "masterShortName", label: "Short Name" },
    { name: "ledCategory", label: "Category" },
    {
      name: "ledCompanyId",
      label: "Company",
      type: "select",
      searchable: true,
      options: companyOptions,
    },
    {
      name: "ledBranchId",
      label: "Branch",
      type: "select",
      searchable: true,
      options: branchOptions,
    },

    // -- Supply Details (sales / purchase) -----------------------------------
    { name: "gst_supply", label: "Supply Details", type: "subheading" },
    {
      name: "ledTypeOfSupply",
      label: "Type of Supply",
      type: "select",
      options: TYPE_OF_SUPPLY_OPTIONS,
    },
    { name: "ledHsnSac", label: "HSN / SAC" },
    { name: "ledGstRate", label: "GST Rate %", type: "number", step: "0.01", min: 0 },
    {
      name: "ledTaxability",
      label: "Taxability",
      type: "select",
      options: TAXABILITY_OPTIONS,
    },

    // -- Bank Details (inline grid) ------------------------------------------
    { name: "bank", label: "Bank Details", type: "subheading" },
    { name: BANK_EDITOR_FIELD_NAME, label: "", type: "bank-editor" },

    // -- Preferences ---------------------------------------------------------
    { name: "other", label: "Preferences", type: "subheading" },
    { name: "ledIsBillByBill", label: "Maintain Bill-by-bill", type: "checkbox" },
    { name: "ledIsCostCenterReq", label: "Cost Centres Applicable", type: "checkbox" },
    { name: "ledIsInterestApplicable", label: "Activate Interest", type: "checkbox" },
    {
      name: "ledInterestRate",
      label: "Interest Rate %",
      type: "number",
      step: "0.01",
      min: 0,
    },
    { name: "ledAllowSms", label: "Send SMS", type: "checkbox", options: BOOLEAN_OPTIONS },
    { name: "ledIsActive", label: "Active", type: "checkbox", options: STATUS_OPTIONS },
    { name: "ledSortOrder", label: "Sort Order", type: "number", min: 0 },
    { name: "masterDescription", label: "Remarks" },

    // -- Opening Balance (no C++ equivalent; retained, always visible) --------
    { name: "opening", label: "Opening Balance", type: "subheading" },
    {
      name: "ledObAmount",
      label: "Opening Amount",
      type: "number",
      step: "0.01",
      min: 0,
    },
    { name: "ledObType", label: "Opening Type", type: "select", options: OB_TYPE_OPTIONS },

    // ===== Tab: GST & Tax ====================================================
    { name: "gst", label: "GST & Tax", type: "heading" },

    // -- GST Registration (party identity) -----------------------------------
    { name: "gst_reg", label: "GST Registration", type: "subheading" },
    {
      name: "ledGstinNo",
      label: "GSTIN",
      placeholder: "24ABCDE1234F1Z5",
      helperText: GST_LOOKUP_HELPER_TEXT,
    },
    {
      name: "ledGstPartyRegType",
      label: "Registration Type",
      type: "select",
      options: GST_PARTY_REG_TYPE_OPTIONS,
    },
    {
      name: "ledGstPartyType",
      label: "Party Type",
      type: "select",
      options: GST_PARTY_TYPE_OPTIONS,
    },
    { name: "ledIsSez", label: "Is SEZ", type: "checkbox" },
    {
      name: "ledPanNo",
      label: "PAN",
      validation: {
        pattern: "^[A-Z]{5}[0-9]{4}[A-Z]{1}$",
        patternMessage: "PAN must be 10 characters (e.g., ABCDE1234F).",
        minLength: 10,
        minLengthMessage: "PAN must be 10 characters.",
        maxLength: 10,
        maxLengthMessage: "PAN must be 10 characters.",
      },
    },
    { name: "ledEcommerceGstin", label: "e-Commerce GSTIN" },

    // -- Duty Setup (tax ledgers) --------------------------------------------
    { name: "duty", label: "Duty Setup", type: "subheading" },
    {
      name: "ledGstDutyHead",
      label: "Duty Head",
      type: "select",
      options: GST_DUTY_HEAD_OPTIONS,
    },
    {
      name: "ledTaxRate",
      label: "Percentage of Calculation",
      type: "number",
      step: "0.01",
      min: 0,
    },
    {
      name: "ledRoundingMethod",
      label: "Rounding Method",
      type: "select",
      options: ROUNDING_METHOD_OPTIONS,
    },
    {
      name: "ledRoundingLimit",
      label: "Rounding Limit",
      type: "number",
      step: "0.01",
      min: 0,
    },

    // -- Statutory (party) ---------------------------------------------------
    { name: "statutory", label: "Statutory", type: "subheading" },
    { name: "ledTanNo", label: "TAN" },
    { name: "ledCin", label: "CIN" },
    { name: "ledUdyamNo", label: "Udyam / MSME" },
    {
      name: "ledMsmeType",
      label: "MSME Type",
      type: "select",
      options: MSME_TYPE_OPTIONS,
    },
    {
      name: "ledAadharNo",
      label: "Aadhaar",
      validation: {
        pattern: "^[0-9]{12}$",
        patternMessage: "Aadhar must be 12 digits.",
        minLength: 12,
        minLengthMessage: "Aadhar must be 12 digits.",
        maxLength: 12,
        maxLengthMessage: "Aadhar must be 12 digits.",
      },
    },

    // -- TDS / TCS (party) ----------------------------------------------------
    { name: "tds", label: "TDS / TCS", type: "subheading" },
    { name: "ledIsTdsApplicable", label: "TDS Applicable", type: "checkbox" },
    { name: "ledIsTcsApplicable", label: "TCS Applicable", type: "checkbox" },
    { name: "ledTdsDeducteeType", label: "Deductee Type" },
    { name: "ledTdsNatureOfPayment", label: "Nature of Payment" },

    // ===== Tab: Address & Contact ===========================================
    { name: "mailing", label: "Address & Contact", type: "heading" },
    { name: "ledMailingName", label: "Mailing Name" },
    { name: "ledAddr1", label: "Address 1" },
    { name: "ledAddr2", label: "Address 2" },
    { name: "ledAddr3", label: "Address 3" },
    { name: "ledCity", label: "City" },
    { name: "ledDistrict", label: "District" },
    {
      name: "ledStateName",
      label: "State",
      type: "select",
      searchable: true,
      options: stateNameOptions,
      placeholder: "Search state",
    },
    { name: "ledPin", label: "PIN" },
    { name: "ledCountry", label: "Country" },

    // -- Contact (same party run) --------------------------------------------
    { name: "contact", label: "Contact", type: "subheading" },
    { name: "ledContactPerson", label: "Contact Person" },
    { name: "ledPhone1", label: "Phone 1", type: "tel" },
    { name: "ledPhone2", label: "Phone 2", type: "tel" },
    { name: "ledTel", label: "Telephone", type: "tel" },
    { name: "ledWhatsappNo", label: "WhatsApp", type: "tel" },
    { name: "ledEmail", label: "Email", type: "email" },

    // ===== Tab: Regional Details ============================================
    { name: "regional", label: "Regional Details", type: "heading" },
    { name: "ledRegionName", label: "Regional Name" },
    { name: "ledRegionAddr1", label: "Regional Addr 1" },
    { name: "ledRegionAddr2", label: "Regional Addr 2" },
    { name: "ledRegionAddr3", label: "Regional Addr 3" },
    { name: "ledRegionCity", label: "Regional City" },
    { name: "ledRegionDistrict", label: "Regional District" },
    {
      name: "ledRegionStateName",
      label: "Regional State",
      type: "select",
      searchable: true,
      options: stateNameOptions,
      placeholder: "Search state",
    },
    { name: "ledRegionCountry", label: "Regional Country" },
  ];
}

// Split the flat field list into tab sections. Each `heading` opens a tab; each
// `subheading` starts an inline sub-section within the current tab. Every field
// (and each sub-heading) is stamped with `sectionKey` — the nearest preceding
// sub-heading key, or the tab key when no sub-heading has been seen yet — so the
// renderer can gate sub-sections by the ledger profile.
export function toLedgerFormSections(
  fields: LedgerFormBuildField[],
): LedgerFormSection[] {
  const sections: LedgerFormSection[] = [];
  let currentSection: LedgerFormSection | null = null;
  let currentSubKey = "";

  for (const field of fields) {
    if (field.type === "heading") {
      currentSection = { key: field.name, title: field.label, fields: [] };
      currentSubKey = field.name; // fields before the first sub-heading belong to the tab
      sections.push(currentSection);
      continue;
    }
    if (!currentSection) {
      // Defensive: a field before any tab heading — open a General tab.
      currentSection = { key: "general", title: "General", fields: [] };
      currentSubKey = "general";
      sections.push(currentSection);
    }
    if (field.type === "subheading") {
      currentSubKey = field.name;
      currentSection.fields.push({ ...field, sectionKey: field.name });
      continue;
    }
    currentSection.fields.push({ ...field, sectionKey: currentSubKey });
  }

  return sections;
}
