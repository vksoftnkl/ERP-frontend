"use client";

/**
 * The reducer, the queries, and the six jobs that talk to the server.
 *
 * Nothing here computes money. `domain/` does that and it is pure; this file
 * sequences calls, guards late answers and says what happened.
 *
 * The two dialogs this screen cannot do without — a confirmation and a
 * one-line prompt — are INJECTED by the caller rather than opened from here.
 * That is not tidiness. The Qt screen crashed because `showWarning` ran a
 * nested event loop, an `/open-items` reply landed inside it and replaced the
 * lists, and the row reference taken before the dialog was left dangling.
 * Everything here that reads state does so after the dialog has answered, from
 * the ref, never from a value captured before it.
 */
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { getAuthUserId } from "@/lib/auth/session";
import { useAppDispatch } from "@/store/hooks";
import { toast } from "@/lib/notify";
import { useGetTenderMastersQuery } from "@/store/api/saleOrderApi";
import {
  receiptApi,
  useAmendReceiptMutation,
  useCancelReceiptMutation,
  useDeleteReceiptDraftMutation,
  usePostReceiptMutation,
  useSaveReceiptDraftMutation,
} from "@/store/api/receiptApi";
import { receiptError, statusOf } from "../api-errors";
import { computeIdentity } from "../domain/identity";
import { mergeDraftMemo } from "../domain/merge-draft";
import { mergeForAmend } from "../domain/merge-amend";
import { formatTotal } from "../domain/money";
import { netAllocations } from "../domain/net-allocations";
import { defaultTender, offerableTenders, tenderRowFrom } from "../domain/tenders";
import { buildAmendPayload } from "../payload/build-amend";
import { buildDraftPayload } from "../payload/build-draft";
import { buildPostPayload } from "../payload/build-post";
import {
  applyCheques,
  parseDraftCreditMemo,
  parseDraftMemo,
  parseHeader,
  parseOtherLines,
  parseTenders,
} from "../payload/parse";
import type {
  ReceiptKeys,
  ReceiptPayload,
  ReceiptScope,
  ReceiptSettings,
} from "../receipt.types";
import { identityHint, validateBeforePost, validateBeforeSave, type Problem } from "../validate";
import {
  draftReducer,
  initialDraft,
  isEditable,
  receivedTotal,
  type DraftAction,
  type ReceiptDraft,
} from "./draft";

/** `useReducer` over a reducer that also returns refusals. */
function reducerWithRefusal(state: ReceiptDraft, action: DraftAction): ReceiptDraft {
  const result = draftReducer(state, action);
  if (result.refusal) {
    // `lib/notify` is a module-level queue, not React state, so raising from
    // inside the reducer is safe and a refusal cannot be silently dropped by a
    // caller that forgot to look at the second return value.
    toast.warn(result.refusal.message);
  }
  return result.draft;
}

export type ReceiptBusy = "idle" | "loading" | "saving" | "posting" | "cancelling" | "deleting";

export type ConfirmRequest = {
  title: string;
  message: string;
  confirmLabel?: string;
};

export type PromptRequest = {
  title: string;
  message: string;
  placeholder?: string;
};

export type UseReceiptDraftOptions = {
  scope: ReceiptScope;
  /** The session's APP date, not `new Date()`. */
  appDate: string;
  settings: ReceiptSettings;
  canWrite: boolean;
  confirm: (request: ConfirmRequest) => Promise<boolean>;
  /** Returns the typed text, or null when the operator backed out. */
  prompt: (request: PromptRequest) => Promise<string | null>;
};

export type UseReceiptDraft = ReturnType<typeof useReceiptDraft>;

export function useReceiptDraft(options: UseReceiptDraftOptions) {
  const { scope, appDate, settings, canWrite, confirm, prompt } = options;
  const [draft, dispatch] = useReducer(
    reducerWithRefusal,
    undefined,
    () => initialDraft(scope, appDate),
  );
  const [busy, setBusy] = useState<ReceiptBusy>("idle");

  /**
   * Read from inside an async job AFTER a dialog, so nothing ever acts on a
   * copy of the draft taken before the operator answered.
   *
   * Refreshed in an effect rather than during render: every reader is a
   * callback that runs after the paint which wrote it, so there is nothing to
   * gain from writing it earlier — and writing a ref during render is the
   * thing that makes a component not update as expected.
   */
  const latest = useRef(draft);
  useEffect(() => {
    latest.current = draft;
  });

  /**
   * ── Every read goes through `initiate`, not through a lazy trigger ───────
   *
   * Opening a receipt by its four keys happens in the ROUTE's mount effect,
   * and a lazy-query trigger fired before its own subscription exists resolves
   * with `undefined` and never touches the network — which lands as
   * "Cannot read properties of undefined (reading 'header')" over a screen
   * that looks like it simply failed to load. The quotation port hit the same
   * thing and answers it the same way.
   *
   * `subscribe: false` because nothing here re-renders on the cache entry, and
   * `forceRefetch` because the bills may have moved since the last read.
   */
  const storeDispatch = useAppDispatch();
  const fetchOpenItems = useCallback(
    (args: Parameters<typeof receiptApi.endpoints.getReceiptOpenItems.initiate>[0]) =>
      storeDispatch(
        receiptApi.endpoints.getReceiptOpenItems.initiate(args, {
          subscribe: false,
          forceRefetch: true,
        }),
      ).unwrap(),
    [storeDispatch],
  );
  const fetchPartyContext = useCallback(
    (args: Parameters<typeof receiptApi.endpoints.getReceiptPartyContext.initiate>[0]) =>
      storeDispatch(
        receiptApi.endpoints.getReceiptPartyContext.initiate(args, {
          subscribe: false,
          forceRefetch: true,
        }),
      ).unwrap(),
    [storeDispatch],
  );
  const fetchReceipt = useCallback(
    (args: ReceiptKeys) =>
      storeDispatch(
        receiptApi.endpoints.getReceipt.initiate(args, { subscribe: false, forceRefetch: true }),
      ).unwrap(),
    [storeDispatch],
  );
  const fetchAdjacent = useCallback(
    (args: Parameters<typeof receiptApi.endpoints.getAdjacentReceipt.initiate>[0]) =>
      storeDispatch(
        receiptApi.endpoints.getAdjacentReceipt.initiate(args, {
          subscribe: false,
          forceRefetch: true,
        }),
      ).unwrap(),
    [storeDispatch],
  );
  const checkDuplicate = useCallback(
    (args: Parameters<typeof receiptApi.endpoints.checkDuplicateReceipt.initiate>[0]) =>
      storeDispatch(
        receiptApi.endpoints.checkDuplicateReceipt.initiate(args, {
          subscribe: false,
          forceRefetch: true,
        }),
      ).unwrap(),
    [storeDispatch],
  );
  const [saveDraftMutation] = useSaveReceiptDraftMutation();
  const [postMutation] = usePostReceiptMutation();
  const [amendMutation] = useAmendReceiptMutation();
  const [cancelMutation] = useCancelReceiptMutation();
  const [deleteMutation] = useDeleteReceiptDraftMutation();

  // ── The tenders on offer ──────────────────────────────────────────────────
  // Filtered by the RECEIPT's date, not the wall clock: a back-dated receipt
  // settles under the tenders that were in force that day.
  const { data: tenderMasters, isError: tendersFailed } = useGetTenderMastersQuery();
  const masters = useMemo(
    () => offerableTenders(tenderMasters ?? [], draft.header.voucherDate || appDate),
    [tenderMasters, draft.header.voucherDate, appDate],
  );

  const identity = useMemo(
    () =>
      computeIdentity({
        bills: draft.bills,
        credits: draft.credits,
        tenders: draft.tenders,
        otherLines: draft.otherLines,
      }),
    [draft.bills, draft.credits, draft.tenders, draft.otherLines],
  );

  // ── A fresh receipt starts with one instrument on the default tender ──────
  // It does NOT make the document dirty: an untouched row is furniture, and a
  // screen that considers itself dirty the moment it opens cannot warn
  // usefully about leaving.
  const seededTender = useRef(false);
  useEffect(() => {
    if (draft.tenders.length > 0 || masters.length === 0 || draft.header.voucherId) {
      return;
    }
    if (seededTender.current) {
      return;
    }
    const master = defaultTender(masters);
    if (!master) {
      return;
    }
    seededTender.current = true;
    dispatch({ type: "REPLACE_DOCUMENT", draft: { ...latest.current, tenders: [tenderRowFrom(master)] } });
  }, [masters, draft.tenders.length, draft.header.voucherId]);

  useEffect(() => {
    if (tendersFailed) {
      dispatch({
        type: "NOTICE",
        notice:
          "The tender master could not be read, so no instrument can be added. A receipt cannot " +
          "fall back to a hand-made cash row: the tender's own ledger is what the posting " +
          "engine debits.",
      });
    } else if (tenderMasters && masters.length === 0) {
      dispatch({
        type: "NOTICE",
        notice:
          "No tender is configured for this date, so no instrument can be added. Check the " +
          "tender master's active dates.",
      });
    }
  }, [tendersFailed, tenderMasters, masters.length]);

  // ── Loading a party ───────────────────────────────────────────────────────
  const loadParty = useCallback(
    (partyId: string, onDateOverride?: string) => {
      if (!partyId || !scope.companyId) {
        return;
      }
      // The caller may pass the date it is ABOUT to set: a dispatch has not
      // been applied yet when the handler that made it runs on.
      const onDate = onDateOverride || latest.current.header.voucherDate || appDate;
      setBusy("loading");
      // Three requests in parallel. Each answer is applied only if it still
      // belongs to the party on screen — the reducer checks, so a slow reply
      // for the party the operator has just left cannot paint over the new one.
      void Promise.allSettled([
        fetchOpenItems({ partyId, companyId: scope.companyId, onDate })
          .then((payload) => dispatch({ type: "OPEN_ITEMS_LOADED", partyId, payload }))
          .catch((error: unknown) => toast.error(receiptError(error))),
        fetchPartyContext({ partyId, companyId: scope.companyId })
          .then((payload) => dispatch({ type: "CONTEXT_LOADED", partyId, payload }))
          // Context, not truth: the panels empty and the receipt is still
          // takeable. Saying nothing is the whole point.
          .catch(() => dispatch({ type: "CONTEXT_FAILED" })),
      ]).finally(() => setBusy("idle"));
    },
    [appDate, fetchOpenItems, fetchPartyContext, scope.companyId],
  );

  const pickParty = useCallback(
    async (partyId: string, partyName: string) => {
      const current = latest.current;
      if (partyId === current.header.partyId) {
        return;
      }
      const placed = current.bills.some((bill) => bill.receive > 0 || bill.discount > 0);
      if (placed && current.header.partyId) {
        const ok = await confirm({
          title: "Change the customer?",
          message:
            `What is allocated belongs to ${current.header.partyName || "this customer"}'s ` +
            "bills and will be cleared.",
          confirmLabel: "Change customer",
        });
        if (!ok) {
          return;
        }
      }
      dispatch({ type: "PARTY_PICKED", partyId, partyName });
      loadParty(partyId);
    },
    [confirm, loadParty],
  );

  /** F5 — somebody may have posted against these bills meanwhile. */
  const reloadItems = useCallback(() => {
    const partyId = latest.current.header.partyId;
    if (!partyId) {
      return;
    }
    loadParty(partyId);
  }, [loadParty]);

  /**
   * The date decides which bills count as overdue, what discount the slabs
   * still offer (`onDate` ages them) and which tenders are on offer — so
   * moving it re-reads the open items.
   *
   * Done HERE, on the edit, rather than in an effect watching the date: it is
   * a reaction to something the operator did, and an effect would also fire on
   * the date a loaded document brings with it, re-reading the items it has
   * just painted.
   */
  const setVoucherDate = useCallback(
    (voucherDate: string) => {
      const current = latest.current;
      dispatch({ type: "SET_HEADER", patch: { voucherDate } });
      if (voucherDate && current.header.partyId && current.itemsLoaded && isEditable(current)) {
        loadParty(current.header.partyId, voucherDate);
      }
    },
    [loadParty],
  );

  // ── Painting a loaded receipt ─────────────────────────────────────────────
  const paintReceipt = useCallback(
    async (payload: ReceiptPayload) => {
      const header = parseHeader(payload.header, scope);
      const isDraft = header.status === "DRAFT";
      const tenders = applyCheques(parseTenders(payload.tenders), payload.cheques ?? []);
      const base: ReceiptDraft = {
        ...initialDraft(header.scope, header.voucherDate),
        header,
        tenders,
        otherLines: parseOtherLines(payload.otherLines),
        baseRevision: header.revisionNo,
      };

      if (!isDraft) {
        // What a POSTED receipt shows is what it DID, so `/open-items` is not
        // called at all — and the party's flags stay NOT LOADED, so nothing
        // announces "not bill-by-bill" over a screen full of that party's bills.
        dispatch({
          type: "REPLACE_DOCUMENT",
          draft: {
            ...base,
            bills: netAllocations(payload.allocations ?? []),
            credits: [],
            itemsLoaded: false,
          },
        });
        // The context panels are still worth having on a posted receipt.
        if (header.partyId && scope.companyId) {
          void fetchPartyContext({ partyId: header.partyId, companyId: scope.companyId })
            .then((context) =>
              dispatch({ type: "CONTEXT_LOADED", partyId: header.partyId, payload: context }),
            )
            .catch(() => dispatch({ type: "CONTEXT_FAILED" }));
        }
        return;
      }

      // A DRAFT touched no bill, so /open-items is the truth and the memo is
      // clamped onto it.
      dispatch({ type: "REPLACE_DOCUMENT", draft: base });
      const memoBills = parseDraftMemo(payload.allocations ?? []);
      const memoCredits = parseDraftCreditMemo(payload.creditsApplied ?? []);
      try {
        const items = await fetchOpenItems({
          partyId: header.partyId,
          companyId: header.scope.companyId,
          onDate: header.voucherDate,
        });
        dispatch({ type: "OPEN_ITEMS_LOADED", partyId: header.partyId, payload: items });
        const merged = mergeDraftMemo({
          bills: latest.current.bills,
          credits: latest.current.credits,
          memoBills,
          memoCredits,
        });
        dispatch({ type: "REPLACE_BILLS", bills: merged.bills, credits: merged.credits });
        if (merged.notes.length > 0) {
          dispatch({ type: "NOTICE", notice: merged.notes.join(" ") });
        }
      } catch (error) {
        toast.error(receiptError(error));
      }
      if (header.partyId && header.scope.companyId) {
        void fetchPartyContext({ partyId: header.partyId, companyId: header.scope.companyId })
          .then((context) =>
            dispatch({ type: "CONTEXT_LOADED", partyId: header.partyId, payload: context }),
          )
          .catch(() => dispatch({ type: "CONTEXT_FAILED" }));
      }
    },
    [fetchOpenItems, fetchPartyContext, scope],
  );

  const openByKeys = useCallback(
    async (keys: ReceiptKeys) => {
      setBusy("loading");
      try {
        const payload = await fetchReceipt(keys);
        await paintReceipt(payload);
      } catch (error) {
        toast.error(receiptError(error));
      } finally {
        setBusy("idle");
      }
    },
    [fetchReceipt, paintReceipt],
  );

  const newDocument = useCallback(async (): Promise<boolean> => {
    if (latest.current.dirty) {
      const ok = await confirm({
        title: "Start a new receipt?",
        message: "This receipt has unsaved changes. Start a new one and lose them?",
        confirmLabel: "Start new",
      });
      if (!ok) {
        return false;
      }
    }
    seededTender.current = false;
    dispatch({ type: "NEW_DOCUMENT", scope, voucherDate: appDate });
    return true;
  }, [appDate, confirm, scope]);

  // ── The duplicate guard ───────────────────────────────────────────────────
  const runDuplicateCheck = useCallback(async () => {
    const current = latest.current;
    // The TOTAL received, not the row. Two 500s keyed as two rows of one
    // receipt are not a duplicate of anything.
    const amount = receivedTotal(current);
    if (amount <= 0 || !current.header.partyId || current.duplicateAsked === amount) {
      return;
    }
    dispatch({ type: "DUPLICATE_ASKED", amount });
    try {
      const result = await checkDuplicate({
        partyId: current.header.partyId,
        companyId: current.header.scope.companyId,
        accYear: current.header.scope.accYear,
        voucherDate: current.header.voucherDate,
        amount,
        branchId: current.header.scope.branchId,
        ...(current.header.voucherId ? { excludeVoucherId: current.header.voucherId } : {}),
      });
      if (!result.isDuplicate || result.matches.length === 0) {
        return;
      }
      const named = result.matches
        .map((match) => `${match.voucherRefno ?? "an unnumbered draft"} on ${match.voucherDate}`)
        .join(", ");
      dispatch({
        type: "NOTICE",
        notice:
          `${formatTotal(amount)} has already been received from this customer today — ${named}. ` +
          "Two equal cheques on one day are ordinary; this is only a reminder.",
      });
    } catch {
      // A guard that cannot answer must not get in the way.
    }
  }, [checkDuplicate]);

  // ── Save ──────────────────────────────────────────────────────────────────
  const persistDraft = useCallback(async (): Promise<string | null> => {
    const current = latest.current;
    const body = buildDraftPayload({
      header: current.header,
      tenders: current.tenders,
      otherLines: current.otherLines,
      bills: current.bills,
      credits: current.credits,
      userId: getAuthUserId() ?? "",
    });
    const payload = await saveDraftMutation(body).unwrap();
    // `data.header.avhVoucherId`. Read one level shallower it is empty, and
    // /post then complains about a UUID — pointing at the wrong route.
    const voucherId = payload.header?.avhVoucherId ?? null;
    if (voucherId) {
      dispatch({ type: "SAVED", voucherId, status: payload.header.avhVoucherStatus });
    }
    return voucherId;
  }, [saveDraftMutation]);

  const validationInput = useCallback(
    () => ({
      header: latest.current.header,
      bills: latest.current.bills,
      credits: latest.current.credits,
      tenders: latest.current.tenders,
      otherLines: latest.current.otherLines,
      party: latest.current.party,
      settings,
      masters,
    }),
    [masters, settings],
  );

  const reportProblems = useCallback((problems: Problem[]): boolean => {
    dispatch({ type: "PROBLEMS", problems });
    if (problems.length > 0) {
      toast.error(problems[0].message);
      return false;
    }
    return true;
  }, []);

  /**
   * Save the draft and PUT IT DOWN.
   *
   * The screen clears afterwards because saving a draft is how a receipt is
   * put down. If it stayed, the next receipt would be keyed on top of it —
   * which is how a draft acquires somebody else's tenders.
   */
  const saveDraft = useCallback(async (): Promise<boolean> => {
    if (!canWrite) {
      toast.error("You do not have rights to save on this screen.");
      return false;
    }
    if (!reportProblems(validateBeforeSave(validationInput()))) {
      return false;
    }
    setBusy("saving");
    try {
      await persistDraft();
      toast.success("Draft saved — nothing has been allocated yet.");
      seededTender.current = false;
      dispatch({ type: "NEW_DOCUMENT", scope, voucherDate: appDate });
      return true;
    } catch (error) {
      toast.error(receiptError(error));
      return false;
    } finally {
      setBusy("idle");
    }
  }, [appDate, canWrite, persistDraft, reportProblems, scope, validationInput]);

  // ── Post ──────────────────────────────────────────────────────────────────
  const post = useCallback(async (): Promise<boolean> => {
    if (!canWrite) {
      toast.error("You do not have rights to post on this screen.");
      return false;
    }
    if (!reportProblems(validateBeforePost(validationInput()))) {
      return false;
    }
    const current = latest.current;
    const figures = computeIdentity(current);
    if (figures.onAccount > 0) {
      // An advance is a liability, and it is the most common way a receipt
      // goes wrong: a missed bill, or 12,000 keyed for 1,200.
      const ok = await confirm({
        title: "Hold money on account?",
        message:
          `${formatTotal(figures.onAccount)} of this receipt is not against any bill. It will ` +
          `be held on account as an advance in ${current.header.partyName || "this customer"}'s ` +
          "name until it is applied to one.",
        confirmLabel: "Hold on account",
      });
      if (!ok) {
        return false;
      }
    }

    setBusy("posting");
    try {
      let voucherId = latest.current.header.voucherId;
      if (latest.current.dirty || !voucherId) {
        voucherId = await persistDraft();
      }
      if (!voucherId) {
        // Refused HERE rather than letting /post say it: the fault is in the
        // save, and a message naming `avhVoucherId` sends everyone to the
        // wrong route.
        toast.error("The draft has no id yet, so there is nothing to post. Save it again.");
        return false;
      }
      const after = latest.current;
      const payload = await postMutation(
        buildPostPayload({
          header: { ...after.header, voucherId },
          bills: after.bills,
          credits: after.credits,
          tenders: after.tenders,
          otherLines: after.otherLines,
        }),
      ).unwrap();

      // `data.header.avhVoucherRefno`. Read shallow, a receipt that HAD posted
      // showed "Receipt  posted." and looked exactly like a failure.
      const refno = payload.header?.avhVoucherRefno ?? "";
      const pdcVouchers = payload.pdcVouchers ?? [];
      const notes: string[] = [`Receipt ${refno || "(unnumbered)"} posted.`];
      if (pdcVouchers.length > 0) {
        notes.push(
          `${pdcVouchers.length} post-dated cheque(s) got their own voucher — ` +
            `${pdcVouchers.map((voucher) => voucher.voucherRefno ?? voucher.voucherId).join(", ")}. ` +
            "Those bills do not settle until the cheques mature.",
        );
      }
      if (payload.totalOnAccount > 0) {
        notes.push(`${formatTotal(payload.totalOnAccount)} is on account as an advance.`);
      }
      toast.success(notes.join(" "));
      seededTender.current = false;
      dispatch({ type: "NEW_DOCUMENT", scope, voucherDate: appDate });
      return true;
    } catch (error) {
      if (statusOf(error) === 409) {
        // The server computed a different split. Showing BOTH is the
        // difference between a fixable disagreement and an argument with
        // support.
        toast.error(
          `${receiptError(error)} This screen made it ${formatTotal(figures.allocated)} ` +
            `allocated and ${formatTotal(figures.onAccount)} on account. Press F5 to re-read ` +
            "the bills and try again.",
        );
      } else {
        toast.error(receiptError(error));
      }
      return false;
    } finally {
      setBusy("idle");
    }
  }, [appDate, canWrite, confirm, persistDraft, postMutation, reportProblems, scope, validationInput]);

  // ── Amend (R20) ───────────────────────────────────────────────────────────
  const beginAmend = useCallback(async () => {
    const current = latest.current;
    if (current.header.status !== "POSTED" || !current.header.voucherId) {
      return;
    }
    setBusy("loading");
    try {
      const baseline = current.bills;
      const items = await fetchOpenItems({
        partyId: current.header.partyId,
        companyId: current.header.scope.companyId,
        onDate: current.header.voucherDate,
      });
      dispatch({ type: "OPEN_ITEMS_LOADED", partyId: current.header.partyId, payload: items });
      const merged = mergeForAmend({
        openBills: latest.current.bills,
        openCredits: latest.current.credits,
        baseline,
        baselineCredits: [],
        voucherId: current.header.voucherId,
      });
      dispatch({ type: "BEGIN_AMEND", bills: merged.bills, credits: merged.credits });
      if (merged.notes.length > 0) {
        dispatch({ type: "NOTICE", notice: merged.notes.join(" ") });
      }
    } catch (error) {
      toast.error(receiptError(error));
    } finally {
      setBusy("idle");
    }
  }, [fetchOpenItems]);

  const saveAmend = useCallback(async (): Promise<boolean> => {
    if (!reportProblems(validateBeforePost(validationInput()))) {
      return false;
    }
    // Asked BEFORE sending, and an empty one cancels: an amend that cannot say
    // why it happened is worse evidence than the cancel-and-re-enter it
    // replaces.
    const remark = await prompt({
      title: "Why is this receipt being restated?",
      message:
        "It keeps its number and no reversal voucher is written, so this remark is the trail. " +
        "It goes on the status log and on every audit row the amend writes.",
      placeholder: "cheque no keyed 55491, actual 55419",
    });
    if (!remark || !remark.trim()) {
      return false;
    }
    setBusy("saving");
    try {
      const current = latest.current;
      const payload = await amendMutation(
        buildAmendPayload({
          header: current.header,
          tenders: current.tenders,
          otherLines: current.otherLines,
          bills: current.bills,
          credits: current.credits,
          userId: getAuthUserId() ?? "",
          baseRevision: current.baseRevision,
          editRemark: remark,
        }),
      ).unwrap();
      toast.success(
        `Receipt ${payload.header?.avhVoucherRefno ?? ""} was restated. It keeps its number; ` +
          `this is revision ${payload.toRevision}.`,
      );
      dispatch({ type: "END_AMEND" });
      seededTender.current = false;
      dispatch({ type: "NEW_DOCUMENT", scope, voucherDate: appDate });
      return true;
    } catch (error) {
      if (statusOf(error) === 409) {
        // The lock did its job. Reloading is the ONLY correct response —
        // retrying with the revision the server named defeats it entirely.
        toast.error(`${receiptError(error)} Reopen the receipt before correcting it again.`);
      } else {
        toast.error(receiptError(error));
      }
      return false;
    } finally {
      setBusy("idle");
    }
  }, [amendMutation, appDate, prompt, reportProblems, scope, validationInput]);

  // ── Cancel and delete ─────────────────────────────────────────────────────
  const cancel = useCallback(async (): Promise<boolean> => {
    const current = latest.current;
    if (current.header.status !== "POSTED" || !current.header.voucherId) {
      return false;
    }
    const reason = await prompt({
      title: `Cancel ${current.header.voucherRefno ?? "this receipt"}?`,
      message:
        `Cancelling it also reverses any post-dated cheque voucher, reopens every bill it ` +
        "settled and returns any credit it spent. A reversal voucher is written; nothing is " +
        "deleted. The reason is required.",
      placeholder: "why this receipt is being cancelled",
    });
    if (!reason || !reason.trim()) {
      return false;
    }
    setBusy("cancelling");
    try {
      const payload = await cancelMutation({
        avhVoucherId: current.header.voucherId,
        avhCompanyId: current.header.scope.companyId,
        avhBranchId: current.header.scope.branchId,
        avhAccYear: current.header.scope.accYear,
        reason: reason.trim(),
      }).unwrap();
      const reopened = payload.billsReopened?.length ?? 0;
      toast.success(
        `A reversal voucher was written. Nothing was deleted.` +
          (reopened > 0 ? ` ${reopened} bill(s) are open again.` : ""),
      );
      seededTender.current = false;
      dispatch({ type: "NEW_DOCUMENT", scope, voucherDate: appDate });
      return true;
    } catch (error) {
      // The server refuses a cancel once a cheque has been deposited or
      // cleared, or once the advance has been spent. Its sentence says which.
      toast.error(receiptError(error));
      return false;
    } finally {
      setBusy("idle");
    }
  }, [appDate, cancelMutation, prompt, scope]);

  const deleteDraft = useCallback(async (): Promise<boolean> => {
    const current = latest.current;
    if (current.header.status !== "DRAFT" || !current.header.voucherId) {
      return false;
    }
    const ok = await confirm({
      title: "Throw this draft away?",
      message:
        `This unnumbered draft of ${current.header.partyName || "this customer"} took no ` +
        "number, moved no bill and wrote no ledger entry, so there is nothing to reverse. " +
        "This cannot be undone.",
      confirmLabel: "Delete draft",
    });
    if (!ok) {
      return false;
    }
    setBusy("deleting");
    try {
      const payload = await deleteMutation({
        avhVoucherId: current.header.voucherId,
        avhCompanyId: current.header.scope.companyId,
        avhBranchId: current.header.scope.branchId,
        avhAccYear: current.header.scope.accYear,
      }).unwrap();
      toast.success(
        `Draft deleted — ${payload.tendersDeleted} instrument(s) and ` +
          `${payload.otherLinesDeleted} line(s) went with it.`,
      );
      seededTender.current = false;
      dispatch({ type: "NEW_DOCUMENT", scope, voucherDate: appDate });
      return true;
    } catch (error) {
      toast.error(receiptError(error));
      return false;
    } finally {
      setBusy("idle");
    }
  }, [appDate, confirm, deleteMutation, scope]);

  // ── Walking the register ──────────────────────────────────────────────────
  const walk = useCallback(
    async (direction: "prev" | "next", filters?: { status?: string; fromDate?: string; toDate?: string }) => {
      const current = latest.current;
      if (current.dirty) {
        const ok = await confirm({
          title: direction === "prev" ? "Previous receipt?" : "Next receipt?",
          message: "This receipt has unsaved changes. Move on and lose them?",
          confirmLabel: "Move on",
        });
        if (!ok) {
          return;
        }
      }
      if (!current.header.voucherId) {
        if (direction === "next") {
          toast.info("There is no receipt after a blank screen — press F8 to pick one.");
          return;
        }
        // On an empty screen, Prev means "the latest receipt" — the one keyed
        // a minute ago, which is what the operator is reaching for.
        toast.info("Opening the latest receipt…");
      }
      setBusy("loading");
      try {
        const payload = await fetchAdjacent({
          voucherId: current.header.voucherId ?? "",
          companyId: scope.companyId,
          branchId: scope.branchId,
          accYear: scope.accYear,
          direction,
          ...(filters?.status ? { status: filters.status } : {}),
          ...(filters?.fromDate ? { fromDate: filters.fromDate } : {}),
          ...(filters?.toDate ? { toDate: filters.toDate } : {}),
        });
        if (!payload.voucher) {
          // An ANSWER, not a failure.
          toast.info(
            direction === "prev"
              ? "This is the earliest receipt in the register."
              : "This is the latest receipt in the register.",
          );
          return;
        }
        await openByKeys({
          avhVoucherId: payload.voucher.voucherId,
          // The WHOLE key comes back, so a receipt from another branch or year
          // opens correctly. The current scope is only the fallback.
          avhCompanyId: payload.voucher.companyId || scope.companyId,
          avhBranchId: payload.voucher.branchId || scope.branchId,
          avhAccYear: payload.voucher.accYear || scope.accYear,
        });
      } catch (error) {
        toast.error(receiptError(error));
      } finally {
        setBusy("idle");
      }
    },
    [confirm, fetchAdjacent, openByKeys, scope],
  );

  return {
    draft,
    dispatch,
    identity,
    masters,
    busy,
    canWrite,
    editable: isEditable(draft),
    identityHint: identityHint(identity),
    pickParty,
    setVoucherDate,
    reloadItems,
    openByKeys,
    newDocument,
    runDuplicateCheck,
    saveDraft,
    post,
    beginAmend,
    saveAmend,
    cancel,
    deleteDraft,
    walk,
  };
}
