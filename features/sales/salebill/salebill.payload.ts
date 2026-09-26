/**
 * Sale Bill Entry — the pure translations between the draft and the wire.
 *
 * `buildSavePayload` is the only place that knows the save contract's traps, and
 * they are not the quotation's:
 *
 *  - **`sbCustId` is nullable, and blank must go over as `null`.** A walk-in is
 *    billed to a snapshotted `sbCustName` with no master row behind it; `""`
 *    is not "no customer" to a uuid column, it is a malformed one.
 *  - **`sbiGodownId` is REQUIRED on every line.** It comes from the item price
 *    lookup and that lookup can answer null; `validate.ts` refuses the bill
 *    before the server has to.
 *  - **`sbBillSlno` and `sbBillRefno` are BOTH server-assigned** from the bill
 *    voucher sequence (type 22) inside the create transaction. Whatever a client
 *    sends is ignored, so neither is sent. (The plan's §15 says the refno is the
 *    client's; it is not.)
 *  - **`adjustments` is the one array where absent ≠ empty.** Omit it to leave
 *    the stored settlement alone — which is what a bill loaded for edit must do
 *    when its GET returned none — and send `[]` to clear it.
 *  - **the three `uuid[]` people columns may never be `null`.** Prisma scalar
 *    lists have no nullable form; "nobody" is `[]`.
 *  - **`cdTaxApl` and `cdBeforeTax` are mutually exclusive** (a 400).
 *  - the payload must contain ONLY declared fields — `forbidNonWhitelisted`
 *    turns a stray key into a 400 on the whole save.
 *
 * On the header discount totals (§15/§17): `sbItemDisc`, `sbSplDisc`,
 * `sbSchDisc`, `sbBillSchDisc` and `sbAddlDisc1/2` are **already netted inside**
 * `sbTaxableAmt`. They are reported, not re-applied. And every amount is sent
 * POSITIVE — direction lives in the server's own `dr_cr` flag — so nothing here
 * ever negates a figure to "show" a deduction.
 */
import type { DocumentPricing, PricedLine } from "@/domain/pricing";
import { defaultPolicy } from "@/domain/pricing";
import { chargeDto, actorLabel, type SaveActor } from "@/features/sales/quotation/quotation.payload";
import { clampPriceLevel, emptyCustomer } from "@/features/sales/quotation/quotation.state";
import type { DraftChargeRow } from "@/features/sales/quotation/quotation.types";
import {
  SIZE_UOM,
  asEnum,
  nextRowKey,
  toDateInput,
  toNullableNumber,
  toNullableText,
  toNumber,
} from "@/features/sales/quotation/quotation.utils";
import { settledTenderRows } from "@/features/sales/sale-order/sale-order.payload";
import { money } from "@/domain/pricing";
import { cardLast4OrNull, isPdc } from "@/features/sales/sale-order/tender/instruments";
import { CHEQUE_TENDER_TYPE_ID, typeDefaultsOf } from "@/features/sales/sale-order/tender/rows";
import { adjustmentsAuthoritative, rowsFromHeld } from "./salebill.adjust";
import { rollupsOf, settleRows, settlementOutcome, type Rollups } from "./salebill.settle";
import {
  BILL_DOC_TYPES,
  BILL_MODES,
  BILL_STATUSES,
  BILL_TYPES,
  DEFAULT_BILL_DOC_TYPE,
  DEFAULT_BILL_MODE,
  DEFAULT_BILL_STATUS,
  DEFAULT_BILL_TYPE,
} from "./salebill.constants";
import {
  createBillDraft,
  createBillDraftLine,
  emptyBillTerms,
  emptyPeople,
  emptySettlement,
  nowStamp,
} from "./salebill.state";
import { advanceAdjusted, noteAdjusted } from "./salebill.validate";
import type {
  AmendBillDto,
  BillAdjustmentSummary,
  BillTenderRow,
  BillChargePayload,
  BillItemPayload,
  BillKey,
  BillLocks,
  BillPayload,
  BillPostingBlock,
  BillRights,
  BillSourceSummary,
  BillTenderPayload,
  PostBillDto,
  SaleBillDraft,
  SaleBillDraftLine,
  SaveBillAdjustmentDto,
  SaveBillChargeDto,
  SaveBillDto,
  SaveBillItemDto,
  SaveBillTenderDto,
  ValidateBillDto,
} from "./salebill.types";

/** `yyyy-mm-dd`, or null for a blank / unparseable date. */
function dateOrNull(value: string | null | undefined): string | null {
  const text = toDateInput(value);
  return text || null;
}

/**
 * A nullable uuid column. An unset id is `null`, never `""`: the empty string
 * is not an absent uuid to Postgres or to the DTO's uuid pattern, it is an
 * invalid one, and it comes back as a 400 naming the field.
 */
function uuidOrNull(id: string | null | undefined): string | null {
  return (id ?? "").trim() || null;
}

/**
 * A `uuid[]` column from one keyed id. `null` is never sent: Prisma's scalar
 * list has no nullable form, so it fails to match the unchecked create input,
 * Prisma falls back to the checked variant, and the save dies on a misleading
 * "Argument `customer` is missing" rather than on the field that caused it.
 */
function uuidArray(id: string | null): string[] {
  return id ? [id] : [];
}

// ---------------------------------------------------------------------------
// Save — the lines
// ---------------------------------------------------------------------------

function itemDto(line: SaleBillDraftLine, priced: PricedLine, index: number): SaveBillItemDto {
  const size = toNullableText(line.itemSize, 50);
  return {
    // Present → update that line; absent → insert. An active line missing from
    // the array is soft deleted server-side, which is exactly what removing a
    // row should mean.
    ...(line.sbiId ? { sbiId: line.sbiId } : {}),
    sbiLineNo: index + 1,
    // One batch per row by design (§7.1), so a line is never split: the lookup's
    // godown and stock identify the row the quantity comes from. When a batch
    // picker lands and one line can draw on two batches, this is where the split
    // number starts mattering.
    sbiSplitNo: 1,
    // The trail is per line (§13.5): the document, then the LINE — which is what
    // the post guards and the open-qty draw-down key on. `sbiSrcDocLineNo` must
    // be sent: it was null once, and billed orders stayed CONFIRMED. A line
    // without a trail sends nulls, never the header's.
    sbiSrcDocType: line.srcDocType,
    sbiSrcDocId: line.srcDocId,
    sbiSrcItemId: line.srcItemId,
    sbiSrcDocYear: line.srcDocYear,
    sbiSrcDocRefno: toNullableText(line.srcDocRefno, 100),
    sbiSrcDocLineNo: line.srcDocLineNo,
    // What the SOURCE line ordered — not `orderQty`, which on an imported line
    // holds what was still PENDING. Sending the pending figure here would let
    // the order's own arithmetic be re-derived against the wrong denominator.
    sbiSrcItemQty: line.srcItemQty,
    sbiSrcFreeQty: null,
    // NEVER null (§18.2): an explicit null beats the NOT NULL default and is a
    // bare 500. Nothing on this screen picks a bucket yet, so every line is
    // saleable stock.
    sbiBucket: "SALEABLE",
    sbiItemId: line.itemId,
    sbiItemUnitId: line.itemUnitId,
    sbiToBaseFactor: line.toBaseFactor || 1,
    sbiHsnCode: toNullableText(line.hsnCode, 8),
    sbiPriceLevel: clampPriceLevel(line.priceLevel),
    sbiEanCode: toNullableText(line.barcode, 100),
    sbiSize: size,
    sbiSizeUom: size === null ? null : SIZE_UOM,
    // NOT NULL and `@RequiredUuid`. `validate.ts` refuses a line without one, so
    // by the time this runs there is always a godown; the empty string is a
    // last-ditch value that will 400 loudly rather than write a wrong row.
    sbiGodownId: line.godownId ?? "",
    sbiStockId: line.stockId,
    sbiBatchNo: toNullableText(line.batchNo, 100),
    sbiBatchDate: dateOrNull(line.batchDate),
    sbiExpiryDate: dateOrNull(line.expiryDate),
    sbiSerialNo: toNullableText(line.serialNo, 100),
    sbiIsTaxIncl: line.isInclusiveTax,
    sbiIsPromo: line.isPromo,
    sbiIsFree: line.isFree,
    // `ck_sbi_free_type` allows NULL / SCHEME / SAMPLE / REPLACEMENT only.
    sbiFreeType: line.isFree ? freeTypeOf(line.freeType) : null,
    sbiIsService: line.isService,
    sbiHasFreight: line.hasFreight,
    sbiCaseQty: line.caseQty,
    sbiBillQty: line.billQty,
    sbiLengthQty: line.lengthQty,
    sbiNetQty: priced.netQty,
    sbiWeightQty: line.weight * line.billQty,
    sbiAvailableStock: line.stockQty ?? 0,
    sbiRate: line.rate,
    sbiRatePreTax: priced.rateBeforeTax,
    sbiRateDiff: priced.rateDiff,
    sbiActPrice: line.actualPrice,
    sbiMaxPrice: line.mrp,
    sbiMinPrice: line.minPrice,
    sbiCostPrice: line.costPrice,
    sbiCostPreTax: line.costBeforeTax,
    // The keyed columns go out as keyed; the Amt columns carry what the engine
    // computed, which is what the grid showed and what the print needs.
    sbiItemDiscPerc: line.discPerc,
    sbiItemDiscQty: line.discPerQty,
    sbiItemDiscAmt: priced.discAmt,
    sbiSplDiscPerc: line.splDiscPerc,
    sbiSplDiscQty: line.splDiscPerQty,
    sbiSplDiscAmt: priced.splDiscAmt,
    sbiSchDiscPerc: line.schPerc,
    sbiSchDiscQty: line.schPerQty,
    sbiSchDiscAmt: priced.schAmt,
    sbiBillSchPerc: line.billSchDiscPerc,
    sbiBillSchQty: 0,
    sbiBillSchAmt: priced.billSchDiscAmt,
    // The engine models no second and third discount ladder, so these are zero
    // rather than guessed at. Adding them is a change to the SHARED engine with
    // a golden case (§3), not a field filled in here.
    sbiAddlDisc1Perc: 0,
    sbiAddlDisc1Amt: 0,
    sbiAddlDisc2Perc: 0,
    sbiAddlDisc2Amt: 0,
    sbiCashDiscPerc: line.cashDiscPerc,
    sbiCashDiscAmt: line.cashDiscAmt,
    sbiGrossAmt: priced.grossAmt,
    sbiNetGross: priced.netGross,
    sbiChrgBeforeTax: priced.chrgBeforeTax,
    sbiChrgAfterTax: priced.chrgAfterTax,
    sbiTaxableAmt: priced.taxableAmt,
    sbiTaxPerc: line.gstPerc,
    sbiTaxAmt: priced.gstAmt,
    sbiCgstPerc: line.cgstPerc,
    sbiCgstAmt: priced.cgstAmt,
    sbiSgstPerc: line.sgstPerc,
    sbiSgstAmt: priced.sgstAmt,
    sbiIgstPerc: line.igstPerc,
    sbiIgstAmt: priced.igstAmt,
    sbiCessPerc: line.cessPerc,
    sbiCessPerUnit: line.cessPerUnit,
    sbiCessAmt: priced.cessAmt,
    // Additional cess is a second head the engine does not model either.
    sbiAcessPerc: 0,
    sbiAcessPerUnit: 0,
    sbiAcessAmt: 0,
    sbiBatchConfig: line.batchConfig,
    sbiFreightQty: line.freightPerQty,
    sbiFreightAmt: priced.freightAmt,
    sbiLoadQty: line.loadingPerQty,
    sbiLoadAmt: priced.loadingAmt,
    sbiUnloadQty: 0,
    sbiUnloadAmt: 0,
    // The round-off is the DOCUMENT's, taken once at the bottom; a per-line
    // share of it would not add back up.
    sbiRoundOff: 0,
    sbiNetAmt: priced.total,
    sbiSoldPrice: priced.netPrice,
    sbiSoldPreTax: priced.netPriceBeforeTax,
    sbiItemProfit: priced.profit,
    sbiProfitPreTax: priced.profitBeforeTax,
    sbiMrpSavings: line.mrp > 0 ? (line.mrp - priced.netPrice) * priced.netQty : null,
    sbiMrpSavingsPerc: line.mrp > 0 ? priced.savingsPerc : null,
    sbiSalesmanId: line.salesmanId,
    sbiSchemeId: line.schemeId,
    sbiSchemeName: toNullableText(line.schemeName, 150),
    sbiRemarks: toNullableText(line.remarks, 250),
  };
}

const FREE_TYPES = ["SCHEME", "SAMPLE", "REPLACEMENT"] as const;
function freeTypeOf(value: string | null): string {
  return asEnum(value, FREE_TYPES, "SCHEME");
}

// ---------------------------------------------------------------------------
// Save — the money
// ---------------------------------------------------------------------------

/**
 * One credit set off against this bill.
 *
 * Three fields carry the contract; the other three are echoes the server ignores
 * (it derives the routing from the credit's own row, which is what stops a
 * client mislabelling an advance as a credit note). They are still sent, because
 * `forbidNonWhitelisted` rejects an undeclared key and the DTO declares them.
 */
function adjustmentDto(
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

// ---------------------------------------------------------------------------
// Save — the document
// ---------------------------------------------------------------------------

export function buildSavePayload(
  draft: SaleBillDraft,
  pricing: DocumentPricing,
  actor: SaveActor,
): SaveBillDto {
  const totals = pricing.totals;
  // A line with no item is a row the operator started and abandoned; it is
  // skipped rather than rejected.
  const lineIndexes = draft.lines
    .map((line, index) => ({ line, index }))
    .filter(({ line }) => Boolean(line.itemId));
  const chargeRows = draft.charges.filter((row) => Boolean(row.chgId) && Boolean(row.ledgerCode));
  const pricedByKey = new Map(pricing.charges.map((row) => [row.key, row]));
  const chargeTotals = { totQty: totals.totQty, totWeight: totals.totWeight };

  const tenderRows = settledTenderRows(draft.tenders) as BillTenderRow[];
  const adjustmentRows = draft.adjustments.filter((row) => row.amount > 0);
  // Two figures, never one total (§14.5): the server refuses a single sum
  // across both, and each must equal its own type's rows ±0.01. Not a sum
  // with the loaded figure — an import would count twice.
  const advance = advanceAdjusted(draft);
  const notes = noteAdjusted(draft);
  const adjusted = Math.min(totals.bill, Math.round((advance + notes) * 100) / 100);

  // The settlement (§15.4–15.10): the rows priced against the bill NET of
  // the set-offs, change routed onto the first row that can hold it, and the
  // roll-ups from the outcome. `sbCreditAmt` is CREDIT + TEMP_CR (D5).
  const settleAmount = Math.max(0, Math.round((totals.bill - adjusted) * 100) / 100);
  const settledRows = settleRows(tenderRows, settleAmount).rows;
  const outcome = settlementOutcome(tenderRows, settleAmount);
  const rollups = rollupsForPayload(draft, totals.bill, adjusted);

  const isCredit = draft.header.billType === "CREDIT";

  return {
    ...(draft.docId ? { sbId: draft.docId } : {}),
    sbCompanyId: draft.companyId,
    sbBranchId: draft.branchId,
    sbAccYear: draft.accYear,
    sbSessionId: actor.sessionId,
    // `sbCounterId` is not sent (§3.3).
    //
    // The device is the REGISTERED one the login returned (`device_master`),
    // because the stock voucher the post writes carries a foreign key to it and
    // a browser fingerprint is refused with `SALES_DEVICE_UNREGISTERED`. The
    // browser's own id is the fallback only so a DRAFT can still be saved; the
    // post path refuses to guess (see `useSaleBillDraft`).
    sbDeviceType: actor.deviceType || "WEB",
    sbDeviceId: actor.deviceMasterId || actor.deviceId || "",
    // From the launching menu, never a combo (§3.4). A loaded bill keeps its own.
    sbBillMode: asEnum(draft.header.billMode, BILL_MODES, DEFAULT_BILL_MODE),
    sbDocType: asEnum(draft.header.docType, BILL_DOC_TYPES, DEFAULT_BILL_DOC_TYPE),
    sbBillType: asEnum(draft.header.billType, BILL_TYPES, DEFAULT_BILL_TYPE),
    sbCategoryId: draft.header.categoryId,
    sbPriceLevel: clampPriceLevel(draft.header.priceLevel),
    sbUsrRefno: toNullableText(draft.header.usrRefno, 100),
    sbBillDate: draft.header.billDate,
    sbBillDatetime: draft.header.billDatetime || nowStamp(),
    // Sent only for a CREDIT bill: a cash bill has no period, and a stale pair
    // left over from a term switch would print a due date on a paid invoice.
    sbDueDays: isCredit ? draft.header.dueDays : null,
    sbDueDate: isCredit ? dateOrNull(draft.header.dueDate) : null,
    sbSrcDocType: draft.source?.docType ?? null,
    sbSrcDocId: draft.source?.docId ?? null,
    sbSrcDocRefno: toNullableText(draft.source?.refno ?? null, 100),
    sbSrcDocDate: dateOrNull(draft.source?.date ?? null),
    sbSrcDocYear: draft.source?.accYear ?? null,
    sbCustId: uuidOrNull(draft.customer.custId),
    sbCustName: draft.customer.name.trim(),
    sbCustAddr: toNullableText(draft.customer.address, 500),
    sbCustPlace: toNullableText(draft.customer.place, 100),
    sbCustPin: toNullableText(draft.header.custPin, 10),
    // The identity box (§15.8 B) and the loyalty member (§15.7).
    sbCustPan: toNullableText(draft.header.custPan, 10),
    sbForm60Ref: toNullableText(draft.header.form60Ref, 50),
    sbLoyaltyMemberId: uuidOrNull(draft.header.loyaltyMemberId),
    // The transport band, FLAT, on a DRAFT (§18.1, §20.3). All-blank = no
    // write server-side; a posted band is written through the PUT instead.
    ...transportFlat(draft.transport),
    sbCustPhone: toNullableText(draft.customer.phone, 20),
    sbCustGstin: toNullableText(draft.customer.gstin, 15),
    sbCustGstType: toNullableText(draft.customer.gstType, 20),
    // Two different facts since 2026-09-11 (§5): the customer's own state as the
    // master reported it, and the place of supply the document was taxed under.
    sbCustStcd: toNullableText(draft.customer.stateCode, 2),
    sbPosStcd: toNullableText(draft.header.posStateCode, 2),
    sbStateName: toNullableText(draft.header.posStateName, 100),
    sbHasLoad: draft.header.hasLoad,
    sbHasUnload: draft.header.hasUnload,
    sbHasFreight: draft.header.hasFreight,
    sbHasPromo: draft.header.hasPromo,
    sbHasComm: draft.header.hasComm,
    // A boolean, and the whole of the loyalty contract (§11). There is no
    // accrual path behind it.
    sbHasLoyalty: draft.header.hasLoyalty,
    sbUserId: actor.userId,
    sbSalesmanId: uuidArray(draft.header.people.salesmanId),
    sbAgentId: draft.header.people.agentId,
    sbAgentCommPerc: null,
    sbAgentCommAmt: null,
    sbDriverId: draft.header.people.driverId,
    sbLoadmanId: uuidArray(draft.header.people.loadmanId),
    sbPackedId: uuidArray(draft.header.people.packedId),
    sbSupervisorId: draft.header.people.supervisorId,
    sbVehicleId: draft.header.people.vehicleId,
    sbVehicleNo: toNullableText(draft.header.people.vehicleNo, 20),
    sbTotItems: totals.totItems,
    sbTotWeight: totals.totWeight,
    sbTotBags: totals.totQty,
    sbGrossAmt: totals.grossAmt,
    // Reported, not re-applied: all of these are already netted inside
    // `sbTaxableAmt` (§15). The server does not subtract them again.
    sbItemDisc: totals.itemDisc,
    sbSplDisc: totals.splDisc,
    sbSchDisc: totals.schDisc,
    sbBillSchDisc: totals.billSchDisc,
    sbAddlDisc1: 0,
    sbAddlDisc2: 0,
    sbCashDisc: Math.abs(totals.cashDiscAmt),
    sbTaxableAmt: totals.docTaxable,
    sbCgstAmt: totals.docCgst,
    sbSgstAmt: totals.docSgst,
    sbIgstAmt: totals.docIgst,
    sbCessAmt: totals.docCess,
    sbTaxAmt: totals.docTax,
    sbFreightAmt: totals.freightAmt,
    sbLoadAmt: totals.loadAmt,
    sbUnloadAmt: totals.unloadAmt,
    sbOtherAmt1: totals.otherAmt,
    sbOtherAmt2: 0,
    sbRoundOff: totals.roundOff,
    sbBillAmt: totals.bill,
    sbTotalCost: totals.totalCost,
    sbMarginAmt: totals.totalProfit,
    sbMarginAmtWot: totals.marginAmt,
    sbMarginPerc: totals.marginPerc,
    sbMrpSavings: totals.savingAmt,
    sbMrpSavingsPerc: totals.savingPerc,
    sbPayMode: rollups.payMode,
    sbCreditAmt: rollups.creditAmt,
    // The bank's cut, never the shop's takings, and NEVER re-entered into the
    // pricing engine: a surcharge is a charge on the payment instrument, not
    // on the goods. `sbTenderAmt` = Σ amount incl. surcharge, as Qt sends it,
    // until C4 defines it (§15.9).
    sbSurchargeAmt: rollups.surchargeAmt,
    sbTenderAmt: rollups.tenderAmt,
    sbRefundAmt: rollups.refundAmt,
    sbAdvanceAmt: advance,
    sbNoteAdjAmt: notes,
    sbPaidAmt: rollups.paidAmt,
    sbBalanceAmt: rollups.balanceAmt,
    sbPayStatus: rollups.payStatus,
    sbPaymentTerms: toNullableText(draft.terms.paymentTerms, 250),
    sbDeliveryTerms: toNullableText(draft.terms.deliveryTerms, 250),
    sbTermsConditions: toNullableText(draft.terms.termsConditions),
    sbRemarks: toNullableText(draft.terms.remarks, 500),
    // Lower case, and NOT normalised server-side.
    sbFreightCalcType: (draft.policy.freightCalcType || "manual").toLowerCase(),
    sbLoadingCalcType: (draft.policy.loadingCalcType || "manual").toLowerCase(),
    // A bool, never null — `null` is a 400 (§18.1).
    sbDiscAlterBase: draft.policy.discountAlterBaseRate === true,
    sbRoundOffStep: draft.policy.roundOffStep,
    // `sbStatus` is NOT sent: a save is always a DRAFT and only `/bills/post`
    // moves it (§18.1). Nor is `sbVersionNo`; both are server-owned.
    ...(draft.docId ? { sbModifiedBy: actorLabel(actor) } : { sbCreatedBy: actorLabel(actor) }),
    items: lineIndexes.map(({ line, index }, position) =>
      itemDto(line, pricing.lines[index], position),
    ),
    charges: chargeRows.map(
      (row, position) =>
        chargeDto(row, pricedByKey.get(row.key), position, chargeTotals) as SaveBillChargeDto,
    ),
    ...(tenderRows.length > 0 || draft.tenders.some((row) => row.tdId)
      ? {
          tenders: tenderRows.map((row, position) =>
            buildBillTenderDto(
              row,
              settledRows[position],
              outcome.refunds.get(row.key) ?? 0,
              position,
              draft,
              actor,
            ),
          ),
        }
      : {}),
    // The ONE array where absent is not empty. A bill loaded for edit whose GET
    // returned no adjustments must omit the key entirely — sending `[]` would
    // reverse a settlement the screen never saw. It is sent only once this
    // screen has actually handled the panel.
    ...(draft.adjustmentsTouched
      ? { adjustments: adjustmentRows.map(adjustmentDto) }
      : {}),
  };
}

/** The band's flat header columns (§18.1 Transport). Blank text goes as null. */
function transportFlat(band: SaleBillDraft["transport"]): Partial<SaveBillDto> {
  return {
    sbShipAddrId: uuidOrNull(band.to.addrId),
    sbShipName: toNullableText(band.to.name, 200),
    sbShipAddr: toNullableText(band.to.addr, 500),
    sbShipPlace: toNullableText(band.to.place, 100),
    sbShipPin: toNullableText(band.to.pin, 10),
    sbShipPhone: toNullableText(band.to.phone, 20),
    sbShipStcd: toNullableText(band.to.stcd, 2),
    sbShipGstin: toNullableText(band.to.gstin, 15),
    sbDispatchGodownId: uuidOrNull(band.from.godownId),
    sbDispatchBranchId: uuidOrNull(band.from.branchId),
    sbTransportMode: toNullableText(band.mode, 10)?.toUpperCase() ?? null,
    sbTransporterId: uuidOrNull(band.transporterId),
    sbTransporterName: toNullableText(band.transporterName, 200),
    sbTransporterGstin: toNullableText(band.transporterGstin, 15),
    sbLrNo: toNullableText(band.lrNo, 50),
    sbLrDate: dateOrNull(band.lrDate),
    sbDistanceKm:
      band.distanceKm === null || band.distanceKm === undefined
        ? null
        : Math.max(0, Math.trunc(band.distanceKm)),
  };
}

// ---------------------------------------------------------------------------
// The lifecycle bodies (§4.1, §17). Built from state, never from a response.
// ---------------------------------------------------------------------------

/** The four keys of a saved bill, or `null` for one that has never been saved. */
export function billKeyOf(draft: SaleBillDraft): BillKey | null {
  if (!draft.docId) {
    return null;
  }
  return {
    sbId: draft.docId,
    sbCompanyId: draft.companyId,
    sbBranchId: draft.branchId,
    sbAccYear: draft.accYear,
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

function dedupeCodes(codes: readonly string[]): string[] | undefined {
  const unique = Array.from(new Set(codes.filter((code) => code.trim())));
  return unique.length > 0 ? unique : undefined;
}

/** `POST /bills/validate`: the save body plus the ticked overrides (§16.4). */
export function buildValidateBody(payload: SaveBillDto, overrides: readonly string[]): ValidateBillDto {
  const codes = dedupeCodes(overrides);
  return codes ? { ...payload, overrides: codes } : { ...payload };
}

/**
 * The four keys and nothing else. Callers hand in a `SavedBillRef` (the keys +
 * `billRefno`) where a `BillKey` is typed, and the server's whitelist 400s on
 * any extra property — so a key is copied field by field before it goes out.
 */
export function bareBillKey(key: BillKey): BillKey {
  return {
    sbId: key.sbId,
    sbCompanyId: key.sbCompanyId,
    sbBranchId: key.sbBranchId,
    sbAccYear: key.sbAccYear,
  };
}

/**
 * `POST /bills/post`: the keys only — it posts what the server HOLDS (§17.5).
 * `adjustments` is sent whenever the draft has them (§14.4).
 */
export function buildPostBody(
  key: BillKey,
  options: { overrides?: readonly string[]; adjustments?: SaveBillAdjustmentDto[]; printAfter?: boolean } = {},
): PostBillDto {
  const codes = dedupeCodes(options.overrides ?? []);
  return {
    ...bareBillKey(key),
    ...(codes ? { overrides: codes } : {}),
    ...(options.printAfter ? { printAfter: true } : {}),
    ...(options.adjustments !== undefined ? { adjustments: options.adjustments } : {}),
  };
}

/** `POST /bills/amend`: the whole payload, the optimistic lock and the remark (§17.8). */
export function buildAmendBody(
  payload: SaveBillDto,
  options: { sbId: string; baseRevision: number; editRemark: string; overrides?: readonly string[]; printAfter?: boolean },
): AmendBillDto {
  const codes = dedupeCodes(options.overrides ?? []);
  return {
    ...payload,
    sbId: options.sbId,
    baseRevision: options.baseRevision,
    editRemark: options.editRemark.trim().slice(0, 250),
    ...(codes ? { overrides: codes } : {}),
    ...(options.printAfter ? { printAfter: true } : {}),
  };
}

// ---------------------------------------------------------------------------
// Load
// ---------------------------------------------------------------------------

function lineFromPayload(item: BillItemPayload): SaleBillDraftLine {
  const factor = toNumber(item.sbiToBaseFactor) || 1;
  return {
    ...createBillDraftLine(),
    sbiId: item.sbiId,
    itemId: item.sbiItemId,
    itemUnitId: item.sbiItemUnitId,
    itemName: item.sbiItemName ?? "",
    unitName: item.sbiUnitName ?? "",
    hsnCode: item.sbiHsnCode,
    barcode: item.sbiEanCode,
    itemSize: item.sbiSize,
    godownId: item.sbiGodownId,
    godownName: item.sbiGodownName ?? null,
    stockId: item.sbiStockId,
    batchNo: item.sbiBatchNo,
    batchDate: toDateInput(item.sbiBatchDate) || null,
    expiryDate: toDateInput(item.sbiExpiryDate) || null,
    serialNo: item.sbiSerialNo,
    priceLevel: clampPriceLevel(item.sbiPriceLevel ?? 1),
    // `sbi_to_base_factor` IS persisted on the bill, unlike the quotation's, so
    // there is nothing to back-derive and nothing to recover.
    toBaseFactor: factor,
    toBaseFactorKnown: true,
    isInclusiveTax: item.sbiIsTaxIncl === true,
    isPromo: item.sbiIsPromo === true,
    isFree: item.sbiIsFree === true,
    freeType: item.sbiFreeType,
    isService: item.sbiIsService === true,
    hasFreight: item.sbiHasFreight === true,
    caseQty: toNumber(item.sbiCaseQty),
    billQty: toNumber(item.sbiBillQty),
    lengthQty: toNumber(item.sbiLengthQty),
    weight: divideOrZero(toNumber(item.sbiWeightQty), toNumber(item.sbiBillQty)),
    stockQty: toNullableNumber(item.sbiAvailableStock),
    rate: toNumber(item.sbiRate),
    actualPrice: toNumber(item.sbiActPrice),
    mrp: toNumber(item.sbiMaxPrice),
    minPrice: toNumber(item.sbiMinPrice),
    costPrice: toNumber(item.sbiCostPrice),
    costBeforeTax: toNumber(item.sbiCostPreTax),
    discPerc: toNumber(item.sbiItemDiscPerc),
    discPerQty: toNumber(item.sbiItemDiscQty),
    discAmt: toNumber(item.sbiItemDiscAmt),
    splDiscPerc: toNumber(item.sbiSplDiscPerc),
    splDiscPerQty: toNumber(item.sbiSplDiscQty),
    splDiscAmt: toNumber(item.sbiSplDiscAmt),
    schPerc: toNumber(item.sbiSchDiscPerc),
    schPerQty: toNumber(item.sbiSchDiscQty),
    schAmt: toNumber(item.sbiSchDiscAmt),
    billSchDiscPerc: toNumber(item.sbiBillSchPerc),
    cashDiscPerc: toNumber(item.sbiCashDiscPerc),
    cashDiscAmt: toNumber(item.sbiCashDiscAmt),
    gstPerc: toNumber(item.sbiTaxPerc),
    cgstPerc: toNumber(item.sbiCgstPerc),
    sgstPerc: toNumber(item.sbiSgstPerc),
    igstPerc: toNumber(item.sbiIgstPerc),
    cessPerc: toNumber(item.sbiCessPerc),
    cessPerUnit: toNumber(item.sbiCessPerUnit),
    freightPerQty: toNumber(item.sbiFreightQty),
    loadingPerQty: toNumber(item.sbiLoadQty),
    batchConfig: item.sbiBatchConfig ?? 0,
    decimalCount: item.sbiDecimalCount ?? 2,
    salesmanId: item.sbiSalesmanId,
    schemeId: item.sbiSchemeId,
    schemeName: item.sbiSchemeName,
    remarks: item.sbiRemarks,
    groupId: item.sbiGroupId ?? null,
    brandId: item.sbiBrandId ?? null,
    sectionId: item.sbiSectionId ?? null,
    categoryId: item.sbiCategoryId ?? null,
    // The source trail, and with it the order cap: a loaded line that names an
    // order line is still capped, and the pending figure it was capped at is
    // `orderQty`.
    srcDocType: item.sbiSrcDocType,
    srcDocId: item.sbiSrcDocId,
    srcItemId: item.sbiSrcItemId ?? null,
    srcDocYear: item.sbiSrcDocYear,
    srcDocRefno: item.sbiSrcDocRefno,
    srcDocLineNo: item.sbiSrcDocLineNo,
    srcItemQty: toNullableNumber(item.sbiSrcItemQty),
    orderQtyLocked: Boolean(item.sbiSrcDocId) && item.sbiSrcDocType === "SALES_ORDER",
    orderQty: toNumber(item.sbiSrcItemQty),
    // The two halves of the gate age differently, so they are taken
    // differently.
    //
    // `allow_negative_stock` is not a column on `sale_bill_item` — the GET
    // RESOLVES it, from the line's godown, the company and the item master as
    // they stand today, by the same rule `/master-lookups/item-price` answers
    // with. That makes it as current as a re-lookup would be, so it crosses.
    // A `null` (the item join was not made) is not a licence, and reads false.
    //
    // `sbiAvailableStock`, by contrast, is the stock AS IT WAS when the bill was
    // raised — a month ago, perhaps — so the line stays UNRESOLVED and the gate
    // reports itself unavailable rather than judging a quantity against a stale
    // figure. Qt hard-codes the flag to "Y" here and silently turns the gate OFF
    // for every reopened line; that half is still not ported.
    allowNegative: item.sbiAllowNegativeStock === true,
    stockGateResolved: false,
  };
}

function divideOrZero(numerator: number, denominator: number): number {
  return denominator === 0 ? 0 : numerator / denominator;
}

function chargeFromBillPayload(row: BillChargePayload): DraftChargeRow {
  const beforeTax = row.cdBeforeTax === true;
  const taxApl = row.cdTaxApl === true && !beforeTax;
  return {
    key: nextRowKey("charge"),
    cdId: row.cdId,
    chgId: row.cdChgId,
    chgName: row.cdChgName ?? "",
    ledgerCode: row.cdLedgerCode,
    ledgerName: row.cdLedgerName,
    role: asEnum(row.cdRole, CHARGE_ROLES, "NONE"),
    method: asEnum(row.cdMethod, CHARGE_METHODS, "FIXED"),
    type: asEnum(row.cdType, CHARGE_TYPES, "ADD"),
    applyOn: asEnum(row.cdApplyOn, CHARGE_APPLY_ONS, "FLAT"),
    costAlloc: row.cdCostAlloc ? asEnum(row.cdCostAlloc, CHARGE_COST_ALLOCS, "VALUE") : null,
    beforeTax,
    taxApl,
    landingCost: row.cdLandingCost === true,
    sepPost: row.cdSepPost === true,
    // Decimals arrive as real NUMBERS on this payload — the charge-detail module
    // converts them, unlike the header and the items.
    rate: row.cdRate ?? 0,
    // The engine reads `rate === 0 && amount !== 0` as "priced by total", so a
    // stored row that carries a rate must not also carry an amount, or reopening
    // a bill would silently re-price it by its total.
    amount: (row.cdRate ?? 0) !== 0 ? 0 : (row.cdAmount ?? 0),
    taxPerc: row.cdTaxPerc ?? 0,
    cgstPerc: row.cdCgstPerc ?? 0,
    sgstPerc: row.cdSgstPerc ?? 0,
    igstPerc: row.cdIgstPerc ?? 0,
    cessPerc: row.cdCessPerc ?? 0,
    hsn: row.cdHsn,
    taxCode: row.cdTaxCode,
    unit: row.cdUnit,
    qtyVal: row.cdQtyVal,
    weight: row.cdWeight,
    remarks: row.cdRemarks,
    isActive: row.cdIsActive !== false,
  };
}

const CHARGE_ROLES = ["FREIGHT", "LOADING", "UNLOADING", "CASH_DISC", "OTHERS", "NONE"] as const;
const CHARGE_METHODS = ["FIXED", "QTY", "NET_QTY", "KG", "QTL", "TON", "PERCENT"] as const;
const CHARGE_TYPES = ["ADD", "DEDUCT"] as const;
const CHARGE_APPLY_ONS = ["FLAT", "QTY", "VALUE", "WEIGHT"] as const;
const CHARGE_COST_ALLOCS = ["VALUE", "QTY", "WEIGHT"] as const;

/**
 * A stored tender line as a bill row. No type name is stored (§15.10) —
 * every rule keys on `tdTenderTypeId`, and the dialog re-merges the live
 * master by tender id when it opens. `tdAmount` is the base and
 * `tdChangeAmt` the change handed back, so `keyed` (the BASE the cashier
 * typed) is `tdAmount` — the change was taken out of it at save.
 */
export function tenderFromPayload(row: BillTenderPayload): BillTenderRow {
  const typeId = typeof row.tdTenderTypeId === "number" ? row.tdTenderTypeId : Number(row.tdTenderTypeId) || 0;
  const defaults = typeDefaultsOf(typeId);
  const surchargePerc = row.tdSurchargePerc ?? 0;
  const base = row.tdAmount ?? 0;
  const surchargeFlat = Math.max(0, money((row.tdSurchargeAmt ?? 0) - money((base * surchargePerc) / 100)));
  return {
    key: nextRowKey("tender"),
    tdId: row.tdId,
    tenderId: row.tdTenderId,
    tenderTypeId: typeId,
    typeCode: defaults.code,
    tenderName: row.tdTenderName ?? defaults.displayName,
    tenderLedgerId: row.tdTenderLedgerId,
    settleLedgerId: row.tdSettleLedgerId,
    surchargeLedgerId: row.tdSurchargeLedgerId,
    surchargePerc,
    surchargeFlat,
    settlementDays: 0,
    minAmount: 0,
    maxAmount: null,
    conversionRate: toNumber(row.tdConversionRate) || 1,
    editSurcharge: false,
    allowChange: defaults.allowChange,
    needsRef: defaults.needsRef,
    hotkey: null,
    keyed: base,
    settleStatus: row.tdSettleStatus || "NA",
    refNo: row.tdRefNo,
    authCode: row.tdAuthCode,
    bankName: row.tdBankName,
    cardDigits: row.tdCardLast4,
    instrumentDate: toDateInput(row.tdInstrumentDate) || null,
    notes: row.tdNotes,
    tempCredit: row.tempCredit
      ? {
          name: row.tempCredit.name ?? "",
          mobile: row.tempCredit.mobile ?? "",
          place: row.tempCredit.place ?? null,
          addr: row.tempCredit.addr ?? null,
          idRef: row.tempCredit.idRef ?? null,
          days: toNumber(row.tempCredit.days),
          notes: row.tempCredit.notes ?? null,
        }
      : null,
    cheque: row.cheque
      ? {
          drawerName: row.cheque.drawerName ?? null,
          bankBranch: row.cheque.bankBranch ?? null,
          ifsc: row.cheque.ifsc ?? null,
          micr: row.cheque.micr ?? null,
        }
      : null,
    loyaltyPoints: toNumber(row.tdUnitsUsed),
    loyaltyRate: toNumber(row.tdConversionRate),
  };
}

/**
 * A loaded bill, as a whole draft.
 *
 * **Built, then derived once.** Nothing is painted row by row through the
 * pricing engine (§16): the draft is assembled here and `pricing` stays
 * `"stored"` so the screen shows the figures the bill was SAVED with, until the
 * operator's first edit flips it to `live`. That is what a reopened bill has to
 * do — the masters and the policy have moved on since, and a bill must keep the
 * numbers it was raised with.
 *
 * `storedPricing` is deliberately NOT reconstructed from the payload here: it is
 * assembled by the caller, which is the only place that also has the loaded
 * document's own charge rows in engine shape. See `storedPricingOf`.
 */
export function parseLoadedBill(
  payload: BillPayload,
  context: { companyStateCode: string; companyStateName: string },
): SaleBillDraft {
  const items = (payload.items ?? []).filter((item) => item.sbiIsDeleted !== true);
  const charges = (payload.charges ?? []).filter((row) => row.cdIsDeleted !== true);
  const tenders = (payload.tenders ?? []).filter((row) => row.tdIsDeleted !== true);

  const base = createBillDraft({
    companyId: payload.sbCompanyId,
    branchId: payload.sbBranchId,
    accYear: payload.sbAccYear,
    companyStateCode: context.companyStateCode,
    companyStateName: context.companyStateName,
    billDate: toDateInput(payload.sbBillDate),
  });

  const posStateCode = (payload.sbPosStcd ?? "").trim();
  // Records written before the customer-state / POS split (§5) carry only one of
  // the two, so each falls back to the other rather than to a constant.
  const custStateCode = (payload.sbCustStcd ?? "").trim() || posStateCode;

  return {
    ...base,
    mode: "browse",
    // Every figure on screen is the one that was saved, and stays so until the
    // first edit. Qt needed `m_loading` for this; here it is a state field.
    pricing: "stored",
    isDirty: false,
    docId: payload.sbId,
    billSlno: payload.sbBillSlno ?? "",
    billRefno: payload.sbBillRefno ?? "",
    status: asEnum(payload.sbStatus, BILL_STATUSES, DEFAULT_BILL_STATUS),
    versionNo: payload.sbVersionNo ?? 0,
    // The optimistic lock `/bills/amend` takes back as `baseRevision`.
    revisionNo: payload.sbRevisionNo ?? 0,
    isNewEntry: false,
    isDeleted: payload.sbIsDeleted === true || Boolean(payload.sbCancelledOn),
    amending: false,
    draftFromAutoPost: false,
    // Read, never computed (§17.2). A save response of an older build carries
    // none of these; the screen then treats the bill as it would a new one.
    rights: rightsOf(payload.rights),
    locks: locksOf(payload.locks),
    posting: postingOf(payload.posting),
    notes: [],
    overrides: [],
    sources: sourcesOf(payload.sources),
    // Only a POSTED bill holds live set-offs; a reloaded DRAFT's `adjustments`
    // is `[]` because draft set-offs are not stored (§14.4).
    heldAdjustments:
      payload.sbStatus === "POSTED" ? heldAdjustmentsOf(payload.adjustments) : [],
    // The document's OWN policy snapshot, never the current session's: a bill
    // reopened next year still prices the way it was created.
    policy: defaultPolicy({
      freightCalcType: (payload.sbFreightCalcType ?? "").trim() || "manual",
      loadingCalcType: (payload.sbLoadingCalcType ?? "").trim() || "manual",
      discountAlterBaseRate: payload.sbDiscAlterBase === true,
      roundOffStep: toNumber(payload.sbRoundOffStep) || 1,
    }),
    customer: {
      ...emptyCustomer(),
      custId: payload.sbCustId ?? null,
      name: payload.sbCustName,
      masterName: payload.sbCustName,
      address: payload.sbCustAddr,
      place: payload.sbCustPlace,
      phone: payload.sbCustPhone,
      gstin: payload.sbCustGstin,
      gstType: payload.sbCustGstType,
      stateCode: custStateCode || null,
      priceLevel: clampPriceLevel(payload.sbPriceLevel ?? 1),
      // `debit_allowed` is the MASTER's answer and the payload carries no copy
      // of it. A loaded credit bill evidently was allowed, so it is not
      // re-litigated; a loaded cash bill says nothing either way.
      debitAllowed: payload.sbBillType === "CREDIT",
    },
    header: {
      ...base.header,
      usrRefno: payload.sbUsrRefno ?? "",
      billDate: toDateInput(payload.sbBillDate),
      billDatetime: payload.sbBillDatetime ?? base.header.billDatetime,
      docType: asEnum(payload.sbDocType, BILL_DOC_TYPES, DEFAULT_BILL_DOC_TYPE),
      billType: asEnum(payload.sbBillType, BILL_TYPES, DEFAULT_BILL_TYPE),
      dueDays: payload.sbDueDays ?? 0,
      dueDate: toDateInput(payload.sbDueDate) || "",
      categoryId: payload.sbCategoryId,
      people: {
        ...emptyPeople(),
        // The `uuid[]` columns hold one id on this screen; a row written
        // elsewhere with several keeps the first, which is what the form can
        // show. The rest are not silently dropped on save — an untouched people
        // block re-sends what it read.
        salesmanId: payload.sbSalesmanId?.[0] ?? null,
        agentId: payload.sbAgentId,
        driverId: payload.sbDriverId,
        loadmanId: payload.sbLoadmanId?.[0] ?? null,
        packedId: payload.sbPackedId?.[0] ?? null,
        supervisorId: payload.sbSupervisorId,
        vehicleId: payload.sbVehicleId,
        vehicleNo: payload.sbVehicleNo ?? "",
      },
      posStateCode,
      posStateName: payload.sbStateName ?? "",
      hasFreight: payload.sbHasFreight === true,
      hasLoad: payload.sbHasLoad === true,
      hasUnload: payload.sbHasUnload === true,
      hasPromo: payload.sbHasPromo === true,
      hasComm: payload.sbHasComm === true,
      hasLoyalty: payload.sbHasLoyalty === true,
      priceLevel: clampPriceLevel(payload.sbPriceLevel ?? 1),
      billMode: asEnum(payload.sbBillMode ?? null, BILL_MODES, DEFAULT_BILL_MODE),
      custPan: payload.sbCustPan ?? null,
      form60Ref: payload.sbForm60Ref ?? null,
      loyaltyMemberId: payload.sbLoyaltyMemberId ?? null,
      custPin: payload.sbCustPin ?? null,
    },
    // The band, from the flat columns (§19). `transport` (nested) says the same.
    transport: transportFromPayload(payload),
    terms: {
      ...emptyBillTerms(),
      remarks: payload.sbRemarks ?? "",
      paymentTerms: payload.sbPaymentTerms ?? "",
      deliveryTerms: payload.sbDeliveryTerms ?? "",
      termsConditions: payload.sbTermsConditions ?? "",
    },
    lines: items
      .slice()
      .sort((a, b) => (a.sbiLineNo ?? 0) - (b.sbiLineNo ?? 0))
      .map(lineFromPayload),
    charges: charges
      .slice()
      .sort((a, b) => (a.cdSlno ?? 0) - (b.cdSlno ?? 0))
      .map(chargeFromBillPayload),
    // The place of supply decides the tax, compared against the COMPANY's state
    // — never re-derived from the customer master, which may have moved.
    isLocalSale:
      posStateCode && context.companyStateCode
        ? posStateCode === context.companyStateCode
        : true,
    source: payload.sbSrcDocId
      ? {
          docType: payload.sbSrcDocType ?? "",
          docId: payload.sbSrcDocId,
          accYear: payload.sbSrcDocYear,
          refno: payload.sbSrcDocRefno,
          date: toDateInput(payload.sbSrcDocDate) || null,
        }
      : null,
    tenders: tenders
      .slice()
      .sort((a, b) => (a.tdRowNo ?? 0) - (b.tdRowNo ?? 0))
      .map(tenderFromPayload),
    // Absent ≠ empty (§14.4). A POSTED bill's `/get` adjustments are its live
    // set-offs: they rebuild the panel's rows so an amend re-sends what the
    // operator chose. A bill settled with credit whose adjustments did NOT
    // come back is not authoritative: the save omits the key entirely, and
    // the panel says so. A reloaded DRAFT's set-offs are not stored at all.
    adjustments: payload.sbStatus === "POSTED" ? rowsFromHeld(heldAdjustmentsOf(payload.adjustments)) : [],
    adjustmentsTouched: adjustmentsAuthoritative(
      payload.sbStatus === "POSTED" ? heldAdjustmentsOf(payload.adjustments).length : 0,
      toNumber(payload.sbAdvanceAmt),
      toNumber(payload.sbNoteAdjAmt),
    ),
    settlement: {
      ...emptySettlement(),
      tenderAmt: toNumber(payload.sbTenderAmt),
      surchargeAmt: toNumber(payload.sbSurchargeAmt),
      creditAmt: toNumber(payload.sbCreditAmt),
      // Both kinds of set-off (§14.5): the stored `sbPaidAmt` INCLUDES them,
      // so the counter part is `paid − advance − note` (§15.9). Before this an
      // amend sent an advance twice as "paid" and 500'd.
      adjustedAmt: toNumber(payload.sbAdvanceAmt) + toNumber(payload.sbNoteAdjAmt),
      refundAmt: toNumber(payload.sbRefundAmt),
      payStatus: payload.sbPayStatus || "UNPAID",
    },
  };
}

/** The flat `sbShip* / sbDispatch* / sbTransport* / sbLr* / sbDistanceKm` columns → the band. */
export function transportFromPayload(payload: BillPayload): SaleBillDraft["transport"] {
  return {
    from: {
      godownId: payload.sbDispatchGodownId ?? null,
      branchId: payload.sbDispatchBranchId ?? null,
      addrId: null,
      name: null,
      addr: null,
      place: null,
      pin: null,
      phone: null,
      stcd: null,
      gstin: null,
    },
    to: {
      godownId: null,
      branchId: null,
      addrId: payload.sbShipAddrId ?? null,
      name: payload.sbShipName ?? null,
      addr: payload.sbShipAddr ?? null,
      place: payload.sbShipPlace ?? null,
      // The PIN may arrive as a number or a string.
      pin: payload.sbShipPin === null || payload.sbShipPin === undefined ? null : String(payload.sbShipPin),
      phone: payload.sbShipPhone ?? null,
      stcd: payload.sbShipStcd ?? null,
      gstin: payload.sbShipGstin ?? null,
    },
    mode: (payload.sbTransportMode ?? "").toUpperCase(),
    transporterId: payload.sbTransporterId ?? null,
    transporterName: payload.sbTransporterName ?? null,
    transporterGstin: payload.sbTransporterGstin ?? null,
    lrNo: payload.sbLrNo ?? null,
    lrDate: toDateInput(payload.sbLrDate) || null,
    distanceKm:
      payload.sbDistanceKm === null || payload.sbDistanceKm === undefined
        ? null
        : toNumber(payload.sbDistanceKm),
  };
}

function rightsOf(value: BillPayload["rights"]): BillRights | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  return {
    post: value.post === true,
    cancel: value.cancel === true,
    amend: value.amend === true,
    override: value.override === true,
    retender: value.retender === true,
  };
}

function locksOf(value: BillPayload["locks"]): BillLocks | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  return {
    returns: toNumber(value.returns),
    allocations: toNumber(value.allocations),
    dayClosed: value.dayClosed === true,
    irnLive: value.irnLive === true,
    ewbLive: value.ewbLive === true,
    irnCancelWindowUntil: value.irnCancelWindowUntil ?? null,
    ewbValidUpto: value.ewbValidUpto ?? null,
    editable: {
      document: value.editable?.document === true,
      transportBand: value.editable?.transportBand === true,
    },
  };
}

function postingOf(value: BillPayload["posting"]): BillPostingBlock | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  return {
    voucherId: value.voucherId ?? null,
    voucherRefno: value.voucherRefno ?? null,
    postedOn: value.postedOn ?? null,
    registerId: value.registerId ?? null,
    cogsAmt: toNumber(value.cogsAmt),
    loyaltyEarned: toNumber(value.loyaltyEarned),
    loyaltyRedeemed: toNumber(value.loyaltyRedeemed),
    irn: {
      status: value.irn?.status ?? "NA",
      number: value.irn?.number ?? null,
      ackNo: value.irn?.ackNo ?? null,
      ackOn: value.irn?.ackOn ?? null,
      message: value.irn?.message ?? null,
    },
    ewb: {
      status: value.ewb?.status ?? "NA",
      number: value.ewb?.number ?? null,
      generatedOn: value.ewb?.generatedOn ?? null,
      validUpto: value.ewb?.validUpto ?? null,
      message: value.ewb?.message ?? null,
      vehicleNo: value.ewb?.vehicleNo ?? null,
    },
  };
}

function sourcesOf(value: BillPayload["sources"]): BillSourceSummary[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .filter((row) => row && typeof row === "object" && typeof row.docId === "string")
    .map((row) => ({
      kind: row.kind,
      docId: row.docId,
      accYear: row.accYear ?? "",
      refno: row.refno ?? null,
      date: toDateInput(row.date) || null,
      lines: toNumber(row.lines),
      takenQty: toNumber(row.takenQty),
      openQtyAfter: row.openQtyAfter === null || row.openQtyAfter === undefined ? null : toNumber(row.openQtyAfter),
    }));
}

function heldAdjustmentsOf(value: BillPayload["adjustments"]): BillAdjustmentSummary[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .filter((row) => row && typeof row === "object" && typeof row.againstBillId === "string")
    .map((row) => ({
      againstBillId: row.againstBillId,
      againstBillAccYear: row.againstBillAccYear ?? "",
      refno: row.refno ?? null,
      amount: toNumber(row.amount),
      adjType: row.adjType ?? "",
    }));
}

/**
 * What a lifecycle answer (the `/get` shape from `/post`, `/amend` or a
 * reload) changes on the draft WITHOUT repainting it: status, revision, the
 * rights, the locks and the posting block. The lines stay as the operator sees
 * them; a screen that wants the stored figures reloads.
 */
export function applyBillLifecycle(draft: SaleBillDraft, payload: BillPayload): SaleBillDraft {
  return {
    ...draft,
    docId: payload.sbId ?? draft.docId,
    billRefno: payload.sbBillRefno ?? draft.billRefno,
    billSlno: payload.sbBillSlno ?? draft.billSlno,
    status: asEnum(payload.sbStatus, BILL_STATUSES, DEFAULT_BILL_STATUS),
    versionNo: payload.sbVersionNo ?? draft.versionNo,
    revisionNo: payload.sbRevisionNo ?? draft.revisionNo,
    isNewEntry: false,
    isDeleted: payload.sbIsDeleted === true || Boolean(payload.sbCancelledOn),
    rights: rightsOf(payload.rights) ?? draft.rights,
    locks: locksOf(payload.locks) ?? draft.locks,
    posting: postingOf(payload.posting) ?? draft.posting,
    sources: payload.sources ? sourcesOf(payload.sources) : draft.sources,
    heldAdjustments:
      payload.sbStatus === "POSTED" && payload.adjustments
        ? heldAdjustmentsOf(payload.adjustments)
        : draft.heldAdjustments,
  };
}

/**
 * Fold a save response back into the draft.
 *
 * The response is deliberately NOT re-parsed as a fresh document: on the save
 * path the server performs no joins, so `sbiItemName` / `sbiUnitName` come back
 * `null` and re-parsing would blank every item name on screen. Only the
 * server-owned identities are taken — the document id, the voucher number and
 * refno assigned from the sequence, the version, and the per-line / per-charge /
 * per-tender ids that make the next save an update instead of a duplicate.
 *
 * Merged against whatever the state is when the response LANDS, not against the
 * draft the request was built from: an operator can commit another cell while
 * the POST is in flight.
 */
export function applyBillSaveResponse(
  draft: SaleBillDraft,
  payload: BillPayload,
  sentDraft?: SaleBillDraft,
): SaleBillDraft {
  const savedItems = (payload.items ?? []).filter((item) => item.sbiIsDeleted !== true);
  const savedCharges = (payload.charges ?? []).filter((row) => row.cdIsDeleted !== true);
  const savedTenders = (payload.tenders ?? []).filter((row) => row.tdIsDeleted !== true);

  const itemByLineNo = new Map(savedItems.map((item) => [item.sbiLineNo ?? 0, item]));
  const chargeBySlno = new Map(savedCharges.map((row) => [row.cdSlno ?? 0, row]));
  const tenderByRowNo = new Map(savedTenders.map((row) => [row.tdRowNo ?? 0, row]));

  let populated = 0;
  const lines = draft.lines.map((line) => {
    if (!line.itemId) {
      return line;
    }
    populated += 1;
    const saved = itemByLineNo.get(populated) ?? savedItems[populated - 1];
    return saved ? { ...line, sbiId: saved.sbiId } : line;
  });

  let chargeIndex = 0;
  const charges = draft.charges.map((row) => {
    if (!row.chgId || !row.ledgerCode) {
      return row;
    }
    chargeIndex += 1;
    const saved = chargeBySlno.get(chargeIndex) ?? savedCharges[chargeIndex - 1];
    return saved ? { ...row, cdId: saved.cdId } : row;
  });

  let tenderIndex = 0;
  const tenders = draft.tenders.map((row) => {
    if (!row.tenderId || row.keyed <= 0) {
      return row;
    }
    tenderIndex += 1;
    const saved = tenderByRowNo.get(tenderIndex) ?? savedTenders[tenderIndex - 1];
    return saved ? { ...row, tdId: saved.tdId } : row;
  });

  return {
    ...draft,
    docId: payload.sbId,
    // A string end to end: `sb_bill_slno` is a bigint, and a series that is not
    // purely numeric has to survive the round trip.
    billSlno: payload.sbBillSlno ?? draft.billSlno,
    billRefno: payload.sbBillRefno ?? draft.billRefno,
    versionNo: payload.sbVersionNo ?? draft.versionNo,
    revisionNo: payload.sbRevisionNo ?? draft.revisionNo,
    status: asEnum(payload.sbStatus, BILL_STATUSES, DEFAULT_BILL_STATUS),
    isNewEntry: false,
    isDeleted: payload.sbIsDeleted === true,
    // The save answers the `/get` shape, so the rights and locks arrive with it.
    rights: rightsOf(payload.rights) ?? draft.rights,
    locks: locksOf(payload.locks) ?? draft.locks,
    isDirty: sentDraft === undefined ? false : sentDraft !== draft,
    lines,
    charges,
    tenders,
    settlement: {
      ...draft.settlement,
      payStatus: payload.sbPayStatus || draft.settlement.payStatus,
    },
  };
}
