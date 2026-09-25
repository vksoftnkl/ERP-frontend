/**
 * Sale Bill Entry — the adjust engine (§14): clamp, FIFO, release, the
 * held-by-document merge and the "absent ≠ empty" rule. Pure.
 *
 * There is ONE set of adjusted amounts per bill. F4 and the tender dialog's
 * ADJUST row both render the same panel bound to it; nothing here is a tender.
 */
import { money } from "@/domain/pricing";
import type { AdjustableCredit, BillAdjustmentRow, BillAdjustmentSummary } from "./salebill.types";

const EPSILON = 0.005;

/** The credit's row key: `abl_id` and its year together ARE the credit. */
export function adjustmentKeyOf(credit: Pick<AdjustableCredit, "billId" | "billAccYear">): string {
  return `${credit.billId}:${credit.billAccYear}`;
}

/**
 * `pending = pendingAmount + heldByDocument[billId]` (§14.2): a POSTED bill
 * being amended gets its own set-offs back. The live pending excludes what
 * this bill holds, so without this an amend re-sends a short set-off.
 * Credits the bill used up entirely — absent from the live list — are rebuilt
 * from its saved rows. Rows with `pending ≤ 0.005` are dropped.
 */
export function mergeHeldCredits(
  credits: AdjustableCredit[],
  held: BillAdjustmentSummary[],
): AdjustableCredit[] {
  const heldById = new Map<string, BillAdjustmentSummary>();
  for (const row of held) {
    heldById.set(row.againstBillId, row);
  }
  const merged: AdjustableCredit[] = credits.map((credit) => {
    const own = heldById.get(credit.billId);
    if (!own) {
      return credit;
    }
    heldById.delete(credit.billId);
    return { ...credit, pendingAmount: money(credit.pendingAmount + own.amount) };
  });
  for (const own of heldById.values()) {
    const isAdvance = own.adjType.toUpperCase().includes("ADVANCE");
    merged.push({
      billId: own.againstBillId,
      billAccYear: own.againstBillAccYear,
      billType: isAdvance ? "ADVANCE" : "SALES_RETURN",
      drCr: "CR",
      docRefno: own.refno ?? own.againstBillId.slice(0, 8),
      docDate: "",
      billAmount: own.amount,
      pendingAmount: own.amount,
      status: "OPEN",
      srcModule: null,
      srcDocType: null,
      srcDocId: null,
      srcAccYear: null,
      narration: null,
      adjType: isAdvance ? "ADVANCE_ADJUST" : "NOTE_ADJUST",
      settlementMode: isAdvance ? "ADVANCE" : "CREDIT_NOTE",
    });
  }
  return merged.filter((credit) => credit.pendingAmount > EPSILON);
}

/**
 * `setDocumentTotal(bill)` after every recompute (§14.2): if Σ adjusted >
 * bill, TRIM FIFO — keep the oldest, cut later rows. A line delete can never
 * leave the bill over-adjusted; the server's `ck_abl_settled` would refuse it.
 */
export function clampAdjustmentsToBill(rows: BillAdjustmentRow[], bill: number): { rows: BillAdjustmentRow[]; changed: boolean } {
  let room = Math.max(0, money(bill));
  let changed = false;
  const next: BillAdjustmentRow[] = [];
  for (const row of rows) {
    const take = Math.min(Math.max(0, row.amount), room);
    if (Math.abs(take - row.amount) > 1e-9) {
      changed = true;
    }
    room = money(room - take);
    if (take > EPSILON) {
      next.push(take === row.amount ? row : { ...row, amount: money(take) });
    } else if (row.amount > EPSILON) {
      changed = true;
    }
  }
  return { rows: next, changed };
}

/** Adjust All (§14.2): fill FIFO up to the bill. */
export function adjustAll(credits: AdjustableCredit[], bill: number): BillAdjustmentRow[] {
  let room = Math.max(0, money(bill));
  const rows: BillAdjustmentRow[] = [];
  for (const credit of credits) {
    if (room <= EPSILON) {
      break;
    }
    const take = money(Math.min(credit.pendingAmount, room));
    if (take <= EPSILON) {
      continue;
    }
    rows.push({ key: adjustmentKeyOf(credit), credit, amount: take });
    room = money(room - take);
  }
  return rows;
}

/**
 * Absent ≠ empty (§14.4): `authoritative = loadedAdjustments.length > 0 ||
 * sbAdvanceAmt ≤ 0.005`. When false, the save OMITS the `adjustments` key
 * entirely — `[]` would reverse every set-off.
 */
export function adjustmentsAuthoritative(loadedCount: number, advanceAmt: number, noteAdjAmt: number): boolean {
  return loadedCount > 0 || money(advanceAmt + noteAdjAmt) <= EPSILON;
}

/** The rows a POSTED bill's live set-offs rebuild, before the panel has loaded the credits. */
export function rowsFromHeld(held: BillAdjustmentSummary[]): BillAdjustmentRow[] {
  return mergeHeldCredits([], held).map((credit) => ({
    key: adjustmentKeyOf(credit),
    credit,
    amount: credit.pendingAmount,
  }));
}

export type ReconcileNotice = { refno: string; before: number; after: number };

/**
 * Restoring a held bill reconciles against today's open credits (§14.5):
 * rows no longer open are dropped; rows with less left are reduced. ONE
 * notice lists them all.
 */
export function reconcileRestoredAdjustments(
  rows: BillAdjustmentRow[],
  credits: AdjustableCredit[],
): { rows: BillAdjustmentRow[]; notices: ReconcileNotice[] } {
  const byKey = new Map(credits.map((credit) => [adjustmentKeyOf(credit), credit]));
  const notices: ReconcileNotice[] = [];
  const next: BillAdjustmentRow[] = [];
  for (const row of rows) {
    const live = byKey.get(adjustmentKeyOf(row.credit));
    if (!live || live.pendingAmount <= EPSILON) {
      notices.push({ refno: row.credit.docRefno, before: row.amount, after: 0 });
      continue;
    }
    if (row.amount > live.pendingAmount + EPSILON) {
      notices.push({ refno: row.credit.docRefno, before: row.amount, after: live.pendingAmount });
      next.push({ ...row, credit: live, amount: money(live.pendingAmount) });
      continue;
    }
    next.push({ ...row, credit: live });
  }
  return { rows: next, notices };
}

export function reconcileNoticeText(notices: ReconcileNotice[]): string | null {
  if (notices.length === 0) {
    return null;
  }
  const lines = notices.map((notice) =>
    notice.after <= EPSILON
      ? `${notice.refno}: no longer open — its ${notice.before.toFixed(2)} was dropped.`
      : `${notice.refno}: only ${notice.after.toFixed(2)} left — reduced from ${notice.before.toFixed(2)}.`,
  );
  return `Some credits changed since this bill was put aside:\n\n${lines.join("\n")}`;
}
