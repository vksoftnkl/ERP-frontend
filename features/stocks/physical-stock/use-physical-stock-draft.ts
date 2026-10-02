"use client";

/**
 * Physical Stock Update — the count sheet's network half. The draft is a
 * local reducer (`physical-stock.state.ts`, pure); this hook does what the Qt
 * `PhysicalStockEntry` does over the wire — draw the sheet, resolve a pick or a
 * scan into holdings, save, validate, post, cancel, load — and speaks to the
 * operator in the Qt screen's own words.
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
import { usePagePermissions } from "@/hooks/useMenuPermissions";
import { getUserInfo } from "@/lib/auth/session";
import { useUiTableId } from "@/lib/ui-tables";
import { useGetQuotationGridLayoutQuery } from "@/store/api/quotationApi";
import { useAppDispatch } from "@/store/hooks";
import { accountingYearOf, todayIso } from "@/features/sales/quotation/quotation.utils";
import { askYesNo, say } from "./components/notice";
import {
  physicalStockApi,
  usePhysicalStockCancelMutation,
  usePhysicalStockPostMutation,
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
import { formatNetQty, toLocalDateTime } from "./physical-stock.format";
import { apiErrorText, buildPayload, failingLines, lineProblemsMessage } from "./physical-stock.payload";
import {
  applyWireLines,
  computeTotals,
  createDraft,
  hasHoldings,
  insertHoldings,
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

function focusHeader(field: SaveRefusalFocus | undefined): void {
  if (!field || typeof window === "undefined") {
    return;
  }
  window.requestAnimationFrame(() => document.getElementById(HEADER_FIELD_IDS[field])?.focus());
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

function seedOf(scope: SessionScope): DraftSeed {
  return { scope, today: todayIso(), now: toLocalDateTime(new Date()) };
}

function scopeOfDraft(draft: PhysicalStockDraft): PhysicalStockScope {
  return { companyId: draft.companyId, branchId: draft.branchId, accYear: draft.accYear };
}

type PostTarget = {
  key: PhysicalStockDocKey;
  refno: string;
  status: string;
  totals: CountTotals;
};

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
  permissions: { canCreate: boolean; canEdit: boolean; canDelete: boolean };
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
  pickItem: (rowKey: string, itemId: string, itemName: string) => void;
  pickReason: (rowKey: string, id: string, name: string) => void;
  loadCountSheet: () => void;
  newDocument: () => void;
  saveDraft: (postAfterwards: boolean) => void;
  cancelVoucher: () => void;
  confirmCancel: (reason: string) => void;
  dismissCancel: () => void;
  edit: () => void;
  load: (key: PhysicalStockDocKey, openForEdit: boolean) => void;
  /** Runs `then` unless the operator declines to throw unsaved work away. */
  guardDirty: (title: string, message: string, then: () => void) => void;
};

export function usePhysicalStockDraft(): PhysicalStockDraftApi {
  const session = useSessionScope();
  const sessionRef = useRef(session);
  const appDispatch = useAppDispatch();
  const [draft, dispatch] = useReducer(physicalStockReducer, session, (scope) =>
    createDraft(seedOf(scope)),
  );
  // The latest of both, for the async flows below to read after an await.
  const draftRef = useRef(draft);
  useLayoutEffect(() => {
    sessionRef.current = session;
    draftRef.current = draft;
  });
  const [busy, setBusyState] = useState<PhysicalStockBusy>("idle");
  const busyRef = useRef<PhysicalStockBusy>("idle");
  const setBusy = useCallback((value: PhysicalStockBusy) => {
    busyRef.current = value;
    setBusyState(value);
  }, []);
  const [focusRequest, setFocusRequest] = useState<FocusRequest | null>(null);
  const [cancelPrompt, setCancelPrompt] = useState<{ title: string } | null>(null);
  const [saveDocument] = usePhysicalStockSaveMutation();
  const [postDocumentMutation] = usePhysicalStockPostMutation();
  const [cancelDocument] = usePhysicalStockCancelMutation();
  const { permissions } = usePagePermissions();

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

  // A business context that arrives after the screen re-seeds a clean sheet.
  useEffect(() => {
    dispatch({ type: "scopeSeeded", scope: session });
  }, [session]);

  // -------------------------------------------------------------------------
  // The count sheet
  // -------------------------------------------------------------------------

  const fetchWholeSheet = useCallback(
    async (scope: PhysicalStockScope, godownId: string): Promise<CountSheetRow[]> => {
      const rows: CountSheetRow[] = [];
      // includeZero is INCLUDED by default server-side, which is the right
      // default — a holding the book says is empty is exactly where a count
      // finds something — so nothing is passed for it.
      for (let page = 0; page < COUNT_SHEET_MAX_PAGES; page += 1) {
        const batch = await appDispatch(
          physicalStockApi.endpoints.physicalStockCountSheet.initiate(
            {
              ...scope,
              godownId,
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
  }, []);

  const loadCountSheet = useCallback(() => {
    void (async () => {
      const current = draftRef.current;
      if (!isEditable(current) || busyRef.current !== "idle") {
        return;
      }
      if (!current.godownId) {
        say.warn(
          "Godown first",
          "A count sheet is the holdings of one godown. Choose which one is being counted.",
        );
        focusHeader("godown");
        return;
      }
      // There is always one blank row, so "any rows" is not "any lines": ask
      // only when a holding is on screen and would be thrown away.
      if (
        hasHoldings(current.lines) &&
        !(await askYesNo(
          "Reload count sheet",
          "This replaces every line on screen, including any quantity already counted. Reload?",
        ))
      ) {
        return;
      }
      setBusy("sheet");
      let rows: CountSheetRow[];
      try {
        rows = await fetchWholeSheet(scopeOfDraft(current), current.godownId);
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
        say.info(
          "Nothing to count",
          "This godown has no holdings at all — nothing has ever been received into it. Stock " +
            "found on the shelf with no holding behind it is an adjustment, not a count.",
        );
        return;
      }
      dispatch({ type: "sheetApplied", rows, godownName: current.godownName });
      requestFocus(0, Cols.CountedQty);
    })();
  }, [fetchWholeSheet, requestFocus, setBusy]);

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
      if (!draftRef.current.godownId) {
        say.warn(
          "Godown first",
          "A count line is a holding in one godown. Choose which godown is being counted " +
            "before picking items.",
        );
        dispatch({ type: "blankRowCleared", rowKey });
        focusHeader("godown");
        return;
      }
      void addHoldingsForItem(rowKey, itemId, itemName);
    },
    [addHoldingsForItem],
  );

  /** The scan: symbol → item, then the same holdings resolution the picker uses. */
  const commitBarcode = useCallback(
    (rowKey: string, typed: string) => {
      void (async () => {
        const code = typed.trim();
        if (!code) {
          return;
        }
        const current = draftRef.current;
        const index = current.lines.findIndex((line) => line.key === rowKey);
        const line = current.lines[index];
        if (!line || line.lotId) {
          return; // a row that already has a holding is not re-resolved
        }
        dispatch({ type: "barcodeCommitted", rowKey });
        if (!current.godownId) {
          say.warn(
            "Godown first",
            "A count line is a holding in one godown. Choose which godown is being counted " +
              "before scanning.",
          );
          dispatch({ type: "blankRowCleared", rowKey });
          focusHeader("godown");
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
          // Cleared, so the next scan lands in an empty cell rather than
          // appending to a code that resolved to nothing.
          dispatch({ type: "blankRowCleared", rowKey });
          requestFocus(index, Cols.Barcode);
          say.error(apiErrorText(error));
          return;
        }
        if (!found?.itemId) {
          return;
        }
        // Keep the symbol that was actually read on the row it landed on.
        dispatch({ type: "barcodeTyped", rowKey, text: code });
        await addHoldingsForItem(rowKey, found.itemId, found.itemName ?? "");
      })();
    },
    [addHoldingsForItem, appDispatch, requestFocus],
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

  const postDocument = useCallback(
    async (target: PostTarget) => {
      if (!target.key.svhId) {
        say.warn("Save first", "Save the sheet before posting it.");
        return;
      }
      setBusy("posting");
      let problems;
      try {
        problems = await appDispatch(
          physicalStockApi.endpoints.physicalStockValidate.initiate(target.key, {
            subscribe: false,
            forceRefetch: true,
          }),
        ).unwrap();
      } catch (error) {
        setBusy("idle");
        say.error(apiErrorText(error));
        return;
      }
      setBusy("idle");
      if (failingLines(problems).length > 0) {
        say.warn("This count cannot be posted", lineProblemsMessage(problems));
        // Being told to fix the sheet has to leave it fixable.
        if (target.status === STATUS_DRAFT) {
          dispatch({ type: "modeSet", mode: "entry" });
        }
        return;
      }
      const { totals } = target;
      const confirmed = await askYesNo(
        `Post ${target.refno}?`,
        "Posting writes the stock ledger for the lines that DISAGREE and freezes this sheet. " +
          "A line that matches writes nothing.\n\n" +
          `${totals.counted} / ${totals.lines} counted · ${totals.varianceLines} with a variance · ` +
          `net ${formatNetQty(totals.netQty)}`,
      );
      if (!confirmed) {
        return;
      }
      setBusy("posting");
      try {
        const result = await postDocumentMutation(target.key).unwrap();
        dispatch({
          type: "statusApplied",
          status: result?.header?.status || result?.status || STATUS_POSTED,
        });
        const rows = Math.trunc(Number(result?.rowsPosted) || 0);
        say.info(
          "Posted",
          rows === 0
            ? `${target.refno} posted — every holding counted matched the book, so no ledger ` +
                "row was written. Nothing was wrong."
            : `${target.refno} posted — ${rows} variance rows written.`,
        );
        startNext();
      } catch (error) {
        say.error(apiErrorText(error));
      } finally {
        setBusy("idle");
      }
    },
    [appDispatch, postDocumentMutation, setBusy, startNext],
  );

  const saveDraft = useCallback(
    (postAfterwards: boolean) => {
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
          say.warn(refusal.title, refusal.message);
          focusHeader(refusal.focus);
          return;
        }
        // Both taken NOW: the repaint from the answer holds only the saved
        // (counted) lines.
        const before = computeTotals(current.lines);
        const unwalked = before.lines - before.counted;
        const onScreen = before.lines;
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
        const svhId = saved?.header?.svhId || current.svhId;
        const refno = saved?.header?.refno || current.refno;
        const status = (saved?.header?.status ?? "").trim() || STATUS_DRAFT;
        if (postAfterwards) {
          const repainted = applyWireLines(saved?.lines ?? [], current.lines, current.seq).lines;
          await postDocument({
            key: { ...scopeOfDraft(current), svhId },
            refno,
            status,
            totals: computeTotals(repainted),
          });
          return;
        }
        say.info(
          "Saved",
          unwalked > 0
            ? `${refno} saved as a draft. No stock has moved.\n\n${unwalked} of ${onScreen} ` +
                "holdings on screen have not been counted yet, so they are NOT on the saved " +
                "document — count them and save again to add them. A blank is not the same as " +
                "counting zero."
            : `${refno} saved as a draft. No stock has moved.`,
        );
        startNext();
      })();
    },
    [postDocument, saveDocument, setBusy, startNext],
  );

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
          wasPosted
            ? "This writes one reversing ledger row for every variance row the count posted. " +
                "Nothing is deleted — the sheet stays in the list as CANCELLED.\n\nIt will be " +
                "refused if the stock has since been sold."
            : "This draft has posted no variance, so there is nothing to reverse. Nothing is " +
                "deleted — the sheet stays in the list as CANCELLED, with the reason against it.",
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
    [appDispatch, ensureSheetCache, setBusy],
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
      reset,
    );
  }, [guardDirty, reset]);

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
  }, []);

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
    permissions: {
      canCreate: permissions.canCreate,
      canEdit: permissions.canEdit,
      canDelete: permissions.canDelete,
    },
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
    pickItem,
    pickReason,
    loadCountSheet,
    newDocument,
    saveDraft,
    cancelVoucher,
    confirmCancel,
    dismissCancel,
    edit,
    load,
    guardDirty,
  };
}
