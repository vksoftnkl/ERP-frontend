"use client";
import { useEffect, useMemo, useState } from "react";
import CrudMasterPage from "@/components/master/crud-master-page";
import { useApi } from "@/hooks/useApi";
import type {
  ERPDynamicModalField,
  ERPDynamicSelectOption,
} from "@/components/library/ui/dynamic-modal-form";
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
  list: "/item-groups/list",
  getById: "/item-groups/get",
  create: "/item-groups/create",
  delete: "/item-groups/delete",
} as const;
const GRID_TABLE_NAME = "item_group_master";
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
  const [parentOptions, setParentOptions] = useState<ERPDynamicSelectOption[]>([
    DEFAULT_PARENT_OPTION,
  ]);

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
    () => buildItemGroupFormFields(parentOptions),
    [parentOptions],
  );

  return (
    <CrudMasterPage
      title="Item Group"
      auditHistory={{ screenName: "Item Group Master" }}
      entityLabel="item group"
      entityLabelPlural="item groups"
      apiEndpoints={API_ENDPOINTS}
      gridTableName={GRID_TABLE_NAME}
      useResponseTableColumns
      lookupKeys={LOOKUP_KEYS}
      requestPayloadKeys={REQUEST_PAYLOAD_KEYS}
      styles={styles}
      listTitle="Item Group List"
      createLabel="Add Item Group"
      codeColumnHeader="Group Code"
      nameColumnHeader="Group Name"
      nameFieldLabel="Item Group Name"
      nameFieldPlaceholder="Enter item group name"
      formTitle="Item Group Form"
      formDescription="Create and update item groups."
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
