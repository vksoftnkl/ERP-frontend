import type {
  ERPDynamicModalField,
  ERPDynamicSelectOption,
} from "@/components/design-system/ui/dynamic-modal-form";
import type { LedgerFormSection } from "./types";

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

const GST_PARTY_REG_TYPE_OPTIONS: ERPDynamicSelectOption[] = [
  { label: "Regular", value: "REGULAR" },
  { label: "Composition", value: "COMPOSITION" },
  { label: "Unregistered", value: "UNREGISTERED" },
];

export function buildLedgerFormFields(
  companyOptions: ERPDynamicSelectOption[],
  branchOptions: ERPDynamicSelectOption[],
  accountGroupOptions: ERPDynamicSelectOption[],
  stateNameOptions: ERPDynamicSelectOption[],
): ERPDynamicModalField[] {
  return [
    {
      name: "masterName",
      label: "Ledger Name",
      required: true,
      validation: {
        minLength: 2,
        minLengthMessage: "Ledger Name must be at least 2 characters.",
      },
    },
    {
      name: "masterAlias",
      label: "Ledger Alias",
    },
    {
      name: "masterShortName",
      label: "Ledger Short",
    },
    {
      name: "ledCompanyId",
      label: "Company",
      type: "select",
      searchable: true,
      required: true,
      options: companyOptions,
    },
    {
      name: "ledBranchId",
      label: "Branch",
      type: "select",
      searchable: true,
      required: true,
      options: branchOptions,
    },
    {
      name: "ledGroupId",
      label: "Account Group",
      type: "select",
      searchable: true,
      required: true,
      options: accountGroupOptions,
    },
    {
      name: "__heading_statutory",
      label: "GST & Statutory",
      type: "heading",
    },
    {
      name: "ledGstinNo",
      label: "GSTIN",
    },
    {
      name: "ledGstPartyRegType",
      label: "GST Party Reg Type",
      type: "select",
      options: GST_PARTY_REG_TYPE_OPTIONS,
    },
    {
      name: "ledEcommerceGstin",
      label: "Ecommerce GSTIN",
    },
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
    {
      name: "ledAadharNo",
      label: "Aadhar No",
      validation: {
        pattern: "^[0-9]{12}$",
        patternMessage: "Aadhar must be 12 digits.",
        minLength: 12,
        minLengthMessage: "Aadhar must be 12 digits.",
        maxLength: 12,
        maxLengthMessage: "Aadhar must be 12 digits.",
      },
    },
    {
      name: "__heading_contact",
      label: "Contact Details",
      type: "heading",
    },
    {
      name: "ledContactPerson",
      label: "Contact Person",
    },
    {
      name: "ledAddr1",
      label: "Address 1",
    },
    {
      name: "ledDistrict",
      label: "district",
    },
    {
      name: "ledEmail",
      label: "Email",
      type: "email",
    },
    {
      name: "ledAddr2",
      label: "Address 2",
    },
    {
      name: "ledPin",
      label: "pin",
    },
    {
      name: "ledTel",
      label: "Tel",
      type: "tel",
    },
    {
      name: "ledAddr3",
      label: "Address 3",
    },
    {
      name: "ledStateName",
      label: "state",
      type: "select",
      searchable: true,
      options: stateNameOptions,
      placeholder: "Search state",
    },
    {
      name: "ledPhone1",
      label: "Phone 1",
      type: "tel",
    },
    {
      name: "ledCity",
      label: "City",
    },
    {
      name: "ledCountry",
      label: "country",
    },
    {
      name: "ledPhone2",
      label: "Phone 2",
      type: "tel",
    },
    {
      name: "__heading_region",
      label: "Regional Address",
      type: "heading",
    },
    {
      name: "ledRegionName",
      label: "Region Name",
    },
    {
      name: "ledRegionAddr3",
      label: "Region Address 3",
    },
    {
      name: "ledRegionStateName",
      label: "Region state",
      type: "select",
      searchable: true,
      options: stateNameOptions,
      placeholder: "Search state",
    },
    {
      name: "ledRegionAddr1",
      label: "Region Address 1",
    },
    {
      name: "ledRegionCity",
      label: "Region city",
    },
    {
      name: "ledRegionCountry",
      label: "Region country",
    },
    {
      name: "ledRegionAddr2",
      label: "Region Address 2",
    },
    {
      name: "ledRegionDistrict",
      label: "Region district",
    },
    {
      name: "__heading_bank",
      label: "Bank & Payment",
      type: "heading",
    },
    {
      name: "ledChequeName",
      label: "Account Holder Name",
    },
    {
      name: "ledBankBranch",
      label: "Bank Branch",
    },
    {
      name: "ledBankIfsc",
      label: "Bank IFSC",
    },
    {
      name: "ledBankName",
      label: "Bank Name",
    },
    {
      name: "ledBankAcNo",
      label: "Bank A/C No",
    },
    {
      name: "ledUpiId",
      label: "UPI ID",
    },
    {
      name: "__heading_opening",
      label: "Opening Balance",
      type: "heading",
    },
    {
      name: "ledObAmount",
      label: "Opening Amount",
      type: "number",
      step: "0.01",
      colSpan: 1,
      min: 0,
    },
    {
      name: "ledObType",
      label: "Opening Type",
      type: "select",
      colSpan: 1,
      options: OB_TYPE_OPTIONS,
    },
    {
      name: "__heading_control",
      label: "Status & Controls",
      type: "heading",
    },
    {
      name: "ledIsActive",
      label: "Is Active",
      type: "checkbox",
      colSpan: 1,
      options: STATUS_OPTIONS,
    },
    {
      name: "ledIsBillByBill",
      label: "Bill By Bill",
      type: "checkbox",
    },
    {
      name: "ledAllowSms",
      label: "Allow SMS",
      type: "checkbox",
      colSpan: 1,
      options: BOOLEAN_OPTIONS,
    },
    {
      name: "masterDescription",
      label: "Remarks",
    },
  ];
}

export function toLedgerFormSections(
  fields: ERPDynamicModalField[],
): LedgerFormSection[] {
  const sections: LedgerFormSection[] = [];
  let currentSection: LedgerFormSection = {
    key: "general",
    title: "General",
    fields: [],
  };

  for (const field of fields) {
    if ((field.type ?? "text") === "heading") {
      if (currentSection.fields.length > 0) {
        sections.push(currentSection);
      }
      currentSection = {
        key: field.name,
        title: field.label,
        helperText: field.helperText,
        fields: [],
      };
      continue;
    }
    currentSection.fields.push(field as any);
  }

  if (currentSection.fields.length > 0) {
    sections.push(currentSection);
  }

  return sections;
}
