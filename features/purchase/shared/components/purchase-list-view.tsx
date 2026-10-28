"use client";

/**
 * The purchase documents' list — the Qt `TxnMainView` over one of
 * `TxnDocTypes::purchase*()` (grids 189–193), on the `CrudMasterPage` shell
 * every voucher register uses. One component, five configs
 * (`PURCHASE_DOC_TYPES`).
 *
 * The row policy is Qt's `postedLocked`: a POSTED or CANCELLED document is not
 * edited; Enter opens it read-only. Nothing is deleted from the list (Qt sets no
 * `onDelete`, the server has no route); Cancel (F3) asks the reason and posts
 * `{ <idKey>, accYear, reason }`. The list's keys: F1 add, Enter / F2 edit,
 * Ctrl+Enter view, F3 cancel, F5 refresh.
 */
import { isoToDisplayDate } from "@/lib/date-format";
import { DateInput } from "@/components/design-system/ui/date-input";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import CrudMasterPage from "@/components/master/crud-master-page";
import type { MasterTableRow } from "@/components/master/crud-master-page.types";
import { useBusinessContext } from "@/components/layout/business-context";
import masterStyles from "@/app/master/state-master/page.module.scss";
import { cx } from "@/components/design-system/cx";
import { ErpActionIcon } from "@/components/design-system/icons/erp-action-icons";
import { formatCurrency } from "@/domain/pricing";
import { ReasonDialog } from "@/features/accounts/vouchers/components/reason-dialog";
import { accountingYearOf, addDays, todayIso } from "@/features/sales/quotation/quotation.utils";
import { usePagePermissions } from "@/hooks/useMenuPermissions";
import { toast } from "@/lib/notify";
import { documentRights } from "@/lib/permissions/document-rights";
import { useCancelPurchaseDocumentMutation } from "../purchase.api";
import {
  PURCHASE_DOC_TYPES,
  PURCHASE_LIST_DEFAULT_DAYS_BACK,
  purchaseRowPolicy,
  purchaseStatusOptions,
  type PurchaseListRow,
} from "../purchase.doc-types";
import { num, purchaseStatusText, text } from "../purchase.format";
import type { PurchaseDocKey, PurchaseDocType } from "../purchase.types";
import styles from "../purchase.module.scss";

/** A castable uuid, so a pre-context request comes back empty instead of failing the cast. */
const NO_TENANT_ID = "00000000-0000-0000-0000-000000000000";

const PERIOD_OPTIONS = [
  { value: "7", label: "Last 7 days" },
  { value: "30", label: "Last 30 days" },
  { value: "90", label: "Last 90 days" },
  { value: "180", label: "Last 180 days" },
  { value: "365", label: "Last 365 days" },
  { value: "custom", label: "Custom" },
] as const;

const PILL: Record<string, string> = {
  DRAFT: styles.statusDraft,
  POSTED: styles.statusPosted,
  CANCELLED: styles.statusCancelled,
};

function sourceOf(row: MasterTableRow | null): PurchaseListRow {
  return (row?.__source ?? {}) as PurchaseListRow;
}

export type PurchaseListViewProps = {
  docType: PurchaseDocType;
  onCreate: () => void;
  onOpen: (key: PurchaseDocKey, mode: "browse" | "entry") => void;
};

export function PurchaseListView({ docType, onCreate, onOpen }: PurchaseListViewProps) {
  const config = PURCHASE_DOC_TYPES[docType];
  const { fields } = config;
  const { activeCompany, activeBranch, activeFiscalYear } = useBusinessContext();
  const companyId = activeCompany?.compId ?? activeCompany?.id ?? "";
  const branchId = activeBranch?.id ?? "";
  const accYear = (activeFiscalYear?.name ?? "").trim() || accountingYearOf(todayIso());
  const { permissions } = usePagePermissions();
  const rights = useMemo(() => documentRights(permissions), [permissions]);

  const [fromDate, setFromDate] = useState(() => addDays(todayIso(), -PURCHASE_LIST_DEFAULT_DAYS_BACK));
  const [toDate, setToDate] = useState(() => todayIso());
  const [period, setPeriod] = useState<string>(String(PURCHASE_LIST_DEFAULT_DAYS_BACK));
  const [status, setStatus] = useState("");
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [cancelTarget, setCancelTarget] = useState<PurchaseDocKey | null>(null);
  const selectedRow = useRef<MasterTableRow | null>(null);

  const [cancelMutation] = useCancelPurchaseDocumentMutation();

  const statusOf = useCallback((row: MasterTableRow | null) => text(sourceOf(row)[fields.status]).toUpperCase(), [fields.status]);

  /** The whole document key: every purchase table is partitioned by year. */
  const docKeyOf = useCallback(
    (row: MasterTableRow): PurchaseDocKey => {
      const source = sourceOf(row);
      return {
        id: text(source[fields.id]),
        companyId: text(source[fields.company]),
        branchId: text(source[fields.branch]),
        accYear: text(source[fields.accYear]),
        refno: text(source[fields.ref]),
        status: text(source[fields.status]).toUpperCase(),
      };
    },
    [fields],
  );

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

  const listStateResetKey = `${docType}|${companyId}|${branchId}|${accYear}|${fromDate}|${toDate}|${status}`;

  /** Enter / F2: edit a draft; anything else (or no edit right) opens read-only. */
  const openRow = useCallback(
    (row: MasterTableRow) => {
      const policy = purchaseRowPolicy(config, statusOf(row));
      onOpen(docKeyOf(row), policy.canEdit && permissions.canEdit ? "entry" : "browse");
    },
    [config, docKeyOf, onOpen, permissions.canEdit, statusOf],
  );

  const mayCancelRow = useCallback(
    (row: MasterTableRow | null) =>
      Boolean(row) && config.cancel.enabledFor(sourceOf(row)) && rights.mayCancelDocument(statusOf(row) === "POSTED"),
    [config.cancel, rights, statusOf],
  );

  const startCancel = useCallback(() => {
    const row = selectedRow.current;
    if (!row || !mayCancelRow(row)) {
      return;
    }
    setCancelTarget(docKeyOf(row));
  }, [docKeyOf, mayCancelRow]);

  const runCancel = useCallback(
    async (key: PurchaseDocKey, reason: string) => {
      const label = key.refno || key.id;
      try {
        await cancelMutation({
          endpoint: config.cancel.endpoint,
          idKey: config.cancel.idKey,
          id: key.id,
          accYear: key.accYear,
          reason,
        }).unwrap();
        setRefreshNonce((value) => value + 1);
        toast.success(`${label} cancelled.`, { title: "Cancelled" });
      } catch (error) {
        toast.apiError(error);
      }
    },
    [cancelMutation, config.cancel],
  );

  const keys = { onCreate, openRow, startCancel, canCreate: rights.mayStartNew, busy: cancelTarget !== null };
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

  const hintMessage = useCallback(
    (row: MasterTableRow | null) => {
      selectedRow.current = row;
      const policy = purchaseRowPolicy(config, statusOf(row));
      return (
        <>
          <span>F1 add · Enter / F2 edit · Ctrl+Enter view · F3 cancel · F5 refresh</span>
          {row && policy.reason ? <strong className={styles.rowReason}>{policy.reason} Enter opens it read-only.</strong> : null}
        </>
      );
    },
    [config, statusOf],
  );

  const columnRenderOverrides = useMemo(() => {
    const overrides: Record<string, (row: MasterTableRow) => ReactNode> = {};
    for (const column of config.dateColumns) {
      overrides[column] = (row) => isoToDisplayDate(text(sourceOf(row)[column]).slice(0, 10));
    }
    for (const column of config.moneyColumns) {
      overrides[column] = (row) => formatCurrency(num(sourceOf(row)[column]), 2, true);
    }
    overrides[config.fields.status] = (row) => {
      const value = statusOf(row);
      return value ? <span className={cx(styles.listPill, PILL[value] ?? styles.statusDraft)}>{purchaseStatusText(value)}</span> : null;
    };
    return overrides;
  }, [config, statusOf]);

  const statusOptions = useMemo(() => purchaseStatusOptions(config), [config]);
  const idPrefix = `purchase-${docType}`;

  const toolbarContent = useMemo(
    () => (
      <>
        <div className={masterStyles.filterGroup}>
          <label className={masterStyles.filterLabel} htmlFor={`${idPrefix}-from`}>
            From
          </label>
          <DateInput
            id={`${idPrefix}-from`}
            className={styles.filterDate}
            value={fromDate}
            max={toDate || undefined}
            onChange={(value) => {
              setFromDate(value);
              setPeriod("custom");
            }}
          />
        </div>
        <div className={masterStyles.filterGroup}>
          <label className={masterStyles.filterLabel} htmlFor={`${idPrefix}-to`}>
            To
          </label>
          <DateInput
            id={`${idPrefix}-to`}
            className={styles.filterDate}
            value={toDate}
            min={fromDate || undefined}
            onChange={(value) => {
              setToDate(value);
              setPeriod("custom");
            }}
          />
        </div>
        <div className={masterStyles.filterGroup}>
          <label className={masterStyles.filterLabel} htmlFor={`${idPrefix}-period`}>
            Period
          </label>
          <select
            id={`${idPrefix}-period`}
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
          <label className={masterStyles.filterLabel} htmlFor={`${idPrefix}-status`}>
            Status :
          </label>
          <select
            id={`${idPrefix}-status`}
            className={styles.filterSelect}
            value={status}
            onChange={(event) => setStatus(event.target.value)}
          >
            {statusOptions.map((option) => (
              <option key={option.value || "all"} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </>
    ),
    [applyPeriod, fromDate, idPrefix, period, status, statusOptions, toDate],
  );

  const toolbarActions = (row: MasterTableRow | null) => {
    const allowed = mayCancelRow(row);
    return (
      <>
        <span className="erp-ms-tsep" aria-hidden="true" />
        <button
          type="button"
          className={`${masterStyles.iconBtn} ${masterStyles.iconBtnDelete} erp-ms-tbtn`}
          title={allowed ? `${config.cancel.toolTip} (F3)` : row ? "This one cannot be cancelled here." : config.cancel.toolTip}
          disabled={!allowed}
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

  const apiEndpoints = useMemo(
    // The shell's own form never opens here — a purchase document is a voucher —
    // so these only satisfy its contract; nothing is deleted from the list.
    () => ({ getById: config.cancel.endpoint, create: config.cancel.endpoint, delete: config.cancel.endpoint }),
    [config.cancel.endpoint],
  );
  const lookupKeys = useMemo(
    () => ({
      id: [fields.id],
      code: [fields.ref],
      name: [config.nameField],
      short: [config.shortField],
      alias: [config.aliasField],
      active: [fields.status],
      array: ["items", "data", "rows", "results", "list"],
    }),
    [config.aliasField, config.nameField, config.shortField, fields.id, fields.ref, fields.status],
  );
  const requestPayloadKeys = useMemo(
    () => ({ id: fields.id, name: fields.ref, alias: "", short: "", description: "", sort: "" }),
    [fields.id, fields.ref],
  );

  return (
    <>
      <CrudMasterPage
        title={config.title}
        listTitleOverride={config.listTitle}
        listSubtitleOverride={config.listSubtitle}
        entityLabel={config.noun}
        entityLabelPlural={`${config.noun}s`}
        searchPlaceholder={config.searchHint}
        apiEndpoints={apiEndpoints}
        gridKey={config.gridKey}
        lookupKeys={lookupKeys}
        requestPayloadKeys={requestPayloadKeys}
        styles={masterStyles}
        createLabel="Add"
        codeColumnHeader="Ref No"
        nameColumnHeader="Supplier"
        listResponseStyleArrayKey=""
        gridTableName={`purchase_${docType}`}
        useConfiguredGridColumnsOnly
        enableGridSettingsContextMenu
        columnRenderOverrides={columnRenderOverrides}
        toolbarContent={toolbarContent}
        toolbarActions={toolbarActions}
        buildListQuery={buildListQuery}
        listStateResetKey={listStateResetKey}
        listEmptyText={`No ${config.noun} in this window. Widen the dates, or key one.`}
        listHintMessage={hintMessage}
        rowClassName={(row) => (statusOf(row) === "CANCELLED" ? styles.cancelledRow : undefined)}
        onCreateAction={onCreate}
        onEditAction={openRow}
        onViewAction={(row) => onOpen(docKeyOf(row), "browse")}
        isRowDeleteDisabled={() => true}
        rowDeleteDisabledReason="A purchase document is never deleted — a posted one is cancelled (F3)."
        auditHistory={{
          screenName: config.title,
          getRecordId: (row) => text(sourceOf(row)[fields.id]) || null,
          getDisplayName: (row) => text(sourceOf(row)[fields.ref]) || null,
        }}
      />
      {cancelTarget ? (
        <ReasonDialog
          title={`Cancel ${cancelTarget.refno || cancelTarget.id}`}
          message={config.cancel.question}
          placeholder="Type the reason"
          onCancel={() => setCancelTarget(null)}
          onConfirm={(reason) => {
            const key = cancelTarget;
            setCancelTarget(null);
            void runCancel(key, reason);
          }}
        />
      ) : null}
    </>
  );
}
