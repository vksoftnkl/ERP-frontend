"use client";

import CrudMasterPage from "@/components/master/crud-master-page";
import styles from "./page.module.scss";

const API_ENDPOINTS = {
  list: "/item-taxes/list",
  getById: "/item-taxes/get",
  create: "/item-taxes/create",
  delete: "/item-taxes/delete",
} as const;

const LOOKUP_KEYS = {
  id: ["tax_id", "taxId", "id", "_id", "itt_id", "itemtaxid", "item_tax_id", "itemTaxId"],
  code: [
    "tax_code",
    "taxCode",
    "code",
    "itt_alias",
    "itt_short",
    "taxalias",
    "taxshort",
    "gst_code",
    "hsn_code",
  ],
  name: [
    "tax_name",
    "taxName",
    "name",
    "itt_name",
    "itemtaxname",
    "item_tax_name",
    "itemTaxName",
    "gst_name",
  ],
  short: ["itt_short", "short_name", "shortName", "short", "taxshort", "tax_short"],
  alias: ["itt_alias", "alias", "tax_alias", "taxalias", "itemtaxalias", "item_tax_alias"],
  active: ["itt_active", "active", "is_active", "isActive", "isactive", "status"],
  position: ["position", "itt_sort", "sort"],
  description: ["itt_description", "tax_description", "description", "desc"],
  array: ["data", "items", "results", "rows", "list", "taxes", "itemTaxes"],
} as const;

const REQUEST_PAYLOAD_KEYS = {
  id: "tax_id",
  name: "tax_name",
  alias: "tax_alias",
  short: "tax_short",
  description: "tax_description",
  sort: "tax_sort",
} as const;

export default function TaxMasterPage() {
  return (
    <CrudMasterPage
      title="Tax"
      entityLabel="tax"
      entityLabelPlural="taxes"
      apiEndpoints={API_ENDPOINTS}
      lookupKeys={LOOKUP_KEYS}
      requestPayloadKeys={REQUEST_PAYLOAD_KEYS}
      styles={styles}
      listTitle="Tax List"
      createLabel="Add Tax"
      codeColumnHeader="Tax Code"
      nameColumnHeader="Tax Name"
      nameFieldLabel="Tax Name"
      nameFieldPlaceholder="GST 18%"
      formTitle="Tax Form"
      formDescription="Create and update taxes."
    />
  );
}
