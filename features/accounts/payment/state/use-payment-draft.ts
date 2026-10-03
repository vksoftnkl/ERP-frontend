"use client";

/**
 * The reducer, the queries, and the jobs that talk to `/payments` — the
 * receipt's `use-receipt-draft.ts` with the money going out.
 *
 * Nothing here computes money (`domain/` does, purely); this file sequences
 * calls, guards late answers and says what happened. The confirm and prompt
 * dialogs are INJECTED, and everything that reads state after one has
 * answered reads it from the ref — the receipt's file says why (a nested
 * dialog loop is what crashed the Qt screen).
 */
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { getAuthUserId } from "@/lib/auth/session";
import { useAppDispatch } from "@/store/hooks";
import { toast } from "@/lib/notify";
import { useGetTenderMastersQuery } from "@/store/api/saleOrderApi";
import {
  paymentApi,
  useAmendPaymentMutation,
  useCancelPaymentMutation,
  useDeletePaymentDraftMutation,
  usePostPaymentMutation,
  useSavePaymentDraftMutation,
} from "@/store/api/paymentApi";
import { receiptError as paymentError, statusOf } from "@/features/accounts/receipt/api-errors";
import { computeIdentity } from "@/features/accounts/receipt/domain/identity";
import { mergeDraftMemo } from "@/features/accounts/receipt/domain/merge-draft";
import { mergeForAmend } from "@/features/accounts/receipt/domain/merge-amend";
import { formatTotal } from "@/features/accounts/receipt/domain/money";
import { netAllocations } from "@/features/accounts/receipt/domain/net-allocations";
import {
  parseDraftCreditMemo,
  parseDraftMemo,
  parseHeader,
} from "@/features/accounts/receipt/payload/parse";
import { PAYMENT_SETTLEMENT } from "../domain/roles";
import { defaultPaymentTender, payableTenders, paymentTenderRowFrom } from "../domain/tenders";
import {
  buildPaymentAmendPayload,
  buildPaymentDraftPayload,
  buildPaymentPostPayload,
} from "../payload/build";
import {
  billSideOfApplied,
  heldRowsFromApplied,
  linesFromLegs,
  parsePaymentLines,
  parsePaymentTenders,
} from "../payload/parse";
import type { PaymentKeys, PaymentPayload, PaymentScope, PaymentSettings } from "../payment.types";
import {
  paymentIdentityHint,
  validatePaymentBeforePost,
  validatePaymentBeforeSave,
  type PaymentProblem,
} from "../validate";
import {
  initialPaymentDraft,
  isPaymentEditable,
  paidTotal,
  paymentDraftReducer,
  withSeeded,
  type PaymentDraft,
  type PaymentDraftAction,
} from "./draft";

/** `useReducer` over a reducer that also returns refusals and notes. */
function reducerWithRefusal(state: PaymentDraft, action: PaymentDraftAction): PaymentDraft {
  const result = paymentDraftReducer(state, action);
  if (result.refusal) {
    // `lib/notify` is a module-level queue, not React state, so raising here
    // is safe and a refusal cannot be dropped by a caller that forgot to look.
    toast.warn(result.refusal.message);
  } else if (result.note) {
    toast.info(result.note);
  }
  return result.draft;
}

export type PaymentBusy = "idle" | "loading" | "saving" | "posting" | "cancelling" | "deleting";

export type ConfirmRequest = { title: string; message: string; confirmLabel?: string };
export type PromptRequest = { title: string; message: string; placeholder?: string };

export type UsePaymentDraftOptions = {
  scope: PaymentScope;
  appDate: string;
  settings: PaymentSettings;
  canWrite: boolean;
  confirm: (request: ConfirmRequest) => Promise<boolean>;
  prompt: (request: PromptRequest) => Promise<string | null>;
};

export type UsePaymentDraft = ReturnType<typeof usePaymentDraft>;

export function usePaymentDraft(options: UsePaymentDraftOptions) {
  const { scope, appDate, settings, canWrite, confirm, prompt } = options;
  const [draft, dispatch] = useReducer(reducerWithRefusal, undefined, () =>
    initialPaymentDraft(scope, appDate),
  );
  const [busy, setBusy] = useState<PaymentBusy>("idle");

  const latest = useRef(draft);
  useEffect(() => {
    latest.current = draft;
  });

  // ── Reads go through `initiate` — see the receipt's note on lazy triggers ──
  const storeDispatch = useAppDispatch();
  const fetchOpenItems = useCallback(
    (args: { partyId: string; companyId: string; onDate?: string }) =>
      storeDispatch(
        paymentApi.endpoints.getPaymentOpenItems.initiate(args, {
          subscribe: false,
          forceRefetch: true,
        }),
      ).unwrap(),
    [storeDispatch],
  );
  const fetchPartyContext = useCallback(
    (args: { partyId: string; companyId: string }) =>
      storeDispatch(
        paymentApi.endpoints.getPaymentPartyContext.initiate(args, {
          subscribe: false,
          forceRefetch: true,
        }),
      ).unwrap(),
    [storeDispatch],
  );
  const fetchPayment = useCallback(
    (args: PaymentKeys) =>
      storeDispatch(
        paymentApi.endpoints.getPayment.initiate(args, { subscribe: false, forceRefetch: true }),
      ).unwrap(),
    [storeDispatch],
  );
  const fetchAdjacent = useCallback(
    (args: Parameters<typeof paymentApi.endpoints.getAdjacentPayment.initiate>[0]) =>
      storeDispatch(
        paymentApi.endpoints.getAdjacentPayment.initiate(args, {
          subscribe: false,
          forceRefetch: true,
        }),
      ).unwrap(),
    [storeDispatch],
  );
  const checkDuplicate = useCallback(
    (args: Parameters<typeof paymentApi.endpoints.checkDuplicatePayment.initiate>[0]) =>
      storeDispatch(
        paymentApi.endpoints.checkDuplicatePayment.initiate(args, {
          subscribe: false,
          forceRefetch: true,
        }),
      ).unwrap(),
    [storeDispatch],
  );
  const [saveDraftMutation] = useSavePaymentDraftMutation();
  const [postMutation] = usePostPaymentMutation();
  const [amendMutation] = useAmendPaymentMutation();
  const [cancelMutation] = useCancelPaymentMutation();
  const [deleteMutation] = useDeletePaymentDraftMutation();

  // ── The tenders on offer: cash, bank, cheque, UPI — on the PAYMENT's date ──
  const { data: tenderMasters, isError: tendersFailed } = useGetTenderMastersQuery();
  const masters = useMemo(
    () => payableTenders(tenderMasters ?? [], draft.header.voucherDate || appDate),
    [tenderMasters, draft.header.voucherDate, appDate],
  );

  const identity = useMemo(
    () =>
      computeIdentity(
        {
          bills: draft.bills,
          credits: draft.credits,
          tenders: draft.tenders,
          otherLines: draft.lines,
        },
        PAYMENT_SETTLEMENT,
      ),
    [draft.bills, draft.credits, draft.tenders, draft.lines],
  );

  // ── A fresh payment starts with one instrument on the default tender ──────
  // Not dirty: an untouched row is furniture.
  const seededTender = useRef(false);
  useEffect(() => {
    if (draft.tenders.length > 0 || masters.length === 0 || draft.header.voucherId) {
      return;
    }
    if (seededTender.current) {
      return;
    }
    const master = defaultPaymentTender(masters);
    if (!master) {
      return;
    }
    seededTender.current = true;
    dispatch({
      type: "REPLACE_DOCUMENT",
      draft: { ...latest.current, tenders: [paymentTenderRowFrom(master)] },
    });
  }, [masters, draft.tenders.length, draft.header.voucherId]);

  useEffect(() => {
    if (tendersFailed) {
      dispatch({
        type: "NOTICE",
        notice:
          "The tender master could not be read, so nothing can be paid. A payment cannot fall " +
          "back to a hand-made cash row: the tender's own ledger is what the posting engine credits.",
      });
    } else if (tenderMasters && masters.length === 0) {
      dispatch({
        type: "NOTICE",
        notice:
          "No cash, bank, cheque or UPI tender is configured for this date — add one in the " +
          "Tender Master before paying.",
      });
    }
  }, [tendersFailed, tenderMasters, masters.length]);

  // ── Loading a payee ───────────────────────────────────────────────────────
  const loadParty = useCallback(
    (partyId: string, onDateOverride?: string) => {
      if (!partyId || !scope.companyId) {
        return;
      }
      const onDate = onDateOverride || latest.current.header.voucherDate || appDate;
      setBusy("loading");
      void Promise.allSettled([
        fetchOpenItems({ partyId, companyId: scope.companyId, onDate })
          .then((payload) => dispatch({ type: "OPEN_ITEMS_LOADED", partyId, payload }))
          .catch((error: unknown) => toast.error(paymentError(error))),
        fetchPartyContext({ partyId, companyId: scope.companyId })
          .then((payload) => dispatch({ type: "CONTEXT_LOADED", partyId, payload }))
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
          title: "Change the payee?",
          message:
            `What is allocated belongs to ${current.header.partyName || "this party"}'s bills ` +
            "and will be cleared.",
          confirmLabel: "Change payee",
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

  /** F6 — somebody may have paid against these bills meanwhile. */
  const reloadItems = useCallback(() => {
    const partyId = latest.current.header.partyId;
    if (partyId && isPaymentEditable(latest.current)) {
      loadParty(partyId);
    }
  }, [loadParty]);

  /**
   * The date ages the cash discount, decides what is overdue, picks the TDS
   * rate in force and the TDS year, and decides which tenders are offered —
   * so moving it re-reads the open items. On the edit, not in an effect: a
   * loaded document's own date must not trigger a re-read.
   */
  const setVoucherDate = useCallback(
    (voucherDate: string) => {
      const current = latest.current;
      dispatch({ type: "SET_HEADER", patch: { voucherDate } });
      if (voucherDate && current.header.partyId && current.itemsLoaded && isPaymentEditable(current)) {
        loadParty(current.header.partyId, voucherDate);
      }
    },
    [loadParty],
  );

  // ── Painting a loaded payment ─────────────────────────────────────────────
  const paintPayment = useCallback(
    async (payload: PaymentPayload) => {
      const header = parseHeader(payload.header, scope);
      const isDraft = header.status === "DRAFT";
      const tenders = parsePaymentTenders(payload.tenders, payload.chequesIssued);
      const base: PaymentDraft = {
        ...initialPaymentDraft(header.scope, header.voucherDate),
        header,
        tenders,
        baseRevision: header.revisionNo,
      };

      if (!isDraft) {
        // What a POSTED payment shows is what it DID: its bills from the
        // adjustment history (the held debits it spent folded in), its role
        // lines off its legs (`otherLines` is empty once posted), and the
        // party's facts NOT LOADED, so nothing announces "not bill by bill"
        // over a screen full of its bills.
        const bills = netAllocations([
          ...(payload.allocations ?? []),
          ...billSideOfApplied(payload.creditsApplied),
        ]);
        const posted = withSeeded({
          ...base,
          bills,
          credits: heldRowsFromApplied(payload.creditsApplied),
          lines: linesFromLegs(payload.legs, bills),
          itemsLoaded: false,
        });
        dispatch({ type: "REPLACE_DOCUMENT", draft: posted });
        if (header.partyId && header.scope.companyId) {
          void fetchPartyContext({ partyId: header.partyId, companyId: header.scope.companyId })
            .then((context) =>
              dispatch({ type: "CONTEXT_LOADED", partyId: header.partyId, payload: context }),
            )
            .catch(() => dispatch({ type: "CONTEXT_FAILED" }));
        }
        return;
      }

      // A DRAFT touched no bill: /open-items is the truth and the memo is
      // clamped onto it.
      dispatch({
        type: "REPLACE_DOCUMENT",
        draft: { ...base, lines: parsePaymentLines(payload.otherLines) },
      });
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
        toast.error(paymentError(error));
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
    async (keys: PaymentKeys) => {
      setBusy("loading");
      try {
        const payload = await fetchPayment(keys);
        await paintPayment(payload);
      } catch (error) {
        toast.error(paymentError(error));
      } finally {
        setBusy("idle");
      }
    },
    [fetchPayment, paintPayment],
  );

  const resetToNew = useCallback(() => {
    seededTender.current = false;
    dispatch({ type: "NEW_DOCUMENT", scope, voucherDate: appDate });
  }, [appDate, scope]);

  const newDocument = useCallback(async (): Promise<boolean> => {
    if (latest.current.dirty) {
      const ok = await confirm({
        title: "Start a new payment?",
        message: "This payment has unsaved changes. Start a new one and lose them?",
        confirmLabel: "Start new",
      });
      if (!ok) {
        return false;
      }
    }
    resetToNew();
    return true;
  }, [confirm, resetToNew]);

  // ── The duplicate guard ───────────────────────────────────────────────────
  const runDuplicateCheck = useCallback(async () => {
    const current = latest.current;
    const amount = paidTotal(current);
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
          `${formatTotal(amount)} has already been paid to ` +
          `${current.header.partyName || "this party"} today — ${named}. Post this one too only ` +
          "if it really is a second payment.",
      });
    } catch {
      // A guard that cannot answer must not get in the way.
    }
  }, [checkDuplicate]);

  // ── Save ──────────────────────────────────────────────────────────────────
  const persistDraft = useCallback(async (): Promise<string | null> => {
    const current = latest.current;
    const body = buildPaymentDraftPayload({
      header: current.header,
      tenders: current.tenders,
      lines: current.lines,
      bills: current.bills,
      credits: current.credits,
      userId: getAuthUserId() ?? "",
    });
    const payload = await saveDraftMutation(body).unwrap();
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
      lines: latest.current.lines,
      party: latest.current.party,
      settings,
      masters,
    }),
    [masters, settings],
  );

  const reportProblems = useCallback((problems: PaymentProblem[]): boolean => {
    dispatch({ type: "PROBLEMS", problems });
    if (problems.length > 0) {
      toast.error(problems[0].message);
      return false;
    }
    return true;
  }, []);

  /** Save the draft and PUT IT DOWN — the next payment is not keyed on top of it. */
  const saveDraft = useCallback(async (): Promise<boolean> => {
    if (!canWrite) {
      toast.error("You do not have rights to save on this screen.");
      return false;
    }
    if (!isPaymentEditable(latest.current)) {
      return false;
    }
    if (!reportProblems(validatePaymentBeforeSave(validationInput()))) {
      return false;
    }
    setBusy("saving");
    try {
      await persistDraft();
      toast.success("Draft saved — nothing has been paid against any bill yet.");
      resetToNew();
      return true;
    } catch (error) {
      toast.error(paymentError(error));
      return false;
    } finally {
      setBusy("idle");
    }
  }, [canWrite, persistDraft, reportProblems, resetToNew, validationInput]);

  // ── Post ──────────────────────────────────────────────────────────────────
  const post = useCallback(async (): Promise<boolean> => {
    if (!canWrite) {
      toast.error("You do not have rights to post on this screen.");
      return false;
    }
    if (!reportProblems(validatePaymentBeforePost(validationInput()))) {
      return false;
    }
    const current = latest.current;
    const figures = computeIdentity(
      {
        bills: current.bills,
        credits: current.credits,
        tenders: current.tenders,
        otherLines: current.lines,
      },
      PAYMENT_SETTLEMENT,
    );
    if (figures.onAccount > 0) {
      const ok = await confirm({
        title: "Keep it on account?",
        message:
          `${formatTotal(figures.onAccount)} of this payment is not against any bill. It will be ` +
          `held on account as an advance to ${current.header.partyName || "this party"}, and can ` +
          "be spent on their next bill.",
        confirmLabel: "Keep on account",
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
        toast.error("The draft has no id yet, so there is nothing to post. Save it again.");
        return false;
      }
      const after = latest.current;
      const payload = await postMutation(
        buildPaymentPostPayload({
          header: { ...after.header, voucherId },
          bills: after.bills,
          credits: after.credits,
          tenders: after.tenders,
          lines: after.lines,
          userId: getAuthUserId() ?? "",
        }),
      ).unwrap();

      const refno = payload.header?.avhVoucherRefno ?? "";
      const notes: string[] = [`Payment ${refno || "(unnumbered)"} posted.`];
      for (const cheque of payload.cheques ?? []) {
        notes.push(
          `Row ${cheque.tdRowNo}: cheque leaf ${cheque.leaf}` +
            `${cheque.bookNo ? ` from book ${cheque.bookNo}` : ""}.`,
        );
      }
      const pdcCount = (payload.pdcVouchers ?? []).length;
      if (pdcCount > 0) {
        notes.push(
          `${pdcCount} post-dated cheque(s) got their own voucher — the bills they cover settle ` +
            "on the cheque's date.",
        );
      }
      if (payload.totalOnAccount > 0) {
        notes.push(`${formatTotal(payload.totalOnAccount)} is on account as an advance.`);
      }
      toast.success(notes.join(" "));
      resetToNew();
      return true;
    } catch (error) {
      if (statusOf(error) === 409) {
        // The server worked something out differently — a bill moved, the
        // TDS rate or the year's base changed, a book ran out. Show both.
        toast.error(
          `${paymentError(error)} This screen made it ${formatTotal(figures.allocated)} ` +
            `allocated and ${formatTotal(figures.onAccount)} on account. Press F6 to re-read ` +
            "the bills and try again.",
        );
      } else {
        toast.error(paymentError(error));
      }
      return false;
    } finally {
      setBusy("idle");
    }
  }, [canWrite, confirm, persistDraft, postMutation, reportProblems, resetToNew, validationInput]);

  // ── Amend ─────────────────────────────────────────────────────────────────
  const beginAmend = useCallback(async () => {
    const current = latest.current;
    if (current.header.status !== "POSTED" || !current.header.voucherId) {
      return;
    }
    const ok = await confirm({
      title: "Correct this posted payment?",
      message:
        "It keeps its number, and the change is recorded against it. A cheque on it takes a NEW " +
        "leaf; the old one stays used. This is not a cancellation — nothing is reversed until you " +
        "save the correction.",
      confirmLabel: "Correct it",
    });
    if (!ok) {
      return;
    }
    setBusy("loading");
    try {
      const baseline = latest.current.bills;
      const baselineCredits = latest.current.credits.map((credit) => ({
        billId: credit.billId,
        billAccYear: credit.billAccYear,
        amount: credit.apply,
      }));
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
        baselineCredits,
        voucherId: current.header.voucherId,
      });
      dispatch({ type: "BEGIN_AMEND", bills: merged.bills, credits: merged.credits });
      if (merged.notes.length > 0) {
        dispatch({ type: "NOTICE", notice: merged.notes.join(" ") });
      }
    } catch (error) {
      toast.error(paymentError(error));
    } finally {
      setBusy("idle");
    }
  }, [confirm, fetchOpenItems]);

  const saveAmend = useCallback(async (): Promise<boolean> => {
    if (!reportProblems(validatePaymentBeforePost(validationInput()))) {
      return false;
    }
    const remark = await prompt({
      title: "Why is it being corrected?",
      message:
        "It keeps its number and no reversal voucher is written, so this remark is the trail. " +
        "It goes on the status log and on every audit row the correction writes.",
      placeholder: "e.g. cheque number keyed wrong",
    });
    if (!remark || !remark.trim()) {
      return false;
    }
    setBusy("saving");
    try {
      const current = latest.current;
      const payload = await amendMutation(
        buildPaymentAmendPayload({
          header: current.header,
          tenders: current.tenders,
          lines: current.lines,
          bills: current.bills,
          credits: current.credits,
          userId: getAuthUserId() ?? "",
          baseRevision: current.baseRevision,
          editRemark: remark,
        }),
      ).unwrap();
      toast.success(
        `Payment ${payload.header?.avhVoucherRefno ?? ""} was corrected. It keeps its number; ` +
          `this is revision ${payload.toRevision}.`,
      );
      dispatch({ type: "END_AMEND" });
      resetToNew();
      return true;
    } catch (error) {
      if (statusOf(error) === 409) {
        // The lock did its job: reload rather than retry with the server's number.
        toast.error(`${paymentError(error)} Reopen the payment before correcting it again.`);
      } else {
        toast.error(paymentError(error));
      }
      return false;
    } finally {
      setBusy("idle");
    }
  }, [amendMutation, prompt, reportProblems, resetToNew, validationInput]);

  // ── Cancel and delete ─────────────────────────────────────────────────────
  const cancel = useCallback(async (): Promise<boolean> => {
    const current = latest.current;
    if (current.header.status !== "POSTED" || !current.header.voucherId) {
      return false;
    }
    const reason = await prompt({
      title: `Cancel payment ${current.header.voucherRefno ?? ""}?`,
      message:
        "It will be reversed: every bill it paid reopens, any cheque still HELD is cancelled " +
        "(its leaf stays used), and a reversing voucher is posted. Nothing is deleted. Why is it " +
        "being cancelled?",
      placeholder: "e.g. paid to the wrong party",
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
        `Payment ${current.header.voucherRefno ?? ""} cancelled and reversed.` +
          (reopened > 0 ? ` ${reopened} bill(s) are open again.` : ""),
      );
      resetToNew();
      return true;
    } catch (error) {
      // A cheque past HELD, a transfer the bank has settled, a spent advance or
      // a TDS already deposited — the server's sentence says which.
      toast.error(paymentError(error));
      return false;
    } finally {
      setBusy("idle");
    }
  }, [cancelMutation, prompt, resetToNew]);

  const deleteDraft = useCallback(async (): Promise<boolean> => {
    const current = latest.current;
    if (current.header.status !== "DRAFT" || !current.header.voucherId) {
      return false;
    }
    const ok = await confirm({
      title: "Delete the draft?",
      message:
        `A draft of ${current.header.partyName || "this party"} has no number and has touched ` +
        "no bill, so nothing is reversed and no ledger moves. This cannot be undone.",
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
      resetToNew();
      return true;
    } catch (error) {
      toast.error(paymentError(error));
      return false;
    } finally {
      setBusy("idle");
    }
  }, [confirm, deleteMutation, resetToNew]);

  // ── Walking the register ──────────────────────────────────────────────────
  const walk = useCallback(
    async (
      direction: "prev" | "next",
      filters?: { status?: string; fromDate?: string; toDate?: string },
    ) => {
      const current = latest.current;
      if (current.dirty) {
        const ok = await confirm({
          title: direction === "prev" ? "Previous payment?" : "Next payment?",
          message: "This payment has unsaved changes. Move on and lose them?",
          confirmLabel: "Move on",
        });
        if (!ok) {
          return;
        }
      }
      if (!current.header.voucherId) {
        if (direction === "next") {
          toast.info("There is no payment after a blank screen — press F8 to pick one.");
          return;
        }
        toast.info("Opening the latest payment…");
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
          toast.info(
            direction === "prev"
              ? "This is the earliest payment in the register."
              : "This is the latest payment in the register.",
          );
          return;
        }
        await openByKeys({
          avhVoucherId: payload.voucher.voucherId,
          avhCompanyId: payload.voucher.companyId || scope.companyId,
          avhBranchId: payload.voucher.branchId || scope.branchId,
          avhAccYear: payload.voucher.accYear || scope.accYear,
        });
      } catch (error) {
        toast.error(paymentError(error));
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
    editable: isPaymentEditable(draft),
    identityHint: paymentIdentityHint(identity),
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
