"use client";
import { useEffect, useMemo, useState } from "react";
import CrudMasterPage from "@/components/master/crud-master-page";
import { useApi } from "@/hooks/useApi";
import type {
  ERPDynamicModalField,
  ERPDynamicSelectOption,
} from "@/components/library/ui/dynamic-modal-form";
import styles from "@/app/master/state-master/page.module.scss";
const API_ENDPOINTS = {
  list: "/item-categories/list",
  getById: "/item-categories/get",
  create: "/item-categories/create",
  delete: "/item-categories/delete",
} as const;
const GRID_TABLE_NAME = "category_master";
const CATEGORY_LOOKUP_ENDPOINT = "/master-lookups/name-id/all-accounts-and-masters";
const CATEGORY_LOOKUP_QUERY = {
  module: "itemCategories",
  limit: "20",
} as const;
// const TAX_LOOKUP_ENDPOINT = "/item-taxes/list";
// const UNIT_LOOKUP_ENDPOINT = "/units/list";
const LOOKUP_KEYS = {
  id: [
    "category_id",
    "categoryId",
    "id",
    "_id",
    "itc_id",
    "itemcategoryid",
    "item_category_id",
    "itemCategoryId",
  ],
  code: [
    "category_code",
    "categoryCode",
    "code",
    "category_alias",
    "categoryAlias",
    "category_short",
    "categoryShort",
  ],
  name: [
    "category_name",
    "categoryName",
    "name",
    "itc_name",
    "itemcategoryname",
    "item_category_name",
    "itemCategoryName",
  ],
  short: [
    "category_short",
    "itc_short",
    "short_name",
    "shortName",
    "short",
    "categoryshort",
    "itemcategoryshort",
    "item_category_short",
  ],
  alias: [
    "category_alias",
    "itc_alias",
    "alias",
    "itemcategoryalias",
    "item_category_alias",
  ],
  active: [
    "category_is_active",
    "categoryIsActive",
    "itc_active",
    "active",
    "is_active",
    "isActive",
    "isactive",
    "status",
  ],
  position: ["category_sort", "categorySort", "position", "itc_sort", "sort"],
  description: [
    "category_description",
    "categoryDescription",
    "itc_description",
    "description",
    "desc",
  ],
  array: [
    "data",
    "items",
    "results",
    "rows",
    "list",
    "categories",
    "itemCategories",
    "item_categories",
  ],
} as const;

const REQUEST_PAYLOAD_KEYS = {
  id: "category_id",
  name: "category_name",
  alias: "category_alias",
  short: "category_short",
  description: "category_description",
  sort: "category_sort",
} as const;
const CATEGORY_CODE_FORM_KEYS = [
  "category_code",
  "categoryCode",
  "code",
  "category_alias",
  "categoryAlias",
  "category_short",
  "categoryShort",
] as const;
const CATEGORY_PARENT_ID_KEYS = ["category_parent_id", "categoryParentId", "parent_id", "parentId"] as const;
const CATEGORY_LEVEL_KEYS = ["category_level", "categoryLevel", "level"] as const;
const CATEGORY_TAX_CLAIM_KEYS = [
  "category_tax_claim",
  "categoryTaxClaim",
  "tax_claim",
  "taxClaim",
] as const;
const CATEGORY_DEFAULT_TAX_ID_KEYS = [
  "category_default_tax_id",
  "categoryDefaultTaxId",
  "default_tax_id",
  "defaultTaxId",
] as const;
const CATEGORY_DEFAULT_HSN_KEYS = [
  "category_default_hsn",
  "categoryDefaultHsn",
  "default_hsn",
  "defaultHsn",
  "hsn_code",
  "hsnCode",
] as const;
const CATEGORY_DEFAULT_UOM_ID_KEYS = [
  "category_default_uom_id",
  "categoryDefaultUomId",
  "default_uom_id",
  "defaultUomId",
] as const;
const CATEGORY_PHOTO_URL_KEYS = [
  "category_photo_url",
  "categoryPhotoUrl",
  "photo_url",
  "photoUrl",
] as const;

const TAX_LOOKUP_KEYS = {
  id: ["tax_id", "taxId", "id", "_id", "item_tax_id", "itemTaxId"],
  name: ["tax_name", "taxName", "name", "gst_name", "item_tax_name", "itemTaxName"],
  array: ["data", "items", "results", "rows", "list", "taxes", "itemTaxes"],
} as const;
const UNIT_LOOKUP_KEYS = {
  id: ["unit_id", "unitId", "id", "_id", "item_unit_id", "itemUnitId", "uom_id"],
  name: ["unit_name", "unitName", "name", "item_unit_name", "itemUnitName", "uom_name"],
  array: ["data", "items", "results", "rows", "list", "units", "itemUnits"],
} as const;
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
const CATEGORY_INITIAL_FORM_VALUES = {
  masterName: "",
  searchCode: "",
  masterAlias: "",
  masterShortName: "",
  position: "0",
  categoryParentId: "",
  categoryLevel: "0",
  categoryTaxClaim: "false",
  categoryDefaultTaxId: "",
  categoryDefaultHsn: "",
  categoryDefaultUomId: "",
  categoryPhotoUrl: "",
  masterDescription: "",
} as const;
const DEFAULT_SELECT_OPTION: ERPDynamicSelectOption = {
  value: "",
  label: "None",
};
type OptionLookupKeys = {
  id: readonly string[];
  name: readonly string[];
  array: readonly string[];
};
function buildCategoryFormFields(
  categoryOptions: ERPDynamicSelectOption[],
  taxOptions: ERPDynamicSelectOption[],
  unitOptions: ERPDynamicSelectOption[],
): ERPDynamicModalField[] {
  return [
    {
      name: "masterName",
      label: "Category Name",
      required: true,
      colSpan:2,
      validation: {
        minLength: 2,
        minLengthMessage: "Item Category Name must be at least 2 characters.",
      },
    },
    // {
    //   name: "masterAlias",
    //   label: "Category Alias",
    //   colSpan:2
    // },
    {
      name: "masterShortName",
      label: "Short Name",
      colSpan:2
    },
    {
      name: "position",
      label: "Position",
      type: "number",
      colSpan:1,
      min: 0,
      step: 1,
      validation: {
        minMessage: "Sort Order must be 0 or greater.",
      },
    },
    {
      name: "categoryParentId",
      label: "Parent Category",
      type: "select",
      colSpan:2,
      searchable: true,
      options: categoryOptions,
    },
    // {
    //   name: "categoryLevel",
    //   label: "Category Level",
    //   type: "number",
    //   min: 0,
    //   step: 1,
    //   validation: {
    //     minMessage: "Category Level must be 0 or greater.",
    //   },
    // },
    {
      name: "masterDescription",
      label: "Description",
      colSpan: 2,
    },
    {
      name: "categoryPhoto",
      label: "Image",
      type: "file",
      accept: "image/*",
      maxFileSizeBytes: FILE_CONSTRAINTS.MAX_UPLOAD_IMAGE_BYTES,
      allowedMimeTypes: [...FILE_CONSTRAINTS.ALLOWED_MIME_TYPES],
      helperText: "Optional. Sent as base64 in category_photo.",
      colSpan: 2,
    },
  ];
}
function getFirstDefinedValue(
  source: Record<string, unknown>,
  keys: readonly string[],
): unknown {
  for (const key of keys) {
    const value = source[key];
    if (value !== undefined && value !== null && value !== "") {
      return value;
    }
  }
  return undefined;
}
function toDisplayValue(value: unknown): string {
  if (value === undefined || value === null) {
    return "";
  }
  if (typeof value === "string") {
    return value.trim();
  }
  if (typeof value === "number" || typeof value === "bigint") {
    return String(value);
  }
  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }
  if (typeof value === "object") {
    const nested = value as Record<string, unknown>;
    const fallback = nested.value ?? nested.id ?? nested.code ?? nested.name ?? nested.label;
    if (
      typeof fallback === "string" ||
      typeof fallback === "number" ||
      typeof fallback === "bigint" ||
      typeof fallback === "boolean"
    ) {
      return String(fallback);
    }
  }
  return "";
}
function toSelectBoolean(value: unknown, defaultValue: string): "true" | "false" {
  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }
  const normalized = toDisplayValue(value).toLowerCase();
  if (["1", "true", "yes", "active"].includes(normalized)) {
    return "true";
  }
  if (["0", "false", "no", "inactive"].includes(normalized)) {
    return "false";
  }
  const normalizedDefaultValue = defaultValue.trim().toLowerCase();
  return ["1", "true", "yes", "active"].includes(normalizedDefaultValue)
    ? "true"
    : "false";
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
function extractRows(payload: unknown, arrayKeys: readonly string[]): unknown[] {
  if (Array.isArray(payload)) {
    return payload;
  }
  if (!payload || typeof payload !== "object") {
    return [];
  }
  const objectPayload = payload as Record<string, unknown>;
  for (const key of arrayKeys) {
    const value = objectPayload[key];
    if (Array.isArray(value)) {
      return value;
    }
    if (value && typeof value === "object" && !Array.isArray(value)) {
      const nestedObject = value as Record<string, unknown>;
      for (const nestedKey of arrayKeys) {
        const nestedValue = nestedObject[nestedKey];
        if (Array.isArray(nestedValue)) {
          return nestedValue;
        }
      }
    }
  }
  const firstArray = Object.values(objectPayload).find((value) => Array.isArray(value));
  return Array.isArray(firstArray) ? firstArray : [];
}
function buildLookupOptions(
  payload: unknown,
  lookupKeys: OptionLookupKeys,
  includeEmptyOption = false,
): ERPDynamicSelectOption[] {
  const optionMap = new Map<string, string>();
  const rows = extractRows(payload, lookupKeys.array);
  for (const row of rows) {
    if (!row || typeof row !== "object" || Array.isArray(row)) {
      continue;
    }
    const source = row as Record<string, unknown>;
    const id = toDisplayValue(getFirstDefinedValue(source, lookupKeys.id));
    if (!id) {
      continue;
    }
    const name = toDisplayValue(getFirstDefinedValue(source, lookupKeys.name));
    const label = name || id;
    if (!optionMap.has(id)) {
      optionMap.set(id, label);
    }
  }
  const options = Array.from(optionMap.entries())
    .map(([value, label]) => ({ value, label }))
    .sort((left, right) => left.label.localeCompare(right.label));
  if (!includeEmptyOption) {
    return options;
  }
  return [DEFAULT_SELECT_OPTION, ...options];
}
export default function ItemCategoryMasterPage() {
  const { getAll: getCategoryOptions } = useApi<unknown>(CATEGORY_LOOKUP_ENDPOINT);
  // const { getAll: getTaxOptions } = useApi<unknown>(TAX_LOOKUP_ENDPOINT);
  // const { getAll: getUnitOptions } = useApi<unknown>(UNIT_LOOKUP_ENDPOINT);
  const [categoryOptions, setCategoryOptions] = useState<ERPDynamicSelectOption[]>([
    DEFAULT_SELECT_OPTION,
  ]);
  const [taxOptions, setTaxOptions] = useState<ERPDynamicSelectOption[]>([DEFAULT_SELECT_OPTION]);
  const [unitOptions, setUnitOptions] = useState<ERPDynamicSelectOption[]>([DEFAULT_SELECT_OPTION]);
  useEffect(() => {
    let mounted = true;
    void (async () => {
      try {
        const [categoryPayload, 
          //taxPayload, unitPayload
        ] = await Promise.all([
          getCategoryOptions(CATEGORY_LOOKUP_QUERY),
          // getTaxOptions(LOOKUP_REQUEST_QUERY),
          // getUnitOptions(LOOKUP_REQUEST_QUERY),
        ]);
        if (!mounted) {
          return;
        }
        setCategoryOptions(buildLookupOptions(categoryPayload, LOOKUP_KEYS, true));
        // setTaxOptions(buildLookupOptions(taxPayload, TAX_LOOKUP_KEYS, true));
        // setUnitOptions(buildLookupOptions(unitPayload, UNIT_LOOKUP_KEYS, true));
      } catch {
        if (!mounted) {
          return;
        }
        setCategoryOptions([DEFAULT_SELECT_OPTION]);
        setTaxOptions([DEFAULT_SELECT_OPTION]);
        setUnitOptions([DEFAULT_SELECT_OPTION]);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [getCategoryOptions, 
    // getTaxOptions, getUnitOptions
  ]);
  const categoryFormFields = useMemo(
    () => buildCategoryFormFields(categoryOptions, taxOptions, unitOptions),
    [categoryOptions, taxOptions, unitOptions],
  );
  return (
    <CrudMasterPage
      title="Item Category"
      auditHistory={{ screenName: "Category Master" }}
      entityLabel="item category"
      entityLabelPlural="item categories"
      apiEndpoints={API_ENDPOINTS}
      gridTableName={GRID_TABLE_NAME}
      lookupKeys={LOOKUP_KEYS}
      requestPayloadKeys={REQUEST_PAYLOAD_KEYS}
      styles={styles}
      listTitle="Item Category List"
      createLabel="Add Item Category"
      codeColumnHeader="Category Code"
      nameColumnHeader="Category Name"
      nameFieldLabel="Item Category Name"
      nameFieldPlaceholder="Dairy"
      formTitle="Item Category Form"
      formDescription="Create and update item categories."
      customFields={categoryFormFields}
      createInitialValues={CATEGORY_INITIAL_FORM_VALUES}
      mapFormValues={({ source, defaults }) => {
        const rowSource = source ?? {};
        return {
          ...CATEGORY_INITIAL_FORM_VALUES,
          masterName:
            toDisplayValue(getFirstDefinedValue(rowSource, LOOKUP_KEYS.name)) || defaults.masterName,
          searchCode:
            toDisplayValue(getFirstDefinedValue(rowSource, CATEGORY_CODE_FORM_KEYS)) ||
            defaults.searchCode,
          masterAlias:
            toDisplayValue(getFirstDefinedValue(rowSource, LOOKUP_KEYS.alias)) ||
            defaults.masterAlias,
          masterShortName:
            toDisplayValue(getFirstDefinedValue(rowSource, LOOKUP_KEYS.short)) ||
            defaults.masterShortName,
          position:
            toDisplayValue(getFirstDefinedValue(rowSource, LOOKUP_KEYS.position)) ||
            defaults.position,
          categoryParentId: toDisplayValue(
            getFirstDefinedValue(rowSource, CATEGORY_PARENT_ID_KEYS),
          ),
          categoryLevel:
            toDisplayValue(getFirstDefinedValue(rowSource, CATEGORY_LEVEL_KEYS)) || "0",
          categoryTaxClaim: toSelectBoolean(
            getFirstDefinedValue(rowSource, CATEGORY_TAX_CLAIM_KEYS),
            "false",
          ),
          categoryDefaultTaxId: toDisplayValue(
            getFirstDefinedValue(rowSource, CATEGORY_DEFAULT_TAX_ID_KEYS),
          ),
          categoryDefaultHsn: toDisplayValue(
            getFirstDefinedValue(rowSource, CATEGORY_DEFAULT_HSN_KEYS),
          ),
          categoryDefaultUomId: toDisplayValue(
            getFirstDefinedValue(rowSource, CATEGORY_DEFAULT_UOM_ID_KEYS),
          ),
          categoryPhotoUrl: toDisplayValue(
            getFirstDefinedValue(rowSource, CATEGORY_PHOTO_URL_KEYS),
          ),
          masterDescription:
            toDisplayValue(getFirstDefinedValue(rowSource, LOOKUP_KEYS.description)) ||
            defaults.masterDescription,
        };
      }}
      buildRequestPayload={async ({ values, shouldUpdate, editingItemId, files }) => {
        const categoryName = (values.masterName ?? "").trim();
        const categoryCode = (values.searchCode ?? "").trim();
        const categoryAlias = (values.masterAlias ?? "").trim() || categoryCode;
        const categoryShort =
          (values.masterShortName ?? "").trim() || categoryCode || categoryAlias;
        const categoryDescription = (values.masterDescription ?? "").trim();
        const categorySort = toInteger(values.position ?? "0", 0);
        const categoryLevel = Math.max(0, toInteger(values.categoryLevel ?? "0", 0));
        const uploadedImage = files.categoryPhoto;
        const categoryPhoto =
          uploadedImage && uploadedImage.size > 0
            ? getBase64FromDataUrl(await readFileAsDataUrl(uploadedImage))
            : undefined;
        return {
          category_name: categoryName,
          category_alias: categoryAlias || null,
          category_short: categoryShort || null,
          category_description: categoryDescription || null,
          category_parent_id: toNullableReference(values.categoryParentId ?? ""),
          category_sort: categorySort,
          category_level: categoryLevel,
          category_tax_claim: (values.categoryTaxClaim ?? "false") === "true",
          category_default_tax_id: toNullableReference(values.categoryDefaultTaxId ?? ""),
          category_default_hsn: (values.categoryDefaultHsn ?? "").trim(),
          category_default_uom_id: toNullableReference(values.categoryDefaultUomId ?? ""),
          category_photo_url: (values.categoryPhotoUrl ?? "").trim(),
          ...(categoryPhoto ? { category_photo: categoryPhoto } : {}),
          ...(shouldUpdate && editingItemId !== null
            ? { category_id: String(editingItemId) }
            : {}),
        };
      }}
    />
  );
}
