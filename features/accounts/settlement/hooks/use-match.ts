"use client";

/**
 * The Match tab's state and verbs — Qt openPayout / showPayout / runMatch /
 * confirmLine / unlinkLine / ignoreLine / postPayout / voidPayout.
 *
 * Every line verb answers the payout as GET get would (the server re-reads it),
 * so the answer is shown as it stands; no second GET. Post answers the payout
 * PLUS its legs — a fresh GET would carry no legs and wipe them, which is why
 * Qt shows the post's own answer too.
 */
import { useCallback, useMemo, useRef, useState } from "react";
import { confirm } from "@/lib/confirm";
import { toast } from "@/lib/notify";
import type { SettlementClient } from "../api/settlement-api";
import { settlementErrorMessage } from "../domain/errors";
import {
  IGNORE_QUESTION,
  IGNORE_SUGGESTIONS,
  VOID_SUGGESTIONS,
  confirmBody,
  firstCursor,
  lineKey,
  matchActions,
  payoutKey,
  postQuestion,
  visibleLines,
  voidQuestion,
  type ChipKey,
  type Scope,
} from "../domain/match";
import { pickerHint, pickRowGridParams } from "../domain/exceptions";
import { text } from "../domain/parse";
import type { GridRow, Leg, Payout, SettlementRights } from "../domain/types";
import type { PromptRequest } from "../components/prompt-dialog";
import type { PickerRequest } from "../components/row-picker-dialog";

export type MatchListReloads = {
  payouts: () => void;
  notReceived: () => void;
  unexplained: () => void;
  suspense: () => void;
};

export function useMatch(options: {
  client: SettlementClient;
  scope: Scope;
  rights: SettlementRights;
  reloads: MatchListReloads;
  ask: (request: PromptRequest) => void;
  pick: (request: PickerRequest) => void;
}) {
  const { client, scope, rights, reloads, ask, pick } = options;
  const [payout, setPayout] = useState<Payout | null>(null);
  const [legs, setLegs] = useState<Leg[]>([]);
  const [chip, setChipState] = useState<ChipKey>("ALL");
  const [cursor, setCursor] = useState(-1);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const chipRef = useRef<ChipKey>("ALL");

  const shown = useMemo(() => visibleLines(payout, chip), [payout, chip]);
  const line = cursor >= 0 && cursor < shown.length ? shown[cursor].line : null;
  const actions = matchActions(payout, line, rights, busy);

  const showPayout = useCallback((next: Payout | null, nextLegs: Leg[] = []) => {
    setPayout(next);
    setLegs(nextLegs);
    // The first suggestion is where a person is needed.
    setCursor(firstCursor(visibleLines(next, chipRef.current)));
  }, []);

  const setChip = useCallback(
    (next: ChipKey) => {
      chipRef.current = next;
      setChipState(next);
      setCursor(firstCursor(visibleLines(payout, next)));
    },
    [payout],
  );

  const guard = useCallback(async <T,>(work: () => Promise<T>): Promise<T | undefined> => {
    if (busyRef.current) return undefined;
    busyRef.current = true;
    setBusy(true);
    try {
      return await work();
    } catch (failure) {
      toast.error(settlementErrorMessage(failure));
      return undefined;
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }, []);

  const openPayout = useCallback(
    async (asiId: string, accYear: string) => {
      if (!asiId || !accYear || !scope.companyId || !scope.branchId) return;
      try {
        showPayout(await client.getPayout({ ...scope, accYear, asiId }));
      } catch (failure) {
        toast.error(settlementErrorMessage(failure));
      }
    },
    [client, scope, showPayout],
  );

  /** A payout from the payouts grid (grid 138's row). */
  const openRow = useCallback(
    (row: GridRow) => void openPayout(text(row, "asi_id"), text(row, "asi_acc_year")),
    [openPayout],
  );

  const callLine = useCallback(
    async (route: "match" | "confirm" | "unlink" | "ignore" | "void", body: Record<string, unknown>) => {
      const next = await guard(() => client.payoutAction(route, body));
      if (!next) return;
      showPayout(next);
      reloads.payouts();
      if (route === "void") {
        // A voided POSTED payout sends its rows back to PENDING.
        reloads.notReceived();
        reloads.unexplained();
        reloads.suspense();
      }
    },
    [client, guard, reloads, showPayout],
  );

  const runMatch = useCallback(() => {
    if (!payout || !actions.runMatch) return;
    void callLine("match", payoutKey(scope, payout));
  }, [actions.runMatch, callLine, payout, scope]);

  const confirmLine = useCallback(() => {
    if (!payout || !line || !actions.confirm) return;
    void callLine("confirm", confirmBody(scope, payout, line));
  }, [actions.confirm, callLine, line, payout, scope]);

  const unlinkLine = useCallback(() => {
    if (!payout || !line || !actions.unlink) return;
    void callLine("unlink", lineKey(scope, payout, line));
  }, [actions.unlink, callLine, line, payout, scope]);

  const pickRow = useCallback(() => {
    if (!payout || !line || !actions.pickRow) return;
    const held = { payout, line };
    // Only this payout's tender: a row of another is refused (TD_NOT_CANDIDATE).
    pick({
      title: "Pick our tender row for this line",
      hint: pickerHint(line.kind),
      params: pickRowGridParams(scope, payout.tenderId, line.kind),
      onPick: (row) =>
        void callLine(
          "confirm",
          confirmBody(scope, held.payout, held.line, {
            tdId: text(row, "td_id"),
            tdAccYear: text(row, "td_acc_year"),
          }),
        ),
    });
  }, [actions.pickRow, callLine, line, payout, pick, scope]);

  const ignoreLine = useCallback(() => {
    if (!payout || !line || !actions.ignore) return;
    const held = { payout, line };
    ask({
      title: "Ignore line",
      question: IGNORE_QUESTION,
      placeholder: "reason",
      suggestions: IGNORE_SUGGESTIONS,
      maxLength: 500,
      confirmLabel: "Ignore line",
      onAnswer: (notes) => void callLine("ignore", { ...lineKey(scope, held.payout, held.line), notes }),
    });
  }, [actions.ignore, ask, callLine, line, payout, scope]);

  const voidPayout = useCallback(() => {
    if (!payout || !actions.void) return;
    const held = payout;
    ask({
      title: "Void payout",
      question: voidQuestion(held),
      placeholder: "reason",
      suggestions: VOID_SUGGESTIONS,
      maxLength: 250,
      confirmLabel: "Void payout",
      onAnswer: (reason) => void callLine("void", { ...payoutKey(scope, held), reason }),
    });
  }, [actions.void, ask, callLine, payout, scope]);

  const postPayout = useCallback(async () => {
    if (!payout || !actions.post || busyRef.current) return;
    const held = payout;
    const yes = await confirm({
      title: "Post TSet",
      message: postQuestion(held),
      confirmLabel: "Post TSet",
      cancelLabel: "Cancel",
      iconVariant: "replace",
    });
    if (!yes) return;
    const posted = await guard(() => client.post(payoutKey(scope, held)));
    if (!posted) return;
    showPayout(posted.payout, posted.legs);
    reloads.payouts();
    reloads.notReceived();
    reloads.unexplained();
    reloads.suspense();
  }, [actions.post, client, guard, payout, reloads, scope, showPayout]);

  /** F5: the open payout again (its legs go — GET carries none, as in Qt). */
  const reopen = useCallback(() => {
    if (payout) void openPayout(payout.asiId, payout.accYear);
  }, [openPayout, payout]);

  return {
    payout,
    legs,
    chip,
    setChip,
    shown,
    cursor,
    setCursor,
    line,
    busy,
    actions,
    openPayout,
    openRow,
    reopen,
    runMatch,
    confirmLine,
    unlinkLine,
    pickRow,
    ignoreLine,
    voidPayout,
    postPayout,
  };
}

export type MatchState = ReturnType<typeof useMatch>;
