"use client";

/**
 * Purchase Order — the screen's state and its conversations with the server
 * (Qt `PurchaseOrderEntry`). Every change goes through `commit`, which also
 * writes screen memory, so unsaved keying survives a trip to another menu.
 *
 * The figures: an edit bumps `calcVersion`; 350 ms after the last one (Qt's
 * recalc timer) the PO is sent to /purchase/orders/validate, and the answer is
 * painted only if nothing changed meanwhile (Qt `m_calcSeq`).
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { purchaseRefusalText, text } from "@/features/purchase/shared/purchase.format";
import { usePurchaseScope } from "@/features/purchase/shared/use-purchase-scope";
import type { PurchaseDocKey } from "@/features/purchase/shared/purchase.types";
import { todayIso } from "@/features/sales/quotation/quotation.utils";
import { toast } from "@/lib/notify";
import { RESTORED_MESSAGE_OPTIONS, restoredMessage, screenMemory, type ScreenScope } from "@/lib/screen-memory";
import { useForgetIfWritingOnUnmount, useRecalledOnce, type ScreenMemoryOption } from "@/lib/use-screen-memory";
import {
  usePurchaseOrderCancelMutation,
  usePurchaseOrderGetMutation,
  usePurchaseOrderGodownsMutation,
  usePurchaseOrderItemByBarcodeMutation,
  usePurchaseOrderItemLookupMutation,
  usePurchaseOrderSaveMutation,
  usePurchaseOrderShortCloseMutation,
  usePurchaseOrderValidateMutation,
} from "./order.api";
import { COL, PO_RECALC_DELAY_MS } from "./purchase-order.constants";
import {
  applyCalc,
  applyItem,
  buildPayload,
  canCalculate,
  createPoDraft,
  draftFromPayload,
  editLine as editLineState,
  isEditable,
  isPoWorthRemembering,
  removeLine as removeLineState,
  saveProblem,
} from "./purchase-order.state";
import type { PoDraft, PurchaseOrderPayload } from "./purchase-order.types";

export type PoBusy = "loading" | "saving" | "posting" | "cancelling" | "closing" | null;

export type PoFocusTarget =
  | { target: "cell"; key: string; column: number }
  | { target: "supplier" | "entryStart" | "grid" };
export type PoFocusRequest = PoFocusTarget & { seq: number };

const PO_NOUN = "purchase order";

function memoryScopeOf(draft: PoDraft): ScreenScope {
  return { companyId: draft.companyId, branchId: draft.branchId, accYear: draft.accYear };
}

export function usePurchaseOrderDraft(memory: ScreenMemoryOption | undefined) {
  const scope = usePurchaseScope();
  const memoryScope: ScreenScope = { companyId: scope.companyId, branchId: scope.branchId, accYear: scope.accYear };
  const recalled = useRecalledOnce<PoDraft>(memory, memoryScope);
  const resumed = recalled !== null;
  const [draft, setDraft] = useState<PoDraft>(() =>
    recalled ? { ...recalled, deviceId: recalled.deviceId || scope.deviceId } : createPoDraft(scope, todayIso()),
  );
  const draftRef = useRef(draft);
  const [busy, setBusy] = useState<PoBusy>(null);
  const busyRef = useRef<PoBusy>(busy);
  useLayoutEffect(() => {
    busyRef.current = busy;
  });
  const [focusRequest, setFocusRequest] = useState<PoFocusRequest | null>(null);
  const focusSeq = useRef(0);

  const [saveMutation] = usePurchaseOrderSaveMutation();
  const [validateMutation] = usePurchaseOrderValidateMutation();
  const [getMutation] = usePurchaseOrderGetMutation();
  const [cancelMutation] = usePurchaseOrderCancelMutation();
  const [shortCloseMutation] = usePurchaseOrderShortCloseMutation();
  const [itemLookupMutation] = usePurchaseOrderItemLookupMutation();
  const [barcodeMutation] = usePurchaseOrderItemByBarcodeMutation();
  const [godownsMutation] = usePurchaseOrderGodownsMutation();

  // -------------------------------------------------------------- commit
  const memoryKey = memory?.key ?? "";
  const discarded = useRef(false);
  const commit = useCallback(
    (next: PoDraft) => {
      draftRef.current = next;
      setDraft(next);
      if (memoryKey && !discarded.current) {
        if (isPoWorthRemembering(next)) {
          screenMemory.remember(memoryKey, memoryScopeOf(next), next);
        } else {
          screenMemory.forget(memoryKey, memoryScopeOf(next));
        }
      }
    },
    [memoryKey],
  );
  useForgetIfWritingOnUnmount(
    memory,
    () => ["saving", "posting", "cancelling", "closing"].includes(busyRef.current ?? ""),
    () => memoryScopeOf(draftRef.current),
  );

  const requestFocus = useCallback((request: PoFocusTarget) => {
    focusSeq.current += 1;
    setFocusRequest({ ...request, seq: focusSeq.current });
  }, []);

  const setHint = useCallback((hint: string) => commit({ ...draftRef.current, hint }), [commit]);

  /** Where a new or opened PO starts: the supplier, else the blank line's Barcode. */
  const focusEntryStart = useCallback(() => requestFocus({ target: "entryStart" }), [requestFocus]);

  // ---------------------------------------------------------- the header
  const setSupplier = useCallback(
    (id: string, name: string) => {
      const current = draftRef.current;
      if (!isEditable(current) || id === current.supplierId) {
        return;
      }
      // Inter- or intra-state follows the supplier: the figures change with it.
      commit({ ...current, supplierId: id, supplierName: name, dirty: true, calcVersion: current.calcVersion + 1 });
    },
    [commit],
  );
  const setGodown = useCallback(
    (id: string, name: string) => {
      const current = draftRef.current;
      if (!isEditable(current)) {
        return;
      }
      commit({ ...current, godownId: id, godownName: name, dirty: true });
    },
    [commit],
  );
  const setHeader = useCallback(
    (patch: Partial<Pick<PoDraft, "docDate" | "expectedDate" | "contact" | "remarks">>) => {
      const current = draftRef.current;
      if (!isEditable(current)) {
        return;
      }
      commit({ ...current, ...patch, dirty: true });
    },
    [commit],
  );

  // ------------------------------------------------------------ the lines
  const editLine = useCallback(
    (key: string, column: number, raw: string) => commit(editLineState(draftRef.current, key, column, raw)),
    [commit],
  );
  const removeLine = useCallback((key: string) => commit(removeLineState(draftRef.current, key)), [commit]);

  /**
   * Qt `fetchItem`: the item's unit, GST % and MRP. `uomId` is the unit the
   * operator picked (a picker row or a scanned code is one item × unit); empty
   * asks for the item's default unit.
   */
  const pickItem = useCallback(
    async (key: string, item: { itemId: string; itemName: string; uomId?: string }): Promise<boolean> => {
      const current = draftRef.current;
      if (!isEditable(current) || !item.itemId) {
        return false;
      }
      try {
        const lookup = await itemLookupMutation({
          companyId: current.companyId,
          branchId: current.branchId,
          itemId: item.itemId,
          uomId: item.uomId || undefined,
          onDate: current.docDate || todayIso(),
          godownId: current.godownId || undefined,
        }).unwrap();
        commit(applyItem(draftRef.current, key, lookup, item.itemName));
        requestFocus({ target: "cell", key, column: COL.Qty });
        return true;
      } catch (error) {
        toast.apiError(error);
        return false;
      }
    },
    [commit, itemLookupMutation, requestFocus],
  );

  /** A code scanned into a blank line's Barcode (Qt `resolveBarcode`). True when it named an item. */
  const resolveBarcode = useCallback(
    async (key: string, code: string): Promise<boolean> => {
      const current = draftRef.current;
      if (!isEditable(current) || !code.trim()) {
        return false;
      }
      try {
        const found = await barcodeMutation({ barcode: code.trim(), companyId: current.companyId }).unwrap();
        if (!found?.itemId) {
          throw new Error("not found");
        }
        return await pickItem(key, { itemId: found.itemId, itemName: text(found.itemName), uomId: text(found.unitId) });
      } catch {
        setHint(`Barcode ${code.trim()} not found.`);
        requestFocus({ target: "cell", key, column: COL.Barcode });
        return false;
      }
    },
    [barcodeMutation, pickItem, requestFocus, setHint],
  );

  // ------------------------------------------------------ the server's figures
  const calcSeq = useRef(0);
  const calcVersion = draft.calcVersion;
  const supplierId = draft.supplierId;
  useEffect(() => {
    if (calcVersion === 0 || !canCalculate(draftRef.current)) {
      return;
    }
    const timer = window.setTimeout(() => {
      const sent = draftRef.current;
      if (!canCalculate(sent)) {
        return;
      }
      calcSeq.current += 1;
      const seq = calcSeq.current;
      const { body, keysByLineNo } = buildPayload(sent, false);
      validateMutation(body)
        .unwrap()
        .then((calc) => {
          const now = draftRef.current;
          // A newer edit is on its way, or the document changed under the answer.
          if (seq !== calcSeq.current || now.calcVersion !== sent.calcVersion || now.poId !== sent.poId) {
            return;
          }
          commit(applyCalc(now, calc, keysByLineNo));
        })
        .catch((error: unknown) => {
          if (seq !== calcSeq.current) {
            return;
          }
          setHint(purchaseRefusalText(error));
        });
    }, PO_RECALC_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [calcVersion, commit, setHint, supplierId, validateMutation]);

  // ------------------------------------------------------------- loading
  /** The Deliver-to godown's name: /get carries only its id. */
  const nameGodown = useCallback(
    async (loaded: PoDraft) => {
      if (!loaded.godownId || loaded.godownName) {
        return;
      }
      try {
        const godowns = await godownsMutation({ branchId: loaded.branchId }).unwrap();
        const name = godowns.find((row) => row.id === loaded.godownId)?.name ?? "";
        const current = draftRef.current;
        if (name && current.poId === loaded.poId && current.godownId === loaded.godownId && !current.godownName) {
          commit({ ...current, godownName: name });
        }
      } catch {
        // Only the label is missing; the id is still sent on save.
      }
    },
    [commit, godownsMutation],
  );

  /** A stored PO's answer on screen (Qt `applyLoaded`). */
  const show = useCallback(
    (payload: PurchaseOrderPayload, viewMode: "browse" | "entry") => {
      calcSeq.current += 1; // drop any figures still on their way
      const next = draftFromPayload(payload, draftRef.current, viewMode);
      commit(next);
      void nameGodown(next);
      return next;
    },
    [commit, nameGodown],
  );

  const load = useCallback(
    async (key: PurchaseDocKey, forEdit: boolean): Promise<boolean> => {
      setBusy("loading");
      try {
        const payload = await getMutation({ poId: key.id, accYear: key.accYear || scope.accYear }).unwrap();
        show(payload, forEdit ? "entry" : "browse");
        return true;
      } catch (error) {
        toast.apiError(error);
        return false;
      } finally {
        setBusy(null);
      }
    },
    [getMutation, scope.accYear, show],
  );

  const newDocument = useCallback(() => {
    calcSeq.current += 1;
    discarded.current = false;
    commit(createPoDraft(scope, todayIso()));
    focusEntryStart();
  }, [commit, focusEntryStart, scope]);

  const beginEdit = useCallback((): boolean => {
    const current = draftRef.current;
    if (current.status !== "DRAFT") {
      toast.warn(`${current.refno} is ${current.status} — it cannot be edited.`, { title: "Not a draft" });
      return false;
    }
    commit({ ...current, viewMode: "entry" });
    return true;
  }, [commit]);

  // ------------------------------------------------------------- writing
  /** Qt `saveDocument`: Save Draft (post = false) or Confirm. */
  const save = useCallback(
    async (post: boolean): Promise<boolean> => {
      const current = draftRef.current;
      if (current.status !== "DRAFT") {
        toast.warn(`${current.refno} is ${current.status}.`, { title: "Not a draft" });
        return false;
      }
      const problem = saveProblem(current);
      if (problem) {
        toast.warn(problem.message, { title: problem.title });
        if (problem.focus === "supplier") {
          requestFocus({ target: "supplier" });
        } else if (problem.focus.key) {
          requestFocus({ target: "cell", key: problem.focus.key, column: COL.Qty });
        }
        return false;
      }
      if (!current.deviceId) {
        toast.warn("This sign-in carries no registered device. Sign in again on a registered computer.", {
          title: "No device",
        });
        return false;
      }
      setBusy(post ? "posting" : "saving");
      try {
        const payload = await saveMutation(buildPayload(current, post).body).unwrap();
        const next = show(payload, "entry");
        toast.success(
          post ? `${next.refno} confirmed — it is open for GRNs and bills.` : `${next.refno} saved as a draft.`,
          { title: post ? "Confirmed" : "Saved" },
        );
        return true;
      } catch (error) {
        setHint(purchaseRefusalText(error));
        toast.apiError(error, { title: "Not saved" });
        return false;
      } finally {
        setBusy(null);
      }
    },
    [requestFocus, saveMutation, setHint, show],
  );

  /** Qt `cancelOrder` — the reason is asked by the view. */
  const cancelOrder = useCallback(
    async (reason: string): Promise<boolean> => {
      const current = draftRef.current;
      if (!current.poId || current.status === "CANCELLED") {
        toast.warn("Open a saved purchase order first.", { title: "Nothing to cancel" });
        return false;
      }
      setBusy("cancelling");
      try {
        const payload = await cancelMutation({ poId: current.poId, accYear: current.accYear, reason }).unwrap();
        const next = show(payload, "browse");
        toast.success(`${next.refno} cancelled.`, { title: "Cancelled" });
        return true;
      } catch (error) {
        setHint(purchaseRefusalText(error));
        toast.apiError(error, { title: "Not cancelled" });
        return false;
      } finally {
        setBusy(null);
      }
    },
    [cancelMutation, setHint, show],
  );

  /** Qt `shortClose` — every pending line; what came stays. */
  const shortClose = useCallback(
    async (reason: string): Promise<boolean> => {
      const current = draftRef.current;
      if (current.status !== "POSTED") {
        toast.warn("Only a confirmed order is short-closed.", { title: "Not confirmed" });
        return false;
      }
      setBusy("closing");
      try {
        const payload = await shortCloseMutation({ poId: current.poId, accYear: current.accYear, reason }).unwrap();
        const next = show(payload, "browse");
        toast.success(`${next.refno} short-closed — nothing more is awaited on it.`, { title: "Short-closed" });
        return true;
      } catch (error) {
        setHint(purchaseRefusalText(error));
        toast.apiError(error, { title: "Not short-closed" });
        return false;
      } finally {
        setBusy(null);
      }
    },
    [setHint, shortCloseMutation, show],
  );

  // ------------------------------------------------------ screen memory
  /** The PO came back from screen memory: say so once and ask for its figures again. */
  const finishResume = useCallback(() => {
    toast.info(restoredMessage(PO_NOUN), RESTORED_MESSAGE_OPTIONS);
    const current = draftRef.current;
    if (isEditable(current)) {
      commit({ ...current, calcVersion: current.calcVersion + 1 });
    }
    focusEntryStart();
  }, [commit, focusEntryStart]);

  /** The operator discarded the document: it must not come back. */
  const forgetRemembered = useCallback(() => {
    if (memoryKey) {
      discarded.current = true;
      screenMemory.forget(memoryKey, memoryScopeOf(draftRef.current));
    }
  }, [memoryKey]);

  // The session moved (a new branch or year): a document nobody started follows it.
  useEffect(() => {
    const current = draftRef.current;
    if (current.poId || current.dirty || !scope.companyId) {
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
    commit({ ...current, ...scope });
  }, [commit, scope]);

  return {
    draft,
    draftRef,
    busy,
    resumed,
    focusRequest,
    requestFocus,
    focusEntryStart,
    setHint,
    setSupplier,
    setGodown,
    setHeader,
    editLine,
    removeLine,
    pickItem,
    resolveBarcode,
    load,
    newDocument,
    beginEdit,
    save,
    cancelOrder,
    shortClose,
    finishResume,
    forgetRemembered,
  };
}

export type PurchaseOrderDraftApi = ReturnType<typeof usePurchaseOrderDraft>;
