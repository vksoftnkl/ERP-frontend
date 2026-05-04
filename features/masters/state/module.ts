import type { ERPDynamicModalField } from "@/components/library/ui/dynamic-modal-form";
import styles from "@/app/master/state-master/page.module.scss";
import {
  defineMasterModule,
  getFirstDefinedValue,
  toDisplayValue,
  toNonNegativeInteger,
  toSelectBoolean,
  toUpdateId,
} from "@/features/masters/shared";
const API_ENDPOINTS = {
  list: "/states/list",
  getById: "/states/get",
  create: "/states/create",
  delete: "/states/delete",
} as const;
const GRID_TABLE_NAME = "state_master";
const LOOKUP_KEYS = {
  id: ["stmId", "stm_id", "state_id", "stateId", "id", "_id"],
  code: ["stmAlias", "stm_alias", "stmShort", "stm_short", "state_code", "code"],
  name: ["stmName", "stm_name", "state_name", "stateName", "name"],
  short: ["stmShort", "stm_short", "state_short", "short_name", "shortName", "short"],
  alias: ["stmAlias", "stm_alias", "state_alias", "alias"],
  active: ["stmIsActive", "stm_is_active", "active", "is_active", "isActive", "status"],
  position: ["stmOrder", "stm_order", "state_order", "state_sort", "position", "sort"],
  description: ["stmAlias", "stm_alias"],
  array: ["data", "items", "results", "rows", "list", "states"],
} as const;
const REQUEST_PAYLOAD_KEYS = {
  id: "stmId",
  name: "stmName",
  alias: "stmAlias",
  short: "stmShort",
  description: "stmAlias",
  sort: "stmOrder",
} as const;
const STATE_IS_ACTIVE_KEYS = ["stmIsActive", "stm_is_active", "isActive", "is_active", "status"] as const;
const STATE_INITIAL_FORM_VALUES = {
  masterName: "",
  masterAlias: "",
  masterShortName: "",
  position: "0",
  stateIsActive: "true",
} as const;
const STATE_FORM_FIELDS: ERPDynamicModalField[] = [
  {
    name: "masterName",
    label: "State Name",
    colSpan: 2,
    required: true,
    validation: {
      minLength: 2,
      minLengthMessage: "State Name must be at least 2 characters.",
    },
  },
  {
    name: "masterAlias",
    label: "Alias",
    colSpan: 2,
  },
  {
    name: "masterShortName",
    label: "Short Name",
    colSpan: 2,
  },
  {
    name: "position",
    label: "Order",
    type: "number",
    min: 0,
    step: 1,
    validation: {
      minMessage: "Order must be 0 or greater.",
    },
  },
  {
    name: "stateIsActive",
    label: "Status",
    type: "checkbox",
    options: [
      { label: "Active", value: "true" },
      { label: "Inactive", value: "false" },
    ],
  },
];
export const stateModule = defineMasterModule({
  title: "State",
  auditHistory: { screenName: "State Master" },
  entityLabel: "state",
  entityLabelPlural: "states",
  apiEndpoints: API_ENDPOINTS,
  gridTableName: GRID_TABLE_NAME,
  useResponseTableColumns: true,
  lookupKeys: LOOKUP_KEYS,
  requestPayloadKeys: REQUEST_PAYLOAD_KEYS,
  styles,
  listTitle: "State List",
  createLabel: "Add State",
  codeColumnHeader: "State Code",
  nameColumnHeader: "State Name",
  nameFieldLabel: "State Name",
  nameFieldPlaceholder: "Gujarat",
  formTitle: "State Form",
  formDescription: "Create and update states.",
  customFields: STATE_FORM_FIELDS,
  createInitialValues: STATE_INITIAL_FORM_VALUES,
  mapFormValues: ({ source, defaults }) => {
    const rowSource = source ?? {};
    return {
      ...STATE_INITIAL_FORM_VALUES,
      masterName:
        toDisplayValue(getFirstDefinedValue(rowSource, LOOKUP_KEYS.name)) || defaults.masterName,
      masterAlias:
        toDisplayValue(getFirstDefinedValue(rowSource, LOOKUP_KEYS.alias)) || defaults.masterAlias,
      masterShortName:
        toDisplayValue(getFirstDefinedValue(rowSource, LOOKUP_KEYS.short)) || defaults.masterShortName,
      position:
        toDisplayValue(getFirstDefinedValue(rowSource, LOOKUP_KEYS.position)) || defaults.position,
      stateIsActive: toSelectBoolean(getFirstDefinedValue(rowSource, STATE_IS_ACTIVE_KEYS), "true"),
    };
  },
  buildRequestPayload: ({ values, shouldUpdate, editingItemId }) => ({
    stmName: (values.masterName ?? "").trim(),
    stmAlias: (values.masterAlias ?? "").trim() || null,
    stmShort: (values.masterShortName ?? "").trim() || null,
    stmOrder: Math.max(0, toNonNegativeInteger(values.position ?? "0", 0)),
    stmIsActive: (values.stateIsActive ?? "true") !== "false",
    ...(shouldUpdate && editingItemId !== null ? { stmId: toUpdateId(editingItemId) } : {}),
  }),
});
