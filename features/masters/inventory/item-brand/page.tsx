"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
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
  toUpdateId,
} from "@/app/master/_shared/crud-utils";
const API_ENDPOINTS = {
  list: "/configured-grid-sql/run?grid_id=7",
  getById: "/item-brands/get",
  create: "/item-brands/create",
  delete: "/item-brands/delete",
} as const;
const GRID_TABLE_NAME = "item_brand_master";
const PARENT_BRAND_LOOKUP_ENDPOINT = "/master-lookups/name-id/all-accounts-and-masters";
const PARENT_BRAND_LOOKUP_QUERY = {
  module: "itemBrands",
  limit: "100",
} as const;
const LOOKUP_KEYS = {
  id: ["brand_id", "brandId", "id", "_id", "itb_id", "item_brand_id", "itemBrandId"],
  code: ["brand_alias", "brandAlias", "brand_short", "brandShort", "code", "itb_alias", "itb_short"],
  name: ["brand_name", "brandName", "name", "itb_name", "itembrandname", "item_brand_name", "itemBrandName"],
  short: ["brand_short", "brandShort", "itb_short", "short_name", "shortName", "short"],
  alias: ["brand_alias", "brandAlias", "itb_alias", "alias", "item_brand_alias"],
  active: ["brand_is_active", "brandIsActive", "itb_active", "active", "is_active", "isActive", "status"],
  position: ["brand_sort", "brandSort", "position", "itb_sort", "sort"],
  description: ["brand_description", "brandDescription", "itb_description", "description", "desc"],
  array: ["data", "items", "results", "rows", "list", "brands", "itemBrands"],
} as const;
const REQUEST_PAYLOAD_KEYS = {
  id: "brand_id",
  name: "brand_name",
  alias: "brand_alias",
  short: "brand_short",
  description: "brand_description",
  sort: "brand_sort",
} as const;
const BRAND_PARENT_ID_KEYS = ["brand_parent_id", "brandParentId", "parent_id", "parentId", "parent_brand_id", "parentBrandId"] as const;
const BRAND_LEVEL_KEYS = ["brand_level", "brandLevel", "level"] as const;
const BRAND_PHOTO_URL_KEYS = ["brand_photo_url", "brandPhotoUrl", "photo_url", "photoUrl"] as const;
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
  parentBrandId: "",
  brandLevel: "0",
  brandPhotoUrl: "",
} as const;
function buildItemBrandFormFields(parentOptions: ERPDynamicSelectOption[]): ERPDynamicModalField[] {
  return [
    {
      name: "masterName",
      label: "Item Brand Name",
      required: true,
      colSpan: 2,
      validation: {
        minLength: 2,
        minLengthMessage: "Item Brand Name must be at least 2 characters.",
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
      name: "parentBrandId",
      label: "Parent Brand",
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
      name: "brandPhoto",
      label: "Image",
      type: "file",
      accept: "image/*",
      maxFileSizeBytes: FILE_CONSTRAINTS.MAX_UPLOAD_IMAGE_BYTES,
      allowedMimeTypes: [...FILE_CONSTRAINTS.ALLOWED_MIME_TYPES],
      helperText: "Optional. Sent as base64 in brand_photo.",
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
export default function ItemBrandMasterPage() {
  const { getAll: getParentBrandLookup } = useApi<unknown>(PARENT_BRAND_LOOKUP_ENDPOINT);
  const [parentOptions, setParentOptions] = useState<ERPDynamicSelectOption[]>([
    DEFAULT_PARENT_OPTION,
  ]);
  // Toggles the `wantdelete` grid param; ticking it re-runs the list so the user
  // can see soft-deleted item brands. Lives beside the list search input.
  const [wantDelete, setWantDelete] = useState(false);
  useEffect(() => {
    let mounted = true;
    void (async () => {
      try {
        const payload = await getParentBrandLookup(PARENT_BRAND_LOOKUP_QUERY);
        if (!mounted) {
          return;
        }
        setParentOptions(
          buildLookupOptions(payload, DEFAULT_PARENT_OPTION, {
            arrayKeys: DEFAULT_LOOKUP_ARRAY_KEYS,
            idKeys: ["id", "value", "brand_id"],
            labelKeys: ["name", "label", "brand_name"],
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
  }, [getParentBrandLookup]);
  const formFields = useMemo(
    () => buildItemBrandFormFields(parentOptions),
    [parentOptions],
  );
  // Adds the `grid_param` payload to the default page/limit/search list query.
  // The server JSON-parses it and binds each key into the matching named token in
  // grid 7's stored SQL; keys with no matching token are ignored. `wantdelete` is
  // driven by the "Show deleted records" checkbox beside the list search input.
  const buildListQuery = useCallback(
    ({
      searchTerm,
      currentPage,
      pageSize,
    }: {
      searchTerm: string;
      currentPage: number;
      pageSize: number;
    }): Record<string, string> => ({
      page: String(currentPage),
      limit: String(pageSize),
      ...(searchTerm ? { search: searchTerm } : {}),
      grid_param: JSON.stringify({ wantdelete: wantDelete }),
    }),
    [wantDelete],
  );
  return (
    <CrudMasterPage
      title="Brand"
      auditHistory={{ screenName: "Item Brand Master" }}
      entityLabel="item brand"
      entityLabelPlural="item brands"
      apiEndpoints={API_ENDPOINTS}
      buildListQuery={buildListQuery}
      toolbarContent={
        <div className={styles.filterCheckGroup}>
          <label className={styles.filterCheckLabel}>
            <input
              type="checkbox"
              checked={wantDelete}
              onChange={(event) => setWantDelete(event.target.checked)}
            />
            Show deleted records
          </label>
        </div>
      }
      gridTableName={GRID_TABLE_NAME}
        listResponseStyleArrayKey=""
      lookupKeys={LOOKUP_KEYS}
      requestPayloadKeys={REQUEST_PAYLOAD_KEYS}
      styles={styles}
      listTitle="Brand List"
      listTitleOverride="Brand List"
      createLabel="Add Item Brand"
      codeColumnHeader="Brand Code"
      nameColumnHeader="Brand Name"
      nameFieldLabel="Item Brand Name"
      nameFieldPlaceholder="Enter item brand name"
      formTitle="Item Brand Form"
      formDescription="Create and update item brands."
      customFields={formFields}
      createInitialValues={INITIAL_FORM_VALUES}
      createModalTitle="Brand Entry"
      editModalTitle="Edit Brand Entry"
      viewModalTitle="Brand Details"
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
          parentBrandId: toDisplayValue(getFirstDefinedValue(rowSource, BRAND_PARENT_ID_KEYS)),
          brandLevel: toDisplayValue(getFirstDefinedValue(rowSource, BRAND_LEVEL_KEYS)) || "0",
          brandPhotoUrl: toDisplayValue(getFirstDefinedValue(rowSource, BRAND_PHOTO_URL_KEYS)),
        };
      }}
      buildRequestPayload={async ({ values, shouldUpdate, editingItemId, files }) => {
        const brandName = (values.masterName ?? "").trim();
        const brandCode = (values.searchCode ?? "").trim();
        const brandAlias = (values.masterAlias ?? "").trim() || brandCode;
        const brandShort = (values.masterShortName ?? "").trim() || brandCode || brandAlias;
        const brandDescription = toNullableString(values.masterDescription ?? "");
        const uploadedImage = files.brandPhoto;
        const brandPhoto =
          uploadedImage && uploadedImage.size > 0
            ? getBase64FromDataUrl(await readFileAsDataUrl(uploadedImage))
            : undefined;
        return {
          brand_name: brandName,
          brand_alias: brandAlias || null,
          brand_short: brandShort || null,
          brand_description: brandDescription,
          brand_parent_id: toNullableReference(values.parentBrandId ?? ""),
          brand_sort: toInteger(values.position ?? "0", 0),
          brand_level: Math.max(0, toInteger(values.brandLevel ?? "0", 0)),
          brand_photo_url: (values.brandPhotoUrl ?? "").trim(),
          ...(brandPhoto ? { brand_photo: brandPhoto } : {}),
          ...(shouldUpdate && editingItemId !== null ? { brand_id: toUpdateId(editingItemId) } : {}),
        };
      }}
    />
  );
}
