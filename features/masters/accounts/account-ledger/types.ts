import type { ERPDynamicSelectOption } from "@/components/design-system/ui/dynamic-modal-form";
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
  | "ledChequeName"
  | "ledBankName"
  | "ledBankBranch"
  | "ledBankAcNo"
  | "ledBankIfsc"
  | "ledUpiId"
  | "ledObAmount"
  | "ledObType"
  | "ledObAsOn"
  | "ledTotalDr"
  | "ledTotalCr"
  | "ledTotalBalance"
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

export type LedgerFormSection = {
  key: string;
  title: string;
  helperText?: string;
  fields: Array<{
    name: LedgerFormFieldName | string;
    label: string;
    type?: string;
    required?: boolean;
    searchable?: boolean;
    options?: ERPDynamicSelectOption[];
    placeholder?: string;
    helperText?: string;
    validation?: Record<string, unknown>;
    colSpan?: number;
    min?: number | string;
    max?: number | string;
    step?: string;
  }>;
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
