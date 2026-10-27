"use client";

/**
 * Price Change Log — Reports › Price Change Log (menu 290). Qt
 * `PriceChangeLogEntry` (inventory/report/pricelog/price_change_log_entry.*).
 *
 * "Who changed this rate?" — every change to an item's prices
 * (item_price_master) and qty slabs (item_qty_price), DATE-WISE: who, when,
 * which branch, which device, which screen, from what to what. Read only; the
 * server writes the log in the same transaction as each price write.
 *
 *    filters   the bar: From / To (◀ ▶ move the range), Search, Show; the popup
 *              (F4): Branch (dd 61), Item (dd 42), Show (prices / slabs),
 *              Screen, Change, User (dd 68), with a summary line under the bar
 *    day strip one chip per day (/days); click = jump there
 *    grid      day header rows, change chips, source chips
 *    Enter     the detail — every field Before | After | Change
 *    F3        the item's whole price story
 *    Print / Export CSV — the rows as shown, the filters in the heading
 *    gap check /gaps, in the title: should read 0
 *
 * The menu's VIEW right is the report's access (403 IPCL_RIGHT_VIEW without
 * it); PRINT and EXPORT gate their buttons.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { cx } from "@/components/design-system/cx";
import { useBusinessContext } from "@/components/layout/business-context";
import { TxnKeysSheet } from "@/components/txn/txn-keys-sheet";
import { useTxnKeys } from "@/components/txn/use-txn-keys";
import { sendToPrinter } from "@/features/printing/print-delivery";
import { todayIso } from "@/features/reports/shared/wire/dates";
import { usePagePermissions } from "@/hooks/useMenuPermissions";
import { getUserInfo } from "@/lib/auth/session";
import { toast } from "@/lib/notify";
import { keySheetRows } from "@/lib/txn-keys";
import { useGetPriceLogGapsMutation } from "./api/price-log-api";
import { DayStrip } from "./components/day-strip";
import {
  ACTION_CHOICES,
  FilterBar,
  FiltersDialog,
  SOURCE_CHOICES,
  TABLE_CHOICES,
  type ScreenFilters,
} from "./components/filter-card";
import { PriceLogDetailDialog } from "./components/price-log-detail-dialog";
import { PriceLogGrid, type PriceLogGridHandle } from "./components/price-log-grid";
import { PriceLogHistoryDialog } from "./components/price-log-history-dialog";
import styles from "./page.module.scss";
import { usePriceLogReport } from "./query/use-price-log";
import { NO_ACCESS_MESSAGE } from "./view/errors";
import {
  checkRange,
  csvFileName,
  csvText,
  dayChips,
  filterSummary,
  GAPS_TOOLTIP,
  gapsLabel,
  printedLine,
  printHtml,
  RANGE_TOO_LONG,
  sameSaveOthers,
  stepRange,
  totalsText,
} from "./view/report";
import { PRICE_CHANGE_LOG_HREF, type PriceLogFilters, type PriceLogRow } from "./wire/types";

const HINT = "↑↓ move · Enter details · F3 item history · F4 filters · Ctrl+F search · Ctrl+P print · F1 keys";
const SCOPE = "Every change to an item's prices and qty slabs — who, when, where, from what to what";

const KEY_SHEET = keySheetRows(
  ["print", "find", "close"],
  [
    { label: "Details of the change", keyText: "Enter" },
    { label: "Item history", keyText: "F3" },
    { label: "Filters (branch, item, user…)", keyText: "F4" },
    { label: "One day earlier / later", keyText: "◀ ▶" },
    { label: "Move", keyText: "↑ ↓" },
  ],
);

function initialFilters(): ScreenFilters {
  // Today by default: the question is nearly always "who changed it today".
  const today = todayIso();
  return { from: today, to: today, branch: null, item: null, user: null, table: "BOTH", source: "", action: "" };
}

/** The screen's filters as the routes read them — a blank one is not sent. */
function wireFilters(companyId: string, f: ScreenFilters, search: string): PriceLogFilters {
  return {
    companyId,
    branchId: f.branch?.id,
    fromDate: f.from,
    toDate: f.to,
    priceTable: f.table,
    itemId: f.item?.id,
    userId: f.user?.id,
    source: f.source,
    action: f.action,
    search,
  };
}

function download(text: string, fileName: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

type GapsState = { text: string; tone: "ok" | "bad" } | null;

export default function PriceChangeLogScreen() {
  const router = useRouter();
  const { activeCompany } = useBusinessContext();
  const companyId = activeCompany?.id ?? "";
  const permissions = usePagePermissions({ href: PRICE_CHANGE_LOG_HREF });
  const canPrint = permissions.permissions.canPrint;
  const canExport = permissions.permissions.canExport;

  const { report, refresh } = usePriceLogReport();
  const [filters, setFilters] = useState<ScreenFilters>(initialFilters);
  const [search, setSearch] = useState("");
  const latest = useRef({ filters, search, companyId });
  useEffect(() => {
    latest.current = { filters, search, companyId };
  });

  const gridRef = useRef<PriceLogGridHandle | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);

  /* ---- loading (Qt refresh) */
  const run = useCallback(
    (next: ScreenFilters) => {
      const company = latest.current.companyId;
      if (!company) return;
      const check = checkRange(next.from, next.to);
      if (!check.ok) {
        if (check.reason === "too-long") toast.warning(RANGE_TOO_LONG, { title: "Date range" });
        return;
      }
      const applied = check.swapped ? { ...next, from: check.from, to: check.to } : next;
      if (check.swapped) setFilters(applied);
      refresh(wireFilters(company, applied, latest.current.search));
    },
    [refresh],
  );

  const onChange = useCallback(
    (patch: Partial<ScreenFilters>) => {
      const next = { ...latest.current.filters, ...patch };
      latest.current = { ...latest.current, filters: next };
      setFilters(next);
      run(next);
    },
    [run],
  );
  const onStep = useCallback(
    (delta: -1 | 1) => {
      const current = latest.current.filters;
      const moved = stepRange(current.from, current.to, delta);
      if (moved) onChange(moved);
    },
    [onChange],
  );
  const onShow = useCallback(() => run(latest.current.filters), [run]);

  /* ---- the first run and the gap check, per company */
  const [getGaps] = useGetPriceLogGapsMutation();
  const [gaps, setGaps] = useState<{ companyId: string; label: GapsState }>({ companyId: "", label: null });
  useEffect(() => {
    if (!companyId) return;
    run(latest.current.filters);
    let live = true;
    getGaps({ companyId })
      .unwrap()
      .then((answer) => {
        if (live) setGaps({ companyId, label: gapsLabel(answer) });
      })
      .catch(() => {
        // The check is a reassurance, not the report: nothing to say when it fails.
      });
    return () => {
      live = false;
    };
  }, [companyId, getGaps, run]);
  const gapsShown = gaps.companyId === companyId ? gaps.label : null;

  /* ---- selection: the first change after each load (Qt setCurrentCell(1, Time)) */
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [seenVersion, setSeenVersion] = useState(report.version);
  if (seenVersion !== report.version) {
    setSeenVersion(report.version);
    setSelectedId(report.rows[0]?.ipclId ?? null);
  }
  const currentRow = useMemo(
    () => (selectedId ? (report.rows.find((r) => r.ipclId === selectedId) ?? null) : null),
    [report.rows, selectedId],
  );

  /* ---- drill */
  const [detail, setDetail] = useState<{ ipclId: string; others: number } | null>(null);
  const [history, setHistory] = useState<{ itemId: string; itemName: string } | null>(null);
  const [keysOpen, setKeysOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const refocusGrid = useCallback(() => window.setTimeout(() => gridRef.current?.focus(), 0), []);

  const openDetail = useCallback(
    (row?: PriceLogRow | null) => {
      const target = row ?? currentRow;
      if (!target) return;
      setSelectedId(target.ipclId);
      setDetail({ ipclId: target.ipclId, others: sameSaveOthers(report.rows, target) });
    },
    [currentRow, report.rows],
  );
  const openHistory = useCallback(() => {
    let item: { itemId: string; itemName: string } | null = currentRow
      ? { itemId: currentRow.itemId, itemName: currentRow.itemName ?? "" }
      : null;
    if (!item && filters.item) item = { itemId: filters.item.id, itemName: filters.item.text };
    if (!item) {
      toast.info("Stand on a change, or pick an item first.", { title: "Item history" });
      return;
    }
    setHistory(item);
  }, [currentRow, filters.item]);
  const closeFilters = useCallback(() => {
    setFiltersOpen(false);
    refocusGrid();
  }, [refocusGrid]);
  /** Qt btnClearFilters: branch, item, user and the three lists back to "any", and the report runs. */
  const clearFilters = useCallback(() => {
    onChange({ branch: null, item: null, user: null, table: "BOTH", source: "", action: "" });
  }, [onChange]);
  const closeDetail = useCallback(() => {
    setDetail(null);
    refocusGrid();
  }, [refocusGrid]);
  const closeHistory = useCallback(() => {
    setHistory(null);
    refocusGrid();
  }, [refocusGrid]);

  /* ---- print / export: the rows as shown, the filters in the heading */
  const summary = useCallback(
    () =>
      filterSummary({
        from: filters.from,
        to: filters.to,
        branchName: filters.branch?.text,
        itemName: filters.item?.text,
        tableWord: filters.table !== "BOTH" ? TABLE_CHOICES.find((c) => c.value === filters.table)?.label : null,
        sourceWord: filters.source ? SOURCE_CHOICES.find((c) => c.value === filters.source)?.label : null,
        actionWord: filters.action ? ACTION_CHOICES.find((c) => c.value === filters.action)?.label : null,
        userName: filters.user?.text,
        search,
      }),
    [filters, search],
  );
  const hasRows = report.rows.length > 0 && !report.loading;

  const exportCsv = useCallback(() => {
    if (!canExport || !hasRows) return;
    const fileName = csvFileName(filters.from, filters.to);
    download(csvText(report.rows), fileName);
    toast.success(`Saved ${fileName}.`, { title: "Export" });
  }, [canExport, filters.from, filters.to, hasRows, report.rows]);

  const print = useCallback(() => {
    if (!canPrint) {
      toast.warning("You do not have print rights on the Price Change Log.", { title: "Print" });
      return;
    }
    if (!hasRows) {
      toast.info("There is nothing to print in this range.", { title: "Print" });
      return;
    }
    const html = printHtml({
      rows: report.rows,
      days: report.days,
      summary: summary(),
      printed: printedLine(new Date(), getUserInfo()?.userName),
    });
    // A hidden frame prints the table alone — never window.print() of the live page.
    sendToPrinter(URL.createObjectURL(new Blob([html], { type: "text/html;charset=utf-8" })));
  }, [canPrint, hasRows, report.days, report.rows, summary]);

  const closeScreen = useCallback(() => {
    if (typeof window !== "undefined" && window.history.length > 1) router.back();
    else router.push("/home");
  }, [router]);

  const focusSearch = useCallback(() => {
    searchRef.current?.focus();
    searchRef.current?.select();
  }, []);

  /* ---- keys: Ctrl+P / Ctrl+F / Esc / F1 shared; F3 the screen's own */
  useTxnKeys(
    {
      // Always bound, so Ctrl+P never falls through to the browser printing the screen.
      print,
      find: focusSearch,
      close: closeScreen,
    },
    { onHelp: () => setKeysOpen(true) },
  );
  const f3 = useRef(openHistory);
  useEffect(() => {
    f3.current = openHistory;
  });
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.key !== "F3" && event.key !== "F4") || event.defaultPrevented) return;
      if (event.ctrlKey || event.altKey || event.metaKey || event.shiftKey) return;
      // A dialog over the screen owns the keyboard.
      if (document.querySelector('[aria-modal="true"]')) return;
      event.preventDefault();
      if (event.repeat) return;
      // F4 — the filters popup (Qt QShortcut on the window).
      if (event.key === "F4") setFiltersOpen(true);
      else f3.current();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  /* ---- render */
  if (permissions.isDenied || report.denied) {
    return <div className={styles.denied}>{NO_ACCESS_MESSAGE}</div>;
  }

  const totals = report.loading ? { text: "loading…", cap: "" } : report.loaded ? totalsText(report.rows, report.total) : { text: "", cap: "" };
  const chips = dayChips(report.days);

  return (
    <div className={styles.page}>
      <header className={styles.titleBar}>
        <div>
          <h1 className={styles.title}>Price Change Log</h1>
          <p className={styles.subtitle}>{SCOPE}</p>
        </div>
        {gapsShown ? (
          <span
            className={cx(styles.gaps, gapsShown.tone === "ok" ? styles.gapsOk : styles.gapsBad)}
            title={GAPS_TOOLTIP}
          >
            {gapsShown.text}
          </span>
        ) : null}
      </header>

      <FilterBar
        filters={filters}
        onChange={onChange}
        onStep={onStep}
        search={search}
        onSearch={(text) => {
          latest.current = { ...latest.current, search: text };
          setSearch(text);
        }}
        onShow={onShow}
        onOpenFilters={() => setFiltersOpen(true)}
        searchRef={searchRef}
      />

      <DayStrip chips={chips} onPick={(day) => gridRef.current?.jumpToDay(day)} totals={totals.text} cap={totals.cap} />

      {!companyId ? (
        <div className={styles.emptyState}>Choose a company in the header first.</div>
      ) : (
        <div className={styles.body} aria-busy={report.loading}>
          {report.loading ? <div className={styles.progress} aria-hidden="true" /> : null}
          <PriceLogGrid
            rows={report.rows}
            days={report.loading ? null : report.days}
            selectedId={selectedId}
            onSelect={(row) => setSelectedId(row.ipclId)}
            onOpen={(row) => openDetail(row)}
            ariaLabel="Price changes"
            emptyText={
              report.loading && !report.loaded
                ? "Loading…"
                : report.failed
                  ? "The price change log could not be read."
                  : "No price changes in this range"
            }
            autoFocus
            handleRef={gridRef}
            stale={report.loading && report.rows.length > 0}
          />
        </div>
      )}

      <div className={styles.hint}>{HINT}</div>

      <footer className={styles.footer}>
        <button type="button" className={styles.button} tabIndex={-1} onClick={() => openDetail()} disabled={!currentRow}>
          Details<span className={styles.key}>Enter</span>
        </button>
        <button type="button" className={styles.button} tabIndex={-1} onClick={openHistory}>
          Item history<span className={styles.key}>F3</span>
        </button>
        <span className={styles.footerSpacer} />
        <button
          type="button"
          className={styles.button}
          tabIndex={-1}
          onClick={exportCsv}
          disabled={!canExport || !hasRows}
          title={canExport ? "Save the rows as shown as a CSV file" : "You do not have export rights"}
        >
          Export CSV
        </button>
        <button
          type="button"
          className={styles.button}
          tabIndex={-1}
          onClick={print}
          disabled={!canPrint || !hasRows}
          title={canPrint ? "Print the rows as shown, landscape" : "You do not have print rights"}
        >
          Print<span className={styles.key}>Ctrl+P</span>
        </button>
        <button type="button" className={styles.button} tabIndex={-1} onClick={closeScreen}>
          Close<span className={styles.key}>Esc</span>
        </button>
      </footer>

      {detail ? (
        <PriceLogDetailDialog
          ipclId={detail.ipclId}
          sameSaveOthers={detail.others}
          companyId={companyId}
          branchId={filters.branch?.id}
          onClose={closeDetail}
        />
      ) : null}
      {history ? (
        <PriceLogHistoryDialog
          itemId={history.itemId}
          itemName={history.itemName}
          companyId={companyId}
          branchId={filters.branch?.id}
          onClose={closeHistory}
        />
      ) : null}
      <FiltersDialog
        isOpen={filtersOpen}
        companyId={companyId}
        filters={filters}
        onChange={onChange}
        onClear={clearFilters}
        onClose={closeFilters}
      />
      <TxnKeysSheet
        open={keysOpen}
        onClose={() => {
          setKeysOpen(false);
          refocusGrid();
        }}
        document={KEY_SHEET.document}
        lines={KEY_SHEET.lines}
      />
    </div>
  );
}
