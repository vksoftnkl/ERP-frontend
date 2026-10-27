"use client";

/**
 * Branch Inward — the draft and every action that needs the network.
 *
 * The draft is local to the screen: it lives in state, mirrored in a ref so an
 * answer that lands late reads the draft as it is NOW. Every rule is a pure
 * transition in `branch-inward.state.ts`.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useBusinessContext } from "@/components/layout/business-context";
import { getUserInfo } from "@/lib/auth/session";
import { toast } from "@/lib/notify";
import { accountingYearOf, todayIso } from "@/features/sales/quotation/quotation.utils";
import { notify } from "../stock-adjustment/components/notify";
import { errorDetailsOf, mapServerRefusal } from "../stock-adjustment/stock-adjustment.validate";
import {
  useBranchInwardDeleteMutation,
  useBranchInwardInboundMutation,
  useBranchInwardLoadMutation,
  useBranchInwardPostMutation,
  useBranchInwardPrefillMutation,
  useBranchInwardSaveMutation,
} from "./branch-inward.api";
import { buildPayload, buildPostBody } from "./branch-inward.payload";
import {
  addDamagedLine,
  applyPrefill,
  clientProblems,
  createDraft,
  draftAsKeyed,
  draftFromHeader,
  editLine,
  isEditable,
  overlaySavedLines,
  removeLine,
  setHeader,
  setUnloading,
  type DraftScope,
} from "./branch-inward.state";
import type { BranchInwardDocKey, InboundRow, InwardDraft } from "./branch-inward.types";

export type Busy = "loading" | "saving" | "deleting" | null;

const KEPT = "Nothing came in. The receipt is still on the screen.";

function useSessionScope(): DraftScope {
  const { activeCompany, activeBranch, activeFiscalYear } = useBusinessContext();
  const companyId = activeCompany?.compId ?? activeCompany?.id ?? "";
  const branchId = activeBranch?.id ?? "";
  const accYear = (activeFiscalYear?.name ?? "").trim() || accountingYearOf(todayIso());
  // The REGISTERED device, signed into the token at login — it numbers the document.
  const deviceId = getUserInfo()?.deviceId ?? "";
  return useMemo(() => ({ companyId, branchId, accYear, deviceId }), [accYear, branchId, companyId, deviceId]);
}

export type UseBranchInwardDraftOptions = {
  /** The worklist grid's id, resolved by name (lib/configured-grids). */
  inboundGridId: string;
};

export function useBranchInwardDraft({ inboundGridId }: UseBranchInwardDraftOptions) {
  const scope = useSessionScope();
  const scopeRef = useRef(scope);
  useEffect(() => {
    scopeRef.current = scope;
  }, [scope]);

  const [draft, setDraft] = useState<InwardDraft>(() => createDraft(scope));
  const draftRef = useRef(draft);
  const commit = useCallback((next: InwardDraft) => {
    draftRef.current = next;
    setDraft(next);
  }, []);
  /** The line keys the last save sent, in payload order — to tint the line the server names. */
  const sentKeys = useRef<string[]>([]);

  const [busy, setBusyState] = useState<Busy>(null);
  const busyRef = useRef<Busy>(null);
  const setBusy = useCallback((next: Busy) => {
    busyRef.current = next;
    setBusyState(next);
  }, []);

  const [hint, setHint] = useState("");
  const [focusRequest, setFocusRequest] = useState<{ key: string; seq: number } | null>(null);

  const [inbound, setInbound] = useState<InboundRow[]>([]);
  const [inboundLoaded, setInboundLoaded] = useState(false);
  const [inboundMutation] = useBranchInwardInboundMutation();
  const [prefillMutation] = useBranchInwardPrefillMutation();
  const [loadMutation] = useBranchInwardLoadMutation();
  const [saveMutation] = useBranchInwardSaveMutation();
  const [postMutation] = useBranchInwardPostMutation();
  const [deleteMutation] = useBranchInwardDeleteMutation();

  const update = useCallback(
    (change: (current: InwardDraft) => InwardDraft) => {
      commit(change(draftRef.current));
    },
    [commit],
  );

  // ------------------------------------------------------------ the worklist
  const inboundSeq = useRef(0);
  const loadInbound = useCallback(async () => {
    const { companyId, branchId } = scopeRef.current;
    if (!companyId || !branchId || !inboundGridId) {
      return;
    }
    const seq = ++inboundSeq.current;
    try {
      const page = await inboundMutation({ gridId: inboundGridId, companyId, branchId }).unwrap();
      if (seq === inboundSeq.current) {
        setInbound(page.items);
        setInboundLoaded(true);
      }
    } catch (error) {
      if (seq === inboundSeq.current) {
        setInboundLoaded(true);
        toast.apiError(error, { refusedTitle: "Cannot load the worklist" });
      }
    }
  }, [inboundGridId, inboundMutation]);

  useEffect(() => {
    if (draftRef.current.outId === "" && draftRef.current.svhId === "") {
      void loadInbound();
    }
  }, [loadInbound, scope.branchId, scope.companyId]);

  // ------------------------------------------------------------ opening
  /** The despatch picked: its transit rows at what is still owed. */
  const openDespatch = useCallback(
    async (row: InboundRow): Promise<boolean> => {
      const outId = row.out_id ?? "";
      if (!outId || busyRef.current !== null) {
        return false;
      }
      setBusy("loading");
      try {
        const { companyId, branchId } = scopeRef.current;
        const prefill = await prefillMutation({
          companyId,
          branchId,
          outVoucherId: outId,
          accYear: row.out_acc_year ?? "",
        }).unwrap();
        commit(applyPrefill(draftRef.current, prefill, row));
        setHint("");
        return true;
      } catch (error) {
        toast.apiError(error, { refusedTitle: "Cannot open the despatch" });
        void loadInbound(); // it may have been received since the list was read
        return false;
      } finally {
        setBusy(null);
      }
    },
    [commit, loadInbound, prefillMutation, setBusy],
  );

  /** A saved receipt (GET …/receive). A DRAFT opened for edit is laid over its despatch's prefill. */
  const load = useCallback(
    async (key: BranchInwardDocKey, openForEdit: boolean): Promise<boolean> => {
      if (busyRef.current !== null) {
        return false;
      }
      setBusy("loading");
      try {
        const receipt = await loadMutation(key).unwrap();
        const base = draftFromHeader(scopeRef.current, receipt.header);
        const isDraft = base.status === "DRAFT";
        if (isDraft && openForEdit && base.outId) {
          try {
            const prefill = await prefillMutation({
              companyId: base.companyId,
              branchId: base.branchId,
              outVoucherId: base.outId,
              accYear: base.outAccYear,
            }).unwrap();
            commit(overlaySavedLines(applyPrefill({ ...base, mode: "entry" }, prefill, null), receipt.lines));
            setHint("");
            return true;
          } catch (error) {
            // The despatch moved on (received in full, say): the draft can still be looked at or deleted.
            toast.apiError(error, { refusedTitle: "Cannot edit this draft" });
            commit({ ...draftAsKeyed(base, receipt.lines), notice: "Its despatch is closed — this draft can only be viewed or deleted." });
            return true;
          }
        }
        commit(draftAsKeyed(base, receipt.lines));
        setHint("");
        return true;
      } catch (error) {
        toast.apiError(error, { refusedTitle: "Cannot open" });
        return false;
      } finally {
        setBusy(null);
      }
    },
    [commit, loadMutation, prefillMutation, setBusy],
  );

  /** F2 on a draft that was opened to look at: open it for keying. */
  const beginEdit = useCallback(async (): Promise<boolean> => {
    const current = draftRef.current;
    if (!current.svhId || current.status !== "DRAFT") {
      return false;
    }
    return load(
      { svhId: current.svhId, companyId: current.companyId, branchId: current.branchId, accYear: current.accYear },
      true,
    );
  }, [load]);

  /** Back to the worklist: nothing picked, nothing saved. */
  const reset = useCallback(() => {
    commit(createDraft(scopeRef.current));
    sentKeys.current = [];
    setHint("");
    setInboundLoaded(false);
    void loadInbound();
  }, [commit, loadInbound]);

  // ------------------------------------------------------------ keying
  const setDocDate = useCallback((docDate: string) => update((d) => setHeader(d, { docDate })), [update]);
  const setRemarks = useCallback((remarks: string) => update((d) => setHeader(d, { remarks })), [update]);
  const patchUnloading = useCallback(
    (patch: Parameters<typeof setUnloading>[1]) => update((d) => setUnloading(d, patch)),
    [update],
  );
  const editCell = useCallback(
    (key: string, patch: Parameters<typeof editLine>[2]) => {
      setHint("");
      update((d) => editLine(d, key, patch));
    },
    [update],
  );
  const addDamaged = useCallback(
    (key: string) => {
      const change = addDamagedLine(draftRef.current, key);
      commit(change.draft);
      setHint(change.hint);
      if (change.focusKey) {
        setFocusRequest((previous) => ({ key: change.focusKey as string, seq: (previous?.seq ?? 0) + 1 }));
      }
    },
    [commit],
  );
  const dropLine = useCallback((key: string) => update((d) => removeLine(d, key)), [update]);

  // ------------------------------------------------------------ saving
  const showRefusal = useCallback(
    (error: unknown, keys: readonly string[], refusedTitle: string) => {
      commit({ ...draftRef.current, problems: mapServerRefusal(errorDetailsOf(error), keys) });
      toast.apiError(error, { kept: KEPT, refusedTitle });
    },
    [commit],
  );

  /** Save the draft; with `post`, bring it in too (Qt `saveDocument(post)` → `postReceipt()`). */
  const save = useCallback(
    async (post: boolean): Promise<boolean> => {
      const current = draftRef.current;
      if (busyRef.current !== null) {
        return false;
      }
      if (!isEditable(current) || !current.outId) {
        notify("info", "Nothing to save", current.outId ? `${current.refno} is ${current.status}.` : "Pick the despatch that arrived first.");
        return false;
      }
      if (!current.deviceId) {
        notify("warn", "No device", "This session has no device id. Log in from a registered device.");
        return false;
      }
      const problems = clientProblems(current);
      if (problems.size > 0) {
        notify("warn", "This receipt cannot be saved yet", [...problems.values()].join("\n"));
        return false;
      }
      const built = buildPayload(current);
      sentKeys.current = built.sentKeys;
      setBusy("saving");
      try {
        let saved: InwardDraft;
        try {
          const result = await saveMutation(built.dto).unwrap();
          saved = {
            ...draftRef.current,
            svhId: result?.header?.svhId ?? draftRef.current.svhId,
            refno: result?.header?.refno ?? draftRef.current.refno,
            problems: {},
            dirty: false,
            notice: "",
          };
          commit(saved);
        } catch (error) {
          showRefusal(error, built.sentKeys, "Cannot save");
          return false;
        }
        if (!post) {
          notify(
            "info",
            "Saved",
            `${saved.refno} saved as a draft — nothing has come in yet. Post receipt (Ctrl+Enter) brings it in.`,
          );
          return true;
        }
        try {
          const result = await postMutation(buildPostBody(saved)).unwrap();
          notify("success", "Received", `${saved.refno} posted. ${result.message}`.trim());
          reset();
          return true;
        } catch (error) {
          showRefusal(error, built.sentKeys, "Cannot post");
          commit({ ...draftRef.current, notice: `Saved as ${saved.refno} (draft) — nothing has come in yet.` });
          return false;
        }
      } finally {
        setBusy(null);
      }
    },
    [commit, postMutation, reset, saveMutation, setBusy, showRefusal],
  );

  /** Delete a saved DRAFT — it brought nothing in; the despatch stays in transit. */
  const deleteDraft = useCallback(async (): Promise<boolean> => {
    const current = draftRef.current;
    if (!current.svhId || current.status !== "DRAFT" || busyRef.current !== null) {
      return false;
    }
    setBusy("deleting");
    try {
      await deleteMutation({
        svhId: current.svhId,
        companyId: current.companyId,
        branchId: current.branchId,
        accYear: current.accYear,
      }).unwrap();
      notify("info", "Deleted", `${current.refno} deleted.`);
      reset();
      return true;
    } catch (error) {
      toast.apiError(error, { refusedTitle: "Cannot delete" });
      return false;
    } finally {
      setBusy(null);
    }
  }, [deleteMutation, reset, setBusy]);

  return {
    draft,
    draftRef,
    busy,
    hint,
    focusRequest,
    inbound,
    inboundLoaded,
    loadInbound,
    openDespatch,
    load,
    beginEdit,
    reset,
    setDocDate,
    setRemarks,
    patchUnloading,
    editCell,
    addDamaged,
    dropLine,
    save,
    deleteDraft,
  };
}

export type BranchInwardDraftApi = ReturnType<typeof useBranchInwardDraft>;
