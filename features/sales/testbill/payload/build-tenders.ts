/**
 * Sale Bill — `tenders[]` (§15.10) and the settlement roll-ups the header
 * carries (§15.9). The ADJUST row never appears; a redeemed credit names its
 * document in `adjustments[]`.
 */
import { money } from "@/domain/pricing";
import { actorLabel, type SaveActor } from "@/features/sales/quotation/quotation.payload";
import { toDateInput, toNullableText } from "@/features/sales/quotation/quotation.utils";
import { settledTenderRows } from "@/features/sales/sale-order/sale-order.payload";
import { cardLast4OrNull, isPdc } from "@/features/sales/sale-order/tender/instruments";
import { CHEQUE_TENDER_TYPE_ID } from "@/features/sales/sale-order/tender/rows";
import { rollupsOf, type Rollups } from "@/features/sales/testbill/domain/rollups";
import { settleRows, settlementOutcome } from "@/features/sales/testbill/engines/settle";
import type { BillTenderRow, SaleBillDraft, SaveBillTenderDto } from "@/features/sales/testbill/types";
import { dateOrNull, uuidOrNull } from "./build-items";

// ---------------------------------------------------------------------------
// Save — the money
// ---------------------------------------------------------------------------

function addDaysIso(value: string, days: number): string | null {
  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  parsed.setDate(parsed.getDate() + days);
  return toDateInput(parsed.toISOString().slice(0, 10)) || null;
}

/**
 * One `tenders[]` row (§15.10), `tdRowNo` from 1.
 *
 *   received = keyed base + surcharge + change handed back
 *   total    = received − change;  base = total − surcharge
 *
 * Never sent: `tdSrcModule / tdSrcDocType / tdSrcDocId / tdVoucherId` — the
 * parent implies them. The ADJUST row never appears. `tdPartyLedgerId` is the
 * customer id (house rule 1). `tdIsPdc` keys on the TYPE ID, not the name
 * (D9). LOYALTY sends the SCHEME rate and the points (D4). A TEMP_CR row's
 * spare columns are overwritten server-side from `tempCredit`.
 */
export function buildBillTenderDto(
  row: BillTenderRow,
  settled: { base: number; surchargeAmt: number; amount: number },
  refundAmt: number,
  position: number,
  draft: SaleBillDraft,
  actor: SaveActor,
): SaveBillTenderDto {
  const isCheque = row.tenderTypeId === CHEQUE_TENDER_TYPE_ID;
  const isCard = row.typeCode === "CARD";
  const isLoyalty = row.typeCode === "LOYALTY";
  const isTempCredit = row.typeCode === "TEMP_CR";
  const instrumentDate = row.instrumentDate ? dateOrNull(row.instrumentDate) : null;
  const billDate = draft.header.billDate;
  const total = money(settled.base + settled.surchargeAmt);
  const cheque =
    isCheque && row.cheque && Object.values(row.cheque).some((value) => value !== null && value !== "")
      ? {
          drawerName: toNullableText(row.cheque.drawerName, 150),
          bankBranch: toNullableText(row.cheque.bankBranch, 100),
          ifsc: toNullableText(row.cheque.ifsc, 11)?.toUpperCase() ?? null,
          micr: toNullableText(row.cheque.micr, 9),
        }
      : undefined;
  const tempCredit =
    isTempCredit && row.tempCredit
      ? {
          name: row.tempCredit.name.trim().slice(0, 100),
          mobile: row.tempCredit.mobile.trim().slice(0, 15),
          place: toNullableText(row.tempCredit.place, 100),
          addr: toNullableText(row.tempCredit.addr, 250),
          idRef: toNullableText(row.tempCredit.idRef, 50),
          days: Math.max(0, Math.trunc(row.tempCredit.days)),
          notes: toNullableText(row.tempCredit.notes, 250),
        }
      : undefined;
  return {
    ...(row.tdId ? { tdId: row.tdId } : {}),
    tdRowNo: position + 1,
    tdCompanyId: draft.companyId,
    tdBranchId: draft.branchId,
    tdAccYear: draft.accYear,
    tdDocDate: billDate,
    tdTenderId: row.tenderId,
    tdTenderTypeId: row.tenderTypeId || undefined,
    tdTenderLedgerId: row.tenderLedgerId,
    tdPartyLedgerId: uuidOrNull(draft.customer.custId),
    tdDrCr: "DR",
    tdAmount: settled.base,
    tdSurchargePerc: row.surchargePerc,
    tdSurchargeAmt: settled.surchargeAmt,
    tdSurchargeLedgerId: row.surchargeLedgerId,
    tdTotalAmt: total,
    tdReceivedAmt: money(total + refundAmt),
    tdChangeAmt: money(refundAmt),
    ...(isLoyalty
      ? { tdConversionRate: row.loyaltyRate > 0 ? row.loyaltyRate : row.conversionRate || 1, tdUnitsUsed: row.loyaltyPoints }
      : {}),
    tdRefNo: isTempCredit ? null : toNullableText(row.refNo, 100),
    tdAuthCode: toNullableText(row.authCode, 50),
    // Only the last 4 digits go on the wire; the full number never leaves the screen.
    tdCardLast4: isCard ? cardLast4OrNull(row.cardDigits) : null,
    tdBankName: isTempCredit ? null : toNullableText(row.bankName, 150),
    tdPayerVpa: null,
    tdInstrumentDate: instrumentDate,
    tdIsPdc: isCheque ? isPdc(instrumentDate, billDate) : false,
    tdSettleStatus: row.settleStatus || "NA",
    tdSettleLedgerId: row.settleLedgerId,
    tdExpectedSettleOn: row.settlementDays > 0 ? addDaysIso(billDate, row.settlementDays) : null,
    tdDeviceId: uuidOrNull(actor.deviceMasterId ?? null),
    tdUserId: uuidOrNull(actor.userId),
    tdNotes: toNullableText(row.notes, 250),
    ...(row.tdId ? { tdModifiedBy: actorLabel(actor) } : { tdCreatedBy: actorLabel(actor) }),
    ...(cheque ? { cheque } : {}),
    ...(tempCredit ? { tempCredit } : {}),
  };
}

/**
 * The settlement's roll-ups for the payload (§15.9), from the draft's rows:
 * the dialog's outcome when there are lines, the plain-route figures when
 * there are none.
 */
export function rollupsForPayload(draft: SaleBillDraft, bill: number, totalAdjusted: number): Rollups {
  const rows = settledTenderRows(draft.tenders) as BillTenderRow[];
  const settleAmount = Math.max(0, money(bill - totalAdjusted));
  const outcome = settlementOutcome(rows, settleAmount);
  const settled = settleRows(rows, settleAmount).rows;
  return rollupsOf({
    bill,
    totalAdjusted,
    term: draft.header.billType === "CREDIT" ? "CREDIT" : "CASH",
    lines: rows.map((row, index) => ({ typeCode: row.typeCode, base: settled[index].base, amount: settled[index].amount })),
    tender: outcome.tender,
    credit: outcome.credit,
    refund: outcome.refund,
    surcharge: outcome.surcharge,
  });
}

