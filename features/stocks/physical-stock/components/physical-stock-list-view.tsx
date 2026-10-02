"use client";

/**
 * Physical Stock Counts — the list menu 45 opens (grid 101, "MAIN LIST -
 * PHYSICAL STOCK"), and the same list the count screen's F8 raises as a
 * picker. `TxnDocTypes::physicalStock()` on the shared `CrudMasterPage` shell:
 *
 *  - grid 101's tokens are bare and svh-prefixed (`isvh_company_id`, …) and
 *    none is optional — an unbound token stays in the SQL as a word and the
 *    query fails — so all six always travel, "" meaning "no bound";
 *  - a POSTED or CANCELLED sheet does not open for change: Enter falls
 *    through to the read-only open, and the hint bar says why;
 *  - there is NO delete — a count is cancelled, which reverses it and keeps
 *    it. Cancel (F3) is live on a DRAFT and on a POSTED row, asks why, and
 *    says what it is about to do.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import CrudMasterPage from "@/components/master/crud-master-page";
import type { MasterTableRow } from "@/components/master/crud-master-page.types";
import { ErpActionIcon } from "@/components/design-system/icons/erp-action-icons";
import { useBusinessContext } from "@/components/layout/business-context";
import { usePagePermissions } from "@/hooks/useMenuPermissions";
import masterStyles from "@/app/master/state-master/page.module.scss";
import { accountingYearOf, todayIso } from "@/features/sales/quotation/quotation.utils";
import { usePhysicalStockCancelMutation } from "../physical-stock.api";
import {
  CANCEL_REASON_PRESETS,
  LIST_DEFAULT_DAYS_BACK,
  NO_TENANT_ID,
  PHYSICAL_STOCK_AUDIT_SCREEN,
  PHYSICAL_STOCK_LIST_GRID_KEY,
  STATUS_CANCELLED,
  STATUS_POSTED,
} from "../physical-stock.constants";
import { displayDate, formatCurrencyCell, formatNumberCell, toNumberOrNull } from "../physical-stock.format";
import {
  PERIOD_PRESETS,
  STATUS_FILTER_OPTIONS,
  canCancelRow,
  docKeyOfRow,
  presetLabel,
  presetRange,
  rowHint,
  rowIsFrozen,
  rowStatus,
  type PeriodPreset,
} from "../physical-stock.list";
import { apiErrorText } from "../physical-stock.payload";
import type { PhysicalStockDocKey, WireNumber } from "../physical-stock.types";
import { AskTextModal } from "./ask-text-modal";
import { anyDialogOpen, askYesNo, say } from "./notice";
import styles from "../page.module.scss";

const API_ENDPOINTS = {
  // The shell's own form never opens — a count is a screen, not a modal — so
  // these exist only to satisfy its contract.
  getById: "/stock/physical/get",
  create: "/stock/physical/create",
  delete: "/stock/physical/cancel",
} as const;

const LOOKUP_KEYS = {
  id: ["svh_id"],
  code: ["svh_refno"],
  name: ["godown_name"],
  short: ["reason_name"],
  alias: ["svh_acc_year"],
  active: ["svh_status"],
  array: ["items", "data", "rows", "results", "list"],
} as const;

const REQUEST_PAYLOAD_KEYS = {
  id: "svhId",
  name: "godown_name",
  alias: "",
  short: "",
  description: "",
  sort: "",
} as const;

function sourceOf(row: MasterTableRow | null): Record<string, unknown> | null {
  return row?.__source ?? null;
}

function textOf(value: unknown): string {
  return value === null || value === undefined ? "" : String(value);
}

const PILL_CLASS: Record<string, string> = {
  POSTED: styles.pillPosted,
  CANCELLED: styles.pillCancelled,
};

/** Per-column formatting, keyed by grid 101's own SQL field names. */
const COLUMN_RENDER_OVERRIDES = {
  svh_doc_date: (row: MasterTableRow) =>
    displayDate(textOf(sourceOf(row)?.svh_doc_date).slice(0, 10)),
  // The NET variance — a shortage is negative, and zero reads blank.
  net_variance_qty: (row: MasterTableRow) =>
    formatNumberCell(toNumberOrNull(sourceOf(row)?.net_variance_qty as WireNumber)),
  net_variance_value: (row: MasterTableRow) =>
    formatCurrencyCell(toNumberOrNull(sourceOf(row)?.net_variance_value as WireNumber)),
  svh_freeze_stock: (row: MasterTableRow) => (rowIsFrozen(sourceOf(row)) ? "Yes" : ""),
  svh_status: (row: MasterTableRow) => {
    const status = rowStatus(sourceOf(row));
    return status ? (
      <span className={`${styles.statusPill} ${PILL_CLASS[status] ?? styles.pillDraft}`}>
        {status}
      </span>
    ) : null;
  },
};

/**
 * Reports the shell's highlighted row upward. The shell owns the selection and
 * hands it only to `listHintMessage`; rendering this from there keeps Cancel's
 * button and key in step with it without a second copy to maintain.
 */
function SelectionReporter({
  row,
  onRow,
}: {
  row: MasterTableRow | null;
  onRow: (row: MasterTableRow | null) => void;
}) {
  useEffect(() => {
    onRow(row);
  }, [onRow, row]);
  return null;
}

export type PhysicalStockListViewProps = {
  /** Raised from the count screen (F8): a pick loads into that screen. */
  pickMode: boolean;
  onCreate: () => void;
  onOpen: (key: PhysicalStockDocKey, openForEdit: boolean) => void;
  onBackToEntry?: () => void;
};

export function PhysicalStockListView({
  pickMode,
  onCreate,
  onOpen,
  onBackToEntry,
}: PhysicalStockListViewProps) {
  const { activeCompany, activeBranch, activeFiscalYear } = useBusinessContext();
  const companyId = activeCompany?.id ?? activeCompany?.compId ?? "";
  const branchId = activeBranch?.id ?? "";
  const accYear = (activeFiscalYear?.name ?? "").trim() || accountingYearOf(todayIso());
  const { permissions } = usePagePermissions();
  const [cancelDocument, { isLoading: cancelling }] = usePhysicalStockCancelMutation();

  const initialRange = useMemo(
    () => presetRange("lastNDays", LIST_DEFAULT_DAYS_BACK, todayIso()),
    [],
  );
  const [fromDate, setFromDate] = useState(initialRange?.from ?? "");
  const [toDate, setToDate] = useState(initialRange?.to ?? "");
  const [period, setPeriod] = useState<PeriodPreset>("lastNDays");
  const [status, setStatus] = useState("");
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [selected, setSelected] = useState<MasterTableRow | null>(null);
  const [cancelTarget, setCancelTarget] = useState<{
    key: PhysicalStockDocKey;
    label: string;
  } | null>(null);

  const applyPeriod = useCallback((value: PeriodPreset) => {
    setPeriod(value);
    const range = presetRange(value, LIST_DEFAULT_DAYS_BACK, todayIso());
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
    }): Record<string, string> => {
      // A refresh after a cancel is a new query, not a new filter.
      void refreshNonce;
      return {
        page: String(currentPage),
        limit: String(pageSize),
        ...(searchTerm ? { search: searchTerm } : {}),
        ...(sortBy ? { sort_by: sortBy } : {}),
        ...(sortBy && sortDir ? { sort_dir: sortDir } : {}),
        // The company / branch / year trio is not a convenience filter:
        // stock_voucher is PARTITIONED BY the year, and a query without it
        // reads every partition.
        grid_param: JSON.stringify({
          isvh_company_id: companyId || NO_TENANT_ID,
          isvh_branch_id: branchId || NO_TENANT_ID,
          isvh_acc_year: accYear,
          isvh_status: status,
          isvh_from_date: fromDate,
          isvh_to_date: toDate,
        }),
      };
    },
    [accYear, branchId, companyId, fromDate, refreshNonce, status, toDate],
  );

  const listStateResetKey = `${companyId}|${branchId}|${accYear}|${fromDate}|${toDate}|${status}`;

  // -------------------------------------------------------------------------
  // Cancel — the same thing the count screen's Cancel Sheet does, offered
  // here because a posted sheet opens read-only.
  // -------------------------------------------------------------------------

  const startCancel = useCallback((row: MasterTableRow | null) => {
    const source = sourceOf(row);
    if (!source || !canCancelRow(source)) {
      return;
    }
    const key = docKeyOfRow(source);
    if (!key.svhId) {
      return;
    }
    setCancelTarget({ key, label: textOf(source.svh_refno) || key.svhId });
  }, []);

  const confirmCancel = useCallback(
    (reason: string) => {
      const target = cancelTarget;
      setCancelTarget(null);
      if (!target) {
        return;
      }
      void (async () => {
        const confirmed = await askYesNo(
          `Cancel ${target.label}?`,
          "This writes one reversing ledger row for every variance row the count posted. " +
            "Nothing is deleted — the sheet stays in the list as CANCELLED.\n\nIt will be " +
            "refused if the stock has since been sold.",
          { destructive: true },
        );
        if (!confirmed) {
          return;
        }
        try {
          await cancelDocument({ ...target.key, reason }).unwrap();
          setRefreshNonce((value) => value + 1);
          say.info(
            "Cancelled",
            `${target.label} cancelled. Its reversing rows carry the original count date, so ` +
              "the stock reads as it did before.",
          );
        } catch (error) {
          say.error(apiErrorText(error));
        }
      })();
    },
    [cancelDocument, cancelTarget],
  );

  const cancelAllowed =
    !pickMode && permissions.canDelete && canCancelRow(sourceOf(selected)) && !cancelling;

  // F3 — the slot Delete would have taken. Not in Pick mode: a picker that
  // could cancel a count is easy to misfire.
  useEffect(() => {
    if (pickMode) {
      return undefined;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "F3" || event.ctrlKey || event.altKey || event.metaKey || event.shiftKey) {
        return;
      }
      if (cancelTarget || anyDialogOpen()) {
        return;
      }
      event.preventDefault();
      if (cancelAllowed) {
        startCancel(selected);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [cancelAllowed, cancelTarget, pickMode, selected, startCancel]);

  // Esc backs out of the picker, as the Qt one does.
  useEffect(() => {
    if (!pickMode || !onBackToEntry) {
      return undefined;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || anyDialogOpen()) {
        return;
      }
      const target = event.target as HTMLElement | null;
      if (target && ["INPUT", "SELECT", "TEXTAREA"].includes(target.tagName)) {
        return;
      }
      event.preventDefault();
      onBackToEntry();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onBackToEntry, pickMode]);

  const hintMessage = useCallback(
    (row: MasterTableRow | null) => (
      <>
        {pickMode
          ? "Enter select · Ctrl+Enter view · Esc back to the sheet"
          : `F3 cancel. ${rowHint(sourceOf(row))}`.trim()}
        <SelectionReporter row={row} onRow={setSelected} />
      </>
    ),
    [pickMode],
  );

  const toolbarContent = useMemo(
    () => (
      <>
        <div className={masterStyles.filterGroup}>
          <label className={masterStyles.filterLabel} htmlFor="physical-stock-from">
            From
          </label>
          <input
            id="physical-stock-from"
            type="date"
            className={styles.filterDateInput}
            value={fromDate}
            max={toDate || undefined}
            onChange={(event) => {
              setFromDate(event.target.value);
              setPeriod("custom");
            }}
          />
        </div>
        <div className={masterStyles.filterGroup}>
          <label className={masterStyles.filterLabel} htmlFor="physical-stock-to">
            To
          </label>
          <input
            id="physical-stock-to"
            type="date"
            className={styles.filterDateInput}
            value={toDate}
            min={fromDate || undefined}
            onChange={(event) => {
              setToDate(event.target.value);
              setPeriod("custom");
            }}
          />
        </div>
        <div className={masterStyles.filterGroup}>
          <label className={masterStyles.filterLabel} htmlFor="physical-stock-period">
            Period
          </label>
          <select
            id="physical-stock-period"
            className={styles.filterSelect}
            value={period}
            onChange={(event) => applyPeriod(event.target.value as PeriodPreset)}
          >
            {PERIOD_PRESETS.map((preset) => (
              <option key={preset} value={preset}>
                {presetLabel(preset, LIST_DEFAULT_DAYS_BACK)}
              </option>
            ))}
          </select>
        </div>
        <div className={masterStyles.filterGroup}>
          <label className={masterStyles.filterLabel} htmlFor="physical-stock-status">
            Status
          </label>
          <select
            id="physical-stock-status"
            className={styles.filterSelect}
            value={status}
            onChange={(event) => setStatus(event.target.value)}
          >
            {STATUS_FILTER_OPTIONS.map((option) => (
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

  const toolbarActions = (
    <>
      <span className="erp-ms-tsep" aria-hidden="true" />
      {pickMode ? (
        <button
          type="button"
          className={`${masterStyles.iconBtn} ${masterStyles.iconBtnRefresh} erp-ms-tbtn`}
          onClick={onBackToEntry}
          title="Back to the count sheet (Esc)"
        >
          <span className={`${masterStyles.iconBtnBox} erp-ms-tbtn-icon`} aria-hidden="true">
            ‹
          </span>
          <span>Back to sheet</span>
        </button>
      ) : (
        <button
          type="button"
          className={`${masterStyles.iconBtn} ${masterStyles.iconBtnDelete} erp-ms-tbtn`}
          disabled={!cancelAllowed}
          onClick={() => startCancel(selected)}
          title={
            !permissions.canDelete
              ? "You do not have permission to cancel"
              : rowStatus(sourceOf(selected)) === STATUS_CANCELLED
                ? "Already cancelled"
                : "Reverse this posted count (F3)"
          }
        >
          <span className={`${masterStyles.iconBtnBox} erp-ms-tbtn-icon`}>
            <ErpActionIcon name="delete" />
          </span>
          <span>Cancel</span>
        </button>
      )}
    </>
  );

  return (
    <>
      <CrudMasterPage
        title="Physical Stock"
        listTitleOverride={pickMode ? "Select count sheet" : "Physical Stock Counts"}
        listSubtitleOverride="What was actually on the shelf, against what the system thought. Only the lines that disagree move stock."
        entityLabel="count sheet"
        entityLabelPlural="count sheets"
        searchPlaceholder="sheet no, godown, reason, your ref or remarks"
        apiEndpoints={API_ENDPOINTS}
        gridKey={PHYSICAL_STOCK_LIST_GRID_KEY}
        lookupKeys={LOOKUP_KEYS}
        requestPayloadKeys={REQUEST_PAYLOAD_KEYS}
        styles={masterStyles}
        createLabel="New count sheet"
        codeColumnHeader="Sheet No"
        nameColumnHeader="Godown"
        // Without this the shell falls back to response-driven columns, and a
        // configured grid with no `styles` array renders a serial column only.
        listResponseStyleArrayKey=""
        gridTableName="stock_voucher"
        useConfiguredGridColumnsOnly
        enableGridSettingsContextMenu
        columnRenderOverrides={COLUMN_RENDER_OVERRIDES}
        toolbarContent={toolbarContent}
        toolbarActions={toolbarActions}
        buildListQuery={buildListQuery}
        listStateResetKey={listStateResetKey}
        listEmptyText="No count sheet in this window. Widen the dates, or start a count."
        enableListActionKeys
        listHintMessage={hintMessage}
        rowClassName={(row) =>
          rowStatus(sourceOf(row)) === STATUS_CANCELLED ? styles.cancelledRow : undefined
        }
        onCreateAction={onCreate}
        // Enter / F2: a POSTED or CANCELLED sheet is not a dead end — it opens
        // read-only, the same door Ctrl+Enter uses. The screen decides.
        onEditAction={(row) => {
          const source = sourceOf(row);
          const status = rowStatus(source);
          onOpen(docKeyOfRow(source), status !== STATUS_POSTED && status !== STATUS_CANCELLED);
        }}
        onViewAction={(row) => onOpen(docKeyOfRow(sourceOf(row)), false)}
        // No delete route: nothing here deletes a count sheet.
        isRowDeleteDisabled={() => true}
        rowDeleteDisabledReason="A count sheet is never deleted — Cancel reverses it and keeps it."
        auditHistory={{
          screenName: PHYSICAL_STOCK_AUDIT_SCREEN,
          getRecordId: (row) => textOf(sourceOf(row)?.svh_id) || null,
          getDisplayName: (row) =>
            textOf(sourceOf(row)?.svh_refno) || textOf(sourceOf(row)?.godown_name) || null,
        }}
      />
      <AskTextModal
        isOpen={cancelTarget !== null}
        title={cancelTarget ? `Cancel ${cancelTarget.label}` : ""}
        message="Why is this count being reversed?"
        placeholder="Type the reason"
        presets={CANCEL_REASON_PRESETS}
        required
        busy={cancelling}
        onCancel={() => setCancelTarget(null)}
        onConfirm={confirmCancel}
      />
    </>
  );
}
