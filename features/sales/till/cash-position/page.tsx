"use client";

/**
 * Cash Position (menu 289, Sales › Till, till notes 134) — Qt
 * `TillCashPositionEntry` (NexERP 1d3e203..3b5069d, TILL_DESIGN.md §8 S11
 * revision 2; mockups share/till/till_ho_cash_position_rev2_ui_mockup.png +
 * till_ho_review_ui_mockup.png, approved 2026-10-17): head office's one
 * page, every store as at the end of the "as on" day.
 *
 *   tiles      the totals of the stores grid — stores, live sessions, the
 *              four places cash sits, variance, approvals, flags
 *   stores     grid 170, one row per branch; cash in tills from the server's
 *              /till/sessions/expected per live session (grid 171, today only)
 *   flags      the flagged stores spelled out under the grid
 *   lower      the day's exceptions (grid 172) · cashiers, month-to-date
 *              shortage, top 5 (grid 173)
 *
 * Filters (Qt hboxFilter): As on (today), Branch (dropdown 61, every branch
 * until picked), Show, a search on the store's name, Refresh every minute
 * (today only, and never while a read is out). What the grids read and how
 * a cell is derived, totalled and pilled is `cash-position.ts`; the reads
 * are `use-cash-position.ts`.
 *
 * Enter / double-click on a store opens its Business Day (274); Till Sessions
 * (273) and Till Reports (288) open on it too, each a route under the user's
 * own rights for that menu. Add HO review (289 CREATE) is `ho-review-
 * dialog.tsx`; a saved review refreshes the page. Print is the page as shown
 * on a landscape page; Export a CSV of the three tables.
 *
 * Keys (Qt): F5 Refresh · Enter Business Day (on the stores table) · Esc closes.
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { cx } from "@/components/design-system/cx";
import { NexDropdownSingle, type DropdownSelection } from "@/components/design-system/dropdown";
import { useBusinessContext } from "@/components/layout/business-context";
import { sendToPrinter } from "@/features/printing/print-delivery";
import { usePagePermissions } from "@/hooks/useMenuPermissions";
import { useDropdownId } from "@/lib/configured-dropdowns";
import { toast } from "@/lib/notify";
import { walkOnEnter } from "../cash-office/enter-walk";
import { ReportTable } from "../reports/report-table";
import { csvText } from "../reports/till-reports";
import { textOf, todayIso } from "../shared/format";
import { overlayOpen } from "../shared/till-dialog";
import styles from "../shared/till.module.scss";
import type { GridRow } from "../shared/wire/types";
import {
  AUTO_REFRESH_MS,
  BUSINESS_DAY_TIP,
  CASHIERS_HEAD,
  CASH_POSITION_HREF,
  EVENTS_HEAD,
  SEARCH_PLACEHOLDER,
  SHOW_OPTIONS,
  asOnDay,
  businessDayHref,
  cashiersTable,
  drillButton,
  eventsTable,
  exportFileName,
  filterStores,
  flaggedStores,
  isShowFilter,
  printPage,
  printTitle,
  reportsHref,
  reviewButton,
  sessionsHref,
  storesTable,
  subtitleText,
  tiles,
  type ShowFilter,
  type TileTone,
} from "./cash-position";
import { HoReviewDialog } from "./ho-review-dialog";
import { StoresTable } from "./stores-table";
import { useCashPosition } from "./use-cash-position";
import local from "./cash-position.module.scss";

const TILE_TONE: Record<TileTone, string | undefined> = {
  "": undefined,
  amber: styles.toneAmber,
  red: styles.toneRed,
  green: styles.toneGreen,
};

function downloadCsv(text: string, fileName: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** The company is the header's; the screen proper is keyed by it. */
export default function CashPositionPage() {
  const { activeCompany, activeBranch, activeFiscalYear, companyLoading } = useBusinessContext();
  const companyId = activeCompany?.id ?? "";
  if (!companyId) {
    return (
      <div className={cx(styles.page, local.page)}>
        <header className={styles.titleBar}>
          <h1 className={styles.title}>Cash Position</h1>
        </header>
        <p className={companyLoading ? styles.muted : local.notice}>
          {companyLoading ? "Reading the company…" : "Cash Position reads one company — choose a company in the header first."}
        </p>
      </div>
    );
  }
  return (
    <CashPositionScreen
      key={companyId}
      companyId={companyId}
      ownBranchId={activeBranch?.id ?? ""}
      headerYear={(activeFiscalYear?.name ?? "").trim()}
    />
  );
}

type ScreenProps = { companyId: string; ownBranchId: string; headerYear: string };

function CashPositionScreen({ companyId, ownBranchId, headerYear }: ScreenProps) {
  const router = useRouter();
  const { permissions } = usePagePermissions({ href: CASH_POSITION_HREF });
  const canCreate = permissions.canCreate;
  // Menu 289's verbs are VIEW · CREATE · EXPORT: Print is allowed unless the menu says no (the Cash Office's reading).
  const canPrint = permissions.canPrint !== false;
  const canExport = permissions.canExport !== false;
  const branchDropdownId = useDropdownId("branchByCompany");
  const branchParams = useMemo(() => ({ ibr_comp_id: companyId }), [companyId]);

  // ── The filter bar ─────────────────────────────────────────────────────
  const [today, setToday] = useState(() => todayIso());
  const [refreshedAt, setRefreshedAt] = useState(() => new Date());
  const [asOn, setAsOn] = useState(today);
  /** Null = every branch (Qt: "Every branch" until one is picked). */
  const [branch, setBranch] = useState<DropdownSelection | null>(null);
  const [show, setShow] = useState<ShowFilter>("all");
  const [search, setSearch] = useState("");
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [tick, setTick] = useState(0);
  /** The picked store's branch id, kept across a refresh (Qt `keep`). */
  const [picked, setPicked] = useState("");
  const [review, setReview] = useState<GridRow | null>(null);

  const day = asOnDay(asOn, today);
  const isToday = day === today;
  const branchId = branch?.id ?? "";
  const model = useCashPosition({ companyId, branchId, day, isToday, tick });

  /** Qt `refresh`: every grid again, the clock in the subtitle moved. */
  const refresh = () => {
    setToday(todayIso());
    setRefreshedAt(new Date());
    setTick((value) => value + 1);
  };

  // ── The tables, the tiles, the flags ───────────────────────────────────
  const storesView = useMemo(
    () => storesTable(model.stores.rows, model.tillCash, isToday),
    [model.stores.rows, model.tillCash, isToday],
  );
  const storesShown = useMemo(() => filterStores(storesView, show, search), [storesView, show, search]);
  const eventsView = useMemo(() => eventsTable(model.events.rows), [model.events.rows]);
  const cashiersView = useMemo(() => cashiersTable(model.cashiers.rows), [model.cashiers.rows]);
  const tileList = useMemo(
    () => tiles(model.stores.rows, model.tillCash, isToday),
    [model.stores.rows, model.tillCash, isToday],
  );
  const flags = useMemo(() => flaggedStores(model.stores.rows), [model.stores.rows]);

  const pickedRow = model.stores.rows.find((row) => textOf(row, "branch_id") === picked) ?? null;
  const businessDay = drillButton(pickedRow !== null, BUSINESS_DAY_TIP);
  const sessions = drillButton(pickedRow !== null, "The store's till sessions");
  const reports = drillButton(pickedRow !== null, "Till Reports on the store, this month to the as-on day");
  const reviewState = reviewButton(pickedRow !== null, canCreate);

  // ── Drill — each screen under the user's own rights for its menu ───────
  const openBusinessDay = (row: GridRow | null = pickedRow) => {
    if (row) router.push(businessDayHref(row));
  };
  const openSessions = () => {
    if (pickedRow) router.push(sessionsHref(pickedRow));
  };
  const openReports = () => {
    if (pickedRow) router.push(reportsHref(pickedRow, day));
  };
  /** Head office's verdict on the picked store (notes 134). A saved review moves the store's "HO review" cell. */
  const addReview = () => {
    if (pickedRow && canCreate) setReview(pickedRow);
  };

  // ── Print / export — the page as shown ─────────────────────────────────
  const branchText = branch?.text || "every branch";

  const print = () => {
    if (!canPrint) return;
    const page = printPage({
      title: printTitle(day, branchText),
      tiles: tileList,
      stores: storesShown,
      flags,
      events: eventsView,
      cashiers: cashiersView,
    });
    sendToPrinter(URL.createObjectURL(new Blob([page], { type: "text/html;charset=utf-8" })));
  };

  const exportCsv = () => {
    if (!canExport) return;
    const fileName = exportFileName(day);
    downloadCsv(csvText([storesShown, eventsView, cashiersView]), fileName);
    toast.success(`Saved ${fileName}.`, { title: "Export" });
  };

  const close = () => {
    if (typeof window !== "undefined" && window.history.length > 1) router.back();
    else router.push("/");
  };

  // ── Live while open: once a minute, today only, never over a read ──────
  const latest = useRef({ autoRefresh, asOn, loading: model.loading, refresh, close });
  useLayoutEffect(() => {
    latest.current = { autoRefresh, asOn, loading: model.loading, refresh, close };
  });
  useEffect(() => {
    const id = window.setInterval(() => {
      const now = latest.current;
      const currentDay = todayIso();
      if (now.autoRefresh && asOnDay(now.asOn, currentDay) === currentDay && !now.loading) now.refresh();
    }, AUTO_REFRESH_MS);
    return () => window.clearInterval(id);
  }, []);

  // ── Keys: F5 refresh · Esc close ───────────────────────────────────────
  useEffect(() => {
    const onKeyDown = (keyEvent: KeyboardEvent) => {
      if (keyEvent.defaultPrevented || overlayOpen()) return;
      if (keyEvent.altKey || keyEvent.ctrlKey || keyEvent.metaKey || keyEvent.shiftKey) return;
      if (keyEvent.key === "F5") {
        // Never the browser's reload.
        keyEvent.preventDefault();
        latest.current.refresh();
      } else if (keyEvent.key === "Escape") {
        keyEvent.preventDefault();
        latest.current.close();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const storesEmpty =
    search.trim() && storesView.rows.length > 0 ? "No store matches the search." : "No store for this company.";

  return (
    <div className={cx(styles.page, local.page)}>
      <header className={styles.titleBar}>
        <div>
          <h1 className={styles.title}>Cash Position</h1>
          <p className={styles.subtitle}>{subtitleText(isToday, day, refreshedAt)}</p>
        </div>
      </header>

      <div className={local.filters} onKeyDown={walkOnEnter}>
        <label className={local.cap} htmlFor="till-cp-as-on">
          As on
        </label>
        <input
          id="till-cp-as-on"
          type="date"
          className={cx(styles.input, local.dateInput)}
          value={asOn}
          onChange={(changeEvent) => {
            setAsOn(changeEvent.target.value);
            refresh();
          }}
        />
        <label className={local.cap} htmlFor="till-cp-branch">
          Branch
        </label>
        <div className={local.branchPick}>
          <NexDropdownSingle
            id="till-cp-branch"
            dropdownId={branchDropdownId}
            params={branchParams}
            clearOnParamsChange={false}
            value={branch}
            onChange={(selection) => {
              setBranch(selection);
              refresh();
            }}
            placeholder="Every branch"
            aria-label="Branch"
            className={styles.dropdown}
            advanceFocusOnSelect={false}
          />
        </div>
        <label className={local.cap} htmlFor="till-cp-show">
          Show
        </label>
        <select
          id="till-cp-show"
          className={cx(styles.select, local.showSelect)}
          value={show}
          onChange={(changeEvent) => {
            if (isShowFilter(changeEvent.target.value)) setShow(changeEvent.target.value);
          }}
        >
          {SHOW_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <input
          type="search"
          className={cx(styles.input, local.search)}
          placeholder={SEARCH_PLACEHOLDER}
          aria-label="Search the stores by name"
          data-uppercase="off"
          value={search}
          onChange={(changeEvent) => setSearch(changeEvent.target.value)}
        />
        <label className={local.check}>
          <input
            type="checkbox"
            checked={autoRefresh}
            onChange={(changeEvent) => setAutoRefresh(changeEvent.target.checked)}
          />
          Refresh every minute
        </label>
        <button type="button" className={styles.secondaryButton} onClick={refresh}>
          F5 Refresh
        </button>
      </div>

      <div className={local.tiles} role="list" aria-label="Totals">
        {tileList.map((tile) => (
          <div key={tile.key} className={local.tile} role="listitem">
            <span className={styles.cap}>{tile.caption}</span>
            <span className={cx(local.tileValue, TILE_TONE[tile.tone])} title={tile.value}>
              {tile.value}
            </span>
          </div>
        ))}
      </div>

      <div className={local.storesPane}>
        <StoresTable
          table={storesShown}
          pickedKey={picked || null}
          onPick={(row) => {
            if (!row.total) setPicked(row.key);
          }}
          onOpen={(row) => openBusinessDay(row.row)}
          loading={model.stores.loading}
          error={model.stores.error}
          emptyText={storesEmpty}
          label="Stores"
        />
      </div>

      {flags.length > 0 ? (
        <p className={local.flags} role="status">
          {flags.map((entry, index) => (
            <span key={`${entry.store}-${index}`}>
              {index > 0 ? <br /> : null}
              <b>{entry.store}</b> — {entry.flags}
            </span>
          ))}
        </p>
      ) : null}

      <div className={local.lower}>
        <section className={local.lowerSide} aria-label="Exceptions on the day">
          <p className={local.head}>{EVENTS_HEAD}</p>
          <div className={local.lowerPane}>
            <ReportTable
              table={eventsView}
              pickedKey={null}
              loading={model.events.loading}
              error={model.events.error}
              emptyText="No exception on the day."
              label="Exceptions on the day"
            />
          </div>
        </section>
        <section className={local.lowerSide} aria-label="Cashiers, month-to-date shortage">
          <p className={local.head}>{CASHIERS_HEAD}</p>
          <div className={local.lowerPane}>
            <ReportTable
              table={cashiersView}
              pickedKey={null}
              loading={model.cashiers.loading}
              error={model.cashiers.error}
              emptyText="No shortage this month."
              label="Cashiers"
            />
          </div>
        </section>
      </div>

      <footer className={local.foot}>
        <button
          type="button"
          className={styles.primaryButton}
          disabled={!businessDay.enabled}
          title={businessDay.title}
          onClick={() => openBusinessDay()}
        >
          Enter Business Day
        </button>
        <button
          type="button"
          className={styles.secondaryButton}
          disabled={!sessions.enabled}
          title={sessions.title}
          onClick={openSessions}
        >
          Till Sessions
        </button>
        <button
          type="button"
          className={styles.secondaryButton}
          disabled={!reports.enabled}
          title={reports.title}
          onClick={openReports}
        >
          Till Reports
        </button>
        <button
          type="button"
          className={styles.secondaryButton}
          disabled={!reviewState.enabled}
          title={reviewState.title}
          onClick={addReview}
        >
          Add HO review…
        </button>
        <button
          type="button"
          className={styles.secondaryButton}
          disabled={!canPrint}
          title={canPrint ? "The page as shown, on a landscape page" : "No print right on Cash Position (menu 289)"}
          onClick={print}
        >
          Print
        </button>
        <button
          type="button"
          className={styles.secondaryButton}
          disabled={!canExport}
          title={canExport ? "The three tables as a CSV file" : "No export right on Cash Position (menu 289)"}
          onClick={exportCsv}
        >
          Export
        </button>
        <span className={local.footNote}>{model.loading ? "Loading…" : ""}</span>
      </footer>

      <HoReviewDialog
        store={review}
        asOn={day}
        live={model.live.rows}
        companyId={companyId}
        ownBranchId={ownBranchId}
        headerYear={headerYear}
        onClose={() => setReview(null)}
        onSaved={() => {
          setReview(null);
          refresh();
        }}
      />
    </div>
  );
}
