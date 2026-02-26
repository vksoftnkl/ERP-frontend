"use client";

import { useEffect, useMemo, useState } from "react";
import CrudMasterPage from "@/components/master/crud-master-page";
import { useApi } from "@/hooks/useApi";
import type {
  ERPDynamicModalField,
  ERPDynamicSelectOption,
} from "@/components/library/ui/dynamic-modal-form";
import styles from "../state-master/page.module.scss";
import {
  buildLookupOptions,
  getFirstDefinedValue,
  toDisplayValue,
  toNonNegativeInteger,
  toNullableNumber,
  toNullableString,
  toSelectBoolean,
  toUpdateId,
  toUpper,
  DEFAULT_LOOKUP_ARRAY_KEYS,
} from "../_shared/crud-utils";

const API_ENDPOINTS = {
  list: "/ledger-shipping-addresses/list",
  getById: "/ledger-shipping-addresses/get",
  create: "/ledger-shipping-addresses/create",
  delete: "/ledger-shipping-addresses/delete",
} as const;

const LOOKUP_ENDPOINT = "/master-lookups/name-id/all-accounts-and-masters";

const LOOKUP_QUERY_ACCOUNT_LEDGERS = {
  module: "accountLedgers",
  limit: "100",
} as const;

const LOOKUP_KEYS = {
  id: ["saaId", "saa_id", "id", "_id"],
  code: ["saaAddrType", "saa_addr_type", "code"],
  name: ["saaTrdnm", "saa_trdnm", "name", "tradeName", "trade_name"],
  short: ["saaContactName", "saa_contact_name", "contactName", "contact_name", "short"],
  alias: ["saaPhone", "saa_phone", "alias"],
  active: ["saaIsActive", "saa_is_active", "isActive", "is_active", "status"],
  position: ["saaSort", "saa_sort", "position", "sort"],
  description: ["saaRemarks", "saa_remarks", "description", "remarks"],
  array: [
    "data",
    "items",
    "results",
    "rows",
    "list",
    "ledgerShippingAddresses",
    "ledger_shipping_addresses",
  ],
} as const;

const REQUEST_PAYLOAD_KEYS = {
  id: "saaId",
  name: "saaTrdnm",
  alias: "saaPhone",
  short: "saaContactName",
  description: "saaRemarks",
  sort: "saaSort",
} as const;

const SAA_LEDGER_ID_KEYS = ["saaLedgerId", "saa_ledger_id", "ledgerId", "ledger_id"] as const;
const SAA_ADDR_TYPE_KEYS = ["saaAddrType", "saa_addr_type", "addrType", "addr_type"] as const;
const SAA_CONTACT_NAME_KEYS = ["saaContactName", "saa_contact_name", "contactName", "contact_name"] as const;
const SAA_ADDR1_KEYS = ["saaAddr1", "saa_addr1", "addr1"] as const;
const SAA_ADDR2_KEYS = ["saaAddr2", "saa_addr2", "addr2"] as const;
const SAA_ADDR3_KEYS = ["saaAddr3", "saa_addr3", "addr3"] as const;
const SAA_LOC_KEYS = ["saaLoc", "saa_loc", "location"] as const;
const SAA_PIN_KEYS = ["saaPin", "saa_pin", "pin"] as const;
const SAA_STATE_CODE_KEYS = ["saaStateCode", "saa_state_code", "stateCode", "state_code"] as const;
const SAA_STATE_NAME_KEYS = ["saaStateName", "saa_state_name", "stateName", "state_name"] as const;
const SAA_DISTANCE_KEYS = ["saaDistanceKm", "saa_distance_km", "distanceKm", "distance_km"] as const;
const SAA_PHONE_KEYS = ["saaPhone", "saa_phone", "phone"] as const;
const SAA_EMAIL_KEYS = ["saaEmail", "saa_email", "email"] as const;
const SAA_GSTIN_KEYS = ["saaGstin", "saa_gstin", "gstin"] as const;
const SAA_PAN_KEYS = ["saaPan", "saa_pan", "pan"] as const;
const SAA_IS_DEFAULT_KEYS = ["saaIsDefault", "saa_is_default", "isDefault", "is_default"] as const;
const SAA_IS_ACTIVE_KEYS = ["saaIsActive", "saa_is_active", "isActive", "is_active", "status"] as const;

const DEFAULT_LEDGER_OPTION: ERPDynamicSelectOption = {
  value: "",
  label: "Select Account Ledger",
};

const INITIAL_FORM_VALUES = {
  masterName: "",
  saaLedgerId: "",
  saaAddrType: "BILLING",
  saaContactName: "",
  saaAddr1: "",
  saaAddr2: "",
  saaAddr3: "",
  saaLoc: "",
  saaPin: "",
  saaStateCode: "",
  saaStateName: "",
  saaDistanceKm: "",
  saaPhone: "",
  saaEmail: "",
  saaGstin: "",
  saaPan: "",
  position: "0",
  saaIsDefault: "false",
  saaIsActive: "true",
  masterDescription: "",
} as const;

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

function buildLedgerShippingAddressFields(
  ledgerOptions: ERPDynamicSelectOption[],
): ERPDynamicModalField[] {
  return [
    {
      name: "masterName",
      label: "Trade Name",
      placeholder: "ABC Traders",
    },
    {
      name: "saaLedgerId",
      label: "Account Ledger",
      type: "select",
      searchable: true,
      required: true,
      options: ledgerOptions,
      validation: {
        requiredMessage: "Account Ledger is required.",
      },
    },
    {
      name: "saaAddrType",
      label: "Address Type",
      placeholder: "BILLING",
      validation: {
        maxLength: 20,
        maxLengthMessage: "Address Type must be at most 20 characters.",
      },
    },
    {
      name: "saaContactName",
      label: "Contact Name",
    },
    {
      name: "saaAddr1",
      label: "Address Line 1",
    },
    {
      name: "saaAddr2",
      label: "Address Line 2",
    },
    {
      name: "saaAddr3",
      label: "Address Line 3",
    },
    {
      name: "saaLoc",
      label: "Location",
    },
    {
      name: "saaPin",
      label: "PIN",
    },
    {
      name: "saaStateCode",
      label: "State Code",
      validation: {
        minLength: 2,
        maxLength: 2,
        minLengthMessage: "State Code must be exactly 2 characters.",
        maxLengthMessage: "State Code must be exactly 2 characters.",
      },
    },
    {
      name: "saaStateName",
      label: "State Name",
    },
    {
      name: "saaDistanceKm",
      label: "Distance (Km)",
      type: "number",
      min: 0,
      step: 1,
      validation: {
        minMessage: "Distance must be 0 or greater.",
      },
    },
    {
      name: "saaPhone",
      label: "Phone",
      type: "tel",
    },
    {
      name: "saaEmail",
      label: "Email",
      type: "email",
    },
    {
      name: "saaGstin",
      label: "GSTIN",
      validation: {
        maxLength: 15,
        maxLengthMessage: "GSTIN must be at most 15 characters.",
      },
    },
    {
      name: "saaPan",
      label: "PAN",
      validation: {
        minLength: 10,
        maxLength: 10,
        minLengthMessage: "PAN must be exactly 10 characters.",
        maxLengthMessage: "PAN must be exactly 10 characters.",
      },
    },
    {
      name: "position",
      label: "Sort",
      type: "number",
      min: 0,
      step: 1,
      validation: {
        minMessage: "Sort must be 0 or greater.",
      },
    },
    {
      name: "saaIsDefault",
      label: "Default Address",
      type: "checkbox",
      options: [
        { label: "Yes", value: "true" },
        { label: "No", value: "false" },
      ],
    },
    {
      name: "saaIsActive",
      label: "Status",
      type: "checkbox",
      options: [
        { label: "Active", value: "true" },
        { label: "Inactive", value: "false" },
      ],
    },
    {
      name: "masterDescription",
      label: "Remarks",
      type: "textarea",
      colSpan: 2,
    },
  ];
}

export default function LedgerShippingAddressMasterPage() {
  const { getAll: getLedgerLookup } = useApi<unknown>(LOOKUP_ENDPOINT);
  const [ledgerOptions, setLedgerOptions] = useState<ERPDynamicSelectOption[]>([
    DEFAULT_LEDGER_OPTION,
  ]);

  useEffect(() => {
    let mounted = true;

    void (async () => {
      try {
        const payload = await getLedgerLookup(LOOKUP_QUERY_ACCOUNT_LEDGERS);
        if (!mounted) {
          return;
        }

        setLedgerOptions(
          buildLookupOptions(payload, DEFAULT_LEDGER_OPTION, {
            arrayKeys: DEFAULT_LOOKUP_ARRAY_KEYS,
            idKeys: ["id", "value"],
            labelKeys: ["name", "label"],
          }),
        );
      } catch {
        if (mounted) {
          setLedgerOptions([DEFAULT_LEDGER_OPTION]);
        }
      }
    })();

    return () => {
      mounted = false;
    };
  }, [getLedgerLookup]);

  const formFields = useMemo(() => buildLedgerShippingAddressFields(ledgerOptions), [ledgerOptions]);

  return (
    <CrudMasterPage
      title="Ledger Shipping Address"
      entityLabel="ledger shipping address"
      entityLabelPlural="ledger shipping addresses"
      apiEndpoints={API_ENDPOINTS}
      lookupKeys={LOOKUP_KEYS}
      requestPayloadKeys={REQUEST_PAYLOAD_KEYS}
      styles={styles}
      listTitle="Ledger Shipping Address List"
      createLabel="Add Ledger Shipping Address"
      codeColumnHeader="Address Type"
      nameColumnHeader="Trade Name"
      nameFieldLabel="Trade Name"
      nameFieldPlaceholder="ABC Traders"
      formTitle="Ledger Shipping Address Form"
      formDescription="Create and update ledger shipping addresses."
      customFields={formFields}
      createInitialValues={INITIAL_FORM_VALUES}
      mapFormValues={({ source, defaults }) => {
        const rowSource = source ?? {};
        const mergedDefaults = { ...INITIAL_FORM_VALUES, ...defaults };

        return {
          ...INITIAL_FORM_VALUES,
          masterName:
            toDisplayValue(getFirstDefinedValue(rowSource, LOOKUP_KEYS.name)) || mergedDefaults.masterName,
          saaLedgerId:
            toDisplayValue(getFirstDefinedValue(rowSource, SAA_LEDGER_ID_KEYS)) ||
            mergedDefaults.saaLedgerId,
          saaAddrType:
            toDisplayValue(getFirstDefinedValue(rowSource, SAA_ADDR_TYPE_KEYS)) ||
            mergedDefaults.saaAddrType,
          saaContactName:
            toDisplayValue(getFirstDefinedValue(rowSource, SAA_CONTACT_NAME_KEYS)) ||
            mergedDefaults.saaContactName,
          saaAddr1:
            toDisplayValue(getFirstDefinedValue(rowSource, SAA_ADDR1_KEYS)) || mergedDefaults.saaAddr1,
          saaAddr2:
            toDisplayValue(getFirstDefinedValue(rowSource, SAA_ADDR2_KEYS)) || mergedDefaults.saaAddr2,
          saaAddr3:
            toDisplayValue(getFirstDefinedValue(rowSource, SAA_ADDR3_KEYS)) || mergedDefaults.saaAddr3,
          saaLoc:
            toDisplayValue(getFirstDefinedValue(rowSource, SAA_LOC_KEYS)) || mergedDefaults.saaLoc,
          saaPin:
            toDisplayValue(getFirstDefinedValue(rowSource, SAA_PIN_KEYS)) || mergedDefaults.saaPin,
          saaStateCode:
            toDisplayValue(getFirstDefinedValue(rowSource, SAA_STATE_CODE_KEYS)) ||
            mergedDefaults.saaStateCode,
          saaStateName:
            toDisplayValue(getFirstDefinedValue(rowSource, SAA_STATE_NAME_KEYS)) ||
            mergedDefaults.saaStateName,
          saaDistanceKm:
            toDisplayValue(getFirstDefinedValue(rowSource, SAA_DISTANCE_KEYS)) ||
            mergedDefaults.saaDistanceKm,
          saaPhone:
            toDisplayValue(getFirstDefinedValue(rowSource, SAA_PHONE_KEYS)) || mergedDefaults.saaPhone,
          saaEmail:
            toDisplayValue(getFirstDefinedValue(rowSource, SAA_EMAIL_KEYS)) || mergedDefaults.saaEmail,
          saaGstin:
            toDisplayValue(getFirstDefinedValue(rowSource, SAA_GSTIN_KEYS)) || mergedDefaults.saaGstin,
          saaPan:
            toDisplayValue(getFirstDefinedValue(rowSource, SAA_PAN_KEYS)) || mergedDefaults.saaPan,
          position:
            toDisplayValue(getFirstDefinedValue(rowSource, LOOKUP_KEYS.position)) || mergedDefaults.position,
          saaIsDefault: toSelectBoolean(getFirstDefinedValue(rowSource, SAA_IS_DEFAULT_KEYS), "false"),
          saaIsActive: toSelectBoolean(getFirstDefinedValue(rowSource, SAA_IS_ACTIVE_KEYS), "true"),
          masterDescription:
            toDisplayValue(getFirstDefinedValue(rowSource, LOOKUP_KEYS.description)) ||
            mergedDefaults.masterDescription,
        };
      }}
      buildRequestPayload={({ values, shouldUpdate, editingItemId }) => {
        const payload: Record<string, unknown> = {
          saaLedgerId: (values.saaLedgerId ?? "").trim(),
          saaAddrType: toUpper(values.saaAddrType ?? "BILLING"),
          saaIsDefault: (values.saaIsDefault ?? "false") === "true",
          saaSort: toNonNegativeInteger(values.position ?? "0", 0),
          saaTrdnm: toNullableString(values.masterName ?? ""),
          saaContactName: toNullableString(values.saaContactName ?? ""),
          saaAddr1: toNullableString(values.saaAddr1 ?? ""),
          saaAddr2: toNullableString(values.saaAddr2 ?? ""),
          saaAddr3: toNullableString(values.saaAddr3 ?? ""),
          saaLoc: toNullableString(values.saaLoc ?? ""),
          saaPin: toNullableString(values.saaPin ?? ""),
          saaStateCode: toNullableString(toUpper(values.saaStateCode ?? "")),
          saaStateName: toNullableString(values.saaStateName ?? ""),
          saaDistanceKm: toOptionalNonNegativeInteger(values.saaDistanceKm ?? ""),
          saaPhone: toNullableString(values.saaPhone ?? ""),
          saaEmail: toNullableString(values.saaEmail ?? ""),
          saaGstin: toNullableString(toUpper(values.saaGstin ?? "")),
          saaPan: toNullableString(toUpper(values.saaPan ?? "")),
          saaIsActive: (values.saaIsActive ?? "true") === "true",
          saaRemarks: toNullableString(values.masterDescription ?? ""),
        };

        if (shouldUpdate && editingItemId !== null) {
          payload.saaId = toUpdateId(editingItemId);
        }

        return payload;
      }}
    />
  );
}
