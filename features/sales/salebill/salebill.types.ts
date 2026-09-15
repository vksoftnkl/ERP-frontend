/**
 * Sale Bill Entry — types.
 *
 * Same three families as the quotation screen (`quotation.types.ts`), and the
 * shared shapes are IMPORTED from there rather than restated: the lookups, the
 * charge rows and the customer snapshot are byte-for-byte the same contracts.
 * What lives here is what the BILL adds.
 *
 * Four things the bill has that neither sibling does, in the order they matter:
 *
 *  1. **Settlement** (§9) — tendered money, its own dialog.
 *  2. **Adjustments** (§10) — credits the customer already holds. An adjustment
 *     is NEVER a tender; they are different rows in different tables and post
 *     differently.
 *  3. **It closes things** (§8) — billing an order line consumes it.
 *  4. **It must survive the counter** (§12) — hold, autosave, recovery.
 *
 * The DRAFT shapes come first, then the wire shapes. They are kept apart on
 * purpose: the draft is what the operator edits and the payload builders are the
 * only code allowed to know how the two map onto each other.
 */
import type { DocumentPricing, VoucherPolicy } from "@/domain/pricing";
import type {
  CustomerSnapshot,
  DraftChargeRow,
  DraftLine as QuotationDraftLine,
  FreightBand,
} from "@/features/sales/quotation/quotation.types";
import type {
  PartyCreditSummary,
  TenderDraftRow,
} from "@/features/sales/sale-order/sale-order.types";

// ---------------------------------------------------------------------------
// Lines
// ---------------------------------------------------------------------------

/**
 * The source order line's own state, echoed onto a bill line that was imported
 * from one. Readonly and server-owned — the bill reports it, never sets it.
 *
 * `pendingQty` is what is still open on that order line AT IMPORT TIME, which is
 * also what the line's `orderQty` is capped at (§7.3). The two are kept apart
 * deliberately: `orderQty` is the cap the operator is billing against and is a
 * draft field the payload sends, while this is the echo the grid paints.
 */
export type LineSourceEcho = {
  readonly pendingQty: number;
  readonly lineStatus: string;
};

/**
 * One bill line: the quotation draft line (which is the engine `Line` plus
 * everything the engine does not read) extended with the bill's own columns.
 *
 * The inherited `sqiId` is dead weight here — `sbiId` is the server id on this
 * screen — but inheriting the whole shape is what lets the bill reuse the
 * quotation's grid components unchanged, exactly as the sale order does.
 *
 * On the batch allocation: one batch per row by design. The lookup's godown and
 * stock identify the row the quantity comes from, and `sbiGodownId` is REQUIRED
 * server-side — a line whose price lookup answered with a null godown cannot be
 * saved at all. Nothing fills `stockId` / `serialNo` yet (§18.2).
 */
export type SaleBillDraftLine = QuotationDraftLine & {
  /** Server id. `null` on a line that has never been saved. */
  sbiId: string | null;
  /** `sbi_stock_id` — the stock row the quantity is picked from. */
  stockId: string | null;
  /** `sbi_serial_no` — one serial per row, like the batch. */
  serialNo: string | null;
  /** Source trail — stamped by the quotation / order import (§13). */
  srcDocType: string | null;
  srcDocYear: string | null;
  srcDocRefno: string | null;
  srcDocLineNo: number | null;
  /**
   * What the SOURCE line ordered, as opposed to `orderQty`, which on an imported
   * line holds what was still pending. Echoed back to the server as
   * `sbiSrcItemQty` so the order's own arithmetic can be re-derived.
   */
  srcItemQty: number | null;
  /**
   * Whether `orderQty` is a cap this line may not exceed. True exactly when the
   * line came from a sales order; a hand-keyed line has nothing to cap (§7.3).
   */
  orderQtyLocked: boolean;
  /**
   * Whether the negative-stock gate can be judged for this line at all.
   *
   * The Qt screen hard-codes `AllowNegative` to `"Y"` on its own load path and on
   * the order import, and leaves it EMPTY on the quotation import — three
   * behaviours for one rule (§7.2). None of the three is ported. The flag
   * belongs to the item and the stock figure must be today's, so both are
   * re-resolved from the item lookup; when that cannot be done, this goes false
   * and the gate reports itself UNAVAILABLE rather than inventing an answer in
   * either direction.
   *
   * A hand-picked line is always resolved, because the pick IS the lookup.
   */
  stockGateResolved: boolean;
  /** Absent on a hand-keyed line; painted from the import or the GET otherwise. */
  source?: LineSourceEcho;
};

// ---------------------------------------------------------------------------
// Header
// ---------------------------------------------------------------------------

/**
 * The people a bill names. Six roles, and three of them
 * (`sb_salesman_id`, `sb_loadman_id`, `sb_packed_id`) are `uuid[]` columns —
 * Prisma scalar lists, which have no nullable form, so "nobody" is an empty
 * array and never `null`.
 *
 * The screen keys one id into each; the payload wraps the three array-backed
 * ones. Modelling them as arrays here instead would put the multi-select
 * question on the entry form before anyone has asked for it.
 */
export type BillPeople = {
  salesmanId: string | null;
  salesmanName: string;
  agentId: string | null;
  agentName: string;
  driverId: string | null;
  driverName: string;
  loadmanId: string | null;
  loadmanName: string;
  packedId: string | null;
  packedName: string;
  supervisorId: string | null;
  supervisorName: string;
  vehicleId: string | null;
  /** `sb_vehicle_no`, varchar(20) — free text; there is no vehicle dropdown. */
  vehicleNo: string;
};

export type SaleBillHeader = {
  /** The operator's own reference. The bill number itself is server-assigned. */
  usrRefno: string;
  /** `yyyy-mm-dd`. The accounting year is derived from it and then frozen. */
  billDate: string;
  /**
   * `sb_bill_datetime` — the counter's clock, to the second.
   *
   * A bill is stamped with a TIME as well as a date because two bills on one
   * counter on one day have to be orderable, and the voucher number alone does
   * not survive a back-dated entry. Seeded at mount and left alone; the operator
   * keys the date, never the time.
   */
  billDatetime: string;
  docType: string;
  /** CASH or CREDIT — the term. Drives due days / due date and the save gate. */
  billType: string;
  /**
   * Due days and due date are two views of one period counted from `billDate`,
   * exactly like the quotation's validity pair: editing one re-derives the
   * other. Both are sent only for a CREDIT bill.
   */
  dueDays: number;
  dueDate: string;
  /** `sb_category_id` — the sales category master. No dropdown is configured. */
  categoryId: string | null;
  contactPerson: string;
  contactNo: string;
  people: BillPeople;
  /**
   * Place of supply — the OPERATOR's, and since 2026-09-11 a different fact from
   * the customer's own state code (§5). This is what decides CGST+SGST vs IGST;
   * the customer's state is a snapshot that decides nothing.
   */
  posStateCode: string;
  posStateName: string;
  hasFreight: boolean;
  hasLoad: boolean;
  hasUnload: boolean;
  hasPromo: boolean;
  hasComm: boolean;
  /**
   * `sb_has_loyalty` — a boolean, and the WHOLE of the loyalty contract with the
   * server. There is no accrual path (§11): the points are shown, a per-line
   * `LoyaltyPv` is carried, the document total is computed, and the tender dialog
   * can redeem — but nothing records an accrual, so do not build one on the
   * assumption that the server is.
   */
  hasLoyalty: boolean;
  priceLevel: number;
};

export type SaleBillTerms = {
  remarks: string;
  paymentTerms: string;
  deliveryTerms: string;
  termsConditions: string;
};

// ---------------------------------------------------------------------------
// What the bill adds below the grid
// ---------------------------------------------------------------------------

/** The document the bill was raised from — derived from `sbSrcDoc*` (§13). */
export type BillSourceTrail = {
  docType: string;
  docId: string;
  /**
   * The source's OWN accounting year. Every txn table is partitioned by it, so a
   * March order really can be billed in April and the year has to travel with
   * the id or the fetch reads the wrong partition.
   */
  accYear: string | null;
  refno: string | null;
  /** `yyyy-mm-dd`. */
  date: string | null;
};

/**
 * The settlement roll-ups, reconciled in ONE place (§9) — every path that can
 * change any of them ends in the same derivation, so tendered, adjusted, balance
 * and refund cannot disagree.
 *
 * Zeroed and inert until phase 4 puts the tender dialog behind it. `tenderAmt`
 * is what crossed the counter GROSS, surcharge included; `adjustedAmt` is what
 * was set off out of credits the customer already held. They are added together
 * against the bill and they are never the same kind of money:
 *
 *  - a **CREDIT tender** (tender type 9) posts no accounting leg at all — the
 *    party debit simply stays open;
 *  - **surcharge** is a charge on the payment instrument, not on the goods, so
 *    it must never re-enter the pricing engine.
 */
export type BillSettlement = {
  tenderAmt: number;
  surchargeAmt: number;
  creditAmt: number;
  adjustedAmt: number;
  refundAmt: number;
  payStatus: string;
};

// ---------------------------------------------------------------------------
// The draft
// ---------------------------------------------------------------------------

/**
 * `entry` = editable; `browse` = a loaded document painted read-only.
 *
 * A loaded document additionally starts `stored`: every figure on screen is the
 * one that was saved, so nothing is repriced until the operator's first edit.
 * Qt needed an `m_loading` flag at the top of its recalc for this because it
 * paints cell by cell through the same handlers the operator triggers; here a
 * load builds the whole draft and derives once, so the flag has no counterpart
 * and is deliberately not ported (§21).
 */
export type SaleBillMode = "entry" | "browse";
export type SaleBillPricingSource = "live" | "stored";

export type SaleBillDraft = {
  mode: SaleBillMode;
  pricing: SaleBillPricingSource;
  isDirty: boolean;

  // Tenant context — the VOUCHER's, seeded from the session for a new bill and
  // overwritten from the record on load. Every lookup and the save read THESE,
  // never the session. All five are part of the bill's identity: every txn table
  // is partitioned by the accounting year and the counters are offline-first.
  companyId: string;
  branchId: string;
  accYear: string;
  /**
   * The company's own GST state code, compared against the place of supply to
   * decide local vs inter-state. The DEFAULT place of supply is this, not a
   * hard-coded 33 / Tamil Nadu (§5).
   */
  companyStateCode: string;
  companyStateName: string;

  // Server-owned identity, held so an update hands it back untouched.
  docId: string | null;
  /**
   * `sb_bill_slno` — bigint, so always a string. Allocated from the voucher
   * sequence (voucher type 22) inside the create transaction and NEVER sent;
   * whatever a client puts in the field is ignored.
   */
  billSlno: string;
  /**
   * `sb_bill_refno` — and this one is server-assigned too, contrary to the
   * plan's §15. `allocateVoucherNumber` writes both; the printable form is
   * `prefix + zero-padded number + suffix`, e.g. `bil00001`. The client has no
   * say in either.
   */
  billRefno: string;
  status: string;
  versionNo: number;
  isNewEntry: boolean;
  isDeleted: boolean;

  policy: VoucherPolicy;
  customer: CustomerSnapshot;
  header: SaleBillHeader;
  terms: SaleBillTerms;
  lines: SaleBillDraftLine[];
  charges: DraftChargeRow[];
  isLocalSale: boolean;
  freightBands: FreightBand[];
  storedPricing: DocumentPricing | null;

  // ----- what the bill adds over the quotation and the order -----
  /** Non-null exactly when `sbSrcDocId` is set. Cleared by Copy as new. */
  source: BillSourceTrail | null;
  /** The tender dialog's rows — what the customer actually paid with (§9). */
  tenders: TenderDraftRow[];
  /**
   * Credits the customer already holds, set off against this bill (§10).
   *
   * **An adjustment is never a tender.** One panel component with two mount
   * points (inside the settle dialog and outside it on the bill) writes THIS
   * array, and the dialog's ADJUST row is a read-only mirror of it — the same
   * money appearing in `tenders` as well would post twice.
   */
  adjustments: BillAdjustmentRow[];
  /**
   * Which side last wrote the adjustments — `m_adjustmentsAuthoritative` in the
   * Qt screen. Two mount points, one source of truth: whichever panel the
   * operator last used owns the array, so reopening the other does not
   * resurrect a stale set.
   */
  adjustmentsFrom: "bill" | "tender";
  /**
   * Whether THIS screen has handled the adjustments at all.
   *
   * It exists because `adjustments` is the one save array where **absent is not
   * empty**: omitting the key leaves the stored settlement alone, while `[]`
   * reverses it. `GET /bills/get` returns no adjustments, so a bill loaded for
   * edit knows nothing about what was set off against it — and must therefore
   * send nothing, not "none". This flips true the moment the panel is applied,
   * and only then does the save start sending the array.
   */
  adjustmentsTouched: boolean;
  /** The open credits as last fetched, for the panel to offer. */
  openCredits: AdjustableCredit[];
  settlement: BillSettlement;
  /** The credit panel's data; null until a customer is picked, or on failure. */
  partyCredit: PartyCreditSummary | null;
  /**
   * The `txn_hold` row this draft is parked as, or was pulled back from.
   *
   * Server-side, through `TxnHoldController`, NOT the Qt screen's JSON file
   * under `AppLocalDataLocation/salebill/` (§12): a hold taken at one counter has
   * to be resumable at another, and a counter that dies must not take its held
   * sales with it. Phase 7.
   */
  holdId: string | null;
  holdNo: string;
};

/** What `validate` returns: the first violation, and where to send the operator. */
export type SaleBillViolation = {
  message: string;
  /** A focus target, or a line key when `lineKey` is set. */
  field: string;
  lineKey?: string;
  /** `true` → confirm-and-continue (the credit gate), not a refusal. */
  confirm?: boolean;
};

/** `GET /bills/get` query — the voucher's own tenant scope, not the session's. */
export type SaleBillDocKey = {
  sbId: string;
  sbCompanyId: string;
  sbBranchId: string;
  sbAccYear: string;
};

// ---------------------------------------------------------------------------
// Wire shapes — `POST /bills/create`, `GET /bills/get`
// ---------------------------------------------------------------------------
//
// Three serializers meet on one payload and they do NOT agree, which is the
// single most expensive thing to get wrong here:
//
//  - the HEADER and the ITEMS are Prisma models, so every `numeric` column
//    arrives as a STRING and every date as a full ISO timestamp;
//  - the CHARGES are the charge-detail module's payload, which converts its
//    decimals to real numbers;
//  - the TENDERS are the tender-detail module's payload, same conversion, with
//    date-only columns as `yyyy-mm-dd`.
//
// `sbBillSlno` is a bigint and therefore always a string — never `parseInt` it.

/** Every money/quantity column of the HEADER and ITEMS; nullable ones can be null. */
export type WireDecimal = string | number | null;

export type SaveBillItemDto = {
  sbiId?: string;
  sbiLineNo?: number;
  /** `sbi_split_no` — a line split across batches. One per row here, always 1. */
  sbiSplitNo?: number;
  sbiSrcDocType?: string | null;
  sbiSrcDocId?: string | null;
  sbiSrcDocYear?: string | null;
  sbiSrcDocRefno?: string | null;
  sbiSrcDocLineNo?: number | null;
  sbiSrcItemQty?: number | null;
  sbiSrcFreeQty?: number | null;
  sbiItemId: string;
  /** `item_unit_conversion.iuc_id` — NOT a raw `unit_id`. */
  sbiItemUnitId: string;
  sbiToBaseFactor?: number;
  sbiHsnCode?: string | null;
  sbiPriceLevel?: number;
  sbiEanCode?: string | null;
  sbiSize?: string | null;
  sbiSizeUom?: string | null;
  /**
   * REQUIRED server-side (`@RequiredUuid`), unlike every other screen's, and the
   * one field that can refuse an otherwise valid bill: it comes from the item
   * price lookup's `godown_id`, which can answer null. See `validate.ts`.
   */
  sbiGodownId: string;
  sbiStockId?: string | null;
  sbiBatchNo?: string | null;
  sbiBatchDate?: string | null;
  sbiExpiryDate?: string | null;
  sbiSerialNo?: string | null;
  sbiIsTaxIncl?: boolean;
  sbiIsPromo?: boolean;
  sbiIsFree?: boolean;
  sbiFreeType?: string | null;
  sbiIsService?: boolean;
  sbiHasFreight?: boolean;
  sbiCaseQty?: number;
  sbiBillQty?: number;
  sbiLengthQty?: number | null;
  sbiNetQty?: number;
  sbiWeightQty?: number | null;
  sbiAvailableStock?: number;
  sbiRate?: number;
  sbiRatePreTax?: number;
  sbiRateDiff?: number;
  sbiActPrice?: number | null;
  sbiMaxPrice?: number | null;
  sbiMinPrice?: number | null;
  sbiCostPrice?: number | null;
  sbiCostPreTax?: number | null;
  sbiItemDiscPerc?: number;
  sbiItemDiscQty?: number;
  sbiItemDiscAmt?: number;
  sbiSplDiscPerc?: number;
  sbiSplDiscQty?: number;
  sbiSplDiscAmt?: number;
  sbiSchDiscPerc?: number;
  sbiSchDiscQty?: number;
  sbiSchDiscAmt?: number;
  sbiBillSchPerc?: number;
  sbiBillSchQty?: number;
  sbiBillSchAmt?: number;
  /**
   * The two additional discount slots the bill's schema has and the pricing
   * engine does not model. Sent as zero and never populated: adding them would
   * be a change to the SHARED engine with a golden case, or it is not a pricing
   * change at all (§3). The header's `sbAddlDisc1/2` are the same story.
   */
  sbiAddlDisc1Perc?: number;
  sbiAddlDisc1Amt?: number;
  sbiAddlDisc2Perc?: number;
  sbiAddlDisc2Amt?: number;
  sbiCashDiscPerc?: number;
  sbiCashDiscAmt?: number;
  sbiGrossAmt?: number;
  sbiNetGross?: number | null;
  sbiChrgBeforeTax?: number | null;
  sbiChrgAfterTax?: number | null;
  sbiTaxableAmt?: number;
  sbiTaxPerc?: number;
  sbiTaxAmt?: number;
  sbiCgstPerc?: number;
  sbiCgstAmt?: number;
  sbiSgstPerc?: number;
  sbiSgstAmt?: number;
  sbiIgstPerc?: number;
  sbiIgstAmt?: number;
  sbiCessPerc?: number;
  sbiCessPerUnit?: number;
  sbiCessAmt?: number;
  /** Additional cess — a second cess head the engine does not model either. */
  sbiAcessPerc?: number;
  sbiAcessPerUnit?: number;
  sbiAcessAmt?: number;
  sbiBatchConfig?: number;
  sbiFreightQty?: number;
  sbiFreightAmt?: number;
  sbiLoadQty?: number;
  sbiLoadAmt?: number;
  sbiUnloadQty?: number;
  sbiUnloadAmt?: number;
  sbiRoundOff?: number;
  sbiNetAmt?: number;
  sbiSoldPrice?: number | null;
  sbiSoldPreTax?: number | null;
  sbiItemProfit?: number | null;
  sbiProfitPreTax?: number | null;
  sbiMrpSavings?: number | null;
  sbiMrpSavingsPerc?: number | null;
  sbiSalesmanId?: string | null;
  sbiSchemeId?: string | null;
  sbiSchemeName?: string | null;
  sbiRemarks?: string | null;
  sbiCreatedBy?: string | null;
  sbiModifiedBy?: string | null;
};

/**
 * `txn_charge_detail`, the charge-detail module's own DTO. A superset of the
 * quotation's `sale_charge_detail` shape, which is why `chargeDto` is shared:
 * the extra keys (`cdDocType`, `cdDocId`, `cdCompId`, `cdAccYear`) default to
 * the bill's own scope server-side and are omitted.
 */
export type SaveBillChargeDto = {
  cdId?: string;
  cdSlno?: number;
  cdChgId: string;
  cdLedgerCode: string;
  cdChgName?: string | null;
  cdRole?: string | null;
  cdMethod?: string | null;
  cdType?: string;
  cdApplyOn?: string | null;
  cdCostAlloc?: "VALUE" | "QTY" | "WEIGHT" | null;
  cdLandingCost?: boolean;
  cdBeforeTax?: boolean;
  /** Mutually exclusive with `cdBeforeTax` — both true is a 400. */
  cdTaxApl?: boolean;
  cdSepPost?: boolean;
  cdUnit?: string | null;
  cdQtyVal?: number | null;
  cdWeight?: number | null;
  cdRate?: number | null;
  cdAmount?: number | null;
  cdHsn?: string | null;
  cdTaxPerc?: number | null;
  cdTaxAmt?: number | null;
  cdSgstPerc?: number | null;
  cdSgstAmt?: number | null;
  cdCgstPerc?: number | null;
  cdCgstAmt?: number | null;
  cdIgstPerc?: number | null;
  cdIgstAmt?: number | null;
  cdCessPerc?: number | null;
  cdCessAmt?: number | null;
  cdNetAmt?: number | null;
  cdRemarks?: string | null;
  cdIsActive?: boolean;
};

/** `acc_tender_detail`, the tender-detail module's own DTO. */
export type SaveBillTenderDto = {
  tdId?: string;
  tdRowNo?: number;
  tdTenderId?: string;
  tdTenderTypeId?: string | number;
  tdTenderLedgerId?: string | null;
  tdAmount?: number;
  tdSurchargePerc?: number;
  tdSurchargeAmt?: number;
  tdSurchargeLedgerId?: string | null;
  tdTotalAmt?: number;
  tdReceivedAmt?: number;
  tdChangeAmt?: number;
  tdRefNo?: string | null;
  tdAuthCode?: string | null;
  tdCardLast4?: string | null;
  tdBankName?: string | null;
  tdPayerVpa?: string | null;
  tdInstrumentDate?: string | null;
  tdIsPdc?: boolean;
  tdSettleStatus?: string;
  tdSettleLedgerId?: string | null;
  tdExpectedSettleOn?: string | null;
  tdNotes?: string | null;
  tdCreatedBy?: string | null;
  tdModifiedBy?: string | null;
};

/**
 * One credit set off against this bill (`accounts.acc_bill_adjustment`).
 *
 * **Only three fields carry the contract** — which credit (`againstBillId` +
 * `againstBillAccYear`, because `acc_bill_balance` is partitioned by year and
 * keyed on the pair) and how much. `billType` / `adjType` / `settlementMode` are
 * accepted and IGNORED: the server derives all three from the credit's own row,
 * which is what stops a client mislabelling an advance as a credit note. They
 * are sent anyway because they are declared, and an undeclared key would 400
 * under `forbidNonWhitelisted` — but nothing should be read back out of them.
 */
export type SaveBillAdjustmentDto = {
  againstBillId: string;
  againstBillAccYear: string;
  amount: number;
  remarks?: string | null;
  billType?: string;
  adjType?: string;
  settlementMode?: string;
};

export type SaveBillDto = {
  /** Present → update, absent → create. There is no separate update route. */
  sbId?: string;
  sbCompanyId: string;
  sbBranchId: string;
  sbAccYear: string;
  sbSessionId?: string | null;
  sbCounterId?: string | null;
  sbDeviceType: string;
  sbDeviceId: string;
  sbDocType?: string | null;
  sbBillType?: string | null;
  sbCategoryId?: string | null;
  sbPriceLevel: number;
  sbUsrRefno?: string | null;
  sbBillDate?: string;
  sbBillDatetime?: string;
  sbDueDays?: number | null;
  sbDueDate?: string | null;
  sbSrcDocType?: string | null;
  sbSrcDocId?: string | null;
  sbSrcDocRefno?: string | null;
  sbSrcDocDate?: string | null;
  sbSrcDocYear?: string | null;
  /** REQUIRED — a walk-in still needs a master record on this screen. */
  sbCustId: string;
  sbCustName: string;
  sbCustAddr?: string | null;
  sbCustPlace?: string | null;
  sbCustPin?: string | null;
  sbCustPhone?: string | null;
  sbCustGstin?: string | null;
  sbCustGstType?: string | null;
  sbCustStcd?: string | null;
  sbPosStcd?: string | null;
  sbStateName?: string | null;
  sbHasLoad?: boolean;
  sbHasUnload?: boolean;
  sbHasFreight?: boolean;
  sbHasPromo?: boolean;
  sbHasComm?: boolean;
  sbHasLoyalty?: boolean;
  sbUserId: string;
  /** `uuid[]` columns — an empty array is "nobody"; `null` is a 500. */
  sbSalesmanId?: string[];
  sbAgentId?: string | null;
  sbAgentCommPerc?: number | null;
  sbAgentCommAmt?: number | null;
  sbDriverId?: string | null;
  sbLoadmanId?: string[];
  sbPackedId?: string[];
  sbSupervisorId?: string | null;
  sbVehicleId?: string | null;
  sbVehicleNo?: string | null;
  sbTotItems?: number;
  sbTotWeight?: number;
  sbTotBags?: number;
  sbGrossAmt?: number;
  sbItemDisc?: number;
  sbSplDisc?: number;
  sbSchDisc?: number;
  sbBillSchDisc?: number;
  sbAddlDisc1?: number;
  sbAddlDisc2?: number;
  sbCashDisc?: number;
  /** POST-charge taxable value. */
  sbTaxableAmt?: number;
  sbCgstAmt?: number;
  sbSgstAmt?: number;
  sbIgstAmt?: number;
  sbCessAmt?: number;
  sbTaxAmt?: number;
  sbFreightAmt?: number;
  sbLoadAmt?: number;
  sbUnloadAmt?: number;
  sbOtherAmt1?: number;
  sbOtherAmt2?: number;
  sbRoundOff?: number;
  sbBillAmt?: number;
  sbTotalCost?: number | null;
  sbMarginAmt?: number | null;
  sbMarginAmtWot?: number | null;
  sbMarginPerc?: number | null;
  sbMrpSavings?: number | null;
  sbMrpSavingsPerc?: number | null;
  sbPayMode?: string | null;
  sbCreditAmt?: number;
  sbSurchargeAmt?: number;
  sbTenderAmt?: number;
  sbRefundAmt?: number;
  sbAdvanceAmt?: number;
  sbPaidAmt?: number;
  sbBalanceAmt?: number;
  sbPayStatus?: string | null;
  sbPaymentTerms?: string | null;
  sbDeliveryTerms?: string | null;
  sbTermsConditions?: string | null;
  sbRemarks?: string | null;
  /** Lower case, and NOT normalised server-side — send `'manual'`, not `'MANUAL'`. */
  sbFreightCalcType?: string | null;
  sbLoadingCalcType?: string | null;
  sbDiscAlterBase?: boolean | null;
  sbRoundOffStep?: number;
  sbStatus?: string | null;
  sbVersionNo?: number;
  sbCreatedBy?: string | null;
  sbModifiedBy?: string | null;
  items?: SaveBillItemDto[];
  charges?: SaveBillChargeDto[];
  tenders?: SaveBillTenderDto[];
  /**
   * Absent is NOT empty here, unlike every other array on this payload: omit it
   * to leave the stored settlement alone, and send `[]` to clear it. A changed
   * set is reversed and re-posted; nothing is ever edited in place.
   */
  adjustments?: SaveBillAdjustmentDto[];
};

// --------------------------------- read ------------------------------------

export type BillItemPayload = {
  sbiId: string;
  sbiLineNo: number;
  sbiSplitNo: number;
  sbiSrcDocType: string | null;
  sbiSrcDocId: string | null;
  sbiSrcDocYear: string | null;
  sbiSrcDocRefno: string | null;
  sbiSrcDocLineNo: number | null;
  sbiSrcItemQty: WireDecimal;
  sbiSrcFreeQty: WireDecimal;
  sbiItemId: string;
  sbiItemUnitId: string;
  sbiToBaseFactor: WireDecimal;
  sbiHsnCode: string | null;
  sbiPriceLevel: number;
  sbiEanCode: string | null;
  sbiSize: string | null;
  sbiSizeUom: string | null;
  sbiGodownId: string;
  sbiStockId: string | null;
  sbiBatchNo: string | null;
  sbiBatchDate: string | null;
  sbiExpiryDate: string | null;
  sbiSerialNo: string | null;
  sbiIsTaxIncl: boolean;
  sbiIsPromo: boolean;
  sbiIsFree: boolean;
  sbiFreeType: string | null;
  sbiIsService: boolean;
  sbiHasFreight: boolean;
  sbiIsDeleted: boolean;
  sbiCaseQty: WireDecimal;
  sbiBillQty: WireDecimal;
  sbiLengthQty: WireDecimal;
  sbiNetQty: WireDecimal;
  sbiWeightQty: WireDecimal;
  sbiAvailableStock: WireDecimal;
  sbiReturnQty: WireDecimal;
  sbiRate: WireDecimal;
  sbiRatePreTax: WireDecimal;
  sbiRateDiff: WireDecimal;
  sbiActPrice: WireDecimal;
  sbiMaxPrice: WireDecimal;
  sbiMinPrice: WireDecimal;
  sbiCostPrice: WireDecimal;
  sbiCostPreTax: WireDecimal;
  sbiItemDiscPerc: WireDecimal;
  sbiItemDiscQty: WireDecimal;
  sbiItemDiscAmt: WireDecimal;
  sbiSplDiscPerc: WireDecimal;
  sbiSplDiscQty: WireDecimal;
  sbiSplDiscAmt: WireDecimal;
  sbiSchDiscPerc: WireDecimal;
  sbiSchDiscQty: WireDecimal;
  sbiSchDiscAmt: WireDecimal;
  sbiBillSchPerc: WireDecimal;
  sbiBillSchQty: WireDecimal;
  sbiBillSchAmt: WireDecimal;
  sbiCashDiscPerc: WireDecimal;
  sbiCashDiscAmt: WireDecimal;
  sbiGrossAmt: WireDecimal;
  sbiNetGross: WireDecimal;
  sbiChrgBeforeTax: WireDecimal;
  sbiChrgAfterTax: WireDecimal;
  sbiTaxableAmt: WireDecimal;
  sbiTaxPerc: WireDecimal;
  sbiTaxAmt: WireDecimal;
  sbiCgstPerc: WireDecimal;
  sbiCgstAmt: WireDecimal;
  sbiSgstPerc: WireDecimal;
  sbiSgstAmt: WireDecimal;
  sbiIgstPerc: WireDecimal;
  sbiIgstAmt: WireDecimal;
  sbiCessPerc: WireDecimal;
  sbiCessPerUnit: WireDecimal;
  sbiCessAmt: WireDecimal;
  sbiBatchConfig: number;
  sbiFreightQty: WireDecimal;
  sbiFreightAmt: WireDecimal;
  sbiLoadQty: WireDecimal;
  sbiLoadAmt: WireDecimal;
  sbiUnloadQty: WireDecimal;
  sbiUnloadAmt: WireDecimal;
  sbiNetAmt: WireDecimal;
  sbiSoldPrice: WireDecimal;
  sbiSoldPreTax: WireDecimal;
  sbiItemProfit: WireDecimal;
  sbiProfitPreTax: WireDecimal;
  sbiMrpSavings: WireDecimal;
  sbiMrpSavingsPerc: WireDecimal;
  sbiSalesmanId: string | null;
  sbiSchemeId: string | null;
  sbiSchemeName: string | null;
  sbiRemarks: string | null;
  /** Joined display names — populated on GET only, `null` on the save response. */
  sbiItemName?: string | null;
  sbiUnitName?: string | null;
  sbiDecimalCount?: number | null;
  sbiGroupId?: string | null;
  sbiBrandId?: string | null;
  sbiSectionId?: string | null;
  sbiCategoryId?: string | null;
  sbiGodownName?: string | null;
};

/** Decimals as real NUMBERS here — the charge-detail module converts them. */
export type BillChargePayload = {
  cdId: string;
  cdSlno: number | null;
  cdChgId: string;
  cdChgName: string | null;
  cdLedgerCode: string;
  cdLedgerName: string | null;
  cdRole: string | null;
  cdMethod: string | null;
  cdType: string;
  cdApplyOn: string | null;
  cdCostAlloc: string | null;
  cdLandingCost: boolean;
  cdBeforeTax: boolean;
  cdTaxApl: boolean;
  cdSepPost: boolean;
  cdIsActive: boolean;
  cdIsDeleted: boolean;
  cdUnit: string | null;
  cdQtyVal: number | null;
  cdWeight: number | null;
  cdRate: number | null;
  cdAmount: number | null;
  cdHsn: string | null;
  cdTaxCode: string | null;
  cdTaxPerc: number | null;
  cdTaxAmt: number | null;
  cdSgstPerc: number | null;
  cdSgstAmt: number | null;
  cdCgstPerc: number | null;
  cdCgstAmt: number | null;
  cdIgstPerc: number | null;
  cdIgstAmt: number | null;
  cdCessPerc: number | null;
  cdCessAmt: number | null;
  cdNetAmt: number | null;
  cdRemarks: string | null;
};

/** Decimals as numbers, date-only columns as `yyyy-mm-dd`. */
export type BillTenderPayload = {
  tdId: string;
  tdRowNo: number | null;
  tdTenderId: string;
  tdTenderTypeId: number;
  tdTenderLedgerId: string | null;
  tdAmount: number;
  tdSurchargePerc: number;
  tdSurchargeAmt: number;
  tdSurchargeLedgerId: string | null;
  tdTotalAmt: number;
  tdReceivedAmt: number;
  tdChangeAmt: number;
  tdRefNo: string | null;
  tdAuthCode: string | null;
  tdCardLast4: string | null;
  tdBankName: string | null;
  tdPayerVpa: string | null;
  tdInstrumentDate: string | null;
  tdIsPdc: boolean;
  tdSettleStatus: string;
  tdSettleLedgerId: string | null;
  tdExpectedSettleOn: string | null;
  tdNotes: string | null;
  tdIsDeleted: boolean;
};

export type BillPayload = {
  sbId: string;
  sbCompanyId: string;
  sbBranchId: string;
  sbAccYear: string;
  sbSessionId: string | null;
  sbCounterId: string | null;
  sbDeviceType: string;
  sbDeviceId: string;
  sbDocType: string;
  sbBillType: string;
  sbCategoryId: string | null;
  sbPriceLevel: number;
  /** bigint — always a string. Never `parseInt` it. */
  sbBillSlno: string | null;
  sbBillRefno: string | null;
  sbUsrRefno: string | null;
  sbBillDate: string;
  sbBillDatetime?: string;
  sbDueDays: number | null;
  sbDueDate: string | null;
  sbSrcDocType: string | null;
  sbSrcDocId: string | null;
  sbSrcDocRefno: string | null;
  sbSrcDocDate: string | null;
  sbSrcDocYear: string | null;
  sbCustId: string;
  sbCustName: string;
  sbCustAddr: string | null;
  sbCustPlace: string | null;
  sbCustPin: string | null;
  sbCustPhone: string | null;
  sbCustGstin: string | null;
  sbCustGstType: string | null;
  sbCustStcd: string | null;
  sbPosStcd: string | null;
  sbStateName: string | null;
  sbHasLoad: boolean;
  sbHasUnload: boolean;
  sbHasFreight: boolean;
  sbHasPromo: boolean;
  sbHasComm: boolean;
  sbHasLoyalty: boolean;
  sbUserId: string;
  sbSalesmanId: string[];
  sbAgentId: string | null;
  sbDriverId: string | null;
  sbLoadmanId: string[];
  sbPackedId: string[];
  sbSupervisorId: string | null;
  sbVehicleId: string | null;
  sbVehicleNo: string | null;
  sbTotItems: number;
  sbTotWeight: WireDecimal;
  sbTotBags: WireDecimal;
  sbGrossAmt: WireDecimal;
  sbItemDisc: WireDecimal;
  sbSplDisc: WireDecimal;
  sbSchDisc: WireDecimal;
  sbBillSchDisc: WireDecimal;
  sbAddlDisc1: WireDecimal;
  sbAddlDisc2: WireDecimal;
  sbCashDisc: WireDecimal;
  sbTaxableAmt: WireDecimal;
  sbCgstAmt: WireDecimal;
  sbSgstAmt: WireDecimal;
  sbIgstAmt: WireDecimal;
  sbCessAmt: WireDecimal;
  sbTaxAmt: WireDecimal;
  sbFreightAmt: WireDecimal;
  sbLoadAmt: WireDecimal;
  sbUnloadAmt: WireDecimal;
  sbOtherAmt1: WireDecimal;
  sbOtherAmt2: WireDecimal;
  sbRoundOff: WireDecimal;
  sbBillAmt: WireDecimal;
  sbTotalCost: WireDecimal;
  sbMarginAmt: WireDecimal;
  sbMarginAmtWot: WireDecimal;
  sbMarginPerc: WireDecimal;
  sbMrpSavings: WireDecimal;
  sbMrpSavingsPerc: WireDecimal;
  sbPayMode: string | null;
  sbCreditAmt: WireDecimal;
  sbSurchargeAmt: WireDecimal;
  sbTenderAmt: WireDecimal;
  sbRefundAmt: WireDecimal;
  sbAdvanceAmt: WireDecimal;
  sbPaidAmt: WireDecimal;
  sbBalanceAmt: WireDecimal;
  sbPayStatus: string;
  sbReturnedAmt: WireDecimal;
  sbReturnStatus: string | null;
  sbPaymentTerms: string | null;
  sbDeliveryTerms: string | null;
  sbTermsConditions: string | null;
  sbRemarks: string | null;
  sbFreightCalcType: string | null;
  sbLoadingCalcType: string | null;
  sbDiscAlterBase: boolean | null;
  sbRoundOffStep: WireDecimal;
  sbStatus: string;
  sbCancelledOn: string | null;
  sbCancelReason: string | null;
  sbVersionNo: number;
  sbPrintCount: number;
  sbIsDeleted: boolean;
  sbCreatedOn?: string;
  sbCreatedBy: string;
  sbModifiedOn?: string | null;
  sbModifiedBy: string | null;
  items?: BillItemPayload[];
  charges?: BillChargePayload[];
  tenders?: BillTenderPayload[];
};

/**
 * What a committed save hands back — the key, plus the refno the operator would
 * recognise the document by. The form may have been cleared by the time the
 * caller wants to print, so a save that answered only `true` would leave
 * "Save & print" with nothing to name.
 */
export type SavedBillRef = SaleBillDocKey & { billRefno: string | null };

/** `POST /bills/delete` — the body, which cancels the SOURCE ORDER (§16). */
export type CancelBillDto = SaleBillDocKey & {
  /** Lands in `soi_cancel_reason`, varchar(250). Required. */
  remarks: string;
  /** The actor on every row the call writes. varchar(50). Required. */
  username: string;
};

export type CancelledOrderLine = {
  soiId: string;
  soiLineNo: number;
  soiCancelledQty: number;
  soiLineStatus: string;
};

export type CancelOrderResult = {
  soId: string;
  soAccYear: string;
  soStatus: string;
  soFulfilStatus: string;
  /** 0 on a repeat call — the route is idempotent, not an error. */
  cancelledLines: number;
  cancelledQty: number;
  soCancelledAmt: number;
  soPendingAmt: number;
  lines: CancelledOrderLine[];
};

export type BillCancelResult = {
  sbId: string;
  cancelled: true;
  remarks: string;
  username: string;
  cancelledOn: string;
  orders: CancelOrderResult[];
};

// ---------------------------------------------------------------------------
// Adjustable credits — `GET /transactions/party-balance` (§10)
// ---------------------------------------------------------------------------

/**
 * One credit the party holds and has not spent: an advance taken against a sale
 * order, or a sales return not yet set off.
 *
 * **An adjustment is never a tender.** These are different rows in different
 * tables and they post differently; a screen that merges the two produces a bill
 * that balances on screen and not in the ledgers.
 *
 * There is no accounting-year parameter on the read, and deliberately so:
 * credits are never carried forward, so a March advance really does settle an
 * April invoice. Each row reports its OWN `billAccYear`, and that year has to be
 * posted alongside the id — `acc_bill_balance` is partitioned by it and keyed on
 * the pair.
 */
export type AdjustableCredit = {
  billId: string;
  billAccYear: string;
  billType: "ADVANCE" | "SALES_RETURN";
  drCr: "CR" | "DR";
  docRefno: string;
  docDate: string;
  /** Face value. Tooltip only — the panel adjusts against `pendingAmount`. */
  billAmount: number;
  /** bill − alloc − disc − writeoff. The ceiling for this row's adjustment. */
  pendingAmount: number;
  status: "OPEN" | "PARTIAL";
  srcModule: string | null;
  srcDocType: string | null;
  /** What the bill screen matches on to pre-fill the panel after an order import. */
  srcDocId: string | null;
  srcAccYear: string | null;
  narration: string | null;
  adjType: "ADVANCE_ADJUST" | "NOTE_ADJUST";
  settlementMode: "ADVANCE" | "CREDIT_NOTE";
};

/**
 * One credit as the panel holds it: the server's row plus how much of it THIS
 * bill is taking.
 *
 * The display fields ride along rather than being re-fetched, which is what lets
 * a recovered autosave name the credits it had set off even when the
 * open-credits endpoint is unreachable at recovery time (§12).
 */
export type BillAdjustmentRow = {
  /** Stable client-side row key. */
  key: string;
  credit: AdjustableCredit;
  /** What this bill takes off it. 0 ⇒ the row is shown but not adjusted. */
  amount: number;
};
