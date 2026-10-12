/**
 * The slip check of one card terminal of a session whose billing has ended
 * (plan-noncash-tender-control §4.2) — Qt `TillSlipCheckDialog` without the
 * widgets.
 *
 * `GET /till/sessions/slip-check`: the terminal's expected figure, the batch
 * total / batch no / slips the cashier entered at End Shift, and every live
 * row of that tender in the session. The supervisor ticks each row against the
 * paper slips, marks an amount that differs, and adds any slip with no row (a
 * card payment billed as another tender). POST records the verdict as a
 * SLIP_CHECK event — the ticks themselves are never stored, only the rows with
 * no slip, the differing amounts and the slips with no row.
 */
import { clockOf } from "../shared/format";
import { formatFigure, formatMoney, formatSignedMoney, paiseOf, paiseToNumber, toPaise } from "../shared/money";
import type { TillSlipCheckBody } from "../shared/api/till-session-api";
import type { TillSessionKey, TillSlipCheckPayload, TillSlipCheckRow } from "../shared/wire/types";

/** One row's two boxes. "Slip?" starts ticked — the usual answer; untick the row with no slip. */
export type RowMarks = { slip: boolean; differs: boolean };

export type SlipWithoutRow = { amountPaise: number; authCode: string; cardLast4: string };

export function initialMarks(rows: readonly TillSlipCheckRow[]): RowMarks[] {
  return rows.map(() => ({ slip: true, differs: false }));
}

/** A refund (CR) counts against the batch. */
export function signedRowPaise(row: TillSlipCheckRow): number {
  const amount = paiseOf(row.amount);
  return row.drCr === "CR" ? -amount : amount;
}

export type SlipFacts = {
  title: string;
  batch: string;
  slips: string;
  expected: string;
  batchTotal: string;
  short: string;
  shortDanger: boolean;
  countLine: string;
};

export function slipFacts(data: TillSlipCheckPayload, fallbackTender: string): SlipFacts {
  const tender = data.tenderName || fallbackTender;
  const difference = toPaise(data.difference);
  return {
    title: `Slip check — ${data.tssSessionNo} · ${tender}`,
    batch: data.batchRef || "—",
    slips: data.slipCount === null || data.slipCount === undefined ? "—" : String(data.slipCount),
    expected: formatFigure(data.expected) || "—",
    batchTotal: formatFigure(data.batchTotal) || "—",
    short: difference === null ? "—" : formatSignedMoney(difference),
    shortDanger: difference !== null && difference < 0,
    countLine: `SLIPS · tcl_tender_id = ${tender}`,
  };
}

export type RowView = {
  key: string;
  time: string;
  bill: string;
  kind: "SALE" | "REFUND";
  amount: string;
  auth: string;
  result: string;
  tone: "red" | "amber" | "green";
  /** A row with no slip is tinted. */
  tinted: boolean;
  /** An amount can differ only on a slip that exists. */
  differsEnabled: boolean;
};

export type SlipResult = {
  rows: RowView[];
  ticked: number;
  noRowCount: string;
  explained: string;
  unexplained: string;
  unexplainedDanger: boolean;
  treatment: string;
  later: string;
  approval: { amount: string; text: string } | null;
  recordLabel: string;
};

export function slipResult(
  data: TillSlipCheckPayload | null,
  marks: readonly RowMarks[],
  slips: readonly SlipWithoutRow[],
): SlipResult {
  const rows = data?.rows ?? [];
  let ticked = 0;
  let noSlipSum = 0;
  const noSlipBills: string[] = [];
  const views: RowView[] = rows.map((row, index) => {
    const mark = marks[index] ?? { slip: true, differs: false };
    const refund = row.drCr === "CR";
    const auth = [row.authCode ?? "", row.cardLast4 ?? ""].join(" · ");
    let result: string;
    let tone: RowView["tone"];
    if (!mark.slip) {
      noSlipSum += signedRowPaise(row);
      noSlipBills.push(row.docRefno ?? "");
      result = `no slip — this payment is on no slip of batch ${data?.batchRef ?? ""}`;
      tone = "red";
    } else if (mark.differs) {
      ticked += 1;
      result = "slip found — the amount on the slip differs";
      tone = "amber";
    } else {
      ticked += 1;
      result = "slip found";
      tone = "green";
    }
    return {
      key: row.tdId || String(index),
      time: clockOf(row.time) || row.time,
      bill: row.docRefno ?? "",
      kind: refund ? "REFUND" : "SALE",
      amount: formatMoney(signedRowPaise(row)),
      auth: auth === " · " ? (row.refNo ?? "") : auth,
      result,
      tone,
      tinted: !mark.slip,
      differsEnabled: mark.slip,
    };
  });
  const slipsSum = slips.reduce((sum, slip) => sum + slip.amountPaise, 0);
  return {
    rows: views,
    ticked,
    noRowCount: String(slips.length),
    explained:
      slips.length === 0
        ? "0.00 — no slip without a bill"
        : `${formatMoney(slipsSum)} — ${slips.length} slip${slips.length === 1 ? "" : "s"} with no bill: re-tender those bills to card`,
    unexplained:
      noSlipBills.length === 0 ? "0.00" : `${formatSignedMoney(-noSlipSum)} · ${noSlipBills.join(", ")} — keyed, matched no slip`,
    unexplainedDanger: noSlipBills.length > 0,
    treatment: "SUSPENSE (till.noncash_variance_default) — never EXPENSE at the counter",
    later: "the statement decides: paid → settles out of suspense; not paid → write-off (Settlement Reconciliation)",
    approval:
      noSlipBills.length > 0
        ? { amount: formatMoney(Math.abs(noSlipSum)), text: "the approver the rule for this branch names (Approval Setup)" }
        : null,
    recordLabel: `Record the check  (${ticked} ticked)`,
  };
}

export function slipCheckBody(
  key: TillSessionKey,
  tenderId: string,
  data: TillSlipCheckPayload | null,
  marks: readonly RowMarks[],
  slips: readonly SlipWithoutRow[],
): TillSlipCheckBody {
  const rows = data?.rows ?? [];
  let ticked = 0;
  const noSlip: string[] = [];
  const amountDiffers: string[] = [];
  rows.forEach((row, index) => {
    const mark = marks[index] ?? { slip: true, differs: false };
    if (mark.slip) ticked += 1;
    else noSlip.push(row.tdId);
    if (mark.slip && mark.differs) amountDiffers.push(row.tdId); // no slip says it all
  });
  return {
    ...key,
    tenderId,
    ticked,
    noSlip,
    amountDiffers,
    slipsWithoutRow: slips.map((slip) => ({
      amount: paiseToNumber(slip.amountPaise),
      authCode: slip.authCode.trim() || null,
      cardLast4: slip.cardLast4.trim() || null,
    })),
    notes: null,
  };
}

export const SLIP_SUB =
  "Checked slip by slip, only because the machine total disagreed: tick each row against the paper slips; add any " +
  "slip no row explains.";
export const SLIP_VERB_NOTE = "The ticks are a screen aid and are not stored; a SLIP_CHECK event keeps the counts and the exceptions.";
export const SLIP_APPROVAL_NOTE =
  "What the slips cannot explain is the NONCASH_VARIANCE an approver decides (SUSPENSE by default — never EXPENSE " +
  "at the counter). The approval gate is till build phase 3: until then record the check here; the variance waits " +
  "on the session.";
export const SLIP_RETENDER_TIP = "Re-tender the bill from the sale bill (Ctrl+F6) — then recount this check";
