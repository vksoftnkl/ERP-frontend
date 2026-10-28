"use client";

/**
 * GRN (menu 196) — the screen's network and commit funnel. Every rule is in
 * `grn.state.ts`; this hook fetches, commits, and keeps unsaved work in screen
 * memory (lib/screen-memory) so a menu trip does not lose it.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { todayIso } from "@/features/sales/quotation/quotation.utils";
import { toast } from "@/lib/notify";
import { RESTORED_MESSAGE_OPTIONS, restoredMessage, screenMemory, type ScreenScope } from "@/lib/screen-memory";
import { useForgetIfWritingOnUnmount, useRecalledOnce, type ScreenMemoryOption } from "@/lib/use-screen-memory";
import { quotationApi } from "@/store/api/quotationApi";
import { useAppDispatch } from "@/store/hooks";
import { num, purchaseRefusalText, text } from "../shared/purchase.format";
import type { PurchaseDocKey } from "../shared/purchase.types";
import { usePurchaseScope } from "../shared/use-purchase-scope";
import {
  useGrnCancelMutation,
  useGrnGetMutation,
  useGrnItemByBarcodeMutation,
  useGrnItemLookupMutation,
  useGrnPendingPoLinesMutation,
  useGrnPostMutation,
  useGrnSaveMutation,
} from "./grn.api";
import { COL } from "./grn.constants";
import {
  applyItem,
  applyPendingLines,
  buildSavePayload,
  createDraft,
  editCell,
  ensureTrailingBlank,
  fillFromPo,
  fromPayload,
  isDraftStatus,
  isEditable,
  isWorthRemembering,
  patchHeader,
  removeLine,
  rowHasItem,
  saveRefusal,
  setGodown as setGodownState,
  setSupplier as setSupplierState,
  type HeaderPatch,
} from "./grn.state";
import type { GrnDraft, GrnPayload } from "./grn.types";

export type GrnBusy = "loading" | "saving" | "posting" | "cancelling" | null;

export type GrnFocusTarget =
  | { target: "cell"; key: string; column: number }
  | { target: "supplier" | "godown" | "lines" };
export type GrnFocusRequest = GrnFocusTarget & { seq: number };

function memoryScopeOf(draft: GrnDraft): ScreenScope {
  return { companyId: draft.companyId, branchId: draft.branchId, accYear: draft.accYear };
}

function statusOf(error: unknown): number | null {
  const status = (error as { status?: unknown } | null)?.status;
  return typeof status === "number" ? status : null;
}

export type UseGrnDraftOptions = {
  memory?: ScreenMemoryOption;
  /** Dropdown GODOWNS — to name the godown of a loaded GRN (the answer carries only its id). */
  godownDropdownId: string;
};

export function useGrnDraft({ memory, godownDropdownId }: UseGrnDraftOptions) {
  const dispatch = useAppDispatch();
  const scope = usePurchaseScope();
  const scopeRef = useRef(scope);
  useLayoutEffect(() => {
    scopeRef.current = scope;
  });

  const memoryScope = { companyId: scope.companyId, branchId: scope.branchId, accYear: scope.accYear };
  const recalled = useRecalledOnce<GrnDraft>(memory, memoryScope);
  const resumed = recalled !== null;
  const [draft, setDraft] = useState<GrnDraft>(() => recalled ?? createDraft(scope, todayIso()));
  const draftRef = useRef(draft);
  const [busy, setBusy] = useState<GrnBusy>(null);
  const busyRef = useRef<GrnBusy>(null);
  const [pendingLoading, setPendingLoading] = useState(false);
  const [focusRequest, setFocusRequest] = useState<GrnFocusRequest | null>(null);
  const focusSeq = useRef(0);

  const [saveMutation] = useGrnSaveMutation();
  const [postMutation] = useGrnPostMutation();
  const [getMutation] = useGrnGetMutation();
  const [cancelMutation] = useGrnCancelMutation();
  const [pendingMutation] = useGrnPendingPoLinesMutation();
  const [barcodeMutation] = useGrnItemByBarcodeMutation();
  const [lookupMutation] = useGrnItemLookupMutation();

  const setBusyNow = useCallback((next: GrnBusy) => {
    busyRef.current = next;
    setBusy(next);
  }, []);

  const requestFocus = useCallback((request: GrnFocusTarget) => {
    focusSeq.current += 1;
    setFocusRequest({ ...request, seq: focusSeq.current });
  }, []);

  // -------------------------------------------------------------- commit
  // Screen memory is written HERE, in the funnel every change goes through, so
  // an answer that lands after the screen is gone still reaches it.
  const memoryKey = memory?.key ?? "";
  const commit = useCallback(
    (next: GrnDraft) => {
      draftRef.current = next;
      setDraft(next);
      if (!memoryKey) {
        return;
      }
      if (isWorthRemembering(next)) {
        screenMemory.remember(memoryKey, memoryScopeOf(next), next);
      } else {
        screenMemory.forget(memoryKey, memoryScopeOf(next));
      }
    },
    [memoryKey],
  );
  useForgetIfWritingOnUnmount(
    memory,
    () => busyRef.current === "saving" || busyRef.current === "posting" || busyRef.current === "cancelling",
    () => memoryScopeOf(draftRef.current),
  );

  const setHint = useCallback((hint: string) => commit({ ...draftRef.current, hint }), [commit]);

  // ------------------------------------------------------- Against PO
  /** Qt `loadPendingPos`: the supplier's confirmed POs with qty still pending. */
  const loadPending = useCallback(
    async (supplierId: string) => {
      const current = draftRef.current;
      if (!supplierId || !isDraftStatus(current)) {
        return;
      }
      setPendingLoading(true);
      try {
        const rows = await pendingMutation({
          companyId: current.companyId,
          branchId: current.branchId,
          supplierId,
        }).unwrap();
        commit(applyPendingLines(draftRef.current, supplierId, rows));
      } catch (error) {
        if (draftRef.current.supplierId === supplierId) {
          commit({ ...draftRef.current, pendingLines: [], pendingFor: supplierId, hint: purchaseRefusalText(error) });
        }
      } finally {
        setPendingLoading(false);
      }
    },
    [commit, pendingMutation],
  );

  /** The godown's name for a loaded GRN: the answer carries its id only. */
  const nameGodown = useCallback(
    async (next: GrnDraft) => {
      if (!next.godownId || next.godownName || !godownDropdownId) {
        return;
      }
      try {
        const page = await dispatch(
          quotationApi.endpoints.runDropdown.initiate(
            { dropdownId: godownDropdownId, limit: 500, params: { ibranch_id: next.branchId } },
            { subscribe: false, forceRefetch: true },
          ),
        ).unwrap();
        const row = (page?.items ?? []).find((candidate) => text(candidate.gdl_id) === next.godownId);
        const now = draftRef.current;
        if (row && now.godownId === next.godownId && !now.godownName) {
          commit({ ...now, godownName: text(row.gdl_name) });
        }
      } catch {
        /* the id still saves; only the label is missing */
      }
    },
    [commit, dispatch, godownDropdownId],
  );

  /** The server's document onto the screen (Qt `applyLoaded`). */
  const applyPayload = useCallback(
    (payload: GrnPayload, viewMode: "browse" | "entry") => {
      const next = fromPayload(draftRef.current, payload, { viewMode, deviceId: scopeRef.current.deviceId });
      commit(next);
      void nameGodown(next);
      if (isDraftStatus(next) && next.supplierId) {
        // A reopened (or just saved) draft can still take lines from a PO; what
        // is pending has changed with this very save.
        void loadPending(next.supplierId);
      }
      return next;
    },
    [commit, loadPending, nameGodown],
  );

  // ------------------------------------------------------------ opening
  const load = useCallback(
    async (key: PurchaseDocKey, openForEdit: boolean) => {
      setBusyNow("loading");
      try {
        const payload = await getMutation({ grnId: key.id, accYear: key.accYear || scopeRef.current.accYear }).unwrap();
        applyPayload(payload, openForEdit ? "entry" : "browse");
      } catch (error) {
        toast.apiError(error);
      } finally {
        setBusyNow(null);
      }
    },
    [applyPayload, getMutation, setBusyNow],
  );

  /** The route reopened on a remembered draft: say so, then refresh its PO choices. */
  const resumedOnce = useRef(false);
  useEffect(() => {
    if (!resumed || resumedOnce.current) {
      return;
    }
    resumedOnce.current = true;
    toast.info(restoredMessage("GRN"), RESTORED_MESSAGE_OPTIONS);
    const current = draftRef.current;
    if (isEditable(current) && current.supplierId) {
      void loadPending(current.supplierId);
    }
  }, [loadPending, resumed]);

  // ------------------------------------------------------------ the header
  const setSupplier = useCallback(
    (id: string, name: string) => {
      const before = draftRef.current.supplierId;
      commit(setSupplierState(draftRef.current, id, name));
      if (id && id !== before) {
        void loadPending(id);
      }
    },
    [commit, loadPending],
  );
  const setGodown = useCallback(
    (id: string, name: string) => commit(setGodownState(draftRef.current, id, name)),
    [commit],
  );
  const setHeader = useCallback((patch: HeaderPatch) => commit(patchHeader(draftRef.current, patch)), [commit]);

  const pickPo = useCallback(
    (poId: string) => {
      const current = draftRef.current;
      if (!poId) {
        commit({ ...current, poChoice: "" });
        return;
      }
      const { draft: next, added } = fillFromPo(current, poId);
      commit(next);
      if (added > 0) {
        const first = next.lines.find((line) => line.poItemId && !current.lines.some((old) => old.key === line.key));
        if (first) {
          requestFocus({ target: "cell", key: first.key, column: COL.Recd });
        }
      }
    },
    [commit, requestFocus],
  );

  // ------------------------------------------------------------ the lines
  /** Qt `fetchItem`: the item's unit and MRP onto the line, then the cursor to Challan. */
  const pickItem = useCallback(
    async (key: string, item: { itemId: string; itemName: string; unitId?: string; barcode?: string }) => {
      const current = draftRef.current;
      if (!item.itemId || !isEditable(current)) {
        return false;
      }
      try {
        const found = await lookupMutation({
          companyId: current.companyId,
          branchId: current.branchId,
          itemId: item.itemId,
          ...(item.unitId ? { uomId: item.unitId } : {}),
          onDate: current.docDate || todayIso(),
          ...(current.godownId ? { godownId: current.godownId } : {}),
        }).unwrap();
        const now = draftRef.current;
        if (!isEditable(now) || !now.lines.some((line) => line.key === key)) {
          return false;
        }
        commit(
          applyItem(now, key, {
            itemId: item.itemId,
            itemName: item.itemName || text(found.itemName),
            uomId: text(found.uomId),
            unitName: text(found.unitName),
            mrp: num(found.mrp),
            ...(item.barcode !== undefined ? { barcode: item.barcode } : {}),
          }),
        );
        requestFocus({ target: "cell", key, column: COL.Challan });
        return true;
      } catch (error) {
        toast.apiError(error);
        return false;
      }
    },
    [commit, lookupMutation, requestFocus],
  );

  /** Qt `resolveBarcode`: a scan → its item (in the unit the barcode is for). */
  const resolveBarcode = useCallback(
    async (key: string, code: string) => {
      const barcode = code.trim();
      const current = draftRef.current;
      const line = current.lines.find((candidate) => candidate.key === key);
      if (!barcode || !line || rowHasItem(line) || !isEditable(current)) {
        return false;
      }
      try {
        const found = await barcodeMutation({ barcode, companyId: current.companyId }).unwrap();
        if (!found?.itemId) {
          setHint(`Barcode ${barcode} not found.`);
          return false;
        }
        return await pickItem(key, {
          itemId: found.itemId,
          itemName: text(found.itemName),
          unitId: text(found.unitId),
          barcode,
        });
      } catch (error) {
        if (statusOf(error) === 404) {
          setHint(`Barcode ${barcode} not found.`);
          requestFocus({ target: "cell", key, column: COL.Barcode });
        } else {
          toast.apiError(error);
        }
        return false;
      }
    },
    [barcodeMutation, pickItem, requestFocus, setHint],
  );

  const editLine = useCallback(
    (key: string, column: number, raw: string) => commit(editCell(draftRef.current, key, column, raw)),
    [commit],
  );
  const dropLine = useCallback((key: string) => commit(removeLine(draftRef.current, key)), [commit]);

  // ------------------------------------------------------------ the document
  const showRefusal = useCallback(
    (error: unknown) => {
      commit({ ...draftRef.current, hint: purchaseRefusalText(error) });
      toast.apiError(error, { title: "Not saved" });
    },
    [commit],
  );

  /**
   * Qt `saveDocument`. Post on a saved draft nobody has changed posts it as it
   * stands (`/post` — the Post right alone); anything else saves the whole
   * document, posting in the same call when asked.
   */
  const save = useCallback(
    async (post: boolean) => {
      const current = draftRef.current;
      if (busyRef.current) {
        return;
      }
      const refusal = saveRefusal(current);
      if (refusal) {
        toast.warn(refusal.message, { title: refusal.title });
        if (refusal.focus) {
          requestFocus({ target: refusal.focus });
        }
        return;
      }
      setBusyNow(post ? "posting" : "saving");
      try {
        const payload =
          post && current.grnId && !current.dirty
            ? await postMutation({ grnId: current.grnId, accYear: current.accYear }).unwrap()
            : await saveMutation(buildSavePayload(current, post)).unwrap();
        const next = applyPayload(payload, "entry");
        const warnings = (payload.warnings ?? []).map((warning) => warning.message).filter(Boolean);
        const said = post
          ? `${next.refno} posted — the stock is in, waiting for the supplier's bill.`
          : `${next.refno} saved as a draft. Nothing has moved yet.`;
        if (warnings.length > 0) {
          toast.warn([said, ...warnings].join("\n"), { title: post ? "Posted" : "Saved" });
        } else {
          toast.success(said, { title: post ? "Posted" : "Saved" });
        }
      } catch (error) {
        showRefusal(error);
      } finally {
        setBusyNow(null);
      }
    },
    [applyPayload, postMutation, requestFocus, saveMutation, setBusyNow, showRefusal],
  );

  /** Qt `cancelGrn`: a posted GRN that is not billed. */
  const cancel = useCallback(
    async (reason: string) => {
      const current = draftRef.current;
      if (busyRef.current || current.status !== "POSTED" || !current.grnId) {
        return;
      }
      setBusyNow("cancelling");
      try {
        const payload = await cancelMutation({ grnId: current.grnId, accYear: current.accYear, reason }).unwrap();
        const next = applyPayload(payload, "browse");
        toast.success(`${next.refno} cancelled — the stock is out again.`, { title: "Cancelled" });
      } catch (error) {
        commit({ ...draftRef.current, hint: purchaseRefusalText(error) });
        toast.apiError(error);
      } finally {
        setBusyNow(null);
      }
    },
    [applyPayload, cancelMutation, commit, setBusyNow],
  );

  /** Qt `resetScreen`: a new GRN under the session's tenant. */
  const reset = useCallback(() => {
    commit(createDraft(scopeRef.current, todayIso()));
    requestFocus({ target: "supplier" });
  }, [commit, requestFocus]);

  /** F2 — key a draft that was opened to look at. */
  const beginEdit = useCallback(() => {
    const current = draftRef.current;
    if (!isDraftStatus(current) || current.viewMode === "entry") {
      return;
    }
    commit({ ...current, viewMode: "entry", lines: ensureTrailingBlank(current.lines) });
    if (current.supplierId && current.pendingFor !== current.supplierId) {
      void loadPending(current.supplierId);
    }
  }, [commit, loadPending]);

  /** Leaving on purpose (Close / Show List after "discard"): nothing to bring back. */
  const discard = useCallback(() => {
    if (memoryKey) {
      screenMemory.forget(memoryKey, memoryScopeOf(draftRef.current));
    }
  }, [memoryKey]);

  return {
    draft,
    draftRef,
    busy,
    pendingLoading,
    focusRequest,
    resumed,
    load,
    setSupplier,
    setGodown,
    setHeader,
    setHint,
    pickPo,
    pickItem,
    resolveBarcode,
    editLine,
    dropLine,
    save,
    cancel,
    reset,
    beginEdit,
    discard,
    requestFocus,
  };
}
