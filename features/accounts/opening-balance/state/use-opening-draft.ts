"use client";

/**
 * The reducer, the queries and the three jobs that talk to the server.
 *
 * Nothing here computes money. `derived.ts` does that, and it is pure.
 */
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { toast } from "@/lib/notify";
import { openingBalanceError } from "../api-errors";
import {
  useCarryForwardOpeningBalancesMutation,
  useGetOpeningBalancesQuery,
  useLazyGetOpeningBillsQuery,
  useLazyGetOpeningTrialBalanceQuery,
  useSaveOpeningBalancesMutation,
  useSaveOpeningBillsMutation,
} from "@/store/api/openingBalanceApi";
import { formatMoney, totals as computeTotals } from "../derived";
import type { BillRow, LedgerRow, Scope, ShownSide } from "../opening-balance.types";
import { buildBillsPayload } from "../payload/build-bills-payload";
import { buildLedgerPayload } from "../payload/build-ledger-payload";
import { previousAccYear } from "../scope";
import { validate } from "../validate";
import {
  draftReducer,
  initialDraft,
  type DraftAction,
  type OpeningDraft,
  type PickedLedger,
} from "./draft";

/** `useReducer` over a reducer that also returns refusals. */
function reducerWithRefusal(state: OpeningDraft, action: DraftAction): OpeningDraft {
  const result = draftReducer(state, action);
  if (result.refusal) {
    // Raised from inside the reducer so a refusal cannot be silently dropped by
    // a caller that forgot to check. `lib/notify` is a module-level queue, not
    // React state, so this is safe outside the render path.
    toast.warn(result.refusal.message);
  }
  return result.draft;
}

export type OpeningBusy = "idle" | "loading" | "saving" | "carrying" | "checking";

export type UseOpeningDraft = ReturnType<typeof useOpeningDraft>;

export function useOpeningDraft(scope: Scope, canWrite: boolean) {
  const [draft, dispatch] = useReducer(reducerWithRefusal, scope, initialDraft);
  const [busy, setBusy] = useState<OpeningBusy>("idle");

  const scopeReady = Boolean(scope.companyId && scope.accYear);
  const listArg = useMemo(
    () => ({ companyId: scope.companyId, accYear: scope.accYear, branchId: scope.branchId }),
    [scope.companyId, scope.accYear, scope.branchId],
  );

  const {
    data: listPayload,
    isFetching: listFetching,
    refetch: refetchList,
  } = useGetOpeningBalancesQuery(listArg, { skip: !scopeReady });

  const [fetchBills] = useLazyGetOpeningBillsQuery();
  const [fetchTrialBalance] = useLazyGetOpeningTrialBalanceQuery();
  const [saveLedgers] = useSaveOpeningBalancesMutation();
  const [saveBills] = useSaveOpeningBillsMutation();
  const [runCarryForward] = useCarryForwardOpeningBalancesMutation();

  // ── Scope changes clear everything ────────────────────────────────────────
  // A company-level set and a branch set share no rows and no bills, so a
  // cached breakup from one means nothing in the other.
  const currentScope = useRef(draft.scope);
  useEffect(() => {
    const previous = currentScope.current;
    if (
      previous.companyId === scope.companyId &&
      previous.branchId === scope.branchId &&
      previous.accYear === scope.accYear
    ) {
      return;
    }
    currentScope.current = scope;
    dispatch({ type: "SCOPE_CHANGED", scope });
  }, [scope]);

  // ── The answer for THIS scope becomes the draft ───────────────────────────
  // RTK Query keys each answer by its full argument, so a reply for the scope
  // the operator has just left is cached under its own key and is never read
  // here. That is what the Qt screen's `QPointer` guard was protecting, and it
  // needs no bookkeeping in React.
  const seeded = useRef<unknown>(null);
  useEffect(() => {
    if (!listPayload || seeded.current === listPayload) {
      return;
    }
    if (
      listPayload.opCompanyId !== scope.companyId ||
      (listPayload.opBranchId ?? null) !== scope.branchId ||
      listPayload.opAccYear !== scope.accYear
    ) {
      return;
    }
    seeded.current = listPayload;
    // LOADED clears the problem list too: a refusal that outlives the rows it
    // was computed from names ledgers that are no longer on screen.
    dispatch({ type: "LOADED", payload: listPayload });
  }, [listPayload, scope]);

  // ── The open party's breakup ──────────────────────────────────────────────
  const loadingParty = useRef<string | null>(null);
  useEffect(() => {
    const partyId = draft.currentParty;
    if (!partyId || !scope.branchId || draft.billsByParty[partyId] !== undefined) {
      return;
    }
    if (loadingParty.current === partyId) {
      return;
    }
    loadingParty.current = partyId;
    void fetchBills({
      partyId,
      companyId: scope.companyId,
      accYear: scope.accYear,
      branchId: scope.branchId,
    })
      .unwrap()
      .then((payload) => {
        dispatch({ type: "BILLS_LOADED", partyId, payload });
        if (payload.isTied === false) {
          toast.warn(
            `"${payload.partyName}" has ${formatMoney(payload.openingAmount)} stored against ` +
              `${formatMoney(payload.billTotalAmount)} of bills. Those two are written in one ` +
              "transaction, so they can only disagree if the rows were written around the route. " +
              "Saving this breakup will correct the figure.",
          );
        }
      })
      .catch((error: unknown) => {
        toast.error(openingBalanceError(error));
      })
      .finally(() => {
        if (loadingParty.current === partyId) {
          loadingParty.current = null;
        }
      });
  }, [draft.currentParty, draft.billsByParty, fetchBills, scope]);

  // ── Derived ───────────────────────────────────────────────────────────────
  const totals = useMemo(() => computeTotals(draft.rows), [draft.rows]);

  const dirtyPartyInput = useMemo(
    () =>
      draft.dirtyParties.map((partyId) => ({
        partyId,
        partyName:
          draft.rows.find((row) => row.ledId === partyId)?.ledName ?? partyId,
        bills: draft.billsByParty[partyId] ?? [],
      })),
    [draft.dirtyParties, draft.billsByParty, draft.rows],
  );

  // ── Actions ───────────────────────────────────────────────────────────────
  const selectRow = useCallback(
    (row: LedgerRow) => {
      // ONE function for a click and for an arrow key, so mouse and keyboard
      // behave the same. Silent for the two cases that are not a refusal:
      // an ordinary ledger has no breakup, and a bill always has a branch.
      if (!row.isBillWise || !scope.branchId) {
        if (draft.currentParty !== null) {
          dispatch({ type: "SELECT_PARTY", partyId: null });
        }
        return;
      }
      if (draft.currentParty !== row.ledId) {
        dispatch({ type: "SELECT_PARTY", partyId: row.ledId });
      }
    },
    [draft.currentParty, scope.branchId],
  );

  /** Alt+B — the EXPLICIT request, which is the one that explains a refusal. */
  const requestBreakup = useCallback(
    (row: LedgerRow) => {
      if (row.ledId === "") {
        return;
      }
      if (!row.isBillWise) {
        toast.info(
          `"${row.ledName}" is not a bill-by-bill party — its opening is a single figure. Type it in the Opening cell.`,
        );
        return;
      }
      if (!scope.branchId) {
        toast.info(
          "Opening bills always belong to a branch (`abl_branch_id` is NOT NULL), so a breakup can only be opened under “This branch”.",
        );
        return;
      }
      dispatch({ type: "SELECT_PARTY", partyId: row.ledId });
    },
    [scope.branchId],
  );

  const setAmount = useCallback(
    (rowKey: string, amount: number) => dispatch({ type: "SET_AMOUNT", key: rowKey, amount }),
    [],
  );
  const setSide = useCallback(
    (rowKey: string, side: ShownSide) => dispatch({ type: "SET_SIDE", key: rowKey, side }),
    [],
  );
  const setRemarks = useCallback(
    (rowKey: string, remarks: string) => dispatch({ type: "SET_REMARKS", key: rowKey, remarks }),
    [],
  );
  const pickLedger = useCallback(
    (rowKey: string, ledger: PickedLedger) =>
      dispatch({ type: "PICK_LEDGER", key: rowKey, ledger }),
    [],
  );
  const removeRow = useCallback((rowKey: string) => dispatch({ type: "REMOVE_ROW", key: rowKey }), []);
  const closePanel = useCallback(() => dispatch({ type: "SELECT_PARTY", partyId: null }), []);

  const reload = useCallback(() => {
    seeded.current = null;
    void refetchList();
  }, [refetchList]);

  /**
   * Save.
   *
   * The ledger set goes first, then the dirty breakups ONE AT A TIME. Never
   * `Promise.all`: each `/bills` call rewrites its own party's `op_amount` and
   * recomputes the trial balance in the same transaction, so two in flight
   * would race over the same figures.
   */
  const save = useCallback(async (): Promise<boolean> => {
    if (!canWrite) {
      toast.error("You do not have rights to save on this screen.");
      return false;
    }
    const found = validate({ rows: draft.rows, dirtyParties: dirtyPartyInput });
    dispatch({ type: "PROBLEMS", problems: found });
    if (found.length > 0) {
      toast.error(found[0].message);
      return false;
    }

    setBusy("saving");
    const savedParties: string[] = [];
    try {
      const result = await saveLedgers(buildLedgerPayload(draft.scope, draft.rows)).unwrap();

      const notes: string[] = [];
      if (result.deleted > 0) {
        notes.push(`${result.deleted} removed`);
      }
      if (result.flippedToManual.length > 0) {
        notes.push(`${result.flippedToManual.length} carried-forward figure(s) are now MANUAL`);
      }
      if (result.retainedWithBills.length > 0) {
        notes.push(
          `${result.retainedWithBills.length} bill-wise row(s) kept — their bills own the figure`,
        );
      }

      let failedParty: string | null = null;
      let failedMessage = "";
      for (const party of dirtyPartyInput) {
        try {
          const billResult = await saveBills(
            buildBillsPayload(
              {
                scope: draft.scope,
                partyId: party.partyId,
                opId: draft.opIdByParty[party.partyId] ?? null,
              },
              party.bills,
            ),
          ).unwrap();
          savedParties.push(party.partyId);
          if (billResult.frozenUnchanged > 0) {
            notes.push(
              `${billResult.frozenUnchanged} receipted bill(s) of ${party.partyName} left as they were`,
            );
          }
          if (billResult.staledAccYears.length > 0) {
            notes.push(`openings of ${billResult.staledAccYears.join(", ")} are now stale`);
          }
        } catch (error) {
          failedParty = party.partyName;
          failedMessage = openingBalanceError(error);
          break;
        }
      }

      if (result.staledAccYears.length > 0) {
        notes.push(`openings of ${result.staledAccYears.join(", ")} are now stale`);
      }

      dispatch({ type: "SAVED", trialBalance: result.trialBalance, savedParties });

      if (failedParty) {
        // The single most important message on this screen. Without it the
        // operator reads a generic failure and retypes work that is already
        // safely on the server.
        toast.error(
          `The ledger openings were saved, but the bills of "${failedParty}" were refused. ` +
            `Fix them and save again — the rest is already on the server. ${failedMessage}`,
        );
      } else {
        const breakups = savedParties.length;
        toast.success(
          `Saved${breakups > 0 ? ` (+ ${breakups} breakup${breakups === 1 ? "" : "s"})` : ""}` +
            (notes.length > 0 ? ` — ${notes.join("; ")}.` : "."),
        );
      }

      // Reload after EVERY save: the server owns the ids, the sources and the
      // generated bill figures, and a screen that keeps its own copy drifts
      // from the set it has just written.
      reload();
      return failedParty === null;
    } catch (error) {
      toast.error(openingBalanceError(error));
      return false;
    } finally {
      setBusy("idle");
    }
  }, [canWrite, dirtyPartyInput, draft.opIdByParty, draft.rows, draft.scope, reload, saveBills, saveLedgers]);

  const carryForward = useCallback(async (): Promise<boolean> => {
    const fromAccYear = previousAccYear(scope.accYear);
    if (!fromAccYear) {
      toast.error(
        `"${scope.accYear}" is not an accounting year this server can read (YYYY-YYYY, second half = first + 1), so there is no year to carry from.`,
      );
      return false;
    }
    setBusy("carrying");
    try {
      const result = await runCarryForward({
        companyId: scope.companyId,
        fromAccYear,
        toAccYear: scope.accYear,
        branchId: scope.branchId,
      }).unwrap();

      if (result.created + result.updated + result.billsCarried === 0) {
        toast.info(`${fromAccYear} has no closing balances on this server yet.`);
      } else {
        const parts = [
          `${result.created} created`,
          `${result.updated} updated`,
          // Always reported, even at zero: a run that spared nothing and a run
          // that spared nine look identical without it.
          `${result.skippedManual} manual/migration row(s) left alone`,
          `${result.billsCarried} bill(s) carried`,
        ];
        if (result.profitAndLossResult !== 0 && !result.retainedEarningsLedgerId) {
          parts.push(
            `the ${formatMoney(Math.abs(result.profitAndLossResult))} P&L result had no RETAINED_EARNINGS ledger mapped — it went nowhere`,
          );
        } else if (result.profitAndLossResult !== 0) {
          parts.push(
            `${formatMoney(Math.abs(result.profitAndLossResult))} P&L result onto retained earnings`,
          );
        }
        toast.success(`Carried forward from ${fromAccYear}: ${parts.join(", ")}.`);
      }
      reload();
      return true;
    } catch (error) {
      toast.error(openingBalanceError(error));
      return false;
    } finally {
      setBusy("idle");
    }
  }, [reload, runCarryForward, scope]);

  const checkAgainstServer = useCallback(async () => {
    setBusy("checking");
    try {
      const serverTotals = await fetchTrialBalance(listArg).unwrap();
      const own = computeTotals(draft.rows);
      const lines = [
        `The server has Dr ${formatMoney(serverTotals.totalDebit)} against Cr ${formatMoney(
          serverTotals.totalCredit,
        )}, a difference of ${formatMoney(Math.abs(serverTotals.difference))}.`,
      ];
      const matches =
        Math.round(own.debit * 100) === Math.round(serverTotals.totalDebit * 100) &&
        Math.round(own.credit * 100) === Math.round(serverTotals.totalCredit * 100);
      if (!matches) {
        lines.push(
          draft.dirty
            ? "This screen has unsaved changes, so its own strip is ahead of that."
            : "That does NOT match what this screen has computed and nothing is unsaved — that is a bug, not a rounding difference.",
        );
      }
      if (serverTotals.unmappedCount > 0) {
        lines.push(
          `${serverTotals.unmappedCount} ledger(s) are under a group with no nature and are outside those totals.`,
        );
      }
      if (!serverTotals.isBalanced && !serverTotals.differenceLedgerId) {
        lines.push("No OPENING_DIFFERENCE ledger is mapped, so nothing would absorb the difference.");
      }
      if (matches && draft.dirty === false) {
        toast.success(lines.join(" "));
      } else {
        toast.info(lines.join(" "));
      }
    } catch (error) {
      toast.error(openingBalanceError(error));
    } finally {
      setBusy("idle");
    }
  }, [draft.dirty, draft.rows, fetchTrialBalance, listArg]);

  const setBillField = useCallback(
    (partyId: string, rowKey: string, patch: Partial<BillRow>) =>
      dispatch({ type: "SET_BILL_FIELD", partyId, key: rowKey, patch }),
    [],
  );

  const removeBill = useCallback(
    (partyId: string, rowKey: string) => dispatch({ type: "REMOVE_BILL", partyId, key: rowKey }),
    [],
  );

  return {
    draft,
    totals,
    problems: draft.problems,
    busy: busy === "idle" && listFetching ? ("loading" as OpeningBusy) : busy,
    isLoading: listFetching,
    selectRow,
    requestBreakup,
    setAmount,
    setSide,
    setRemarks,
    pickLedger,
    removeRow,
    closePanel,
    setBillField,
    removeBill,
    save,
    carryForward,
    checkAgainstServer,
    reload,
  };
}
