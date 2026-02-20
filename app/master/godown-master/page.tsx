"use client";

import CrudMasterPage from "@/components/master/crud-master-page";
import styles from "./page.module.scss";

const API_ENDPOINTS = {
  list: "/godowns/list",
  getById: "/godowns/get",
  create: "/godowns/create",
  delete: "/godowns/delete",
} as const;

const LOOKUP_KEYS = {
  id: [
    "godown_id",
    "godownId",
    "id",
    "_id",
    "itgd_id",
    "godownid",
    "storage_id",
    "warehouse_id",
  ],
  code: [
    "godown_code",
    "godownCode",
    "code",
    "itgd_alias",
    "itgd_short",
    "godownalias",
    "godownshort",
    "warehouse_code",
    "storage_code",
  ],
  name: [
    "godown_name",
    "godownName",
    "name",
    "itgd_name",
    "warehouse_name",
    "storage_name",
  ],
  short: [
    "itgd_short",
    "short_name",
    "shortName",
    "short",
    "godownshort",
    "warehouse_short",
  ],
  alias: [
    "itgd_alias",
    "alias",
    "godown_alias",
    "godownalias",
    "warehouse_alias",
  ],
  active: ["itgd_active", "active", "is_active", "isActive", "isactive", "status"],
  position: ["position", "itgd_sort", "sort"],
  description: ["itgd_description", "godown_description", "description", "desc"],
  array: ["data", "items", "results", "rows", "list", "godowns", "warehouses"],
} as const;

const REQUEST_PAYLOAD_KEYS = {
  id: "godown_id",
  name: "godown_name",
  alias: "godown_alias",
  short: "godown_short",
  description: "godown_description",
  sort: "godown_sort",
} as const;

export default function GodownMasterPage() {
  return (
    <CrudMasterPage
      title="Godown"
      entityLabel="godown"
      entityLabelPlural="godowns"
      apiEndpoints={API_ENDPOINTS}
      lookupKeys={LOOKUP_KEYS}
      requestPayloadKeys={REQUEST_PAYLOAD_KEYS}
      styles={styles}
      listTitle="Godown List"
      createLabel="Add Godown"
      codeColumnHeader="Godown Code"
      nameColumnHeader="Godown Name"
      nameFieldLabel="Godown Name"
      nameFieldPlaceholder="Main Warehouse"
      formTitle="Godown Form"
      formDescription="Create and update godowns."
    />
  );
}
