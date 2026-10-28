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
import { useDropdownId } from "@/lib/configured-dropdowns";
import { toast } from "@/lib/notify";
import { RESTORED_MESSAGE_OPTIONS, restoredMessage, screenMemory, type ScreenScope } from "@/lib/screen-memory";
import { useForgetIfWritingOnUnmount, useRecalledOnce, type ScreenMemoryOption } from "@/lib/use-screen-memory";
import { todayIso } from "@/features/sales/quotation/quotation.utils";
import { purchaseRefusalText, text } from "../shared/purchase.format";
import type { PurchaseDocKey } from "../shared/purchase.types";
import { usePurchaseScope } from "../shared/use-purchase-scope";
import {
  useShortageReceiptCancelMutation,
  useShortageReceiptCloseMutation,
  useShortageReceiptCloseUndoMutation,
  useShortageReceiptClosesMutation,
  useShortageReceiptDropdownRowsMutation,
  useShortageReceiptGetMutation,
  useShortageReceiptOpenMutation,
  useShortageReceiptSaveMutation,
} from "./shortage.api";
import {
  CREW_DROPDOWN_KEY,
  GODOWN_DROPDOWN_KEY,
  HINT_NOTHING_SHORT,
  HINT_PICK_SUPPLIER,
  HINT_TYPE_RECEIVED,
} from "./shortage.constants";
import {
  applyOpenRows,
  buildSavePayload,
  createDraft,
  draftFromPayload,
  editLine,
  isFresh,
  saveBlocker,
  setActive,
  setHeader,
  setSupplier,
  type HeaderPatch,
  type LinePatch,
} from "./shortage.state";
import type { CloseKind, ShortageCloseRow, ShortageDraft, ShortageReceiptPayload } from "./shortage.types";

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
  const godownDropdownId = useDropdownId(GODOWN_DROPDOWN_KEY);
  const crewDropdownId = useDropdownId(CREW_DROPDOWN_KEY);

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

  const [openMutation] = useShortageReceiptOpenMutation();
  const [getMutation] = useShortageReceiptGetMutation();
  const [saveMutation] = useShortageReceiptSaveMutation();
  const [cancelMutation] = useShortageReceiptCancelMutation();
  const [closeMutation] = useShortageReceiptCloseMutation();
  const [closesMutation] = useShortageReceiptClosesMutation();
  const [closeUndoMutation] = useShortageReceiptCloseUndoMutation();
  const [dropdownRowsMutation] = useShortageReceiptDropdownRowsMutation();

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

  const refuse = useCallback((error: unknown, title = "Not done") => {
    setHint(purchaseRefusalText(error));
    toast.apiError(error, { refusedTitle: title });
  }, []);

  // ------------------------------------------------------- the open list
  const openSeq = useRef(0);
  /**
   * The supplier's open shortages → one row each, keeping what was typed on the
   * rows still open (Qt `reloadOpen`). A saved receipt keeps its own lines.
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
      setHint(rows.length === 0 ? HINT_NOTHING_SHORT : HINT_TYPE_RECEIVED);
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
  }, [commit, openMutation, setBusy]);

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
  const patchLine = useCallback((key: string, patch: LinePatch) => update((current) => editLine(current, key, patch)), [update]);
  const selectLine = useCallback((key: string) => update((current) => setActive(current, key)), [update]);

  // --------------------------------------------------------- the names
  /**
   * A saved receipt carries its godown's and loadmen's ids only: their names
   * come from the dropdowns the header picks them from. A failure leaves them
   * blank — the ids still save back unchanged.
   */
  const resolveNames = useCallback(
    async (payload: ShortageReceiptPayload): Promise<{ godownName: string; receivedBy: ShortageDraft["receivedBy"] }> => {
      const godownId = text(payload.header.psrGodownId);
      const crewIds = (payload.header.psrReceivedBy ?? []).map(String);
      const branchId = text(payload.header.psrBranchId);
      const nameOf = async (dropdownId: string, params: Record<string, string>, idKey: string, nameKey: string) => {
        if (!dropdownId) {
          return new Map<string, string>();
        }
        try {
          const rows = await dropdownRowsMutation({ dropdownId, params }).unwrap();
          return new Map(rows.map((row) => [text(row[idKey]), text(row[nameKey])]));
        } catch {
          return new Map<string, string>();
        }
      };
      const [godowns, crew] = await Promise.all([
        godownId ? nameOf(godownDropdownId, { ibranch_id: branchId }, "gdl_id", "gdl_name") : Promise.resolve(new Map<string, string>()),
        crewIds.length > 0
          ? nameOf(crewDropdownId, { iemp_branch_id: branchId, iemp_role: "" }, "emp_id", "emp_name")
          : Promise.resolve(new Map<string, string>()),
      ]);
      return {
        godownName: godowns.get(godownId) ?? "",
        receivedBy: crewIds.map((id) => ({ id, text: crew.get(id) ?? "" })),
      };
    },
    [crewDropdownId, dropdownRowsMutation, godownDropdownId],
  );

  /** A saved receipt on screen, with its names. */
  const showPayload = useCallback(
    async (payload: ShortageReceiptPayload, mode: "browse" | "entry") => {
      const names = await resolveNames(payload);
      openSeq.current += 1; // an open list still on its way belongs to the receipt that was
      commit(draftFromPayload(payload, scopeRef.current, mode, names));
    },
    [commit, resolveNames],
  );

  // ------------------------------------------------------------ opening
  const load = useCallback(
    async (key: PurchaseDocKey, forEdit: boolean): Promise<boolean> => {
      setBusy("loading");
      try {
        const payload = await getMutation({ psrId: key.id, accYear: key.accYear || scopeRef.current.accYear }).unwrap();
        await showPayload(payload, forEdit ? "entry" : "browse");
        setHint("");
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
    commit(createDraft(scopeRef.current, todayIso()));
    setHint(HINT_PICK_SUPPLIER);
  }, [commit]);

  /** F2 — a draft that was only looked at opens for keying. */
  const beginEdit = useCallback(() => {
    update((current) => (current.status === "DRAFT" && current.psrId ? { ...current, mode: "entry" } : current));
  }, [update]);

  // ------------------------------------------------------------ writing
  /** Save Draft / Post (Qt `saveDocument`) — answers the receipt as the server now has it. */
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
        await showPayload(answer.data, "entry");
        const refno = text(answer.data.header.psrRefno);
        const sentence = post
          ? `${refno} posted — the goods are in and the shortage cleared.`
          : `${refno} saved as a draft. Its qty is held against the shortages.`;
        setHint(sentence);
        toast.success(sentence, { title: post ? "Posted" : "Saved" });
        return true;
      } catch (error) {
        refuse(error);
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
        await showPayload(answer.data, "browse");
        const sentence = `${current.refno} cancelled.`;
        setHint(answer.message || sentence);
        toast.success(sentence, { title: "Cancelled" });
        return true;
      } catch (error) {
        refuse(error);
        return false;
      } finally {
        setBusy(null);
      }
    },
    [cancelMutation, refuse, setBusy, showPayload],
  );

  /** Supplier CN… / Write off… — the whole open qty of the selected row, closed without goods. */
  const closeShortage = useCallback(
    async (key: string, kind: CloseKind, words: string): Promise<boolean> => {
      const current = draftRef.current;
      const line = current.lines.find((candidate) => candidate.key === key);
      if (!line || !isFresh(current)) {
        return false;
      }
      setBusy("closing");
      try {
        const answer = await closeMutation({
          shortageId: line.shortageId,
          accYear: line.shortageYear,
          deviceId: current.deviceId,
          kind,
          ...(kind === "SUPPLIER_CN" ? (words ? { cnNo: words } : {}) : { reason: words }),
        }).unwrap();
        const sentence = answer.message || "Shortage closed.";
        toast.success(sentence, { title: kind === "SUPPLIER_CN" ? "Supplier credit" : "Written off" });
        setBusy(null);
        await reloadOpen();
        setHint(sentence);
        return true;
      } catch (error) {
        setBusy(null);
        refuse(error);
        return false;
      }
    },
    [closeMutation, refuse, reloadOpen, setBusy],
  );

  /** The selected row's standing closes, newest first — what Undo close… takes back. */
  const standingCloses = useCallback(
    async (key: string): Promise<ShortageCloseRow[] | null> => {
      const line = draftRef.current.lines.find((candidate) => candidate.key === key);
      if (!line) {
        return null;
      }
      setBusy("loading");
      try {
        return await closesMutation({ shortageId: line.shortageId }).unwrap();
      } catch (error) {
        refuse(error, "Cannot read the closes");
        return null;
      } finally {
        setBusy(null);
      }
    },
    [closesMutation, refuse, setBusy],
  );

  const undoClose = useCallback(
    async (close: ShortageCloseRow, reason: string): Promise<boolean> => {
      setBusy("closing");
      try {
        const answer = await closeUndoMutation({ closeId: close.closeId, accYear: close.accYear, reason }).unwrap();
        const sentence = answer.message || "Close undone.";
        toast.success(sentence, { title: "Undone" });
        setBusy(null);
        await reloadOpen();
        setHint(sentence);
        return true;
      } catch (error) {
        setBusy(null);
        refuse(error);
        return false;
      }
    },
    [closeUndoMutation, refuse, reloadOpen, setBusy],
  );

  // ------------------------------------------------------ screen memory
  // Back on a remembered receipt: say so once and read the open list again —
  // it may have moved while the operator was away (what was typed is kept).
  const resumed = useRef(recalled !== null);
  useEffect(() => {
    if (!resumed.current) {
      return;
    }
    resumed.current = false;
    // One tick first: a request fired from the mount effect is torn down by StrictMode's simulated unmount.
    const timer = window.setTimeout(() => {
      toast.info(restoredMessage("shortage receipt"), RESTORED_MESSAGE_OPTIONS);
      setHint(HINT_TYPE_RECEIVED);
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
    chooseSupplier,
    patchHeader,
    patchLine,
    selectLine,
    reloadOpen,
    load,
    reset,
    beginEdit,
    save,
    cancel,
    closeShortage,
    standingCloses,
    undoClose,
    forgetRemembered,
  };
}

export type ShortageReceiptApi = ReturnType<typeof useShortageReceipt>;
