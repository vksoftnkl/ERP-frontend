"use client";

/**
 * Purchase Return — the screen's network and its one funnel for change. Every
 * rule is in `return.state.ts`; this hook runs the requests and commits what
 * the reducer makes of their answers. Screen memory is written in the funnel,
 * so an answer that lands after the screen is gone still reaches it.
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useGetTxnAdjacentMutation } from "@/components/txn/txn-adjacent";
import { todayIso } from "@/features/sales/quotation/quotation.utils";
import { toast } from "@/lib/notify";
import { RESTORED_MESSAGE_OPTIONS, restoredMessage, screenMemory, type ScreenScope } from "@/lib/screen-memory";
import { useForgetIfWritingOnUnmount, useRecalledOnce, type ScreenMemoryOption } from "@/lib/use-screen-memory";
import { useGetPurchaseSettingsQuery } from "../shared/purchase.api";
import { purchaseRefusalText } from "../shared/purchase.format";
import type { ReturnAgainstBillHandoff } from "../shared/purchase-handoff";
import type { PurchaseDocKey } from "../shared/purchase.types";
import { usePurchaseScope } from "../shared/use-purchase-scope";
import {
  usePurchaseReturnCancelMutation,
  usePurchaseReturnGetMutation,
  usePurchaseReturnGodownNameMutation,
  usePurchaseReturnPostMutation,
  usePurchaseReturnReasonsMutation,
  usePurchaseReturnSaveMutation,
  usePurchaseReturnSourceLinesMutation,
  usePurchaseReturnSourcesMutation,
  usePurchaseReturnValidateMutation,
} from "./return.api";
import { ADJACENT_DOC_TYPE, RECALC_DELAY_MS, type ReturnKind, type ReturnSettlement } from "./return.constants";
import {
  billedOf,
  buildPrimeBody,
  buildSaveBody,
  buildValidateBody,
  createDraft,
  issuesOfError,
  returnReasonsOf,
  isFresh,
  isWorthRemembering,
  purchaseReturnReducer,
  saveRefusal,
  settlementDefaultOf,
  stepEndNotice,
  withRecalledDefaults,
  type Refusal,
  type ReturnAction,
} from "./return.state";
import type { DraftScope, ReasonOption, ReturnDraft, ReturnPayload } from "./return.types";

export type Busy = "loading" | "saving" | "posting" | "cancelling" | null;

export type FocusTarget = "supplier" | "source" | "grid" | "claimParty" | "date";
export type FocusRequest = { target: FocusTarget; seq: number };

function memoryScopeOf(draft: ReturnDraft): ScreenScope {
  return { companyId: draft.companyId, branchId: draft.branchId, accYear: draft.accYear };
}

export function usePurchaseReturn({ memory }: { memory?: ScreenMemoryOption }) {
  const purchaseScope = usePurchaseScope();
  const scope: DraftScope = purchaseScope;
  const scopeRef = useRef(scope);
  useLayoutEffect(() => {
    scopeRef.current = scope;
  });
  const memoryScope = useMemo(
    () => ({ companyId: scope.companyId, branchId: scope.branchId, accYear: scope.accYear }),
    [scope.accYear, scope.branchId, scope.companyId],
  );

  const recalled = useRecalledOnce<ReturnDraft>(memory, memoryScope);
  const resumed = recalled !== null;
  // purchase.return_settlement_default (Qt 6e025ef): what a NEW return is settled as.
  // The route needs View on Purchase Entry; refused or not yet here, ADJUST (the server's default).
  const { data: purchaseSettings } = useGetPurchaseSettingsQuery(
    { companyId: scope.companyId, branchId: scope.branchId },
    { skip: !scope.companyId || !scope.branchId },
  );
  const settlementDefault: ReturnSettlement = settlementDefaultOf(purchaseSettings?.returnSettlementDefault);
  const settlementDefaultRef = useRef(settlementDefault);
  useLayoutEffect(() => {
    settlementDefaultRef.current = settlementDefault;
  });
  const [draft, setDraft] = useState<ReturnDraft>(() =>
    recalled ? withRecalledDefaults(recalled) : createDraft(scope, todayIso(), settlementDefault),
  );
  const draftRef = useRef(draft);
  const [busy, setBusy] = useState<Busy>(null);
  const busyRef = useRef<Busy>(null);
  useLayoutEffect(() => {
    busyRef.current = busy;
  });
  const [focusRequest, setFocusRequest] = useState<FocusRequest | null>(null);
  const focusSeq = useRef(0);

  const [saveMutation] = usePurchaseReturnSaveMutation();
  const [getMutation] = usePurchaseReturnGetMutation();
  const [postMutation] = usePurchaseReturnPostMutation();
  const [cancelMutation] = usePurchaseReturnCancelMutation();
  const [sourcesMutation] = usePurchaseReturnSourcesMutation();
  const [sourceLinesMutation] = usePurchaseReturnSourceLinesMutation();
  const [adjacentMutation] = useGetTxnAdjacentMutation();
  const [validateMutation] = usePurchaseReturnValidateMutation();
  const [reasonsMutation] = usePurchaseReturnReasonsMutation();
  const [godownNameMutation] = usePurchaseReturnGodownNameMutation();
  /** The PURCHASE_RETURN reasons (Stock Reasons, menu 293); null = not read yet. */
  const [reasons, setReasons] = useState<ReasonOption[] | null>(null);

  // -------------------------------------------------------------- commit
  const memoryKey = memory?.key ?? "";
  const discarded = useRef(false);
  const commit = useCallback(
    (next: ReturnDraft) => {
      draftRef.current = next;
      setDraft(next);
      if (memoryKey && !discarded.current) {
        if (isWorthRemembering(next)) {
          screenMemory.remember(memoryKey, memoryScopeOf(next), next);
        } else {
          screenMemory.forget(memoryKey, memoryScopeOf(next));
        }
      }
    },
    [memoryKey],
  );
  const act = useCallback((action: ReturnAction) => commit(purchaseReturnReducer(draftRef.current, action)), [commit]);
  useForgetIfWritingOnUnmount(
    memory,
    () => ["saving", "posting", "cancelling"].includes(busyRef.current ?? ""),
    () => memoryScopeOf(draftRef.current),
  );

  const requestFocus = useCallback((target: FocusTarget) => {
    focusSeq.current += 1;
    setFocusRequest({ target, seq: focusSeq.current });
  }, []);

  const runBusy = useCallback(async <T,>(kind: Exclude<Busy, null>, work: () => Promise<T>): Promise<T> => {
    busyRef.current = kind;
    setBusy(kind);
    try {
      return await work();
    } finally {
      busyRef.current = null;
      setBusy(null);
    }
  }, []);

  // A new, untouched return follows the session's tenant (the business context can land after the mount).
  useEffect(() => {
    const current = draftRef.current;
    if (current.prId || current.dirty) {
      return;
    }
    if (current.companyId !== scope.companyId || current.branchId !== scope.branchId || current.accYear !== scope.accYear || current.deviceId !== scope.deviceId) {
      commit(createDraft(scope, current.docDate || todayIso(), settlementDefaultRef.current));
    }
  }, [commit, scope]);

  // The branch's settlement default can land after the mount: a new return the operator has not set follows it.
  useEffect(() => {
    act({ type: "settlementDefault", settlement: settlementDefault });
  }, [act, settlementDefault]);

  // ---------------------------------------------------------- the reads
  /** The supplier's posted bills (or GRNs) → the "Bill / GRN" choices. */
  const loadSources = useCallback(
    async (supplierId: string, kind: ReturnKind) => {
      const current = draftRef.current;
      if (!supplierId || !current.companyId) {
        return;
      }
      try {
        const rows = await sourcesMutation({
          companyId: current.companyId,
          branchId: current.branchId,
          supplierId,
          kind,
        }).unwrap();
        act({ type: "sourcesLoaded", supplierId, kind, rows });
      } catch (error) {
        act({ type: "setHint", hint: purchaseRefusalText(error) });
      }
    },
    [act, sourcesMutation],
  );

  /**
   * Billed per line is the server's (billedQty): one quiet /validate with a
   * token qty per line before anything is typed (Qt `primeBilled`). A failure
   * leaves Billed blank; the next /validate fills the typed rows.
   */
  const primeBilled = useCallback(async () => {
    const current = draftRef.current;
    const body = buildPrimeBody(current, todayIso());
    if (!body) {
      return;
    }
    try {
      const answer = await validateMutation(body).unwrap();
      act({ type: "billedPrimed", srcDocId: current.srcDocId, billed: billedOf(answer) });
    } catch {
      // Billed stays blank
    }
  }, [act, validateMutation]);

  /** The bill's / GRN's lines; a saved draft passes itself so its own rows do not count as returned. */
  const loadSourceLines = useCallback(
    async (srcDocId: string, srcAccYear: string): Promise<boolean> => {
      const current = draftRef.current;
      if (current.status !== "DRAFT" || !srcDocId) {
        return false;
      }
      try {
        const view = await sourceLinesMutation({
          kind: current.kind,
          srcDocId,
          srcAccYear,
          ...(current.prId ? { exceptPrId: current.prId } : {}),
        }).unwrap();
        const source = view?.source;
        act({
          type: "sourceLinesLoaded",
          srcDocId,
          srcAccYear,
          lines: view?.lines ?? [],
          label: [source?.refno, source?.supplierInvNo].filter(Boolean).join(" · "),
          posStcd: source?.posStcd ?? "",
        });
        void primeBilled();
        return true;
      } catch (error) {
        const text = purchaseRefusalText(error);
        act({ type: "setHint", hint: text });
        toast.apiError(error);
        return false;
      }
    },
    [act, primeBilled, sourceLinesMutation],
  );

  // /returns/validate, debounced (Qt `scheduleRecalc` → `recalcNow`): each row's money,
  // Credit to / Writes, the six totals, the strip. An answer to an older body is dropped.
  useEffect(() => {
    const seq = draft.calcSeq;
    const timer = window.setTimeout(() => {
      const current = draftRef.current;
      if (current.calcSeq !== seq || current.status !== "DRAFT" || current.viewMode !== "entry") {
        return;
      }
      const ask = buildValidateBody(current, todayIso());
      if (!ask) {
        if (current.totals || current.warnings.length || current.refusals.length) {
          act({ type: "calcCleared" });
        }
        return;
      }
      validateMutation(ask.body)
        .unwrap()
        .then((answer) => act({ type: "validated", seq, sentKeys: ask.keys, answer }))
        .catch((error: unknown) => act({ type: "validateRefused", seq, errors: issuesOfError(error), hint: purchaseRefusalText(error) }));
    }, RECALC_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [act, draft.calcSeq, validateMutation]);

  // The reasons, once per company (no list: the pick-list says so).
  useEffect(() => {
    if (!scope.companyId) {
      return;
    }
    let active = true;
    reasonsMutation({ companyId: scope.companyId })
      .unwrap()
      .then((rows) => {
        if (active) {
          setReasons(returnReasonsOf(rows));
        }
      })
      .catch(() => {
        if (active) {
          setReasons([]);
        }
      });
    return () => {
      active = false;
    };
  }, [reasonsMutation, scope.companyId]);

  // The name of a godown the server (or the bill's lots) named — GET /godowns/get (Qt `fetchGodownName`).
  useEffect(() => {
    const id = draft.godownId;
    if (!id || draft.godownName) {
      return;
    }
    let active = true;
    godownNameMutation({ gdl_id: id })
      .unwrap()
      .then((name) => {
        if (active && name) {
          act({ type: "godownNamed", id, name });
        }
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [act, draft.godownId, draft.godownName, godownNameMutation]);

  // ---------------------------------------------------------- the header
  const setSupplier = useCallback(
    (id: string, name: string) => {
      const before = draftRef.current;
      act({ type: "setSupplier", id, name });
      if (draftRef.current !== before && id) {
        void loadSources(id, draftRef.current.kind);
      }
    },
    [act, loadSources],
  );

  const setKind = useCallback(
    (kind: ReturnKind) => {
      const before = draftRef.current;
      act({ type: "setKind", kind });
      const current = draftRef.current;
      if (current !== before && current.supplierId) {
        void loadSources(current.supplierId, kind);
      }
    },
    [act, loadSources],
  );

  const pickSource = useCallback(
    (srcDocId: string, srcAccYear: string) => {
      if (!isFresh(draftRef.current)) {
        return;
      }
      void loadSourceLines(srcDocId, srcAccYear);
    },
    [loadSourceLines],
  );

  // ---------------------------------------------------------- documents
  const applyLoaded = useCallback(
    (payload: ReturnPayload, viewMode: "browse" | "entry") => {
      act({ type: "loaded", scope: scopeRef.current, payload, viewMode });
      const current = draftRef.current;
      // The Can Return column, net of this draft (Qt `applyLoaded` → `loadSource`).
      if (current.status === "DRAFT" && current.srcDocId) {
        void loadSourceLines(current.srcDocId, current.srcAccYear);
      }
    },
    [act, loadSourceLines],
  );

  const load = useCallback(
    async (key: PurchaseDocKey, forEdit: boolean): Promise<boolean> => {
      try {
        const payload = await runBusy("loading", () =>
          getMutation({ prId: key.id, accYear: key.accYear || scopeRef.current.accYear }).unwrap(),
        );
        applyLoaded(payload, forEdit ? "entry" : "browse");
        return true;
      } catch (error) {
        toast.apiError(error);
        return false;
      }
    },
    [applyLoaded, getMutation, runBusy],
  );

  const refuse = useCallback(
    (refusal: Refusal) => {
      toast.warn(refusal.message, { title: refusal.title });
      if (refusal.focus) {
        requestFocus(refusal.focus);
      }
    },
    [requestFocus],
  );

  const save = useCallback(
    async (post: boolean): Promise<boolean> => {
      if (busyRef.current) {
        return false;
      }
      const current = draftRef.current;
      // A saved draft opened read-only (Post right, no Edit) is posted as it stands.
      const asItStands = post && current.viewMode === "browse" && Boolean(current.prId) && current.status === "DRAFT";
      const refusal = asItStands ? null : saveRefusal(current);
      if (refusal) {
        refuse(refusal);
        return false;
      }
      try {
        const payload = await runBusy(post ? "posting" : "saving", () =>
          asItStands
            ? postMutation({ prId: current.prId, accYear: current.accYear }).unwrap()
            : saveMutation(buildSaveBody(current, post, todayIso())).unwrap(),
        );
        applyLoaded(payload, current.viewMode);
        const refno = draftRef.current.refno;
        if (post) {
          toast.success(`${refno} posted — the goods are out of stock and the supplier is debited.`, { title: "Posted" });
        } else {
          toast.success(`${refno} saved as a draft. Nothing has moved yet.`, { title: "Saved" });
        }
        return true;
      } catch (error) {
        act({ type: "refused", errors: issuesOfError(error), hint: purchaseRefusalText(error) });
        toast.apiError(error, { title: "Not saved" });
        return false;
      }
    },
    [act, applyLoaded, postMutation, refuse, runBusy, saveMutation],
  );

  const cancelDocument = useCallback(
    async (reason: string): Promise<boolean> => {
      const current = draftRef.current;
      if (!current.prId || current.status === "CANCELLED" || busyRef.current) {
        return false;
      }
      try {
        const payload = await runBusy("cancelling", () =>
          cancelMutation({ prId: current.prId, accYear: current.accYear, reason }).unwrap(),
        );
        applyLoaded(payload, "browse");
        toast.success(`${current.refno} cancelled.`, { title: "Cancelled" });
        return true;
      } catch (error) {
        act({ type: "setHint", hint: purchaseRefusalText(error) });
        toast.apiError(error, { title: "Not cancelled" });
        return false;
      }
    },
    [act, applyLoaded, cancelMutation, runBusy],
  );

  const newDocument = useCallback(() => {
    act({ type: "reset", scope: scopeRef.current, docDate: todayIso(), settlement: settlementDefaultRef.current });
    requestFocus("supplier");
  }, [act, requestFocus]);

  /**
   * Purchase Entry's Ctrl+F11 (Qt `returnFromBill`): a NEW return against that
   * posted bill — kind Bill, the supplier and the bill picked, its lines in.
   * GRN's Reject passes `kind: "AGAINST_GRN"` and the GRN's id in `piId`.
   */
  const startAgainstBill = useCallback(
    async (handoff: ReturnAgainstBillHandoff & { kind?: ReturnKind }) => {
      act({ type: "reset", scope: scopeRef.current, docDate: todayIso(), settlement: settlementDefaultRef.current });
      // GRN's Reject (Qt GrnEntry::rejectToSupplier): setKind(GRN) → setSupplier → loadSource.
      if (handoff.kind && handoff.kind !== draftRef.current.kind) {
        act({ type: "setKind", kind: handoff.kind });
      }
      setSupplier(handoff.supplierId, handoff.supplierName);
      const loaded = await loadSourceLines(handoff.piId, handoff.accYear);
      if (loaded) {
        requestFocus(draftRef.current.rows.length > 0 ? "grid" : "source");
      } else {
        requestFocus("source");
      }
    },
    [act, loadSourceLines, requestFocus, setSupplier],
  );

  /**
   * Previous / Next (Alt+PgUp / Alt+PgDn; Qt Ctrl+PgUp / Ctrl+PgDn) — `GET
   * /txn/adjacent`, docType PURCHASE_RETURN, in the list's order. The answer is
   * a key; the return opens read only (F2 opens a draft for keying). The view
   * asks before an unsaved return is left.
   */
  const stepDocument = useCallback(
    async (previous: boolean): Promise<boolean> => {
      if (busyRef.current) {
        return false;
      }
      const current = draftRef.current;
      if (!current.prId && !previous) {
        act({ type: "setHint", hint: stepEndNotice(true, false) });
        return false;
      }
      try {
        const answer = await runBusy("loading", () =>
          adjacentMutation({
            docType: ADJACENT_DOC_TYPE,
            companyId: current.companyId,
            branchId: current.branchId,
            accYear: current.accYear,
            ...(current.prId ? { docId: current.prId } : {}),
            direction: previous ? "prev" : "next",
          }).unwrap(),
        );
        const doc = answer.doc;
        if (!doc) {
          act({ type: "setHint", hint: stepEndNotice(!current.prId, previous) });
          return false;
        }
        const opened = await load(
          {
            id: doc.docId,
            companyId: doc.companyId,
            branchId: doc.branchId,
            accYear: doc.accYear,
            refno: doc.refno ?? "",
            status: doc.status,
          },
          false,
        );
        if (opened) {
          requestFocus(draftRef.current.rows.length > 0 ? "grid" : "date");
        }
        return opened;
      } catch (error) {
        act({ type: "setHint", hint: purchaseRefusalText(error) });
        toast.apiError(error);
        return false;
      }
    },
    [act, adjacentMutation, load, requestFocus, runBusy],
  );

  const forgetRemembered = useCallback(() => {
    discarded.current = true;
    if (memoryKey) {
      screenMemory.forget(memoryKey, memoryScopeOf(draftRef.current));
    }
  }, [memoryKey]);

  const finishResume = useCallback(async () => {
    // One tick first: this runs from the mount effect.
    await new Promise((resolve) => window.setTimeout(resolve, 0));
    toast.info(restoredMessage("purchase return"), RESTORED_MESSAGE_OPTIONS);
    const current = draftRef.current;
    if (isFresh(current) && current.supplierId && current.sources.length === 0) {
      void loadSources(current.supplierId, current.kind);
    }
    requestFocus(current.rows.length > 0 ? "grid" : "supplier");
  }, [loadSources, requestFocus]);

  return {
    draft,
    draftRef,
    busy,
    reasons,
    resumed,
    focusRequest,
    requestFocus,
    act,
    setSupplier,
    setKind,
    pickSource,
    load,
    save,
    cancelDocument,
    newDocument,
    startAgainstBill,
    stepDocument,
    forgetRemembered,
    finishResume,
  };
}
