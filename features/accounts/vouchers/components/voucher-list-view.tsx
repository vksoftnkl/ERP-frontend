"use client";

/**
 * The Voucher Register for one type — the screen a voucher menu (Contra, 104)
 * lands on, as the Qt `TxnMainView` does.
 *
 * Grid 117, "TXN MAIN LIST - VOUCHER REGISTER", on the `CrudMasterPage` shell
 * the receipt and payment registers use. Its SQL binds seven tokens and every
 * one is sent, "" for no bound:
 *
 *   icompany_id · ibranch_id · iacc_year · iuser_id · itype_code ·
 *   ifrom_date · ito_date
 *
 * `iuser_id` is load-bearing — the SQL joins the user's own menu rights on it
 * — and the server does not inject it, so the client sends the signed-in user.
 * A Rev reversal never lists (the grid keeps `vchr_in_register` only); a
 * cancelled original stays, with its reversal's number beside it.
 *
 * A voucher is deleted only as a DRAFT — `POST /vouchers/delete` with the four
 * BARE keys — and a posted one is cancelled from inside it, which writes the
 * reversal.
 */
import { useCallback, useMemo, useState } from "react";
import CrudMasterPage from "@/components/master/crud-master-page";
import type { MasterTableRow } from "@/components/master/crud-master-page.types";
import { useBusinessContext } from "@/components/layout/business-context";
import { getAuthUserId } from "@/lib/auth/session";
import { toast } from "@/lib/notify";
import masterStyles from "@/app/master/state-master/page.module.scss";
import { addDays, toDisplayDate, todayIso, toNumber } from "@/features/sales/quotation/quotation.utils";
import { useDeleteVoucherDraftMutation } from "@/store/api/vouchersApi";
import { chequeError as voucherError } from "@/features/accounts/cheques/api-errors";
import { formatTotal } from "@/features/accounts/receipt/domain/money";
import { Chip } from "@/features/accounts/receipt/components/chip";
import styles from "@/features/accounts/receipt/page.module.scss";
import type { VoucherKeys } from "../vouchers.types";

const DEFAULT_WINDOW_DAYS = 29;
const NO_TENANT_ID = "00000000-0000-0000-0000-000000000000";

const API_ENDPOINTS = {
  // The shell's own form never opens: a voucher is not a modal record.
  getById: "/vouchers/get",
  create: "/vouchers/create",
  delete: "/vouchers/delete",
} as const;

const LOOKUP_KEYS = {
  id: ["avh_voucher_id"],
  code: ["avh_voucher_refno"],
  name: ["avh_remarks"],
  short: ["type_name"],
  alias: ["avh_doc_refno"],
  active: ["avh_voucher_status"],
  array: ["items", "data", "rows", "results", "list"],
} as const;

const REQUEST_PAYLOAD_KEYS = {
  id: "voucherId",
  name: "avh_remarks",
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

/** The four BARE keys — never the session's. */
function keysOf(row: MasterTableRow): VoucherKeys {
  return {
    companyId: asText(sourceValue(row, "avh_company_id")),
    branchId: asText(sourceValue(row, "avh_branch_id")),
    accYear: asText(sourceValue(row, "avh_acc_year")),
    voucherId: asText(sourceValue(row, "avh_voucher_id")),
  };
}

const COLUMN_RENDER_OVERRIDES = {
  avh_voucher_date: (row: MasterTableRow) =>
    toDisplayDate(asText(sourceValue(row, "avh_voucher_date")).slice(0, 10)),
  avh_total_debit: (row: MasterTableRow) =>
    formatTotal(toNumber(asText(sourceValue(row, "avh_total_debit")))),
  avh_total_credit: (row: MasterTableRow) =>
    formatTotal(toNumber(asText(sourceValue(row, "avh_total_credit")))),
  // A draft is numbered at Post: an abandoned one leaves no gap.
  avh_voucher_refno: (row: MasterTableRow) => asText(sourceValue(row, "avh_voucher_refno")) || "— draft —",
  avh_voucher_status: (row: MasterTableRow) => {
    const status = statusOf(row);
    return status ? <Chip value={status} /> : null;
  },
};

const PERIOD_OPTIONS = [
  { value: "0", label: "Today" },
  { value: "6", label: "Last 7 days" },
  { value: "29", label: "Last 30 days" },
  { value: "89", label: "Last 90 days" },
  { value: "364", label: "Last 365 days" },
  { value: "custom", label: "Custom" },
] as const;

export type VoucherListViewProps = {
  /** "Con" for Contra; "" for the Voucher Register — every type the user may view. */
  typeCode: string;
  /** The type's name, plural and singular — "Contra". */
  title: string;
  subtitle: string;
  onCreate: () => void;
  /** With the row's own type — the register opens it on that type. */
  onOpen: (keys: VoucherKeys, typeCode: string) => void;
};

export function VoucherListView({ typeCode, title, subtitle, onCreate, onOpen }: VoucherListViewProps) {
  const { activeCompany, activeBranch, activeFiscalYear } = useBusinessContext();
  const companyId = activeCompany?.id ?? "";
  const branchId = activeBranch?.id ?? "";
  const accYear = (activeFiscalYear?.name ?? "").trim();

  const [deleteDraft] = useDeleteVoucherDraftMutation();
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
      // All seven, always — an unbound token fails the whole query.
      grid_param: JSON.stringify({
        icompany_id: companyId || NO_TENANT_ID,
        ibranch_id: branchId || NO_TENANT_ID,
        iacc_year: accYear,
        iuser_id: getAuthUserId() || NO_TENANT_ID,
        itype_code: typeCode,
        ifrom_date: fromDate,
        ito_date: toDate,
      }),
    }),
    [accYear, branchId, companyId, fromDate, toDate, typeCode],
  );

  const listStateResetKey = `${companyId}|${branchId}|${accYear}|${typeCode}|${fromDate}|${toDate}`;

  const toolbarContent = useMemo(
    () => (
      <>
        <div className={masterStyles.filterGroup}>
          <label className={masterStyles.filterLabel} htmlFor="voucher-from">
            From
          </label>
          <input
            id="voucher-from"
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
          <label className={masterStyles.filterLabel} htmlFor="voucher-to">
            To
          </label>
          <input
            id="voucher-to"
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
          <label className={masterStyles.filterLabel} htmlFor="voucher-period">
            Period
          </label>
          <select
            id="voucher-period"
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
        return "Draft — no number, no legs. Enter opens it; Delete throws it away and nothing is reversed.";
      case "POSTED":
        return "Posted — cancel it from inside to reverse, or key a Journal. Enter opens it read-only.";
      case "CANCELLED":
        return "Cancelled — its reversal is already posted. Enter opens it read-only.";
      default:
        return "";
    }
  }, []);

  const handleDelete = useCallback(
    async (row: MasterTableRow): Promise<boolean> => {
      const keys = keysOf(row);
      if (!keys.voucherId) {
        return false;
      }
      try {
        await deleteDraft(keys).unwrap();
        toast.success("Draft deleted — it had no number, so the series is unbroken.");
        return true;
      } catch (error) {
        toast.error(voucherError(error));
        return false;
      }
    },
    [deleteDraft],
  );

  return (
    <CrudMasterPage
      title={title}
      listTitleOverride={title}
      listSubtitleOverride={subtitle}
      entityLabel="voucher"
      entityLabelPlural="vouchers"
      searchPlaceholder={typeCode ? "voucher no, narration or their ref" : "type, voucher no, party or their ref"}
      apiEndpoints={API_ENDPOINTS}
      gridKey="voucherRegisterList"
      lookupKeys={LOOKUP_KEYS}
      requestPayloadKeys={REQUEST_PAYLOAD_KEYS}
      styles={masterStyles}
      createLabel={typeCode ? `New ${title}` : "New voucher"}
      codeColumnHeader="Voucher No"
      nameColumnHeader="Narration"
      listResponseStyleArrayKey=""
      gridTableName="acc_voucher_header"
      useConfiguredGridColumnsOnly
      enableGridSettingsContextMenu
      columnRenderOverrides={COLUMN_RENDER_OVERRIDES}
      toolbarContent={toolbarContent}
      buildListQuery={buildListQuery}
      listStateResetKey={listStateResetKey}
      listEmptyText={
        typeCode
          ? `No ${title.toLowerCase()} voucher in this window. Widen the dates, or key one.`
          : "No voucher in this window. Widen the dates, or key one."
      }
      enableListActionKeys
      listHintMessage={hintMessage}
      rowClassName={(row) => (statusOf(row) === "CANCELLED" ? styles.cancelledRow : undefined)}
      onCreateAction={onCreate}
      onEditAction={(row) => onOpen(keysOf(row), asText(sourceValue(row, "vchr_type_code")).trim())}
      onViewAction={(row) => onOpen(keysOf(row), asText(sourceValue(row, "vchr_type_code")).trim())}
      isRowDeleteDisabled={(row) => statusOf(row) !== "DRAFT"}
      rowDeleteDisabledReason="Only a draft can be deleted — a posted voucher is cancelled from inside it, which writes a reversal"
      onDeleteAction={handleDelete}
      auditHistory={{
        screenName: title,
        getRecordId: (row) => asText(sourceValue(row, "avh_voucher_id")) || null,
        getDisplayName: (row) => asText(sourceValue(row, "avh_voucher_refno")) || null,
      }}
    />
  );
}
