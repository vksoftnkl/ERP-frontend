"use client";
import CrudMasterPage from "@/components/master/crud-master-page";
import type { ERPDynamicModalField } from "@/components/design-system/ui/dynamic-modal-form";
import styles from "@/app/master/state-master/page.module.scss";
import {
  getFirstDefinedValue,
  toDisplayValue,
  toNonNegativeInteger,
  toNonNegativeNumber,
  toNullableString,
  toSelectBoolean,
  toUpdateId,
} from "@/app/master/_shared/crud-utils";
const API_ENDPOINTS = {
  list: "/customer-groups/list",
  getById: "/customer-groups/get",
  create: "/customer-groups/create",
  delete: "/customer-groups/delete",
} as const;
const GRID_TABLE_NAME = "cust_groups";
const LOOKUP_KEYS = {
  id: ["cgrId", "cgr_id", "id", "_id"],
  code: ["cgrAlias", "cgr_alias", "cgrShort", "cgr_short", "code"],
  name: ["cgrName", "cgr_name", "name"],
  short: ["cgrShort", "cgr_short", "short", "shortName"],
  alias: ["cgrAlias", "cgr_alias", "alias"],
  active: ["cgrIsActive", "cgr_is_active", "isActive", "is_active", "status"],
  position: ["cgrOrder", "cgr_order", "position", "sort"],
  description: ["cgrNarration", "cgr_narration", "description", "desc"],
  array: ["data", "items", "results", "rows", "list", "customerGroups", "customer_groups"],
} as const;
const REQUEST_PAYLOAD_KEYS = {
  id: "cgrId",
  name: "cgrName",
  alias: "cgrAlias",
  short: "cgrShort",
  description: "cgrNarration",
  sort: "cgrOrder",
} as const;
const GROUP_ALIAS_KEYS = ["cgrAlias", "cgr_alias", "alias"] as const;
const GROUP_SHORT_KEYS = ["cgrShort", "cgr_short", "short", "shortName"] as const;
const GROUP_NARRATION_KEYS = ["cgrNarration", "cgr_narration", "narration", "description", "desc"] as const;
const GROUP_ORDER_KEYS = ["cgrOrder", "cgr_order", "order", "position", "sort"] as const;
const GROUP_DISC_PERC_KEYS = ["cgrDiscPerc", "cgr_disc_perc", "discPerc", "discount"] as const;
const GROUP_COLLECTION_DAYS_KEYS = ["cgrCollectionDays", "cgr_collection_days", "collectionDays"] as const;
const GROUP_DEBIT_ALLOWED_KEYS = ["cgrDebitAllowed", "cgr_debit_allowed", "debitAllowed"] as const;
const GROUP_DEBIT_DAYS_KEYS = ["cgrDebitDays", "cgr_debit_days", "debitDays"] as const;
const GROUP_DEBIT_LIMIT_KEYS = ["cgrDebitLimit", "cgr_debit_limit", "debitLimit"] as const;
const GROUP_BILLS_LIMIT_KEYS = ["cgrBillsLimit", "cgr_bills_limit", "billsLimit"] as const;
const GROUP_OVERDUE_BILLING_KEYS = ["cgrOverdueBilling", "cgr_overdue_billing", "overdueBilling"] as const;
const GROUP_IS_ACTIVE_KEYS = ["cgrIsActive", "cgr_is_active", "isActive", "is_active", "status"] as const;
const INITIAL_FORM_VALUES = {
  cgrName: "",
  cgrAlias: "",
  cgrShort: "",
  cgrNarration: "",
  cgrOrder: "0",
  cgrDiscPerc: "0",
  cgrCollectionDays: "",
  cgrDebitAllowed: "false",
  cgrDebitDays: "0",
  cgrDebitLimit: "0",
  cgrBillsLimit: "0",
  cgrOverdueBilling: "false",
  cgrIsActive: "true",
} as const;
const CUSTOMER_GROUP_FORM_FIELDS: ERPDynamicModalField[] = [
  {
    name: "cgrName",
    label: "Group Name",
    required: true,
    colSpan: 2,
    validation: {
      minLength: 2,
      maxLength: 200,
      minLengthMessage: "Group Name must be at least 2 characters.",
      maxLengthMessage: "Group Name must be at most 200 characters.",
    },
  },
  // {
  //   name: "cgrAlias",
  //   label: "Alias",
  //   colSpan: 2,
  // },
  {
    name: "cgrShort",
    label: "Short Name",
    colSpan: 2,
  },
  {
    name: "cgrOrder",
    label: "Sort Order",
    type: "number",
  
    min: 0,
    step: 1,
    validation: {
      minMessage: "Sort Order must be 0 or greater.",
    },
  },
  {
    name: "cgrDiscPerc",
    label: "Discount %",
    type: "number",
    
    min: 0,
    step: 0.001,
    validation: {
      minMessage: "Discount % must be 0 or greater.",
    },
  },
  {
    name: "cgrCollectionDays",
    label: "Collection Days",
    colSpan: 2,
    placeholder: "1,7,15",
    helperText: "Comma-separated day numbers.",
  },
  {
    name: "cgrDebitDays",
    label: "Debit Days",
    type: "number",
    min: 0,
    step: 1,
    validation: {
      minMessage: "Debit Days must be 0 or greater.",
    },
  },
  {
    name: "cgrDebitLimit",
    label: "Debit Limit",
    type: "number",
    min: 0,
    step: 0.01,
    validation: {
      minMessage: "Debit Limit must be 0 or greater.",
    },
  },
  {
    name: "cgrBillsLimit",
    label: "Bills Limit",
    type: "number",
    min: 0,
    step: 1,
    validation: {
      minMessage: "Bills Limit must be 0 or greater.",
    },
  },
  {
    name: "cgrDebitAllowed",
    label: "Debit Allowed",
    type: "checkbox",
    colSpan:1,
    options: [
      { label: "Yes", value: "true" },
      { label: "No", value: "false" },
    ],
  },
  {
    name: "cgrOverdueBilling",
    label: "Overdue Billing",
    type: "checkbox",
      colSpan:1,
    options: [
      { label: "Yes", value: "true" },
      { label: "No", value: "false" },
    ],
  },
  {
    name: "cgrIsActive",
    label: "Status",
    type: "checkbox",
      colSpan:1,
    options: [
      { label: "Active", value: "true" },
      { label: "Inactive", value: "false" },
    ],
  },
  {
    name: "cgrNarration",
    label: "Narration",
    colSpan: 2,
  },
];
function toCollectionDaysInput(value: unknown): string {
  if (!Array.isArray(value)) {
    return "";
  }
  return value
    .filter((entry) => typeof entry === "number" && Number.isFinite(entry))
    .map((entry) => String(entry))
    .join(",");
}
function parseCollectionDays(value: string): number[] {
  const normalized = value.trim();
  if (!normalized) {
    return [];
  }
  const parsed = normalized
    .split(",")
    .map((token) => token.trim())
    .filter(Boolean)
    .map((token) => Number.parseInt(token, 10))
    .filter((token) => Number.isFinite(token) && token >= 0);
  return Array.from(new Set(parsed));
}
export default function CustomerGroupsPage() {
  return (
    <CrudMasterPage
      title="Customer Group"
      auditHistory={{ screenName: "Customer Group Master" }}
      entityLabel="customer group"
      entityLabelPlural="customer groups"
      apiEndpoints={API_ENDPOINTS}
      gridTableName={GRID_TABLE_NAME}
      useResponseTableColumns
      lookupKeys={LOOKUP_KEYS}
      requestPayloadKeys={REQUEST_PAYLOAD_KEYS}
      styles={styles}
      listTitle="Customer Group List"
      createLabel="Add Customer Group"
      codeColumnHeader="Alias"
      nameColumnHeader="Group Name"
      nameFieldLabel="Group Name"
      nameFieldPlaceholder="Retail"
      formTitle="Customer Group Form"
      formDescription="Create and update customer groups."
      customFields={CUSTOMER_GROUP_FORM_FIELDS}
      createInitialValues={INITIAL_FORM_VALUES}
      mapFormValues={({ source, defaults }) => {
        const rowSource = source ?? {};
        const mergedDefaults = { ...INITIAL_FORM_VALUES, ...defaults };
        return {
          ...INITIAL_FORM_VALUES,
          cgrName:
            toDisplayValue(getFirstDefinedValue(rowSource, LOOKUP_KEYS.name)) || mergedDefaults.cgrName,
          cgrAlias:
            toDisplayValue(getFirstDefinedValue(rowSource, GROUP_ALIAS_KEYS)) || mergedDefaults.cgrAlias,
          cgrShort:
            toDisplayValue(getFirstDefinedValue(rowSource, GROUP_SHORT_KEYS)) || mergedDefaults.cgrShort,
          cgrNarration:
            toDisplayValue(getFirstDefinedValue(rowSource, GROUP_NARRATION_KEYS)) ||
            mergedDefaults.cgrNarration,
          cgrOrder:
            toDisplayValue(getFirstDefinedValue(rowSource, GROUP_ORDER_KEYS)) || mergedDefaults.cgrOrder,
          cgrDiscPerc:
            toDisplayValue(getFirstDefinedValue(rowSource, GROUP_DISC_PERC_KEYS)) ||
            mergedDefaults.cgrDiscPerc,
          cgrCollectionDays: toCollectionDaysInput(
            getFirstDefinedValue(rowSource, GROUP_COLLECTION_DAYS_KEYS),
          ),
          cgrDebitAllowed: toSelectBoolean(
            getFirstDefinedValue(rowSource, GROUP_DEBIT_ALLOWED_KEYS),
            "false",
          ),
          cgrDebitDays:
            toDisplayValue(getFirstDefinedValue(rowSource, GROUP_DEBIT_DAYS_KEYS)) ||
            mergedDefaults.cgrDebitDays,
          cgrDebitLimit:
            toDisplayValue(getFirstDefinedValue(rowSource, GROUP_DEBIT_LIMIT_KEYS)) ||
            mergedDefaults.cgrDebitLimit,
          cgrBillsLimit:
            toDisplayValue(getFirstDefinedValue(rowSource, GROUP_BILLS_LIMIT_KEYS)) ||
            mergedDefaults.cgrBillsLimit,
          cgrOverdueBilling: toSelectBoolean(
            getFirstDefinedValue(rowSource, GROUP_OVERDUE_BILLING_KEYS),
            "false",
          ),
          cgrIsActive: toSelectBoolean(
            getFirstDefinedValue(rowSource, GROUP_IS_ACTIVE_KEYS),
            "true",
          ),
        };
      }}
      buildRequestPayload={({ values, shouldUpdate, editingItemId }) => {
        const payload: Record<string, unknown> = {
          cgrName: (values.cgrName ?? "").trim(),
          cgrAlias: toNullableString(values.cgrAlias ?? ""),
          cgrShort: toNullableString(values.cgrShort ?? ""),
          cgrNarration: toNullableString(values.cgrNarration ?? ""),
          cgrOrder: toNonNegativeNumber(values.cgrOrder ?? "0", 0),
          cgrDiscPerc: toNonNegativeNumber(values.cgrDiscPerc ?? "0", 0),
          cgrCollectionDays: parseCollectionDays(values.cgrCollectionDays ?? ""),
          cgrDebitAllowed: (values.cgrDebitAllowed ?? "false") === "true",
          cgrDebitDays: toNonNegativeInteger(values.cgrDebitDays ?? "0", 0),
          cgrDebitLimit: toNonNegativeNumber(values.cgrDebitLimit ?? "0", 0),
          cgrBillsLimit: toNonNegativeInteger(values.cgrBillsLimit ?? "0", 0),
          cgrOverdueBilling: (values.cgrOverdueBilling ?? "false") === "true",
          cgrIsActive: (values.cgrIsActive ?? "true") === "true",
        };
        if (shouldUpdate && editingItemId !== null) {
          payload.cgrId = toUpdateId(editingItemId);
        }
        return payload;
      }}
    />
  );
}
