"use client";

/**
 * Godown Transfers / Branch Outward — the list (Qt `TxnMainView` over
 * `TxnDocTypes::godownTransfer()` / `branchOutward()`, grids 183 / 184), on the
 * `CrudMasterPage` shell every voucher register uses.
 *
 * Both grids bind six QUOTED tokens and none is optional: `'icompany_id'`,
 * `'ibranch_id'`, `'iacc_year'`, `'ifrom_date'`, `'ito_date'`, `'istatus'` — the
 * last three NULLIF-guarded, so "" means no bound. An unbound token stays in the
 * statement as a literal, so every one is sent.
 *
 * The row policy is the Qt one. Godown: a POSTED or CANCELLED transfer is not
 * edited or deleted; Cancel (F3) reverses a POSTED one. Branch Outward: only a
 * DRAFT is editable — a despatch is on its way ("the receiving branch keys what
 * arrives. A despatch is never cancelled") or received. Enter on any row opens it
 * read-only. The list's own keys: F1 add, Enter / F2 edit, Ctrl+Enter view,
 * F3 cancel (godown), F5 refresh.
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
import { qtyCell } from "@/features/stocks/stock-adjustment/stock-adjustment.format";
import { useCancelStockTransferMutation, useDeleteStockTransferMutation } from "../stock-transfer.api";
import {
  CANCEL_REASONS,
  LIST_DEFAULT_DAYS_BACK,
  LIST_GRID_KEYS,
  LIST_STATUS_OPTIONS,
  MODE_INFO,
  STOCK_TRANSFER_ENDPOINT,
  type TransferMode,
} from "../stock-transfer.constants";
import { statusText } from "../stock-transfer.state";
import type { TransferDocKey } from "../stock-transfer.types";
import { apiErrorText } from "../stock-transfer.validate";
import { ConfirmDialog, type ConfirmRequest } from "./confirm-dialog";
import { notify } from "./notify";
import { ReasonDialog } from "./reason-dialog";
import styles from "../page.module.scss";

const API_ENDPOINTS = {
  // The shell's own form never opens here — a transfer is a voucher — so these
  // exist to satisfy its contract; delete goes through onDeleteAction.
  getById: STOCK_TRANSFER_ENDPOINT,
  create: STOCK_TRANSFER_ENDPOINT,
  delete: STOCK_TRANSFER_ENDPOINT,
} as const;

/** A castable uuid, so a pre-context request comes back empty instead of failing the cast. */
const NO_TENANT_ID = "00000000-0000-0000-0000-000000000000";

/** `name` / `active` = the exact SQL alias of each grid, or the cells are blank. */
const LOOKUP_KEYS = {
  godown: {
    id: ["svh_id"],
    code: ["svh_refno"],
    name: ["from_godown"],
    short: ["to_godown"],
    alias: ["svh_usr_refno"],
    active: ["svh_status"],
    array: ["items", "data", "rows", "results", "list"],
  },
  branch: {
    id: ["svh_id"],
    code: ["svh_refno"],
    name: ["from_godown"],
    short: ["to_branch"],
    alias: ["lr_no"],
    active: ["svh_status"],
    array: ["items", "data", "rows", "results", "list"],
  },
} as const;

const REQUEST_PAYLOAD_KEYS = { id: "svhId", name: "svh_refno", alias: "", short: "", description: "", sort: "" } as const;

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
function docKeyOf(row: MasterTableRow): TransferDocKey {
  return {
    svhId: asText(sourceValue(row, "svh_id")),
    companyId: asText(sourceValue(row, "svh_company_id")),
    branchId: asText(sourceValue(row, "svh_branch_id")),
    accYear: asText(sourceValue(row, "svh_acc_year")).trim(),
    refno: asText(sourceValue(row, "svh_refno")),
    status: statusOf(row),
  };
}

/** godownTransferRowPolicy / branchOutwardRowPolicy — what may be done to a row, and why not. */
export function rowPolicy(mode: TransferMode, status: string): { canEdit: boolean; canDelete: boolean; reason: string } {
  if (mode === "godown") {
    if (status === "POSTED") {
      return { canEdit: false, canDelete: false, reason: "Posted — the stock has moved. Cancel it to move it back." };
    }
    if (status === "CANCELLED") {
      return { canEdit: false, canDelete: false, reason: "Cancelled — its reversal is part of the history." };
    }
    return { canEdit: true, canDelete: true, reason: "" };
  }
  if (status !== "DRAFT" && status !== "") {
    return {
      canEdit: false,
      canDelete: false,
      reason:
        status === "IN_TRANSIT"
          ? "On its way — the receiving branch keys what arrives. A despatch is never cancelled."
          : status === "RECEIVED"
            ? "Received — the transfer is closed."
            : status === "CANCELLED"
              ? "Recalled — the stock came back; its reversal is part of the history."
              : "Not a draft.",
    };
  }
  return { canEdit: true, canDelete: true, reason: "" };
}

const PILL: Record<string, string> = {
  DRAFT: styles.statusDraft,
  POSTED: styles.statusPosted,
  RECEIVED: styles.statusPosted,
  CANCELLED: styles.statusCancelled,
  IN_TRANSIT: styles.statusTransit,
};

const PERIOD_OPTIONS = [
  { value: "7", label: "Last 7 days" },
  { value: "30", label: "Last 30 days" },
  { value: "90", label: "Last 90 days" },
  { value: "180", label: "Last 180 days" },
  { value: "365", label: "Last 365 days" },
  { value: "custom", label: "Custom" },
] as const;

export type StockTransferListViewProps = {
  mode: TransferMode;
  onCreate: () => void;
  onOpen: (key: TransferDocKey, mode: "browse" | "entry") => void;
};

export function StockTransferListView({ mode, onCreate, onOpen }: StockTransferListViewProps) {
  const info = MODE_INFO[mode];
  const { activeCompany, activeBranch, activeFiscalYear } = useBusinessContext();
  const companyId = activeCompany?.compId ?? activeCompany?.id ?? "";
  const branchId = activeBranch?.id ?? "";
  const accYear = (activeFiscalYear?.name ?? "").trim() || accountingYearOf(todayIso());
  const { permissions } = usePagePermissions();
  const rights = useMemo(() => documentRights(permissions), [permissions]);
  const godownMode = mode === "godown";

  const [fromDate, setFromDate] = useState(() => addDays(todayIso(), -LIST_DEFAULT_DAYS_BACK));
  const [toDate, setToDate] = useState(() => todayIso());
  const [period, setPeriod] = useState<string>(String(LIST_DEFAULT_DAYS_BACK));
  const [status, setStatus] = useState("");
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [cancelTarget, setCancelTarget] = useState<TransferDocKey | null>(null);
  const [confirm, setConfirm] = useState<ConfirmRequest | null>(null);
  const selectedRow = useRef<MasterTableRow | null>(null);

  const [cancelMutation] = useCancelStockTransferMutation();
  const [deleteMutation] = useDeleteStockTransferMutation();

  const applyPeriod = useCallback((value: string) => {
    setPeriod(value);
    const days = Number.parseInt(value, 10);
    if (value === "custom" || !Number.isFinite(days)) {
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
      void refreshNonce; // read so a refresh (F5, a cancel) builds a new query and reloads
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
          istatus: status,
        }),
      };
    },
    [accYear, branchId, companyId, fromDate, refreshNonce, status, toDate],
  );

  const listStateResetKey = `${mode}|${companyId}|${branchId}|${accYear}|${fromDate}|${toDate}|${status}`;

  /** Enter / F2: edit a draft; anything else (or no edit right) opens read-only. */
  const openRow = useCallback(
    (row: MasterTableRow) => {
      const policy = rowPolicy(mode, statusOf(row));
      onOpen(docKeyOf(row), policy.canEdit && permissions.canEdit ? "entry" : "browse");
    },
    [mode, onOpen, permissions.canEdit],
  );

  // Cancel (F3) is the godown list's: a POSTED transfer is reversed.
  const startCancel = useCallback(() => {
    const row = selectedRow.current;
    if (!godownMode || !row || statusOf(row) !== "POSTED" || !rights.mayCancelDocument(true)) {
      return;
    }
    setCancelTarget(docKeyOf(row));
  }, [godownMode, rights]);

  const runCancel = useCallback(
    (key: TransferDocKey, reason: string) => {
      setConfirm({
        title: `Cancel ${key.refno || key.svhId}?`,
        message:
          "The stock goes back to the From godown — a mirror row for each row the transfer wrote. Nothing is deleted.\n\nIt is refused if the stock has since left the To godown.",
        onConfirm: () => {
          void (async () => {
            try {
              await cancelMutation({ ...key, reason }).unwrap();
              setRefreshNonce((value) => value + 1);
              notify("info", "Cancelled", `${key.refno || key.svhId} cancelled.`);
            } catch (error) {
              notify("warn", "Error", apiErrorText(error));
            }
          })();
        },
      });
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

  const keys = { onCreate, openRow, startCancel, canCreate: permissions.canCreate, busy: cancelTarget !== null || confirm !== null };
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
          // Plain Enter only while the grid itself has focus, never a box or a button.
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

  const legend = godownMode
    ? "F1 add · Enter / F2 edit · Ctrl+Enter view · F3 cancel · F5 refresh"
    : "F1 add · Enter / F2 edit · Ctrl+Enter view · F5 refresh";

  const hintMessage = useCallback(
    (row: MasterTableRow | null) => {
      selectedRow.current = row;
      const policy = rowPolicy(mode, statusOf(row));
      return (
        <>
          <span>{legend}</span>
          {row && policy.reason ? (
            <strong style={{ color: "#8b1a1a", marginLeft: "1em" }}>{policy.reason} Enter opens it read-only.</strong>
          ) : null}
        </>
      );
    },
    [legend, mode],
  );

  const columnRenderOverrides = useMemo(() => {
    const statusPill = (row: MasterTableRow) => {
      const value = statusOf(row);
      return value ? (
        <span className={cx(styles.listPill, PILL[value] ?? styles.statusDraft)}>{statusText(value)}</span>
      ) : null;
    };
    return {
      svh_doc_date: (row: MasterTableRow) => toDisplayDate(asText(sourceValue(row, "svh_doc_date")).slice(0, 10)),
      svh_total_qty: (row: MasterTableRow) => qtyCell(toNumber(asText(sourceValue(row, "svh_total_qty")))),
      in_transit_qty: (row: MasterTableRow) => qtyCell(toNumber(asText(sourceValue(row, "in_transit_qty")))),
      svh_total_value: (row: MasterTableRow) =>
        formatCurrency(toNumber(asText(sourceValue(row, "svh_total_value"))), 2, true),
      svh_status: statusPill,
      // Grid 184 shows the status as `status_text` ("IN TRANSIT").
      status_text: statusPill,
    };
  }, []);

  const toolbarContent = useMemo(
    () => (
      <>
        <div className={masterStyles.filterGroup}>
          <label className={masterStyles.filterLabel} htmlFor={`st-${mode}-from`}>
            From
          </label>
          <input
            id={`st-${mode}-from`}
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
          <label className={masterStyles.filterLabel} htmlFor={`st-${mode}-to`}>
            To
          </label>
          <input
            id={`st-${mode}-to`}
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
          <label className={masterStyles.filterLabel} htmlFor={`st-${mode}-period`}>
            Period
          </label>
          <select
            id={`st-${mode}-period`}
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
          <label className={masterStyles.filterLabel} htmlFor={`st-${mode}-status`}>
            Status :
          </label>
          <select
            id={`st-${mode}-status`}
            className={styles.filterSelect}
            value={status}
            onChange={(event) => setStatus(event.target.value)}
          >
            {LIST_STATUS_OPTIONS[mode].map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </>
    ),
    [applyPeriod, fromDate, mode, period, status, toDate],
  );

  const toolbarActions = (row: MasterTableRow | null) => {
    if (!godownMode) {
      return null;
    }
    const cancelRight = row ? rights.mayCancelDocument(true) : rights.mayCancelDocument(true);
    const posted = !row || statusOf(row) === "POSTED";
    return (
      <>
        <span className="erp-ms-tsep" aria-hidden="true" />
        <button
          type="button"
          className={`${masterStyles.iconBtn} ${masterStyles.iconBtnDelete} erp-ms-tbtn`}
          title={cancelRight ? "Move the stock back (F3)" : "You do not have permission to cancel"}
          disabled={!cancelRight || !posted}
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
        title={info.title}
        listTitleOverride={info.listTitle}
        listSubtitleOverride={info.listSubtitle}
        entityLabel={info.noun}
        entityLabelPlural={`${info.noun}s`}
        searchPlaceholder={info.searchHint}
        apiEndpoints={API_ENDPOINTS}
        gridKey={LIST_GRID_KEYS[mode]}
        lookupKeys={LOOKUP_KEYS[mode]}
        requestPayloadKeys={REQUEST_PAYLOAD_KEYS}
        styles={masterStyles}
        createLabel="Add"
        codeColumnHeader="Ref No"
        nameColumnHeader="From godown"
        listResponseStyleArrayKey=""
        gridTableName="stock_voucher"
        useConfiguredGridColumnsOnly
        enableGridSettingsContextMenu
        columnRenderOverrides={columnRenderOverrides}
        toolbarContent={toolbarContent}
        toolbarActions={toolbarActions}
        buildListQuery={buildListQuery}
        listStateResetKey={listStateResetKey}
        listEmptyText={`No ${info.noun} in this window. Widen the dates, or key one.`}
        listHintMessage={hintMessage}
        rowClassName={(row) => (statusOf(row) === "CANCELLED" ? styles.cancelledRow : undefined)}
        onCreateAction={onCreate}
        onEditAction={openRow}
        onViewAction={(row) => onOpen(docKeyOf(row), "browse")}
        // Only a DRAFT is deleted, and it moved no stock.
        isRowDeleteDisabled={(row) => !rowPolicy(mode, statusOf(row)).canDelete}
        rowDeleteDisabledReason={`Only a saved DRAFT can be deleted. ${godownMode ? "A posted transfer is cancelled." : "A despatch is never cancelled."}`}
        deleteConfirmMessage="The draft moved no stock. Delete it?"
        onDeleteAction={handleDelete}
        auditHistory={{
          screenName: info.title,
          getRecordId: (row) => asText(sourceValue(row, "svh_id")) || null,
          getDisplayName: (row) => asText(sourceValue(row, "svh_refno")) || null,
        }}
      />
      <ReasonDialog
        isOpen={cancelTarget !== null}
        title={`Cancel ${cancelTarget?.refno || cancelTarget?.svhId || ""}`}
        prompt="Why is this transfer being reversed?"
        presets={CANCEL_REASONS}
        onClose={() => setCancelTarget(null)}
        onSubmit={(reason) => {
          const key = cancelTarget;
          setCancelTarget(null);
          if (key) {
            runCancel(key, reason);
          }
        }}
      />
      <ConfirmDialog request={confirm} onClose={() => setConfirm(null)} />
    </>
  );
}
