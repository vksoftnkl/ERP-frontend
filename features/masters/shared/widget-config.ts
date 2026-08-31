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
/** The flatten below, for callers holding the whole `/widget-masters/get` envelope. */
export function buildWidgetFieldConfig(
  response: WidgetMastersResponse | null | undefined,
): Map<string, ResolvedFieldConfig> {
  return buildWidgetFieldConfigFromSections(response?.data);
}
// Flatten the configured sections into a lookup keyed by the lowercased backend
// fieldName. Sections are ordered by sectionPosition and fields by fieldPosition
// so the assigned `order` is a stable ascending render order across the form.
//
// Takes the sections rather than the response envelope, for screens that fetch
// the config through RTK Query and unwrap `data` in their `transformResponse`.
export function buildWidgetFieldConfigFromSections(
  sections: WidgetMasterSectionConfig[] | null | undefined,
  options?: { foldSectionVisibility?: boolean },
): Map<string, ResolvedFieldConfig> {
  const config = new Map<string, ResolvedFieldConfig>();
  const orderedSections = [...(Array.isArray(sections) ? sections : [])].sort(
    (a, b) => (a.sectionPosition ?? 0) - (b.sectionPosition ?? 0),
  );
  let order = 0;
  for (const section of orderedSections) {
    // `foldSectionVisibility`: a section switched off hides every field under it,
    // matching how the Visible Settings popup's section switch behaves (it cascades
    // to its fields), so a persisted section-off state reloads the same way instead
    // of coming back with all of that section's fields visible.
    const sectionHidden =
      options?.foldSectionVisibility === true && section?.sectionVisibility === false;
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
        visible: !sectionHidden && field.fieldVisibility !== false,
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
  options?: { mode?: "reorder" | "visibility-only" },
): ERPDynamicModalField[] {
  if (config.size === 0) {
    return fields;
  }
  // "visibility-only": the page's hardcoded field order and labels are the source
  // of truth (its layout is designed in code), so the config is used solely to
  // drop fields an admin has hidden. Order, grouping (headings/subheadings), and
  // labels stay exactly as authored; a bridged field with visibility=false is
  // removed, everything else is kept in place.
  if (options?.mode === "visibility-only") {
    return fields.filter((field) => {
      const backendName = fieldNameByFormField[field.name];
      const resolved = backendName ? config.get(backendName.toLowerCase()) : undefined;
      return resolved ? resolved.visible : true;
    });
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
// Drop a heading/subheading left with nothing under it. On screens whose headings
// are the modal's TABS, hiding every field of a tab would otherwise leave an empty
// tab in the strip (and an empty group inside a tab). A "custom" field counts as
// content — what it renders lives outside the config and cannot be hidden from it.
export function pruneEmptyGroups(fields: ERPDynamicModalField[]): ERPDynamicModalField[] {
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
/**
 * Picks, for each form field, the backend `field_name` that this deployment's
 * config actually uses.
 *
 * Why aliases: the same screen's `fixed.form_field` rows are named differently
 * from database to database. A menu seeded from `prisma/seed` carries the form's
 * binding keys (`item_allow_sales`); a menu re-authored in the widget-master
 * admin UI carries the LABEL instead (`Allow Sales`). A map hardcoded to either
 * one binds nothing on a site running the other — the whole popup then comes up
 * empty ("No fields configured.") because nothing is controllable, and "fix the
 * map" just moves the breakage to the other environment.
 *
 * So each form field declares every name it has ever been configured under, and
 * the winner is chosen from the names the server returned. A form field whose
 * aliases are all absent falls back to its first alias, which simply stays
 * unmatched — the same harmless no-op as an unbridged field.
 */
export function resolveWidgetFieldNameMap(
  aliasesByFormField: Record<string, readonly string[]>,
  configuredFieldNames: Iterable<string>,
): Record<string, string> {
  const available = new Set<string>();
  for (const name of configuredFieldNames) {
    available.add((name ?? "").trim().toLowerCase());
  }
  const resolved: Record<string, string> = {};
  for (const [formField, aliases] of Object.entries(aliasesByFormField)) {
    if (aliases.length === 0) {
      continue;
    }
    resolved[formField] =
      aliases.find((alias) => available.has(alias.trim().toLowerCase())) ?? aliases[0];
  }
  return resolved;
}
/** Lowercased backend fieldNames that map to a real form field on this screen. */
export function buildControllableFieldNames(
  fieldNameByFormField: Record<string, string>,
): Set<string> {
  return new Set(Object.values(fieldNameByFormField).map((name) => name.toLowerCase()));
}
