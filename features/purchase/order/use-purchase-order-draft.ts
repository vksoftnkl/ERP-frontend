"use client";

/**
 * Purchase Order — the screen's state and its conversations with the server
 * (Qt `PurchaseOrderEntry`). Every change goes through `commit`, which also
 * writes screen memory, so unsaved keying survives a trip to another menu.
 *
 * The figures: an edit bumps `calcVersion`; 350 ms after the last one (Qt's
 * recalc timer) the PO is sent to /purchase/orders/validate, and the answer is
 * painted only if nothing changed meanwhile (Qt `m_calcSeq`).
 *
 * DOC-01 (Qt 6c6b5c2): amend a confirmed PO, clone, merge the supplier's
 * pending POs, approve / refuse, the saved versions; and Qt 7c809f9's
 * Previous / Next over `/txn/adjacent` (docType PURCHASE_ORDER).
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useGetTxnAdjacentMutation } from "@/components/txn/txn-adjacent";
import { num, purchaseRefusalText, qtyText, text } from "@/features/purchase/shared/purchase.format";
import { isoToDisplayDate } from "@/lib/date-format";
import { usePurchaseScope } from "@/features/purchase/shared/use-purchase-scope";
import type { PurchaseDocKey } from "@/features/purchase/shared/purchase.types";
import { todayIso } from "@/features/sales/quotation/quotation.utils";
import { toast } from "@/lib/notify";
import { RESTORED_MESSAGE_OPTIONS, restoredMessage, screenMemory, type ScreenScope } from "@/lib/screen-memory";
import { useForgetIfWritingOnUnmount, useRecalledOnce, type ScreenMemoryOption } from "@/lib/use-screen-memory";
import {
  usePurchaseOrderApproveMutation,
  usePurchaseOrderCancelMutation,
  usePurchaseOrderCloneMutation,
  usePurchaseOrderGetMutation,
  usePurchaseOrderGodownsMutation,
  usePurchaseOrderItemByBarcodeMutation,
  usePurchaseOrderItemLookupMutation,
  usePurchaseOrderMergeMutation,
  usePurchaseOrderPendingLinesMutation,
  usePurchaseOrderRevisionsMutation,
  usePurchaseOrderSaveMutation,
  usePurchaseOrderShortCloseMutation,
  usePurchaseOrderValidateMutation,
  usePurchaseOrderItemContextMutation,
  usePurchaseOrderReorderSuggestionsMutation,
  usePurchaseOrderSupplierContextMutation,
} from "./order.api";
import { chargeFromMaster, suggestionsOf, type ReorderSuggestion } from "./po-fidelity";
import { COL, PO_RECALC_DELAY_MS } from "./purchase-order.constants";
import {
  amendProblem,
  applyCalc,
  applyItem,
  blankLine,
  buildPayload,
  canCalculate,
  createPoDraft,
  draftFromPayload,
  editLine as editLineState,
  isEditable,
  isPoWorthRemembering,
  itemLines,
  pendingNote,
  removeLine as removeLineState,
  saveProblem,
  startAmend,
  supplierEditable,
  withPoDefaults,
  withTrailingBlank,
} from "./purchase-order.state";
import type {
  PoChargeLine,
  PoDraft,
  PoLine,
  PurchaseOrderPayload,
  PurchaseOrderPendingLine,
  PurchaseOrderRefArgs,
  PurchaseOrderRevision,
} from "./purchase-order.types";

export type PoBusy = "loading" | "saving" | "posting" | "cancelling" | "closing" | "approving" | "copying" | null;

/** Qt `PurchaseDocNav::step` — what the hint says at either end of the walk. */
const STEP_NOTICES = {
  newHasNoNext: "A new purchase order is the newest — nothing comes after it.",
  none: "There is no purchase order yet.",
  oldest: "This is the oldest purchase order.",
  newest: "This is the newest purchase order.",
} as const;

/** Qt `saveDocument`: a PO above purchase.po_approval_above waits. */
const WAITS_NOTE = " It is above the approval limit — it feeds no GRN or bill until approved.";

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
    recalled ? withPoDefaults({ ...recalled, deviceId: recalled.deviceId || scope.deviceId }) : createPoDraft(scope, todayIso()),
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
  const [approveMutation] = usePurchaseOrderApproveMutation();
  const [cloneMutation] = usePurchaseOrderCloneMutation();
  const [mergeMutation] = usePurchaseOrderMergeMutation();
  const [revisionsMutation] = usePurchaseOrderRevisionsMutation();
  const [pendingLinesMutation] = usePurchaseOrderPendingLinesMutation();
  const [adjacentMutation] = useGetTxnAdjacentMutation();
  const [supplierContextMutation] = usePurchaseOrderSupplierContextMutation();
  const [itemContextMutation] = usePurchaseOrderItemContextMutation();
  const [suggestionsMutation] = usePurchaseOrderReorderSuggestionsMutation();

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
    () => ["saving", "posting", "cancelling", "closing", "approving", "copying"].includes(busyRef.current ?? ""),
    () => memoryScopeOf(draftRef.current),
  );

  const requestFocus = useCallback((request: PoFocusTarget) => {
    focusSeq.current += 1;
    setFocusRequest({ ...request, seq: focusSeq.current });
  }, []);

  const setHint = useCallback((hint: string) => commit({ ...draftRef.current, hint }), [commit]);

  /** Where a new or opened PO starts: the supplier, else the blank line's Barcode. */
  const focusEntryStart = useCallback(() => requestFocus({ target: "entryStart" }), [requestFocus]);

  // ------------------------------------------- the supplier's pending POs
  /** The supplier's confirmed PO lines with something pending (Merge…, the new-PO note). */
  const fetchSupplierPending = useCallback(
    async (supplierId: string): Promise<PurchaseOrderPendingLine[] | null> => {
      const current = draftRef.current;
      if (!supplierId) {
        return [];
      }
      try {
        return await pendingLinesMutation({
          companyId: current.companyId,
          branchId: current.branchId,
          supplierId,
        }).unwrap();
      } catch (error) {
        toast.apiError(error);
        return null;
      }
    },
    [pendingLinesMutation],
  );

  // ---------------------------------------------------------- the header
  const setSupplier = useCallback(
    (id: string, name: string) => {
      const current = draftRef.current;
      if (!supplierEditable(current) || id === current.supplierId) {
        return;
      }
      // Inter- or intra-state follows the supplier: the figures change with it.
      commit({ ...current, supplierId: id, supplierName: name, creditTyped: false, dirty: true, calcVersion: current.calcVersion + 1 });
      // Qt loadSupplierContext: its credit days "(supplier default)" and default godown
      if (id) {
        void supplierContextMutation({ companyId: current.companyId, branchId: current.branchId, supplierId: id })
          .unwrap()
          .then((context) => {
            const now = draftRef.current;
            if (now.supplierId !== id || !isEditable(now)) {
              return;
            }
            let next = now;
            if (!now.creditTyped && typeof context.creditDays === "number") {
              next = { ...next, creditDays: String(context.creditDays), creditNote: "(supplier default)" };
            }
            if (!now.godownId && text(context.defaultGodownId)) {
              next = { ...next, godownId: text(context.defaultGodownId), godownName: text(context.defaultGodownName) };
            }
            if (next !== now) {
              commit(next);
            }
          })
          .catch(() => undefined);
      }
      if (current.poId || !id) {
        return;
      }
      // DOC-02: a NEW PO says the supplier still has orders pending (Qt `loadSupplierPending(offer)`).
      void pendingLinesMutation({ companyId: current.companyId, branchId: current.branchId, supplierId: id })
        .unwrap()
        .then((rows) => {
          const now = draftRef.current;
          const note = pendingNote(rows);
          if (note && !now.poId && now.supplierId === id) {
            commit({ ...now, hint: note });
          }
        })
        .catch(() => undefined);
    },
    [commit, pendingLinesMutation, supplierContextMutation],
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
    (patch: Partial<Pick<PoDraft, "docDate" | "expectedDate" | "contact" | "remarks" | "creditDays" | "creditTyped" | "creditNote" | "termsId" | "termsLabel" | "termsText">>) => {
      const current = draftRef.current;
      if (!isEditable(current)) {
        return;
      }
      commit({ ...current, ...patch, dirty: true });
    },
    [commit],
  );
  /** The agent (grid 194 picker) — the figures are asked again (Qt m_recalc). */
  const setAgent = useCallback(
    (id: string, name: string) => {
      const current = draftRef.current;
      if (!isEditable(current) || current.agentId === id) {
        return;
      }
      commit({ ...current, agentId: id, agentName: id ? name : "", dirty: true, calcVersion: current.calcVersion + 1 });
    },
    [commit],
  );

  // ------------------------------------------------- estimated charges (CHG-07)
  const changeCharges = useCallback(
    (change: (charges: PoChargeLine[]) => PoChargeLine[]) => {
      const current = draftRef.current;
      if (!isEditable(current)) {
        return;
      }
      commit({ ...current, charges: change(current.charges ?? []), dirty: true, calcVersion: current.calcVersion + 1 });
    },
    [commit],
  );
  const addCharge = useCallback(
    (master: Parameters<typeof chargeFromMaster>[0]) => changeCharges((charges) => [...charges, chargeFromMaster(master)]),
    [changeCharges],
  );
  /** A typed Amount wins over the rate (sent as the amount); typing the Rate hands it back to the server. */
  const editCharge = useCallback(
    (key: string, field: "rate" | "amount", raw: string) => {
      const value = raw.replace(/,/g, "").trim();
      if (!/^-?\d*(\.\d{0,4})?$/.test(value)) {
        return;
      }
      changeCharges((charges) =>
        charges.map((c) => (c.key !== key ? c : field === "amount" ? { ...c, amount: value, typed: value !== "" } : { ...c, rate: value, typed: false })),
      );
    },
    [changeCharges],
  );
  const removeCharge = useCallback((key: string) => changeCharges((charges) => charges.filter((c) => c.key !== key)), [changeCharges]);

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
        // Qt fetchItemContext: Last rate (only in the line's unit) and SALEABLE stock
        void itemContextMutation({
          companyId: current.companyId,
          branchId: current.branchId,
          itemId: item.itemId,
          ...(current.supplierId ? { supplierId: current.supplierId } : {}),
        })
          .unwrap()
          .then((context) => {
            const now = draftRef.current;
            const line = now.lines.find((candidate) => candidate.key === key);
            if (!line || line.itemId !== item.itemId) {
              return;
            }
            const last = Array.isArray(context.lastPurchases) ? (context.lastPurchases[0] as Record<string, unknown> | undefined) : undefined;
            const stock = (context.stock ?? null) as Record<string, unknown> | null;
            const patch: Partial<PoLine> = {};
            if (last && text(last.unitName) === line.unitName) {
              patch.lastRate = text(last.rate);
              patch.lastRateTip = [text(last.refno), text(last.supplierName), isoToDisplayDate(text(last.docDate).slice(0, 10))].filter(Boolean).join(" · ");
            }
            if (stock && text(stock.unitName) === line.unitName) {
              patch.stock = qtyText(num(stock.saleable));
            }
            if (Object.keys(patch).length > 0) {
              commit({ ...now, lines: now.lines.map((candidate) => (candidate.key === key ? { ...candidate, ...patch } : candidate)) });
            }
          })
          .catch(() => undefined); // context only — the line stands without it
        return true;
      } catch (error) {
        toast.apiError(error);
        return false;
      }
    },
    [commit, itemContextMutation, itemLookupMutation, requestFocus],
  );

  // ------------------------------------------------ reorder suggestions (F7)
  /** GET /purchase/reorder/suggestions — the supplier's when one is picked; items already on the order left out. */
  const fetchSuggestions = useCallback(async (): Promise<ReorderSuggestion[] | null> => {
    const current = draftRef.current;
    try {
      const rows = await suggestionsMutation({
        companyId: current.companyId,
        branchId: current.branchId,
        ...(current.supplierId ? { supplierId: current.supplierId } : {}),
      }).unwrap();
      return suggestionsOf(rows, new Set(itemLines(current).map((line) => line.itemId)));
    } catch (error) {
      toast.apiError(error);
      return null;
    }
  }, [suggestionsMutation]);

  /** Qt addReorderRows: each ticked one a line at the suggested qty / rate, then its item lookup. */
  const addReorderRows = useCallback(
    async (rows: readonly ReorderSuggestion[]) => {
      const current = draftRef.current;
      if (!isEditable(current) || rows.length === 0) {
        return;
      }
      const added = rows.map((row) => ({
        ...blankLine(),
        qty: qtyText(row.suggestedQty),
        rate: row.rate > 0 ? String(row.rate) : "",
        reorder: qtyText(row.reorderQty),
      }));
      commit({ ...current, lines: [...itemLines(current), ...added], dirty: true });
      for (let index = 0; index < rows.length; index += 1) {
        await pickItem(added[index].key, { itemId: rows[index].itemId, itemName: rows[index].itemName, uomId: rows[index].uomId });
      }
      const now = draftRef.current;
      commit({
        ...now,
        lines: withTrailingBlank(now.lines),
        hint: `${rows.length} reorder suggestion${rows.length === 1 ? "" : "s"} added — check the qty and rate, then Post.`,
      });
    },
    [commit, pickItem],
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

  /** Qt `beginAmend`: a confirmed PO opens for change (the view checks the Amend right). */
  const beginAmend = useCallback((): boolean => {
    const current = draftRef.current;
    const problem = amendProblem(current);
    if (problem) {
      toast.warn(problem, { title: "Not open" });
      return false;
    }
    calcSeq.current += 1;
    commit(startAmend(current));
    return true;
  }, [commit]);

  /** Leave an amendment unsaved: the stored PO again. */
  const stopAmend = useCallback(async (): Promise<boolean> => {
    const current = draftRef.current;
    if (!current.amending || !current.poId) {
      return false;
    }
    setBusy("loading");
    try {
      const payload = await getMutation({ poId: current.poId, accYear: current.accYear }).unwrap();
      show(payload, "browse");
      return true;
    } catch (error) {
      toast.apiError(error);
      return false;
    } finally {
      setBusy(null);
    }
  }, [getMutation, show]);

  /**
   * Previous / Next (Alt+PgUp / Alt+PgDn) — `GET /txn/adjacent`, docType
   * PURCHASE_ORDER (Qt `PurchaseDocNav::step`). The view asks about unsaved
   * keying first. The document opens read-only; F2 edits / amends it.
   */
  const stepDocument = useCallback(
    async (previous: boolean): Promise<void> => {
      if (busyRef.current !== null) {
        return;
      }
      const current = draftRef.current;
      if (!current.poId && !previous) {
        setHint(STEP_NOTICES.newHasNoNext);
        return;
      }
      setBusy("loading");
      try {
        const answer = await adjacentMutation({
          docType: "PURCHASE_ORDER",
          companyId: current.companyId || scope.companyId,
          branchId: current.branchId || scope.branchId,
          accYear: current.accYear || scope.accYear,
          ...(current.poId ? { docId: current.poId } : {}),
          direction: previous ? "prev" : "next",
        }).unwrap();
        const doc = answer.doc;
        if (!doc) {
          setHint(!current.poId ? STEP_NOTICES.none : previous ? STEP_NOTICES.oldest : STEP_NOTICES.newest);
          return;
        }
        const payload = await getMutation({ poId: doc.docId, accYear: doc.accYear }).unwrap();
        discarded.current = false;
        show(payload, "browse");
        requestFocus({ target: "grid" });
      } catch (error) {
        setHint(purchaseRefusalText(error));
      } finally {
        setBusy(null);
      }
    },
    [adjacentMutation, getMutation, requestFocus, scope.accYear, scope.branchId, scope.companyId, setHint, show],
  );

  // ------------------------------------------------------------- writing
  /**
   * Qt `saveDocument`: Save Draft (post = false) or Confirm — or, on an
   * amendment, Save amendment (confirmed again, revision + 1; the view asked
   * why).
   */
  const save = useCallback(
    async (post: boolean, amendReason = ""): Promise<boolean> => {
      const current = draftRef.current;
      const amending = current.amending && current.status === "POSTED";
      if (current.status !== "DRAFT" && !amending) {
        toast.warn(`${current.refno} is ${current.status} — Amend changes a confirmed order.`, { title: "Not a draft" });
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
      setBusy(post || amending ? "posting" : "saving");
      try {
        const payload = await saveMutation(buildPayload(current, post, amendReason).body).unwrap();
        const next = show(payload, "entry");
        const waits = next.status === "POSTED" && next.approvalStatus === "AWAITING" ? WAITS_NOTE : "";
        if (amending) {
          toast.success(`${next.refno} amended — revision ${next.revisionNo} kept.${waits}`, { title: "Amended" });
        } else {
          toast.success(
            post ? `${next.refno} confirmed — it is open for GRNs and bills.${waits}` : `${next.refno} saved as a draft.`,
            { title: post ? "Confirmed" : "Saved" },
          );
        }
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
    async (reason: string, lineIds: readonly string[] = []): Promise<boolean> => {
      const current = draftRef.current;
      if (current.status !== "POSTED") {
        toast.warn("Only a confirmed order is short-closed.", { title: "Not confirmed" });
        return false;
      }
      setBusy("closing");
      try {
        const payload = await shortCloseMutation({
          poId: current.poId,
          accYear: current.accYear,
          reason,
          ...(lineIds.length > 0 ? { lineIds: [...lineIds] } : {}),
        }).unwrap();
        const next = show(payload, "browse");
        toast.success(
          lineIds.length > 0
            ? `${next.refno}: ${lineIds.length} line${lineIds.length === 1 ? "" : "s"} short-closed — the rest stays open.`
            : `${next.refno} short-closed — nothing more is awaited on it.`,
          { title: "Short-closed" },
        );
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

  // ------------------------------------------------------------- DOC-01
  /** Qt `cloneOrder`: a new DRAFT with these lines (the view asks about unsaved keying). */
  const cloneOrder = useCallback(async (): Promise<boolean> => {
    const current = draftRef.current;
    if (!current.poId || current.amending) {
      return false;
    }
    if (!current.deviceId) {
      toast.warn("This sign-in carries no registered device. Sign in again on a registered computer.", { title: "No device" });
      return false;
    }
    setBusy("copying");
    try {
      const payload = await cloneMutation({ poId: current.poId, accYear: current.accYear, deviceId: current.deviceId }).unwrap();
      discarded.current = false;
      const next = show(payload, "entry");
      commit({ ...next, hint: `${next.refno} is a new draft copied from ${current.refno} — change it and Confirm.` });
      toast.success(`${next.refno} made from ${current.refno}.`, { title: "Cloned" });
      requestFocus({ target: "entryStart" });
      return true;
    } catch (error) {
      setHint(purchaseRefusalText(error));
      toast.apiError(error, { title: "Not cloned" });
      return false;
    } finally {
      setBusy(null);
    }
  }, [cloneMutation, commit, requestFocus, setHint, show]);

  /** Qt `mergeSelected`: the ticked POs' pending → one new draft; they short-close "Merged into …". */
  const mergeOrders = useCallback(
    async (sources: PurchaseOrderRefArgs[]): Promise<boolean> => {
      const current = draftRef.current;
      if (sources.length < 2) {
        toast.warn("Tick at least two orders to merge.", { title: "Pick two" });
        return false;
      }
      if (!current.deviceId) {
        toast.warn("This sign-in carries no registered device. Sign in again on a registered computer.", { title: "No device" });
        return false;
      }
      setBusy("copying");
      try {
        const payload = await mergeMutation({ sources, accYear: current.accYear, deviceId: current.deviceId }).unwrap();
        discarded.current = false;
        const next = show(payload, "entry");
        commit({
          ...next,
          hint: `${next.refno} is a new draft with what was pending on ${sources.length} orders; they are short-closed "Merged into ${next.refno}".`,
        });
        toast.success(`${next.refno} made from ${sources.length} orders.`, { title: "Merged" });
        requestFocus({ target: "entryStart" });
        return true;
      } catch (error) {
        setHint(purchaseRefusalText(error));
        toast.apiError(error, { title: "Not merged" });
        return false;
      } finally {
        setBusy(null);
      }
    },
    [commit, mergeMutation, requestFocus, setHint, show],
  );

  /** Qt `approveOrder`: OVERRIDE on menu 23; Not approve needs the reason (asked by the view). */
  const approveOrder = useCallback(
    async (approve: boolean, reason = ""): Promise<boolean> => {
      const current = draftRef.current;
      if (current.status !== "POSTED" || current.approvalStatus !== "AWAITING") {
        toast.warn(`${current.refno} is not waiting for approval.`, { title: "Nothing to approve" });
        return false;
      }
      setBusy("approving");
      try {
        const payload = await approveMutation({
          poId: current.poId,
          accYear: current.accYear,
          approve,
          ...(reason.trim() ? { reason: reason.trim() } : {}),
        }).unwrap();
        const next = show(payload, "browse");
        toast.success(
          approve ? `${next.refno} approved — it is open for GRNs and bills.` : `${next.refno} not approved.`,
          { title: approve ? "Approved" : "Not approved" },
        );
        return true;
      } catch (error) {
        setHint(purchaseRefusalText(error));
        toast.apiError(error, { title: approve ? "Not approved" : "Not refused" });
        return false;
      } finally {
        setBusy(null);
      }
    },
    [approveMutation, setHint, show],
  );

  /** Qt `showRevisions`: every saved version, newest first. */
  const fetchRevisions = useCallback(async (): Promise<PurchaseOrderRevision[] | null> => {
    const current = draftRef.current;
    if (!current.poId) {
      return null;
    }
    try {
      return await revisionsMutation({ poId: current.poId, accYear: current.accYear }).unwrap();
    } catch (error) {
      toast.apiError(error);
      return null;
    }
  }, [revisionsMutation]);

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
    setAgent,
    addCharge,
    editCharge,
    removeCharge,
    fetchSuggestions,
    addReorderRows,
    editLine,
    removeLine,
    pickItem,
    resolveBarcode,
    load,
    newDocument,
    beginEdit,
    beginAmend,
    stopAmend,
    stepDocument,
    save,
    cancelOrder,
    shortClose,
    cloneOrder,
    mergeOrders,
    approveOrder,
    fetchRevisions,
    fetchSupplierPending,
    finishResume,
    forgetRemembered,
  };
}

export type PurchaseOrderDraftApi = ReturnType<typeof usePurchaseOrderDraft>;
