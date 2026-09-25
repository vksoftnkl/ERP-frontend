"use client";
/**
 * Ledger Statement — Reports › Financial Statements (menu 258).
 *
 * One ledger, one date range inside one fiscal year, three tabs (Vouchers /
 * Daily / Monthly), a drill into the source voucher, and an Excel export. It
 * writes nothing.
 *
 * THE CLIENT ASKS, FORMATS AND NAVIGATES. It does no money arithmetic at all:
 * every balance, total, running figure and b/f arrives computed from the
 * server, and the only thing done here with an amount is to print it.
 *
 * The URL is the report's state (`query/params.ts`). Show (F5) writes it, the
 * URL change fetches, and so the Back button, a pasted link and a refresh all
 * reproduce the same report. Company and year come from the session, never
 * from the URL.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { cx } from "@/components/design-system/cx";
import { useBusinessContext } from "@/components/layout/business-context";
import { usePagePermissions } from "@/hooks/useMenuPermissions";
import { layoutRect, type LayoutRect } from "@/lib/ui-scale";
import { toast } from "@/lib/notify";
import styles from "./page.module.scss";
import { useLedgerStatementClient } from "./api/ledger-statement";
import { isAborted } from "./api/abort";
import { FilterStrip, ALL_BRANCHES_TIP, type DisplaySwitches, type Draft } from "./components/filter-strip";
import { LegsPopover } from "./components/legs-popover";
import { LedgerDetailPanel, MonthWisePanel, PeriodSummaryPanel } from "./components/panels";
import { DailyTable, MonthlyTable } from "./components/summary-tables";
import { VoucherGrid } from "./components/voucher-grid";
import { exportFileName, toXlsx } from "./export/to-xlsx";
import { writeXlsx, XLSX_MIME } from "./export/xlsx-writer";
import { buildGridModel } from "./grid/grid-model";
import { NO_SCREEN_MESSAGE, drillTarget } from "./nav/drill-target";
import { loadedRows } from "./query/pages";
import {
  buildSearch,
  checkFilters,
  defaultRange,
  exportQuery,
  parseFilters,
  scopeQuery,
  type Filters,
  type Session,
  type Tab,
} from "./query/params";
import { useStatement } from "./query/use-statement";
import { useVoucherLegs } from "./query/use-voucher-legs";
import { clampIso, displayDate, isoDay, monthBounds, todayIso } from "./wire/dates";
import { toLedgerError, type ErrorField } from "./wire/errors";
import type { LedgerPickItem, VoucherRow } from "./wire/types";

export const LEDGER_STATEMENT_HREF = "/reports/ledger-statement";
const DISPLAY_STORAGE_KEY = "erp.ledgerStatement.display";
const RETURN_STORAGE_PREFIX = "erp.ledgerStatement.return:";
const PRINT_TIP = "Arrives with the printing module";
const TABS: Array<{ id: Tab; label: string }> = [
  { id: "vouchers", label: "Vouchers" },
  { id: "daily", label: "Daily" },
  { id: "monthly", label: "Monthly" },
];

/* ---------------------------------------------- per-viewer conveniences */

function readDisplay(): DisplaySwitches {
  const fallback = { narration: true, runningBalance: true };
  try {
    const raw = window.localStorage.getItem(DISPLAY_STORAGE_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<DisplaySwitches>;
    return {
      narration: parsed.narration !== false,
      runningBalance: parsed.runningBalance !== false,
    };
  } catch {
    return fallback;
  }
}

function writeDisplay(value: DisplaySwitches) {
  try {
    window.localStorage.setItem(DISPLAY_STORAGE_KEY, JSON.stringify(value));
  } catch {
    // Storage blocked: the switch still works for this visit.
  }
}

type ReturnPoint = { scrollTop: number; voucherId: string | null };

function saveReturnPoint(search: string, point: ReturnPoint) {
  try {
    window.sessionStorage.setItem(RETURN_STORAGE_PREFIX + search, JSON.stringify(point));
  } catch {
    // Without storage, Back still lands on the same report, just at the top.
  }
}

/** Read without removing: StrictMode runs a lazy initialiser twice. */
function peekReturnPoint(search: string): ReturnPoint | null {
  try {
    const raw = window.sessionStorage.getItem(RETURN_STORAGE_PREFIX + search);
    return raw ? (JSON.parse(raw) as ReturnPoint) : null;
  } catch {
    return null;
  }
}

function clearReturnPoint(search: string) {
  try {
    window.sessionStorage.removeItem(RETURN_STORAGE_PREFIX + search);
  } catch {
    // Nothing to clear.
  }
}

function draftFrom(filters: Filters, ledgerText: string): Draft {
  return {
    ledger: filters.ledgerId ? { id: filters.ledgerId, text: ledgerText } : null,
    fromDate: filters.fromDate,
    toDate: filters.toDate,
    branchId: filters.branchId,
    includeCancelled: filters.includeCancelled,
    withBillRefs: filters.withBillRefs,
    withLegs: filters.withLegs,
  };
}

/* ================================================================ screen */

export default function LedgerStatementScreen() {
  const router = useRouter();
  const pathname = usePathname() ?? LEDGER_STATEMENT_HREF;
  const searchParams = useSearchParams();
  const search = searchParams?.toString() ?? "";
  const client = useLedgerStatementClient();
  const permissions = usePagePermissions({ href: LEDGER_STATEMENT_HREF });
  const { activeCompany, activeBranch, activeFiscalYear, branchOptions } = useBusinessContext();

  /* ---- the session scope: company + year, never from the URL (§3.1) */
  const session: Session = useMemo(
    () => ({
      companyId: activeCompany?.id ?? "",
      accYear: (activeFiscalYear?.name ?? "").trim(),
      yearBegin: isoDay(activeFiscalYear?.beginDate) || null,
      yearEnd: isoDay(activeFiscalYear?.endDate) || null,
      branchId: activeBranch?.id ?? null,
    }),
    [activeBranch?.id, activeCompany?.id, activeFiscalYear?.beginDate, activeFiscalYear?.endDate, activeFiscalYear?.name],
  );
  const sessionReady = Boolean(session.companyId && session.accYear);

  const branches = useMemo(() => branchOptions.filter((option) => option.value !== ""), [branchOptions]);

  /* ---- the applied filters ARE the URL (§3.3) */
  const filters = useMemo(() => {
    const range = defaultRange(session, todayIso());
    return parseFilters(new URLSearchParams(search), { ...range, branchId: session.branchId });
  }, [search, session]);

  const writeUrl = useCallback(
    (next: Filters, mode: "push" | "replace" = "push") => {
      const nextSearch = buildSearch(next).toString();
      const href = `${pathname}?${nextSearch}`;
      if (mode === "replace") router.replace(href, { scroll: false });
      else router.push(href, { scroll: false });
    },
    [pathname, router],
  );

  const loadFilters = useMemo(
    () => (sessionReady ? filters : { ...filters, ledgerId: null }),
    [filters, sessionReady],
  );
  const { state, ensureRows, reload, retryPages } = useStatement(client, session, loadFilters);

  /* ---- what is on screen: one committed report, never a mix (§5) */
  const viewKey = state.viewKey;
  const header = state.header && state.header.key === viewKey ? state.header.data : null;
  const pages = state.pages && state.pages.key === viewKey ? state.pages : null;
  const daily = state.daily && state.daily.key === viewKey ? state.daily.data : null;
  const monthly = viewKey ? (state.monthly?.data ?? null) : null;
  const period = header?.period ?? null;
  const dimmed = state.loading || state.behind;

  /* ---- the draft the strip edits; re-seeded whenever the URL moves */
  const [ledgerNames, setLedgerNames] = useState<Record<string, string>>({});
  const knownName = (id: string | null) =>
    (id && (ledgerNames[id] ?? (header?.ledger.ledgerId === id ? header.ledger.name : ""))) || "";
  const [draft, setDraft] = useState<Draft>(() => draftFrom(filters, ""));
  const [checkError, setCheckError] = useState<{ message: string; field: ErrorField } | null>(null);
  // Re-seeded when the URL (or the session's defaults) moves, and only then:
  // typing must not be overwritten by a render. Adjusted during render, the
  // React way to reset state on a changed input.
  const seedKey = `${search}|${session.branchId ?? ""}|${session.yearBegin ?? ""}`;
  const [seededFor, setSeededFor] = useState(seedKey);
  if (seededFor !== seedKey) {
    setSeededFor(seedKey);
    setDraft(draftFrom(filters, knownName(filters.ledgerId)));
    setCheckError(null);
  }
  // A link or a refresh carries only the ledger's id; its name arrives with /header.
  const stripDraft: Draft =
    draft.ledger && !draft.ledger.text
      ? { ...draft, ledger: { id: draft.ledger.id, text: knownName(draft.ledger.id) } }
      : draft;

  // The route renders client-only (ssr:false), so storage can be read up front.
  const [display, setDisplay] = useState<DisplaySwitches>(readDisplay);
  const onDisplay = useCallback((patch: Partial<DisplaySwitches>) => {
    setDisplay((current) => {
      const next = { ...current, ...patch };
      writeDisplay(next);
      return next;
    });
  }, []);

  /* ---- the ledger's group, for PgUp / PgDn */
  const groupRef = useRef<{ ledgerId: string; groupId: string | null } | null>(null);
  const onPickLedger = useCallback((item: LedgerPickItem) => {
    groupRef.current = { ledgerId: item.ledgerId, groupId: item.groupId };
    setLedgerNames((names) => ({ ...names, [item.ledgerId]: item.name }));
    setDraft((d) => ({ ...d, ledger: { id: item.ledgerId, text: item.name } }));
    setCheckError(null);
  }, []);

  /* ---- Show (F5): the draft → the URL. Same URL = run it again. */
  const onShow = useCallback(() => {
    const next: Filters = {
      ...filters,
      ledgerId: draft.ledger?.id ?? null,
      fromDate: draft.fromDate,
      toDate: draft.toDate,
      branchId: draft.branchId,
      includeCancelled: draft.includeCancelled,
      withBillRefs: draft.withBillRefs,
      withLegs: draft.withLegs,
    };
    const problem = checkFilters(next, session);
    setCheckError(problem);
    if (problem) return;
    if (buildSearch(next).toString() === search) reload();
    else writeUrl(next);
  }, [draft, filters, reload, search, session, writeUrl]);

  /* ---- hints (the ledger walk's ends) */
  const [hint, setHint] = useState<string | null>(null);
  useEffect(() => {
    if (!hint) return;
    const timer = window.setTimeout(() => setHint(null), 4000);
    return () => window.clearTimeout(timer);
  }, [hint]);

  const groupCache = useRef<{ groupId: string; items: LedgerPickItem[] } | null>(null);
  const walking = useRef(false);
  const walkLedger = useCallback(
    async (direction: 1 | -1) => {
      const ledgerId = filters.ledgerId;
      if (!ledgerId || walking.current || !session.companyId) return;
      walking.current = true;
      try {
        let groupId = groupRef.current?.ledgerId === ledgerId ? groupRef.current.groupId : undefined;
        if (groupId === undefined) {
          // Opened from a link: /header names the group but not its id, so ask /ledgers.
          const name = header?.ledger.ledgerId === ledgerId ? header.ledger.name : "";
          const found = name
            ? (await client.searchLedgers({ companyId: session.companyId, search: name, limit: 30 })).items.find(
                (item) => item.ledgerId === ledgerId,
              )
            : undefined;
          groupId = found?.groupId ?? null;
          groupRef.current = { ledgerId, groupId };
        }
        if (!groupId) {
          setHint("This ledger's group is not known, so PgUp / PgDn cannot walk it.");
          return;
        }
        if (groupCache.current?.groupId !== groupId) {
          const { items } = await client.searchLedgers({ companyId: session.companyId, groupId, limit: 100 });
          groupCache.current = { groupId, items };
        }
        const list = groupCache.current.items;
        const at = list.findIndex((item) => item.ledgerId === ledgerId);
        const next = at < 0 ? undefined : list[at + direction];
        if (!next) {
          const group = header?.ledger.groupName ?? "this group";
          setHint(direction > 0 ? `This is the last ledger in ${group}.` : `This is the first ledger in ${group}.`);
          return;
        }
        groupRef.current = { ledgerId: next.ledgerId, groupId };
        setLedgerNames((names) => ({ ...names, [next.ledgerId]: next.name }));
        writeUrl({ ...filters, ledgerId: next.ledgerId });
      } catch (error) {
        if (!isAborted(error)) setHint(toLedgerError(error).message);
      } finally {
        walking.current = false;
      }
    },
    [client, filters, header, session.companyId, writeUrl],
  );

  /* ---- month / day drills */
  const onPickMonth = useCallback(
    (month: string) => {
      const [from, to] = monthBounds(month);
      writeUrl({
        ...filters,
        fromDate: clampIso(from, session.yearBegin, session.yearEnd),
        toDate: clampIso(to, session.yearBegin, session.yearEnd),
        tab: "vouchers",
      });
    },
    [filters, session.yearBegin, session.yearEnd, writeUrl],
  );
  const onPickDay = useCallback(
    (day: string) => writeUrl({ ...filters, fromDate: day, toDate: day, tab: "vouchers" }),
    [filters, writeUrl],
  );
  const onTab = useCallback((tab: Tab) => writeUrl({ ...filters, tab }, "replace"), [filters, writeUrl]);

  /* ---- the grid: rows, legs, focus */
  const legs = useVoucherLegs(client, session, filters.ledgerId);
  const loaded = useMemo(() => (pages ? loadedRows(pages) : []), [pages]);
  const [toggled, setToggled] = useState<ReadonlySet<string>>(new Set());
  const [focusKey, setFocusKey] = useState<string | null>(null);
  const [gridFor, setGridFor] = useState(viewKey);
  if (gridFor !== viewKey) {
    // A new report: nothing is expanded or focused in it yet.
    setGridFor(viewKey);
    setToggled(new Set());
    setFocusKey(null);
  }
  // With Contra legs on, every "as per details" row arrives expanded, and a
  // toggle folds it. Otherwise a toggle unfolds it.
  const expanded = useMemo(() => {
    const set = new Set<string>();
    for (const row of loaded) {
      if (!row.asPerDetails) continue;
      const open = row.legs ? !toggled.has(row.voucherId) : toggled.has(row.voucherId);
      if (open) set.add(row.voucherId);
    }
    return set;
  }, [loaded, toggled]);
  const onToggle = useCallback(
    (row: VoucherRow) => {
      if (!expanded.has(row.voucherId)) legs.request(row);
      setToggled((current) => {
        const next = new Set(current);
        if (next.has(row.voucherId)) next.delete(row.voucherId);
        else next.add(row.voucherId);
        return next;
      });
    },
    [expanded, legs],
  );
  const model = useMemo(
    () => buildGridModel({ period, pages, expanded, legsOf: legs.legsOf }),
    [expanded, legs.legsOf, pages, period],
  );

  const viewportRef = useRef<HTMLDivElement | null>(null);
  const focusedRow = useMemo(() => {
    const row = model.rows.find((r) => r.key === focusKey);
    return row?.kind === "voucher" ? row.row : null;
  }, [focusKey, model.rows]);

  /* ---- drill-down (§10): the row's own scope, and Back restores the place */
  const onDrill = useCallback(
    (row: VoucherRow) => {
      const target = drillTarget(row, session.companyId);
      if (!target) {
        toast.warning(NO_SCREEN_MESSAGE);
        return;
      }
      saveReturnPoint(search, { scrollTop: viewportRef.current?.scrollTop ?? 0, voucherId: row.voucherId });
      router.push(target);
    },
    [router, search, session.companyId],
  );
  const [returnPoint] = useState<ReturnPoint | null>(() => peekReturnPoint(search));
  const returned = useRef(false);
  useEffect(() => {
    const point = returnPoint;
    if (!point || returned.current || !pages || state.loading) return;
    returned.current = true;
    clearReturnPoint(search);
    const index = point.voucherId ? loaded.findIndex((row) => row.voucherId === point.voucherId) : -1;
    window.requestAnimationFrame(() => {
      if (viewportRef.current) viewportRef.current.scrollTop = point.scrollTop;
      if (index >= 0) setFocusKey(`r${index}`);
      viewportRef.current?.focus({ preventScroll: true });
    });
  }, [loaded, pages, returnPoint, search, state.loading]);

  /* ---- Alt+F1 legs popover */
  const [popoverState, setPopover] = useState<{ row: VoucherRow; anchor: LayoutRect; viewKey: string | null } | null>(
    null,
  );
  // A popover opened on another report is not shown over this one.
  const popover = popoverState && popoverState.viewKey === viewKey ? popoverState : null;
  const closePopover = useCallback(() => setPopover(null), []);
  const openLegs = useCallback(() => {
    if (!focusedRow || !viewportRef.current) return;
    const index = model.rows.findIndex((r) => r.key === focusKey);
    const element = viewportRef.current.querySelector(`[data-grid-index="${index}"]`);
    if (!element) return;
    legs.request(focusedRow);
    setPopover({ row: focusedRow, anchor: layoutRect(element), viewKey });
  }, [focusKey, focusedRow, legs, model.rows, viewKey]);

  /* ---- Excel (§11) */
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const onExcel = useCallback(async () => {
    const ledgerId = filters.ledgerId;
    if (!ledgerId || exporting) return;
    setExporting(true);
    setExportError(null);
    try {
      const [data, months] = await Promise.all([
        client.getExport(exportQuery(session, filters, ledgerId)),
        client.getMonthly(scopeQuery(session, filters, ledgerId)),
      ]);
      const branchLabel = filters.branchId
        ? (branches.find((b) => b.value === filters.branchId)?.label ?? "One branch")
        : "All branches (combined)";
      const book = toXlsx(data, months, { branchLabel, companyName: activeCompany?.name ?? null });
      const blob = new Blob([writeXlsx(book.sheets) as BlobPart], { type: XLSX_MIME });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = book.fileName || exportFileName(data.ledger.name, filters.fromDate, filters.toDate);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch (error) {
      if (!isAborted(error)) {
        setExportError(
          toLedgerError(error, { accYear: session.accYear, yearBegin: session.yearBegin, yearEnd: session.yearEnd })
            .message,
        );
      }
    } finally {
      setExporting(false);
    }
  }, [activeCompany, branches, client, exporting, filters, session]);

  const onClose = useCallback(() => router.push("/home"), [router]);

  /* ---- keys (the screen's own; the grid keys its rows) */
  const keys = useRef({ onShow, walkLedger, openLegs, onClose, popoverOpen: false, popoverRow: null as string | null });
  useEffect(() => {
    keys.current = {
      onShow,
      walkLedger,
      openLegs,
      onClose,
      popoverOpen: popover !== null,
      popoverRow: popover?.row.voucherId ?? null,
    };
  });
  const ledgerInputRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const k = keys.current;
      if (event.key === "F5") {
        event.preventDefault();
        k.onShow();
        return;
      }
      if (event.defaultPrevented) return;
      if (event.ctrlKey && !event.altKey && event.key.toLowerCase() === "l") {
        event.preventDefault();
        ledgerInputRef.current?.focus();
        return;
      }
      if (event.altKey && event.key === "F1") {
        event.preventDefault();
        k.openLegs();
        return;
      }
      if ((event.key === "PageUp" || event.key === "PageDown") && !event.ctrlKey && !event.altKey) {
        // An open picker list owns its own keys.
        const target = event.target as HTMLElement | null;
        if (target?.getAttribute("aria-expanded") === "true") return;
        event.preventDefault();
        void k.walkLedger(event.key === "PageDown" ? 1 : -1);
        return;
      }
      if (event.key === "Escape" && !k.popoverOpen) {
        event.preventDefault();
        k.onClose();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  /* ---- errors: one line under the strip (§12) */
  const serverError = state.error
    ? toLedgerError(state.error, { accYear: session.accYear, yearBegin: session.yearBegin, yearEnd: session.yearEnd })
    : null;
  const pageError = state.pageError ? toLedgerError(state.pageError).message : null;
  const flagged: ErrorField = checkError?.field ?? serverError?.field ?? null;

  if (permissions.isDenied || serverError?.kind === "forbidden") {
    return <div className={styles.denied}>You do not have access to the Ledger Statement.</div>;
  }

  const hasReport = Boolean(filters.ledgerId && sessionReady);
  const companyLevelOnly = period?.openingNote === "COMPANY_LEVEL_ONLY" && filters.branchId !== null;

  return (
    <div className={styles.page}>
      <header className={styles.titleBar}>
        <div>
          <h1 className={styles.title}>Ledger Statement</h1>
          <p className={styles.subtitle}>Reports › Financial Statements</p>
        </div>
        <span className={styles.scopeNote}>
          {activeCompany?.name ?? "No company"} · {session.accYear || "no year"}
          {session.yearBegin && session.yearEnd
            ? ` (${displayDate(session.yearBegin)} – ${displayDate(session.yearEnd)})`
            : ""}
        </span>
      </header>

      <FilterStrip
        client={client}
        companyId={session.companyId}
        draft={stripDraft}
        onDraft={(patch) => {
          setDraft((d) => ({ ...d, ...patch }));
          setCheckError(null);
        }}
        onPickLedger={onPickLedger}
        display={display}
        onDisplay={onDisplay}
        branches={branches}
        yearBegin={session.yearBegin}
        yearEnd={session.yearEnd}
        flagged={flagged}
        onShow={onShow}
        ledgerInputRef={ledgerInputRef}
      />

      {checkError ? (
        <div className={styles.errorLine} role="alert">
          {checkError.message}
        </div>
      ) : serverError ? (
        <div className={styles.errorLine} role="alert">
          <span>{serverError.message}</span>
          {serverError.retryable ? (
            <button type="button" className={styles.linkButton} onClick={reload}>
              Retry
            </button>
          ) : null}
          {state.behind && header ? <span>Showing the previous report.</span> : null}
        </div>
      ) : null}
      {exportError ? (
        <div className={styles.errorLine} role="alert">
          <span>{exportError}</span>
          <button type="button" className={styles.linkButton} onClick={() => setExportError(null)}>
            Dismiss
          </button>
        </div>
      ) : null}
      {hint ? <div className={styles.hintLine}>{hint}</div> : null}
      {companyLevelOnly && !dimmed ? (
        <div className={styles.banner}>
          <span>
            This ledger&apos;s opening is held at company level, so this branch starts at 0.00. Choose All branches
            (combined) to include it.
          </span>
          <button
            type="button"
            className={styles.linkButton}
            title={ALL_BRANCHES_TIP}
            onClick={() => writeUrl({ ...filters, branchId: null })}
          >
            All branches (combined)
          </button>
        </div>
      ) : null}

      {!hasReport ? (
        <div className={styles.emptyState}>
          {sessionReady ? (
            <p>
              Choose a ledger and press <strong>Show (F5)</strong>.
              <br />
              <span className={styles.muted}>Ctrl+L jumps to the Ledger box from anywhere.</span>
            </p>
          ) : (
            <p>Choose a company and a fiscal year in the header first.</p>
          )}
        </div>
      ) : (
        <div className={cx(styles.body, dimmed && header && styles.bodyStale)} aria-busy={state.loading}>
          {state.loading ? <div className={styles.progress} aria-hidden="true" /> : null}
          <div className={styles.panels}>
            <LedgerDetailPanel ledger={header?.ledger ?? null} />
            <PeriodSummaryPanel period={period} />
            <MonthWisePanel
              monthly={monthly}
              fromDate={period?.fromDate ?? null}
              toDate={period?.toDate ?? null}
              onPickMonth={onPickMonth}
            />
          </div>

          <section className={styles.report} aria-label="Report">
            <div className={styles.tabs} role="tablist">
              {TABS.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={filters.tab === tab.id}
                  className={cx(styles.tab, filters.tab === tab.id && styles.tabActive)}
                  onClick={() => onTab(tab.id)}
                >
                  {tab.label}
                </button>
              ))}
              <span className={styles.tabsInfo}>
                {pages && filters.tab === "vouchers"
                  ? `${pages.totalRows.toLocaleString("en-IN")} vouchers`
                  : ""}
                {period && period.cancelledPairs > 0 && filters.tab === "vouchers"
                  ? ` · ${period.cancelledPairs} cancelled ${period.cancelledPairs === 1 ? "pair" : "pairs"}`
                  : ""}
              </span>
            </div>
            {filters.tab === "vouchers" ? (
              pages || header ? (
                <VoucherGrid
                  model={model}
                  display={{
                    showBranch: filters.branchId === null,
                    showNarration: display.narration,
                    showBalance: display.runningBalance,
                  }}
                  loadedRows={loaded}
                  expanded={expanded}
                  focusKey={focusKey}
                  onFocusKey={setFocusKey}
                  onToggle={onToggle}
                  onDrill={onDrill}
                  onRange={ensureRows}
                  pageError={pageError}
                  onRetryPages={retryPages}
                  viewportRef={viewportRef}
                />
              ) : (
                <div className={styles.emptyState}>{state.loading ? "Loading…" : ""}</div>
              )
            ) : filters.tab === "daily" ? (
              <DailyTable daily={daily} period={period} onPickDay={onPickDay} />
            ) : (
              <MonthlyTable monthly={monthly} onPickMonth={onPickMonth} />
            )}
          </section>
        </div>
      )}

      <footer className={styles.footer}>
        <div className={styles.footerHints}>
          <kbd>F5</kbd> Show · <kbd>Ctrl+L</kbd> Ledger · <kbd>PgUp</kbd>/<kbd>PgDn</kbd> Ledger in group ·{" "}
          <kbd>Enter</kbd> Open voucher · <kbd>Space</kbd> Legs · <kbd>Alt+F1</kbd> All legs · <kbd>End</kbd> Last
          row · <kbd>Esc</kbd> Close
        </div>
        <div className={styles.footerActions}>
          <button type="button" className={styles.button} onClick={onClose}>
            Close<span className={styles.key}>Esc</span>
          </button>
          <button
            type="button"
            className={styles.button}
            onClick={() => void onExcel()}
            disabled={!hasReport || exporting || !permissions.permissions.canExport}
            title={permissions.permissions.canExport ? "Export to Excel" : "You do not have export rights"}
          >
            {exporting ? "Exporting…" : "Excel"}
          </button>
          <button type="button" className={styles.button} disabled title={PRINT_TIP}>
            PDF
          </button>
          <button type="button" className={styles.button} disabled title={PRINT_TIP}>
            WhatsApp
          </button>
          <button type="button" className={styles.button} disabled title={PRINT_TIP}>
            Print
          </button>
        </div>
      </footer>

      {popover ? (
        <LegsPopover
          row={popover.row}
          legs={legs.legsOf(popover.row)}
          anchor={popover.anchor}
          onClose={closePopover}
        />
      ) : null}
    </div>
  );
}
