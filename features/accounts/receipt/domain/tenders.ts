/**
 * Which tenders a receipt may offer, and what each one needs keyed.
 *
 * The tender-master rules themselves are NOT re-implemented here: usability on
 * a date, the three nullable behaviour overrides, the per-type instrument spec
 * and the PDC test all live in `features/sales/sale-order/tender/`, they are
 * the same rules the counter obeys, and a second copy would be a second thing
 * to keep true. This module only says what is DIFFERENT about a receipt.
 *
 * ── An adjustment is never a tender ──────────────────────────────────────
 * Credits the party already holds — advances, credit notes, opening credits —
 * are spent in the BILLS grid, not keyed as an instrument. If they were
 * tenders, the day's cash-up would be wrong by exactly the credits applied.
 * The sale-only types are excluded for the same reason from the other end: a
 * gift voucher, a loyalty redemption, an RRN and a temporary credit belong to
 * the bill that moves the goods, and a receipt is not a sale.
 *
 * ── The RECEIPT's date decides, not the wall clock ───────────────────────
 * A back-dated receipt must offer the tenders that were in force that day, so
 * the list is re-filtered whenever the date changes.
 */
import type { TenderMasterRow } from "@/features/sales/sale-order/sale-order.types";
import {
  instrumentSpecOf,
  isPdc,
  type TenderTypeCode,
} from "@/features/sales/sale-order/tender/instruments";
import { isTenderUsable, typeDefaultsOf } from "@/features/sales/sale-order/tender/rows";
import type { TenderRow } from "../receipt.types";

export { isPdc };

export function tenderTypeCodeOf(typeId: number): TenderTypeCode {
  return typeDefaultsOf(typeId).code;
}

export function isChequeTender(typeId: number): boolean {
  return tenderTypeCodeOf(typeId) === "CHEQUE";
}

/** Whether this tender hands change back — cash does, whatever the master says. */
export function givesChangeOn(master: TenderMasterRow): boolean {
  const defaults = typeDefaultsOf(Number.parseInt(master.tndTypeId, 10) || 0);
  if (defaults.code === "CASH") {
    return true;
  }
  return master.tndAllowChange ?? defaults.allowChange;
}

/** The reference this tender needs, and what to call it. Null = none needed. */
export function requiredRefLabel(master: TenderMasterRow): string | null {
  const typeId = Number.parseInt(master.tndTypeId, 10) || 0;
  const defaults = typeDefaultsOf(typeId);
  const spec = instrumentSpecOf(defaults.code);
  // A cheque's reference IS its number, and `apd_instrument_no` is NOT NULL —
  // so it is required whatever the master row's override says.
  if (spec.refRequired) {
    return spec.refLabel ?? defaults.refLabel ?? "Reference";
  }
  const needsRef = master.tndNeedsRef ?? defaults.needsRef;
  return needsRef ? (defaults.refLabel ?? spec.refLabel ?? "Reference") : null;
}

/**
 * The tenders offered on a receipt dated `onDate`, in display order.
 *
 * An EMPTY list is an answer the screen has to show, not a reason to invent a
 * CASH row: `td_tender_id` and `td_tender_ledger_id` are what the posting
 * engine turns into the debit leg, and an invented id posts to a ledger that
 * does not exist.
 */
export function offerableTenders(
  masters: readonly TenderMasterRow[],
  onDate: string,
): TenderMasterRow[] {
  return masters
    .filter((master) => isTenderUsable(master, onDate))
    .filter((master) => {
      const defaults = typeDefaultsOf(Number.parseInt(master.tndTypeId, 10) || 0);
      return !defaults.saleOnly;
    })
    .sort(
      (left, right) =>
        left.tndDisplayPosition - right.tndDisplayPosition ||
        left.tndName.localeCompare(right.tndName),
    );
}

/** The master a fresh receipt starts on: the default, else the first offered. */
export function defaultTender(masters: readonly TenderMasterRow[]): TenderMasterRow | null {
  return masters.find((master) => master.tndIsDefault) ?? masters[0] ?? null;
}

let tenderKeySequence = 0;

/** A blank instrument row on one master. */
export function tenderRowFrom(master: TenderMasterRow): TenderRow {
  tenderKeySequence += 1;
  return {
    key: `tender-row-${tenderKeySequence}`,
    tdId: null,
    tenderId: master.tndId,
    tenderTypeId: Number.parseInt(master.tndTypeId, 10) || 0,
    tenderName: master.tndName,
    tenderLedgerId: master.tndLedgerId || null,
    amount: 0,
    receivedAmt: 0,
    changeAmt: 0,
    mdrAmt: 0,
    refNo: "",
    bankName: "",
    payerVpa: "",
    instrumentDate: "",
    cheque: { bankBranch: "", ifsc: "", drawerName: "", bankLedgerId: null },
    pdcVoucherRefno: null,
  };
}

/**
 * Move a row onto another tender, DROPPING what the new one cannot hold.
 *
 * A non-cheque loses its instrument date, its bank and its cheque extras; a
 * tender that hands out no change loses received/change. Carrying them over
 * would send a cheque date on a cash row, which the server has every right to
 * refuse and which nobody typed.
 */
export function retargetTender(row: TenderRow, master: TenderMasterRow): TenderRow {
  const typeId = Number.parseInt(master.tndTypeId, 10) || 0;
  const cheque = isChequeTender(typeId);
  const change = givesChangeOn(master);
  return {
    ...row,
    tenderId: master.tndId,
    tenderTypeId: typeId,
    tenderName: master.tndName,
    tenderLedgerId: master.tndLedgerId || null,
    instrumentDate: cheque ? row.instrumentDate : "",
    bankName: cheque ? row.bankName : "",
    cheque: cheque ? row.cheque : { bankBranch: "", ifsc: "", drawerName: "", bankLedgerId: null },
    receivedAmt: change ? row.receivedAmt : 0,
    changeAmt: change ? row.changeAmt : 0,
  };
}
