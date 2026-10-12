"use client";

/**
 * The expense voucher's whole lifecycle in one hook: the draft, the three pick
 * lists, the server's check 400 ms after each edit, and draft → post → cancel.
 * The screen renders what this returns and calls what it exposes; it decides
 * nothing about the document itself.
 *
 * Qt `ExpenseVoucherEntry`, verb for verb:
 *   startNew      F2   a NEW voucher, one empty line, one tender on cash
 *   saveDraft     F5   POST create (a DRAFT; with voucherId an edit of it)
 *   post          F10  POST create, then POST post by the key — the number
 *                      is issued at post; a failed post leaves the draft saved
 *   cancelVoucher      POST cancel with a reason (a POSTED voucher only)
 *   validate           POST validate, debounced 400 ms, the older answer
 *                      discarded; asked only while `problem` is empty
 */
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { useAppDispatch } from "@/store/hooks";
import { toast } from "@/lib/notify";
import type { DocumentRights } from "@/lib/permissions/document-rights";
import { useGetTenderMastersQuery } from "@/store/api/saleOrderApi";
import { expenseApi } from "../api/expense-api";
import { expenseError } from "../api-errors";
import type {
  ExpenseHeaderDraft,
  ExpenseKeys,
  ExpenseLedgerOption,
  ExpenseLineDraft,
  ExpensePayload,
  ExpenseQuickReason,
  ExpenseScope,
  ExpenseTenderDraft,
  ExpenseTillSession,
} from "../expense.types";
import {
  emptyLine,
  emptyTender,
  expenseDraftReducer,
  isEditable,
  newDraft,
  reasonPatch,
  withDefaultCash,
} from "../domain/draft";
import { formatPaise, paiseOfNumber, paiseToDecimal, tidyAmountText } from "../domain/money";
import { draftOfVoucher, readValidate, readVoucher } from "../domain/parse";
import {
  bodyKeyOf,
  buildExpenseBody,
  expensePostProblem,
  expenseProblem,
} from "../domain/payload";
import {
  cashTenderOf,
  expenseTenderOptions,
  ledgersFromPick,
  reasonsFromGridRows,
  reasonsFromQuickReasons,
} from "../domain/pickers";
import {
  buildExpenseView,
  countedTenderPaise,
  unpaidPaise,
  voucherTotalPaise,
  type ExpenseAnswer,
} from "../domain/view";

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

function rowsOf(raw: unknown): Record<string, unknown>[] {
  if (Array.isArray(raw)) {
    return raw.filter((row): row is Record<string, unknown> => typeof row === "object" && row !== null);
  }
  if (typeof raw === "object" && raw !== null && Array.isArray((raw as { items?: unknown }).items)) {
    return rowsOf((raw as { items: unknown[] }).items);
  }
  return [];
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

  const [reasons, setReasons] = useState<ExpenseQuickReason[]>([]);
  const [ledgers, setLedgers] = useState<ExpenseLedgerOption[]>([]);

  // The company / branch the pick lists and the tenders are for: the open
  // voucher's own, else the header's.
  const docCompanyId = typed.keys?.companyId ?? openKeys?.companyId ?? scope.companyId;
  const docBranchId = typed.keys?.branchId ?? openKeys?.branchId ?? scope.branchId;

  // ── the tenders: CASH / BANK / UPI live on the voucher date ─────────────
  const { data: tenderMasters, isError: tendersFailed } = useGetTenderMastersQuery();
  const tenderOptions = useMemo(
    () => expenseTenderOptions(tenderMasters ?? [], typed.header.voucherDate || today, docCompanyId, docBranchId),
    [tenderMasters, typed.header.voucherDate, today, docCompanyId, docBranchId],
  );
  const cashTenderId = cashTenderOf(tenderOptions)?.tenderId ?? "";
  // A NEW voucher's first tender row reads as cash until another is picked.
  const draft = useMemo(() => withDefaultCash(typed, cashTenderId), [typed, cashTenderId]);
  // Nothing is typed into a voucher that is still being read.
  const editable = isEditable(draft.status) && !loading;

  useEffect(() => {
    if (tendersFailed) {
      toast.error("The Tender Master could not be read, so the voucher cannot be paid. Reload to try again.", {
        toastId: "expense-tenders",
      });
    }
  }, [tendersFailed]);

  // ── the reasons and the ledgers (Qt `loadPickers`) ──────────────────────
  useEffect(() => {
    if (!docCompanyId) {
      return undefined;
    }
    let cancelled = false;
    const reasonRequest = dispatch(expenseApi.endpoints.expenseReasonRows.initiate({ companyId: docCompanyId }));
    const ledgerRequest = dispatch(expenseApi.endpoints.expenseLedgerPick.initiate({ companyId: docCompanyId }));

    settle(reasonRequest)
      .then((raw) => {
        if (!cancelled) setReasons(reasonsFromGridRows(rowsOf(raw)));
      })
      .catch(async (error: unknown) => {
        if (cancelled || isAbort(error)) return;
        // Grid 134 may be missing on a box whose config was not copied over;
        // the server's own route lists the same reasons (with a shipped one
        // beside its company copy — the reason Qt prefers the grid).
        try {
          const raw = await settle(
            dispatch(expenseApi.endpoints.expenseQuickReasons.initiate({ companyId: docCompanyId })),
          );
          if (!cancelled) setReasons(reasonsFromQuickReasons(rowsOf(raw)));
        } catch (fallbackError) {
          if (!cancelled && !isAbort(fallbackError)) {
            toast.error(`The expense reasons could not be read: ${expenseError(fallbackError)}`, {
              toastId: "expense-reasons",
            });
          }
        }
      });
    settle(ledgerRequest)
      .then((raw) => {
        if (!cancelled) setLedgers(ledgersFromPick(rowsOf(raw)));
      })
      .catch((error: unknown) => {
        if (!cancelled && !isAbort(error)) {
          toast.error(`The expense ledgers could not be read: ${expenseError(error)}`, {
            toastId: "expense-ledgers",
          });
        }
      });
    return () => {
      cancelled = true;
      reasonRequest.abort();
      ledgerRequest.abort();
    };
  }, [dispatch, docCompanyId]);

  // ── the body, and why it cannot go yet ──────────────────────────────────
  const bodyInput = useMemo(
    () => ({ draft, scope, tenders: tenderOptions, session }),
    [draft, scope, tenderOptions, session],
  );
  const body = useMemo(() => buildExpenseBody(bodyInput), [bodyInput]);
  const bodyKey = useMemo(() => bodyKeyOf(body), [body]);
  const problem = useMemo(() => expenseProblem(bodyInput), [bodyInput]);
  const postProblem = useMemo(() => expensePostProblem(bodyInput), [bodyInput]);

  // ── showing a voucher the server answered with ──────────────────────────
  const showVoucher = useCallback(
    (voucher: ExpensePayload) => {
      dispatchDraft({ type: "RESET", draft: draftOfVoucher(voucher, today) });
      // The saved figures, at once — not a check: a draft is validated for
      // real (below) before Post may go.
      setAnswer({
        kind: "saved",
        bodyKey: "",
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
  const latest = useRef({ body, bodyKey });
  useEffect(() => {
    latest.current = { body, bodyKey };
  }, [body, bodyKey]);
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
      const { body: sentBody, bodyKey: sentKey } = latest.current;
      request = dispatch(expenseApi.endpoints.expenseValidate.initiate(sentBody));
      settle(request)
        .then((raw) => {
          if (cancelled || latest.current.bodyKey !== sentKey) return; // an older answer
          setAnswer({ kind: "validated", bodyKey: sentKey, payload: readValidate(raw) });
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
        validateError: currentError,
        session,
        tenders: tenderOptions,
      }),
    [answer, bodyKey, currentError, draft, session, tenderOptions],
  );

  const checked = answer?.kind === "validated" && view.fresh;
  const refused = checked && (answer?.payload.refusals.length ?? 0) > 0;
  const saved = draft.keys !== null;
  const canSave = editable && !problem && !busy && !loading && rights.maySaveDraft(saved);
  const canPost =
    editable && !postProblem && !busy && !loading && checked && !refused && !checking && rights.mayPost;
  const postHint = refused
    ? "The server refuses it as it is — see the red list"
    : postProblem
      ? postProblem
      : !checked || checking
        ? "Waiting for the server's check"
        : !rights.mayPost
          ? "You may not post an expense voucher (menu 277)"
          : "";
  const showCancel = draft.status === "POSTED";
  const canCancel = showCancel && !busy && rights.mayCancelDocument(true);

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
          showVoucher(savedVoucher);
          toast.success("Expense voucher saved as DRAFT.");
          return true;
        }
        try {
          const posted = readVoucher(
            await settle(dispatch(expenseApi.endpoints.expensePost.initiate(keysOf(savedVoucher)))),
          );
          showVoucher(posted);
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
    [beginBusy, body, dispatch, endBusy, postProblem, problem, showVoucher],
  );

  const saveDraft = useCallback(() => save(false), [save]);
  const post = useCallback(() => save(true), [save]);

  const cancelVoucher = useCallback(
    async (reason: string): Promise<boolean> => {
      const keys = draft.keys;
      if (draft.status !== "POSTED" || !keys || !reason.trim()) {
        return false;
      }
      if (!beginBusy()) {
        return false;
      }
      try {
        const cancelled = readVoucher(
          await settle(dispatch(expenseApi.endpoints.expenseCancel.initiate({ ...keys, reason: reason.trim() }))),
        );
        showVoucher(cancelled);
        toast.success(`Expense ${cancelled.voucherNo ?? ""} cancelled — a mirror voucher in the Rev series reverses it.`);
        return true;
      } catch (error) {
        toast.error(expenseError(error));
        return false;
      } finally {
        endBusy();
      }
    },
    [beginBusy, dispatch, draft.keys, draft.status, endBusy, showVoucher],
  );

  const setHeader = useCallback((patch: Partial<ExpenseHeaderDraft>) => {
    dispatchDraft({ type: "SET_HEADER", patch });
  }, []);
  const setLine = useCallback((key: string, patch: Partial<ExpenseLineDraft>) => {
    dispatchDraft({ type: "SET_LINE", key, patch });
  }, []);
  const setTender = useCallback((key: string, patch: Partial<ExpenseTenderDraft>) => {
    dispatchDraft({ type: "SET_TENDER", key, patch });
  }, []);
  /** + Line: returns the new row's key, for the caret. */
  const addLine = useCallback((): string => {
    const line = emptyLine();
    dispatchDraft({ type: "ADD_LINE", line });
    return line.key;
  }, []);
  const removeLine = useCallback((key: string) => dispatchDraft({ type: "REMOVE_LINE", key }), []);
  const removeTender = useCallback((key: string) => dispatchDraft({ type: "REMOVE_TENDER", key }), []);

  const pickReason = useCallback(
    (lineKey: string, reasonId: string) => {
      const line = draft.lines.find((candidate) => candidate.key === lineKey);
      if (!line) return;
      const reason = reasons.find((candidate) => candidate.reasonId === reasonId) ?? null;
      dispatchDraft({ type: "SET_LINE", key: lineKey, patch: reasonPatch(line, reason, ledgers) });
    },
    [draft.lines, ledgers, reasons],
  );

  /** + Tender: the new row takes what is still unpaid, on the first tender offered. */
  const addTender = useCallback((): string => {
    const total = voucherTotalPaise(draft, answer, view.fresh);
    const unpaid = unpaidPaise(total, countedTenderPaise(draft, tenderOptions));
    const row = emptyTender(tenderOptions[0]?.tenderId ?? "", unpaid > 0 ? tidyAmountText(paiseToDecimal(unpaid)) : "");
    dispatchDraft({ type: "ADD_TENDER", row });
    return row.key;
  }, [answer, draft, tenderOptions, view.fresh]);

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
    reasons,
    ledgers,
    tenderOptions,
    docCompanyId,
    startNew,
    saveDraft,
    post,
    cancelVoucher,
    setHeader,
    setLine,
    setTender,
    addLine,
    removeLine,
    addTender,
    removeTender,
    pickReason,
  };
}

export type ExpenseVoucherApi = ReturnType<typeof useExpenseVoucher>;
