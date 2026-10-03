"use client";

/**
 * Payments — the screen the menu lands on.
 *
 * The receipt's register on the same `CrudMasterPage` shell, over grid 123
 * "MAIN LIST - PAYMENTS" (grid 108's SQL with the voucher type swapped), so it
 * inherits the toolbar, the configured columns, the pager, the audit history
 * and the grid-settings menu without restating any of them.
 *
 * The same three rules as the receipt's register:
 *  1. All six of the grid's tokens are ALWAYS sent — an unbound one fails the
 *     whole query, `iavh_status` included ("" = every status).
 *  2. A payment is deleted by `POST /payments/delete` with its four keys in a
 *     body, which the shell's `DELETE ?id=` cannot express.
 *  3. Only a DRAFT may be deleted. A posted payment is CANCELLED from inside,
 *     which writes a reversal.
 */
import { useCallback, useMemo, useState } from "react";
import CrudMasterPage from "@/components/master/crud-master-page";
import type { MasterTableRow } from "@/components/master/crud-master-page.types";
import { useBusinessContext } from "@/components/layout/business-context";
import { toast } from "@/lib/notify";
import masterStyles from "@/app/master/state-master/page.module.scss";
import {
  addDays,
  toDisplayDate,
  todayIso,
  toNumber,
} from "@/features/sales/quotation/quotation.utils";
import { useDeletePaymentDraftMutation } from "@/store/api/paymentApi";
import { receiptError as paymentError } from "@/features/accounts/receipt/api-errors";
import { formatTotal } from "@/features/accounts/receipt/domain/money";
import { Chip } from "@/features/accounts/receipt/components/chip";
import styles from "@/features/accounts/receipt/page.module.scss";
import type { PaymentKeys } from "../payment.types";

const DEFAULT_WINDOW_DAYS = 30;

/** A castable uuid, so a pre-context request comes back empty instead of 400. */
const NO_TENANT_ID = "00000000-0000-0000-0000-000000000000";

const API_ENDPOINTS = {
  // The shell's own form never opens here — a payment is a voucher, not a
  // modal — so these exist only to satisfy the contract.
  getById: "/payments/get",
  create: "/payments/create",
  delete: "/payments/delete",
} as const;

const LOOKUP_KEYS = {
  id: ["avh_voucher_id"],
  code: ["avh_voucher_refno"],
  name: ["party_name"],
  short: ["instruments"],
  alias: ["avh_voucher_refno"],
  active: ["avh_voucher_status"],
  array: ["items", "data", "rows", "results", "list"],
} as const;

const REQUEST_PAYLOAD_KEYS = {
  id: "avhVoucherId",
  name: "party_name",
  alias: "",
  short: "",
  description: "",
  sort: "",
} as const;

function sourceValue(row: MasterTableRow, key: string): unknown {
  return (row.__source ?? {})[key];
}

function asText(value: unknown): string {
  return value === null || value === undefined ? "" : String(value);
}

function statusOf(row: MasterTableRow): string {
  return asText(sourceValue(row, "avh_voucher_status")).trim().toUpperCase();
}

/** The whole document key: a payment is keyed by four fields, never an id alone. */
function docKeyOf(row: MasterTableRow): PaymentKeys {
  return {
    avhVoucherId: asText(sourceValue(row, "avh_voucher_id")),
    avhCompanyId: asText(sourceValue(row, "avh_company_id")),
    avhBranchId: asText(sourceValue(row, "avh_branch_id")),
    avhAccYear: asText(sourceValue(row, "avh_acc_year")),
  };
}

const COLUMN_RENDER_OVERRIDES = {
  avh_voucher_date: (row: MasterTableRow) =>
    toDisplayDate(asText(sourceValue(row, "avh_voucher_date")).slice(0, 10)),
  avh_doc_amount: (row: MasterTableRow) =>
    formatTotal(toNumber(asText(sourceValue(row, "avh_doc_amount")))),
  avh_adjust_amount: (row: MasterTableRow) =>
    formatTotal(toNumber(asText(sourceValue(row, "avh_adjust_amount")))),
  on_account_amount: (row: MasterTableRow) =>
    formatTotal(toNumber(asText(sourceValue(row, "on_account_amount")))),
  // A draft took no number, so an abandoned one leaves no gap in the series.
  avh_voucher_refno: (row: MasterTableRow) =>
    asText(sourceValue(row, "avh_voucher_refno")) || "— draft —",
  pdc_count: (row: MasterTableRow) => {
    const count = toNumber(asText(sourceValue(row, "pdc_count")));
    return count > 0 ? String(count) : "";
  },
  avh_voucher_status: (row: MasterTableRow) => {
    const status = statusOf(row);
    return status ? <Chip value={status} /> : null;
  },
};

const PERIOD_OPTIONS = [
  { value: "7", label: "Last 7 days" },
  { value: "30", label: "Last 30 days" },
  { value: "90", label: "Last 90 days" },
  { value: "180", label: "Last 180 days" },
  { value: "365", label: "Last 365 days" },
  { value: "custom", label: "Custom" },
] as const;

export type PaymentListViewProps = {
  onCreate: () => void;
  onOpen: (keys: PaymentKeys) => void;
};

export function PaymentListView({ onCreate, onOpen }: PaymentListViewProps) {
  const { activeCompany, activeBranch, activeFiscalYear } = useBusinessContext();
  const companyId = activeCompany?.id ?? "";
  const branchId = activeBranch?.id ?? "";
  const accYear = (activeFiscalYear?.name ?? "").trim();

  const [deleteDraft] = useDeletePaymentDraftMutation();
  const [fromDate, setFromDate] = useState(() => addDays(todayIso(), -DEFAULT_WINDOW_DAYS));
  const [toDate, setToDate] = useState(() => todayIso());
  const [period, setPeriod] = useState<string>(String(DEFAULT_WINDOW_DAYS));

  const applyPeriod = useCallback((value: string) => {
    setPeriod(value);
    if (value === "custom") {
      return;
    }
    const days = Number.parseInt(value, 10);
    if (!Number.isFinite(days)) {
      return;
    }
    setToDate(todayIso());
    setFromDate(addDays(todayIso(), -days));
  }, []);

  const buildListQuery = useCallback(
    ({
      searchTerm,
      currentPage,
      pageSize,
      sortBy,
      sortDir,
    }: {
      searchTerm: string;
      currentPage: number;
      pageSize: number;
      sortBy?: string;
      sortDir?: "asc" | "desc";
    }): Record<string, string> => ({
      page: String(currentPage),
      limit: String(pageSize),
      ...(searchTerm ? { search: searchTerm } : {}),
      ...(sortBy ? { sort_by: sortBy } : {}),
      ...(sortBy && sortDir ? { sort_dir: sortDir } : {}),
      grid_param: JSON.stringify({
        iavh_company_id: companyId || NO_TENANT_ID,
        iavh_branch_id: branchId || NO_TENANT_ID,
        iavh_acc_year: accYear,
        iavh_status: "",
        ifrom_date: fromDate,
        ito_date: toDate,
      }),
    }),
    [accYear, branchId, companyId, fromDate, toDate],
  );

  const listStateResetKey = `${companyId}|${branchId}|${accYear}|${fromDate}|${toDate}`;

  const toolbarContent = useMemo(
    () => (
      <>
        <div className={masterStyles.filterGroup}>
          <label className={masterStyles.filterLabel} htmlFor="payment-from">
            From
          </label>
          <input
            id="payment-from"
            type="date"
            className={styles.input}
            value={fromDate}
            max={toDate || undefined}
            onChange={(event) => {
              setFromDate(event.target.value);
              setPeriod("custom");
            }}
          />
        </div>
        <div className={masterStyles.filterGroup}>
          <label className={masterStyles.filterLabel} htmlFor="payment-to">
            To
          </label>
          <input
            id="payment-to"
            type="date"
            className={styles.input}
            value={toDate}
            min={fromDate || undefined}
            onChange={(event) => {
              setToDate(event.target.value);
              setPeriod("custom");
            }}
          />
        </div>
        <div className={masterStyles.filterGroup}>
          <label className={masterStyles.filterLabel} htmlFor="payment-period">
            Period
          </label>
          <select
            id="payment-period"
            className={styles.select}
            value={period}
            onChange={(event) => applyPeriod(event.target.value)}
          >
            {PERIOD_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </>
    ),
    [applyPeriod, fromDate, period, toDate],
  );

  const hintMessage = useCallback((row: MasterTableRow | null) => {
    if (!row) {
      return "";
    }
    switch (statusOf(row)) {
      case "DRAFT":
        return "Draft — it has taken no number and touched no bill. Delete throws it away; nothing is reversed.";
      case "POSTED":
        return "Posted — the money is in the ledger. Cancel it to reverse, or correct it from inside. Enter opens it.";
      case "CANCELLED":
        return "Cancelled — its reversal is already posted. Key a new payment.";
      default:
        return "";
    }
  }, []);

  const handleDelete = useCallback(
    async (row: MasterTableRow): Promise<boolean> => {
      const keys = docKeyOf(row);
      if (!keys.avhVoucherId) {
        return false;
      }
      try {
        const payload = await deleteDraft(keys).unwrap();
        toast.success(
          `Draft deleted — ${payload.tendersDeleted} instrument(s) went with it. ` +
            "It took no number, so the series is unbroken.",
        );
        return true;
      } catch (error) {
        toast.error(paymentError(error));
        return false;
      }
    },
    [deleteDraft],
  );

  return (
    <CrudMasterPage
      title="Payments"
      listTitleOverride="Payments"
      listSubtitleOverride="Money paid to parties, bill by bill."
      entityLabel="payment"
      entityLabelPlural="payments"
      searchPlaceholder="payee name, payment no or amount"
      apiEndpoints={API_ENDPOINTS}
      gridKey="paymentList"
      lookupKeys={LOOKUP_KEYS}
      requestPayloadKeys={REQUEST_PAYLOAD_KEYS}
      styles={masterStyles}
      createLabel="New Payment"
      codeColumnHeader="Payment No"
      nameColumnHeader="Payee"
      listResponseStyleArrayKey=""
      gridTableName="acc_voucher_header"
      useConfiguredGridColumnsOnly
      enableGridSettingsContextMenu
      columnRenderOverrides={COLUMN_RENDER_OVERRIDES}
      toolbarContent={toolbarContent}
      buildListQuery={buildListQuery}
      listStateResetKey={listStateResetKey}
      listEmptyText="No payment in this window. Widen the dates, or make one."
      enableListActionKeys
      listHintMessage={hintMessage}
      rowClassName={(row) => (statusOf(row) === "CANCELLED" ? styles.cancelledRow : undefined)}
      onCreateAction={onCreate}
      isRowEditDisabled={(row) => statusOf(row) === "CANCELLED"}
      rowEditDisabledReason="This payment is cancelled — it can be read, not changed"
      onEditAction={(row) => onOpen(docKeyOf(row))}
      onViewAction={(row) => onOpen(docKeyOf(row))}
      isRowDeleteDisabled={(row) => statusOf(row) !== "DRAFT"}
      rowDeleteDisabledReason="Only a draft can be deleted — a posted payment is cancelled, which writes a reversal"
      onDeleteAction={handleDelete}
      auditHistory={{
        screenName: "Payment",
        getRecordId: (row) => asText(sourceValue(row, "avh_voucher_id")) || null,
        getDisplayName: (row) =>
          asText(sourceValue(row, "avh_voucher_refno")) ||
          asText(sourceValue(row, "party_name")) ||
          null,
      }}
    />
  );
}
