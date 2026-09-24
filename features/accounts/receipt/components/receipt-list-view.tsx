"use client";

/**
 * Receipts — the screen the menu lands on.
 *
 * Built on the same `CrudMasterPage` shell every master page and voucher
 * register uses, so it inherits the header, the icon toolbar, the
 * configured-column table, the row highlight, the delete confirmation, the
 * pager, the audit history and the grid-settings context menu without
 * restating any of it.
 *
 * Which columns appear, in what order and how wide is grid 108's own config
 * (`MAIN LIST - RECEIPTS`), read through `/configured-grid-sql/columns` — it
 * already declares exactly nine visible ones and hides the keys behind them,
 * so a config change moves this list without touching code.
 *
 * ── Three things this register does that a master page does not ──────────
 *  1. **Its SQL binds six tokens and none of them is optional.** The runner
 *     substitutes bare `i`-prefixed names as TEXT, so a token left unbound
 *     stays in the statement as a literal word and the WHOLE query fails —
 *     `iavh_status` omitted answers *column "iavh_status" does not exist*, not
 *     an unfiltered list. `buildListQuery` always sends all six, with "" for
 *     the ones that mean "no bound".
 *  2. **A receipt is not deleted by its id.** `POST /receipts/delete` takes the
 *     whole four-field key in a body, so the shell's own `DELETE ?id=` cannot
 *     reach it and `onDeleteAction` owns the request.
 *  3. **Only a DRAFT may be deleted at all.** A posted receipt wrote legs into
 *     the day book and moved bills; it is CANCELLED, which writes a reversal
 *     voucher, and that is a different button on a different screen.
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
import { useDeleteReceiptDraftMutation } from "@/store/api/receiptApi";
import { receiptError } from "../api-errors";
import { formatTotal } from "../domain/money";
import type { ReceiptKeys } from "../receipt.types";
import { Chip } from "./chip";
import styles from "../page.module.scss";

/** The window the register opens on. A month of receipts is a day's work. */
const DEFAULT_WINDOW_DAYS = 30;

/** A castable uuid, so a pre-context request comes back empty instead of 400. */
const NO_TENANT_ID = "00000000-0000-0000-0000-000000000000";

const API_ENDPOINTS = {
  // The shell's own form never opens here — a receipt is a voucher, not a
  // modal — so `getById` and `create` exist only to satisfy the contract.
  getById: "/receipts/get",
  create: "/receipts/create",
  delete: "/receipts/delete",
} as const;

/**
 * A receipt has no code / short / alias column, so these name the closest
 * identifying aliases in grid 108. They drive the delete confirmation's label
 * and the fallback table used if the column config cannot be read.
 */
const LOOKUP_KEYS = {
  id: ["avh_voucher_id"],
  code: ["avh_voucher_refno"],
  name: ["party_name"],
  short: ["instruments"],
  alias: ["avh_usr_refno"],
  active: ["avh_voucher_status"],
  array: ["items", "data", "rows", "results", "list"],
} as const;

/** Only `id` is read — the shell's form, which owns the rest, never opens. */
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

/** The whole document key, not just the id: a receipt is keyed by four fields. */
function docKeyOf(row: MasterTableRow): ReceiptKeys {
  return {
    avhVoucherId: asText(sourceValue(row, "avh_voucher_id")),
    avhCompanyId: asText(sourceValue(row, "avh_company_id")),
    avhBranchId: asText(sourceValue(row, "avh_branch_id")),
    avhAccYear: asText(sourceValue(row, "avh_acc_year")),
  };
}

/** Per-column formatting, keyed by grid 108's own SQL field names. */
const COLUMN_RENDER_OVERRIDES = {
  // dd-MM-yyyy on screen, ISO on the wire — a register is read by eye.
  avh_voucher_date: (row: MasterTableRow) =>
    toDisplayDate(asText(sourceValue(row, "avh_voucher_date")).slice(0, 10)),
  avh_doc_amount: (row: MasterTableRow) =>
    formatTotal(toNumber(asText(sourceValue(row, "avh_doc_amount")))),
  avh_adjust_amount: (row: MasterTableRow) =>
    formatTotal(toNumber(asText(sourceValue(row, "avh_adjust_amount")))),
  on_account_amount: (row: MasterTableRow) =>
    formatTotal(toNumber(asText(sourceValue(row, "on_account_amount")))),
  // A draft has no number yet (R10): it took none, so that a receipt
  // abandoned on a desk leaves no gap in the series.
  avh_voucher_refno: (row: MasterTableRow) =>
    asText(sourceValue(row, "avh_voucher_refno")) || "— draft —",
  // Money promised by a cheque that has not matured. Zero renders blank: a
  // column of noughts hides the two rows that are actually carrying paper.
  pdc_count: (row: MasterTableRow) => {
    const count = toNumber(asText(sourceValue(row, "pdc_count")));
    return count > 0 ? String(count) : "";
  },
  avh_voucher_status: (row: MasterTableRow) => {
    const status = statusOf(row);
    return status ? <Chip value={status} /> : null;
  },
};

/** The Period presets, in days back from today. `custom` leaves the dates be. */
const PERIOD_OPTIONS = [
  { value: "7", label: "Last 7 days" },
  { value: "30", label: "Last 30 days" },
  { value: "90", label: "Last 90 days" },
  { value: "180", label: "Last 180 days" },
  { value: "365", label: "Last 365 days" },
  { value: "custom", label: "Custom" },
] as const;

export type ReceiptListViewProps = {
  onCreate: () => void;
  onOpen: (keys: ReceiptKeys) => void;
};

export function ReceiptListView({ onCreate, onOpen }: ReceiptListViewProps) {
  const { activeCompany, activeBranch, activeFiscalYear } = useBusinessContext();
  const companyId = activeCompany?.id ?? "";
  const branchId = activeBranch?.id ?? "";
  const accYear = (activeFiscalYear?.name ?? "").trim();

  const [deleteDraft] = useDeleteReceiptDraftMutation();
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
      // All six, always. `iavh_status` travels as "" for every status — it is
      // NOT modelled as an option that sends nothing, because an unbound token
      // fails the whole query rather than widening it.
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

  /** Moving the window replaces the list, so the shell resets to page 1. */
  const listStateResetKey = `${companyId}|${branchId}|${accYear}|${fromDate}|${toDate}`;

  const toolbarContent = useMemo(
    () => (
      <>
        <div className={masterStyles.filterGroup}>
          <label className={masterStyles.filterLabel} htmlFor="receipt-from">
            From
          </label>
          <input
            id="receipt-from"
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
          <label className={masterStyles.filterLabel} htmlFor="receipt-to">
            To
          </label>
          <input
            id="receipt-to"
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
          <label className={masterStyles.filterLabel} htmlFor="receipt-period">
            Period
          </label>
          <select
            id="receipt-period"
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

  /**
   * What the highlighted row means, and what may be done to it. Said here
   * rather than discovered by pressing a greyed button.
   */
  const hintMessage = useCallback((row: MasterTableRow | null) => {
    if (!row) {
      return "";
    }
    switch (statusOf(row)) {
      case "DRAFT":
        return "Draft — it has taken no number and moved no bill. Delete throws it away; nothing is reversed.";
      case "POSTED":
        return "Posted — the money is in the ledger. Cancel it to reverse, or correct it from inside. Enter opens it.";
      case "CANCELLED":
        return "Cancelled — a reversal voucher was written and nothing was deleted. It opens read-only.";
      default:
        return "";
    }
  }, []);

  /**
   * Delete, the receipt's way: `POST /receipts/delete` with the four keys in a
   * body. The shell's own `DELETE ?id=` cannot express that, which is what
   * `onDeleteAction` is for.
   */
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
        toast.error(receiptError(error));
        return false;
      }
    },
    [deleteDraft],
  );

  return (
    <CrudMasterPage
      title="Receipts"
      listTitleOverride="Receipts"
      listSubtitleOverride="Money received from customers."
      entityLabel="receipt"
      entityLabelPlural="receipts"
      searchPlaceholder="receipt no, party or amount"
      apiEndpoints={API_ENDPOINTS}
      gridKey="receiptList"
      lookupKeys={LOOKUP_KEYS}
      requestPayloadKeys={REQUEST_PAYLOAD_KEYS}
      styles={masterStyles}
      createLabel="New Receipt"
      codeColumnHeader="Receipt No"
      nameColumnHeader="Party"
      // Without this the shell falls back to response-driven columns, and a
      // configured grid with no `styles` array renders a serial column only.
      listResponseStyleArrayKey=""
      gridTableName="acc_voucher_header"
      useConfiguredGridColumnsOnly
      enableGridSettingsContextMenu
      columnRenderOverrides={COLUMN_RENDER_OVERRIDES}
      toolbarContent={toolbarContent}
      buildListQuery={buildListQuery}
      listStateResetKey={listStateResetKey}
      listEmptyText="No receipt in this window. Widen the dates, or take one."
      // The keys the desktop screen answers to, and the legend that says so.
      enableListActionKeys
      listHintMessage={hintMessage}
      rowClassName={(row) => (statusOf(row) === "CANCELLED" ? styles.cancelledRow : undefined)}
      onCreateAction={onCreate}
      // Edit opens the voucher — a receipt has bills, instruments and an
      // identity to balance, so it does not fit the shell's modal form. A
      // CANCELLED one is readable but not writable.
      isRowEditDisabled={(row) => statusOf(row) === "CANCELLED"}
      rowEditDisabledReason="This receipt is cancelled — it can be read, not changed"
      onEditAction={(row) => onOpen(docKeyOf(row))}
      // Ctrl+Enter and double-click READ it. Every status opens, cancelled
      // included: the screen decides what may be touched.
      onViewAction={(row) => onOpen(docKeyOf(row))}
      // Only a draft can be deleted. A posted receipt is CANCELLED instead,
      // from inside the voucher, which writes a reversal rather than removing
      // anything — so the button says so here instead of failing there.
      isRowDeleteDisabled={(row) => statusOf(row) !== "DRAFT"}
      rowDeleteDisabledReason="Only a draft can be deleted — a posted receipt is cancelled, which writes a reversal"
      onDeleteAction={handleDelete}
      auditHistory={{
        screenName: "Receipt",
        getRecordId: (row) => asText(sourceValue(row, "avh_voucher_id")) || null,
        getDisplayName: (row) =>
          asText(sourceValue(row, "avh_voucher_refno")) ||
          asText(sourceValue(row, "party_name")) ||
          null,
      }}
    />
  );
}
