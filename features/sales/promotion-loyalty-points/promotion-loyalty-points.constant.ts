import type { ERPDynamicSelectOption } from "@/components/design-system/ui";
import type { LookupConfig } from "./promotion-loyalty-points.local-types";
import { DEFAULT_LOOKUP_ARRAY_KEYS } from "@/features/masters/shared/normalizers";
export const SCHEME_TYPE_OPTIONS = [
  { value: "REDEEM", label: "Redeem" },
  { value: "BOTH", label: "Both" },
  { value: "GIFT", label: "Gift" },
] as const;
export const SCHEME_STATUS_OPTIONS = [
  { value: "DRAFT", label: "Draft" },
  { value: "APPROVED", label: "Approved" },
  { value: "ACTIVE", label: "Active" },
  { value: "CLOSED", label: "Closed" },
  { value: "CANCELLED", label: "Cancelled" },
] as const;
export const APPLY_ON_OPTIONS = [
  { value: "BILL_AMOUNT", label: "Based on Bill Amount" },
  { value: "ITEM_AMOUNT", label: "Based on Item Amount" },
  { value: "BILL_QTY", label: "Based on Bill Qty" },
  { value: "ITEM_QTY", label: "Based on Item Qty" },
  { value: "MASTER_PV", label: "Based on Master PV" },
] as const;
export const AMOUNT_TYPE_OPTIONS = [
  { value: "NET_AMOUNT", label: "Net Amount" },
  { value: "GROSS_AMOUNT", label: "Gross Amount" },
  { value: "TAXABLE_AMOUNT", label: "Taxable Amount" },
] as const;
export const BILL_TYPE_OPTIONS = [
  { value: "ALL", label: "All" },
  { value: "CASH", label: "Cash" },
  { value: "CREDIT", label: "Credit" },
] as const;
export const CUSTOMER_TYPE_OPTIONS = [
  { value: "ALL", label: "All Customers" },
  { value: "CUSTOMER_GROUP", label: "Customer Group" },
  { value: "CUSTOMER", label: "Customer" },
] as const;
export const ITEM_TYPE_OPTIONS = [
  { value: "ALL", label: "All Items" },
  { value: "ITEM_GROUP", label: " Based on  Item Group" },
  { value: "ITEM_BRAND", label: "Based on  Item Brand" },
  { value: "ITEM_CATEGORY", label: "Based on  Item Category" },
  { value: "ITEM_SECTION", label: "Based on  Item Section" },
  { value: "ITEM", label: "Based on  Item" },
] as const;
export const ROUNDING_OPTIONS = [
  { value: "FLOOR", label: "Floor" },
  { value: "ROUND", label: "Round" },
  { value: "CEIL", label: "Ceil" },
] as const;
export const EXPIRY_OPTIONS = [
  { value: "EARN_DATE", label: "Based on  Earn Date" },
  { value: "SCHEME_END_DATE", label: "Based on Scheme End Date" },
  { value: "MONTH_END", label: "Based on Month End" },
  { value: "YEAR_END", label: "Based on Year End" },
  { value: "NONE", label: "Based on None" },
] as const;
export const WEEKDAY_OPTIONS: ERPDynamicSelectOption[] = [
  { value: "MON", label: "Monday" },
  { value: "TUE", label: "Tuesday" },
  { value: "WED", label: "Wednesday" },
  { value: "THU", label: "Thursday" },
  { value: "FRI", label: "Friday" },
  { value: "SAT", label: "Saturday" },
  { value: "SUN", label: "Sunday" },
];
export const DEFAULT_BRANCH_OPTION: ERPDynamicSelectOption = { value: "", label: "All Branches" };
export const DEFAULT_ITEM_OPTION: ERPDynamicSelectOption = { value: "", label: "All Items" };
export const DEFAULT_ITEM_GROUP_OPTION: ERPDynamicSelectOption = { value: "", label: "All Item Groups" };
export const DEFAULT_ITEM_CATEGORY_OPTION: ERPDynamicSelectOption = { value: "", label: "All Item Categories" };
export const DEFAULT_ITEM_BRAND_OPTION: ERPDynamicSelectOption = { value: "", label: "All Item Brands" };
export const DEFAULT_ITEM_SECTION_OPTION: ERPDynamicSelectOption = { value: "", label: "All Item Sections" };
export const DEFAULT_POINT_SCOPE_OPTION: ERPDynamicSelectOption = { value: "", label: "Applies to all items" };
export const DEFAULT_UNIT_OPTION: ERPDynamicSelectOption = { value: "", label: "Any Unit" };
export const DEFAULT_REQUIRED_ITEM_OPTION: ERPDynamicSelectOption = { value: "", label: "Select Item" };
export const DEFAULT_REQUIRED_UNIT_OPTION: ERPDynamicSelectOption = { value: "", label: "Select Unit" };
export const DEFAULT_PARTY_CUSTOMER_GROUP_OPTION: ERPDynamicSelectOption = { value: "", label: "Select Customer Group" };
export const DEFAULT_PARTY_CUSTOMER_OPTION: ERPDynamicSelectOption = { value: "", label: "Select Customer" };
export const LOYALTY_LIST_ENDPOINT = "/promotion-loyalty-points/list";
export const LOYALTY_GET_ENDPOINT = "/promotion-loyalty-points/get";
export const LOYALTY_SAVE_ENDPOINT = "/promotion-loyalty-points/create";
export const LOYALTY_DELETE_ENDPOINT = "/promotion-loyalty-points/delete";
export const LOYALTY_POINT_SAVE_ENDPOINT = "/promotion-loyalty-points/points/create";
export const LOYALTY_POINT_DELETE_ENDPOINT = "/promotion-loyalty-points/points/delete";
export const LOYALTY_GIFT_SAVE_ENDPOINT = "/promotion-loyalty-points/gifts/create";
export const LOYALTY_GIFT_DELETE_ENDPOINT = "/promotion-loyalty-points/gifts/delete";
export const MASTER_LOOKUP_ENDPOINT = "/master-lookups/name-id/all-accounts-and-masters";
export const ITEM_LOOKUP_KEYS: LookupConfig = {
  arrayKeys: [...DEFAULT_LOOKUP_ARRAY_KEYS, "items", "item_masters"],
  idKeys: ["item_id", "itemId", "id", "_id", "value"],
  labelKeys: ["item_name_en", "itemNameEn", "item_name", "name", "label"],
};
export const ITEM_GROUP_LOOKUP_KEYS: LookupConfig = {
  arrayKeys: [...DEFAULT_LOOKUP_ARRAY_KEYS, "groups", "itemGroups"],
  idKeys: ["group_id", "groupId", "itg_id", "item_group_id", "itemGroupId", "id", "_id", "value"],
  labelKeys: ["group_name", "groupName", "itg_name", "item_group_name", "itemGroupName", "name", "label"],
};
export const ITEM_CATEGORY_LOOKUP_KEYS: LookupConfig = {
  arrayKeys: [...DEFAULT_LOOKUP_ARRAY_KEYS, "categories", "itemCategories", "item_categories"],
  idKeys: ["category_id", "categoryId", "item_category_id", "itemCategoryId", "id", "_id", "value"],
  labelKeys: ["category_name", "categoryName", "item_category_name", "itemCategoryName", "name", "label"],
};
export const ITEM_BRAND_LOOKUP_KEYS: LookupConfig = {
  arrayKeys: [...DEFAULT_LOOKUP_ARRAY_KEYS, "brands", "itemBrands"],
  idKeys: ["brand_id", "brandId", "item_brand_id", "itemBrandId", "id", "_id", "value"],
  labelKeys: ["brand_name", "brandName", "item_brand_name", "itemBrandName", "name", "label"],
};
export const ITEM_SECTION_LOOKUP_KEYS: LookupConfig = {
  arrayKeys: [...DEFAULT_LOOKUP_ARRAY_KEYS, "sections", "itemSections", "item_sections"],
  idKeys: ["sec_id", "secId", "section_id", "sectionId", "item_section_id", "itemSectionId", "id", "_id", "value"],
  labelKeys: ["sec_name", "secName", "section_name", "sectionName", "item_section_name", "itemSectionName", "name", "label"],
};
export const UNIT_LOOKUP_KEYS: LookupConfig = {
  arrayKeys: [...DEFAULT_LOOKUP_ARRAY_KEYS, "units", "itemUnits"],
  idKeys: ["unit_id", "unitId", "item_unit_id", "itemUnitId", "uom_id", "id", "_id", "value"],
  labelKeys: ["unit_name", "unitName", "item_unit_name", "itemUnitName", "uom_name", "name", "label"],
};
export const BRANCH_LOOKUP_KEYS: LookupConfig = {
  arrayKeys: [...DEFAULT_LOOKUP_ARRAY_KEYS, "branches", "branch_masters"],
  idKeys: ["brId", "br_id", "branch_id", "branchId", "id", "_id", "value"],
  labelKeys: ["brName", "br_name", "branch_name", "branchName", "name", "label"],
};
export const CUSTOMER_LOOKUP_KEYS: LookupConfig = {
  arrayKeys: [...DEFAULT_LOOKUP_ARRAY_KEYS, "customers"],
  idKeys: ["cusId", "cus_id", "customer_id", "customerId", "id", "_id", "value"],
  labelKeys: ["cusName", "cus_name", "customer_name", "customerName", "name", "label"],
};
export const CUSTOMER_GROUP_LOOKUP_KEYS: LookupConfig = {
  arrayKeys: [...DEFAULT_LOOKUP_ARRAY_KEYS, "customerGroups", "customer_groups"],
  idKeys: ["cgrId", "cgr_id", "group_id", "groupId", "id", "_id", "value"],
  labelKeys: ["cgrName", "cgr_name", "group_name", "groupName", "name", "label"],
};
