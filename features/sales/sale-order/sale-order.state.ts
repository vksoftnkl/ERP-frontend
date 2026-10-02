/**
 * Sale Order Entry — the draft, its factories and its state transitions. Pure.
 *
 * Everything the quotation already states once is imported, not restated: the
 * customer snapshot, the item-price fill, the charge-row snapshot and the
 * price-level clamp are the same rules on both screens. What lives here is what
 * the order adds — the source trail and its customer lock, the tender rows, the
 * advance/fulfilment echoes, and an order-shaped header.
 */
import { defaultPolicy } from "@/domain/pricing";
import type { VoucherPolicy } from "@/domain/pricing";
import {
  clampPriceLevel,
  createDraftLine as createQuotationDraftLine,
  duplicateDraftLine as duplicateQuotationDraftLine,
  emptyCustomer,
  resolveLocalSale,
  seedDocumentPolicy,
} from "@/features/sales/quotation/quotation.state";
import {
  DEFAULT_POS_STATE_CODE,
  DEFAULT_POS_STATE_NAME,
} from "@/features/sales/quotation/quotation.constants";
import type { DraftLine as QuotationDraftLine } from "@/features/sales/quotation/quotation.types";
import { addDays, asEnum, todayIso } from "@/features/sales/quotation/quotation.utils";
import {
  DEFAULT_DELIVERY_MODE,
  DEFAULT_ORDER_PRIORITY,
  DEFAULT_ORDER_TYPE,
  DEFAULT_ORDER_VALIDITY_DAYS,
  DEFAULT_SALE_ORDER_STATUS,
  SALE_ORDER_DOC_TYPE,
  SALE_ORDER_STATUSES,
} from "./sale-order.constants";
import type {
  AdvanceEcho,
  FulfilmentEcho,
  SaleOrderDraft,
  SaleOrderDraftLine,
  SaleOrderHeader,
  SaleOrderPayload,
  SaleOrderTerms,
  SettlementState,
  SourceTrail,
} from "./sale-order.types";

/**
 * What a fresh header starts with — the Qt screen's defaults, which come from
 * the app settings (`sale-order.settings.ts`): the house price level, the
 * delivery mode, how long the order stays open, and the company's own state as
 * the place of supply. Absent, the constants below apply.
 */
export type OrderHeaderDefaults = {
  priceLevel?: number;
  deliveryMode?: string;
  validityDays?: number;
  posStateCode?: string;
  posStateName?: string;
  /** Kept across a Clear unless `sales.clear_delivery_on_clear` says otherwise. */
  salesmanId?: string | null;
  salesmanName?: string;
  packedId?: string | null;
  packedName?: string;
};

export function emptyOrderHeader(
  orderDate: string,
  defaults: OrderHeaderDefaults = {},
): SaleOrderHeader {
  const posStateCode = (defaults.posStateCode ?? "").trim() || DEFAULT_POS_STATE_CODE;
  return {
    usrRefno: "",
    orderDate,
    // The Qt screen seeds the delivery date with the order date: most orders
    // are for today, and the operator moves the ones that are not.
    deliveryDate: orderDate,
    deliverySlot: "",
    validUntil: addDays(orderDate, defaults.validityDays ?? DEFAULT_ORDER_VALIDITY_DAYS),
    priority: DEFAULT_ORDER_PRIORITY,
    orderType: DEFAULT_ORDER_TYPE,
    deliveryMode: defaults.deliveryMode || DEFAULT_DELIVERY_MODE,
    contactPerson: "",
    contactNo: "",
    salesmanId: defaults.salesmanId ?? null,
    salesmanName: defaults.salesmanName ?? "",
    agentId: null,
    agentName: "",
    packedId: defaults.packedId ?? null,
    packedName: defaults.packedName ?? "",
    posStateCode,
    posStateName:
      defaults.posStateName ??
      (posStateCode === DEFAULT_POS_STATE_CODE ? DEFAULT_POS_STATE_NAME : ""),
    hasFreight: false,
    hasLoad: false,
    hasUnload: false,
    hasPromo: false,
    hasLoyalty: false,
    priceLevel: clampPriceLevel(defaults.priceLevel ?? 1),
  };
}

/** Who created and last changed the order — painted from the GET, never sent. */
export type OrderAudit = {
  createdBy: string | null;
  createdOn: string | null;
  modifiedBy: string | null;
  modifiedOn: string | null;
};

export function emptyOrderTerms(): SaleOrderTerms {
  return { remarks: "", paymentTerms: "", deliveryTerms: "", termsConditions: "" };
}

export function emptyAdvance(): AdvanceEcho {
  return {
    policy: null,
    perc: 0,
    required: 0,
    dueDate: null,
    isMandatory: false,
    ledgerId: null,
    recdAmt: 0,
    adjustedAmt: 0,
    refundAmt: 0,
    forfeitAmt: 0,
    balanceAmt: 0,
    status: null,
    recdOn: null,
  };
}

export function emptyFulfilment(): FulfilmentEcho {
  return {
    status: null,
    billedAmt: 0,
    cancelledAmt: 0,
    pendingAmt: 0,
    deliveredItems: 0,
    lastBilledOn: null,
    completedOn: null,
  };
}

export function emptySettlement(): SettlementState {
  return { tenderAmt: 0, surchargeAmt: 0, refundAmt: 0, payStatus: "UNPAID" };
}

export type OrderDraftContext = {
  companyId: string;
  branchId: string;
  accYear: string;
  companyStateCode: string;
  orderDate?: string;
  policy?: Partial<VoucherPolicy>;
  /** The settings-driven header defaults; absent means the constants. */
  defaults?: OrderHeaderDefaults;
};

export function createOrderDraft(context: OrderDraftContext): SaleOrderDraft {
  const orderDate = context.orderDate || todayIso();
  // The place of supply starts as the company's own state, so a fresh order is
  // a local sale until a customer from elsewhere is picked.
  const defaults: OrderHeaderDefaults = {
    posStateCode: context.companyStateCode,
    ...context.defaults,
  };
  const header = emptyOrderHeader(orderDate, defaults);
  return {
    mode: "entry",
    pricing: "live",
    isDirty: false,
    companyId: context.companyId,
    branchId: context.branchId,
    accYear: context.accYear,
    companyStateCode: context.companyStateCode,
    docId: null,
    orderSlno: "",
    orderRefno: "",
    versionNo: 0,
    docType: SALE_ORDER_DOC_TYPE,
    status: DEFAULT_SALE_ORDER_STATUS,
    isNewEntry: true,
    isDeleted: false,
    policy: seedDocumentPolicy(context.policy),
    customer: emptyCustomer(),
    header,
    terms: emptyOrderTerms(),
    lines: [],
    charges: [],
    isLocalSale: resolveLocalSale(header.posStateCode, context.companyStateCode, true),
    freightBands: [],
    storedPricing: null,
    source: null,
    tenders: [],
    settlement: emptySettlement(),
    advance: emptyAdvance(),
    fulfilment: emptyFulfilment(),
    creditOverride: false,
    partyCredit: null,
    audit: null,
  };
}

/**
 * Clear (F7) and the reset after a save keep the salesman and the packer
 * unless `sales.clear_delivery_on_clear` is on — the Qt rule: one counter,
 * one salesman, fifty orders.
 */
export function deliveryDefaultsToKeep(
  header: SaleOrderHeader,
  clearDeliveryOnClear: boolean,
): Pick<OrderHeaderDefaults, "salesmanId" | "salesmanName" | "packedId" | "packedName"> {
  if (clearDeliveryOnClear) {
    return {};
  }
  return {
    salesmanId: header.salesmanId,
    salesmanName: header.salesmanName,
    packedId: header.packedId,
    packedName: header.packedName,
  };
}

/** A blank order line: the quotation's blank line plus the order-only columns. */
export function createOrderDraftLine(
  overrides: Partial<SaleOrderDraftLine> = {},
): SaleOrderDraftLine {
  return {
    ...createQuotationDraftLine(),
    soiId: null,
    srcDocType: null,
    srcDocAccYear: null,
    srcDocRefno: null,
    srcLineNo: null,
    deliveryDate: null,
    ...overrides,
  };
}

/**
 * A copy of an order line, ready to sit under it (Alt+R).
 *
 * As on the other two sales screens: the quotation's copy drops the row key and
 * the ids owned outside the draft, and the order drops the rest of its source
 * trail so a copied row cannot claim the quotation line the original came from.
 */
export function duplicateOrderDraftLine(source: SaleOrderDraftLine): SaleOrderDraftLine {
  return {
    ...source,
    ...duplicateQuotationDraftLine(source),
    soiId: null,
    srcDocType: null,
    srcDocAccYear: null,
    srcDocRefno: null,
    srcLineNo: null,
  };
}

/**
 * The customer lock, DERIVED — never toggled (the plan's §6). The converted
 * order is the same promise to the same party; repointing it would leave
 * `so_src_doc_id` naming a document raised for someone else, and the imported
 * prices were the source customer's.
 */
export function isCustomerLocked(
  source: SourceTrail | null,
  allowCustomerChangeOnImport = false,
): boolean {
  return Boolean(source) && !allowCustomerChangeOnImport;
}

/**
 * One header field. The order's own couplings: moving the order date drags a
 * blank `validUntil` forward, and nothing else is derived — the delivery date
 * is the operator's promise, not arithmetic.
 */
export function applyOrderHeaderField(
  header: SaleOrderHeader,
  field: keyof SaleOrderHeader,
  value: string | number | boolean,
): SaleOrderHeader {
  const next = { ...header, [field]: value } as SaleOrderHeader;
  if (field === "priceLevel") {
    return { ...next, priceLevel: clampPriceLevel(Number(value)) };
  }
  return next;
}

/**
 * "Copy as new" — the plan's §6: the copy clears the server identity AND the
 * whole source trail (header and per line), or one quotation would look
 * converted twice and the copy would open with a locked customer. The money
 * facts go with them: tenders, settlement, advance and fulfilment belong to
 * the original order, not to a fresh promise that has collected nothing.
 */
export function copyOrderDraftAsNew(
  draft: SaleOrderDraft,
  orderDate: string,
  validityDays: number = DEFAULT_ORDER_VALIDITY_DAYS,
): SaleOrderDraft {
  return {
    ...draft,
    mode: "entry",
    pricing: "live",
    isDirty: true,
    docId: null,
    orderSlno: "",
    orderRefno: "",
    versionNo: 0,
    status: DEFAULT_SALE_ORDER_STATUS,
    isNewEntry: true,
    isDeleted: false,
    audit: null,
    header: {
      ...draft.header,
      orderDate,
      validUntil: addDays(orderDate, validityDays),
    },
    source: null,
    lines: draft.lines.map((line) => ({
      ...line,
      soiId: null,
      srcDocType: null,
      srcDocId: null,
      srcDocAccYear: null,
      srcDocRefno: null,
      srcLineNo: null,
      fulfilment: undefined,
    })),
    charges: draft.charges.map((row) => ({ ...row, cdId: null })),
    tenders: [],
    settlement: emptySettlement(),
    advance: emptyAdvance(),
    fulfilment: emptyFulfilment(),
    creditOverride: false,
    storedPricing: null,
  };
}

/**
 * Fold a save response back into the draft — the quotation's rule verbatim:
 * only the server-owned identities are taken (ids, the allocated number), so an
 * in-flight edit survives and no display name is blanked by the join-less save
 * response. Tender rows are matched by row number the same way lines are
 * matched by line number.
 */
export function applyOrderSaveResponse(
  draft: SaleOrderDraft,
  payload: SaleOrderPayload,
  sentDraft?: SaleOrderDraft,
): SaleOrderDraft {
  const savedItems = (payload.items ?? []).filter((item) => item.soiIsDeleted !== true);
  const savedCharges = (payload.charges ?? []).filter((charge) => charge.cdIsDeleted !== true);
  const savedTenders = (payload.tenders ?? []).filter((tender) => tender.tdIsDeleted !== true);

  const itemByLineNo = new Map(savedItems.map((item) => [item.soiLineNo ?? 0, item]));
  const chargeBySlno = new Map(savedCharges.map((charge) => [charge.cdSlno ?? 0, charge]));
  const tenderByRowNo = new Map(savedTenders.map((tender) => [tender.tdRowNo ?? 0, tender]));

  let populated = 0;
  const lines = draft.lines.map((line) => {
    if (!line.itemId) {
      return line;
    }
    populated += 1;
    const saved = itemByLineNo.get(populated) ?? savedItems[populated - 1];
    return saved ? { ...line, soiId: saved.soiId } : line;
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
    docId: payload.soId,
    orderSlno: payload.soOrderSlno ?? draft.orderSlno,
    orderRefno: payload.soOrderRefno ?? draft.orderRefno,
    versionNo: payload.soVersionNo ?? draft.versionNo,
    docType: payload.soDocType || draft.docType,
    status: asEnum(payload.soStatus, SALE_ORDER_STATUSES, DEFAULT_SALE_ORDER_STATUS),
    isNewEntry: false,
    isDeleted: payload.soIsDeleted === true,
    isDirty: sentDraft === undefined ? false : sentDraft !== draft,
    lines,
    charges,
    tenders,
  };
}

/**
 * Stamp the source trail from an imported quotation onto a line the import
 * built. Kept as a helper so the import and the tests agree on which five
 * fields constitute "converted from".
 */
export function stampLineSource(
  line: SaleOrderDraftLine,
  source: SourceTrail,
  srcLineNo: number | null,
): SaleOrderDraftLine {
  return {
    ...line,
    srcDocType: source.docType,
    srcDocId: source.docId,
    srcDocAccYear: source.accYear,
    srcDocRefno: source.refno,
    srcLineNo,
  };
}

/**
 * Rebuild an order draft line from a quotation draft line (the Ctrl+F3 import).
 * The engine-visible fields carry over untouched — the converted order promises
 * the quoted prices — and the quotation's own server id is dropped: this line
 * has never been saved as an ORDER line.
 */
export function orderLineFromQuotationLine(
  quotationLine: QuotationDraftLine,
): SaleOrderDraftLine {
  return {
    ...createOrderDraftLine(),
    ...quotationLine,
    sqiId: null,
    soiId: null,
    orderQty: quotationLine.billQty,
  };
}

// ---------------------------------------------------------------------------
// The quick-strip actions (the Qt screen's Alt+D / ± Price) — pure line edits
// ---------------------------------------------------------------------------

/**
 * "Apply discount % to every item" (Alt+D): every priced, non-free line takes
 * the percent and drops its per-quantity and amount discounts, exactly as
 * keying the percent cell would (the three are alternates).
 */
export function applyDiscountPercToLines<T extends SaleOrderDraftLine>(
  lines: T[],
  discPerc: number,
): T[] {
  const perc = Math.min(100, Math.max(0, discPerc));
  return lines.map((line) =>
    line.itemId && !line.isFree ? { ...line, discPerc: perc, discPerQty: 0, discAmt: 0 } : line,
  );
}

/**
 * "Increase (+) / decrease (−) every rate by %" (the ± Price button): every
 * priced, non-free line's rate is scaled; a free line stays at nothing. The
 * engine re-derives the rate difference against the actual price.
 */
export function scaleLineRates<T extends SaleOrderDraftLine>(lines: T[], percent: number): T[] {
  const factor = 1 + Math.min(100, Math.max(-100, percent)) / 100;
  return lines.map((line) =>
    line.itemId && !line.isFree
      ? { ...line, rate: Math.round(line.rate * factor * 100) / 100 }
      : line,
  );
}

/**
 * The row a second pick of the same item lands on, if any — the Qt duplicate
 * check skips free rows (a scheme's free line is not the same line).
 */
export function findDuplicateLine<T extends SaleOrderDraftLine>(
  lines: T[],
  itemId: string,
  exceptKey: string,
): { line: T; rowNo: number } | null {
  const index = lines.findIndex(
    (line) => line.key !== exceptKey && line.itemId === itemId && !line.isFree,
  );
  return index < 0 ? null : { line: lines[index], rowNo: index + 1 };
}

/** A legacy row with no stored policy prices under the engine default. */
export function policyFromPayload(payload: SaleOrderPayload): VoucherPolicy {
  return defaultPolicy({
    freightCalcType: (payload.soFreightCalcType ?? "").trim() || "manual",
    loadingCalcType: (payload.soLoadingCalcType ?? "").trim() || "manual",
    discountAlterBaseRate: payload.soDiscAlterBase === true,
  });
}
