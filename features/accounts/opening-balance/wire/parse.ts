/**
 * `/list` and `/bills` bodies → draft rows. Pure.
 *
 * Every column the server owns is REPAINTED from its answer and never cached
 * beside a client copy — `opRemarks` included. The Qt screen was deliberately
 * built that way, and when the server was fixed to return the remark it had
 * always accepted, the client needed no change at all. `loadedRemarks` is the
 * one exception and is not a second copy: it records what arrived, so an
 * emptied cell can be told apart from one that was always empty.
 */
import type {
  BillRow,
  LedgerRow,
  OpeningBillDto,
  OpeningRowDto,
} from "../opening-balance.types";
import { toDateInput, todayIso } from "./dates";
import { fromWire } from "./side";

let rowKeySequence = 0;

/**
 * A stable row key. Rows are addressed by key everywhere — the reducer, the
 * focus walk, the validation list — so inserting or removing a row cannot
 * silently re-target an edit at whatever now sits at that index.
 */
export function nextRowKey(prefix: string): string {
  rowKeySequence += 1;
  return `${prefix}-${rowKeySequence}`;
}

export function parseLedgerRow(dto: OpeningRowDto): LedgerRow {
  const remarks = dto.opRemarks ?? "";
  return {
    key: nextRowKey("led"),
    ledId: dto.ledId,
    ledName: dto.ledName,
    opId: dto.opId,
    groupName: dto.groupName ?? "",
    groupNature: dto.groupNature ?? "",
    isBillWise: dto.ledIsBillByBill === true,
    amount: Number(dto.opAmount) || 0,
    drCr: fromWire(dto.opDrCr),
    source: dto.opSource ?? null,
    isStale: dto.opIsStale === true,
    staleSince: dto.opStaleSince ?? null,
    staleReason: dto.opStaleReason ?? null,
    remarks,
    loadedRemarks: remarks,
    priorClosingAmount:
      typeof dto.priorClosingAmount === "number" ? dto.priorClosingAmount : null,
    priorClosingSide: fromWire(dto.priorClosingDrCr),
    billCount: Number(dto.billCount) || 0,
  };
}

/** The trailing blank row — the picker row. Furniture, never data. */
export function blankLedgerRow(): LedgerRow {
  return {
    key: nextRowKey("led"),
    ledId: "",
    ledName: "",
    opId: null,
    groupName: "",
    groupNature: "",
    isBillWise: false,
    amount: 0,
    drCr: "",
    source: null,
    isStale: false,
    staleSince: null,
    staleReason: null,
    remarks: "",
    loadedRemarks: "",
    priorClosingAmount: null,
    priorClosingSide: "",
    billCount: 0,
  };
}

/**
 * The loaded set, plus the one blank row that ends the grid.
 *
 * THE INVARIANT (§6.2): what comes back here is the WHOLE set of openings that
 * exist, because `/list` is asked with `includeZero=false`. `POST /create` goes
 * out with `replace:true` and soft-deletes every opening absent from the
 * payload — so this array may be added to and edited, but nothing may ever
 * remove rows from it except a deliberate removal by the operator. See the
 * header of `components/ledger-grid.tsx`.
 */
export function parseLedgerRows(rows: readonly OpeningRowDto[]): LedgerRow[] {
  return [...rows.map(parseLedgerRow), blankLedgerRow()];
}

export function parseBillRow(dto: OpeningBillDto): BillRow {
  return {
    key: nextRowKey("bill"),
    ablId: dto.ablId,
    docRefno: dto.ablDocRefno ?? "",
    docDate: toDateInput(dto.ablDocDate),
    dueDate: toDateInput(dto.ablDueDate),
    creditDays: Number(dto.ablCreditDays) || 0,
    graceDays: Number(dto.ablGraceDays) || 0,
    drCr: fromWire(dto.ablDrCr) === "Cr" ? "Cr" : "Dr",
    amount: Number(dto.ablBillAmount) || 0,
    narration: dto.ablNarration ?? "",
    allocated: Number(dto.ablAllocAmount) || 0,
    pending: Number(dto.ablPendingAmount) || 0,
    status: dto.ablStatus ?? "",
    isFrozen: dto.isFrozen === true,
  };
}

/** A new bill: today's date, debit — what a receivable opening usually is. */
export function blankBillRow(): BillRow {
  return {
    key: nextRowKey("bill"),
    ablId: null,
    docRefno: "",
    docDate: todayIso(),
    dueDate: "",
    creditDays: 0,
    graceDays: 0,
    drCr: "Dr",
    amount: 0,
    narration: "",
    allocated: 0,
    pending: 0,
    status: "",
    isFrozen: false,
  };
}

export function parseBillRows(bills: readonly OpeningBillDto[]): BillRow[] {
  return [...bills.map(parseBillRow), blankBillRow()];
}
