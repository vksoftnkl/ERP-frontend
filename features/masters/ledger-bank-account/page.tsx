"use client";
import { useEffect, useMemo, useState } from "react";
import CrudMasterPage from "@/components/master/crud-master-page";
import { useApi } from "@/hooks/useApi";
import type {
  ERPDynamicModalField,
  ERPDynamicSelectOption,
} from "@/components/library/ui/dynamic-modal-form";
import styles from "@/app/master/state-master/page.module.scss";
import {
  buildLookupOptions,
  getFirstDefinedValue,
  toDisplayValue,
  toNullableString,
  toSelectBoolean,
  toUpdateId,
  toUpper,
  DEFAULT_LOOKUP_ARRAY_KEYS,
} from "@/app/master/_shared/crud-utils";
const API_ENDPOINTS = {
  list: "/ledger-bank-accounts/list",
  getById: "/ledger-bank-accounts/get",
  create: "/ledger-bank-accounts/create",
  delete: "/ledger-bank-accounts/delete",
} as const;
const GRID_TABLE_NAME = "acc_ledger_bank_accounts";
const LOOKUP_ENDPOINT = "/master-lookups/name-id/all-accounts-and-masters";
const LOOKUP_QUERY_COMPANIES = {
  module: "companies",
  limit: "20",
} as const;
const LOOKUP_QUERY_ACCOUNT_LEDGERS = {
  module: "accountLedgers",
  limit: "20",
} as const;
const LOOKUP_KEYS = {
  id: ["lbaId", "lba_id", "id", "_id"],
  code: ["lbaAccountNo", "lba_account_no", "accountNo", "account_no", "code"],
  name: ["lbaAccountHolder", "lba_account_holder", "accountHolder", "account_holder", "name"],
  short: ["lbaBankName", "lba_bank_name", "bankName", "bank_name", "short"],
  alias: ["lbaBranchName", "lba_branch_name", "branchName", "branch_name", "alias"],
  active: ["lbaIsActive", "lba_is_active", "isActive", "is_active", "status"],
  position: ["position", "sort"],
  description: ["lbaRemarks", "lba_remarks", "description", "remarks"],
  array: ["data", "items", "results", "rows", "list", "ledgerBankAccounts", "ledger_bank_accounts"],
} as const;
const REQUEST_PAYLOAD_KEYS = {
  id: "lbaId",
  name: "lbaAccountHolder",
  alias: "lbaBranchName",
  short: "lbaBankName",
  description: "lbaRemarks",
  sort: "position",
} as const;
const LBA_COMPANY_ID_KEYS = ["lbaCompanyId", "lba_company_id", "companyId", "company_id"] as const;
const LBA_LEDGER_ID_KEYS = ["lbaLedgerId", "lba_ledger_id", "ledgerId", "ledger_id"] as const;
const LBA_BANK_NAME_KEYS = ["lbaBankName", "lba_bank_name", "bankName", "bank_name"] as const;
const LBA_ACCOUNT_NO_KEYS = ["lbaAccountNo", "lba_account_no", "accountNo", "account_no"] as const;
const LBA_IFSC_KEYS = ["lbaIfscCode", "lba_ifsc_code", "ifscCode", "ifsc_code"] as const;
const LBA_MICR_KEYS = ["lbaMicrCode", "lba_micr_code", "micrCode", "micr_code"] as const;
const LBA_ACCOUNT_TYPE_KEYS = ["lbaAccountType", "lba_account_type", "accountType", "account_type"] as const;
const LBA_UPI_KEYS = ["lbaUpiId", "lba_upi_id", "upiId", "upi_id"] as const;
const LBA_CHEQUE_NAME_KEYS = ["lbaChequeName", "lba_cheque_name", "chequeName", "cheque_name"] as const;
const LBA_IS_DEFAULT_KEYS = ["lbaIsDefault", "lba_is_default", "isDefault", "is_default"] as const;
const LBA_IS_ACTIVE_KEYS = ["lbaIsActive", "lba_is_active", "isActive", "is_active", "status"] as const;
const DEFAULT_COMPANY_OPTION: ERPDynamicSelectOption = {
  value: "",
  label: "None",
};
const DEFAULT_LEDGER_OPTION: ERPDynamicSelectOption = {
  value: "",
  label: "Select Account Ledger",
};
const INITIAL_FORM_VALUES = {
  masterName: "",
  lbaCompanyId: "",
  lbaLedgerId: "",
  lbaBankName: "",
  lbaAccountNo: "",
  lbaBranchName: "",
  lbaIfscCode: "",
  lbaMicrCode: "",
  lbaAccountType: "",
  lbaUpiId: "",
  lbaChequeName: "",
  lbaIsDefault: "false",
  lbaIsActive: "true",
  masterDescription: "",
} as const;
function buildLedgerBankAccountFormFields(
  companyOptions: ERPDynamicSelectOption[],
  ledgerOptions: ERPDynamicSelectOption[],
): ERPDynamicModalField[] {
  return [
    {
      name: "masterName",
      label: "Account Holder",
      required: true,
      validation: {
        requiredMessage: "Account Holder is required.",
      },
    },
    {
      name: "lbaCompanyId",
      label: "Company",
      type: "select",
      searchable: true,
      options: companyOptions,
    },
    {
      name: "lbaLedgerId",
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
      name: "lbaBankName",
      label: "Bank Name",
      required: true,
      validation: {
        requiredMessage: "Bank Name is required.",
      },
    },
    {
      name: "lbaAccountNo",
      label: "Account Number",
      required: true,
      validation: {
        requiredMessage: "Account Number is required.",
      },
    },
    {
      name: "lbaBranchName",
      label: "Branch Name",
    },
    {
      name: "lbaIfscCode",
      label: "IFSC Code",
      placeholder: "ABCD0123456",
      validation: {
        minLength: 11,
        maxLength: 11,
        minLengthMessage: "IFSC Code must be exactly 11 characters.",
        maxLengthMessage: "IFSC Code must be exactly 11 characters.",
      },
    },
    {
      name: "lbaMicrCode",
      label: "MICR Code",
    },
    {
      name: "lbaAccountType",
      label: "Account Type",
      placeholder: "SAVINGS",
    },
    {
      name: "lbaUpiId",
      label: "UPI ID",
    },
    {
      name: "lbaChequeName",
      label: "Cheque Name",
    },
    {
      name: "lbaIsDefault",
      label: "Default Account",
      type: "checkbox",
      options: [
        { label: "Yes", value: "true" },
        { label: "No", value: "false" },
      ],
    },
    {
      name: "lbaIsActive",
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
export default function LedgerBankAccountMasterPage() {
  const { getAll: getCompanyLookup } = useApi<unknown>(LOOKUP_ENDPOINT);
  const { getAll: getLedgerLookup } = useApi<unknown>(LOOKUP_ENDPOINT);
  const [companyOptions, setCompanyOptions] = useState<ERPDynamicSelectOption[]>([
    DEFAULT_COMPANY_OPTION,
  ]);
  const [ledgerOptions, setLedgerOptions] = useState<ERPDynamicSelectOption[]>([
    DEFAULT_LEDGER_OPTION,
  ]);
  useEffect(() => {
    let mounted = true;
    void (async () => {
      try {
        const [companiesPayload, ledgersPayload] = await Promise.all([
          getCompanyLookup(LOOKUP_QUERY_COMPANIES),
          getLedgerLookup(LOOKUP_QUERY_ACCOUNT_LEDGERS),
        ]);

        if (!mounted) {
          return;
        }
        setCompanyOptions(
          buildLookupOptions(companiesPayload, DEFAULT_COMPANY_OPTION, {
            arrayKeys: DEFAULT_LOOKUP_ARRAY_KEYS,
            idKeys: ["id", "value"],
            labelKeys: ["name", "label"],
          }),
        );
        setLedgerOptions(
          buildLookupOptions(ledgersPayload, DEFAULT_LEDGER_OPTION, {
            arrayKeys: DEFAULT_LOOKUP_ARRAY_KEYS,
            idKeys: ["id", "value"],
            labelKeys: ["name", "label"],
          }),
        );
      } catch {
        if (!mounted) {
          return;
        }
        setCompanyOptions([DEFAULT_COMPANY_OPTION]);
        setLedgerOptions([DEFAULT_LEDGER_OPTION]);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [getCompanyLookup, getLedgerLookup]);
  const formFields = useMemo(
    () => buildLedgerBankAccountFormFields(companyOptions, ledgerOptions),
    [companyOptions, ledgerOptions],
  );
  return (
    <CrudMasterPage
      title="Ledger Bank Account"
      auditHistory={{ screenName: "Ledger Bank Account" }}
      entityLabel="ledger bank account"
      entityLabelPlural="ledger bank accounts"
      apiEndpoints={API_ENDPOINTS}
      gridTableName={GRID_TABLE_NAME}
      lookupKeys={LOOKUP_KEYS}
      requestPayloadKeys={REQUEST_PAYLOAD_KEYS}
      styles={styles}
      listTitle="Ledger Bank Account List"
      createLabel="Add Ledger Bank Account"
      codeColumnHeader="Account Number"
      nameColumnHeader="Account Holder"
      nameFieldLabel="Account Holder"
      nameFieldPlaceholder="ABC Traders"
      formTitle="Ledger Bank Account Form"
      formDescription="Create and update ledger bank accounts."
      customFields={formFields}
      createInitialValues={INITIAL_FORM_VALUES}
      mapFormValues={({ source, defaults }) => {
        const rowSource = source ?? {};
        const mergedDefaults = { ...INITIAL_FORM_VALUES, ...defaults };
        return {
          ...INITIAL_FORM_VALUES,
          masterName:
            toDisplayValue(getFirstDefinedValue(rowSource, LOOKUP_KEYS.name)) || mergedDefaults.masterName,
          lbaCompanyId:
            toDisplayValue(getFirstDefinedValue(rowSource, LBA_COMPANY_ID_KEYS)) ||
            mergedDefaults.lbaCompanyId,
          lbaLedgerId:
            toDisplayValue(getFirstDefinedValue(rowSource, LBA_LEDGER_ID_KEYS)) ||
            mergedDefaults.lbaLedgerId,
          lbaBankName:
            toDisplayValue(getFirstDefinedValue(rowSource, LBA_BANK_NAME_KEYS)) ||
            mergedDefaults.lbaBankName,
          lbaAccountNo:
            toDisplayValue(getFirstDefinedValue(rowSource, LBA_ACCOUNT_NO_KEYS)) ||
            mergedDefaults.lbaAccountNo,
          lbaBranchName:
            toDisplayValue(getFirstDefinedValue(rowSource, LOOKUP_KEYS.alias)) ||
            mergedDefaults.lbaBranchName,
          lbaIfscCode:
            toDisplayValue(getFirstDefinedValue(rowSource, LBA_IFSC_KEYS)) || mergedDefaults.lbaIfscCode,
          lbaMicrCode:
            toDisplayValue(getFirstDefinedValue(rowSource, LBA_MICR_KEYS)) || mergedDefaults.lbaMicrCode,
          lbaAccountType:
            toDisplayValue(getFirstDefinedValue(rowSource, LBA_ACCOUNT_TYPE_KEYS)) ||
            mergedDefaults.lbaAccountType,
          lbaUpiId:
            toDisplayValue(getFirstDefinedValue(rowSource, LBA_UPI_KEYS)) || mergedDefaults.lbaUpiId,
          lbaChequeName:
            toDisplayValue(getFirstDefinedValue(rowSource, LBA_CHEQUE_NAME_KEYS)) ||
            mergedDefaults.lbaChequeName,
          lbaIsDefault: toSelectBoolean(getFirstDefinedValue(rowSource, LBA_IS_DEFAULT_KEYS), "false"),
          lbaIsActive: toSelectBoolean(getFirstDefinedValue(rowSource, LBA_IS_ACTIVE_KEYS), "true"),
          masterDescription:
            toDisplayValue(getFirstDefinedValue(rowSource, LOOKUP_KEYS.description)) ||
            mergedDefaults.masterDescription,
        };
      }}
      buildRequestPayload={({ values, shouldUpdate, editingItemId }) => {
        const payload: Record<string, unknown> = {
          lbaCompanyId: toNullableString(values.lbaCompanyId ?? ""),
          lbaLedgerId: (values.lbaLedgerId ?? "").trim(),
          lbaAccountHolder: (values.masterName ?? "").trim(),
          lbaBankName: (values.lbaBankName ?? "").trim(),
          lbaBranchName: toNullableString(values.lbaBranchName ?? ""),
          lbaAccountNo: (values.lbaAccountNo ?? "").trim(),
          lbaIfscCode: toNullableString(toUpper(values.lbaIfscCode ?? "")),
          lbaMicrCode: toNullableString(values.lbaMicrCode ?? ""),
          lbaAccountType: toNullableString(toUpper(values.lbaAccountType ?? "")),
          lbaUpiId: toNullableString(values.lbaUpiId ?? ""),
          lbaChequeName: toNullableString(values.lbaChequeName ?? ""),
          lbaIsDefault: (values.lbaIsDefault ?? "false") === "true",
          lbaIsActive: (values.lbaIsActive ?? "true") === "true",
          lbaRemarks: toNullableString(values.masterDescription ?? ""),
        };
        if (shouldUpdate && editingItemId !== null) {
          payload.lbaId = toUpdateId(editingItemId);
        }
        return payload;
      }}
    />
  );
}
