"use client";

/**
 * Purchase Entry (menu 24) — the draft and every action that needs the network
 * (the Qt `PurchaseInvoiceEntry`'s slots).
 *
 * The draft is local to the screen: state mirrored in a ref, so an answer that
 * lands late reads the draft as it is NOW. Every change goes through `run`
 * (the pure `invoiceReducer`), which is also where screen memory is written and
 * where a change to the figures schedules the server's calculation.
 *
 * The calculation is Qt's: 350 ms after the last change, `POST
 * /purchase/invoices/validate` with the whole bill; an answer that is not the
 * newest request's is dropped (`m_calcSeq`).
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { todayIso } from "@/features/sales/quotation/quotation.utils";
import { toast } from "@/lib/notify";
import { RESTORED_MESSAGE_OPTIONS, restoredMessage, screenMemory, type ScreenScope } from "@/lib/screen-memory";
import { useForgetIfWritingOnUnmount, useRecalledOnce, type ScreenMemoryOption } from "@/lib/use-screen-memory";
import { PURCHASE_DOC_TYPES } from "../shared/purchase.doc-types";
import { purchaseRefusalText } from "../shared/purchase.format";
import type { PurchaseDocKey } from "../shared/purchase.types";
import { usePurchaseMemoryScope, usePurchaseScope } from "../shared/use-purchase-scope";
import {
  usePurchaseInvoiceCancelMutation,
  usePurchaseInvoiceGetMutation,
  usePurchaseInvoiceItemByBarcodeMutation,
  usePurchaseInvoiceItemLookupMutation,
  usePurchaseInvoiceSaveMutation,
  usePurchaseInvoiceValidateMutation,
} from "./invoice.api";
import { COL, RECALC_DELAY_MS, STATUS } from "./invoice.constants";
import {
  buildPayload,
  canRecalc,
  changesFigures,
  checkBeforeSave,
  createDraft,
  invoiceReducer,
  isEditable,
  isWorthRemembering,
  rowHasItem,
  type InvoiceAction,
} from "./invoice.state";
import type { InvoiceDraft, PurchaseInvoicePayload } from "./invoice.types";

export type Busy = "loading" | "saving" | "posting" | "cancelling" | null;

/** Where the view should put the cursor next. */
export type FocusTarget =
  | { target: "cell"; key: string; column: number }
  | { target: "supplier" | "entryStart" };
export type FocusRequest = FocusTarget & { seq: number };

const MEMORY_KEY = PURCHASE_DOC_TYPES.invoice.memoryKey;

function memoryScopeOf(draft: InvoiceDraft): ScreenScope {
  return { companyId: draft.companyId, branchId: draft.branchId, accYear: draft.accYear };
}

export function usePurchaseInvoiceDraft(memory: ScreenMemoryOption | undefined) {
  const scope = usePurchaseScope();
  const memoryScope = usePurchaseMemoryScope();
  const recalled = useRecalledOnce<InvoiceDraft>(memory, memoryScope);
  const resumed = recalled !== null;
  const [draft, setDraft] = useState<InvoiceDraft>(() => recalled ?? createDraft(scope, todayIso()));
  const draftRef = useRef(draft);
  const [busy, setBusy] = useState<Busy>(null);
  const busyRef = useRef<Busy>(null);
  useLayoutEffect(() => {
    busyRef.current = busy;
  });
  const [focusRequest, setFocusRequest] = useState<FocusRequest | null>(null);
  const focusSeq = useRef(0);

  const [saveMutation] = usePurchaseInvoiceSaveMutation();
  const [validateMutation] = usePurchaseInvoiceValidateMutation();
  const [getMutation] = usePurchaseInvoiceGetMutation();
  const [cancelMutation] = usePurchaseInvoiceCancelMutation();
  const [lookupMutation] = usePurchaseInvoiceItemLookupMutation();
  const [barcodeMutation] = usePurchaseInvoiceItemByBarcodeMutation();

  const requestFocus = useCallback((request: FocusTarget) => {
    focusSeq.current += 1;
    setFocusRequest({ ...request, seq: focusSeq.current });
  }, []);

  // ------------------------------------------------------------ the funnel
  const rememberOn = Boolean(memory);
  const discarded = useRef(false);
  const commit = useCallback(
    (next: InvoiceDraft) => {
      draftRef.current = next;
      setDraft(next);
      if (rememberOn && !discarded.current) {
        if (isWorthRemembering(next)) {
          screenMemory.remember(MEMORY_KEY, memoryScopeOf(next), next);
        } else {
          screenMemory.forget(MEMORY_KEY, memoryScopeOf(next));
        }
      }
    },
    [rememberOn],
  );
  useForgetIfWritingOnUnmount(
    memory,
    () => busyRef.current === "saving" || busyRef.current === "posting" || busyRef.current === "cancelling",
    () => memoryScopeOf(draftRef.current),
  );

  // -------------------------------------------------- the calculation (Qt recalcNow)
  const calcSeq = useRef(0);
  const recalcTimer = useRef<number | null>(null);
  const recalcNow = useCallback(async () => {
    if (recalcTimer.current !== null) {
      window.clearTimeout(recalcTimer.current);
      recalcTimer.current = null;
    }
    const current = draftRef.current;
    if (!isEditable(current) || !canRecalc(current)) {
      return;
    }
    const { body, sentKeys } = buildPayload(current, false, todayIso(), true);
    calcSeq.current += 1;
    const seq = calcSeq.current;
    try {
      const answer = await validateMutation(body).unwrap();
      if (seq !== calcSeq.current) {
        return; // a newer edit is on its way
      }
      commit(invoiceReducer(draftRef.current, { type: "calc", sentKeys, answer }));
    } catch (error) {
      if (seq !== calcSeq.current) {
        return;
      }
      commit(invoiceReducer(draftRef.current, { type: "hint", hint: purchaseRefusalText(error).split("\n")[0] }));
    }
  }, [commit, validateMutation]);

  const scheduleRecalc = useCallback(() => {
    if (recalcTimer.current !== null) {
      window.clearTimeout(recalcTimer.current);
    }
    recalcTimer.current = window.setTimeout(() => {
      recalcTimer.current = null;
      void recalcNow();
    }, RECALC_DELAY_MS);
  }, [recalcNow]);

  /** Drop any calculation in flight or waiting: the bill on screen is another one now. */
  const dropCalc = useCallback(() => {
    calcSeq.current += 1;
    if (recalcTimer.current !== null) {
      window.clearTimeout(recalcTimer.current);
      recalcTimer.current = null;
    }
  }, []);
  useEffect(() => dropCalc, [dropCalc]);

  const run = useCallback(
    (action: InvoiceAction) => {
      const before = draftRef.current;
      const next = invoiceReducer(before, action);
      if (next === before) {
        return;
      }
      commit(next);
      if (changesFigures(action)) {
        scheduleRecalc();
      }
    },
    [commit, scheduleRecalc],
  );

  // ------------------------------------------------------------ the header
  const setHeader = useCallback(
    (patch: Extract<InvoiceAction, { type: "header" }>["patch"]) => run({ type: "header", patch }),
    [run],
  );
  const setSupplier = useCallback((id: string, name: string) => run({ type: "supplier", id, name }), [run]);
  const setGodown = useCallback((id: string, name: string) => run({ type: "godown", id, name }), [run]);
  const setHint = useCallback((hint: string) => run({ type: "hint", hint }), [run]);

  // ------------------------------------------------------------- the lines
  const editCell = useCallback(
    (key: string, column: number, raw: string) => run({ type: "editCell", key, column, raw }),
    [run],
  );
  const removeLine = useCallback((key: string) => run({ type: "removeLine", key }), [run]);
  const addLine = useCallback(() => run({ type: "addLine" }), [run]);

  /** The generation of the document on screen; a lookup for an older one is dropped. */
  const generation = useRef(0);

  /** Qt `fetchItem`: the item's unit, factor, signature and GST %, then the cursor to Billed. */
  const pickItem = useCallback(
    async (key: string, itemId: string, itemName: string, uomId?: string): Promise<boolean> => {
      const current = draftRef.current;
      if (!itemId || !isEditable(current) || !current.lines.some((line) => line.key === key)) {
        return false;
      }
      const gen = generation.current;
      try {
        const item = await lookupMutation({
          companyId: current.companyId,
          branchId: current.branchId,
          itemId,
          ...(uomId ? { uomId } : {}),
          onDate: current.docDate || todayIso(),
        }).unwrap();
        if (gen !== generation.current || !item?.itemId) {
          return false;
        }
        run({ type: "applyItem", key, item, name: itemName });
        requestFocus({ target: "cell", key, column: COL.Billed });
        return true;
      } catch (error) {
        if (gen === generation.current) {
          toast.apiError(error);
        }
        return false;
      }
    },
    [lookupMutation, requestFocus, run],
  );

  /** Qt `resolveBarcode`: a scan → its item (and the unit the code belongs to). */
  const resolveBarcode = useCallback(
    async (key: string, code: string): Promise<boolean> => {
      const barcode = code.trim();
      const current = draftRef.current;
      const line = current.lines.find((candidate) => candidate.key === key);
      if (!barcode || !line || rowHasItem(line) || !isEditable(current)) {
        return false;
      }
      const gen = generation.current;
      try {
        const found = await barcodeMutation({ barcode, companyId: current.companyId }).unwrap();
        if (gen !== generation.current) {
          return false;
        }
        if (!found?.itemId) {
          setHint(`Barcode ${barcode} not found.`);
          return false;
        }
        return await pickItem(key, found.itemId, found.itemName ?? "", found.unitId ?? undefined);
      } catch {
        if (gen === generation.current) {
          setHint(`Barcode ${barcode} not found.`);
          requestFocus({ target: "cell", key, column: COL.Barcode });
        }
        return false;
      }
    },
    [barcodeMutation, pickItem, requestFocus, setHint],
  );

  /** A loaded bill names no items: each line's names come from the lookup it was keyed with. */
  const fillNames = useCallback(
    (loaded: InvoiceDraft) => {
      const gen = generation.current;
      for (const line of loaded.lines.filter(rowHasItem)) {
        void lookupMutation({
          companyId: loaded.companyId,
          branchId: loaded.branchId,
          itemId: line.itemId,
          uomId: line.uomId,
          onDate: loaded.docDate || todayIso(),
        })
          .unwrap()
          .then((item) => {
            if (gen === generation.current && item?.itemId) {
              run({ type: "applyItem", key: line.key, item, quiet: true });
            }
          })
          .catch(() => {
            /* the line keeps its ids; the save does not need the names */
          });
      }
    },
    [lookupMutation, run],
  );

  const applyPayload = useCallback(
    (payload: PurchaseInvoicePayload, viewMode: "browse" | "entry") => {
      dropCalc();
      generation.current += 1;
      const next = invoiceReducer(draftRef.current, { type: "loaded", payload, viewMode });
      commit(next);
      fillNames(next);
      return next;
    },
    [commit, dropCalc, fillNames],
  );

  // ------------------------------------------------------------ documents
  const load = useCallback(
    async (key: PurchaseDocKey, openForEdit: boolean): Promise<boolean> => {
      setBusy("loading");
      try {
        const payload = await getMutation({ piId: key.id, accYear: key.accYear || scope.accYear }).unwrap();
        if (!payload?.header?.piId) {
          toast.warn("That purchase invoice no longer exists.", { title: "Not found" });
          return false;
        }
        applyPayload(payload, openForEdit ? "entry" : "browse");
        return true;
      } catch (error) {
        toast.apiError(error);
        return false;
      } finally {
        setBusy(null);
      }
    },
    [applyPayload, getMutation, scope.accYear],
  );

  /** Qt `saveDocument`: Save Draft, or Save & Post in one transaction. */
  const save = useCallback(
    async (post: boolean): Promise<boolean> => {
      if (busyRef.current !== null) {
        return false;
      }
      const current = draftRef.current;
      const refusal = checkBeforeSave(current);
      if (refusal) {
        toast.warn(refusal.message, { title: refusal.title });
        if (refusal.title === "Header incomplete") {
          requestFocus({ target: "supplier" });
        }
        return false;
      }
      dropCalc();
      const { body } = buildPayload(current, post, todayIso());
      setBusy(post ? "posting" : "saving");
      try {
        const result = await saveMutation(body).unwrap();
        const next = applyPayload(result.data, "entry");
        const refno = next.refno;
        const warnings = (result.data.warnings ?? []).map((warning) => warning.message).filter(Boolean);
        const said = post
          ? `${refno} posted — the stock is in and the supplier is credited.`
          : `${refno} saved as a draft. Nothing has moved yet.`;
        if (warnings.length > 0) {
          toast.warn([said, ...warnings].join("\n"), { title: post ? "Posted" : "Saved" });
        } else {
          toast.success(said, { title: post ? "Posted" : "Saved" });
        }
        return true;
      } catch (error) {
        commit(invoiceReducer(draftRef.current, { type: "hint", hint: purchaseRefusalText(error) }));
        toast.apiError(error, { title: "Not saved" });
        return false;
      } finally {
        setBusy(null);
      }
    },
    [applyPayload, commit, dropCalc, requestFocus, saveMutation],
  );

  /** Qt `cancelVoucher`: a posted bill nothing has paid — stock out, books reversed. */
  const cancelDocument = useCallback(
    async (reason: string): Promise<boolean> => {
      const current = draftRef.current;
      if (current.status !== STATUS.posted || !current.piId) {
        toast.warn("Only a posted bill can be cancelled.", { title: "Not posted" });
        return false;
      }
      setBusy("cancelling");
      try {
        const result = await cancelMutation({ piId: current.piId, accYear: current.accYear, reason }).unwrap();
        applyPayload(result.data, "browse");
        toast.success(`${current.refno} cancelled.`, { title: "Cancelled" });
        return true;
      } catch (error) {
        commit(invoiceReducer(draftRef.current, { type: "hint", hint: purchaseRefusalText(error) }));
        toast.apiError(error, { title: "Not cancelled" });
        return false;
      } finally {
        setBusy(null);
      }
    },
    [applyPayload, cancelMutation, commit],
  );

  /** Qt `resetScreen` (New). */
  const newDocument = useCallback(() => {
    dropCalc();
    generation.current += 1;
    discarded.current = false;
    commit(createDraft(scope, todayIso()));
    requestFocus({ target: "entryStart" });
  }, [commit, dropCalc, requestFocus, scope]);

  /** F2 on a draft opened read-only. */
  const beginEdit = useCallback(() => {
    const before = draftRef.current;
    run({ type: "beginEdit" });
    return draftRef.current !== before;
  }, [run]);

  /** The operator discarded the document: it must not come back. */
  const forgetRemembered = useCallback(() => {
    if (rememberOn) {
      discarded.current = true;
      screenMemory.forget(MEMORY_KEY, memoryScopeOf(draftRef.current));
    }
  }, [rememberOn]);

  /** Reopened on a remembered bill: say so, and recalculate what it showed. */
  const finishResume = useCallback(async () => {
    // One tick first: this runs from the mount effect.
    await new Promise((resolve) => window.setTimeout(resolve, 0));
    toast.info(restoredMessage(PURCHASE_DOC_TYPES.invoice.noun), RESTORED_MESSAGE_OPTIONS);
    if (isEditable(draftRef.current)) {
      scheduleRecalc();
    }
    requestFocus({ target: "entryStart" });
  }, [requestFocus, scheduleRecalc]);

  // The session moved (another branch or year): a bill nobody started follows it.
  useEffect(() => {
    const current = draftRef.current;
    if (current.piId || current.dirty || !scope.companyId) {
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
    commit(createDraft(scope, current.docDate || todayIso()));
  }, [commit, scope]);

  return {
    draft,
    draftRef,
    busy,
    focusRequest,
    requestFocus,
    resumed,
    setHeader,
    setSupplier,
    setGodown,
    setHint,
    editCell,
    removeLine,
    addLine,
    pickItem,
    resolveBarcode,
    recalcNow,
    load,
    save,
    cancelDocument,
    newDocument,
    beginEdit,
    forgetRemembered,
    finishResume,
  };
}

export type PurchaseInvoiceDraftApi = ReturnType<typeof usePurchaseInvoiceDraft>;
