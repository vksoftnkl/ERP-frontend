/**
 * Bill-wise on a many-party voucher — the Qt `VoucherBillwiseDialog` and the
 * entry's bookkeeping around it.
 *
 * Each party line of a Receipt / Payment Voucher settles that party's OWN
 * bills (a receipt's customer line its DR bills, a payment's supplier line
 * its CR bills). The popup opens on the line's amount — the server's party
 * leg, which on a payment with TDS is the GROSS — fills it oldest first, and
 * lets a figure be changed; the part not set against a bill is an ADVANCE
 * (on account), which the server raises as a bill of its own.
 *
 * What is kept per screen line is only the figures (bill → paise); the open
 * bills are read again each time the popup opens, so a figure is always
 * shown against what the bill owes now.
 *
 * A ONE-party type (the accounting Sales / Purchase, the notes) has no popup:
 * its card sits under the grid, against the party's bills on the side its
 * party leg settles, kept under `PARTY_KEY` and sent as `lineRowNo` 0 — the
 * generated party leg. Whatever is not set against a bill stays open on the
 * bill the voucher raises.
 */
import type { DerivedBill, OpenBillRow, StoredDraft, VoucherAllocationBody } from "../vouchers.types";
import { amountPaise, paiseText } from "./lines";

/** Where a one-party voucher keeps its card's figures: the party leg, `lineRowNo` 0. */
export const PARTY_KEY = "__party__";

/** One bill a line settles, as kept between popups. */
export type LineBillPick = {
  billId: string;
  billAccYear: string;
  /** What the popup showed — for the read-only card and the chip. */
  label: string;
  paise: number;
};

export type LineBills = {
  picks: LineBillPick[];
  /** Still the automatic fill: a changed amount fills again. */
  auto: boolean;
};

/** An open bill with what this voucher sets against it. */
export type BillRow = OpenBillRow & { thisPaise: number };

/** Oldest first: the due date when the bill has one, else its own date. */
function ageKey(bill: OpenBillRow): string {
  return `${(bill.dueDate || bill.date || "").slice(0, 10)}${(bill.date || "").slice(0, 10)}`;
}

export function pendingPaise(bill: OpenBillRow): number {
  return Math.round((bill.pending ?? 0) * 100);
}

export function billLabel(bill: OpenBillRow): string {
  return bill.docRefno || bill.refno || "";
}

/** The bills, oldest first, carrying the figures already kept for them. */
export function billRows(bills: readonly OpenBillRow[], kept: readonly LineBillPick[]): BillRow[] {
  const byId = new Map(kept.map((pick) => [pick.billId, pick.paise]));
  return bills
    .map((bill, index) => ({ bill, index }))
    .sort((left, right) => {
      const a = ageKey(left.bill);
      const b = ageKey(right.bill);
      return a < b ? -1 : a > b ? 1 : left.index - right.index;
    })
    .map(({ bill }) => ({ ...bill, thisPaise: Math.min(byId.get(bill.ablId) ?? 0, pendingPaise(bill)) }));
}

/** Oldest first, each bill up to what it still owes, until the amount is gone. */
export function fillOldestFirst(rows: readonly BillRow[], amount: number): BillRow[] {
  let left = Math.max(0, amount);
  return rows.map((row) => {
    const take = Math.min(left, pendingPaise(row));
    left -= take;
    return { ...row, thisPaise: take };
  });
}

export function allocatedPaise(rows: ReadonlyArray<{ thisPaise: number } | { paise: number }>): number {
  return rows.reduce((sum, row) => sum + ("thisPaise" in row ? row.thisPaise : row.paise), 0);
}

/**
 * A figure typed against one bill: never more than the bill owes, nor more
 * than the amount left once the other bills are counted — the advance can
 * only ever be zero or more.
 */
export function editBill(rows: readonly BillRow[], index: number, typed: string, amount: number): BillRow[] {
  const row = rows[index];
  if (!row) {
    return [...rows];
  }
  const others = allocatedPaise(rows) - row.thisPaise;
  const paise = amountPaise(typed);
  const wanted = Number.isFinite(paise) ? paise : 0;
  const bound = Math.max(0, Math.min(pendingPaise(row), Math.max(0, amount - others), wanted));
  return rows.map((candidate, at) => (at === index ? { ...candidate, thisPaise: bound } : candidate));
}

/**
 * A figure typed on a one-party voucher's card: never more than the bill
 * still owes (the server refuses an overspend; a figure it will refuse is not
 * worth sending). The rest of the party leg stays open on the raised bill.
 */
export function editCardBill(rows: readonly BillRow[], index: number, typed: string): BillRow[] {
  const paise = amountPaise(typed);
  const wanted = Number.isFinite(paise) ? paise : 0;
  return rows.map((row, at) =>
    at === index ? { ...row, thisPaise: Math.max(0, Math.min(pendingPaise(row), wanted)) } : row,
  );
}

export function allToAdvance(rows: readonly BillRow[]): BillRow[] {
  return rows.map((row) => ({ ...row, thisPaise: 0 }));
}

/** What the popup hands back to be kept on the line. */
export function picksOf(rows: readonly BillRow[]): LineBillPick[] {
  return rows
    .filter((row) => row.thisPaise > 0)
    .map((row) => ({ billId: row.ablId, billAccYear: row.ablAccYear, label: billLabel(row), paise: row.thisPaise }));
}

/**
 * Fill again when the popup opens on a line that is fresh, still on the
 * automatic fill, or now allocated past its amount.
 */
export function wantsAutoFill(kept: LineBills | undefined, amount: number): boolean {
  if (!kept || kept.picks.length === 0 || kept.auto) {
    return true;
  }
  return allocatedPaise(kept.picks) > amount;
}

/**
 * `allocations[]` — every kept figure of a line that is sent, keyed by the
 * line's rowNo in THIS payload.
 */
export function buildAllocations(
  kept: Readonly<Record<string, LineBills>>,
  keyOfRow: ReadonlyMap<number, string>,
): VoucherAllocationBody[] {
  const out: VoucherAllocationBody[] = [];
  for (const pick of kept[PARTY_KEY]?.picks ?? []) {
    if (pick.paise > 0) {
      out.push({ lineRowNo: 0, billId: pick.billId, billAccYear: pick.billAccYear, amount: paiseText(pick.paise) });
    }
  }
  for (const [rowNo, key] of [...keyOfRow.entries()].sort((a, b) => a[0] - b[0])) {
    for (const pick of kept[key]?.picks ?? []) {
      if (pick.paise > 0) {
        out.push({ lineRowNo: rowNo, billId: pick.billId, billAccYear: pick.billAccYear, amount: paiseText(pick.paise) });
      }
    }
  }
  return out;
}

/** A draft's stored allocations, back onto the screen lines (the lines were read in rowNo order). */
export function billsFromDraft(
  draft: StoredDraft | null,
  keyOfRowNo: ReadonlyMap<number, string>,
): Record<string, LineBills> {
  const out: Record<string, LineBills> = {};
  for (const entry of draft?.allocations ?? []) {
    const key =
      entry.lineRowNo === 0 ? PARTY_KEY : typeof entry.lineRowNo === "number" ? keyOfRowNo.get(entry.lineRowNo) : undefined;
    if (!key || !entry.billId) {
      continue;
    }
    const paise =
      typeof entry.amount === "number" ? Math.round(entry.amount * 100) : amountPaise(String(entry.amount ?? ""));
    if (!Number.isFinite(paise) || paise <= 0) {
      continue;
    }
    const kept = out[key] ?? { picks: [], auto: false };
    kept.picks.push({ billId: entry.billId, billAccYear: entry.billAccYear ?? "", label: "", paise });
    out[key] = kept;
  }
  return out;
}

/**
 * The chip on a party line: "2 bills · 1,500.00 adv". The advance is the
 * server's own figure once it has answered; until then the same sum here.
 */
export function billsChip(
  kept: LineBills | undefined,
  settlePaise: number,
  serverAdvance: number | null,
  advanceWord: string,
  format: (paise: number) => string,
): string {
  const picks = kept?.picks.filter((pick) => pick.paise > 0) ?? [];
  const allocated = allocatedPaise(picks);
  const rest = serverAdvance !== null ? serverAdvance : settlePaise - allocated;
  const parts: string[] = [];
  if (picks.length > 0) {
    parts.push(picks.length === 1 ? "1 bill" : `${picks.length} bills`);
  }
  if (rest > 0) {
    parts.push(`${format(rest)} ${advanceWord}`);
  }
  return parts.join(" · ");
}

/** The server's advance on a line, in paise — null when it raised none. */
export function serverAdvanceOf(bills: readonly DerivedBill[] | undefined, lineRowNo: number): number | null {
  const bill = (bills ?? []).find((candidate) => candidate.isAdvance && candidate.lineRowNo === lineRowNo);
  return bill ? Math.round(bill.amount * 100) : null;
}
