"use client";

/**
 * Issued Cheques — menu 52. The cheques WE wrote, on Bill-wise Payments and
 * Payment Vouchers, and what has become of each one.
 *
 * The received register's layout (tiles, filters, the register, its detail
 * strip, an action bar with one "why" line), over its own server module:
 *
 *  - five SINGLE-cheque verbs — Presented, Returned unpaid, Stop, Void,
 *    Replace — and no ticks, because nothing here moves in a batch;
 *  - every route keyed by the row's BARE `companyId` / `branchId`;
 *  - tiles summed on the client (there is no summary route for this side);
 *  - Enter opens the payment the cheque was written on;
 *  - "Cheque books" opens the books master (menu 263) over the register.
 *
 * ── Rights ───────────────────────────────────────────────────────────────
 * The server judges Presented on menu 52's POST right, the reversals on
 * CANCEL and Replace on AMEND (plus posting on menu 261). This client's menu
 * rights carry none of the three, so — as on the Qt screen — the buttons
 * follow the cheque's STATUS, and a refusal comes back as the server's own
 * sentence ("This user may not … on Issued Cheques (menu 52)").
 *
 * ── After an action ──────────────────────────────────────────────────────
 * The register, the tiles and the detail are re-read 1.1 s later: the grid
 * runner caches a URL for a moment, and an immediate re-read showed a
 * presented cheque still not presented.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { skipToken } from "@reduxjs/toolkit/query";
import { useBusinessContext } from "@/components/layout/business-context";
import { useGridId } from "@/lib/configured-grids";
import { toast } from "@/lib/notify";
import { todayIso } from "@/features/sales/quotation/quotation.utils";
import { useGetGridColumnsQuery } from "@/store/api/metadataApi";
import { useConfiguredGridSettings } from "@/components/master/use-configured-grid-settings";
import { paymentApi } from "@/store/api/paymentApi";
import {
  issuedChequesApi,
  useGetChequeBookListQuery,
  useGetIssuedChequeQuery,
  useGetIssuedRegisterQuery,
  useGetIssuedSummaryRowsQuery,
} from "@/store/api/issuedChequesApi";
import { useAppDispatch } from "@/store/hooks";
import type { ChequeBook } from "@/features/accounts/payment/payment.types";
import { chequeError } from "../api-errors";
import { ChequeBooksDialog } from "../books/cheque-books-dialog";
import { ISSUED_ACTION_SPECS } from "./actions/specs";
import { IssuedActionDialog } from "./components/issued-action-dialog";
import { IssuedDetailStrip } from "./components/issued-detail-strip";
import { IssuedFilterBar } from "./components/issued-filter-bar";
import { IssuedHistoryDialog } from "./components/issued-history-dialog";
import { IssuedRegister, resolveIssuedColumns } from "./components/issued-register";
import { IssuedSummaryTiles } from "./components/issued-summary-tiles";
import {
  defaultIssuedFilters,
  issuedDateRange,
  issuedFilterSignature,
  issuedGridParams,
  issuedSummaryParams,
  type IssuedFilters,
} from "./domain/filters";
import {
  ISSUED_WRITING_VERBS,
  issuedAllowedFor,
  issuedWhyOnlyLooking,
  type IssuedVerb,
  type IssuedWritingVerb,
} from "./domain/machine";
import { describeIssued, fromBookGridRow, fromIssuedGridRow, issuedKeysOf } from "./domain/row";
import { summariseIssued, summariseLeaves } from "./domain/summary";
import type {
  IssuedActionResult,
  IssuedChequePayload,
  IssuedChequeRow,
  IssuedScope,
} from "./issued.types";
import { ISSUED_KEY_TABLE, isIssuedReservedKey, issuedBindingFor, issuedButtonText } from "./keys";
import styles from "../cheques.module.scss";

/** Menu 52, "Issued Cheques". */
export const ISSUED_CHEQUES_MENU_ID = 52;

/** The configured-grid runner caps `limit` at 100. */
const PAGE_SIZE = 50;
/** The grid runner caches a URL briefly; re-read after it has let go. */
const RELOAD_DELAY_MS = 1100;

type OpenDialog =
  | { kind: "action"; verb: IssuedWritingVerb; row: IssuedChequeRow; books: ChequeBook[]; serial: number }
  | { kind: "history"; row: IssuedChequeRow }
  | { kind: "books" };

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

/** A 403 is the server's own sentence about rights; anything else is one generic line. */
function detailErrorLine(error: unknown): string | null {
  if (!error) {
    return null;
  }
  const status = (error as { status?: unknown }).status;
  return status === 403 ? chequeError(error) : "could not load this cheque's detail";
}

export default function IssuedChequesScreen() {
  const router = useRouter();
  const dispatch = useAppDispatch();
  const { activeCompany, activeBranch, activeFiscalYear } = useBusinessContext();

  // ── Scope, captured once ──────────────────────────────────────────────────
  const live: IssuedScope = {
    companyId: activeCompany?.id ?? "",
    branchId: activeBranch?.id ?? "",
    accYear: (activeFiscalYear?.name ?? "").trim(),
  };
  const fiscalBegin = activeFiscalYear?.beginDate ?? null;
  const fiscalEnd = activeFiscalYear?.endDate ?? null;
  const [opened, setOpened] = useState<{ scope: IssuedScope; filters: IssuedFilters } | null>(null);
  if (!opened && live.companyId && live.branchId && live.accYear) {
    setOpened({
      scope: { ...live },
      filters: defaultIssuedFilters(issuedDateRange(live.accYear, fiscalBegin, fiscalEnd)),
    });
  }
  const scope = opened?.scope ?? null;
  const filters = opened?.filters ?? null;
  const scopeMoved =
    scope !== null &&
    Boolean(live.companyId) &&
    (live.companyId !== scope.companyId ||
      live.branchId !== scope.branchId ||
      live.accYear !== scope.accYear);

  const today = todayIso();

  // ── Filters, page, current row ────────────────────────────────────────────
  const [page, setPage] = useState(1);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [statusLine, setStatusLine] = useState("");

  const updateFilters = (patch: Partial<IssuedFilters>) => {
    if (!opened) {
      return;
    }
    const next = { ...opened.filters, ...patch };
    if (issuedFilterSignature(next) !== issuedFilterSignature(opened.filters)) {
      setPage(1);
    }
    setOpened({ ...opened, filters: next });
  };

  const resetFilters = () => {
    if (scope) {
      updateFilters(defaultIssuedFilters(issuedDateRange(scope.accYear, fiscalBegin, fiscalEnd)));
    }
  };

  // ── The register (grid 121) ───────────────────────────────────────────────
  const gridId = useGridId("issuedChequeList");
  const { data: columnConfig } = useGetGridColumnsQuery({ gridId: Number(gridId) }, { skip: !gridId });
  const columns = useMemo(() => resolveIssuedColumns(columnConfig), [columnConfig]);
  // Right-click on the register: the master tables' grid settings (filter, visibility, Admin).
  const gridSettings = useConfiguredGridSettings({ gridId, columns: columnConfig });

  const registerArgs = useMemo(
    () =>
      scope && filters
        ? { params: issuedGridParams(filters, scope), page, limit: PAGE_SIZE }
        : skipToken,
    [filters, page, scope],
  );
  const register = useGetIssuedRegisterQuery(registerArgs, { refetchOnMountOrArgChange: true });
  const rawRows = useMemo(() => register.currentData?.items ?? [], [register.currentData]);
  const rows = useMemo(() => rawRows.map(fromIssuedGridRow), [rawRows]);
  const total = register.currentData?.meta?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const registerError = register.error ? chequeError(register.error) : null;

  const currentRow = useMemo(
    () => rows.find((row) => row.apdId === currentId) ?? rows[0] ?? null,
    [currentId, rows],
  );

  // ── The current row's detail ──────────────────────────────────────────────
  const detailQuery = useGetIssuedChequeQuery(currentRow ? issuedKeysOf(currentRow) : skipToken, {
    refetchOnMountOrArgChange: true,
  });
  const detail: IssuedChequePayload | null =
    detailQuery.currentData && currentRow && detailQuery.currentData.apdId === currentRow.apdId
      ? detailQuery.currentData
      : null;

  // ── The tiles ─────────────────────────────────────────────────────────────
  const summaryRows = useGetIssuedSummaryRowsQuery(
    scope && filters ? issuedSummaryParams(filters, scope) : skipToken,
    { refetchOnMountOrArgChange: true },
  );
  const summary = useMemo(
    () =>
      summaryRows.currentData
        ? summariseIssued(summaryRows.currentData.rows.map(fromIssuedGridRow), summaryRows.currentData.truncated)
        : null,
    [summaryRows.currentData],
  );
  const activeBooks = useGetChequeBookListQuery(
    scope && filters
      ? {
          params: {
            icompany_id: scope.companyId,
            ibank_ledger_id: filters.bankLedgerId.trim(),
            istatus: "ACTIVE",
          },
          page: 1,
          limit: 100,
        }
      : skipToken,
    { refetchOnMountOrArgChange: true },
  );
  const leaves = useMemo(
    () =>
      activeBooks.currentData
        ? summariseLeaves((activeBooks.currentData.items ?? []).map(fromBookGridRow))
        : null,
    [activeBooks.currentData],
  );

  // ── What may be done ──────────────────────────────────────────────────────
  const allowed = useMemo(
    () => (currentRow ? issuedAllowedFor(currentRow.status, detail) : []),
    [currentRow, detail],
  );
  const why = currentRow ? issuedWhyOnlyLooking(currentRow.status, detail) : null;
  const barLine = !currentRow
    ? { text: "no row selected", reason: false }
    : why
      ? { text: `${why}  ·  ${describeIssued(currentRow)}`, reason: true }
      : { text: describeIssued(currentRow), reason: false };

  const [dialog, setDialog] = useState<OpenDialog | null>(null);
  const dialogSerial = useRef(0);

  // ── Re-reading ────────────────────────────────────────────────────────────
  const reloadTimer = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (reloadTimer.current !== null) {
        window.clearTimeout(reloadTimer.current);
      }
    },
    [],
  );
  const reloadAll = useCallback(() => {
    if (!register.isUninitialized) {
      void register.refetch();
    }
    if (!summaryRows.isUninitialized) {
      void summaryRows.refetch();
    }
    if (!activeBooks.isUninitialized) {
      void activeBooks.refetch();
    }
    if (!detailQuery.isUninitialized) {
      void detailQuery.refetch();
    }
  }, [activeBooks, detailQuery, register, summaryRows]);
  const reloadSoon = useCallback(() => {
    if (reloadTimer.current !== null) {
      window.clearTimeout(reloadTimer.current);
    }
    reloadTimer.current = window.setTimeout(() => {
      reloadTimer.current = null;
      reloadAll();
    }, RELOAD_DELAY_MS);
  }, [reloadAll]);

  // ── The verbs ─────────────────────────────────────────────────────────────
  const openVoucher = useCallback(
    async (row: IssuedChequeRow) => {
      let snapshot = detail && detail.apdId === row.apdId ? detail : null;
      if (!snapshot) {
        try {
          snapshot = await dispatch(
            issuedChequesApi.endpoints.getIssuedCheque.initiate(issuedKeysOf(row), {
              subscribe: false,
              forceRefetch: true,
            }),
          ).unwrap();
        } catch (error) {
          toast.error(chequeError(error));
          return;
        }
      }
      const voucherId = snapshot.paymentVoucherId ?? snapshot.voucherId;
      if (!voucherId) {
        toast.info("This cheque is not linked to a voucher.");
        return;
      }
      const typeCode = (snapshot.typeCode ?? row.typeCode ?? "").trim();
      if (typeCode === "Pmt") {
        // The PAYMENT's own keys. The server sends no year with the parent
        // voucher; the cheque was written when the payment posted, so the
        // cheque's own year (`apd_acc_year`) IS the payment's — not the year
        // of a post-dated cheque's child voucher, which the Qt screen used.
        const path = [row.companyId, row.branchId, row.accYear, voucherId]
          .map(encodeURIComponent)
          .join("/");
        router.push(`/accounts/payment/${path}`);
        return;
      }
      if (typeCode === "PmtV") {
        // The voucher that CARRIES the cheque, by its exact keys: today's
        // payment, or a post-dated cheque's own voucher — whose year may not
        // be the payment's, and which links back to it ("Open original").
        const carrierId = snapshot.voucherId ?? voucherId;
        const path = [row.companyId, row.branchId, snapshot.voucherAccYear ?? row.accYear, carrierId]
          .map(encodeURIComponent)
          .join("/");
        router.push(`/accounts/payment-voucher/${path}`);
        return;
      }
      toast.info(
        `This cheque was written on a ${typeCode || "voucher of an unknown type"}, which has no screen to open it in.`,
      );
    },
    [detail, dispatch, router],
  );

  const runVerb = useCallback(
    async (verb: IssuedVerb) => {
      const row = currentRow;
      if (!row) {
        return;
      }
      if (verb === "openVoucher") {
        await openVoucher(row);
        return;
      }
      if (!allowed.includes(verb)) {
        return;
      }
      if (verb === "history") {
        setDialog({ kind: "history", row });
        return;
      }
      if (!(ISSUED_WRITING_VERBS as readonly string[]).includes(verb)) {
        return;
      }
      let books: ChequeBook[] = [];
      if (verb === "replace") {
        // The new leaf comes from a book on THIS cheque's branch (or one kept
        // for every branch). With none open there is nothing to write on.
        try {
          const payload = await dispatch(
            paymentApi.endpoints.getOpenChequeBooks.initiate(
              { companyId: row.companyId, branchId: row.branchId },
              { subscribe: false, forceRefetch: true },
            ),
          ).unwrap();
          books = payload.books ?? [];
        } catch (error) {
          toast.error(chequeError(error));
          return;
        }
        if (books.length === 0) {
          toast.warn(
            "There is no active cheque book to write the new cheque from. Open one from Cheque books first.",
          );
          return;
        }
      }
      dialogSerial.current += 1;
      setDialog({
        kind: "action",
        verb: verb as IssuedWritingVerb,
        row,
        books,
        serial: dialogSerial.current,
      });
    },
    [allowed, currentRow, dispatch, openVoucher],
  );

  const onActionDone =
    (verb: IssuedWritingVerb, actedOn: IssuedChequeRow) => (result: IssuedActionResult) => {
      setDialog(null);
      setStatusLine(result.message || "Done.");
      if (verb === "replace") {
        const replacement = result.data.replacement;
        if (replacement?.apdId) {
          // The new leaf is the cheque the operator now holds: put the cursor
          // on it, make sure Not presented is shown, and follow it through a
          // search that named the old leaf.
          setCurrentId(replacement.apdId);
          setPage(1);
          setOpened((current) => {
            if (!current) {
              return current;
            }
            const ticks = current.filters.ticks.includes("HELD")
              ? current.filters.ticks
              : [...current.filters.ticks, "HELD" as const];
            const search = current.filters.search.trim() ? replacement.leaf : current.filters.search;
            return { ...current, filters: { ...current.filters, ticks, search } };
          });
        }
        toast.success(result.message || "Replaced.");
      } else {
        setCurrentId(actedOn.apdId);
      }
      reloadSoon();
    };

  const closeScreen = useCallback(() => {
    router.back();
  }, [router]);

  // ── Keys ──────────────────────────────────────────────────────────────────
  const keyState = { dialog, runVerb, currentRow, closeScreen, settingsOpen: gridSettings.active };
  const keyRef = useRef(keyState);
  useEffect(() => {
    keyRef.current = keyState;
  });

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const state = keyRef.current;
      if (isIssuedReservedKey(event)) {
        event.preventDefault();
      }
      // A dialog — the screen's own, or the grid settings' — has the keys.
      if (state.dialog || state.settingsOpen) {
        return;
      }
      const binding = issuedBindingFor(event);
      if (binding) {
        void state.runVerb(binding.verb);
        return;
      }
      if (event.key === "Enter" && !event.ctrlKey && !event.altKey) {
        if (!isTypingTarget(event.target) && state.currentRow) {
          event.preventDefault();
          void state.runVerb("openVoucher");
        }
        return;
      }
      if (event.key === "Escape") {
        const target = event.target as HTMLElement | null;
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
          <h1 className={styles.title}>Issued Cheques</h1>
          <p className={styles.subtitle}>
            Cheques we have written — record what our bank does with them
            {scope ? ` · ${scope.accYear} · posted at issue` : ""}
          </p>
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
          <button
            type="button"
            className={styles.secondaryButton}
            disabled={!scope}
            title="Open, edit and close cheque books"
            onClick={() => setDialog({ kind: "books" })}
          >
            Cheque books
          </button>
        </div>
      </header>

      <IssuedSummaryTiles
        summary={summary}
        summaryFailed={Boolean(summaryRows.error)}
        leaves={leaves}
        leavesFailed={Boolean(activeBooks.error)}
      />

      {filters ? (
        <IssuedFilterBar filters={filters} onChange={updateFilters} onReset={resetFilters} />
      ) : null}

      {gridSettings.overlays}
      <section className={styles.registerShell} onContextMenu={gridSettings.onContextMenu}>
        <IssuedRegister
          columns={columns}
          rows={rows}
          rawRows={rawRows}
          currentId={currentRow?.apdId ?? null}
          loading={!scope || register.isFetching}
          error={registerError}
          emptyText="no cheques match these filters"
          onCurrent={setCurrentId}
          onOpen={(row) => void openVoucher(row)}
        />
        <div className={styles.pager}>
          <span>
            {total > 0
              ? `Showing ${(page - 1) * PAGE_SIZE + 1}–${Math.min(page * PAGE_SIZE, total)} of ${total}`
              : register.isFetching
                ? "Reading…"
                : "No rows"}
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

      <IssuedDetailStrip
        row={currentRow}
        detail={detail}
        loading={detailQuery.isFetching}
        error={detailErrorLine(detailQuery.error)}
      />

      <footer className={styles.actionBar}>
        <div className={styles.actionButtons}>
          {ISSUED_KEY_TABLE.map((binding) => (
            <button
              key={binding.verb}
              type="button"
              className={styles.button}
              title={binding.title}
              disabled={!currentRow || !allowed.includes(binding.verb)}
              onClick={() => void runVerb(binding.verb)}
            >
              {issuedButtonText(binding)}
            </button>
          ))}
          <button
            type="button"
            className={styles.button}
            title="Open the payment this cheque was written on"
            disabled={!currentRow || !currentRow.voucherRefno}
            onClick={() => void runVerb("openVoucher")}
          >
            Open voucher - Enter
          </button>
          <span className={styles.actionSpacer} />
          <button type="button" className={styles.secondaryButton} onClick={reloadAll}>
            Reload
          </button>
          <button type="button" className={styles.secondaryButton} onClick={closeScreen}>
            Close - Esc
          </button>
        </div>
        <div className={`${styles.whyLine} ${barLine.reason ? styles.whyReason : ""}`}>{barLine.text}</div>
        <div className={styles.keyHints}>
          Enter opens the voucher · F7 presented · F8 returned · F3 stop · Ctrl+H history · Esc closes
        </div>
      </footer>

      {actionDialog ? (
        <IssuedActionDialog
          key={actionDialog.serial}
          spec={ISSUED_ACTION_SPECS[actionDialog.verb]}
          row={actionDialog.row}
          context={{ today, books: actionDialog.books }}
          onClose={() => setDialog(null)}
          onDone={onActionDone(actionDialog.verb, actionDialog.row)}
        />
      ) : null}
      {dialog?.kind === "history" ? (
        <IssuedHistoryDialog row={dialog.row} onClose={() => setDialog(null)} />
      ) : null}
      {dialog?.kind === "books" && scope ? (
        <ChequeBooksDialog
          companyId={scope.companyId}
          branchId={scope.branchId}
          onClose={(changed) => {
            setDialog(null);
            if (changed) {
              reloadSoon();
            }
          }}
        />
      ) : null}
    </div>
  );
}
