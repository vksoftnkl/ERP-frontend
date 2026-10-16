/**
 * The Session Cockpit (S5) — Qt `TillSessionCockpit` without the widgets: the
 * supervisor's / cash office's view of ONE till session, the only screen
 * that shows expected cash.
 *
 * Reads:
 *   GET /till/sessions/expected   header, tenders (open … out, expected,
 *                                 counted, variance), variances — Till
 *                                 Sessions (273) OVERRIDE; refused to the
 *                                 session's own cashier until it closes, then
 *                                 the blind GET /till/sessions/get.
 *   grids 146 bills + returns · 147 money documents · 148 counts ·
 *         145 timeline (till_event)
 *
 * Acts through the screens already built: Count / close (S4) on a COUNTING
 * session, the Slip check on a counted one, and Approve (notes 105 A: approve
 * with a treatment, or send back to recount — `variance-decide.ts`) on one
 * waiting for approval. No Cash movement since Qt a449b8c (notes 110: signed
 * at the counter).
 *
 * Qt c77f3f1 (notes 113 / 114 / 117) — Approve also takes a closed session's
 * cash into the safe (Approve Cash, `approve-cash.ts`) and books a received
 * bag's difference (the decide dialog in bag mode, with `tcmId`); Force close,
 * Reopen and X read act here (`force-close.ts`, `reopen.ts`, `x-read.ts`);
 * Print Z prints a closed session's Z; Re-tender changes how the Bills tab's
 * posted bill was paid (`cockpit-retender.tsx`). Who may is the server's call.
 *
 * Qt bec3f98 — a supervisor's Change between two live counters (`change.ts`)
 * and the Void of a hand-posted movement picked on the Money documents tab
 * (`../shared/movement-void.ts`).
 */
import type { DocumentPrintTarget } from "@/features/printing/domain/documentPrint";
import type { BillKey } from "@/features/sales/testbill/types";
import { clockOf, ddmmyyyy, durationText, textOf, type TillTone } from "../shared/format";
import { formatFigure, formatMoney, formatSignedMoney, paiseOf, paiseToNumber, toPaise } from "../shared/money";
import { CASH_TENDER_TYPE_ID } from "../shared/denom";
import { VOIDABLE_SESSION_KINDS, type MovementVoidRequest } from "../shared/movement-void";
import type {
  GridRow,
  TillSessionKey,
  TillSessionPayload,
  TillSessionTender,
  TillVariance,
} from "../shared/wire/types";

/** The read that failed over to the blind one (Qt `fetch(false)`). */
export function shouldFallBackToBlind(status: number | null, code: string): boolean {
  return status === 403 || code === "TILL_BLIND_CLOSE";
}

export type CockpitHeader = {
  title: string;
  sub: string;
  pill: string;
  pillTone: TillTone;
};

export function cockpitHeader(s: TillSessionPayload): CockpitHeader {
  const status = s.tssStatus ?? "";
  return {
    title: `Till Session  ${s.tssSessionNo}`,
    sub: `${s.operatorName ?? ""} · ${s.counterName ?? ""} (${s.counterCode ?? ""}) · business date ${ddmmyyyy(s.tssBusinessDate)}`,
    pill: status.replace(/_/g, " "),
    pillTone:
      status === "PENDING_APPROVAL" ? "red" : status === "CLOSED" ? "green" : status === "COUNTING" ? "amber" : "blue",
  };
}

export type CockpitFacts = {
  opened: string;
  ended: string;
  duration: string;
  float: string;
  count: string;
  witness: string;
  z: string;
  reopened: string;
};

export function cockpitFacts(s: TillSessionPayload, now: Date): CockpitFacts {
  const attempts = Number(s.tssCountAttempts ?? 0) || 0;
  return {
    opened: clockOf(s.tssOpenedOn) || "—",
    ended: s.tssBillingEndedOn ? clockOf(s.tssBillingEndedOn) : "—",
    duration: durationText(s.tssOpenedOn, s.tssBillingEndedOn || s.tssClosedOn, now),
    float: `${s.tssFloatMode ?? ""} ${formatMoney(paiseOf(s.tssFloatIssued))} · counted ${formatMoney(paiseOf(s.tssFloatCounted))}`,
    count: s.tssCountMode
      ? `${s.tssCountMode} · at ${s.tssCountPlace === "CASH_OFFICE" ? "cash office" : "counter"} · ${attempts} attempt${attempts === 1 ? "" : "s"}`
      : "—",
    witness: "—",
    z: s.tssZNo === null || s.tssZNo === undefined || String(s.tssZNo) === "" ? "issued on close" : String(s.tssZNo),
    reopened: "—",
  };
}

// ─── the tender reconciliation ───────────────────────────────────────────────

export const TENDER_FIGURES = [
  ["openAmount", "Open"],
  ["salesAmount", "Sales"],
  ["refundAmount", "Refunds"],
  ["receiptAmount", "Receipts"],
  ["paymentAmount", "Payments"],
  ["expenseAmount", "Expenses"],
  ["movedIn", "In"],
  ["movedOut", "Out"],
  ["expected", "Expected"],
  ["counted", "Counted"],
  ["variance", "Variance"],
] as const satisfies readonly (readonly [keyof TillSessionTender, string])[];

export type TenderCell = { text: string; tone: "" | "red" | "green" | "amber" | "muted" };

export type TenderRow = {
  key: string;
  tender: string;
  mode: string;
  cells: TenderCell[];
  reason: string;
  treatment: string;
};

/** Reason / treatment: the tender's latest close-stage variance row. */
function latestCloseVariance(variances: readonly TillVariance[], tender: TillSessionTender): TillVariance | null {
  let latest: TillVariance | null = null;
  for (const v of variances) {
    if (v.tvrStage === "OPEN") continue;
    if (v.tvrTenderTypeId !== tender.tenderTypeId) continue;
    if ((v.tvrTenderId ?? "") !== (tender.tenderId ?? "")) continue;
    latest = v;
  }
  return latest;
}

export function tenderRows(
  s: TillSessionPayload,
  reasonNames: ReadonlyMap<string, string>,
  expectedShown: boolean,
): { rows: TenderRow[]; totalVariance: TenderCell } {
  const variances = s.variances ?? [];
  let total = 0;
  const rows = (s.tenders ?? []).map((t, index) => {
    const cells: TenderCell[] = TENDER_FIGURES.map(([field]) => ({ text: formatFigure(t[field]), tone: "" as const }));
    const countedAt = TENDER_FIGURES.findIndex(([field]) => field === "counted");
    const expectedAt = TENDER_FIGURES.findIndex(([field]) => field === "expected");
    const varianceAt = TENDER_FIGURES.findIndex(([field]) => field === "variance");
    if (t.closeMode === "STATEMENT") {
      // Rows with no UTR can never be matched to the statement.
      const noRef = Number(t.noRefCount ?? 0) || 0;
      cells[countedAt] = {
        text: noRef > 0 ? `later · ${noRef} with no ref` : "later",
        tone: noRef > 0 ? "amber" : "muted",
      };
    } else if (t.closeMode === "NONE") {
      cells[expectedAt] = { text: "info", tone: "muted" };
    }
    const variance = toPaise(t.variance);
    if (variance !== null) {
      total += variance;
      cells[varianceAt] = { text: formatSignedMoney(variance), tone: variance < 0 ? "red" : variance > 0 ? "green" : "" };
    }
    const latest = latestCloseVariance(variances, t);
    return {
      key: `${t.tenderTypeId}|${t.tenderId ?? ""}|${index}`,
      tender: t.tenderName || t.tenderTypeName || "",
      mode: t.closeMode,
      cells,
      reason: latest?.tvrReasonId ? (reasonNames.get(latest.tvrReasonId) ?? "") : "",
      treatment: (latest?.tvrTreatment ?? "").replace(/_/g, " "),
    };
  });
  // The total of the counted tenders' variances — only where the figures are shown.
  return { rows, totalVariance: { text: expectedShown ? formatSignedMoney(total) : "", tone: "" } };
}

// ─── the approval band ───────────────────────────────────────────────────────

export type ApprovalBand = {
  code: string;
  amount: string;
  text: string;
  note: string;
};

/**
 * The PENDING variance an approver decides — the cash one when there is one
 * (the last PENDING row wins only if it is cash, as Qt picks it). A received
 * bag's RECEIVE-stage difference is not one of them: it has its own band
 * (`pendingReceive`).
 */
export function pendingVariance(s: TillSessionPayload): TillVariance | null {
  let pending: TillVariance | null = null;
  for (const v of s.variances ?? []) {
    if (v.tvrTreatment !== "PENDING" || v.tvrStage === "RECEIVE") continue;
    if (!pending || v.tvrTenderTypeId === CASH_TENDER_TYPE_ID) pending = v;
  }
  return pending;
}

/**
 * Notes 113: a received bag's difference still waiting for an approver (any
 * session status) — the first PENDING RECEIVE-stage row, as Qt finds it.
 */
export function pendingReceive(s: TillSessionPayload | null): TillVariance | null {
  for (const v of s?.variances ?? []) {
    if (v.tvrStage === "RECEIVE" && v.tvrTreatment === "PENDING") return v;
  }
  return null;
}

/** Notes 114: the session's hand-over / drops not yet approved into the safe. */
export function cashAwaiting(s: TillSessionPayload | null): boolean {
  return s?.receiptState === "AWAITING";
}

/** The bag's doc no (the hand-over / drop the receive difference names); its id's head when not listed. */
export function bagDocNo(s: TillSessionPayload | null, tcmId: string): string {
  for (const m of s?.movements ?? []) {
    if (m.tcmId === tcmId) return m.tcmDocNo ?? "";
  }
  return tcmId.slice(0, 8);
}

/**
 * A variance waiting for an approver (Qt `showSession`, c77f3f1):
 *   1. a received bag's difference (RECEIVE_VARIANCE) on a session not itself
 *      waiting for approval;
 *   2. a CLOSED session's cash not yet approved into the safe, with no gap
 *      pending (CASH_TO_APPROVE, notes 114);
 *   3. else a drawer variance first; a slip gap (non-cash) is final with the
 *      count and waits for the slip check — reported, not enforced; a cash gap
 *      still PENDING on a closed session is an orphan nothing posts any more.
 *
 * One adaptation: Qt raises the band for cash awaiting receipt on a session
 * of ANY status, and on a live one (a drop waiting for the cash office) it
 * then falls through to case 3 with nothing pending — "The count is out of
 * tolerance after the last recount." on an open session. Here the awaiting
 * cash raises the band only on the CLOSED session its own case is about.
 */
export function approvalBand(s: TillSessionPayload): ApprovalBand | null {
  const pending = pendingVariance(s);
  const receive = pendingReceive(s);
  const status = s.tssStatus ?? "";
  const cashToApprove = status === "CLOSED" && cashAwaiting(s);
  if (status !== "PENDING_APPROVAL" && !pending && !receive && !cashToApprove) return null;

  if (status !== "PENDING_APPROVAL" && receive) {
    const diff = paiseOf(receive.tvrVariance);
    return {
      code: "RECEIVE_VARIANCE",
      amount: formatSignedMoney(diff),
      text:
        `The cash was approved ${formatSignedMoney(diff)} against what was handed over ` +
        `(${bagDocNo(s, receive.tvrMovementId ?? "")}) — the difference waits for another approver.`,
      note:
        "Approve books it at once (a treatment and a reason; no recount — the supervisor's count stands). Neither " +
        "that supervisor nor the session's cashier decides it.",
    };
  }

  if (!pending && cashToApprove) {
    // Notes 114: the cash is not the safe's until a supervisor approves it.
    const awaiting = formatMoney(paiseOf(s.cashAwaiting));
    return {
      code: "CASH_TO_APPROVE",
      amount: awaiting,
      text: `${s.operatorName ?? ""} handed over ${awaiting} — it is not in the safe until a supervisor approves it.`,
      note: "Approve Cash: take the cash, check it, type what you received and your PIN. Not the session's cashier.",
    };
  }

  const slips = pending !== null && pending.tvrTenderTypeId !== CASH_TENDER_TYPE_ID;
  const variance = pending ? paiseOf(pending.tvrVariance) : 0;
  // A cash gap still PENDING on a closed session: it closed after a Recount
  // with no new count, so nothing decides or posts it any more.
  const orphan = !slips && pending !== null && status === "CLOSED";
  return {
    code: pending?.tvrStage === "OPEN" ? "FLOAT_MISMATCH" : slips ? "NONCASH_VARIANCE" : "CASH_VARIANCE",
    amount: pending ? formatSignedMoney(variance) : "",
    text: orphan
      ? `${formatSignedMoney(variance)} — the session closed without a decision, so it is NOT posted.`
      : !pending
        ? "The count is out of tolerance after the last recount."
        : slips
          ? `A slip total differs by ${formatSignedMoney(variance)} — check the slips (Slip check), re-tender what was keyed wrong; the rest waits for the approver.`
          : `${formatSignedMoney(variance)} against a tolerance of ${formatMoney(paiseOf(pending.tvrTolerance))} — waits for a supervisor.`,
    note: orphan
      ? "A closed session cannot be approved (only one waiting for approval). Book the gap by a journal to Cash " +
        "Short & Excess, or ask the server team to reopen the decision."
      : slips && status !== "PENDING_APPROVAL"
        ? "Reported, not enforced: the session closes and nothing posts for the gap. The card money's truth comes " +
          "with the statement — a row never paid shows in Settlement → Not received."
        : "Approve decides it: a treatment and a reason, or send it back to recount. Not the session's cashier — a " +
          "supervisor or above with an Approval Setup (276) grant, or a super admin.",
  };
}

export function footNote(expectedShown: boolean, mine: boolean): string {
  if (expectedShown) return "Expected figures: the server's own.";
  return mine
    ? "You are this session's cashier: its expected figures stay hidden until it closes (blind close)."
    : "Expected figures hidden: they need the Till Sessions (273) override right while the session is open.";
}

// ─── the tiles ───────────────────────────────────────────────────────────────

export type CockpitTiles = {
  bills: number;
  returns: number;
  receipts: number;
  noSales: number;
  pickups: number;
  expenses: number;
  retenders: number;
  recounts: number;
  netSales: string;
  voids: string;
  /** Tab captions. */
  billsTab: string;
  moneyTab: string;
  countsTab: string;
  /** Open on the first tab with something in it. */
  firstTab: "bills" | "money" | null;
};

export function cockpitTiles(
  s: TillSessionPayload | null,
  rows: { bills: readonly GridRow[]; money: readonly GridRow[]; counts: readonly GridRow[]; events: readonly GridRow[] },
): CockpitTiles {
  let bills = 0;
  let returns = 0;
  let net = 0;
  for (const row of rows.bills) {
    // A draft or a cancelled bill took no money: listed, never counted.
    if (textOf(row, "tb_status") !== "POSTED") continue;
    if (textOf(row, "tb_kind") === "RETURN") returns += 1;
    else bills += 1;
    net += paiseOf(row.tb_amount);
  }
  let receipts = 0;
  let expenses = 0;
  let pickups = 0;
  for (const row of rows.money) {
    const status = textOf(row, "md_status").toUpperCase();
    if (status === "CANCELLED" || status === "VOIDED" || status === "DRAFT") continue;
    const kind = textOf(row, "md_kind").toUpperCase();
    if (kind.includes("RECEIPT")) receipts += 1;
    else if (kind.includes("EXPENSE")) expenses += 1;
    else if (kind === "PICKUP") pickups += 1;
  }
  let noSales = 0;
  let retenders = 0;
  for (const row of rows.events) {
    const code = textOf(row, "tev_event_code").toUpperCase();
    if (code === "NO_SALE") noSales += 1;
    else if (code === "RETENDER") retenders += 1;
  }
  const attempts = s ? Number(s.tssCountAttempts ?? 0) || 0 : 0;
  const closed = s?.tssStatus === "CLOSED";
  return {
    bills,
    returns,
    receipts,
    noSales,
    pickups,
    expenses,
    retenders,
    recounts: Math.max(0, attempts - 1),
    netSales: formatMoney(closed ? paiseOf(s?.totals?.netSales) : net),
    voids: "— (void module)",
    billsTab: `Bills ${bills + returns}`,
    moneyTab: `Money documents ${rows.money.length}`,
    countsTab: `Counts ${rows.counts.length}`,
    firstTab: bills + returns > 0 ? "bills" : rows.money.length > 0 ? "money" : null,
  };
}

// ─── the buttons ─────────────────────────────────────────────────────────────

export type SlipTender = { tenderId: string; name: string };

/** The session's SLIPS tenders that name a terminal (an unnamed line cannot be checked by tender). */
export function slipTenders(s: TillSessionPayload | null): SlipTender[] {
  return (s?.tenders ?? [])
    .filter((t) => t.closeMode === "SLIPS" && t.tenderId)
    .map((t) => ({ tenderId: t.tenderId as string, name: t.tenderName || t.tenderTypeName || "" }));
}

/**
 * No Cash movement (Qt a449b8c, notes 110): a pickup / top-up is signed at the
 * counter by the cashier and the supervisor together, never from the office.
 */
export type CockpitButtons = {
  count: boolean;
  slipCheck: boolean;
};

export function cockpitButtons(s: TillSessionPayload | null): CockpitButtons {
  const status = s?.tssStatus ?? "";
  const checkable = status === "COUNTING" || status === "PENDING_APPROVAL" || status === "CLOSED";
  // Only on a mismatch: a SLIPS line whose variance is not zero — or not known
  // here (hidden from the cashier until the close).
  let mismatch = false;
  for (const t of s?.tenders ?? []) {
    if (t.closeMode !== "SLIPS") continue;
    const variance = toPaise(t.variance);
    mismatch = mismatch || variance === null || variance !== 0;
  }
  return {
    count: status === "COUNTING",
    slipCheck: checkable && mismatch && slipTenders(s).length > 0,
  };
}

/** The signed-in user is the session's own cashier. */
export function isMine(s: TillSessionPayload | null, me: string): boolean {
  return Boolean(me) && (s?.tssOperatorId ?? "").toLowerCase() === me.toLowerCase();
}

/**
 * What Approve opens (Qt `decideVariance`, c77f3f1): a CLOSED session's cash
 * awaiting receipt with no bag difference → Approve Cash; a bag difference on a
 * session not waiting for approval → the decide dialog on that bag (tcmId);
 * else the decide dialog on the session's pending gap.
 */
export type ApproveAction = "approveCash" | "bag" | "decide";

export type ApproveButton = {
  enabled: boolean;
  tip: string;
  label: "Approve" | "Approve Cash";
  action: ApproveAction;
};

/**
 * Approve: a session waiting for approval, or a bag's difference — never by
 * its own cashier; a closed session's cash to approve — enabled for anyone,
 * the cashier included: the server refuses them unless the shop runs
 * single-operator (notes 114), so the owner of a one-person shop may press it.
 */
export function approveButton(s: TillSessionPayload | null, me: string): ApproveButton {
  const status = s?.tssStatus ?? "";
  const pendingApproval = status === "PENDING_APPROVAL";
  const mine = isMine(s, me);
  const receive = pendingReceive(s);
  const bagWaiting = receive !== null;
  const cashToApprove = status === "CLOSED" && cashAwaiting(s);
  const pending = s ? pendingVariance(s) : null;
  return {
    enabled: ((pendingApproval || bagWaiting) && !mine) || cashToApprove,
    tip:
      cashToApprove && !pendingApproval && !bagWaiting
        ? "Approve the cash handed over into the safe"
        : !pendingApproval && !bagWaiting
          ? "Only a session waiting for approval, its cash to approve, or an approved cash difference"
          : mine
            ? "You are this session's cashier: another person approves it"
            : "Approve with a treatment, or send it back to recount",
    label: cashToApprove && !pending && !receive ? "Approve Cash" : "Approve",
    action: status === "CLOSED" && !receive && cashAwaiting(s) ? "approveCash" : !pendingApproval && receive ? "bag" : "decide",
  };
}

export type ButtonState = { enabled: boolean; tip: string };

export type ExceptionButtons = {
  forceClose: ButtonState;
  reopen: ButtonState;
  xRead: ButtonState;
  printZ: ButtonState;
};

/**
 * Notes 117 (Qt `refreshButtons`, c77f3f1): Force close a session whose
 * cashier has gone; Reopen a closed one; X read a live one; Print Z a closed
 * one. Never the session's own cashier — the rest (273 OVERRIDE, the
 * FORCE_CLOSE / SESSION_REOPEN rule) is the server's call.
 */
export function exceptionButtons(s: TillSessionPayload | null, me: string): ExceptionButtons {
  const status = s?.tssStatus ?? "";
  const mine = isMine(s, me);
  const live = status === "OPEN" || status === "SUSPENDED" || status === "COUNTING";
  const closed = status === "CLOSED";
  const receipt = s?.receiptState ?? "";
  const cashIn = receipt === "APPROVED" || receipt === "DIFFERENCE";
  const readable = live || status === "PENDING_APPROVAL";
  return {
    forceClose: {
      enabled: live && !mine,
      tip: mine
        ? "You are this session's cashier: a store manager force-closes it"
        : live
          ? "Count the drawer and close the session for a cashier who has gone"
          : "Only a session still open, suspended or counting",
    },
    reopen: {
      enabled: closed && !mine && !cashIn,
      tip: !closed
        ? "Only a closed session is reopened"
        : mine
          ? "You are this session's cashier: a store manager reopens it"
          : cashIn
            ? "Its cash is already approved into the safe: the session stays closed"
            : "Back to counting: the hand-over is voided and the close reversed",
    },
    xRead: {
      enabled: readable && !mine,
      tip: !readable
        ? "A closed session prints its Z instead"
        : mine
          ? "Your own session's figures stay hidden until it closes (blind close)"
          : "Read the session's expected figures now (journalled)",
    },
    printZ: {
      enabled: closed,
      tip: closed ? "Print the session's Z (80 mm)" : "A Z is printed once the session is closed: X read reads a live one",
    },
  };
}

/** The Bills tab's row when it is a posted BILL — a return is not re-tendered here. */
export function retenderableBill(row: GridRow | null | undefined): GridRow | null {
  if (!row) return null;
  return textOf(row, "tb_kind") === "BILL" && textOf(row, "tb_status") === "POSTED" ? row : null;
}

/** The bill Re-tender opens on: the sale bill's own key. */
export type RetenderTarget = { key: BillKey; refno: string };

/**
 * The bill to re-tender (Qt `retenderBill`): its id from the Bills tab
 * (`tb_id`), its company / branch / year the cockpit's.
 */
export function retenderTargetOf(bill: GridRow, scope: TillSessionKey): RetenderTarget {
  return {
    key: { sbId: textOf(bill, "tb_id"), sbCompanyId: scope.companyId, sbBranchId: scope.branchId, sbAccYear: scope.accYear },
    refno: textOf(bill, "tb_refno"),
  };
}

/** Re-tender the bill picked on the Bills tab (the sale bill's Ctrl+F6 dialog). */
export function retenderButton(bill: GridRow | null): ButtonState {
  return bill
    ? { enabled: true, tip: `Change how bill ${textOf(bill, "tb_refno")} was paid` }
    : { enabled: false, tip: "Pick a posted bill on the Bills tab to change how it was paid" };
}

// ─── change and void (Qt bec3f98) ────────────────────────────────────────────

/**
 * The Money documents tab's row when it is a POSTED hand-posted movement — a
 * drop, paid in, exchange, pickup or top-up; never the float, the hand-over
 * or a voucher (Qt `currentMovement`).
 */
export function voidableMovement(row: GridRow | null | undefined): GridRow | null {
  if (!row) return null;
  const kind = textOf(row, "md_kind");
  return (VOIDABLE_SESSION_KINDS as readonly string[]).includes(kind) && textOf(row, "md_status") === "POSTED" ? row : null;
}

/** The void dialog's movement: grid 147's id (`md_id` = tcm_id), the cockpit's company / branch / year. */
export function movementVoidRequestOf(row: GridRow, scope: TillSessionKey): MovementVoidRequest {
  return {
    key: { companyId: scope.companyId, branchId: scope.branchId, accYear: scope.accYear, tcmId: textOf(row, "md_id") },
    docNo: textOf(row, "md_doc"),
    kind: textOf(row, "md_kind"),
    amount: paiseToNumber(paiseOf(row.md_amount)),
  };
}

/**
 * Change…: an OPEN or SUSPENDED session takes or gives change (273 OVERRIDE;
 * the server judges the rest — the giving cashier is never the caller).
 */
export function changeButton(s: TillSessionPayload | null): ButtonState {
  const status = s?.tssStatus ?? "";
  const taking = status === "OPEN" || status === "SUSPENDED";
  return {
    enabled: taking,
    tip: taking
      ? "Carry change from another open till to this one, or from this one"
      : "Only an open or suspended session takes or gives change",
  };
}

/**
 * Void movement…: the picked hand-posted movement, while the session still
 * takes money (OPEN, SUSPENDED or COUNTING). The server judges the rest: a
 * final count, a bag already in the safe.
 */
export function voidMovementButton(s: TillSessionPayload | null, move: GridRow | null): ButtonState {
  const status = s?.tssStatus ?? "";
  const live = status === "OPEN" || status === "SUSPENDED" || status === "COUNTING";
  return {
    enabled: live && move !== null,
    tip: !live
      ? "Only while the session still takes money"
      : !move
        ? "Pick a drop, paid in, pickup or top-up on the Money documents tab"
        : `Void ${textOf(move, "md_doc")}`,
  };
}

/** The info boxes' titles once a change or a void is done (Qt `AppMessage::showInfo`). */
export const CHANGE_DONE_TITLE = "Change between counters";
export const VOID_DONE_TITLE = "Void movement";

// ─── printing (notes 117 §7) ─────────────────────────────────────────────────

/**
 * The session as a print document: docId = tss_id, with the cockpit's own
 * company, year and branch (branch.profile prints the letterhead) — the file
 * `z-<session no>` / `x-<session no>`, spaces as underscores.
 */
export function sessionPrintTarget(key: TillSessionKey, sessionNo: string, prefix: "z" | "x"): DocumentPrintTarget {
  return {
    docId: key.tssId,
    companyId: key.companyId,
    accYear: key.accYear,
    branchId: key.branchId,
    filename: `${prefix}-${sessionNo}`.replace(/ /g, "_"),
  };
}

export function printZLabel(sessionNo: string): string {
  return `Session Z ${sessionNo}`;
}

export function xReadLabel(sessionNo: string): string {
  return `X read ${sessionNo}`;
}

// ─── what the cockpit says once an exception is done ─────────────────────────

/** Qt's info after a bag's difference is approved (notes 113). */
export const BAG_DECIDED_MESSAGE = "Approved: the bag's difference is booked.";

export const REC_NOTE =
  "Card is one line per terminal (batch total at End Shift). A non-cash gap → re-tender first, then SUSPENSE — never " +
  "short & excess. UPI is matched to the statement later; NONE rows are information.";

export const REC_HINT = "expected = open + sales − refunds + receipts − payments − expenses + in − out  (server)";

// ─── the grids under the reconciliation ──────────────────────────────────────

/** The money columns of grids 145–148, by SQL alias — the runner sends them as strings. */
export const MONEY_FIELDS: ReadonlySet<string> = new Set([
  "tb_amount",
  "md_amount",
  "tct_total_counted",
  "tct_expected",
  "tev_amount",
]);

/** A pick list's next row for ↑ / ↓ / Home / End, or -1 for a key that is not one of them. */
export function pickedIndexAfter(key: string, current: number, count: number): number {
  if (count <= 0) return -1;
  switch (key) {
    case "ArrowDown":
      return current < 0 ? 0 : Math.min(count - 1, current + 1);
    case "ArrowUp":
      return current < 0 ? 0 : Math.max(0, current - 1);
    case "Home":
      return 0;
    case "End":
      return count - 1;
    default:
      return -1;
  }
}

/** A grid cell's text: money as money, the rest as sent. */
export function gridCellText(row: GridRow, field: string): string {
  if (MONEY_FIELDS.has(field)) return formatFigure(row[field]);
  return textOf(row, field);
}

