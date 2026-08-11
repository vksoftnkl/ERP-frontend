import type { SupplierFormFieldName, SupplierHeadingFieldName } from "./types";
// Focusable Supplier Form Fields (excluding headings), in the order they are laid
// out in the entry modal — Identity, then Notes, then Regional Details.
const SUPPLIER_FOCUSABLE_FIELDS: SupplierFormFieldName[] = [
  "supGstNo",
  "supName",
  "supShort",
  "supGroupId",
  "supCompanyId",
  "supBranchId",
  "supGstType",
  "supPurchaseType",
  "supPanNo",
  "supDrugLiscenceNo",
  "supIsActive",
  "supAddr1",
  "supAddr2",
  "supAddr3",
  "supCity",
  "supDistrict",
  "supStateName",
  "supPincode",
  "supCountry",
  "supTel",
  "supPhone",
  "supMailId",
  "supWhatsappNo",
  "supWebsiteAddress",
  "supCreditDays",
  "supCashDiscPerc",
  "supCollectionDays",
  "supChequePreName",
  "supSortOrder",
  "supNotes",
  "supRegionName",
  "supRegionCity",
  "supRegionAddr1",
  "supRegionAddr2",
  "supRegionAddr3",
  "supRegionCountry",
];
// Get All Focusable Supplier Field Controls
export function getSupplierFocusableFieldControl(
  fieldName: SupplierFormFieldName | SupplierHeadingFieldName,
): HTMLElement | null {
  const selectorId = `field-control-${fieldName}`;
  return document.getElementById(selectorId);
}
// Get Focusable Field Targets
export function getSupplierFocusableFieldTargets(): SupplierFormFieldName[] {
  return SUPPLIER_FOCUSABLE_FIELDS;
}
// Find Next Focusable Field Target
export function findNextSupplierFieldTarget(
  currentFieldName: SupplierFormFieldName | SupplierHeadingFieldName,
  direction: "forward" | "backward" = "forward",
): SupplierFormFieldName | null {
  const focusableFields = SUPPLIER_FOCUSABLE_FIELDS;
  const currentIndex = focusableFields.indexOf(
    currentFieldName as SupplierFormFieldName,
  );
  if (currentIndex === -1) {
    return focusableFields.length > 0 ? focusableFields[0] : null;
  }
  if (direction === "forward") {
    return currentIndex < focusableFields.length - 1
      ? focusableFields[currentIndex + 1]
      : null;
  }
  return currentIndex > 0 ? focusableFields[currentIndex - 1] : null;
}
// Focus Supplier Field Control
export function focusSupplierFieldControl(
  fieldName: SupplierFormFieldName,
): boolean {
  const control = getSupplierFocusableFieldControl(fieldName);
  if (!control) {
    return false;
  }
  const input = control.querySelector(
    'input[type="text"], input[type="number"], input[type="tel"], input[type="email"], input[type="url"], select, textarea',
  ) as HTMLElement | null;
  if (input) {
    input.focus();
    return true;
  }
  control.focus();
  return true;
}
// Handle Arrow Key Navigation
export function handleSupplierFieldArrowKeyNavigation(
  event: KeyboardEvent,
  currentFieldName: SupplierFormFieldName,
  onFieldChange?: (fieldName: SupplierFormFieldName) => void,
): boolean {
  if (event.key !== "ArrowUp" && event.key !== "ArrowDown") {
    return false;
  }
  const direction = event.key === "ArrowUp" ? "backward" : "forward";
  const nextFieldName = findNextSupplierFieldTarget(currentFieldName, direction);
  if (!nextFieldName) {
    return false;
  }
  event.preventDefault();
  if (focusSupplierFieldControl(nextFieldName) && onFieldChange) {
    onFieldChange(nextFieldName);
  }
  return true;
}