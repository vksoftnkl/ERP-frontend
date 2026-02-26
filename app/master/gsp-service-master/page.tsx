"use client";

import CrudMasterPage from "@/components/master/crud-master-page";
import type { ERPDynamicModalField } from "@/components/library/ui/dynamic-modal-form";
import styles from "../state-master/page.module.scss";
import {
  getFirstDefinedValue,
  toDisplayValue,
  toSelectBoolean,
  toUpdateId,
} from "../_shared/crud-utils";

const API_ENDPOINTS = {
  list: "/tender-type-masters/list",
  getById: "/tender-type-masters/get",
  create: "/tender-type-masters/create",
  delete: "/tender-type-masters/delete",
} as const;

const LOOKUP_KEYS = {
  id: ["ttmTypeId", "ttm_type_id", "id", "_id"],
  code: ["ttmTypeName", "ttm_type_name", "code"],
  name: ["ttmTypeName", "ttm_type_name", "name"],
  short: ["ttmTypeName", "ttm_type_name", "short", "shortName"],
  alias: ["ttmTypeName", "ttm_type_name", "alias"],
  active: ["ttmIsActive", "ttm_is_active", "isActive", "is_active", "status"],
  position: ["position", "sort"],
  description: ["ttmTypeName", "ttm_type_name", "description"],
  array: ["data", "items", "results", "rows", "list", "tenderTypes", "tender_type_masters"],
} as const;

const REQUEST_PAYLOAD_KEYS = {
  id: "ttmTypeId",
  name: "ttmTypeName",
  alias: "ttmTypeName",
  short: "ttmTypeName",
  description: "ttmTypeName",
  sort: "position",
} as const;

const SERVICE_IS_ACTIVE_KEYS = ["ttmIsActive", "ttm_is_active", "isActive", "is_active", "status"] as const;

const INITIAL_FORM_VALUES = {
  masterName: "",
  gspServiceIsActive: "true",
} as const;

const FORM_FIELDS: ERPDynamicModalField[] = [
  {
    name: "masterName",
    label: "Service Name",
    required: true,
    validation: {
      minLength: 2,
      minLengthMessage: "Service Name must be at least 2 characters.",
    },
  },
  {
    name: "gspServiceIsActive",
    label: "Status",
    type: "checkbox",
    options: [
      { label: "Active", value: "true" },
      { label: "Inactive", value: "false" },
    ],
  },
];

export default function GspServiceMasterPage() {
  return (
    <CrudMasterPage
      title="GSP Service"
      entityLabel="gsp service"
      entityLabelPlural="gsp services"
      apiEndpoints={API_ENDPOINTS}
      lookupKeys={LOOKUP_KEYS}
      requestPayloadKeys={REQUEST_PAYLOAD_KEYS}
      styles={styles}
      listTitle="GSP Service List"
      createLabel="Add GSP Service"
      codeColumnHeader="Service"
      nameColumnHeader="Service Name"
      nameFieldLabel="Service Name"
      nameFieldPlaceholder="EINV"
      formTitle="GSP Service Form"
      formDescription="Create and update GSP services."
      customFields={FORM_FIELDS}
      createInitialValues={INITIAL_FORM_VALUES}
      mapFormValues={({ source, defaults }) => {
        const rowSource = source ?? {};
        const mergedDefaults = { ...INITIAL_FORM_VALUES, ...defaults };

        return {
          ...INITIAL_FORM_VALUES,
          masterName:
            toDisplayValue(getFirstDefinedValue(rowSource, LOOKUP_KEYS.name)) || mergedDefaults.masterName,
          gspServiceIsActive: toSelectBoolean(
            getFirstDefinedValue(rowSource, SERVICE_IS_ACTIVE_KEYS),
            "true",
          ),
        };
      }}
      buildRequestPayload={({ values, shouldUpdate, editingItemId }) => {
        const payload: Record<string, unknown> = {
          ttmTypeName: (values.masterName ?? "").trim(),
          ttmIsActive: (values.gspServiceIsActive ?? "true") === "true",
        };

        if (shouldUpdate && editingItemId !== null) {
          payload.ttmTypeId = toUpdateId(editingItemId);
        }

        return payload;
      }}
    />
  );
}
