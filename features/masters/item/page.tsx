"use client";

import { type CSSProperties, useEffect, useMemo, useState } from "react";
import CrudMasterPage from "@/components/master/crud-master-page";
import { useApi } from "@/hooks/useApi";
import type {
  ERPDynamicModalField,
  ERPDynamicSelectOption,
} from "@/components/library/ui/dynamic-modal-form";
import styles from "@/app/master/state-master/page.module.scss";
import {
  buildLookupOptions,
  getFirstDefinedValue,
  toCsvFromArray,
  toDisplayValue,
  toNonNegativeInteger,
  toNullableString,
  toSelectBoolean,
  toUniqueStringArrayFromCsv,
  toUpdateId,
  toUpper,
  DEFAULT_LOOKUP_ARRAY_KEYS,
} from "@/app/master/_shared/crud-utils";

const API_ENDPOINTS = {
  list: "/items/list",
  getById: "/items/get",
  create: "/items/create",
  delete: "/items/delete",
} as const;

const GRID_TABLE_NAME = "item_master";
const LOOKUP_ENDPOINT = "/master-lookups/name-id/all-accounts-and-masters";
const UUID_PATTERN = "^[0-9a-fA-F-]{36}$";

const LOOKUP_QUERY_COMPANIES = {
  module: "companies",
  limit: "50",
} as const;

const LOOKUP_QUERY_BRANCHES = {
  module: "branches",
  limit: "50",
} as const;

const LOOKUP_QUERY_ITEM_GROUPS = {
  module: "itemGroups",
  limit: "50",
} as const;

const LOOKUP_QUERY_ITEM_CATEGORIES = {
  module: "itemCategories",
  limit: "50",
} as const;

const LOOKUP_QUERY_ITEM_BRANDS = {
  module: "itemBrands",
  limit: "50",
} as const;

const LOOKUP_QUERY_ITEM_SECTIONS = {
  module: "itemSections",
  limit: "50",
} as const;

const LOOKUP_QUERY_UNITS = {
  module: "units",
  limit: "50",
} as const;

const LOOKUP_QUERY_ITEM_TAXES = {
  module: "itemTaxes",
  limit: "50",
} as const;

const LOOKUP_QUERY_SUPPLIERS = {
  module: "suppliers",
  limit: "50",
} as const;

const LOOKUP_QUERY_ITEMS = {
  module: "items",
  limit: "50",
} as const;

const LOOKUP_KEYS = {
  id: ["item_id", "itemId", "id", "_id"],
  code: ["item_code", "itemCode", "item_sku", "itemSku", "code"],
  name: ["item_name_en", "itemNameEn", "name"],
  short: ["item_alias", "itemAlias", "alias"],
  alias: ["item_stock_type", "itemStockType", "stockType"],
  active: ["item_is_active", "itemIsActive", "isActive", "is_active", "status"],
  position: ["item_sort_order", "itemSortOrder", "position", "sort"],
  description: ["item_notes", "itemNotes", "description", "notes"],
  array: ["data", "items", "results", "rows", "list", "item_masters", "items"],
} as const;

const REQUEST_PAYLOAD_KEYS = {
  id: "item_id",
  name: "item_name_en",
  alias: "item_stock_type",
  short: "item_code",
  description: "item_notes",
  sort: "item_sort_order",
} as const;

const DEFAULT_COMPANY_OPTION: ERPDynamicSelectOption = {
  value: "",
  label: "Select Company",
};

const DEFAULT_BRANCH_OPTION: ERPDynamicSelectOption = {
  value: "",
  label: "None",
};

const DEFAULT_GROUP_OPTION: ERPDynamicSelectOption = {
  value: "",
  label: "Select Item Group",
};

const DEFAULT_CATEGORY_OPTION: ERPDynamicSelectOption = {
  value: "",
  label: "None",
};

const DEFAULT_BRAND_OPTION: ERPDynamicSelectOption = {
  value: "",
  label: "None",
};

const DEFAULT_SECTION_OPTION: ERPDynamicSelectOption = {
  value: "",
  label: "None",
};

const DEFAULT_UNIT_OPTION: ERPDynamicSelectOption = {
  value: "",
  label: "Select Base Unit",
};

const DEFAULT_TAX_OPTION: ERPDynamicSelectOption = {
  value: "",
  label: "None",
};

const DEFAULT_SUPPLIER_OPTION: ERPDynamicSelectOption = {
  value: "",
  label: "None",
};

const DEFAULT_PACKING_OPTION: ERPDynamicSelectOption = {
  value: "",
  label: "None",
};

const ITEM_INITIAL_FORM_VALUES: Record<string, string> = {
  item_name_en: "",
  item_name_ta: "",
  item_code: "",
  item_sku: "",
  item_alias: "",
  item_stock_type: "FG",
  item_default_barcode: "",

  item_company_id: "",
  item_branch_id: "",
  item_group_id: "",
  item_category_id: "",
  item_brand_id: "",
  item_section_id: "",
  item_base_unit_id: "",
  item_default_tax_id: "",
  item_supplier_id: "",
  item_company_category_id: "",
  item_mfgr_id: "",
  item_packing_item_ids: "",

  item_hsn_code: "",
  item_batch_config: "0",
  item_sort_order: "",
  item_storage_location: "",
  item_notes: "",
  item_image_url: "",
  item_photo_file: "",

  item_is_service: "false",
  item_is_batch_based: "false",
  item_is_expiry_item: "false",
  item_expiry_days: "",
  item_intimate_before_days: "",
  item_allow_sales: "true",
  item_allow_sales_return: "true",
  item_allow_purchase: "true",
  item_allow_po: "true",
  item_allow_so: "true",
  item_allow_neg_stock: "true",
  item_allow_negative_so: "true",
  item_price_list: "false",
  item_weigh_scale: "false",
  item_retail_item: "true",
  item_is_kit: "false",
  item_auto_break: "false",
  item_auto_make: "false",
  item_allow_loyalty: "false",
  item_allow_promo: "false",
  item_has_offer: "false",
  item_damagable_product: "false",
  item_is_demand: "false",
  item_allow_loading: "false",
  item_allow_freight: "false",
  item_random_stock: "false",
  item_barcode_sticker: "false",
  item_is_active: "true",

  item_created_by: "",
  item_modified_by: "",
};

const ITEM_MODAL_PANEL_STYLE: CSSProperties = {
  width: "min(72vw, 76rem)",
  maxHeight: "80vh",
};

const ITEM_TEXT_FIELD_NAMES = [
  "item_name_en",
  "item_name_ta",
  "item_code",
  "item_sku",
  "item_alias",
  "item_stock_type",
  "item_default_barcode",
  "item_company_id",
  "item_branch_id",
  "item_group_id",
  "item_category_id",
  "item_brand_id",
  "item_section_id",
  "item_base_unit_id",
  "item_default_tax_id",
  "item_supplier_id",
  "item_company_category_id",
  "item_mfgr_id",
  "item_hsn_code",
  "item_storage_location",
  "item_notes",
  "item_image_url",
  "item_created_by",
  "item_modified_by",
] as const;

const ITEM_BOOLEAN_FIELD_NAMES = [
  "item_is_service",
  "item_is_batch_based",
  "item_is_expiry_item",
  "item_allow_sales",
  "item_allow_sales_return",
  "item_allow_purchase",
  "item_allow_po",
  "item_allow_so",
  "item_allow_neg_stock",
  "item_allow_negative_so",
  "item_price_list",
  "item_weigh_scale",
  "item_retail_item",
  "item_is_kit",
  "item_auto_break",
  "item_auto_make",
  "item_allow_loyalty",
  "item_allow_promo",
  "item_has_offer",
  "item_damagable_product",
  "item_is_demand",
  "item_allow_loading",
  "item_allow_freight",
  "item_random_stock",
  "item_barcode_sticker",
  "item_is_active",
] as const;

function toSnakeCase(value: string): string {
  return value.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase();
}

function getFieldValue(source: Record<string, unknown>, fieldName: string): unknown {
  return getFirstDefinedValue(source, [fieldName, toSnakeCase(fieldName)]);
}

function toOptionalNonNegativeInteger(value: string): number | undefined {
  const normalized = value.trim();
  if (!normalized) {
    return undefined;
  }

  const parsed = Number.parseInt(normalized, 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return undefined;
  }

  return Math.floor(parsed);
}

function toUpperNullable(value: string): string | null {
  const normalized = toUpper(value);
  return normalized ? normalized : null;
}

function buildUuidTextField(name: string, label: string): ERPDynamicModalField {
  return {
    name,
    label,
    validation: {
      pattern: UUID_PATTERN,
      patternMessage: `${label} must be a valid UUID.`,
    },
  };
}

function buildItemFormFields(
  companyOptions: ERPDynamicSelectOption[],
  branchOptions: ERPDynamicSelectOption[],
  groupOptions: ERPDynamicSelectOption[],
  categoryOptions: ERPDynamicSelectOption[],
  brandOptions: ERPDynamicSelectOption[],
  sectionOptions: ERPDynamicSelectOption[],
  unitOptions: ERPDynamicSelectOption[],
  taxOptions: ERPDynamicSelectOption[],
  supplierOptions: ERPDynamicSelectOption[],
  itemOptions: ERPDynamicSelectOption[],
): ERPDynamicModalField[] {
  return [
    {
      name: "itemHeadingCore",
      label: "Core Details",
      type: "heading",
    },
    {
      name: "item_name_en",
      label: "Item Name",
      required: true,
      validation: {
        minLength: 2,
        maxLength: 200,
        minLengthMessage: "Item Name must be at least 2 characters.",
        maxLengthMessage: "Item Name must be at most 200 characters.",
      },
    },
    {
      name: "item_name_ta",
      label: "Item Name (Local)",
      validation: {
        maxLength: 200,
        maxLengthMessage: "Item Name (Local) must be at most 200 characters.",
      },
    },
    {
      name: "item_code",
      label: "Item Code",
      validation: {
        maxLength: 50,
        maxLengthMessage: "Item Code must be at most 50 characters.",
      },
    },
    {
      name: "item_sku",
      label: "SKU",
      validation: {
        maxLength: 60,
        maxLengthMessage: "SKU must be at most 60 characters.",
      },
    },
    {
      name: "item_alias",
      label: "Alias",
      validation: {
        maxLength: 200,
        maxLengthMessage: "Alias must be at most 200 characters.",
      },
    },
    {
      name: "item_stock_type",
      label: "Stock Type",
      required: true,
      helperText: "Common values: FG, RM, SFG, SERVICE.",
      validation: {
        requiredMessage: "Stock Type is required.",
        maxLength: 20,
        maxLengthMessage: "Stock Type must be at most 20 characters.",
      },
    },
    {
      name: "item_default_barcode",
      label: "Default Barcode",
      validation: {
        maxLength: 200,
        maxLengthMessage: "Default Barcode must be at most 200 characters.",
      },
    },
    {
      name: "itemHeadingLinks",
      label: "Reference Links",
      type: "heading",
    },
    {
      name: "item_company_id",
      label: "Company",
      type: "select",
      searchable: true,
      required: true,
      options: companyOptions,
      validation: {
        requiredMessage: "Company is required.",
      },
    },
    {
      name: "item_branch_id",
      label: "Branch",
      type: "select",
      searchable: true,
      options: branchOptions,
    },
    {
      name: "item_group_id",
      label: "Item Group",
      type: "select",
      searchable: true,
      required: true,
      options: groupOptions,
      validation: {
        requiredMessage: "Item Group is required.",
      },
    },
    {
      name: "item_category_id",
      label: "Item Category",
      type: "select",
      searchable: true,
      options: categoryOptions,
    },
    {
      name: "item_brand_id",
      label: "Item Brand",
      type: "select",
      searchable: true,
      options: brandOptions,
    },
    {
      name: "item_section_id",
      label: "Item Section",
      type: "select",
      searchable: true,
      options: sectionOptions,
    },
    {
      name: "item_base_unit_id",
      label: "Base Unit",
      type: "select",
      searchable: true,
      required: true,
      options: unitOptions,
      validation: {
        requiredMessage: "Base Unit is required.",
      },
    },
    {
      name: "item_default_tax_id",
      label: "Default Tax",
      type: "select",
      searchable: true,
      options: taxOptions,
    },
    {
      name: "item_supplier_id",
      label: "Default Supplier",
      type: "select",
      searchable: true,
      options: supplierOptions,
    },
    buildUuidTextField("item_company_category_id", "Company Category Id"),
    buildUuidTextField("item_mfgr_id", "Manufacturer Id"),
    {
      name: "item_packing_item_ids",
      label: "Packing Items",
      type: "select",
      searchable: true,
      multiple: true,
      options: itemOptions,
      helperText: "Select one or more packing items (optional).",
      colSpan: 2,
    },
    {
      name: "itemHeadingInventory",
      label: "Inventory & Notes",
      type: "heading",
    },
    {
      name: "item_hsn_code",
      label: "HSN Code",
      validation: {
        maxLength: 10,
        maxLengthMessage: "HSN Code must be at most 10 characters.",
      },
    },
    {
      name: "item_batch_config",
      label: "Batch Config",
      type: "number",
      min: 0,
      step: 1,
      validation: {
        minMessage: "Batch Config must be 0 or greater.",
      },
    },
    {
      name: "item_sort_order",
      label: "Sort Order",
      type: "number",
      min: 0,
      step: 1,
      validation: {
        minMessage: "Sort Order must be 0 or greater.",
      },
    },
    {
      name: "item_storage_location",
      label: "Storage Location",
      validation: {
        maxLength: 250,
        maxLengthMessage: "Storage Location must be at most 250 characters.",
      },
    },
    {
      name: "item_image_url",
      label: "Image URL",
      type: "url",
    },
    {
      name: "item_photo_file",
      label: "Photo File",
      type: "file",
      accept: "image/*",
      helperText: "Optional. If selected, uploaded as base64.",
    },
    {
      name: "item_notes",
      label: "Notes",
      type: "textarea",
      rows: 3,
      colSpan: 2,
      validation: {
        maxLength: 250,
        maxLengthMessage: "Notes must be at most 250 characters.",
      },
    },
    {
      name: "itemHeadingRules",
      label: "Rules & Status",
      type: "heading",
      defaultExpanded: false,
    },
    {
      name: "item_is_service",
      label: "Service Item",
      type: "checkbox",
    },
    {
      name: "item_is_batch_based",
      label: "Batch Based",
      type: "checkbox",
    },
    {
      name: "item_is_expiry_item",
      label: "Expiry Item",
      type: "checkbox",
    },
    {
      name: "item_expiry_days",
      label: "Expiry Days",
      type: "number",
      min: 0,
      step: 1,
      visibleWhen: (values) => values.item_is_expiry_item === "true",
    },
    {
      name: "item_intimate_before_days",
      label: "Intimate Before Days",
      type: "number",
      min: 0,
      step: 1,
      visibleWhen: (values) => values.item_is_expiry_item === "true",
    },
    {
      name: "item_allow_sales",
      label: "Allow Sales",
      type: "checkbox",
    },
    {
      name: "item_allow_sales_return",
      label: "Allow Sales Return",
      type: "checkbox",
    },
    {
      name: "item_allow_purchase",
      label: "Allow Purchase",
      type: "checkbox",
    },
    {
      name: "item_allow_po",
      label: "Allow PO",
      type: "checkbox",
    },
    {
      name: "item_allow_so",
      label: "Allow SO",
      type: "checkbox",
    },
    {
      name: "item_allow_neg_stock",
      label: "Allow Negative Stock",
      type: "checkbox",
    },
    {
      name: "item_allow_negative_so",
      label: "Allow Negative SO",
      type: "checkbox",
    },
    {
      name: "item_price_list",
      label: "Price List",
      type: "checkbox",
    },
    {
      name: "item_weigh_scale",
      label: "Weigh Scale",
      type: "checkbox",
    },
    {
      name: "item_retail_item",
      label: "Retail Item",
      type: "checkbox",
    },
    {
      name: "item_is_kit",
      label: "Is Kit",
      type: "checkbox",
    },
    {
      name: "item_auto_break",
      label: "Auto Break",
      type: "checkbox",
    },
    {
      name: "item_auto_make",
      label: "Auto Make",
      type: "checkbox",
    },
    {
      name: "item_allow_loyalty",
      label: "Allow Loyalty",
      type: "checkbox",
    },
    {
      name: "item_allow_promo",
      label: "Allow Promo",
      type: "checkbox",
    },
    {
      name: "item_has_offer",
      label: "Has Offer",
      type: "checkbox",
    },
    {
      name: "item_damagable_product",
      label: "Damagable Product",
      type: "checkbox",
    },
    {
      name: "item_is_demand",
      label: "Is Demand",
      type: "checkbox",
    },
    {
      name: "item_allow_loading",
      label: "Allow Loading",
      type: "checkbox",
    },
    {
      name: "item_allow_freight",
      label: "Allow Freight",
      type: "checkbox",
    },
    {
      name: "item_random_stock",
      label: "Random Stock",
      type: "checkbox",
    },
    {
      name: "item_barcode_sticker",
      label: "Barcode Sticker",
      type: "checkbox",
    },
    {
      name: "item_is_active",
      label: "Is Active",
      type: "checkbox",
    },
    {
      name: "item_created_by",
      label: "Created By",
      validation: {
        maxLength: 100,
        maxLengthMessage: "Created By must be at most 100 characters.",
      },
    },
    {
      name: "item_modified_by",
      label: "Modified By",
      validation: {
        maxLength: 100,
        maxLengthMessage: "Modified By must be at most 100 characters.",
      },
    },
  ];
}

function toLookupOptions(
  payload: unknown,
  defaultOption: ERPDynamicSelectOption,
): ERPDynamicSelectOption[] {
  return buildLookupOptions(payload, defaultOption, {
    arrayKeys: DEFAULT_LOOKUP_ARRAY_KEYS,
    idKeys: ["id", "value"],
    labelKeys: ["name", "label"],
  });
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== "string") {
        reject(new Error("Failed to read file as base64."));
        return;
      }

      const commaIndex = result.indexOf(",");
      resolve(commaIndex >= 0 ? result.slice(commaIndex + 1) : result);
    };
    reader.onerror = () => {
      reject(reader.error ?? new Error("Failed to read file."));
    };
    reader.readAsDataURL(file);
  });
}

export default function ItemMasterPage() {
  const { getAll: getLookup } = useApi<unknown>(LOOKUP_ENDPOINT);

  const [companyOptions, setCompanyOptions] = useState<ERPDynamicSelectOption[]>([
    DEFAULT_COMPANY_OPTION,
  ]);
  const [branchOptions, setBranchOptions] = useState<ERPDynamicSelectOption[]>([
    DEFAULT_BRANCH_OPTION,
  ]);
  const [groupOptions, setGroupOptions] = useState<ERPDynamicSelectOption[]>([
    DEFAULT_GROUP_OPTION,
  ]);
  const [categoryOptions, setCategoryOptions] = useState<ERPDynamicSelectOption[]>([
    DEFAULT_CATEGORY_OPTION,
  ]);
  const [brandOptions, setBrandOptions] = useState<ERPDynamicSelectOption[]>([
    DEFAULT_BRAND_OPTION,
  ]);
  const [sectionOptions, setSectionOptions] = useState<ERPDynamicSelectOption[]>([
    DEFAULT_SECTION_OPTION,
  ]);
  const [unitOptions, setUnitOptions] = useState<ERPDynamicSelectOption[]>([
    DEFAULT_UNIT_OPTION,
  ]);
  const [taxOptions, setTaxOptions] = useState<ERPDynamicSelectOption[]>([
    DEFAULT_TAX_OPTION,
  ]);
  const [supplierOptions, setSupplierOptions] = useState<ERPDynamicSelectOption[]>([
    DEFAULT_SUPPLIER_OPTION,
  ]);
  const [itemOptions, setItemOptions] = useState<ERPDynamicSelectOption[]>([
    DEFAULT_PACKING_OPTION,
  ]);

  useEffect(() => {
    let mounted = true;

    void (async () => {
      try {
        const [
          companiesPayload,
          branchesPayload,
          groupsPayload,
          categoriesPayload,
          brandsPayload,
          sectionsPayload,
          unitsPayload,
          taxesPayload,
          suppliersPayload,
          itemsPayload,
        ] = await Promise.all([
          getLookup(LOOKUP_QUERY_COMPANIES),
          getLookup(LOOKUP_QUERY_BRANCHES),
          getLookup(LOOKUP_QUERY_ITEM_GROUPS),
          getLookup(LOOKUP_QUERY_ITEM_CATEGORIES),
          getLookup(LOOKUP_QUERY_ITEM_BRANDS),
          getLookup(LOOKUP_QUERY_ITEM_SECTIONS),
          getLookup(LOOKUP_QUERY_UNITS),
          getLookup(LOOKUP_QUERY_ITEM_TAXES),
          getLookup(LOOKUP_QUERY_SUPPLIERS),
          getLookup(LOOKUP_QUERY_ITEMS),
        ]);

        if (!mounted) {
          return;
        }

        setCompanyOptions(toLookupOptions(companiesPayload, DEFAULT_COMPANY_OPTION));
        setBranchOptions(toLookupOptions(branchesPayload, DEFAULT_BRANCH_OPTION));
        setGroupOptions(toLookupOptions(groupsPayload, DEFAULT_GROUP_OPTION));
        setCategoryOptions(toLookupOptions(categoriesPayload, DEFAULT_CATEGORY_OPTION));
        setBrandOptions(toLookupOptions(brandsPayload, DEFAULT_BRAND_OPTION));
        setSectionOptions(toLookupOptions(sectionsPayload, DEFAULT_SECTION_OPTION));
        setUnitOptions(toLookupOptions(unitsPayload, DEFAULT_UNIT_OPTION));
        setTaxOptions(toLookupOptions(taxesPayload, DEFAULT_TAX_OPTION));
        setSupplierOptions(toLookupOptions(suppliersPayload, DEFAULT_SUPPLIER_OPTION));
        setItemOptions(toLookupOptions(itemsPayload, DEFAULT_PACKING_OPTION));
      } catch {
        if (!mounted) {
          return;
        }

        setCompanyOptions([DEFAULT_COMPANY_OPTION]);
        setBranchOptions([DEFAULT_BRANCH_OPTION]);
        setGroupOptions([DEFAULT_GROUP_OPTION]);
        setCategoryOptions([DEFAULT_CATEGORY_OPTION]);
        setBrandOptions([DEFAULT_BRAND_OPTION]);
        setSectionOptions([DEFAULT_SECTION_OPTION]);
        setUnitOptions([DEFAULT_UNIT_OPTION]);
        setTaxOptions([DEFAULT_TAX_OPTION]);
        setSupplierOptions([DEFAULT_SUPPLIER_OPTION]);
        setItemOptions([DEFAULT_PACKING_OPTION]);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [getLookup]);

  const itemFormFields = useMemo(
    () =>
      buildItemFormFields(
        companyOptions,
        branchOptions,
        groupOptions,
        categoryOptions,
        brandOptions,
        sectionOptions,
        unitOptions,
        taxOptions,
        supplierOptions,
        itemOptions,
      ),
    [
      brandOptions,
      branchOptions,
      categoryOptions,
      companyOptions,
      groupOptions,
      itemOptions,
      sectionOptions,
      supplierOptions,
      taxOptions,
      unitOptions,
    ],
  );

  return (
    <CrudMasterPage
      title="Item"
      entityLabel="item"
      entityLabelPlural="items"
      apiEndpoints={API_ENDPOINTS}
      gridTableName={GRID_TABLE_NAME}
      lookupKeys={LOOKUP_KEYS}
      requestPayloadKeys={REQUEST_PAYLOAD_KEYS}
      styles={styles}
      listTitle="Item List"
      createLabel="Add Item"
      codeColumnHeader="Item Code"
      nameColumnHeader="Item Name"
      nameFieldLabel="Item Name"
      nameFieldPlaceholder="Sugar 1kg"
      formTitle="Item Form"
      formDescription="Create and update items."
      customFields={itemFormFields}
      createInitialValues={ITEM_INITIAL_FORM_VALUES}
      modalPanelStyle={ITEM_MODAL_PANEL_STYLE}
      modalFormGridColumns={3}
      modalStackLabels
      mapFormValues={({ source, defaults }) => {
        const rowSource = source ?? {};
        const mappedValues: Record<string, string> = {
          ...ITEM_INITIAL_FORM_VALUES,
        };

        for (const fieldName of ITEM_TEXT_FIELD_NAMES) {
          const value = toDisplayValue(getFieldValue(rowSource, fieldName));
          mappedValues[fieldName] = value || ITEM_INITIAL_FORM_VALUES[fieldName];
        }

        for (const fieldName of ITEM_BOOLEAN_FIELD_NAMES) {
          const fallback =
            ITEM_INITIAL_FORM_VALUES[fieldName] === "true" ? "true" : "false";
          mappedValues[fieldName] = toSelectBoolean(
            getFieldValue(rowSource, fieldName),
            fallback,
          );
        }

        mappedValues.item_name_en =
          toDisplayValue(getFieldValue(rowSource, "item_name_en")) ||
          toDisplayValue(getFirstDefinedValue(rowSource, LOOKUP_KEYS.name)) ||
          defaults.masterName ||
          ITEM_INITIAL_FORM_VALUES.item_name_en;

        mappedValues.item_code =
          toDisplayValue(getFieldValue(rowSource, "item_code")) ||
          toDisplayValue(getFirstDefinedValue(rowSource, LOOKUP_KEYS.code)) ||
          defaults.searchCode ||
          ITEM_INITIAL_FORM_VALUES.item_code;

        mappedValues.item_alias =
          toDisplayValue(getFieldValue(rowSource, "item_alias")) ||
          toDisplayValue(getFirstDefinedValue(rowSource, LOOKUP_KEYS.short)) ||
          ITEM_INITIAL_FORM_VALUES.item_alias;

        mappedValues.item_stock_type = toUpper(
          toDisplayValue(getFieldValue(rowSource, "item_stock_type")) ||
            toDisplayValue(getFirstDefinedValue(rowSource, LOOKUP_KEYS.alias)) ||
            ITEM_INITIAL_FORM_VALUES.item_stock_type,
        );

        mappedValues.item_hsn_code = toUpper(
          toDisplayValue(getFieldValue(rowSource, "item_hsn_code")),
        );

        mappedValues.item_batch_config =
          toDisplayValue(getFieldValue(rowSource, "item_batch_config")) ||
          ITEM_INITIAL_FORM_VALUES.item_batch_config;

        mappedValues.item_sort_order =
          toDisplayValue(getFieldValue(rowSource, "item_sort_order")) ||
          toDisplayValue(getFirstDefinedValue(rowSource, LOOKUP_KEYS.position)) ||
          ITEM_INITIAL_FORM_VALUES.item_sort_order;

        mappedValues.item_notes =
          toDisplayValue(getFieldValue(rowSource, "item_notes")) ||
          toDisplayValue(getFirstDefinedValue(rowSource, LOOKUP_KEYS.description)) ||
          defaults.masterDescription ||
          ITEM_INITIAL_FORM_VALUES.item_notes;

        mappedValues.item_packing_item_ids =
          toCsvFromArray(getFieldValue(rowSource, "item_packing_item_ids")) ||
          ITEM_INITIAL_FORM_VALUES.item_packing_item_ids;

        mappedValues.item_expiry_days =
          toDisplayValue(getFieldValue(rowSource, "item_expiry_days")) ||
          ITEM_INITIAL_FORM_VALUES.item_expiry_days;

        mappedValues.item_intimate_before_days =
          toDisplayValue(getFieldValue(rowSource, "item_intimate_before_days")) ||
          ITEM_INITIAL_FORM_VALUES.item_intimate_before_days;

        return mappedValues;
      }}
      buildRequestPayload={async ({
        values,
        shouldUpdate,
        editingItemId,
        files,
      }) => {
        const payload: Record<string, unknown> = {
          item_company_id: (values.item_company_id ?? "").trim(),
          item_branch_id: toNullableString(values.item_branch_id ?? ""),
          item_code: toNullableString(values.item_code ?? ""),
          item_sku: toNullableString(values.item_sku ?? ""),
          item_name_en: (values.item_name_en ?? "").trim(),
          item_name_ta: toNullableString(values.item_name_ta ?? ""),
          item_alias: toNullableString(values.item_alias ?? ""),
          item_stock_type: toUpper(values.item_stock_type ?? "") || "FG",
          item_default_barcode: toNullableString(values.item_default_barcode ?? ""),
          item_group_id: (values.item_group_id ?? "").trim(),
          item_category_id: toNullableString(values.item_category_id ?? ""),
          item_brand_id: toNullableString(values.item_brand_id ?? ""),
          item_section_id: toNullableString(values.item_section_id ?? ""),
          item_company_category_id: toNullableString(
            values.item_company_category_id ?? "",
          ),
          item_mfgr_id: toNullableString(values.item_mfgr_id ?? ""),
          item_supplier_id: toNullableString(values.item_supplier_id ?? ""),
          item_base_unit_id: (values.item_base_unit_id ?? "").trim(),
          item_is_service: (values.item_is_service ?? "false") === "true",
          item_is_batch_based: (values.item_is_batch_based ?? "false") === "true",
          item_is_expiry_item: (values.item_is_expiry_item ?? "false") === "true",
          item_expiry_days: toOptionalNonNegativeInteger(
            values.item_expiry_days ?? "",
          ),
          item_intimate_before_days: toOptionalNonNegativeInteger(
            values.item_intimate_before_days ?? "",
          ),
          item_allow_sales: (values.item_allow_sales ?? "true") === "true",
          item_allow_sales_return:
            (values.item_allow_sales_return ?? "true") === "true",
          item_allow_purchase: (values.item_allow_purchase ?? "true") === "true",
          item_allow_po: (values.item_allow_po ?? "true") === "true",
          item_allow_so: (values.item_allow_so ?? "true") === "true",
          item_allow_neg_stock:
            (values.item_allow_neg_stock ?? "true") === "true",
          item_allow_negative_so:
            (values.item_allow_negative_so ?? "true") === "true",
          item_price_list: (values.item_price_list ?? "false") === "true",
          item_weigh_scale: (values.item_weigh_scale ?? "false") === "true",
          item_retail_item: (values.item_retail_item ?? "true") === "true",
          item_is_kit: (values.item_is_kit ?? "false") === "true",
          item_auto_break: (values.item_auto_break ?? "false") === "true",
          item_auto_make: (values.item_auto_make ?? "false") === "true",
          item_allow_loyalty: (values.item_allow_loyalty ?? "false") === "true",
          item_allow_promo: (values.item_allow_promo ?? "false") === "true",
          item_has_offer: (values.item_has_offer ?? "false") === "true",
          item_damagable_product:
            (values.item_damagable_product ?? "false") === "true",
          item_is_demand: (values.item_is_demand ?? "false") === "true",
          item_allow_loading: (values.item_allow_loading ?? "false") === "true",
          item_allow_freight: (values.item_allow_freight ?? "false") === "true",
          item_random_stock: (values.item_random_stock ?? "false") === "true",
          item_barcode_sticker:
            (values.item_barcode_sticker ?? "false") === "true",
          item_default_tax_id: toNullableString(values.item_default_tax_id ?? ""),
          item_hsn_code: toUpperNullable(values.item_hsn_code ?? ""),
          item_batch_config: toNonNegativeInteger(
            values.item_batch_config ?? "0",
            0,
          ),
          item_sort_order: toOptionalNonNegativeInteger(
            values.item_sort_order ?? "",
          ),
          item_image_url: toNullableString(values.item_image_url ?? ""),
          item_notes: toNullableString(values.item_notes ?? ""),
          item_storage_location: toNullableString(values.item_storage_location ?? ""),
          item_packing_item_ids: toUniqueStringArrayFromCsv(
            values.item_packing_item_ids ?? "",
          ),
          item_is_active: (values.item_is_active ?? "true") === "true",
          item_created_by: toNullableString(values.item_created_by ?? ""),
          item_modified_by: toNullableString(values.item_modified_by ?? ""),
        };

        const selectedPhoto = files.item_photo_file;
        if (selectedPhoto) {
          payload.item_photo = await fileToBase64(selectedPhoto);
        }

        if (shouldUpdate && editingItemId !== null) {
          payload.item_id = toUpdateId(editingItemId);
        }

        return payload;
      }}
    />
  );
}
