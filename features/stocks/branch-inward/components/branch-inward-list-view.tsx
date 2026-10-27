"use client";

/**
 * Branch Inward — the register (Qt `TxnMainView` over `TxnDocTypes::
 * branchInward()`, grid 185), on the `CrudMasterPage` shell every voucher
 * register uses. What this branch RECEIVED from other branches; New starts from
 * what is on the way.
 *
 * Grid 185 binds six quoted tokens and none is optional: `icompany_id`,
 * `ibranch_id`, `iacc_year`, `ifrom_date`, `ito_date`, `istatus` — the last
 * three guarded, so "" means no bound. Every one is sent.
 *
 * Row policy (Qt `branchInwardRowPolicy`): a POSTED receipt is never edited or
 * deleted — "Received — a receipt is never un-received; a new transfer sends it
 * back." — and Enter opens it read-only. A DRAFT opens for edit and may be
 * deleted. There is no Cancel and no Print on this register.
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import CrudMasterPage from "@/components/master/crud-master-page";
import type { MasterTableRow } from "@/components/master/crud-master-page.types";
import { useBusinessContext } from "@/components/layout/business-context";
import masterStyles from "@/app/master/state-master/page.module.scss";
import { cx } from "@/components/design-system/cx";
import { formatCurrency } from "@/domain/pricing";
import { usePagePermissions } from "@/hooks/useMenuPermissions";
import { accountingYearOf, addDays, toDisplayDate, todayIso, toNumber } from "@/features/sales/quotation/quotation.utils";
import { notify } from "../../stock-adjustment/components/notify";
import { qtyCell } from "../../stock-adjustment/stock-adjustment.format";
import { apiErrorText } from "../../stock-adjustment/stock-adjustment.validate";
import { useBranchInwardDeleteMutation } from "../branch-inward.api";
import {
  BRANCH_INWARD_LIST_GRID_KEY,
  BRANCH_INWARD_RECEIVE_ENDPOINT,
  LIST_DEFAULT_DAYS_BACK,
  LIST_STATUS_OPTIONS,
} from "../branch-inward.constants";
import type { BranchInwardDocKey } from "../branch-inward.types";
import styles from "../page.module.scss";

const API_ENDPOINTS = {
  // The shell's own form never opens here — a receipt is a voucher — so these
  // exist to satisfy its contract; delete goes through onDeleteAction.
  getById: BRANCH_INWARD_RECEIVE_ENDPOINT,
  create: BRANCH_INWARD_RECEIVE_ENDPOINT,
  delete: BRANCH_INWARD_RECEIVE_ENDPOINT,
} as const;

/** A castable uuid, so a pre-context request comes back empty instead of failing the cast. */
const NO_TENANT_ID = "00000000-0000-0000-0000-000000000000";

const LOOKUP_KEYS = {
  id: ["svh_id"],
  code: ["svh_refno"],
  name: ["against_refno"],
  short: ["from_branch"],
  alias: ["to_godown"],
  active: ["svh_status"],
  array: ["items", "data", "rows", "results", "list"],
} as const;

const REQUEST_PAYLOAD_KEYS = {
  id: "svhId",
  name: "against_refno",
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
function docKeyOf(row: MasterTableRow): BranchInwardDocKey {
  return {
    svhId: asText(sourceValue(row, "svh_id")),
    companyId: asText(sourceValue(row, "svh_company_id")),
    branchId: asText(sourceValue(row, "svh_branch_id")),
    accYear: asText(sourceValue(row, "svh_acc_year")).trim(),
    refno: asText(sourceValue(row, "svh_refno")),
    status: statusOf(row),
  };
}

/** branchInwardRowPolicy — what may be done to a row, and why not. */
export function rowPolicy(status: string): { canEdit: boolean; canDelete: boolean; reason: string } {
  if (status === "POSTED") {
    return {
      canEdit: false,
      canDelete: false,
      reason: "Received — a receipt is never un-received; a new transfer sends it back.",
    };
  }
  return { canEdit: true, canDelete: true, reason: "" };
}

const COLUMN_RENDER_OVERRIDES = {
  svh_doc_date: (row: MasterTableRow) => toDisplayDate(asText(sourceValue(row, "svh_doc_date")).slice(0, 10)),
  svh_total_qty: (row: MasterTableRow) => qtyCell(toNumber(asText(sourceValue(row, "svh_total_qty")))),
  svh_total_value: (row: MasterTableRow) =>
    formatCurrency(toNumber(asText(sourceValue(row, "svh_total_value"))), 2, true),
  svh_status: (row: MasterTableRow) => {
    const status = statusOf(row);
    return status ? (
      <span className={cx(styles.statusPill, status === "POSTED" ? styles.statusPosted : styles.statusDraft)}>
        {status}
      </span>
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

const LEGEND = "F1 receive · Enter / F2 edit · Ctrl+Enter view · F5 refresh";

export type BranchInwardListViewProps = {
  onCreate: () => void;
  onOpen: (key: BranchInwardDocKey, mode: "browse" | "entry") => void;
};

export function BranchInwardListView({ onCreate, onOpen }: BranchInwardListViewProps) {
  const { activeCompany, activeBranch, activeFiscalYear } = useBusinessContext();
  const companyId = activeCompany?.compId ?? activeCompany?.id ?? "";
  const branchId = activeBranch?.id ?? "";
  const accYear = (activeFiscalYear?.name ?? "").trim() || accountingYearOf(todayIso());
  const { permissions } = usePagePermissions();

  const [fromDate, setFromDate] = useState(() => addDays(todayIso(), -LIST_DEFAULT_DAYS_BACK));
  const [toDate, setToDate] = useState(() => todayIso());
  const [period, setPeriod] = useState<string>(String(LIST_DEFAULT_DAYS_BACK));
  const [status, setStatus] = useState("");
  const [refreshNonce, setRefreshNonce] = useState(0);
  const selectedRow = useRef<MasterTableRow | null>(null);
  const [deleteMutation] = useBranchInwardDeleteMutation();

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
      // Read so a refresh (F5, a delete) builds a new query and reloads.
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
          istatus: status,
        }),
      };
    },
    [accYear, branchId, companyId, fromDate, refreshNonce, status, toDate],
  );

  const listStateResetKey = `${companyId}|${branchId}|${accYear}|${fromDate}|${toDate}|${status}`;

  /** Enter / F2: edit a draft; a posted one (or no edit right) opens read-only. */
  const openRow = useCallback(
    (row: MasterTableRow) => {
      onOpen(docKeyOf(row), rowPolicy(statusOf(row)).canEdit && permissions.canEdit ? "entry" : "browse");
    },
    [onOpen, permissions.canEdit],
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
  const keys = { onCreate, openRow, canCreate: permissions.canCreate };
  const keysRef = useRef(keys);
  useLayoutEffect(() => {
    keysRef.current = keys;
  });
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const current = keysRef.current;
      if (event.defaultPrevented || event.altKey || event.metaKey || event.shiftKey) {
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
          // Plain Enter only while the grid itself has focus — never the search
          // box or a button, which Enter belongs to.
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
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  /** The hint bar: the keys, and why the highlighted row will not open for change. */
  const hintMessage = useCallback((row: MasterTableRow | null) => {
    selectedRow.current = row;
    const policy = rowPolicy(statusOf(row));
    return (
      <>
        <span>{LEGEND}</span>
        {row && policy.reason ? (
          <strong style={{ color: "#8b1a1a", marginLeft: "1em" }}>{policy.reason} Enter opens it read-only.</strong>
        ) : null}
      </>
    );
  }, []);

  const toolbarContent = useMemo(
    () => (
      <>
        <div className={masterStyles.filterGroup}>
          <label className={masterStyles.filterLabel} htmlFor="branch-inward-from">
            From
          </label>
          <input
            id="branch-inward-from"
            type="date"
            value={fromDate}
            max={toDate || undefined}
            onChange={(event) => {
              setFromDate(event.target.value);
              setPeriod("custom");
            }}
          />
        </div>
        <div className={masterStyles.filterGroup}>
          <label className={masterStyles.filterLabel} htmlFor="branch-inward-to">
            To
          </label>
          <input
            id="branch-inward-to"
            type="date"
            value={toDate}
            min={fromDate || undefined}
            onChange={(event) => {
              setToDate(event.target.value);
              setPeriod("custom");
            }}
          />
        </div>
        <div className={masterStyles.filterGroup}>
          <label className={masterStyles.filterLabel} htmlFor="branch-inward-period">
            Period
          </label>
          <select id="branch-inward-period" value={period} onChange={(event) => applyPeriod(event.target.value)}>
            {PERIOD_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
        <div className={masterStyles.filterGroup}>
          <label className={masterStyles.filterLabel} htmlFor="branch-inward-status">
            Status :
          </label>
          <select id="branch-inward-status" value={status} onChange={(event) => setStatus(event.target.value)}>
            {LIST_STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </>
    ),
    [applyPeriod, fromDate, period, status, toDate],
  );

  return (
    <CrudMasterPage
      title="Branch Inward"
      listTitleOverride="Branch Inward"
      listSubtitleOverride="What this branch received from other branches. New starts from what is on the way."
      entityLabel="transfer receipt"
      entityLabelPlural="transfer receipts"
      searchPlaceholder="doc no, despatch no, branch or godown"
      apiEndpoints={API_ENDPOINTS}
      gridKey={BRANCH_INWARD_LIST_GRID_KEY}
      lookupKeys={LOOKUP_KEYS}
      requestPayloadKeys={REQUEST_PAYLOAD_KEYS}
      styles={masterStyles}
      createLabel="Receive"
      codeColumnHeader="Ref No"
      nameColumnHeader="Against"
      listResponseStyleArrayKey=""
      gridTableName="stock_voucher"
      useConfiguredGridColumnsOnly
      enableGridSettingsContextMenu
      columnRenderOverrides={COLUMN_RENDER_OVERRIDES}
      toolbarContent={toolbarContent}
      buildListQuery={buildListQuery}
      listStateResetKey={listStateResetKey}
      listEmptyText="No receipt in this window. Widen the dates, or press Receive to start from what is on the way."
      listHintMessage={hintMessage}
      onCreateAction={onCreate}
      // A row the policy will not let you EDIT is not a dead end: it opens read-only.
      onEditAction={openRow}
      onViewAction={(row) => onOpen(docKeyOf(row), "browse")}
      // Only a DRAFT is deleted, and it brought nothing in.
      isRowDeleteDisabled={(row) => !rowPolicy(statusOf(row)).canDelete}
      rowDeleteDisabledReason="Received — a receipt is never un-received; a new transfer sends it back."
      deleteConfirmMessage="The draft brought nothing in. Delete it? The despatch stays in transit."
      onDeleteAction={handleDelete}
      auditHistory={{
        screenName: "Stock Transfer Receipt",
        getRecordId: (row) => asText(sourceValue(row, "svh_id")) || null,
        getDisplayName: (row) => asText(sourceValue(row, "svh_refno")) || null,
      }}
    />
  );
}
