/**
 * One party as both customer and supplier (server notes 81).
 *
 * `cus_id` and `sup_id` ARE the ledger id, each with its own FK, so one ledger
 * can carry both rows: one party, one balance, sales and purchases netting on
 * the same account. `POST /customers/create` takes `cusLinkLedId` and
 * `POST /suppliers/create` takes `supLinkLedId`: with it the server writes only
 * the role row, creates no ledger and leaves the ledger's group where it is.
 *
 * A saved supplier's form offers "Also a Customer" once a probe of
 * `/customers/get` answers 404 (the party is not one yet) and the user may add
 * customers. The customer form then opens in add mode, prefilled from the
 * ledger, with the name locked — it IS the ledger's name — and the link id
 * riding on the save.
 *
 * The client mirror of the Qt `shared/party/party_role_link.cpp`. Pure: no
 * React, no network. `party-role-link.test.ts` pins the mapping.
 */

export type PartyRole = "customer" | "supplier";

/** The other role's master screen, and the field its create DTO links by. */
export const PARTY_ROLE_INFO = {
  customer: {
    label: "Customer",
    getEndpoint: "/customers/get",
    idKey: "cusId",
    linkKey: "cusLinkLedId",
    nameKey: "cusName",
    href: "/master/customer",
  },
  supplier: {
    label: "Supplier",
    getEndpoint: "/suppliers/get",
    idKey: "supId",
    linkKey: "supLinkLedId",
    nameKey: "supName",
    href: "/master/suppliers",
  },
} as const satisfies Record<
  PartyRole,
  {
    label: string;
    getEndpoint: string;
    idKey: string;
    linkKey: string;
    nameKey: string;
    href: string;
  }
>;

export const LEDGER_GET_ENDPOINT = "/account-ledger-masters/get";

/**
 * Ledger key → customer field → supplier field. An empty field: that master
 * has no such field. The supplier names three of them its own way (Pincode,
 * Phone, MailId) and has no second phone, Aadhaar, e-commerce GSTIN or contact
 * person. Company / branch / state ids go in as values; their names are
 * returned as labels so a lazy dropdown can show the selection unopened.
 */
const LEDGER_FIELD_MAP: ReadonlyArray<readonly [string, string, string]> = [
  ["ledName", "cusName", "supName"],
  ["ledShort", "cusShort", "supShort"],
  ["ledGstinNo", "cusGstNo", "supGstNo"],
  ["ledPanNo", "cusPanNo", "supPanNo"],
  ["ledEcommerceGstin", "cusEcommerceGstin", ""],
  ["ledAddr1", "cusAddr1", "supAddr1"],
  ["ledAddr2", "cusAddr2", "supAddr2"],
  ["ledAddr3", "cusAddr3", "supAddr3"],
  ["ledCity", "cusCity", "supCity"],
  ["ledDistrict", "cusDistrict", "supDistrict"],
  ["ledPin", "cusPin", "supPincode"],
  ["ledCountry", "cusCountry", "supCountry"],
  ["ledStateCode", "cusStateCode", "supStateCode"],
  ["ledStateName", "", "supStateName"],
  ["ledTel", "cusTel", "supTel"],
  ["ledPhone1", "cusPhone1", "supPhone"],
  ["ledPhone2", "cusPhone2", ""],
  ["ledWhatsappNo", "cusWhatsappNo", "supWhatsappNo"],
  ["ledEmail", "cusEmail", "supMailId"],
  ["ledAadharNo", "cusAadharNo", ""],
  ["ledContactPerson", "cusContactPerson", ""],
  ["ledCompanyId", "cusCompanyId", "supCompanyId"],
  ["ledBranchId", "cusBranchId", "supBranchId"],
  ["ledRegionName", "cusRegionName", "supRegionName"],
  ["ledRegionAddr1", "cusRegionAddr1", "supRegionAddr1"],
  ["ledRegionAddr2", "cusRegionAddr2", "supRegionAddr2"],
  ["ledRegionAddr3", "cusRegionAddr3", "supRegionAddr3"],
  ["ledRegionCity", "cusRegionCity", "supRegionCity"],
  ["ledRegionDistrict", "cusRegionDistrict", "supRegionDistrict"],
  ["ledRegionStateName", "cusRegionStateName", "supRegionStateName"],
  ["ledRegionCountry", "cusRegionCountry", "supRegionCountry"],
];

/** The ledger's registration type as each master's GST Type select values it. */
const GST_TYPE_BY_LEDGER_REG_TYPE: Record<string, Record<PartyRole, string>> = {
  REGULAR: { customer: "REGULAR", supplier: "Regular" },
  COMPOSITION: { customer: "COMPOSITION", supplier: "Composition" },
  UNREGISTERED: { customer: "UNREGISTERED", supplier: "Unregistered" },
};

export type LedgerPrefill = {
  /** Form values keyed by the target master's own field names. */
  values: Record<string, string>;
  /** Display names for the dropdowns whose value is an id or code. */
  labels: {
    companyName: string;
    branchName: string;
    stateName: string;
  };
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function textOf(value: unknown): string {
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  return typeof value === "string" ? value.trim() : "";
}

/** The ledger record out of `GET /account-ledger-masters/get`'s envelope. */
export function extractLedgerRecord(response: unknown): Record<string, unknown> | null {
  if (!isRecord(response)) {
    return null;
  }
  const data = response.data;
  if (isRecord(data)) {
    return data;
  }
  if (Array.isArray(data) && isRecord(data[0])) {
    return data[0];
  }
  return typeof response.ledId === "string" ? response : null;
}

/**
 * The ledger as the `target` master's form values. Blank ledger values are
 * left out, so they never overwrite the form's own defaults.
 */
export function prefillFromLedger(
  ledger: Record<string, unknown>,
  target: PartyRole,
): LedgerPrefill {
  const column = target === "customer" ? 1 : 2;
  const values: Record<string, string> = {};
  for (const row of LEDGER_FIELD_MAP) {
    const fieldName = row[column];
    const value = textOf(ledger[row[0]]);
    if (fieldName && value) {
      values[fieldName] = value;
    }
  }
  if (values.cusStateCode) {
    values.cusStateCode = values.cusStateCode.toUpperCase();
  }
  if (values.supStateCode) {
    values.supStateCode = values.supStateCode.toUpperCase();
  }

  // The ledger CHECKs REGULAR | COMPOSITION | UNREGISTERED. Unset on the
  // ledger: a GSTIN means registered.
  const regType = textOf(ledger.ledGstPartyRegType).toUpperCase();
  const known =
    GST_TYPE_BY_LEDGER_REG_TYPE[regType] ??
    GST_TYPE_BY_LEDGER_REG_TYPE[textOf(ledger.ledGstinNo) ? "REGULAR" : "UNREGISTERED"];
  values[target === "customer" ? "cusGstType" : "supGstType"] = known[target];

  return {
    values,
    labels: {
      companyName: textOf(ledger.ledCompanyName),
      branchName: textOf(ledger.ledBranchName),
      stateName: textOf(ledger.ledStateName),
    },
  };
}
