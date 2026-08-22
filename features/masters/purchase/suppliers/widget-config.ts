import type { ERPDynamicModalField } from "@/components/design-system/ui/dynamic-modal-form";
import {
  applyWidgetFieldConfig,
  type ResolvedFieldConfig,
  type WidgetMasterSectionConfig,
} from "@/features/masters/shared/widget-config";

// Supplier Master re-labels and shows/hides its hardcoded form fields from the
// backend widget-masters config (fixed.form_section / form_field) for menu 22.
// Live form config for the modal; scoped to this screen's menu + platform.
export const WIDGET_CONFIG_ENDPOINT = "/widget-masters/get";
export const WIDGET_SECTION_MENU_ID = 22;
// fixed.form_section.section_platform is an enum (Mobile | Desktop | Web) and is
// matched case-sensitively by the server.
export const WIDGET_SECTION_PLATFORM = "Web";
// Right-click popup tree: the menu's configured sections/fields, and the PATCH
// that persists the edited section/field visibility + secondary text.
export const WIDGET_CONFIG_TREE_ENDPOINT = "/widget-masters/config";
export const WIDGET_VISIBILITY_ENDPOINT = "/widget-masters/visibility";

// Bridges each form field `name` (used by form state and the submit payload) to
// the `fixed.form_field.field_name` it is configured under, matched
// case-insensitively. Menu 22's config names fields after their labels, so the
// Regional Details tab's names carry a "Regional " prefix — without it the
// Identity tab's Address 1 / City / District / State / Country would collide with
// the regional ones and the two sets would show and hide together.
export const WIDGET_FIELD_NAME_BY_FORM_FIELD: Record<string, string> = {
  // ── Identity ──
  supGstNo: "GST_No",
  supName: "Supplier_name",
  supShort: "Short Name",
  supGroupId: "Group",
  supCompanyId: "Company",
  supBranchId: "Branch",
  supGstType: "GST Type",
  supPurchaseType: "Purchase Type",
  supPanNo: "PAN No",
  supDrugLiscenceNo: "Drug Licence No",
  supIsActive: "Active",
  supAddr1: "Address 1",
  supAddr2: "Address 2",
  supAddr3: "Address 3",
  supCity: "City",
  supDistrict: "District",
  supStateName: "State",
  supPincode: "Pincode",
  supCountry: "Country",
  supTel: "Telephone",
  supPhone: "Phone",
  supMailId: "Email",
  supWhatsappNo: "WhatsApp",
  supWebsiteAddress: "Website",
  // ── Notes ──
  supChequePreName: "Cheque Pre-Name",
  supCreditDays: "Credit Days",
  supCashDiscPerc: "Cash Disc %",
  supSortOrder: "Sort Order",
  supCollectionDays: "Collection Days",
  supNotes: "Notes",
  // ── Regional Details ──
  supRegionName: "Regional Name",
  supRegionAddr1: "Regional Address 1",
  supRegionAddr2: "Regional Address 2",
  supRegionAddr3: "Regional Address 3",
  supRegionCity: "Regional City",
  supRegionDistrict: "Regional District",
  supRegionStateName: "Regional State",
  supRegionCountry: "Regional Country",
};

// Flatten the configured sections into the lookup the apply below reads, keyed by
// the lowercased backend fieldName. Unlike the shared builder this folds section
// visibility into its fields: a section switched off in the popup hides the fields
// it holds, which is how the popup's own section checkbox behaves (it cascades to
// every field under it), so a persisted section-off state reloads the same way.
export function buildSupplierWidgetFieldConfig(
  sections: WidgetMasterSectionConfig[] | null | undefined,
): Map<string, ResolvedFieldConfig> {
  const config = new Map<string, ResolvedFieldConfig>();
  const orderedSections = [...(Array.isArray(sections) ? sections : [])].sort(
    (a, b) => (a.sectionPosition ?? 0) - (b.sectionPosition ?? 0),
  );
  let order = 0;
  for (const section of orderedSections) {
    const sectionVisible = section?.sectionVisibility !== false;
    const fields = Array.isArray(section?.fields) ? section.fields : [];
    const orderedFields = [...fields].sort(
      (a, b) => (a.fieldPosition ?? 0) - (b.fieldPosition ?? 0),
    );
    for (const field of orderedFields) {
      const key = (field?.fieldName ?? "").trim().toLowerCase();
      if (!key) {
        continue;
      }
      config.set(key, {
        label: (field.fieldGuiName ?? "").trim(),
        secondaryText: (field.fieldSecondaryText ?? "").trim(),
        order,
        visible: sectionVisible && field.fieldVisibility !== false,
      });
      order += 1;
    }
  }
  return config;
}

// Drop a heading/subheading left with nothing under it. Hiding every field of a
// tab (or of one group inside a tab) would otherwise leave an empty tab in the
// modal's tab strip; a "custom" field counts as content, so the Bank Details
// group survives — its grid is not part of the config and cannot be hidden.
function pruneEmptyGroups(fields: ERPDynamicModalField[]): ERPDynamicModalField[] {
  const keep = fields.map(() => true);
  let headingIndex = -1;
  let subheadingIndex = -1;
  let headingHasContent = false;
  let subheadingHasContent = false;
  const closeSubheading = () => {
    if (subheadingIndex >= 0 && !subheadingHasContent) {
      keep[subheadingIndex] = false;
    }
    subheadingIndex = -1;
    subheadingHasContent = false;
  };
  const closeHeading = () => {
    if (headingIndex >= 0 && !headingHasContent) {
      keep[headingIndex] = false;
    }
    headingIndex = -1;
    headingHasContent = false;
  };
  fields.forEach((field, index) => {
    if (field.type === "heading") {
      closeSubheading();
      closeHeading();
      headingIndex = index;
      return;
    }
    if (field.type === "subheading") {
      closeSubheading();
      subheadingIndex = index;
      return;
    }
    headingHasContent = true;
    subheadingHasContent = true;
  });
  closeSubheading();
  closeHeading();
  return fields.filter((_, index) => keep[index]);
}

// The tabs, groups, order, and labels of this screen are authored in
// buildSupplierFormFields — the legacy Supplier Entry layout — so the config is
// applied in "visibility-only" mode and only drops hidden fields. The popup's
// per-field Secondary Text (the user's custom re-label) is still honoured, since
// it is an explicit rename rather than the config's own field ordering/labels.
export function applySupplierWidgetConfig(
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
