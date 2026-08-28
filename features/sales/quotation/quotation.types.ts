/**
 * Quotation Entry — types.
 *
 * Three families live here and they must not be confused:
 *
 *  1. `*Dto` / `*Payload` — the wire shapes of `POST /quotations/create` and
 *     `GET /quotations/get`. The server returns every `numeric` column as a
 *     **string** (Prisma `Decimal.toJSON`) with trailing zeros trimmed, and every
 *     date column as a full ISO timestamp — so these are typed as the JSON
 *     actually arrives, never as the server's own TS types.
 *  2. `Draft*` — the screen's mutable state. A draft line is an engine `Line`
 *     plus everything the engine does not read (names, ids, batch info, the
 *     per-line cash discount that is persisted but priced as a charge row).
 *  3. lookup payloads — `master-lookups/*` and `charges/get` responses, whose
 *     casing is deliberately inconsistent (see `quotation.constants.ts`).
 */
import type {
  ChargeApplyOn,
  ChargeMethod,
  ChargeRole,
  ChargeRow,
  ChargeType,
  DocumentPricing,
  Line,
  VoucherPolicy,
} from "@/domain/pricing";

/** Every money/quantity column arrives as a string; nullable ones can be null. */
export type WireDecimal = string | number | null;

/**
 * One row of `GET /ui-table-masters/get` — the server-configured layout of a
 * grid. Note what is NOT here: no field token, no data type, no per-column
 * editability. `fixed.ui_table_columns` carries a display name and geometry only,
 * so the column *meaning* is hard-coded client-side (`quotation.constants.ts`).
 */
export type UiTableColumnRow = {
  uiTblClmId: string;
  uiTblClmNo: string;
  uiTblClmName: string | null;
  uiTblClmColumnWidth: number | null;
  uiTblClmColumnVisibility: boolean | null;
  uiTblClmColumnFocus: boolean | null;
  uiTblClmColumnPosition: number;
  uiTblClmColumnNecessity: boolean;
};

// ---------------------------------------------------------------------------
// Save payload (POST /quotations/create)
// ---------------------------------------------------------------------------

export type SaveQuotationItemDto = {
  sqiId?: string;
  sqiLineNo?: number;
  sqiItemId: string;
  /** `item_unit_conversion.iuc_id` — NOT a raw `unit_id`. */
  sqiItemUnitId: string;
  sqiPriceLevel?: number;
  sqiHsnCode?: string | null;
  sqiEanCode?: string | null;
  sqiBatchNo?: string | null;
  sqiBatchDate?: string | null;
  sqiExpiryDate?: string | null;
  sqiIsTaxIncl?: boolean;
  sqiIsPromo?: boolean;
  sqiIsFree?: boolean;
  sqiFreeType?: string | null;
  sqiIsService?: boolean;
  sqiCaseQty?: number;
  sqiBillQty?: number;
  sqiLengthQty?: number;
  sqiNetQty?: number;
  sqiWeightQty?: number | null;
  sqiAvailableStock?: number;
  sqiRate?: number;
  sqiRatePreTax?: number;
  sqiItemDiscPerc?: number;
  sqiItemDiscQty?: number;
  sqiItemDiscAmt?: number;
  sqiSplDiscPerc?: number;
  sqiSplDiscQty?: number;
  sqiSplDiscAmt?: number;
  sqiSchDiscPerc?: number;
  sqiSchDiscQty?: number;
  sqiSchDiscAmt?: number;
  sqiBillSchPerc?: number;
  sqiBillSchQty?: number;
  sqiBillSchAmt?: number;
  sqiCashDiscPerc?: number;
  sqiCashDiscAmt?: number;
  sqiGrossAmt?: number;
  sqiTaxableAmt?: number;
  sqiTaxPerc?: number;
  sqiTaxAmt?: number;
  sqiCgstPerc?: number;
  sqiCgstAmt?: number;
  sqiSgstPerc?: number;
  sqiSgstAmt?: number;
  sqiIgstPerc?: number;
  sqiIgstAmt?: number;
  sqiCessPerc?: number;
  sqiCessPerUnit?: number;
  sqiCessAmt?: number;
  sqiFreightQty?: number;
  sqiFreightAmt?: number;
  sqiLoadQty?: number;
  sqiLoadAmt?: number;
  sqiUnloadQty?: number;
  sqiUnloadAmt?: number;
  sqiNetAmt?: number;
  sqiCostPrice?: number | null;
  sqiMaxPrice?: number | null;
  sqiMinPrice?: number | null;
  sqiActPrice?: number | null;
  sqiQuotePrice?: number | null;
  sqiItemProfit?: number | null;
  sqiCostPreTax?: number | null;
  sqiQuotePreTax?: number | null;
  sqiProfitPreTax?: number | null;
  sqiMrpSavings?: number | null;
  sqiMrpSavingsPerc?: number | null;
  sqiNetGross?: number | null;
  sqiChrgBeforeTax?: number | null;
  sqiChrgAfterTax?: number | null;
  sqiSchemeId?: string | null;
  sqiSchemeName?: string | null;
  sqiRemarks?: string | null;
  /** `sqi_size`, varchar(50) — the line's CFT. See `sizeCftText`. */
  sqiSize?: string | null;
  /** `sqi_size_uom`, varchar(20) — `"CFT"` whenever a size is sent. */
  sqiSizeUom?: string | null;
};

export type SaveQuotationChargeDto = {
  cdId?: string;
  cdSlno?: number;
  cdChgId: string;
  /** `acc_ledger_master.led_id`. NOT NULL server-side — a row without it cannot save. */
  cdLedgerCode: string;
  cdChgName?: string | null;
  cdRole?: ChargeRole | null;
  cdMethod?: ChargeMethod | null;
  cdType?: ChargeType;
  cdApplyOn?: ChargeApplyOn | null;
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

export type SaveQuotationDto = {
  /** Present → update, absent → create. There is no separate update route. */
  sqId?: string;
  // required on every request, create or update
  sqCompanyId: string;
  sqBranchId: string;
  sqAccYear: string;
  sqPriceLevel: number;
  sqCustName: string;
  sqUserId: string;

  /**
   * Free-text actor columns, unlike the uuid `sqUserId`: the audit trail stores
   * whichever of the two applies verbatim, so these carry the user's *name*.
   */
  sqCreatedBy?: string | null;
  sqModifiedBy?: string | null;

  sqDocType?: string | null;
  sqUsrRefno?: string | null;
  sqQuoteDate?: string;
  sqValidUntil?: string | null;
  sqValidityDays?: number | null;
  sqRevisionNo?: number;
  sqSessionId?: string | null;
  sqCustId?: string | null;
  sqCustAreaId?: string | null;
  sqCustAddr?: string | null;
  sqCustPlace?: string | null;
  sqCustPhone?: string | null;
  sqCustEmail?: string | null;
  sqCustGstin?: string | null;
  sqCustGstType?: string | null;
  sqCustStcd?: string | null;
  sqPosStcd?: string | null;
  sqStateName?: string | null;
  sqContactPerson?: string | null;
  sqContactPhone?: string | null;
  sqHasLoad?: boolean;
  sqHasUnload?: boolean;
  sqHasFreight?: boolean;
  sqHasPromo?: boolean;
  sqSalesmanId?: string | null;
  sqAgentId?: string | null;
  sqTotItems?: number;
  sqTotWeight?: number;
  sqTotBags?: number;
  sqGrossAmt?: number;
  sqItemDisc?: number;
  sqSplDisc?: number;
  sqSchDisc?: number;
  sqBillSchDisc?: number;
  sqTaxableAmt?: number;
  sqCgstAmt?: number;
  sqSgstAmt?: number;
  sqIgstAmt?: number;
  sqCessAmt?: number;
  sqTaxAmt?: number;
  sqFreightAmt?: number;
  sqLoadAmt?: number;
  sqUnloadAmt?: number;
  sqOtherAmt1?: number;
  sqOtherAmt2?: number;
  sqRoundOff?: number;
  sqQuoteAmt?: number;
  sqTotalCost?: number | null;
  sqMarginAmt?: number | null;
  sqMarginPerc?: number | null;
  sqMrpSavings?: number | null;
  sqMrpSavingsPerc?: number | null;
  sqPaymentTerms?: string | null;
  sqDeliveryTerms?: string | null;
  sqTermsConditions?: string | null;
  sqStatus?: string | null;
  sqRemarks?: string | null;
  sqDeviceType?: string | null;
  sqDeviceId?: string | null;
  sqPrintCount?: number;
  /** Lower case, and NOT normalised server-side — send `'manual'`, not `'MANUAL'`. */
  sqFreightCalcType?: string | null;
  sqLoadingCalcType?: string | null;
  sqDiscAlterBase?: boolean | null;
  items?: SaveQuotationItemDto[];
  charges?: SaveQuotationChargeDto[];
};

// ---------------------------------------------------------------------------
// Read payload (GET /quotations/get)
// ---------------------------------------------------------------------------

/** Every scalar column of `sale_quotation_item`, as JSON. */
export type QuotationItemPayload = {
  sqiId: string;
  sqiLineNo: number | null;
  sqiItemId: string;
  sqiItemUnitId: string;
  sqiPriceLevel: number | null;
  sqiHsnCode: string | null;
  sqiEanCode: string | null;
  sqiBatchNo: string | null;
  sqiBatchDate: string | null;
  sqiExpiryDate: string | null;
  sqiIsTaxIncl: boolean;
  sqiIsPromo: boolean;
  sqiIsFree: boolean;
  sqiFreeType: string | null;
  sqiIsService: boolean;
  sqiIsDeleted: boolean;
  sqiCaseQty: WireDecimal;
  sqiBillQty: WireDecimal;
  sqiLengthQty: WireDecimal;
  sqiNetQty: WireDecimal;
  sqiWeightQty: WireDecimal;
  sqiAvailableStock: WireDecimal;
  sqiRate: WireDecimal;
  sqiRatePreTax: WireDecimal;
  sqiItemDiscPerc: WireDecimal;
  sqiItemDiscQty: WireDecimal;
  sqiItemDiscAmt: WireDecimal;
  sqiSplDiscPerc: WireDecimal;
  sqiSplDiscQty: WireDecimal;
  sqiSplDiscAmt: WireDecimal;
  sqiSchDiscPerc: WireDecimal;
  sqiSchDiscQty: WireDecimal;
  sqiSchDiscAmt: WireDecimal;
  sqiBillSchPerc: WireDecimal;
  sqiBillSchQty: WireDecimal;
  sqiBillSchAmt: WireDecimal;
  sqiCashDiscPerc: WireDecimal;
  sqiCashDiscAmt: WireDecimal;
  sqiGrossAmt: WireDecimal;
  sqiTaxableAmt: WireDecimal;
  sqiTaxPerc: WireDecimal;
  sqiTaxAmt: WireDecimal;
  sqiCgstPerc: WireDecimal;
  sqiCgstAmt: WireDecimal;
  sqiSgstPerc: WireDecimal;
  sqiSgstAmt: WireDecimal;
  sqiIgstPerc: WireDecimal;
  sqiIgstAmt: WireDecimal;
  sqiCessPerc: WireDecimal;
  sqiCessPerUnit: WireDecimal;
  sqiCessAmt: WireDecimal;
  sqiFreightQty: WireDecimal;
  sqiFreightAmt: WireDecimal;
  sqiLoadQty: WireDecimal;
  sqiLoadAmt: WireDecimal;
  sqiUnloadQty: WireDecimal;
  sqiUnloadAmt: WireDecimal;
  sqiNetAmt: WireDecimal;
  sqiCostPrice: WireDecimal;
  sqiMaxPrice: WireDecimal;
  sqiMinPrice: WireDecimal;
  sqiActPrice: WireDecimal;
  sqiQuotePrice: WireDecimal;
  sqiItemProfit: WireDecimal;
  sqiCostPreTax: WireDecimal;
  sqiQuotePreTax: WireDecimal;
  sqiProfitPreTax: WireDecimal;
  sqiMrpSavings: WireDecimal;
  sqiMrpSavingsPerc: WireDecimal;
  sqiNetGross: WireDecimal;
  sqiChrgBeforeTax: WireDecimal;
  sqiChrgAfterTax: WireDecimal;
  sqiSchemeId: string | null;
  sqiSchemeName: string | null;
  sqiRemarks: string | null;
  sqiSize: string | null;
  sqiSizeUom: string | null;
  /** Joined display names — populated on GET only, `null` on the save response. */
  sqiItemName: string | null;
  sqiUnitName: string | null;
};

/** Every scalar column of `sale_charge_detail`, as JSON. No `cdLedgerName`. */
export type QuotationChargePayload = {
  cdId: string;
  cdSlno: number | null;
  cdChgId: string;
  cdChgName: string | null;
  cdLedgerCode: string;
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
  cdQtyVal: WireDecimal;
  cdWeight: WireDecimal;
  cdRate: WireDecimal;
  cdAmount: WireDecimal;
  cdHsn: string | null;
  cdTaxCode: string | null;
  cdTaxPerc: WireDecimal;
  cdTaxAmt: WireDecimal;
  cdSgstPerc: WireDecimal;
  cdSgstAmt: WireDecimal;
  cdCgstPerc: WireDecimal;
  cdCgstAmt: WireDecimal;
  cdIgstPerc: WireDecimal;
  cdIgstAmt: WireDecimal;
  cdCessPerc: WireDecimal;
  cdCessAmt: WireDecimal;
  cdNetAmt: WireDecimal;
  cdRemarks: string | null;
};

export type QuotationPayload = {
  sqId: string;
  sqCompanyId: string;
  sqBranchId: string;
  sqAccYear: string;
  sqPriceLevel: number;
  sqDocType: string | null;
  /** bigint — always a string. Never `parseInt` it; a series like `QT/0001` exists. */
  sqQuoteSlno: string;
  sqQuoteRefno: string | null;
  sqUsrRefno: string | null;
  sqQuoteDate: string | null;
  sqValidUntil: string | null;
  sqValidityDays: number | null;
  sqRevisionNo: number;
  sqCustId: string | null;
  sqCustAreaId: string | null;
  sqCustName: string;
  sqCustAddr: string | null;
  sqCustPlace: string | null;
  sqCustPhone: string | null;
  sqCustEmail: string | null;
  sqCustGstin: string | null;
  sqCustGstType: string | null;
  sqCustStcd: string | null;
  sqPosStcd: string | null;
  sqStateName: string | null;
  sqContactPerson: string | null;
  sqContactPhone: string | null;
  sqHasLoad: boolean;
  sqHasUnload: boolean;
  sqHasFreight: boolean;
  sqHasPromo: boolean;
  sqUserId: string;
  sqSalesmanId: string | null;
  sqAgentId: string | null;
  sqTotItems: number;
  sqTotWeight: WireDecimal;
  sqTotBags: WireDecimal;
  sqGrossAmt: WireDecimal;
  sqItemDisc: WireDecimal;
  sqSplDisc: WireDecimal;
  sqSchDisc: WireDecimal;
  sqBillSchDisc: WireDecimal;
  sqTaxableAmt: WireDecimal;
  sqCgstAmt: WireDecimal;
  sqSgstAmt: WireDecimal;
  sqIgstAmt: WireDecimal;
  sqCessAmt: WireDecimal;
  sqTaxAmt: WireDecimal;
  sqFreightAmt: WireDecimal;
  sqLoadAmt: WireDecimal;
  sqUnloadAmt: WireDecimal;
  sqOtherAmt1: WireDecimal;
  sqOtherAmt2: WireDecimal;
  sqRoundOff: WireDecimal;
  sqQuoteAmt: WireDecimal;
  sqTotalCost: WireDecimal;
  sqMarginAmt: WireDecimal;
  sqMarginPerc: WireDecimal;
  sqMrpSavings: WireDecimal;
  sqMrpSavingsPerc: WireDecimal;
  sqPaymentTerms: string | null;
  sqDeliveryTerms: string | null;
  sqTermsConditions: string | null;
  sqStatus: string | null;
  sqRemarks: string | null;
  sqPrintCount: number;
  sqIsDeleted: boolean;
  sqCreatedOn: string | null;
  sqCreatedBy: string | null;
  sqModifiedOn: string | null;
  sqModifiedBy: string | null;
  sqFreightCalcType: string | null;
  sqLoadingCalcType: string | null;
  sqDiscAlterBase: boolean | null;
  items?: QuotationItemPayload[];
  charges?: QuotationChargePayload[];
};

/** `GET /quotations/get` query — the voucher's own tenant scope, not the session's. */
export type QuotationDocKey = {
  sqId: string;
  sqCompanyId: string;
  sqBranchId: string;
  sqAccYear: string;
};

/**
 * What a committed save hands back.
 *
 * The KEY, because the caller's next act may be to print the document, and by
 * then the form has been cleared — a save that answered only `true` would leave
 * "Save & print" with nothing to name. The reference number rides along for the
 * filename; it is the only thing an operator would recognise the file by.
 */
export type SavedQuotationRef = QuotationDocKey & { quoteRefno: string | null };

// ---------------------------------------------------------------------------
// Lookup payloads
// ---------------------------------------------------------------------------

/** `GET /master-lookups/customer-detail` — snake_case. */
export type CustomerDetailPayload = {
  cust_id: string;
  cust_name: string;
  cust_address: string | null;
  cust_place: string | null;
  cust_ename: string | null;
  cust_eadd1: string | null;
  cust_eadd2: string | null;
  cust_eadd3: string | null;
  cust_pin: string | null;
  ecommerce_gstin: string | null;
  gst_no: string | null;
  gst_type: string | null;
  state_code: string;
  state_name: string;
  area_id: string;
  area_name: string | null;
  distance_km: number | null;
  cust_phone1: string | null;
  debit_days: number;
  debit_limit: number;
  debit_allowed: boolean;
  freight_charge: boolean;
  cooly: boolean;
  unloading_charge: boolean;
  allow_promotion: boolean;
  allow_loyalty: boolean;
  allow_discount: boolean;
  overdue_billing: boolean;
  price_level: number;
  cust_disc_perc: number;
  salesman_id: string | null;
  salesman_name: string | null;
  tcs_company: boolean;
  tcs_customer: boolean;
  cust_pan: boolean;
  local_sales: boolean;
  cust_points: number | null;
  billed_date: string | null;
};

/** `GET /master-lookups/item-price` — snake_case. A `null` charge means unresolved. */
export type ItemPriceLookupPayload = {
  item_id: string;
  /** The rate's `iuc_id`. This is what a line stores as its unit. */
  item_uc_id: string;
  godown_id: string | null;
  godown_name: string;
  item_code: string | null;
  item_name: string;
  item_com_code: string | null;
  barcode: string | null;
  allow_promo: boolean;
  add_freight: boolean;
  item_group_id: string;
  item_category_id: string | null;
  item_brand_id: string | null;
  item_section_id: string | null;
  weigh_scale: boolean;
  batch_config: number;
  /** A string enum on the wire, not a boolean. */
  service_item: "Y" | "N";
  allow_negative_stock: boolean;
  price_level: number;
  sales_price: number;
  cost_price: number;
  cost_wot: number;
  min_price: number;
  max_price: number;
  disc_perc: number;
  disc_qty: number;
  sch_discount: number | null;
  addl_cess: number;
  unit_name: string | null;
  base_unit_id: string;
  base_factor: number;
  iuc_uom_weight: number;
  decimal_count: number;
  loading_charge: number | null;
  resolved_weight: number | null;
  freight_charge: number | null;
  loyalty_pv: number;
  stock: number | null;
  reorder_qty: number | null;
  item_incl_tax: boolean;
  gst_rate: number;
  cess_perc: number;
  cess_unit: number;
  sgst_perc: number;
  cgst_perc: number;
  igst_perc: number;
};

/** `GET /master-lookups/freight-charges/charge` — camelCase. */
export type FreightBand = {
  id: string;
  fromKm: number | null;
  toKm: number | null;
  freightCharge: number | null;
  fromWeight: number | null;
  toWeight: number | null;
};

/** `GET /master-lookups/units/by-item/:itemId` — camelCase. */
export type ItemUnitOption = {
  /** `iuc_id` — the value a line stores. */
  itemUnitId: string;
  unitId: string;
  unitName: string;
};

/** `GET /master-lookups/item-by-barcode` — camelCase; `unitId` is an `iuc_id`. */
export type BarcodeItemLookup = {
  itemId: string;
  unitId: string;
  itemName: string;
  batchConfig: number;
  allowSales: boolean;
  itemStatus: boolean;
  weighScale: boolean;
};

/** `GET /charges/get?chgModule=S` — camelCase, decimals as numbers. */
export type ChargeMasterRow = {
  chgId: string;
  chgName: string;
  chgCode: string | null;
  chgModule: string;
  chgRole: string | null;
  chgMethod: string;
  chgType: string;
  chgApplyOn: string;
  chgDefaultRate: number | null;
  chgLandingCost: boolean;
  chgCostAlloc: string | null;
  chgLedgerCode: string;
  chgLedgerName: string | null;
  ledHsnSac: string | null;
  ledGstRate: number | null;
  ledTaxability: string | null;
  chgTaxApl: boolean;
  chgBeforeTax: boolean;
  chgSepPost: boolean;
  chgManParty: boolean;
  chgDispOrder: number | null;
  /** Pre-seed this charge into a new document's grid. */
  chgAutoApply: boolean;
  chgIsActive: boolean;
};

/** One row of the item picker (configured grid 71): item × unit conversion. */
export type ItemPickerRow = {
  item_id: string;
  /** Aliased from `iuc_id` — a unit-conversion id, not a `unit_id`. */
  item_uom_id: string;
  item_name_en: string;
  unit_name: string;
};

/** One row of the quotation list (configured grid 83). */
export type QuotationListRow = {
  sq_id: string;
  sq_company_id: string;
  sq_branch_id: string;
  sq_acc_year: string;
  sq_quote_date: string | null;
  sq_quote_refno: string | null;
  sq_usr_refno: string | null;
  sq_cust_name: string | null;
  sq_cust_place: string | null;
  sq_cust_gstin: string | null;
  sq_cust_phone: string | null;
  sq_valid_until: string | null;
  sq_tot_items: number | null;
  sq_tot_bags: WireDecimal;
  sq_quote_amt: WireDecimal;
  sq_status: string | null;
  sq_created_by: string | null;
  sq_is_deleted: boolean | string | null;
  sq_converted_doc_id: string | null;
  sq_cancelled_on: string | null;
};

// ---------------------------------------------------------------------------
// Draft state
// ---------------------------------------------------------------------------

/**
 * One item row of the draft: the engine's `Line` plus everything the engine
 * never reads. `key` is a stable client-side row id — the grid, the focus
 * tracking and the reducer all address rows by it, never by index.
 */
export type DraftLine = Line & {
  key: string;
  /** Server id. `null` on a line that has never been saved. */
  sqiId: string | null;
  /** `iuc_id`, sent as `sqiItemUnitId`. */
  itemUnitId: string;
  /** Raw `unit_id` — display only; the payload never carries it. */
  unitId: string;
  /**
   * `sqi_to_base_factor` is not persisted, so a loaded line's factor is
   * back-derived from its stored quantities — which is impossible on a line with
   * no case quantity. `false` marks such a line so the factor can be recovered
   * from the item lookup before a keyed Case Qty is priced against a wrong 1.
   */
  toBaseFactorKnown: boolean;
  unitName: string;
  itemName: string;
  itemCode: string | null;
  aliasName: string | null;
  hsnCode: string | null;
  barcode: string | null;
  batchNo: string | null;
  batchDate: string | null;
  expiryDate: string | null;
  godownId: string | null;
  godownName: string | null;
  stockQty: number | null;
  reorderQty: number | null;
  orderQty: number;
  priceLevel: number;
  schemeId: string | null;
  schemeName: string | null;
  /** The `Sch` flag column — a scheme is applicable to this line. */
  schemeFlag: boolean;
  isPromo: boolean;
  isService: boolean;
  freeType: string | null;
  /**
   * Persisted, and editable in the grid, but NOT part of the pricing chain: a
   * cash discount reaches the bill as a charge row (see the plan's §3.2).
   */
  cashDiscPerc: number;
  cashDiscAmt: number;
  remarks: string | null;
  /** Free text, `sqi_item_size` — no master backs it, the operator types it. */
  itemSize: string | null;
  /** Quantity precision for this line's unit. */
  decimalCount: number;
  batchConfig: number;
  allowNegative: boolean;
  groupId: string | null;
  brandId: string | null;
  sectionId: string | null;
  categoryId: string | null;
  salesmanId: string | null;
  salesmanName: string | null;
  srcDocId: string | null;
};

/** One charge row of the draft: the engine's `ChargeRow` plus its snapshot. */
export type DraftChargeRow = ChargeRow & {
  /** Server id. `null` on a row that has never been saved. */
  cdId: string | null;
  chgName: string;
  ledgerCode: string;
  ledgerName: string | null;
  hsn: string | null;
  taxCode: string | null;
  unit: string | null;
  qtyVal: number | null;
  weight: number | null;
  cessPerc: number;
  sepPost: boolean;
  landingCost: boolean;
  costAlloc: "VALUE" | "QTY" | "WEIGHT" | null;
  remarks: string | null;
  isActive: boolean;
};

/**
 * The customer as the quotation records them. Held on the draft and never
 * re-read from the master: a saved quotation must print the customer it was
 * raised for even after the master has been edited.
 */
export type CustomerSnapshot = {
  custId: string | null;
  /** The document's own copy of the name, which the operator may amend. */
  name: string;
  /**
   * The linked master record's name, as picked or as the document stored it.
   * Display-only, and deliberately not re-derived from `name`: the Existing
   * Customer combobox says which master record this quotation points at, so
   * amending the document's own copy must not rewrite which record it names.
   */
  masterName: string;
  englishName: string | null;
  address: string | null;
  place: string | null;
  phone: string | null;
  email: string | null;
  gstin: string | null;
  gstType: string | null;
  stateCode: string | null;
  stateName: string | null;
  areaId: string | null;
  areaName: string | null;
  distanceKm: number | null;
  allowDiscount: boolean;
  debitAllowed: boolean;
  debitDays: number;
  debitLimit: number;
  overdueBilling: boolean;
  localSales: boolean;
  /** 1-based, as the master stores it and as `/item-price` expects it. */
  priceLevel: number;
  discPerc: number;
  points: number | null;
  billedDate: string | null;
  tcsCompany: boolean;
};

/**
 * The customer details the entry screen lets an operator key by hand — the ones
 * the document stores its own copy of. `custId` and everything derived from the
 * master (price level, credit terms, area) stay read-only.
 */
export type EditableCustomerField = "name" | "address" | "place" | "phone" | "gstin";

export type QuotationHeader = {
  /** The operator's own reference. The quote number itself is server-assigned. */
  usrRefno: string;
  quoteDate: string;
  validUntil: string;
  validityDays: number;
  contactPerson: string;
  contactNo: string;
  areaId: string | null;
  agentId: string | null;
  salesmanId: string | null;
  /**
   * Display only, never sent: `GET /quotations/get` carries no agent or salesman
   * NAME, so a loaded document shows these blank until the field is re-picked.
   */
  agentName: string;
  salesmanName: string;
  posStateCode: string;
  posStateName: string;
  hasFreight: boolean;
  hasLoad: boolean;
  hasUnload: boolean;
  hasPromo: boolean;
  /** 1-based document price level. */
  priceLevel: number;
};

export type QuotationTerms = {
  remarks: string;
  paymentTerms: string;
  deliveryTerms: string;
  termsConditions: string;
};

/**
 * `entry` = editable; `browse` = a loaded document painted read-only.
 *
 * A loaded document additionally starts `stored`: every figure on screen is the
 * one that was saved, so nothing is repriced until the operator's first edit,
 * which flips `pricing` to `live`. In Qt this needed an `m_loading` guard at the
 * top of the recalc; here it is a state field the memo reads.
 */
export type QuotationMode = "entry" | "browse";
export type QuotationPricingSource = "live" | "stored";

export type QuotationDraft = {
  mode: QuotationMode;
  pricing: QuotationPricingSource;
  /** Any mutating action sets this; Clear / load / save reset it. */
  isDirty: boolean;

  // Tenant context — the VOUCHER's, seeded from the session for a new document
  // and overwritten from the record on load. Every lookup and the save read
  // THESE, never the session.
  companyId: string;
  branchId: string;
  accYear: string;
  /**
   * The company's own GST state code, compared against the place of supply to
   * decide local vs inter-state. Read once from the company master (the
   * business-context payload does not carry it) and re-learned from
   * `customer-detail.local_sales` whenever that comes back true.
   */
  companyStateCode: string;

  // Server-owned identity, held so an update hands it back untouched.
  docId: string | null;
  quoteSlno: string;
  quoteRefno: string;
  revisionNo: number;
  docType: string;
  status: string;
  isNewEntry: boolean;
  /**
   * `sq_is_deleted` as loaded. A soft-deleted quotation is still readable — the
   * list shows it and F8 opens it — but it is permanently read-only: Edit,
   * Delete and Save all refuse it, because the server would either resurrect a
   * deleted document or reject the write outright. Copy as new is the only way
   * to carry its contents forward.
   */
  isDeleted: boolean;

  /**
   * The `transaction_hold` row this draft is currently parked as, or was pulled
   * back from — `null` for a draft that has never been held.
   *
   * It is what makes Hold idempotent: holding a resumed cart UPDATES that row
   * back to `HELD` instead of leaving the original behind and creating a second
   * one. Cleared by Clear, by Copy as new and once the hold is converted into a
   * saved quotation. `holdNo` is carried alongside only so the screen can name
   * the hold; the id is the handle.
   */
  holdId: string | null;
  holdNo: string;

  policy: VoucherPolicy;
  customer: CustomerSnapshot;
  header: QuotationHeader;
  terms: QuotationTerms;
  /** No trailing blank row — the grid renders its own "add row" affordance. */
  lines: DraftLine[];
  charges: DraftChargeRow[];
  isLocalSale: boolean;
  /** Cached freight bands for the customer's distance. */
  freightBands: FreightBand[];
  /**
   * Exactly the figures a loaded document was saved with, in the same shape the
   * engine produces, so the screen can paint them verbatim while
   * `pricing === "stored"` without a single value being recomputed.
   */
  storedPricing: DocumentPricing | null;
};

// ---------------------------------------------------------------------------
// Transaction hold — the wire shapes of `/transaction-holds/*`
// ---------------------------------------------------------------------------

/**
 * `POST /transaction-holds/create`. One route for create and update, selected by
 * `thId`'s presence, and the DTO declares every field optional — what a *create*
 * actually requires (`thCompanyId`, `thBranchId`, `thAccYear`, `thHoldNo`,
 * `thDeviceId`, `thDeviceType`) is enforced in the service, not by the decorators,
 * so omitting one is a 400 rather than a type error. `forbidNonWhitelisted` is on:
 * a stray key 400s the whole request.
 *
 * The scope (company / branch / accounting year) is immutable after create, so an
 * update deliberately does not resend it.
 */
export type SaveTransactionHoldDto = {
  thId?: string;
  thCompanyId?: string;
  thBranchId?: string;
  /** SMALLINT — the fiscal year as its starting year (2026 for 2026-2027). */
  thAccYear?: number;
  thHoldNo?: string;
  thHoldDate?: string;
  thDocType?: string;
  thSessionId?: string | null;
  thUserId?: string | null;
  thDeviceId?: string;
  thDeviceType?: string;
  thCustomerName?: string | null;
  thItemCount?: number;
  thTotalQty?: number;
  /** `ck_th_total_amount` — gross, never negative, even on a return hold. */
  thTotalAmount?: number;
  thStatus?: string;
  thHoldReason?: string | null;
  thRemarks?: string | null;
  thResumedBy?: string | null;
  thResumedAt?: string | null;
  thResumeCount?: number;
  thConvertedDocType?: string | null;
  thConvertedDocId?: string | null;
  thConvertedNo?: string | null;
  thConvertedAt?: string | null;
  thConvertedBy?: string | null;
  /** Stored and handed back verbatim; the server never reads into it. */
  thUiState?: Record<string, unknown> | null;
  /** `varchar(50)`, not a uuid — an actor id, name or login. */
  thCreatedBy?: string | null;
  thModifiedBy?: string | null;
};

/** One `transaction_hold` row, as `create` / `get` / `list` return it. */
export type TransactionHoldPayload = {
  thId: string;
  thCompanyId: string;
  thBranchId: string;
  thAccYear: number;
  thHoldNo: string;
  thHoldDate: string;
  thDocType: string;
  thCounterId: string | null;
  thSessionId: string | null;
  thUserId: string | null;
  thDeviceId: string;
  thDeviceType: string;
  thCustomerName: string | null;
  thItemCount: number;
  /** `numeric` columns arrive as strings, exactly as on the quotation payload. */
  thTotalQty: WireDecimal;
  thTotalAmount: WireDecimal;
  thStatus: string;
  thHoldReason: string | null;
  thRemarks: string | null;
  thExpiresAt: string | null;
  thLockedBy: string | null;
  thLockedAt: string | null;
  thResumedBy: string | null;
  thResumedAt: string | null;
  thResumeCount: number;
  thConvertedDocType: string | null;
  thConvertedDocId: string | null;
  thConvertedNo: string | null;
  thConvertedAt: string | null;
  thConvertedBy: string | null;
  thIsStockReserved: boolean;
  thUiState: unknown;
  thIsDeleted: boolean;
  thCreatedBy: string | null;
  thCreatedAt: string;
  thModifiedBy: string | null;
  thModifiedAt: string | null;
};

/**
 * The body every lock transition posts (`/:id/resume`, `/release`,
 * `/force-release`, `/convert`).
 *
 * Both halves are required and both are checked server-side, so a hold can be
 * neither taken nor spent across a company or branch boundary. The device is
 * NOT here — it travels as the `X-Device-Id` header, and `forbidNonWhitelisted`
 * rejects a body that tries to name it (or the status, or `thLockedBy`) anyway.
 */
export type TransactionHoldLockScope = {
  thCompanyId: string;
  thBranchId: string;
};

/**
 * The extra fields `/convert` carries: the document the hold became.
 * `th_converted_doc_id` is polymorphic — no foreign key — so the type travels
 * with the id and neither half is optional.
 */
export type TransactionHoldConversion = {
  thConvertedDocType: string;
  thConvertedDocId: string;
  thConvertedNo?: string | null;
  thConvertedBy?: string | null;
};

/** What `validate` returns: the first violation, and where to send the operator. */
export type Violation = {
  message: string;
  /** A `data-quotation-focus` target, or a line key when `lineKey` is set. */
  field: string;
  lineKey?: string;
};
