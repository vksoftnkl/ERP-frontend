"use client";
import CrudMasterPage from "@/components/master/crud-master-page";
import type { ERPDynamicModalField } from "@/components/design-system/ui/dynamic-modal-form";
import styles from "@/app/master/state-master/page.module.scss";
import {
  getFirstDefinedValue,
  toDisplayValue,
  toNullableString,
  toSelectBoolean,
  toUpdateId,
} from "@/app/master/_shared/crud-utils";
const API_ENDPOINTS = {
 list: "/configured-grid-sql/run?grid_id=18",
  getById: "/supplier-groups/get",
  create: "/supplier-groups/create",
  delete: "/supplier-groups/delete",
} as const;
const GRID_TABLE_NAME = "supplier_groups";
const LOOKUP_KEYS = {
  id: ["spgId", "spg_id", "supplier_group_id", "supplierGroupId", "id", "_id"],
  code: ["spgAlias", "spg_alias", "spgShort", "spg_short", "code"],
  name: ["spgName", "spg_name", "group_name", "supplier_group_name", "name"],
  short: ["spgShort", "spg_short", "short_name", "shortName", "short"],
  alias: ["spgAlias", "spg_alias", "alias"],
  active: ["spgIsActive", "spg_is_active", "isActive", "is_active", "status"],
  position: ["position", "sort"],
  description: ["spgDesc", "spg_desc", "description", "desc"],
  array: ["data", "items", "results", "rows", "list", "supplierGroups", "supplier_groups"],
} as const;
const REQUEST_PAYLOAD_KEYS = {
  id: "spgId",
  name: "spgName",
  alias: "spgAlias",
  short: "spgShort",
  description: "spgDesc",
  sort: "position",
} as const;
const SUPPLIER_GROUP_IS_ACTIVE_KEYS = [
  "spgIsActive",
  "spg_is_active",
  "isActive",
  "is_active",
  "status",
] as const;
const SUPPLIER_GROUP_INITIAL_FORM_VALUES = {
  spgName: "",
  spgAlias: "",
  spgShort: "",
  spgDesc: "",
  spgIsActive: "true",
  spgCreatedBy: "",
  spgModifiedBy: "",
} as const;
const SUPPLIER_GROUP_FORM_FIELDS: ERPDynamicModalField[] = [
  {
    name: "spgName",
    label: "Group Name",
    colSpan: 2,
    required: true,
    validation: {
      minLength: 2,
      maxLength: 200,
      minLengthMessage: "Group Name must be at least 2 characters.",
      maxLengthMessage: "Group Name must be at most 200 characters.",
    },
  },
//   {
//     name: "spgAlias",
//     label: "Alias",
//     validation: {
//       maxLength: 150,
//       maxLengthMessage: "Alias must be at most 150 characters.",
//     },
//   },
  {
    name: "spgShort",
    label: "Short Name",
    colSpan: 2,
    validation: {
      maxLength: 50,
      maxLengthMessage: "Short Name must be at most 50 characters.",
    },
  },
  {
    name: "spgDesc",
    label: "Description",
    colSpan: 2,
    validation: {
      maxLength: 250,
      maxLengthMessage: "Description must be at most 250 characters.",
    },
  },
//   {
//     name: "spgIsActive",
//     label: "Status",
//     type: "checkbox",
//     options: [
//       { label: "Active", value: "true" },
//       { label: "Inactive", value: "false" },
//     ],
//   },
];
export default function SupplierGroupsPage() {
  return (
    <CrudMasterPage
      title="Supplier Group"
      auditHistory={{ screenName: "Supplier Group Master" }}
      entityLabel="supplier group"
      entityLabelPlural="supplier groups"
      apiEndpoints={API_ENDPOINTS}
      gridTableName={GRID_TABLE_NAME}
      useResponseTableColumns
      lookupKeys={LOOKUP_KEYS}
      requestPayloadKeys={REQUEST_PAYLOAD_KEYS}
      styles={styles}
      listTitle="Supplier Group List"
      createLabel="Add Supplier Group"
      codeColumnHeader="Alias"
      nameColumnHeader="Group Name"
      nameFieldLabel="Group Name"
      nameFieldPlaceholder="Pharma Wholesale"
      formTitle="Supplier Group Form"
      formDescription="Create and update supplier groups."
      customFields={SUPPLIER_GROUP_FORM_FIELDS}
      createInitialValues={SUPPLIER_GROUP_INITIAL_FORM_VALUES}
      mapFormValues={({ source, defaults }) => {
        const rowSource = source ?? {};
        return {
          ...SUPPLIER_GROUP_INITIAL_FORM_VALUES,
          spgName:
            toDisplayValue(rowSource.spgName ?? getFirstDefinedValue(rowSource, LOOKUP_KEYS.name)) ||
            defaults.masterName,
          spgAlias:
            toDisplayValue(rowSource.spgAlias ?? getFirstDefinedValue(rowSource, LOOKUP_KEYS.alias)) ||
            defaults.masterAlias,
          spgShort:
            toDisplayValue(rowSource.spgShort ?? getFirstDefinedValue(rowSource, LOOKUP_KEYS.short)) ||
            defaults.masterShortName,
          spgDesc:
            toDisplayValue(
              rowSource.spgDesc ?? getFirstDefinedValue(rowSource, LOOKUP_KEYS.description),
            ) || defaults.masterDescription,
          spgIsActive: toSelectBoolean(
            rowSource.spgIsActive ?? getFirstDefinedValue(rowSource, SUPPLIER_GROUP_IS_ACTIVE_KEYS),
            "true",
          ),
          spgCreatedBy: toDisplayValue(rowSource.spgCreatedBy),
          spgModifiedBy: toDisplayValue(rowSource.spgModifiedBy),
        };
      }}
      buildRequestPayload={({ values, shouldUpdate, editingItemId }) => {
        const payload: Record<string, unknown> = {
          spgName: (values.spgName ?? "").trim(),
          spgAlias: toNullableString(values.spgAlias ?? ""),
          spgShort: toNullableString(values.spgShort ?? ""),
          spgDesc: toNullableString(values.spgDesc ?? ""),
          spgIsActive: (values.spgIsActive ?? "true") === "true",
          spgCreatedBy: toNullableString(values.spgCreatedBy ?? ""),
          spgModifiedBy: toNullableString(values.spgModifiedBy ?? ""),
        };
        if (shouldUpdate && editingItemId !== null) {
          payload.spgId = toUpdateId(editingItemId);
        }
        return payload;
      }}
    />
  );
}
