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
/** The three properties pulled from the config and applied to a hardcoded field. */
export type ResolvedFieldConfig = {
  /** fieldGuiName, trimmed; empty string means "keep the hardcoded label". */
  label: string;
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
        order,
        visible: field.fieldVisibility !== false,
      });
      order += 1;
    }
  }
  return config;
}
// Re-label, re-order, and show/hide the hardcoded fields from the config. A field
// with no configured entry keeps its label and is rendered after configured ones;
// a configured field with visibility=false is dropped. Nothing else is touched.
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
  const unconfigured: ERPDynamicModalField[] = [];
  fields.forEach((field, index) => {
    const backendName = fieldNameByFormField[field.name];
    const resolved = backendName ? config.get(backendName.toLowerCase()) : undefined;
    if (!resolved) {
      unconfigured.push(field);
      return;
    }
    if (!resolved.visible) {
      return;
    }
    configured.push({
      field: resolved.label ? { ...field, label: resolved.label } : field,
      order: resolved.order,
      index,
    });
  });
  configured.sort((a, b) => a.order - b.order || a.index - b.index);
  return [...configured.map((entry) => entry.field), ...unconfigured];
}
/** Lowercased backend fieldNames that map to a real form field on this screen. */
export function buildControllableFieldNames(
  fieldNameByFormField: Record<string, string>,
): Set<string> {
  return new Set(Object.values(fieldNameByFormField).map((name) => name.toLowerCase()));
}
