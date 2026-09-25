/**
 * Sale Bill Entry — the server's DTO whitelists, copied from
 * `nexerp-api` `modules/sales/bill/dto/*` and the two shared detail DTOs
 * (2026-09-25).
 *
 * Every body DTO runs `forbidNonWhitelisted` at every nesting level, so a key
 * outside these lists is a 400 on the WHOLE save (§4.4). The payload tests
 * assert that nothing the builders emit falls outside them; the lists are the
 * contract, and a key the server adds is added here on purpose, with a date.
 *
 * Keys the server declares but IGNORES are still listed (they pass), and keys
 * the client must never send are documented at the builder, not here.
 */

export const SAVE_BILL_DTO_KEYS = new Set<string>([
  "sbId", "sbCompanyId", "sbBranchId", "sbTenantId", "sbAccYear", "sbSessionId", "sbCounterId",
  "sbDeviceType", "sbDeviceId", "sbDocType", "sbBillType", "sbCategoryId", "sbPriceLevel",
  "sbBillSlno", "sbBillRefno", "sbUsrRefno", "sbBillDate", "sbBillDatetime", "sbDueDays",
  "sbDueDate", "sbSrcDocType", "sbSrcDocId", "sbSrcDocRefno", "sbSrcDocDate", "sbSrcDocYear",
  "sbCustId", "sbCustName", "sbCustAddr", "sbCustPlace", "sbCustPin", "sbCustPhone",
  "sbCustGstin", "sbCustGstType", "sbCustStcd", "sbPosStcd", "sbStateName", "sbHasLoad",
  "sbHasUnload", "sbHasFreight", "sbHasPromo", "sbHasComm", "sbHasLoyalty", "sbUserId",
  "sbSalesmanId", "sbAgentId", "sbAgentCommPerc", "sbAgentCommAmt", "sbDriverId",
  "sbLoadmanId", "sbPackedId", "sbSupervisorId", "sbVehicleId", "sbVehicleNo", "sbTotItems",
  "sbTotWeight", "sbTotBags", "sbGrossAmt", "sbItemDisc", "sbSplDisc", "sbSchDisc",
  "sbBillSchDisc", "sbAddlDisc1", "sbAddlDisc2", "sbCashDisc", "sbTaxableAmt", "sbCgstAmt",
  "sbSgstAmt", "sbIgstAmt", "sbCessAmt", "sbTaxAmt", "sbFreightAmt", "sbLoadAmt",
  "sbUnloadAmt", "sbOtherAmt1", "sbOtherAmt2", "sbRoundOff", "sbBillAmt", "sbTotalCost",
  "sbMarginAmt", "sbMarginAmtWot", "sbMarginPerc", "sbMrpSavings", "sbMrpSavingsPerc",
  "sbPayMode", "sbCreditAmt", "sbSurchargeAmt", "sbTenderAmt", "sbRefundAmt", "sbAdvanceAmt",
  "sbNoteAdjAmt", "sbPaidAmt", "sbBalanceAmt", "sbPayStatus", "sbReturnedAmt",
  "sbReturnStatus", "sbPaymentTerms", "sbDeliveryTerms", "sbTermsConditions", "sbRemarks",
  "sbFreightCalcType", "sbLoadingCalcType", "sbDiscAlterBase", "sbRoundOffStep", "sbStatus",
  "sbPostedVoucherId", "sbApprovedOn", "sbApprovedBy", "sbCancelReason", "sbVersionNo",
  "sbPrintCount", "sbCreatedBy", "sbModifiedBy", "sbBillMode", "sbUsrRefdate", "custOverride",
  "sbShipAddrId", "sbShipName", "sbShipAddr", "sbShipPlace", "sbShipPin", "sbShipPhone",
  "sbShipStcd", "sbShipGstin", "sbDispatchGodownId", "sbDispatchBranchId", "sbTransportMode",
  "sbTransporterId", "sbTransporterName", "sbTransporterGstin", "sbLrNo", "sbLrDate",
  "sbDistanceKm", "sbCustPan", "sbForm60Ref", "sbLoyaltyMemberId", "sbTcsPerc", "sbTcsAmt",
  "sbHasDc", "sbRevisionNo", "sbDocRegisterId", "sbCogsAmt", "sbDeliveryStatus",
  "sbLoyaltyEarned", "sbLoyaltyRedeemed", "items", "charges", "tenders", "adjustments",
]);

export const SAVE_BILL_ITEM_DTO_KEYS = new Set<string>([
  "sbiId", "sbiBillId", "sbiCompanyId", "sbiBranchId", "sbiTenantId", "sbiAccYear",
  "sbiLineNo", "sbiSplitNo", "sbiSrcDocType", "sbiSrcDocId", "sbiSrcDocYear",
  "sbiSrcDocRefno", "sbiSrcDocLineNo", "sbiSrcItemQty", "sbiSrcFreeQty", "sbiSrcItemId",
  "sbiBucket", "sbiLotId", "sbiPromoUsageId", "sbiCogsAmt", "sbiItemId", "sbiItemUnitId",
  "sbiToBaseFactor", "sbiHsnCode", "sbiPriceLevel", "sbiEanCode", "sbiSize", "sbiSizeUom",
  "sbiGodownId", "sbiStockId", "sbiBatchNo", "sbiBatchDate", "sbiExpiryDate", "sbiSerialNo",
  "sbiIsTaxIncl", "sbiIsPromo", "sbiIsFree", "sbiFreeType", "sbiIsService", "sbiHasFreight",
  "sbiCaseQty", "sbiBillQty", "sbiLengthQty", "sbiNetQty", "sbiWeightQty",
  "sbiAvailableStock", "sbiReturnQty", "sbiRate", "sbiRatePreTax", "sbiRateDiff",
  "sbiActPrice", "sbiMaxPrice", "sbiMinPrice", "sbiCostPrice", "sbiCostPreTax",
  "sbiItemDiscPerc", "sbiItemDiscQty", "sbiItemDiscAmt", "sbiSplDiscPerc", "sbiSplDiscQty",
  "sbiSplDiscAmt", "sbiSchDiscPerc", "sbiSchDiscQty", "sbiSchDiscAmt", "sbiBillSchPerc",
  "sbiBillSchQty", "sbiBillSchAmt", "sbiAddlDisc1Perc", "sbiAddlDisc1Amt", "sbiAddlDisc2Perc",
  "sbiAddlDisc2Amt", "sbiCashDiscPerc", "sbiCashDiscAmt", "sbiGrossAmt", "sbiNetGross",
  "sbiChrgBeforeTax", "sbiChrgAfterTax", "sbiTaxableAmt", "sbiTaxPerc", "sbiTaxAmt",
  "sbiCgstPerc", "sbiCgstAmt", "sbiSgstPerc", "sbiSgstAmt", "sbiIgstPerc", "sbiIgstAmt",
  "sbiCessPerc", "sbiCessPerUnit", "sbiCessAmt", "sbiAcessPerc", "sbiAcessPerUnit",
  "sbiAcessAmt", "sbiBatchConfig", "sbiFreightQty", "sbiFreightAmt", "sbiLoadQty",
  "sbiLoadAmt", "sbiUnloadQty", "sbiUnloadAmt", "sbiRoundOff", "sbiNetAmt", "sbiSoldPrice",
  "sbiSoldPreTax", "sbiItemProfit", "sbiProfitPreTax", "sbiMrpSavings", "sbiMrpSavingsPerc",
  "sbiSalesmanId", "sbiSchemeId", "sbiSchemeName", "sbiRemarks", "sbiCreatedBy",
  "sbiModifiedBy",
]);

/** `master/charge-detail/dto/save-charge-detail.dto.ts` — `txn_charge_detail`. */
export const SAVE_CHARGE_DETAIL_DTO_KEYS = new Set<string>([
  "cdId", "cdDocType", "cdDocId", "cdSlno", "cdCompId", "cdBranchId", "cdAccYear",
  "cdVoucherNo", "cdChgId", "cdChgName", "cdRole", "cdMethod", "cdType", "cdApplyOn",
  "cdLedgerCode", "cdLandingCost", "cdCostAlloc", "cdBeforeTax", "cdTaxApl", "cdSepPost",
  "cdUnit", "cdQtyVal", "cdWeight", "cdRate", "cdAmount", "cdTaxCode", "cdHsn", "cdTaxPerc",
  "cdTaxAmt", "cdSgstPerc", "cdSgstAmt", "cdCgstPerc", "cdCgstAmt", "cdIgstPerc", "cdIgstAmt",
  "cdCessPerc", "cdCessAmt", "cdNetAmt", "cdRemarks", "cdIsActive", "cdSrcCdId",
  "cdSrcAccYear", "cdCarryBasis", "cdCreatedBy", "cdModifiedBy",
]);

/** `accountsModule/tenderDetail/dto/save-tender-detail.dto.ts` — `acc_tender_detail`. */
export const SAVE_TENDER_DETAIL_DTO_KEYS = new Set<string>([
  "tdId", "tdSrcModule", "tdSrcDocType", "tdSrcDocId", "tdRowNo", "tdCompanyId", "tdBranchId",
  "tdTenantId", "tdAccYear", "tdDocDate", "tdPartyLedgerId", "tdVoucherId", "tdTenderId",
  "tdTenderTypeId", "tdTenderLedgerId", "tdDrCr", "tdAmount", "tdSurchargePerc",
  "tdSurchargeAmt", "tdSurchargeLedgerId", "tdTotalAmt", "tdReceivedAmt", "tdChangeAmt",
  "tdUnitsUsed", "tdConversionRate", "tdRefNo", "tdAuthCode", "tdCardLast4", "tdBankName",
  "tdPayerVpa", "tdInstrumentDate", "tdIsPdc", "tdSettleStatus", "tdSettleLedgerId",
  "tdExpectedSettleOn", "tdSettledOn", "tdSettleAmount", "tdMdrAmt", "tdSettleRefNo",
  "tdSettleVoucherId", "tdSessionId", "tdDeviceId", "tdUserId", "tdNotes", "tdCreatedBy",
  "tdModifiedBy", "cheque", "tempCredit",
]);

export const SAVE_BILL_ADJUSTMENT_DTO_KEYS = new Set<string>([
  "againstBillId", "againstBillAccYear", "amount", "remarks", "billType", "adjType",
  "settlementMode",
]);

/** `ValidateBillDto extends SaveBillDto` + `overrides`. */
export const VALIDATE_BILL_DTO_KEYS = new Set<string>([...SAVE_BILL_DTO_KEYS, "overrides"]);

export const POST_BILL_DTO_KEYS = new Set<string>([
  "sbId", "sbCompanyId", "sbBranchId", "sbAccYear", "overrides", "printAfter", "adjustments",
]);

/** `AmendBillDto extends ValidateBillDto` + the lock, the remark and the print flag. */
export const AMEND_BILL_DTO_KEYS = new Set<string>([
  ...VALIDATE_BILL_DTO_KEYS, "baseRevision", "editRemark", "printAfter",
]);

/** Every key of `body` that `allowed` does not list. Empty is the only acceptable answer. */
export function keysOutside(body: Record<string, unknown>, allowed: Set<string>): string[] {
  return Object.keys(body).filter((key) => !allowed.has(key));
}
