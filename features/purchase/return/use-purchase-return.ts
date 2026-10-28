"use client";

/**
 * Purchase Return — the screen's network and its one funnel for change. Every
 * rule is in `return.state.ts`; this hook runs the requests and commits what
 * the reducer makes of their answers. Screen memory is written in the funnel,
 * so an answer that lands after the screen is gone still reaches it.
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { todayIso } from "@/features/sales/quotation/quotation.utils";
import { toast } from "@/lib/notify";
import { RESTORED_MESSAGE_OPTIONS, restoredMessage, screenMemory, type ScreenScope } from "@/lib/screen-memory";
import { useForgetIfWritingOnUnmount, useRecalledOnce, type ScreenMemoryOption } from "@/lib/use-screen-memory";
import { purchaseRefusalText } from "../shared/purchase.format";
import type { PurchaseDocKey } from "../shared/purchase.types";
import { usePurchaseScope } from "../shared/use-purchase-scope";
import {
  usePurchaseReturnCancelMutation,
  usePurchaseReturnGetMutation,
  usePurchaseReturnPostMutation,
  usePurchaseReturnSaveMutation,
  usePurchaseReturnSourceLinesMutation,
  usePurchaseReturnSourcesMutation,
} from "./return.api";
import type { ReturnKind } from "./return.constants";
import {
  buildSaveBody,
  createDraft,
  isFresh,
  isWorthRemembering,
  purchaseReturnReducer,
  saveRefusal,
  type Refusal,
  type ReturnAction,
} from "./return.state";
import type { DraftScope, ReturnDraft, ReturnPayload } from "./return.types";

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
  const [draft, setDraft] = useState<ReturnDraft>(() => recalled ?? createDraft(scope, todayIso()));
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
      commit(createDraft(scope, current.docDate || todayIso()));
    }
  }, [commit, scope]);

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

  /** The bill's / GRN's lines; a saved draft passes itself so its own rows do not count as returned. */
  const loadSourceLines = useCallback(
    async (srcDocId: string, srcAccYear: string) => {
      const current = draftRef.current;
      if (current.status !== "DRAFT" || !srcDocId) {
        return;
      }
      try {
        const view = await sourceLinesMutation({
          kind: current.kind,
          srcDocId,
          srcAccYear,
          ...(current.prId ? { exceptPrId: current.prId } : {}),
        }).unwrap();
        act({ type: "sourceLinesLoaded", srcDocId, srcAccYear, lines: view?.lines ?? [] });
      } catch (error) {
        const text = purchaseRefusalText(error);
        act({ type: "setHint", hint: text });
        toast.apiError(error);
      }
    },
    [act, sourceLinesMutation],
  );

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
        act({ type: "setHint", hint: purchaseRefusalText(error) });
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
    act({ type: "reset", scope: scopeRef.current, docDate: todayIso() });
    requestFocus("supplier");
  }, [act, requestFocus]);

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
    forgetRemembered,
    finishResume,
  };
}
