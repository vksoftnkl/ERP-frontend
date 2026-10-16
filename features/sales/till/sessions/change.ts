/**
 * Change between counters — Qt `TillChangeDialog` (bec3f98) without the
 * widgets: a supervisor carries change from one live counter to another,
 * opened from the Session Cockpit's Change…. The cockpit's session takes the
 * change or gives it; the other till is picked from the branch's OPEN /
 * SUSPENDED sessions (grid 144, one read per status — the grid takes one —
 * and the same year: the change is one call in one accYear).
 *
 * POST /till/movements/change: a PICKUP on the giving session and a TOP_UP on
 * the taking one, both through the counters' safe, in one call. Till Sessions
 * (273) OVERRIDE. Both cashiers sign with their till PIN (notes 108):
 * `fromWitnessPin` always, `toWitnessPin` unless the caller is the taking
 * cashier. The giving cashier is never the caller. A PICKUP reason (some need
 * a note, `trs_needs_note`).
 *
 * Only the cockpit's own till knows its cashier's user id (grid 144 does not
 * list it), so "the caller is that cashier" is decided for this till alone —
 * as Qt does; the server judges the other one.
 */
import type { TillChangeBody } from "../shared/api/till-session-api";
import { textOf } from "../shared/format";
import type { GridRow, TillChangeResult, TillCountLine, TillSessionKey, TillSessionPayload } from "../shared/wire/types";
import { sessionGridParams } from "./session-list";

/** The statuses that take or give change — grid 144 is read once for each. */
export const CHANGE_SESSION_STATUSES = ["OPEN", "SUSPENDED"] as const;

/** One till of the change. */
export type ChangeTill = {
  tssId: string;
  sessionNo: string;
  cashier: string;
  /** Known for the cockpit's till only. */
  operatorId: string;
  counter: string;
};

export const NO_TILL: ChangeTill = { tssId: "", sessionNo: "", cashier: "", operatorId: "", counter: "" };

/** The cockpit's session as one side of the change. */
export function thisTillOf(s: TillSessionPayload): ChangeTill {
  return {
    tssId: s.tssId ?? "",
    sessionNo: s.tssSessionNo ?? "",
    cashier: s.operatorName ?? "",
    operatorId: s.tssOperatorId ?? "",
    counter: s.counterCode ?? "",
  };
}

/** Grid 144's params for one status of the branch's live tills (every date). */
export function changeGridParams(key: Pick<TillSessionKey, "companyId" | "branchId">, status: string): Record<string, string> {
  return sessionGridParams({ companyId: key.companyId, branchId: key.branchId, fromDate: "", toDate: "", status, variance: "" });
}

/** Grid 144's rows as the tills to pick: never this one, only this year (Qt `setOthers`). */
export function otherTillsOf(rows: readonly GridRow[], thisTssId: string, accYear: string): ChangeTill[] {
  const seen = new Set<string>([thisTssId]);
  const out: ChangeTill[] = [];
  for (const row of rows) {
    const tssId = textOf(row, "tss_id");
    if (!tssId || seen.has(tssId) || textOf(row, "tss_acc_year").trim() !== accYear.trim()) continue;
    seen.add(tssId);
    out.push({
      tssId,
      sessionNo: textOf(row, "tss_session_no"),
      cashier: textOf(row, "cashier"),
      operatorId: "",
      counter: textOf(row, "counter_code"),
    });
  }
  return out;
}

/** The other-till picker's first line: still loading, none open, or pick one. */
export function otherTillPlaceholder(others: readonly ChangeTill[] | null): string {
  if (others === null) return "Loading tills…";
  return others.length === 0 ? "No other till is open" : "Pick the other till";
}

/** An other-till option: `ZT2 · MEENA · ZT2-261015-01`. */
export function otherTillLabel(t: ChangeTill): string {
  return `${t.counter} · ${t.cashier} · ${t.sessionNo}`;
}

/** A side of the facts card: `ZT2 · MEENA`, or — before the other till is picked. */
export function tillName(t: ChangeTill): string {
  return t.tssId ? `${t.counter} · ${t.cashier}` : "—";
}

export const DIRECTION_OPTIONS = [
  { value: "takes", label: "Takes change from another till" },
  { value: "gives", label: "Gives change to another till" },
] as const;

export type ChangeForm = {
  /** This (the cockpit's) till gives the change; false = it takes it (the default). */
  gives: boolean;
  /** The other till's tss_id, "" = not picked. */
  otherId: string;
  reasonId: string;
  note: string;
  /** The giving cashier's till PIN. */
  fromPin: string;
  /** The taking cashier's till PIN (not asked when the caller is that cashier). */
  toPin: string;
};

export const EMPTY_CHANGE: ChangeForm = { gives: false, otherId: "", reasonId: "", note: "", fromPin: "", toPin: "" };

export type ChangeParties = {
  other: ChangeTill;
  giver: ChangeTill;
  taker: ChangeTill;
  /** The caller is the taking cashier: no PIN of their own. */
  takerIsCaller: boolean;
  /** The caller is the giving cashier: refused — another person carries it. */
  giverIsCaller: boolean;
};

function sameUser(a: string, b: string): boolean {
  return Boolean(a) && Boolean(b) && a.toLowerCase() === b.toLowerCase();
}

export function changeParties(
  thisTill: ChangeTill,
  others: readonly ChangeTill[] | null,
  form: Pick<ChangeForm, "gives" | "otherId">,
  callerId: string,
): ChangeParties {
  const other = (form.otherId && others?.find((t) => t.tssId === form.otherId)) || NO_TILL;
  const giver = form.gives ? thisTill : other;
  const taker = form.gives ? other : thisTill;
  return {
    other,
    giver,
    taker,
    takerIsCaller: sameUser(taker.operatorId, callerId),
    giverIsCaller: sameUser(giver.operatorId, callerId),
  };
}

/** The PIN boxes' captions: `MEENA's PIN *`, or the role before a till is picked. */
export function pinCaptions(parties: ChangeParties): { from: string; to: string } {
  return {
    from: `${parties.giver.cashier || "Giving cashier"}'s PIN *`,
    to: `${parties.taker.cashier || "Taking cashier"}'s PIN *`,
  };
}

/** Why it cannot go yet, or "" — the Post button's tooltip (Qt `problem`). */
export function changeProblem(parties: ChangeParties, form: ChangeForm, countedPaise: number, needsNote: boolean): string {
  if (!parties.other.tssId) return "Pick the other till.";
  if (parties.giverIsCaller) return "You are the giving cashier: another person carries the change.";
  if (countedPaise <= 0) return "Count the change that moves.";
  if (!form.reasonId) return "Pick the reason.";
  if (needsNote && !form.note.trim()) return "This reason needs a note.";
  if (!form.fromPin) return `${parties.giver.cashier} types their till PIN.`;
  if (!parties.takerIsCaller && !form.toPin) return `${parties.taker.cashier} types their till PIN.`;
  return "";
}

export function changeBody(
  key: Pick<TillSessionKey, "companyId" | "branchId" | "accYear">,
  parties: ChangeParties,
  form: ChangeForm,
  lines: TillCountLine[],
): TillChangeBody {
  const note = form.note.trim();
  return {
    companyId: key.companyId,
    branchId: key.branchId,
    accYear: key.accYear,
    fromTssId: parties.giver.tssId,
    toTssId: parties.taker.tssId,
    lines,
    reasonId: form.reasonId,
    fromWitnessPin: form.fromPin,
    ...(parties.takerIsCaller ? {} : { toWitnessPin: form.toPin }),
    ...(note ? { notes: note } : {}),
  };
}

export const CHANGE_COUNT_NOTE = "Count the change that moves, note by note.";

export const CHANGE_HINT =
  "The cash goes through the safe: a pickup from the giving till, a top-up into the taking one. Both cashiers " +
  "type their PIN.";

/** The refused PIN (the first error's field), typed again from empty. */
export function refusedChangePin(field: string): "from" | "to" | null {
  if (field === "fromWitnessPin") return "from";
  if (field === "toWitnessPin") return "to";
  return null;
}

/** The server's sentence, rebuilt from the answer as the controller words it. */
export function changeMessage(result: TillChangeResult): string {
  return `${result.from.tcmDocNo} → ${result.to.tcmDocNo}: ${result.from.tcmAmount} carried`;
}
