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
import type { DocumentPricing } from "@/domain/pricing";
import { actorLabel, type SaveActor } from "@/features/sales/quotation/quotation.payload";
import { clampPriceLevel } from "@/features/sales/quotation/quotation.state";
import { asEnum, toNullableText } from "@/features/sales/quotation/quotation.utils";
import { settledTenderRows } from "@/features/sales/sale-order/sale-order.payload";
import {
  BILL_DOC_TYPES,
  BILL_MODES,
  BILL_TYPES,
  DEFAULT_BILL_DOC_TYPE,
  DEFAULT_BILL_MODE,
  DEFAULT_BILL_TYPE,
} from "@/features/sales/testbill/constants";
import { nowStamp } from "@/features/sales/testbill/state/factories";
import { advanceAdjusted, noteAdjusted } from "@/features/sales/testbill/domain/validate";
import { settleRows, settlementOutcome } from "@/features/sales/testbill/engines/settle";
import type {
  AmendBillDto,
  BillKey,
  BillTenderRow,
  PostBillDto,
  SaleBillDraft,
  SaveBillAdjustmentDto,
  SaveBillChargeDto,
  SaveBillDto,
  ValidateBillDto,
} from "@/features/sales/testbill/types";
import { adjustmentDto, adjustmentsForWire } from "./build-adjustments";
import { chargeDtoForBill } from "./build-charges";
import { dateOrNull, itemDto, uuidArray, uuidOrNull } from "./build-items";
import { buildBillTenderDto, rollupsForPayload } from "./build-tenders";

export { adjustmentsForWire, adjustmentDto } from "./build-adjustments";
export { buildBillTenderDto, rollupsForPayload } from "./build-tenders";
export { itemDto } from "./build-items";
export { chargeDtoForBill } from "./build-charges";
export {
  applyBillLifecycle,
  applyBillSaveResponse,
  parseLoadedBill,
  tenderFromPayload,
  transportFromPayload,
} from "@/features/sales/testbill/domain/load-map";

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
  const chargeScope = { companyId: draft.companyId, branchId: draft.branchId, accYear: draft.accYear };
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
        chargeDtoForBill(row, pricedByKey.get(row.key), position, chargeTotals, chargeScope, actor),
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

