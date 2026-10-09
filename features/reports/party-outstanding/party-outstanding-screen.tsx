"use client";
/**
 * Party-wise Outstanding — Reports › Party Outstanding (menu 279).
 *
 * Receivables and payables (one Side filter) as on one date, over four tabs:
 * Party-wise / Bill-wise / Group-area summary / Due calendar. It drills party
 * → bills → what settled a bill, opens the source document, and exports. It
 * writes nothing.
 *
 * THE SERVER DECIDES what is pending, how old it is and what it adds up to.
 * The client asks with filters held in the URL, prints the strings it gets
 * back, and navigates. No money arithmetic, no date arithmetic, no ageing
 * here: As on decides everything, and only the server reads it.
 *
 * The URL is the report's state (`query/params.ts`). Show (F5) writes it, the
 * URL change fetches, so Back, a pasted link and a refresh reproduce the same
 * report. Company comes from the session; there is no year anywhere.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { cx } from "@/components/design-system/cx";
import { useBusinessContext } from "@/components/layout/business-context";
import { usePagePermissions } from "@/hooks/useMenuPermissions";
import { buildPartyHandoffHref } from "@/lib/navigation/party-handoff";
import { toast } from "@/lib/notify";
import { layoutRect, type LayoutRect } from "@/lib/ui-scale";
import { isAborted } from "@/features/reports/shared/api/abort";
import { writeXlsx, XLSX_MIME } from "@/features/reports/shared/export/xlsx-writer";
import { displayDate, isoDay, isWithin, todayIso } from "@/features/reports/shared/wire/dates";
import { buildSearch as buildLedgerSearch } from "@/features/reports/ledger-statement/query/params";
import styles from "./page.module.scss";
import { usePartyOutstandingClient } from "./api/party-outstanding";
import { BillHistoryPopover } from "./components/bill-history-popover";
import { BillWiseTab } from "./components/bill-wise-tab";
import { BillsGrid } from "./components/bills-grid";
import { DueCalendarTab } from "./components/due-calendar-tab";
import { FilterStrip, type Draft } from "./components/filter-strip";
import {
  moreCount,
  MoreFiltersDialog,
  moreSummary,
  type MoreFilters,
} from "./components/more-filters-dialog";
import { PartyCard } from "./components/party-card";
import { PartyGrid } from "./components/party-grid";
import { StatTiles } from "./components/stat-tiles";
import { SummaryTab } from "./components/summary-tab";
import { toXlsx } from "./export/to-xlsx";
import { drillTarget, NO_SCREEN_MESSAGE, NO_VOUCHER_SCREEN_MESSAGE, voucherTarget } from "./nav/drill-target";
import { partOf } from "./query/outstanding-loader";
import { findLoaded, rowAt } from "./query/pages";
import {
  bucketEdges,
  bucketsText,
  buildSearch,
  calendarWindow,
  changeSide,
  checkFilters,
  defaultAsOn,
  exportQuery,
  normaliseBuckets,
  parseFilters,
  reportFiltersOf,
  reportKey,
  type BillSort,
  type Filters,
  type PartySort,
  type Session,
  type Tab,
} from "./query/params";
import { useBillHistory } from "./query/use-bill-history";
import { useOptions } from "./query/use-options";
import { useOutstanding } from "./query/use-outstanding";
import { useSelectedParty } from "./query/use-selected-party";
import { type GridContext } from "./view/cells";
import { bucketAfterEdge, buildTiles, type TileId } from "./view/tiles";
import { NO_ACCESS_MESSAGE, toOutstandingError, type ErrorField } from "./wire/errors";
import type { BillHistoryRow, BillRow, OutstandingSide, PartyRow, SummaryGroupBy, SummaryRow } from "./wire/types";

export const PARTY_OUTSTANDING_HREF = "/reports/party-outstanding";
const LEDGER_STATEMENT_HREF = "/reports/ledger-statement";
const RETURN_STORAGE_PREFIX = "erp.partyOutstanding.return:";
const PRINT_TIP = "Arrives with the printing module";
const FIND_HINT =
  "Find needs a party search on the server (/parties takes no search key yet). " +
  "Meanwhile, More filters (F8) › Party narrows the report to the focused party.";

const TABS: Array<{ id: Tab; label: string }> = [
  { id: "parties", label: "Party-wise" },
  { id: "bills", label: "Bill-wise" },
  { id: "summary", label: "Group / area summary" },
  { id: "calendar", label: "Due calendar" },
];

const SORT_LABEL: Record<string, string> = {
  net: "Net outstanding",
  name: "Party",
  owed: "Pending bills",
  overdue: "Overdue",
  oldest: "Oldest",
};

/* ---------------------------------------------- per-viewer conveniences */

type ReturnPoint = {
  partyScrollTop: number;
  billId: string | null;
  billWiseScrollTop: number;
  billWiseBillId: string | null;
};

function saveReturnPoint(search: string, point: ReturnPoint) {
  try {
    window.sessionStorage.setItem(RETURN_STORAGE_PREFIX + search, JSON.stringify(point));
  } catch {
    // Without storage, Back still lands on the same report and party, just at the top.
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

function draftFrom(filters: Filters): Draft {
  const { buckets, ...rest } = reportFiltersOf(filters);
  return { ...rest, bucketsText: bucketsText(buckets) };
}

function moreOf(d: Draft): MoreFilters {
  return {
    salesmanId: d.salesmanId,
    collectionDay: d.collectionDay,
    partyId: d.partyId,
    minDueDays: d.minDueDays,
    maxDueDays: d.maxDueDays,
  };
}

function download(bytes: Uint8Array, fileName: string) {
  const blob = new Blob([bytes as BlobPart], { type: XLSX_MIME });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/* ================================================================ screen */

export default function PartyOutstandingScreen() {
  const router = useRouter();
  const pathname = usePathname() ?? PARTY_OUTSTANDING_HREF;
  const searchParams = useSearchParams();
  const search = searchParams?.toString() ?? "";
  const client = usePartyOutstandingClient();
  const permissions = usePagePermissions({ href: PARTY_OUTSTANDING_HREF });
  const { activeCompany, activeBranch, activeFiscalYear, branchOptions } = useBusinessContext();

  /* ---- the session scope: the company, and defaults only (§3.1) */
  const session: Session = useMemo(
    () => ({
      companyId: activeCompany?.id ?? "",
      branchId: activeBranch?.id ?? null,
      yearBegin: isoDay(activeFiscalYear?.beginDate) || null,
      yearEnd: isoDay(activeFiscalYear?.endDate) || null,
    }),
    [activeBranch?.id, activeCompany?.id, activeFiscalYear?.beginDate, activeFiscalYear?.endDate],
  );
  const sessionReady = Boolean(session.companyId);
  const [today] = useState(() => todayIso());
  const sessionBranches = useMemo(() => branchOptions.filter((option) => option.value !== ""), [branchOptions]);

  /* ---- the applied filters ARE the URL (§3.3) */
  const filters = useMemo(
    () =>
      parseFilters(new URLSearchParams(search), { asOn: defaultAsOn(session, today), branchId: session.branchId }),
    [search, session, today],
  );
  const reportFilters = useMemo(() => reportFiltersOf(filters), [filters]);

  const hrefFor = useCallback((next: Filters) => `${pathname}?${buildSearch(next).toString()}`, [pathname]);
  const writeUrl = useCallback(
    (next: Filters, mode: "push" | "replace" = "push") => {
      if (mode === "replace") router.replace(hrefFor(next), { scroll: false });
      else router.push(hrefFor(next), { scroll: false });
    },
    [hrefFor, router],
  );
  /**
   * The focused party rides in the URL too, but moving it must not cost a
   * navigation per arrow key: `history.replaceState` (with a null state, so
   * Next keeps its own and syncs `useSearchParams`) updates it in place.
   */
  const latestFilters = useRef(filters);
  useEffect(() => {
    latestFilters.current = filters;
  });
  const selectParty = useCallback(
    (partyId: string | null) => {
      const current = latestFilters.current;
      if (current.selected === partyId) return;
      window.history.replaceState(null, "", hrefFor({ ...current, selected: partyId }));
    },
    [hrefFor],
  );

  /* ---- loading: one generation per URL (§5.1), the focused party nested (§5.2) */
  const { state, ensureParties, ensureBillWise, reload, retryPages } = useOutstanding(
    client,
    session,
    filters,
    sessionReady,
  );
  const viewKey = state.viewKey;
  const parties = state.parties && partOf(viewKey, state.parties.key) ? state.parties : null;
  const billWise = state.billWise && partOf(viewKey, state.billWise.key) ? state.billWise : null;
  const summary = state.summary && partOf(viewKey, state.summary.key) ? state.summary.data : null;
  const calendar = state.calendar && partOf(viewKey, state.calendar.key) ? state.calendar.data : null;
  const head = parties?.meta.head ?? null;
  const dimmed = state.loading || state.behind;
  const side: OutstandingSide = head?.side ?? filters.side;
  const ctx: GridContext = useMemo(() => ({ side, edges: bucketEdges(filters.buckets) }), [filters.buckets, side]);

  const selectedId = filters.selected;
  const selection = useSelectedParty(client, session, reportFilters, sessionReady ? selectedId : null);
  const sel = selection.state;
  const selStale = sel.loading || sel.partyId !== selectedId || dimmed;

  // After each Show, the first row is focused (the mockup, and 3.0).
  useEffect(() => {
    if (!parties || state.loading || selectedId) return;
    const first = rowAt(parties, 0);
    if (first) selectParty(first.partyId);
  }, [parties, selectParty, selectedId, state.loading]);

  /* ---- names, for the More-filters summary */
  const partyName = useCallback(
    (id: string): string | null => {
      if (sel.card?.party.partyId === id) return sel.card.party.name;
      if (!parties) return null;
      const at = findLoaded(parties, (row) => row.partyId === id);
      return at >= 0 ? (rowAt(parties, at)?.name ?? null) : null;
    },
    [parties, sel.card],
  );

  /* ---- the draft the strip edits; re-seeded whenever the URL moves */
  const [draft, setDraft] = useState<Draft>(() => draftFrom(filters));
  const [checkError, setCheckError] = useState<{ message: string; field: ErrorField } | null>(null);
  const seedKey = `${reportKey(filters)}|${session.branchId ?? ""}|${session.yearEnd ?? ""}`;
  const [seededFor, setSeededFor] = useState(seedKey);
  if (seededFor !== seedKey) {
    setSeededFor(seedKey);
    setDraft(draftFrom(filters));
    setCheckError(null);
  }
  const options = useOptions(client, session.companyId, draft.side);

  /* ---- Show (F5): the draft → the URL. The same report = run it again. */
  const runShow = useCallback(
    (d: Draft) => {
      const { bucketsText: text, ...rest } = d;
      const next: Filters = { ...filters, ...rest, buckets: normaliseBuckets(text) };
      const problem = checkFilters(next);
      setCheckError(problem);
      if (problem) return;
      if (reportKey(next) === reportKey(filters)) {
        reload();
        selection.reload();
        return;
      }
      // A new report: its first row will be focused, and the Summary's Area /
      // Salesman make no sense on Payable.
      const groupBy: SummaryGroupBy =
        next.side === "PAYABLE" && (next.groupBy === "AREA" || next.groupBy === "SALESMAN") ? "GROUP" : next.groupBy;
      // A calendar day picked on the last report is not this one's.
      writeUrl({ ...next, selected: null, dueOn: null, groupBy });
    },
    [filters, reload, selection, writeUrl],
  );
  const onShow = useCallback(() => runShow(draft), [draft, runShow]);

  const onDraft = useCallback((patch: Partial<Draft>) => {
    setDraft((d) => ({ ...d, ...patch }));
    setCheckError(null);
  }, []);
  const onSide = useCallback((next: OutstandingSide) => {
    setDraft((d) => changeSide(d, next));
    setCheckError(null);
  }, []);

  /* ---- More filters (F8) */
  const [moreOpen, setMoreOpen] = useState(false);
  const appliedMore = moreOf(draftFrom(filters));
  const onApplyMore = useCallback(
    (more: MoreFilters) => {
      setMoreOpen(false);
      const next = { ...draft, ...more };
      setDraft(next);
      runShow(next);
    },
    [draft, runShow],
  );
  const summaryText = moreSummary(appliedMore, {
    salesman: (id) => options.options?.salesmen.find((s) => s.salesmanId === id)?.name ?? null,
    party: partyName,
  });

  /* ---- hints */
  const [hint, setHint] = useState<string | null>(null);
  useEffect(() => {
    if (!hint) return;
    const timer = window.setTimeout(() => setHint(null), 6000);
    return () => window.clearTimeout(timer);
  }, [hint]);

  /* ---- grid refs, focus and Back restore (§12) */
  const partyViewportRef = useRef<HTMLDivElement | null>(null);
  const billsViewportRef = useRef<HTMLDivElement | null>(null);
  const billWiseViewportRef = useRef<HTMLDivElement | null>(null);
  const asOnRef = useRef<HTMLInputElement | null>(null);

  const [returnPoint] = useState<ReturnPoint | null>(() => peekReturnPoint(search));
  const [focusedBill, setFocusedBill] = useState<{ partyId: string | null; billId: string | null }>(() => ({
    partyId: filters.selected,
    billId: returnPoint?.billId ?? null,
  }));
  const focusedBillId = focusedBill.partyId === selectedId ? focusedBill.billId : null;
  const onFocusBill = useCallback(
    (billId: string | null) => setFocusedBill({ partyId: latestFilters.current.selected, billId }),
    [],
  );
  // The Bill-wise focus is the tab's own; the screen keeps a copy for the return point.
  const [billWiseInitial] = useState<string | null>(() => returnPoint?.billWiseBillId ?? null);
  const billWiseFocus = useRef<string | null>(billWiseInitial);

  const restored = useRef(false);
  useEffect(() => {
    const point = returnPoint;
    if (!point || restored.current || state.loading) return;
    const ready = filters.tab === "bills" ? billWise : parties;
    if (!ready) return;
    restored.current = true;
    clearReturnPoint(search);
    window.requestAnimationFrame(() => {
      if (filters.tab === "bills") {
        if (billWiseViewportRef.current) billWiseViewportRef.current.scrollTop = point.billWiseScrollTop;
        billWiseViewportRef.current?.focus({ preventScroll: true });
      } else {
        if (partyViewportRef.current) partyViewportRef.current.scrollTop = point.partyScrollTop;
        if (point.billId) billsViewportRef.current?.focus({ preventScroll: true });
        else partyViewportRef.current?.focus({ preventScroll: true });
      }
    });
  }, [billWise, filters.tab, parties, returnPoint, search, state.loading]);

  /* ---- drill-down: the row's own scope, and Back restores the place */
  const leaveTo = useCallback(
    (target: string) => {
      saveReturnPoint(window.location.search.replace(/^\?/, ""), {
        partyScrollTop: partyViewportRef.current?.scrollTop ?? 0,
        billId: focusedBillId,
        billWiseScrollTop: billWiseViewportRef.current?.scrollTop ?? 0,
        billWiseBillId: billWiseFocus.current,
      });
      router.push(target);
    },
    [focusedBillId, router],
  );
  const onDrill = useCallback(
    (row: BillRow) => {
      const target = drillTarget(row, session.companyId);
      if (!target) {
        toast.warning(NO_SCREEN_MESSAGE);
        return;
      }
      leaveTo(target);
    },
    [leaveTo, session.companyId],
  );
  const onOpenVoucher = useCallback(
    (row: BillHistoryRow) => {
      const target = voucherTarget({
        companyId: session.companyId,
        branchId: row.voucherBranchId,
        accYear: row.voucherAccYear,
        voucherId: row.voucherId,
        voucherTypeId: row.voucherTypeId,
      });
      if (!target) {
        toast.warning(NO_VOUCHER_SCREEN_MESSAGE);
        return;
      }
      leaveTo(target);
    },
    [leaveTo, session.companyId],
  );

  /* ---- Alt+F1: what settled this bill (§9.3) */
  const history = useBillHistory(client, session, head?.asOn ?? filters.asOn);
  const [popover, setPopover] = useState<{ row: BillRow; anchor: LayoutRect; viewKey: string | null } | null>(null);
  const shownPopover = popover && popover.viewKey === viewKey ? popover : null;
  const closePopover = useCallback(() => setPopover(null), []);
  const openHistory = useCallback(
    (row: BillRow, anchor: HTMLElement) => {
      history.request(row);
      setPopover({ row, anchor: layoutRect(anchor), viewKey });
    },
    [history, viewKey],
  );

  /* ---- Ctrl+L / Ctrl+R (§8.3) */
  const focusedParty = useMemo((): { partyId: string; name: string } | null => {
    if (!selectedId) return null;
    const name = partyName(selectedId);
    return { partyId: selectedId, name: name ?? "" };
  }, [partyName, selectedId]);

  const openLedger = useCallback(() => {
    if (!focusedParty) {
      setHint("Focus a party first.");
      return;
    }
    const asOn = head?.asOn ?? filters.asOn;
    if (!session.yearBegin || !isWithin(asOn, session.yearBegin, session.yearEnd)) {
      setHint(
        `The Ledger Statement reads the session's year${
          session.yearBegin && session.yearEnd
            ? ` (${displayDate(session.yearBegin)} – ${displayDate(session.yearEnd)})`
            : ""
        }, and As on ${displayDate(asOn)} is outside it. Change the year in the header first.`,
      );
      return;
    }
    const query = buildLedgerSearch({
      ledgerId: focusedParty.partyId,
      fromDate: session.yearBegin,
      toDate: asOn,
      branchId: filters.branchId,
      tab: "vouchers",
      includeCancelled: true,
      withBillRefs: true,
      withLegs: false,
    });
    leaveTo(`${LEDGER_STATEMENT_HREF}?${query.toString()}`);
  }, [filters.asOn, filters.branchId, focusedParty, head?.asOn, leaveTo, session.yearBegin, session.yearEnd]);

  const openNewVoucher = useCallback(() => {
    if (!focusedParty) {
      setHint("Focus a party first.");
      return;
    }
    const route = side === "PAYABLE" ? "/accounts/payment" : "/accounts/receipt";
    leaveTo(buildPartyHandoffHref(route, { partyId: focusedParty.partyId, partyName: focusedParty.name }));
  }, [focusedParty, leaveTo, side]);

  /* ---- URL writes from the grids and tabs */
  const onTab = useCallback((tab: Tab) => writeUrl({ ...filters, tab }, "replace"), [filters, writeUrl]);
  const onPartySort = useCallback(
    (sort: PartySort) => {
      const dir = sort === filters.sort ? (filters.dir === "asc" ? "desc" : "asc") : sort === "name" ? "asc" : "desc";
      writeUrl({ ...filters, sort, dir }, "replace");
    },
    [filters, writeUrl],
  );
  const onBillSort = useCallback(
    (sort: BillSort) => {
      const firstDir = sort === "pending" || sort === "age" || sort === "overdue" ? "desc" : "asc";
      const billDir = sort === filters.billSort ? (filters.billDir === "asc" ? "desc" : "asc") : firstDir;
      writeUrl({ ...filters, billSort: sort, billDir }, "replace");
    },
    [filters, writeUrl],
  );
  const onTileShortcut = useCallback(
    (id: TileId) => {
      if (id === "overdue") {
        writeUrl({ ...filters, onlyOverdue: true, selected: null, tab: "parties" });
        return;
      }
      if (id === "above" && parties) {
        const index = bucketAfterEdge(
          parties.meta.tiles.aboveDays.days,
          bucketEdges(filters.buckets),
          parties.meta.head.bucketLabels.length,
        );
        if (index !== null) writeUrl({ ...filters, sort: `bucket${index}` as PartySort, dir: "desc", tab: "parties" });
      }
    },
    [filters, parties, writeUrl],
  );
  const onSummaryPick = useCallback(
    (row: SummaryRow, groupBy: SummaryGroupBy) => {
      if (!row.key) {
        setHint(`"${row.name}" has no ${groupBy.toLowerCase()} to filter by.`);
        return;
      }
      const patch: Partial<Filters> =
        groupBy === "AREA"
          ? { areaId: row.key }
          : groupBy === "GROUP"
            ? { groupId: row.key }
            : groupBy === "SALESMAN"
              ? { salesmanId: row.key }
              : { branchId: row.key };
      writeUrl({ ...filters, ...patch, tab: "parties", selected: null });
    },
    [filters, writeUrl],
  );
  const calWindow = calendarWindow(filters);

  /* ---- Excel (§13): PARTIES, or BILLS on the Bill-wise tab */
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const onExcel = useCallback(async () => {
    if (exporting || !sessionReady) return;
    setExporting(true);
    setExportError(null);
    try {
      const data = await client.getExport(exportQuery(session, filters, filters.tab === "bills" ? "BILLS" : "PARTIES"));
      if (data.shape === "PARTY_STATEMENT") return;
      const book = toXlsx(data);
      download(writeXlsx(book.sheets), book.fileName);
    } catch (error) {
      if (!isAborted(error)) setExportError(toOutstandingError(error, { asOn: filters.asOn }).message);
    } finally {
      setExporting(false);
    }
  }, [client, exporting, filters, session, sessionReady]);

  const onClose = useCallback(() => router.push("/home"), [router]);

  /* ---- keys (the screen's own; the grids key their rows) */
  const openMore = useCallback(() => setMoreOpen(true), []);
  const showHint = useCallback((text: string) => setHint(text), []);
  const keys = useRef({ onShow, openLedger, openNewVoucher, onClose, openMore, showHint, overlayOpen: false });
  const overlayOpen = moreOpen || shownPopover !== null;
  useEffect(() => {
    keys.current = { onShow, openLedger, openNewVoucher, onClose, openMore, showHint, overlayOpen };
  });
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const k = keys.current;
      if (event.key === "F5") {
        event.preventDefault();
        if (!k.overlayOpen) k.onShow();
        return;
      }
      if (event.defaultPrevented || k.overlayOpen) return;
      const ctrl = event.ctrlKey && !event.altKey && !event.metaKey;
      const key = event.key.toLowerCase();
      if (event.key === "F8") {
        event.preventDefault();
        k.openMore();
      } else if (ctrl && key === "l") {
        event.preventDefault();
        k.openLedger();
      } else if (ctrl && key === "r") {
        // Never the browser's reload.
        event.preventDefault();
        k.openNewVoucher();
      } else if (ctrl && key === "f") {
        event.preventDefault();
        k.showHint(FIND_HINT);
      } else if (ctrl && key === "p") {
        // No window.print() of the grid: printing has its own pipeline.
        event.preventDefault();
        k.showHint("Printing arrives with the printing module.");
      } else if (event.key === "Escape") {
        event.preventDefault();
        k.onClose();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  /* ---- errors: one line under the strip (§14) */
  const serverError = state.error ? toOutstandingError(state.error, { asOn: filters.asOn }) : null;
  const selectionError = sel.error ? toOutstandingError(sel.error, { asOn: filters.asOn }) : null;
  const pageError = state.pageError ? toOutstandingError(state.pageError).message : null;
  const flagged: ErrorField = checkError?.field ?? serverError?.field ?? null;

  if (permissions.isDenied || serverError?.kind === "forbidden" || selectionError?.kind === "forbidden") {
    return <div className={styles.denied}>{NO_ACCESS_MESSAGE}</div>;
  }

  const tiles = parties ? buildTiles(parties.meta.tiles, { side, deductPdc: filters.deductPdc }) : null;
  const branchLabel = filters.branchId
    ? (options.options?.branches.find((b) => b.branchId === filters.branchId)?.name ??
      sessionBranches.find((b) => b.value === filters.branchId)?.label ??
      "One branch")
    : "All branches";
  const sideWord = side === "PAYABLE" ? "Payable" : "Receivable";
  const sortLabel = filters.sort.startsWith("bucket")
    ? (head?.bucketLabels[Number(filters.sort.slice(6))] ?? "a bucket")
    : (SORT_LABEL[filters.sort] ?? filters.sort);
  const showCard = Boolean(parties && parties.totalRows > 0 && sel.card && sel.bills);

  return (
    <div className={styles.page}>
      <header className={styles.titleBar}>
        <div>
          <h1 className={styles.title}>Party-wise Outstanding</h1>
          <p className={styles.subtitle}>
            {activeCompany?.name ?? "No company"} · {branchLabel} · as on {displayDate(head?.asOn ?? filters.asOn)} ·{" "}
            {sideWord}
          </p>
        </div>
        {head?.accYear ? (
          <span className={styles.yearBadge} title="As on decides the year: there is no year picker">
            FY {head.accYear}
          </span>
        ) : null}
      </header>

      <nav className={styles.tabs} role="tablist" aria-label="Views">
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
      </nav>

      <FilterStrip
        draft={draft}
        onDraft={onDraft}
        onSide={onSide}
        options={options.options}
        fallbackBranches={sessionBranches}
        flagged={flagged}
        onShow={onShow}
        onMoreFilters={openMore}
        moreCount={moreCount(moreOf(draft))}
        asOnRef={asOnRef}
      />

      {summaryText ? <div className={styles.summaryLine}>More filters: {summaryText}</div> : null}
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
          {state.behind && parties ? <span>Showing the previous report.</span> : null}
        </div>
      ) : selectionError ? (
        <div className={styles.errorLine} role="alert">
          <span>{selectionError.message}</span>
          {selectionError.retryable ? (
            <button type="button" className={styles.linkButton} onClick={selection.reload}>
              Retry
            </button>
          ) : null}
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
      {options.error ? <div className={styles.hintLine}>The filter lists could not be loaded: {options.error}</div> : null}
      {hint ? <div className={styles.hintLine}>{hint}</div> : null}
      {head?.isFuture && !dimmed ? (
        <div className={styles.banner}>
          As on is in the future: post-dated cheques up to that date are counted as settled.
        </div>
      ) : null}

      {!sessionReady ? (
        <div className={styles.emptyState}>Choose a company in the header first.</div>
      ) : (
        <div className={styles.body} aria-busy={state.loading}>
          {state.loading ? <div className={styles.progress} aria-hidden="true" /> : null}
          <div className={cx(dimmed && parties && styles.stale)}>
            <StatTiles tiles={tiles} onShortcut={onTileShortcut} />
          </div>

          {filters.tab === "parties" ? (
            <div className={styles.partyTab}>
              <section className={cx(styles.section, styles.partySection, dimmed && parties && styles.stale)}>
                <div className={styles.sectionHead}>
                  <span className={styles.sectionTitle}>Parties</span>
                  <span className={styles.sectionNote}>
                    {parties ? `${parties.totalRows.toLocaleString("en-IN")} parties · ` : ""}sorted by {sortLabel}{" "}
                    {filters.dir === "asc" ? "↑" : "↓"} · click a header to re-sort · Enter opens the bills
                  </span>
                </div>
                {parties ? (
                  <PartyGrid
                    list={parties}
                    ctx={ctx}
                    sort={filters.sort}
                    dir={filters.dir}
                    onSort={onPartySort}
                    selectedId={selectedId}
                    onSelect={(row: PartyRow) => selectParty(row.partyId)}
                    onRange={ensureParties}
                    onEnter={() => billsViewportRef.current?.focus()}
                    pageError={pageError}
                    onRetryPages={retryPages}
                    viewportRef={partyViewportRef}
                  />
                ) : (
                  <div className={styles.emptyState}>{state.loading ? "Loading…" : ""}</div>
                )}
                <div className={styles.footNote}>
                  Net = pending bills − on-account credit (advances, unadjusted notes, unallocated{" "}
                  {side === "PAYABLE" ? "payments" : "receipts"}). Buckets age the PENDING part of each bill; Overdue =
                  pending past the due date (or bill date + credit days). A net on the on-account side reads green.
                </div>
              </section>

              <div className={styles.split}>
                <section className={cx(styles.section, selStale && showCard && styles.stale)}>
                  <div className={styles.sectionHead}>
                    <span className={styles.sectionTitle}>
                      Bills{showCard && sel.card ? ` · ${sel.card.party.name}` : ""}
                    </span>
                    <span className={styles.sectionNote}>Enter opens the bill · Alt+F1 what settled it · Esc back</span>
                  </div>
                  {showCard && sel.bills ? (
                    <BillsGrid
                      bills={sel.bills}
                      ctx={ctx}
                      focusedBillId={focusedBillId}
                      onFocusBill={onFocusBill}
                      onDrill={onDrill}
                      onHistory={openHistory}
                      onBack={() => partyViewportRef.current?.focus()}
                      onLedger={openLedger}
                      viewportRef={billsViewportRef}
                    />
                  ) : (
                    <div className={styles.emptyState}>
                      {sel.loading ? "Loading…" : parties && parties.totalRows === 0 ? "" : "Focus a party to see its bills."}
                    </div>
                  )}
                </section>
                <section className={cx(styles.section, selStale && showCard && styles.stale)}>
                  <div className={styles.sectionHead}>
                    <span className={styles.sectionTitle}>Party</span>
                  </div>
                  {showCard && sel.card ? (
                    <PartyCard card={sel.card} side={side} ageBy={filters.ageBy} deductPdc={filters.deductPdc} />
                  ) : (
                    <div className={styles.emptyState} />
                  )}
                </section>
              </div>
            </div>
          ) : filters.tab === "bills" ? (
            billWise ? (
              <div className={cx(styles.section, dimmed && styles.stale)} style={{ flex: "1 1 auto" }}>
                <BillWiseTab
                  list={billWise}
                  ctx={ctx}
                  sort={filters.billSort}
                  dir={filters.billDir}
                  dueOn={filters.dueOn}
                  onSort={onBillSort}
                  onClearDueOn={() => writeUrl({ ...filters, dueOn: null }, "replace")}
                  onRange={ensureBillWise}
                  onDrill={onDrill}
                  onHistory={openHistory}
                  initialFocus={billWiseInitial}
                  onFocusBill={(id) => {
                    billWiseFocus.current = id;
                  }}
                  pageError={pageError}
                  onRetryPages={retryPages}
                  viewportRef={billWiseViewportRef}
                />
              </div>
            ) : (
              <div className={styles.emptyState}>{state.loading ? "Loading…" : ""}</div>
            )
          ) : filters.tab === "summary" ? (
            <div className={cx(styles.section, dimmed && summary && styles.stale)} style={{ flex: "1 1 auto" }}>
              <SummaryTab
                summary={summary}
                side={side}
                groupBy={filters.groupBy}
                onGroupBy={(groupBy) => writeUrl({ ...filters, groupBy }, "replace")}
                onPick={onSummaryPick}
                loading={state.loading}
              />
            </div>
          ) : (
            <div className={cx(styles.section, dimmed && calendar && styles.stale)} style={{ flex: "1 1 auto" }}>
              <DueCalendarTab
                calendar={calendar}
                window={calWindow}
                asOn={head?.asOn ?? filters.asOn}
                loading={state.loading}
                onWindow={(from, to) => writeUrl({ ...filters, calFrom: from, calTo: to }, "replace")}
                onPickDay={(date) => writeUrl({ ...filters, tab: "bills", dueOn: date })}
              />
            </div>
          )}
        </div>
      )}

      <footer className={styles.footer}>
        <div className={styles.footerHints}>
          <kbd>F5</kbd> Show · <kbd>Enter</kbd> Open bill · <kbd>Alt+F1</kbd> What settled it · <kbd>Ctrl+L</kbd> Ledger
          statement · <kbd>Ctrl+R</kbd> New {side === "PAYABLE" ? "payment" : "receipt"} · <kbd>F8</kbd> More filters ·{" "}
          <kbd>Esc</kbd> Close
        </div>
        <div className={styles.footerActions}>
          <button type="button" className={styles.button} onClick={onClose}>
            Close<span className={styles.key}>Esc</span>
          </button>
          <button
            type="button"
            className={styles.button}
            onClick={() => void onExcel()}
            disabled={!sessionReady || exporting || !permissions.permissions.canExport}
            title={
              permissions.permissions.canExport
                ? filters.tab === "bills"
                  ? "Export the bill-wise list to Excel"
                  : "Export the party list to Excel"
                : "You do not have export rights"
            }
          >
            {exporting ? "Exporting…" : "Excel"}
          </button>
          <button type="button" className={styles.button} disabled title={PRINT_TIP}>
            PDF
          </button>
          <button type="button" className={styles.button} disabled title={`${PRINT_TIP}: one party's statement, to its phone`}>
            WhatsApp reminder
          </button>
          <button type="button" className={styles.primaryButton} disabled title={PRINT_TIP}>
            Print<span className={styles.key}>Ctrl+P</span>
          </button>
        </div>
      </footer>

      {moreOpen ? (
        <MoreFiltersDialog
          side={draft.side}
          value={moreOf(draft)}
          options={options.options}
          focused={focusedParty}
          partyName={partyName}
          onApply={onApplyMore}
          onCancel={() => setMoreOpen(false)}
        />
      ) : null}
      {shownPopover ? (
        <BillHistoryPopover
          bill={shownPopover.row}
          history={history.historyOf(shownPopover.row)}
          anchor={shownPopover.anchor}
          onClose={closePopover}
          onOpenVoucher={onOpenVoucher}
        />
      ) : null}
    </div>
  );
}
