import type { FormDefaultsFieldSpec } from "@/features/masters/shared/build-form-defaults";
import { ITEM_BOOLEAN_FIELD_NAMES } from "../item-master-page.constants";
import { ITEM_TEMPLATE_EXCLUDED_PREFIXES } from "./excluded";

/**
 * How each Item Entry field is written into the template document.
 *
 * Only the LAZY dropdowns carry a `*Name` companion, and that is the rule
 * rather than an omission: a lazy field has no options when the create form
 * opens, so without the stored label its box would come up looking empty. The
 * eager ones (branch, base unit, HSN) have their lists loaded by then and
 * resolve their own label from the id.
 *
 * The `*_name` keys are the ones `/items/get` already returns for those
 * columns, so a document written here reads the same way as a fetched item.
 */
const ID_FIELDS: FormDefaultsFieldSpec[] = [
  { name: "item_company_id", kind: "id", labelKey: "item_company_name" },
  { name: "item_group_id", kind: "id", labelKey: "item_group_name" },
  { name: "item_category_id", kind: "id", labelKey: "item_category_name" },
  { name: "item_section_id", kind: "id", labelKey: "item_section_name" },
  { name: "item_brand_id", kind: "id", labelKey: "item_brand_name" },
  { name: "item_cust_group", kind: "id", labelKey: "item_cust_group_name" },
  { name: "item_supplier_id", kind: "id", labelKey: "item_supplier_name" },
  { name: "item_default_tax_id", kind: "id", labelKey: "item_default_tax_name" },
];

const NUMBER_FIELDS = ["item_sort_order", "item_expiry_days", "item_intimate_before_days"] as const;

export const ITEM_TEMPLATE_FIELD_SPECS: FormDefaultsFieldSpec[] = [
  ...ID_FIELDS,
  ...NUMBER_FIELDS.map((name) => ({ name, kind: "number" as const })),
  // The row editors' own flags (ir_is_active, ean_is_default, …) are dropped by
  // the prefix rule, so they are left out here rather than declared and ignored.
  ...ITEM_BOOLEAN_FIELD_NAMES.filter(
    (name) => !ITEM_TEMPLATE_EXCLUDED_PREFIXES.some((prefix) => name.startsWith(prefix)),
  ).map((name) => ({ name, kind: "boolean" as const })),
];

/** The lazy dropdowns, in the order the create form seeds them. */
export const ITEM_TEMPLATE_SEEDED_FIELDS = ID_FIELDS.map((spec) => spec.name);

/** The picks worth showing in the prompt before the operator agrees to store them. */
export const ITEM_TEMPLATE_SUMMARY_FIELDS = [
  ["item_group_name", "Group"],
  ["item_category_name", "Category"],
  ["item_brand_name", "Brand"],
  ["item_default_tax_name", "Default Tax"],
] as const;
