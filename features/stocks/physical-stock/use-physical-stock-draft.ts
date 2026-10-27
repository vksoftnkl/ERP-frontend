"use client";

/**
 * Physical Stock Update — the count sheet's network half. The draft is a
 * local reducer (`physical-stock.state.ts`, pure); this hook does what the Qt
 * `PhysicalStockEntry` does over the wire — draw the sheet, resolve a pick, a
 * scan or a textile batch label into holdings, save, post, cancel, load, step
 * to the sheet before / after — and speaks to the operator in the Qt screen's
 * own words.
 */
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";
import { useBusinessContext } from "@/components/layout/business-context";
import { useGetTxnAdjacentMutation } from "@/components/txn/txn-adjacent";
import { usePagePermissions } from "@/hooks/useMenuPermissions";
import { getUserInfo } from "@/lib/auth/session";
import { toast } from "@/lib/notify";
import { documentRights, type DocumentRights } from "@/lib/permissions/document-rights";
import { RESTORED_MESSAGE_OPTIONS, restoredMessage, screenMemory } from "@/lib/screen-memory";
import { useUiTableId } from "@/lib/ui-tables";
import {
  useForgetIfWritingOnUnmount,
  useRecalledOnce,
  useRememberWrite,
  type ScreenMemoryOption,
} from "@/lib/use-screen-memory";
import { useGetQuotationGridLayoutQuery } from "@/store/api/quotationApi";
import { useAppDispatch } from "@/store/hooks";
import { accountingYearOf, todayIso } from "@/features/sales/quotation/quotation.utils";
import { afterMessage, askYesNo, say } from "./components/notice";
import {
  physicalStockApi,
  usePhysicalStockCancelMutation,
  usePhysicalStockSaveMutation,
} from "./physical-stock.api";
import {
  resolveCountLayout,
  visibleCountColumns,
  type CountColumn,
} from "./physical-stock.columns";
import {
  COUNT_SHEET_MAX_PAGES,
  COUNT_SHEET_PAGE_SIZE,
  PHYSICAL_STOCK_LINES_UI_TABLE_KEY,
  PhysicalStockCols as Cols,
  STATUS_CANCELLED,
  STATUS_DRAFT,
  STATUS_POSTED,
} from "./physical-stock.constants";
import { toLocalDateTime } from "./physical-stock.format";
import {
  EMPTY_SHEET_FILTER,
  applyNegativeOnly,
  emptySheetMessage,
  sheetFilterQuery,
  sheetFilterSummary,
  type SheetFilter,
} from "./physical-stock.sheet-filter";
import {
  CANCEL_DRAFT_CONFIRM,
  CANCEL_POSTED_CONFIRM,
  apiErrorText,
  bookBeforeSave,
  bookMovedLines,
  bookMovedText,
  buildPayload,
  buildPostPayload,
  lineProblemsMessage,
  postConfirmMessage,
  postedMessage,
  refusalLineProblems,
  savedDraftMessage,
} from "./physical-stock.payload";
import {
  computeTotals,
  createDraft,
  hasHoldings,
  insertHoldings,
  isCountWorthRemembering,
  isEditable,
  physicalStockReducer,
  type DraftSeed,
  type HeaderField,
} from "./physical-stock.state";
import type {
  CountSheetRow,
  CountTotals,
  PhysicalStockDocKey,
  PhysicalStockDraft,
  PhysicalStockScope,
  SessionScope,
} from "./physical-stock.types";
import { validateBeforeSave, type SaveRefusalFocus } from "./physical-stock.validate";

export type PhysicalStockBusy = "idle" | "sheet" | "loading" | "saving" | "posting" | "cancelling";

export type FocusRequest = { row: number; col: number; nonce: number };

/** The header controls a refusal can send the operator back to. */
export const HEADER_FIELD_IDS: Record<SaveRefusalFocus, string> = {
  godown: "physical-stock-godown",
  docDate: "physical-stock-doc-date",
  freezeTo: "physical-stock-freeze-to",
};

/**
 * The cursor onto a header control — AFTER the message that sent it there is
 * answered, when there is one: the popup holds the focus while it is up and
 * drops it when it goes (`afterMessage`).
 */
function focusHeader(field: SaveRefusalFocus | undefined, afterMessageId?: string): void {
  if (!field || typeof window === "undefined") {
    return;
  }
  const focus = () => document.getElementById(HEADER_FIELD_IDS[field])?.focus();
  if (afterMessageId) {
    afterMessage(afterMessageId, focus);
    return;
  }
  window.requestAnimationFrame(focus);
}

/** What Qt says when Previous / Next has nowhere to go (`stepDocument()`). */
export const STEP_NOTICES = {
  newHasNoNext: "A new sheet is the newest — nothing comes after it.",
  none: "There are no count sheets yet.",
  oldest: "This is the oldest count sheet.",
  newest: "This is the newest count sheet.",
} as const;

/** The HTTP status a failed RTK call carries, if any. */
function statusOf(error: unknown): number | undefined {
  const status = (error as { status?: unknown } | null)?.status;
  return typeof status === "number" ? status : undefined;
}

function useSessionScope(): SessionScope {
  const { activeCompany, activeBranch, activeFiscalYear } = useBusinessContext();
  const companyId = activeCompany?.id ?? activeCompany?.compId ?? "";
  const branchId = activeBranch?.id ?? "";
  const accYear = (activeFiscalYear?.name ?? "").trim() || accountingYearOf(todayIso());
  // The registered device the login matched — the one that mints sheet numbers.
  const deviceId = getUserInfo()?.deviceId ?? "";
  return useMemo(
    () => ({ companyId, branchId, accYear, deviceId }),
    [accYear, branchId, companyId, deviceId],
  );
}

/**
 * The tenant on the header, as this screen resolves it — what the page asks
 * screen memory about. The same three values a new sheet is seeded with, or a
 * remembered count would never be found again.
 */
export function usePhysicalStockScope(): PhysicalStockScope {
  const { companyId, branchId, accYear } = useSessionScope();
  return useMemo(() => ({ companyId, branchId, accYear }), [accYear, branchId, companyId]);
}

function seedOf(scope: SessionScope): DraftSeed {
  return { scope, today: todayIso(), now: toLocalDateTime(new Date()) };
}

function scopeOfDraft(draft: PhysicalStockDraft): PhysicalStockScope {
  return { companyId: draft.companyId, branchId: draft.branchId, accYear: draft.accYear };
}

export type PhysicalStockDraftApi = {
  draft: PhysicalStockDraft;
  totals: CountTotals;
  editable: boolean;
  busy: PhysicalStockBusy;
  /** Every column, joined to ui table 28 — for the grid's header order. */
  layout: CountColumn[];
  /** The columns drawn, blind mode applied. */
  columns: CountColumn[];
  focusRequest: FocusRequest | null;
  /** The menu's rights, read as document rights; the screen ANDs each with the status. */
  rights: DocumentRights;
  cancelPrompt: { title: string } | null;
  setHeader: (field: HeaderField, value: string) => void;
  selectGodown: (id: string, name: string) => void;
  selectReason: (id: string, name: string) => void;
  toggleFreeze: (on: boolean) => void;
  setFreezeWindow: (field: "freezeFrom" | "freezeTo", value: string) => void;
  setBlind: (blind: boolean) => void;
  setCounted: (rowKey: string, text: string) => void;
  setRemarks: (rowKey: string, text: string) => void;
  typeBarcode: (rowKey: string, text: string) => void;
  commitBarcode: (rowKey: string, text: string) => void;
  /**
   * ↓ in a blank row's Barcode cell: whether the item list may open for it —
   * a draft open for entry, with a godown. Empties the cell when it may.
   */
  openItemList: (rowKey: string) => boolean;
  pickItem: (rowKey: string, itemId: string, itemName: string) => void;
  pickReason: (rowKey: string, id: string, name: string) => void;
  /** F9 — opens the filter dialog (after the godown check). */
  loadCountSheet: () => void;
  sheetDialog: { open: boolean; filter: SheetFilter };
  submitSheetFilter: (filter: SheetFilter) => void;
  dismissSheetFilter: () => void;
  newDocument: () => void;
  /** Save Draft — writes the sheet and nothing else. No stock moves. */
  saveDraft: () => void;
  /** Post — saves AND posts in one call; asks first. */
  postDocument: () => void;
  cancelVoucher: () => void;
  confirmCancel: (reason: string) => void;
  dismissCancel: () => void;
  edit: () => void;
  load: (key: PhysicalStockDocKey, openForEdit: boolean) => void;
  /** Alt+PgUp / Alt+PgDn — the sheet before / after this one (`GET /txn/adjacent`). */
  stepDocument: (previous: boolean) => void;
  /** Where keying starts — the godown while blank, else the first line. */
  focusEntryStart: () => void;
  /** Runs `then` unless the operator declines to throw unsaved work away. */
  guardDirty: (title: string, message: string, then: () => void) => void;
  // ----- screen memory: the count outlives a trip to another screen -----
  /** The sheet on screen came back from screen memory rather than being opened fresh. */
  resumed: boolean;
  /** After a resume: say so once. */
  finishResume: () => Promise<void>;
  /** Drop the remembered count — the operator discarded it. */
  forgetRemembered: () => void;
};

export function usePhysicalStockDraft(
  opts: {
    memory?: ScreenMemoryOption;
    /** `stock.auto_batch_no` — a scanned code may be a textile batch label. */
    autoBatchNo?: boolean;
  } = {},
): PhysicalStockDraftApi {
  const { memory, autoBatchNo = false } = opts;
  const session = useSessionScope();
  const sessionRef = useRef(session);
  const appDispatch = useAppDispatch();
  // The count the operator left on this screen, when the page is reopening on
  // it (lib/screen-memory). Read once; null for every fresh open. It is dirty by
  // definition, so the late-context `scopeSeeded` below leaves it alone.
  const recalled = useRecalledOnce<PhysicalStockDraft>(memory, session);
  const resumed = recalled !== null;
  const [draft, dispatch] = useReducer(
    physicalStockReducer,
    session,
    (scope) => recalled ?? createDraft(seedOf(scope)),
  );
  // The latest of each, for the async flows below to read after an await.
  const draftRef = useRef(draft);
  const autoBatchNoRef = useRef(autoBatchNo);
  useLayoutEffect(() => {
    sessionRef.current = session;
    draftRef.current = draft;
    autoBatchNoRef.current = autoBatchNo;
  });
  // A cursor move queued for after a render must not land on a screen that has gone.
  const aliveRef = useRef(true);
  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);
  const [busy, setBusyState] = useState<PhysicalStockBusy>("idle");
  const busyRef = useRef<PhysicalStockBusy>("idle");
  const setBusy = useCallback((value: PhysicalStockBusy) => {
    busyRef.current = value;
    setBusyState(value);
  }, []);
  const [focusRequest, setFocusRequest] = useState<FocusRequest | null>(null);
  const [cancelPrompt, setCancelPrompt] = useState<{ title: string } | null>(null);
  const [saveDocument] = usePhysicalStockSaveMutation();
  const [cancelDocument] = usePhysicalStockCancelMutation();
  const [adjacentDocument] = useGetTxnAdjacentMutation();
  const { permissions } = usePagePermissions();
  const rights = useMemo(() => documentRights(permissions), [permissions]);

  // --- screen memory -------------------------------------------------------
  // Every change is written through, so the count is there when the operator
  // comes back from another screen; forgotten once nothing on screen is worth
  // bringing back, and when the screen goes mid save / post / cancel — that
  // write lands after the screen is gone, and the sheet must not come back to
  // be posted twice. The sheet cache is not kept: it is refetched on demand.
  useRememberWrite(memory, draft, {
    scopeOf: scopeOfDraft,
    shouldKeep: isCountWorthRemembering,
  });
  useForgetIfWritingOnUnmount(
    memory,
    () =>
      busyRef.current === "saving" ||
      busyRef.current === "posting" ||
      busyRef.current === "cancelling",
    () => scopeOfDraft(draftRef.current),
  );
  const memoryKey = memory?.key ?? "";
  const finishResume = useCallback(async () => {
    // One tick first: this runs from the mount effect.
    await new Promise((resolve) => window.setTimeout(resolve, 0));
    toast.info(restoredMessage("physical stock count"), RESTORED_MESSAGE_OPTIONS);
  }, []);
  /** The operator discarded the count: it must not come back. */
  const forgetRemembered = useCallback(() => {
    if (memoryKey) {
      screenMemory.forget(memoryKey, scopeOfDraft(draftRef.current));
    }
  }, [memoryKey]);

  // The godown's count sheet, fetched ONCE and kept, so picking the twelfth
  // item costs no round trip. Dropped whenever the godown, the document or
  // the screen changes.
  const sheetCacheRef = useRef<{ signature: string; rows: CountSheetRow[] } | null>(null);
  const loadSeqRef = useRef(0);

  const uiTableId = useUiTableId(PHYSICAL_STOCK_LINES_UI_TABLE_KEY);
  const { data: layoutRows } = useGetQuotationGridLayoutQuery(
    { uiTableId },
    { skip: !uiTableId },
  );
  const layout = useMemo(() => resolveCountLayout(layoutRows), [layoutRows]);
  const columns = useMemo(() => visibleCountColumns(layout, draft.blind), [draft.blind, layout]);
  const totals = useMemo(() => computeTotals(draft.lines), [draft.lines]);
  const editable = isEditable(draft);

  const requestFocus = useCallback((row: number, col: number) => {
    setFocusRequest({ row, col, nonce: Date.now() + Math.random() });
  }, []);

  /** A line's place on screen NOW — lines may have been added above it meanwhile. */
  const indexOfRow = useCallback(
    (rowKey: string) => draftRef.current.lines.findIndex((line) => line.key === rowKey),
    [],
  );

  /**
   * Where the cursor starts (Qt `focusEntryStart()`): the godown while it is
   * blank — it is required, and nothing can be picked or loaded before it;
   * then the first line's Counted Qty, or the blank row's Barcode while the
   * sheet is still empty (Qt says Item; Barcode is the scan field AND the item
   * search, as on Opening Stock). A read-only sheet: just the grid. After the
   * render the caller's change causes.
   */
  const focusEntryStart = useCallback(() => {
    window.requestAnimationFrame(() =>
      window.setTimeout(() => {
        if (!aliveRef.current) {
          return;
        }
        const current = draftRef.current;
        if (isEditable(current) && !current.godownId) {
          focusHeader("godown");
          return;
        }
        requestFocus(0, current.lines[0]?.lotId ? Cols.CountedQty : Cols.Barcode);
      }, 0),
    );
  }, [requestFocus]);

  /**
   * A count line is a holding in ONE godown, so nothing is picked or scanned
   * before it is chosen (Qt `requireHeaderGodown()`): says so, and puts the
   * cursor on the godown once the message is answered.
   */
  const requireHeaderGodown = useCallback((): boolean => {
    if (draftRef.current.godownId) {
      return true;
    }
    const id = say.warn(
      "Godown first",
      "A count line is a holding in one godown. Choose which godown is being counted first.",
    );
    focusHeader("godown", id);
    return false;
  }, []);

  // A business context that arrives after the screen re-seeds a clean sheet.
  useEffect(() => {
    dispatch({ type: "scopeSeeded", scope: session });
  }, [session]);

  // -------------------------------------------------------------------------
  // The count sheet
  // -------------------------------------------------------------------------

  const fetchWholeSheet = useCallback(
    async (
      scope: PhysicalStockScope,
      godownId: string,
      filter?: SheetFilter,
    ): Promise<CountSheetRow[]> => {
      const rows: CountSheetRow[] = [];
      // No filter (the scan / pick cache): includeZero is INCLUDED by default
      // server-side, which is right there — a holding the book says is empty
      // is exactly where a count finds something. Load Sheet's own filter
      // always says it (see sheetFilterQuery).
      for (let page = 0; page < COUNT_SHEET_MAX_PAGES; page += 1) {
        const batch = await appDispatch(
          physicalStockApi.endpoints.physicalStockCountSheet.initiate(
            {
              ...scope,
              godownId,
              ...(filter ? sheetFilterQuery(filter) : {}),
              limit: COUNT_SHEET_PAGE_SIZE,
              offset: page * COUNT_SHEET_PAGE_SIZE,
            },
            { subscribe: false, forceRefetch: true },
          ),
        ).unwrap();
        rows.push(...batch);
        if (batch.length < COUNT_SHEET_PAGE_SIZE) {
          break;
        }
      }
      return rows;
    },
    [appDispatch],
  );

  const ensureSheetCache = useCallback(
    async (scope: PhysicalStockScope, godownId: string): Promise<CountSheetRow[] | null> => {
      const signature = `${scope.companyId}|${scope.branchId}|${scope.accYear}|${godownId}`;
      const cached = sheetCacheRef.current;
      if (cached && cached.signature === signature) {
        return cached.rows;
      }
      try {
        const rows = await fetchWholeSheet(scope, godownId);
        sheetCacheRef.current = { signature, rows };
        return rows;
      } catch (error) {
        say.error(apiErrorText(error));
        return null;
      }
    },
    [fetchWholeSheet],
  );

  const reset = useCallback(() => {
    sheetCacheRef.current = null;
    dispatch({ type: "reset", seed: seedOf(sessionRef.current) });
  }, []);

  /** After a save / post / cancel: a fresh sheet with the run's header carried over. */
  const startNext = useCallback(() => {
    sheetCacheRef.current = null;
    dispatch({ type: "startNext", seed: seedOf(sessionRef.current) });
    focusEntryStart();
  }, [focusEntryStart]);

  /** The Load Sheet filter dialog, and the filter it was last answered with (Qt `m_sheetFilter`). */
  const [sheetDialogOpen, setSheetDialogOpen] = useState(false);
  const [sheetFilter, setSheetFilter] = useState<SheetFilter>(EMPTY_SHEET_FILTER);

  /** F9 / Load Sheet — asks what to draw first (Qt `loadCountSheet`). */
  const loadCountSheet = useCallback(() => {
    const current = draftRef.current;
    if (!isEditable(current) || busyRef.current !== "idle") {
      return;
    }
    if (!current.godownId) {
      const id = say.warn(
        "Godown first",
        "A count sheet is the holdings of one godown. Choose which one is being counted.",
      );
      focusHeader("godown", id);
      return;
    }
    setSheetDialogOpen(true);
  }, []);

  const dismissSheetFilter = useCallback(() => {
    setSheetDialogOpen(false);
    requestFocus(0, Cols.CountedQty);
  }, [requestFocus]);

  /**
   * The dialog answered. A sheet with nothing on it takes the holdings whole;
   * one already under way keeps every line (and what was counted on it) and
   * ADDS what is missing — group after group onto one sheet, and a reload can
   * never wipe a count (Qt `loadCountSheet`).
   */
  const submitSheetFilter = useCallback(
    (filter: SheetFilter) => {
      setSheetDialogOpen(false);
      setSheetFilter(filter);
      void (async () => {
        const current = draftRef.current;
        if (!isEditable(current) || busyRef.current !== "idle" || !current.godownId) {
          return;
        }
        setBusy("sheet");
        let rows: CountSheetRow[];
        try {
          rows = applyNegativeOnly(
            await fetchWholeSheet(scopeOfDraft(current), current.godownId, filter),
            filter,
          );
        } catch (error) {
          say.error(apiErrorText(error));
          return;
        } finally {
          setBusy("idle");
        }
        if (draftRef.current.godownId !== current.godownId) {
          return; // the godown moved while the sheet was being drawn
        }
        if (rows.length === 0) {
          say.info("Nothing to count", emptySheetMessage(filter));
          return;
        }
        const latest = draftRef.current;
        if (hasHoldings(latest.lines)) {
          const blank = latest.lines.find((line) => !line.lotId);
          if (blank) {
            dispatch({
              type: "holdingsAdded",
              rowKey: blank.key,
              holdings: rows,
              itemName: sheetFilterSummary(filter),
            });
            return;
          }
        }
        dispatch({ type: "sheetApplied", rows, godownName: current.godownName });
        requestFocus(0, Cols.CountedQty);
      })();
    },
    [fetchWholeSheet, requestFocus, setBusy],
  );

  /**
   * Every holding of one item in this godown, from the blank row on down.
   * Shared by the picker and the scanner, so a scanned line and a picked one
   * cannot be filled differently.
   */
  const addHoldingsForItem = useCallback(
    async (rowKey: string, itemId: string, itemName: string) => {
      const current = draftRef.current;
      const rows = await ensureSheetCache(scopeOfDraft(current), current.godownId);
      if (!rows) {
        return;
      }
      const holdings = rows.filter((row) => row.itemId === itemId);
      if (holdings.length === 0) {
        say.info(
          "Nothing to count",
          `${itemName} has no holding in this godown, so it has no book quantity and cannot ` +
            "have a variance.\n\nStock found on the shelf with no holding behind it is an " +
            "adjustment, not a count.",
        );
        dispatch({ type: "blankRowCleared", rowKey });
        return;
      }
      const latest = draftRef.current;
      const preview = insertHoldings(latest.lines, rowKey, holdings, latest.seq);
      dispatch({ type: "holdingsAdded", rowKey, holdings, itemName });
      if (preview.added > 0 && preview.index >= 0) {
        requestFocus(preview.index, Cols.CountedQty);
      }
    },
    [ensureSheetCache, requestFocus],
  );

  const pickItem = useCallback(
    (rowKey: string, itemId: string, itemName: string) => {
      // A posted, cancelled or browsed sheet takes no pick.
      if (!isEditable(draftRef.current)) {
        return;
      }
      if (!requireHeaderGodown()) {
        dispatch({ type: "blankRowCleared", rowKey });
        return;
      }
      void addHoldingsForItem(rowKey, itemId, itemName);
    },
    [addHoldingsForItem, requireHeaderGodown],
  );

  const openItemList = useCallback(
    (rowKey: string): boolean => {
      const current = draftRef.current;
      const line = current.lines.find((candidate) => candidate.key === rowKey);
      if (!isEditable(current) || !line || line.lotId) {
        return false;
      }
      if (!requireHeaderGodown()) {
        return false;
      }
      // The typed text went to the list as its search — it is not a barcode.
      dispatch({ type: "blankRowCleared", rowKey });
      return true;
    },
    [requireHeaderGodown],
  );

  /**
   * A scan that resolved to nothing: the cell is emptied, so the next scan
   * lands in a clean one rather than appending to a code that resolved to
   * nothing, and the cursor goes back to it once the error is read.
   */
  const scanFailed = useCallback(
    (rowKey: string, error: unknown) => {
      dispatch({ type: "blankRowCleared", rowKey });
      const id = say.error(apiErrorText(error));
      afterMessage(id, () => {
        const index = indexOfRow(rowKey);
        if (aliveRef.current && index >= 0) {
          requestFocus(index, Cols.Barcode);
        }
      });
    },
    [indexOfRow, requestFocus],
  );

  /**
   * The holdings of a scanned batch's lot(s) in this godown — one per bucket it
   * sits in — out of the SAME cached sheet the item picker reads (Qt
   * `addHoldingsForLots()`), so a label and a pick cannot fill a line
   * differently. Inserted at the scanned row; one already on the sheet is
   * skipped.
   */
  const addHoldingsForLots = useCallback(
    async (rowKey: string, lotIds: readonly string[], label: string) => {
      const current = draftRef.current;
      const rows = await ensureSheetCache(scopeOfDraft(current), current.godownId);
      if (!rows) {
        return;
      }
      const wanted = new Set(lotIds);
      const holdings = rows.filter((row) => wanted.has(row.lotId));
      const latest = draftRef.current;
      const preview = insertHoldings(latest.lines, rowKey, holdings, latest.seq);
      if (preview.index < 0) {
        return; // the row has gone
      }
      if (preview.added === 0 && preview.already === 0) {
        dispatch({ type: "blankRowCleared", rowKey });
        say.info(
          "Nothing to count",
          `Batch ${label} has no holding in this godown, so it has no book quantity and cannot ` +
            "have a variance.\n\nStock found on the shelf with no holding behind it is an " +
            "adjustment, not a count.",
        );
        return;
      }
      dispatch({ type: "batchHoldingsAdded", rowKey, holdings, label });
      if (preview.added > 0) {
        requestFocus(preview.index, Cols.CountedQty);
      }
    },
    [ensureSheetCache, requestFocus],
  );

  /**
   * Textile: a code that is no item's barcode may be a batch LABEL
   * (CBE26-00002), which names the holding itself — `/stock/lots/by-batch`
   * names its lot(s), and the sheet's holdings of those lots go on (Qt
   * `resolveBatchLabel()`). Neither a barcode nor a batch: the BARCODE's answer
   * is the one the operator needs ("not found").
   */
  const resolveBatchLabel = useCallback(
    async (rowKey: string, code: string, barcodeError: unknown) => {
      const current = draftRef.current;
      let lotIds: string[];
      try {
        const lots = await appDispatch(
          physicalStockApi.endpoints.physicalStockLotsByBatch.initiate(
            {
              companyId: current.companyId,
              branchId: current.branchId,
              batchNo: code,
              includeEmpty: true,
              bucket: "ALL",
              godownId: current.godownId,
            },
            { subscribe: false, forceRefetch: true },
          ),
        ).unwrap();
        lotIds = lots.map((lot) => lot.lotId).filter(Boolean);
      } catch {
        if (indexOfRow(rowKey) >= 0) {
          scanFailed(rowKey, barcodeError);
        }
        return;
      }
      if (indexOfRow(rowKey) < 0) {
        return;
      }
      dispatch({ type: "barcodeTyped", rowKey, text: code });
      await addHoldingsForLots(rowKey, lotIds, code.toUpperCase());
    },
    [addHoldingsForLots, appDispatch, indexOfRow, scanFailed],
  );

  /**
   * The scan: symbol → item, then the same holdings resolution the picker uses
   * (Qt `resolveBarcode()`). The row is followed by KEY: lines may be added
   * above it while the lookup is out, and a reply for a row that has gone is
   * dropped.
   */
  const resolveBarcode = useCallback(
    async (rowKey: string, typed: string) => {
      const code = typed.trim();
      if (!code) {
        return;
      }
      const current = draftRef.current;
      const line = current.lines.find((candidate) => candidate.key === rowKey);
      if (!line || line.lotId) {
        return; // a row that already has a holding is not re-resolved
      }
      dispatch({ type: "barcodeCommitted", rowKey });
      if (!requireHeaderGodown()) {
        dispatch({ type: "blankRowCleared", rowKey });
        return;
      }
      let found: { itemId: string; itemName: string } | null;
      try {
        found = await appDispatch(
          physicalStockApi.endpoints.physicalStockItemByBarcode.initiate(
            { barcode: code, companyId: current.companyId },
            { subscribe: false, forceRefetch: true },
          ),
        ).unwrap();
      } catch (error) {
        if (indexOfRow(rowKey) < 0) {
          return;
        }
        // Not an item's barcode — on a textile company it may be a batch label.
        if (autoBatchNoRef.current && statusOf(error) === 404) {
          await resolveBatchLabel(rowKey, code, error);
          return;
        }
        scanFailed(rowKey, error);
        return;
      }
      if (!found?.itemId || indexOfRow(rowKey) < 0) {
        return;
      }
      // Keep the symbol that was actually read on the row it landed on.
      dispatch({ type: "barcodeTyped", rowKey, text: code });
      await addHoldingsForItem(rowKey, found.itemId, found.itemName ?? "");
    },
    [addHoldingsForItem, appDispatch, indexOfRow, requireHeaderGodown, resolveBatchLabel, scanFailed],
  );

  /**
   * The cell's commit (Enter, or leaving it). Queued, as Qt queues it: this
   * runs inside the cell's own key or blur handler, and the resolution can
   * raise "Godown first" and rewrite this very cell — done mid-commit that
   * crashed Opening Stock (2026-10-23).
   */
  const commitBarcode = useCallback(
    (rowKey: string, typed: string) => {
      window.setTimeout(() => void resolveBarcode(rowKey, typed), 0);
    },
    [resolveBarcode],
  );

  const pickReason = useCallback(
    (rowKey: string, id: string, name: string) => {
      const index = draftRef.current.lines.findIndex((line) => line.key === rowKey);
      dispatch({ type: "reasonPicked", rowKey, id, name });
      if (index >= 0) {
        requestFocus(index, Cols.ReasonName);
      }
    },
    [requestFocus],
  );

  // -------------------------------------------------------------------------
  // Save / Post / Cancel
  // -------------------------------------------------------------------------

  const saveDraft = useCallback(() => {
    void (async () => {
      if (busyRef.current !== "idle") {
        return;
      }
      const current = draftRef.current;
      if (current.status !== STATUS_DRAFT) {
        say.warn("Not a draft", `${current.refno} is ${current.status} and cannot be saved again.`);
        return;
      }
      const refusal = validateBeforeSave(current);
      if (refusal) {
        focusHeader(refusal.focus, say.warn(refusal.title, refusal.message));
        return;
      }
      // All taken NOW: the repaint from the answer holds only the saved
      // (counted) lines, at the book figures the save re-read.
      const before = computeTotals(current.lines);
      const unwalked = before.lines - before.counted;
      const onScreen = before.lines;
      const bookBefore = bookBeforeSave(current.lines);
      setBusy("saving");
      let saved;
      try {
        saved = await saveDocument(buildPayload(current, before)).unwrap();
      } catch (error) {
        setBusy("idle");
        say.error(apiErrorText(error));
        return;
      }
      setBusy("idle");
      dispatch({ type: "documentSaved", document: saved });
      const refno = saved?.header?.refno || current.refno;
      say.info(
        "Saved",
        savedDraftMessage(refno, unwalked, onScreen, bookMovedLines(saved?.lines ?? [], bookBefore)),
      );
      startNext();
    })();
  }, [saveDocument, setBusy, startNext]);

  /**
   * Post = ONE `/stock/physical/create` with header.status "POSTED" (notes
   * 106): the server saves and posts in one transaction — preflight, lots,
   * ledger, balance, status trail — so a refused line fails the save too and
   * leaves NO document behind. Nothing to clean up on a refusal, and no draft
   * right is needed: a Post-only user posts a new sheet.
   */
  const postDocument = useCallback(() => {
    void (async () => {
      if (busyRef.current !== "idle") {
        return;
      }
      const current = draftRef.current;
      if (current.status !== STATUS_DRAFT) {
        say.warn("Not a draft", `${current.refno} is ${current.status} and cannot be posted again.`);
        return;
      }
      const refusal = validateBeforeSave(current);
      if (refusal) {
        focusHeader(refusal.focus, say.warn(refusal.title, refusal.message));
        return;
      }
      // Asked BEFORE the call now — once it is sent the sheet is posted or it
      // does not exist.
      const totals = computeTotals(current.lines);
      const bookBefore = bookBeforeSave(current.lines);
      const confirmed = await askYesNo(
        `Post ${current.refno || "this count"}?`,
        postConfirmMessage(totals),
      );
      if (!confirmed) {
        return;
      }
      setBusy("posting");
      let posted;
      try {
        posted = await saveDocument(buildPostPayload(current, totals)).unwrap();
      } catch (error) {
        setBusy("idle");
        // The preflight's per-line answer when the refusal carries one;
        // otherwise the server's message.
        const problems = refusalLineProblems(error);
        if (problems.length > 0) {
          say.warn("This count cannot be posted", lineProblemsMessage(problems));
        } else {
          say.error(apiErrorText(error));
        }
        // Being told to fix the sheet has to leave it fixable.
        dispatch({ type: "modeSet", mode: "entry" });
        return;
      }
      setBusy("idle");
      dispatch({ type: "documentSaved", document: posted });
      dispatch({ type: "statusApplied", status: posted?.header?.status || STATUS_POSTED });
      // The book moved since the lines were drawn: the save re-read it, so the
      // variance that POSTED is not the one the question above showed. Qt says
      // this on the draft save only; a post has more reason to.
      say.info(
        "Posted",
        postedMessage(posted?.header?.refno || current.refno, posted?.rowsPosted) +
          bookMovedText(bookMovedLines(posted?.lines ?? [], bookBefore)),
      );
      startNext();
    })();
  }, [saveDocument, setBusy, startNext]);

  const cancelVoucher = useCallback(() => {
    const current = draftRef.current;
    // A DRAFT can be cancelled as well as a POSTED one; only one already
    // cancelled, and a screen with no saved document behind it, cannot.
    if (!current.svhId) {
      say.warn(
        "Nothing to cancel",
        "This count has not been saved yet, so there is no document to cancel. Close it, or " +
          "start a new one.",
      );
      return;
    }
    if (current.status === STATUS_CANCELLED) {
      say.warn("Already cancelled", `${current.refno} has been cancelled already.`);
      return;
    }
    setCancelPrompt({ title: `Cancel ${current.refno}` });
  }, []);

  const confirmCancel = useCallback(
    (reason: string) => {
      setCancelPrompt(null);
      void (async () => {
        const current = draftRef.current;
        const wasPosted = current.status === STATUS_POSTED;
        const confirmed = await askYesNo(
          `Cancel ${current.refno}?`,
          wasPosted ? CANCEL_POSTED_CONFIRM : CANCEL_DRAFT_CONFIRM,
          { destructive: true },
        );
        if (!confirmed) {
          return;
        }
        setBusy("cancelling");
        try {
          const result = await cancelDocument({
            ...scopeOfDraft(current),
            svhId: current.svhId,
            reason,
          }).unwrap();
          dispatch({
            type: "statusApplied",
            status: result?.header?.status || result?.status || STATUS_CANCELLED,
          });
          say.info(
            "Cancelled",
            wasPosted
              ? `${current.refno} cancelled. Its reversing rows carry the original count date, ` +
                  "so the stock reads as it did before the count."
              : `${current.refno} cancelled. It was a draft, so no variance had posted and ` +
                  "nothing was reversed.",
          );
          startNext();
        } catch (error) {
          say.error(apiErrorText(error));
        } finally {
          setBusy("idle");
        }
      })();
    },
    [cancelDocument, setBusy, startNext],
  );

  const dismissCancel = useCallback(() => setCancelPrompt(null), []);

  // -------------------------------------------------------------------------
  // Loading an existing sheet
  // -------------------------------------------------------------------------

  const load = useCallback(
    (key: PhysicalStockDocKey, openForEdit: boolean) => {
      void (async () => {
        // The document's OWN scope — stock_voucher is partitioned by year —
        // with the session as the fallback for a key that does not carry it.
        const fallback = sessionRef.current;
        const scope: PhysicalStockScope = {
          companyId: key.companyId || fallback.companyId,
          branchId: key.branchId || fallback.branchId,
          accYear: key.accYear || fallback.accYear,
        };
        loadSeqRef.current += 1;
        const seq = loadSeqRef.current;
        setBusy("loading");
        let document;
        try {
          document = await appDispatch(
            physicalStockApi.endpoints.physicalStockDocument.initiate(
              { ...scope, svhId: key.svhId },
              { subscribe: false, forceRefetch: true },
            ),
          ).unwrap();
        } catch (error) {
          say.error(apiErrorText(error));
          return;
        } finally {
          setBusy("idle");
        }
        if (seq !== loadSeqRef.current) {
          return;
        }
        if (!document?.header) {
          say.warn("Not found", "That count sheet no longer exists.");
          return;
        }
        // This document may be another godown's.
        sheetCacheRef.current = null;
        dispatch({ type: "documentLoaded", document, scope, openForEdit });
        // On the first line's count (Qt `applyFetchedVoucher()`).
        requestFocus(0, Cols.CountedQty);
        // A loaded sheet's lines carry no average cost, so its variance would
        // show no value and a re-save would send a total value of 0. The
        // godown's count sheet has the average per holding.
        const godownId = document.header.godownId ?? "";
        if (!godownId) {
          return;
        }
        const rows = await ensureSheetCache(
          { ...scope, accYear: (document.header.accYear ?? "").trim() || scope.accYear },
          godownId,
        );
        if (rows && seq === loadSeqRef.current) {
          dispatch({ type: "averageCostsRefilled", rows });
        }
      })();
    },
    [appDispatch, ensureSheetCache, requestFocus, setBusy],
  );

  /**
   * Previous / Next (Alt+PgUp / Alt+PgDn) — the sheet entered just before /
   * after this one in its company, branch and year, in the list's own order,
   * through the one server walk every document type shares (`GET
   * /txn/adjacent`, Qt `stepDocument()`). On a new sheet, Previous opens the
   * newest. A found sheet opens READ-ONLY (F2 to edit a draft); at either end
   * the notice says so and the screen stays.
   */
  const stepDocument = useCallback(
    (previous: boolean) => {
      void (async () => {
        if (busyRef.current !== "idle") {
          return;
        }
        const current = draftRef.current;
        if (!current.svhId && !previous) {
          dispatch({ type: "noticeSet", text: STEP_NOTICES.newHasNoNext });
          return;
        }
        if (
          current.dirty &&
          !(await askYesNo(
            "Open another count",
            "This count has unsaved changes. Discard it and open another?",
          ))
        ) {
          return;
        }
        setBusy("loading");
        let found: PhysicalStockDocKey | null = null;
        try {
          const answer = await adjacentDocument({
            docType: "PHYSICAL_STOCK",
            companyId: current.companyId,
            branchId: current.branchId,
            accYear: current.accYear,
            ...(current.svhId ? { docId: current.svhId } : {}),
            direction: previous ? "prev" : "next",
          }).unwrap();
          const doc = answer.doc;
          if (!doc) {
            dispatch({
              type: "noticeSet",
              text: !current.svhId
                ? STEP_NOTICES.none
                : previous
                  ? STEP_NOTICES.oldest
                  : STEP_NOTICES.newest,
            });
            return;
          }
          found = {
            svhId: doc.docId,
            companyId: doc.companyId,
            branchId: doc.branchId,
            accYear: doc.accYear,
          };
        } catch (error) {
          say.error(apiErrorText(error));
          return;
        } finally {
          setBusy("idle");
        }
        if (found) {
          load(found, false);
        }
      })();
    },
    [adjacentDocument, load, setBusy],
  );

  // -------------------------------------------------------------------------
  // Header and grid edits
  // -------------------------------------------------------------------------

  const guardDirty = useCallback((title: string, message: string, then: () => void) => {
    void (async () => {
      if (draftRef.current.dirty && !(await askYesNo(title, message))) {
        return;
      }
      then();
    })();
  }, []);

  const newDocument = useCallback(() => {
    guardDirty(
      "Discard count",
      "This count sheet has unsaved changes. Start a new one anyway?",
      () => {
        reset();
        focusEntryStart();
      },
    );
  }, [focusEntryStart, guardDirty, reset]);

  const edit = useCallback(() => {
    const current = draftRef.current;
    if (current.status !== STATUS_DRAFT) {
      say.warn(
        "Posted sheet",
        `${current.refno} is ${current.status}. A posted count cannot be edited — cancel it ` +
          "and count again.",
      );
      return;
    }
    dispatch({ type: "modeSet", mode: "entry" });
    focusEntryStart();
  }, [focusEntryStart]);

  const selectGodown = useCallback((id: string, name: string) => {
    if (id !== draftRef.current.godownId) {
      sheetCacheRef.current = null;
    }
    dispatch({ type: "godownSelected", id, name });
  }, []);

  return {
    draft,
    totals,
    editable,
    busy,
    layout,
    columns,
    focusRequest,
    rights,
    cancelPrompt,
    setHeader: (field, value) => dispatch({ type: "headerSet", field, value }),
    selectGodown,
    selectReason: (id, name) => dispatch({ type: "reasonSelected", id, name }),
    toggleFreeze: (on) => dispatch({ type: "freezeToggled", on }),
    setFreezeWindow: (field, value) => dispatch({ type: "freezeWindowSet", field, value }),
    setBlind: (blind) => dispatch({ type: "blindSet", blind }),
    setCounted: (rowKey, text) => dispatch({ type: "countedSet", rowKey, text }),
    setRemarks: (rowKey, text) => dispatch({ type: "remarksSet", rowKey, text }),
    typeBarcode: (rowKey, text) => dispatch({ type: "barcodeTyped", rowKey, text }),
    commitBarcode,
    openItemList,
    pickItem,
    pickReason,
    loadCountSheet,
    sheetDialog: { open: sheetDialogOpen, filter: sheetFilter },
    submitSheetFilter,
    dismissSheetFilter,
    newDocument,
    saveDraft,
    postDocument,
    cancelVoucher,
    confirmCancel,
    dismissCancel,
    edit,
    load,
    stepDocument,
    focusEntryStart,
    guardDirty,
    resumed,
    finishResume,
    forgetRemembered,
  };
}
