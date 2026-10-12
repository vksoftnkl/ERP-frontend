"use client";
/**
 * Account Day Summary — Reports › Financial Statements (menu 284; menu 181
 * Day Book Detail opens it on the Vouchers tab).
 *
 * One company, one branch or all, one day or a range inside one fiscal year,
 * over three tabs: Summary / Vouchers / Day-wise. It drills into a voucher,
 * a group's ledgers and the Ledger Statement, and exports to Excel. It writes
 * nothing. Not a port: 3.0's `daybook.*` lends only the gestures (◀ ▶ one day,
 * the type filter, Enter opens the voucher).
 *
 * THE CLIENT ASKS, FORMATS AND NAVIGATES. It does no money arithmetic at all:
 * totals, tiles, opening and closing, the Day-wise closings and the Dr = Cr
 * verdict are the server's. The Summary tab is ONE `/summary` call, so its
 * panels are one snapshot and tie to each other.
 *
 * The URL is the report's state (`query/params.ts`): Show (F5) writes it,
 * ◀ ▶ write it at once, the URL change fetches. Company and year come from
 * the session and are never URL keys.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { cx } from "@/components/design-system/cx";
import { useBusinessContext } from "@/components/layout/business-context";
import { usePagePermissions } from "@/hooks/useMenuPermissions";
import { toast } from "@/lib/notify";
import { isAborted } from "@/features/reports/shared/api/abort";
import { writeXlsx, XLSX_MIME } from "@/features/reports/shared/export/xlsx-writer";
import { daysInclusive, displayDate, isoDay, todayIso, weekdayName } from "@/features/reports/shared/wire/dates";
import { formatAmount } from "@/features/reports/shared/wire/money";
import styles from "./page.module.scss";
import { useDaySummaryClient } from "./api/day-summary";
import { BusinessDayPill } from "./components/business-day-pill";
import { CheckDetailDialog } from "./components/check-detail-dialog";
import { ChecksPanel } from "./components/checks-panel";
import { DailyTable } from "./components/daily-table";
import { FilterStrip, type Draft } from "./components/filter-strip";
import { GroupGrid } from "./components/group-grid";
import { GroupLedgersDialog } from "./components/group-ledgers-dialog";
import { KpiTiles } from "./components/kpi-tiles";
import { MoneyLedgerGrid } from "./components/money-ledger-grid";
import { VoucherList } from "./components/voucher-list";
import { VoucherTypeGrid } from "./components/voucher-type-grid";
import { toXlsx } from "./export/to-xlsx";
import { drillTarget, ledgerStatementHref, NO_SCREEN_MESSAGE } from "./nav/drill-target";
import { wantedKey } from "./query/day-summary-loader";
import {
  buildSearch,
  checkFilters,
  dayDrill,
  defaultDate,
  exportQuery,
  isRange,
  parseFilters,
  stepDay,
  tileDrill,
  typeDrill,
  vouchersKey,
  type Filters,
  type Session,
  type Step,
  type Tab,
} from "./query/params";
import { useDaySummary } from "./query/use-day-summary";
import { useVoucherTypes } from "./query/use-voucher-types";
import { voucherFootText } from "./view/cells";
import { buildTiles, natureLabel } from "./view/tiles";
import { NO_ACCESS_MESSAGE, toDaySummaryError, type ErrorField } from "./wire/errors";
import { GROUP_LEVELS, type Check, type GroupLevel, type GroupRow, type MoneyKind, type VoucherRow } from "./wire/types";

export const DAY_SUMMARY_HREF = "/reports/day-summary";
const RETURN_STORAGE_PREFIX = "erp.daySummary.return:";
const PRINT_TIP = "Print, PDF and WhatsApp arrive with the printing plan";

const TABS: Array<{ id: Tab; label: string; key: string }> = [
  { id: "summary", label: "Summary", key: "1" },
  { id: "vouchers", label: "Vouchers", key: "2" },
  { id: "daily", label: "Day-wise", key: "3" },
];

const GROUP_LEVEL_LABEL: Record<GroupLevel, string> = {
  REPORT: "Report groups",
  PRIMARY: "Primary groups",
  LEDGER_GROUP: "Ledger groups",
};

const MONEY_LABEL: Record<MoneyKind, string> = {
  CASH: "Touching cash",
  BANK: "Touching bank",
  CLEARING: "Touching clearing",
};

/* ---------------------------------------------- per-viewer conveniences */

/** Back from a voucher lands on the same list and the voucher left from. */
function saveReturnPoint(search: string, voucherId: string | null) {
  try {
    window.sessionStorage.setItem(RETURN_STORAGE_PREFIX + search, JSON.stringify({ voucherId }));
  } catch {
    // Without storage, Back still lands on the same list, just at the top.
  }
}

/** Read without removing: StrictMode runs a lazy initialiser twice. */
function peekReturnPoint(search: string): string | null {
  try {
    const raw = window.sessionStorage.getItem(RETURN_STORAGE_PREFIX + search);
    const parsed = raw ? (JSON.parse(raw) as { voucherId?: unknown }) : null;
    return typeof parsed?.voucherId === "string" ? parsed.voucherId : null;
  } catch {
    return null;
  }
}

function draftFrom(filters: Filters): Draft {
  return {
    fromDate: filters.fromDate,
    toDate: filters.toDate,
    branchId: filters.branchId,
    voucherTypeId: filters.voucherTypeId,
    countDrafts: filters.countDrafts,
    includeCancelledPairs: filters.includeCancelledPairs,
    clearingAsBank: filters.clearingAsBank,
    zeroRows: filters.zeroRows,
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

type Expansion = { identity: string; all: boolean; ids: ReadonlySet<string> };

/* ================================================================ screen */

export default function DaySummaryScreen() {
  const router = useRouter();
  const pathname = usePathname() ?? DAY_SUMMARY_HREF;
  const searchParams = useSearchParams();
  const search = searchParams?.toString() ?? "";
  const client = useDaySummaryClient();
  const permissions = usePagePermissions({ href: DAY_SUMMARY_HREF });
  const {
    activeCompany,
    activeBranch,
    activeFiscalYear,
    branchOptions,
    companyOptions,
    setSelectedCompanyId,
    isCompanySelectionLocked,
  } = useBusinessContext();

  /* ---- the session scope (§3.1) */
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
  const [today] = useState(() => todayIso());
  const branches = useMemo(() => branchOptions.filter((option) => option.value !== ""), [branchOptions]);
  const companies = useMemo(() => companyOptions.filter((option) => option.value !== ""), [companyOptions]);

  /* ---- the applied filters ARE the URL (§3.3) */
  const filters = useMemo(
    () =>
      parseFilters(new URLSearchParams(search), { date: defaultDate(session, today), branchId: session.branchId }),
    [search, session, today],
  );
  const hrefFor = useCallback((next: Filters) => `${pathname}?${buildSearch(next).toString()}`, [pathname]);
  const writeUrl = useCallback(
    (next: Filters, mode: "push" | "replace" = "push") => {
      if (mode === "replace") router.replace(hrefFor(next), { scroll: false });
      else router.push(hrefFor(next), { scroll: false });
    },
    [hrefFor, router],
  );

  /* ---- loading: one generation per URL, the tab on screen only (§5) */
  const { state, ensureRows, reload, retryPages } = useDaySummary(client, session, filters);
  const voucherTypes = useVoucherTypes(client, sessionReady);
  const want = sessionReady ? wantedKey(session, filters) : null;
  const failure =
    state.error && want && state.error.key === want.key
      ? toDaySummaryError(state.error.error, { route: state.error.route, accYear: session.accYear })
      : null;
  const summaryPart = state.summary;
  const vouchersPart = state.vouchers;
  const dailyPart = state.daily;
  const heldKey =
    filters.tab === "summary" ? summaryPart?.key : filters.tab === "vouchers" ? vouchersPart?.key : dailyPart?.key;
  const dimmed = state.loading || (want !== null && heldKey !== undefined && heldKey !== want.key);

  /* ---- the draft the strip edits; re-seeded whenever the URL moves */
  const [draft, setDraft] = useState<Draft>(() => draftFrom(filters));
  const [checkError, setCheckError] = useState<{ message: string; field: "dates" } | null>(null);
  const seedKey = `${buildSearch(filters).toString()}|${session.branchId ?? ""}|${session.yearBegin ?? ""}`;
  const [seededFor, setSeededFor] = useState(seedKey);
  if (seededFor !== seedKey) {
    setSeededFor(seedKey);
    setDraft(draftFrom(filters));
    setCheckError(null);
  }

  /* ---- Show (F5): the draft → the URL. The same report = run it again. */
  const runShow = useCallback(
    (d: Draft) => {
      const next: Filters = { ...filters, ...d };
      const problem = checkFilters(next, session);
      setCheckError(problem);
      if (problem) return;
      if (buildSearch(next).toString() === buildSearch(filters).toString()) {
        reload();
        return;
      }
      // A different day or branch is a new list: the Drafts view stays, the drill chips stay.
      writeUrl(next);
    },
    [filters, reload, session, writeUrl],
  );
  const onShow = useCallback(() => runShow(draft), [draft, runShow]);
  const onDraft = useCallback((patch: Partial<Draft>) => {
    setDraft((d) => ({ ...d, ...patch }));
    setCheckError(null);
  }, []);

  /* ---- ◀ ▶ / Alt+← Alt+→ (§3.2): step the Date, To = Date, show at once */
  const canStep = {
    back: stepDay(draft, -1, session) !== null,
    forward: stepDay(draft, 1, session) !== null,
  };
  const onStep = useCallback(
    (dir: Step) => {
      const stepped = stepDay(draft, dir, session);
      if (stepped) runShow({ ...draft, ...stepped });
    },
    [draft, runShow, session],
  );

  /* ---- Company switches the SESSION (the header's action), never the URL */
  const onCompany = useCallback(
    (companyId: string) => {
      setSelectedCompanyId(companyId);
      // The link's branch belongs to the old company: drop it, so the new
      // company's session branch fills in.
      const next = buildSearch(filters);
      next.delete("branch");
      router.replace(`${pathname}?${next.toString()}`, { scroll: false });
    },
    [filters, pathname, router, setSelectedCompanyId],
  );

  /* ---- hints */
  const [hint, setHint] = useState<string | null>(null);
  useEffect(() => {
    if (!hint) return;
    const timer = window.setTimeout(() => setHint(null), 6000);
    return () => window.clearTimeout(timer);
  }, [hint]);

  /* ---- drill-downs (§9) */
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const dateRef = useRef<HTMLInputElement | null>(null);
  const [focusId, setFocusId] = useState<string | null>(() => peekReturnPoint(search));
  const latestFocus = useRef(focusId);
  useEffect(() => {
    latestFocus.current = focusId;
  });

  const leaveTo = useCallback(
    (target: string) => {
      saveReturnPoint(window.location.search.replace(/^\?/, ""), latestFocus.current);
      router.push(target);
    },
    [router],
  );

  // EXPENSES is one voucher type (ExpV): found by its CODE in the list, never a hard-coded id.
  const expenseTypeId = voucherTypes.types?.find((t) => t.code === "ExpV")?.voucherTypeId ?? null;
  const onTile = useCallback(
    (code: string) => writeUrl(tileDrill(filters, code, expenseTypeId)),
    [expenseTypeId, filters, writeUrl],
  );
  const onTypeRow = useCallback(
    (row: { voucherTypeId: number }) => writeUrl(typeDrill(filters, row.voucherTypeId)),
    [filters, writeUrl],
  );
  const onDay = useCallback((row: { date: string }) => writeUrl(dayDrill(filters, row.date)), [filters, writeUrl]);
  const onTab = useCallback((tab: Tab) => writeUrl({ ...filters, tab }, "replace"), [filters, writeUrl]);
  const onGroupLevel = useCallback(
    (groupLevel: GroupLevel) => writeUrl({ ...filters, groupLevel }, "replace"),
    [filters, writeUrl],
  );

  /** A ledger → its statement, on the range and branch the SHOWN summary was asked for. */
  const openLedger = useCallback(
    (ledgerId: string) => {
      const asked = summaryPart?.filters ?? filters;
      leaveTo(ledgerStatementHref({ ledgerId, fromDate: asked.fromDate, toDate: asked.toDate, branchId: asked.branchId }));
    },
    [filters, leaveTo, summaryPart?.filters],
  );

  const onVoucher = useCallback(
    (row: VoucherRow) => {
      const target = drillTarget(row, {
        companyId: session.companyId,
        accYear: session.accYear,
        branchId: vouchersPart?.filters.branchId ?? null,
      });
      if (!target) {
        toast.warning(NO_SCREEN_MESSAGE);
        return;
      }
      leaveTo(target);
    },
    [leaveTo, session.accYear, session.companyId, vouchersPart?.filters.branchId],
  );

  /* ---- dialogs */
  const [groupDialog, setGroupDialog] = useState<GroupRow | null>(null);
  const [checkDialog, setCheckDialog] = useState<Check | null>(null);
  // Every group row has movement, so it has ledgers to list. (The server's
  // `hasChildren` means child GROUPS: gating on it would block a leaf group
  // like Cash-in-Hand.)
  const onGroup = useCallback((row: GroupRow) => setGroupDialog(row), []);

  /* ---- legs on the Vouchers tab (§8.1): one round trip per list */
  const identity = sessionReady ? vouchersKey(session, { ...filters, withLegs: false }) : "";
  const [expansionState, setExpansion] = useState<Expansion>({ identity, all: false, ids: new Set() });
  const expansion: Expansion = useMemo(
    () => (expansionState.identity === identity ? expansionState : { identity, all: false, ids: new Set() }),
    [expansionState, identity],
  );
  const isOpen = useCallback(
    (row: VoucherRow) => (expansion.all ? !expansion.ids.has(row.voucherId) : expansion.ids.has(row.voucherId)),
    [expansion],
  );
  const askLegs = useCallback(() => {
    if (!filters.withLegs) writeUrl({ ...filters, withLegs: true }, "replace");
  }, [filters, writeUrl]);
  const onToggle = useCallback(
    (row: VoucherRow) => {
      const ids = new Set(expansion.ids);
      if (ids.has(row.voucherId)) ids.delete(row.voucherId);
      else ids.add(row.voucherId);
      setExpansion({ ...expansion, ids });
      askLegs();
    },
    [askLegs, expansion],
  );
  const toggleAllLegs = useCallback(() => {
    if (filters.draftsOnly) return;
    setExpansion({ identity, all: !expansion.all, ids: new Set() });
    if (!expansion.all) askLegs();
  }, [askLegs, expansion.all, filters.draftsOnly, identity]);
  const legsOff = useCallback(() => {
    setExpansion({ identity, all: false, ids: new Set() });
    writeUrl({ ...filters, withLegs: false }, "replace");
  }, [filters, identity, writeUrl]);

  /* ---- Excel (§10) */
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const onExcel = useCallback(async () => {
    if (exporting || !sessionReady) return;
    setExporting(true);
    setExportError(null);
    try {
      const data = await client.getExport(exportQuery(session, filters));
      const book = toXlsx(data, { clearingAsBank: filters.clearingAsBank });
      download(writeXlsx(book.sheets), book.fileName);
    } catch (error) {
      if (!isAborted(error)) setExportError(toDaySummaryError(error, { route: "export", accYear: session.accYear }).message);
    } finally {
      setExporting(false);
    }
  }, [client, exporting, filters, session, sessionReady]);

  const onClose = useCallback(() => router.push("/home"), [router]);

  /* ---- keys (the screen's own; the grids key their rows) */
  const showHint = useCallback((text: string) => setHint(text), []);
  const overlayOpen = groupDialog !== null || checkDialog !== null;
  const keys = useRef({ onShow, onStep, onTab, toggleAllLegs, onClose, showHint, overlayOpen, tab: filters.tab, range: isRange(filters) });
  useEffect(() => {
    keys.current = { onShow, onStep, onTab, toggleAllLegs, onClose, showHint, overlayOpen, tab: filters.tab, range: isRange(filters) };
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
      const alt = event.altKey && !event.ctrlKey && !event.metaKey;
      if (alt && (event.key === "ArrowLeft" || event.key === "ArrowRight")) {
        // Never the browser's Back / Forward.
        event.preventDefault();
        k.onStep(event.key === "ArrowLeft" ? -1 : 1);
      } else if (alt && event.key === "F1") {
        event.preventDefault();
        if (k.tab === "vouchers") k.toggleAllLegs();
      } else if (ctrl && (event.key === "1" || event.key === "2" || event.key === "3")) {
        event.preventDefault();
        const tab = TABS.find((t) => t.key === event.key)!.id;
        if (tab !== "daily" || k.range) k.onTab(tab);
        else k.showHint("Day-wise needs a range: pick a To date after the Date.");
      } else if (ctrl && event.key.toLowerCase() === "p") {
        // No window.print() of the grid: printing has its own pipeline.
        event.preventDefault();
        k.showHint(`${PRINT_TIP}.`);
      } else if (event.key === "Escape") {
        event.preventDefault();
        k.onClose();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  /* ---- errors and access */
  const flagged: ErrorField = checkError?.field ?? failure?.field ?? null;
  if (permissions.isDenied || failure?.kind === "forbidden") {
    return <div className={styles.denied}>{NO_ACCESS_MESSAGE}</div>;
  }

  const typesError = voucherTypes.error
    ? toDaySummaryError(voucherTypes.error, { route: "voucher-types", accYear: session.accYear }).message
    : null;
  const branchLabel = filters.branchId
    ? (branches.find((b) => b.value === filters.branchId)?.label ??
      (summaryPart?.filters.branchId === filters.branchId ? summaryPart.data.scope.branchName : "One branch"))
    : "All branches";
  const when = isRange(filters)
    ? `${displayDate(filters.fromDate)} → ${displayDate(filters.toDate)} · ${daysInclusive(filters.fromDate, filters.toDate)} days`
    : `${weekdayName(filters.fromDate)} ${displayDate(filters.fromDate)}`;
  const pillDay =
    summaryPart &&
    summaryPart.filters.fromDate === filters.fromDate &&
    summaryPart.filters.toDate === filters.toDate &&
    summaryPart.filters.branchId === filters.branchId
      ? summaryPart.data.businessDay
      : null;
  const typeName = (id: number) => voucherTypes.types?.find((t) => t.voucherTypeId === id)?.name ?? `Type ${id}`;

  const errorBody = failure ? (
    <div className={styles.bodyError} role="alert">
      <span>{failure.message}</span>
      {failure.retryable ? (
        <button type="button" className={styles.linkButton} onClick={reload}>
          Retry
        </button>
      ) : null}
    </div>
  ) : null;

  /* ---- the tab bodies */
  const summaryBody = () => {
    if (errorBody) return errorBody;
    if (!summaryPart) return <div className={styles.emptyState}>{state.loading ? "Loading…" : ""}</div>;
    const s = summaryPart.data;
    const asked = summaryPart.filters;
    const balancedOk = s.checks.some((c) => c.code === "BALANCED" && c.level === "OK");
    return (
      <div className={cx(styles.summaryTab, dimmed && styles.stale)}>
        {/* Pinned above the scroller, so the day's headline figures never scroll away. */}
        <div className={styles.pinnedTiles}>
          <KpiTiles tiles={buildTiles(s.tiles, { countDrafts: filters.countDrafts })} onPick={onTile} />
        </div>
        <div className={styles.scroll}>
          <div className={styles.panelsTop}>
            <section className={styles.section}>
              <div className={styles.sectionHead}>
                <span className={styles.sectionTitle}>Voucher-type summary</span>
                <span className={styles.sectionNote}>Enter → Vouchers tab, that type</span>
              </div>
              <VoucherTypeGrid
                rows={s.types}
                totals={s.typeTotals}
                countDrafts={filters.countDrafts}
                clearingAsBank={asked.clearingAsBank}
                onDrill={onTypeRow}
              />
              <div className={styles.footNote}>
                {filters.countDrafts ? "Drafts are counted, never summed.  " : ""}Cancelled = the original + its mirror, both
                in Vouchers, net 0 here.{asked.clearingAsBank ? "  Bank = bank + card / UPI clearing ledgers." : ""}
              </div>
            </section>
            <section className={styles.section}>
              <div className={styles.sectionHead}>
                <span className={styles.sectionTitle}>Cash &amp; bank position</span>
                <span className={styles.sectionNote}>Enter → Ledger Statement</span>
              </div>
              <MoneyLedgerGrid summary={s} clearingAsBank={asked.clearingAsBank} onLedger={(row) => openLedger(row.ledgerId)} />
            </section>
          </div>
          <div className={styles.panelsBottom}>
            <section className={styles.section}>
              <div className={styles.sectionHead}>
                <span className={styles.sectionTitle}>Group summary</span>
                <span className={styles.sectionNote}>Enter → the group&apos;s ledgers</span>
                <span className={styles.sectionTail}>
                  <select
                    className={styles.levelSelect}
                    value={filters.groupLevel}
                    onChange={(event) => onGroupLevel(event.target.value as GroupLevel)}
                    aria-label="Group level"
                  >
                    {GROUP_LEVELS.map((level) => (
                      <option key={level} value={level}>
                        {GROUP_LEVEL_LABEL[level]}
                      </option>
                    ))}
                  </select>
                </span>
              </div>
              <GroupGrid rows={s.groups} totals={s.groupTotals} balancedOk={balancedOk} onOpen={onGroup} />
              <div className={styles.footNote}>This shows the movement in range only.  Net Dr = blue, Cr = green.</div>
            </section>
            <section className={styles.section}>
              <div className={styles.sectionHead}>
                <span className={styles.sectionTitle}>Checks</span>
                <span className={styles.sectionNote}>as of {s.scope.asOf ? s.scope.asOf.slice(11, 16) : "now"}</span>
              </div>
              <ChecksPanel checks={s.checks} countDrafts={filters.countDrafts} onShow={setCheckDialog} />
            </section>
          </div>
        </div>
      </div>
    );
  };

  const vouchersBody = () => {
    const chips: Array<{ key: string; label: string; clear: Partial<Filters> }> = [];
    if (filters.voucherTypeId !== null) {
      chips.push({ key: "type", label: `Type: ${typeName(filters.voucherTypeId)}`, clear: { voucherTypeId: null } });
    }
    if (filters.natureFilter) {
      chips.push({ key: "nature", label: natureLabel(filters.natureFilter), clear: { natureFilter: null } });
    }
    if (filters.moneyKind) chips.push({ key: "money", label: MONEY_LABEL[filters.moneyKind], clear: { moneyKind: null } });
    const pages = vouchersPart;
    return (
      <div className={styles.vouchersTab}>
        <div className={styles.listBar}>
          {chips.map((chip) => (
            <span key={chip.key} className={styles.filterChip}>
              {chip.label}
              <button
                type="button"
                className={styles.chipClose}
                aria-label={`Remove ${chip.label}`}
                onClick={() => writeUrl({ ...filters, ...chip.clear }, "replace")}
              >
                ×
              </button>
            </span>
          ))}
          <div className={styles.stripSpacer} />
          <button
            type="button"
            className={cx(styles.button, filters.draftsOnly && styles.buttonOn)}
            aria-pressed={filters.draftsOnly}
            onClick={() => writeUrl({ ...filters, draftsOnly: !filters.draftsOnly }, "replace")}
            title="Drafts are in no figure: no legs, no number"
          >
            Drafts
          </button>
          <button
            type="button"
            className={cx(styles.button, filters.withLegs && !filters.draftsOnly && styles.buttonOn)}
            aria-pressed={filters.withLegs && !filters.draftsOnly}
            disabled={filters.draftsOnly}
            onClick={filters.withLegs ? legsOff : toggleAllLegs}
            title="Every voucher's ledger lines"
          >
            Legs<span className={styles.key}>Alt+F1</span>
          </button>
        </div>
        {errorBody ??
          (pages ? (
            <>
              <div className={cx(styles.vouchersTab, dimmed && styles.stale)}>
                <VoucherList
                  pages={pages}
                  showBranch={pages.filters.branchId === null}
                  isOpen={isOpen}
                  onToggle={onToggle}
                  onDrill={onVoucher}
                  onRange={ensureRows}
                  focusId={focusId}
                  onFocusId={setFocusId}
                  viewportRef={viewportRef}
                />
              </div>
              <div className={styles.gridFoot}>
                {state.pageError ? (
                  <>
                    <span>{toDaySummaryError(state.pageError, { route: "vouchers" }).message}</span>
                    <button type="button" className={styles.linkButton} onClick={retryPages}>
                      Retry
                    </button>
                  </>
                ) : null}
                <span>{voucherFootText(pages.totalRows, pages.totals.cancelledPairs, pages.filters.draftsOnly)}</span>
                {pages.filters.draftsOnly ? <span>document amounts · in no figure</span> : null}
                <span className={styles.gridFootTotal}>Total {formatAmount(pages.totals.amount)}</span>
              </div>
            </>
          ) : (
            <div className={styles.emptyState}>{state.loading ? "Loading…" : ""}</div>
          ))}
      </div>
    );
  };

  const dailyBody = () => {
    if (!isRange(filters)) return <div className={styles.emptyState}>Pick a To date to see a range.</div>;
    if (errorBody) return errorBody;
    if (!dailyPart) return <div className={styles.emptyState}>{state.loading ? "Loading…" : ""}</div>;
    return (
      <div className={cx(styles.scroll, dimmed && styles.stale)}>
        <DailyTable daily={dailyPart.data} countDrafts={filters.countDrafts} onDay={onDay} />
      </div>
    );
  };

  return (
    <div className={styles.page}>
      <header className={styles.titleBar}>
        <div>
          <h1 className={styles.title}>Account Day Summary</h1>
          <p className={styles.subtitle}>
            {activeCompany?.name ?? "No company"} · {branchLabel} · {session.accYear || "no year"} · {when}
          </p>
        </div>
        <BusinessDayPill day={pillDay} stale={dimmed && filters.tab === "summary"} />
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
            disabled={tab.id === "daily" && !isRange(filters) && filters.tab !== "daily"}
            title={
              tab.id === "daily" && !isRange(filters) ? "Pick a To date after the Date to see a range" : `Ctrl+${tab.key}`
            }
          >
            {tab.label}
          </button>
        ))}
      </nav>

      <FilterStrip
        draft={draft}
        onDraft={onDraft}
        onStep={onStep}
        canStep={canStep}
        yearBegin={session.yearBegin}
        yearEnd={session.yearEnd}
        companies={companies}
        companyId={session.companyId}
        onCompany={onCompany}
        companyLocked={isCompanySelectionLocked}
        branches={branches}
        voucherTypes={voucherTypes.types}
        flagged={flagged}
        onShow={onShow}
        dateRef={dateRef}
      />

      {checkError ? (
        <div className={styles.errorLine} role="alert">
          {checkError.message}
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
      {typesError ? <div className={styles.hintLine}>The voucher types could not be loaded: {typesError}</div> : null}
      {hint ? <div className={styles.hintLine}>{hint}</div> : null}

      {!sessionReady ? (
        <div className={styles.emptyState}>Choose a company and a financial year in the header first.</div>
      ) : (
        <div className={styles.body} aria-busy={state.loading}>
          {state.loading ? <div className={styles.progress} aria-hidden="true" /> : null}
          {filters.tab === "summary" ? summaryBody() : filters.tab === "vouchers" ? vouchersBody() : dailyBody()}
        </div>
      )}

      <footer className={styles.footer}>
        <div className={styles.footerHints}>
          <kbd>F5</kbd> Show · <kbd>Alt+←/→</kbd> Day · <kbd>Enter</kbd> Drill down · <kbd>Ctrl+1/2/3</kbd> Tabs ·{" "}
          {filters.tab === "vouchers" ? (
            <>
              <kbd>Space</kbd> Legs · <kbd>Alt+F1</kbd> All legs ·{" "}
            </>
          ) : null}
          <kbd>Ctrl+P</kbd> Print · <kbd>Esc</kbd> Close
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
                ? "The summary and every voucher (with legs) to Excel"
                : "You do not have export rights"
            }
          >
            {exporting ? "Exporting…" : "Excel"}
          </button>
          <button type="button" className={styles.button} disabled title={PRINT_TIP}>
            PDF
          </button>
          <button type="button" className={styles.button} disabled title={PRINT_TIP}>
            WhatsApp
          </button>
          <button type="button" className={styles.primaryButton} disabled title={PRINT_TIP}>
            Print<span className={styles.key}>Ctrl+P</span>
          </button>
        </div>
      </footer>

      {groupDialog && summaryPart ? (
        <GroupLedgersDialog
          group={groupDialog}
          client={client}
          session={session}
          filters={summaryPart.filters}
          onLedger={(row) => {
            setGroupDialog(null);
            openLedger(row.ledgerId);
          }}
          onClose={() => setGroupDialog(null)}
        />
      ) : null}
      {checkDialog && summaryPart ? (
        <CheckDetailDialog
          check={checkDialog}
          client={client}
          session={session}
          filters={summaryPart.filters}
          onClose={() => setCheckDialog(null)}
        />
      ) : null}
    </div>
  );
}
