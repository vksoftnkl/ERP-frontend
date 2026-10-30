"use client";

/**
 * Shortage Receipt — the draft and every action that needs the network.
 *
 * The draft lives in state, mirrored in a ref so an answer that lands late reads
 * the draft as it is NOW; every rule is a pure transition in `shortage.state.ts`.
 * Screen memory is written in `commit`, the funnel every change goes through:
 * a receipt with unsaved keying survives a trip to another menu.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useGetTxnAdjacentMutation, type TxnAdjacentDoc } from "@/components/txn/txn-adjacent";
import { toast } from "@/lib/notify";
import { RESTORED_MESSAGE_OPTIONS, restoredMessage, screenMemory, type ScreenScope } from "@/lib/screen-memory";
import { useForgetIfWritingOnUnmount, useRecalledOnce, type ScreenMemoryOption } from "@/lib/use-screen-memory";
import { todayIso } from "@/features/sales/quotation/quotation.utils";
import type { ShortageCloseBody } from "@/features/purchase/supplier-dues/components/shortage-close-dialog";
import type { PurchaseAllocEntry } from "../shared/purchase-dialogs.types";
import type { PurchaseIssue } from "../shared/purchase-parts";
import { purchaseRefusalText, text } from "../shared/purchase.format";
import type { PurchaseDocKey } from "../shared/purchase.types";
import { usePurchaseScope } from "../shared/use-purchase-scope";
import {
  useShortageReceiptCancelMutation,
  useShortageReceiptCloseMutation,
  useShortageReceiptGetMutation,
  useShortageReceiptItemLookupMutation,
  useShortageReceiptOpenMutation,
  useShortageReceiptSaveMutation,
} from "./shortage.api";
import { ADJACENT_DOC_TYPE, HINT_NOTHING_SHORT, HINT_PICK_SUPPLIER, HINT_TICK_ROWS } from "./shortage.constants";
import {
  applyOpenRows,
  buildSavePayload,
  clearTicks,
  closedNotice,
  closeTargets,
  createDraft,
  draftFromPayload,
  editLine,
  isFresh,
  loadedHint,
  mergeFacts,
  refusalIssues,
  saveBlocker,
  setActive,
  setHeader,
  setLineAllocs,
  setReceive,
  setReceivedAt,
  setSignature,
  setSupplier,
  setTicked,
  stepEndNotice,
  toggleTick,
  type HeaderPatch,
  type LinePatch,
} from "./shortage.state";
import type { ShortageDraft, ShortageReceiptPayload } from "./shortage.types";

export type Busy = "loading" | "saving" | "posting" | "cancelling" | "closing" | null;

const WRITING: readonly Busy[] = ["saving", "posting", "cancelling", "closing"];

function memoryScopeOf(draft: ShortageDraft): ScreenScope {
  return { companyId: draft.companyId, branchId: draft.branchId, accYear: draft.accYear };
}

export function useShortageReceipt(memory: ScreenMemoryOption) {
  const scope = usePurchaseScope();
  const scopeRef = useRef(scope);
  useLayoutEffect(() => {
    scopeRef.current = scope;
  });

  const recalled = useRecalledOnce<ShortageDraft>(memory, { companyId: scope.companyId, branchId: scope.branchId, accYear: scope.accYear });
  const [draft, setDraft] = useState<ShortageDraft>(() => recalled ?? createDraft(scope, todayIso()));
  const draftRef = useRef(draft);

  const [busy, setBusyState] = useState<Busy>(null);
  const busyRef = useRef<Busy>(null);
  const setBusy = useCallback((next: Busy) => {
    busyRef.current = next;
    setBusyState(next);
  }, []);

  const [hint, setHint] = useState(HINT_PICK_SUPPLIER);
  /** The WARN / REFUSE strip: a refused save's errors[] (no override on a shortage receipt). */
  const [refusals, setRefusals] = useState<PurchaseIssue[]>([]);

  const [openMutation] = useShortageReceiptOpenMutation();
  const [getMutation] = useShortageReceiptGetMutation();
  const [saveMutation] = useShortageReceiptSaveMutation();
  const [cancelMutation] = useShortageReceiptCancelMutation();
  const [closeMutation] = useShortageReceiptCloseMutation();
  const [lookupMutation] = useShortageReceiptItemLookupMutation();
  const [adjacentMutation] = useGetTxnAdjacentMutation();

  // -------------------------------------------------------------- commit
  const discarded = useRef(false);
  const commit = useCallback(
    (next: ShortageDraft) => {
      draftRef.current = next;
      setDraft(next);
      if (!discarded.current) {
        if (next.dirty) {
          screenMemory.remember(memory.key, memoryScopeOf(next), next);
        } else {
          screenMemory.forget(memory.key, memoryScopeOf(next));
        }
      }
    },
    [memory.key],
  );
  const update = useCallback((change: (current: ShortageDraft) => ShortageDraft) => commit(change(draftRef.current)), [commit]);

  useForgetIfWritingOnUnmount(
    memory,
    () => WRITING.includes(busyRef.current),
    () => memoryScopeOf(draftRef.current),
  );

  /** The operator threw the receipt away: nothing more may bring it back. */
  const forgetRemembered = useCallback(() => {
    discarded.current = true;
    screenMemory.forget(memory.key, memoryScopeOf(draftRef.current));
  }, [memory.key]);

  /** A refusal: plain words on the hint line, its errors[] on the strip, the popup. */
  const refuse = useCallback((error: unknown, title = "Not done", strip = false) => {
    setHint(purchaseRefusalText(error));
    if (strip) {
      setRefusals(refusalIssues(error));
    }
    toast.apiError(error, { refusedTitle: title });
  }, []);

  /** An edit answers the refusal: the strip goes (Qt `onCellEdited`). */
  const answered = useCallback(() => {
    setRefusals((current) => (current.length > 0 ? [] : current));
  }, []);

  // ------------------------------------------------------- signatures
  /**
   * Each row's tracking signature (R = serials → F12 in serial mode, Batch is
   * F12's). Unknown on a failure: F12 still opens, in batch mode.
   */
  const fetchSignatures = useCallback(async () => {
    const current = draftRef.current;
    const wanted = current.lines.filter((line) => line.itemId && !line.signature);
    await Promise.all(
      wanted.map(async (line) => {
        try {
          const found = await lookupMutation({
            companyId: current.companyId,
            branchId: current.branchId,
            itemId: line.itemId,
            ...(line.uomId ? { uomId: line.uomId } : {}),
            onDate: current.receivedAt.slice(0, 10) || todayIso(),
            ...(current.godownId ? { godownId: current.godownId } : {}),
          }).unwrap();
          const signature = text(found?.trackSignature);
          if (signature) {
            commit(setSignature(draftRef.current, line.key, signature));
          }
        } catch {
          // unknown: F12 opens in batch mode
        }
      }),
    );
  }, [commit, lookupMutation]);

  // ------------------------------------------------------- the open list
  const openSeq = useRef(0);
  const notice = useRef("");
  /**
   * The supplier's open shortages → one row each, keeping what was ticked /
   * typed on the rows still open (Qt `reloadOpen`). A saved receipt keeps its own lines.
   */
  const reloadOpen = useCallback(async () => {
    const current = draftRef.current;
    if (!current.supplierId || !isFresh(current) || !current.companyId || !current.branchId) {
      return;
    }
    const seq = ++openSeq.current;
    const asked = current.supplierId;
    setBusy("loading");
    try {
      const rows = await openMutation({
        companyId: current.companyId,
        branchId: current.branchId,
        supplierId: asked,
      }).unwrap();
      const now = draftRef.current;
      if (seq !== openSeq.current || now.supplierId !== asked || !isFresh(now)) {
        return;
      }
      commit(applyOpenRows(now, rows));
      const said = rows.length === 0 ? HINT_NOTHING_SHORT : HINT_TICK_ROWS;
      setHint(notice.current ? `${notice.current} ${said}` : said);
      notice.current = "";
      void fetchSignatures();
    } catch (error) {
      if (seq === openSeq.current) {
        setHint(purchaseRefusalText(error));
        toast.apiError(error, { refusedTitle: "Cannot list the shortages" });
      }
    } finally {
      if (seq === openSeq.current) {
        setBusy(null);
      }
    }
  }, [commit, fetchSignatures, openMutation, setBusy]);

  /** A reopened receipt: Date / Age / Recd / Closed / GST held from /open?all=true (Qt `mergeFacts`). */
  const mergeOpenFacts = useCallback(async () => {
    const current = draftRef.current;
    if (!current.supplierId || current.lines.length === 0) {
      return;
    }
    const seq = openSeq.current;
    try {
      const rows = await openMutation({
        companyId: current.companyId,
        branchId: current.branchId,
        supplierId: current.supplierId,
        all: "true",
      }).unwrap();
      if (seq === openSeq.current && draftRef.current.psrId === current.psrId) {
        commit(mergeFacts(draftRef.current, rows));
      }
    } catch {
      // the figures stay blank; the lines are the receipt's own
    }
  }, [commit, openMutation]);

  // ------------------------------------------------------------ header
  const chooseSupplier = useCallback(
    (supplierId: string, supplierName: string) => {
      const before = draftRef.current.supplierId;
      update((current) => setSupplier(current, supplierId, supplierName));
      if (supplierId !== before) {
        void reloadOpen();
      }
    },
    [reloadOpen, update],
  );
  const patchHeader = useCallback((patch: HeaderPatch) => update((current) => setHeader(current, patch)), [update]);
  const patchReceivedAt = useCallback((value: string) => update((current) => setReceivedAt(current, value)), [update]);

  // ------------------------------------------------------------ the rows
  const patchLine = useCallback(
    (key: string, patch: LinePatch) => {
      answered();
      update((current) => editLine(current, key, patch));
    },
    [answered, update],
  );
  const typeReceive = useCallback(
    (key: string, typed: string) => {
      answered();
      update((current) => setReceive(current, key, typed));
    },
    [answered, update],
  );
  const tick = useCallback(
    (key: string, on?: boolean) => {
      answered();
      update((current) => (on === undefined ? toggleTick(current, key) : setTicked(current, key, on)));
    },
    [answered, update],
  );
  const selectLine = useCallback((key: string) => update((current) => setActive(current, key)), [update]);
  const applyAllocs = useCallback(
    (key: string, allocs: PurchaseAllocEntry[]) => {
      answered();
      update((current) => setLineAllocs(current, key, allocs));
    },
    [answered, update],
  );

  // ------------------------------------------------------------ opening
  /** A saved receipt on screen (get / save / cancel answer), then its shortages' figures. */
  const showPayload = useCallback(
    (payload: ShortageReceiptPayload, mode: "browse" | "entry") => {
      openSeq.current += 1; // an open list still on its way belongs to the receipt that was
      const next = draftFromPayload(payload, scopeRef.current, mode);
      commit(next);
      setHint(loadedHint(next));
      void mergeOpenFacts();
      void fetchSignatures();
    },
    [commit, fetchSignatures, mergeOpenFacts],
  );

  const load = useCallback(
    async (key: PurchaseDocKey, forEdit: boolean): Promise<boolean> => {
      setBusy("loading");
      try {
        const payload = await getMutation({ psrId: key.id, accYear: key.accYear || scopeRef.current.accYear }).unwrap();
        setRefusals([]);
        showPayload(payload, forEdit ? "entry" : "browse");
        return true;
      } catch (error) {
        refuse(error, "Cannot open the receipt");
        return false;
      } finally {
        setBusy(null);
      }
    },
    [getMutation, refuse, setBusy, showPayload],
  );

  /** New (Alt+N): a blank receipt under the session's tenant. */
  const reset = useCallback(() => {
    openSeq.current += 1;
    discarded.current = false;
    setRefusals([]);
    commit(createDraft(scopeRef.current, todayIso()));
    setHint(HINT_PICK_SUPPLIER);
  }, [commit]);

  /**
   * Previous / Next (Alt+PgUp / Alt+PgDn; Qt Ctrl+PgUp / Ctrl+PgDn) — `GET
   * /txn/adjacent`, docType SHORTAGE_RECEIPT. The receipt opens read only.
   */
  const stepDocument = useCallback(
    async (previous: boolean): Promise<boolean> => {
      if (busyRef.current !== null) {
        return false;
      }
      const current = draftRef.current;
      if (!current.psrId && !previous) {
        setHint(stepEndNotice(true, false));
        return false;
      }
      setBusy("loading");
      let doc: TxnAdjacentDoc | null = null;
      try {
        const answer = await adjacentMutation({
          docType: ADJACENT_DOC_TYPE,
          companyId: current.companyId,
          branchId: current.branchId,
          accYear: current.accYear,
          ...(current.psrId ? { docId: current.psrId } : {}),
          direction: previous ? "prev" : "next",
        }).unwrap();
        doc = answer.doc;
      } catch (error) {
        refuse(error, "Cannot step");
        return false;
      } finally {
        setBusy(null);
      }
      if (!doc) {
        setHint(stepEndNotice(!current.psrId, previous));
        return false;
      }
      discarded.current = false;
      return load(
        { id: doc.docId, companyId: doc.companyId, branchId: doc.branchId, accYear: doc.accYear, refno: doc.refno ?? "", status: doc.status },
        false,
      );
    },
    [adjacentMutation, load, refuse, setBusy],
  );

  /** F2 — a draft that was only looked at opens for keying. */
  const beginEdit = useCallback(() => {
    update((current) => (current.status === "DRAFT" && current.psrId ? { ...current, mode: "entry" } : current));
  }, [update]);

  // ------------------------------------------------------------ writing
  /** Save Draft / Post receipt (Qt `saveDocument`) — answers the receipt as the server now has it. */
  const save = useCallback(
    async (post: boolean): Promise<boolean> => {
      const current = draftRef.current;
      const blocker = saveBlocker(current);
      if (blocker) {
        toast.warn(blocker.text, { title: blocker.title });
        return false;
      }
      setBusy(post ? "posting" : "saving");
      try {
        const answer = await saveMutation(buildSavePayload(current, post)).unwrap();
        setRefusals([]);
        showPayload(answer.data, "entry");
        const refno = text(answer.data.header.psrRefno);
        const sentence = post
          ? `${refno} posted — the goods are in at the bill cost, the shortage cleared, its GST released.`
          : `${refno} saved as a draft. Its qty is held against the shortages.`;
        setHint(sentence);
        toast.success(sentence, { title: post ? "Posted" : "Saved" });
        return true;
      } catch (error) {
        refuse(error, "Not saved", true);
        return false;
      } finally {
        setBusy(null);
      }
    },
    [refuse, saveMutation, setBusy, showPayload],
  );

  /** Cancel (Alt+X) — a draft or a posted receipt; the reason is asked by the screen. */
  const cancel = useCallback(
    async (reason: string): Promise<boolean> => {
      const current = draftRef.current;
      if (!current.psrId || current.status === "CANCELLED") {
        toast.warn("Open a saved receipt first.", { title: "Nothing to cancel" });
        return false;
      }
      setBusy("cancelling");
      try {
        const answer = await cancelMutation({ psrId: current.psrId, accYear: current.accYear, reason }).unwrap();
        showPayload(answer.data, "browse");
        const sentence = `${current.refno} cancelled — the goods went out again, the shortage is open again.`;
        setHint(sentence);
        toast.success(sentence, { title: "Cancelled" });
        return true;
      } catch (error) {
        refuse(error, "Not cancelled");
        return false;
      } finally {
        setBusy(null);
      }
    },
    [cancelMutation, refuse, setBusy, showPayload],
  );

  /**
   * Close row… — the ticked open rows (else the current one), one POST
   * /purchase/shortages/close each with the dialog's keys (Qt `closeRows`). What
   * closed before a refusal stays closed: the list is read again either way.
   */
  const closeRows = useCallback(
    async (body: ShortageCloseBody): Promise<boolean> => {
      const current = draftRef.current;
      const rows = closeTargets(current);
      if (!isFresh(current) || rows.length === 0) {
        return false;
      }
      setBusy("closing");
      let done = 0;
      try {
        for (const row of rows) {
          await closeMutation({ ...body, shortageId: row.shortageId, accYear: row.shortageYear, deviceId: current.deviceId }).unwrap();
          done += 1;
        }
      } catch (error) {
        setBusy(null);
        await reloadOpen();
        refuse(error, done === 0 ? "Not closed" : `Closed ${done}, then refused`);
        return false;
      }
      setBusy(null);
      commit(clearTicks(draftRef.current));
      notice.current = closedNotice(rows.length, body.kind);
      setHint(notice.current);
      await reloadOpen();
      return true;
    },
    [closeMutation, commit, refuse, reloadOpen, setBusy],
  );

  // ------------------------------------------------------ screen memory
  // Back on a remembered receipt: say so once and read the open list again —
  // it may have moved while the operator was away (what was ticked is kept).
  const resumed = useRef(recalled !== null);
  useEffect(() => {
    if (!resumed.current) {
      return;
    }
    resumed.current = false;
    // One tick first: a request fired from the mount effect is torn down by StrictMode's simulated unmount.
    const timer = window.setTimeout(() => {
      toast.info(restoredMessage("shortage receipt"), RESTORED_MESSAGE_OPTIONS);
      setHint(HINT_TICK_ROWS);
      void reloadOpen();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [reloadOpen]);

  // A new, untouched receipt follows the session's tenant (a branch switch).
  useEffect(() => {
    const current = draftRef.current;
    if (current.psrId || current.dirty || current.supplierId) {
      return;
    }
    if (
      current.companyId !== scope.companyId ||
      current.branchId !== scope.branchId ||
      current.accYear !== scope.accYear ||
      current.deviceId !== scope.deviceId
    ) {
      commit({ ...current, ...scope });
    }
  }, [commit, scope]);

  return {
    draft,
    draftRef,
    busy,
    hint,
    setHint,
    refusals,
    chooseSupplier,
    patchHeader,
    patchReceivedAt,
    patchLine,
    typeReceive,
    tick,
    selectLine,
    applyAllocs,
    reloadOpen,
    load,
    reset,
    beginEdit,
    stepDocument,
    save,
    cancel,
    closeRows,
    forgetRemembered,
  };
}

export type ShortageReceiptApi = ReturnType<typeof useShortageReceipt>;
