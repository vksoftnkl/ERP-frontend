"use client";

/**
 * Stock Adjustments — the list (Qt `TxnMainView` over
 * `TxnDocTypes::stockAdjustment()`, grid 122 "TXN MAIN LIST - STOCK
 * ADJUSTMENT"), on the `CrudMasterPage` shell every voucher register uses.
 *
 * Grid 122's SQL binds seven bare tokens and NONE is optional: `icompany_id`,
 * `ibranch_id`, `iacc_year`, `ifrom_date`, `ito_date`, `ikind`, `istatus` —
 * the last four NULLIF-guarded, so "" means no bound. An unbound token stays in
 * the statement as a literal and fails the whole query, so every one is sent.
 *
 * The row policy is the Qt one: a POSTED document is not edited or deleted
 * ("Posted — stock has moved. Cancel it to reverse."), a CANCELLED one neither
 * ("Cancelled — its reversal is part of the history."); Enter on either opens
 * it read-only. Cancel (F3) reverses a POSTED or a DRAFT document from here,
 * with the same reason and question the entry asks. The legacy keys are the
 * list's own: F1 add, Enter / F2 edit, Ctrl+Enter view, F3 cancel, F5 refresh.
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import CrudMasterPage from "@/components/master/crud-master-page";
import type { MasterTableRow } from "@/components/master/crud-master-page.types";
import { useBusinessContext } from "@/components/layout/business-context";
import masterStyles from "@/app/master/state-master/page.module.scss";
import { cx } from "@/components/design-system/cx";
import { ErpActionIcon } from "@/components/design-system/icons/erp-action-icons";
import { formatCurrency } from "@/domain/pricing";
import { usePagePermissions } from "@/hooks/useMenuPermissions";
import { documentRights } from "@/lib/permissions/document-rights";
import { accountingYearOf, addDays, toDisplayDate, todayIso, toNumber } from "@/features/sales/quotation/quotation.utils";
import { useCancelStockAdjustmentMutation, useDeleteStockAdjustmentMutation } from "../stock-adjustment.api";
import {
  LIST_DEFAULT_DAYS_BACK,
  LIST_KIND_OPTIONS,
  LIST_STATUS_OPTIONS,
  STOCK_ADJUSTMENT_ENDPOINT,
  STOCK_ADJUSTMENT_LIST_GRID_KEY,
} from "../stock-adjustment.constants";
import { qtyCell } from "../stock-adjustment.format";
import type { StockAdjustmentDocKey } from "../stock-adjustment.types";
import { apiErrorText } from "../stock-adjustment.validate";
import { CancelFlow, type CancelTarget } from "./cancel-flow";
import { notify } from "./notify";
import styles from "../page.module.scss";

const API_ENDPOINTS = {
  // The shell's own form never opens here — an adjustment is a voucher — so
  // these exist to satisfy its contract; delete goes through onDeleteAction.
  getById: STOCK_ADJUSTMENT_ENDPOINT,
  create: STOCK_ADJUSTMENT_ENDPOINT,
  delete: STOCK_ADJUSTMENT_ENDPOINT,
} as const;

/** A castable uuid, so a pre-context request comes back empty instead of failing the cast. */
const NO_TENANT_ID = "00000000-0000-0000-0000-000000000000";

const LOOKUP_KEYS = {
  id: ["svh_id"],
  code: ["svh_refno"],
  name: ["kind_name"],
  short: ["svh_voucher_type"],
  alias: ["svh_usr_refno"],
  active: ["svh_status"],
  array: ["items", "data", "rows", "results", "list"],
} as const;

const REQUEST_PAYLOAD_KEYS = {
  id: "svhId",
  name: "kind_name",
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

function statusOf(row: MasterTableRow | null): string {
  return row ? asText(sourceValue(row, "svh_status")).trim().toUpperCase() : "";
}

/** The whole document key: stock_voucher is partitioned by year. */
function docKeyOf(row: MasterTableRow): StockAdjustmentDocKey {
  return {
    svhId: asText(sourceValue(row, "svh_id")),
    companyId: asText(sourceValue(row, "svh_company_id")),
    branchId: asText(sourceValue(row, "svh_branch_id")),
    accYear: asText(sourceValue(row, "svh_acc_year")).trim(),
    refno: asText(sourceValue(row, "svh_refno")),
    status: statusOf(row),
  };
}

/** stockAdjustmentRowPolicy — what may be done to a row, and why not. */
export function rowPolicy(status: string): { canEdit: boolean; canDelete: boolean; reason: string } {
  if (status === "POSTED") {
    return { canEdit: false, canDelete: false, reason: "Posted — stock has moved. Cancel it to reverse." };
  }
  if (status === "CANCELLED") {
    return { canEdit: false, canDelete: false, reason: "Cancelled — its reversal is part of the history." };
  }
  return { canEdit: true, canDelete: true, reason: "" };
}

/** The Cancel row action is live on a POSTED or a DRAFT document. */
function cancelEnabledFor(status: string): boolean {
  return status === "POSTED" || status === "DRAFT";
}

const STATUS_PILL: Record<string, string> = {
  DRAFT: styles.statusDraft,
  POSTED: styles.statusPosted,
  CANCELLED: styles.statusCancelled,
};

const COLUMN_RENDER_OVERRIDES = {
  svh_doc_date: (row: MasterTableRow) => toDisplayDate(asText(sourceValue(row, "svh_doc_date")).slice(0, 10)),
  svh_total_qty: (row: MasterTableRow) => qtyCell(toNumber(asText(sourceValue(row, "svh_total_qty")))),
  svh_total_value: (row: MasterTableRow) =>
    formatCurrency(toNumber(asText(sourceValue(row, "svh_total_value"))), 2, true),
  svh_status: (row: MasterTableRow) => {
    const status = statusOf(row);
    return status ? (
      <span className={cx(styles.listPill, STATUS_PILL[status] ?? styles.statusDraft)}>{status}</span>
    ) : null;
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

const LEGEND = "F1 add · Enter / F2 edit · Ctrl+Enter view · F3 cancel · F5 refresh";

export type StockAdjustmentListViewProps = {
  onCreate: () => void;
  onOpen: (key: StockAdjustmentDocKey, mode: "browse" | "entry") => void;
};

export function StockAdjustmentListView({ onCreate, onOpen }: StockAdjustmentListViewProps) {
  const { activeCompany, activeBranch, activeFiscalYear } = useBusinessContext();
  const companyId = activeCompany?.compId ?? activeCompany?.id ?? "";
  const branchId = activeBranch?.id ?? "";
  const accYear = (activeFiscalYear?.name ?? "").trim() || accountingYearOf(todayIso());
  const { permissions } = usePagePermissions();
  const rights = useMemo(() => documentRights(permissions), [permissions]);

  const [fromDate, setFromDate] = useState(() => addDays(todayIso(), -LIST_DEFAULT_DAYS_BACK));
  const [toDate, setToDate] = useState(() => todayIso());
  const [period, setPeriod] = useState<string>(String(LIST_DEFAULT_DAYS_BACK));
  const [kind, setKind] = useState("");
  const [status, setStatus] = useState("");
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [cancelTarget, setCancelTarget] = useState<(CancelTarget & { key: StockAdjustmentDocKey }) | null>(null);
  const selectedRow = useRef<MasterTableRow | null>(null);

  const [cancelMutation] = useCancelStockAdjustmentMutation();
  const [deleteMutation] = useDeleteStockAdjustmentMutation();

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
    }): Record<string, string> => {
      // Read so a refresh (F5, a cancel) builds a new query and reloads.
      void refreshNonce;
      return {
        page: String(currentPage),
        limit: String(pageSize),
        ...(searchTerm ? { search: searchTerm } : {}),
        ...(sortBy ? { sort_by: sortBy } : {}),
        ...(sortBy && sortDir ? { sort_dir: sortDir } : {}),
        grid_param: JSON.stringify({
          icompany_id: companyId || NO_TENANT_ID,
          ibranch_id: branchId || NO_TENANT_ID,
          iacc_year: accYear,
          ifrom_date: fromDate,
          ito_date: toDate,
          ikind: kind,
          istatus: status,
        }),
      };
    },
    [accYear, branchId, companyId, fromDate, kind, refreshNonce, status, toDate],
  );

  const listStateResetKey = `${companyId}|${branchId}|${accYear}|${fromDate}|${toDate}|${kind}|${status}`;

  /** Enter / F2: edit a draft; anything else (or no edit right) opens read-only. */
  const openRow = useCallback(
    (row: MasterTableRow) => {
      const policy = rowPolicy(statusOf(row));
      onOpen(docKeyOf(row), policy.canEdit && permissions.canEdit ? "entry" : "browse");
    },
    [onOpen, permissions.canEdit],
  );

  // Document rights, as the entry's Cancel document: a POSTED document needs
  // the Cancel right, a draft the Delete right.
  const startCancel = useCallback(() => {
    const row = selectedRow.current;
    if (!row || !cancelEnabledFor(statusOf(row)) || !rights.mayCancelDocument(statusOf(row) === "POSTED")) {
      return;
    }
    const key = docKeyOf(row);
    setCancelTarget({ key, label: key.refno || key.svhId, posted: key.status === "POSTED" });
  }, [rights]);

  const runCancel = useCallback(
    async (target: CancelTarget & { key: StockAdjustmentDocKey }, reason: string) => {
      try {
        await cancelMutation({
          svhId: target.key.svhId,
          accYear: target.key.accYear,
          companyId: target.key.companyId,
          branchId: target.key.branchId,
          reason,
        }).unwrap();
        setRefreshNonce((value) => value + 1);
        notify("info", "Cancelled", `${target.label} cancelled.`);
      } catch (error) {
        notify("warn", "Error", apiErrorText(error));
      }
    },
    [cancelMutation],
  );

  const handleDelete = useCallback(
    async (row: MasterTableRow): Promise<boolean> => {
      const key = docKeyOf(row);
      try {
        await deleteMutation(key).unwrap();
        notify("info", "Deleted", `${key.refno || key.svhId} deleted.`);
        return true;
      } catch (error) {
        notify("warn", "Error", apiErrorText(error));
        return false;
      }
    },
    [deleteMutation],
  );

  // The list's function keys (the legacy main view's, kept exactly).
  const keys = { onCreate, openRow, startCancel, canCreate: permissions.canCreate, busy: cancelTarget !== null };
  const keysRef = useRef(keys);
  useLayoutEffect(() => {
    keysRef.current = keys;
  });
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const current = keysRef.current;
      if (current.busy || event.defaultPrevented || event.altKey || event.metaKey || event.shiftKey) {
        return;
      }
      if (document.querySelector(".erp-ms-confirm-overlay")) {
        return;
      }
      if (event.key === "F5" && !event.ctrlKey) {
        event.preventDefault();
        setRefreshNonce((value) => value + 1);
        return;
      }
      if (event.ctrlKey) {
        return;
      }
      if (event.key === "F1") {
        event.preventDefault();
        if (current.canCreate) {
          current.onCreate();
        }
        return;
      }
      if (event.key === "F2" || event.key === "Enter") {
        if (event.key === "Enter") {
          // Plain Enter only while the grid itself has focus — the row list,
          // or the focusable box the list keyboard hands over to — never the
          // search box or a button, which Enter belongs to.
          const target = event.target as HTMLElement | null;
          const onGrid =
            Boolean(target?.closest(".erp-ms-gridwrap")) ||
            (target instanceof HTMLDivElement && target.tabIndex === -1 && Boolean(target.querySelector(".erp-ms-gridwrap")));
          if (!onGrid) {
            return;
          }
        }
        if (selectedRow.current) {
          event.preventDefault();
          current.openRow(selectedRow.current);
        }
        return;
      }
      if (event.key === "F3") {
        event.preventDefault();
        current.startCancel();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  /**
   * The hint bar: the keys, and why the highlighted row will not open for
   * change — with what Enter does instead, so the note does not read as a
   * refusal with nowhere to go.
   */
  const hintMessage = useCallback((row: MasterTableRow | null) => {
    selectedRow.current = row;
    const policy = rowPolicy(statusOf(row));
    return (
      <>
        <span>{LEGEND}</span>
        {row && policy.reason ? (
          <strong style={{ color: "#8b1a1a", marginLeft: "1em" }}>
            {policy.reason}  Enter opens it read-only.
          </strong>
        ) : null}
      </>
    );
  }, []);

  const toolbarContent = useMemo(
    () => (
      <>
        <div className={masterStyles.filterGroup}>
          <label className={masterStyles.filterLabel} htmlFor="stock-adjustment-from">
            From
          </label>
          <input
            id="stock-adjustment-from"
            type="date"
            className={styles.filterDate}
            value={fromDate}
            max={toDate || undefined}
            onChange={(event) => {
              setFromDate(event.target.value);
              setPeriod("custom");
            }}
          />
        </div>
        <div className={masterStyles.filterGroup}>
          <label className={masterStyles.filterLabel} htmlFor="stock-adjustment-to">
            To
          </label>
          <input
            id="stock-adjustment-to"
            type="date"
            className={styles.filterDate}
            value={toDate}
            min={fromDate || undefined}
            onChange={(event) => {
              setToDate(event.target.value);
              setPeriod("custom");
            }}
          />
        </div>
        <div className={masterStyles.filterGroup}>
          <label className={masterStyles.filterLabel} htmlFor="stock-adjustment-period">
            Period
          </label>
          <select
            id="stock-adjustment-period"
            className={styles.filterSelect}
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
        <div className={masterStyles.filterGroup}>
          <label className={masterStyles.filterLabel} htmlFor="stock-adjustment-kind">
            Type :
          </label>
          <select
            id="stock-adjustment-kind"
            className={styles.filterSelect}
            value={kind}
            onChange={(event) => setKind(event.target.value)}
          >
            {LIST_KIND_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
        <div className={masterStyles.filterGroup}>
          <label className={masterStyles.filterLabel} htmlFor="stock-adjustment-status">
            Status :
          </label>
          <select
            id="stock-adjustment-status"
            className={styles.filterSelect}
            value={status}
            onChange={(event) => setStatus(event.target.value)}
          >
            {LIST_STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </>
    ),
    [applyPeriod, fromDate, kind, period, status, toDate],
  );

  const toolbarActions = (row: MasterTableRow | null) => {
    // The selected row's right; with none selected, whether any Cancel is allowed.
    const cancelRight = row
      ? rights.mayCancelDocument(statusOf(row) === "POSTED")
      : rights.mayCancelDocument(true) || rights.mayCancelDocument(false);
    return (
      <>
        <span className="erp-ms-tsep" aria-hidden="true" />
        <button
          type="button"
          className={`${masterStyles.iconBtn} ${masterStyles.iconBtnDelete} erp-ms-tbtn`}
          title={cancelRight ? "Reverse this document (F3)" : "You do not have permission to cancel"}
          disabled={!cancelRight}
          onClick={startCancel}
        >
          <span className={`${masterStyles.iconBtnBox} erp-ms-tbtn-icon`}>
            <ErpActionIcon name="history" />
          </span>
          <span>Cancel</span>
        </button>
      </>
    );
  };

  return (
    <>
      <CrudMasterPage
        title="Stock Adjustment"
        listTitleOverride="Stock Adjustments"
        listSubtitleOverride="Adjustments, issues, damage and expiry write-offs, re-lots and stock moves — every stock change that is not a purchase, a sale or a transfer."
        entityLabel="stock adjustment"
        entityLabelPlural="stock adjustments"
        searchPlaceholder="doc no, godown, reason, your ref or remarks"
        apiEndpoints={API_ENDPOINTS}
        gridKey={STOCK_ADJUSTMENT_LIST_GRID_KEY}
        lookupKeys={LOOKUP_KEYS}
        requestPayloadKeys={REQUEST_PAYLOAD_KEYS}
        styles={masterStyles}
        createLabel="Add"
        codeColumnHeader="Ref No"
        nameColumnHeader="Kind"
        listResponseStyleArrayKey=""
        gridTableName="stock_voucher"
        useConfiguredGridColumnsOnly
        enableGridSettingsContextMenu
        columnRenderOverrides={COLUMN_RENDER_OVERRIDES}
        toolbarContent={toolbarContent}
        toolbarActions={toolbarActions}
        buildListQuery={buildListQuery}
        listStateResetKey={listStateResetKey}
        listEmptyText="No stock adjustment in this window. Widen the dates, or key one."
        listHintMessage={hintMessage}
        rowClassName={(row) => (statusOf(row) === "CANCELLED" ? styles.cancelledRow : undefined)}
        onCreateAction={onCreate}
        // A row the policy will not let you EDIT is not a dead end: it opens
        // read-only, the door Ctrl+Enter uses.
        onEditAction={openRow}
        onViewAction={(row) => onOpen(docKeyOf(row), "browse")}
        // Only a DRAFT is deleted, and it moved no stock; a posted document is
        // cancelled, which writes its reversal.
        isRowDeleteDisabled={(row) => !rowPolicy(statusOf(row)).canDelete}
        rowDeleteDisabledReason="Only a saved DRAFT can be deleted. A posted document is cancelled."
        deleteConfirmMessage="The draft moved no stock. Delete it?"
        onDeleteAction={handleDelete}
        auditHistory={{
          screenName: "Stock Adjustment",
          getRecordId: (row) => asText(sourceValue(row, "svh_id")) || null,
          getDisplayName: (row) => asText(sourceValue(row, "svh_refno")) || null,
        }}
      />
      <CancelFlow
        target={cancelTarget}
        onClose={() => setCancelTarget(null)}
        onCancelDocument={(reason) => {
          if (cancelTarget) {
            void runCancel(cancelTarget, reason);
          }
        }}
      />
    </>
  );
}
