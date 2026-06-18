"use client";
import { useEffect, useMemo, useState } from "react";
import CrudMasterPage from "@/components/master/crud-master-page";
import { useApi } from "@/hooks/useApi";
import type {
  ERPDynamicModalField,
  ERPDynamicSelectOption,
} from "@/components/design-system/ui/dynamic-modal-form";
import styles from "@/app/master/state-master/page.module.scss";
import {
  DEFAULT_LOOKUP_ARRAY_KEYS,
  buildLookupOptions,
  getFirstDefinedValue,
  toDisplayValue,
  toNullableString,
  toSelectBoolean,
  toUpdateId,
} from "@/app/master/_shared/crud-utils";
const API_ENDPOINTS = {
list: "/configured-grid-sql/run?grid_id=6",
  getById: "/item-groups/get",
  create: "/item-groups/create",
  delete: "/item-groups/delete",
} as const;
const GRID_TABLE_NAME = "item_group_master";
// The form fields below are re-labelled, re-ordered, and shown/hidden from the
// backend widget-masters config (fixed.form_section / form_field) for this
// screen's menu id. Only those three properties come from the API — validation,
// state shape, and submit logic stay defined locally.
const WIDGET_CONFIG_ENDPOINT = "/widget-masters/get";
const WIDGET_SECTION_MENU_ID = 35;
const WIDGET_SECTION_PLATFORM = "web";
// Bridge each hardcoded form field `name` (camelCase aliases used by form state
// and the submit payload) to the backend `fieldName` it is configured under
// (itg_* column-style keys, matched case-insensitively). Form fields with no
// mapping — or no matching response entry — keep their hardcoded label and
// render after all configured fields.
const WIDGET_FIELD_NAME_BY_FORM_FIELD: Record<string, string> = {
  masterName: "itg_name",
  masterShortName: "itg_short",
  position: "itg_position",
  parentGroupId: "itg_parent_group",
  masterDescription: "itg_description",
  itgPhoto: "itg_image",
};
const PARENT_GROUP_LOOKUP_ENDPOINT = "/master-lookups/name-id/all-accounts-and-masters";
const PARENT_GROUP_LOOKUP_QUERY = {
  module: "itemGroups",
  limit: "100",
} as const;
const LOOKUP_KEYS = {
  id: ["itg_id", "group_id", "groupId", "id", "_id", "item_group_id", "itemGroupId"],
  code: ["itg_alias", "itg_short", "group_code", "groupCode", "code", "groupalias", "groupshort"],
  name: ["itg_name", "group_name", "groupName", "name", "itemgroupname", "item_group_name", "itemGroupName"],
  short: ["itg_short", "short_name", "shortName", "short", "groupshort", "item_group_short"],
  alias: ["itg_alias", "alias", "group_alias", "groupalias", "item_group_alias"],
  active: ["itg_is_active", "itg_active", "active", "is_active", "isActive", "status"],
  position: ["itg_sort", "position", "sort"],
  description: ["itg_description", "description", "desc"],
  array: ["data", "items", "results", "rows", "list", "groups", "itemGroups"],
} as const;
const REQUEST_PAYLOAD_KEYS = {
  id: "itg_id",
  name: "itg_name",
  alias: "itg_alias",
  short: "itg_short",
  description: "itg_description",
  sort: "itg_sort",
} as const;
const GROUP_PARENT_ID_KEYS = ["itg_parent_id", "parent_id", "parentId", "parent_group_id", "parentGroupId"] as const;
const GROUP_LEVEL_KEYS = ["itg_level", "level", "group_level", "groupLevel"] as const;
const GROUP_TAX_CLAIM_KEYS = ["itg_tax_claim", "tax_claim", "taxClaim"] as const;
const GROUP_DEFAULT_TAX_ID_KEYS = ["itg_default_tax_id", "default_tax_id", "defaultTaxId"] as const;
const GROUP_DEFAULT_HSN_KEYS = ["itg_default_hsn", "default_hsn", "defaultHsn", "hsn_code", "hsnCode"] as const;
const GROUP_DEFAULT_UOM_ID_KEYS = ["itg_default_uom_id", "default_uom_id", "defaultUomId"] as const;
const GROUP_PHOTO_URL_KEYS = ["itg_photo_url", "photo_url", "photoUrl"] as const;
const FILE_CONSTRAINTS = {
  MAX_UPLOAD_IMAGE_BYTES: 5 * 1024 * 1024,
  ALLOWED_MIME_TYPES: [
    "image/png",
    "image/jpeg",
    "image/jpg",
    "image/webp",
    "image/gif",
    "image/svg+xml",
  ] as const,
} as const;
const DEFAULT_PARENT_OPTION: ERPDynamicSelectOption = {
  value: "",
  label: "None",
};
const INITIAL_FORM_VALUES = {
  masterName: "",
  searchCode: "",
  masterAlias: "",
  masterShortName: "",
  masterDescription: "",
  position: "0",
  parentGroupId: "",
  groupLevel: "0",
  groupTaxClaim: "false",
  groupDefaultTaxId: "",
  groupDefaultHsn: "",
  groupDefaultUomId: "",
  groupPhotoUrl: "",
} as const;
/** GET /widget-masters/get → one configured field row (server: fixed.form_field). */
interface WidgetMasterFieldConfig {
  fieldId: number;
  fieldSectionId: number;
  fieldName: string;
  fieldGuiName: string | null;
  fieldSecondaryText: string | null;
  fieldPosition: number;
  fieldVisibility: boolean;
}
/** GET /widget-masters/get → one section with its nested fields (server: fixed.form_section). */
interface WidgetMasterSectionConfig {
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
interface WidgetMastersResponse {
  success: boolean;
  data: WidgetMasterSectionConfig[];
}
/** The three properties pulled from the config and applied to a hardcoded field. */
type ResolvedFieldConfig = {
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
function buildWidgetFieldConfig(
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
function applyWidgetFieldConfig(
  fields: ERPDynamicModalField[],
  config: Map<string, ResolvedFieldConfig>,
): ERPDynamicModalField[] {
  if (config.size === 0) {
    return fields;
  }
  const configured: Array<{ field: ERPDynamicModalField; order: number; index: number }> = [];
  const unconfigured: ERPDynamicModalField[] = [];
  fields.forEach((field, index) => {
    const backendName = WIDGET_FIELD_NAME_BY_FORM_FIELD[field.name];
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

function buildItemGroupFormFields(parentOptions: ERPDynamicSelectOption[]): ERPDynamicModalField[] {
  return [
    {
      name: "masterName",
      label: "Item Group Name",
      required: true,
      colSpan: 2,
      validation: {
        minLength: 2,
        minLengthMessage: "Item Group Name must be at least 2 characters.",
      },
    },
    {
      name: "masterShortName",
      label: "Short Name",
      colSpan: 2,
    },
    {
      name: "position",
      label: "Position",
      type: "number",
      colSpan: 1,
      min: 0,
      step: 1,
      validation: {
        minMessage: "Position must be 0 or greater.",
      },
    },
    {
      name: "parentGroupId",
      label: "Parent Group",
      type: "select",
      colSpan: 2,
      searchable: true,
      options: parentOptions,
    },
    {
      name: "masterDescription",
      label: "Description",
      type: "textarea",
      colSpan: 2,
    },
    {
      name: "itgPhoto",
      label: "Image",
      type: "file",
      accept: "image/*",
      maxFileSizeBytes: FILE_CONSTRAINTS.MAX_UPLOAD_IMAGE_BYTES,
      allowedMimeTypes: [...FILE_CONSTRAINTS.ALLOWED_MIME_TYPES],
      helperText: "Optional. Sent as base64 in itg_photo.",
      colSpan: 2,
    },
  ];
}

function toInteger(value: string, fallback: number): number {
  const parsed = Number.parseInt(value.trim(), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toNullableReference(value: string): string | null {
  const normalized = value.trim();
  return normalized ? normalized : null;
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== "string") {
        reject(new Error("Unable to read selected image."));
        return;
      }
      resolve(reader.result);
    };
    reader.onerror = () => reject(new Error("Unable to read selected image."));
    reader.readAsDataURL(file);
  });
}

function getBase64FromDataUrl(dataUrl: string): string {
  const commaIndex = dataUrl.indexOf(",");
  return commaIndex >= 0 ? dataUrl.slice(commaIndex + 1) : dataUrl;
}

export default function ItemGroupMasterPage() {
  const { getAll: getParentGroupLookup } = useApi<unknown>(PARENT_GROUP_LOOKUP_ENDPOINT);
  // Silent progressive enhancement: a failed config fetch leaves the form on its
  // hardcoded labels/order (empty map), so don't nag the user with an error toast.
  const { getAll: getWidgetConfig } = useApi<WidgetMastersResponse>(WIDGET_CONFIG_ENDPOINT, {
    toast: { error: false },
  });
  const [parentOptions, setParentOptions] = useState<ERPDynamicSelectOption[]>([
    DEFAULT_PARENT_OPTION,
  ]);
  const [widgetFieldConfig, setWidgetFieldConfig] = useState<Map<string, ResolvedFieldConfig>>(
    () => new Map(),
  );

  useEffect(() => {
    let mounted = true;
    void (async () => {
      try {
        const payload = await getWidgetConfig({
          sectionMenuId: String(WIDGET_SECTION_MENU_ID),
          sectionPlatform: WIDGET_SECTION_PLATFORM,
        });
        if (!mounted) {
          return;
        }
        setWidgetFieldConfig(buildWidgetFieldConfig(payload ?? null));
      } catch {
        if (mounted) {
          setWidgetFieldConfig(new Map());
        }
      }
    })();
    return () => {
      mounted = false;
    };
  }, [getWidgetConfig]);

  useEffect(() => {
    let mounted = true;
    void (async () => {
      try {
        const payload = await getParentGroupLookup(PARENT_GROUP_LOOKUP_QUERY);
        if (!mounted) {
          return;
        }
        setParentOptions(
          buildLookupOptions(payload, DEFAULT_PARENT_OPTION, {
            arrayKeys: DEFAULT_LOOKUP_ARRAY_KEYS,
            idKeys: ["id", "value", "itg_id"],
            labelKeys: ["name", "label", "itg_name"],
          }),
        );
      } catch {
        if (mounted) {
          setParentOptions([DEFAULT_PARENT_OPTION]);
        }
      }
    })();
    return () => {
      mounted = false;
    };
  }, [getParentGroupLookup]);

  const formFields = useMemo(
    () => applyWidgetFieldConfig(buildItemGroupFormFields(parentOptions), widgetFieldConfig),
    [parentOptions, widgetFieldConfig],
  );

  return (
    <CrudMasterPage
      title="Item Group"
      auditHistory={{ screenName: "Item Group Master" }}
      entityLabel="item group"
      entityLabelPlural="item groups"
      apiEndpoints={API_ENDPOINTS}
      gridTableName={GRID_TABLE_NAME}
        listResponseStyleArrayKey=""
      lookupKeys={LOOKUP_KEYS}
      requestPayloadKeys={REQUEST_PAYLOAD_KEYS}
      styles={styles}
      listTitle="Item Group List"
      listTitleOverride="Item Group List"
      createLabel="Add Item Group"
      codeColumnHeader="Group Code"
      nameColumnHeader="Group Name"
      nameFieldLabel="Item Group Name"
      nameFieldPlaceholder="Enter item group name"
      formTitle="Item Group Form"
      formDescription="Create and update item groups."
        viewModalTitle="Group Details"
      createModalTitle="Group Entry"
      editModalTitle="Edit Group Entry"
      customFields={formFields}
      createInitialValues={INITIAL_FORM_VALUES}
      modalPanelStyle={{ width: "min(52rem, calc(100vw - 2rem))", maxHeight: "min(82vh, 42rem)" }}
      mapFormValues={({ source, defaults }) => {
        const rowSource = source ?? {};
        return {
          ...INITIAL_FORM_VALUES,
          masterName:
            toDisplayValue(getFirstDefinedValue(rowSource, LOOKUP_KEYS.name)) || defaults.masterName,
          searchCode:
            toDisplayValue(getFirstDefinedValue(rowSource, LOOKUP_KEYS.code)) || defaults.searchCode,
          masterAlias:
            toDisplayValue(getFirstDefinedValue(rowSource, LOOKUP_KEYS.alias)) || defaults.masterAlias,
          masterShortName:
            toDisplayValue(getFirstDefinedValue(rowSource, LOOKUP_KEYS.short)) || defaults.masterShortName,
          masterDescription:
            toDisplayValue(getFirstDefinedValue(rowSource, LOOKUP_KEYS.description)) || defaults.masterDescription,
          position:
            toDisplayValue(getFirstDefinedValue(rowSource, LOOKUP_KEYS.position)) || defaults.position,
          parentGroupId: toDisplayValue(getFirstDefinedValue(rowSource, GROUP_PARENT_ID_KEYS)),
          groupLevel: toDisplayValue(getFirstDefinedValue(rowSource, GROUP_LEVEL_KEYS)) || "0",
          groupTaxClaim: toSelectBoolean(
            getFirstDefinedValue(rowSource, GROUP_TAX_CLAIM_KEYS),
            "false",
          ),
          groupDefaultTaxId: toDisplayValue(getFirstDefinedValue(rowSource, GROUP_DEFAULT_TAX_ID_KEYS)),
          groupDefaultHsn: toDisplayValue(getFirstDefinedValue(rowSource, GROUP_DEFAULT_HSN_KEYS)),
          groupDefaultUomId: toDisplayValue(getFirstDefinedValue(rowSource, GROUP_DEFAULT_UOM_ID_KEYS)),
          groupPhotoUrl: toDisplayValue(getFirstDefinedValue(rowSource, GROUP_PHOTO_URL_KEYS)),
        };
      }}
      buildRequestPayload={async ({ values, shouldUpdate, editingItemId, files }) => {
        const groupName = (values.masterName ?? "").trim();
        const groupCode = (values.searchCode ?? "").trim();
        const groupAlias = (values.masterAlias ?? "").trim() || groupCode;
        const groupShort = (values.masterShortName ?? "").trim() || groupCode || groupAlias;
        const groupDescription = toNullableString(values.masterDescription ?? "");
        const uploadedImage = files.itgPhoto;
        const groupPhoto =
          uploadedImage && uploadedImage.size > 0
            ? getBase64FromDataUrl(await readFileAsDataUrl(uploadedImage))
            : undefined;

        return {
          itg_name: groupName,
          itg_alias: groupAlias || null,
          itg_short: groupShort || null,
          itg_description: groupDescription,
          itg_parent_id: toNullableReference(values.parentGroupId ?? ""),
          itg_sort: toInteger(values.position ?? "0", 0),
          itg_level: Math.max(0, toInteger(values.groupLevel ?? "0", 0)),
          itg_tax_claim: (values.groupTaxClaim ?? "false") === "true",
          itg_default_tax_id: toNullableReference(values.groupDefaultTaxId ?? ""),
          itg_default_hsn: (values.groupDefaultHsn ?? "").trim(),
          itg_default_uom_id: toNullableReference(values.groupDefaultUomId ?? ""),
          itg_photo_url: (values.groupPhotoUrl ?? "").trim(),
          ...(groupPhoto ? { itg_photo: groupPhoto } : {}),
          ...(shouldUpdate && editingItemId !== null ? { itg_id: toUpdateId(editingItemId) } : {}),
        };
      }}
    />
  );
}
