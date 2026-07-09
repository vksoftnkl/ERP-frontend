import type { ERPDynamicModalField } from "@/components/design-system/ui/dynamic-modal-form";

// Shared widget-master config plumbing for master modal forms. A screen's
// hardcoded create/update fields are re-labelled, re-ordered, and shown/hidden
// from the backend widget-masters config (fixed.form_section / form_field) for
// that screen's menu id. Only those three properties come from the API —
// validation, state shape, and submit logic stay defined locally per page.

/** GET /widget-masters/get → one configured field row (server: fixed.form_field). */
export interface WidgetMasterFieldConfig {
  fieldId: number;
  fieldSectionId: number;
  fieldName: string;
  fieldGuiName: string | null;
  fieldSecondaryText: string | null;
  fieldPosition: number;
  fieldVisibility: boolean;
}
/** GET /widget-masters/get → one section with its nested fields (server: fixed.form_section). */
export interface WidgetMasterSectionConfig {
  sectionId: number;
  sectionMenuId: number;
  sectionName: string;
  sectionGuiName: string;
  sectionPosition: number;
  sectionVisibility: boolean;
  sectionPlatform: string;
  fields: WidgetMasterFieldConfig[];
}
/** Envelope returned by GET /widget-masters/get. */
export interface WidgetMastersResponse {
  success: boolean;
  data: WidgetMasterSectionConfig[];
}
/** The properties pulled from the config and applied to a hardcoded field. */
export type ResolvedFieldConfig = {
  /** fieldGuiName, trimmed; empty string means "keep the hardcoded label". */
  label: string;
  /**
   * fieldSecondaryText, trimmed; when non-empty it wins over `label` as the
   * rendered field label (it is the user's custom re-label, editable from the
   * Visible Settings popup).
   */
  secondaryText?: string;
  /** Global render order derived from sectionPosition then fieldPosition (ascending). */
  order: number;
  /** fieldVisibility; when false the field is dropped from rendering. */
  visible: boolean;
};
// Flatten the configured sections into a lookup keyed by the lowercased backend
// fieldName. Sections are ordered by sectionPosition and fields by fieldPosition
// so the assigned `order` is a stable ascending render order across the form.
export function buildWidgetFieldConfig(
  response: WidgetMastersResponse | null | undefined,
): Map<string, ResolvedFieldConfig> {
  const config = new Map<string, ResolvedFieldConfig>();
  const sections = Array.isArray(response?.data) ? response.data : [];
  const orderedSections = [...sections].sort(
    (a, b) => (a.sectionPosition ?? 0) - (b.sectionPosition ?? 0),
  );
  let order = 0;
  for (const section of orderedSections) {
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
        visible: field.fieldVisibility !== false,
      });
      order += 1;
    }
  }
  return config;
}
// Field types that carry no form value and exist only to structure the layout.
// When such a field has no configured entry it is pinned in place (see below)
// rather than pushed to the end, so a section heading stays with the group it
// introduces.
const PINNED_PRESENTATIONAL_TYPES = new Set(["heading", "subheading", "custom"]);
// Re-label, re-order, and show/hide the hardcoded fields from the config. A
// configured field with visibility=false is dropped; the rest render in the
// config's order. A non-bridged INPUT field keeps its label and renders after all
// configured fields. A non-bridged PRESENTATIONAL field (heading/subheading/custom)
// is instead pinned just before the configured field it originally preceded, so
// section headings stay with their group instead of sliding to the end.
// `fieldNameByFormField` bridges each form field `name` (camelCase aliases used by
// form state and the submit payload) to the backend `fieldName` it is configured
// under (column-style keys, matched case-insensitively).
export function applyWidgetFieldConfig(
  fields: ERPDynamicModalField[],
  config: Map<string, ResolvedFieldConfig>,
  fieldNameByFormField: Record<string, string>,
): ERPDynamicModalField[] {
  if (config.size === 0) {
    return fields;
  }
  const configured: Array<{ field: ERPDynamicModalField; order: number; index: number }> = [];
  const pinned: Array<{ field: ERPDynamicModalField; index: number }> = [];
  const trailing: ERPDynamicModalField[] = [];
  fields.forEach((field, index) => {
    const backendName = fieldNameByFormField[field.name];
    const resolved = backendName ? config.get(backendName.toLowerCase()) : undefined;
    if (resolved) {
      if (resolved.visible) {
        const configuredLabel = (resolved.secondaryText ?? "").trim() || resolved.label;
        configured.push({
          field: configuredLabel ? { ...field, label: configuredLabel } : field,
          order: resolved.order,
          index,
        });
      }
      return;
    }
    if (field.type && PINNED_PRESENTATIONAL_TYPES.has(field.type)) {
      pinned.push({ field, index });
    } else {
      trailing.push(field);
    }
  });
  // Anchor each pinned presentational field to the configured field that follows
  // it in the original order, so it sorts immediately before that field's new
  // position (config `order` values are unique, and the index tiebreak keeps the
  // pinned field ahead of its anchor and preserves the order of consecutive pinned
  // fields). A pinned field with no following configured field falls to the end of
  // the configured block (before any trailing input fields).
  const anchored = pinned.map(({ field, index }) => {
    const next = configured.find((entry) => entry.index > index);
    return { field, order: next ? next.order : Number.MAX_SAFE_INTEGER, index };
  });
  const ordered = [...configured, ...anchored].sort(
    (a, b) => a.order - b.order || a.index - b.index,
  );
  return [...ordered.map((entry) => entry.field), ...trailing];
}
/** Lowercased backend fieldNames that map to a real form field on this screen. */
export function buildControllableFieldNames(
  fieldNameByFormField: Record<string, string>,
): Set<string> {
  return new Set(Object.values(fieldNameByFormField).map((name) => name.toLowerCase()));
}
