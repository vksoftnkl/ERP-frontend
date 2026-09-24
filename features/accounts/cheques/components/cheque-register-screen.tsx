"use client";

/**
 * The cheque register — one screen, handed its words.
 *
 * Received Cheques (menu 51) mounts it with the received vocabulary; Issued
 * Cheques (menu 52) will mount it with the issued one. Nothing below knows
 * which: the state machine, the rows and the action specs are the table's.
 *
 * There is no document here — no draft, no save, no number. Every action is
 * ONE server transition on one `acc_pdc_register` row (or a batch, for a
 * deposit). This file is wiring: what is selected, what may be done to it,
 * which dialog is up, and what to re-read afterwards.
 *
 * ── Scope ────────────────────────────────────────────────────────────────
 * Company, branch and year are captured ONCE, when the screen opens. A branch
 * switched in another window mid-session must not make this screen's next
 * read disagree with the rows it is showing. The ACTIONS use each row's own
 * four keys, always.
 *
 * ── The target set ───────────────────────────────────────────────────────
 * The ticked rows if any are ticked, otherwise the current row. Ticks are
 * keyed by id, survive paging, and are cleared whenever the filters change
 * and after every action.
 *
 * ── Async ────────────────────────────────────────────────────────────────
 * Every read goes through RTK Query and is read as `currentData` — the data
 * for the CURRENT arguments only — so a late reply for a row the cursor has
 * left, or a filter the operator has changed, is never painted.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { skipToken } from "@reduxjs/toolkit/query";
import { useBusinessContext } from "@/components/layout/business-context";
import { usePagePermissions } from "@/hooks/useMenuPermissions";
import { confirm } from "@/lib/confirm";
import { useGridId } from "@/lib/configured-grids";
import { toast } from "@/lib/notify";
import { todayIso } from "@/features/sales/quotation/quotation.utils";
import { useGetEffectiveSettingsQuery } from "@/store/api/appSettingsApi";
import {
  chequesApi,
  useGetChequeQuery,
  useGetChequeRegisterQuery,
  useGetChequeSummaryQuery,
} from "@/store/api/chequesApi";
import { useGetGridColumnsQuery } from "@/store/api/metadataApi";
import { useAppDispatch } from "@/store/hooks";
import { ACTION_SPECS, type WritingVerb } from "../actions";
import { parseBounceReasons } from "../actions/bounce";
import type { SlipForm } from "../actions/deposit";
import { chequeError } from "../api-errors";
import { describe, fromGridRow, keysOf } from "../domain/chequeRow";
import { defaultDateRange } from "../domain/dates";
import {
  defaultFilters,
  filterSignature,
  gridParams,
  type ChequeFilters,
} from "../domain/filters";
import {
  EMPTY_TICKS,
  refreshTicks,
  targetRows,
  toggleTick,
  togglePage,
  type TickSet,
} from "../domain/selection";
import {
  allowedForTargets,
  explainBar,
  WRITING_VERBS,
  type ChequeVerb,
} from "../domain/stateMachine";
import type {
  ChequeActionResult,
  ChequeDetail,
  ChequeRow,
  ChequeScope,
  DepositSlipKey,
} from "../domain/types";
import type { ChequeVocabulary } from "../domain/vocabulary";
import { bindingFor, isReservedKey } from "../keys";
import { ActionBar } from "./action-bar";
import { ActionDialog } from "./action-dialog";
import { DepositSlipDialog } from "./deposit-slip-dialog";
import { DetailStrip } from "./detail-strip";
import { FilterBar } from "./filter-bar";
import { HistoryDialog } from "./history-dialog";
import { Register, resolveColumns } from "./register";
import { SummaryTiles } from "./summary-tiles";
import styles from "../cheques.module.scss";

/** The configured-grid runner caps `limit` at 100. */
const PAGE_SIZE = 50;
const BOUNCE_REASONS_SETTING = "accounts.bounce_reasons";

type OpenDialog =
  | { kind: "action"; verb: WritingVerb; rows: ChequeRow[]; detail: ChequeDetail | null; serial: number }
  | { kind: "history"; row: ChequeRow }
  | { kind: "slip"; key: DepositSlipKey };

/** Page numbers to offer: the first, the last, and a window round the current. */
function pageList(page: number, pageCount: number): (number | "gap")[] {
  const pages = new Set<number>([1, pageCount]);
  for (let p = page - 2; p <= page + 2; p += 1) {
    if (p >= 1 && p <= pageCount) {
      pages.add(p);
    }
  }
  const sorted = Array.from(pages).sort((a, b) => a - b);
  const out: (number | "gap")[] = [];
  sorted.forEach((p, index) => {
    if (index > 0 && p - sorted[index - 1] > 1) {
      out.push("gap");
    }
    out.push(p);
  });
  return out;
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  const tag = target.tagName;
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    tag === "BUTTON" ||
    target.isContentEditable
  );
}

export type ChequeRegisterScreenProps = {
  words: ChequeVocabulary;
};

export function ChequeRegisterScreen({ words }: ChequeRegisterScreenProps) {
  const router = useRouter();
  const dispatch = useAppDispatch();
  const { activeCompany, activeBranch, activeFiscalYear } = useBusinessContext();

  // ── Scope, captured once ──────────────────────────────────────────────────
  const live: ChequeScope = {
    companyId: activeCompany?.id ?? "",
    branchId: activeBranch?.id ?? "",
    accYear: (activeFiscalYear?.name ?? "").trim(),
  };
  const [opened, setOpened] = useState<{ scope: ChequeScope; filters: ChequeFilters } | null>(
    null,
  );
  const fiscalBegin = activeFiscalYear?.beginDate ?? null;
  const fiscalEnd = activeFiscalYear?.endDate ?? null;
  // Captured the first render the business context is complete — during
  // render, not in an effect, so the first paint already has its filters.
  if (!opened && live.companyId && live.branchId && live.accYear) {
    const range = defaultDateRange(live.accYear, fiscalBegin, fiscalEnd);
    setOpened({ scope: { ...live }, filters: defaultFilters(range) });
  }
  const scope = opened?.scope ?? null;
  const scopeMoved =
    scope !== null &&
    Boolean(live.companyId) &&
    (live.companyId !== scope.companyId ||
      live.branchId !== scope.branchId ||
      live.accYear !== scope.accYear);

  // The session's working date. There is no separate app date in this client
  // — the transaction screens all take today's — so this is the one place to
  // change if one is introduced. The server compares against ITS today, and
  // is the authority near midnight.
  const today = todayIso();

  // ── Permissions: unloaded is not denied ───────────────────────────────────
  const { permissions, isLoading: permissionsLoading } = usePagePermissions({
    menuId: words.menuId,
  });
  const canEdit = !permissionsLoading && permissions.canEdit;
  const canPrint = !permissionsLoading && permissions.canPrint;

  // ── Settings ──────────────────────────────────────────────────────────────
  const { data: settings } = useGetEffectiveSettingsQuery(
    scope ? { companyId: scope.companyId, branchId: scope.branchId } : skipToken,
  );
  const bounceReasons = useMemo(() => {
    const row = settings?.find((candidate) => candidate.asdKey === BOUNCE_REASONS_SETTING);
    return parseBounceReasons(row ? (row.value ?? row.asdDefaultValue ?? null) : null);
  }, [settings]);

  // ── Filters, page, ticks, current row ─────────────────────────────────────
  const filters = opened?.filters ?? null;
  const [page, setPage] = useState(1);
  const [heldTicks, setTicks] = useState<TickSet>(EMPTY_TICKS);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [statusLine, setStatusLine] = useState("");

  const updateFilters = (patch: Partial<ChequeFilters>) => {
    if (!opened) {
      return;
    }
    const next = { ...opened.filters, ...patch };
    if (filterSignature(next) !== filterSignature(opened.filters)) {
      // A ticked row a filter has hidden must never be acted on unseen.
      setTicks(EMPTY_TICKS);
      setPage(1);
    }
    setOpened({ ...opened, filters: next });
  };

  const clearFilters = () => {
    if (scope) {
      updateFilters(defaultFilters(defaultDateRange(scope.accYear, fiscalBegin, fiscalEnd)));
    }
  };

  // ── The register (grid 109) ───────────────────────────────────────────────
  const gridId = useGridId("receivedChequeList");
  const { data: columnConfig } = useGetGridColumnsQuery(
    { gridId: Number(gridId) },
    { skip: !gridId },
  );
  const columns = useMemo(() => resolveColumns(columnConfig), [columnConfig]);

  const registerArgs = useMemo(
    () =>
      scope && filters ? { params: gridParams(filters, scope), page, limit: PAGE_SIZE } : skipToken,
    [filters, page, scope],
  );
  const register = useGetChequeRegisterQuery(registerArgs, { refetchOnMountOrArgChange: true });
  const rawRows = useMemo(() => register.currentData?.items ?? [], [register.currentData]);
  const rows = useMemo(() => rawRows.map(fromGridRow), [rawRows]);
  const total = register.currentData?.meta?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const registerError = register.error ? chequeError(register.error) : null;

  // A tick carries the row as it was read; a fresh read of its page
  // supersedes it, so a tick never acts on a status the register no longer
  // shows.
  const ticks = useMemo(() => refreshTicks(heldTicks, rows), [heldTicks, rows]);

  // The current row is DERIVED from its key, never from an index — so a
  // reload that moves rows around cannot land the cursor on another cheque.
  const currentRow = useMemo(
    () => rows.find((row) => row.apdId === currentId) ?? rows[0] ?? null,
    [currentId, rows],
  );

  // ── The current row's detail ──────────────────────────────────────────────
  const detailQuery = useGetChequeQuery(currentRow ? keysOf(currentRow) : skipToken, {
    refetchOnMountOrArgChange: true,
  });
  // `currentData` is the reply for THIS row only; the extra id check guards
  // against anything that ever serves a stale entry.
  const detail =
    detailQuery.currentData && currentRow && detailQuery.currentData.cheque.apdId === currentRow.apdId
      ? detailQuery.currentData
      : null;
  // Re-derive after every reload of the register, not only when the key
  // moves: a row whose status changed under the cursor needs its detail
  // re-read, or the strip describes a cheque that no longer exists.
  const registerStamp = register.fulfilledTimeStamp;
  const lastStamp = useRef<number | undefined>(undefined);
  const refetchDetail = detailQuery.refetch;
  const detailStarted = !detailQuery.isUninitialized;
  useEffect(() => {
    if (registerStamp === lastStamp.current) {
      return;
    }
    const first = lastStamp.current === undefined;
    lastStamp.current = registerStamp;
    if (!first && detailStarted) {
      void refetchDetail();
    }
  }, [detailStarted, refetchDetail, registerStamp]);

  // ── The tiles ─────────────────────────────────────────────────────────────
  const summary = useGetChequeSummaryQuery(scope ?? skipToken, {
    refetchOnMountOrArgChange: true,
  });

  // ── What may be done ──────────────────────────────────────────────────────
  const targets = useMemo(() => targetRows(ticks, currentRow), [currentRow, ticks]);
  const allowed = useMemo(() => allowedForTargets(targets.map((row) => row.status)), [targets]);
  const [lastDeposit, setLastDeposit] = useState<DepositSlipKey | null>(null);

  const permitted = useCallback(
    (verb: ChequeVerb) => {
      if (WRITING_VERBS.includes(verb)) {
        return canEdit;
      }
      if (verb === "printSlip") {
        return canPrint;
      }
      return true; // History only reads.
    },
    [canEdit, canPrint],
  );

  const enabled = useCallback(
    (verb: ChequeVerb) => {
      if (!permitted(verb)) {
        return false;
      }
      if (verb === "printSlip") {
        // The slip just deposited stays printable after its rows have left a
        // Held-only register.
        return allowed.includes("printSlip") || (lastDeposit !== null && ticks.size === 0);
      }
      return allowed.includes(verb);
    },
    [allowed, lastDeposit, permitted, ticks.size],
  );

  const description = useMemo(() => {
    if (targets.length === 0) {
      return "";
    }
    if (ticks.size > 0) {
      const sum = targets.reduce((acc, row) => acc + Math.round(row.amount * 100), 0) / 100;
      return `${ticks.size} ticked — ${sum.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }
    return describe(targets[0]);
  }, [targets, ticks.size]);

  const barLine = explainBar(
    targets.map((row) => row.status),
    { canEdit: permissions.canEdit, canPrint: permissions.canPrint, loading: permissionsLoading },
    description,
  );

  // ── Dialogs ───────────────────────────────────────────────────────────────
  const [dialog, setDialog] = useState<OpenDialog | null>(null);
  const dialogSerial = useRef(0);

  /** The target's detail — only when the target IS the row the detail is for. */
  const detailFor = useCallback(
    (rowsFor: readonly ChequeRow[]) =>
      rowsFor.length === 1 && detail && detail.cheque.apdId === rowsFor[0].apdId ? detail : null,
    [detail],
  );

  const reloadAll = useCallback(() => {
    if (!register.isUninitialized) {
      void register.refetch();
    }
    if (!summary.isUninitialized) {
      void summary.refetch();
    }
    if (!detailQuery.isUninitialized) {
      void detailQuery.refetch();
    }
  }, [detailQuery, register, summary]);

  const slipOf = useCallback(
    (row: ChequeRow): DepositSlipKey | string => {
      if (!row.depositSlipNo || !row.depositDate) {
        return `Cheque ${row.instrumentNo} has no deposit slip.`;
      }
      // The grid row carries the bank's NAME only. The detail knows the ledger
      // it actually went into — deposit overwrites that column — so it is
      // preferred over asking the operator to pick the bank.
      const bankLedgerId =
        (detail && detail.cheque.apdId === row.apdId ? detail.cheque.apdBankLedgerId : null) ??
        (opened?.filters.bankLedgerId || null);
      if (!bankLedgerId) {
        return "This cheque's detail has not loaded, so its bank is not known — pick the bank in the filter bar, or wait a moment.";
      }
      return {
        companyId: row.companyId,
        branchId: row.branchId,
        bankLedgerId,
        depositDate: row.depositDate,
        slipNo: row.depositSlipNo,
      };
    },
    [detail, opened?.filters.bankLedgerId],
  );

  const openReceipt = useCallback(
    async (row: ChequeRow) => {
      let snapshot = detail && detail.cheque.apdId === row.apdId ? detail : null;
      if (!snapshot) {
        try {
          snapshot = await dispatch(
            chequesApi.endpoints.getCheque.initiate(keysOf(row), {
              subscribe: false,
              forceRefetch: true,
            }),
          ).unwrap();
        } catch (error) {
          toast.error(chequeError(error));
          return;
        }
      }
      const voucher = snapshot?.receiptVoucher;
      if (!voucher) {
        toast.info(
          "This cheque is not linked to a receipt. A row written by a replacement carries its own re-issue voucher instead.",
        );
        return;
      }
      // The receipt's OWN scope: a cheque's receipt is written in the cheque's
      // company and branch, and the voucher carries its year. Never the
      // session's — that is wrong for a cheque from another branch.
      const path = [row.companyId, row.branchId, voucher.accYear, voucher.voucherId]
        .map(encodeURIComponent)
        .join("/");
      router.push(`/accounts/receipt/${path}`);
    },
    [detail, dispatch, router],
  );

  const runVerb = useCallback(
    (verb: ChequeVerb) => {
      if (!enabled(verb)) {
        return;
      }
      if (verb === "history") {
        if (targets.length === 1) {
          setDialog({ kind: "history", row: targets[0] });
        }
        return;
      }
      if (verb === "printSlip") {
        const single = targets.length === 1 && allowed.includes("printSlip") ? targets[0] : null;
        if (single) {
          const key = slipOf(single);
          if (typeof key === "string") {
            toast.info(key);
            return;
          }
          setDialog({ kind: "slip", key });
          return;
        }
        if (lastDeposit) {
          setDialog({ kind: "slip", key: lastDeposit });
        }
        return;
      }
      dialogSerial.current += 1;
      setDialog({
        kind: "action",
        verb,
        rows: [...targets],
        detail: detailFor(targets),
        serial: dialogSerial.current,
      });
    },
    [allowed, detailFor, enabled, lastDeposit, slipOf, targets],
  );

  const onActionDone = useCallback(
    (verb: WritingVerb) =>
      (result: ChequeActionResult, actedOn: readonly ChequeRow[], form: unknown) => {
        setStatusLine(result.message || "Done.");
        setDialog(null);
        setTicks(EMPTY_TICKS);
        reloadAll();
        if (verb !== "deposit") {
          return;
        }
        const slipForm = form as SlipForm;
        const head = actedOn[0];
        const slip: DepositSlipKey = {
          companyId: head?.companyId ?? "",
          branchId: head?.branchId ?? "",
          bankLedgerId: result.data.slip?.bankLedgerId ?? slipForm.bankLedgerId,
          depositDate: result.data.slip?.depositDate ?? slipForm.depositDate,
          slipNo: result.data.slip?.slipNo ?? slipForm.slipNo.trim(),
        };
        setLastDeposit(slip);
        if (!canPrint) {
          return;
        }
        void confirm({
          title: "Deposit slip",
          message: `Show deposit slip ${slip.slipNo} now?`,
          note: "It can be shown again with F6.",
          confirmLabel: "Show slip",
          cancelLabel: "Not now",
          iconVariant: "replace",
        }).then((yes) => {
          if (yes) {
            setDialog({ kind: "slip", key: slip });
          }
        });
      },
    [canPrint, reloadAll],
  );

  const closeScreen = useCallback(() => {
    router.back();
  }, [router]);

  // ── Keys ──────────────────────────────────────────────────────────────────
  const keyState = { dialog, runVerb, currentRow, openReceipt, closeScreen };
  const keyRef = useRef(keyState);
  useEffect(() => {
    keyRef.current = keyState;
  });

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const state = keyRef.current;
      // The browser's F5 / F3 / F6 / F7 / Ctrl+H are swallowed whatever is
      // open — an operator reaching for Deposit must not reload the page.
      if (isReservedKey(event)) {
        event.preventDefault();
      }
      if (state.dialog) {
        return;
      }
      const binding = bindingFor(event);
      if (binding) {
        state.runVerb(binding.verb);
        return;
      }
      if (event.key === "Enter" && !event.ctrlKey && !event.altKey) {
        // Enter on a row — the register, or nothing focused. Never out of a
        // box, a button or a dropdown, which own their own Enter.
        if (!isTypingTarget(event.target) && state.currentRow) {
          event.preventDefault();
          void state.openReceipt(state.currentRow);
        }
        return;
      }
      if (event.key === "Escape") {
        const target = event.target as HTMLElement | null;
        // An open dropdown list owns Escape.
        if (event.defaultPrevented || target?.getAttribute?.("aria-expanded") === "true") {
          return;
        }
        state.closeScreen();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  // ── Render ────────────────────────────────────────────────────────────────
  const actionDialog = dialog?.kind === "action" ? dialog : null;

  return (
    <div className={styles.page}>
      <header className={styles.titleBar}>
        <div>
          <h1 className={styles.title}>{words.title}</h1>
          <p className={styles.subtitle}>{words.subtitle}</p>
        </div>
        <div className={styles.titleRight}>
          {scopeMoved ? (
            <span
              className={styles.scopeNotice}
              title="This screen keeps the company, branch and year it was opened with. Close and reopen it to follow the header."
            >
              Opened for {scope?.accYear} — reopen to follow the header
            </span>
          ) : null}
          {statusLine ? (
            <span className={styles.statusLine} title={statusLine} role="status">
              {statusLine}
            </span>
          ) : null}
        </div>
      </header>

      <SummaryTiles summary={summary.currentData} failed={Boolean(summary.error)} />

      {filters ? (
        <FilterBar filters={filters} onChange={updateFilters} onClear={clearFilters} />
      ) : null}

      <section className={styles.registerShell}>
        <Register
          columns={columns}
          rows={rows}
          rawRows={rawRows}
          ticks={ticks}
          currentId={currentRow?.apdId ?? null}
          loading={!scope || register.isFetching}
          error={registerError}
          emptyText={words.emptyText}
          onCurrent={setCurrentId}
          onToggle={(row) => setTicks(toggleTick(ticks, row))}
          onTogglePage={() => setTicks(togglePage(ticks, rows))}
          onOpen={(row) => void openReceipt(row)}
        />
        <div className={styles.pager}>
          <span>
            {total > 0
              ? `Showing ${(page - 1) * PAGE_SIZE + 1}–${Math.min(page * PAGE_SIZE, total)} of ${total}`
              : register.isFetching
                ? "Reading…"
                : "No rows"}
            {ticks.size > 0 ? ` · ${ticks.size} ticked` : ""}
          </span>
          {pageCount > 1 ? (
            <span className={styles.pageButtons}>
              <button
                type="button"
                className={styles.pageButton}
                disabled={page <= 1}
                onClick={() => setPage((current) => Math.max(1, current - 1))}
                aria-label="Previous page"
              >
                ‹
              </button>
              {pageList(page, pageCount).map((entry, index) =>
                entry === "gap" ? (
                  <span key={`gap-${index}`}>…</span>
                ) : (
                  <button
                    key={entry}
                    type="button"
                    className={`${styles.pageButton} ${entry === page ? styles.pageButtonActive : ""}`}
                    onClick={() => setPage(entry)}
                  >
                    {entry}
                  </button>
                ),
              )}
              <button
                type="button"
                className={styles.pageButton}
                disabled={page >= pageCount}
                onClick={() => setPage((current) => Math.min(pageCount, current + 1))}
                aria-label="Next page"
              >
                ›
              </button>
            </span>
          ) : null}
        </div>
      </section>

      <DetailStrip
        row={currentRow}
        detail={detail}
        loading={detailQuery.isFetching}
        failed={Boolean(detailQuery.error)}
        tickedCount={ticks.size}
      />

      <ActionBar
        words={words}
        enabled={enabled}
        onAction={runVerb}
        line={barLine}
        onClose={closeScreen}
        onReload={reloadAll}
      />

      {actionDialog ? (
        <ActionDialog
          // A fresh mount per opening: the form is built from `initial` then.
          key={actionDialog.serial}
          spec={ACTION_SPECS[actionDialog.verb]}
          rows={actionDialog.rows}
          words={words}
          today={today}
          detail={actionDialog.detail}
          bounceReasons={bounceReasons}
          onClose={() => setDialog(null)}
          onDone={onActionDone(actionDialog.verb)}
        />
      ) : null}
      {dialog?.kind === "history" ? (
        <HistoryDialog row={dialog.row} onClose={() => setDialog(null)} />
      ) : null}
      {dialog?.kind === "slip" ? (
        <DepositSlipDialog slipKey={dialog.key} onClose={() => setDialog(null)} />
      ) : null}
    </div>
  );
}
