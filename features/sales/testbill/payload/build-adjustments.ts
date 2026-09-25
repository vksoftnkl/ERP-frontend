/**
 * Sale Bill — `adjustments[]` (§14.5). A set-off of an advance or credit note
 * is NEVER a tender: it goes here plus `sbAdvanceAmt` / `sbNoteAdjAmt`, and
 * the ADJUST row of the tender dialog is only a mirror of this total.
 */
import { toNullableText } from "@/features/sales/quotation/quotation.utils";
import type { SaleBillDraft, SaveBillAdjustmentDto } from "@/features/sales/testbill/types";

/**
 * One credit set off against this bill.
 *
 * Three fields carry the contract; the other three are echoes the server ignores
 * (it derives the routing from the credit's own row, which is what stops a
 * client mislabelling an advance as a credit note). They are still sent, because
 * `forbidNonWhitelisted` rejects an undeclared key and the DTO declares them.
 */
export function adjustmentDto(
  row: SaleBillDraft["adjustments"][number],
): SaveBillAdjustmentDto {
  return {
    againstBillId: row.credit.billId,
    // The credit's OWN year, never the bill's: `acc_bill_balance` is partitioned
    // by it and keyed on the pair, so a March advance settling an April invoice
    // needs March here or the reference does not resolve.
    againstBillAccYear: row.credit.billAccYear,
    amount: row.amount,
    remarks: toNullableText(row.credit.narration, 250),
    billType: row.credit.billType,
    adjType: row.credit.adjType,
    settlementMode: row.credit.settlementMode,
  };
}


/**
 * The `adjustments[]` the lifecycle verbs carry, or `undefined` when the key
 * must be OMITTED (§14.4): absent means "leave them", `[]` means "reverse every
 * set-off". Draft set-offs are not stored server-side, so they ride again on
 * `/post` and `/amend` — without them the server picks the party's oldest
 * credits instead of the ones the operator chose.
 */
export function adjustmentsForWire(draft: SaleBillDraft): SaveBillAdjustmentDto[] | undefined {
  if (!draft.adjustmentsTouched) {
    return undefined;
  }
  return draft.adjustments.filter((row) => row.amount > 0.005).map(adjustmentDto);
}
