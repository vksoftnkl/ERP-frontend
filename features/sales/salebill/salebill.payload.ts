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
import { buildTenderPayload, settledTenderRows } from "@/features/sales/sale-order/sale-order.payload";
import { computeTenders } from "@/features/sales/sale-order/tender/arithmetic";
import type { TenderDraftRow } from "@/features/sales/sale-order/sale-order.types";
import { typeDefaultsOf } from "@/features/sales/sale-order/tender/rows";
import {
  BILL_DOC_TYPES,
  BILL_STATUSES,
  BILL_TYPES,
  DEFAULT_BILL_DOC_TYPE,
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
import type {
  BillChargePayload,
  BillItemPayload,
  BillPayload,
  BillTenderPayload,
  SaleBillDraft,
  SaleBillDraftLine,
  SaveBillAdjustmentDto,
  SaveBillChargeDto,
  SaveBillDto,
  SaveBillItemDto,
  SaveBillTenderDto,
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
    sbiSrcDocType: line.srcDocType,
    sbiSrcDocId: line.srcDocId,
    sbiSrcDocYear: line.srcDocYear,
    sbiSrcDocRefno: toNullableText(line.srcDocRefno, 100),
    sbiSrcDocLineNo: line.srcDocLineNo,
    // What the SOURCE line ordered — not `orderQty`, which on an imported line
    // holds what was still PENDING. Sending the pending figure here would let
    // the order's own arithmetic be re-derived against the wrong denominator.
    sbiSrcItemQty: line.srcItemQty,
    sbiSrcFreeQty: null,
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

/** The dominant tender mode, for the quick filters `sb_pay_mode` drives. */
function payModeOf(rows: TenderDraftRow[]): string | null {
  let best: { code: string; amount: number } | null = null;
  for (const row of rows) {
    if (row.keyed <= 0) {
      continue;
    }
    if (!best || row.keyed > best.amount) {
      best = { code: row.typeCode, amount: row.keyed };
    }
  }
  return best ? best.code : null;
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

  const tenderRows = settledTenderRows(draft.tenders);
  const tenderComputation = computeTenders(
    tenderRows.map((row) => ({
      key: row.key,
      keyed: row.keyed,
      allowChange: row.allowChange,
      surcharge: { perc: row.surchargePerc, flat: row.surchargeFlat },
    })),
    totals.bill,
  );
  const adjustmentRows = draft.adjustments.filter((row) => row.amount > 0);
  const adjusted = Math.round(adjustmentRows.reduce((sum, row) => sum + row.amount, 0) * 100) / 100;

  // A CREDIT tender settles the document and posts no accounting leg at all —
  // the party debit simply stays open (§9). It is reported separately in
  // `sbCreditAmt` so the server can tell the two apart without re-deriving the
  // tender type.
  const creditAmt =
    Math.round(
      tenderRows
        .filter((row) => row.typeCode === "CREDIT")
        .reduce((sum, row) => sum + row.keyed, 0) * 100,
    ) / 100;

  const settled = tenderComputation.totals.settled;
  const paid = Math.round((settled + adjusted) * 100) / 100;
  const balance = Math.max(0, Math.round((totals.bill - paid) * 100) / 100);

  const isCredit = draft.header.billType === "CREDIT";

  return {
    ...(draft.docId ? { sbId: draft.docId } : {}),
    sbCompanyId: draft.companyId,
    sbBranchId: draft.branchId,
    sbAccYear: draft.accYear,
    sbSessionId: actor.sessionId,
    sbCounterId: null,
    // Both are part of the bill's identity — the counters are offline-first, so
    // a bill has to say which device raised it, and both are `@IsNotEmpty`
    // server-side. `deviceId` is this browser's own localStorage id (free text;
    // nothing joins on it), NOT `device_master.dev_id` — that one is the hold's,
    // and the two are not interchangeable.
    sbDeviceType: actor.deviceType || "WEB",
    sbDeviceId: actor.deviceId ?? "",
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
    sbCustPin: null,
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
    sbPayMode: payModeOf(tenderRows),
    sbCreditAmt: creditAmt,
    // The bank's cut, never the shop's takings, and NEVER re-entered into the
    // pricing engine (§9): a surcharge is a charge on the payment instrument,
    // not on the goods.
    sbSurchargeAmt: tenderComputation.totals.surchargeTotal,
    sbTenderAmt: tenderComputation.totals.tendered,
    sbRefundAmt: tenderComputation.totals.refund,
    sbAdvanceAmt: adjusted,
    sbPaidAmt: paid,
    sbBalanceAmt: balance,
    sbPayStatus: payStatusOf(paid, totals.bill),
    sbPaymentTerms: toNullableText(draft.terms.paymentTerms, 250),
    sbDeliveryTerms: toNullableText(draft.terms.deliveryTerms, 250),
    sbTermsConditions: toNullableText(draft.terms.termsConditions),
    sbRemarks: toNullableText(draft.terms.remarks, 500),
    // Lower case, and NOT normalised server-side.
    sbFreightCalcType: (draft.policy.freightCalcType || "manual").toLowerCase(),
    sbLoadingCalcType: (draft.policy.loadingCalcType || "manual").toLowerCase(),
    sbDiscAlterBase: draft.policy.discountAlterBaseRate,
    sbRoundOffStep: draft.policy.roundOffStep,
    // A bill is RAISED, never drafted: the screen has no save-as-draft door, so
    // a create always posts. Only an existing bill carries its own status back
    // (a POSTED bill re-saved stays posted; a CANCELLED one stays cancelled) —
    // which also keeps a cart parked before this rule from re-posting as DRAFT.
    sbStatus: draft.docId
      ? asEnum(draft.status, BILL_STATUSES, DEFAULT_BILL_STATUS)
      : DEFAULT_BILL_STATUS,
    sbCreatedBy: actorLabel(actor),
    sbModifiedBy: actorLabel(actor),
    items: lineIndexes.map(({ line, index }, position) =>
      itemDto(line, pricing.lines[index], position),
    ),
    charges: chargeRows.map(
      (row, position) =>
        chargeDto(row, pricedByKey.get(row.key), position, chargeTotals) as SaveBillChargeDto,
    ),
    ...(tenderRows.length > 0 || draft.tenders.some((row) => row.tdId)
      ? {
          tenders: tenderRows.map(
            (row, position) =>
              buildTenderPayload(
                row,
                tenderComputation.rows[position],
                position,
                draft.header.billDate,
                actor,
              ) as SaveBillTenderDto,
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

function payStatusOf(paid: number, bill: number): string {
  if (bill <= 0 || paid <= 0) {
    return "UNPAID";
  }
  return Math.round(paid * 100) >= Math.round(bill * 100) ? "PAID" : "PARTIAL";
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

function tenderFromPayload(row: BillTenderPayload): TenderDraftRow {
  const defaults = typeDefaultsOf(row.tdTenderTypeId);
  return {
    key: nextRowKey("tender"),
    tdId: row.tdId,
    tenderId: row.tdTenderId,
    tenderTypeId: row.tdTenderTypeId,
    typeCode: defaults.code,
    tenderName: defaults.displayName,
    tenderLedgerId: row.tdTenderLedgerId,
    settleLedgerId: row.tdSettleLedgerId,
    surchargeLedgerId: row.tdSurchargeLedgerId,
    surchargePerc: row.tdSurchargePerc ?? 0,
    surchargeFlat: 0,
    settlementDays: 0,
    minAmount: 0,
    maxAmount: null,
    conversionRate: 1,
    editSurcharge: false,
    allowChange: defaults.allowChange,
    needsRef: defaults.needsRef,
    hotkey: null,
    // What was KEPT plus what was handed back: `computeTenders` takes the keyed
    // amount and re-derives the change, so reloading must reconstruct what the
    // operator actually typed, not what settled.
    keyed: (row.tdAmount ?? 0) + (row.tdChangeAmt ?? 0),
    settleStatus: row.tdSettleStatus || "NA",
    refNo: row.tdRefNo,
    authCode: row.tdAuthCode,
    bankName: row.tdBankName,
    cardDigits: row.tdCardLast4,
    instrumentDate: toDateInput(row.tdInstrumentDate) || null,
    notes: row.tdNotes,
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
    isNewEntry: false,
    isDeleted: payload.sbIsDeleted === true || Boolean(payload.sbCancelledOn),
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
    },
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
    // `GET /bills/get` returns no adjustments array at all, so a loaded bill
    // cannot know what was set off against it. `adjustmentsTouched` stays false,
    // which is what makes the save OMIT the key and leave the stored settlement
    // exactly as it is (§15). Sending `[]` here would silently reverse it.
    adjustments: [],
    adjustmentsTouched: false,
    settlement: {
      ...emptySettlement(),
      tenderAmt: toNumber(payload.sbTenderAmt),
      surchargeAmt: toNumber(payload.sbSurchargeAmt),
      creditAmt: toNumber(payload.sbCreditAmt),
      adjustedAmt: toNumber(payload.sbAdvanceAmt),
      refundAmt: toNumber(payload.sbRefundAmt),
      payStatus: payload.sbPayStatus || "UNPAID",
    },
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
    status: asEnum(payload.sbStatus, BILL_STATUSES, DEFAULT_BILL_STATUS),
    isNewEntry: false,
    isDeleted: payload.sbIsDeleted === true,
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
