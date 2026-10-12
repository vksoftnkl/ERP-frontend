"use client";

/**
 * The expense voucher's whole lifecycle in one hook: the draft, the three pick
 * lists, the server's check 400 ms after each edit, and draft → post → cancel.
 * The screen renders what this returns and calls what it exposes; it decides
 * nothing about the document itself.
 *
 * Qt `ExpenseVoucherEntry` (d97cdd4), verb for verb:
 *   startNew      F2          a NEW voucher, one empty line, one tender on cash
 *                             that takes the balance until its amount is typed
 *   saveDraft     F5          POST create (a DRAFT; with voucherId an edit of it)
 *   post          Ctrl+Enter  POST create, then POST post by the key — the number
 *                             is issued at post; a failed post leaves the draft saved
 *   cancelVoucher      POST cancel with a reason (a POSTED voucher only)
 *   validate           POST validate, debounced 400 ms, the older answer
 *                      discarded; asked only while `problem` is empty
 */
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { useAppDispatch } from "@/store/hooks";
import { toast } from "@/lib/notify";
import type { DocumentRights } from "@/lib/permissions/document-rights";
import { useGetTenderMastersQuery } from "@/store/api/saleOrderApi";
import { useGetVoucherTaxRatesQuery } from "@/store/api/vouchersApi";
import { expenseApi, useExpenseReasonRowsQuery, useExpenseStateRowsQuery } from "../api/expense-api";
import { expenseError } from "../api-errors";
import type {
  ExpenseHeaderDraft,
  ExpenseKeys,
  ExpenseLineDraft,
  ExpensePayload,
  ExpenseScope,
  ExpenseTenderDraft,
  ExpenseTillSession,
} from "../expense.types";
import {
  cellAfterPick,
  expenseDraftReducer,
  isBlankLine,
  isBlankTender,
  isEditable,
  ledgerPickPatch,
  newDraft,
  reasonPickPatch,
  reenterCopy,
  withAutoTender,
} from "../domain/draft";
import { formatPaise, paiseOfNumber, paiseOfText, paiseToDecimal, sumPaise, tidyAmountText } from "../domain/money";
import { draftOfVoucher, readValidate, readVoucher } from "../domain/parse";
import {
  bodyKeyOf,
  buildExpenseBody,
  expensePostProblem,
  expenseProblem,
  linesKeyOf,
} from "../domain/payload";
import {
  cashTenderOf,
  expenseTenderOptions,
  placeOfSupplyOf,
  rateOptions,
  readLedgerPick,
  readReasonPick,
  reasonNamesFromRows,
  stateLabel,
  stateNamesFromRows,
} from "../domain/pickers";
import { autoTenderTotalPaise, buildExpenseView, type ExpenseAnswer } from "../domain/view";

/** Qt's `m_validateTimer` interval. */
export const VALIDATE_DEBOUNCE_MS = 400;

type Request<T> = { unwrap: () => Promise<T>; abort: () => void; reset: () => void };

/** One request, its result dropped from the store once read. */
async function settle<T>(request: Request<T>): Promise<T> {
  try {
    return await request.unwrap();
  } finally {
    request.reset();
  }
}

function isAbort(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    ((error as { name?: unknown }).name === "AbortError" || (error as { error?: unknown }).error === "AbortError")
  );
}

function keysOf(voucher: ExpensePayload): ExpenseKeys {
  return {
    companyId: voucher.companyId,
    branchId: voucher.branchId,
    accYear: voucher.accYear,
    voucherId: voucher.voucherId,
  };
}

export type UseExpenseVoucherOptions = {
  /** The header's business context: where a NEW voucher is written. */
  scope: ExpenseScope;
  /** Set when the screen opens one voucher by its four keys. */
  initialKeys?: ExpenseKeys;
  today: string;
  session: ExpenseTillSession | null;
  rights: DocumentRights;
};

export function useExpenseVoucher({ scope, initialKeys, today, session, rights }: UseExpenseVoucherOptions) {
  const dispatch = useAppDispatch();
  const [typed, dispatchDraft] = useReducer(expenseDraftReducer, today, (day: string) => newDraft(day));
  const [answer, setAnswer] = useState<ExpenseAnswer | null>(null);
  const [validateError, setValidateError] = useState<{ bodyKey: string; message: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  // The screen is keyed on the document, so the keys it opens on never change
  // for the life of this hook.
  const [openKeys] = useState(initialKeys);
  const [loading, setLoading] = useState(Boolean(initialKeys));
  const [loadError, setLoadError] = useState<string | null>(null);

  // The company / branch the pick lists and the tenders are for: the open
  // voucher's own, else the header's.
  // The open voucher's own (its keys, or the keys it is being read by); a NEW
  // one — started here, or after a save cleared the screen — the header's.
  const docCompanyId = typed.keys?.companyId ?? (loading ? openKeys?.companyId : undefined) ?? scope.companyId;
  const docBranchId = typed.keys?.branchId ?? (loading ? openKeys?.branchId : undefined) ?? scope.branchId;

  // ── the tenders: CASH / BANK / UPI live on the voucher date ─────────────
  const { data: tenderMasters, isError: tendersFailed } = useGetTenderMastersQuery();
  const tenderOptions = useMemo(
    () => expenseTenderOptions(tenderMasters ?? [], typed.header.voucherDate || today, docCompanyId, docBranchId),
    [tenderMasters, typed.header.voucherDate, today, docCompanyId, docBranchId],
  );
  const cashTenderId = cashTenderOf(tenderOptions)?.tenderId ?? "";
  // The masters can land after the voucher was started: its first tender
  // then goes on cash (Qt `loadPickers`), without marking anything typed.
  const awaitingCash =
    typed.status === null && Boolean(typed.tenders[0]?.autoAmount) && !typed.tenders[0]?.tenderId;
  useEffect(() => {
    if (awaitingCash && cashTenderId) {
      dispatchDraft({ type: "DEFAULT_CASH", tenderId: cashTenderId });
    }
  }, [awaitingCash, cashTenderId]);
  // The first tender of a NEW voucher follows the total until its amount is typed.
  const autoTotal = useMemo(() => autoTenderTotalPaise(typed, answer), [typed, answer]);
  const draft = useMemo(() => withAutoTender(typed, autoTotal), [typed, autoTotal]);
  // Nothing is typed into a voucher that is still being read.
  const editable = isEditable(draft.status) && !loading;

  useEffect(() => {
    if (tendersFailed) {
      toast.error("The Tender Master could not be read, so the voucher cannot be paid. Reload to try again.", {
        toastId: "expense-tenders",
      });
    }
  }, [tendersFailed]);

  // ── the lookups (Qt `loadPickers`) ──────────────────────────────────────
  // The GST rates for the line's GST cell; the reason names a loaded voucher's
  // reason id is shown by (grid 155); the states for the place of supply.
  const { data: ratePayload, isError: ratesFailed } = useGetVoucherTaxRatesQuery(
    { companyId: docCompanyId },
    { skip: !docCompanyId },
  );
  const rates = useMemo(() => rateOptions(ratePayload?.rates), [ratePayload]);
  const { data: reasonRows } = useExpenseReasonRowsQuery({ companyId: docCompanyId }, { skip: !docCompanyId });
  const reasonNames = useMemo(() => reasonNamesFromRows(reasonRows ?? []), [reasonRows]);
  const { data: stateRows } = useExpenseStateRowsQuery();
  const stateNames = useMemo(() => stateNamesFromRows(stateRows ?? []), [stateRows]);

  // ── the body, and why it cannot go yet ──────────────────────────────────
  const bodyInput = useMemo(
    () => ({ draft, scope, tenders: tenderOptions, session }),
    [draft, scope, tenderOptions, session],
  );
  const body = useMemo(() => buildExpenseBody(bodyInput), [bodyInput]);
  const bodyKey = useMemo(() => bodyKeyOf(body), [body]);
  const linesKey = useMemo(() => linesKeyOf(body), [body]);
  const problem = useMemo(() => expenseProblem(bodyInput), [bodyInput]);
  const postProblem = useMemo(() => expensePostProblem(bodyInput), [bodyInput]);

  // ── showing a voucher the server answered with ──────────────────────────
  // The GSTIN last filled from the party ledger: a GSTIN the operator typed
  // is never overwritten, one filled for the previous party is (Qt `m_autoGstin`).
  const autoGstinRef = useRef("");
  const showVoucher = useCallback(
    (voucher: ExpensePayload) => {
      dispatchDraft({ type: "RESET", draft: draftOfVoucher(voucher, today) });
      autoGstinRef.current = "";
      // The saved figures, at once — not a check: a draft is validated for
      // real (below) before Post may go.
      setAnswer({
        kind: "saved",
        bodyKey: "",
        linesKey: "",
        payload: { ok: false, derived: voucher.derived, refusals: [], warnings: [], approval: null },
      });
      setValidateError(null);
    },
    [today],
  );

  // ── the open-by-keys read ───────────────────────────────────────────────
  useEffect(() => {
    if (!openKeys) {
      return undefined;
    }
    let cancelled = false;
    const request = dispatch(expenseApi.endpoints.expenseGet.initiate(openKeys));
    settle(request)
      .then((raw) => {
        if (!cancelled) showVoucher(readVoucher(raw));
      })
      .catch((error: unknown) => {
        if (!cancelled && !isAbort(error)) {
          const message = expenseError(error);
          setLoadError(message);
          toast.error(message);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
      request.abort();
    };
  }, [dispatch, openKeys, showVoucher]);

  // ── the server's check, 400 ms after each edit ──────────────────────────
  // The body is read through a ref when the timer fires: keying the effect on
  // the body's STRING means a re-render that changed nothing (a keystroke in
  // an empty row) neither restarts the wait nor re-asks.
  const latest = useRef({ body, bodyKey, linesKey });
  useEffect(() => {
    latest.current = { body, bodyKey, linesKey };
  }, [body, bodyKey, linesKey]);
  const alreadyChecked = answer?.kind === "validated" && answer.bodyKey === bodyKey;
  const erroredForBody = validateError !== null && validateError.bodyKey === bodyKey;
  /** A check is due or in flight for what is on screen now. */
  const checking = editable && !problem && !loading && !alreadyChecked && !erroredForBody;

  useEffect(() => {
    if (!checking) {
      return undefined;
    }
    let request: Request<unknown> | null = null;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      const { body: sentBody, bodyKey: sentKey, linesKey: sentLinesKey } = latest.current;
      request = dispatch(expenseApi.endpoints.expenseValidate.initiate(sentBody));
      settle(request)
        .then((raw) => {
          if (cancelled || latest.current.bodyKey !== sentKey) return; // an older answer
          setAnswer({ kind: "validated", bodyKey: sentKey, linesKey: sentLinesKey, payload: readValidate(raw) });
          setValidateError(null);
        })
        .catch((error: unknown) => {
          if (cancelled || isAbort(error) || latest.current.bodyKey !== sentKey) return;
          // No answer stands now: Post waits for a good one.
          setAnswer(null);
          setValidateError({ bodyKey: sentKey, message: expenseError(error) });
        });
    }, VALIDATE_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      request?.abort();
    };
  }, [bodyKey, checking, dispatch]);

  // ── what the screen shows ───────────────────────────────────────────────
  const currentError = validateError && validateError.bodyKey === bodyKey ? validateError.message : null;
  const view = useMemo(
    () =>
      buildExpenseView({
        draft,
        answer,
        currentBodyKey: bodyKey,
        currentLinesKey: linesKey,
        validateError: currentError,
        session,
        tenders: tenderOptions,
      }),
    [answer, bodyKey, currentError, draft, linesKey, session, tenderOptions],
  );

  // The place of supply as shown: the operator's pick, else the GSTIN's
  // state, else — for a bill whose GSTIN names none — what the server worked out.
  const placeOfSupply = useMemo(() => {
    const own = placeOfSupplyOf(draft.header);
    const code = own || (draft.header.gstBill && view.linesFresh ? answer?.payload.derived.placeOfSupplyCode ?? "" : "");
    return code ? { id: code, text: stateLabel(code, stateNames) } : null;
  }, [answer, draft.header, stateNames, view.linesFresh]);

  const checked = answer?.kind === "validated" && view.fresh;
  const refused = checked && (answer?.payload.refusals.length ?? 0) > 0;
  const saved = draft.keys !== null;
  const canSave = editable && !problem && !busy && !loading && rights.maySaveDraft(saved);
  const canPost =
    editable && !postProblem && !busy && !loading && checked && !refused && !checking && rights.mayPost;
  // Why Post is shut, in Qt's order: what is missing on screen, then the server.
  const postHint = postProblem
    ? postProblem
    : refused
      ? "The server refuses it as it is — see the red list"
      : !checked || checking
        ? "Waiting for the server's check"
        : !rights.mayPost
          ? "You may not post an expense voucher (menu 277)"
          : "";
  const showCancel = draft.status === "POSTED";
  const canCancel = showCancel && !busy && rights.mayCancelDocument(true);
  // Cancel & re-enter writes a new voucher too: it needs both rights.
  const canCancelReenter = canCancel && rights.maySaveDraft(false);

  // ── the verbs ───────────────────────────────────────────────────────────
  // A ref as well as the state: two F10s in one frame must not post twice.
  const beginBusy = useCallback(() => {
    if (busyRef.current) return false;
    busyRef.current = true;
    setBusy(true);
    return true;
  }, []);
  const endBusy = useCallback(() => {
    busyRef.current = false;
    setBusy(false);
  }, []);

  const startNew = useCallback(() => {
    dispatchDraft({ type: "RESET", draft: newDraft(today, cashTenderId) });
    autoGstinRef.current = "";
    setAnswer(null);
    setValidateError(null);
    setLoadError(null);
  }, [cashTenderId, today]);

  const save = useCallback(
    async (thenPost: boolean): Promise<boolean> => {
      const why = thenPost ? postProblem : problem;
      if (why) {
        toast.warn(why);
        return false;
      }
      if (!beginBusy()) {
        return false;
      }
      try {
        let savedVoucher: ExpensePayload;
        try {
          savedVoucher = readVoucher(await settle(dispatch(expenseApi.endpoints.expenseCreate.initiate(body))));
        } catch (error) {
          toast.error(expenseError(error));
          return false;
        }
        if (!thenPost) {
          // Saved: the screen starts the next one; the draft reopens from the list.
          const paid = sumPaise(draft.tenders.map((row) => paiseOfText(row.amount)));
          startNew();
          toast.success(`Draft saved — ${formatPaise(paid)}. Open it from F8 List to change or post it.`);
          return true;
        }
        try {
          const posted = readVoucher(
            await settle(dispatch(expenseApi.endpoints.expensePost.initiate(keysOf(savedVoucher)))),
          );
          // Posted: the screen is ready for the next one.
          startNew();
          const notes = posted.warnings.map((warning) => warning.message);
          const message =
            `Expense ${posted.voucherNo ?? ""} posted — ${formatPaise(paiseOfNumber(posted.amount))}.` +
            (notes.length > 0 ? `\n\n${notes.join("\n")}` : "");
          if (notes.length > 0) {
            toast.info(message);
          } else {
            toast.success(message);
          }
          return true;
        } catch (error) {
          // The draft stays saved: fix it and post again.
          showVoucher(savedVoucher);
          toast.error(expenseError(error));
          return false;
        }
      } finally {
        endBusy();
      }
    },
    [beginBusy, body, dispatch, draft.tenders, endBusy, postProblem, problem, showVoucher, startNew],
  );

  const saveDraft = useCallback(() => save(false), [save]);
  const post = useCallback(() => save(true), [save]);

  /**
   * Cancel a POSTED voucher (a mirror in the Rev series). With `reenter` —
   * Qt 5e25760 "Cancel & re-enter" — its copy then opens as a NEW voucher to
   * correct and post; the result names the copy's first line, for the caret.
   */
  const cancelVoucher = useCallback(
    async (reason: string, reenter = false): Promise<{ ok: boolean; firstLineKey?: string }> => {
      const keys = draft.keys;
      if (draft.status !== "POSTED" || !keys || !reason.trim()) {
        return { ok: false };
      }
      if (reenter ? !canCancelReenter : !canCancel) {
        return { ok: false };
      }
      if (!beginBusy()) {
        return { ok: false };
      }
      // What the copy starts from — taken now, before the answer repaints the screen.
      const copy = reenter ? reenterCopy(draft, today, reasonNames) : null;
      try {
        const cancelled = readVoucher(
          await settle(dispatch(expenseApi.endpoints.expenseCancel.initiate({ ...keys, reason: reason.trim() }))),
        );
        const voucherNo = cancelled.voucherNo ?? draft.voucherNo ?? "";
        if (!copy) {
          showVoucher(cancelled);
          toast.success(`Expense ${voucherNo} cancelled — a mirror voucher in the Rev series reverses it.`);
          return { ok: true };
        }
        dispatchDraft({ type: "RESET", draft: copy });
        autoGstinRef.current = "";
        setAnswer(null);
        setValidateError(null);
        toast.info(`Expense ${voucherNo} cancelled. Its copy is open as a new voucher — correct it and post.`);
        return { ok: true, firstLineKey: copy.lines[0]?.key };
      } catch (error) {
        toast.error(expenseError(error));
        return { ok: false };
      } finally {
        endBusy();
      }
    },
    [beginBusy, canCancel, canCancelReenter, dispatch, draft, endBusy, reasonNames, showVoucher, today],
  );

  const setHeader = useCallback((patch: Partial<ExpenseHeaderDraft>) => {
    dispatchDraft({ type: "SET_HEADER", patch });
  }, []);

  // ── party → GSTIN → place of supply (Qt `onPartyPicked`) ────────────────
  const headerRef = useRef(draft.header);
  useEffect(() => {
    headerRef.current = draft.header;
  }, [draft.header]);

  /** With a GST bill, the supplier's GSTIN comes from the party ledger — unless the operator typed another. */
  const fillGstinFromParty = useCallback(
    (partyId: string) => {
      if (!partyId) return;
      const request = dispatch(
        expenseApi.endpoints.expensePartyGstin.initiate({ ledId: partyId }, { subscribe: false, forceRefetch: true }),
      );
      request
        .unwrap()
        .then((gstin) => {
          const header = headerRef.current;
          if (!gstin || header.partyId !== partyId || !header.gstBill) return;
          const typedGstin = header.supplierGstin.trim();
          if (typedGstin && typedGstin !== autoGstinRef.current) return;
          autoGstinRef.current = gstin;
          dispatchDraft({ type: "SET_HEADER", patch: { supplierGstin: gstin } });
        })
        .catch(() => {
          // Qt says nothing either: the GSTIN can always be typed.
        });
    },
    [dispatch],
  );

  const pickParty = useCallback(
    (selection: { id: string; text: string } | null) => {
      const partyId = selection?.id ?? "";
      dispatchDraft({ type: "SET_HEADER", patch: { partyId, partyName: selection?.text ?? "" } });
      if (partyId && headerRef.current.gstBill) {
        fillGstinFromParty(partyId);
      }
    },
    [fillGstinFromParty],
  );

  const setGstBill = useCallback(
    (on: boolean) => {
      dispatchDraft({ type: "SET_HEADER", patch: { gstBill: on } });
      const header = headerRef.current;
      if (on && !header.supplierGstin.trim() && header.partyId) {
        // The ref still holds the unticked header; the fetch reads it again on landing.
        headerRef.current = { ...header, gstBill: true };
        fillGstinFromParty(header.partyId);
      }
    },
    [fillGstinFromParty],
  );

  /** An operator pick overrides the GSTIN's state; clearing it goes back to following the GSTIN. */
  const pickPlaceOfSupply = useCallback((selection: { id: string } | null) => {
    const code = selection?.id ?? "";
    dispatchDraft({ type: "SET_HEADER", patch: { placeOfSupply: code, placeOfSupplyPicked: code !== "" } });
  }, []);

  // ── the lines ───────────────────────────────────────────────────────────
  const setLine = useCallback((key: string, patch: Partial<ExpenseLineDraft>) => {
    dispatchDraft({ type: "SET_LINE", key, patch });
  }, []);
  const removeLine = useCallback((key: string) => dispatchDraft({ type: "REMOVE_LINE", key }), []);
  const clearReason = useCallback(
    (key: string) => dispatchDraft({ type: "SET_LINE", key, patch: { reasonId: "", reasonName: "" } }),
    [],
  );

  /**
   * A row picked in a popup → its line. Returns the cell the caret goes to
   * next, or null when the row named nothing.
   */
  const pickIntoLine = useCallback(
    (lineKey: string, column: "reason" | "ledger", row: Record<string, unknown>) => {
      const line = draft.lines.find((candidate) => candidate.key === lineKey);
      if (!line || !editable) return null;
      let patch: Partial<ExpenseLineDraft>;
      if (column === "reason") {
        const pick = readReasonPick(row);
        if (!pick) return null;
        patch = reasonPickPatch(line, pick);
      } else {
        const pick = readLedgerPick(row);
        if (!pick) return null;
        patch = ledgerPickPatch(line, pick);
      }
      dispatchDraft({ type: "SET_LINE", key: lineKey, patch });
      return cellAfterPick(column, { ...line, ...patch });
    },
    [draft.lines, editable],
  );

  /** "+": the trailing blank line is the new one — its key, for the caret. */
  const addLine = useCallback((): string | null => {
    const last = draft.lines.at(-1);
    return last && isBlankLine(last) ? last.key : null;
  }, [draft.lines]);

  // ── the tenders ─────────────────────────────────────────────────────────
  const setTender = useCallback((key: string, patch: Partial<ExpenseTenderDraft>) => {
    dispatchDraft({ type: "SET_TENDER", key, patch });
  }, []);
  const removeTender = useCallback((key: string) => dispatchDraft({ type: "REMOVE_TENDER", key }), []);

  /** A tender picked on a row; a NEW row takes what is still unpaid (Qt `onTenderCellEdited`). */
  const pickTender = useCallback(
    (key: string, tenderId: string) => {
      const row = draft.tenders.find((candidate) => candidate.key === key);
      if (!row) return;
      const option = tenderOptions.find((candidate) => candidate.tenderId === tenderId);
      const patch: Partial<ExpenseTenderDraft> = { tenderId, tenderName: option?.name ?? "" };
      if (!row.tenderId && !row.autoAmount && paiseOfText(row.amount) === 0) {
        const paid = sumPaise(draft.tenders.map((candidate) => paiseOfText(candidate.amount)));
        const unpaid = Math.max(0, autoTotal - paid);
        if (unpaid > 0) {
          patch.amount = tidyAmountText(paiseToDecimal(unpaid));
        }
      }
      dispatchDraft({ type: "SET_TENDER", key, patch });
    },
    [autoTotal, draft.tenders, tenderOptions],
  );

  /** "+": the trailing blank tender — its key, for the caret. */
  const addTender = useCallback((): string | null => {
    const last = draft.tenders.at(-1);
    return last && isBlankTender(last) ? last.key : null;
  }, [draft.tenders]);

  return {
    draft,
    view,
    editable,
    busy,
    loading,
    loadError,
    checking,
    problem,
    postProblem,
    canSave,
    canPost,
    postHint,
    showCancel,
    canCancel,
    canCancelReenter,
    tenderOptions,
    rates,
    ratesFailed,
    reasonNames,
    placeOfSupply,
    docCompanyId,
    startNew,
    saveDraft,
    post,
    cancelVoucher,
    setHeader,
    pickParty,
    setGstBill,
    pickPlaceOfSupply,
    setLine,
    removeLine,
    clearReason,
    pickIntoLine,
    addLine,
    setTender,
    removeTender,
    pickTender,
    addTender,
  };
}

export type ExpenseVoucherApi = ReturnType<typeof useExpenseVoucher>;
