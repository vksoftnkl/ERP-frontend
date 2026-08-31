import type { ERPDynamicModalField } from "@/components/design-system/ui/dynamic-modal-form";
import {
  applyWidgetFieldConfig,
  buildControllableFieldNames,
  buildWidgetFieldConfigFromSections,
  pruneEmptyGroups,
  type ResolvedFieldConfig,
  type WidgetMasterSectionConfig,
  type WidgetMastersResponse,
} from "@/features/masters/shared/widget-config";

// Customer Master re-labels and shows/hides its hardcoded form fields from the
// backend widget-masters config (fixed.form_section / form_field) for menu 10.
// Live form config for the modal; scoped to this screen's menu + platform.
export const WIDGET_CONFIG_ENDPOINT = "/widget-masters/get";
export const WIDGET_SECTION_MENU_ID = 10;
// fixed.form_section.section_platform is an enum (Mobile | Desktop | Web) and is
// matched case-sensitively by the server.
export const WIDGET_SECTION_PLATFORM = "Web";
// Right-click popup tree: the menu's configured sections/fields, and the PATCH
// that persists the edited section/field visibility + secondary text.
export const WIDGET_CONFIG_TREE_ENDPOINT = "/widget-masters/config";
export const WIDGET_VISIBILITY_ENDPOINT = "/widget-masters/visibility";

// Bridges each form field `name` (used by form state and the submit payload) to
// the `fixed.form_field.field_name` it is configured under, matched
// case-insensitively. Menu 10's config was authored in the widget-master admin UI
// (Web sections 66 Customer-identify / 67 customer-notes / 68 Customers-Region
// details), so each field_name IS its label — the earlier comp_*/cus_* column-style
// names it replaced no longer exist, and a stale key here binds nothing, leaving
// the field out of the popup entirely.
//
// The Region Details tab repeats Address 1/2/3, City, District, State and Country
// from Identity, and this map is keyed by field_name alone, so section 68's names
// carry a "Regional " prefix in the DB (field_gui_name still reads "Address 1" in
// the popup) — without it the two sets would collide and show/hide together.
export const WIDGET_FIELD_NAME_BY_FORM_FIELD: Record<string, string> = {
  // ── Identity (section 66) ──
  cusName: "Customer Name",
  cusGstNo: "GST No",
  cusShort: "Short Name",
  cusGroupId: "Group",
  cusCompanyId: "Company",
  cusBranchId: "Branch",
  cusAreaId: "Area",
  cusGstType: "GST Type",
  cusPriceLevelId: "Price Level",
  cusPanNo: "PAN No",
  cusEcommerceGstin: "e-Commerce GSTIN",
  cusIsActive: "Active",
  cusCode: "Customer Code",
  cusSortOrder: "Sort Order",
  cusDefaultSalesman: "Salesman",
  cusAddr1: "Address 1",
  cusAddr2: "Address 2",
  cusAddr3: "Address 3",
  cusCity: "City",
  cusDistrict: "District",
  cusStateCode: "State",
  cusPin: "Pincode",
  cusCountry: "Country",
  cusTel: "Telephone",
  cusPhone1: "Phone 1",
  cusPhone2: "Phone 2",
  cusWhatsappNo: "WhatsApp",
  cusEmail: "Email",
  cusAadharNo: "Aadhaar",
  cusCreditAllowed: "Credit Allowed",
  cusCreditDays: "Credit Days",
  cusCreditBillLimit: "Credit Bill Limit",
  cusCreditAmtLimit: "Credit Amt Limit",
  cusDebitGraceDays: "Grace Days",
  cusDebitBalance: "Debit Balance",
  cusDiscPerc: "Discount %",
  cusAllowDiscount: "Allow Discount",
  cusAllowLoyalty: "Allow Loyalty",
  cusAllowPromotion: "Allow Promotion",
  cusEnableSms: "Enable SMS",
  cusOverdueSms: "Overdue SMS",
  cusOverdueBilling: "Overdue Billing",
  cusTcsApplicable: "TCS Applicable",
  cusItcollExempted: "IT Coll. Exempted",
  cusFreightCharge: "Freight Charge",
  cusLoadingCharge: "Loading Charge",
  cusUnloadingCharge: "Unloading Charge",
  // ── Notes (section 67) ──
  cusContactPerson: "Contact Person",
  cusTransportName: "Transport Name",
  cusLandmark: "Landmark",
  cusDistanceKm: "Distance (km)",
  cusBirthDate: "Birth Date",
  cusMarriageDate: "Marriage Date",
  cusCollectionDays: "Collection Days",
  cusNotes: "Notes",
  // ── Regional Details (section 68) ──
  cusRegionName: "Regional Name",
  cusRegionAddr1: "Regional Address 1",
  cusRegionAddr2: "Regional Address 2",
  cusRegionAddr3: "Regional Address 3",
  cusRegionCity: "Regional City",
  cusRegionDistrict: "Regional District",
  cusRegionStateName: "Regional State",
  cusRegionCountry: "Regional Country",
};

// Backend fieldNames (lowercased) that map to a real form field, so their popup
// checkbox can actually show/hide something. Others are left out of the popup.
export const WIDGET_CONTROLLABLE_FIELD_NAMES = buildControllableFieldNames(
  WIDGET_FIELD_NAME_BY_FORM_FIELD,
);

/** Flatten `/widget-masters/get` into the lookup the apply below reads. */
export function buildCustomerWidgetFieldConfig(
  response: WidgetMastersResponse | null | undefined,
): Map<string, ResolvedFieldConfig> {
  return buildCustomerWidgetFieldConfigFromSections(response?.data);
}

/**
 * Same, from the sections alone. Section visibility is folded into each field, so
 * switching a whole tab off in the popup hides that tab's fields on reload the way
 * it does live (the popup's section switch cascades to its fields).
 */
export function buildCustomerWidgetFieldConfigFromSections(
  sections: WidgetMasterSectionConfig[] | null | undefined,
): Map<string, ResolvedFieldConfig> {
  return buildWidgetFieldConfigFromSections(sections, { foldSectionVisibility: true });
}

// The tabs, groups, order, and labels of this screen are authored in
// buildCustomerFormFields (the 3-tab Identity / Notes / Regional Details layout),
// so the config is applied in "visibility-only" mode and only drops hidden fields.
// The popup's per-field Secondary Text (the user's custom re-label) is still
// honoured — it is an explicit rename rather than the config's own labels — and a
// heading left with no fields under it is pruned, since headings are the modal's
// tabs and an empty one would otherwise stay in the tab strip.
export function applyCustomerWidgetConfig(
  fields: ERPDynamicModalField[],
  config: Map<string, ResolvedFieldConfig>,
): ERPDynamicModalField[] {
  if (config.size === 0) {
    return fields;
  }
  const visible = applyWidgetFieldConfig(fields, config, WIDGET_FIELD_NAME_BY_FORM_FIELD, {
    mode: "visibility-only",
  });
  const relabelled = visible.map((field) => {
    const backendName = WIDGET_FIELD_NAME_BY_FORM_FIELD[field.name];
    const secondaryText = backendName
      ? (config.get(backendName.toLowerCase())?.secondaryText ?? "").trim()
      : "";
    return secondaryText ? { ...field, label: secondaryText } : field;
  });
  return pruneEmptyGroups(relabelled);
}
