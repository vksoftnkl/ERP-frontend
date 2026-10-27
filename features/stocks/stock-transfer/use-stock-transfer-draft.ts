"use client";

/**
 * Godown Transfer / Branch Outward — the draft and every action that needs the
 * network (the Qt `GodownTransferEntry`'s slots).
 *
 * The draft is local to the screen (no slice): it lives in state, mirrored in a
 * ref so an answer that lands late reads the draft as it is NOW — the Qt
 * screen's `if (cellText(ItemId) != itemId) return` guard is the line key here.
 * Every rule is a pure function in `stock-transfer.state.ts`.
 *
 * Save Draft writes a DRAFT (no stock moves). Post saves, THEN despatches: the
 * same branch ends POSTED, another branch IN_TRANSIT. A despatch that is
 * refused leaves the saved draft open and says so.
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useBusinessContext } from "@/components/layout/business-context";
import { useGetTxnAdjacentMutation } from "@/components/txn/txn-adjacent";
import { getUserInfo } from "@/lib/auth/session";
import { toast } from "@/lib/notify";
import { RESTORED_MESSAGE_OPTIONS, restoredMessage, screenMemory, type ScreenScope } from "@/lib/screen-memory";
import { useForgetIfWritingOnUnmount, useRecalledOnce, type ScreenMemoryOption } from "@/lib/use-screen-memory";
import { accountingYearOf, todayIso } from "@/features/sales/quotation/quotation.utils";
import {
  useLazyStockAdjustmentItemByBarcodeQuery,
  useLazyStockAdjustmentPickStockQuery,
} from "@/features/stocks/stock-adjustment/stock-adjustment.api";
import {
  useCancelStockTransferMutation,
  useDeleteStockTransferMutation,
  useDespatchStockTransferMutation,
  useLazyGetStockTransferQuery,
  useLazyStockTransferReasonListQuery,
  useRecallStockTransferMutation,
  useSaveStockTransferMutation,
  useSettleShortStockTransferMutation,
  useStockTransferReasonsQuery,
} from "./stock-transfer.api";
import { BATCH_LABEL_PICK_LIMIT, COL, STEP_NOTICES, STOCK_TRANSFER_MEMORY_KEYS, type TransferMode } from "./stock-transfer.constants";
import { applySaveResult, buildLines, buildPayload, despatchLorry, draftFromPayload } from "./stock-transfer.payload";
import {
  applyAvailability,
  applyHolding,
  changeFromGodown,
  changeToBranch,
  changeToGodown,
  checkBeforeSave,
  createDraft,
  editCell,
  insertLineBefore,
  isEditable,
  isTransferWorthRemembering,
  nextDocument,
  patchHandling,
  removeLine,
  requireGodowns,
  rowHasItem,
  type Refusal,
} from "./stock-transfer.state";
import type {
  DraftScope,
  Handling,
  TransferDocKey,
  TransferDraft,
  TransferPayload,
  TransferPickRow,
} from "./stock-transfer.types";
import { apiErrorText, errorDetailsOf, mapServerRefusal } from "./stock-transfer.validate";
import { notify } from "./components/notify";

export type Busy = "loading" | "saving" | "posting" | "cancelling" | "deleting" | "settling" | null;

/** Where the view should put the cursor next. */
export type FocusTarget =
  | { target: "cell"; key: string; column: number }
  | { target: "fromGodown" | "toGodown" | "toBranch" | "date" | "entryStart" };
export type FocusRequest = FocusTarget & { seq: number };

/** What Pick from stock opens on. */
export type PickRequest = {
  key: string;
  item: { itemId: string; itemName: string } | null;
  /** A scanned batch label the dialog opens searched for. */
  search: string;
};

/** The session's scope — what a NEW document is raised under. */
function useSessionScope(): DraftScope {
  const { activeCompany, activeBranch, activeFiscalYear } = useBusinessContext();
  const companyId = activeCompany?.compId ?? activeCompany?.id ?? "";
  const branchId = activeBranch?.id ?? "";
  const accYear = (activeFiscalYear?.name ?? "").trim() || accountingYearOf(todayIso());
  // The REGISTERED device (fixed.device_master), signed into the token at login.
  const deviceId = getUserInfo()?.deviceId ?? "";
  return useMemo(() => ({ companyId, branchId, accYear, deviceId }), [accYear, branchId, companyId, deviceId]);
}

/** The tenant on the header — what the page asks screen memory about. */
export function useStockTransferScope(): ScreenScope {
  const { companyId, branchId, accYear } = useSessionScope();
  return useMemo(() => ({ companyId, branchId, accYear }), [accYear, branchId, companyId]);
}

function memoryScopeOf(draft: TransferDraft): ScreenScope {
  return { companyId: draft.companyId, branchId: draft.branchId, accYear: draft.accYear };
}

/** Does a loaded document belong to this screen? A branch transfer is one with another branch's id. */
export function shapeMatches(mode: TransferMode, payload: TransferPayload): boolean {
  const header = payload.header;
  const other = Boolean(header.toBranchId) && header.toBranchId !== header.branchId;
  return mode === "branch" ? other : !other;
}

export type UseStockTransferDraftOptions = {
  mode: TransferMode;
  memory?: ScreenMemoryOption;
  /** `stock.auto_batch_no` — a scanned code that is no item barcode may be a batch label. */
  autoBatchNo?: boolean;
};

export function useStockTransferDraft(opts: UseStockTransferDraftOptions) {
  const { mode, memory } = opts;
  const scope = useSessionScope();
  const scopeRef = useRef(scope);
  useEffect(() => {
    scopeRef.current = scope;
  }, [scope]);
  const autoBatchNoRef = useRef(Boolean(opts.autoBatchNo));
  useLayoutEffect(() => {
    autoBatchNoRef.current = Boolean(opts.autoBatchNo);
  });

  const recalled = useRecalledOnce<TransferDraft>(memory, scope);
  const resumed = recalled !== null;
  const [draft, setDraft] = useState<TransferDraft>(() => recalled ?? createDraft(scope, mode, todayIso()));
  const draftRef = useRef(draft);
  const [busy, setBusy] = useState<Busy>(null);
  const busyRef = useRef<Busy>(busy);
  useLayoutEffect(() => {
    busyRef.current = busy;
  });
  const [pick, setPick] = useState<PickRequest | null>(null);
  const [focusRequest, setFocusRequest] = useState<FocusRequest | null>(null);
  const focusSeq = useRef(0);

  const [triggerPickStock] = useLazyStockAdjustmentPickStockQuery();
  const [triggerBarcode] = useLazyStockAdjustmentItemByBarcodeQuery();
  const [triggerLoad] = useLazyGetStockTransferQuery();
  const [triggerReasonList] = useLazyStockTransferReasonListQuery();
  const [saveMutation] = useSaveStockTransferMutation();
  const [despatchMutation] = useDespatchStockTransferMutation();
  const [cancelMutation] = useCancelStockTransferMutation();
  const [recallMutation] = useRecallStockTransferMutation();
  const [deleteMutation] = useDeleteStockTransferMutation();
  const [settleMutation] = useSettleShortStockTransferMutation();
  const [adjacentMutation] = useGetTxnAdjacentMutation();

  const reasonsQuery = useStockTransferReasonsQuery(
    { companyId: draft.companyId },
    { skip: !draft.companyId || mode === "branch" },
  );

  // -------------------------------------------------------------- commit
  const requestFocus = useCallback((request: FocusTarget) => {
    focusSeq.current += 1;
    setFocusRequest({ ...request, seq: focusSeq.current });
  }, []);

  // Screen memory is written HERE, in the funnel every change goes through,
  // so an answer that lands after the screen is gone still reaches it.
  const memoryKey = memory?.key ?? STOCK_TRANSFER_MEMORY_KEYS[mode];
  const rememberOn = Boolean(memory);
  const discarded = useRef(false);
  const commit = useCallback(
    (next: TransferDraft) => {
      draftRef.current = next;
      setDraft(next);
      if (rememberOn && !discarded.current) {
        if (isTransferWorthRemembering(next)) {
          screenMemory.remember(memoryKey, memoryScopeOf(next), next);
        } else {
          screenMemory.forget(memoryKey, memoryScopeOf(next));
        }
      }
    },
    [memoryKey, rememberOn],
  );
  useForgetIfWritingOnUnmount(
    memory,
    () => ["saving", "posting", "cancelling", "deleting"].includes(busyRef.current ?? ""),
    () => memoryScopeOf(draftRef.current),
  );

  /** Show a gate's refusal the way the Qt screen does, and send the cursor where it points. */
  const refuse = useCallback(
    (refusal: Refusal) => {
      notify(refusal.level, refusal.title, refusal.message);
      const focus = refusal.focus;
      if (typeof focus === "string") {
        requestFocus({ target: focus });
      } else if (focus) {
        requestFocus({ target: "cell", key: focus.lineKey, column: COL.Qty });
      }
    },
    [requestFocus],
  );

  const setHint = useCallback((hint: string) => commit({ ...draftRef.current, hint }), [commit]);
  const setNotice = useCallback((notice: string) => commit({ ...draftRef.current, notice }), [commit]);

  // ---------------------------------------------------------- the header
  const setFromGodown = useCallback(
    (id: string, name: string) => commit(changeFromGodown(draftRef.current, id, name)),
    [commit],
  );
  const setToGodown = useCallback(
    (id: string, name: string) => commit(changeToGodown(draftRef.current, id, name)),
    [commit],
  );
  const setToBranch = useCallback(
    (id: string, name: string) => commit(changeToBranch(draftRef.current, id, name)),
    [commit],
  );
  const setHeader = useCallback(
    (patch: Partial<Pick<TransferDraft, "docDate" | "remarks" | "lrNo" | "expectedOn" | "reasonId">>) =>
      commit({ ...draftRef.current, ...patch, dirty: true }),
    [commit],
  );
  const setHandling = useCallback(
    (patch: Partial<Handling>) => commit(patchHandling(draftRef.current, patch)),
    [commit],
  );

  // ------------------------------------------------------- the reads
  /** What the holding has available now — a hint; the server checks at save. */
  const refreshAvailability = useCallback(
    async (key: string) => {
      const current = draftRef.current;
      const line = current.lines.find((candidate) => candidate.key === key);
      if (!line || !rowHasItem(line) || !current.fromGodownId) {
        return;
      }
      try {
        const rows = (await triggerPickStock({
          companyId: current.companyId,
          branchId: current.branchId,
          godownId: current.fromGodownId,
          ...(line.bucket ? { bucket: line.bucket } : {}),
          itemId: line.itemId,
        }).unwrap()) as TransferPickRow[];
        commit(applyAvailability(draftRef.current, key, rows));
      } catch {
        /* availability is a hint; the server checks at save */
      }
    },
    [commit, triggerPickStock],
  );

  const refreshAll = useCallback(
    (next: TransferDraft) => {
      for (const line of next.lines.filter(rowHasItem)) {
        void refreshAvailability(line.key);
      }
    },
    [refreshAvailability],
  );

  // ------------------------------------------------------ getting a holding
  /** The godowns gate every way of getting a line; true = go ahead. */
  const needGodowns = useCallback((): boolean => {
    const refusal = requireGodowns(draftRef.current);
    if (refusal) {
      refuse(refusal);
      return false;
    }
    return true;
  }, [refuse]);

  const closePick = useCallback(() => setPick(null), []);

  /** F12 on a line re-picks that line's holding; on the blank line it adds one. */
  const openPick = useCallback(
    (key: string | null, search = "", item?: { itemId: string; itemName: string } | null) => {
      const current = draftRef.current;
      if (!isEditable(current) || !needGodowns()) {
        return;
      }
      const line = (key && current.lines.find((candidate) => candidate.key === key)) || current.lines[current.lines.length - 1];
      if (!line) {
        return;
      }
      const target =
        item !== undefined ? item : rowHasItem(line) ? { itemId: line.itemId, itemName: line.itemName } : null;
      setPick({ key: line.key, item: target, search });
    },
    [needGodowns],
  );

  const focusQty = useCallback(
    (key: string) => requestFocus({ target: "cell", key, column: COL.Qty }),
    [requestFocus],
  );

  const takeHolding = useCallback(
    (key: string, row: TransferPickRow) => {
      const result = applyHolding(draftRef.current, key, row);
      commit(result.draft);
      const landed = result.existingKey ?? key;
      focusQty(landed);
    },
    [commit, focusQty],
  );

  /** An item, from a scan or the list: its holdings. One is the line; several open the picker; none is refused. */
  const pickItem = useCallback(
    async (key: string, pickedItem: { itemId: string; itemName: string }) => {
      if (!pickedItem.itemId || !needGodowns()) {
        return false;
      }
      const current = draftRef.current;
      try {
        const rows = (await triggerPickStock({
          companyId: current.companyId,
          branchId: current.branchId,
          godownId: current.fromGodownId,
          itemId: pickedItem.itemId,
        }).unwrap()) as TransferPickRow[];
        const now = draftRef.current;
        const line = now.lines.find((candidate) => candidate.key === key);
        if (!line || rowHasItem(line) || !isEditable(now)) {
          return false;
        }
        if (rows.length === 1) {
          takeHolding(key, rows[0]);
          return true;
        }
        if (rows.length > 1) {
          openPick(key, "", pickedItem);
          return true;
        }
        notify("warn", "No stock", `${pickedItem.itemName} has no stock in ${now.fromGodownName} to transfer.`);
        requestFocus({ target: "cell", key, column: COL.Barcode });
        return false;
      } catch (error) {
        notify("warn", "Error", apiErrorText(error));
        return false;
      }
    },
    [needGodowns, openPick, requestFocus, takeHolding, triggerPickStock],
  );

  /** A scanned batch label: that exact batch in the From godown, any bucket. */
  const resolveBatchLabel = useCallback(
    async (key: string, batchNo: string): Promise<boolean> => {
      const current = draftRef.current;
      try {
        const rows = (await triggerPickStock({
          companyId: current.companyId,
          branchId: current.branchId,
          godownId: current.fromGodownId,
          batchNo,
          limit: BATCH_LABEL_PICK_LIMIT,
        }).unwrap()) as TransferPickRow[];
        const now = draftRef.current;
        const line = now.lines.find((candidate) => candidate.key === key);
        if (!line || rowHasItem(line) || !isEditable(now)) {
          return false;
        }
        if (rows.length === 1) {
          takeHolding(key, rows[0]);
          return true;
        }
        if (rows.length > 1) {
          openPick(key, batchNo, null);
          return true;
        }
        notify(
          "warn",
          "Not found",
          `“${batchNo}” is neither an item barcode nor a batch with stock in ${now.fromGodownName}.`,
        );
        return false;
      } catch (error) {
        notify("warn", "Error", apiErrorText(error));
        return false;
      }
    },
    [openPick, takeHolding, triggerPickStock],
  );

  /** A scan resolves to its item, then its holding; not an item barcode on a textile company may be a batch label. */
  const resolveBarcode = useCallback(
    async (key: string, barcode: string): Promise<boolean> => {
      const code = barcode.trim();
      const current = draftRef.current;
      const line = current.lines.find((candidate) => candidate.key === key);
      if (!code || !line || rowHasItem(line) || !isEditable(current)) {
        return false;
      }
      if (!needGodowns()) {
        return false;
      }
      try {
        const found = await triggerBarcode({ barcode: code, companyId: current.companyId }).unwrap();
        if (!found?.itemId) {
          return false;
        }
        return await pickItem(key, { itemId: found.itemId, itemName: found.itemName ?? "" });
      } catch (error) {
        const status = (error as { status?: number } | null)?.status;
        if (autoBatchNoRef.current && status === 404) {
          return resolveBatchLabel(key, code);
        }
        notify("warn", "Error", apiErrorText(error));
        return false;
      }
    },
    [needGodowns, pickItem, resolveBatchLabel, triggerBarcode],
  );

  // ------------------------------------------------------------ the lines
  const editLine = useCallback(
    (key: string, column: number, raw: string) => commit(editCell(draftRef.current, key, column, raw)),
    [commit],
  );
  const insertLine = useCallback((key: string) => commit(insertLineBefore(draftRef.current, key)), [commit]);
  const deleteLine = useCallback((key: string) => commit(removeLine(draftRef.current, key)), [commit]);

  const focusEntryStart = useCallback(() => requestFocus({ target: "entryStart" }), [requestFocus]);

  // ------------------------------------------------------------ documents
  const startNextDocument = useCallback(() => {
    commit(nextDocument(draftRef.current, scopeRef.current, todayIso()));
    focusEntryStart();
  }, [commit, focusEntryStart]);

  /** New (Alt+N) — a blank document; the run is NOT carried (that is for after a post). */
  const newDocument = useCallback(() => {
    commit(createDraft(scopeRef.current, mode, todayIso()));
    focusEntryStart();
  }, [commit, focusEntryStart, mode]);

  /** Edit — open this DRAFT for keying, and read every line's holding again. */
  const beginEdit = useCallback((): boolean => {
    const current = draftRef.current;
    if (current.status !== "DRAFT") {
      notify(
        "warn",
        "Not a draft",
        `${current.refno} is ${current.status}. A posted transfer cannot be edited — cancel it and key a new one.`,
      );
      return false;
    }
    const next = { ...current, viewMode: "entry" as const };
    commit(next);
    refreshAll(next);
    return true;
  }, [commit, refreshAll]);

  const applyLoaded = useCallback(
    (docScope: DraftScope, payload: TransferPayload, openForEdit: boolean) => {
      const loaded = draftFromPayload(docScope, mode, payload, openForEdit);
      commit(loaded);
      // Availability (and, for a line the server named no batch for, the batch) comes from the holding.
      if (loaded.viewMode === "entry") {
        refreshAll(loaded);
      }
      return loaded;
    },
    [commit, mode, refreshAll],
  );

  const docScopeOf = useCallback((key: TransferDocKey): DraftScope => {
    const session = scopeRef.current;
    return {
      companyId: key.companyId || session.companyId,
      branchId: key.branchId || session.branchId,
      accYear: key.accYear || session.accYear,
      deviceId: session.deviceId,
    };
  }, []);

  const load = useCallback(
    async (key: TransferDocKey, openForEdit: boolean): Promise<boolean> => {
      const docScope = docScopeOf(key);
      setBusy("loading");
      try {
        const payload = await triggerLoad({ ...key, ...docScope }).unwrap();
        if (!payload?.header?.svhId) {
          notify("warn", "Not found", "That transfer no longer exists.");
          return false;
        }
        applyLoaded(docScope, payload, openForEdit);
        return true;
      } catch (error) {
        notify("warn", "Error", apiErrorText(error));
        return false;
      } finally {
        setBusy(null);
      }
    },
    [applyLoaded, docScopeOf, triggerLoad],
  );

  /**
   * Previous / Next (Alt+PgUp / Alt+PgDn) — `GET /txn/adjacent`, docType
   * STOCK_TRANSFER. The walk spans both shapes (one table), so a document of
   * the OTHER screen is stepped over, not shown here.
   */
  const stepDocument = useCallback(
    async (previous: boolean): Promise<void> => {
      if (busyRef.current !== null) {
        return;
      }
      const current = draftRef.current;
      if (!current.svhId && !previous) {
        setNotice(STEP_NOTICES.newHasNoNext);
        return;
      }
      setBusy("loading");
      try {
        let fromId = current.svhId;
        for (let hop = 0; hop < 25; hop += 1) {
          const answer = await adjacentMutation({
            docType: "STOCK_TRANSFER",
            companyId: current.companyId,
            branchId: current.branchId,
            accYear: current.accYear,
            ...(fromId ? { docId: fromId } : {}),
            direction: previous ? "prev" : "next",
          }).unwrap();
          const doc = answer.doc;
          if (!doc) {
            setNotice(!current.svhId && hop === 0 ? STEP_NOTICES.none : previous ? STEP_NOTICES.oldest : STEP_NOTICES.newest);
            return;
          }
          const key: TransferDocKey = {
            svhId: doc.docId,
            companyId: doc.companyId,
            branchId: doc.branchId,
            accYear: doc.accYear,
            refno: doc.refno ?? undefined,
            status: doc.status,
          };
          const payload = await triggerLoad({ ...key }).unwrap();
          if (payload?.header?.svhId && shapeMatches(mode, payload)) {
            applyLoaded(docScopeOf(key), payload, false);
            focusEntryStart();
            return;
          }
          fromId = doc.docId;
        }
        setNotice(previous ? STEP_NOTICES.oldest : STEP_NOTICES.newest);
      } catch (error) {
        notify("warn", "Error", apiErrorText(error));
      } finally {
        setBusy(null);
      }
    },
    [adjacentMutation, applyLoaded, docScopeOf, focusEntryStart, mode, setNotice, triggerLoad],
  );

  // ----------------------------------------------------- save / post
  /** The gates, shown when one refuses. True = the save may go ahead. */
  const gate = useCallback((): boolean => {
    const refusal = checkBeforeSave(draftRef.current);
    if (refusal) {
      refuse(refusal);
      return false;
    }
    return true;
  }, [refuse]);

  /** A refused request: the 422's fields tint lines and boxes, the text is said once. */
  const showRefusal = useCallback(
    (error: unknown, sentKeys: readonly string[]) => {
      const mapped = mapServerRefusal(errorDetailsOf(error), sentKeys);
      commit({
        ...draftRef.current,
        serverProblems: mapped.lines,
        headerProblems: mapped.header,
        sentKeys: [...sentKeys],
      });
      const first = sentKeys.find((key) => mapped.lines[key]);
      if (first) {
        requestFocus({ target: "cell", key: first, column: COL.Qty });
      }
      notify("warn", "Error", apiErrorText(error));
    },
    [commit, requestFocus],
  );

  /** The saved draft, moved: same branch writes the OUT + IN pair (POSTED), another branch a transit row (IN_TRANSIT). */
  const despatch = useCallback(async (): Promise<boolean> => {
    const current = draftRef.current;
    const sentKeys = current.sentKeys.length > 0 ? current.sentKeys : buildLines(current).sentKeys;
    setBusy("posting");
    try {
      const result = await despatchMutation({
        svhId: current.svhId,
        accYear: current.accYear,
        companyId: current.companyId,
        branchId: current.branchId,
        ...despatchLorry(current),
      }).unwrap();
      if (mode === "branch") {
        const rows = Number(result?.transitRows ?? 0);
        notify(
          "info",
          "Despatched",
          `${current.refno} despatched — ${rows} line${rows === 1 ? "" : "s"} in transit to ${current.toBranchName}. ` +
            `${current.toBranchName} receives it in Branch Inward.`,
        );
      } else {
        const rows = Number(result?.ledgerRows ?? 0);
        notify("info", "Posted", `${current.refno} posted — the stock is in ${current.toGodownName} (${rows} ledger row${rows === 1 ? "" : "s"}).`);
      }
      startNextDocument();
      return true;
    } catch (error) {
      // The draft is saved; only the move failed. Say so, keep it open.
      showRefusal(error, sentKeys);
      commit({
        ...draftRef.current,
        notice: `Saved as ${current.refno} (draft) — the stock has not moved.`,
      });
      return false;
    } finally {
      setBusy(null);
    }
  }, [commit, despatchMutation, mode, showRefusal, startNextDocument]);

  /**
   * saveDocument — the gates must have passed (and a post been confirmed). A
   * browse-mode draft that is saved and unchanged can still be posted.
   */
  const save = useCallback(
    async (post: boolean): Promise<boolean> => {
      const current = draftRef.current;
      if (current.viewMode === "browse") {
        if (post && current.svhId && !current.dirty) {
          return despatch();
        }
        notify("info", "Read-only", "Press Edit to change this draft first.");
        return false;
      }
      const { payload, sentKeys } = buildPayload(current);
      setBusy("saving");
      try {
        const result = await saveMutation(payload).unwrap();
        const saved = applySaveResult(draftRef.current, result, sentKeys);
        commit(saved);
        if (post) {
          setBusy(null);
          return await despatch();
        }
        notify("info", "Saved", `${saved.refno} saved as a draft. No stock has moved — Post (Ctrl+Enter) moves it.`);
        return true;
      } catch (error) {
        showRefusal(error, sentKeys);
        return false;
      } finally {
        setBusy((value) => (value === "saving" ? null : value));
      }
    },
    [commit, despatch, saveMutation, showRefusal],
  );

  /** cancelVoucher — a POSTED godown transfer is reversed (after the reason and the confirmation). */
  const cancelDocument = useCallback(
    async (reason: string): Promise<boolean> => {
      const current = draftRef.current;
      setBusy("cancelling");
      try {
        await cancelMutation({
          svhId: current.svhId,
          accYear: current.accYear,
          companyId: current.companyId,
          branchId: current.branchId,
          reason: reason.trim(),
        }).unwrap();
        notify("info", "Cancelled", `${current.refno} cancelled — the stock is back in ${current.fromGodownName}.`);
        startNextDocument();
        return true;
      } catch (error) {
        notify("warn", "Error", apiErrorText(error));
        return false;
      } finally {
        setBusy(null);
      }
    },
    [cancelMutation, startNextDocument],
  );

  /** Notes 160 B — an untouched despatch comes back; refused (409) once the other branch keys any of it. */
  const recallDespatch = useCallback(
    async (reason: string): Promise<boolean> => {
      const current = draftRef.current;
      setBusy("cancelling");
      try {
        await recallMutation({
          svhId: current.svhId,
          accYear: current.accYear,
          companyId: current.companyId,
          branchId: current.branchId,
          reason: reason.trim(),
        }).unwrap();
        notify("info", "Recalled", `${current.refno} recalled — the stock is back in ${current.fromGodownName}.`);
        startNextDocument();
        return true;
      } catch (error) {
        notify("warn", "Error", apiErrorText(error));
        return false;
      } finally {
        setBusy(null);
      }
    },
    [recallMutation, startNextDocument],
  );

  const deleteDraft = useCallback(async (): Promise<boolean> => {
    const current = draftRef.current;
    setBusy("deleting");
    try {
      await deleteMutation({
        svhId: current.svhId,
        accYear: current.accYear,
        companyId: current.companyId,
        branchId: current.branchId,
      }).unwrap();
      notify("info", "Deleted", `${current.refno} deleted.`);
      startNextDocument();
      return true;
    } catch (error) {
      notify("warn", "Error", apiErrorText(error));
      return false;
    } finally {
      setBusy(null);
    }
  }, [deleteMutation, startNextDocument]);

  /** Settle short — by the SENDING branch, against TRANSIT_LOSS. The despatch is then re-read. */
  const settleShort = useCallback(
    async (remarks: string): Promise<boolean> => {
      const current = draftRef.current;
      setBusy("settling");
      try {
        const reasons = await triggerReasonList({ companyId: current.companyId }).unwrap();
        const loss = reasons.find((reason) => reason.code === "TRANSIT_LOSS" && reason.isActive !== false);
        if (!loss) {
          notify("warn", "No reason", "The TRANSIT_LOSS reason is not set up, so a short cannot be written off.");
          return false;
        }
        const answer = await settleMutation({
          outVoucherId: current.svhId,
          accYear: current.accYear,
          companyId: current.companyId,
          branchId: current.branchId,
          reasonId: loss.srmId,
          remarks: remarks.trim(),
        }).unwrap();
        notify("info", "Settled", answer?.message || `${current.refno} settled short.`);
        await load(
          { svhId: current.svhId, companyId: current.companyId, branchId: current.branchId, accYear: current.accYear },
          false,
        );
        return true;
      } catch (error) {
        notify("warn", "Error", apiErrorText(error));
        return false;
      } finally {
        setBusy(null);
      }
    },
    [load, settleMutation, triggerReasonList],
  );

  // ------------------------------------------------------ screen memory
  /** The document came back from screen memory: say so once, and read every line's holding again. */
  const finishResume = useCallback(async () => {
    // One tick first: this runs from the mount effect, and a lazy RTK trigger
    // fired there is unsubscribed by StrictMode's simulated unmount.
    await new Promise((resolve) => window.setTimeout(resolve, 0));
    toast.info(restoredMessage(MODE_NOUN[mode]), RESTORED_MESSAGE_OPTIONS);
    const current = draftRef.current;
    if (isEditable(current)) {
      refreshAll(current);
    }
    focusEntryStart();
  }, [focusEntryStart, mode, refreshAll]);

  /** The operator discarded the document: it must not come back. */
  const forgetRemembered = useCallback(() => {
    if (rememberOn) {
      discarded.current = true;
      screenMemory.forget(memoryKey, memoryScopeOf(draftRef.current));
    }
  }, [memoryKey, rememberOn]);

  // The session moved (a new branch or year): a document nobody started follows it.
  useEffect(() => {
    const current = draftRef.current;
    if (current.svhId || current.dirty || !scope.companyId) {
      return;
    }
    if (
      current.companyId === scope.companyId &&
      current.branchId === scope.branchId &&
      current.accYear === scope.accYear &&
      current.deviceId === scope.deviceId
    ) {
      return;
    }
    commit({ ...createDraft(scope, mode, current.docDate), notice: "" });
  }, [commit, mode, scope]);

  return {
    draft,
    draftRef,
    busy,
    reasons: reasonsQuery.data ?? EMPTY_REASONS,
    pick,
    focusRequest,
    focusEntryStart,
    requestFocus,
    // header
    setFromGodown,
    setToGodown,
    setToBranch,
    setHeader,
    setHandling,
    setHint,
    setNotice,
    // lines
    pickItem,
    resolveBarcode,
    editLine,
    insertLine,
    deleteLine,
    openPick,
    closePick,
    takeHolding,
    refuse,
    needGodowns,
    // document
    gate,
    save,
    cancelDocument,
    recallDespatch,
    deleteDraft,
    settleShort,
    load,
    newDocument,
    beginEdit,
    stepDocument,
    // screen memory
    resumed,
    finishResume,
    forgetRemembered,
  };
}

const EMPTY_REASONS: never[] = [];
const MODE_NOUN: Record<TransferMode, string> = { godown: "godown transfer", branch: "branch transfer" };

export type StockTransferDraftApi = ReturnType<typeof useStockTransferDraft>;
