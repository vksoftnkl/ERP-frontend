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
import type { DocumentRights } from "@/lib/permissions/document-rights";
import { useAppDispatch } from "@/store/hooks";
import { toast } from "@/lib/notify";
import { RESTORED_MESSAGE_OPTIONS, restoredMessage, screenMemory } from "@/lib/screen-memory";
import {
  useForgetIfWritingOnUnmount,
  useRecalledOnce,
  useRememberWrite,
  type ScreenMemoryOption,
} from "@/lib/use-screen-memory";
import { useGetTenderMastersQuery } from "@/store/api/saleOrderApi";
import {
  paymentApi,
  useAmendPaymentMutation,
  useCancelPaymentMutation,
  useDeletePaymentDraftMutation,
  useSaveAndPostPaymentMutation,
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
  buildPaymentSaveAndPostPayload,
} from "../payload/build";
import {
  billSideOfApplied,
  heldRowsFromApplied,
  linesFromLegs,
  parsePaymentLines,
  parsePaymentTenders,
  postedPaymentNotes,
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
  saveDraftDenial,
  withSeeded,
  type PaymentDraft,
  type PaymentDraftAction,
} from "./draft";
import {
  isVoucherWorthRemembering,
  isVoucherWriteInFlight,
  voucherScopeOf,
} from "@/features/accounts/receipt/state/memory";
import type { PaymentSnapshot } from "./memory";

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
  /** Create, Edit or Post — any writing right opens the entry (Qt `m_writeDenied`). */
  canWrite: boolean;
  /** Which verbs those rights allow: Save Draft and Post re-check them here. */
  rights: DocumentRights;
  confirm: (request: ConfirmRequest) => Promise<boolean>;
  prompt: (request: PromptRequest) => Promise<string | null>;
  /** Screen memory (lib/screen-memory) — passed by the menu route only, never a deep link. */
  memory?: ScreenMemoryOption;
};

export type UsePaymentDraft = ReturnType<typeof usePaymentDraft>;

export function usePaymentDraft(options: UsePaymentDraftOptions) {
  const { scope, appDate, settings, canWrite, rights, confirm, prompt, memory } = options;
  // The payment the operator left on this screen, when the page is reopening
  // on it. Read once; null for every fresh open.
  const recalled = useRecalledOnce<PaymentSnapshot>(memory, scope);
  const resumed = recalled !== null;
  const [draft, dispatch] = useReducer(
    reducerWithRefusal,
    undefined,
    () => recalled?.draft ?? initialPaymentDraft(scope, appDate),
  );
  const [busy, setBusy] = useState<PaymentBusy>("idle");
  // A write in flight (Qt `m_saving`). The keyboard reaches Save and Post
  // without the buttons' busy gate, and a second post of a NEW payment while
  // the first is out would be a second payment.
  const writing = useRef(false);

  const latest = useRef(draft);
  /** `busy` as last painted — what an unmount cleanup can still read. */
  const busyRef = useRef(busy);
  useEffect(() => {
    latest.current = draft;
    busyRef.current = busy;
  });

  // ── Screen memory ─────────────────────────────────────────────────────────
  // The receipt's: written through on every change, forgotten once nothing on
  // screen is unsaved, and forgotten when the screen goes with a write still
  // out — it lands after the screen is gone, and the payment must not come
  // back to be paid twice.
  const snapshot = useMemo<PaymentSnapshot>(() => ({ draft }), [draft]);
  useRememberWrite(memory, snapshot, {
    scopeOf: voucherScopeOf,
    shouldKeep: isVoucherWorthRemembering,
  });
  useForgetIfWritingOnUnmount(
    memory,
    () => writing.current || isVoucherWriteInFlight(busyRef.current),
    () => latest.current.header.scope,
  );

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
  const [saveAndPostMutation] = useSaveAndPostPaymentMutation();
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
  // Not dirty: an untouched row is furniture. A payment brought back from
  // screen memory counts as seeded: whatever rows it has are the operator's.
  const seededTender = useRef(resumed);
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
    if (writing.current) {
      return false;
    }
    if (!canWrite) {
      toast.error("You do not have rights to save on this screen.");
      return false;
    }
    // A posted payment being corrected has no draft to go back to.
    if (!isPaymentEditable(latest.current) || latest.current.amending) {
      return false;
    }
    // Create is the draft right, Edit for a saved one — F5 too, not just the button.
    const denied = saveDraftDenial(rights, Boolean(latest.current.header.voucherId));
    if (denied) {
      toast.warn(`${denied}.`);
      return false;
    }
    if (!reportProblems(validatePaymentBeforeSave(validationInput()))) {
      return false;
    }
    writing.current = true;
    setBusy("saving");
    try {
      await persistDraft();
      toast.success("Draft saved — nothing has been paid against any bill yet.");
      resetToNew();
      return true;
    } catch (error) {
      // A refusal saved nothing: the payment is still on the screen (Qt nexKeptLine).
      toast.apiError(error, { kept: "Payment not lost." });
      return false;
    } finally {
      writing.current = false;
      setBusy("idle");
    }
  }, [canWrite, persistDraft, reportProblems, resetToNew, rights, validationInput]);

  // ── Post ──────────────────────────────────────────────────────────────────
  /**
   * Post is ONE call (notes 106): `/payments/create` with `post: true` saves
   * and posts in one transaction, judged on the Post right alone — so a
   * Post-only user posts a NEW payment this way too. A refusal rolls the whole
   * thing back and leaves NOTHING on the server (no draft to delete again, no
   * id to forget), so the screen keeps every line as keyed for the operator
   * to correct.
   */
  const post = useCallback(async (): Promise<boolean> => {
    if (writing.current) {
      return false;
    }
    if (!canWrite) {
      toast.error("You do not have rights to post on this screen.");
      return false;
    }
    if (!isPaymentEditable(latest.current) || latest.current.amending) {
      return false;
    }
    // Post is the Post right (Qt, 2026-10-12); the amend has its own verb below.
    if (!rights.mayPost) {
      toast.warn("You may not post payments on this screen (no Post right).");
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
    // The dialog awaited: a second Post may have gone out meanwhile.
    if (writing.current) {
      return false;
    }

    writing.current = true;
    setBusy("posting");
    try {
      // What was validated and confirmed is what is sent.
      const payload = await saveAndPostMutation(
        buildPaymentSaveAndPostPayload({
          header: current.header,
          tenders: current.tenders,
          lines: current.lines,
          bills: current.bills,
          credits: current.credits,
          userId: getAuthUserId() ?? "",
        }),
      ).unwrap();

      // The id is adopted (a NEW payment got one only now), though the screen
      // is cleared straight after: the message below has already named it.
      const voucherId = payload.header?.avhVoucherId;
      if (voucherId) {
        dispatch({ type: "SAVED", voucherId, status: "POSTED" });
      }
      toast.success(postedPaymentNotes(payload).join(" "));
      resetToNew();
      return true;
    } catch (error) {
      if (statusOf(error) === 409) {
        // The server worked something out differently — a bill moved, the
        // TDS rate or the year's base changed, a book ran out. Show both.
        toast.apiError(error, {
          kept:
            `This screen made it ${formatTotal(figures.allocated)} allocated and ` +
            `${formatTotal(figures.onAccount)} on account. Press F6 to re-read the bills and try again.\n` +
            "Payment not lost.",
        });
      } else {
        toast.apiError(error, { kept: "Payment not lost." });
      }
      return false;
    } finally {
      writing.current = false;
      setBusy("idle");
    }
  }, [
    canWrite,
    confirm,
    reportProblems,
    resetToNew,
    rights,
    saveAndPostMutation,
    validationInput,
  ]);

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
    if (writing.current || !latest.current.amending) {
      return false;
    }
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
    if (!remark || !remark.trim() || writing.current) {
      return false;
    }
    writing.current = true;
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
      writing.current = false;
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

  // ── Back from screen memory ───────────────────────────────────────────────
  /**
   * The payment came back from screen memory: say so once, and re-read the
   * payee's context panels. Not the bills — `/open-items` replaces them and
   * every allocation with them (the receipt's `finishResume` says more).
   */
  const finishResume = useCallback(async () => {
    // One tick first: this runs from the mount effect, and a request fired
    // there is dropped by StrictMode's simulated unmount.
    await new Promise((resolve) => window.setTimeout(resolve, 0));
    toast.info(restoredMessage("payment"), RESTORED_MESSAGE_OPTIONS);
    const { header } = latest.current;
    if (!header.partyId || !header.scope.companyId) {
      return;
    }
    void fetchPartyContext({ partyId: header.partyId, companyId: header.scope.companyId })
      .then((context) =>
        dispatch({ type: "CONTEXT_LOADED", partyId: header.partyId, payload: context }),
      )
      // A failed re-read keeps the panels it came back with.
      .catch(() => undefined);
  }, [fetchPartyContext]);

  /** The operator discarded the payment: it must not come back. */
  const forgetRemembered = useCallback(() => {
    if (memory) {
      screenMemory.forget(memory.key, voucherScopeOf({ draft: latest.current }));
    }
  }, [memory]);

  return {
    draft,
    dispatch,
    identity,
    masters,
    busy,
    canWrite,
    editable: isPaymentEditable(draft),
    identityHint: paymentIdentityHint(identity),
    resumed,
    finishResume,
    forgetRemembered,
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
