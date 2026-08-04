import type {
  ERPDynamicFieldType,
  ERPDynamicSelectOption,
} from "@/components/design-system/ui/dynamic-modal-form";
import type { GridColumnConfig } from "@/store/slices/gridColumnsSlice";
import type { ReusableTableColumn } from "@/components/ui/table";

export type ModalMode = "create" | "update" | "view";

export type LedgerFormFieldName = 
  | "masterName"
  | "masterAlias"
  | "masterShortName"
  | "ledCompanyId"
  | "ledBranchId"
  | "ledGroupId"
  | "ledTallyName"
  | "ledTallyGroupName"
  | "ledTallyGuid"
  | "ledCategory"
  | "ledLedgerType"
  | "ledMailingName"
  | "ledIsBillByBill"
  | "ledIsCostCenterReq"
  | "ledIsInterestApplicable"
  | "ledInterestRate"
  | "ledContactPerson"
  | "ledEmail"
  | "ledTel"
  | "ledPhone1"
  | "ledPhone2"
  | "ledWhatsappNo"
  | "ledAddr1"
  | "ledAddr2"
  | "ledAddr3"
  | "ledCity"
  | "ledDistrict"
  | "ledStateName"
  | "ledStateCode"
  | "ledPin"
  | "ledCountry"
  | "ledRegionName"
  | "ledRegionAddr1"
  | "ledRegionAddr2"
  | "ledRegionAddr3"
  | "ledRegionCity"
  | "ledRegionDistrict"
  | "ledRegionStateName"
  | "ledRegionCountry"
  | "ledGstPartyRegType"
  | "ledGstinNo"
  | "ledPanNo"
  | "ledAadharNo"
  | "ledEcommerceGstin"
  | "ledIsSez"
  | "ledTypeOfSupply"
  | "ledHsnSac"
  | "ledGstRate"
  | "ledTaxability"
  | "ledGstPartyType"
  | "ledTanNo"
  | "ledCin"
  | "ledUdyamNo"
  | "ledMsmeType"
  | "ledGstDutyHead"
  | "ledTaxRate"
  | "ledRoundingMethod"
  | "ledRoundingLimit"
  | "ledIsTdsApplicable"
  | "ledTdsDeducteeType"
  | "ledTdsNatureOfPayment"
  | "ledIsTcsApplicable"
  | "ledObAmount"
  | "ledObType"
  | "ledObAsOn"
  | "ledTotalDr"
  | "ledTotalCr"
  | "ledTotalBalance"
  | "ledSortOrder"
  | "ledIsActive"
  | "ledAllowEdit"
  | "ledIsEntry"
  | "ledAllowSms"
  | "masterDescription";

export type LedgerFormValues = Record<LedgerFormFieldName, string>;

export type LedgerTableRow = {
  __rowId: string | number;
  __recordId: string | number;
  __source: Record<string, unknown> | null;
  serialNo: number;
  ledgerId: string;
  ledgerCode: string;
  ledgerName: string;
  ledgerShort: string;
  ledgerStatus: string;
  companyName: string;
  branchName: string;
  groupName: string;
};

export type LedgerColumnAccessor = keyof Pick<
  LedgerTableRow,
  | "serialNo"
  | "ledgerId"
  | "ledgerCode"
  | "ledgerName"
  | "ledgerShort"
  | "ledgerStatus"
  | "companyName"
  | "branchName"
  | "groupName"
>;

export type PaginationInfo = {
  totalEntries: number | null;
  currentPage: number | null;
  pageSize: number | null;
};

// One declarative field/heading in the ledger modal. `type` may be a normal
// control type, or a structural marker: "heading" (opens a tab), "subheading"
// (inline sub-section), or "bank-editor" (the inline bank-accounts grid).
export type LedgerFormField = {
  name: LedgerFormFieldName | string;
  label: string;
  // The dynamic-modal field union (which already covers "heading"/"subheading")
  // plus the one ledger-local sentinel, rather than a bare `string`: these
  // fields are handed straight to LedgerFieldRenderer, and a loose type here
  // forced an `as any` at the call site that defeated checking on every other
  // prop too.
  type?: ERPDynamicFieldType | "bank-editor";
  required?: boolean;
  searchable?: boolean;
  options?: ERPDynamicSelectOption[];
  placeholder?: string;
  helperText?: string;
  validation?: Record<string, unknown>;
  colSpan?: 1 | 2;
  min?: number | string;
  max?: number | string;
  step?: string;
  // The sub-section (sub-heading key, or tab key) this field belongs to. Stamped
  // by toLedgerFormSections and used to gate the field by the ledger profile.
  sectionKey?: string;
};

// Flat field as authored in buildLedgerFormFields (before tab splitting). Same
// shape as LedgerFormField; `sectionKey` is added later by toLedgerFormSections.
export type LedgerFormBuildField = Omit<LedgerFormField, "sectionKey">;

export type LedgerFormSection = {
  key: string;
  title: string;
  helperText?: string;
  fields: LedgerFormField[];
};

export type LedgerFieldNavigationDirection = "left" | "right" | "up" | "down";

export type LedgerFocusableFieldTarget = {
  control: HTMLElement;
  fieldName: string;
  rect: DOMRect;
  centerX: number;
  centerY: number;
};

export type ResolvedGridDetails = {
  gridId: number | null;
  gridName: string | null;
};

export type GridDetailsResolved = {
  gridId: number | null;
  gridName: string | null;
};
