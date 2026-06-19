import type { ERPDynamicSelectOption } from "@/components/design-system/ui/dynamic-modal-form";

// Form Field Names (Union Type)
export type SupplierFormFieldName =
  | "supCompanyId"
  | "supBranchId"
  | "supGroupId"
  | "supPurchaseType"
  | "supName"
  | "supShort"
  | "supAddr1"
  | "supAddr2"
  | "supAddr3"
  | "supCity"
  | "supDistrict"
  | "supStateName"
  | "supCountry"
  | "supPincode"
  | "supTel"
  | "supPhone"
  | "supMailId"
  | "supWhatsappNo"
  | "supWebsiteAddress"
  | "supChequePreName"
  | "supNotes"
  | "supCreditDays"
  | "supCashDiscPerc"
  | "supCollectionDays"
  | "supGstNo"
  | "supStateCode"
  | "supPanNo"
  | "supGstType"
  | "supSupCst"
  | "supDrugLiscenceNo"
  | "supRegionName"
  | "supRegionAddr1"
  | "supRegionAddr2"
  | "supRegionAddr3"
  | "supRegionCity"
  | "supRegionDistrict"
  | "supRegionStateName"
  | "supRegionCountry"
  | "supBilledDate"
  | "supSortOrder"
  | "supIsActive"
  | "supStateId"
  | "supCreatedBy"
  | "supModifiedBy";

// Heading Field Names
export type SupplierHeadingFieldName =
  | "scopeHeading"
  | "contactHeading"
  | "creditHeading"
  | "regionHeading"
  | "statusHeading";

// Modal Field Names - State
export type StateModalFieldName =
  | "stateCode"
  | "stateName"
  | "stateUt"
  | "tinCode"
  | "isActive";

// Modal Field Names - Supplier Group
export type SupplierGroupModalFieldName =
  | "spgName"
  | "spgShort"
  | "spgDesc"
  | "spgIsActive";

// Supplier Form Values
export interface SupplierFormValues extends Record<string, string> {
  supCompanyId: string;
  supBranchId: string;
  supGroupId: string;
  supPurchaseType: string;
  supName: string;
  supShort: string;
  supAddr1: string;
  supAddr2: string;
  supAddr3: string;
  supCity: string;
  supDistrict: string;
  supStateName: string;
  supCountry: string;
  supPincode: string;
  supTel: string;
  supPhone: string;
  supMailId: string;
  supWhatsappNo: string;
  supWebsiteAddress: string;
  supChequePreName: string;
  supNotes: string;
  supCreditDays: string;
  supCashDiscPerc: string;
  supCollectionDays: string;
  supGstNo: string;
  supStateCode: string;
  supPanNo: string;
  supGstType: string;
  supSupCst: string;
  supDrugLiscenceNo: string;
  supRegionName: string;
  supRegionAddr1: string;
  supRegionAddr2: string;
  supRegionAddr3: string;
  supRegionCity: string;
  supRegionDistrict: string;
  supRegionStateName: string;
  supRegionCountry: string;
  supBilledDate: string;
  supSortOrder: string;
  supIsActive: string;
  supStateId: string;
  supCreatedBy: string;
  supModifiedBy: string;
}

// Supplier Table Row
export interface SupplierTableRow {
  supId?: string;
  supName?: string;
  supPurchaseType?: string;
  supGroupId?: string;
  supGstNo?: string;
  supCity?: string;
  supStateName?: string;
  supIsActive?: boolean | string;
  supSortOrder?: number | string;
  [key: string]: unknown;
}

// State Modal Form Values
export interface StateModalFormValues {
  stateCode: string;
  stateName: string;
  stateUt: string;
  tinCode: string;
  isActive: string;
}

// Supplier Group Modal Form Values
export interface SupplierGroupModalFormValues {
  spgName: string;
  spgShort: string;
  spgDesc: string;
  spgIsActive: string;
}

// Pagination Info
export interface PaginationInfo {
  currentPage: number;
  totalPages: number;
  pageSize: number;
  totalRecords: number;
}

// Modal Mode Type
export type ModalMode = "create" | "update";

// Lookup Options Map
export interface LookupOptionsMap {
  supplierGroups: ERPDynamicSelectOption[];
  companies: ERPDynamicSelectOption[];
  branches: ERPDynamicSelectOption[];
  states: ERPDynamicSelectOption[];
}

// State Code Maps
export interface StateCodeMaps {
  codeByName: Record<string, string>;
  nameByCode: Record<string, string>;
}

// GST Lookup Result
export interface GstLookupResult extends Record<string, string> {
  supName: string;
  supGstType: string;
  supAddr1: string;
  supAddr2: string;
  supAddr3: string;
  supCity: string;
  supDistrict: string;
  supStateCode: string;
  supStateName: string;
  supRegionStateName: string;
  supPincode: string;
  supGstNo: string;
  supPanNo: string;
  supCountry: string;
}
