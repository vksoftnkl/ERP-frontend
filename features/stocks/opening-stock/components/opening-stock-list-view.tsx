"use client";

/**
 * The screen menu 44 lands on: the opening stock list, grid 99
 * ("MAIN LIST - OPENING STOCK") — `TxnMainView` with `TxnDocTypes::openingStock()`,
 * built on the same `CrudMasterPage` shell every register here uses.
 *
 * What the descriptor says, kept:
 *  - **The row's own tenant.** Grid 99 SELECTs svh_company_id / svh_branch_id /
 *    svh_acc_year, so a voucher opens, saves and cancels against the partition
 *    it belongs to, not the session's.
 *  - **Row policy.** Only a DRAFT opens for change. Enter on a POSTED or
 *    CANCELLED row opens it READ-ONLY rather than doing nothing, and the hint
 *    bar says so.
 *  - **Cancel, not Delete (F3).** There is no delete route. Cancel is live on a
 *    DRAFT and a POSTED voucher, asks for a reason, says what it will do, and
 *    keeps the voucher in the list as CANCELLED. It answers to the menu's delete
 *    permission, as the entry screen's own Cancel does.
 *  - **Every token, every time.** Grid 99's params are bare and svh-prefixed and
 *    the runner substitutes by name, so status and both dates travel as "" for
 *    "no filter" (see `listGridParams`).
 *  - No print — there is no print pipeline for stock vouchers yet.
 */
import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import CrudMasterPage from "@/components/master/crud-master-page";
import type { MasterTableRow } from "@/components/master/crud-master-page.types";
import { useBusinessContext } from "@/components/layout/business-context";
import masterStyles from "@/app/master/state-master/page.module.scss";
import { formatCurrency } from "@/domain/pricing";
import {
  accountingYearOf,
  toDisplayDate,
  todayIso,
  toNumber,
} from "@/features/sales/quotation/quotation.utils";
import { useCancelOpeningStockVoucherMutation } from "../opening-stock.api";
import {
  LIST_DEFAULT_DAYS_BACK,
  LIST_STATUS_OPTIONS,
  OPENING_STOCK_CANCEL_ENDPOINT,
  OPENING_STOCK_CREATE_ENDPOINT,
  OPENING_STOCK_GET_ENDPOINT,
  OPENING_STOCK_LIST_GRID_KEY,
} from "../opening-stock.constants";
import {
  canCancelRow,
  cancelConsequence,
  cancelledMessage,
  docKeyOfRow,
  listGridParams,
  PERIOD_PRESETS,
  periodLabel,
  presetRange,
  rowHint,
  rowPolicy,
  rowStatus,
  type PeriodPreset,
} from "../opening-stock.list";
import { describeError } from "../opening-stock.payload";
import type { OpeningStockDocKey } from "../opening-stock.types";
import { CancelReasonDialog } from "./cancel-reason-dialog";
import { say } from "./say";
import styles from "../page.module.scss";

const API_ENDPOINTS = {
  // The shell's own form never opens — a voucher is its own screen — and its
  // delete is replaced by Cancel (`onDeleteAction`), so these only satisfy the
  // contract.
  getById: OPENING_STOCK_GET_ENDPOINT,
  create: OPENING_STOCK_CREATE_ENDPOINT,
  delete: OPENING_STOCK_CANCEL_ENDPOINT,
} as const;

/** Grid 99's own column names. */
const LOOKUP_KEYS = {
  id: ["svh_id"],
  code: ["svh_refno"],
  name: ["godown_name"],
  short: ["svh_rate_source"],
  alias: ["svh_usr_refno"],
  active: ["svh_status"],
  array: ["items", "data", "rows", "results", "list"],
} as const;

/** Only `id` is read — the shell's form never opens. */
const REQUEST_PAYLOAD_KEYS = {
  id: "svhId",
  name: "godown_name",
  alias: "",
  short: "",
  description: "",
  sort: "",
} as const;

function sourceOf(row: MasterTableRow): Record<string, unknown> {
  return (row.__source ?? {}) as Record<string, unknown>;
}

function asText(value: unknown): string {
  return value === null || value === undefined ? "" : String(value);
}

const STATUS_PILL: Record<string, string> = {
  DRAFT: styles.statusPillDraft,
  POSTED: styles.statusPillPosted,
  CANCELLED: styles.statusPillCancelled,
};

/** Per-column formatting, keyed by grid 99's SQL field names. */
const COLUMN_RENDER_OVERRIDES = {
  svh_doc_date: (row: MasterTableRow) => toDisplayDate(asText(sourceOf(row).svh_doc_date).slice(0, 10)),
  svh_total_qty: (row: MasterTableRow) =>
    formatCurrency(toNumber(asText(sourceOf(row).svh_total_qty)), 3, true),
  svh_total_value: (row: MasterTableRow) =>
    formatCurrency(toNumber(asText(sourceOf(row).svh_total_value)), 2, true),
  svh_total_value_wot: (row: MasterTableRow) =>
    formatCurrency(toNumber(asText(sourceOf(row).svh_total_value_wot)), 2, true),
  // A draft has a number from the moment it is saved; one still blank reads as such.
  svh_refno: (row: MasterTableRow) => asText(sourceOf(row).svh_refno) || "—",
  // POSTED reads green here as on the document: the stock is in, the job is
  // done — the state nearly every row ends in, so it is not dimmed.
  svh_status: (row: MasterTableRow) => {
    const status = rowStatus(sourceOf(row));
    return status ? (
      <span className={`${styles.statusPill} ${STATUS_PILL[status] ?? styles.statusPillDraft}`}>{status}</span>
    ) : null;
  },
};

export type OpeningStockListViewProps = {
  onCreate: () => void;
  onOpen: (key: OpeningStockDocKey, mode: "entry" | "browse") => void;
};

type PendingCancel = {
  key: OpeningStockDocKey;
  resolve: (removed: boolean) => void;
};

export function OpeningStockListView({ onCreate, onOpen }: OpeningStockListViewProps) {
  const { activeCompany, activeBranch, activeFiscalYear } = useBusinessContext();
  const companyId = activeCompany?.compId ?? activeCompany?.id ?? "";
  const branchId = activeBranch?.id ?? "";
  const accYear = (activeFiscalYear?.name ?? "").trim() || accountingYearOf(todayIso());
  const session = useMemo(() => ({ companyId, branchId, accYear }), [accYear, branchId, companyId]);

  const [period, setPeriod] = useState<PeriodPreset>("lastNDays");
  const [fromDate, setFromDate] = useState(
    () => presetRange("lastNDays", todayIso(), LIST_DEFAULT_DAYS_BACK)?.from ?? "",
  );
  const [toDate, setToDate] = useState(() => todayIso());
  const [status, setStatus] = useState("");

  const [cancelVoucher] = useCancelOpeningStockVoucherMutation();
  const [pendingCancel, setPendingCancel] = useState<PendingCancel | null>(null);
  const [cancelBusy, setCancelBusy] = useState(false);
  const pendingRef = useRef<PendingCancel | null>(null);
  useLayoutEffect(() => {
    pendingRef.current = pendingCancel;
  }, [pendingCancel]);

  const applyPeriod = useCallback((value: PeriodPreset) => {
    setPeriod(value);
    const range = presetRange(value, todayIso(), LIST_DEFAULT_DAYS_BACK);
    if (range) {
      setFromDate(range.from);
      setToDate(range.to);
    }
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
      grid_param: JSON.stringify(
        listGridParams({ companyId, branchId, accYear, fromDate, toDate, status }),
      ),
    }),
    [accYear, branchId, companyId, fromDate, status, toDate],
  );

  /** A changed filter is a different list: back to page 1. */
  const listStateResetKey = `${companyId}|${branchId}|${accYear}|${fromDate}|${toDate}|${status}`;

  const toolbarContent = useMemo(
    () => (
      <>
        <div className={masterStyles.filterGroup}>
          <label className={masterStyles.filterLabel} htmlFor="opening-stock-from">
            From :
          </label>
          <input
            id="opening-stock-from"
            type="date"
            className={styles.filterInput}
            value={fromDate}
            max={toDate || undefined}
            onChange={(event) => {
              setFromDate(event.target.value);
              setPeriod("custom");
            }}
          />
        </div>
        <div className={masterStyles.filterGroup}>
          <label className={masterStyles.filterLabel} htmlFor="opening-stock-to">
            To :
          </label>
          <input
            id="opening-stock-to"
            type="date"
            className={styles.filterInput}
            value={toDate}
            min={fromDate || undefined}
            onChange={(event) => {
              setToDate(event.target.value);
              setPeriod("custom");
            }}
          />
        </div>
        <div className={masterStyles.filterGroup}>
          <label className={masterStyles.filterLabel} htmlFor="opening-stock-period">
            Period :
          </label>
          <select
            id="opening-stock-period"
            className={styles.filterInput}
            value={period}
            onChange={(event) => applyPeriod(event.target.value as PeriodPreset)}
          >
            {PERIOD_PRESETS.map((preset) => (
              <option key={preset} value={preset}>
                {periodLabel(preset, LIST_DEFAULT_DAYS_BACK)}
              </option>
            ))}
          </select>
        </div>
        <div className={masterStyles.filterGroup}>
          <label className={masterStyles.filterLabel} htmlFor="opening-stock-status">
            Status :
          </label>
          <select
            id="opening-stock-status"
            className={styles.filterInput}
            value={status}
            onChange={(event) => setStatus(event.target.value)}
          >
            {LIST_STATUS_OPTIONS.map((option) => (
              <option key={option.label} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </>
    ),
    [applyPeriod, fromDate, period, status, toDate],
  );

  const keyOf = useCallback((row: MasterTableRow) => docKeyOfRow(sourceOf(row), session), [session]);

  /**
   * Cancel, the opening's way. The shell has already asked "are you sure" with
   * what the cancel will do; this asks WHY — a reason is required, and the
   * presets keep the recurring ones spelled alike — and then writes it.
   */
  const handleCancel = useCallback(
    (row: MasterTableRow): Promise<boolean> => {
      if (pendingRef.current) {
        return Promise.resolve(false);
      }
      const key = keyOf(row);
      if (!key.svhId) {
        return Promise.resolve(false);
      }
      return new Promise<boolean>((resolve) => {
        const pending = { key, resolve };
        pendingRef.current = pending;
        setPendingCancel(pending);
      });
    },
    [keyOf],
  );

  const dismissReason = useCallback(() => {
    const pending = pendingRef.current;
    if (!pending || cancelBusy) {
      return;
    }
    setPendingCancel(null);
    pending.resolve(false);
  }, [cancelBusy]);

  const acceptReason = useCallback(
    async (reason: string) => {
      const pending = pendingRef.current;
      if (!pending) {
        return;
      }
      const { key } = pending;
      const label = key.refno || key.svhId;
      const wasPosted = key.status === "POSTED";
      setCancelBusy(true);
      try {
        await cancelVoucher({
          svhId: key.svhId,
          accYear: key.accYear,
          companyId: key.companyId,
          branchId: key.branchId,
          reason,
        }).unwrap();
        say("success", "Cancelled", cancelledMessage(label, wasPosted));
        pending.resolve(true);
      } catch (error) {
        // A posted opening whose stock has since been sold is refused (409) —
        // reported as-is: the fix is an adjustment, not a retry.
        say("error", "", describeError(error, "The opening could not be cancelled."));
        pending.resolve(false);
      } finally {
        setCancelBusy(false);
        setPendingCancel(null);
      }
    },
    [cancelVoucher],
  );

  const pendingLabel = pendingCancel ? pendingCancel.key.refno || pendingCancel.key.svhId : "";

  return (
    <>
      <CrudMasterPage
        title="Opening Stock"
        listTitleOverride="Opening Stock"
        listSubtitleOverride="What each branch held on the day it went live. One document per load; a holding may be opened once a year."
        entityLabel="opening stock voucher"
        entityLabelPlural="opening stock vouchers"
        searchPlaceholder="voucher no, godown, your ref or remarks"
        apiEndpoints={API_ENDPOINTS}
        gridKey={OPENING_STOCK_LIST_GRID_KEY}
        lookupKeys={LOOKUP_KEYS}
        requestPayloadKeys={REQUEST_PAYLOAD_KEYS}
        styles={masterStyles}
        createLabel="Add"
        codeColumnHeader="Voucher No"
        nameColumnHeader="Godown"
        // Without this the shell falls back to response-driven columns, and a
        // configured grid with no `styles` array renders a serial column only.
        listResponseStyleArrayKey=""
        gridTableName="stock_voucher"
        useConfiguredGridColumnsOnly
        enableGridSettingsContextMenu
        columnRenderOverrides={COLUMN_RENDER_OVERRIDES}
        toolbarContent={toolbarContent}
        buildListQuery={buildListQuery}
        listStateResetKey={listStateResetKey}
        listEmptyText="No opening stock voucher in this window. Widen the dates, or add one."
        // F1 add · Enter / F2 open · Ctrl+Enter view · F3 cancel · F5 refresh.
        enableListActionKeys
        listHintMessage={(row) => rowHint(row ? sourceOf(row) : null)}
        rowClassName={(row) => (rowStatus(sourceOf(row)) === "CANCELLED" ? styles.cancelledRow : undefined)}
        onCreateAction={onCreate}
        // A row the policy will not let you EDIT is not a dead end: Enter / F2
        // opens it read-only, the same door Ctrl+Enter uses.
        onEditAction={(row) => onOpen(keyOf(row), rowPolicy(sourceOf(row)).canEdit ? "entry" : "browse")}
        onViewAction={(row) => onOpen(keyOf(row), "browse")}
        // The delete slot is Cancel's: there is no delete route, and nothing
        // here is ever deleted — a cancelled voucher stays in the list.
        deleteActionLabel="Cancel Voucher"
        isRowDeleteDisabled={(row) => !canCancelRow(sourceOf(row))}
        rowDeleteDisabledReason="Cancelled — its reversal is part of the history."
        deleteConfirmMessage={(row) =>
          cancelConsequence(rowStatus(sourceOf(row)) === "POSTED").split("\n\n")[0] ?? ""
        }
        deleteConfirmNote={(row) =>
          cancelConsequence(rowStatus(sourceOf(row)) === "POSTED").split("\n\n")[1] ?? ""
        }
        onDeleteAction={handleCancel}
        auditHistory={{
          // What the server stamps on stock voucher audit rows for this screen.
          screenName: "Opening Stock",
          getRecordId: (row) => asText(sourceOf(row).svh_id) || null,
          getDisplayName: (row) => asText(sourceOf(row).svh_refno) || null,
        }}
      />
      <CancelReasonDialog
        isOpen={pendingCancel !== null}
        title={`Cancel ${pendingLabel}`}
        question="Why is this opening being reversed?"
        busy={cancelBusy}
        onCancel={dismissReason}
        onAccept={(reason) => void acceptReason(reason)}
      />
    </>
  );
}
