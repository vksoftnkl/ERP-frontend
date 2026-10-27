import {
  getFirstDefinedValue,
  toDisplayValue,
  toNonNegativeInteger,
  toNullableString,
  toSelectBoolean,
  toUpdateId,
} from "@/features/masters/shared/value-mappers";
import type { WidgetFieldDraft, WidgetPlatform, WidgetTypeFilter } from "./type";

const SECTION_ID_KEYS = ["sectionId", "section_id", "id", "_id"] as const;
const SECTION_MENU_ID_KEYS = ["sectionMenuId", "section_menu_id", "menuId", "menu_id"] as const;
const SECTION_NAME_KEYS = ["sectionName", "section_name", "name"] as const;
const SECTION_GUI_NAME_KEYS = ["sectionGuiName", "section_gui_name", "guiName"] as const;
const SECTION_PLATFORM_KEYS = ["sectionPlatform", "section_platform", "platform", "type"] as const;
const SECTION_VISIBILITY_KEYS = [
  "sectionVisibility",
  "section_visibility",
  "visible",
  "isVisible",
] as const;
const SECTION_POSITION_KEYS = ["sectionPosition", "section_position", "position", "sort"] as const;
const SECTION_FIELDS_KEYS = ["fields", "field", "sectionFields"] as const;
const RESPONSE_ARRAY_KEYS = ["data", "items", "results", "rows", "list", "sections"] as const;
export const WIDGET_PLATFORM_OPTIONS: Array<{ label: string; value: WidgetPlatform }> = [
  { label: "Desktop", value: "Desktop" },
  { label: "Mobile", value: "Mobile" },
  { label: "Web", value: "Web" },
];
export const FILTER_PLATFORM_OPTIONS: Array<{ label: string; value: WidgetTypeFilter }> = [
  { label: "All Platforms", value: "all" },
  ...WIDGET_PLATFORM_OPTIONS,
];
const MENU_CHILDREN_KEYS = ["children", "items", "subMenus"] as const;
export function parseFieldDrafts(value: string | undefined): WidgetFieldDraft[] {
  if (!value) {
    return [];
  }
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.map((entry) => normalizeDraft(entry));
  } catch {
    return [];
  }
}
export function serializeFieldDrafts(drafts: WidgetFieldDraft[]): string {
  return JSON.stringify(drafts);
}
function normalizeDraft(entry: unknown): WidgetFieldDraft {
  const source = (entry ?? {}) as Record<string, unknown>;
  const rawId = source.fieldId;
  const fieldId =
    typeof rawId === "number"
      ? rawId
      : typeof rawId === "string" && rawId.trim() !== "" && Number.isFinite(Number(rawId))
        ? Number(rawId)
        : undefined;
  return {
    ...(fieldId !== undefined ? { fieldId } : {}),
    fieldName: toText(source.fieldName),
    fieldGuiName: toText(source.fieldGuiName),
    fieldSecondaryText: toText(source.fieldSecondaryText),
    fieldPosition: toText(source.fieldPosition),
    fieldVisibility: source.fieldVisibility !== false,
  };
}
function toText(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }
  return String(value);
}
export function emptyDraft(position: number): WidgetFieldDraft {
  return {
    fieldName: "",
    fieldGuiName: "",
    fieldSecondaryText: "",
    fieldPosition: String(position),
    fieldVisibility: true,
  };
}
/** A row counts as started once any of its text columns has content. */
export function isDraftStarted(draft: WidgetFieldDraft): boolean {
  return [draft.fieldName, draft.fieldGuiName, draft.fieldSecondaryText].some(
    (column) => (column ?? "").trim().length > 0,
  );
}
/** Walk the nested menu payload into a flat list so every menu (parent + leaf) is selectable. */
export function flattenMenuRecords(payload: unknown): Record<string, unknown>[] {
  const root =
    payload && typeof payload === "object" && !Array.isArray(payload)
      ? (payload as Record<string, unknown>).data ?? payload
      : payload;
  const flat: Record<string, unknown>[] = [];
  const walk = (nodes: unknown): void => {
    if (!Array.isArray(nodes)) {
      return;
    }
    for (const node of nodes) {
      if (!node || typeof node !== "object" || Array.isArray(node)) {
        continue;
      }
      const record = node as Record<string, unknown>;
      flat.push(record);
      for (const key of MENU_CHILDREN_KEYS) {
        walk(record[key]);
      }
    }
  };
  walk(root);
  return flat;
}
export function toWidgetPlatform(value: unknown, fallback: WidgetPlatform = "Desktop"): WidgetPlatform {
  const normalized = toDisplayValue(value).trim().toLowerCase();
  if (normalized === "mobile") {
    return "Mobile";
  }
  if (normalized === "desktop") {
    return "Desktop";
  }
  if (normalized === "web") {
    return "Web";
  }
  return fallback;
}
export function toBoolean(value: unknown, fallback = false): boolean {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    return value > 0;
  }
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "1", "yes", "y", "on", "visible"].includes(normalized)) {
      return true;
    }
    if (["false", "0", "no", "n", "off", "hidden"].includes(normalized)) {
      return false;
    }
  }
  return fallback;
}
export function getSectionFields(source: Record<string, unknown> | null | undefined): Record<string, unknown>[] {
  if (!source) {
    return [];
  }
  const value = getFirstDefinedValue(source, SECTION_FIELDS_KEYS);
  return Array.isArray(value) ? (value as Record<string, unknown>[]) : [];
}
export function extractSectionsArray(source: Record<string, unknown> | null): Record<string, unknown>[] {
  if (!source) {
    return [];
  }
  const value = getFirstDefinedValue(source, RESPONSE_ARRAY_KEYS);
  return Array.isArray(value) ? (value as Record<string, unknown>[]) : [];
}
export function fieldPayloadToDraft(field: Record<string, unknown>): WidgetFieldDraft {
  const rawId = getFirstDefinedValue(field, ["fieldId", "field_id", "id"]);
  const fieldId =
    typeof rawId === "number"
      ? rawId
      : typeof rawId === "string" && rawId.trim() !== "" && Number.isFinite(Number(rawId))
        ? Number(rawId)
        : undefined;
  return {
    ...(fieldId !== undefined ? { fieldId } : {}),
    fieldName: toDisplayValue(getFirstDefinedValue(field, ["fieldName", "field_name", "name"])),
    fieldGuiName: toDisplayValue(getFirstDefinedValue(field, ["fieldGuiName", "field_gui_name", "guiName"])),
    fieldSecondaryText: toDisplayValue(
      getFirstDefinedValue(field, ["fieldSecondaryText", "field_secondary_text", "secondaryText"]),
    ),
    fieldPosition: toDisplayValue(getFirstDefinedValue(field, ["fieldPosition", "field_position", "position"])) || "0",
    fieldVisibility: toBoolean(
      getFirstDefinedValue(field, ["fieldVisibility", "field_visibility", "visible"]),
      true,
    ),
  };
}
export function buildCreateDefaults(
  platformFilter: WidgetTypeFilter,
  menuIdFilter: string,
): Record<string, string> {
  return {
    sectionName: "",
    sectionGuiName: "",
    sectionMenuId: menuIdFilter || "",
    sectionPosition: "0",
    sectionPlatform: platformFilter === "all" ? "Desktop" : platformFilter,
    sectionVisibility: "true",
    fields: serializeFieldDrafts([]),
  };
}
/** Blocks the save when a Fields row has text in it but no Field Name. */
export function fieldsValidationMessage(rawValue: string | undefined): string | null {
  const namelessRow = parseFieldDrafts(rawValue).some(
    (draft) =>
      draft.fieldName.trim().length === 0 &&
      [draft.fieldGuiName, draft.fieldSecondaryText].some(
        (column) => (column ?? "").trim().length > 0,
      ),
  );
  return namelessRow
    ? "Each field needs a Field Name (the internal key, e.g. item_name). Fill it in or remove the row."
    : null;
}
export function buildWidgetListQuery({
  searchTerm,
  currentPage,
  pageSize,
  menuIdFilter,
  platformFilter,
}: {
  searchTerm: string;
  currentPage: number;
  pageSize: number;
  menuIdFilter: string;
  platformFilter: WidgetTypeFilter;
}): Record<string, string> | null {
  const menuid = menuIdFilter.trim();
  if (menuid === "" || platformFilter === "all") {
    return null;
  }
  return {
    page: String(currentPage),
    limit: String(pageSize),
    ...(searchTerm ? { search: searchTerm } : {}),
    grid_param: JSON.stringify({ menuid, platform: platformFilter }),
  };
}
export function buildListEmptyText(
  menuIdFilter: string,
  platformFilter: WidgetTypeFilter,
): string | undefined {
  const hasRequiredFilters = menuIdFilter.trim() !== "" && platformFilter !== "all";
  if (hasRequiredFilters) {
    return undefined;
  }
  const missing = [
    ...(platformFilter === "all" ? ["a platform"] : []),
    ...(menuIdFilter.trim() === "" ? ["a menu"] : []),
  ];
  return `Select ${missing.join(" and ")} to list sections.`;
}
export function buildFilterSummary(
  platformFilter: WidgetTypeFilter,
  menuIdFilter: string,
  menuFilterOptions: Array<{ label: string; value: string }>,
): string {
  const platformLabel =
    FILTER_PLATFORM_OPTIONS.find((option) => option.value === platformFilter)?.label ??
    "All Platforms";
  const menuLabel = menuIdFilter
    ? menuFilterOptions.find((option) => option.value === menuIdFilter)?.label ??
      `Menu #${menuIdFilter}`
    : "All Menus";
  return `${platformLabel} • ${menuLabel}`;
}
export function buildWidgetGetByIdQuery({
  rowSource,
  menuIdFilter,
  platformFilter,
}: {
  rowSource: Record<string, unknown> | null;
  menuIdFilter: string;
  platformFilter: WidgetTypeFilter;
}) {
  const sectionMenuId = rowSource
    ? toDisplayValue(getFirstDefinedValue(rowSource, SECTION_MENU_ID_KEYS))
    : menuIdFilter;
  const platform = rowSource
    ? toWidgetPlatform(
        getFirstDefinedValue(rowSource, SECTION_PLATFORM_KEYS),
        platformFilter === "all" ? "Desktop" : platformFilter,
      )
    : platformFilter !== "all"
      ? platformFilter
      : null;
  return {
    query: {
      ...(sectionMenuId ? { sectionMenuId } : {}),
      ...(platform ? { sectionPlatform: platform } : {}),
    },
  };
}
/** `source` is the GET /get envelope ({ data: Section[] }); match by id. */
export function pickDetailSection({
  recordId,
  source,
  rowSource,
}: {
  recordId: string | number;
  source: Record<string, unknown> | null;
  rowSource: Record<string, unknown> | null;
}): Record<string, unknown> | null {
  const sections = extractSectionsArray(source);
  const match = sections.find(
    (section) => String(getFirstDefinedValue(section, SECTION_ID_KEYS)) === String(recordId),
  );
  return match ?? rowSource ?? null;
}
export function mapWidgetFormValues({
  source,
  platformFilter,
}: {
  source: Record<string, unknown> | null;
  platformFilter: WidgetTypeFilter;
}): Record<string, string> {
  const rowSource = source ?? {};
  const drafts = getSectionFields(rowSource).map(fieldPayloadToDraft);
  return {
    sectionName: toDisplayValue(getFirstDefinedValue(rowSource, SECTION_NAME_KEYS)) || "",
    sectionGuiName:
      toDisplayValue(getFirstDefinedValue(rowSource, SECTION_GUI_NAME_KEYS)) || "",
    sectionMenuId:
      toDisplayValue(getFirstDefinedValue(rowSource, SECTION_MENU_ID_KEYS)) || "",
    sectionPosition:
      toDisplayValue(getFirstDefinedValue(rowSource, SECTION_POSITION_KEYS)) || "0",
    sectionPlatform: toWidgetPlatform(
      getFirstDefinedValue(rowSource, SECTION_PLATFORM_KEYS),
      platformFilter === "all" ? "Desktop" : platformFilter,
    ),
    sectionVisibility: toSelectBoolean(
      getFirstDefinedValue(rowSource, SECTION_VISIBILITY_KEYS),
      "true",
    ),
    fields: serializeFieldDrafts(drafts),
  };
}
export function buildWidgetRequestPayload({
  values,
  shouldUpdate,
  editingItemId,
}: {
  values: Record<string, string>;
  shouldUpdate: boolean;
  editingItemId: string | number | null;
}): Record<string, unknown> {
  const fields = parseFieldDrafts(values.fields)
    .map((draft) => ({
      ...(draft.fieldId !== undefined ? { fieldId: draft.fieldId } : {}),
      fieldName: draft.fieldName.trim(),
      fieldGuiName: toNullableString(draft.fieldGuiName ?? ""),
      fieldSecondaryText: toNullableString(draft.fieldSecondaryText ?? ""),
      fieldPosition: toNonNegativeInteger(draft.fieldPosition ?? "0", 0),
      fieldVisibility: (draft.fieldVisibility ?? true) !== false,
    }))
    .filter((field) => field.fieldName.length > 0);
  return {
    sectionMenuId: toNonNegativeInteger(values.sectionMenuId ?? "", 0),
    sectionName: (values.sectionName ?? "").trim(),
    sectionGuiName: (values.sectionGuiName ?? "").trim(),
    sectionPosition: toNonNegativeInteger(values.sectionPosition ?? "0", 0),
    sectionVisibility: (values.sectionVisibility ?? "true") === "true",
    sectionPlatform: toWidgetPlatform(values.sectionPlatform),
    fields,
    ...(shouldUpdate ? { sectionId: toUpdateId(editingItemId) } : {}),
  };
}
