"use client";

/**
 * The two exception tabs' state and verbs — Qt showNotReceived / writeOff and
 * showUnexplained / resolve. Both need OVERRIDE on menu 278; the client cannot
 * read that flag yet (see `SettlementRights.canOverride`), so the server's 403
 * …_NEEDS_APPROVAL is what a missing right shows, as in Qt.
 */
import { useCallback, useMemo, useRef, useState } from "react";
import { confirm } from "@/lib/confirm";
import { toast } from "@/lib/notify";
import type { DropdownSelection } from "@/components/design-system/dropdown";
import type { SettlementClient } from "../api/settlement-api";
import { settlementErrorMessage } from "../domain/errors";
import {
  pickerHint,
  pickRowGridParams,
  resolveBody,
  resolveDoneText,
  resolveState,
  writeOffBody,
  writeOffDoneText,
  writeOffQuestion,
  writeOffState,
  type ResolveForm,
  type WriteOffForm,
} from "../domain/exceptions";
import type { Scope } from "../domain/match";
import { text } from "../domain/parse";
import type { GridRow, Resolution, WriteOffTreatment } from "../domain/types";
import type { PickerRequest } from "../components/row-picker-dialog";

function useBusy() {
  const [busy, setBusy] = useState(false);
  const ref = useRef(false);
  const run = useCallback(async <T,>(work: () => Promise<T>): Promise<T | undefined> => {
    if (ref.current) return undefined;
    ref.current = true;
    setBusy(true);
    try {
      return await work();
    } catch (failure) {
      toast.error(settlementErrorMessage(failure));
      return undefined;
    } finally {
      ref.current = false;
      setBusy(false);
    }
  }, []);
  return { busy, run };
}

/**
 * The row on the panel, held by its KEY, not its index: a reload can reorder
 * or drop rows, and a panel that followed the index would put another bill
 * under the Write off button (Qt holds the row object for the same reason).
 */
function useSelectedRow(rows: readonly GridRow[], keyOf: (row: GridRow) => string) {
  const [selected, setSelected] = useState("");
  const current = selected ? rows.findIndex((row) => keyOf(row) === selected) : -1;
  const row = current >= 0 ? rows[current] : null;
  const select = useCallback(
    (index: number) => setSelected(index >= 0 && index < rows.length ? keyOf(rows[index]) : ""),
    [keyOf, rows],
  );
  return { current, row, select, selected };
}

const notReceivedKey = (row: GridRow) => `${text(row, "td_id")}|${text(row, "td_acc_year")}`;
const unexplainedKey = (row: GridRow) => `${text(row, "asl_id")}|${text(row, "asl_acc_year")}`;

export function useNotReceived(options: {
  client: SettlementClient;
  scope: Scope;
  canOverride: boolean;
  rows: readonly GridRow[];
  reloadNotReceived: () => void;
  reloadSuspense: () => void;
}) {
  const { client, scope, canOverride, rows, reloadNotReceived, reloadSuspense } = options;
  const { current, row, select: setCurrent } = useSelectedRow(rows, notReceivedKey);
  const [treatment, setTreatment] = useState<WriteOffTreatment>("RECOVER");
  const [reasonId, setReasonId] = useState("");
  const [recoverTo, setRecoverTo] = useState<DropdownSelection | null>(null);
  const [notes, setNotes] = useState("");
  const [posted, setPosted] = useState("");
  const { busy, run } = useBusy();

  const form: WriteOffForm = useMemo(
    () => ({ treatment, reasonId, recoveryLedgerId: recoverTo?.id ?? "", notes }),
    [notes, reasonId, recoverTo, treatment],
  );
  const state = writeOffState(row, form, { busy, canOverride });

  const writeOff = useCallback(async () => {
    if (!row || !state.canWriteOff) return;
    const held = { row, form };
    const yes = await confirm({
      title: "Write off",
      message: writeOffQuestion(held.row, held.form.treatment),
      confirmLabel: "Write off",
      cancelLabel: "Cancel",
    });
    if (!yes) return;
    const result = await run(() => client.writeOff(writeOffBody(scope, held.row, held.form)));
    if (!result) return;
    setPosted(writeOffDoneText(result));
    setNotes("");
    setCurrent(-1);
    reloadNotReceived();
    reloadSuspense(); // SUSPENSE / RECOVER move Tender suspense
  }, [client, form, reloadNotReceived, reloadSuspense, row, run, scope, setCurrent, state.canWriteOff]);

  return {
    current,
    setCurrent,
    row,
    treatment,
    setTreatment,
    reasonId,
    setReasonId,
    recoverTo,
    setRecoverTo,
    notes,
    setNotes,
    posted,
    busy,
    state,
    writeOff,
  };
}

export type NotReceivedState = ReturnType<typeof useNotReceived>;

export function useUnexplained(options: {
  client: SettlementClient;
  scope: Scope;
  canOverride: boolean;
  rows: readonly GridRow[];
  pick: (request: PickerRequest) => void;
  reloadUnexplained: () => void;
  reloadSuspense: () => void;
  reloadPayouts: () => void;
}) {
  const { client, scope, canOverride, rows, pick, reloadUnexplained, reloadSuspense, reloadPayouts } = options;
  const { current, row, select, selected } = useSelectedRow(rows, unexplainedKey);
  const [resolution, setResolution] = useState<Resolution>("LINKED");
  const [reasonId, setReasonId] = useState("");
  const [linkRow, setLinkRow] = useState<GridRow | null>(null);
  const [income, setIncome] = useState<DropdownSelection | null>(null);
  const [notes, setNotes] = useState("");
  const [posted, setPosted] = useState("");
  const { busy, run } = useBusy();

  const form: ResolveForm = useMemo(
    () => ({ resolution, reasonId, linkRow, incomeLedgerId: income?.id ?? "", notes }),
    [income, linkRow, notes, reasonId, resolution],
  );
  const state = resolveState(row, form, { busy, canOverride });

  /** Another line: its own bill to link, never the last line's. */
  const setCurrent = useCallback(
    (index: number) => {
      const next = index >= 0 && index < rows.length ? unexplainedKey(rows[index]) : "";
      if (next !== selected) setLinkRow(null);
      select(index);
    },
    [rows, select, selected],
  );

  const pickLinkRow = useCallback(() => {
    if (!state.pickEnabled) return;
    // Grid 141's lines are all SALE; any tender (re-tender the bill first if it was keyed as another).
    pick({
      title: "Pick the bill's tender row this line pays",
      hint: pickerHint("SALE"),
      params: pickRowGridParams(scope, "", "SALE"),
      onPick: (picked) => setLinkRow(picked),
    });
  }, [pick, scope, state.pickEnabled]);

  const resolve = useCallback(async () => {
    if (!row || !state.canResolve) return;
    const result = await run(() => client.resolve(resolveBody(scope, row, form)));
    if (!result) return;
    setPosted(resolveDoneText(result.voucherRefno));
    setNotes("");
    setCurrent(-1);
    reloadUnexplained();
    reloadSuspense();
    reloadPayouts();
  }, [client, form, reloadPayouts, reloadSuspense, reloadUnexplained, row, run, scope, setCurrent, state.canResolve]);

  return {
    current,
    setCurrent,
    row,
    resolution,
    setResolution,
    reasonId,
    setReasonId,
    linkRow,
    pickLinkRow,
    income,
    setIncome,
    notes,
    setNotes,
    posted,
    busy,
    state,
    resolve,
  };
}

export type UnexplainedState = ReturnType<typeof useUnexplained>;
