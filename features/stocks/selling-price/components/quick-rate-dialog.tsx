"use client";

/**
 * QuickRateDialog — change ONE item's selling rates without leaving the bill
 * or the item list (Qt `QuickRateDialog`, notes 146). Ctrl+R on a Sale Bill /
 * Quotation / Sale Order line, or an Item list row ("Change rate").
 *
 * It is menu 30 (Change Selling Price) for one item, on the same routes —
 * `GET /stock/price-bulk?itemId=` is the grid, `POST /stock/price-bulk` saves
 * the changed rows — so the below-cost confirm, dated prices and the Price
 * Change Log come with it. The arithmetic and every rule live in
 * `../quick-rate.ts`; this file is layout, keys and the three reads.
 *
 * Saving needs a GRANTED Edit on menu 30 — `usePagePermissions` reports FULL
 * rights while the user menu is still loading, so only a `granted` status
 * counts; without it the popup is read-only and says so.
 *
 * Keys: Enter walks the prices (and Min) of the shown rows, ↑↓ change unit,
 * Ctrl+S saves, Esc closes (or first drops a figure being typed), F3 opens the
 * item's whole price history, F1 the key sheet. Closing on Escape is
 * ModalShell's, decided per event (only the topmost surface takes it), so the
 * below-cost question, the key sheet or the history over this popup close one
 * at a time.
 *
 * Mounted only while open.
 */
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { useBusinessContext } from "@/components/layout/business-context";
import { cx } from "@/components/design-system/cx";
import { TxnKeysSheet } from "@/components/txn/txn-keys-sheet";
import { useTxnKeys } from "@/components/txn/use-txn-keys";
import { ModalShell } from "@/features/sales/quotation/components/modal-shell";
import qs from "@/features/sales/quotation/page.module.scss";
import { todayIso } from "@/features/sales/quotation/quotation.utils";
import { useGetPriceLogItemHistoryMutation } from "@/features/reports/price-change-log/api/price-log-api";
import { PriceLogHistoryDialog } from "@/features/reports/price-change-log/components/price-log-history-dialog";
import { usePagePermissions } from "@/hooks/useMenuPermissions";
import { getUserInfo } from "@/lib/auth/session";
import { toast } from "@/lib/notify";
import { keySheetRows, withKey } from "@/lib/txn-keys";
import { useAppDispatch } from "@/store/hooks";
import {
  sellingPriceApi,
  useGetItemInwardHistoryMutation,
  useGetSellingPriceLevelNamesQuery,
  useSaveSellingPriceRowsMutation,
} from "../selling-price.api";
import { isHqUserType, LEVEL_BAND_COLOURS, SELLING_PRICE_MENU_ID } from "../selling-price.constants";
import type { BelowCostLine } from "../selling-price.payload";
import type { PriceScope, SellingPricePage } from "../selling-price.types";
import {
  activeLevels,
  applyCellEdit,
  buildQuickRatePayload,
  cellView,
  changedRowCount,
  deltaText,
  fromDayRefusal,
  HISTORY_NOTE,
  historyCells,
  historyNote,
  horizontalStop,
  inwardCells,
  inwardNote,
  isCellEditable,
  isCellFocusable,
  liveLine,
  nextEnterStop,
  parseTyped,
  quickRateBelowCostLines,
  quickRateColumns,
  rowsFromGrid,
  scheduledNotice,
  showAllUnitsOffer,
  shownRows,
  sideLines,
  startColumnIndex,
  startRowIndex,
  statusOf,
  subLine,
  verticalStop,
  type CellPos,
  type QuickRateRow,
} from "../quick-rate";
import { BelowCostDialog } from "./below-cost-dialog";
import { PriceFromField } from "./price-from-field";
import styles from "./quick-rate-dialog.module.scss";

export type QuickRateSaved = {
  itemId: string;
  /** "Apply the new rate to this bill line" was ticked: re-price the line through the screen's own lookup. */
  applyToLine: boolean;
};

export type QuickRateDialogProps = {
  itemId: string;
  /** The line's unit (`iuc_id`): its row is current first, and from a line only it is shown. */
  unitId?: string;
  /** Shown until the grid arrives. */
  itemName: string;
  /** The screen it was opened from (12 Sale Bill, 14 Quotation, 11 Sales Order, 29 Item list). */
  originMenuId: number;
  /** Opened on a document line: offers "Apply the new rate to this bill line". */
  fromLine?: boolean;
  /** "Samsung H1 · PCS", for that tick box. */
  lineText?: string;
  onClose: () => void;
  onSaved: (result: QuickRateSaved) => void;
};

/** Qt fetches up to 100 rows (one item's units × buckets) and 10 inward rows. */
const GRID_LIMIT = 100;
const INWARD_LIMIT = 10;
const HISTORY_LIMIT = 5;

const MODAL_SELECTOR = '[aria-modal="true"]';

const COST_HEADER_TIP =
  "Editable when it is the price row's own cost (an item with no stock yet). With stock, this is " +
  "the stock's average cost, which comes from inward.";
const STOCK_COST_TIP =
  "The stock's average cost (from inward). It changes with inward or a stock adjustment, not here.";
const FROM_TIP = "Today, or a later day: today's rates stay until then.";

type Panel<T> = { status: "loading" } | { status: "ready"; rows: T[] } | { status: "failed"; code: number };

type Editing = { row: number; col: number; text: string };

function topmostModal(): Element | null {
  const all = document.querySelectorAll(MODAL_SELECTOR);
  return all.length ? all[all.length - 1] : null;
}

const SHEET = keySheetRows(
  [
    { action: "saveDraft", label: "Save" },
    { action: "close", label: "Cancel" },
  ],
  [
    { label: "Next price", keyText: "Enter" },
    { label: "Another unit", keyText: "↑ ↓" },
    { label: "Price history", keyText: "F3" },
  ],
);

export function QuickRateDialog(props: QuickRateDialogProps) {
  const { itemId, unitId, itemName, originMenuId, fromLine = false, lineText = "" } = props;
  const dispatch = useAppDispatch();
  const business = useBusinessContext();
  const companyId = business.activeCompany?.id ?? business.selectedCompanyId ?? "";
  const branchId = business.activeBranch?.id ?? business.selectedBranchId ?? "";
  const companyName = business.activeCompany?.name ?? "";

  // A GRANTED Edit on menu 30. Not `permissions.canEdit` alone: the hook
  // answers FULL rights while the user menu loads.
  const rights = usePagePermissions({ menuId: SELLING_PRICE_MENU_ID });
  const editable = rights.status === "granted" && rights.permissions.canEdit;
  const isHq = useMemo(() => isHqUserType(getUserInfo()?.userType), []);

  const levelQuery = useGetSellingPriceLevelNamesQuery();
  const levelsReady = levelQuery.isSuccess || levelQuery.isError;
  const levels = useMemo(() => activeLevels(levelQuery.data), [levelQuery.data]);
  const columns = useMemo(() => quickRateColumns(levels), [levels]);

  const [saveRows] = useSaveSellingPriceRowsMutation();
  const [readInward] = useGetItemInwardHistoryMutation();
  const [readHistory] = useGetPriceLogItemHistoryMutation();

  // ------------------------------------------------------------- state
  const [gridStatus, setGridStatus] = useState<"loading" | "ready" | "failed">("loading");
  const [rows, setRowsState] = useState<QuickRateRow[]>([]);
  const rowsRef = useRef<QuickRateRow[]>([]);
  const setRows = useCallback((next: QuickRateRow[]) => {
    rowsRef.current = next;
    setRowsState(next);
  }, []);
  const [editing, setEditingState] = useState<Editing | null>(null);
  const editingRef = useRef<Editing | null>(null);
  const setEditing = useCallback((next: Editing | null) => {
    editingRef.current = next;
    setEditingState(next);
  }, []);
  const [current, setCurrent] = useState<CellPos | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [scope, setScope] = useState<PriceScope>("BRANCH");
  const [fromDay, setFromDay] = useState(() => todayIso());
  const [apply, setApply] = useState(true);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const [belowCost, setBelowCost] = useState<{ lines: BelowCostLine[]; policy: string } | null>(null);
  const [keysOpen, setKeysOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [inward, setInward] = useState<Panel<ReturnType<typeof inwardCells>>>({ status: "loading" });
  const [history, setHistory] = useState<Panel<ReturnType<typeof historyCells>>>({ status: "loading" });

  const loaded = levelsReady && (gridStatus !== "loading" || !companyId || !branchId);
  const panelRef = useRef<HTMLElement | null>(null);
  const mountedRef = useRef(true);

  const latest = useRef(props);
  useLayoutEffect(() => {
    latest.current = props;
  });

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // ------------------------------------------------------------- reads
  const noContext = !companyId || !branchId;
  /**
   * The grid read, started ONCE per argument set. Not a lazy trigger from a
   * mount effect (it resolves undefined here), and not a second `initiate`
   * per effect run either: under StrictMode's double effect the second one is
   * deduped onto the first and resolves without data. Each run attaches to the
   * same promise instead.
   */
  const gridRead = useRef<{ key: string; promise: Promise<SellingPricePage> } | null>(null);
  useEffect(() => {
    if (!companyId || !branchId) {
      return;
    }
    const arg = { companyId, branchId, itemId, limit: GRID_LIMIT, offset: 0 };
    const key = JSON.stringify(arg);
    if (gridRead.current?.key !== key) {
      gridRead.current = {
        key,
        promise: dispatch(
          sellingPriceApi.endpoints.listSellingPriceRows.initiate(arg, { subscribe: false, forceRefetch: true }),
        ).unwrap(),
      };
    }
    let active = true;
    gridRead.current.promise
      .then((page) => {
        if (!active) return;
        setRows(rowsFromGrid(page.items));
        setGridStatus("ready");
      })
      .catch((error: unknown) => {
        if (!active) return;
        setGridStatus("failed");
        toast.apiError(error, { fallback: "This item's rates could not be read." });
      });
    return () => {
      active = false;
    };
  }, [branchId, companyId, dispatch, itemId, setRows]);

  useEffect(() => {
    if (!companyId || !branchId) {
      return;
    }
    let active = true;
    readInward({ companyId, branchId, itemId, limit: INWARD_LIMIT })
      .unwrap()
      .then((answer) => {
        if (active) setInward({ status: "ready", rows: answer.map((row) => inwardCells(row)) });
      })
      .catch((error: unknown) => {
        if (active) setInward({ status: "failed", code: statusOf(error) });
      });
    return () => {
      active = false;
    };
  }, [branchId, companyId, itemId, readInward]);

  useEffect(() => {
    let active = true;
    readHistory({ itemId, ...(companyId ? { companyId } : {}), limit: HISTORY_LIMIT })
      .unwrap()
      .then((answer) => {
        if (active) setHistory({ status: "ready", rows: answer.map(historyCells) });
      })
      .catch((error: unknown) => {
        if (active) setHistory({ status: "failed", code: statusOf(error) });
      });
    return () => {
      active = false;
    };
  }, [companyId, itemId, readHistory]);

  // ------------------------------------------------------------- derived
  const shown = useMemo(() => shownRows(rows, unitId, showAll), [rows, showAll, unitId]);
  const startRow = useMemo(() => startRowIndex(rows, unitId), [rows, unitId]);
  const startCol = startColumnIndex(columns);
  const changed = changedRowCount(rows);
  const offer = showAllUnitsOffer(rows, unitId, fromLine);
  const headline = rows[0]?.source.itemName || itemName;
  const side = loaded ? sideLines(rows[startRow] ?? null, companyName) : null;
  // The cell the cursor is on. Until a cell reports its own focus it is the
  // start cell, which `autoFocus` took — React drops the focus event that
  // fires during its commit, so that one never reaches onFocus.
  const cursor: CellPos | null =
    current ?? (loaded && rows.length > 0 ? { row: startRow, col: startCol } : null);
  const currentRow = cursor ? (rows[cursor.row] ?? null) : null;
  const currentColumn = cursor ? (columns[cursor.col] ?? null) : null;
  const live = saving
    ? { text: "Saving…", warn: false }
    : liveLine({ row: currentRow, column: currentColumn, levels, changed });

  // ------------------------------------------------------------- cells
  const focusCell = useCallback((pos: CellPos | null) => {
    if (!pos) return;
    panelRef.current
      ?.querySelector<HTMLInputElement>(`[data-qr-cell="${pos.row}:${pos.col}"]`)
      ?.focus();
  }, []);

  /** The figure being typed, committed (Qt: the open editor is committed first). */
  const commitEditing = useCallback(() => {
    const open = editingRef.current;
    if (!open) return;
    setEditing(null);
    const typed = parseTyped(open.text);
    const row = rowsRef.current[open.row];
    const column = columns[open.col];
    if (typed === null || !row || !column) return;
    const next = [...rowsRef.current];
    next[open.row] = applyCellEdit(row, column, typed);
    setRows(next);
  }, [columns, setEditing, setRows]);

  const onCellKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>, pos: CellPos) => {
    if (event.ctrlKey || event.metaKey || event.altKey) {
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      commitEditing();
      focusCell(nextEnterStop(rowsRef.current, shown, columns, editable, pos));
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      commitEditing();
      focusCell(verticalStop(shown, pos, event.key === "ArrowDown" ? 1 : -1));
      return;
    }
    if ((event.key === "ArrowLeft" || event.key === "ArrowRight") && !editingRef.current) {
      event.preventDefault();
      focusCell(horizontalStop(columns, pos, event.key === "ArrowRight" ? 1 : -1));
    }
  };

  // ------------------------------------------------------------- close / keys
  /** Cancel, ×, the backdrop and ModalShell's Escape. */
  const requestClose = useCallback(() => {
    latest.current.onClose();
  }, []);

  // This popup's own keys, live only while it is the topmost surface. Window
  // CAPTURE for one reason: an Escape over a figure being typed must drop that
  // figure (Qt: Esc cancels the open editor) and be marked used before
  // ModalShell's document listener would close the popup on it.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const mine = panelRef.current;
      if (!mine || topmostModal() !== mine) return;
      const bare = !event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey;
      if (event.key === "Escape") {
        if (editingRef.current && !event.defaultPrevented) {
          event.preventDefault();
          setEditing(null);
        }
        return;
      }
      if (event.key === "F3" && bare) {
        event.preventDefault();
        if (!event.repeat) setHistoryOpen(true);
        return;
      }
      if (event.key === "F5") {
        // Never the browser's reload under a popup that holds typed rates.
        event.preventDefault();
      }
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [setEditing]);

  // ------------------------------------------------------------- save
  const postSave = useCallback(
    async (confirmed: boolean) => {
      const today = todayIso();
      const payload = buildQuickRatePayload({
        rows: rowsRef.current,
        companyId,
        branchId,
        scope,
        confirmed,
        effectiveFrom: fromDay || today,
        originMenuId,
      });
      if (payload.rows.length === 0) return;
      savingRef.current = true;
      setSaving(true);
      try {
        const result = await saveRows(payload).unwrap();
        if (!mountedRef.current) return;
        if (result.needsConfirm) {
          // Below cost under "warning": nothing was written. Ask, and re-post
          // confirmed — the server re-runs every check.
          setBelowCost({
            lines: quickRateBelowCostLines(result, rowsRef.current, levels),
            policy: result.belowCostPolicy,
          });
          return;
        }
        const notice = scheduledNotice(result.effectiveFrom, today);
        if (notice) {
          toast.info(notice, { title: "Change Rate" });
        }
        const { onSaved, onClose } = latest.current;
        onSaved({ itemId, applyToLine: fromLine && apply });
        onClose();
      } catch (error) {
        if (!mountedRef.current) return;
        toast.apiError(error, { kept: "Nothing was saved — the rates you typed are still in the popup." });
      } finally {
        savingRef.current = false;
        if (mountedRef.current) setSaving(false);
      }
    },
    [apply, branchId, companyId, fromDay, fromLine, itemId, levels, originMenuId, saveRows, scope],
  );

  const save = useCallback(() => {
    if (!editable || savingRef.current || belowCost || !loaded) return;
    commitEditing();
    if (changedRowCount(rowsRef.current) === 0) return;
    const refusal = fromDayRefusal(fromDay, todayIso());
    if (refusal) {
      toast.info(refusal, { title: "From" });
      return;
    }
    void postSave(false);
  }, [belowCost, commitEditing, editable, fromDay, loaded, postSave]);

  useTxnKeys(
    {
      saveDraft: save,
      // Ctrl+R inside the popup is not the browser's reload.
      changeRate: () => undefined,
    },
    {
      scopeRef: panelRef,
      onHelp: () => {
        if (topmostModal() === panelRef.current) setKeysOpen(true);
      },
    },
  );

  // ------------------------------------------------------------- render bits
  const attachBody = useCallback((node: HTMLDivElement | null) => {
    panelRef.current = (node?.closest(MODAL_SELECTOR) as HTMLElement | null) ?? null;
    // Focus inside the popup the moment it really mounts (ModalPortal mounts a
    // commit late); the start cell takes it over once the grid arrives.
    if (node && !node.contains(document.activeElement)) {
      node.focus();
    }
  }, []);

  const toggleShowAll = (next: boolean) => {
    setShowAll(next);
    const nextShown = shownRows(rowsRef.current, unitId, next);
    const target =
      cursor && nextShown[cursor.row] ? cursor : { row: nextShown.findIndex(Boolean), col: startCol };
    // The rows a tick shows or hides do not include the target: it is in the DOM now.
    window.requestAnimationFrame(() => focusCell(target.row >= 0 ? target : null));
  };

  const rightsText = rights.isLoading
    ? "checking your Edit right on Change Selling Price…"
    : editable
      ? "you can change rates (Change Selling Price)"
      : "read only — no Edit right on Change Selling Price (menu 30)";

  const bandStyle = (levelId: number) => {
    const colours = LEVEL_BAND_COLOURS[levelId - 1] ?? LEVEL_BAND_COLOURS[0];
    // globals.css forces th colours through the variable, with !important.
    return { background: colours.bg, ["--table-header-text" as string]: colours.fg };
  };

  const inwardNoteText = noContext
    ? ""
    : inward.status === "loading"
      ? "Reading the inward…"
      : inward.status === "ready"
        ? inwardNote({ rows: inward.rows.length })
        : inwardNote({ status: inward.code });
  const historyNoteText =
    history.status === "loading"
      ? HISTORY_NOTE
      : history.status === "ready"
        ? historyNote({ rows: history.rows.length })
        : historyNote({ status: history.code });

  return (
    <>
      <ModalShell
        title="Change Rate"
        isOpen
        onClose={requestClose}
        panelClassName={styles.panel}
        footer={
          <div className={styles.footer}>
            {fromLine ? (
              <label
                className={styles.applyLine}
                title="Other lines keep their price; this line is re-priced through the bill's own lookup."
              >
                <input
                  type="checkbox"
                  checked={apply}
                  tabIndex={-1}
                  onChange={(event) => setApply(event.target.checked)}
                />
                <span>Apply the new rate to this bill line ({lineText})</span>
              </label>
            ) : null}
            <span className={styles.footerSpacer} />
            <span className={styles.note}>Enter next price · ↑↓ unit · F3 history · F1 keys</span>
            <button
              type="button"
              className={cx(qs.button, qs.buttonPrimary)}
              tabIndex={-1}
              disabled={!editable || saving || !loaded || changed === 0 || belowCost !== null}
              onMouseDown={(event) => event.preventDefault()}
              onClick={save}
            >
              {withKey("Save", "saveDraft")}
            </button>
            <button
              type="button"
              className={qs.button}
              tabIndex={-1}
              onMouseDown={(event) => event.preventDefault()}
              onClick={requestClose}
            >
              {withKey("Cancel", "close")}
            </button>
          </div>
        }
      >
        <div ref={attachBody} className={styles.body} tabIndex={-1}>
          {/* ── title: the item on the left, company / stock / cost on the right */}
          <div className={styles.top}>
            {/* The shell's header is Qt's small "CHANGE RATE" caption; the ITEM is the headline. */}
            <div className={styles.titles}>
              <span className={styles.title}>{headline}</span>
              <span className={styles.sub}>{loaded ? subLine(rows, itemName) : "Reading the rates…"}</span>
            </div>
            {side ? (
              <div className={styles.side}>
                <span>{side[0]}</span>
                <span>{side[1]}</span>
              </div>
            ) : null}
          </div>

          {/* ── where and from when the new rates apply */}
          <div className={styles.controls}>
            <span className={styles.cap}>Applies to</span>
            <span className={styles.scopeGroup}>
              <button
                type="button"
                tabIndex={-1}
                className={cx(styles.scopeButton, scope === "BRANCH" && styles.scopeButtonOn)}
                aria-pressed={scope === "BRANCH"}
                onClick={() => setScope("BRANCH")}
              >
                This branch
              </button>
              <button
                type="button"
                tabIndex={-1}
                className={cx(styles.scopeButton, scope === "CHAIN" && styles.scopeButtonOn)}
                aria-pressed={scope === "CHAIN"}
                disabled={!isHq}
                title={isHq ? undefined : "All branches is an HQ action."}
                onClick={() => setScope("CHAIN")}
              >
                All branches
              </button>
            </span>
            <span className={styles.cap}>From</span>
            <PriceFromField
              id="quick-rate-from"
              title={FROM_TIP}
              value={fromDay}
              today={todayIso()}
              disabled={!editable}
              onChange={(value) => setFromDay(value || todayIso())}
              onLeave={() => focusCell(cursor)}
            />
            {offer.visible ? (
              <label className={styles.showAll}>
                <input
                  type="checkbox"
                  checked={showAll}
                  tabIndex={-1}
                  onChange={(event) => toggleShowAll(event.target.checked)}
                />
                <span>{offer.text}</span>
              </label>
            ) : null}
            <span className={styles.controlsSpacer} />
            <span className={cx(styles.rights, editable ? styles.toneOk : styles.toneWarn)}>{rightsText}</span>
          </div>

          {/* ── the rate grid */}
          <div className={styles.gridViewport}>
            <table className={styles.grid}>
              <thead>
                <tr className={styles.bandRow}>
                  <th colSpan={5} aria-hidden="true" />
                  {levels.map((level) => (
                    <th key={level.id} colSpan={3} style={bandStyle(level.id)} title={level.name}>
                      {level.name.toUpperCase()}
                    </th>
                  ))}
                  <th aria-hidden="true" />
                </tr>
                <tr className={styles.headRow}>
                  {columns.map((column, c) => (
                    <th
                      key={`${column.kind}-${column.level ?? 0}-${c}`}
                      scope="col"
                      title={
                        column.kind === "profit"
                          ? `${levels.find((l) => l.id === column.level)?.name ?? ""}: profit on cost without tax`
                          : column.kind === "cost" || column.kind === "costWot"
                            ? COST_HEADER_TIP
                            : undefined
                      }
                    >
                      {column.header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loaded && rows.length === 0 ? (
                  <tr>
                    <td colSpan={columns.length} className={styles.empty}>
                      {noContext
                        ? "Pick a company and branch first."
                        : gridStatus === "failed"
                          ? "The rates could not be read."
                          : "No price row of this item at this branch."}
                    </td>
                  </tr>
                ) : null}
                {!loaded ? (
                  <tr>
                    <td colSpan={columns.length} className={styles.empty}>
                      Reading the rates…
                    </td>
                  </tr>
                ) : null}
                {loaded
                  ? rows.map((row, r) => {
                      if (!shown[r]) return null;
                      return (
                        <tr key={`${row.source.uomId}-${row.source.bucketId ?? ""}-${r}`} className={cx(cursor?.row === r && styles.rowCurrent)}>
                          {columns.map((column, c) => {
                            const view = cellView(row, column);
                            const key = `${column.kind}-${column.level ?? 0}-${c}`;
                            if (!isCellFocusable(column)) {
                              return (
                                <td
                                  key={key}
                                  className={cx(
                                    column.kind === "unit" ? styles.unitCell : styles.numCell,
                                    view.muted && styles.muted,
                                  )}
                                >
                                  {view.text}
                                </td>
                              );
                            }
                            const canType = isCellEditable(row, column, editable);
                            const open = editing && editing.row === r && editing.col === c ? editing : null;
                            const moved = Math.abs(view.delta) >= 0.005 && !open;
                            const ownCostTip =
                              (column.kind === "cost" || column.kind === "costWot") && view.muted
                                ? STOCK_COST_TIP
                                : undefined;
                            return (
                              <td
                                key={key}
                                className={cx(
                                  styles.inputCell,
                                  moved && (view.delta > 0 ? styles.cellUp : styles.cellDown),
                                  cursor?.row === r && cursor?.col === c && styles.cellCurrent,
                                )}
                                title={ownCostTip}
                              >
                                {moved ? <span className={styles.delta}>{deltaText(view.delta)}</span> : null}
                                <input
                                  className={cx(
                                    styles.cellInput,
                                    view.muted && styles.muted,
                                    moved && styles.cellInputMoved,
                                    !canType && styles.cellInputReadOnly,
                                  )}
                                  data-qr-cell={`${r}:${c}`}
                                  data-uppercase="off"
                                  value={open ? open.text : view.text}
                                  readOnly={!canType}
                                  inputMode="decimal"
                                  autoComplete="off"
                                  spellCheck={false}
                                  aria-label={`${row.source.unitName ?? ""} ${column.header}`}
                                  // The line's unit, the first level's price: where Qt puts the cursor.
                                  autoFocus={r === startRow && c === startCol}
                                  onFocus={(event) => {
                                    setCurrent({ row: r, col: c });
                                    event.currentTarget.select();
                                  }}
                                  onChange={(event) => {
                                    if (canType) setEditing({ row: r, col: c, text: event.target.value });
                                  }}
                                  onBlur={() => {
                                    if (editingRef.current?.row === r && editingRef.current?.col === c) {
                                      commitEditing();
                                    }
                                  }}
                                  onKeyDown={(event) => onCellKeyDown(event, { row: r, col: c })}
                                />
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })
                  : null}
              </tbody>
            </table>
          </div>

          <p className={cx(styles.live, live.warn && styles.liveWarn)}>{live.text}</p>

          {/* ── what it cost, and who changed it last */}
          <div className={styles.lower}>
            <section className={styles.lowerPanel}>
              <h3 className={styles.section}>Recent inward — what this item cost</h3>
              <table className={styles.small}>
                <thead>
                  <tr>
                    <th scope="col">Date</th>
                    <th scope="col">Type · ref</th>
                    <th scope="col" className={styles.stretch}>
                      From
                    </th>
                    <th scope="col">Qty</th>
                    <th scope="col">Cost w/o tax</th>
                    <th scope="col">Tax</th>
                    <th scope="col">Cost</th>
                    <th scope="col">MRP</th>
                  </tr>
                </thead>
                <tbody>
                  {inward.status === "ready" && inward.rows.length > 0 ? (
                    inward.rows.map((cells, index) => (
                      <tr key={index}>
                        {cells.map((cell, c) => (
                          <td key={c} className={c >= 3 ? styles.num : undefined} title={cell}>
                            {cell}
                          </td>
                        ))}
                      </tr>
                    ))
                  ) : (
                    <tr className={styles.blankRow}>
                      <td colSpan={8} />
                    </tr>
                  )}
                </tbody>
              </table>
              {inwardNoteText ? <p className={styles.note}>{inwardNoteText}</p> : null}
            </section>
            <section className={styles.lowerPanel}>
              <h3 className={styles.section}>Rate changes — who changed it</h3>
              <table className={styles.small}>
                <thead>
                  <tr>
                    <th scope="col">When</th>
                    <th scope="col">Who · device</th>
                    <th scope="col" className={styles.stretch}>
                      What changed
                    </th>
                    <th scope="col">Source</th>
                  </tr>
                </thead>
                <tbody>
                  {history.status === "ready" && history.rows.length > 0 ? (
                    history.rows.map((cells, index) => (
                      <tr key={index}>
                        {cells.map((cell, c) => (
                          <td key={c} className={c === 2 ? styles.wrapCell : undefined} title={cell}>
                            {cell}
                          </td>
                        ))}
                      </tr>
                    ))
                  ) : (
                    <tr className={styles.blankRow}>
                      <td colSpan={4} />
                    </tr>
                  )}
                </tbody>
              </table>
              <p className={styles.note}>{historyNoteText}</p>
            </section>
          </div>
        </div>
      </ModalShell>

      {/* Siblings, not children: their keys must not bubble through this popup's handlers. */}
      {belowCost ? (
        <BelowCostDialog
          lines={belowCost.lines}
          policy={belowCost.policy}
          onBack={() => {
            setBelowCost(null);
            window.requestAnimationFrame(() => focusCell(cursor));
          }}
          onSaveAnyway={() => {
            setBelowCost(null);
            void postSave(true);
          }}
        />
      ) : null}
      {keysOpen ? (
        <TxnKeysSheet open onClose={() => setKeysOpen(false)} document={SHEET.document} lines={SHEET.lines} />
      ) : null}
      {historyOpen ? (
        <PriceLogHistoryDialog
          itemId={itemId}
          itemName={headline}
          companyId={companyId}
          onClose={() => {
            setHistoryOpen(false);
            window.requestAnimationFrame(() => focusCell(cursor));
          }}
        />
      ) : null}
    </>
  );
}
